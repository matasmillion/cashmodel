import { useEffect, useState } from 'react';
import { getSprint } from '../../../utils/sprintStore';
import { listBriefs, saveBrief, createBrief } from '../../../utils/briefStore';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const STATUS_PILL = {
  draft: { bg: '#EBE5D5', color: '#716F70' },
  approved: { bg: '#D4EDDA', color: '#3B6D11' },
  revised: { bg: '#FFF3CD', color: '#854F0B' },
  rejected: { bg: '#FDECEA', color: '#A32D2D' },
};

export default function BriefDetail({ sprintId }) {
  const [sprint, setSprint] = useState(null);
  const [briefs, setBriefs] = useState(null);
  const [activeBriefIdx, setActiveBriefIdx] = useState(0);

  useEffect(() => {
    if (!sprintId) return;
    Promise.all([getSprint(sprintId), listBriefs({ sprintId })]).then(([s, bs]) => {
      setSprint(s);
      setBriefs(bs);
    });
  }, [sprintId]);

  if (!sprintId) return <p style={{ fontSize: 13, color: FR.stone }}>Select a sprint from the Sprint List.</p>;
  if (!sprint || briefs === null) return <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>;

  const brief = briefs[activeBriefIdx] || null;

  const handleAction = async (action) => {
    if (!brief) return;
    if (action === 'approve') {
      const updated = await saveBrief(brief.id, { status: 'approved', approved_at: new Date().toISOString() });
      setBriefs(prev => prev.map(b => b.id === updated.id ? updated : b));
    } else if (action === 'reject') {
      const updated = await saveBrief(brief.id, { status: 'rejected' });
      setBriefs(prev => prev.map(b => b.id === updated.id ? updated : b));
    } else if (action === 'revise') {
      const newBrief = await createBrief({
        sprint_id: sprintId,
        version: brief.version + 1,
        status: 'draft',
        hypothesis: brief.hypothesis,
        hypothesis_type: sprint.hypothesis_type,
      });
      await saveBrief(brief.id, { status: 'revised' });
      setBriefs(prev => [newBrief, ...prev.map(b => b.id === brief.id ? { ...b, status: 'revised' } : b)]);
      setActiveBriefIdx(0);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>
      {/* Left rail — brief version list */}
      <div>
        <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
          S{sprint.sprint_number} · {sprint.lane}
        </p>
        {briefs.length === 0
          ? <p style={{ fontSize: 13, color: FR.stone }}>No brief yet. Generate one in Phase 2.</p>
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
                  borderRadius: 6, padding: '8px 10px', marginBottom: 4, cursor: 'pointer',
                }}
              >
                <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>v{b.version}</span>
                <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: pill.bg, color: pill.color }}>{b.status}</span>
              </button>
            );
          })}
      </div>

      {/* Right doc */}
      {brief ? (
        <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {brief.status === 'draft' && (
              <>
                <ActionBtn label="Approve" onClick={() => handleAction('approve')} color="#3B6D11" />
                <ActionBtn label="Revise" onClick={() => handleAction('revise')} color="#854F0B" />
                <ActionBtn label="Reject" onClick={() => handleAction('reject')} color="#A32D2D" />
              </>
            )}
          </div>

          <BriefSection label="Hypothesis" text={brief.hypothesis} />
          <BriefSection label="Key Feeling" text={brief.key_feeling} />
          <BriefSection label="Hook" text={brief.hook} />
          <BriefSection label="Payoff" text={brief.payoff} />
          <BriefSection label="Caption" text={brief.caption} />
          <BriefSection label="Prompt Blueprint" text={brief.prompt_blueprint} mono />

          {brief.past_learnings_consulted?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
                Past Learnings Consulted
              </p>
              {brief.past_learnings_consulted.map((l, i) => (
                <div key={i} style={{ fontSize: 12, color: FR.stone, borderLeft: '2px solid #EBE5D5', paddingLeft: 10, marginBottom: 6 }}>
                  {typeof l === 'string' ? l : l.summary || JSON.stringify(l)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: FR.stone }}>Select a brief version.</p>
      )}
    </div>
  );
}

function BriefSection({ label, text, mono = false }) {
  if (!text) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, letterSpacing: '0.08em', color: '#716F70', textTransform: 'uppercase', marginBottom: 4 }}>{label}</p>
      <p style={{
        fontSize: 13,
        color: '#3A3A3A',
        fontFamily: mono ? 'ui-monospace, SF Mono, Menlo, monospace' : undefined,
        whiteSpace: 'pre-wrap',
        margin: 0,
      }}>
        {text}
      </p>
    </div>
  );
}

function ActionBtn({ label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: `0.5px solid ${color}`, color, background: 'transparent', cursor: 'pointer' }}
    >
      {label}
    </button>
  );
}
