import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Composer } from '@/components/Composer'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { MessageBubble } from '@/components/MessageBubble'
import { PermissionCard } from '@/components/PermissionCard'
import { AppText as Text, Button, IconButton } from '@/components/ui'
import { useConnection } from '@/lib/connection'
import { basename, errorText } from '@/lib/format'
import { successFeedback, tapFeedback, warningFeedback } from '@/lib/haptics'
import { colors, font, radius, spacing } from '@/lib/theme'
import { applyEventToMessages } from '@/lib/timeline'
import type {
  Message,
  PermissionDecision,
  PermissionRequest,
  SessionInfo,
  V2Event,
} from '@/lib/types'

type QuickPrompt = {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  text: string
}

const quickPrompts: QuickPrompt[] = [
  {
    icon: 'sparkles-outline',
    label: 'Summarize project',
    text: 'Summarize this project and explain how it is structured.',
  },
  {
    icon: 'git-compare-outline',
    label: 'What changed?',
    text: 'What changed in this repository recently? Summarize the latest work.',
  },
  {
    icon: 'bug-outline',
    label: 'Find an issue',
    text: 'Look for the most important issue in this project and propose a fix.',
  },
]

const JUMP_BUTTON_OFFSET = 220

function isSessionBusy(session: SessionInfo | null): boolean {
  if (!session) return false
  const busy = session.time.busy
  if (!busy) return false
  return !session.time.idle || busy > session.time.idle
}

function toPermissionRequest(data: unknown): PermissionRequest | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.sessionID !== 'string') return null
  if (typeof record.action !== 'string' || !Array.isArray(record.resources)) return null

  return {
    id: record.id,
    sessionID: record.sessionID,
    action: record.action,
    resources: record.resources.filter((item): item is string => typeof item === 'string'),
    save: Array.isArray(record.save)
      ? record.save.filter((item): item is string => typeof item === 'string')
      : undefined,
    metadata:
      record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, unknown>)
        : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  }
}

export default function SessionScreen() {
  const params = useLocalSearchParams<{ id?: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const {
    api,
    connection,
    loading: connectionLoading,
    eventStatus,
    subscribe,
    resyncToken,
  } = useConnection()

  const [session, setSession] = useState<SessionInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [permissions, setPermissions] = useState<PermissionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [interrupting, setInterrupting] = useState(false)
  const [replyingID, setReplyingID] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [streamingID, setStreamingID] = useState<string | null>(null)
  const [showJump, setShowJump] = useState(false)

  const seenRef = useRef<Set<string>>(new Set())
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingEvents = useRef<V2Event[]>([])
  const lastResync = useRef(resyncToken)
  const listRef = useRef<FlatList<Message> | null>(null)
  const showJumpRef = useRef(false)

  const discardPendingEvents = useCallback(() => {
    pendingEvents.current = []
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
  }, [])

  const flushPendingEvents = useCallback(() => {
    flushTimer.current = null
    const batch = pendingEvents.current
    pendingEvents.current = []
    if (!batch.length) return

    setMessages((prev) => {
      let next = prev
      for (const event of batch) {
        next = applyEventToMessages(next, event, seenRef.current)
      }
      return next
    })
  }, [])

  const queueEvent = useCallback(
    (event: V2Event) => {
      pendingEvents.current.push(event)
      if (flushTimer.current) return
      // Coalesce bursts of streaming deltas into one render (~30 fps).
      flushTimer.current = setTimeout(flushPendingEvents, 33)
    },
    [flushPendingEvents],
  )

  const refreshMessages = useCallback(async () => {
    if (!api || !id) return
    const list = await api.listMessages(id)
    discardPendingEvents()
    seenRef.current = new Set()
    setMessages(list)
  }, [api, id, discardPendingEvents])

  const refreshSession = useCallback(async () => {
    if (!api || !id) return
    const next = await api.getSession(id)
    setSession(next)
    setBusy(isSessionBusy(next))
  }, [api, id])

  const refreshPermissions = useCallback(async () => {
    if (!api || !id) return
    const list = await api.listPermissions(id)
    setPermissions(list)
  }, [api, id])

  const refreshAll = useCallback(async () => {
    if (!api || !id) return
    const [nextSession, nextMessages, nextPermissions] = await Promise.all([
      api.getSession(id),
      api.listMessages(id),
      api.listPermissions(id),
    ])
    discardPendingEvents()
    seenRef.current = new Set()
    setSession(nextSession)
    setMessages(nextMessages)
    setPermissions(nextPermissions)
    setBusy(isSessionBusy(nextSession))
    setError(null)
  }, [api, id, discardPendingEvents])

  useEffect(() => {
    if (!api || !id) return

    let cancelled = false

    // Defer the fetch so the first render paints the loading state first.
    const timer = setTimeout(() => {
      void refreshAll()
        .catch((cause) => {
          if (!cancelled) setError(errorText(cause))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [api, id, refreshAll])

  useEffect(() => {
    if (lastResync.current === resyncToken) return
    lastResync.current = resyncToken

    const timer = setTimeout(() => {
      void refreshAll().catch((cause) => setError(errorText(cause)))
    }, 0)

    return () => clearTimeout(timer)
  }, [resyncToken, refreshAll])

  useEffect(() => {
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      if (flushTimer.current) clearTimeout(flushTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!api || !id) return

    return subscribe((event) => {
      const data = event.data as Record<string, unknown> | null
      const eventSessionID =
        data && typeof data.sessionID === 'string' ? data.sessionID : ''

      if (eventSessionID && eventSessionID !== id) return

      switch (event.type) {
        case 'permission.asked': {
          const request = toPermissionRequest(event.data)
          if (!request || request.sessionID !== id) return
          setPermissions((prev) =>
            prev.some((item) => item.id === request.id) ? prev : [...prev, request],
          )
          return
        }

        case 'permission.replied': {
          const requestID = typeof data?.requestID === 'string' ? data.requestID : ''
          if (!requestID) return
          setPermissions((prev) => prev.filter((item) => item.id !== requestID))
          return
        }

        case 'session.execution.started':
          setBusy(true)
          return

        case 'session.execution.succeeded':
        case 'session.execution.failed':
        case 'session.execution.interrupted':
          setBusy(false)
          setStreamingID(null)
          return

        case 'session.idle':
          setBusy(false)
          setStreamingID(null)
          if (scrollTimer.current) clearTimeout(scrollTimer.current)
          scrollTimer.current = setTimeout(() => {
            void refreshMessages().catch(() => undefined)
            void refreshSession().catch(() => undefined)
            void refreshPermissions().catch(() => undefined)
          }, 350)
          return

        case 'session.renamed':
          if (typeof data?.title === 'string') {
            const title = data.title
            setSession((prev) => (prev ? { ...prev, title } : prev))
          }
          return

        case 'session.deleted':
          router.back()
          return

        case 'session.text.started':
        case 'session.reasoning.started':
          if (typeof data?.assistantMessageID === 'string') {
            setStreamingID(data.assistantMessageID)
          }
          setBusy(true)
          return

        case 'session.text.delta':
        case 'session.reasoning.delta':
          if (typeof data?.assistantMessageID === 'string') {
            setStreamingID(data.assistantMessageID)
          }
          break

        default:
          break
      }

      queueEvent(event)
    })
  }, [api, id, subscribe, refreshMessages, refreshSession, refreshPermissions, queueEvent])

  const reversed = useMemo(() => [...messages].reverse(), [messages])

  const scrollToLatest = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated })
    if (showJumpRef.current) {
      showJumpRef.current = false
      setShowJump(false)
    }
  }, [])

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const shouldShow = event.nativeEvent.contentOffset.y > JUMP_BUTTON_OFFSET
      if (shouldShow === showJumpRef.current) return
      showJumpRef.current = shouldShow
      setShowJump(shouldShow)
    },
    [],
  )

  const send = async () => {
    const text = input.trim()
    if (!text || !api || !id || sending) return

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      type: 'user',
      text,
      time: { created: Date.now() },
    }

    tapFeedback()
    setSending(true)
    setError(null)
    setInput('')
    setMessages((prev) => [...prev, optimistic])
    scrollToLatest()

    try {
      await api.sendPrompt(id, text)
      setBusy(true)
      setStreamingID(null)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        void refreshMessages().catch(() => undefined)
      }, 800)
    } catch (cause) {
      setMessages((prev) => prev.filter((message) => message.id !== optimistic.id))
      setInput(text)
      setError(errorText(cause))
    } finally {
      setSending(false)
    }
  }

  const stop = async () => {
    if (!api || !id || interrupting) return
    warningFeedback()
    setInterrupting(true)
    try {
      await api.interrupt(id)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setInterrupting(false)
    }
  }

  const reply = async (request: PermissionRequest, decision: PermissionDecision) => {
    if (!api || replyingID) return
    setReplyingID(request.id)
    try {
      await api.replyPermission(request.sessionID, request.id, decision)
      if (decision === 'reject') warningFeedback()
      else successFeedback()
      setPermissions((prev) => prev.filter((item) => item.id !== request.id))
    } catch (cause) {
      Alert.alert('Could not send the decision', errorText(cause))
    } finally {
      setReplyingID(null)
    }
  }

  const applyQuickPrompt = (prompt: QuickPrompt) => {
    tapFeedback()
    setInput(prompt.text)
  }

  const title = session?.title?.trim() || 'Untitled session'
  const directory = session?.location?.directory ?? ''

  if (!connectionLoading && !connection) {
    return <Redirect href="/connect" />
  }

  const header = (
    <View style={styles.header}>
      <IconButton
        icon="chevron-back"
        accessibilityLabel="Go back to sessions"
        onPress={() => router.back()}
        color={colors.text}
      />
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {directory ? basename(directory) || directory : 'OpenCode session'}
        </Text>
      </View>
      <ConnectionStatus status={eventStatus} />
      <IconButton
        icon="refresh"
        accessibilityLabel="Reload session"
        onPress={() => {
          setError(null)
          void refreshAll().catch((cause) => setError(errorText(cause)))
        }}
        color={colors.textMuted}
      />
    </View>
  )

  const permissionList: React.ReactElement | undefined =
    permissions.length > 0 ? (
      <View style={styles.permissionList}>
        {permissions.map((request) => (
          <PermissionCard
            key={request.id}
            request={request}
            submitting={replyingID === request.id}
            onReply={(decision) => void reply(request, decision)}
          />
        ))}
      </View>
    ) : undefined

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {header}

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={17} color={colors.red} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
            onPress={() => setError(null)}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={colors.red} />
          </Pressable>
        </View>
      ) : null}

      {eventStatus === 'retrying' || eventStatus === 'idle' ? (
        <View style={styles.reconnectBanner}>
          <ActivityIndicator size="small" color={colors.amber} />
          <Text style={styles.reconnectText}>
            {eventStatus === 'idle'
              ? 'Offline — waiting to reconnect…'
              : 'Connection lost — reconnecting…'}
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
          {loading && messages.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.center}>
              {permissionList}
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptyText}>
                Send a prompt and the agent will work in {basename(directory) || 'this session'}.
              </Text>
              {directory ? (
                <Text style={styles.emptyPath} numberOfLines={2}>
                  {directory}
                </Text>
              ) : null}
              <View style={styles.quickPrompts}>
                {quickPrompts.map((prompt) => (
                  <Pressable
                    key={prompt.label}
                    accessibilityRole="button"
                    accessibilityLabel={prompt.label}
                    onPress={() => applyQuickPrompt(prompt)}
                    style={({ pressed }) => [styles.quickPrompt, pressed && styles.pressed]}
                  >
                    <Ionicons name={prompt.icon} size={14} color={colors.textMuted} />
                    <Text style={styles.quickPromptText}>{prompt.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Button
                label="Refresh"
                variant="secondary"
                compact
                icon="refresh"
                onPress={() => {
                  setError(null)
                  void refreshAll().catch((cause) => setError(errorText(cause)))
                }}
                style={styles.emptyButton}
              />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={reversed}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <MessageBubble message={item} streaming={streamingID === item.id} />
              )}
              ListHeaderComponent={permissionList}
              contentContainerStyle={styles.listContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              onScroll={handleListScroll}
              scrollEventThrottle={16}
              onScrollToIndexFailed={() => undefined}
              style={styles.flex}
            />
          )}

          {showJump ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to latest message"
              onPress={() => scrollToLatest()}
              style={({ pressed }) => [styles.jumpButton, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-down" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        <Composer
          value={input}
          onChangeText={setInput}
          onSend={() => void send()}
          onStop={() => void stop()}
          busy={busy}
          sending={sending || interrupting}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgElevated,
  },
  headerText: {
    flex: 1,
    gap: 1,
    paddingRight: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: font.mono,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.redSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorText: {
    color: colors.red,
    fontSize: 12.5,
    lineHeight: 18,
    flex: 1,
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  reconnectText: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyPath: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: font.mono,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  emptyButton: {
    marginTop: spacing.md,
  },
  quickPrompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickPromptText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  jumpButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.md,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  pressed: {
    opacity: 0.75,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  permissionList: {
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
})
