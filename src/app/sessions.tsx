import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ConnectionStatus } from '@/components/ConnectionStatus'
import { NewSessionModal } from '@/components/NewSessionModal'
import { AppText as Text, Badge, Button, Card, IconButton } from '@/components/ui'
import { useConnection } from '@/lib/connection'
import { basename, errorText, pluralize, relativeTime, truncate } from '@/lib/format'
import { colors, font, radius, spacing } from '@/lib/theme'
import type { PermissionRequest, SessionInfo } from '@/lib/types'

function isBusy(session: SessionInfo): boolean {
  const busy = session.time.busy
  if (!busy) return false
  return !session.time.idle || busy > session.time.idle
}

function countBySession(requests: PermissionRequest[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const request of requests) {
    counts[request.sessionID] = (counts[request.sessionID] ?? 0) + 1
  }
  return counts
}

export default function SessionsScreen() {
  const {
    api,
    connection,
    loading: connectionLoading,
    eventStatus,
    subscribe,
    resyncToken,
    disconnect,
  } = useConnection()

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [pending, setPending] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const lastResync = useRef(resyncToken)

  const load = useCallback(
    async (refresh = false) => {
      if (!api) return

      if (refresh) setRefreshing(true)
      else setLoading(true)

      try {
        const [list, requests] = await Promise.all([api.listSessions(), api.listAllPermissions()])
        setSessions(list)
        setPending(countBySession(requests))
        setError(null)
      } catch (cause) {
        setError(errorText(cause))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [api],
  )

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  useEffect(() => {
    if (lastResync.current === resyncToken) return
    lastResync.current = resyncToken
    void load()
  }, [resyncToken, load])

  useEffect(() => {
    if (!api) return

    return subscribe((event) => {
      const data = event.data as Record<string, unknown>
      const sessionID = typeof data?.sessionID === 'string' ? data.sessionID : ''

      switch (event.type) {
        case 'session.created':
          void load()
          break

        case 'session.deleted':
          if (sessionID) {
            setSessions((prev) => prev.filter((session) => session.id !== sessionID))
            setPending((prev) => {
              if (!(sessionID in prev)) return prev
              const next = { ...prev }
              delete next[sessionID]
              return next
            })
          }
          break

        case 'session.renamed':
          if (sessionID) {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === sessionID
                  ? { ...session, title: (data.title as string) ?? session.title }
                  : session,
              ),
            )
          }
          break

        case 'permission.asked':
          if (sessionID) {
            setPending((prev) => ({ ...prev, [sessionID]: (prev[sessionID] ?? 0) + 1 }))
          }
          break

        case 'permission.replied':
          if (sessionID) {
            setPending((prev) => {
              const count = (prev[sessionID] ?? 0) - 1
              const next = { ...prev }
              if (count > 0) next[sessionID] = count
              else delete next[sessionID]
              return next
            })
          }
          break

        case 'session.execution.started':
          if (sessionID) {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === sessionID
                  ? { ...session, time: { ...session.time, busy: Date.now() } }
                  : session,
              ),
            )
          }
          break

        case 'session.idle':
        case 'session.execution.succeeded':
        case 'session.execution.failed':
        case 'session.execution.interrupted':
          if (sessionID) {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === sessionID
                  ? { ...session, time: { ...session.time, idle: Date.now() } }
                  : session,
              ),
            )
          }
          break
      }
    })
  }, [api, subscribe, load])

  const pendingTotal = useMemo(
    () => Object.values(pending).reduce((total, count) => total + count, 0),
    [pending],
  )

  const firstPendingSession = useMemo(
    () => sessions.find((session) => (pending[session.id] ?? 0) > 0),
    [sessions, pending],
  )

  if (!connectionLoading && !connection) {
    return <Redirect href="/connect" />
  }

  const openSession = (session: SessionInfo) => {
    router.push({ pathname: '/session/[id]', params: { id: session.id } })
  }

  const confirmDelete = (session: SessionInfo) => {
    Alert.alert(
      'Delete session?',
      session.title || 'This session will be permanently removed from the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!api) return
              try {
                await api.deleteSession(session.id)
                setSessions((prev) => prev.filter((item) => item.id !== session.id))
              } catch (cause) {
                Alert.alert('Could not delete session', errorText(cause))
              }
            })()
          },
        },
      ],
    )
  }

  const showActions = (session: SessionInfo) => {
    Alert.alert(session.title || 'Session', session.location?.directory ?? '', [
      { text: 'Open', onPress: () => openSession(session) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(session) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const confirmDisconnect = () => {
    Alert.alert(
      'Disconnect from Server',
      `Are you sure you want to disconnect from ${connection?.label ?? 'the server'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void disconnect()
          },
        },
      ],
    )
  }

  const handleCreate = async (title: string, directory: string | null) => {
    if (!api) throw new Error('Not connected to an OpenCode server.')
    const session = await api.createSession({
      ...(title ? { title } : {}),
      ...(directory ? { directory } : {}),
    })
    setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)])
    router.push({ pathname: '/session/[id]', params: { id: session.id } })
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.heading}>Sessions</Text>
          <Text style={styles.host} numberOfLines={1}>
            {connection?.label ?? 'Not connected'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton
            icon="log-out-outline"
            accessibilityLabel="Disconnect from server"
            onPress={confirmDisconnect}
            color={colors.textMuted}
            filled
          />
          <IconButton
            icon="add"
            accessibilityLabel="New session"
            onPress={() => setModalOpen(true)}
            color={colors.bg}
            filled
            style={styles.addButton}
          />
        </View>
      </View>

      <View style={styles.statusRow}>
        <ConnectionStatus status={eventStatus} />
        <Text style={styles.statusText}>
          {sessions.length} {pluralize(sessions.length, 'session')}
        </Text>
        {pendingTotal > 0 ? (
          <Text style={styles.statusPending}>
            {pendingTotal} {pluralize(pendingTotal, 'approval')} waiting
          </Text>
        ) : null}
      </View>

      {pendingTotal > 0 && firstPendingSession ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open session with pending approval"
          onPress={() => openSession(firstPendingSession)}
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
        >
          <View style={styles.bannerIcon}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.amber} />
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>
              {pendingTotal} {pluralize(pendingTotal, 'permission request')} waiting
            </Text>
            <Text style={styles.bannerSub} numberOfLines={1}>
              {firstPendingSession.title || 'Open the session to approve or reject.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.amber} />
        </Pressable>
      ) : null}

      {error ? (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
          <Button
            label="Retry"
            variant="secondary"
            compact
            onPress={() => void load()}
            style={styles.retryButton}
          />
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            sessions.length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surface}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={28} color={colors.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyText}>
                Start a new session to send your first prompt to the agent.
              </Text>
              <Button
                label="New session"
                icon="add"
                onPress={() => setModalOpen(true)}
                style={styles.emptyButton}
              />
            </View>
          }
          renderItem={({ item }) => {
            const busy = isBusy(item)
            const pendingCount = pending[item.id] ?? 0
            const directory = item.location?.directory ?? ''

            return (
              <View style={styles.row}>
                {/* The open target is its own Pressable so the actions button is
                    not nested inside another button (invalid HTML on web). */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.title || 'Untitled session'}
                  onPress={() => openSession(item)}
                  onLongPress={() => showActions(item)}
                  style={({ pressed }) => [styles.rowButton, pressed && styles.rowPressed]}
                >
                  <View style={[styles.sessionIcon, busy && styles.sessionIconBusy]}>
                    <Ionicons
                      name={busy ? 'sync-outline' : 'chatbubble-ellipses-outline'}
                      size={18}
                      color={busy ? colors.amber : colors.accent}
                    />
                  </View>

                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.title?.trim() || 'Untitled session'}
                    </Text>
                    <View style={styles.rowMeta}>
                      <Text style={styles.rowDir} numberOfLines={1}>
                        {truncate(basename(directory) || directory || 'unknown project', 28)}
                      </Text>
                      <Text style={styles.dot}>·</Text>
                      <Text style={styles.rowTime}>{relativeTime(item.time?.updated)}</Text>
                    </View>
                  </View>
                </Pressable>

                {pendingCount > 0 ? <Badge label={pendingCount} tone="amber" /> : null}
                {busy ? <ActivityIndicator size="small" color={colors.amber} /> : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Session actions"
                  onPress={() => showActions(item)}
                  hitSlop={8}
                  style={styles.moreButton}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
                </Pressable>
              </View>
            )
          }}
        />
      )}

      <NewSessionModal
        key={modalOpen ? 'open' : 'closed'}
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  host: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: font.mono,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addButton: {
    backgroundColor: colors.accent,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  statusText: {
    color: colors.textFaint,
    fontSize: 12,
  },
  statusPending: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    flex: 1,
    gap: 1,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  bannerSub: {
    color: colors.textMuted,
    fontSize: 12,
  },
  errorCard: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    gap: spacing.md,
    backgroundColor: colors.redSoft,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  retryButton: {
    alignSelf: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  sessionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionIconBusy: {
    backgroundColor: colors.amberSoft,
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowDir: {
    color: colors.textFaint,
    fontSize: 11.5,
    fontFamily: font.mono,
    maxWidth: '62%',
  },
  dot: {
    color: colors.textFaint,
    fontSize: 12,
  },
  rowTime: {
    color: colors.textFaint,
    fontSize: 11.5,
  },
  moreButton: {
    width: 28,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
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
    maxWidth: 280,
  },
  emptyButton: {
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
})
