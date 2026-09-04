import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BoardCanvas } from '../canvas/BoardCanvas'
import { FindingsPanel } from '../canvas/FindingsPanel'
import { useBoardSocket } from '../lib/useBoardSocket'
import {
  createInvite,
  fetchAnalysis,
  getBoard,
  type AnalysisResult,
  type Board,
} from '../lib/api'

const ANALYSIS_DEBOUNCE_MS = 1500

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { getToken } = useAuth()
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [traffic, setTraffic] = useState(100)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [highlight, setHighlight] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  })
  const socket = useBoardSocket(boardId)
  const socketLive = socket.state === 'live'

  // The linter runs like an editor's: re-analyze ~1.5s after the last board
  // change (the doc's update events are the trigger), plus once on join and
  // whenever the traffic assumption changes. Each run is a few ms of server
  // work against the live CRDT state.
  const { doc, docReady } = socket
  useEffect(() => {
    if (!boardId || !doc || !docReady) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      try {
        const result = await fetchAnalysis(await getToken(), boardId, traffic)
        if (!cancelled) setAnalysis(result)
      } catch {
        // transient (expired token mid-refresh, reconnect); next edit retries
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(run, ANALYSIS_DEBOUNCE_MS)
    }
    void run()
    doc.on('update', schedule)
    return () => {
      cancelled = true
      clearTimeout(timer)
      doc.off('update', schedule)
    }
  }, [boardId, doc, docReady, traffic, getToken])

  // REST fetch covers the board's metadata (name, role). The graph itself
  // arrives over the socket as the CRDT document: there is no snapshot
  // adoption and no remount on reconnect — the server's state MERGES into
  // the local replica, and unsent local edits merge back the other way.
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
          <label className="board__traffic">
            traffic
            <input
              type="number"
              min={1}
              value={traffic}
              onChange={(event) =>
                setTraffic(Math.max(1, Number(event.target.value) || 1))
              }
            />
            rps
          </label>
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
          <span className="board__save">
            {readOnly ? 'view only' : socketLive ? 'synced' : 'offline'}
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
      <div className="board__body">
        <BoardCanvas
          doc={socket.doc}
          docReady={socket.docReady}
          readOnly={readOnly}
          sendEvent={socket.send}
          subscribe={socket.subscribe}
          peers={socket.peers}
          highlightNodes={highlight.nodes}
          highlightEdges={highlight.edges}
        />
        <FindingsPanel
          analysis={analysis}
          onHighlight={(nodes, edges) => setHighlight({ nodes, edges })}
        />
      </div>
    </section>
  )
}
