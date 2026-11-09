import { Ionicons } from '@expo/vector-icons'
import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { colors, font, radius, spacing } from '@/lib/theme'
import type { PermissionDecision, PermissionRequest } from '@/lib/types'
import { AppText as Text, Button } from './ui'

export function PermissionCard({
  request,
  submitting,
  onReply,
}: {
  request: PermissionRequest
  submitting: boolean
  onReply: (decision: PermissionDecision) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visibleResources = showAll ? request.resources : request.resources.slice(0, 4)
  const hiddenCount = request.resources.length - visibleResources.length

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.amber} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Permission required</Text>
          <Text style={styles.action}>{request.action}</Text>
        </View>
      </View>

      {request.message ? <Text style={styles.message}>{request.message}</Text> : null}

      {request.resources.length > 0 ? (
        <View style={styles.resources}>
          {visibleResources.map((resource, index) => (
            <Text key={`${resource}-${index}`} selectable style={styles.resource} numberOfLines={3}>
              {resource}
            </Text>
          ))}
          {hiddenCount > 0 || showAll ? (
            <Pressable onPress={() => setShowAll((value) => !value)} hitSlop={6}>
              <Text style={styles.more}>
                {showAll ? 'Show less' : `+${hiddenCount} more`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Reject"
          variant="danger"
          compact
          disabled={submitting}
          onPress={() => onReply('reject')}
          style={styles.actionButton}
        />
        <Button
          label="Always"
          variant="secondary"
          compact
          disabled={submitting}
          onPress={() => onReply('always')}
          style={styles.actionButton}
        />
        <Button
          label="Allow once"
          compact
          loading={submitting}
          disabled={submitting}
          onPress={() => onReply('once')}
          style={styles.actionButton}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  action: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: font.mono,
  },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  resources: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  resource: {
    color: colors.textMuted,
    fontFamily: font.mono,
    fontSize: 11.5,
    lineHeight: 17,
  },
  more: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
})
