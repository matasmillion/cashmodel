// Creative Engine — main dispatcher.
// Mirrors PLMView.jsx: thin shell, hash-synced routing, per-view imports.
//
// Hash grammar: #creative-engine/{view}[/{id}]
// Views: today | knowledge | pulse | sprints | brief | jobs |
//         production | queue | ads | library | learnings

import { useEffect, useState } from 'react';
import { parseCreativeHash, setCreativeHash, normalizeCreativeLegacyHash } from '../../utils/creativeRouting';
import CreativeMetricStrip from './CreativeMetricStrip';
import TodayView from './views/TodayView';
import KnowledgeFiles from './views/KnowledgeFiles';
import SystemPulse from './views/SystemPulse';
import SprintList from './views/SprintList';
import BriefDetail from './views/BriefDetail';
import JobQueue from './views/JobQueue';
import Production from './views/Production';
import RenderQueue from './views/RenderQueue';
import LiveAds from './views/LiveAds';
import CreativeLibrary from './views/CreativeLibrary';
import LearningArchive from './views/LearningArchive';
import DiscussionView from './dialogs/DiscussionView';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const TABS = [
  { view: 'today', label: 'Today' },
  { view: 'sprints', label: 'Sprints' },
  { view: 'brief', label: 'Brief' },
  { view: 'jobs', label: 'Jobs' },
  { view: 'production', label: 'Production' },
  { view: 'queue', label: 'Render Queue' },
  { view: 'ads', label: 'Live Ads' },
  { view: 'library', label: 'Library' },
  { view: 'learnings', label: 'Learnings' },
  { view: 'pulse', label: 'Pulse' },
  { view: 'knowledge', label: 'Knowledge' },
];

export default function CreativeEngineView() {
  const [route, setRoute] = useState(() => parseCreativeHash());

  useEffect(() => {
    normalizeCreativeLegacyHash();
    const onPop = () => setRoute(parseCreativeHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const { view, id, subAction } = route;

  return (
    <div>
      {/* Module header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontWeight: 400, fontSize: 28, color: FR.slate,
          letterSpacing: '0.04em', margin: 0,
        }}>
          Creative Engine
        </h1>
        <p style={{ fontSize: 12, color: FR.stone, marginTop: 2 }}>
          4-week ad testing sprint loop — constrain · hypothesize · brief · render · evaluate · learn
        </p>
      </div>

      {/* Metric strip (auto-refreshes every 60s) */}
      <CreativeMetricStrip />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 24, borderBottom: '0.5px solid rgba(58,58,58,0.08)', paddingBottom: 8 }}>
        {TABS.map(tab => {
          const isActive = view === tab.view || (tab.view === 'brief' && view === 'brief');
          return (
            <button
              key={tab.view}
              onClick={() => setCreativeHash({ view: tab.view })}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 6,
                background: isActive ? FR.slate : 'transparent',
                color: isActive ? FR.salt : FR.stone,
                border: 'none', cursor: 'pointer',
                transition: 'background 120ms ease, color 120ms ease',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = FR.slate; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = FR.stone; } }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* View dispatch */}
      <div>
        {view === 'today' && <TodayView />}
        {view === 'knowledge' && <KnowledgeFiles />}
        {view === 'pulse' && <SystemPulse />}
        {view === 'sprints' && <SprintList />}
        {view === 'brief' && (
          subAction === 'discuss' && id
            ? <DiscussionView discussionId={id} onFinalize={() => setCreativeHash({ view: 'learnings' })} />
            : <BriefDetail sprintId={id} />
        )}
        {view === 'jobs' && <JobQueue />}
        {view === 'production' && <Production />}
        {view === 'queue' && <RenderQueue />}
        {view === 'ads' && <LiveAds />}
        {view === 'library' && <CreativeLibrary />}
        {view === 'learnings' && (
          subAction === 'discuss' && id
            ? <DiscussionView discussionId={id} onFinalize={() => setCreativeHash({ view: 'learnings' })} />
            : <LearningArchive />
        )}
      </div>
    </div>
  );
}
