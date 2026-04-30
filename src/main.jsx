import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// Side-effect import: registers window.plmMigrationStatus() for ad-hoc
// inspection of how many PLM rows are still on the legacy base64 shape.
import './utils/plmMigrationStatus'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
