// @ts-check
// Brand chrome for the vendor sign-in / sign-up screens. Mirrors the
// internal <AuthShell /> visually but ships with the locale switcher
// and i18n-driven copy so a vendor's first impression is in their
// preferred language.

import LocaleSwitcher from './LocaleSwitcher';
import { useT } from '../../i18n';

export default function VendorAuthShell({ titleKey, subtitleKey, children }) {
  const t = useT();
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F0E8',
      color: '#3A3A3A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '64px 24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 460,
        textAlign: 'center',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 24,
        }}>
          <LocaleSwitcher persist={false} />
        </div>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: '#716F70',
          marginBottom: 12,
        }}>
          {t('vendor.common.brand')}
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: 32,
          lineHeight: 1.15,
          margin: 0,
          marginBottom: 12,
        }}>
          {t(titleKey)}
        </h1>
        {subtitleKey ? (
          <p style={{ margin: 0, marginBottom: 24, color: '#716F70', fontSize: 14 }}>
            {t(subtitleKey)}
          </p>
        ) : null}
      </div>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}
