import { useEffect, useState } from 'react';
import { listJobs } from '../../../utils/creativeJobStore';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const BUCKETS = [
  { key: 'waiting_on_you', label: 'Waiting On You' },
  { key: 'agent_running', label: 'Agent Running' },
  { key: 'waiting_on_creator', label: 'Waiting On Creator' },
  { key: 'scheduled', label: 'Scheduled' },
];

export default function JobQueue() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => { listJobs().then(setJobs); }, []);

  if (!jobs) return <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>;

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 24 }}>
        Job Queue
      </h2>
      <div style={{ display: 'grid', gap: 24 }}>
        {BUCKETS.map(bucket => (
          <div key={bucket.key}>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
              {bucket.label} ({jobs[bucket.key].length})
            </p>
            {jobs[bucket.key].length === 0
              ? <p style={{ fontSize: 13, color: FR.stone }}>Empty.</p>
              : jobs[bucket.key].map(job => (
                <div key={job.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 13, color: FR.slate, display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
                      S{job.sprint_number} · {job.lane} · {job.kind}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, color: FR.stone }}>{job.status}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
