import { useEffect, useState } from 'react';
import { listSprints } from '../../../utils/sprintStore';
import { listRenders } from '../../../utils/renderStore';
import { LANES, LANE_VALUES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const LANE_LABEL = { ai: 'AI', high_production: 'High Production', creator: 'Creator', founder: 'Founder' };

export default function Production() {
  const [renders, setRenders] = useState(null);
  const [sprints, setSprints] = useState([]);

  useEffect(() => {
    Promise.all([listRenders(), listSprints()]).then(([rs, ss]) => {
      setRenders(rs);
      setSprints(ss);
    });
  }, []);

  const sprintMap = {};
  sprints.forEach(s => { sprintMap[s.id] = s; });

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 24 }}>
        Production
      </h2>
      {renders === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : LANE_VALUES.map(lane => {
          const laneRenders = renders.filter(r => (sprintMap[r.sprint_id] || {}).lane === lane);
          if (laneRenders.length === 0) return null;
          return (
            <div key={lane} style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 12 }}>
                {LANE_LABEL[lane]} ({laneRenders.length})
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {laneRenders.map(r => {
                  const sprint = sprintMap[r.sprint_id] || {};
                  const progress = r.status === 'done' || r.status === 'approved' ? 100
                    : r.status === 'processing' ? 60
                    : r.status === 'pending' ? 10 : 0;
                  return (
                    <div key={r.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
                          S{sprint.sprint_number} · variant {r.variant_index + 1}
                        </span>
                        <span style={{ fontSize: 11, color: FR.stone }}>{r.status}</span>
                      </div>
                      <div style={{ height: 4, background: FR.sand, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: FR.slate, borderRadius: 2, transition: 'width 400ms ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}
