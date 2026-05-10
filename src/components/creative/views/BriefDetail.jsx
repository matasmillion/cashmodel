import { useEffect, useState } from 'react';
import { Sparkles, Send, Check, X, RotateCcw } from 'lucide-react';
import { getSprint, saveSprint } from '../../../utils/sprintStore';
import { listBriefs, saveBrief } from '../../../utils/briefStore';
import { listRenders } from '../../../utils/renderStore';
import { callGenerateBrief, callDispatchRender } from '../../../utils/liveDataSync';
import { SPRINT_STATUSES } from '../../../types/creative';
import { FR, LANE_TOKEN, pillStyle } from '../palette';

const BRIEF_STATUS_TOKEN = {
  draft:    { bg: 'rgba(0,0,0,0.06)', fg: FR.stone, label: 'Draft' },
  approved: { bg: FR.greenLight,      fg: FR.green, label: 'Approved' },
  revised:  { bg: FR.amberLight,      fg: FR.amber, label: 'Revised' },
  rejected: { bg: FR.redLight,        fg: FR.red,   label: 'Rejected' },
};

export default function BriefDetail({ sprintId }) {
  const [sprint, setSprint] = useState(null);
  const [briefs, setBriefs] = useState(null);
  const [renders, setRenders] = useState([]);
  const [activeBriefIdx, setActiveBriefIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState(null);

  useEffect(() => {
    if (!sprintId) return;
    setSprint(null);
    setBriefs(null);
    setRenders([]);
    setActiveBriefIdx(0);
    setGenError(null);
    setDispatchError(null);
    Promise.all([
      getSprint(sprintId),
      listBriefs({ sprintId }),
      listRenders({ sprintId }),
    ]).then(([s, bs, rs]) => {
      setSprint(s);
      setBriefs(bs);
      setRenders(rs);
    });
  }, [sprintId]);

  if (!sprintId) {
    return (
      <div style={{ maxWidth: 600 }}>
        <p style={{ fontSize: 13, color: FR.stone }}>Select a sprint from the Sprint List to view or generate its brief.</p>
      </div>
    );
  }

  if (!sprint || briefs === null) {
    return <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>;
  }

  const brief = briefs[activeBriefIdx] || null;

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const newBrief = await callGenerateBrief({ sprint_id: sprintId });
      // Mirror sprint status change locally (the edge function already updated DB)
      setSprint(prev => ({ ...prev, status: SPRINT_STATUSES.BRIEF_READY }));
      setBriefs(prev => [newBrief, ...(prev || [])]);
      setActiveBriefIdx(0);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!brief) return;
    const updated = await saveBrief(brief.id, { status: 'approved', approved_at: new Date().toISOString() });
    await saveSprint(sprintId, { status: SPRINT_STATUSES.BRIEF_READY });
    setSprint(prev => ({ ...prev, status: SPRINT_STATUSES.BRIEF_READY }));
    setBriefs(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const handleReject = async () => {
    if (!brief) return;
    const updated = await saveBrief(brief.id, { status: 'rejected' });
    setBriefs(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const handleRevise = async () => {
    if (!brief) return;
    // Mark current brief revised, then re-generate
    await saveBrief(brief.id, { status: 'revised' });
    setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'revised' } : b));
    handleGenerate();
  };

  const handleDispatch = async () => {
    if (!brief || brief.status !== 'approved') return;
    setDispatching(true);
    setDispatchError(null);
    try {
      const { renders: newRenders, errors } = await callDispatchRender({ brief_id: brief.id });
      setRenders(prev => [...(newRenders || []), ...prev]);
      setSprint(prev => ({ ...prev, status: SPRINT_STATUSES.RENDERING }));
      if (Array.isArray(errors) && errors.length) {
        setDispatchError(`Some variants failed: ${errors.map(e => e.error).join(' · ')}`);
      }
    } catch (err) {
      setDispatchError(err.message);
    } finally {
      setDispatching(false);
    }
  };

  const briefRenders = brief ? renders.filter(r => r.brief_id === brief.id) : [];

  const lt = LANE_TOKEN[sprint.lane];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '236px 1fr', gap: 24, alignItems: 'start' }}>
      {/* Left rail */}
      <div>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 12, color: FR.stone, fontWeight: 500 }}>
            S{sprint.sprint_number}
          </span>
          {lt && <span style={pillStyle(lt)}>{lt.label}</span>}
        </div>
        {sprint.constraint_text && (
          <p style={{ fontSize: 13, color: FR.ink, fontStyle: 'italic', lineHeight: 1.45, marginBottom: 4 }}>
            "{sprint.constraint_text}"
          </p>
        )}
        {sprint.hypothesis_type && (
          <p style={{ fontSize: 11, color: FR.stone, marginBottom: 18 }}>{sprint.hypothesis_type}</p>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            width: '100%', fontSize: 13, padding: '9px 0', borderRadius: 8,
            background: generating ? FR.sandLight : FR.ink,
            color: generating ? FR.stone : '#fff',
            border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
            marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontWeight: 500,
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', width: 11, height: 11, border: `1.5px solid ${FR.stone}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Generating…
            </>
          ) : (
            <><Sparkles size={13} /> {briefs.length > 0 ? 'Re-generate Brief' : 'Generate Brief'}</>
          )}
        </button>

        {genError && (
          <p style={{ fontSize: 11, color: FR.red, marginBottom: 12, wordBreak: 'break-word' }}>{genError}</p>
        )}

        {briefs.length === 0
          ? <p style={{ fontSize: 12, color: FR.stone }}>No brief yet.</p>
          : briefs.map((b, idx) => {
            const token = BRIEF_STATUS_TOKEN[b.status] || BRIEF_STATUS_TOKEN.draft;
            const isActive = idx === activeBriefIdx;
            return (
              <button
                key={b.id}
                onClick={() => setActiveBriefIdx(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', textAlign: 'left',
                  background: isActive ? '#fff' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(0,0,0,0.08)' : 'transparent'}`,
                  borderRadius: 8, padding: '8px 10px', marginBottom: 4, cursor: 'pointer',
                }}
              >
                <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>v{b.version}</span>
                <span style={pillStyle(token)}>{token.label}</span>
              </button>
            );
          })}
      </div>

      {/* Right doc */}
      {brief ? (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: '22px 26px' }}>
          {brief.status === 'draft' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
              <ActionBtn label="Approve" icon={Check} onClick={handleApprove} bg={FR.greenLight} fg={FR.green} border="#A7F3D0" />
              <ActionBtn label="Revise + Regenerate" icon={RotateCcw} onClick={handleRevise} bg={FR.amberLight} fg={FR.amber} border="#FED7AA" disabled={generating} />
              <ActionBtn label="Reject" icon={X} onClick={handleReject} bg={FR.redLight} fg={FR.red} border="#FECACA" />
            </div>
          )}

          {brief.status === 'approved' && (
            <div style={{
              background: FR.greenLight, border: `1px solid ${FR.green}22`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 22,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={pillStyle(BRIEF_STATUS_TOKEN.approved)}>Approved</span>
                {briefRenders.length === 0 ? (
                  <button
                    onClick={handleDispatch}
                    disabled={dispatching}
                    style={{
                      fontSize: 12, padding: '6px 13px', borderRadius: 7,
                      border: 'none', background: dispatching ? FR.sand : FR.ink,
                      color: dispatching ? FR.stone : '#fff',
                      cursor: dispatching ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500,
                    }}
                  >
                    {dispatching ? (
                      <>
                        <span style={{ display: 'inline-block', width: 10, height: 10, border: `1.5px solid ${FR.stone}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        Dispatching…
                      </>
                    ) : <><Send size={12} /> Dispatch Render</>}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: FR.green, fontWeight: 500 }}>
                    {briefRenders.length} render{briefRenders.length === 1 ? '' : 's'} dispatched · check Production / Render Queue
                  </span>
                )}
              </div>
              {dispatchError && (
                <p style={{ fontSize: 11, color: FR.red, marginTop: 6, marginBottom: 0, wordBreak: 'break-word' }}>{dispatchError}</p>
              )}
            </div>
          )}

          <BriefSection label="Hypothesis" text={brief.hypothesis} />
          <BriefSection label="Key Feeling" text={brief.key_feeling} />
          <BriefSection label="Hook (first 3 seconds)" text={brief.hook} accent={FR.blue} />
          <BriefSection label="Payoff" text={brief.payoff} accent={FR.green} />

          {brief.shot_list?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>Shot List</p>
              <ol style={{ margin: 0, paddingLeft: 22 }}>
                {brief.shot_list.map((shot, i) => (
                  <li key={i} style={{ fontSize: 13.5, color: FR.ink, marginBottom: 5, lineHeight: 1.5 }}>{shot}</li>
                ))}
              </ol>
            </div>
          )}

          <BriefSection label="Caption" text={brief.caption} />
          <BriefSection label="Prompt Blueprint" text={brief.prompt_blueprint} mono />

          {brief.past_learnings_consulted?.length > 0 && (
            <div style={{
              marginTop: 22, padding: '14px 16px',
              background: FR.saltLight, borderRadius: 10,
            }}>
              <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 10 }}>
                Past Learnings Consulted · {brief.past_learnings_consulted.length}
              </p>
              {brief.past_learnings_consulted.map((l, i) => {
                const isWinner = l.consulted_as === 'winner' || l.outcome === 'winner';
                const fg = isWinner ? FR.green : FR.red;
                return (
                  <div key={i} style={{
                    fontSize: 12.5, color: FR.ink,
                    borderLeft: `2px solid ${fg}`,
                    paddingLeft: 12, marginBottom: 8, lineHeight: 1.5,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: fg, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 6 }}>
                      {isWinner ? 'winner' : 'loser'}
                    </span>
                    {typeof l === 'string' ? l : l.summary || JSON.stringify(l)}
                  </div>
                );
              })}
            </div>
          )}

          {brief.agent_model && (
            <p style={{ marginTop: 18, fontSize: 10.5, color: FR.stone, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
              Generated by {brief.agent_model} · v{brief.version}
              {brief.generated_at ? ` · ${new Date(brief.generated_at).toLocaleString()}` : ''}
            </p>
          )}
        </div>
      ) : (
        <div style={{
          background: FR.saltLight, border: '1px dashed rgba(0,0,0,0.12)',
          borderRadius: 12, padding: '40px 28px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13.5, color: FR.ink, marginBottom: 8, fontWeight: 500 }}>No brief generated yet.</p>
          <p style={{ fontSize: 12.5, color: FR.stone, margin: 0 }}>
            Click "Generate Brief" — the Creative Engine will write one using your sprint constraint, knowledge files, and past learnings.
          </p>
        </div>
      )}
    </div>
  );
}

function BriefSection({ label, text, mono = false, accent = null }) {
  if (!text) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
        color: accent || FR.stone,
        textTransform: 'uppercase', marginBottom: 6,
      }}>{label}</p>
      <p style={{
        fontSize: mono ? 12 : 13.5, color: FR.ink, margin: 0,
        fontFamily: mono ? 'ui-monospace, SF Mono, Menlo, monospace' : undefined,
        whiteSpace: 'pre-wrap', lineHeight: mono ? 1.5 : 1.55,
        background: mono ? FR.saltLight : 'transparent',
        padding: mono ? '10px 12px' : 0,
        borderRadius: mono ? 8 : 0,
      }}>
        {text}
      </p>
    </div>
  );
}

function ActionBtn({ label, icon: Icon, onClick, bg, fg, border, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, padding: '6px 13px', borderRadius: 7,
        border: `1px solid ${border}`, color: fg, background: bg,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontWeight: 500,
      }}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />} {label}
    </button>
  );
}
