import { Handle, NodeResizer, NodeToolbar, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { setNodeFields } from '../lib/boardDoc'
import { CATALOG, type ArchNodeData } from './catalog'
import { EditableLabel } from './EditableLabel'
import { KindIcon } from './icons'
import { useBoardDoc, useRemoteEditing } from './SyncContext'

/** "<name> is editing this" chip + outline, driven by awareness events. */
function RemoteEditorTag({ id }: { id: string }) {
  const editor = useRemoteEditing()[id]
  if (!editor) return null
  return <span className="editor-tag">✎ {editor.name ?? 'someone'}</span>
}

type Props = NodeProps & { data: ArchNodeData }

function technologyOf(data: ArchNodeData): string {
  return typeof data.metadata?.technology === 'string' ? data.metadata.technology : ''
}

/** Implementation tag (metadata.technology). While the node is selected, a
 *  chip menu floats below it; click a chip to set, click the active chip to
 *  clear. The provider also tunes the simulator's capacity assumption. */
function TechnologyMenu({ id, data, selected }: Props) {
  const { updateNodeData } = useReactFlow()
  const doc = useBoardDoc()
  const entry = CATALOG[data.kind]
  const tech = technologyOf(data)

  if (!entry.technologies) return null

  // A remote peer may have set a value outside our suggestion list.
  const options = tech && !entry.technologies.includes(tech)
    ? [tech, ...entry.technologies]
    : entry.technologies

  function setTechnology(value: string) {
    const metadata = { ...data.metadata }
    if (value) metadata.technology = value
    else delete metadata.technology
    updateNodeData(id, { metadata })
    if (doc) setNodeFields(doc, id, { data: { ...data, metadata } })
  }

  return (
    <NodeToolbar isVisible={selected} position={Position.Bottom} offset={16} className="tech-menu">
      <span className="tech-menu__label">Provider</span>
      {options.map((name) => (
        <button
          key={name}
          type="button"
          className={`tech-menu__chip ${name === tech ? 'is-active' : ''}`}
          onClick={() => setTechnology(name === tech ? '' : name)}
        >
          {name}
        </button>
      ))}
    </NodeToolbar>
  )
}

/** Every architecture component renders through this one node type. */
export function ArchitectureNode(props: Props) {
  const { id, data, selected } = props
  const entry = CATALOG[data.kind]
  const tech = technologyOf(data)

  return (
    <div
      className={`node node--arch ${selected ? 'is-selected' : ''}`}
      style={{ '--kind': entry.accent } as React.CSSProperties}
    >
      <RemoteEditorTag id={id} />
      <TechnologyMenu {...props} />
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
          {tech && <span className="node__tech"> · {tech}</span>}
        </span>
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function StickyNoteNode({ id, data, selected }: Props) {
  return (
    <div className={`node node--sticky ${selected ? 'is-selected' : ''}`}>
      <RemoteEditorTag id={id} />
      <NodeResizer minWidth={120} minHeight={90} isVisible={selected} />
      <EditableLabel id={id} value={data.label} multiline placeholder="Note…" />
    </div>
  )
}

export function TextNode({ id, data, selected }: Props) {
  return (
    <div className={`node node--text ${selected ? 'is-selected' : ''}`}>
      <RemoteEditorTag id={id} />
      <EditableLabel id={id} value={data.label} placeholder="Text" />
    </div>
  )
}

export function ShapeNode({ id, data, selected }: Props) {
  return (
    <div className={`node node--shape ${selected ? 'is-selected' : ''}`}>
      <RemoteEditorTag id={id} />
      <NodeResizer minWidth={80} minHeight={60} isVisible={selected} />
      <span className="node__shape-label">
        <EditableLabel id={id} value={data.label} placeholder="Label" />
      </span>
    </div>
  )
}
