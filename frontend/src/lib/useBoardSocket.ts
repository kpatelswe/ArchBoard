import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { base64ToBytes, LOCAL_ORIGIN } from './boardDoc'

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

  // One CRDT replica per board, outliving reconnects: a reconnect MERGES the
  // server's state instead of replacing local state, so edits made while
  // offline survive in both directions.
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [docReady, setDocReady] = useState(false)
  const docRef = useRef<Y.Doc | null>(null)

  useEffect(() => {
    if (!boardId) return
    const nextDoc = new Y.Doc()
    docRef.current = nextDoc
    setDoc(nextDoc)
    setDocReady(false)
    // Local transactions go straight to the wire as binary updates.
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== LOCAL_ORIGIN) return
      const socket = socketRef.current
      // Copy into a fresh exact-length buffer: yjs may hand out a subarray
      // view, and TS wants a plain ArrayBuffer-backed BufferSource.
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(new Uint8Array(update))
    }
    nextDoc.on('update', onUpdate)
    return () => {
      nextDoc.off('update', onUpdate)
      nextDoc.destroy()
      docRef.current = null
      setDoc(null)
    }
  }, [boardId])

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
      socket.binaryType = 'arraybuffer'
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
        // Binary frames are collaborators' CRDT updates; merge and rerender.
        if (raw.data instanceof ArrayBuffer) {
          const current = docRef.current
          if (current) Y.applyUpdate(current, new Uint8Array(raw.data), 'remote')
          return
        }
        const event: BoardEvent = JSON.parse(raw.data)
        if (event.type === 'connected') {
          setPeers(event.presence ?? [])
          const current = docRef.current
          if (current && event.ydoc) {
            Y.applyUpdate(current, base64ToBytes(event.ydoc), 'server')
            // Push our full state back: anything drawn while disconnected
            // merges into the server (idempotent for everything it has).
            socket.send(new Uint8Array(Y.encodeStateAsUpdate(current)))
            setDocReady(true)
          }
        }
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

  return { state, peers, send, subscribe, doc, docReady }
}
