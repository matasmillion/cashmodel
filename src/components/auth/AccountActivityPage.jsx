// @ts-check
// /account/security/activity — last 30 days of auth events for the
// signed-in user. Admins see every user's events, gated by RLS at the
// DB layer (auth.jwt() #>> '{public_metadata,role}' = 'admin').
//
// Data source: public.auth_events written by the clerk-webhook on
// every Clerk session / MFA / user lifecycle event. Until the Clerk
// Supabase JWT integration is wired up, the supabase client returns
// 401 on these reads — the page handles that gracefully with a
// "no activity yet" empty state rather than an error.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, KeyRound, LogIn, LogOut, RotateCcw, AlertTriangle } from 'lucide-react';
import { useCurrentUser, isAtLeast } from '../../lib/auth';
import { POLICY_META, PUBLIC_BASE_URL } from '../../lib/legal/constants';
import { supabase } from '../../lib/supabase';
import { usePageMeta } from '../../hooks/usePageMeta';
import AccountShell from './AccountShell';

const EVENT_LABELS = {
  sign_in_success:           { label: 'Sign in',                icon: LogIn,        tone: 'good' },
  sign_in_failure:           { label: 'Sign-in failed',         icon: AlertTriangle,tone: 'warn' },
  sign_out:                  { label: 'Sign out',               icon: LogOut,       tone: 'neutral' },
  mfa_challenge_success:     { label: 'MFA verified',           icon: ShieldCheck,  tone: 'good' },
  mfa_challenge_failure:     { label: 'MFA challenge failed',   icon: AlertTriangle,tone: 'warn' },
  mfa_enrolled:              { label: 'MFA factor enrolled',    icon: KeyRound,     tone: 'good' },
  mfa_removed:               { label: 'MFA factor removed',     icon: KeyRound,     tone: 'warn' },
  password_reset_requested:  { label: 'Password reset request', icon: RotateCcw,    tone: 'neutral' },
  password_reset_completed:  { label: 'Password reset done',    icon: RotateCcw,    tone: 'good' },
  session_revoked:           { label: 'Session revoked',        icon: AlertTriangle,tone: 'warn' },
};

const TONE_COLOR = {
  good:    '#3B6D11',
  warn:    '#854F0B',
  neutral: '#3A3A3A',
};

function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return '—'; }
}

export default function AccountActivityPage() {
  usePageMeta({
    title: 'Account activity — Foreign Resource',
    description: 'Authentication and MFA event history for the signed-in user.',
    canonical: `${PUBLIC_BASE_URL}/account/security/activity`,
    robots: 'noindex, nofollow',
  });

  const user = useCurrentUser();
  const [events, setEvents] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const isAdmin = isAtLeast(user?.role, 'admin');

  useEffect(() => {
    let cancelled = false;
    if (!user || !supabase) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        let query = supabase
          .from('auth_events')
          .select('id,user_id,event,metadata,ip_address,user_agent,created_at')
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })
          .limit(200);
        // Non-admins are scoped by RLS to their own rows; the explicit
        // .eq is belt-and-suspenders for clarity.
        if (!isAdmin) query = query.eq('user_id', user.id);
        const { data, error } = await query;
        if (cancelled) return;
        if (error) {
          // Most likely cause today: Clerk Supabase JWT template not
          // yet configured, so the supabase client lacks an auth token.
          // Treat as "no activity" rather than blowing up.
          setError(error.message);
          setEvents([]);
        } else {
          setEvents(data || []);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  if (!user) return null;

  const ac = POLICY_META.accessControl;

  return (
    <AccountShell heading="Account activity" eyebrow="Account & security">
      <Link
        to="/account/security"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: '#716F70', textDecoration: 'none',
          marginBottom: 22,
        }}
      >
        <ArrowLeft size={13} /> Account &amp; security
      </Link>

      <section style={{
        background: '#fff',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 8,
        padding: '20px 22px',
        marginBottom: 22,
      }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(58,58,58,0.55)', marginBottom: 6,
        }}>
          {isAdmin ? 'All users · last 30 days' : 'Your activity · last 30 days'}
        </div>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400, fontSize: 22, color: '#3A3A3A',
          margin: 0, marginBottom: 6,
        }}>
          {events.length} event{events.length === 1 ? '' : 's'}
        </h2>
        <div style={{ fontSize: 12, color: 'rgba(58,58,58,0.6)' }}>
          Authentication events (sign-in, sign-out, MFA enroll/remove,
          session revoke) are retained per the Information Security
          Policy §10.{' '}
          {error && (
            <span style={{ color: '#854F0B' }}>
              · Live read currently unavailable — events will appear once
              the Clerk → Supabase JWT integration is configured.
            </span>
          )}
        </div>
      </section>

      {loading ? (
        <div style={{ padding: 28, textAlign: 'center', color: '#716F70', fontSize: 13 }}>
          Loading…
        </div>
      ) : events.length === 0 ? (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: '#fff',
          border: '0.5px dashed rgba(58,58,58,0.2)',
          borderRadius: 8,
          color: 'rgba(58,58,58,0.6)',
          fontSize: 13,
        }}>
          No activity in the last 30 days.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map(ev => {
            const meta = EVENT_LABELS[ev.event] || { label: ev.event, icon: ShieldCheck, tone: 'neutral' };
            const Icon = meta.icon;
            const color = TONE_COLOR[meta.tone] || TONE_COLOR.neutral;
            const factor = ev.metadata?.factor_type;
            return (
              <li key={ev.id} style={{
                background: '#fff',
                border: '0.5px solid rgba(58,58,58,0.15)',
                borderRadius: 6,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <Icon size={16} style={{ color, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, color: '#3A3A3A', fontWeight: 600 }}>
                      {meta.label}{factor ? ` (${factor})` : ''}
                    </span>
                    <span style={{
                      fontSize: 11, color: 'rgba(58,58,58,0.55)',
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    }}>
                      {formatTimestamp(ev.created_at)}
                    </span>
                  </div>
                  {(isAdmin || ev.ip_address || ev.user_agent) && (
                    <div style={{ fontSize: 11, color: 'rgba(58,58,58,0.55)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {isAdmin && ev.user_id && (
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {ev.user_id.slice(0, 12)}…
                        </span>
                      )}
                      {ev.ip_address && <span>{ev.ip_address}</span>}
                      {ev.user_agent && (
                        <span style={{
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', maxWidth: 320,
                        }}>
                          {ev.user_agent}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{
        marginTop: 28,
        fontSize: 11, color: 'rgba(58,58,58,0.55)',
        letterSpacing: '0.04em',
      }}>
        Retention basis:{' '}
        <Link to="/legal/access-control-policy" style={{ color: 'rgba(58,58,58,0.7)' }}>
          Access Control Policy
        </Link>{' '}
        v{ac.version} · §11 Logging &amp; Monitoring · 90-day rolling retention.
      </div>
    </AccountShell>
  );
}
