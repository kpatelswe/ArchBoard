import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { CATALOG, type ArchNodeData } from './catalog'

type Props = NodeProps & { data: ArchNodeData }

/** Every architecture component renders through this one node type. */
export function ArchitectureNode({ data, selected }: Props) {
  const entry = CATALOG[data.kind]

  return (
    <div
      className={`node node--arch ${selected ? 'is-selected' : ''}`}
      style={{ borderColor: entry.accent }}
    >
      <Handle type="target" position={Position.Top} />
      <span className="node__icon" style={{ background: entry.accent }}>
        {entry.icon}
      </span>
      <span className="node__body">
        <span className="node__label">{data.label}</span>
        <span className="node__kind">{entry.label}</span>
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function StickyNoteNode({ data, selected }: Props) {
  return (
    <div className={`node node--sticky ${selected ? 'is-selected' : ''}`}>
      <NodeResizer minWidth={120} minHeight={90} isVisible={selected} />
      {data.label}
    </div>
  )
}

export function TextNode({ data, selected }: Props) {
  return (
    <div className={`node node--text ${selected ? 'is-selected' : ''}`}>
      {data.label}
    </div>
  )
}

export function ShapeNode({ data, selected }: Props) {
  return (
    <div className={`node node--shape ${selected ? 'is-selected' : ''}`}>
      <NodeResizer minWidth={80} minHeight={60} isVisible={selected} />
      <span className="node__shape-label">{data.label}</span>
    </div>
  )
}
