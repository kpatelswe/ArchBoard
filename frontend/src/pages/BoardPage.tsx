import { useAuth } from '@clerk/react'
import type { Edge, Node } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BoardCanvas } from '../canvas/BoardCanvas'
import { useBoardSocket, type BoardEvent } from '../lib/useBoardSocket'
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
  const { subscribe } = socket
  const socketLive = socket.state === 'live'

  const version = useRef(0)
  const socketLiveRef = useRef(false)

  // Every (re)connect greeting carries the server's authoritative state.
  // Adopting it IS the reconnect recovery (PRD §23): replace stale local
  // state, bump the resync counter so the canvas remounts fresh.
  const [resyncCount, setResyncCount] = useState(0)
  useEffect(() => {
    return subscribe((event: BoardEvent) => {
      if (event.type === 'connected' && event.snapshot) {
        version.current = event.version
        setBoard((current) =>
          current
            ? { ...current, current_snapshot: event.snapshot, version: event.version }
            : current,
        )
        setResyncCount((count) => count + 1)
      }
    })
  }, [subscribe])
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
      if (socketLiveRef.current) return

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

  useEffect(() => {
    socketLiveRef.current = socketLive
  }, [socketLive])

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
        <div className="board__bar-group">
          <Link to="/" className="board__back" title="All boards">
            ←
          </Link>
          <strong className="board__name">{board.name}</strong>
          <span className={`pill pill--${board.role ?? 'viewer'}`}>
            {board.role}
          </span>
        </div>

        <div className="board__bar-group">
          <span className="board__peers">
            {socket.peers.map((peer) =>
              peer.avatar_url ? (
                <img
                  key={peer.user_id}
                  className="peer-chip"
                  src={peer.avatar_url}
                  alt={peer.name ?? 'collaborator'}
                  title={peer.name ?? undefined}
                />
              ) : (
                <span
                  key={peer.user_id}
                  className="peer-chip peer-chip--initial"
                  title={peer.name ?? undefined}
                >
                  {(peer.name ?? '?').slice(0, 1)}
                </span>
              ),
            )}
          </span>
          <span className={`board__live board__live--${socket.state}`}>
            {socket.state === 'live'
              ? `${socket.peers.length} online`
              : socket.state === 'reconnecting'
                ? 'reconnecting…'
                : socket.state}
          </span>
          <span className={`board__save save--${saveState}`}>
            {readOnly
              ? 'view only'
              : socketLive
                ? 'synced'
                : saveState === 'conflict'
                  ? 'reload to continue'
                  : saveState}
          </span>
          {board.role === 'owner' && (
            <span className="board__share">
              {shareMessage ?? (
                <>
                  <button
                    className="btn btn--small"
                    type="button"
                    onClick={() => onShare('viewer')}
                  >
                    Share view
                  </button>
                  <button
                    className="btn btn--small btn--primary"
                    type="button"
                    onClick={() => onShare('editor')}
                  >
                    Share edit
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      </div>
      <BoardCanvas
        key={`sync-${resyncCount}`}
        initialNodes={board.current_snapshot.nodes ?? []}
        initialEdges={board.current_snapshot.edges ?? []}
        onGraphChange={readOnly ? undefined : onGraphChange}
        readOnly={readOnly}
        sendEvent={socket.send}
        subscribe={subscribe}
        peers={socket.peers}
      />
    </section>
  )
}
