export type AuthMode = 'password' | 'bearer'

export type Connection = {
  /** Server origin, e.g. https://abc123.opencode.tunnel */
  baseUrl: string
  /** Server password or the token returned when redeeming a pairing code. */
  token: string
  auth: AuthMode
  /** Human friendly label (host name). */
  label: string
  createdAt: number
}

export type ServerInfo = {
  version: string
  pid?: number
  hostname?: string | null
  urls?: string[]
  capabilities?: unknown
}

export type SessionInfo = {
  id: string
  parentID?: string
  projectID: string
  agent?: string
  model?: { providerID?: string; modelID?: string; [key: string]: unknown }
  cost?: number
  outcome?: 'succeeded' | 'failed' | 'interrupted'
  title?: string
  location: { directory: string }
  time: {
    created: number
    updated: number
    busy?: number
    idle?: number
    viewed?: number
    archived?: number
  }
  [key: string]: unknown
}

export type Project = {
  id: string
  canonical: string
  name?: string
  icon?: unknown
  time?: { created?: number; updated?: number }
  [key: string]: unknown
}

export type PermissionDecision = 'once' | 'always' | 'reject'

export type PermissionRequest = {
  id: string
  sessionID: string
  action: string
  resources: string[]
  save?: string[]
  metadata?: Record<string, unknown>
  source?: unknown
  message?: string
}

export type ToolContentPart =
  | { type: 'text'; text: string }
  | { type: 'file'; uri?: string; mime?: string; name?: string }

export type ToolPart = {
  type: 'tool'
  id: string
  name: string
  executed?: boolean
  state:
    | { status: 'streaming'; input: string }
    | { status: 'running'; input: unknown; metadata?: unknown }
    | { status: 'completed'; input: unknown; content?: ToolContentPart[]; metadata?: unknown }
    | { status: 'error'; input: unknown; error?: unknown; content?: ToolContentPart[] }
  time?: { created?: number; ran?: number; completed?: number }
}

export type TextPart = { type: 'text'; text: string }
export type ReasoningPart = { type: 'reasoning'; text: string }

export type MessageContentPart = TextPart | ReasoningPart | ToolPart

/**
 * The API has many message variants. Only the fields the UI needs are typed;
 * unknown variants fall back to a compact system-style row.
 */
export type Message = {
  id: string
  type: string
  time?: { created?: number; completed?: number; streamed?: number }
  text?: string
  description?: string
  content?: MessageContentPart[]
  agent?: string
  model?: { providerID?: string; modelID?: string; [key: string]: unknown }
  error?: unknown
  [key: string]: unknown
}

export type V2Event<T = unknown> = {
  id: string
  created: number
  type: string
  data: T
  location?: { directory: string }
  [key: string]: unknown
}

export type SessionMessagesResponse = {
  data: Message[]
  cursor: { previous?: string | null; next?: string | null }
}

export type SessionsResponse = {
  data: SessionInfo[]
  cursor: { previous?: string | null; next?: string | null }
}

export type PermissionListResponse = {
  location?: { directory: string }
  data: PermissionRequest[]
}

export function isAssistantMessage(message: Message): boolean {
  return message.type === 'assistant'
}

export function messageText(message: Message): string {
  if (typeof message.text === 'string') return message.text
  if (!message.content) return ''
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
}

export function toolContentText(part: ToolPart): string {
  const state = part.state
  const content = 'content' in state ? state.content : undefined
  if (!content?.length) return ''
  return content
    .map((item) => {
      if (item.type === 'text') return item.text
      return item.name ?? item.uri ?? 'file'
    })
    .filter(Boolean)
    .join('\n')
}

export function stringifyUnknown(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function errorMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const record = error as Record<string, unknown>
  const data = record.data as Record<string, unknown> | undefined
  const nested = (data?.message ?? record.message) as unknown
  if (typeof nested === 'string') return nested
  return stringifyUnknown(error)
}
