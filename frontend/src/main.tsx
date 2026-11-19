import { ClerkProvider } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { LearningPage } from './learn/LearningPage.tsx'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function BoardApp() {
  if (!publishableKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in frontend/.env')
  }
  return <ClerkProvider publishableKey={publishableKey}><App /></ClerkProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/learn" element={<LearningPage />} />
        <Route path="*" element={<BoardApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
