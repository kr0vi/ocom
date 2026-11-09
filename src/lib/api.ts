import { encodeBase64 } from './base64'
import type {
  AuthMode,
  Connection,
  Message,
  PermissionDecision,
  PermissionListResponse,
  PermissionRequest,
  Project,
  ServerInfo,
  SessionInfo,
  SessionMessagesResponse,
  SessionsResponse,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string, message?: string) {
    super(message ?? describeError(status, body))
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function describeError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const error = parsed.error

    if (typeof error === 'string' && error) return error

    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>
      if (typeof record.message === 'string' && record.message) return record.message
      const data = record.data
      if (data && typeof data === 'object') {
        const message = (data as Record<string, unknown>).message
        if (typeof message === 'string' && message) return message
      }
    }

    if (typeof parsed.message === 'string' && parsed.message) return parsed.message
  } catch {
    // Fall through to a generic message.
  }

  if (status === 401) return 'Not authorized. Check the password or pairing link.'
  if (status === 404) return 'Not found on the server.'
  if (status === 409) return 'The server is busy. Try again in a moment.'
  if (status >= 500) return `The OpenCode server returned an error (${status}).`
  return `Request failed (${status}).`
}

function authorizationHeader(connection: Pick<Connection, 'token' | 'auth'>): string {
  if (connection.auth === 'bearer') return `Bearer ${connection.token}`
  return `Basic ${encodeBase64(`opencode:${connection.token}`)}`
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export function normalizeBaseUrl(input: string): string {
  let value = input.trim()
  if (!value) throw new Error('Enter the server URL.')

  if (!/^https?:\/\//i.test(value)) value = `https://${value}`

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('That does not look like a valid URL.')
  }

  if (!url.hostname) throw new Error('That does not look like a valid URL.')

  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

export function hostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

export function parsePairLink(link: string): { baseUrl: string; code: string } {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    throw new Error('Paste the full pairing link printed by `opencode pair --remote`.')
  }

  const marker = '/auth/connect/'
  const index = url.pathname.indexOf(marker)
  if (index === -1) {
    throw new Error('That link does not contain an OpenCode pairing code.')
  }

  const code = decodeURIComponent(url.pathname.slice(index + marker.length).split('/')[0] ?? '')
  if (!code) throw new Error('The pairing link is missing its code.')

  const basePath = url.pathname.slice(0, index).replace(/\/+$/, '')
  return { baseUrl: `${url.origin}${basePath}`, code }
}

export async function redeemPairLink(baseUrl: string, code: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(joinUrl(baseUrl, `/auth/connect/${encodeURIComponent(code)}`), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error('Could not reach the server. Check that `opencode pair --remote` is still running.')
  }

  const body = await response.text()
  if (!response.ok) throw new ApiError(response.status, body)

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('The server did not return a pairing token.')
  }

  const token = (parsed as { token?: unknown })?.token
  if (typeof token !== 'string' || !token) {
    throw new Error('The server did not return a pairing token.')
  }

  return token
}

export type RequestOptions = {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

export class OpenCodeApi {
  readonly connection: Connection

  constructor(connection: Connection) {
    this.connection = connection
  }

  private get headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      Authorization: authorizationHeader(this.connection),
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, signal } = options

    let response: Response
    try {
      response = await fetch(joinUrl(this.connection.baseUrl, path), {
        method,
        headers: {
          ...this.headers,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new Error('Could not reach the OpenCode server.')
    }

    const text = await response.text()
    if (!response.ok) throw new ApiError(response.status, text)
    if (!text) return undefined as T

    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error('The server returned an unexpected response.')
    }
  }

  info(): Promise<ServerInfo> {
    return this.request<ServerInfo>('/api/info')
  }

  async listSessions(): Promise<SessionInfo[]> {
    const response = await this.request<SessionsResponse>(
      '/api/session?limit=50&order=desc&parentID=null&archived=false',
    )
    return response.data
  }

  async getSession(sessionID: string): Promise<SessionInfo> {
    const response = await this.request<{ data: SessionInfo }>(
      `/api/session/${encodeURIComponent(sessionID)}`,
    )
    return response.data
  }

  async createSession(input: {
    title?: string
    directory?: string
  }): Promise<SessionInfo> {
    const response = await this.request<{ data: SessionInfo }>('/api/session', {
      method: 'POST',
      body: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.directory ? { location: { directory: input.directory } } : {}),
      },
    })
    return response.data
  }

  deleteSession(sessionID: string): Promise<void> {
    return this.request<void>(`/api/session/${encodeURIComponent(sessionID)}`, {
      method: 'DELETE',
    })
  }

  async listMessages(sessionID: string): Promise<Message[]> {
    // Ask for the newest page, then hand the UI an oldest-first timeline.
    const response = await this.request<SessionMessagesResponse>(
      `/api/session/${encodeURIComponent(sessionID)}/message?limit=200&order=desc`,
    )
    return [...response.data].reverse()
  }

  async sendPrompt(sessionID: string, text: string): Promise<void> {
    await this.request(`/api/session/${encodeURIComponent(sessionID)}/prompt`, {
      method: 'POST',
      body: { text },
    })
  }

  interrupt(sessionID: string): Promise<unknown> {
    return this.request(`/api/session/${encodeURIComponent(sessionID)}/interrupt`, {
      method: 'POST',
    })
  }

  async listPermissions(sessionID: string): Promise<PermissionRequest[]> {
    const response = await this.request<{ data: PermissionRequest[] }>(
      `/api/session/${encodeURIComponent(sessionID)}/permission`,
    )
    return response.data
  }

  async listAllPermissions(): Promise<PermissionRequest[]> {
    const response = await this.request<PermissionListResponse>('/api/permission/request')
    return response.data
  }

  replyPermission(
    sessionID: string,
    requestID: string,
    decision: PermissionDecision,
  ): Promise<void> {
    return this.request<void>(
      `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}/reply`,
      { method: 'POST', body: { decision } },
    )
  }

  listProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/project')
  }

  openEventStream(signal: AbortSignal): Promise<Response> {
    return fetch(joinUrl(this.connection.baseUrl, '/api/event'), {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Authorization: authorizationHeader(this.connection),
      },
      signal,
      cache: 'no-store',
    })
  }
}

export async function probeConnection(
  baseUrl: string,
  token: string,
  modes: AuthMode[] = ['password', 'bearer'],
): Promise<{ connection: Connection; info: ServerInfo }> {
  let lastError: unknown = null

  for (const auth of modes) {
    const connection: Connection = {
      baseUrl,
      token,
      auth,
      label: hostLabel(baseUrl),
      createdAt: Date.now(),
    }

    try {
      const info = await new OpenCodeApi(connection).info()
      return { connection: { ...connection, label: info.hostname || connection.label }, info }
    } catch (error) {
      lastError = error
      if (error instanceof ApiError && error.status === 401) continue
      throw error
    }
  }

  if (lastError instanceof ApiError && lastError.status === 401) {
    throw new Error('The server rejected that password or pairing token.')
  }
  throw lastError instanceof Error ? lastError : new Error('Could not connect to the server.')
}

export { authorizationHeader }
