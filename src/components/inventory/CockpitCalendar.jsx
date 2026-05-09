// Cockpit multi-SKU calendar — top 6 tracked products/SKUs, each with
// a horizontal 52-week projected daily-cover strip.
//
// Filter chips: "By SKU | By product"  (default By product)
// Compact mode: 7×13 cells, 3px week gap. Untracked SKUs are NEVER shown.
//
// Click a row → #inventory/sku/<sku>.

import { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listTracked } from '../../utils/inventoryStore';
import { projectDailyCover, blendVariantInputs } from '../../utils/coverProjection';
import { setInventoryHash } from '../../utils/inventoryRouting';
import { INV, FADE, TYPE, CARD, EYEBROW } from './inventoryTokens';
import CalendarStrip from './CalendarStrip';
import CalendarTooltip from './CalendarTooltip';

const WEEKS = 52;
const HORIZON_DAYS = WEEKS * 7;
// Wide label column so full SKU codes / "Style · Color · Size" labels
// aren't clipped. The user can horizontally scroll for the right-side weeks.
const LABEL_COL_W = 360;

export default function CockpitCalendar() {
  const { state } = useApp();
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('sku'); // 'sku' | 'product'
  const [tip, setTip]   = useState({ visible: false, x: 0, y: 0, date: null, state: null, poArrival: false });

  useEffect(() => {
    let cancelled = false;
    listTracked()
      .then(rows => { if (!cancelled) { setSkus(rows); setLoading(false); } })
      .catch(err => { console.error('CockpitCalendar listTracked:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(
    () => buildRows(skus, mode, state.assumptions),
    [skus, mode, state.assumptions],
  );

  const today = new Date();

  return (
    <div style={{ ...CARD, marginBottom: 14, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={EYEBROW}>Inventory cover</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Chip active={mode === 'sku'}     onClick={() => setMode('sku')}>By SKU</Chip>
          <Chip active={mode === 'product'} onClick={() => setMode('product')}>By product</Chip>
          <span style={{
            ...EYEBROW,
            display: 'inline-flex',
            alignItems: 'center',
            color: FADE.slate60,
            paddingLeft: 4,
          }}>
            Sorted by 90d revenue
          </span>
        </div>
      </div>

      <div style={{
        overflowX: 'auto',
        marginLeft: -4,
        marginRight: -4,
        paddingLeft: 4,
        paddingRight: 4,
      }}>
        <div style={{ minWidth: WEEKS * 52 + LABEL_COL_W }}>
          {/* Header — week numbers above strips. Stays put as the body scrolls. */}
          <HeaderRow weeks={WEEKS} today={today} />

          {/* Body rows — scrollable when more than ~12 SKUs. */}
          <div style={{
            maxHeight: 480,
            overflowY: 'auto',
            // Keep the horizontal scroll synced with the parent: never
            // intercept it here.
            overflowX: 'visible',
          }}>
            {loading && <EmptyRow message="Loading…" />}
            {!loading && rows.length === 0 && <EmptyRow message="No tracked SKUs yet." />}
            {!loading && rows.map(row => (
              <CalendarRow
                key={row.id}
                row={row}
                today={today}
                onCellHover={(e, day, date) => {
                  setTip({
                    visible: true,
                    x: e.clientX,
                    y: e.clientY,
                    date,
                    state: day.state,
                    poArrival: day.poArrival,
                  });
                }}
                onCellLeave={() => setTip(t => ({ ...t, visible: false }))}
              />
            ))}
          </div>
        </div>
      </div>

      <Legend />

      <CalendarTooltip {...tip} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function HeaderRow({ weeks, today }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 6 }}>
      <div style={{ width: LABEL_COL_W, flexShrink: 0 }} />
      <div style={{ display: 'flex', gap: 3, paddingLeft: 12 }}>
        {Array.from({ length: weeks }, (_, w) => {
          const monday = new Date(today);
          monday.setDate(monday.getDate() + (w * 7) - ((today.getDay() + 6) % 7));
          const wnum = isoWeekNumber(monday);
          return (
            <div key={w} style={{
              width: 49,
              fontSize: 8.5,
              color: 'rgba(58,58,58,0.55)',
              fontFamily: "'SF Mono', monospace",
              textAlign: 'center',
              letterSpacing: '0.04em',
            }}>
              W{wnum}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

function CalendarRow({ row, today, onCellHover, onCellLeave }) {
  return (
    <div
      onClick={() => row.targetSku && setInventoryHash({ view: 'sku', sku: row.targetSku })}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 0',
        borderTop: `1px solid ${FADE.slate06}`,
        cursor: row.targetSku ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: LABEL_COL_W,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingRight: 12,
      }}>
        <Star size={11} color={INV.sienna} fill={INV.sienna} strokeWidth={1.25} />
        <span style={{
          fontFamily: TYPE.sans,
          fontSize: 12,
          color: INV.slate,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }} title={row.label}>
          {row.label}
        </span>
        <span style={{
          fontFamily: TYPE.mono,
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          color: row.fwosCritical ? INV.bad : INV.stone,
          flexShrink: 0,
        }}>
          {row.fwos != null ? `${row.fwos.toFixed(1)}w` : '—'}
        </span>
      </div>

      <div style={{ paddingLeft: 12 }}>
        <CalendarStrip
          days={row.days}
          weeks={WEEKS}
          mode="compact"
          startDate={today}
          showWeekNums={false}
          onCellHover={onCellHover}
          onCellLeave={onCellLeave}
        />
      </div>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? INV.slate : 'transparent',
        color: active ? INV.salt : INV.stone,
        border: active ? 'none' : `1px solid ${FADE.slate10}`,
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: TYPE.sans,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function EmptyRow({ message }) {
  return (
    <div style={{
      padding: '18px 0',
      fontSize: 12,
      color: FADE.slate60,
      fontFamily: TYPE.sans,
    }}>
      {message}
    </div>
  );
}

function Legend() {
  const items = [
    { label: 'Healthy',       color: INV.good },
    { label: 'Restock window', color: INV.warn },
    { label: 'Stockout',       color: INV.bad },
    { label: 'PO arrival',     outline: INV.sienna },
    { label: 'Today',          outline: INV.slate },
  ];
  return (
    <div style={{
      display: 'flex',
      gap: 14,
      marginTop: 12,
      paddingTop: 10,
      borderTop: `1px solid ${FADE.slate06}`,
      fontSize: 10,
      fontFamily: TYPE.sans,
      color: FADE.slate60,
      letterSpacing: '0.04em',
    }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: 1,
            background: it.color || 'transparent',
            outline: it.outline ? `1px solid ${it.outline}` : 'none',
            outlineOffset: -1,
          }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── Row builder ───────────────────────────────────────────────────────────

function buildRows(skus, mode, assumptions) {
  if (!skus.length) return [];

  const lift     = Number(assumptions?.liftMultiplier) || 1.10;
  const leadDays = (Number(assumptions?.leadTime) || 10) * 7;
  const safetyDays = 21;

  // Build per-SKU CoverInput.
  const inputs = skus.map(s => ({
    sku: s.sku,
    style_id: s.style_id,
    cover: {
      on_hand:        s.on_hand || 0,
      dailyVelocity:  (s.sold_12w || 0) / 12 / 7,
      liftMultiplier: lift,
      leadDays,
      safetyDays,
      arrivals:       s.on_order > 0
        ? [{ daysFromToday: leadDays, units: s.on_order }]
        : [],
      days: HORIZON_DAYS,
    },
    label: `${s.style_name}${mode === 'sku' ? ` · ${s.color || ''} ${s.size || ''}`.trim() : ''}`,
    revenue90: (s.sold_12w || 0) * (s.retail || 0) * (90 / 84),
    weeklyVelocity: (s.sold_12w || 0) / 12,
  }));

  if (mode === 'sku') {
    // All tracked SKUs, sorted by trailing 90d revenue. The container
    // adds vertical scroll past ~12 rows.
    return inputs
      .sort((a, b) => b.revenue90 - a.revenue90)
      .map(x => projectionToRow(x.sku, x.label, x.cover, x.weeklyVelocity, lift, x.sku));
  }

  // By-product mode: blend variants of the same style_id, rank by total revenue.
  const byStyle = new Map();
  for (const x of inputs) {
    if (!x.style_id) continue;
    if (!byStyle.has(x.style_id)) byStyle.set(x.style_id, []);
    byStyle.get(x.style_id).push(x);
  }

  const productRows = [];
  for (const [styleId, variants] of byStyle) {
    const blended = blendVariantInputs(variants.map(v => v.cover));
    const totalRevenue = variants.reduce((s, v) => s + v.revenue90, 0);
    const totalVel     = variants.reduce((s, v) => s + v.weeklyVelocity, 0);
    const targetSku    = variants[0]?.sku || '';
    const label        = variants[0]?.label.split(' · ')[0] || styleId;
    productRows.push({
      id: styleId,
      label,
      revenue90: totalRevenue,
      weeklyVelocity: totalVel,
      cover: blended,
      targetSku,
    });
  }

  return productRows
    .sort((a, b) => b.revenue90 - a.revenue90)
    .map(x => projectionToRow(x.id, x.label, x.cover, x.weeklyVelocity, lift, x.targetSku));
}

function projectionToRow(id, label, cover, weeklyVelocity, lift, targetSku) {
  const days = projectDailyCover(cover);
  const v    = (weeklyVelocity || 0) * (lift || 1);
  const fwos = v > 0 ? cover.on_hand / v : null;
  return {
    id,
    label,
    days,
    fwos,
    fwosCritical: fwos != null && fwos < (cover.leadDays / 7) + 3,
    targetSku,
  };
}

function isoWeekNumber(d) {
  const target = new Date(d.getTime());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}
