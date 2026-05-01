// @ts-check
// /vendor/sign-in — Clerk <SignIn /> mounted under the vendor shell.
// Sign-up sits at /vendor/sign-up but is invitation-only (Clerk
// Restricted mode + the admin invite flow that stamps vendor_id into
// publicMetadata). A walk-up visitor without a ticket gets bounced.

import { SignIn } from '@clerk/clerk-react';
import VendorAuthShell from './VendorAuthShell';
import { VENDOR_CLERK_APPEARANCE } from './clerkAppearance';

export default function VendorSignInPage() {
  return (
    <VendorAuthShell
      titleKey="vendor.auth.signInTitle"
      subtitleKey="vendor.auth.signInSubtitle"
    >
      <SignIn
        path="/vendor/sign-in"
        routing="path"
        signUpUrl="/vendor/sign-up"
        afterSignInUrl="/vendor"
        appearance={VENDOR_CLERK_APPEARANCE}
      />
    </VendorAuthShell>
  );
}
