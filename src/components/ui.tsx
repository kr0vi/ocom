import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { colors, font, radius, spacing } from '@/lib/theme'

export function AppText({ style, ...props }: TextProps) {
  return <Text {...props} style={[{ fontFamily: font.regular }, style]} />
}

export function AppTextInput({ style, ...props }: TextInputProps) {
  return <TextInput {...props} style={[{ fontFamily: font.regular }, style]} />
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type ButtonProps = {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  icon?: keyof typeof Ionicons.glyphMap
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  labelStyle?: StyleProp<TextStyle>
  compact?: boolean
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  labelStyle,
  compact = false,
}: ButtonProps) {
  const isDisabled = disabled || loading
  const foreground =
    variant === 'primary'
      ? colors.bg
      : variant === 'danger'
        ? colors.red
        : variant === 'ghost'
          ? colors.textMuted
          : colors.text

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : icon ? (
        <Ionicons name={icon} size={compact ? 16 : 18} color={foreground} />
      ) : null}
      <AppText
        style={[
          styles.buttonLabel,
          compact && styles.buttonLabelCompact,
          { color: foreground },
          labelStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </Pressable>
  )
}

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
  accessibilityLabel: string
  color?: string
  size?: number
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  filled?: boolean
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = colors.text,
  size = 20,
  disabled = false,
  style,
  filled = false,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        filled && styles.iconButtonFilled,
        pressed && !disabled && styles.iconButtonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  )
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Badge({
  label,
  tone = 'accent',
}: {
  label: string | number
  tone?: 'accent' | 'amber' | 'green' | 'red' | 'muted'
}) {
  const palette = {
    accent: { bg: colors.accentSoft, fg: colors.accent },
    amber: { bg: colors.amberSoft, fg: colors.amber },
    green: { bg: colors.greenSoft, fg: colors.green },
    red: { bg: colors.redSoft, fg: colors.red },
    muted: { bg: colors.surfaceAlt, fg: colors.textMuted },
  }[tone]

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <AppText style={[styles.badgeLabel, { color: palette.fg }]}>{label}</AppText>
    </View>
  )
}

export function StatusDot({
  color,
  size = 8,
}: {
  color: string
  size?: number
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <AppText style={styles.sectionLabel}>{children}</AppText>
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderBright,
    // subtle shadow for uplifted look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  buttonCompact: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceAlt,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDanger: {
    backgroundColor: colors.redSoft,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  buttonLabelCompact: {
    fontSize: 13,
  },
  iconButton: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    // subtle shadow for uplifted look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,

  },
  iconButtonFilled: {
    backgroundColor: colors.surfaceAlt,
  },
  iconButtonPressed: {
    backgroundColor: colors.surfacePressed,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    // subtle shadow for uplifted look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,

    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
})
