// @ts-check
// /sign-up — Clerk <SignUp /> mount. Because Clerk's sign-up mode is
// "Restricted" (admin-invite only), this page is reachable but Clerk
// itself enforces the gate: only invitations carrying a valid
// `__clerk_ticket` query param can complete sign-up; everyone else
// sees Clerk's "Sign-ups are disabled" treatment.

import { SignUp } from '@clerk/clerk-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import AuthShell, { CLERK_APPEARANCE } from './AuthShell';

export default function SignUpPage() {
  usePageMeta({
    title: 'Sign Up — Foreign Resource',
    description: 'Complete your Foreign Resource ERP invitation.',
    robots: 'noindex, nofollow',
  });

  return (
    <AuthShell heading="Foreign Resource — Sign Up">
      <SignUp
        signInUrl="/sign-in"
        path="/sign-up"
        routing="path"
        appearance={CLERK_APPEARANCE}
      />
    </AuthShell>
  );
}
