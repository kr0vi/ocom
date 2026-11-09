import React from 'react'
import { StyleSheet, View } from 'react-native'

import type { EventStatus } from '@/lib/events'
import { colors, radius, spacing } from '@/lib/theme'
import { AppText as Text, StatusDot } from './ui'

const meta: Record<EventStatus, { color: string; label: string; bg: string }> = {
  live: { color: colors.green, label: 'Live', bg: colors.greenSoft },
  connecting: { color: colors.amber, label: 'Connecting', bg: colors.amberSoft },
  retrying: { color: colors.amber, label: 'Reconnecting', bg: colors.amberSoft },
  idle: { color: colors.red, label: 'Offline', bg: colors.redSoft },
}

export function ConnectionStatus({ status }: { status: EventStatus }) {
  const current = meta[status]

  return (
    <View style={[styles.pill, { backgroundColor: current.bg }]}>
      <StatusDot color={current.color} size={7} />
      <Text style={[styles.label, { color: current.color }]}>{current.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
