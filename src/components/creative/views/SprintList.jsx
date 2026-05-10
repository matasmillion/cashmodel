import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { listSprints } from '../../../utils/sprintStore';
import { SPRINT_STATUSES } from '../../../types/creative';
import { setCreativeHash } from '../../../utils/creativeRouting';
import NewSprintDialog from '../dialogs/NewSprintDialog';
import { FR, LANE_TOKEN, SPRINT_STATUS_TOKEN, pillStyle } from '../palette';

const STATUS_ORDER = [
  SPRINT_STATUSES.DRAFTING,
  SPRINT_STATUSES.BRIEF_READY,
  SPRINT_STATUSES.RENDERING,
  SPRINT_STATUSES.IN_QUEUE,
  SPRINT_STATUSES.LIVE,
  SPRINT_STATUSES.CLOSED,
];

const SEED_KEY = 'cashmodel_creative_sprint_seed';

function readSeed() {
  try {
    const raw = localStorage.getItem(SEED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearSeed() {
  try { localStorage.removeItem(SEED_KEY); } catch { /* best-effort */ }
}

export default function SprintList() {
  const [sprints, setSprints] = useState(null);
  const [seed, setSeed] = useState(() => readSeed());
  const [showNew, setShowNew] = useState(() => seed !== null);

  useEffect(() => { listSprints().then(setSprints); }, []);

  const handleCloseDialog = () => {
    setShowNew(false);
    setSeed(null);
    clearSeed();
  };

  const grouped = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = (sprints || []).filter(sp => sp.status === s);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, margin: 0 }}>
          Sprints
        </h2>
        <button
          onClick={() => setShowNew(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '7px 14px', borderRadius: 7,
            border: 'none', background: FR.ink, color: '#fff', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          <Plus size={13} /> New Sprint
        </button>
      </div>

      {sprints === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: 14 }}>
            {STATUS_ORDER.map(status => {
              const token = SPRINT_STATUS_TOKEN[status];
              return (
                <div key={status}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={pillStyle(token)}>{token.label}</span>
                    <span style={{ fontSize: 11, color: FR.stone, fontVariantNumeric: 'tabular-nums' }}>
                      {grouped[status].length}
                    </span>
                  </div>
                  {grouped[status].length === 0
                    ? <div style={{ height: 56, background: 'rgba(0,0,0,0.025)', border: '1px dashed rgba(0,0,0,0.08)', borderRadius: 10 }} />
                    : grouped[status].map(sp => <SprintCard key={sp.id} sprint={sp} />)}
                </div>
              );
            })}
          </div>
        )}

      {showNew && (
        <NewSprintDialog
          seed={seed}
          onClose={handleCloseDialog}
          onCreate={(sprint) => {
            setSprints(prev => [sprint, ...(prev || [])]);
            handleCloseDialog();
            setCreativeHash({ view: 'brief', id: sprint.id });
          }}
        />
      )}
    </div>
  );
}

function SprintCard({ sprint }) {
  const lane = LANE_TOKEN[sprint.lane] || LANE_TOKEN.ai;
  const headline = sprint.constraint_text || sprint.hypothesis_type || '—';
  return (
    <button
      onClick={() => setCreativeHash({ view: 'brief', id: sprint.id })}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 10, padding: '12px 14px', marginBottom: 10, cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        transition: 'transform .12s ease, box-shadow .12s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Top stripe colored by lane */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: lane.stripe }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 }}>
        <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone, fontWeight: 500 }}>
          S{sprint.sprint_number}
        </span>
        <span style={pillStyle(lane)}>{lane.label}</span>
      </div>
      <p style={{
        fontSize: 13, color: FR.ink, margin: 0, lineHeight: 1.35,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {headline}
      </p>
      {sprint.cpa_target && (
        <p style={{ fontSize: 11, color: FR.stone, marginTop: 8, marginBottom: 0 }}>
          Target CPA <span style={{ color: FR.ink, fontVariantNumeric: 'tabular-nums' }}>${sprint.cpa_target}</span>
        </p>
      )}
    </button>
  );
}
