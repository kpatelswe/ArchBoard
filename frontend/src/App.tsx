import { useEffect, useState } from 'react'
import { getHealth } from './lib/api'
import './App.css'

type BackendStatus = 'checking' | 'ok' | 'unreachable'

function App() {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    getHealth()
      .then(() => setStatus('ok'))
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <main className="shell">
      <h1>ArchBoard</h1>
      <p className="tagline">Collaborative system design board</p>
      <p className={`status status--${status}`}>Backend: {status}</p>
    </main>
  )
}

export default App
