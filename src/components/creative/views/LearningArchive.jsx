import { useEffect, useState } from 'react';
import { listLearnings } from '../../../utils/learningStore';
import { LANES, LEARNING_OUTCOMES, LANE_VALUES } from '../../../types/creative';
import { setCreativeHash } from '../../../utils/creativeRouting';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const OUTCOME_PILL = {
  winner: { bg: '#D4EDDA', color: '#3B6D11' },
  loser: { bg: '#FDECEA', color: '#A32D2D' },
  inconclusive: { bg: '#EBE5D5', color: '#716F70' },
};

const LANE_LABEL = { ai: 'AI', high_production: 'High Prod', creator: 'Creator', founder: 'Founder' };

export default function LearningArchive() {
  const [learnings, setLearnings] = useState(null);
  const [filterLane, setFilterLane] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');

  useEffect(() => {
    listLearnings({
      lane: filterLane || undefined,
      outcome: filterOutcome || undefined,
    }).then(setLearnings);
  }, [filterLane, filterOutcome]);

  const topWinner = learnings?.find(l => l.outcome === 'winner') || null;
  const topLoser = learnings?.find(l => l.outcome === 'loser') || null;

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 16 }}>
        Learning Archive
      </h2>

      {/* Summary bar */}
      {learnings && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Top Winning Pattern" text={topWinner?.summary || 'None yet'} color="#3B6D11" />
          <SummaryCard label="Top Losing Pattern" text={topLoser?.summary || 'None yet'} color="#A32D2D" />
        </div>
      )}

      {/* Filters */}
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
        ? <p style={{ fontSize: 13, color: FR.stone }}>No learnings yet. They populate after weekly synthesis in Phase 5.</p>
        : learnings.map(l => {
          const pill = OUTCOME_PILL[l.outcome] || OUTCOME_PILL.inconclusive;
          return (
            <div key={l.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: pill.bg, color: pill.color }}>{l.outcome}</span>
                <span style={{ fontSize: 11, color: FR.stone }}>{LANE_LABEL[l.lane] || l.lane}</span>
                {l.hypothesis_type && <span style={{ fontSize: 11, color: FR.stone }}>· {l.hypothesis_type}</span>}
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
