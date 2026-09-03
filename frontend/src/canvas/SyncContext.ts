import { createContext, useContext } from 'react'
import type * as Y from 'yjs'

/** Lets deeply nested node components (e.g. EditableLabel) write to the
 *  shared CRDT document without threading props through React Flow's
 *  nodeTypes. null while disconnected or read-only: edits stay local. */
export const BoardDocContext = createContext<Y.Doc | null>(null)

export const useBoardDoc = () => useContext(BoardDocContext)
