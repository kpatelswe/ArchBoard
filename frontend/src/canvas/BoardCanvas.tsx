import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import type * as Y from 'yjs'
import {
  flowFromDoc,
  LOCAL_ORIGIN,
  reconcileNodes,
  removeEdge,
  removeNode,
  setNodeFields,
  upsertEdge,
  upsertNode,
} from '../lib/boardDoc'
import type { BoardEvent, Peer } from '../lib/useBoardSocket'
import { RemoteCursors } from './RemoteCursors'
import { CATALOG, type NodeKind } from './catalog'
import { createCanvasNode, duplicateNodes } from './canvasActions'
import { nodeTypes } from './nodeTypes'
import { Palette } from './Palette'
import { BoardDocContext, EditingContext, EmitContext, type EditingMap } from './SyncContext'

const POSITION_SEND_MS = 40

type CanvasProps = {
  doc: Y.Doc | null
  docReady: boolean
  readOnly?: boolean
  sendEvent?: (event: BoardEvent) => void
  subscribe?: (handler: (event: BoardEvent) => void) => () => void
  peers?: Peer[]
  /** Elements implicated by the selected finding — outlined on canvas. */
  highlightNodes?: string[]
  highlightEdges?: string[]
}

function Canvas({
  doc,
  docReady,
  readOnly = false,
  sendEvent,
  subscribe,
  peers = [],
  highlightNodes = [],
  highlightEdges = [],
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [remoteEditing, setRemoteEditing] = useState<EditingMap>({})
  const editingExpiry = useRef(new Map<string, number>())
  const { screenToFlowPosition, getNodes } = useReactFlow()
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const lastPositionSend = useRef(new Map<string, number>())
  const lastCursorSend = useRef(0)

  // Editing awareness: highlight nodes someone else is editing. Ephemeral
  // relay only — each mark expires locally unless refreshed, so a crashed
  // editor's highlight fades on its own instead of sticking forever.
  useEffect(() => {
    if (!subscribe) return
    const unsubscribe = subscribe((event) => {
      if (event.type === 'editing.started') {
        editingExpiry.current.set(event.node_id, performance.now() + 5_000)
        setRemoteEditing((current) => ({
          ...current,
          [event.node_id]: { user_id: event.user_id, name: event.name ?? null },
        }))
      } else if (event.type === 'editing.stopped') {
        editingExpiry.current.delete(event.node_id)
        setRemoteEditing(({ [event.node_id]: _gone, ...rest }) => rest)
      } else if (event.type === 'board.left') {
        setRemoteEditing((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([nodeId, editor]) => {
              if (editor.user_id !== event.user_id) return true
              editingExpiry.current.delete(nodeId)
              return false
            }),
          ),
        )
      }
    })
    const prune = setInterval(() => {
      const now = performance.now()
      const expired = [...editingExpiry.current].filter(([, at]) => at < now)
      if (expired.length === 0) return
      for (const [nodeId] of expired) editingExpiry.current.delete(nodeId)
      setRemoteEditing((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([nodeId]) => !expired.some(([gone]) => gone === nodeId),
          ),
        ),
      )
    }, 1_000)
    return () => {
      unsubscribe()
      clearInterval(prune)
    }
  }, [subscribe])

  // Viewers never write to the shared document; their replica is read-only.
  const writable = !readOnly && docReady ? doc : null

  // The document is the source of truth: every non-local transaction
  // (a collaborator's edit, the server's greeting merge) re-derives the
  // React Flow arrays, preserving per-viewer UI state like selection.
  useEffect(() => {
    if (!doc || !docReady) return
    const syncFromDoc = () => {
      const derived = flowFromDoc(doc)
      setNodes((current) => reconcileNodes(derived.nodes, current))
      setEdges((current) =>
        derived.edges.map((edge) => {
          const previous = current.find((existing) => existing.id === edge.id)
          return previous ? { ...edge, selected: previous.selected } : edge
        }),
      )
    }
    syncFromDoc()
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin !== LOCAL_ORIGIN) syncFromDoc()
    }
    doc.on('update', onUpdate)
    return () => doc.off('update', onUpdate)
  }, [doc, docReady, setNodes, setEdges])

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!sendEvent) return
      const now = performance.now()
      if (now - lastCursorSend.current < 40) return
      lastCursorSend.current = now
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      sendEvent({ type: 'cursor.moved', x: point.x, y: point.y })
    },
    [sendEvent, screenToFlowPosition],
  )

  /** Translate React Flow's local change objects into document writes. */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)
      if (!writable) return
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          // Throttle mid-drag traffic; always write the drag-end position.
          const now = performance.now()
          const last = lastPositionSend.current.get(change.id) ?? 0
          if (change.dragging && now - last < POSITION_SEND_MS) continue
          lastPositionSend.current.set(change.id, now)
          setNodeFields(writable, change.id, { position: change.position })
        } else if (change.type === 'remove') {
          removeNode(writable, change.id)
        } else if (change.type === 'dimensions' && change.dimensions && !change.resizing) {
          setNodeFields(writable, change.id, {
            width: change.dimensions.width,
            height: change.dimensions.height,
          })
        }
      }
    },
    [onNodesChange, writable],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes)
      if (!writable) return
      for (const change of changes) {
        if (change.type === 'remove') removeEdge(writable, change.id)
      }
    },
    [onEdgesChange, writable],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!writable) return
      setEdges((current) => {
        const next = addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { synchronous: true },
          },
          current,
        )
        const created = next.find(
          (edge) => !current.some((existing) => existing.id === edge.id),
        )
        if (created && writable) upsertEdge(writable, created)
        return next
      })
    },
    [setEdges, writable],
  )

  const addNode = useCallback((kind: NodeKind, position?: { x: number; y: number }) => {
    if (!writable || !surfaceRef.current) return
    const bounds = surfaceRef.current.getBoundingClientRect()
    const point = position ?? screenToFlowPosition({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    const node = createCanvasNode(kind, point)
    setNodes((current) => current.concat(node))
    upsertNode(writable, node)
  }, [screenToFlowPosition, setNodes, writable])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (!writable) return
      const kind = event.dataTransfer.getData(
        'application/archboard-kind',
      ) as NodeKind
      if (!kind || !CATALOG[kind]) return

      // Screen coordinates must be converted, or the node lands in the wrong
      // place whenever the canvas is panned or zoomed.
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      addNode(kind, position)
    },
    [screenToFlowPosition, addNode, writable],
  )

  const emit = useCallback(
    (event: BoardEvent) => {
      if (!readOnly) sendEvent?.(event)
    },
    [readOnly, sendEvent],
  )

  return (
    <BoardDocContext.Provider value={writable}>
      <EmitContext.Provider value={emit}>
      <EditingContext.Provider value={remoteEditing}>
      <div className="canvas" onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
        if (event.key === '?') {
          event.preventDefault()
          setShowShortcuts((current) => !current)
        }
        if (event.key === 'Escape') setShowShortcuts(false)
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault()
          if (!writable) return
          const copies = duplicateNodes(writable, getNodes())
          if (copies.length) setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...copies])
        }
      }}>
        {!readOnly && <Palette onAdd={addNode} disabled={!writable} />}
        <div
          className="canvas__surface"
          ref={surfaceRef}
          tabIndex={0}
          aria-label="System design canvas"
          onPointerMove={onPointerMove}
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
        >
          <ReactFlow
            nodes={
              highlightNodes.length
                ? nodes.map((node) =>
                    highlightNodes.includes(node.id)
                      ? { ...node, className: 'is-flagged' }
                      : node,
                  )
                : nodes
            }
            edges={edges.map((edge) => ({
              ...edge,
              className: highlightEdges.includes(edge.id) ? 'is-flagged' : undefined,
              markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: highlightEdges.includes(edge.id) ? '#c92a2a' : '#87978f' },
            }))}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={16} />
            <Controls showInteractive={!readOnly} />
            <MiniMap pannable zoomable style={{ width: 140, height: 90 }} />
            {subscribe && <RemoteCursors subscribe={subscribe} peers={peers} />}
          </ReactFlow>
          {writable && nodes.length === 0 && (
            <div className="canvas__onboarding">
              <span className="canvas__eyebrow">YOUR NEXT BIG IDEA STARTS HERE</span>
              <h2>Give your system a shape.</h2>
              <p>Drag a component onto the canvas,<br />or click one in the library to start.</p>
              <div className="canvas__steps"><span>01 Add components</span><span>02 Connect the dots</span><span>03 Explore the tradeoffs</span></div>
            </div>
          )}
          <div className="canvas__help">
            {showShortcuts && <div className="shortcuts" id="canvas-shortcuts" role="region" aria-label="Keyboard shortcuts">
              <h2>At your fingertips</h2>
              <p><span>Pan the canvas</span><kbd>Drag background</kbd></p>
              <p><span>Zoom in / out</span><kbd>Scroll / pinch</kbd></p>
              {!readOnly && <>
                <p><span>Duplicate selected</span><kbd>⌘ / Ctrl + D</kbd></p>
                <p><span>Remove selected</span><kbd>Delete / ⌫</kbd></p>
                <p><span>Edit a label</span><kbd>Double-click</kbd></p>
              </>}
              <p><span>Toggle this guide</span><kbd>?</kbd></p>
            </div>}
            <button className="canvas__help-button" type="button" aria-label="Keyboard shortcuts" aria-expanded={showShortcuts} aria-controls="canvas-shortcuts" onClick={() => setShowShortcuts((current) => !current)}>?</button>
          </div>
        </div>
      </div>
      </EditingContext.Provider>
      </EmitContext.Provider>
    </BoardDocContext.Provider>
  )
}

export function BoardCanvas(props: CanvasProps) {
  // useReactFlow() only works inside a provider.
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
