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
import { useCallback, useEffect, useRef } from 'react'
import type * as Y from 'yjs'
import {
  flowFromDoc,
  LOCAL_ORIGIN,
  removeEdge,
  removeNode,
  setNodeFields,
  upsertEdge,
  upsertNode,
} from '../lib/boardDoc'
import type { BoardEvent, Peer } from '../lib/useBoardSocket'
import { RemoteCursors } from './RemoteCursors'
import { CATALOG, type NodeKind } from './catalog'
import { nodeTypes } from './nodeTypes'
import { Palette } from './Palette'
import { BoardDocContext } from './SyncContext'

const nextNodeId = () => crypto.randomUUID()
const POSITION_SEND_MS = 40

/** Annotations render as their own node type; components share one. */
function reactFlowTypeFor(kind: NodeKind) {
  return CATALOG[kind].category === 'annotation' ? kind : 'architecture'
}

type CanvasProps = {
  doc: Y.Doc | null
  docReady: boolean
  readOnly?: boolean
  sendEvent?: (event: BoardEvent) => void
  subscribe?: (handler: (event: BoardEvent) => void) => () => void
  peers?: Peer[]
}

function Canvas({
  doc,
  docReady,
  readOnly = false,
  sendEvent,
  subscribe,
  peers = [],
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { screenToFlowPosition } = useReactFlow()
  const lastPositionSend = useRef(new Map<string, number>())
  const lastCursorSend = useRef(0)

  // Viewers never write to the shared document; their replica is read-only.
  const writable = !readOnly && docReady ? doc : null

  // The document is the source of truth: every non-local transaction
  // (a collaborator's edit, the server's greeting merge) re-derives the
  // React Flow arrays, preserving per-viewer UI state like selection.
  useEffect(() => {
    if (!doc || !docReady) return
    const syncFromDoc = () => {
      const derived = flowFromDoc(doc)
      setNodes((current) =>
        derived.nodes.map((node) => {
          const previous = current.find((existing) => existing.id === node.id)
          return previous
            ? { ...node, selected: previous.selected, dragging: previous.dragging }
            : node
        }),
      )
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
    (connection: Connection) =>
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
      }),
    [setEdges, writable],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
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
      const node: Node = {
        id: nextNodeId(),
        type: reactFlowTypeFor(kind),
        position,
        // Annotations start empty so the placeholder invites typing;
        // components start with their type name as a sensible default.
        data: {
          kind,
          label:
            CATALOG[kind].category === 'annotation' ? '' : CATALOG[kind].label,
        },
      }
      setNodes((current) => current.concat(node))
      if (writable) upsertNode(writable, node)
    },
    [screenToFlowPosition, setNodes, writable],
  )

  return (
    <BoardDocContext.Provider value={writable}>
      <div className="canvas">
        {!readOnly && <Palette />}
        <div
          className="canvas__surface"
          onPointerMove={onPointerMove}
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
            <Controls />
            <MiniMap pannable zoomable />
            {subscribe && <RemoteCursors subscribe={subscribe} peers={peers} />}
          </ReactFlow>
        </div>
      </div>
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
