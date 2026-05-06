import { useEffect, useState } from 'react';
import { getSprint, saveSprint } from '../../../utils/sprintStore';
import { listBriefs, saveBrief, createBrief } from '../../../utils/briefStore';
import { callGenerateBrief } from '../../../utils/liveDataSync';
import { getKnowledgeForLane } from '../knowledge/index';
import { SPRINT_STATUSES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const STATUS_PILL = {
  draft: { bg: '#EBE5D5', color: '#716F70', label: 'Draft' },
  approved: { bg: '#D4EDDA', color: '#3B6D11', label: 'Approved' },
  revised: { bg: '#FFF3CD', color: '#854F0B', label: 'Revised' },
  rejected: { bg: '#FDECEA', color: '#A32D2D', label: 'Rejected' },
};

const LANE_LABEL = { ai: 'AI', high_production: 'High Production', creator: 'Creator', founder: 'Founder' };

export default function BriefDetail({ sprintId }) {
  const [sprint, setSprint] = useState(null);
  const [briefs, setBriefs] = useState(null);
  const [activeBriefIdx, setActiveBriefIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  useEffect(() => {
    if (!sprintId) return;
    setSprint(null);
    setBriefs(null);
    setActiveBriefIdx(0);
    setGenError(null);
    Promise.all([getSprint(sprintId), listBriefs({ sprintId })]).then(([s, bs]) => {
      setSprint(s);
      setBriefs(bs);
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
      const knowledge = getKnowledgeForLane(sprint.lane);
      const newBrief = await callGenerateBrief({ sprint_id: sprintId, knowledge });
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>
      {/* Left rail */}
      <div>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 4 }}>
            S{sprint.sprint_number} · {LANE_LABEL[sprint.lane] || sprint.lane}
          </p>
          {sprint.hypothesis_type && (
            <p style={{ fontSize: 12, color: FR.stone, marginBottom: 4 }}>{sprint.hypothesis_type}</p>
          )}
          {sprint.constraint_text && (
            <p style={{ fontSize: 12, color: FR.slate, fontStyle: 'italic' }}>{sprint.constraint_text}</p>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            width: '100%', fontSize: 12, padding: '7px 0', borderRadius: 6,
            background: generating ? FR.sand : FR.slate,
            color: generating ? FR.stone : FR.salt,
            border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
            marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', width: 10, height: 10, border: `1.5px solid ${FR.stone}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Generating…
            </>
          ) : (
            briefs.length > 0 ? 'Re-generate Brief' : 'Generate Brief'
          )}
        </button>

        {genError && (
          <p style={{ fontSize: 11, color: '#A32D2D', marginBottom: 12, wordBreak: 'break-word' }}>{genError}</p>
        )}

        {briefs.length === 0
          ? <p style={{ fontSize: 12, color: FR.stone }}>No brief yet.</p>
          : briefs.map((b, idx) => {
            const pill = STATUS_PILL[b.status] || STATUS_PILL.draft;
            return (
              <button
                key={b.id}
                onClick={() => setActiveBriefIdx(idx)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: idx === activeBriefIdx ? '#fff' : 'transparent',
                  border: `0.5px solid ${idx === activeBriefIdx ? 'rgba(58,58,58,0.15)' : 'transparent'}`,
                  borderRadius: 6, padding: '7px 10px', marginBottom: 4, cursor: 'pointer',
                }}
              >
                <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>v{b.version}</span>
                <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: pill.bg, color: pill.color }}>{pill.label}</span>
              </button>
            );
          })}
      </div>

      {/* Right doc */}
      {brief ? (
        <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 24px' }}>
          {brief.status === 'draft' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <ActionBtn label="Approve" onClick={handleApprove} color="#3B6D11" />
              <ActionBtn label="Revise + Regenerate" onClick={handleRevise} color="#854F0B" disabled={generating} />
              <ActionBtn label="Reject" onClick={handleReject} color="#A32D2D" />
            </div>
          )}

          {brief.status === 'approved' && (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#D4EDDA', color: '#3B6D11' }}>Approved</span>
              <span style={{ fontSize: 11, color: FR.stone }}>Ready to dispatch render in Phase 3.</span>
            </div>
          )}

          <BriefSection label="Hypothesis" text={brief.hypothesis} />
          <BriefSection label="Key Feeling" text={brief.key_feeling} />
          <BriefSection label="Hook (first 3 seconds)" text={brief.hook} />
          <BriefSection label="Payoff" text={brief.payoff} />

          {brief.shot_list?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 6 }}>Shot List</p>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {brief.shot_list.map((shot, i) => (
                  <li key={i} style={{ fontSize: 13, color: FR.slate, marginBottom: 4 }}>{shot}</li>
                ))}
              </ol>
            </div>
          )}

          <BriefSection label="Caption" text={brief.caption} />
          <BriefSection label="Prompt Blueprint" text={brief.prompt_blueprint} mono />

          {brief.past_learnings_consulted?.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(58,58,58,0.08)' }}>
              <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
                Past Learnings Consulted ({brief.past_learnings_consulted.length})
              </p>
              {brief.past_learnings_consulted.map((l, i) => {
                const isWinner = l.consulted_as === 'winner' || l.outcome === 'winner';
                return (
                  <div key={i} style={{
                    fontSize: 12, color: FR.stone,
                    borderLeft: `2px solid ${isWinner ? '#3B6D11' : '#A32D2D'}`,
                    paddingLeft: 10, marginBottom: 6,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: isWinner ? '#3B6D11' : '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {isWinner ? 'winner' : 'loser'}
                    </span>
                    {' · '}
                    {typeof l === 'string' ? l : l.summary || JSON.stringify(l)}
                  </div>
                );
              })}
            </div>
          )}

          {brief.agent_model && (
            <p style={{ marginTop: 16, fontSize: 10, color: FR.stone, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
              Generated by {brief.agent_model} · v{brief.version}
              {brief.generated_at ? ` · ${new Date(brief.generated_at).toLocaleString()}` : ''}
            </p>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: FR.stone, marginBottom: 8 }}>No brief generated yet.</p>
          <p style={{ fontSize: 12, color: FR.stone }}>Click "Generate Brief" to have the Creative Engine write one based on your sprint constraint and past learnings.</p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function BriefSection({ label, text, mono = false }) {
  if (!text) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 4 }}>{label}</p>
      <p style={{
        fontSize: 13, color: FR.slate, margin: 0,
        fontFamily: mono ? 'ui-monospace, SF Mono, Menlo, monospace' : undefined,
        whiteSpace: 'pre-wrap',
      }}>
        {text}
      </p>
    </div>
  );
}

function ActionBtn({ label, onClick, color, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12, padding: '5px 12px', borderRadius: 6,
        border: `0.5px solid ${color}`, color, background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
