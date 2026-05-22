import { useEffect, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { listSprints } from '../../../utils/sprintStore';
import { listRenders } from '../../../utils/renderStore';
import { listAds } from '../../../utils/adStore';
import { callUploadMetaAd } from '../../../utils/liveDataSync';
import { LANE_VALUES } from '../../../types/creative';
import { FR, LANE_TOKEN, RENDER_STATUS_TOKEN, pillStyle, dotStyle, DOT_COLOR } from '../palette';

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

  const lanesWithWork = LANE_VALUES.filter(lane => renders?.some(r => (sprintMap[r.sprint_id] || {}).lane === lane));
  const empty = renders !== null && lanesWithWork.length === 0;

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.ink, margin: 0 }}>
          Production
        </h2>
        <p style={{ fontSize: 12, color: FR.stone, marginTop: 2, marginBottom: 22 }}>
          Active creative production across all 4 lanes
        </p>
      </div>
      {renders === null ? (
        <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
      ) : empty ? (
        <div style={{
          background: FR.saltLight, border: '1px dashed rgba(0,0,0,0.12)',
          borderRadius: 12, padding: '32px 24px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: FR.stone, margin: 0 }}>
            Nothing in production. Approve a brief and dispatch renders to see them here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
          {lanesWithWork.map(lane => {
            const lt = LANE_TOKEN[lane];
            const laneRenders = renders.filter(r => (sprintMap[r.sprint_id] || {}).lane === lane);
            const activeCount = laneRenders.filter(r => r.status === 'processing' || r.status === 'done').length;
            return (
              <section key={lane} style={{
                background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12,
                overflow: 'hidden', position: 'relative',
              }}>
                {/* Lane accent stripe */}
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: lt.stripe }} />
                <header style={{
                  padding: '14px 18px 12px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingLeft: 22,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={pillStyle(lt)}>{lt.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: FR.ink }}>
                      {laneProviderLabel(lane)}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: FR.stone }}>
                    {activeCount} active · {laneRenders.length} total
                  </span>
                </header>
                <div style={{ padding: '4px 18px 14px', paddingLeft: 22 }}>
                  {laneRenders.map(r => {
                    const sprint = sprintMap[r.sprint_id] || {};
                    const ad = adsByRender[r.id];
                    const token = RENDER_STATUS_TOKEN[r.status] || RENDER_STATUS_TOKEN.pending;
                    const progress = renderProgress(r, !!ad);
                    const canPublish = r.status === 'approved' && r.encoder_passed && !ad;
                    const isPublishing = !!publishing[r.id];
                    return (
                      <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                            <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 12, color: FR.ink, fontWeight: 500 }}>
                              S{sprint.sprint_number}-{String.fromCharCode(65 + (r.variant_index ?? 0))}
                            </span>
                            <span style={{ fontSize: 11, color: FR.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.provider || '—'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={pillStyle(token)}>
                              <span style={{ ...dotStyle(DOT_COLOR[token.dot] || FR.stone, token.dot === 'amber'), marginRight: 4 }} />
                              {ad ? 'Published' : token.label}
                              {r.encoder_passed && r.status === 'approved' && !ad ? ' · Encoded' : ''}
                            </span>
                            {canPublish && (
                              <button
                                onClick={() => handlePublish(r)}
                                disabled={isPublishing}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  fontSize: 11, padding: '4px 10px', borderRadius: 6,
                                  border: '1px solid #A7F3D0', background: FR.greenLight, color: FR.green,
                                  cursor: isPublishing ? 'not-allowed' : 'pointer', fontWeight: 500,
                                }}
                              >
                                {isPublishing ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Send size={11} />}
                                {isPublishing ? 'Publishing…' : 'Publish to Meta'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${progress}%`,
                            background: progress === 100 ? FR.green : (r.status === 'processing' ? FR.amber : FR.stone),
                            borderRadius: 2, transition: 'width 400ms ease',
                          }} />
                        </div>
                        {errs[r.id] && (
                          <p style={{ fontSize: 10.5, color: FR.red, margin: '6px 0 0', wordBreak: 'break-word' }}>{errs[r.id]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function laneProviderLabel(lane) {
  switch (lane) {
    case 'ai':              return 'fal.ai · Nano Banana 2';
    case 'high_production': return 'Higgsfield Marketing Studio';
    case 'creator':         return 'Higgsfield Soul Characters';
    case 'founder':         return 'Higgsfield Soul — founder';
    default:                return '';
  }
}

function renderProgress(r, isAd) {
  if (isAd || r.status === 'approved') return 100;
  if (r.status === 'done')              return 90;
  if (r.status === 'processing')        return 55;
  if (r.status === 'pending')           return 10;
  return 0;
}
