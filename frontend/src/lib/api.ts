// VITE_* vars are inlined into the browser bundle — never put secrets here.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type User = {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

async function apiFetch<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`)
  }
  return response.json()
}

export function getHealth() {
  return apiFetch<{ status: string }>('/health')
}

export function getMe(token: string | null) {
  return apiFetch<User>('/api/me', token)
}
