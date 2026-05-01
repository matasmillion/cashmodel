// SendSampleModal — opens from Tech Pack header / Trim card to fire a
// sample request at a vendor. Calls sampleStore.createSampleRequest()
// which inserts into sample_requests (vendor sees it on their portal)
// AND fires the localized email via the vendor-notify Edge Function.
//
// Additive — no edits to TechPackBuilder.jsx or ComponentPackBuilder.jsx
// (both protected per CLAUDE.md). Mounted by SendToVendorButton.

import { useState } from 'react';
import { X, Send } from 'lucide-react';
import { FR } from './techPackConstants';
import { Input, labelStyle } from './TechPackPrimitives';
import { createSampleRequest } from '../../utils/sampleStore';

const SAMPLE_TYPES = ['Proto', 'SMS', 'TOP', 'Salesman', 'Photo'];

export default function SendSampleModal({ vendorName, styleId, onCancel, onSent }) {
  const [sampleType, setSampleType] = useState('Proto');
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!vendorName) { setErr('No vendor set on this style.'); return; }
    setSubmitting(true);
    setErr('');
    try {
      await createSampleRequest({
        vendor_id: vendorName,
        style_id: styleId,
        sample_type: sampleType,
        courier,
        tracking_number: tracking,
        notes,
      });
      onSent();
    } catch (e2) {
      setErr(e2?.message || 'Send failed');
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ background: '#FFF', borderRadius: 10, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: FR.slate, color: FR.salt, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>SEND TO VENDOR</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, marginTop: 2 }}>Sample request</div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel"
            style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ marginBottom: 12, padding: '8px 12px', background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 4, fontSize: 11, color: FR.stone }}>
            Vendor: <strong style={{ color: FR.slate }}>{vendorName || '— not set —'}</strong>
            <br/>Style: <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>{styleId || '—'}</span>
          </div>

          <label style={labelStyle}>Sample type</label>
          <select
            value={sampleType}
            onChange={e => setSampleType(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', border: `1px solid ${FR.sand}`, borderRadius: 4, fontSize: 12, color: FR.slate, background: '#FFF', fontFamily: "'Inter', sans-serif", marginBottom: 10 }}
          >
            {SAMPLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <Input label="Courier (optional)" value={courier} onChange={setCourier} placeholder="DHL, FedEx, SF Express…" />
          <Input label="Tracking number (optional)" value={tracking} onChange={setTracking} placeholder="…" />
          <Input label="Notes for vendor (optional)" value={notes} onChange={setNotes} placeholder="What you want them to make / focus on" multiline />

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
            <button type="submit" disabled={submitting || !vendorName}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: (submitting || !vendorName) ? 'default' : 'pointer', opacity: (submitting || !vendorName) ? 0.6 : 1 }}>
              <Send size={11} /> {submitting ? 'Sending…' : 'Send sample request'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
