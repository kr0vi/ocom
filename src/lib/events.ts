import { ApiError, OpenCodeApi } from './api'
import type { V2Event } from './types'

export type EventStatus = 'idle' | 'connecting' | 'live' | 'retrying'

type EventListener = (event: V2Event) => void
type StatusListener = (status: EventStatus) => void
type OpenListener = () => void

/**
 * Subscribes to `GET /api/event` (SSE) and reconnects with exponential backoff.
 * OpenCode event streams are live-only, so consumers should refetch state after
 * every reconnect. `onOpen` fires on each successful connection for that reason.
 */
export class EventStream {
  private api: OpenCodeApi
  private eventListeners = new Set<EventListener>()
  private statusListeners = new Set<StatusListener>()
  private openListeners = new Set<OpenListener>()

  private controller: AbortController | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private attempt = 0
  private stopped = true
  private status: EventStatus = 'idle'

  constructor(api: OpenCodeApi) {
    this.api = api
  }

  setApi(api: OpenCodeApi) {
    this.api = api
  }

  getStatus(): EventStatus {
    return this.status
  }

  subscribe(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  onOpen(listener: OpenListener): () => void {
    this.openListeners.add(listener)
    return () => {
      this.openListeners.delete(listener)
    }
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.attempt = 0
    void this.connect()
  }

  stop() {
    this.stopped = true
    this.generation += 1
    this.attempt = 0

    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }

    this.controller?.abort()
    this.controller = null
    this.setStatus('idle')
  }

  private setStatus(status: EventStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of this.statusListeners) {
      try {
        listener(status)
      } catch {
        // A broken listener must not stop the stream.
      }
    }
  }

  private emit(event: V2Event) {
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch {
        // A broken listener must not stop the stream.
      }
    }
  }

  private scheduleRetry() {
    if (this.stopped) return

    this.attempt = Math.min(this.attempt + 1, 6)
    const delay = Math.min(1000 * 2 ** (this.attempt - 1), 15_000)
    this.setStatus('retrying')

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }

  private async connect() {
    if (this.stopped || this.controller) return

    const generation = ++this.generation
    const controller = new AbortController()
    this.controller = controller
    this.setStatus(this.attempt === 0 ? 'connecting' : 'retrying')

    try {
      const response = await this.api.openEventStream(controller.signal)

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new ApiError(response.status, body)
      }

      if (!response.body) throw new Error('The event stream has no body.')

      if (this.stopped || generation !== this.generation) return

      this.setStatus('live')
      for (const listener of this.openListeners) {
        try {
          listener()
        } catch {
          // Ignore listener failures.
        }
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')

        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          this.dispatch(frame)
          boundary = buffer.indexOf('\n\n')
        }
      }

      if (this.stopped || generation !== this.generation) return
      this.scheduleRetry()
    } catch (error) {
      if (this.stopped || generation !== this.generation) return
      if (error instanceof Error && error.name === 'AbortError') return
      this.scheduleRetry()
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  private dispatch(frame: string) {
    if (!frame.trim()) return

    let eventName: string | undefined
    const dataLines: string[] = []

    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)

      if (field === 'event') eventName = value
      else if (field === 'data') dataLines.push(value)
    }

    if (!dataLines.length) return

    const raw = dataLines.join('\n')
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }

    // Some servers double-encode the JSON payload as a string.
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        // Keep the raw string below.
      }
    }

    let event: V2Event | null = null

    if (payload && typeof payload === 'object' && typeof (payload as V2Event).type === 'string') {
      event = payload as V2Event
    } else if (eventName) {
      event = {
        id: '',
        created: Date.now(),
        type: eventName,
        data: payload,
      }
    }

    if (!event) return

    // Any traffic means the connection is healthy again.
    this.attempt = 0
    this.emit(event)
  }
}
