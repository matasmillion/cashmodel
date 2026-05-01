// @ts-check
// /vendor/sign-up — invitation-only. Vendors complete this flow when
// they click the link in the welcome email; the link carries a
// `__clerk_ticket` query param that Clerk consumes. The admin
// invitation also writes vendor_id into publicMetadata, which the
// portal gate (VendorRequireAuth) checks before mounting the app.

import { SignUp } from '@clerk/clerk-react';
import VendorAuthShell from './VendorAuthShell';
import { VENDOR_CLERK_APPEARANCE } from './clerkAppearance';

export default function VendorSignUpPage() {
  return (
    <VendorAuthShell
      titleKey="vendor.auth.signUpTitle"
      subtitleKey="vendor.auth.signUpSubtitle"
    >
      <SignUp
        path="/vendor/sign-up"
        routing="path"
        signInUrl="/vendor/sign-in"
        afterSignUpUrl="/vendor"
        appearance={VENDOR_CLERK_APPEARANCE}
      />
    </VendorAuthShell>
  );
}
