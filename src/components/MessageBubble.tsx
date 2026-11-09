import { Ionicons } from '@expo/vector-icons'
import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { clockTime } from '@/lib/format'
import { colors, font, radius, spacing } from '@/lib/theme'
import {
  errorMessage,
  messageText,
  stringifyUnknown,
  toolContentText,
  type Message,
  type ReasoningPart,
  type ToolPart,
} from '@/lib/types'
import { FormattedText } from './FormattedText'
import { AppText as Text } from './ui'

function modelLabel(message: Message): string {
  const model = message.model as { modelID?: string; providerID?: string } | undefined
  if (!model?.modelID) return ''
  return model.modelID
}

function summarizeToolInput(part: ToolPart): string {
  const input = 'input' in part.state ? part.state.input : undefined

  if (typeof input === 'string') return input
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>
    const preferred = ['command', 'filePath', 'path', 'pattern', 'query', 'description', 'url']
    for (const key of preferred) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string
    }
    return stringifyUnknown(input)
  }
  return ''
}

function ReasoningBlock({ part }: { part: ReasoningPart }) {
  const [open, setOpen] = useState(false)

  return (
    <View style={styles.reasoning}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide reasoning' : 'Show reasoning'}
        onPress={() => setOpen((value) => !value)}
        style={styles.reasoningHeader}
      >
        <Ionicons name="sparkles-outline" size={14} color={colors.textFaint} />
        <Text style={styles.reasoningTitle}>Thinking</Text>
        <Text style={styles.reasoningToggle}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open ? <Text selectable style={styles.reasoningText}>{part.text}</Text> : null}
    </View>
  )
}

function ToolBlock({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false)
  const status = part.state.status

  const statusMeta = {
    streaming: { label: 'preparing', color: colors.amber, icon: 'ellipsis-horizontal' as const },
    running: { label: 'running', color: colors.amber, icon: 'sync-outline' as const },
    completed: { label: 'done', color: colors.green, icon: 'checkmark-circle-outline' as const },
    error: { label: 'failed', color: colors.red, icon: 'alert-circle-outline' as const },
  }[status]

  const input = summarizeToolInput(part)
  const output = toolContentText(part)
  const hasDetails = Boolean(input || output)

  return (
    <View style={styles.tool}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tool ${part.name}, ${statusMeta.label}`}
        disabled={!hasDetails}
        onPress={() => setOpen((value) => !value)}
        style={styles.toolHeader}
      >
        <View style={styles.toolIcon}>
          <Ionicons name="construct-outline" size={14} color={colors.textMuted} />
        </View>
        <Text style={styles.toolName} numberOfLines={1}>
          {part.name}
        </Text>
        {status === 'running' || status === 'streaming' ? (
          <ActivityIndicator size="small" color={statusMeta.color} style={styles.toolSpinner} />
        ) : (
          <Ionicons name={statusMeta.icon} size={15} color={statusMeta.color} />
        )}
        <Text style={[styles.toolStatus, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        {hasDetails ? (
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textFaint}
          />
        ) : null}
      </Pressable>

      {input ? (
        <Text
          selectable
          numberOfLines={open ? undefined : 2}
          style={[styles.toolInput, status === 'error' && { color: colors.red }]}
        >
          {input}
        </Text>
      ) : null}

      {output ? (
        <Text
          selectable
          numberOfLines={open ? undefined : 3}
          style={styles.toolOutput}
        >
          {output}
        </Text>
      ) : null}
    </View>
  )
}

function AssistantMessage({
  message,
  streaming,
}: {
  message: Message
  streaming: boolean
}) {
  const content = message.content ?? []
  const hasVisibleContent = content.length > 0
  const model = modelLabel(message)
  const error = errorMessage(message.error)

  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantHeader}>
        <View style={styles.assistantAvatar}>
          <Ionicons name="terminal" size={13} color={colors.accent} />
        </View>
        <Text style={styles.assistantName}>{message.agent ?? 'assistant'}</Text>
        {model ? <Text style={styles.assistantModel}>{model}</Text> : null}
        {streaming ? (
          <ActivityIndicator size="small" color={colors.accent} style={styles.headerSpinner} />
        ) : null}
      </View>

      <View style={styles.assistantBody}>
        {!hasVisibleContent && streaming ? (
          <View style={styles.typing}>
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
          </View>
        ) : null}

        {content.map((part, index) => {
          if (part.type === 'text') {
            if (!part.text) return null
            return (
              <View key={`text-${index}`} style={styles.part}>
                <FormattedText text={part.text} />
              </View>
            )
          }

          if (part.type === 'reasoning') {
            if (!part.text) return null
            return (
              <View key={`reasoning-${index}`} style={styles.part}>
                <ReasoningBlock part={part} />
              </View>
            )
          }

          return (
            <View key={`tool-${part.id}-${index}`} style={styles.part}>
              <ToolBlock part={part} />
            </View>
          )
        })}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.red} />
            <Text selectable style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function systemText(message: Message): string {
  if (message.text) return message.text
  if (message.description) return message.description

  switch (message.type) {
    case 'agent-switched':
      return `Agent switched${message.agent ? ` to ${message.agent}` : ''}`
    case 'model-switched': {
      const model = modelLabel(message)
      return `Model switched${model ? ` to ${model}` : ''}`
    }
    case 'location-switched':
      return 'Working directory changed'
    case 'compaction':
      return 'Context compacted'
    case 'skill':
      return 'Skill activated'
    case 'idle':
      return 'Session idle'
    default:
      return ''
  }
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  streaming = false,
}: {
  message: Message
  streaming?: boolean
}) {
  const system = useMemo(() => systemText(message), [message])

  if (message.type === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text selectable style={styles.userText}>
            {messageText(message)}
          </Text>
          <Text style={styles.userTime}>{clockTime(message.time?.created)}</Text>
        </View>
      </View>
    )
  }

  if (message.type === 'assistant') {
    return <AssistantMessage message={message} streaming={streaming} />
  }

  if (!system) return null

  return (
    <View style={styles.systemRow}>
      <View style={styles.systemLine} />
      <Text style={styles.systemText} numberOfLines={3}>
        {system}
      </Text>
      <View style={styles.systemLine} />
    </View>
  )
})

const styles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    marginVertical: spacing.sm,
  },
  userBubble: {
    maxWidth: '88%',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  userText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  userTime: {
    color: colors.textFaint,
    fontSize: 10,
    alignSelf: 'flex-end',
  },
  assistantRow: {
    marginVertical: spacing.sm,
    gap: spacing.xs,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  assistantAvatar: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  assistantName: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  assistantModel: {
    color: colors.textFaint,
    fontSize: 11,
  },
  headerSpinner: {
    transform: [{ scale: 0.7 }],
  },
  assistantBody: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.xs,
    padding: spacing.lg,
    gap: spacing.md,
  },
  part: {
    gap: spacing.xs,
  },
  typing: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textFaint,
    opacity: 0.7,
  },
  reasoning: {
    paddingLeft: spacing.md,
    gap: spacing.sm,
  },
  reasoningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reasoningTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  reasoningToggle: {
    color: colors.accent,
    fontSize: 11,
    marginLeft: 'auto',
  },
  reasoningText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  tool: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toolIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  toolSpinner: {
    transform: [{ scale: 0.65 }],
    marginLeft: 'auto',
  },
  toolStatus: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginLeft: 'auto',
  },
  toolInput: {
    color: colors.textMuted,
    fontFamily: font.mono,
    fontSize: 11.5,
    lineHeight: 17,
  },
  toolOutput: {
    color: colors.textFaint,
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  systemLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  systemText: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    flexShrink: 1,
  },
})
