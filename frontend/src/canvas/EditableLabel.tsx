import { useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { useLocks, useSync } from './SyncContext'

const LOCK_REFRESH_MS = 2_000

/** Double-click to edit; Escape or blur commits. Enter commits single-line
 *  fields. While editing, an advisory lock is held and refreshed so other
 *  clients see "someone is editing this" instead of colliding. */
export function EditableLabel({
  id,
  value,
  multiline = false,
  placeholder = 'Type…',
}: {
  id: string
  value: string
  multiline?: boolean
  placeholder?: string
}) {
  const { updateNodeData, getNode } = useReactFlow()
  const emit = useSync()
  const locks = useLocks()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  const heldByOther = !editing && id in locks

  useEffect(() => {
    if (!editing) return
    ref.current?.focus()
    emit({ type: 'lock.acquire', node_id: id })
    const refresh = setInterval(
      () => emit({ type: 'lock.acquire', node_id: id }),
      LOCK_REFRESH_MS,
    )
    return () => {
      clearInterval(refresh)
      emit({ type: 'lock.release', node_id: id })
    }
  }, [editing, id, emit])

  function commit() {
    setEditing(false)
    updateNodeData(id, { label: draft })
    const data = getNode(id)?.data
    if (data) emit({ type: 'node.updated', node_id: id, data: { ...data, label: draft } })
  }

  if (!editing) {
    return (
      <span
        className={`editable ${heldByOther ? 'editable--locked' : ''}`}
        title={heldByOther ? `${locks[id].name ?? 'Someone'} is editing…` : undefined}
        onDoubleClick={() => {
          if (heldByOther) return
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || <span className="editable__placeholder">{placeholder}</span>}
        {heldByOther && <span className="editable__lock">✏ {locks[id].name ?? '…'}</span>}
      </span>
    )
  }

  return (
    <textarea
      ref={ref}
      className="editable__input"
      value={draft}
      rows={multiline ? 3 : 1}
      // Stop React Flow from treating typing as canvas shortcuts (Backspace
      // would otherwise delete the node being edited).
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape' || (event.key === 'Enter' && !multiline)) {
          event.preventDefault()
          commit()
        }
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  )
}
