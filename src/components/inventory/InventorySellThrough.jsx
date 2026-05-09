// Inventory Sell-Through — velocity matrix per spec §5A.
//
// Columns: Swatch · Style/SKU · On Hand · 7d · 14d · 30d · 90d · FWOS · Status
// Tracked-only by default; toggle in the filter strip to show untracked.
// Click any row → SKU detail.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { list as listInventory } from '../../utils/inventoryStore';
import {
  SELL_THROUGH_WINDOWS,
  unitsInWindow,
  velocityForWindow,
} from '../../utils/sellThroughStore';
import { forwardWOS } from '../../utils/coverProjection';
import { setInventoryHash } from '../../utils/inventoryRouting';
import { INV, FADE, TYPE, CARD, EYEBROW, PILL, SECTION_TITLE } from './inventoryTokens';

// Mirror InventoryTable's status math so the two views agree.
function bucketOf(s, fwos, leadWeeks) {
  if ((s.on_hand || 0) <= 0)         return 'stockout';
  if (fwos == null)                  return 'healthy';
  if (fwos <= leadWeeks)             return 'critical';
  if (fwos <= leadWeeks + 8)         return 'reorder';
  if (fwos > 26)                     return 'overstock';
  return 'healthy';
}

const STATUS_PILL = {
  stockout:  { label: 'Stockout',   bg: 'rgba(168,84,60,0.15)',   fg: INV.bad },
  critical:  { label: 'Critical',   bg: 'rgba(168,84,60,0.10)',   fg: INV.bad },
  reorder:   { label: 'Reorder',    bg: 'rgba(200,146,74,0.15)',  fg: INV.warn },
  healthy:   { label: 'Healthy',    bg: 'rgba(107,142,107,0.15)', fg: INV.good },
  overstock: { label: 'Overstock',  bg: 'rgba(181,199,211,0.30)', fg: '#5C7385' },
  untracked: { label: 'Untracked',  bg: FADE.slate06,             fg: FADE.slate60 },
};

export default function InventorySellThrough() {
  const { state } = useApp();
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState('tracked'); // tracked | all
  const [sortKey, setSortKey] = useState('fwos'); // fwos | velocity_30d | velocity_7d

  useEffect(() => {
    listInventory()
      .then(rows => { setSkus(rows); setLoading(false); })
      .catch(err => { console.error('InventorySellThrough:', err); setLoading(false); });
  }, []);

  const lift = Number(state.assumptions?.liftMultiplier) || 1.10;
  const leadWeeks = Number(state.assumptions?.leadTime) || 10;

  const today = useMemo(() => new Date(), []);

  const decorated = useMemo(() => {
    return skus.map(s => {
      const wkVel = (s.sold_12w || 0) / 12;
      const fwos  = forwardWOS(s.on_hand || 0, wkVel, lift);
      const windows = {};
      for (const w of SELL_THROUGH_WINDOWS) {
        windows[w] = {
          units: unitsInWindow(s.salesByDay || {}, w, today),
          velocity: velocityForWindow(s.salesByDay || {}, w, today),
        };
      }
      const status = s.tracked ? bucketOf(s, fwos, leadWeeks) : 'untracked';
      return { s, fwos, wkVel, windows, status };
    });
  }, [skus, lift, leadWeeks, today]);

  const filtered = useMemo(() => {
    return decorated.filter(d => {
      if (trackFilter === 'tracked' && !d.s.tracked) return false;
      return true;
    });
  }, [decorated, trackFilter]);

  const sorted = useMemo(() => {
    const get = {
      fwos:        d => d.fwos != null ? d.fwos : Number.POSITIVE_INFINITY,
      velocity_30d: d => -(d.windows[30]?.velocity || 0),
      velocity_7d:  d => -(d.windows[7]?.velocity || 0),
      style:        d => (d.s.style_name || '').toLowerCase(),
    }[sortKey] || (d => d.fwos);
    return [...filtered].sort((a, b) => {
      const va = get(a), vb = get(b);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
  }, [filtered, sortKey]);

  const counts = useMemo(() => ({
    all: decorated.length,
    tracked: decorated.filter(d => d.s.tracked).length,
  }), [decorated]);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={EYEBROW}>Sell-through</div>
        <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>Velocity matrix</h3>
        <p style={{
          fontSize: 11,
          color: FADE.slate60,
          fontFamily: TYPE.sans,
          margin: '4px 0 0',
        }}>
          Trailing 7 / 14 / 30 / 90 day units sold per SKU, with ad-adjusted forward weeks of supply.
        </p>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Chip active={trackFilter === 'tracked'} count={counts.tracked} onClick={() => setTrackFilter('tracked')}>
          ★ Tracked only
        </Chip>
        <Chip active={trackFilter === 'all'} count={counts.all} onClick={() => setTrackFilter('all')}>
          All SKUs
        </Chip>

        <div style={{ marginLeft: 'auto' }}>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            style={{
              fontFamily: TYPE.sans,
              fontSize: 11,
              background: 'transparent',
              border: `1px solid ${FADE.slate10}`,
              borderRadius: 4,
              padding: '4px 8px',
              color: INV.slate,
              cursor: 'pointer',
            }}
          >
            <option value="fwos">Sort: FWOS (asc)</option>
            <option value="velocity_30d">Sort: 30d velocity (desc)</option>
            <option value="velocity_7d">Sort: 7d velocity (desc)</option>
            <option value="style">Sort: Style A→Z</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            minWidth: 950,
            borderCollapse: 'collapse',
            fontFamily: TYPE.sans,
            fontSize: 12,
          }}>
            <thead>
              <tr style={{ background: 'rgba(58,58,58,0.025)' }}>
                <Th />
                <Th>Style / SKU</Th>
                <Th right>On Hand</Th>
                <Th right>7d</Th>
                <Th right>14d</Th>
                <Th right>30d</Th>
                <Th right>90d</Th>
                <Th right>FWOS</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: FADE.slate60 }}>
                  Loading…
                </td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: FADE.slate60 }}>
                  No SKUs match this filter. Sync from Shopify to populate the snapshot.
                </td></tr>
              )}
              {!loading && sorted.map(d => (
                <Row key={d.s.sku} d={d} leadWeeks={leadWeeks} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ d, leadWeeks }) {
  const { s, fwos, windows, status } = d;
  const muted = !s.tracked;
  const wosBad = fwos != null && fwos <= leadWeeks && s.tracked;

  return (
    <tr
      onClick={() => setInventoryHash({ view: 'sku', sku: s.sku })}
      style={{
        borderTop: `1px solid ${FADE.slate06}`,
        cursor: 'pointer',
        opacity: muted ? 0.45 : 1,
      }}
    >
      <Td>
        <div style={{
          width: 22,
          height: 28,
          background: swatchFor(s.color),
          border: `1px solid ${FADE.slate10}`,
        }} />
      </Td>
      <Td>
        <div style={{ color: INV.slate, fontWeight: 500, lineHeight: 1.25 }}>
          {s.style_name || '—'}
          {(s.color || s.size) && (
            <span style={{ color: FADE.slate60, fontWeight: 400 }}>
              {s.color ? ` · ${s.color}` : ''}{s.size ? ` · ${s.size}` : ''}
            </span>
          )}
        </div>
        <div style={{
          fontFamily: TYPE.mono,
          fontSize: 9,
          color: FADE.slate60,
          marginTop: 2,
        }}>
          {s.sku}
        </div>
      </Td>
      <Td right mono>{s.on_hand?.toLocaleString() ?? '—'}</Td>
      <Td right mono>{windows[7]?.units || 0}</Td>
      <Td right mono>{windows[14]?.units || 0}</Td>
      <Td right mono>{windows[30]?.units || 0}</Td>
      <Td right mono>{windows[90]?.units || 0}</Td>
      <Td right mono bad={wosBad}>{fwos != null ? fwos.toFixed(1) : '—'}</Td>
      <Td>
        <span style={{
          ...PILL,
          background: STATUS_PILL[status]?.bg || FADE.slate06,
          color: STATUS_PILL[status]?.fg || FADE.slate60,
          border: 'none',
        }}>
          {STATUS_PILL[status]?.label || status}
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

function Td({ children, right, mono, bad }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: right ? 'right' : 'left',
      fontFamily: mono ? TYPE.mono : TYPE.sans,
      fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      color: bad ? INV.bad : INV.slate,
      fontWeight: bad ? 600 : 'normal',
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
      {count != null && (
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, opacity: 0.7 }}>
          {count}
        </span>
      )}
    </button>
  );
}

function swatchFor(colorName) {
  if (!colorName) return INV.sand;
  const lc = colorName.toLowerCase();
  if (lc.includes('slate'))  return '#3A3A3A';
  if (lc.includes('salt'))   return '#F5F0E8';
  if (lc.includes('sand'))   return '#EBE5D5';
  if (lc.includes('soil'))   return '#9A816B';
  if (lc.includes('stone'))  return '#716F70';
  if (lc.includes('sienna')) return INV.sienna;
  if (lc.includes('black'))  return '#1A1A1A';
  if (lc.includes('white'))  return '#FAFAFA';
  if (lc.includes('cream'))  return '#F2EBD7';
  if (lc.includes('navy'))   return '#1B2741';
  return INV.stone;
}
