// Inventory PO list — per spec §5B.
//
// Filter chips by status: All / Draft / Placed / In production / Received / Closed
// Right-side: + New PO button — toggles inline POBuilder.
// Columns: PO code · Vendor · Style · Units · Cost · Placed date · Lands date · Status pill.
// Click a row → existing PLM Production list detail page.

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { listPOs } from '../../utils/productionStore';
import { listTechPacks } from '../../utils/techPackStore';
import POBuilder from '../POBuilder';
import { INV, FADE, TYPE, CARD, EYEBROW, PILL, SECTION_TITLE } from './inventoryTokens';

const STATUS_CHIPS = [
  { id: 'all',           label: 'All' },
  { id: 'draft',         label: 'Draft' },
  { id: 'placed',        label: 'Placed' },
  { id: 'in_production', label: 'In production' },
  { id: 'received',      label: 'Received' },
  { id: 'closed',        label: 'Closed' },
];

const STATUS_PILL = {
  draft:         { label: 'Draft',         bg: FADE.slate06,             fg: FADE.slate60 },
  placed:        { label: 'Placed',        bg: 'rgba(212,149,106,0.12)', fg: INV.sienna },
  in_production: { label: 'In production', bg: 'rgba(107,142,107,0.15)', fg: INV.good },
  received:      { label: 'Received',      bg: 'rgba(107,142,107,0.10)', fg: INV.good },
  closed:        { label: 'Closed',        bg: FADE.slate06,             fg: FADE.slate60 },
  cancelled:     { label: 'Cancelled',     bg: 'rgba(168,84,60,0.10)',   fg: INV.bad },
};

export default function InventoryPOs() {
  const [pos, setPos] = useState([]);
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => { refresh(); }, []);

  function refresh() {
    setLoading(true);
    Promise.all([listPOs(), listTechPacks().catch(() => [])])
      .then(([rows, p]) => { setPos(rows || []); setPacks(p || []); setLoading(false); })
      .catch(err => { console.error('InventoryPOs:', err); setLoading(false); });
  }

  const styleById = useMemo(() => {
    const m = new Map();
    for (const p of packs) if (p?.id) m.set(p.id, p);
    return m;
  }, [packs]);

  const counts = useMemo(() => {
    const out = { all: pos.length };
    for (const p of pos) out[p.status] = (out[p.status] || 0) + 1;
    return out;
  }, [pos]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return pos;
    return pos.filter(p => p.status === statusFilter);
  }, [pos, statusFilter]);

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 14,
        gap: 16,
      }}>
        <div>
          <div style={EYEBROW}>Purchase orders</div>
          <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>Open & historic POs</h3>
        </div>
        <button
          onClick={() => {
            // Close path also refreshes so a freshly-saved PO appears.
            if (showBuilder) refresh();
            setShowBuilder(v => !v);
          }}
          style={{
            padding: '7px 14px',
            borderRadius: 2,
            fontSize: 11,
            letterSpacing: '0.06em',
            fontWeight: 500,
            fontFamily: TYPE.sans,
            border: `1px solid ${INV.slate}`,
            background: showBuilder ? 'transparent' : INV.slate,
            color: showBuilder ? INV.slate : INV.salt,
            cursor: 'pointer',
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {showBuilder ? <><X size={11} /> Close</> : <><Plus size={11} /> New PO</>}
        </button>
      </div>

      {showBuilder && (
        <div style={{ marginBottom: 16 }}>
          <POBuilder />
          <div style={{
            marginTop: 8,
            fontSize: 10,
            color: FADE.slate60,
            fontFamily: TYPE.sans,
            fontStyle: 'italic',
          }}>
            After saving the PO, close this panel and the list refreshes on next load.
          </div>
        </div>
      )}

      {/* Status filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_CHIPS.map(c => (
          <Chip
            key={c.id}
            active={statusFilter === c.id}
            count={counts[c.id] || 0}
            onClick={() => setStatusFilter(c.id)}
          >
            {c.label}
          </Chip>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            minWidth: 900,
            borderCollapse: 'collapse',
            fontFamily: TYPE.sans,
            fontSize: 12,
          }}>
            <thead>
              <tr style={{ background: 'rgba(58,58,58,0.025)' }}>
                <Th>PO code</Th>
                <Th>Vendor</Th>
                <Th>Style</Th>
                <Th right>Units</Th>
                <Th right>Cost</Th>
                <Th>Placed</Th>
                <Th>Lands</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: FADE.slate60 }}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: FADE.slate60 }}>
                  No POs in this status. Create one with + New PO.
                </td></tr>
              )}
              {!loading && filtered.map(p => (
                <Row key={p.id} po={p} styleById={styleById} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ po, styleById }) {
  const pack = styleById.get(po.style_id);
  const styleName = pack?.data?.styleName || pack?.style_name || po.style_id || '—';
  const totalCost = (Number(po.units) || 0) * (Number(po.unit_cost_usd) || 0);

  return (
    <tr
      onClick={() => {
        window.location.hash = `#plm/production/${po.id}`;
      }}
      style={{
        borderTop: `1px solid ${FADE.slate06}`,
        cursor: 'pointer',
      }}
    >
      <Td mono>{po.code || '—'}</Td>
      <Td>{po.vendor_id || '—'}</Td>
      <Td>{styleName}</Td>
      <Td right mono>{(Number(po.units) || 0).toLocaleString()}</Td>
      <Td right mono>{totalCost > 0 ? `$${Math.round(totalCost).toLocaleString()}` : '—'}</Td>
      <Td>{formatDate(po.placed_at)}</Td>
      <Td>{formatDate(po.expected_landing)}</Td>
      <Td>
        <span style={{
          ...PILL,
          background: STATUS_PILL[po.status]?.bg || FADE.slate06,
          color: STATUS_PILL[po.status]?.fg || FADE.slate60,
          border: 'none',
        }}>
          {STATUS_PILL[po.status]?.label || po.status}
        </span>
      </Td>
    </tr>
  );
}

function Th({ children, right }) {
  return (
    <th style={{
      ...EYEBROW,
      fontSize: 9,
      textAlign: right ? 'right' : 'left',
      padding: '10px 12px',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  );
}

function Td({ children, right, mono }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: right ? 'right' : 'left',
      fontFamily: mono ? TYPE.mono : TYPE.sans,
      fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      color: INV.slate,
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
    }}>
      {children}
    </td>
  );
}

function Chip({ active, count, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? INV.slate : 'transparent',
        color: active ? INV.salt : INV.stone,
        border: active ? 'none' : `1px solid ${FADE.slate10}`,
        padding: '5px 11px',
        borderRadius: 4,
        fontSize: 11,
        fontFamily: TYPE.sans,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
      {count != null && count > 0 && (
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, opacity: 0.7 }}>{count}</span>
      )}
    </button>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}
