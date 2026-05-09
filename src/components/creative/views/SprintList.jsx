import { useEffect, useState } from 'react';
import { listSprints } from '../../../utils/sprintStore';
import { SPRINT_STATUSES, LANES } from '../../../types/creative';
import { setCreativeHash } from '../../../utils/creativeRouting';
import NewSprintDialog from '../dialogs/NewSprintDialog';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const STATUS_ORDER = [
  SPRINT_STATUSES.DRAFTING,
  SPRINT_STATUSES.BRIEF_READY,
  SPRINT_STATUSES.RENDERING,
  SPRINT_STATUSES.IN_QUEUE,
  SPRINT_STATUSES.LIVE,
  SPRINT_STATUSES.CLOSED,
];

const STATUS_LABEL = {
  drafting: 'Drafting',
  brief_ready: 'Brief Ready',
  rendering: 'Rendering',
  in_queue: 'In Queue',
  live: 'Live',
  closed: 'Closed',
};

const LANE_LABEL = {
  ai: 'AI',
  high_production: 'High Production',
  creator: 'Creator',
  founder: 'Founder',
};

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
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '0.5px solid rgba(58,58,58,0.2)', background: FR.sand, color: FR.slate, cursor: 'pointer' }}
        >
          New Sprint
        </button>
      </div>

      {sprints === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {STATUS_ORDER.map(status => (
              <div key={status}>
                <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>
                  {STATUS_LABEL[status]} ({grouped[status].length})
                </p>
                {grouped[status].length === 0
                  ? <div style={{ height: 48, background: FR.sand, borderRadius: 8, opacity: 0.4 }} />
                  : grouped[status].map(sp => (
                    <button
                      key={sp.id}
                      onClick={() => setCreativeHash({ view: 'brief', id: sp.id })}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)',
                        borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
                        S{sp.sprint_number}
                      </div>
                      <div style={{ fontSize: 12, color: FR.slate, marginTop: 2 }}>
                        {LANE_LABEL[sp.lane] || sp.lane}
                      </div>
                      {sp.hypothesis_type && (
                        <div style={{ fontSize: 11, color: FR.stone, marginTop: 2 }}>{sp.hypothesis_type}</div>
                      )}
                    </button>
                  ))}
              </div>
            ))}
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
