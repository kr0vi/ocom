import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { ConnectionStatus } from '@/components/ConnectionStatus'
import { NewSessionModal } from '@/components/NewSessionModal'
import {
  AppText as Text,
  AppTextInput as TextInput,
  Badge,
  IconButton,
} from '@/components/ui'
import { useConnection } from '@/lib/connection'
import { basename, compactPath, errorText, pluralize, relativeTime, truncate } from '@/lib/format'
import { successFeedback, warningFeedback } from '@/lib/haptics'
import { colors, font, radius, spacing } from '@/lib/theme'
import type { PermissionRequest, Project, SessionInfo } from '@/lib/types'

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
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const sidebarWidth = Math.min(320, windowWidth * 0.82)

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
  const [sidebarVisible, setSidebarVisible] = useState(false)

  // Project selection state
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)

  // Bottom chat prompt input
  const [promptInput, setPromptInput] = useState('')
  const [sending, setSending] = useState(false)

  const lastResync = useRef(resyncToken)
  const loadedOnce = useRef(false)
  const [slideAnim] = useState(() => new Animated.Value(-sidebarWidth))
  const [fadeAnim] = useState(() => new Animated.Value(0))

  const load = useCallback(
    async (refresh = false) => {
      if (!api) return

      // Only show the full-screen spinner before the first successful load.
      if (refresh) setRefreshing(true)
      else if (!loadedOnce.current) setLoading(true)

      try {
        const [list, requests, projectList] = await Promise.all([
          api.listSessions(),
          api.listAllPermissions(),
          api.listProjects().catch(() => [] as Project[]),
        ])
        setSessions(list)
        setPending(countBySession(requests))
        setProjects(projectList)
        setSelectedProject((prev) => {
          if (prev) {
            const matched = projectList.find((p) => p.canonical === prev.canonical)
            return matched ?? prev
          }
          return projectList.length > 0 ? projectList[0] : null
        })
        setError(null)
        loadedOnce.current = true
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

  const openSidebar = () => {
    setSidebarVisible(true)
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const closeSidebar = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -sidebarWidth,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSidebarVisible(false)
      callback?.()
    })
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
                warningFeedback()
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
      { text: 'Open', onPress: () => closeSidebar(() => openSession(session)) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(session) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const handleLogout = () => {
    const doLogout = async () => {
      closeSidebar()
      await disconnect()
      router.replace('/connect')
    }

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to log out?')) {
        void doLogout()
      } else if (typeof window === 'undefined') {
        void doLogout()
      }
      return
    }

    Alert.alert(
      'Log Out',
      `Are you sure you want to log out from ${connection?.label ?? 'the server'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            void doLogout()
          },
        },
      ],
    )
  }

  const handleCreate = async (title: string, directory: string | null) => {
    if (!api) throw new Error('Not connected to an OpenCode server.')
    const targetDir = directory ?? selectedProject?.canonical ?? null
    const session = await api.createSession({
      ...(title ? { title } : {}),
      ...(targetDir ? { directory: targetDir } : {}),
    })
    successFeedback()
    setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)])
    closeSidebar(() => {
      router.push({ pathname: '/session/[id]', params: { id: session.id } })
    })
  }

  const handleSendPrompt = async () => {
    const text = promptInput.trim()
    if (!text || !api || sending) return

    setSending(true)
    try {
      const title = text.slice(0, 36)
      const session = await api.createSession({
        title,
        ...(selectedProject?.canonical ? { directory: selectedProject.canonical } : {}),
      })
      await api.sendPrompt(session.id, text)
      successFeedback()
      setPromptInput('')
      router.push({ pathname: '/session/[id]', params: { id: session.id } })
    } catch (cause) {
      Alert.alert('Could not start session', errorText(cause))
    } finally {
      setSending(false)
    }
  }

  if (!connectionLoading && !connection) {
    return <Redirect href="/connect" />
  }

  const canSend = promptInput.trim().length > 0 && !sending
  const selectedProjectLabel = selectedProject
    ? selectedProject.name || basename(selectedProject.canonical) || selectedProject.canonical
    : 'Server default project'

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Top Header with Hamburger Icon */}
      <View style={styles.topHeader}>
        <IconButton
          icon="menu-outline"
          accessibilityLabel="Open sessions menu"
          onPress={openSidebar}
          color={colors.text}
          size={24}
        />
        <View style={styles.headerSpacer} />
        <ConnectionStatus status={eventStatus} />
        <IconButton
          icon="log-out-outline"
          accessibilityLabel="Log out"
          onPress={handleLogout}
          color={colors.textMuted}
          size={20}
        />
      </View>

      {/* Main Blank Canvas with "open code" */}
      <View style={styles.heroCenter}>
        <Text style={styles.heroText}>open code</Text>
      </View>

      {/* Bottom Chat Prompt Input Box */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <View style={styles.composerWrapper}>
          {/* Current Project Selector Pill */}
          <View style={styles.projectSelectorRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Current project: ${selectedProjectLabel}`}
              onPress={() => setProjectPickerOpen(true)}
              style={({ pressed }) => [styles.projectPickerPill, pressed && styles.pressed]}
            >
              <Ionicons
                name="folder-outline"
                size={13}
                color={selectedProject ? colors.accent : colors.textMuted}
              />
              <Text style={styles.projectPickerLabel} numberOfLines={1}>
                {selectedProjectLabel}
              </Text>
              <Ionicons name="chevron-down" size={11} color={colors.textFaint} />
            </Pressable>
          </View>

          <View style={styles.composerRow}>
            <TextInput
              value={promptInput}
              onChangeText={setPromptInput}
              placeholder="Message open code…"
              placeholderTextColor={colors.textFaint}
              style={styles.composerInput}
              editable={!sending}
              returnKeyType="send"
              textAlignVertical="center"
              onSubmitEditing={() => {
                void handleSendPrompt()
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!canSend}
              onPress={() => void handleSendPrompt()}
              style={({ pressed }) => [
                styles.sendButton,
                canSend ? styles.sendButtonActive : styles.sendButtonIdle,
                pressed && canSend && styles.pressed,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={canSend ? colors.bg : colors.textFaint}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Project Picker Bottom Sheet Modal */}
      <Modal
        visible={projectPickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setProjectPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setProjectPickerOpen(false)}
            accessibilityLabel="Close project picker"
          />
          <View
            style={[
              styles.projectSheet,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Project</Text>
              <IconButton
                icon="close"
                accessibilityLabel="Close project picker"
                onPress={() => setProjectPickerOpen(false)}
                color={colors.textMuted}
                size={18}
              />
            </View>

            <ScrollView
              style={styles.projectList}
              contentContainerStyle={styles.projectListContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Server Default project"
                onPress={() => {
                  setSelectedProject(null)
                  setProjectPickerOpen(false)
                }}
                style={({ pressed }) => [
                  styles.projectOption,
                  selectedProject === null && styles.projectOptionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="terminal-outline"
                  size={18}
                  color={selectedProject === null ? colors.accent : colors.textMuted}
                />
                <View style={styles.projectOptionInfo}>
                  <Text style={styles.projectOptionName}>Server Default</Text>
                  <Text style={styles.projectOptionPath}>Let OpenCode choose working directory</Text>
                </View>
                {selectedProject === null ? (
                  <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                ) : null}
              </Pressable>

              {projects.map((proj) => {
                const isSelected = selectedProject?.canonical === proj.canonical
                const name = proj.name || basename(proj.canonical) || proj.canonical
                return (
                  <Pressable
                    key={proj.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select project ${name}`}
                    onPress={() => {
                      setSelectedProject(proj)
                      setProjectPickerOpen(false)
                    }}
                    style={({ pressed }) => [
                      styles.projectOption,
                      isSelected && styles.projectOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="folder-outline"
                      size={18}
                      color={isSelected ? colors.accent : colors.textMuted}
                    />
                    <View style={styles.projectOptionInfo}>
                      <Text style={styles.projectOptionName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.projectOptionPath} numberOfLines={1}>
                        {compactPath(proj.canonical, 46)}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    ) : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sidebar Navigation Drawer */}
      <Modal
        visible={sidebarVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeSidebar()}
      >
        <View style={styles.drawerOverlay}>
          {/* Dimmed Backdrop */}
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => closeSidebar()}
              accessibilityLabel="Close sidebar"
            />
          </Animated.View>

          {/* Slide-out Sidebar Panel */}
          <Animated.View
            style={[
              styles.drawerContent,
              {
                width: sidebarWidth,
                paddingTop: Math.max(insets.top, spacing.md),
                paddingBottom: Math.max(insets.bottom, spacing.md),
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            {/* Drawer Top Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerTitleRow}>
                <Text style={styles.drawerTitle}>Sessions</Text>
                <Text style={styles.drawerCount}>{sessions.length}</Text>
              </View>
              <View style={styles.drawerHeaderActions}>
                <IconButton
                  icon="add"
                  accessibilityLabel="New session"
                  onPress={() => {
                    closeSidebar(() => setModalOpen(true))
                  }}
                  color={colors.text}
                  filled
                  size={19}
                />
                <IconButton
                  icon="close"
                  accessibilityLabel="Close sidebar"
                  onPress={() => closeSidebar()}
                  color={colors.textMuted}
                  size={20}
                />
              </View>
            </View>

            {/* Pending Approval Banner if any */}
            {pendingTotal > 0 && firstPendingSession ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open session with pending approval"
                onPress={() => closeSidebar(() => openSession(firstPendingSession))}
                style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
              >
                <View style={styles.bannerIcon}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.amber} />
                </View>
                <View style={styles.bannerText}>
                  <Text style={styles.bannerTitle}>
                    {pendingTotal} {pluralize(pendingTotal, 'approval')} waiting
                  </Text>
                  <Text style={styles.bannerSub} numberOfLines={1}>
                    {firstPendingSession.title || 'Tap to review'}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {/* Error Message if any */}
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Session Items List */}
            {loading ? (
              <View style={styles.drawerCenter}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : (
              <FlatList
                data={sessions}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.drawerListContent}
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
                  <View style={styles.emptyDrawer}>
                    <Ionicons name="chatbubbles-outline" size={24} color={colors.textFaint} />
                    <Text style={styles.emptyDrawerTitle}>No sessions yet</Text>
                    <Text style={styles.emptyDrawerText}>
                      Send a message below or tap + to start one.
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const busy = isBusy(item)
                  const pendingCount = pending[item.id] ?? 0
                  const directory = item.location?.directory ?? ''

                  return (
                    <View style={styles.sessionRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={item.title || 'Untitled session'}
                        onPress={() => closeSidebar(() => openSession(item))}
                        onLongPress={() => showActions(item)}
                        style={({ pressed }) => [styles.rowButton, pressed && styles.rowPressed]}
                      >
                        <View style={[styles.sessionIcon, busy && styles.sessionIconBusy]}>
                          <Ionicons
                            name={busy ? 'sync-outline' : 'chatbubble-ellipses-outline'}
                            size={16}
                            color={busy ? colors.amber : colors.accent}
                          />
                        </View>

                        <View style={styles.rowMain}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {item.title?.trim() || 'Untitled session'}
                          </Text>
                          <View style={styles.rowMeta}>
                            <Text style={styles.rowDir} numberOfLines={1}>
                              {truncate(basename(directory) || directory || 'session', 20)}
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
                        <Ionicons name="ellipsis-horizontal" size={16} color={colors.textFaint} />
                      </Pressable>
                    </View>
                  )
                }}
              />
            )}

            {/* Sidebar Bottom Footer: Server Host & Logout */}
            <View style={styles.drawerFooter}>
              <View style={styles.footerHost}>
                <Text style={styles.footerHostLabel} numberOfLines={1}>
                  {connection?.label ?? 'Connected'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log out from server"
                onPress={handleLogout}
                style={({ pressed }) => [styles.disconnectBtn, pressed && styles.pressed]}
              >
                <Ionicons name="log-out-outline" size={17} color={colors.red} />
                <Text style={styles.disconnectLabel}>Logout</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  composerWrapper: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 2,
    paddingTop: spacing.xs,
    gap: spacing.xs + 2,
  },
  projectSelectorRow: {
    alignItems: 'center',
  },
  projectPickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    maxWidth: 260,
  },
  projectPickerLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingLeft: 44,
    paddingRight: 6,
    height: 48,
  },
  composerInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    paddingVertical: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  sendButtonActive: {
    backgroundColor: colors.accent,
  },
  sendButtonIdle: {
    backgroundColor: colors.surfaceAlt,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  projectSheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  projectList: {
    flexGrow: 0,
    maxHeight: 320,
  },
  projectListContent: {
    gap: spacing.xs,
  },
  projectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  projectOptionSelected: {
    backgroundColor: colors.accentSoft,
  },
  projectOptionInfo: {
    flex: 1,
    gap: 2,
  },
  projectOptionName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  projectOptionPath: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: font.mono,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  drawerContent: {
    backgroundColor: colors.bgElevated,
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  drawerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  drawerCount: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: font.mono,
  },
  drawerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  bannerIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
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
    fontSize: 12,
    fontWeight: '700',
  },
  bannerSub: {
    color: colors.textMuted,
    fontSize: 11,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.redSoft,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    flex: 1,
  },
  drawerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerListContent: {
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  separator: {
    height: spacing.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.xs,
  },
  rowPressed: {
    opacity: 0.75,
  },
  sessionIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionIconBusy: {
    backgroundColor: colors.amberSoft,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: '600',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowDir: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: font.mono,
  },
  dot: {
    color: colors.textFaint,
    fontSize: 11,
  },
  rowTime: {
    color: colors.textFaint,
    fontSize: 10.5,
  },
  moreButton: {
    width: 26,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDrawer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  emptyDrawerTitle: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: '600',
  },
  emptyDrawerText: {
    color: colors.textFaint,
    fontSize: 11.5,
    textAlign: 'center',
    maxWidth: 200,
  },
  drawerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    gap: spacing.sm,
  },
  footerHost: {
    flex: 1,
  },
  footerHostLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: font.mono,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  disconnectLabel: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.75,
  },
})
