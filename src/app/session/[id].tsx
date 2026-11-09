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
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Composer } from '@/components/Composer'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { MessageBubble } from '@/components/MessageBubble'
import { PermissionCard } from '@/components/PermissionCard'
import { Button, IconButton } from '@/components/ui'
import { useConnection } from '@/lib/connection'
import { basename, errorText } from '@/lib/format'
import { colors, radius, spacing } from '@/lib/theme'
import { applyEventToMessages } from '@/lib/timeline'
import type {
  Message,
  PermissionDecision,
  PermissionRequest,
  SessionInfo,
} from '@/lib/types'

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

  const seenRef = useRef<Set<string>>(new Set())
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastResync = useRef(resyncToken)
  const listRef = useRef<FlatList<Message> | null>(null)

  const refreshMessages = useCallback(async () => {
    if (!api || !id) return
    const list = await api.listMessages(id)
    seenRef.current = new Set()
    setMessages(list)
  }, [api, id])

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
    seenRef.current = new Set()
    setSession(nextSession)
    setMessages(nextMessages)
    setPermissions(nextPermissions)
    setBusy(isSessionBusy(nextSession))
  }, [api, id])

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

        default:
          break
      }

      setMessages((prev) => applyEventToMessages(prev, event, seenRef.current))
    })
  }, [api, id, subscribe, refreshMessages, refreshSession, refreshPermissions])

  const reversed = useMemo(() => [...messages].reverse(), [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || !api || !id || sending) return

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      type: 'user',
      text,
      time: { created: Date.now() },
    }

    setSending(true)
    setError(null)
    setInput('')
    setMessages((prev) => [...prev, optimistic])

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
      setPermissions((prev) => prev.filter((item) => item.id !== request.id))
    } catch (cause) {
      Alert.alert('Could not send the decision', errorText(cause))
    } finally {
      setReplyingID(null)
    }
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
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
            onScrollToIndexFailed={() => undefined}
          />
        )}

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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
    fontFamily: 'monospace',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.redSoft,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248, 113, 113, 0.28)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorText: {
    color: colors.red,
    fontSize: 12.5,
    lineHeight: 18,
    flex: 1,
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
    borderWidth: 1,
    borderColor: colors.border,
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
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  emptyButton: {
    marginTop: spacing.md,
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
