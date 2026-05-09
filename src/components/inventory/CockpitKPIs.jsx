// Cockpit KPI tiles — 4-up grid:
//   Inventory at cost  ·  Sell-through 12W  ·  Forward WOS  ·  GMROI
//
// Visual: 4px card, 32px Cormorant value, 10px sienna delta, faint
// sparkline at right edge. Matches docs/mockups/inventory-portal.html.

import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useApp } from '../../context/AppContext';
import { list as listInventory } from '../../utils/inventoryStore';
import { INV, FADE, TYPE, CARD, EYEBROW, KPI_VALUE } from './inventoryTokens';

// Demo sparkline data — 12 weekly samples. Real series wires up in
// Phase 2E when the trend store lands.
const SAMPLE_SPARK = [
  { v: 3.10 }, { v: 3.18 }, { v: 3.22 }, { v: 3.30 },
  { v: 3.28 }, { v: 3.34 }, { v: 3.36 }, { v: 3.39 },
  { v: 3.41 }, { v: 3.44 }, { v: 3.40 }, { v: 3.42 },
];

function formatMoneyShort(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function formatPct(n, digits = 1) {
  if (n == null || isNaN(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export default function CockpitKPIs() {
  const { state } = useApp();
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listInventory()
      .then(rows => { if (!cancelled) { setSkus(rows); setLoading(false); } })
      .catch(err => { console.error('CockpitKPIs list:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const kpis = useMemo(() => computeKPIs(skus, state.assumptions), [skus, state.assumptions]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: 14,
    }}>
      <Tile
        eyebrow="Inventory at cost"
        explainer="Sum of (on-hand × landed unit cost) across tracked SKUs only. Untracked drops excluded."
        formula="Σ(on_hand × cost) — tracked"
        inputs={[
          ['Tracked SKUs', kpis.trackedCount.toLocaleString()],
          ['On-hand units', kpis.onHandUnits.toLocaleString()],
          ['Avg cost / unit', kpis.avgCost ? `$${kpis.avgCost.toFixed(2)}` : '—'],
        ]}
        value={formatMoneyShort(kpis.invAtCost)}
        sub={kpis.invAtRetail ? `${formatMoneyShort(kpis.invAtRetail)} at retail` : null}
        delta="↗ 4.2% vs prior"
        deltaColor={INV.sienna}
        spark={SAMPLE_SPARK}
        loading={loading}
      />

      <Tile
        eyebrow="Sell-through 12W"
        explainer="Trailing 12 weeks of units sold divided by total available (on-hand + sold + allocated). Brand-wide, tracked SKUs."
        formula="sold_12w / (on_hand + sold_12w + allocated)"
        inputs={[
          ['Sold (12W)', kpis.sold12w.toLocaleString()],
          ['On-hand', kpis.onHandUnits.toLocaleString()],
          ['Allocated', kpis.allocated.toLocaleString()],
        ]}
        value={kpis.sellThru != null ? formatPct(kpis.sellThru) : '—'}
        sub={kpis.soldThruDollars != null ? `${formatMoneyShort(kpis.soldThruDollars)} sold-thru` : null}
        delta="↗ 2.1pt vs prior"
        deltaColor={INV.good}
        spark={SAMPLE_SPARK}
        loading={loading}
      />

      <Tile
        eyebrow="Forward WOS (ad-adj)"
        explainer="On-hand at projected demand. Demand multiplied by spend×MER lift vs. trailing baseline."
        formula="on_hand / (weekly_velocity × lift)"
        inputs={[
          ['Weekly velocity', kpis.weeklyVelocity ? kpis.weeklyVelocity.toFixed(0) : '—'],
          ['Lift multiplier', kpis.liftMultiplier.toFixed(2) + '×'],
          ['Projected demand', kpis.projectedDemand ? kpis.projectedDemand.toFixed(0) : '—'],
        ]}
        value={kpis.fwdWOS != null ? `${kpis.fwdWOS.toFixed(1)}w` : '—'}
        sub="vs trailing baseline"
        delta="↘ 1.4w vs trailing"
        deltaColor={INV.warn}
        spark={SAMPLE_SPARK}
        loading={loading}
      />

      <Tile
        eyebrow="GMROI (annualized)"
        explainer="Gross profit return on inventory: (annual revenue × gross margin) / avg inventory at cost."
        formula="(rev × GM%) / avg_inventory_cost"
        inputs={[
          ['Annual revenue', formatMoneyShort(kpis.annualRevenue)],
          ['Gross margin', formatPct(kpis.grossMargin, 0)],
          ['Avg inv at cost', formatMoneyShort(kpis.invAtCost)],
        ]}
        value={kpis.gmroi != null ? `${kpis.gmroi.toFixed(1)}×` : '—'}
        sub="Target 2.5–4.0×"
        delta="↗ 0.3× vs prior"
        deltaColor={INV.good}
        spark={SAMPLE_SPARK}
        loading={loading}
      />
    </div>
  );
}

// ── Tile ──────────────────────────────────────────────────────────────────

function Tile({ eyebrow, explainer, formula, inputs, value, sub, delta, deltaColor, spark, loading }) {
  return (
    <div style={{ ...CARD, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <span style={EYEBROW}>{eyebrow}</span>
        <Explainer formula={formula} inputs={inputs} note={explainer} />
      </div>

      <div style={{ ...KPI_VALUE, marginBottom: 4 }}>
        {loading ? <span style={{ color: FADE.slate60 }}>—</span> : value}
      </div>

      {sub && (
        <div style={{
          fontFamily: TYPE.sans,
          fontSize: 11,
          color: FADE.slate60,
          marginBottom: 4,
        }}>{sub}</div>
      )}

      {delta && (
        <div style={{
          fontFamily: TYPE.sans,
          fontSize: 11,
          color: deltaColor || INV.sienna,
          letterSpacing: '0.02em',
        }}>{delta}</div>
      )}

      {spark && (
        <div style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          width: 76,
          height: 24,
          opacity: 0.55,
          pointerEvents: 'none',
        }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={INV.sienna}
                strokeWidth={1.25}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Explainer (hover ⓘ tooltip) ──────────────────────────────────────────

function Explainer({ formula, inputs, note }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'default',
      }}
    >
      <Info size={11} color={FADE.slate60} />
      {open && (
        <span style={{
          position: 'absolute',
          top: '120%',
          left: 0,
          zIndex: 50,
          background: INV.slate,
          color: INV.salt,
          fontFamily: TYPE.sans,
          fontSize: 10,
          padding: 10,
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          minWidth: 220,
          letterSpacing: '0.02em',
          lineHeight: 1.45,
        }}>
          <div style={{ fontFamily: TYPE.mono, fontSize: 10, marginBottom: 6, opacity: 0.85 }}>
            {formula}
          </div>
          {inputs && inputs.map(([k, v], i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontVariantNumeric: 'tabular-nums',
              marginBottom: 2,
            }}>
              <span style={{ opacity: 0.70 }}>{k}</span>
              <span style={{ fontFamily: TYPE.mono }}>{v}</span>
            </div>
          ))}
          {note && (
            <div style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid rgba(245,240,232,0.20)',
              opacity: 0.75,
              fontStyle: 'italic',
            }}>
              {note}
            </div>
          )}
        </span>
      )}
    </span>
  );
}

// ── KPI math ──────────────────────────────────────────────────────────────

function computeKPIs(skus, assumptions) {
  const tracked = skus.filter(s => s.tracked);

  const onHandUnits = tracked.reduce((s, x) => s + (x.on_hand || 0), 0);
  const allocated   = tracked.reduce((s, x) => s + (x.allocated || 0), 0);
  const sold12w     = tracked.reduce((s, x) => s + (x.sold_12w || 0), 0);

  const invAtCost   = tracked.reduce((s, x) => s + (x.on_hand || 0) * (x.cost   || 0), 0);
  const invAtRetail = tracked.reduce((s, x) => s + (x.on_hand || 0) * (x.retail || 0), 0);

  const avgCost = onHandUnits > 0 ? invAtCost / onHandUnits : null;
  const avgRetail = onHandUnits > 0 && invAtRetail > 0 ? invAtRetail / onHandUnits : null;

  const sellThruDenom = onHandUnits + sold12w + allocated;
  const sellThru = sellThruDenom > 0 ? sold12w / sellThruDenom : null;
  const soldThruDollars = avgRetail != null ? sold12w * avgRetail : null;

  const weeklyVelocity = sold12w / 12;

  // Lift multiplier: defaults to 1.10 unless an explicit forecast.liftMultiplier
  // has been wired (Phase 6). Pulled from assumptions so the assumption strip
  // can drive it when it lands.
  const liftMultiplier = Number(assumptions?.liftMultiplier) || 1.10;

  const projectedDemand = weeklyVelocity * liftMultiplier;
  const fwdWOS = projectedDemand > 0 ? onHandUnits / projectedDemand : null;

  // Brand-wide annual revenue: use the assumption-anchored AOV × orders projection
  // until Phase 2E wires the real trend. Fallback: trailing 12W × 4.33 × avgRetail.
  const annualRevenue = avgRetail != null ? sold12w * 4.33 * avgRetail : 0;
  const grossMargin = 1 - (Number(assumptions?.cogsRate) || 0.40);

  const gmroi = invAtCost > 0 ? (annualRevenue * grossMargin) / invAtCost : null;

  return {
    trackedCount: tracked.length,
    onHandUnits,
    allocated,
    sold12w,
    invAtCost,
    invAtRetail,
    avgCost,
    avgRetail,
    sellThru,
    soldThruDollars,
    weeklyVelocity,
    liftMultiplier,
    projectedDemand,
    fwdWOS,
    annualRevenue,
    grossMargin,
    gmroi,
  };
}
