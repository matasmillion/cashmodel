// @ts-check
// Header — small auth-identity surface. Renders email + role badge +
// sign-out button. Designed to drop into the existing FR dashboard
// chrome where the prior `supabase.auth.signOut()` button used to
// live. Reusable on any future protected page.

import { LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCurrentUser, useSignOut, useCurrentOrg } from '../../lib/auth';

const ROLE_PILL = {
  admin:    { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Admin' },
  operator: { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Operator' },
  viewer:   { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Viewer' },
};

export default function Header() {
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const signOut = useSignOut();

  if (!user) return null;

  const pill = ROLE_PILL[user.role] || ROLE_PILL.viewer;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: "'Inter', sans-serif",
    }}>
      {org && (
        <span style={{ fontSize: 12, color: '#716F70', fontWeight: 500 }}>
          {org.name}
        </span>
      )}
      <Link
        to="/account/security"
        title="Account & security"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#3A3A3A',
          textDecoration: 'none',
          padding: '4px 8px',
          borderRadius: 6,
        }}
      >
        <span style={{ color: '#3A3A3A' }}>{user.email}</span>
        <span style={{
          background: pill.bg,
          color: pill.fg,
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          {pill.label}
        </span>
      </Link>
      <button
        onClick={() => signOut()}
        title="Sign out"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 6,
          background: 'transparent',
          color: '#716F70',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#EBE5D5'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <LogOut size={13} />
      </button>
    </div>
  );
}
