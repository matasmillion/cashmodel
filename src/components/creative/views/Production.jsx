import { useEffect, useState } from 'react';
import { listSprints } from '../../../utils/sprintStore';
import { listRenders } from '../../../utils/renderStore';
import { listAds } from '../../../utils/adStore';
import { callUploadMetaAd } from '../../../utils/liveDataSync';
import { LANES, LANE_VALUES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const LANE_LABEL = { ai: 'AI', high_production: 'High Production', creator: 'Creator', founder: 'Founder' };

export default function Production() {
  const [renders, setRenders] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [ads, setAds] = useState([]);
  const [publishing, setPublishing] = useState({});
  const [errs, setErrs] = useState({});

  const refresh = () => Promise.all([listRenders(), listSprints(), listAds()]).then(([rs, ss, as]) => {
    setRenders(rs);
    setSprints(ss);
    setAds(as);
  });

  useEffect(() => { refresh(); }, []);

  const sprintMap = {};
  sprints.forEach(s => { sprintMap[s.id] = s; });

  const adsByRender = {};
  ads.forEach(a => { adsByRender[a.render_id] = a; });

  const handlePublish = async (render) => {
    setPublishing(p => ({ ...p, [render.id]: true }));
    setErrs(e => ({ ...e, [render.id]: null }));
    try {
      await callUploadMetaAd({ render_id: render.id });
      await refresh();
    } catch (err) {
      setErrs(e => ({ ...e, [render.id]: err.message }));
    } finally {
      setPublishing(p => { const next = { ...p }; delete next[render.id]; return next; });
    }
  };

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
                  const ad = adsByRender[r.id];
                  const progress = r.status === 'done' || r.status === 'approved' ? 100
                    : r.status === 'processing' ? 60
                    : r.status === 'pending' ? 10 : 0;
                  const canPublish = r.status === 'approved' && r.encoder_passed && !ad;
                  const isPublishing = !!publishing[r.id];
                  return (
                    <div key={r.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
                          S{sprint.sprint_number} · variant {r.variant_index + 1}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: FR.stone }}>
                            {r.status}{r.encoder_passed && r.status === 'approved' ? ' · encoded' : ''}{ad ? ' · published' : ''}
                          </span>
                          {canPublish && (
                            <button
                              onClick={() => handlePublish(r)}
                              disabled={isPublishing}
                              style={{
                                fontSize: 11, padding: '3px 10px', borderRadius: 5,
                                border: '0.5px solid #3B6D11', color: '#3B6D11',
                                background: 'transparent', cursor: isPublishing ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isPublishing ? 'Publishing…' : 'Publish to Meta'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ height: 4, background: FR.sand, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: FR.slate, borderRadius: 2, transition: 'width 400ms ease' }} />
                      </div>
                      {errs[r.id] && (
                        <p style={{ fontSize: 10, color: '#A32D2D', margin: '6px 0 0', wordBreak: 'break-word' }}>{errs[r.id]}</p>
                      )}
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
