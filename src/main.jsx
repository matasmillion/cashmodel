import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// If Clerk is configured, wrap with ClerkProvider. Otherwise run as guest mode.
const Root = clerkKey
  ? (
    <ClerkProvider publishableKey={clerkKey}>
      <App />
    </ClerkProvider>
  )
  : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {Root}
  </StrictMode>,
)
