import type {
  Message,
  MessageContentPart,
  ReasoningPart,
  TextPart,
  ToolContentPart,
  ToolPart,
  V2Event,
} from './types'

function asToolContent(value: unknown): ToolContentPart[] | undefined {
  return Array.isArray(value) ? (value as ToolContentPart[]) : undefined
}

function assistantMessage(id: string): Message {
  return {
    id,
    type: 'assistant',
    time: { created: Date.now() },
    content: [],
  }
}

function updateAssistant(
  messages: Message[],
  id: string,
  updater: (message: Message) => Message,
): Message[] {
  const index = messages.findIndex((message) => message.id === id)

  if (index === -1) return [...messages, updater(assistantMessage(id))]

  const next = [...messages]
  next[index] = updater(next[index])
  return next
}

function appendToPart(
  content: MessageContentPart[],
  kind: 'text' | 'reasoning',
  ordinal: number,
  text: string,
): MessageContentPart[] {
  const next = [...content]
  const indexes = next
    .map((part, index) => ({ part, index }))
    .filter((entry) => entry.part.type === kind)

  if (ordinal >= 0 && ordinal < indexes.length) {
    const target = indexes[ordinal]
    const part = target.part as TextPart | ReasoningPart
    next[target.index] = { ...part, text: part.text + text } as MessageContentPart
  } else {
    next.push(
      kind === 'text'
        ? ({ type: 'text', text } as TextPart)
        : ({ type: 'reasoning', text } as ReasoningPart),
    )
  }

  return next
}

function replacePartText(
  content: MessageContentPart[],
  kind: 'text' | 'reasoning',
  ordinal: number,
  text: string,
): MessageContentPart[] {
  const next = [...content]
  const indexes = next
    .map((part, index) => ({ part, index }))
    .filter((entry) => entry.part.type === kind)

  if (ordinal >= 0 && ordinal < indexes.length) {
    const target = indexes[ordinal]
    const part = target.part as TextPart | ReasoningPart
    next[target.index] = { ...part, text } as MessageContentPart
  } else {
    next.push(
      kind === 'text'
        ? ({ type: 'text', text } as TextPart)
        : ({ type: 'reasoning', text } as ReasoningPart),
    )
  }

  return next
}

function upsertTool(
  messages: Message[],
  messageID: string,
  toolID: string,
  create: () => ToolPart,
  update: (part: ToolPart) => ToolPart,
): Message[] {
  return updateAssistant(messages, messageID, (message) => {
    const content = [...(message.content ?? [])]
    const index = content.findIndex(
      (part) => part.type === 'tool' && (part as ToolPart).id === toolID,
    )

    if (index === -1) content.push(create())
    else content[index] = update(content[index] as ToolPart)

    return { ...message, content }
  })
}

function toolInput(part: ToolPart): unknown {
  return 'input' in part.state ? part.state.input : ''
}

type EventData = Record<string, unknown>

/**
 * Merge one live SSE event into the projected message list.
 *
 * `seen` records which text/reasoning ordinals received deltas, so the
 * authoritative text from an "ended" event is only used when deltas were
 * missed (for example after a reconnect).
 */
export function applyEventToMessages(
  messages: Message[],
  event: V2Event,
  seen: Set<string>,
): Message[] {
  const data = event.data as EventData | null
  if (!data || typeof data !== 'object') return messages

  const messageID = typeof data.assistantMessageID === 'string' ? data.assistantMessageID : ''
  const ordinal = typeof data.ordinal === 'number' ? data.ordinal : 0

  switch (event.type) {
    case 'session.text.started':
      return messageID ? updateAssistant(messages, messageID, (message) => message) : messages

    case 'session.text.delta': {
      if (!messageID || typeof data.delta !== 'string') return messages
      seen.add(`${messageID}:text:${ordinal}`)
      return updateAssistant(messages, messageID, (message) => ({
        ...message,
        content: appendToPart(message.content ?? [], 'text', ordinal, data.delta as string),
      }))
    }

    case 'session.text.ended': {
      if (!messageID) return messages
      const key = `${messageID}:text:${ordinal}`
      const text = typeof data.text === 'string' ? data.text : ''
      if (!text || seen.has(key)) {
        return updateAssistant(messages, messageID, (message) => message)
      }
      return updateAssistant(messages, messageID, (message) => ({
        ...message,
        content: replacePartText(message.content ?? [], 'text', ordinal, text),
      }))
    }

    case 'session.reasoning.started':
      return messageID ? updateAssistant(messages, messageID, (message) => message) : messages

    case 'session.reasoning.delta': {
      if (!messageID || typeof data.delta !== 'string') return messages
      seen.add(`${messageID}:reasoning:${ordinal}`)
      return updateAssistant(messages, messageID, (message) => ({
        ...message,
        content: appendToPart(message.content ?? [], 'reasoning', ordinal, data.delta as string),
      }))
    }

    case 'session.reasoning.ended': {
      if (!messageID) return messages
      const key = `${messageID}:reasoning:${ordinal}`
      const text = typeof data.text === 'string' ? data.text : ''
      if (!text || seen.has(key)) {
        return updateAssistant(messages, messageID, (message) => message)
      }
      return updateAssistant(messages, messageID, (message) => ({
        ...message,
        content: replacePartText(message.content ?? [], 'reasoning', ordinal, text),
      }))
    }

    case 'session.tool.input.started': {
      const toolID = typeof data.id === 'string' ? data.id : ''
      const name = typeof data.name === 'string' ? data.name : 'tool'
      if (!messageID || !toolID) return messages
      return upsertTool(
        messages,
        messageID,
        toolID,
        () => ({
          type: 'tool',
          id: toolID,
          name,
          state: { status: 'streaming', input: '' },
          time: { created: Date.now() },
        }),
        (part) => part,
      )
    }

    case 'session.tool.input.delta': {
      const toolID = typeof data.id === 'string' ? data.id : ''
      const delta = typeof data.delta === 'string' ? data.delta : ''
      if (!messageID || !toolID || !delta) return messages

      return upsertTool(
        messages,
        messageID,
        toolID,
        () => ({
          type: 'tool',
          id: toolID,
          name: 'tool',
          state: { status: 'streaming', input: delta },
          time: { created: Date.now() },
        }),
        (part) => {
          if (part.state.status !== 'streaming') return part
          return { ...part, state: { status: 'streaming', input: part.state.input + delta } }
        },
      )
    }

    case 'session.tool.input.ended': {
      const toolID = typeof data.id === 'string' ? data.id : ''
      const text = typeof data.text === 'string' ? data.text : ''
      if (!messageID || !toolID) return messages

      return upsertTool(
        messages,
        messageID,
        toolID,
        () => ({
          type: 'tool',
          id: toolID,
          name: 'tool',
          state: { status: 'streaming', input: text },
          time: { created: Date.now() },
        }),
        (part) => ({ ...part, state: { status: 'streaming', input: text } }),
      )
    }

    case 'session.tool.called': {
      const toolID = typeof data.id === 'string' ? data.id : ''
      if (!messageID || !toolID) return messages

      return upsertTool(
        messages,
        messageID,
        toolID,
        () => ({
          type: 'tool',
          id: toolID,
          name: 'tool',
          state: { status: 'running', input: data.input },
          time: { created: Date.now() },
        }),
        (part) => ({
          ...part,
          state: {
            status: 'running',
            input: data.input ?? toolInput(part),
            metadata: data.metadata,
          },
        }),
      )
    }

    case 'session.tool.success': {
      const toolID = typeof data.id === 'string' ? data.id : ''
      if (!messageID || !toolID) return messages

      return upsertTool(
        messages,
        messageID,
        toolID,
        () => ({
          type: 'tool',
          id: toolID,
          name: 'tool',
          executed: typeof data.executed === 'boolean' ? data.executed : undefined,
          state: {
            status: 'completed',
            input: data.input,
            content: asToolContent(data.content),
          },
          time: { created: Date.now(), completed: Date.now() },
        }),
        (part) => ({
          ...part,
          executed: typeof data.executed === 'boolean' ? data.executed : part.executed,
          state: {
            status: 'completed',
            input: data.input ?? toolInput(part),
            content: asToolContent(data.content),
            metadata: data.metadata,
          },
          time: { ...part.time, completed: Date.now() },
        }),
      )
    }

    case 'session.tool.failed': {
      const toolID = typeof data.id === 'string' ? data.id : ''
      if (!messageID || !toolID) return messages

      return upsertTool(
        messages,
        messageID,
        toolID,
        () => ({
          type: 'tool',
          id: toolID,
          name: 'tool',
          state: { status: 'error', input: data.input, error: data.error },
          time: { created: Date.now(), completed: Date.now() },
        }),
        (part) => ({
          ...part,
          state: {
            status: 'error',
            input: data.input ?? toolInput(part),
            error: data.error,
            content: asToolContent(data.content),
          },
          time: { ...part.time, completed: Date.now() },
        }),
      )
    }

    default:
      return messages
  }
}
