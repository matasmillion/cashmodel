import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// Side-effect import: registers window.plmMigrationStatus() for ad-hoc
// inspection of how many PLM rows are still on the legacy base64 shape.
import './utils/plmMigrationStatus'
// Side-effect import: registers window.plmBackup() so a backup can be
// triggered from the browser console (also surfaced as a UI button).
import './utils/plmBackup'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
