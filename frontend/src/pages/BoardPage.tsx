import { useAuth } from '@clerk/react'
import type { Edge, Node } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BoardCanvas } from '../canvas/BoardCanvas'
import { useBoardSocket } from '../lib/useBoardSocket'
import {
  canonicalize,
  ConflictError,
  createInvite,
  getBoard,
  saveSnapshot,
  type Board,
} from '../lib/api'

type SaveState = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error'

const DEBOUNCE_MS = 1200

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { getToken } = useAuth()
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const socket = useBoardSocket(boardId)

  const version = useRef(0)
  const lastSaved = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!boardId) return
    let cancelled = false
    getToken()
      .then((token) => getBoard(token, boardId))
      .then((result) => {
        if (cancelled) return
        version.current = result.version
        lastSaved.current = JSON.stringify(
          canonicalize(
            result.current_snapshot.nodes ?? [],
            result.current_snapshot.edges ?? [],
          ),
        )
        setBoard(result)
      })
      .catch((err) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [boardId, getToken])

  const onGraphChange = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (!boardId) return

      // Compare the canonical form so pure selection/drag state never
      // triggers a write.
      const next = JSON.stringify(canonicalize(nodes, edges))
      if (next === lastSaved.current) return

      setSaveState('unsaved')
      clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        setSaveState('saving')
        try {
          const saved = await saveSnapshot(
            await getToken(),
            boardId,
            nodes,
            edges,
            version.current,
          )
          version.current = saved.version
          lastSaved.current = next
          setSaveState('saved')
        } catch (err) {
          setSaveState(err instanceof ConflictError ? 'conflict' : 'error')
        }
      }, DEBOUNCE_MS)
    },
    [boardId, getToken],
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  async function onShare(role: 'editor' | 'viewer') {
    if (!boardId) return
    const invite = await createInvite(await getToken(), boardId, role)
    const url = `${window.location.origin}/invite/${invite.token}`
    await navigator.clipboard.writeText(url)
    setShareMessage(`${role} link copied`)
    setTimeout(() => setShareMessage(null), 2500)
  }

  if (error) return <p className="status status--unreachable">{error}</p>
  if (!board) return <p className="status status--checking">Loading board…</p>

  const readOnly = board.role === 'viewer'

  return (
    <section className="board">
      <div className="board__bar">
        <Link to="/">← Boards</Link>
        <strong>{board.name}</strong>
        <span className="board__role">{board.role}</span>
        <span className={`board__live board__live--${socket.state}`}>
          {socket.state === 'live' ? `● ${socket.peerCount} online` : socket.state}
        </span>
        {board.role === 'owner' && (
          <span className="board__share">
            {shareMessage ?? (
              <>
                Share:{' '}
                <button type="button" onClick={() => onShare('editor')}>
                  editor
                </button>{' '}
                <button type="button" onClick={() => onShare('viewer')}>
                  viewer
                </button>
              </>
            )}
          </span>
        )}
        <span className={`board__meta save--${saveState}`}>
          {readOnly
            ? 'view only'
            : saveState === 'conflict'
              ? 'Someone else saved — reload to continue'
              : saveState}
        </span>
      </div>
      <BoardCanvas
        initialNodes={board.current_snapshot.nodes ?? []}
        initialEdges={board.current_snapshot.edges ?? []}
        onGraphChange={readOnly ? undefined : onGraphChange}
        readOnly={readOnly}
      />
    </section>
  )
}
