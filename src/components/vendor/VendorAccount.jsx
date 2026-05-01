// @ts-check
// Vendor account page. Today shows profile name + email + the language
// preference toggle. Future: contact info edits, MFA enrollment via
// Clerk's <UserProfile />.

import { useUser } from '@clerk/clerk-react';
import { useT } from '../../i18n';
import LocaleSwitcher from './LocaleSwitcher';

const CARD = {
  background: '#FFFFFF',
  border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8,
  padding: 22,
  marginBottom: 16,
};

export default function VendorAccount() {
  const t = useT();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '—';
  const name = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—';

  return (
    <div>
      <h2 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        fontSize: 28,
        margin: '0 0 24px',
      }}>
        {t('vendor.account.title')}
      </h2>

      <section style={CARD}>
        <h3 style={{ margin: 0, marginBottom: 12, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400 }}>
          {t('vendor.account.profile')}
        </h3>
        <Row label="Name" value={name} />
        <Row label="Email" value={email} />
      </section>

      <section style={CARD}>
        <h3 style={{ margin: 0, marginBottom: 6, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400 }}>
          {t('vendor.account.languagePref')}
        </h3>
        <p style={{ fontSize: 12, color: '#716F70', margin: '0 0 14px' }}>
          {t('vendor.account.languagePrefHint')}
        </p>
        <LocaleSwitcher />
      </section>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(58,58,58,0.08)' }}>
      <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#716F70' }}>{label}</span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}
