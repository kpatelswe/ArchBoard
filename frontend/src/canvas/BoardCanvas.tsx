import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
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
import { canonicalEdge, canonicalNode } from '../lib/api'
import type { BoardEvent } from '../lib/useBoardSocket'
import { CATALOG, type NodeKind } from './catalog'
import { nodeTypes } from './nodeTypes'
import { Palette } from './Palette'
import { SyncContext } from './SyncContext'

const nextNodeId = () => crypto.randomUUID()
const POSITION_SEND_MS = 40

/** Annotations render as their own node type; components share one. */
function reactFlowTypeFor(kind: NodeKind) {
  return CATALOG[kind].category === 'annotation' ? kind : 'architecture'
}

type CanvasProps = {
  initialNodes: Node[]
  initialEdges: Edge[]
  onGraphChange?: (nodes: Node[], edges: Edge[]) => void
  readOnly?: boolean
  sendEvent?: (event: BoardEvent) => void
  subscribe?: (handler: (event: BoardEvent) => void) => () => void
}

function Canvas({
  initialNodes,
  initialEdges,
  onGraphChange,
  readOnly = false,
  sendEvent,
  subscribe,
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const { screenToFlowPosition } = useReactFlow()
  const lastPositionSend = useRef(new Map<string, number>())

  const emit = useCallback(
    (event: BoardEvent) => {
      if (!readOnly) sendEvent?.(event)
    },
    [readOnly, sendEvent],
  )

  /** Translate React Flow's local change objects into protocol events. */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          // Throttle mid-drag traffic; always send the drag-end position.
          const now = performance.now()
          const last = lastPositionSend.current.get(change.id) ?? 0
          if (change.dragging && now - last < POSITION_SEND_MS) continue
          lastPositionSend.current.set(change.id, now)
          emit({
            type: 'node.updated',
            node_id: change.id,
            position: change.position,
          })
        } else if (change.type === 'remove') {
          emit({ type: 'node.deleted', node_id: change.id })
        } else if (change.type === 'dimensions' && change.dimensions && !change.resizing) {
          emit({
            type: 'node.updated',
            node_id: change.id,
            width: change.dimensions.width,
            height: change.dimensions.height,
          })
        }
      }
    },
    [onNodesChange, emit],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes)
      for (const change of changes) {
        if (change.type === 'remove') {
          emit({ type: 'edge.deleted', edge_id: change.id })
        }
      }
    },
    [onEdgesChange, emit],
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
        if (created) emit({ type: 'edge.created', edge: canonicalEdge(created) })
        return next
      }),
    [setEdges, emit],
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
      emit({ type: 'node.created', node: canonicalNode(node) })
    },
    [screenToFlowPosition, setNodes, emit],
  )

  // Apply remote collaborators' events to local state.
  useEffect(() => {
    if (!subscribe) return
    return subscribe((event) => {
      switch (event.type) {
        case 'node.created':
          setNodes((current) =>
            current.some((node) => node.id === event.node.id)
              ? current
              : current.concat(event.node),
          )
          break
        case 'node.updated':
          setNodes((current) =>
            current.map((node) =>
              node.id === event.node_id
                ? {
                    ...node,
                    position: event.position ?? node.position,
                    data: event.data ?? node.data,
                    width: event.width ?? node.width,
                    height: event.height ?? node.height,
                  }
                : node,
            ),
          )
          break
        case 'node.deleted':
          setNodes((current) =>
            applyNodeChanges([{ type: 'remove', id: event.node_id }], current),
          )
          setEdges((current) =>
            current.filter(
              (edge) =>
                edge.source !== event.node_id && edge.target !== event.node_id,
            ),
          )
          break
        case 'edge.created':
          setEdges((current) =>
            current.some((edge) => edge.id === event.edge.id)
              ? current
              : current.concat(event.edge),
          )
          break
        case 'edge.updated':
          setEdges((current) =>
            current.map((edge) =>
              edge.id === event.edge_id ? { ...edge, data: event.data } : edge,
            ),
          )
          break
        case 'edge.deleted':
          setEdges((current) =>
            applyEdgeChanges([{ type: 'remove', id: event.edge_id }], current),
          )
          break
      }
    })
  }, [subscribe, setNodes, setEdges])

  useEffect(() => {
    onGraphChange?.(nodes, edges)
  }, [nodes, edges, onGraphChange])

  return (
    <SyncContext.Provider value={emit}>
      <div className="canvas">
        {!readOnly && <Palette />}
        <div
          className="canvas__surface"
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
          </ReactFlow>
        </div>
      </div>
    </SyncContext.Provider>
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
