import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createBoard, listBoards, type BoardSummary } from '../lib/api'

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
    <section className="stack">
      <form className="row" onSubmit={onCreate}>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New board name"
          aria-label="New board name"
        />
        <button className="primary" type="submit">
          Create board
        </button>
      </form>

      {error && <p className="status status--unreachable">{error}</p>}

      {boards === null && <p className="status status--checking">Loading…</p>}
      {boards?.length === 0 && <p className="status">No boards yet.</p>}

      <ul className="board-list">
        {boards?.map((board) => (
          <li key={board.id}>
            <Link to={`/boards/${board.id}`}>{board.name}</Link>
            <span className="board-list__meta">
              v{board.version} · updated{' '}
              {new Date(board.updated_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
