import { Show, SignInButton, UserButton } from '@clerk/react'
import { Link, Route, Routes } from 'react-router-dom'
import { CATALOG, type NodeKind } from './canvas/catalog'
import { KindIcon } from './canvas/icons'
import { BoardPage } from './pages/BoardPage'
import { BoardsPage } from './pages/BoardsPage'
import { InvitePage } from './pages/InvitePage'
import './App.css'

function Wordmark() {
  return (
    <span className="wordmark">
      <svg className="wordmark__glyph" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="1.5" y="1.5" width="7" height="5" rx="1" />
        <rect x="11.5" y="7.5" width="7" height="5" rx="1" />
        <rect x="1.5" y="13.5" width="7" height="5" rx="1" />
        <path d="M8.5 4h4.5v3.5M8.5 16h4.5v-3.5" fill="none" />
      </svg>
      ARCH<span className="wordmark__dot">/</span>BOARD
    </span>
  )
}

type FigNode = {
  kind: NodeKind
  label: string
  tech?: string
  x: number
  y: number
  selected?: boolean
}

const FIG_NODES: FigNode[] = [
  { kind: 'client', label: 'Browser', x: 16, y: 126 },
  { kind: 'load_balancer', label: 'Edge LB', tech: 'NGINX', x: 216, y: 126 },
  { kind: 'api_service', label: 'Core API', tech: 'FastAPI', x: 416, y: 126, selected: true },
  { kind: 'cache', label: 'Hot cache', tech: 'Redis', x: 600, y: 40 },
  { kind: 'database', label: 'Primary', tech: 'Postgres', x: 600, y: 212 },
]

/** The hero is a real board: the product's own node cards, wired up, with
 *  collaborators' cursors on it. */
function HeroBoard() {
  return (
    <div className="hero__board" aria-hidden="true">
      <div className="fig-bar">
        <span>boards / interview-prep</span>
        <span className="fig-bar__live">● 3 online · synced</span>
      </div>
      <div className="fig-stage">
        <svg className="fig-wires" viewBox="0 0 780 300">
          <path d="M176 149h40" />
          <path d="M376 149h40" />
          <path d="M576 149c16 0 12-86 24-86" />
          <path d="M576 149c16 0 12 86 24 86" />
        </svg>
        {FIG_NODES.map((node) => (
          <div
            key={node.kind}
            className={`fig-node ${node.selected ? 'is-selected' : ''}`}
            style={{ left: node.x, top: node.y, '--kind': CATALOG[node.kind].accent } as React.CSSProperties}
          >
            <span className="fig-node__icon">
              <KindIcon kind={node.kind} />
            </span>
            <span className="fig-node__body">
              <span className="fig-node__label">{node.label}</span>
              <span className="fig-node__kind">
                {CATALOG[node.kind].label}
                {node.tech && ` · ${node.tech}`}
              </span>
            </span>
          </div>
        ))}
        <div className="fig-cursor" style={{ left: 556, top: 96, '--c': '#0d9488' } as React.CSSProperties}>
          <svg viewBox="0 0 20 20"><path d="M3 1l7 16 2.5-6.5L19 8z" /></svg>
          <span>Maya</span>
        </div>
        <div className="fig-cursor" style={{ left: 236, top: 196, '--c': '#7c3aed' } as React.CSSProperties}>
          <svg viewBox="0 0 20 20"><path d="M3 1l7 16 2.5-6.5L19 8z" /></svg>
          <span>Sam</span>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <div className="app">
      <header className="nav">
        <Link to="/" className="nav__brand">
          <Wordmark />
        </Link>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

      <Show when="signed-out">
        <main className="hero">
          <h1 className="hero__title">The whiteboard for system design</h1>
          <p className="hero__tagline">
            Sketch architectures with your team in real time, then let the
            board tell you where they break.
          </p>
          <SignInButton mode="modal">
            <button className="btn btn--primary btn--lg" type="button">
              Continue with Google
            </button>
          </SignInButton>
          <p className="hero__features">
            realtime sync · presence cursors · invite links
          </p>
          <HeroBoard />
          <p className="hero__caption">fig. 1 — every design interview, ever</p>
        </main>
      </Show>

      <Show when="signed-in">
        <Routes>
          <Route path="/" element={<BoardsPage />} />
          <Route path="/boards/:boardId" element={<BoardPage />} />
          <Route path="/invite/:inviteToken" element={<InvitePage />} />
        </Routes>
      </Show>
    </div>
  )
}

export default App
