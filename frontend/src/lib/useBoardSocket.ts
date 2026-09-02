import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const WS_URL = API_URL.replace(/^http/, 'ws')

type SocketState = 'connecting' | 'live' | 'reconnecting' | 'closed'

export type Peer = { user_id: string; name: string | null; avatar_url: string | null }

const HEARTBEAT_MS = 10_000
const MAX_BACKOFF_MS = 30_000
const CLOSE_FORBIDDEN = 4403

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BoardEvent = Record<string, any> & { type: string }

export function useBoardSocket(boardId: string | undefined) {
  const { getToken } = useAuth()
  const [state, setState] = useState<SocketState>('connecting')
  const [peers, setPeers] = useState<Peer[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef(new Set<(event: BoardEvent) => void>())

  useEffect(() => {
    if (!boardId) return
    let cancelled = false
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    async function open() {
      // Browser WebSockets cannot set headers; the short-lived (~60s) Clerk
      // token rides the query string and only authenticates the handshake.
      // getToken() is called fresh on every (re)connect for that reason.
      const token = await getToken()
      if (!token || cancelled) return
      const socket = new WebSocket(
        `${WS_URL}/ws/boards/${boardId}?token=${token}`,
      )
      socketRef.current = socket

      socket.onopen = () => {
        if (cancelled) return
        attempt = 0
        setState('live')
      }

      socket.onclose = (event) => {
        if (cancelled) return
        socketRef.current = null
        // Forbidden is final — retrying a revoked membership just spams.
        if (event.code === CLOSE_FORBIDDEN) {
          setState('closed')
          return
        }
        // Everything else (server restart, network drop, expired token)
        // retries with exponential backoff + jitter so a restarting server
        // is not stampeded by every client at once.
        setState('reconnecting')
        const backoff = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt)
        attempt += 1
        retryTimer = setTimeout(open, backoff * (0.5 + Math.random() / 2))
      }

      socket.onmessage = (raw) => {
        const event: BoardEvent = JSON.parse(raw.data)
        if (event.type === 'connected') setPeers(event.presence ?? [])
        if (event.type === 'board.joined')
          setPeers((current) =>
            current.some((peer) => peer.user_id === event.user_id)
              ? current
              : current.concat({
                  user_id: event.user_id,
                  name: event.name ?? null,
                  avatar_url: event.avatar_url ?? null,
                }),
          )
        if (event.type === 'board.left')
          setPeers((current) =>
            current.filter((peer) => peer.user_id !== event.user_id),
          )
        handlersRef.current.forEach((handler) => handler(event))
      }

      // The TTL is the failure detector: stop beating and we expire in 20s.
      const heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: 'presence.ping' }))
      }, HEARTBEAT_MS)
      socket.addEventListener('close', () => clearInterval(heartbeat))
    }

    void open()
    // StrictMode mounts twice in dev: this cleanup is what prevents a
    // duplicate zombie connection from the first mount.
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [boardId, getToken])

  const send = useCallback((event: BoardEvent) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event))
    }
  }, [])

  const subscribe = useCallback((handler: (event: BoardEvent) => void) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  return { state, peers, send, subscribe }
}
