import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createBoard, listBoards, type BoardSummary } from '../lib/api'

const timeAgo = (iso: string) => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function BoardsPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getToken()
      .then((token) => listBoards(token))
      .then((result) => !cancelled && setBoards(result))
      .catch((err) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [getToken])

  async function onCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    try {
      const board = await createBoard(await getToken(), name.trim())
      navigate(`/boards/${board.id}`)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1>Boards</h1>
        <form className="create" onSubmit={onCreate}>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New board name…"
            aria-label="New board name"
          />
          <button className="btn btn--primary" type="submit">
            Create
          </button>
        </form>
      </div>

      {error && <p className="notice notice--error">{error}</p>}
      {boards === null && <p className="notice">Loading…</p>}

      {boards?.length === 0 && (
        <div className="empty">
          <span className="empty__mark">▦</span>
          <p>No boards yet — name one above to start sketching.</p>
        </div>
      )}

      <div className="board-grid">
        {boards?.map((board) => (
          <Link key={board.id} to={`/boards/${board.id}`} className="board-card">
            <span className="board-card__name">{board.name}</span>
            <span className="board-card__meta">
              <span className={`pill pill--${board.role ?? 'viewer'}`}>
                {board.role}
              </span>
              edited {timeAgo(board.updated_at)}
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}
