// @ts-check
// Client-side route gate — renders children when signed in, otherwise
// kicks the user to /sign-in with the originally-requested URL stashed
// so Clerk can return them after authentication.
//
// This is the SPA equivalent of Next.js's middleware.ts protection:
// every route under the catch-all in App.jsx wraps in <RequireAuth>,
// while public surfaces (/legal/*, /sign-in, /sign-up) sit outside.

import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';

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
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn redirectUrl={redirectUrl} />
      </SignedOut>
    </>
  );
}
