import type { Edge, Node } from '@xyflow/react'

// VITE_* vars are inlined into the browser bundle — never put secrets here.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type User = {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

export type BoardSummary = {
  id: string
  name: string
  version: number
  created_at: string
  updated_at: string
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

export const createBoard = (token: string | null, name: string) =>
  apiFetch<Board>('/api/boards', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
