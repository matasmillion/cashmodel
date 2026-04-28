// @ts-check
// /account/security — the demo route the Plaid Q5 screenshot is taken
// from. Surfaces:
//
//   • Hero banner: MFA-required statement + linked Access Control Policy.
//   • Identity card: email, name, role pill.
//   • MFA factor list with badges:
//       🛡️ Passkey       — green "Phishing-resistant" pill per device
//       🔐 TOTP          — Enrolled / Not enrolled
//       ❌ SMS           — "Not used as primary factor (recovery only)"
//   • Action buttons: "Add a passkey" / "Add an authenticator app"
//     route to /account/security/manage which mounts <UserProfile />.
//   • Policy reference footer pulling version + effective date from
//     POLICY_META.accessControl — single source of truth.

import { Link } from 'react-router-dom';
import { ShieldCheck, KeyRound, Smartphone, MessageSquareWarning, Plus, ArrowRight, AlertTriangle } from 'lucide-react';
import { useCurrentUser } from '../../lib/auth';
import { POLICY_META, PUBLIC_BASE_URL } from '../../lib/legal/constants';
import { usePageMeta } from '../../hooks/usePageMeta';
import AccountShell from './AccountShell';

const ROLE_PILL = {
  admin:    { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Admin' },
  operator: { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Operator' },
  viewer:   { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Viewer' },
};

const CARD_STYLE = {
  background: '#fff',
  border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8,
  padding: '22px 24px',
  marginBottom: 18,
};

const SECTION_LABEL = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'rgba(58,58,58,0.55)', marginBottom: 14,
};

const H2 = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 400, fontSize: 22, color: '#3A3A3A',
  margin: 0, marginBottom: 16,
};

export default function AccountSecurityPage() {
  usePageMeta({
    title: 'Account & security — Foreign Resource',
    description: 'Multi-factor authentication settings and policy reference for the Foreign Resource ERP.',
    canonical: `${PUBLIC_BASE_URL}/account/security`,
    robots: 'noindex, nofollow',
  });

  const user = useCurrentUser();
  // RequireAuth gates this route; user should always be present by the
  // time we render. The null guard keeps types honest.
  if (!user) return null;

  const passkeys = user.mfaFactors.filter(f => f.type === 'passkey');
  const totp = user.mfaFactors.find(f => f.type === 'totp');
  const hasAnyMFA = passkeys.length > 0 || !!totp;
  const role = ROLE_PILL[user.role] || ROLE_PILL.viewer;
  const acMeta = POLICY_META.accessControl;

  return (
    <AccountShell heading="Account & security" eyebrow="Account & security">

      {/* Hero — the line Plaid will see in the screenshot */}
      <section
        aria-label="MFA requirement"
        style={{
          background: '#3A3A3A',
          color: '#F5F0E8',
          borderRadius: 8,
          padding: '20px 22px',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          marginBottom: 22,
        }}
      >
        <ShieldCheck size={22} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>
          <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>
            Multi-Factor Authentication is required.
          </strong>
          Phishing-resistant MFA (passkeys) is enforced for all access to
          systems processing financial data, in compliance with our{' '}
          <Link to="/legal/access-control-policy" style={{ color: '#F5F0E8', textDecoration: 'underline' }}>
            Access Control Policy
          </Link>.
        </div>
      </section>

      {/* Identity card */}
      <section style={CARD_STYLE}>
        <div style={SECTION_LABEL}>Your account</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, max-content) 1fr',
          rowGap: 8, columnGap: 16,
          fontSize: 14, lineHeight: 1.5,
        }}>
          <span style={{ color: 'rgba(58,58,58,0.55)' }}>Email</span>
          <span style={{ color: '#3A3A3A' }}>{user.email || '—'}</span>
          <span style={{ color: 'rgba(58,58,58,0.55)' }}>Name</span>
          <span style={{ color: '#3A3A3A' }}>{user.name || '—'}</span>
          <span style={{ color: 'rgba(58,58,58,0.55)' }}>Role</span>
          <span>
            <span style={{
              background: role.bg,
              color: role.fg,
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}>
              {role.label}
            </span>
          </span>
        </div>
      </section>

      {/* MFA factors */}
      <section style={CARD_STYLE}>
        <div style={SECTION_LABEL}>Multi-factor authentication</div>
        <h2 style={H2}>Enrolled factors</h2>

        {!hasAnyMFA && (
          <div style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            background: 'rgba(133,79,11,0.08)',
            border: '0.5px solid rgba(133,79,11,0.25)',
            borderRadius: 6,
            padding: '12px 14px',
            marginBottom: 14,
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            <AlertTriangle size={16} style={{ color: '#854F0B', flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: '#854F0B' }}>
              You haven&rsquo;t enrolled an MFA factor yet. Add a passkey
              to satisfy the Access Control Policy.
            </span>
          </div>
        )}

        {/* Passkeys */}
        <FactorBlock
          icon={KeyRound}
          title="Passkey"
          subtitle="WebAuthn / FIDO2 — preferred"
          status={passkeys.length > 0 ? 'enrolled' : 'missing'}
        >
          {passkeys.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {passkeys.map((pk, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#F5F0E8',
                  borderRadius: 4,
                  marginBottom: 6,
                  fontSize: 13,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🛡️</span>
                    <span style={{ color: '#3A3A3A' }}>{pk.label || 'Passkey'}</span>
                  </span>
                  <span style={{
                    background: 'rgba(99,153,34,0.16)',
                    color: '#3B6D11',
                    padding: '3px 10px',
                    borderRadius: 4,
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}>
                    Phishing-resistant
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ManageLink label="Add a passkey" />
          )}
        </FactorBlock>

        {/* TOTP */}
        <FactorBlock
          icon={Smartphone}
          title="Authenticator app (TOTP)"
          subtitle="Acceptable second factor"
          status={totp ? 'enrolled' : 'missing'}
        >
          {totp
            ? <Status text="Enrolled" tone="ok" />
            : <ManageLink label="Add an authenticator app" />}
        </FactorBlock>

        {/* SMS */}
        <FactorBlock
          icon={MessageSquareWarning}
          title="SMS"
          subtitle="Not used as primary factor (recovery only)"
          status="excluded"
        >
          <Status text="Not used as primary" tone="muted" />
        </FactorBlock>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px solid rgba(58,58,58,0.08)' }}>
          <Link
            to="/account/security/manage"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: '#3A3A3A',
              color: '#F5F0E8',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Manage account &amp; factors <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* Policy reference footer */}
      <div style={{
        marginTop: 28,
        fontSize: 11, color: 'rgba(58,58,58,0.55)',
        letterSpacing: '0.04em',
      }}>
        Enforcement basis:{' '}
        <Link to="/legal/access-control-policy" style={{ color: 'rgba(58,58,58,0.7)' }}>
          Access Control Policy
        </Link>
        {' '}v{acMeta.version} · Effective {acMeta.effective}
      </div>
    </AccountShell>
  );
}

/**
 * @param {{ icon: any; title: string; subtitle?: string; status: 'enrolled'|'missing'|'excluded'; children: any }} props
 */
function FactorBlock({ icon: Icon, title, subtitle, status, children }) {
  const dotColor = status === 'enrolled' ? '#3B6D11'
    : status === 'missing' ? '#854F0B'
    : 'rgba(58,58,58,0.4)';
  return (
    <div style={{
      padding: '14px 0',
      borderTop: '0.5px solid rgba(58,58,58,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon size={18} style={{ color: '#716F70', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: '#3A3A3A',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: 4, background: dotColor,
              display: 'inline-block',
            }} />
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: 'rgba(58,58,58,0.55)', marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ marginLeft: 30, marginTop: 4 }}>{children}</div>
    </div>
  );
}

function Status({ text, tone }) {
  const color = tone === 'ok' ? '#3B6D11'
    : tone === 'warn' ? '#854F0B'
    : 'rgba(58,58,58,0.55)';
  return <span style={{ fontSize: 12, color }}>{text}</span>;
}

function ManageLink({ label }) {
  return (
    <Link
      to="/account/security/manage"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: '#3A3A3A',
        textDecoration: 'none',
        padding: '6px 10px',
        background: '#F5F0E8',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 6,
        fontWeight: 600,
      }}
    >
      <Plus size={12} /> {label}
    </Link>
  );
}
