import { useEffect, useState } from 'react';
import { listLearnings } from '../../../utils/learningStore';
import { listDiscussions } from '../../../utils/discussionStore';
import { LANE_VALUES } from '../../../types/creative';
import { setCreativeHash } from '../../../utils/creativeRouting';
import { callSynthesizeWeekly } from '../../../utils/liveDataSync';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const OUTCOME_PILL = {
  winner: { bg: '#D4EDDA', color: '#3B6D11' },
  loser: { bg: '#FDECEA', color: '#A32D2D' },
  inconclusive: { bg: '#EBE5D5', color: '#716F70' },
};

const LANE_LABEL = { ai: 'AI', high_production: 'High Prod', creator: 'Creator', founder: 'Founder' };

export default function LearningArchive() {
  const [learnings, setLearnings] = useState(null);
  const [pendingDiscussions, setPendingDiscussions] = useState([]);
  const [filterLane, setFilterLane] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthErr, setSynthErr] = useState(null);

  useEffect(() => {
    listLearnings({
      lane: filterLane || undefined,
      outcome: filterOutcome || undefined,
    }).then(setLearnings);
  }, [filterLane, filterOutcome]);

  useEffect(() => {
    listDiscussions({ finalized: false }).then(setPendingDiscussions);
  }, []);

  const topWinner = learnings?.find(l => l.outcome === 'winner') || null;
  const topLoser = learnings?.find(l => l.outcome === 'loser') || null;

  const handleSynthesize = async () => {
    setSynthesizing(true);
    setSynthErr(null);
    try {
      await callSynthesizeWeekly();
      const ds = await listDiscussions({ finalized: false });
      setPendingDiscussions(ds);
    } catch (err) {
      setSynthErr(err.message);
    } finally {
      setSynthesizing(false);
    }
  };

  const handleSeedFromLearning = (learning) => {
    try {
      localStorage.setItem('cashmodel_creative_sprint_seed', JSON.stringify({
        constraint_text: learning.summary,
        seeded_from: learning.id,
        hypothesis_type: learning.hypothesis_type || '',
        lane: learning.lane || '',
      }));
    } catch { /* best-effort */ }
    setCreativeHash({ view: 'sprints' });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 8 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, margin: 0 }}>
          Learning Archive
        </h2>
        <button
          onClick={handleSynthesize}
          disabled={synthesizing}
          style={{
            fontSize: 11, padding: '5px 12px', borderRadius: 6,
            border: '0.5px solid rgba(58,58,58,0.2)',
            background: 'transparent', color: FR.slate,
            cursor: synthesizing ? 'not-allowed' : 'pointer',
          }}
        >
          {synthesizing ? 'Synthesizing…' : 'Run synthesis now'}
        </button>
      </div>
      {synthErr && <p style={{ fontSize: 11, color: '#A32D2D', marginBottom: 12 }}>{synthErr}</p>}

      {pendingDiscussions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
            Pending Discussions ({pendingDiscussions.length})
          </p>
          {pendingDiscussions.map(d => (
            <button
              key={d.id}
              onClick={() => setCreativeHash({ view: 'learnings', id: d.id })}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 6, cursor: 'pointer',
              }}
            >
              <p style={{ fontSize: 12, color: FR.slate, margin: 0, fontStyle: 'italic' }}>
                {(d.synthesis_draft || 'Awaiting synthesis…').slice(0, 150)}{(d.synthesis_draft?.length || 0) > 150 ? '…' : ''}
              </p>
              <p style={{ fontSize: 10, color: FR.stone, marginTop: 4, marginBottom: 0 }}>
                {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''} · click to discuss & finalize
              </p>
            </button>
          ))}
        </div>
      )}

      {learnings && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Top Winning Pattern" text={topWinner?.summary || 'None yet'} color="#3B6D11" />
          <SummaryCard label="Top Losing Pattern" text={topLoser?.summary || 'None yet'} color="#A32D2D" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select value={filterLane} onChange={e => setFilterLane(e.target.value)} style={selectStyle}>
          <option value="">All Lanes</option>
          {LANE_VALUES.map(l => <option key={l} value={l}>{LANE_LABEL[l]}</option>)}
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} style={selectStyle}>
          <option value="">All Outcomes</option>
          <option value="winner">Winner</option>
          <option value="loser">Loser</option>
          <option value="inconclusive">Inconclusive</option>
        </select>
      </div>

      {learnings === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : learnings.length === 0
        ? <p style={{ fontSize: 13, color: FR.stone }}>No learnings yet. They populate as discussions are finalized.</p>
        : learnings.map(l => {
          const pill = OUTCOME_PILL[l.outcome] || OUTCOME_PILL.inconclusive;
          return (
            <div key={l.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: pill.bg, color: pill.color }}>{l.outcome}</span>
                  <span style={{ fontSize: 11, color: FR.stone }}>{LANE_LABEL[l.lane] || l.lane}</span>
                  {l.hypothesis_type && <span style={{ fontSize: 11, color: FR.stone }}>· {l.hypothesis_type}</span>}
                </div>
                <button
                  onClick={() => handleSeedFromLearning(l)}
                  style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 5,
                    border: '0.5px solid rgba(58,58,58,0.2)', background: 'transparent',
                    color: FR.slate, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Seed new sprint
                </button>
              </div>
              <p style={{ fontSize: 13, color: FR.slate, margin: 0 }}>{l.summary}</p>
            </div>
          );
        })}
    </div>
  );
}

function SummaryCard({ label, text, color }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '12px 14px' }}>
      <p style={{ fontSize: 10, letterSpacing: '0.08em', color, textTransform: 'uppercase', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 12, color: '#3A3A3A', margin: 0 }}>{text}</p>
    </div>
  );
}

const selectStyle = {
  fontSize: 12, padding: '5px 10px', borderRadius: 6,
  border: '0.5px solid rgba(58,58,58,0.2)', background: '#fff', color: '#3A3A3A', cursor: 'pointer',
};
