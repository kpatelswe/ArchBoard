import { Show, SignInButton, UserButton } from '@clerk/react'
import { Link, Route, Routes } from 'react-router-dom'
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

function HeroSchematic() {
  return (
    <svg className="hero__fig" viewBox="0 0 460 96" aria-hidden="true">
      <g className="fig__box">
        <rect x="2" y="30" width="88" height="36" rx="3" />
        <text x="46" y="52">CLIENT</text>
      </g>
      <path className="fig__wire" d="M90 48h40" />
      <g className="fig__box">
        <rect x="132" y="30" width="72" height="36" rx="3" />
        <text x="168" y="52">LB</text>
      </g>
      <path className="fig__wire" d="M204 48h40" />
      <g className="fig__box fig__box--signal">
        <rect x="246" y="30" width="82" height="36" rx="3" />
        <text x="287" y="52">API</text>
      </g>
      <path className="fig__wire" d="M328 48c20 0 20-28 40-28" />
      <path className="fig__wire" d="M328 48c20 0 20 28 40 28" />
      <g className="fig__box">
        <rect x="370" y="2" width="88" height="36" rx="3" />
        <text x="414" y="24">CACHE</text>
      </g>
      <g className="fig__box">
        <rect x="370" y="58" width="88" height="36" rx="3" />
        <text x="414" y="80">DB</text>
      </g>
    </svg>
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
          <HeroSchematic />
          <p className="hero__caption">fig. 1 — drawn together, live</p>
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
