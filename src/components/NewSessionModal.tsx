import { Ionicons } from '@expo/vector-icons'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useConnection } from '@/lib/connection'
import { basename, compactPath, errorText } from '@/lib/format'
import { colors, font, radius, spacing } from '@/lib/theme'
import type { Project } from '@/lib/types'
import {
  AppText as Text,
  AppTextInput as TextInput,
  Button,
  IconButton,
} from './ui'

export function NewSessionModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean
  onClose: () => void
  onCreate: (title: string, directory: string | null) => Promise<void>
}) {
  const { api } = useConnection()
  const insets = useSafeAreaInsets()

  const [title, setTitle] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [directory, setDirectory] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(Boolean(api))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !api) return

    let cancelled = false

    void api
      .listProjects()
      .then((next) => {
        if (!cancelled) setProjects(next)
      })
      .catch((cause) => {
        if (!cancelled) setError(errorText(cause))
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false)
      })

    return () => {
      cancelled = true
    }
  }, [api, visible])

  const submit = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await onCreate(title.trim(), directory)
      onClose()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.heading}>New session</Text>
            <IconButton
              icon="close"
              accessibilityLabel="Close new session"
              onPress={onClose}
              color={colors.textMuted}
            />
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Session title (optional)"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            keyboardAppearance="dark"
            autoFocus
            returnKeyType="done"
          />

          <Text style={styles.sectionLabel}>Working directory</Text>

          {loadingProjects ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.mutedText}>Loading projects…</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.projectList}
              contentContainerStyle={styles.projectListContent}
              keyboardShouldPersistTaps="handled"
            >
              <ProjectRow
                label="Server default"
                sublabel="Let OpenCode choose the location"
                selected={directory === null}
                onPress={() => setDirectory(null)}
                icon="terminal-outline"
              />
              {projects.map((project) => {
                const label = project.name || basename(project.canonical) || project.canonical
                return (
                  <ProjectRow
                    key={project.id}
                    label={label}
                    sublabel={compactPath(project.canonical, 56)}
                    selected={directory === project.canonical}
                    onPress={() => setDirectory(project.canonical)}
                    icon="folder-outline"
                  />
                )
              })}
            </ScrollView>
          )}

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={onClose}
              disabled={saving}
              style={styles.action}
            />
            <Button
              label="Create session"
              onPress={() => void submit()}
              loading={saving}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function ProjectRow({
  label,
  sublabel,
  selected,
  onPress,
  icon,
}: {
  label: string
  sublabel: string
  selected: boolean
  onPress: () => void
  icon: keyof typeof Ionicons.glyphMap
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.projectRow,
        selected && styles.projectRowSelected,
        pressed && styles.projectRowPressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={selected ? colors.accent : colors.textMuted}
      />
      <View style={styles.projectText}>
        <Text style={styles.projectLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.projectSublabel} numberOfLines={1}>
          {sublabel}
        </Text>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
      ) : (
        <View style={styles.radio} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    maxHeight: '86%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  projectList: {
    flexGrow: 0,
    maxHeight: 300,
  },
  projectListContent: {
    gap: spacing.xs,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  projectRowSelected: {
    backgroundColor: colors.accentSoft,
  },
  projectRowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  projectText: {
    flex: 1,
    gap: 2,
  },
  projectLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  projectSublabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: font.mono,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  action: {
    flex: 1,
  },
})
