// PLM hash routing helpers.
//
// URL grammar:
//   #product                                  → PLM, Styles list (default)
//   #product/styles                           → PLM, Styles list
//   #product/components                       → PLM, Components list
//   #product/colors                           → PLM, Color palette manager
//   #product/styles/<packId>                  → Tech Pack builder, step 1
//   #product/styles/<packId>/<step>           → Tech Pack builder, specific step (1-indexed)
//   #product/components/<packId>              → Component Pack builder, step 1
//   #product/components/<packId>/<step>       → Component Pack builder, specific step (1-indexed)
//
// Every component reads the parts it cares about and rewrites only its own
// segment via setPLMHash so the deep state (active pack, active step) sticks
// across reloads, back/forward, and tab switches.

const PLM_TAB = 'product';
const VALID_SECTIONS = new Set(['styles', 'components', 'colors']);

export function parsePLMHash() {
  if (typeof window === 'undefined') return { tab: null, section: 'styles', packId: null, step: 0 };
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const tab = parts[0] || null;
  if (tab !== PLM_TAB) return { tab, section: 'styles', packId: null, step: 0 };

  const section = VALID_SECTIONS.has(parts[1]) ? parts[1] : 'styles';
  const packId = parts[2] || null;
  // URL is 1-indexed for humans; internal step is 0-indexed
  const stepRaw = parseInt(parts[3], 10);
  const step = Number.isFinite(stepRaw) && stepRaw >= 1 ? stepRaw - 1 : 0;
  return { tab, section, packId, step };
}

export function buildPLMHash({ section = 'styles', packId = null, step = 0 } = {}) {
  let h = `#${PLM_TAB}/${section}`;
  if (packId) {
    h += `/${packId}`;
    if (step > 0) h += `/${step + 1}`;
  }
  return h;
}

export function setPLMHash(parts) {
  const next = buildPLMHash(parts);
  if (window.location.hash !== next) {
    window.history.pushState(null, '', next);
  }
}

// Replace (no new history entry) — used for step changes inside a builder so
// flicking through 14 wizard steps doesn't pollute the back stack.
export function replacePLMHash(parts) {
  const next = buildPLMHash(parts);
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}
