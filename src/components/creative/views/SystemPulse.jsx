import { useEffect, useState } from 'react';
import { listSprints } from '../../../utils/sprintStore';
import { listBriefs } from '../../../utils/briefStore';
import { listRenders } from '../../../utils/renderStore';
import { listAds } from '../../../utils/adStore';
import { SPRINT_STATUSES, RENDER_STATUSES, AD_STATUSES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

function StageBlock({ label, count, active }) {
  return (
    <div style={{
      background: active ? '#fff' : FR.sand,
      border: `0.5px solid ${active ? 'rgba(58,58,58,0.15)' : 'transparent'}`,
      borderRadius: 8,
      padding: '12px 16px',
      minWidth: 120,
      textAlign: 'center',
    }}>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 28, fontWeight: 400, color: FR.slate }}>{count}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.06em', color: FR.stone, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function SystemPulse() {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    Promise.all([
      listSprints(),
      listBriefs(),
      listRenders(),
      listAds(),
    ]).then(([sprints, briefs, renders, ads]) => {
      setCounts({
        drafting: sprints.filter(s => s.status === SPRINT_STATUSES.DRAFTING).length,
        briefReady: sprints.filter(s => s.status === SPRINT_STATUSES.BRIEF_READY).length,
        rendering: sprints.filter(s => s.status === SPRINT_STATUSES.RENDERING).length,
        inQueue: sprints.filter(s => s.status === SPRINT_STATUSES.IN_QUEUE).length,
        live: sprints.filter(s => s.status === SPRINT_STATUSES.LIVE).length,
        closed: sprints.filter(s => s.status === SPRINT_STATUSES.CLOSED).length,
        processingRenders: renders.filter(r => r.status === RENDER_STATUSES.PROCESSING).length,
        doneRenders: renders.filter(r => r.status === RENDER_STATUSES.DONE).length,
        activeAds: ads.filter(a => a.status === AD_STATUSES.ACTIVE).length,
      });
    });
  }, []);

  if (!counts) return <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>;

  const stages = [
    { label: 'Drafting', count: counts.drafting, active: counts.drafting > 0 },
    { label: 'Brief Ready', count: counts.briefReady, active: counts.briefReady > 0 },
    { label: 'Rendering', count: counts.rendering + counts.processingRenders, active: counts.rendering > 0 },
    { label: 'In Queue', count: counts.doneRenders, active: counts.doneRenders > 0 },
    { label: 'Live', count: counts.activeAds, active: counts.activeAds > 0 },
    { label: 'Closed', count: counts.closed, active: false },
  ];

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 24 }}>
        System Pulse
      </h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
        {stages.map((s, i) => (
          <StageBlock key={i} label={s.label} count={s.count} active={s.active} />
        ))}
      </div>
      <p style={{ fontSize: 13, color: FR.stone }}>
        Full pipeline diagram and activity feed coming in Phase 2.
      </p>
    </div>
  );
}
