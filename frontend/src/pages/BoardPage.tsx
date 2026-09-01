import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BoardCanvas } from '../canvas/BoardCanvas'
import { getBoard, type Board } from '../lib/api'

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { getToken } = useAuth()
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!boardId) return
    let cancelled = false
    getToken()
      .then((token) => getBoard(token, boardId))
      .then((result) => !cancelled && setBoard(result))
      .catch((err) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [boardId, getToken])

  if (error) return <p className="status status--unreachable">{error}</p>
  if (!board) return <p className="status status--checking">Loading board…</p>

  return (
    <section className="board">
      <div className="board__bar">
        <Link to="/">← Boards</Link>
        <strong>{board.name}</strong>
        <span className="board__meta">unsaved — persistence lands in C5</span>
      </div>
      <BoardCanvas
        initialNodes={board.current_snapshot.nodes ?? []}
        initialEdges={board.current_snapshot.edges ?? []}
      />
    </section>
  )
}
