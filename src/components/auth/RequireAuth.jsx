// @ts-check
// Client-side route gate — renders children when signed in, otherwise
// kicks the user to /sign-in with the originally-requested URL stashed
// so Clerk can return them after authentication.
//
// This is the SPA equivalent of Next.js's middleware.ts protection:
// every route under the catch-all in App.jsx wraps in <RequireAuth>,
// while public surfaces (/legal/*, /sign-in, /sign-up) sit outside.
//
// UserDataGuard runs once per sign-in: if the Clerk user ID stored in
// localStorage doesn't match the current user, every cashmodel_* key is
// wiped so the incoming user starts with a clean slate. This prevents
// any data leakage between accounts on the same device.

import { useEffect } from 'react';
import { useUser, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';

const OWNER_KEY = 'cashmodel_owner_uid';

function UserDataGuard({ children }) {
  const { isLoaded, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !user) return;
    const storedUid = localStorage.getItem(OWNER_KEY);
    if (storedUid && storedUid !== user.id) {
      // A different user was previously signed in on this device — wipe their
      // data so the incoming user starts with a clean slate.
      const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('cashmodel_'));
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
    // Always stamp the current owner so future sign-ins can detect a switch.
    localStorage.setItem(OWNER_KEY, user.id);
  }, [isLoaded, user?.id]);

  return children;
}

/**
 * @param {{ children: any }} props
 */
export default function RequireAuth({ children }) {
  // Capture the path the user was trying to reach so Clerk routes them
  // back here after sign-in. window.location is fine — RedirectToSignIn
  // only renders client-side.
  const redirectUrl = typeof window !== 'undefined'
    ? window.location.pathname + window.location.search + window.location.hash
    : undefined;

  return (
    <>
      <SignedIn>
        <UserDataGuard>{children}</UserDataGuard>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn redirectUrl={redirectUrl} />
      </SignedOut>
    </>
  );
}
