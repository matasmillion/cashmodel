// Portal Access panel — admin-side UI for managing which Clerk users
// have vendor portal access for a given vendor. Sits inside the
// existing VendorEditor modal (additive change to VendorManager.jsx).
//
// Reads vendor_users and posts to the vendor-invite Edge Function.
// Never imported from src/components/vendor/* — that surface is for
// vendors only.

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FR } from './techPackConstants';
import { Input, labelStyle } from './TechPackPrimitives';
import { listVendorUsers, inviteVendorUser, revokeVendorUser } from '../../utils/vendorUserStore';

const STATUS_COLORS = {
  active:  { fg: '#3B6D11', bg: 'rgba(59,109,17,0.10)' },
  invited: { fg: '#854F0B', bg: 'rgba(133,79,11,0.10)' },
  revoked: { fg: '#A32D2D', bg: 'rgba(163,45,45,0.10)' },
};

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.invited;
  return (
    <span style={{
      fontSize: 9,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '3px 8px',
      borderRadius: 5,
      color: c.fg,
      background: c.bg,
      fontWeight: 600,
    }}>{status}</span>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return '—'; }
}

export default function VendorPortalAccessPanel({ vendorName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listVendorUsers(vendorName);
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [vendorName]);

  useEffect(() => { refresh(); }, [refresh]);

  const onRevoke = async (clerk_user_id) => {
    if (!window.confirm('Revoke this user\'s portal access? They will be signed out.')) return;
    const res = await revokeVendorUser({ vendor_name: vendorName, clerk_user_id });
    if (!res.ok) { setError(res.error || 'Revoke failed.'); return; }
    setError('');
    refresh();
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: FR.slate, letterSpacing: '0.04em' }}>
            PORTAL ACCESS
          </div>
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
            People at this vendor who can sign in to the Vendor Portal.
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setError(''); setInviting(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={11} /> Invite a user
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 8, padding: '6px 10px', background: 'rgba(163,45,45,0.08)', color: '#A32D2D', borderRadius: 4, fontSize: 11 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 11, color: FR.stone, padding: 10 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 11, color: FR.stone, padding: 12, background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 4, textAlign: 'center' }}>
          No portal users yet. Invite one to send them a sign-up email.
        </div>
      ) : (
        <div style={{ border: `1px solid ${FR.sand}`, borderRadius: 4, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.clerk_user_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 0.7fr 0.5fr 0.8fr 60px',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderTop: i === 0 ? 'none' : `1px solid ${FR.sand}`,
                fontSize: 11,
                color: FR.slate,
              }}>
              <div style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11 }}>
                {r.email}
              </div>
              <div><StatusPill status={r.status} /></div>
              <div style={{ fontSize: 10, color: FR.stone, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {r.preferred_locale === 'zh-CN' ? '中文' : 'EN'}
              </div>
              <div style={{ fontSize: 10, color: FR.stone }}>
                {r.joined_at ? `Joined ${formatDate(r.joined_at)}` : `Invited ${formatDate(r.invited_at)}`}
              </div>
              <div style={{ textAlign: 'right' }}>
                {r.status !== 'revoked' && (
                  <button
                    type="button"
                    onClick={() => onRevoke(r.clerk_user_id)}
                    style={{ background: 'transparent', border: `1px solid ${FR.sand}`, color: FR.stone, fontSize: 10, padding: '3px 7px', borderRadius: 3, cursor: 'pointer' }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {inviting && (
        <InviteForm
          vendorName={vendorName}
          onCancel={() => setInviting(false)}
          onDone={() => { setInviting(false); refresh(); }}
        />
      )}
    </div>
  );
}

function InviteForm({ vendorName, onCancel, onDone }) {
  const [email, setEmail] = useState('');
  const [locale, setLocale] = useState('en');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setErr('Email is required.'); return; }
    setSubmitting(true);
    setErr('');
    const res = await inviteVendorUser({
      vendor_name: vendorName,
      email: email.trim(),
      preferred_locale: locale,
    });
    setSubmitting(false);
    if (!res.ok) { setErr(res.error || 'Invite failed.'); return; }
    onDone();
  };

  return (
    <div role="dialog"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ background: '#FFF', borderRadius: 10, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: FR.slate, color: FR.salt, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>VENDOR PORTAL</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, marginTop: 2 }}>Invite {vendorName}</div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel"
            style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <Input label="Email" value={email} onChange={setEmail} placeholder="contact@vendor.com" />
          <div style={{ marginTop: 8 }}>
            <label style={labelStyle}>Preferred language</label>
            <select
              value={locale}
              onChange={e => setLocale(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', border: `1px solid ${FR.sand}`,
                borderRadius: 4, fontSize: 12, color: FR.slate, background: '#FFF',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
            <p style={{ fontSize: 11, color: FR.stone, margin: '6px 0 0' }}>
              The invitation email and the portal will both render in this language.
            </p>
          </div>
          {err && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(163,45,45,0.08)', color: '#A32D2D', borderRadius: 4, fontSize: 11 }}>
              {err}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={onCancel} disabled={submitting}
              style={{ padding: '6px 14px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, cursor: submitting ? 'default' : 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              style={{ padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
