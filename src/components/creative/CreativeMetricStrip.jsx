import { useEffect, useRef, useState } from 'react';
import { Zap, Upload, CheckCircle2, Clock, DollarSign, BookOpen } from 'lucide-react';
import { listSprints } from '../../utils/sprintStore';
import { listRenders } from '../../utils/renderStore';
import { listAds } from '../../utils/adStore';
import { listLearnings } from '../../utils/learningStore';
import { checkBudgetGuardrail } from '../../utils/budgetConfigStore';
import { SPRINT_STATUSES, RENDER_STATUSES, AD_STATUSES } from '../../types/creative';
import { FR, dotStyle } from './palette';

const POLL_MS = 60_000;

function MetricCard({ icon: Icon, label, value, sub, dot, accent }) {
  return (
    <div style={{
      flex: '1 1 140px', minWidth: 140,
      background: FR.saltLight,
      border: '1px solid rgba(0,0,0,0.07)', borderRadius: 10,
      padding: '14px 16px',
      transition: 'border-color .15s',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: FR.stone,
        marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {Icon && <Icon size={11} strokeWidth={2} color={FR.stone} />}
        {label}
        {dot && <span style={{ ...dotStyle(dot.color, dot.pulse), marginLeft: 'auto' }} />}
      </div>
      <div style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 26, fontWeight: 400, lineHeight: 1,
        color: accent || FR.ink,
      }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function CreativeMetricStrip() {
  const [metrics, setMetrics] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [sprints, renders, ads, learnings, guardrail] = await Promise.all([
        listSprints(),
        listRenders(),
        listAds(),
        listLearnings(),
        checkBudgetGuardrail(),
      ]);
      if (!alive) return;
      setMetrics({
        activeSprints: sprints.filter(s => s.status !== SPRINT_STATUSES.CLOSED).length,
        closedSprints: sprints.filter(s => s.status === SPRINT_STATUSES.CLOSED).length,
        rendering: renders.filter(r => r.status === RENDER_STATUSES.PROCESSING).length,
        queuePending: renders.filter(r => r.status === RENDER_STATUSES.DONE).length,
        liveAds: ads.filter(a => a.status === AD_STATUSES.ACTIVE).length,
        avgCpa: (() => {
          const withCpa = ads.filter(a => a.cpa != null);
          if (!withCpa.length) return null;
          return (withCpa.reduce((s, a) => s + a.cpa, 0) / withCpa.length).toFixed(0);
        })(),
        learningsBanked: learnings.length,
        winners: learnings.filter(l => l.outcome === 'winner').length,
        losers: learnings.filter(l => l.outcome === 'loser').length,
        weeklySpend: guardrail.weeklySpend.toFixed(0),
        weeklyCapPct: Math.round((guardrail.weeklySpend / (guardrail.config?.weekly_cap || 2000)) * 100),
      });
    };
    refresh();
    intervalRef.current = setInterval(refresh, POLL_MS);
    return () => { alive = false; clearInterval(intervalRef.current); };
  }, []);

  if (!metrics) return null;

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
      <MetricCard
        icon={Zap}
        label="Active Sprints"
        value={metrics.activeSprints}
        sub={`${metrics.closedSprints} closed all-time`}
      />
      <MetricCard
        icon={Upload}
        label="Rendering"
        value={metrics.rendering}
        accent={metrics.rendering > 0 ? FR.amber : undefined}
        dot={metrics.rendering > 0 ? { color: FR.amber, pulse: true } : null}
      />
      <MetricCard
        icon={CheckCircle2}
        label="Queue Pending"
        value={metrics.queuePending}
        sub="awaiting your approval"
        accent={metrics.queuePending > 0 ? FR.purple : undefined}
      />
      <MetricCard
        icon={Clock}
        label="Live Ads"
        value={metrics.liveAds}
        sub={`$${metrics.weeklySpend} this week`}
        accent={metrics.liveAds > 0 ? FR.green : undefined}
        dot={metrics.liveAds > 0 ? { color: FR.green, pulse: true } : null}
      />
      <MetricCard
        icon={DollarSign}
        label="Avg CPA"
        value={metrics.avgCpa ? `$${metrics.avgCpa}` : '—'}
        sub="across active ads"
      />
      <MetricCard
        icon={BookOpen}
        label="Learnings Banked"
        value={metrics.learningsBanked}
        sub={`${metrics.winners} winning · ${metrics.losers} losing`}
      />
    </div>
  );
}
