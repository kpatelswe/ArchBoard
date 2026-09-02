import { ViewportPortal } from '@xyflow/react'
import { useEffect, useState } from 'react'
import type { Peer } from '../lib/useBoardSocket'
import type { BoardEvent } from '../lib/useBoardSocket'

type Cursor = { x: number; y: number; seenAt: number }

const STALE_MS = 5_000

/** Deterministic color per user so cursors are stable across clients. */
function colorFor(userId: string): string {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `hsl(${((hash % 360) + 360) % 360} 70% 45%)`
}

export function RemoteCursors({
  subscribe,
  peers,
}: {
  subscribe: (handler: (event: BoardEvent) => void) => () => void
  peers: Peer[]
}) {
  const [cursors, setCursors] = useState<Record<string, Cursor>>({})

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'cursor.moved') {
        setCursors((current) => ({
          ...current,
          [event.user_id]: { x: event.x, y: event.y, seenAt: Date.now() },
        }))
      } else if (event.type === 'board.left') {
        setCursors((current) => {
          const next = { ...current }
          delete next[event.user_id]
          return next
        })
      }
    })
  }, [subscribe])

  // A cursor whose owner stopped moving shouldn't haunt the canvas forever.
  useEffect(() => {
    const sweep = setInterval(() => {
      setCursors((current) => {
        const now = Date.now()
        const alive = Object.entries(current).filter(
          ([, cursor]) => now - cursor.seenAt < STALE_MS,
        )
        return alive.length === Object.keys(current).length
          ? current
          : Object.fromEntries(alive)
      })
    }, 1_000)
    return () => clearInterval(sweep)
  }, [])

  const names = new Map(peers.map((peer) => [peer.user_id, peer.name]))

  return (
    <ViewportPortal>
      {Object.entries(cursors).map(([userId, cursor]) => (
        <div
          key={userId}
          className="cursor"
          style={{
            transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            color: colorFor(userId),
          }}
        >
          <svg width="14" height="18" viewBox="0 0 14 18">
            <path d="M0 0 L14 10 L7 11 L4 18 Z" fill="currentColor" />
          </svg>
          <span className="cursor__name" style={{ background: colorFor(userId) }}>
            {names.get(userId) ?? 'guest'}
          </span>
        </div>
      ))}
    </ViewportPortal>
  )
}
