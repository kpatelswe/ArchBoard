import { Show, SignInButton, UserButton } from '@clerk/react'
import { Link, Route, Routes } from 'react-router-dom'
import { BoardPage } from './pages/BoardPage'
import { BoardsPage } from './pages/BoardsPage'
import { InvitePage } from './pages/InvitePage'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="nav">
        <Link to="/" className="nav__brand">
          <span className="nav__mark">▦</span> ArchBoard
        </Link>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

      <Show when="signed-out">
        <main className="hero">
          <span className="hero__mark">▦</span>
          <h1 className="hero__title">ArchBoard</h1>
          <p className="hero__tagline">
            Sketch system architectures together, in real time.
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
