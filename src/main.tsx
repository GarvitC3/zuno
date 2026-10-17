import '@fontsource-variable/fredoka'
import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './state/context'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/layout.css'
import './styles/pages.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
