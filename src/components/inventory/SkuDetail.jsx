// SKU detail drill-down — per-variant 12-month projection.
//
// Page composition (per docs/inventory-implementation-plan.md §3A):
//   1. Breadcrumb
//   2. Identity row — name + SKU + 4 quick stats (On hand / FWOS / Velocity / On order)
//   3. Decision strip (conditional — stockout or restock window)
//   4. 12-month CalendarStrip (default mode)
//   5. PO cards row — open POs for this style + suggested chase
//
// Explicitly NOT here (per locked spec, commit e0e3bab):
//   - Velocity matrix, by-location card, mapping cards
// Those live behind the inventory agent (Phase 7A).

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Star, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { get as getInventorySku, setTracked } from '../../utils/inventoryStore';
import { listPOs } from '../../utils/productionStore';
import { projectDailyCover } from '../../utils/coverProjection';
import { setInventoryHash } from '../../utils/inventoryRouting';
import { INV, FADE, TYPE, CARD, EYEBROW, KPI_VALUE, PILL } from './inventoryTokens';
import CalendarStrip from './CalendarStrip';
import CalendarTooltip from './CalendarTooltip';

const HORIZON_WEEKS = 52;
const HORIZON_DAYS  = HORIZON_WEEKS * 7;

const OPEN_PO_STATUSES = new Set(['placed', 'in_production']);

export default function SkuDetail({ sku }) {
  const { state } = useApp();
  const [data, setData] = useState({ loading: true, sku: null, pos: [] });
  const [tip, setTip]   = useState({ visible: false, x: 0, y: 0, date: null, state: null, poArrival: false });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getInventorySku(sku),
      listPOs(),
    ]).then(([row, pos]) => {
      if (cancelled) return;
      const stylePos = (pos || []).filter(p =>
        OPEN_PO_STATUSES.has(p.status) && row && p.style_id === row.style_id,
      );
      setData({ loading: false, sku: row, pos: stylePos });
    }).catch(err => {
      console.error('SkuDetail load:', err);
      if (!cancelled) setData({ loading: false, sku: null, pos: [] });
    });
    return () => { cancelled = true; };
  }, [sku]);

  const lift       = Number(state.assumptions?.liftMultiplier) || 1.10;
  const leadDays   = (Number(state.assumptions?.leadTime) || 10) * 7;
  const safetyDays = 21;

  const projection = useMemo(() => {
    const s = data.sku;
    if (!s) return null;
    const dailyVelocity = (s.sold_12w || 0) / 12 / 7;

    // Variant-share of each PO. If size_break exists for this size, use that;
    // else split style units across mapped variants (a rough estimate).
    const arrivals = data.pos.map(p => {
      const landing = p.expected_landing ? new Date(p.expected_landing) : null;
      let units = Number(p.units) || 0;
      if (p.size_break && s.size && p.size_break[s.size] != null) {
        units = Number(p.size_break[s.size]) || 0;
      }
      const today = new Date();
      const daysFromToday = landing
        ? Math.max(1, Math.round((landing - today) / 86400000))
        : leadDays;
      return { id: p.id, code: p.code, status: p.status, landing, units, daysFromToday };
    });

    const days = projectDailyCover({
      on_hand:        s.on_hand || 0,
      dailyVelocity,
      liftMultiplier: lift,
      leadDays,
      safetyDays,
      arrivals: arrivals.map(a => ({ daysFromToday: a.daysFromToday, units: a.units })),
      days: HORIZON_DAYS,
    });

    return { days, dailyVelocity, arrivals };
  }, [data.sku, data.pos, lift, leadDays]);

  const summary = useMemo(() => {
    if (!projection || !data.sku) return null;
    const { days, dailyVelocity } = projection;

    const stockoutIdx = days.findIndex(d => d.state === 'stockout');
    const stockoutInDays = stockoutIdx >= 0 ? stockoutIdx : null;

    const nextPOIdx = days.findIndex(d => d.poArrival);
    const nextPOInDays = nextPOIdx >= 0 ? nextPOIdx : null;

    const v = dailyVelocity * lift;
    const fwos = v > 0 ? (data.sku.on_hand || 0) / (v * 7) : null;

    return { stockoutInDays, nextPOInDays, fwos, dailyVelocity };
  }, [projection, data.sku, lift]);

  const today = new Date();

  if (data.loading) {
    return <Stub label="Loading…" sku={sku} />;
  }
  if (!data.sku) {
    return <Stub label="SKU not found" sku={sku} />;
  }

  const s = data.sku;
  const styleLabel = [s.style_name, s.color, s.size].filter(Boolean).join(' · ');

  return (
    <div>
      {/* ── Breadcrumb ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: 11,
        color: FADE.slate60,
        letterSpacing: '0.04em',
        marginBottom: 12,
        fontFamily: TYPE.sans,
      }}>
        <button
          onClick={() => setInventoryHash({ view: 'cockpit' })}
          style={{
            background: 'transparent',
            border: 'none',
            color: FADE.slate60,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 4px 0 0',
            font: 'inherit',
          }}
        >
          <ChevronLeft size={11} />
          <span>Inventory</span>
        </button>
        <span style={{ margin: '0 8px', opacity: 0.5 }}>/</span>
        <span style={{ color: INV.slate }}>{styleLabel}</span>
      </div>

      {/* ── Identity row ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 24,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', minWidth: 0 }}>
          <div style={{
            width: 56,
            height: 72,
            background: INV.slate,
            border: `1px solid ${FADE.slate10}`,
            flexShrink: 0,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{
                fontFamily: TYPE.serif,
                fontWeight: 400,
                fontSize: 26,
                margin: 0,
                lineHeight: 1.1,
                color: INV.slate,
              }}>
                {styleLabel || s.sku}
              </h1>
              <TrackedToggle sku={s.sku} tracked={s.tracked} onChange={refresh} />
              <TierPill tier={s.tier} />
            </div>
            <div style={{
              fontFamily: TYPE.mono,
              fontSize: 11,
              color: FADE.slate60,
              marginTop: 4,
            }}>
              {s.sku}
            </div>
            {s.oversold > 0 && (
              <div style={{
                marginTop: 6,
                fontSize: 10,
                color: INV.bad,
                fontFamily: TYPE.sans,
                letterSpacing: '0.04em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <AlertCircle size={10} />
                Oversold by {s.oversold} — physical reconciliation needed
              </div>
            )}
          </div>
        </div>

        {/* 4 quick stats */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <QuickStat label="On hand" value={s.on_hand.toLocaleString()} />
          <QuickStat
            label="FWOS"
            value={summary?.fwos != null ? summary.fwos.toFixed(1) : '—'}
            unit="w"
            color={summary?.fwos != null && summary.fwos < (leadDays / 7) + 3 ? INV.bad : INV.slate}
          />
          <QuickStat
            label="Velocity"
            value={summary ? summary.dailyVelocity.toFixed(1) : '—'}
            unit="/d"
          />
          <QuickStat label="On order" value={s.on_order.toLocaleString()} />
        </div>
      </div>

      {/* ── Decision strip (conditional) ───────────────────────────── */}
      <DecisionStrip
        summary={summary}
        leadWeeks={leadDays / 7}
        sku={s}
        onPause={() => handlePause(s.sku, refresh)}
      />

      {/* ── 12-month calendar ──────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: 16, position: 'relative' }}>
        <div style={{ overflowX: 'auto' }}>
          <CalendarStrip
            days={projection?.days || []}
            weeks={HORIZON_WEEKS}
            mode="default"
            startDate={today}
            showWeekNums={true}
            onCellHover={(e, day, date) => setTip({
              visible: true, x: e.clientX, y: e.clientY,
              date, state: day.state, poArrival: day.poArrival,
            })}
            onCellLeave={() => setTip(t => ({ ...t, visible: false }))}
          />
        </div>
        <Legend />
      </div>

      {/* ── PO cards row ───────────────────────────────────────────── */}
      <POCardsRow
        arrivals={projection?.arrivals || []}
        chase={buildChaseSuggestion(s, projection?.dailyVelocity || 0, lift, leadDays, safetyDays)}
      />

      <CalendarTooltip {...tip} />
    </div>
  );

  function refresh() {
    getInventorySku(sku).then(row => setData(d => ({ ...d, sku: row })));
  }
}

// ── Identity bits ────────────────────────────────────────────────────────

function QuickStat({ label, value, unit, color }) {
  return (
    <div style={{
      ...CARD,
      padding: '12px 16px',
      minWidth: 100,
    }}>
      <div style={{ ...EYEBROW, fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div style={{
        ...KPI_VALUE,
        fontSize: 22,
        color: color || INV.slate,
        lineHeight: 1,
      }}>
        {value}
        {unit && <span style={{ fontSize: 12, color: FADE.slate60, marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  );
}

function TierPill({ tier }) {
  if (!tier) return null;
  const isDrop = tier === 'Drop';
  return (
    <span style={{
      ...PILL,
      background: isDrop ? 'rgba(154,129,107,0.15)' : 'rgba(107,142,107,0.15)',
      color:      isDrop ? INV.soil : INV.good,
      border: `1px solid ${isDrop ? 'rgba(154,129,107,0.30)' : 'rgba(107,142,107,0.30)'}`,
    }}>
      {tier}
    </span>
  );
}

function TrackedToggle({ sku, tracked, onChange }) {
  return (
    <button
      onClick={async () => {
        await setTracked(sku, !tracked);
        onChange?.();
      }}
      title={tracked ? 'Tracked — click to untrack' : 'Untracked — click to track'}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <Star
        size={14}
        color={tracked ? INV.sienna : FADE.slate60}
        fill={tracked ? INV.sienna : 'transparent'}
        strokeWidth={1.5}
      />
    </button>
  );
}

// ── Decision strip ───────────────────────────────────────────────────────

function DecisionStrip({ summary, leadWeeks, sku, onPause }) {
  if (!summary) return null;

  const stockoutSoon = summary.stockoutInDays != null && summary.stockoutInDays <= 90;
  if (!stockoutSoon) return null;

  const headline = summary.nextPOInDays != null
    ? `Stockout in ${summary.stockoutInDays} days · next PO lands in ${summary.nextPOInDays} days`
    : `Stockout in ${summary.stockoutInDays} days · no PO in pipeline`;

  // Air-freight bridge sizing: cover the gap until the next PO lands +
  // a 14-day safety buffer.
  const bridgeUnits = summary.nextPOInDays != null
    ? Math.max(50, Math.round(((summary.nextPOInDays - summary.stockoutInDays) + 14) * summary.dailyVelocity / 25) * 25)
    : 0;

  return (
    <div style={{
      background: 'rgba(168,84,60,0.05)',
      border: '1px solid rgba(168,84,60,0.20)',
      borderRadius: 4,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      marginBottom: 20,
    }}>
      <h3 style={{
        margin: 0,
        fontFamily: TYPE.serif,
        fontWeight: 500,
        fontSize: 16,
        color: INV.bad,
      }}>
        {headline}
      </h3>
      <div style={{ display: 'flex', gap: 6 }}>
        <ActionButton onClick={() => alert(`Hold action — comments TODO\n${sku.sku}`)}>
          Hold
        </ActionButton>
        <ActionButton onClick={onPause}>
          Pause reorder
        </ActionButton>
        {bridgeUnits > 0 && (
          <ActionButton primary onClick={() => alert(`Air-freight ${bridgeUnits}u — modal TODO\n${sku.sku}`)}>
            Air-freight {bridgeUnits}u →
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function ActionButton({ children, primary, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderRadius: 2,
        fontSize: 11,
        letterSpacing: '0.06em',
        fontWeight: 500,
        fontFamily: TYPE.sans,
        border: `1px solid ${INV.slate}`,
        background: primary ? INV.slate : 'transparent',
        color: primary ? INV.salt : INV.slate,
        cursor: 'pointer',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </button>
  );
}

async function handlePause(sku, refresh) {
  // "Pause reorder" semantics per CLAUDE.md: untracked SKUs are excluded
  // from chase suggestions and stockout alerts. Same primitive.
  await setTracked(sku, false);
  refresh?.();
}

// ── Legend ───────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: 'Healthy',        color: INV.good },
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

// ── PO cards ─────────────────────────────────────────────────────────────

function POCardsRow({ arrivals, chase }) {
  const cards = [...arrivals];
  if (chase) cards.push({ ...chase, suggested: true });
  if (cards.length === 0) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(cards.length, 3)}, 1fr)`,
      gap: 16,
      marginBottom: 24,
    }}>
      {cards.map((c, i) => <POCard key={c.id || `chase-${i}`} card={c} />)}
    </div>
  );
}

function POCard({ card }) {
  return (
    <div style={{
      background: card.suggested ? 'rgba(245,240,232,0.5)' : INV.card,
      border: `1px ${card.suggested ? 'dashed' : 'solid'} ${FADE.slate10}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        fontFamily: TYPE.mono,
        fontSize: 10,
        color: FADE.slate60,
        textTransform: card.suggested ? 'none' : 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {card.suggested ? 'Suggested chase' : card.code}
      </div>
      <div style={{
        fontFamily: TYPE.serif,
        fontSize: 16,
        margin: '4px 0',
        lineHeight: 1.1,
        color: card.suggested ? FADE.slate60 : INV.slate,
      }}>
        {card.suggested ? `Place by ${formatShortDate(new Date())}` : `Lands ${formatShortDate(card.landing)}`}
      </div>
      <div style={{
        fontFamily: TYPE.mono,
        fontSize: 18,
        color: card.suggested ? FADE.slate60 : INV.slate,
        margin: '4px 0',
      }}>
        +{card.units.toLocaleString()}
        <span style={{ color: INV.sienna, fontSize: 10, marginLeft: 6 }}>
          {card.suggested ? `covers ${card.coversWeeks.toFixed(0)}w` : `+${card.daysOfCover} days cover`}
        </span>
      </div>
      <div style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${FADE.slate06}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10,
      }}>
        <span />
        {card.suggested ? (
          <button
            onClick={() => alert('Draft chase modal — Phase 3C')}
            style={{
              padding: '4px 10px',
              borderRadius: 2,
              fontSize: 10,
              letterSpacing: '0.06em',
              fontWeight: 500,
              fontFamily: TYPE.sans,
              border: `1px solid ${INV.slate}`,
              background: INV.slate,
              color: INV.salt,
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            Draft chase →
          </button>
        ) : (
          <StatusPill status={card.status} />
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const cfg = {
    placed:        { bg: 'rgba(212,149,106,0.12)', fg: INV.sienna, label: 'Placed' },
    in_production: { bg: 'rgba(107,142,107,0.15)', fg: INV.good,   label: 'In production' },
  }[status] || { bg: FADE.slate06, fg: FADE.slate60, label: status };

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

// ── Suggested chase math ─────────────────────────────────────────────────

function buildChaseSuggestion(sku, dailyVelocity, lift, leadDays, safetyDays) {
  if (!sku || !sku.tracked) return null;

  const v = dailyVelocity * lift;
  if (v <= 0) return null;

  // Cover lead + safety + 8 weeks of forward demand. Round to nearest 25u.
  const targetDays = leadDays + safetyDays + 56;
  const rawUnits   = (targetDays * v) - (sku.on_hand || 0) - (sku.on_order || 0);
  if (rawUnits <= 50) return null; // already covered

  const units = Math.max(50, Math.round(rawUnits / 25) * 25);
  const coversWeeks = (units / v) / 7;

  return { units, coversWeeks, daysOfCover: Math.round(units / v) };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatShortDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Stub({ label, sku }) {
  return (
    <div style={{ ...CARD, padding: 60, textAlign: 'center' }}>
      <button
        onClick={() => setInventoryHash({ view: 'cockpit' })}
        style={{
          background: 'transparent',
          border: 'none',
          color: FADE.slate60,
          fontSize: 11,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 16,
          fontFamily: TYPE.sans,
        }}
      >
        ← Back to inventory
      </button>
      <h2 style={{
        fontFamily: TYPE.serif,
        fontWeight: 400,
        fontSize: 22,
        color: INV.slate,
        margin: 0,
      }}>
        {label}
      </h2>
      <p style={{
        marginTop: 8,
        fontSize: 12,
        color: FADE.slate60,
        fontFamily: TYPE.mono,
      }}>
        {sku}
      </p>
    </div>
  );
}
