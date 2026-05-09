// Bridge chart — brand-wide on-hand vs demand, 16-week horizon. Per spec §6B.
//
// Three series + two markers:
//   • slate area      — brand-wide on-hand projection (drops with sales, jumps on PO arrivals)
//   • stone dashed    — trailing-velocity cumulative demand
//   • sienna solid    — ad-adjusted cumulative demand
//   • sienna circles  — weeks where one or more POs land
//   • bad-red dot     — first week where on-hand crosses zero ("Crossover · W<n>")

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceDot,
  Scatter,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { listTracked } from '../../utils/inventoryStore';
import { listPOs } from '../../utils/productionStore';
import { INV, FADE, TYPE, CARD, EYEBROW } from './inventoryTokens';

const WEEKS = 16;
const OPEN_PO_STATUSES = new Set(['placed', 'in_production']);

export default function BridgeChart() {
  const { state } = useApp();
  const [skus, setSkus] = useState([]);
  const [pos, setPos]   = useState([]);

  useEffect(() => {
    Promise.all([listTracked(), listPOs()])
      .then(([s, p]) => { setSkus(s || []); setPos(p || []); })
      .catch(err => console.error('BridgeChart:', err));
  }, []);

  const lift = Number(state.assumptions?.liftMultiplier) || 1.10;

  const { data, crossover, poWeeks } = useMemo(
    () => buildBridgeData(skus, pos, lift),
    [skus, pos, lift],
  );

  return (
    <div style={CARD}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 14,
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={EYEBROW}>The bridge</div>
          <h3 style={{
            fontFamily: TYPE.serif,
            fontWeight: 400,
            fontSize: 20,
            color: INV.slate,
            margin: '4px 0 0',
          }}>
            On-hand vs. demand · next {WEEKS} weeks
          </h3>
        </div>
        <LegendInline crossover={crossover} />
      </div>

      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 6 }}>
            <CartesianGrid stroke="rgba(58,58,58,0.06)" vertical={false} />
            <XAxis
              dataKey="week"
              tickFormatter={w => `W${w}`}
              tick={{ fontSize: 10, fill: FADE.slate60, fontFamily: TYPE.mono }}
              axisLine={{ stroke: FADE.slate10 }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: FADE.slate60, fontFamily: TYPE.mono }}
              axisLine={{ stroke: FADE.slate10 }}
              tickLine={false}
              tickFormatter={n => n >= 1000 ? `${Math.round(n / 1000)}k` : n}
              width={48}
            />
            <Tooltip content={<BridgeTooltip />} />

            <Area
              type="monotone"
              dataKey="onHand"
              stroke={INV.slate}
              strokeWidth={1.5}
              fill="url(#bridgeOh)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="trailing"
              stroke="rgba(58,58,58,0.4)"
              strokeWidth={1}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="adj"
              stroke={INV.sienna}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* Sienna circles where a PO lands. */}
            <Scatter
              data={poWeeks.map(w => ({ week: w, onHand: data[w]?.onHand ?? 0 }))}
              dataKey="onHand"
              shape={(props) => (
                <circle cx={props.cx} cy={props.cy} r={4} fill={INV.sienna} stroke="none" />
              )}
            />

            {crossover != null && (
              <ReferenceDot
                x={crossover.week}
                y={0}
                r={4}
                fill={INV.bad}
                stroke="none"
                ifOverflow="extendDomain"
                label={{
                  value: `Crossover · W${crossover.week}`,
                  position: 'top',
                  fill: INV.bad,
                  fontSize: 9,
                  fontFamily: TYPE.sans,
                }}
              />
            )}

            <defs>
              <linearGradient id="bridgeOh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={INV.slate} stopOpacity={0.18} />
                <stop offset="100%" stopColor={INV.slate} stopOpacity={0} />
              </linearGradient>
            </defs>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────

function BridgeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const onHand    = payload.find(p => p.dataKey === 'onHand')?.value;
  const trailing  = payload.find(p => p.dataKey === 'trailing')?.value;
  const adj       = payload.find(p => p.dataKey === 'adj')?.value;
  return (
    <div style={{
      background: INV.slate,
      color: INV.salt,
      padding: '8px 12px',
      borderRadius: 3,
      fontFamily: TYPE.sans,
      fontSize: 11,
      lineHeight: 1.5,
    }}>
      <div style={{
        fontFamily: TYPE.mono,
        fontSize: 11,
        marginBottom: 4,
        opacity: 0.85,
      }}>
        Week {label}
      </div>
      <Row label="On-hand"   v={onHand}   color="#fff" />
      <Row label="Trailing"  v={trailing} color="rgba(245,240,232,0.65)" />
      <Row label="Ad-adjust" v={adj}      color={INV.sienna} />
    </div>
  );
}

function Row({ label, v, color }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      color,
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: TYPE.mono }}>
        {v == null ? '—' : Math.round(v).toLocaleString()}
      </span>
    </div>
  );
}

// ── Inline legend ────────────────────────────────────────────────────────

function LegendInline({ crossover }) {
  const items = [
    { label: 'On-hand',    swatch: INV.slate },
    { label: 'Trailing',   swatch: 'rgba(58,58,58,0.4)', dash: true },
    { label: 'Ad-adjust',  swatch: INV.sienna },
  ];
  return (
    <div style={{
      display: 'flex',
      gap: 16,
      fontSize: 10,
      color: FADE.slate60,
      fontFamily: TYPE.sans,
      letterSpacing: '0.04em',
      alignItems: 'center',
    }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            display: 'inline-block',
            width: it.dash ? 14 : 8,
            height: it.dash ? 1 : 8,
            borderRadius: it.dash ? 0 : '50%',
            background: it.swatch,
          }} />
          {it.label}
        </span>
      ))}
      {crossover != null && (
        <span style={{ color: INV.bad, marginLeft: 8 }}>
          ● Crossover at W{crossover.week}
        </span>
      )}
    </div>
  );
}

// ── Math ─────────────────────────────────────────────────────────────────

function buildBridgeData(skus, pos, lift) {
  // Aggregate brand-wide weekly velocity (no lift) and starting on-hand.
  let totalOnHand = 0;
  let weeklyVelNoLift = 0;
  for (const s of skus) {
    if (!s.tracked) continue;
    totalOnHand     += s.on_hand || 0;
    weeklyVelNoLift += (s.sold_12w || 0) / 12;
  }

  // Bucket open-PO units by week-from-today using expected_landing.
  const today = new Date();
  const arrivalsByWeek = new Array(WEEKS + 1).fill(0);
  const poLandingWeeks = new Set();
  for (const po of pos) {
    if (!OPEN_PO_STATUSES.has(po.status)) continue;
    if (!po.expected_landing) continue;
    const land   = new Date(po.expected_landing);
    const wkIdx  = Math.round((land - today) / (7 * 86400000));
    if (wkIdx < 0 || wkIdx > WEEKS) continue;
    arrivalsByWeek[wkIdx] += Number(po.units) || 0;
    poLandingWeeks.add(wkIdx);
  }

  const weeklyVelLifted = weeklyVelNoLift * lift;

  const data = [];
  let cumArrivals = 0;
  let crossover   = null;
  for (let w = 0; w <= WEEKS; w++) {
    cumArrivals += arrivalsByWeek[w];
    const cumDemandLifted = w * weeklyVelLifted;
    const onHandRaw = totalOnHand - cumDemandLifted + cumArrivals;
    const onHand = Math.max(0, onHandRaw);

    if (crossover == null && onHandRaw <= 0 && totalOnHand > 0) {
      crossover = { week: w };
    }

    data.push({
      week:     w,
      onHand,
      trailing: w * weeklyVelNoLift,
      adj:      cumDemandLifted,
    });
  }

  return {
    data,
    crossover,
    poWeeks: [...poLandingWeeks].sort((a, b) => a - b),
  };
}
