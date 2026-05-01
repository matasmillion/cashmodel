// Org-wide settings page. Mounts as the `org-settings` tab via the
// Settings menu in TopBar.
//
// Today exposes the vendor portal defaults (default locale stamped on
// new invitations + the public portal URL used as the CTA in
// invitation and notification emails). The Anthropic API key and rate
// card instructions are stored in the same `org_settings` row but
// they're owned by IntegrationsPanel today; we leave them alone here
// to avoid two surfaces fighting over the same fields.

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { getOrgSettings, saveOrgSettings } from '../../utils/orgSettingsStore';

const FR = {
  slate: '#3A3A3A',
  salt: '#F5F0E8',
  sand: '#EBE5D5',
  stone: '#716F70',
};

const CARD = {
  background: '#FFFFFF',
  border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8,
  padding: 22,
  marginBottom: 16,
};

const FIELD_LABEL = {
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: FR.stone,
  display: 'block',
  marginBottom: 6,
};

const INPUT_STYLE = {
  width: '100%',
  padding: '8px 12px',
  border: `1px solid ${FR.sand}`,
  borderRadius: 6,
  fontSize: 13,
  color: FR.slate,
  background: '#FFFFFF',
  fontFamily: "'Inter', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

export default function OrgSettings() {
  const [settings, setSettings] = useState(null);
  const [vendorDefaultLocale, setVendorDefaultLocale] = useState('en');
  const [vendorPortalBaseUrl, setVendorPortalBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getOrgSettings().then(s => {
      if (cancelled) return;
      setSettings(s);
      setVendorDefaultLocale(s.vendor_default_locale || 'en');
      setVendorPortalBaseUrl(s.vendor_portal_base_url || '');
    });
    return () => { cancelled = true; };
  }, []);

  const onSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await saveOrgSettings({
        vendor_default_locale: vendorDefaultLocale,
        vendor_portal_base_url: vendorPortalBaseUrl.trim(),
      });
      setSavedAt(new Date());
    } catch (err) {
      setError(err?.message || 'Save failed');
    }
    setSaving(false);
  };

  if (!settings) return <p style={{ color: FR.stone, fontSize: 12 }}>Loading…</p>;

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: 28,
          margin: 0,
        }}>
          Org Settings
        </h2>
        <p style={{ fontSize: 12, color: FR.stone, margin: '4px 0 0' }}>
          Brand-wide defaults that apply to every vendor and every email.
        </p>
      </div>

      <form onSubmit={onSave} style={{ maxWidth: 720 }}>
        <section style={CARD}>
          <h3 style={{
            margin: 0, marginBottom: 4,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 400, fontSize: 20,
          }}>
            Vendor Portal
          </h3>
          <p style={{ fontSize: 12, color: FR.stone, margin: '0 0 16px' }}>
            Defaults applied to every new vendor invitation. Vendors can
            still change their language preference from their account
            page after signing in.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={FIELD_LABEL}>Default language for new invitations</label>
            <select
              value={vendorDefaultLocale}
              onChange={e => setVendorDefaultLocale(e.target.value)}
              style={INPUT_STYLE}
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
            <p style={{ fontSize: 11, color: FR.stone, margin: '6px 0 0' }}>
              Pre-selects this language on the invite modal. Vendors can override
              themselves on /vendor/account.
            </p>
          </div>

          <div>
            <label style={FIELD_LABEL}>Vendor portal base URL</label>
            <input
              type="url"
              value={vendorPortalBaseUrl}
              onChange={e => setVendorPortalBaseUrl(e.target.value)}
              placeholder="https://app.foreign-resource.com"
              style={INPUT_STYLE}
            />
            <p style={{ fontSize: 11, color: FR.stone, margin: '6px 0 0' }}>
              The public origin used as the CTA link in invitation and notification
              emails. Leave blank to use the <code>VENDOR_PORTAL_BASE_URL</code> secret
              configured on the Edge Functions.
            </p>
          </div>
        </section>

        <section style={CARD}>
          <h3 style={{
            margin: 0, marginBottom: 4,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 400, fontSize: 20,
          }}>
            Email delivery
          </h3>
          <p style={{ fontSize: 12, color: FR.stone, margin: '0 0 8px' }}>
            The from-address and the email provider API key are managed
            as Supabase function secrets, not in this UI. To rotate
            them, run <code style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11 }}>supabase secrets set VENDOR_PORTAL_FROM=… RESEND_API_KEY=…</code>.
          </p>
        </section>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(163,45,45,0.08)', color: '#A32D2D', borderRadius: 4, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px',
              background: FR.slate, color: FR.salt,
              border: 'none', borderRadius: 6,
              fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Save size={12} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
          {savedAt && (
            <span style={{ fontSize: 11, color: '#3B6D11' }}>
              Saved {savedAt.toLocaleTimeString()}.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
