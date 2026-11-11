import * as SecureStore from 'expo-secure-store'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState, Platform } from 'react-native'

import { OpenCodeApi, normalizeBaseUrl, parsePairLink, probeConnection, redeemPairLink } from './api'
import { EventStream, type EventStatus } from './events'
import type { Connection, V2Event } from './types'

const STORAGE_KEY = 'opencode.connection.v1'

async function readStoredConnection(): Promise<Connection | null> {
  try {
    let raw: string | null = null
    if (Platform.OS === 'web') {
      raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    } else {
      raw = await SecureStore.getItemAsync(STORAGE_KEY)
    }
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<Connection>
    if (!parsed.baseUrl || !parsed.token) return null

    return {
      baseUrl: parsed.baseUrl,
      token: parsed.token,
      auth: parsed.auth === 'bearer' ? 'bearer' : 'password',
      label: parsed.label ?? parsed.baseUrl,
      createdAt: parsed.createdAt ?? Date.now(),
    }
  } catch {
    return null
  }
}

async function writeStoredConnection(connection: Connection | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return
      if (connection) localStorage.setItem(STORAGE_KEY, JSON.stringify(connection))
      else localStorage.removeItem(STORAGE_KEY)
      return
    }

    if (connection) await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(connection))
    else await SecureStore.deleteItemAsync(STORAGE_KEY)
  } catch {
    // Storing credentials is best-effort; the in-memory connection still works.
  }
}

type ConnectionContextValue = {
  loading: boolean
  connection: Connection | null
  api: OpenCodeApi | null
  eventStatus: EventStatus
  /** Increments every time the event stream (re)connects. */
  resyncToken: number
  pairWithLink: (link: string) => Promise<Connection>
  connectManual: (url: string, password: string) => Promise<Connection>
  disconnect: () => Promise<void>
  subscribe: (listener: (event: V2Event) => void) => () => void
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [eventStatus, setEventStatus] = useState<EventStatus>('idle')
  const [resyncToken, setResyncToken] = useState(0)

  const [api, setApi] = useState<OpenCodeApi | null>(null)
  const streamRef = useRef<EventStream | null>(null)
  const listenersRef = useRef<Set<(event: V2Event) => void>>(new Set())
  const mountedRef = useRef(true)

  const startStream = useCallback((api: OpenCodeApi) => {
    streamRef.current?.stop()

    const stream = new EventStream(api)
    stream.onStatus((status) => {
      if (mountedRef.current) setEventStatus(status)
    })
    stream.onOpen(() => {
      if (mountedRef.current) setResyncToken((value) => value + 1)
    })
    stream.subscribe((event) => {
      for (const listener of listenersRef.current) {
        try {
          listener(event)
        } catch {
          // A screen listener should never break the shared stream.
        }
      }
    })

    streamRef.current = stream
    stream.start()
  }, [])

  const applyConnection = useCallback(
    async (next: Connection) => {
      const nextApi = new OpenCodeApi(next)
      await writeStoredConnection(next)
      if (!mountedRef.current) return
      setApi(nextApi)
      setConnection(next)
      startStream(nextApi)
    },
    [startStream],
  )

  useEffect(() => {
    mountedRef.current = true

    void (async () => {
      const stored = await readStoredConnection()
      if (!mountedRef.current) return

      if (stored) {
        const storedApi = new OpenCodeApi(stored)
        setApi(storedApi)
        setConnection(stored)
        startStream(storedApi)
      }

      setLoading(false)
    })()

    return () => {
      mountedRef.current = false
      streamRef.current?.stop()
      streamRef.current = null
    }
  }, [startStream])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !mountedRef.current) return
      const stream = streamRef.current
      if (!stream) return

      // Coming back from the background: drop a half-dead stream so it
      // reconnects immediately, otherwise just refresh the visible screens.
      if (stream.getStatus() !== 'live') {
        stream.stop()
        stream.start()
        return
      }

      setResyncToken((value) => value + 1)
    })

    return () => subscription.remove()
  }, [])

  const pairWithLink = useCallback(
    async (link: string) => {
      const { baseUrl, code, token } = parsePairLink(link)
      let connectionInfo: Awaited<ReturnType<typeof probeConnection>> | undefined
      if (code) {
        // Pairing link with code: redeem to obtain token first
        const redeemedToken = await redeemPairLink(baseUrl, code)
        connectionInfo = await probeConnection(baseUrl, redeemedToken, ['password', 'bearer'])
      } else {
        // Direct connection URL: token may be supplied or empty
        connectionInfo = await probeConnection(baseUrl, token ?? '', ['password', 'bearer'])
      }
      const { connection: next } = connectionInfo
      await applyConnection(next)
      return next
    },
    [applyConnection],
  )

  const connectManual = useCallback(
    async (url: string, password: string) => {
      const baseUrl = normalizeBaseUrl(url)
      if (!password.trim()) throw new Error('Enter the server password.')

      const { connection: next } = await probeConnection(baseUrl, password.trim(), [
        'password',
        'bearer',
      ])
      await applyConnection(next)
      return next
    },
    [applyConnection],
  )

  const disconnect = useCallback(async () => {
    streamRef.current?.stop()
    streamRef.current = null
    setApi(null)
    await writeStoredConnection(null)
    if (!mountedRef.current) return
    setConnection(null)
    setEventStatus('idle')
    setResyncToken(0)
  }, [])

  const subscribe = useCallback((listener: (event: V2Event) => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const value = useMemo<ConnectionContextValue>(
    () => ({
      loading,
      connection,
      api,
      eventStatus,
      resyncToken,
      pairWithLink,
      connectManual,
      disconnect,
      subscribe,
    }),
    [
      loading,
      connection,
      api,
      eventStatus,
      resyncToken,
      pairWithLink,
      connectManual,
      disconnect,
      subscribe,
    ],
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection(): ConnectionContextValue {
  const value = useContext(ConnectionContext)
  if (!value) throw new Error('useConnection must be used inside ConnectionProvider')
  return value
}
