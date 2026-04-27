// PLM hash routing helpers.
//
// Canonical URL grammar (after the Library/Styles/Production IA):
//   #product                                         → PLM, Library/Patterns (default)
//   #product/library                                 → PLM, Library, default atom
//   #product/library/<atom>                          → PLM, Library, specific atom
//                                                      atom ∈ {patterns|fabrics|colors|trims|treatments|embellishments|vendors}
//   #product/library/trims/<packId>                  → Component Pack builder, step 1
//   #product/library/trims/<packId>/<step>           → Component Pack builder, specific step
//   #product/library/treatments/<treatmentId>        → Treatment detail (Prompt 2)
//   #product/styles                                  → Styles list
//   #product/styles/<packId>                         → Tech Pack builder, step 1
//   #product/styles/<packId>/<step>                  → Tech Pack builder, specific step (1-indexed)
//   #product/production                              → Production list (empty state for now)
//   #product/production/<poId>                       → Production order detail (future)
//
// Legacy single-word sections (from before the IA migration) still parse:
//   #product/styles                                  → Styles (unchanged)
//   #product/components[/<packId>[/<step>]]          → Library/Trims[/…]
//   #product/colors                                  → Library/Colors
//   #product/factories                               → Library/Vendors
//
// Also tolerates an older experimental `#plm/...` prefix that briefly shipped
// during Prompt 1 development — silently rewritten to `#product/...` on load
// via normalizeLegacyHash() so no deep links break.
//
// The top-level hash segment stays `product` because that's the id of the
// PLM tab in App.jsx / AppContext VALID_TABS; changing the segment would
// have disconnected the URL from tab detection. The nested Library layer
// lives one segment deeper.
//
// Every component reads the parts it cares about and rewrites only its own
// segment via setPLMHash so the deep state (active pack, active step) sticks
// across reloads, back/forward, and tab switches.
//
// Backwards-compat note: pre-migration callers pass a single-word
// `section` ('styles'|'components'|'colors'|'factories') to set/replace, and
// read a legacy `section` field off parse results. Both shapes continue to
// work — the helpers translate between the legacy section and the new
// (layer, atom) pair so the frozen list + builder files don't need edits.

const PLM_TAB = 'product';
const ALT_TAB = 'plm'; // short-lived earlier prefix; rewritten on load.

// Every library atom the nav knows about, in the order the tabs appear.
export const LIBRARY_SECTIONS = [
  'patterns', 'fabrics', 'colors', 'trims',
  'treatments', 'embellishments', 'vendors',
];
const LIBRARY_SET = new Set(LIBRARY_SECTIONS);

const TOP_LAYERS = new Set(['library', 'styles', 'production']);

// Default landing atom when the URL is bare (`#product` or `#product/library`).
// Patterns is first in the library tab order, so a fresh user lands at the
// natural left-most starting point of the library; Colors has data but lives
// mid-row and would feel arbitrary as the entry surface.
const DEFAULT_LIBRARY_ATOM = 'patterns';

// New grammar ⇆ legacy `section` translation.
// Legacy sections: styles | components | colors | factories.
// Atoms with no legacy equivalent (patterns, fabrics, treatments,
// embellishments) surface as legacy section 'styles' purely so older callers
// reading `.section` off a parse result don't get undefined. Those callers
// only actually run when the layer is 'styles' anyway, so the fallback is
// never observed in practice.
const ATOM_TO_LEGACY_SECTION = {
  patterns: 'styles',
  fabrics: 'styles',
  colors: 'colors',
  trims: 'components',
  treatments: 'styles',
  embellishments: 'styles',
  vendors: 'factories',
};

const LEGACY_SECTION_TO_ROUTE = {
  styles: { layer: 'styles', atom: null },
  components: { layer: 'library', atom: 'trims' },
  trims: { layer: 'library', atom: 'trims' },
  colors: { layer: 'library', atom: 'colors' },
  factories: { layer: 'library', atom: 'vendors' },
};

function emptyResult() {
  return {
    tab: null,
    layer: 'library',
    atom: DEFAULT_LIBRARY_ATOM,
    section: ATOM_TO_LEGACY_SECTION[DEFAULT_LIBRARY_ATOM],
    packId: null,
    step: 0,
  };
}

function buildResult({ layer, atom, packId, step }) {
  const legacySection = layer === 'styles'
    ? 'styles'
    : layer === 'production'
      ? 'styles' // no legacy equivalent; fall back
      : ATOM_TO_LEGACY_SECTION[atom] || 'styles';
  return {
    tab: PLM_TAB,
    layer,
    atom,
    section: legacySection,
    packId: packId || null,
    step: Number.isFinite(step) && step >= 0 ? step : 0,
  };
}

// Parse the hash parts after the tab segment has been matched.
// Accepts both the new nested grammar (layer/atom) and the legacy
// single-word sections the app shipped with before the IA migration.
function parseInner(parts) {
  // parts[0] was already matched to PLM_TAB or ALT_TAB.
  const second = parts[1];
  if (!second) {
    return buildResult({ layer: 'library', atom: DEFAULT_LIBRARY_ATOM, packId: null, step: 0 });
  }

  // New grammar: <tab>/library, <tab>/styles, <tab>/production
  if (TOP_LAYERS.has(second)) {
    if (second === 'library') {
      const atomRaw = parts[2];
      const atom = LIBRARY_SET.has(atomRaw) ? atomRaw : DEFAULT_LIBRARY_ATOM;
      // Trims + treatments can host nested detail routes; future atoms may too.
      const packId = parts[3] || null;
      const stepRaw = parseInt(parts[4], 10);
      const step = Number.isFinite(stepRaw) && stepRaw >= 1 ? stepRaw - 1 : 0;
      return buildResult({ layer: 'library', atom, packId, step });
    }
    if (second === 'styles') {
      const packId = parts[2] || null;
      const stepRaw = parseInt(parts[3], 10);
      const step = Number.isFinite(stepRaw) && stepRaw >= 1 ? stepRaw - 1 : 0;
      return buildResult({ layer: 'styles', atom: null, packId, step });
    }
    if (second === 'production') {
      const packId = parts[2] || null;
      return buildResult({ layer: 'production', atom: null, packId, step: 0 });
    }
  }

  // Legacy grammar: <tab>/<single-word-section>
  const mapped = LEGACY_SECTION_TO_ROUTE[second];
  if (mapped) {
    const packId = parts[2] || null;
    const stepRaw = parseInt(parts[3], 10);
    const step = Number.isFinite(stepRaw) && stepRaw >= 1 ? stepRaw - 1 : 0;
    return buildResult({ layer: mapped.layer, atom: mapped.atom, packId, step });
  }

  return buildResult({ layer: 'library', atom: DEFAULT_LIBRARY_ATOM, packId: null, step: 0 });
}

export function parsePLMHash() {
  if (typeof window === 'undefined') return emptyResult();
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const tab = parts[0] || null;

  if (tab === PLM_TAB || tab === ALT_TAB) return parseInner(parts);
  return emptyResult();
}

// Resolve a build-args object into the canonical { layer, atom } pair,
// honouring both legacy `section:` callers and new `layer:`/`atom:` callers.
function resolveBuildArgs(args = {}) {
  let { layer, atom, section, packId = null, step = 0 } = args;
  if (!layer && section) {
    const m = LEGACY_SECTION_TO_ROUTE[section];
    if (m) {
      layer = m.layer;
      atom = m.atom;
    }
  }
  if (!layer) layer = 'library';
  if (layer === 'library') {
    if (!LIBRARY_SET.has(atom)) atom = DEFAULT_LIBRARY_ATOM;
  } else {
    atom = null;
  }
  return { layer, atom, packId, step };
}

export function buildPLMHash(args = {}) {
  const { layer, atom, packId, step } = resolveBuildArgs(args);
  if (layer === 'library') {
    let h = `#${PLM_TAB}/library/${atom}`;
    if (packId) {
      h += `/${packId}`;
      if (step > 0) h += `/${step + 1}`;
    }
    return h;
  }
  if (layer === 'styles') {
    let h = `#${PLM_TAB}/styles`;
    if (packId) {
      h += `/${packId}`;
      if (step > 0) h += `/${step + 1}`;
    }
    return h;
  }
  // production
  let h = `#${PLM_TAB}/production`;
  if (packId) h += `/${packId}`;
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

// Normalise a stray `#plm/...` or a legacy `#product/<section>` hash on first
// load so refreshes / shares use the canonical `#product/library/<atom>`
// grammar going forward. Idempotent — already-canonical hashes are left alone.
export function normalizeLegacyHash() {
  if (typeof window === 'undefined') return;
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  if (!raw) return;
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] !== PLM_TAB && parts[0] !== ALT_TAB) return;
  const parsed = parseInner(parts);
  const next = buildPLMHash({
    layer: parsed.layer,
    atom: parsed.atom,
    packId: parsed.packId,
    step: parsed.step,
  });
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}
