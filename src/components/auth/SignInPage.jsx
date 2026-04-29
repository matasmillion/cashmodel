// @ts-check
// /sign-in — branded Clerk <SignIn /> mount. Sign-up is admin-invite
// only (Clerk dashboard restricted mode); we still expose the
// /sign-up route so invitation links carrying a `__clerk_ticket`
// query param land on Clerk's <SignUp />, but a regular visitor
// without a ticket gets bounced back here.

import { SignIn } from '@clerk/clerk-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import AuthShell, { CLERK_APPEARANCE } from './AuthShell';

export default function SignInPage() {
  usePageMeta({
    title: 'Sign In — Foreign Resource',
    description: 'Sign in to the Foreign Resource ERP.',
    robots: 'noindex, nofollow',
  });

  return (
    <AuthShell heading="Foreign Resource — Sign In">
      <SignIn
        signUpUrl="/sign-up"
        path="/sign-in"
        routing="path"
        appearance={CLERK_APPEARANCE}
      />
    </AuthShell>
  );
}
