import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { openRepository, requestPersistentStorage } from './data'
import { AppProvider } from './ui/AppProvider'

const { repo, persistent } = openRepository()
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider repo={repo} persistent={persistent}>
      <App />
    </AppProvider>
  </StrictMode>,
)
