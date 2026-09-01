import { Show, SignInButton, UserButton } from '@clerk/react'
import { Link, Route, Routes } from 'react-router-dom'
import { BoardPage } from './pages/BoardPage'
import { BoardsPage } from './pages/BoardsPage'
import './App.css'

function App() {
  return (
    <main className="shell">
      <header className="bar">
        <div>
          <h1>
            <Link to="/">ArchBoard</Link>
          </h1>
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
        <Routes>
          <Route path="/" element={<BoardsPage />} />
          <Route path="/boards/:boardId" element={<BoardPage />} />
        </Routes>
      </Show>
    </main>
  )
}

export default App
