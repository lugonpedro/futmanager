import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { initAccount } from './store/account.ts'
import { restoreLastGame } from './store/game.ts'

// The career reopens first, so a sync that replaces it can reload it afterwards.
void restoreLastGame().then(initAccount)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
