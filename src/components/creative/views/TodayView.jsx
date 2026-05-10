import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { listJobs } from '../../../utils/creativeJobStore';
import { checkBudgetGuardrail } from '../../../utils/budgetConfigStore';
import { setCreativeHash } from '../../../utils/creativeRouting';
import { FR, LANE_TOKEN, pillStyle, dotStyle } from '../palette';

export default function TodayView() {
  const [jobs, setJobs] = useState(null);
  const [guardrail, setGuardrail] = useState(null);

  useEffect(() => {
    Promise.all([
      listJobs(),
      checkBudgetGuardrail(),
    ]).then(([j, g]) => {
      setJobs(j);
      setGuardrail(g);
    });
  }, []);

  const decisionsNeeded = jobs
    ? [...jobs.waiting_on_you].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    : [];

  const agentRan = jobs
    ? [...jobs.agent_running].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    : [];

  const weeklyPct = guardrail
    ? Math.min(1, guardrail.weeklySpend / (guardrail.config?.weekly_cap || 2000))
    : 0;
  const barColor = weeklyPct >= 0.9 ? FR.red : weeklyPct >= 0.7 ? FR.amber : FR.green;
  const barTextColor = weeklyPct >= 0.7 ? FR.amber : 'rgba(255,255,255,0.92)';

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.ink, marginBottom: 4 }}>
        Today
      </h2>
      <p style={{ fontSize: 12, color: FR.stone, marginBottom: 28 }}>
        What needs your attention right now, and what the agents have been doing.
      </p>

      {/* Budget guardrail — navy accent surface (per palette decision) */}
      <section style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 10 }}>
          Budget · This Week
        </p>
        <div style={{
          background: FR.navy, color: '#fff',
          borderRadius: 12, padding: '14px 18px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9, fontSize: 13 }}>
            <span style={{ opacity: 0.92 }}>
              <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                ${guardrail ? guardrail.weeklySpend.toFixed(0) : '—'}
              </span>
              <span style={{ marginLeft: 6, opacity: 0.7 }}>spent</span>
            </span>
            <span style={{ color: barTextColor, fontVariantNumeric: 'tabular-nums', alignSelf: 'flex-end' }}>
              of ${guardrail?.config?.weekly_cap?.toFixed?.(0) ?? '2,000'} cap
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.14)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${weeklyPct * 100}%`, background: barColor, borderRadius: 3, transition: 'width 400ms ease' }} />
          </div>
          {guardrail && !guardrail.allowed && (
            <p style={{ marginTop: 10, fontSize: 11, color: FR.redLight, margin: '10px 0 0' }}>
              ⚠ {guardrail.reason === 'writes_disabled' ? 'Meta writes are disabled.' : 'Weekly cap threshold reached — new uploads paused.'}
            </p>
          )}
        </div>
      </section>

      {/* Decisions needed */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', margin: 0 }}>
            Decisions Needed
          </p>
          {decisionsNeeded.length > 0 && (
            <span style={{
              background: FR.blueLight, color: FR.blue, fontWeight: 600,
              borderRadius: 10, fontSize: 10, padding: '2px 7px',
            }}>{decisionsNeeded.length}</span>
          )}
        </div>
        {decisionsNeeded.length === 0
          ? <p style={{ fontSize: 13, color: FR.stone }}>You're all caught up.</p>
          : decisionsNeeded.map(job => <JobRow key={job.id} job={job} actionable />)}
      </section>

      {/* Agent running */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', margin: 0 }}>
            Agent Running
          </p>
          {agentRan.length > 0 && (
            <span style={{
              background: FR.amberLight, color: FR.amber, fontWeight: 600,
              borderRadius: 10, fontSize: 10, padding: '2px 7px',
            }}>{agentRan.length}</span>
          )}
        </div>
        {agentRan.length === 0
          ? <p style={{ fontSize: 13, color: FR.stone }}>No active agent jobs.</p>
          : agentRan.map(job => <JobRow key={job.id} job={job} />)}
      </section>
    </div>
  );
}

function JobRow({ job, actionable = false }) {
  const lt = LANE_TOKEN[job.lane] || LANE_TOKEN.ai;
  const text = job.kind === 'brief'
    ? (actionable ? 'Brief approved — ready to dispatch render' : 'Brief generating…')
    : (actionable ? 'Render ready — approve or revise' : 'Render processing…');
  const target = job.kind === 'brief' ? 'brief' : (actionable ? 'queue' : 'production');
  return (
    <button
      onClick={() => setCreativeHash({ view: target, id: job.kind === 'brief' ? job.sprint_id : undefined })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', textAlign: 'left',
        background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 8, cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, background: lt.stripe }} />
      {!actionable && <span style={{ ...dotStyle(FR.amber, true), marginLeft: 4 }} />}
      <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 12, color: FR.stone, fontWeight: 500 }}>
        S{job.sprint_number}
      </span>
      <span style={pillStyle(lt)}>{lt.label}</span>
      <span style={{ fontSize: 13, color: FR.ink, flex: 1 }}>{text}</span>
      {actionable && <ArrowRight size={14} color={FR.stone} />}
    </button>
  );
}
