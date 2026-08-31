import { Show, SignInButton, UserButton, useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { getMe, type User } from './lib/api'
import './App.css'

function BackendIdentity() {
  const { getToken } = useAuth()
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getToken()
      .then((token) => getMe(token))
      .then((result) => !cancelled && setUser(result))
      .catch((err) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [getToken])

  if (error) return <p className="status status--unreachable">{error}</p>
  if (!user) return <p className="status status--checking">Loading…</p>

  return (
    <div className="card">
      <p>The backend resolved your Clerk session to a local user row:</p>
      <dl>
        <dt>Local user id</dt>
        <dd>
          <code>{user.id}</code>
        </dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Name</dt>
        <dd>{user.name ?? '—'}</dd>
      </dl>
    </div>
  )
}

function App() {
  return (
    <main className="shell">
      <header className="bar">
        <div>
          <h1>ArchBoard</h1>
          <p className="tagline">Collaborative system design board</p>
        </div>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="primary" type="button">
            Sign in
          </button>
        </SignInButton>
      </Show>

      <Show when="signed-in">
        <BackendIdentity />
      </Show>
    </main>
  )
}

export default App
