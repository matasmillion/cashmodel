// @ts-check
// Shared shell for every authenticated /vendor/* page. Salt background,
// header with brand + locale + sign-out, and a narrow content column.

import { Link, useLocation } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';
import { useT } from '../../i18n';
import LocaleSwitcher from './LocaleSwitcher';

export default function VendorPortalLayout({ children }) {
  const t = useT();
  const { signOut } = useClerk();
  const { pathname } = useLocation();

  const tabs = [
    { to: '/vendor', label: t('vendor.dashboard.title') },
    { to: '/vendor/pos', label: t('vendor.po.title') },
    { to: '/vendor/samples', label: t('vendor.sample.title') },
    { to: '/vendor/account', label: t('vendor.account.title') },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0E8', color: '#3A3A3A' }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 32px',
        borderBottom: '0.5px solid rgba(58,58,58,0.15)',
        background: '#FFFFFF',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 22,
          }}>
            {t('vendor.common.brand')}
          </span>
          <span style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: 5,
            background: '#EBE5D5',
            color: '#3A3A3A',
          }}>
            {t('vendor.common.portal')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <LocaleSwitcher />
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: '/vendor/sign-in' })}
            style={{
              fontSize: 12,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#3A3A3A',
              fontFamily: 'inherit',
            }}
          >
            {t('vendor.common.signOut')}
          </button>
        </div>
      </header>

      <nav style={{
        display: 'flex',
        gap: 4,
        padding: '12px 32px',
        borderBottom: '0.5px solid rgba(58,58,58,0.15)',
        background: '#FFFFFF',
      }}>
        {tabs.map(tab => {
          const active = tab.to === '/vendor'
            ? pathname === '/vendor'
            : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                borderRadius: 6,
                textDecoration: 'none',
                background: active ? '#3A3A3A' : 'transparent',
                color: active ? '#F5F0E8' : '#3A3A3A',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <main style={{ padding: '32px', maxWidth: 1080, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
