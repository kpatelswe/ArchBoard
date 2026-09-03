import { useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { setNodeFields } from '../lib/boardDoc'
import { useBoardDoc, useEmit } from './SyncContext'

const AWARENESS_REFRESH_MS = 2_000

/** Double-click to edit; Escape or blur commits. Enter commits single-line
 *  fields. No editing locks: concurrent edits to different fields of a node
 *  merge via the CRDT, and a label collision resolves last-writer-wins.
 *  While editing, awareness pings paint a highlight on other screens. */
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
  const doc = useBoardDoc()
  const emit = useEmit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    ref.current?.focus()
    emit({ type: 'editing.started', node_id: id })
    const refresh = setInterval(
      () => emit({ type: 'editing.started', node_id: id }),
      AWARENESS_REFRESH_MS,
    )
    return () => {
      clearInterval(refresh)
      emit({ type: 'editing.stopped', node_id: id })
    }
  }, [editing, id, emit])

  function commit() {
    setEditing(false)
    updateNodeData(id, { label: draft })
    const data = getNode(id)?.data
    if (data && doc) setNodeFields(doc, id, { data: { ...data, label: draft } })
  }

  if (!editing) {
    return (
      <span
        className="editable"
        onDoubleClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || <span className="editable__placeholder">{placeholder}</span>}
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
