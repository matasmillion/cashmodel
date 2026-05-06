import { useEffect, useRef, useState } from 'react';
import { listSprints } from '../../utils/sprintStore';
import { listRenders } from '../../utils/renderStore';
import { listAds } from '../../utils/adStore';
import { listLearnings } from '../../utils/learningStore';
import { checkBudgetGuardrail } from '../../utils/budgetConfigStore';
import { SPRINT_STATUSES, RENDER_STATUSES, AD_STATUSES } from '../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const POLL_MS = 60_000;

function MetricCard({ label, value, sub }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '12px 16px', minWidth: 110 }}>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, fontWeight: 400, color: FR.slate, lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.07em', color: FR.stone, textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function CreativeMetricStrip() {
  const [metrics, setMetrics] = useState(null);
  const intervalRef = useRef(null);

  const refresh = async () => {
    const [sprints, renders, ads, learnings, guardrail] = await Promise.all([
      listSprints(),
      listRenders(),
      listAds(),
      listLearnings(),
      checkBudgetGuardrail(),
    ]);
    setMetrics({
      activeSprints: sprints.filter(s => s.status !== SPRINT_STATUSES.CLOSED).length,
      rendering: renders.filter(r => r.status === RENDER_STATUSES.PROCESSING).length,
      queuePending: renders.filter(r => r.status === RENDER_STATUSES.DONE).length,
      liveAds: ads.filter(a => a.status === AD_STATUSES.ACTIVE).length,
      avgCpa: (() => {
        const withCpa = ads.filter(a => a.cpa != null);
        if (!withCpa.length) return null;
        return (withCpa.reduce((s, a) => s + a.cpa, 0) / withCpa.length).toFixed(2);
      })(),
      learningsBanked: learnings.length,
      weeklySpend: guardrail.weeklySpend.toFixed(0),
      weeklyCapPct: Math.round((guardrail.weeklySpend / (guardrail.config?.weekly_cap || 2000)) * 100),
    });
  };

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (!metrics) return null;

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
      <MetricCard label="Active Sprints" value={metrics.activeSprints} />
      <MetricCard label="Rendering" value={metrics.rendering} />
      <MetricCard label="Queue Pending" value={metrics.queuePending} />
      <MetricCard label="Live Ads" value={metrics.liveAds} />
      <MetricCard label="Avg CPA" value={metrics.avgCpa ? `$${metrics.avgCpa}` : '—'} />
      <MetricCard label="Learnings" value={metrics.learningsBanked} sub="banked" />
      <MetricCard label="Weekly Spend" value={`$${metrics.weeklySpend}`} sub={`${metrics.weeklyCapPct}% of cap`} />
    </div>
  );
}
