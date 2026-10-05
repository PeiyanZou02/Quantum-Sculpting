import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App.tsx'
import { useStore } from './store'
import { usePresent } from './present'

// development only: the stores, for checking the interface from the browser console
if (import.meta.env.DEV) Object.assign(window, { __qs: { useStore, usePresent } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
