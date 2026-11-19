import { useState } from 'react'
import { CATALOG, type NodeKind } from './catalog'
import { KindIcon } from './icons'
import { matchesSearch, PALETTE_GROUPS } from './paletteGroups'

function PaletteItem({ kind, onAdd, disabled }: { kind: NodeKind; onAdd: (kind: NodeKind) => void; disabled: boolean }) {
  const entry = CATALOG[kind]

  return (
    <button
      type="button"
      className="palette__item"
      draggable={!disabled}
      disabled={disabled}
      onClick={() => onAdd(kind)}
      title={`Add ${entry.label} · click or drag`}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/archboard-kind', kind)
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span
        className="palette__icon"
        style={{ '--kind': entry.accent } as React.CSSProperties}
      >
        <KindIcon kind={kind} />
      </span>
      {entry.label}
    </button>
  )
}

export function Palette({ onAdd, disabled = false }: { onAdd: (kind: NodeKind) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('')
  const groups = PALETTE_GROUPS.map((group) => ({ ...group, kinds: group.kinds.filter((kind) => matchesSearch(kind, query)) }))
  return (
    <aside className="palette">
      <div className="palette__title">Component library <span>16</span></div>
      <input className="input palette__search" type="search" aria-label="Search components" placeholder="Search components…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {groups.map((group) => group.kinds.length > 0 && (
        <section key={group.label} className="palette__group">
          <h2 className="palette__heading">{group.label} <span>{group.kinds.length}</span></h2>
          {group.kinds.map((kind) => <PaletteItem key={kind} kind={kind} onAdd={onAdd} disabled={disabled} />)}
        </section>
      ))}
      {!groups.some((group) => group.kinds.length) && <p className="palette__hint" role="status">No components match “{query}”. Try a name or technology.</p>}
      <p className="palette__hint">
        Click to add at center, or drag onto the canvas. Connect the dots to map your data flow.
      </p>
    </aside>
  )
}
