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
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useRef } from 'react'
import { CATALOG, type NodeKind } from './catalog'
import { nodeTypes } from './nodeTypes'
import { Palette } from './Palette'

let nodeCounter = 0
const nextNodeId = () => `n${Date.now().toString(36)}${(nodeCounter++).toString(36)}`

/** Annotations render as their own node type; components share one. */
function reactFlowTypeFor(kind: NodeKind) {
  return CATALOG[kind].category === 'annotation' ? kind : 'architecture'
}

type CanvasProps = {
  initialNodes: Node[]
  initialEdges: Edge[]
  onGraphChange?: (nodes: Node[], edges: Edge[]) => void
  readOnly?: boolean
}

function Canvas({ initialNodes, initialEdges, onGraphChange, readOnly = false }: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { synchronous: true },
          },
          current,
        ),
      ),
    [setEdges],
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

      setNodes((current) =>
        current.concat({
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
        }),
      )
    },
    [screenToFlowPosition, setNodes],
  )

  useEffect(() => {
    onGraphChange?.(nodes, edges)
  }, [nodes, edges, onGraphChange])

  return (
    <div className="canvas" ref={wrapper}>
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
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
