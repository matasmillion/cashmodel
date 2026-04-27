// Production list — every PO across the brand. Table view with status pills,
// quick "New PO" modal, and row clicks routing to the PO detail page (chunks
// 15-16). Empty state directs the user to create a draft.
//
// Status colors mirror the chunk-14 spec and the FR brand palette.

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FR } from '../techpack/techPackConstants';
import { listPOs, createPO } from '../../utils/productionStore';
import { listTechPacks } from '../../utils/techPackStore';
import { listVendors } from '../../utils/vendorLibrary';
import { setPLMHash } from '../../utils/plmRouting';

const STATUS_PILL = {
  draft:         { bg: 'rgba(58,58,58,0.08)', fg: FR.slate, label: 'Draft' },
  placed:        { bg: FR.sand,                fg: FR.slate, label: 'Placed' },
  in_production: { bg: 'rgba(154,129,107,0.22)', fg: '#5C4A38', label: 'In production' },
  received:      { bg: 'rgba(181,199,211,0.45)', fg: '#2F4A5C', label: 'Received' },
  closed:        { bg: 'rgba(99,153,34,0.12)', fg: '#3B6D11', label: 'Closed' },
  cancelled:     { bg: 'rgba(58,58,58,0.06)', fg: '#9A9A9A', label: 'Cancelled' },
};

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.draft;
  return (
    <span style={{ background: s.bg, color: s.fg, padding: '5px 12px', borderRadius: 5, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function fmtMonthYear(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch { return '—'; }
}
function fmtMoney(n) {
  if (n == null || n === '') return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function ProductionList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const refresh = async () => {
    const list = await listPOs();
    setRows(list);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const openPO = (id) => setPLMHash({ layer: 'production', packId: id });

  const handleCreated = async (po) => {
    setShowNew(false);
    await refresh();
    openPO(po.id);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 26, margin: 0 }}>Production</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            Every PO snapshots a Style&rsquo;s BOM and writes actuals back to the Library.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Plus size={13} /> New PO
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: FR.stone, fontSize: 12 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>No POs yet</div>
          <div style={{ fontSize: 12, color: FR.stone, marginTop: 8, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Create one to start the production loop.
          </div>
          <button
            onClick={() => setShowNew(true)}
            style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={13} /> New PO
          </button>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr>
              {['Code', 'Style', 'Vendor', 'Units', 'Status', 'Placed', 'Closed', 'Total cost'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i === 3 || i === 7 ? 'right' : 'left',
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: 'rgba(58,58,58,0.55)', padding: '12px 14px',
                  borderBottom: '0.5px solid rgba(58,58,58,0.15)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((po, i) => {
              const total = (Number(po.units) || 0) * (Number(po.unit_cost_usd) || 0);
              return (
                <tr
                  key={po.id}
                  onClick={() => openPO(po.id)}
                  style={{ cursor: 'pointer', borderBottom: i === rows.length - 1 ? 'none' : '0.5px solid rgba(58,58,58,0.08)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,240,232,0.5)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 14px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: FR.slate }}>{po.code}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: FR.slate }}>{po.style_id || '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: FR.slate }}>{po.vendor_id || '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: FR.slate, textAlign: 'right' }}>{po.units ? Number(po.units).toLocaleString() : '—'}</td>
                  <td style={{ padding: '11px 14px' }}><StatusPill status={po.status} /></td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: FR.stone }}>{fmtMonthYear(po.placed_at)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: FR.stone }}>{fmtMonthYear(po.closed_at)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: FR.slate, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(total || null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showNew && <NewPOModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  );
}

function NewPOModal({ onClose, onCreated }) {
  const [styles, setStyles] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [styleId, setStyleId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [units, setUnits] = useState('');
  const [notes, setNotes] = useState('');
  // Default size break shows the four staple FR sizes; user can edit the
  // counts or add more rows at create time, but it's optional.
  const [sizeBreak, setSizeBreak] = useState([['S', ''], ['M', ''], ['L', ''], ['XL', '']]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTechPacks(), listVendors()]).then(([s, v]) => {
      if (cancelled) return;
      setStyles(s || []);
      setVendors(v || []);
    });
    return () => { cancelled = true; };
  }, []);

  const updateSize = (i, key, val) => {
    setSizeBreak(arr => arr.map((row, idx) => idx === i ? [key, val] : row));
  };
  const addSizeRow = () => setSizeBreak(arr => [...arr, ['', '']]);
  const removeSizeRow = (i) => setSizeBreak(arr => arr.filter((_, idx) => idx !== i));

  const submit = async () => {
    setSaving(true);
    try {
      const sb = {};
      sizeBreak.forEach(([k, v]) => {
        const key = String(k || '').trim().toUpperCase();
        const n = Number(v);
        if (key && Number.isFinite(n) && n > 0) sb[key] = n;
      });
      // Auto-derive total units from the size break sum if the user left
      // the units field blank but provided per-size counts.
      const sbSum = Object.values(sb).reduce((a, n) => a + n, 0);
      const totalUnits = Number(units) || sbSum || 0;
      const po = await createPO({
        style_id: styleId,
        vendor_id: vendorId,
        units: totalUnits,
        size_break: sb,
        notes,
      });
      onCreated(po);
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' };
  const inputStyle = { width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 4, fontSize: 13, color: FR.slate, background: '#fff', boxSizing: 'border-box', outline: 'none' };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 8, padding: 22, width: 460, maxWidth: '90vw', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>New PO</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FR.stone }}><X size={16} /></button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Style</label>
          <select value={styleId} onChange={e => setStyleId(e.target.value)} style={inputStyle}>
            <option value="">Select a style…</option>
            {styles.map(s => (
              <option key={s.id} value={s.id}>{s.style_name || s.id}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Vendor</label>
          <select value={vendorId} onChange={e => setVendorId(e.target.value)} style={inputStyle}>
            <option value="">Select a vendor…</option>
            {vendors.map(v => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Units ordered (total)</label>
          <input type="number" min="0" value={units} onChange={e => setUnits(e.target.value)} placeholder="Leave blank to total the size break" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={labelStyle}>Size break</label>
            <span style={{ fontSize: 10, color: 'rgba(58,58,58,0.55)' }}>
              Sum {sizeBreak.reduce((a, [, v]) => a + (Number(v) || 0), 0).toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sizeBreak.map(([size, count], i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 32px', gap: 8 }}>
                <input value={size} onChange={e => updateSize(i, e.target.value.toUpperCase(), count)} placeholder="S" style={inputStyle} />
                <input type="number" min="0" value={count} onChange={e => updateSize(i, size, e.target.value)} placeholder="0" style={inputStyle} />
                <button onClick={() => removeSizeRow(i)} aria-label="Remove" style={{ background: 'transparent', border: `0.5px solid ${FR.sand}`, color: FR.stone, borderRadius: 4, cursor: 'pointer' }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <button onClick={addSizeRow} type="button" style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: FR.soil, fontSize: 11, padding: 0, cursor: 'pointer' }}>
              + Add size
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "'Inter', sans-serif", resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 14px', background: 'transparent', color: FR.stone, border: `0.5px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !styleId || !vendorId} style={{ padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: (saving || !styleId || !vendorId) ? 'not-allowed' : 'pointer', opacity: (saving || !styleId || !vendorId) ? 0.6 : 1 }}>
            {saving ? 'Creating…' : 'Create draft PO'}
          </button>
        </div>
      </div>
    </div>
  );
}
