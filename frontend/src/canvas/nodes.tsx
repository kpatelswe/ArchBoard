import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { CATALOG, type ArchNodeData } from './catalog'
import { EditableLabel } from './EditableLabel'
import { KindIcon } from './icons'

type Props = NodeProps & { data: ArchNodeData }

/** Every architecture component renders through this one node type. */
export function ArchitectureNode({ id, data, selected }: Props) {
  const entry = CATALOG[data.kind]

  return (
    <div
      className={`node node--arch ${selected ? 'is-selected' : ''}`}
      style={{ '--kind': entry.accent } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} />
      <span className="node__icon">
        <KindIcon kind={data.kind} />
      </span>
      <span className="node__body">
        <span className="node__label">
          <EditableLabel id={id} value={data.label} placeholder="Name" />
        </span>
        <span className="node__kind">{entry.label}</span>
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function StickyNoteNode({ id, data, selected }: Props) {
  return (
    <div className={`node node--sticky ${selected ? 'is-selected' : ''}`}>
      <NodeResizer minWidth={120} minHeight={90} isVisible={selected} />
      <EditableLabel id={id} value={data.label} multiline placeholder="Note…" />
    </div>
  )
}

export function TextNode({ id, data, selected }: Props) {
  return (
    <div className={`node node--text ${selected ? 'is-selected' : ''}`}>
      <EditableLabel id={id} value={data.label} placeholder="Text" />
    </div>
  )
}

export function ShapeNode({ id, data, selected }: Props) {
  return (
    <div className={`node node--shape ${selected ? 'is-selected' : ''}`}>
      <NodeResizer minWidth={80} minHeight={60} isVisible={selected} />
      <span className="node__shape-label">
        <EditableLabel id={id} value={data.label} placeholder="Label" />
      </span>
    </div>
  )
}
