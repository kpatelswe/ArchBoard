import { createContext, useContext } from 'react'
import type * as Y from 'yjs'
import type { BoardEvent } from '../lib/useBoardSocket'

/** Lets deeply nested node components (e.g. EditableLabel) write to the
 *  shared CRDT document without threading props through React Flow's
 *  nodeTypes. null while disconnected or read-only: edits stay local. */
export const BoardDocContext = createContext<Y.Doc | null>(null)

export const useBoardDoc = () => useContext(BoardDocContext)

/** Ephemeral JSON traffic (cursors, editing awareness) from nested nodes. */
export const EmitContext = createContext<(event: BoardEvent) => void>(() => {})

export const useEmit = () => useContext(EmitContext)

/** node_id -> who is editing it right now. Awareness, not enforcement: the
 *  CRDT merges concurrent edits; this only drives the highlight. */
export type EditingMap = Record<string, { user_id: string; name: string | null }>

export const EditingContext = createContext<EditingMap>({})

export const useRemoteEditing = () => useContext(EditingContext)
