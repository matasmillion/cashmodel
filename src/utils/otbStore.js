// Open-to-Buy plan storage — per-quarter, per-class planned receipts $.
//
// Schema (per spec §5C):
//   { quarter: '2026-Q2', class: 'Hoodies', planned_receipts: 320000 }
//
// Operator edits planned values inline. Each open PO debits OTB by
// (units × unit_cost_usd) attributed to the quarter its expected_landing
// falls in. Negative remaining = overcommit → cockpit warning chip.
//
// localStorage primary. Supabase mirror is a follow-on; this version
// keeps the data per-browser.

const OTB_KEY = 'cashmodel_otb_plan';

// ── Storage primitives ───────────────────────────────────────────────────

function read() {
  try {
    const raw = localStorage.getItem(OTB_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function write(map) {
  try { localStorage.setItem(OTB_KEY, JSON.stringify(map)); }
  catch (err) { console.error('otbStore write:', err); }
}

function cellKey(quarter, klass) {
  return `${quarter}::${klass}`;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Read the planned receipts $ for one (quarter, class) cell. Returns 0
 * if no plan exists yet.
 */
export function getPlanned(quarter, klass) {
  const map = read();
  const v = map[cellKey(quarter, klass)];
  return Number(v) || 0;
}

/**
 * Write the planned receipts $ for one (quarter, class) cell. Persists
 * to localStorage immediately.
 */
export function setPlanned(quarter, klass, value) {
  const map = read();
  map[cellKey(quarter, klass)] = Number(value) || 0;
  write(map);
}

/**
 * Returns the full plan as { 'quarter::class': planned } for callers
 * that want a single read.
 */
export function listPlan() {
  return read();
}

// ── Quarter helpers ──────────────────────────────────────────────────────

/**
 * "2026-Q2" for a given Date. Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep,
 * Q4 = Oct-Dec.
 */
export function quarterOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  const m = d.getMonth();           // 0..11
  const q = Math.floor(m / 3) + 1;  // 1..4
  return `${d.getFullYear()}-Q${q}`;
}

/**
 * Current quarter + the next `n` quarters. Defaults to current + 3 ahead
 * (a 4-quarter horizon).
 */
export function quartersFromNow(n = 4) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i * 3, 1);
    out.push(quarterOf(d));
  }
  return out;
}

// ── Committed math ───────────────────────────────────────────────────────

/**
 * Sum committed receipt $ per (quarter, class) for the given PO list.
 *
 * Committed = open POs (status placed | in_production) whose
 * expected_landing falls in the quarter, attributed to the style's
 * class via `klassFor(po)`.
 *
 * @param {Array} pos              productionStore POs
 * @param {(po) => string} klassFor    Maps a PO → class label.
 * @returns {Object<string, number>}   { 'quarter::class': committed_$ }
 */
export function computeCommitted(pos, klassFor) {
  const out = {};
  if (!Array.isArray(pos)) return out;
  const OPEN = new Set(['placed', 'in_production']);

  for (const po of pos) {
    if (!OPEN.has(po.status)) continue;
    if (!po.expected_landing) continue;
    const q = quarterOf(po.expected_landing);
    const k = klassFor(po);
    if (!k) continue;
    const cost = (Number(po.units) || 0) * (Number(po.unit_cost_usd) || 0);
    if (cost <= 0) continue;
    const key = cellKey(q, k);
    out[key] = (out[key] || 0) + cost;
  }
  return out;
}

/**
 * Surfacing helper for the cockpit — does any (quarter, class) cell
 * have negative remaining? Returns the count of overcommitted cells.
 */
export function countOvercommit(plan, committed) {
  let n = 0;
  for (const key of Object.keys(committed)) {
    const planned = Number(plan[key]) || 0;
    const c = Number(committed[key]) || 0;
    if (planned > 0 && c > planned) n++;
  }
  return n;
}
