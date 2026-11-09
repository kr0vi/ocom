import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import React, { useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  View,
} from 'react-native'

import { colors, font, radius, spacing } from '@/lib/theme'
import { AppText as Text } from './ui'

type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'boldItalic'; text: string }
  | { type: 'strike'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string }

function parseInline(raw: string): InlineToken[] {
  const tokens: InlineToken[] = []
  if (!raw) return tokens

  const regex =
    /(\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[\s\S]+?\*\*|__[\s\S]+?__|`[^`\n]+`|\[[^\]]+\]\([^)]+\)|\*[^\s*][^*]*\*|_[^\s_][^_]*_|~~[\s\S]+?~~)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: raw.slice(lastIndex, match.index) })
    }

    const matched = match[0]
    if (
      (matched.startsWith('***') && matched.endsWith('***') && matched.length >= 6) ||
      (matched.startsWith('___') && matched.endsWith('___') && matched.length >= 6)
    ) {
      tokens.push({ type: 'boldItalic', text: matched.slice(3, -3) })
    } else if (
      (matched.startsWith('**') && matched.endsWith('**') && matched.length >= 4) ||
      (matched.startsWith('__') && matched.endsWith('__') && matched.length >= 4)
    ) {
      tokens.push({ type: 'bold', text: matched.slice(2, -2) })
    } else if (matched.startsWith('~~') && matched.endsWith('~~') && matched.length >= 4) {
      tokens.push({ type: 'strike', text: matched.slice(2, -2) })
    } else if (matched.startsWith('`') && matched.endsWith('`') && matched.length >= 2) {
      tokens.push({ type: 'code', text: matched.slice(1, -1) })
    } else if (matched.startsWith('[') && matched.includes('](') && matched.endsWith(')')) {
      const closeBracket = matched.indexOf('](')
      const label = matched.slice(1, closeBracket)
      const url = matched.slice(closeBracket + 2, -1)
      tokens.push({ type: 'link', text: label, url })
    } else if (
      (matched.startsWith('*') && matched.endsWith('*') && matched.length >= 2) ||
      (matched.startsWith('_') && matched.endsWith('_') && matched.length >= 2)
    ) {
      tokens.push({ type: 'italic', text: matched.slice(1, -1) })
    } else {
      tokens.push({ type: 'text', text: matched })
    }

    lastIndex = match.index + matched.length
  }

  if (lastIndex < raw.length) {
    tokens.push({ type: 'text', text: raw.slice(lastIndex) })
  }

  return tokens
}

function renderInline(raw: string, baseStyle?: StyleProp<TextStyle>): React.ReactNode {
  const tokens = parseInline(raw)
  return tokens.map((token, index) => {
    switch (token.type) {
      case 'bold':
        return (
          <Text key={index} style={[baseStyle, styles.bold]}>
            {token.text}
          </Text>
        )
      case 'italic':
        return (
          <Text key={index} style={[baseStyle, styles.italic]}>
            {token.text}
          </Text>
        )
      case 'boldItalic':
        return (
          <Text key={index} style={[baseStyle, styles.boldItalic]}>
            {token.text}
          </Text>
        )
      case 'strike':
        return (
          <Text key={index} style={[baseStyle, styles.strike]}>
            {token.text}
          </Text>
        )
      case 'code':
        return (
          <Text key={index} style={styles.inlineCode}>
            {token.text}
          </Text>
        )
      case 'link':
        return (
          <Text
            key={index}
            style={[baseStyle, styles.link]}
            onPress={() => {
              void Linking.openURL(token.url).catch(() => undefined)
            }}
          >
            {token.text}
          </Text>
        )
      default:
        return (
          <Text key={index} style={baseStyle}>
            {token.text}
          </Text>
        )
    }
  })
}

type Block =
  | { type: 'code'; language: string; content: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'bullet'; items: string[] }
  | { type: 'ordered'; items: string[] }
  | { type: 'divider' }
  | { type: 'paragraph'; text: string }

function parseBlocks(markdown: string): Block[] {
  const chunks = markdown.split('```')
  const blocks: Block[] = []

  chunks.forEach((chunk, index) => {
    if (index % 2 === 1) {
      const newline = chunk.indexOf('\n')
      const language = (newline === -1 ? chunk : chunk.slice(0, newline)).trim()
      const content = (newline === -1 ? '' : chunk.slice(newline + 1)).replace(/\n$/, '')
      blocks.push({ type: 'code', language, content })
      return
    }

    const lines = chunk.split('\n')
    let currentParagraph: string[] = []
    let currentBulletList: string[] = []
    let currentOrderedList: string[] = []
    let currentBlockquote: string[] = []

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        blocks.push({ type: 'paragraph', text: currentParagraph.join(' ') })
        currentParagraph = []
      }
    }

    const flushBulletList = () => {
      if (currentBulletList.length > 0) {
        blocks.push({ type: 'bullet', items: [...currentBulletList] })
        currentBulletList = []
      }
    }

    const flushOrderedList = () => {
      if (currentOrderedList.length > 0) {
        blocks.push({ type: 'ordered', items: [...currentOrderedList] })
        currentOrderedList = []
      }
    }

    const flushBlockquote = () => {
      if (currentBlockquote.length > 0) {
        blocks.push({ type: 'blockquote', text: currentBlockquote.join('\n') })
        currentBlockquote = []
      }
    }

    const flushAll = () => {
      flushParagraph()
      flushBulletList()
      flushOrderedList()
      flushBlockquote()
    }

    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      const trimmed = line.trim()

      if (!trimmed) {
        flushAll()
        continue
      }

      // Heading: #, ##, ###, ####, #####, ######
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        flushAll()
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2],
        })
        continue
      }

      // Divider: --- or *** or ___
      if (/^([-*_]){3,}$/.test(trimmed)) {
        flushAll()
        blocks.push({ type: 'divider' })
        continue
      }

      // Blockquote: > ...
      if (trimmed.startsWith('>')) {
        flushParagraph()
        flushBulletList()
        flushOrderedList()
        currentBlockquote.push(trimmed.replace(/^>\s?/, ''))
        continue
      }

      // Bullet list item: - ... or * ... or + ...
      const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/)
      if (bulletMatch) {
        flushParagraph()
        flushOrderedList()
        flushBlockquote()
        currentBulletList.push(bulletMatch[1])
        continue
      }

      // Ordered list item: 1. ...
      const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/)
      if (orderedMatch) {
        flushParagraph()
        flushBulletList()
        flushBlockquote()
        currentOrderedList.push(orderedMatch[1])
        continue
      }

      // Normal line in paragraph
      flushBulletList()
      flushOrderedList()
      flushBlockquote()
      currentParagraph.push(trimmed)
    }

    flushAll()
  })

  return blocks
}

function CodeBlock({ language, content }: { language: string; content: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>{language || 'code'}</Text>
        {Platform.OS === 'web' ? (
          <Pressable onPress={handleCopy} hitSlop={8} style={styles.copyButton}>
            <Ionicons
              name={copied ? 'checkmark-outline' : 'copy-outline'}
              size={12}
              color={copied ? colors.green : colors.textFaint}
            />
            <Text style={[styles.copyText, copied && { color: colors.green }]}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable style={styles.codeText}>
          {content}
        </Text>
      </ScrollView>
    </View>
  )
}

export const FormattedText = React.memo(function FormattedText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text])

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'code':
            return (
              <CodeBlock
                key={`block-${index}`}
                language={block.language}
                content={block.content}
              />
            )

          case 'heading': {
            const headingStyle =
              block.level === 1
                ? styles.heading1
                : block.level === 2
                  ? styles.heading2
                  : block.level === 3
                    ? styles.heading3
                    : styles.heading4

            return (
              <Text key={`block-${index}`} selectable style={headingStyle}>
                {renderInline(block.text, headingStyle)}
              </Text>
            )
          }

          case 'blockquote':
            return (
              <View key={`block-${index}`} style={styles.blockquote}>
                <Text selectable style={styles.blockquoteText}>
                  {renderInline(block.text, styles.blockquoteText)}
                </Text>
              </View>
            )

          case 'bullet':
            return (
              <View key={`block-${index}`} style={styles.listContainer}>
                {block.items.map((item, itemIdx) => (
                  <View key={`item-${itemIdx}`} style={styles.listRow}>
                    <View style={styles.bulletDot} />
                    <Text selectable style={styles.listContent}>
                      {renderInline(item, styles.listContent)}
                    </Text>
                  </View>
                ))}
              </View>
            )

          case 'ordered':
            return (
              <View key={`block-${index}`} style={styles.listContainer}>
                {block.items.map((item, itemIdx) => (
                  <View key={`item-${itemIdx}`} style={styles.listRow}>
                    <Text style={styles.listIndex}>{itemIdx + 1}.</Text>
                    <Text selectable style={styles.listContent}>
                      {renderInline(item, styles.listContent)}
                    </Text>
                  </View>
                ))}
              </View>
            )

          case 'divider':
            return <View key={`block-${index}`} style={styles.divider} />

          case 'paragraph':
          default:
            return (
              <Text key={`block-${index}`} selectable style={styles.paragraph}>
                {renderInline(block.text, styles.paragraph)}
              </Text>
            )
        }
      })}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  paragraph: {
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  boldItalic: {
    fontWeight: '700',
    fontStyle: 'italic',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  inlineCode: {
    fontFamily: font.mono,
    fontSize: 12.5,
    color: '#E0E7FF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  link: {
    color: '#60A5FA',
    textDecorationLine: 'underline',
  },
  heading1: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 25,
    marginTop: 4,
  },
  heading2: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 4,
  },
  heading3: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 2,
  },
  heading4: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 2,
  },
  listContainer: {
    gap: 6,
    paddingVertical: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
    marginTop: 8,
  },
  listIndex: {
    color: colors.textMuted,
    fontFamily: font.mono,
    fontSize: 13,
    minWidth: 18,
    marginTop: 1,
  },
  listContent: {
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 22,
    flex: 1,
  },
  blockquote: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    marginVertical: 2,
  },
  blockquoteText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
    marginVertical: spacing.sm,
  },
  codeBlock: {
    backgroundColor: colors.codeBg,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 4,
  },
  codeLanguage: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyText: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '600',
  },
  codeText: {
    color: '#D4D4D4',
    fontFamily: font.mono,
    fontSize: 12.5,
    lineHeight: 18,
  },
})
