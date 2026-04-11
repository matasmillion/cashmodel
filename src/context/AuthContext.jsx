// Auth is now handled by Clerk — this file re-exports Clerk hooks
// for compatibility with existing components
export { useUser as useAuth } from '@clerk/clerk-react';
