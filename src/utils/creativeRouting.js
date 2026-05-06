// Creative Engine hash routing helpers.
//
// Hash grammar (after the Creative Engine tab):
//   #creative-engine                         → Today view (default)
//   #creative-engine/today                   → Today view
//   #creative-engine/knowledge               → Knowledge Files
//   #creative-engine/pulse                   → System Pulse
//   #creative-engine/sprints                 → Sprint List
//   #creative-engine/brief/<sprintId>        → Brief detail for sprint
//   #creative-engine/jobs                    → Job Queue
//   #creative-engine/production              → Production view
//   #creative-engine/queue                   → Render Queue
//   #creative-engine/ads                     → Live Ads
//   #creative-engine/library                 → Creative Library
//   #creative-engine/learnings               → Learning Archive
//   #creative-engine/learnings/<id>/discuss  → Discussion view
//
// Mirrors src/utils/plmRouting.js exactly in structure.

const CREATIVE_TAB = 'creative-engine';

export const CREATIVE_VIEWS = [
  'today', 'knowledge', 'pulse', 'sprints', 'brief',
  'jobs', 'production', 'queue', 'ads', 'library', 'learnings',
];
const CREATIVE_VIEW_SET = new Set(CREATIVE_VIEWS);

const DEFAULT_VIEW = 'today';

function emptyResult() {
  return { tab: null, view: DEFAULT_VIEW, id: null, subAction: null };
}

function buildResult({ view, id, subAction }) {
  return {
    tab: CREATIVE_TAB,
    view: view || DEFAULT_VIEW,
    id: id || null,
    subAction: subAction || null,
  };
}

function parseInner(parts) {
  // parts[0] was already matched to CREATIVE_TAB.
  const view = parts[1];
  if (!view) return buildResult({ view: DEFAULT_VIEW, id: null, subAction: null });

  if (!CREATIVE_VIEW_SET.has(view)) {
    return buildResult({ view: DEFAULT_VIEW, id: null, subAction: null });
  }

  // Learnings can host a nested discuss route: /learnings/<id>/discuss
  if (view === 'learnings') {
    const id = parts[2] || null;
    const subAction = parts[3] || null;
    return buildResult({ view, id, subAction });
  }

  // Brief + other views: optional /<id>
  const id = parts[2] || null;
  return buildResult({ view, id, subAction: null });
}

export function parseCreativeHash() {
  if (typeof window === 'undefined') return emptyResult();
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const tab = parts[0] || null;
  if (tab === CREATIVE_TAB) return parseInner(parts);
  return emptyResult();
}

export function buildCreativeHash({ view, id, subAction } = {}) {
  const v = CREATIVE_VIEW_SET.has(view) ? view : DEFAULT_VIEW;
  let h = `#${CREATIVE_TAB}/${v}`;
  if (id) {
    h += `/${id}`;
    if (subAction) h += `/${subAction}`;
  }
  return h;
}

export function setCreativeHash(parts) {
  const next = buildCreativeHash(parts);
  if (window.location.hash !== next) {
    window.history.pushState(null, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function replaceCreativeHash(parts) {
  const next = buildCreativeHash(parts);
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

// Normalise any stale or bare #creative-engine hash on first load.
// Already-canonical hashes are left alone.
export function normalizeCreativeLegacyHash() {
  if (typeof window === 'undefined') return;
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  if (!raw) return;
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] !== CREATIVE_TAB) return;
  const parsed = parseInner(parts);
  const next = buildCreativeHash({ view: parsed.view, id: parsed.id, subAction: parsed.subAction });
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}
