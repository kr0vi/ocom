import { Ionicons } from '@expo/vector-icons'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { colors, radius, spacing } from '@/lib/theme'

export function Composer({
  value,
  onChangeText,
  onSend,
  onStop,
  busy,
  sending,
}: {
  value: string
  onChangeText: (value: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  sending: boolean
}) {
  const [focused, setFocused] = useState(false)
  const canSend = value.trim().length > 0 && !sending

  return (
    <View style={styles.container}>
      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={colors.amber} />
          <Text style={styles.busyText}>Agent is working…</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop the agent"
            onPress={onStop}
            hitSlop={8}
            style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
          >
            <Ionicons name="stop" size={12} color={colors.red} />
            <Text style={styles.stopLabel}>Stop</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Message the agent…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          multiline
          textAlignVertical="top"
          keyboardAppearance="dark"
          editable={!sending}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => [
            styles.sendButton,
            canSend ? styles.sendButtonActive : styles.sendButtonIdle,
            pressed && canSend && styles.pressed,
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Ionicons name="arrow-up" size={19} color={canSend ? colors.bg : colors.textFaint} />
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  busyText: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.pill,
  },
  stopLabel: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  inputRowFocused: {
    borderColor: colors.accentBorder,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 132,
    minHeight: 38,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: colors.accent,
  },
  sendButtonIdle: {
    backgroundColor: colors.surfaceAlt,
  },
  pressed: {
    opacity: 0.75,
  },
})
