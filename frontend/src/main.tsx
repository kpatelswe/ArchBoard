import { ClerkProvider } from '@clerk/react'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

const LearningPage = lazy(() => import('./learn/LearningPage.tsx').then(module => ({ default: module.LearningPage })))

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
        <Route path="/learn" element={<Suspense fallback={<p role="status" style={{ padding: 40 }}>Loading lessons…</p>}><LearningPage /></Suspense>} />
        <Route path="*" element={<BoardApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
