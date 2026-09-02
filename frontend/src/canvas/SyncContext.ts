import { createContext, useContext } from 'react'
import type { BoardEvent } from '../lib/useBoardSocket'

/** Lets deeply nested node components (e.g. EditableLabel) emit realtime
 *  events without threading props through React Flow's nodeTypes. */
export const SyncContext = createContext<(event: BoardEvent) => void>(() => {})

export const useSync = () => useContext(SyncContext)
