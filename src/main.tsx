import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import type { Cloud } from './cloud'
import { cloudConfigFromEnv } from './cloud/config'
import { openRepository, requestPersistentStorage } from './data'
import { AppProvider } from './ui/AppProvider'

const { repo, store, persistent } = openRepository()
void requestPersistentStorage()

const root = createRoot(document.getElementById('root')!)
const renderApp = (cloud?: Cloud) =>
  root.render(
    <StrictMode>
      <AppProvider repo={repo} persistent={persistent} cloud={cloud}>
        <App />
      </AppProvider>
    </StrictMode>,
  )

renderApp()
// The cloud library is big: load it after the app is on screen.
if (cloudConfigFromEnv()) void import('./cloud').then(({ createCloud }) => renderApp(createCloud(store)))
