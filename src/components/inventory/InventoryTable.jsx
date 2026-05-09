// Inventory Table — the SKU master ledger.
//
// Per docs/inventory-implementation-plan.md §4A:
//   Filter chips: All / ★ Tracked / ☆ Untracked / Critical / Stockout /
//                 Reorder / Healthy / Overstock
//   Columns:    Star · Swatch · Style/SKU · Tier · Color/Size · On Hand ·
//               On Order · Vel/wk · WOS · Sell-Thru · GMROI · Status
//   Sort:       default Weeks of Supply ascending
//   Untracked rows: 0.45 opacity, status pill reads "Untracked"
//   Click row → #inventory/sku/<sku>
//   Click star → setTracked(sku, !tracked) — persists to inventoryStore
//                + tracking_audit (append-only).

import { useEffect, useMemo, useState } from 'react';
import { Star, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { list as listInventory, setTracked } from '../../utils/inventoryStore';
import { forwardWOS } from '../../utils/coverProjection';
import { setInventoryHash } from '../../utils/inventoryRouting';
import { INV, FADE, TYPE, CARD, EYEBROW, PILL, SECTION_TITLE } from './inventoryTokens';

// ── Health bucket math (mirrors InventoryHealth, with reorder_now +
// reorder_soon collapsed into a single "reorder" bucket per the spec) ──

function bucketOf(s, leadWeeks, lift) {
  const wkVel = (s.sold_12w || 0) / 12;
  const fwos  = forwardWOS(s.on_hand || 0, wkVel, lift);
  if ((s.on_hand || 0) <= 0)         return 'stockout';
  if (fwos == null)                  return 'healthy';   // no velocity, hold
  if (fwos <= leadWeeks)             return 'critical';
  if (fwos <= leadWeeks + 8)         return 'reorder';
  if (fwos > 26)                     return 'overstock';
  return 'healthy';
}

const STATUS_PILL = {
  stockout:  { label: 'Stockout',   bg: 'rgba(168,84,60,0.15)',  fg: INV.bad },
  critical:  { label: 'Critical',   bg: 'rgba(168,84,60,0.10)',  fg: INV.bad },
  reorder:   { label: 'Reorder',    bg: 'rgba(200,146,74,0.15)', fg: INV.warn },
  healthy:   { label: 'Healthy',    bg: 'rgba(107,142,107,0.15)', fg: INV.good },
  overstock: { label: 'Overstock',  bg: 'rgba(181,199,211,0.30)', fg: '#5C7385' },
  untracked: { label: 'Untracked',  bg: FADE.slate06,            fg: FADE.slate60 },
};

const TRACK_FILTERS  = ['all', 'tracked', 'untracked'];
const STATUS_FILTERS = ['critical', 'stockout', 'reorder', 'healthy', 'overstock'];

// Sort keys keyed by column; UI flips direction on second click.
const SORT_LABELS = {
  wos:       'WOS',
  on_hand:   'On Hand',
  on_order:  'On Order',
  vel_wk:    'Vel/wk',
  sell_thru: 'Sell-Thru',
  gmroi:     'GMROI',
  style:     'Style A→Z',
};

// ── Component ────────────────────────────────────────────────────────────

export default function InventoryTable() {
  const { state } = useApp();
  const [skus, setSkus]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackFilter,  setTrackFilter]  = useState('all');
  const [statusFilter, setStatusFilter] = useState(null);
  const [sortKey, setSortKey] = useState('wos');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    listInventory()
      .then(rows => { setSkus(rows); setLoading(false); })
      .catch(err => { console.error('InventoryTable list:', err); setLoading(false); });
  }

  const lift      = Number(state.assumptions?.liftMultiplier) || 1.10;
  const leadWeeks = Number(state.assumptions?.leadTime) || 10;
  const cogsRate  = Number(state.assumptions?.cogsRate) || 0.40;
  const grossMargin = 1 - cogsRate;

  // Decorate every SKU with the derived metrics the table needs.
  const decorated = useMemo(() => {
    return skus.map(s => {
      const wkVel = (s.sold_12w || 0) / 12;
      const fwos  = forwardWOS(s.on_hand || 0, wkVel, lift);
      const denom = (s.on_hand || 0) + (s.sold_12w || 0) + (s.allocated || 0);
      const sellThru = denom > 0 ? (s.sold_12w || 0) / denom : null;
      const annualRev = (s.sold_12w || 0) * 4.33 * (s.retail || 0);
      const invAtCost = (s.on_hand || 0) * (s.cost || 0);
      const gmroi = invAtCost > 0 ? (annualRev * grossMargin) / invAtCost : null;
      const status = s.tracked ? bucketOf(s, leadWeeks, lift) : 'untracked';
      return { s, wkVel, fwos, sellThru, gmroi, status };
    });
  }, [skus, lift, leadWeeks, grossMargin]);

  // Counts for the chip strip — counted on the *unfiltered* set so the
  // numbers stay stable regardless of which chip is active.
  const counts = useMemo(() => {
    const out = {
      all: decorated.length,
      tracked: 0,
      untracked: 0,
      stockout: 0, critical: 0, reorder: 0, healthy: 0, overstock: 0,
    };
    for (const d of decorated) {
      if (d.s.tracked) out.tracked++;
      else             out.untracked++;
      // Per-status counts only count tracked SKUs — untracked don't
      // get a real bucket.
      if (d.s.tracked) out[d.status] = (out[d.status] || 0) + 1;
    }
    return out;
  }, [decorated]);

  // Apply filters.
  const filtered = useMemo(() => {
    return decorated.filter(d => {
      if (trackFilter === 'tracked'   && !d.s.tracked) return false;
      if (trackFilter === 'untracked' &&  d.s.tracked) return false;
      if (statusFilter && d.status !== statusFilter)   return false;
      return true;
    });
  }, [decorated, trackFilter, statusFilter]);

  // Sort.
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Sensible defaults: descending for big-is-better metrics, asc for WOS.
      setSortDir(['vel_wk', 'on_hand', 'on_order', 'sell_thru', 'gmroi'].includes(key) ? 'desc' : 'asc');
    }
  }

  async function handleStarClick(sku, currentlyTracked, e) {
    e.stopPropagation();
    await setTracked(sku, !currentlyTracked);
    refresh();
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={EYEBROW}>Inventory</div>
        <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>SKU master ledger</h3>
      </div>

      {/* ── Filter chip strip ──────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}>
        <Chip active={trackFilter === 'all'}       count={counts.all}       onClick={() => setTrackFilter('all')}>All</Chip>
        <Chip active={trackFilter === 'tracked'}   count={counts.tracked}   onClick={() => setTrackFilter('tracked')}>★ Tracked</Chip>
        <Chip active={trackFilter === 'untracked'} count={counts.untracked} onClick={() => setTrackFilter('untracked')}>☆ Untracked</Chip>

        <span style={{
          width: 1,
          height: 18,
          background: FADE.slate10,
          margin: '0 4px',
        }} />

        {STATUS_FILTERS.map(b => (
          <Chip
            key={b}
            active={statusFilter === b}
            count={counts[b] || 0}
            onClick={() => setStatusFilter(statusFilter === b ? null : b)}
          >
            {STATUS_PILL[b].label}
          </Chip>
        ))}

        <div style={{ marginLeft: 'auto' }}>
          <SortSelector
            sortKey={sortKey}
            sortDir={sortDir}
            onChange={(k, d) => { setSortKey(k); setSortDir(d); }}
          />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div style={{
        ...CARD,
        padding: 0,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            minWidth: 1100,
            borderCollapse: 'collapse',
            fontFamily: TYPE.sans,
            fontSize: 12,
          }}>
            <thead>
              <tr style={{ background: 'rgba(58,58,58,0.025)' }}>
                <Th />
                <Th />
                <Th sortable sortKey="style"     active={sortKey} dir={sortDir} onClick={toggleSort}>Style / SKU</Th>
                <Th>Tier</Th>
                <Th>Color / Size</Th>
                <Th right sortable sortKey="on_hand"   active={sortKey} dir={sortDir} onClick={toggleSort}>On Hand</Th>
                <Th right sortable sortKey="on_order"  active={sortKey} dir={sortDir} onClick={toggleSort}>On Order</Th>
                <Th right sortable sortKey="vel_wk"    active={sortKey} dir={sortDir} onClick={toggleSort}>Vel/wk</Th>
                <Th right sortable sortKey="wos"       active={sortKey} dir={sortDir} onClick={toggleSort}>WOS</Th>
                <Th right sortable sortKey="sell_thru" active={sortKey} dir={sortDir} onClick={toggleSort}>Sell-Thru</Th>
                <Th right sortable sortKey="gmroi"     active={sortKey} dir={sortDir} onClick={toggleSort}>GMROI</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} style={{ padding: '24px 16px', color: FADE.slate60, textAlign: 'center' }}>
                  Loading…
                </td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={12} style={{ padding: '24px 16px', color: FADE.slate60, textAlign: 'center' }}>
                  No SKUs match this filter.
                </td></tr>
              )}
              {!loading && sorted.map(d => (
                <Row
                  key={d.s.sku}
                  d={d}
                  leadWeeks={leadWeeks}
                  onStarClick={handleStarClick}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────

function Row({ d, leadWeeks, onStarClick }) {
  const { s, wkVel, fwos, sellThru, gmroi, status } = d;
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
        <button
          onClick={(e) => onStarClick(s.sku, s.tracked, e)}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
          }}
          title={s.tracked ? 'Tracked — click to untrack' : 'Untracked — click to track'}
        >
          <Star
            size={12}
            color={s.tracked ? INV.sienna : FADE.slate60}
            fill={s.tracked ? INV.sienna : 'transparent'}
            strokeWidth={1.5}
          />
        </button>
      </Td>
      <Td>
        <div style={{
          width: 22,
          height: 28,
          background: swatchFor(s.color),
          border: `1px solid ${FADE.slate10}`,
          flexShrink: 0,
        }} />
      </Td>
      <Td>
        <div style={{ color: INV.slate, fontWeight: 500, lineHeight: 1.25 }}>
          {s.style_name || '—'}
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
      <Td>
        <span style={{
          fontSize: 9,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: s.tier === 'Drop' ? INV.soil : INV.slate,
        }}>
          {s.tier || '—'}
        </span>
      </Td>
      <Td>
        {[s.color, s.size].filter(Boolean).join(' / ') || '—'}
      </Td>
      <Td right mono>{s.on_hand?.toLocaleString() ?? '—'}</Td>
      <Td right mono faded={!s.on_order}>
        {s.on_order ? s.on_order.toLocaleString() : '—'}
      </Td>
      <Td right mono>{wkVel ? wkVel.toFixed(1) : '—'}</Td>
      <Td right mono bad={wosBad}>
        {fwos != null ? fwos.toFixed(1) : '—'}
      </Td>
      <Td right mono>{sellThru != null ? `${(sellThru * 100).toFixed(0)}%` : '—'}</Td>
      <Td right mono>{gmroi != null ? `${gmroi.toFixed(1)}×` : '—'}</Td>
      <Td>
        <StatusPill status={status} />
      </Td>
    </tr>
  );
}

// ── Cells / chips / sort UI ──────────────────────────────────────────────

function Th({ children, right, sortable, sortKey, active, dir, onClick }) {
  const isActive = sortable && active === sortKey;
  return (
    <th
      onClick={sortable ? () => onClick(sortKey) : undefined}
      style={{
        ...EYEBROW,
        fontSize: 9,
        textAlign: right ? 'right' : 'left',
        padding: '10px 12px',
        whiteSpace: 'nowrap',
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        color: isActive ? INV.slate : FADE.slate60,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {children}
        {isActive && (dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </span>
    </th>
  );
}

function Td({ children, right, mono, bad, faded }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: right ? 'right' : 'left',
      fontFamily: mono ? TYPE.mono : TYPE.sans,
      fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      color: bad ? INV.bad : faded ? FADE.slate60 : INV.slate,
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
        <span style={{
          fontFamily: TYPE.mono,
          fontSize: 10,
          opacity: 0.7,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

function StatusPill({ status }) {
  const cfg = STATUS_PILL[status] || STATUS_PILL.healthy;
  return (
    <span style={{
      ...PILL,
      background: cfg.bg,
      color: cfg.fg,
      border: 'none',
    }}>
      {cfg.label}
    </span>
  );
}

function SortSelector({ sortKey, sortDir, onChange }) {
  const dirLabel = sortDir === 'asc' ? 'asc' : 'desc';
  return (
    <select
      value={`${sortKey}:${sortDir}`}
      onChange={(e) => {
        const [k, d] = e.target.value.split(':');
        onChange(k, d);
      }}
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
      {Object.entries(SORT_LABELS).map(([k, label]) => (
        [
          <option key={`${k}:asc`}  value={`${k}:asc`}>Sort: {label} (asc)</option>,
          <option key={`${k}:desc`} value={`${k}:desc`}>Sort: {label} (desc)</option>,
        ]
      ))}
    </select>
  );
}

// ── Sort + swatch helpers ────────────────────────────────────────────────

function sortRows(rows, key, dir) {
  const mult = dir === 'asc' ? 1 : -1;
  const get = {
    style:     d => (d.s.style_name || '').toLowerCase(),
    on_hand:   d => d.s.on_hand || 0,
    on_order:  d => d.s.on_order || 0,
    vel_wk:    d => d.wkVel || 0,
    wos:       d => d.fwos != null ? d.fwos : Number.POSITIVE_INFINITY,
    sell_thru: d => d.sellThru != null ? d.sellThru : -1,
    gmroi:     d => d.gmroi != null ? d.gmroi : -1,
  }[key] || (d => d.fwos);

  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (va < vb) return -1 * mult;
    if (va > vb) return  1 * mult;
    return 0;
  });
}

// Match the swatch palette from UrgentReorders so colors stay consistent
// across the cockpit and the master table.
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
