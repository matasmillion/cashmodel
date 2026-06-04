import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// Local-first storage engine — must hydrate from IndexedDB BEFORE the app
// renders so every store's synchronous readLocal() returns warm data.
import { hydrate as hydrateLocalDb } from './utils/localDb'
// Side-effect import: registers window.plmMigrationStatus() for ad-hoc
// inspection of how many PLM rows are still on the legacy base64 shape.
import './utils/plmMigrationStatus'
// Side-effect import: registers window.plmBackup() so a backup can be
// triggered from the browser console (also surfaced as a UI button).
import './utils/plmBackup'
// Side-effect import: boots the offline sync outbox (flushes queued edits to
// the cloud on reconnect / interval / at startup).
import './utils/startSync'
// Side-effect: capture the PWA install prompt early (it can fire before React
// mounts) so the in-app Install button can trigger one-click install.
import './utils/pwaInstall'

// Hydrate the local store (fast local-disk read, not network), then mount.
// hydrate() never rejects — it falls back to localStorage internally — so the
// app always boots even if IndexedDB is unavailable.
hydrateLocalDb().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
