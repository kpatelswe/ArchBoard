import { createContext, useContext } from 'react'
import type { BoardEvent } from '../lib/useBoardSocket'

/** Lets deeply nested node components (e.g. EditableLabel) emit realtime
 *  events without threading props through React Flow's nodeTypes. */
export const SyncContext = createContext<(event: BoardEvent) => void>(() => {})

export const useSync = () => useContext(SyncContext)

/** node_id -> display name of whoever is editing it right now (advisory). */
export type LockMap = Record<string, { user_id: string; name: string | null }>

export const LocksContext = createContext<LockMap>({})

export const useLocks = () => useContext(LocksContext)
