// @ts-check
// Vendor-side route gate. Two layers stricter than the internal
// <RequireAuth>:
//   1. Must be signed in (delegated to Clerk's <SignedIn> / <SignedOut>).
//   2. The Clerk user's publicMetadata.vendor_id MUST be set. The
//      Clerk webhook stamps this when an internal admin invites a
//      vendor through the admin tool. Users with no vendor_id land on
//      a "not linked" notice instead of the portal.
//
// The vendor sign-in / sign-up routes use Clerk components directly,
// scoped to /vendor/* — no shared auth flow with the internal app.

import { SignedIn, SignedOut, RedirectToSignIn, useUser } from '@clerk/clerk-react';
import { useT } from '../../i18n';

function NoVendorLink() {
  const t = useT();
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#F5F0E8',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 460,
        background: '#FFF',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 8,
        padding: 22,
      }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
          {t('vendor.common.portal')}
        </h2>
        <p style={{ margin: 0, color: '#3A3A3A' }}>{t('vendor.auth.noAccess')}</p>
      </div>
    </div>
  );
}

export default function VendorRequireAuth({ children }) {
  return (
    <>
      <SignedIn>
        <VendorLinkGate>{children}</VendorLinkGate>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn redirectUrl={
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search + window.location.hash
            : undefined
        } signInUrl="/vendor/sign-in" />
      </SignedOut>
    </>
  );
}

function VendorLinkGate({ children }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return null;
  const vendorId = user?.publicMetadata?.vendor_id;
  if (!vendorId) return <NoVendorLink />;
  return children;
}
