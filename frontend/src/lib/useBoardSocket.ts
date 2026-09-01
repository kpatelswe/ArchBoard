import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const WS_URL = API_URL.replace(/^http/, 'ws')

type SocketState = 'connecting' | 'live' | 'closed'

export function useBoardSocket(boardId: string | undefined) {
  const { getToken } = useAuth()
  const [state, setState] = useState<SocketState>('connecting')
  const [peerCount, setPeerCount] = useState(0)

  useEffect(() => {
    if (!boardId) return
    let socket: WebSocket | null = null
    let cancelled = false

    async function open() {
      const token = await getToken()
      const response = await fetch(`${API_URL}/api/boards/${boardId}/ws-ticket`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok || cancelled) return
      const { ticket } = await response.json()

      socket = new WebSocket(`${WS_URL}/ws/boards/${boardId}?ticket=${ticket}`)
      socket.onopen = () => !cancelled && setState('live')
      socket.onclose = () => !cancelled && setState('closed')
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if ('peer_count' in message) setPeerCount(message.peer_count)
      }
    }

    void open()
    // StrictMode mounts twice in dev: this cleanup is what prevents a
    // duplicate zombie connection from the first mount.
    return () => {
      cancelled = true
      socket?.close()
    }
  }, [boardId, getToken])

  return { state, peerCount }
}
