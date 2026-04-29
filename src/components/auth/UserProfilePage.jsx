// @ts-check
// /account/security/manage/* — mounts Clerk's <UserProfile /> for the
// full ongoing-management flow (passkey enroll, TOTP enroll, password
// change, sign-out of other sessions, etc.). Wraps in our standard
// AccountShell so the chrome matches /account/security.

import { UserProfile } from '@clerk/clerk-react';
import AccountShell from './AccountShell';
import { CLERK_APPEARANCE } from './AuthShell';
import { usePageMeta } from '../../hooks/usePageMeta';

export default function UserProfilePage() {
  usePageMeta({
    title: 'Manage account — Foreign Resource',
    robots: 'noindex, nofollow',
  });

  return (
    <AccountShell heading="Manage your account" eyebrow="Account & security">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <UserProfile
          path="/account/security/manage"
          routing="path"
          appearance={CLERK_APPEARANCE}
        />
      </div>
    </AccountShell>
  );
}
