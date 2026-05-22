import { useEffect, useState } from 'react';
import { listJobs } from '../../../utils/creativeJobStore';
import { FR, LANE_TOKEN, pillStyle } from '../palette';

const BUCKETS = [
  { key: 'waiting_on_you',     label: 'Waiting on you',     fg: FR.blue,      bg: FR.blueLight },
  { key: 'agent_running',      label: 'Agent running',      fg: FR.amber,     bg: FR.amberLight },
  { key: 'waiting_on_creator', label: 'Waiting on creator', fg: FR.creatorFg, bg: FR.creatorBg },
  { key: 'scheduled',          label: 'Scheduled',          fg: FR.stone,     bg: 'rgba(0,0,0,0.06)' },
];

export default function JobQueue() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => { listJobs().then(setJobs); }, []);

  if (!jobs) return <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>;

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.ink, marginBottom: 6 }}>
        Job Queue
      </h2>
      <p style={{ fontSize: 12, color: FR.stone, marginBottom: 22 }}>
        All work in flight, grouped by who's blocking it.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {BUCKETS.map(bucket => (
          <section key={bucket.key} style={{
            background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <header style={{
              padding: '11px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: bucket.bg, color: bucket.fg,
              borderBottom: '1px solid rgba(0,0,0,0.05)',
            }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em' }}>
                {bucket.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{jobs[bucket.key].length}</span>
            </header>
            <div style={{ padding: '6px 14px 12px' }}>
              {jobs[bucket.key].length === 0
                ? <p style={{ fontSize: 12, color: FR.stone, padding: '8px 0', margin: 0 }}>Empty.</p>
                : jobs[bucket.key].map(job => {
                  const lt = LANE_TOKEN[job.lane] || LANE_TOKEN.ai;
                  return (
                    <div key={job.id} style={{
                      padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,0.05)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone, fontWeight: 500 }}>
                        S{job.sprint_number}
                      </span>
                      <span style={pillStyle(lt)}>{lt.label}</span>
                      <span style={{ fontSize: 12, color: FR.ink, marginLeft: 'auto' }}>{job.kind}</span>
                    </div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
