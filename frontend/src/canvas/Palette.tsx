import { ANNOTATION_KINDS, CATALOG, COMPONENT_KINDS, type NodeKind } from './catalog'

function PaletteItem({ kind }: { kind: NodeKind }) {
  const entry = CATALOG[kind]

  return (
    <button
      type="button"
      className="palette__item"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/archboard-kind', kind)
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span
        className="palette__icon"
        style={{ '--kind': entry.accent } as React.CSSProperties}
      >
        {entry.icon}
      </span>
      {entry.label}
    </button>
  )
}

export function Palette() {
  return (
    <aside className="palette">
      <h2 className="palette__heading">Components</h2>
      {COMPONENT_KINDS.map((kind) => (
        <PaletteItem key={kind} kind={kind} />
      ))}

      <h2 className="palette__heading">Annotate</h2>
      {ANNOTATION_KINDS.map((kind) => (
        <PaletteItem key={kind} kind={kind} />
      ))}

      <p className="palette__hint">
        Drag onto the canvas. Drag between handles to connect. Select and press
        Delete to remove.
      </p>
    </aside>
  )
}
