import { useEffect, useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { listLearnings } from '../../../utils/learningStore';
import { listDiscussions } from '../../../utils/discussionStore';
import { LANE_VALUES } from '../../../types/creative';
import { setCreativeHash } from '../../../utils/creativeRouting';
import { callSynthesizeWeekly } from '../../../utils/liveDataSync';
import { FR, OUTCOME_TOKEN, LANE_TOKEN, pillStyle } from '../palette';

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
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.ink, margin: 0 }}>
          Learning Archive
        </h2>
        <button
          onClick={handleSynthesize}
          disabled={synthesizing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '6px 13px', borderRadius: 7,
            border: '1px solid rgba(0,0,0,0.12)',
            background: '#fff', color: FR.ink,
            cursor: synthesizing ? 'not-allowed' : 'pointer', fontWeight: 500,
          }}
        >
          <Sparkles size={12} /> {synthesizing ? 'Synthesizing…' : 'Run synthesis now'}
        </button>
      </div>
      {synthErr && <p style={{ fontSize: 11, color: FR.red, marginBottom: 12 }}>{synthErr}</p>}

      {pendingDiscussions.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: FR.blue, textTransform: 'uppercase', marginBottom: 8 }}>
            Awaiting your discussion · {pendingDiscussions.length}
          </p>
          {pendingDiscussions.map(d => (
            <button
              key={d.id}
              onClick={() => setCreativeHash({ view: 'learnings', id: d.id })}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: FR.blueLight, border: `1px solid ${FR.blue}33`,
                borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
                position: 'relative',
              }}
            >
              <p style={{ fontSize: 12, color: FR.ink, margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>
                {(d.synthesis_draft || 'Awaiting synthesis…').slice(0, 200)}{(d.synthesis_draft?.length || 0) > 200 ? '…' : ''}
              </p>
              <p style={{ fontSize: 10.5, color: FR.blue, marginTop: 6, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''} · click to discuss & finalize <ArrowRight size={10} />
              </p>
            </button>
          ))}
        </div>
      )}

      {learnings && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Top winning pattern" text={topWinner?.summary || 'None yet'} fg={FR.green} bg={FR.greenLight} />
          <SummaryCard label="Top losing pattern" text={topLoser?.summary || 'None yet'} fg={FR.red} bg={FR.redLight} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select value={filterLane} onChange={e => setFilterLane(e.target.value)} style={selectStyle}>
          <option value="">All Lanes</option>
          {LANE_VALUES.map(l => <option key={l} value={l}>{LANE_TOKEN[l]?.label || l}</option>)}
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
          const otoken = OUTCOME_TOKEN[l.outcome] || OUTCOME_TOKEN.inconclusive;
          const ltoken = LANE_TOKEN[l.lane];
          return (
            <div key={l.id} style={{
              background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 8,
              position: 'relative', overflow: 'hidden',
            }}>
              {ltoken && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, background: ltoken.stripe }} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={pillStyle(otoken)}>{otoken.label}</span>
                  {ltoken && <span style={pillStyle(ltoken)}>{ltoken.label}</span>}
                  {l.hypothesis_type && <span style={{ fontSize: 11, color: FR.stone }}>· {l.hypothesis_type}</span>}
                </div>
                <button
                  onClick={() => handleSeedFromLearning(l)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, padding: '4px 10px', borderRadius: 6,
                    border: '1px solid rgba(0,0,0,0.12)', background: '#fff',
                    color: FR.ink, cursor: 'pointer', flexShrink: 0, fontWeight: 500,
                  }}
                >
                  Seed new sprint <ArrowRight size={11} />
                </button>
              </div>
              <p style={{ fontSize: 13, color: FR.ink, margin: 0, lineHeight: 1.5 }}>{l.summary}</p>
            </div>
          );
        })}
    </div>
  );
}

function SummaryCard({ label, text, fg, bg }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${fg}22`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: fg, textTransform: 'uppercase', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 12.5, color: FR.ink, margin: 0, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

const selectStyle = {
  fontSize: 12, padding: '6px 11px', borderRadius: 7,
  border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: FR.ink, cursor: 'pointer',
};
