// SendPOModal — opens from Tech Pack header / Trim card to create a
// new PO and immediately place it. transitionPO('placed') already fires
// the localized email via vendor-notify.
//
// We collect the bare minimum to make the PO record meaningful
// (units, unit_cost_usd for internal cost tracking, lead_days, notes).
// unit_cost_usd is INTERNAL and never reaches the vendor portal —
// vendorPortalStore.js redacts cost fields at the store layer.

import { useState } from 'react';
import { X, Send } from 'lucide-react';
import { FR } from './techPackConstants';
import { Input } from './TechPackPrimitives';
import { createPO, transitionPO } from '../../utils/productionStore';

export default function SendPOModal({ vendorName, styleId, onCancel, onSent }) {
  const [units, setUnits] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [leadDays, setLeadDays] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!vendorName) { setErr('No vendor set on this style.'); return; }
    if (!Number(units) || Number(units) <= 0) { setErr('Units must be greater than 0.'); return; }
    setSubmitting(true);
    setErr('');
    try {
      const po = await createPO({
        vendor_id: vendorName,
        style_id: styleId,
        units: Number(units),
        unit_cost_usd: Number(unitCost) || 0,
        lead_days: Number(leadDays) || 0,
        notes,
      });
      // Transitioning to `placed` is what triggers the vendor email
      // (notifyNewPO is called from inside transitionPO). It also
      // freezes the BOM snapshot.
      await transitionPO(po.id, 'placed');
      onSent({ po_code: po.code });
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
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, marginTop: 2 }}>Place purchase order</div>
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

          <Input label="Units" value={units} onChange={setUnits} placeholder="e.g. 500" />
          <Input label="Unit cost (USD) — internal only, not sent to vendor" value={unitCost} onChange={setUnitCost} placeholder="e.g. 12.50" />
          <Input label="Lead days" value={leadDays} onChange={setLeadDays} placeholder="e.g. 45" />
          <Input label="Notes for vendor (optional)" value={notes} onChange={setNotes} placeholder="Production notes the vendor should see" multiline />

          <p style={{ fontSize: 11, color: FR.stone, margin: '10px 0 0', padding: '8px 12px', background: 'rgba(133,79,11,0.06)', borderRadius: 4, border: '0.5px solid rgba(133,79,11,0.2)' }}>
            <strong style={{ color: '#854F0B' }}>Heads up:</strong> sending creates a PO and immediately places it.
            The vendor receives the email and a record on their portal — this can&apos;t be undone.
          </p>

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
              <Send size={11} /> {submitting ? 'Placing…' : 'Place & send PO'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
