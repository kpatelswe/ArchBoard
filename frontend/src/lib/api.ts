import type { Edge, Node } from '@xyflow/react'

// VITE_* vars are inlined into the browser bundle — never put secrets here.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type User = {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

export type BoardRole = 'owner' | 'editor' | 'viewer'

export type BoardSummary = {
  id: string
  name: string
  version: number
  created_at: string
  updated_at: string
  role: BoardRole | null
}

export type Board = BoardSummary & {
  current_snapshot: { nodes: Node[]; edges: Edge[] }
}

async function apiFetch<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`)
  }
  return response.json()
}

export const getMe = (token: string | null) => apiFetch<User>('/api/me', token)

export const listBoards = (token: string | null) =>
  apiFetch<BoardSummary[]>('/api/boards', token)

export const getBoard = (token: string | null, id: string) =>
  apiFetch<Board>(`/api/boards/${id}`, token)

/** Mirrors the server's PersistedNode/PersistedEdge: transient React Flow
 *  fields (selected, dragging, measured) are per-viewer, never board state. */
export const canonicalNode = (n: Node) => ({
  id: n.id,
  type: n.type,
  position: n.position,
  data: n.data,
  width: n.width ?? null,
  height: n.height ?? null,
})

export const canonicalEdge = (e: Edge) => ({
  id: e.id,
  source: e.source,
  target: e.target,
  sourceHandle: e.sourceHandle ?? null,
  targetHandle: e.targetHandle ?? null,
  data: e.data ?? {},
})

export function canonicalize(nodes: Node[], edges: Edge[]) {
  return { nodes: nodes.map(canonicalNode), edges: edges.map(canonicalEdge) }
}

export class ConflictError extends Error {
  constructor() {
    super('board was modified by someone else')
  }
}

export async function saveSnapshot(
  token: string | null,
  id: string,
  nodes: Node[],
  edges: Edge[],
  version: number,
): Promise<Board> {
  const response = await fetch(`${API_URL}/api/boards/${id}/snapshot`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ snapshot: canonicalize(nodes, edges), version }),
  })
  if (response.status === 409) {
    throw new ConflictError()
  }
  if (!response.ok) throw new Error(`save failed: ${response.status}`)
  return response.json()
}

export const createBoard = (token: string | null, name: string) =>
  apiFetch<Board>('/api/boards', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

export const createInvite = (
  token: string | null,
  boardId: string,
  role: 'editor' | 'viewer',
) =>
  apiFetch<{ token: string; role: string }>(`/api/boards/${boardId}/invites`, token, {
    method: 'POST',
    body: JSON.stringify({ role }),
  })

export const acceptInvite = (token: string | null, inviteToken: string) =>
  apiFetch<Board>('/api/invites/accept', token, {
    method: 'POST',
    body: JSON.stringify({ token: inviteToken }),
  })

export type Finding = {
  rule: string
  severity: 'error' | 'warning' | 'suggestion'
  message: string
  why: string
  mitigation: string
  when_its_fine: string
  node_ids: string[]
  edge_ids: string[]
}

export type NodeLoad = {
  node_id: string
  label: string
  incoming_rps: number
  capacity_rps: number | null
  utilization: number | null
}

export type AnalysisResult = {
  findings: Finding[]
  simulation: {
    traffic_rps: number
    loads: NodeLoad[]
    findings: Finding[]
    headroom: number | null
    bottleneck_id: string | null
  }
}

export const fetchAnalysis = (
  token: string | null,
  id: string,
  trafficRps: number,
) =>
  apiFetch<AnalysisResult>(
    `/api/boards/${id}/analysis?traffic_rps=${trafficRps}`,
    token,
  )
