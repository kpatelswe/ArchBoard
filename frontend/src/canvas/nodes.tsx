import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { CATALOG, type ArchNodeData } from './catalog'
import { EditableLabel } from './EditableLabel'
import { KindIcon } from './icons'
import { useSync } from './SyncContext'

type Props = NodeProps & { data: ArchNodeData }

/** Cosmetic implementation tag (metadata.technology). Shows as part of the
 *  kind callout; a select while the node is selected. */
function TechnologyPicker({ id, data, selected }: Props) {
  const { updateNodeData } = useReactFlow()
  const emit = useSync()
  const entry = CATALOG[data.kind]
  const tech = typeof data.metadata?.technology === 'string' ? data.metadata.technology : ''

  if (!entry.technologies) return null
  if (!selected) return tech ? <span className="node__tech"> · {tech}</span> : null

  // A remote peer may have set a value outside our suggestion list.
  const options = tech && !entry.technologies.includes(tech)
    ? [tech, ...entry.technologies]
    : entry.technologies

  return (
    <select
      className="node__tech-select nodrag"
      value={tech}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        const value = event.target.value
        const metadata = { ...data.metadata }
        if (value) metadata.technology = value
        else delete metadata.technology
        updateNodeData(id, { metadata })
        emit({ type: 'node.updated', node_id: id, data: { ...data, metadata } })
      }}
    >
      <option value="">· tech?</option>
      {options.map((name) => (
        <option key={name} value={name}>
          · {name}
        </option>
      ))}
    </select>
  )
}

/** Every architecture component renders through this one node type. */
export function ArchitectureNode(props: Props) {
  const { id, data, selected } = props
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
        <span className="node__kind">
          {entry.label}
          <TechnologyPicker {...props} />
        </span>
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
