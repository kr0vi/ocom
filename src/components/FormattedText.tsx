import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { colors, font, radius, spacing } from '@/lib/theme'
import { AppText as Text } from './ui'

type Segment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language: string }

function parseSegments(input: string): Segment[] {
  const chunks = input.split('```')
  const segments: Segment[] = []

  chunks.forEach((chunk, index) => {
    if (index % 2 === 0) {
      if (chunk) segments.push({ type: 'text', content: chunk })
      return
    }

    const newline = chunk.indexOf('\n')
    const language = (newline === -1 ? chunk : chunk.slice(0, newline)).trim()
    const content = (newline === -1 ? '' : chunk.slice(newline + 1)).replace(/\n$/, '')
    segments.push({ type: 'code', content, language })
  })

  return segments
}

export const FormattedText = React.memo(function FormattedText({ text }: { text: string }) {
  const segments = useMemo(() => parseSegments(text), [text])

  return (
    <View style={styles.container}>
      {segments.map((segment, index) =>
        segment.type === 'code' ? (
          <View key={`code-${index}`} style={styles.codeBlock}>
            {segment.language ? (
              <Text style={styles.codeLanguage}>{segment.language}</Text>
            ) : null}
            <Text selectable style={styles.codeText}>
              {segment.content}
            </Text>
          </View>
        ) : (
          <Text key={`text-${index}`} selectable style={styles.text}>
            {segment.content.replace(/^\n+|\n+$/g, '')}
          </Text>
        ),
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  codeBlock: {
    backgroundColor: colors.codeBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  codeLanguage: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  codeText: {
    color: '#C8D2E0',
    fontFamily: font.mono,
    fontSize: 12.5,
    lineHeight: 18,
  },
})
