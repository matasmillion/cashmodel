// Creative Engine — main dispatcher.
// Mirrors PLMView.jsx: thin shell, hash-synced routing, per-view imports.
//
// Hash grammar: #creative-engine/{view}[/{id}]
// Views: today | knowledge | pulse | sprints | brief | jobs |
//         production | queue | ads | library | learnings

import { useEffect, useState } from 'react';
import { parseCreativeHash, setCreativeHash, normalizeCreativeLegacyHash } from '../../utils/creativeRouting';
import { listSprints } from '../../utils/sprintStore';
import { listRenders } from '../../utils/renderStore';
import { listAds } from '../../utils/adStore';
import { listDiscussions } from '../../utils/discussionStore';
import { SPRINT_STATUSES, RENDER_STATUSES, AD_STATUSES } from '../../types/creative';
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
import { FR, KEYFRAMES } from './palette';

const TAB_GROUPS = [
  // Order chosen for the operator's flow: top-of-funnel → bottom-of-funnel
  { view: 'today',      label: 'Today' },
  { view: 'sprints',    label: 'Sprints' },
  { view: 'brief',      label: 'Brief',         badgeKind: 'briefPending' },
  { view: 'production', label: 'Production',    badgeKind: 'production' },
  { view: 'queue',      label: 'Render Queue',  badgeKind: 'queue' },
  { view: 'ads',        label: 'Live Ads',      badgeKind: 'liveAds' },
  { view: 'learnings',  label: 'Learnings',     badgeKind: 'pendingDiscussions' },
  { view: 'library',    label: 'Library' },
  { view: 'knowledge',  label: 'Knowledge' },
  { view: 'jobs',       label: 'Jobs' },
  { view: 'pulse',      label: 'Pulse' },
];

const COUNT_POLL_MS = 60_000;

export default function CreativeEngineView() {
  const [route, setRoute] = useState(() => parseCreativeHash());
  const [counts, setCounts] = useState({});

  useEffect(() => {
    normalizeCreativeLegacyHash();
    const onPop = () => setRoute(parseCreativeHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [sprints, renders, ads, discussions] = await Promise.all([
        listSprints(),
        listRenders(),
        listAds(),
        listDiscussions({ finalized: false }),
      ]);
      if (!alive) return;
      setCounts({
        briefPending:        sprints.filter(s => s.status === SPRINT_STATUSES.BRIEF_READY).length,
        production:          renders.filter(r => r.status === RENDER_STATUSES.PROCESSING).length,
        queue:               renders.filter(r => r.status === RENDER_STATUSES.DONE).length,
        liveAds:             ads.filter(a => a.status === AD_STATUSES.ACTIVE).length,
        pendingDiscussions:  discussions.length,
      });
    };
    refresh();
    const id = setInterval(refresh, COUNT_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const { view, id, subAction } = route;

  return (
    <div>
      <style>{KEYFRAMES}</style>

      {/* Module header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontWeight: 400, fontSize: 28, color: FR.ink,
          letterSpacing: '0.01em', margin: 0,
        }}>
          Creative Engine
        </h1>
        <p style={{ fontSize: 12, color: FR.stone, marginTop: 4 }}>
          4-week sprint loop · constrain → hypothesize → brief → render → evaluate → learn
        </p>
      </div>

      {/* Metric strip (auto-refreshes every 60s) */}
      <CreativeMetricStrip />

      {/* Tab bar — V5 style: underline accent on active, colored count badges */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        marginBottom: 24,
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        flexWrap: 'wrap',
      }}>
        {TAB_GROUPS.map(tab => {
          const isActive = view === tab.view;
          const count = tab.badgeKind ? counts[tab.badgeKind] : null;
          const badgeColor = badgeColorFor(tab.badgeKind);
          return (
            <button
              key={tab.view}
              onClick={() => setCreativeHash({ view: tab.view })}
              style={{
                fontSize: 13, padding: '11px 14px',
                background: 'transparent',
                color: isActive ? FR.ink : FR.stone,
                fontWeight: isActive ? 500 : 400,
                border: 'none', cursor: 'pointer',
                borderBottom: isActive ? `2px solid ${FR.ink}` : '2px solid transparent',
                marginBottom: -1,
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                transition: 'color .12s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = FR.ink; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = FR.stone; } }}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: badgeColor.bg, color: badgeColor.fg,
                  borderRadius: 10, fontSize: 10, padding: '1px 7px', fontWeight: 600,
                  minWidth: 18, height: 16, lineHeight: 1,
                }}>{count}</span>
              )}
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

function badgeColorFor(kind) {
  switch (kind) {
    case 'briefPending':       return { bg: FR.blueLight,   fg: FR.blue };
    case 'production':         return { bg: FR.amberLight,  fg: FR.amber };
    case 'queue':              return { bg: FR.purpleLight, fg: FR.purple };
    case 'liveAds':            return { bg: FR.greenLight,  fg: FR.green };
    case 'pendingDiscussions': return { bg: FR.creatorBg,   fg: FR.creatorFg };
    default:                   return { bg: 'rgba(0,0,0,0.06)', fg: FR.stone };
  }
}
