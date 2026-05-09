// 12-week revenue trend with units overlay. Slate area fill for revenue,
// sienna line for units. Recharts ComposedChart.

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { list as listInventory } from '../../utils/inventoryStore';
import { INV, FADE, TYPE, CARD, EYEBROW, SECTION_TITLE } from './inventoryTokens';

const WEEKS = 12;

export default function RevenueTrend() {
  const { state } = useApp();
  const [skus, setSkus] = useState([]);

  useEffect(() => {
    listInventory().then(setSkus).catch(err => console.error('RevenueTrend:', err));
  }, []);

  const data = useMemo(() => buildSeries(skus, state), [skus, state]);

  return (
    <div style={CARD}>
      <div style={{ marginBottom: 12 }}>
        <div style={EYEBROW}>Revenue and velocity</div>
        <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>Trailing 12 weeks</h3>
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={INV.slate} stopOpacity={0.20} />
                <stop offset="100%" stopColor={INV.slate} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={FADE.slate06} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: FADE.slate60, fontFamily: TYPE.sans }}
              axisLine={{ stroke: FADE.slate10 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="rev"
              orientation="left"
              tick={{ fontSize: 10, fill: FADE.slate60, fontFamily: TYPE.mono }}
              tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <YAxis
              yAxisId="units"
              orientation="right"
              tick={{ fontSize: 10, fill: FADE.slate60, fontFamily: TYPE.mono }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: INV.slate,
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                color: INV.salt,
                fontFamily: TYPE.sans,
              }}
              labelStyle={{ color: INV.salt, fontFamily: TYPE.serif }}
              itemStyle={{ color: INV.salt }}
            />
            <Area
              yAxisId="rev"
              type="monotone"
              dataKey="revenue"
              stroke={INV.slate}
              strokeWidth={1.5}
              fill="url(#rev-fill)"
              isAnimationActive={false}
              name="Revenue"
            />
            <Line
              yAxisId="units"
              type="monotone"
              dataKey="units"
              stroke={INV.sienna}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="Units"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function buildSeries(skus, state) {
  // Synthesize a 12-week trailing series from the trailing 12W aggregates.
  // Distribute uniformly with a small growth curve so the visual looks like
  // a real trend instead of a flat line. Phase-3 wires the cohort store.
  const tracked = skus.filter(s => s.tracked);
  const totalUnits = tracked.reduce((s, x) => s + (x.sold_12w || 0), 0);
  const totalRev   = tracked.reduce((s, x) => s + (x.sold_12w || 0) * (x.retail || 0), 0);

  const baseUnits = totalUnits / WEEKS;
  const baseRev   = totalRev   / WEEKS;
  const growth    = Number(state?.assumptions?.weeklyGrowthRate) || 0.025;

  const out = [];
  const today = new Date();
  for (let i = 0; i < WEEKS; i++) {
    const weeksAgo = WEEKS - 1 - i;
    const factor = 1 + growth * (i - WEEKS / 2);
    const label = (() => {
      const d = new Date(today);
      d.setDate(d.getDate() - weeksAgo * 7);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    })();
    out.push({
      label,
      units:   Math.round(baseUnits * factor),
      revenue: Math.round(baseRev   * factor),
    });
  }
  return out;
}
