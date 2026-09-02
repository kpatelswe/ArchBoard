import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const WS_URL = API_URL.replace(/^http/, 'ws')

type SocketState = 'connecting' | 'live' | 'closed'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BoardEvent = Record<string, any> & { type: string }

export function useBoardSocket(boardId: string | undefined) {
  const { getToken } = useAuth()
  const [state, setState] = useState<SocketState>('connecting')
  const [peerCount, setPeerCount] = useState(0)
  const socketRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef(new Set<(event: BoardEvent) => void>())

  useEffect(() => {
    if (!boardId) return
    let cancelled = false

    async function open() {
      const token = await getToken()
      const response = await fetch(`${API_URL}/api/boards/${boardId}/ws-ticket`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok || cancelled) return
      const { ticket } = await response.json()

      const socket = new WebSocket(
        `${WS_URL}/ws/boards/${boardId}?ticket=${ticket}`,
      )
      socketRef.current = socket
      socket.onopen = () => !cancelled && setState('live')
      socket.onclose = () => !cancelled && setState('closed')
      socket.onmessage = (raw) => {
        const event: BoardEvent = JSON.parse(raw.data)
        if ('peer_count' in event) setPeerCount(event.peer_count)
        handlersRef.current.forEach((handler) => handler(event))
      }
    }

    void open()
    // StrictMode mounts twice in dev: this cleanup is what prevents a
    // duplicate zombie connection from the first mount.
    return () => {
      cancelled = true
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

  return { state, peerCount, send, subscribe }
}
