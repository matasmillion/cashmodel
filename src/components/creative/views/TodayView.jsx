import { useEffect, useState } from 'react';
import { listSprints } from '../../../utils/sprintStore';
import { listJobs } from '../../../utils/creativeJobStore';
import { checkBudgetGuardrail } from '../../../utils/budgetConfigStore';
import { SPRINT_STATUSES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };
const NAVY = '#1B2741';

export default function TodayView() {
  const [jobs, setJobs] = useState(null);
  const [guardrail, setGuardrail] = useState(null);
  const [liveSprints, setLiveSprints] = useState([]);

  useEffect(() => {
    Promise.all([
      listJobs(),
      checkBudgetGuardrail(),
      listSprints({ status: SPRINT_STATUSES.LIVE }),
    ]).then(([j, g, ls]) => {
      setJobs(j);
      setGuardrail(g);
      setLiveSprints(ls);
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

  const barColor = weeklyPct >= 0.9 ? '#A32D2D' : weeklyPct >= 0.7 ? '#854F0B' : NAVY;

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 24 }}>
        Today
      </h2>

      {/* Budget guardrail */}
      <section style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
          Budget · This Week
        </p>
        <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: FR.slate }}>
            <span>${guardrail ? guardrail.weeklySpend.toFixed(2) : '—'} spent</span>
            <span>${guardrail?.config?.weekly_cap ?? '2,000.00'} cap</span>
          </div>
          <div style={{ height: 6, background: FR.sand, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${weeklyPct * 100}%`, background: barColor, borderRadius: 3, transition: 'width 400ms ease' }} />
          </div>
          {guardrail && !guardrail.allowed && (
            <p style={{ marginTop: 8, fontSize: 11, color: '#A32D2D' }}>
              {guardrail.reason === 'writes_disabled' ? 'Meta writes are disabled.' : 'Weekly cap threshold reached — new uploads paused.'}
            </p>
          )}
        </div>
      </section>

      {/* Decisions needed */}
      <section style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
          Decisions Needed ({decisionsNeeded.length})
        </p>
        {decisionsNeeded.length === 0
          ? <p style={{ fontSize: 13, color: FR.stone }}>Nothing waiting for you right now.</p>
          : decisionsNeeded.map(job => (
            <div key={job.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '12px 16px', marginBottom: 8, fontSize: 13, color: FR.slate }}>
              <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
                S{job.sprint_number} · {job.lane}
              </span>
              <span style={{ marginLeft: 12 }}>{job.kind === 'brief' ? 'Brief approved — ready to dispatch render' : 'Render done — approve or revise'}</span>
            </div>
          ))}
      </section>

      {/* Agent ran overnight */}
      <section>
        <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
          Agent Running ({agentRan.length})
        </p>
        {agentRan.length === 0
          ? <p style={{ fontSize: 13, color: FR.stone }}>No active agent jobs.</p>
          : agentRan.map(job => (
            <div key={job.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '12px 16px', marginBottom: 8, fontSize: 13, color: FR.slate }}>
              <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
                S{job.sprint_number} · {job.lane}
              </span>
              <span style={{ marginLeft: 12 }}>{job.kind === 'brief' ? 'Brief generating…' : 'Render processing…'}</span>
            </div>
          ))}
      </section>
    </div>
  );
}
