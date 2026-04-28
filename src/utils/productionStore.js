// Production storage — POs, BOM snapshots, atom usage, drift log.
//
// Mirrors treatmentStore.js: localStorage primary, optional Supabase mirror
// behind IS_SUPABASE_ENABLED.
//
// Append-only collections (per CLAUDE.md and Prompt 3): `atom_usage`,
// `drift_log`, and `bom_snapshot`. Helpers below throw if a caller tries to
// update or delete a row in any of them. There is no `delete*` export at all
// for those collections.
//
// State machine for POs lives in `transitionPO`. Legal arrows:
//   draft → placed
//   placed → in_production
//   in_production → received
//   received → closed
//   any-non-cancelled → cancelled
// Anything else throws so a buggy caller can't quietly skip a state.
//
// Codes: POs are issued `PO-{YYYY}-{SEQ}` at create time, padded to 4 digits,
// scoped to the calendar year of creation. Lots, drift entries, and atom-usage
// rows use uuids — they're internal and don't need a human-friendly handle.

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';
import { getCurrentUserIdSync } from '../lib/auth';

const PO_KEY        = 'cashmodel_pos';
const BOM_SNAP_KEY  = 'cashmodel_bom_snapshots';
const ATOM_USAGE_KEY = 'cashmodel_atom_usage';
const DRIFT_LOG_KEY = 'cashmodel_drift_logs';

/**
 * @typedef {Object} PurchaseOrder
 * @property {string} id
 * @property {string} code                                  // PO-2026-0024
 * @property {'draft'|'placed'|'in_production'|'received'|'closed'|'cancelled'} status
 * @property {string} vendor_id
 * @property {string} style_id
 * @property {number} units
 * @property {number} unit_cost_usd
 * @property {number} lead_days                             // expected, set at placement
 * @property {string=} placed_at
 * @property {string=} received_at
 * @property {string=} closed_at
 * @property {string=} cancelled_at
 * @property {string=} notes
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} BOMSnapshot
 * @property {string} id
 * @property {string} po_id
 * @property {string} snapshot_at                           // when frozen — at PO placement
 * @property {Array<Object>} bom                            // frozen copy of the pack's BOM
 * @property {Object=} pack                                 // frozen copy of pack metadata (style_name, version, …)
 */

/**
 * @typedef {Object} AtomUsage
 * @property {string} id
 * @property {string} po_id
 * @property {'treatment'|'fabric'|'color'|'trim'|'embellishment'|'pattern'} atom_type
 * @property {string} atom_id
 * @property {number=} units
 * @property {number=} unit_cost_usd
 * @property {number=} lead_days                            // actual
 * @property {number=} defect_pct                           // actual
 * @property {string} recorded_at
 */

/**
 * @typedef {Object} DriftLog
 * @property {string} id
 * @property {string} treatment_id
 * @property {string} po_id
 * @property {number} score_pct
 * @property {boolean=} retrained
 * @property {string[]=} predicted_grad                     // hex pair
 * @property {string[]=} actual_grad                        // hex pair
 * @property {string} recorded_at
 */

// ── Storage primitives ─────────────────────────────────────────────────────

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function writeLocal(key, rows) {
  try { localStorage.setItem(key, JSON.stringify(rows)); }
  catch (err) { console.error('productionStore write:', err); }
}
function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
// Synchronous reader; null if Clerk is still loading or no user signed in.
const currentUserId = getCurrentUserIdSync;

// ── PO codes ───────────────────────────────────────────────────────────────

function nextPOCode(rows, year) {
  const re = new RegExp(`^PO-${year}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  return `PO-${year}-${String(max + 1).padStart(4, '0')}`;
}

// ── PO state machine ───────────────────────────────────────────────────────

const PO_TRANSITIONS = {
  draft:         new Set(['placed', 'cancelled']),
  placed:        new Set(['in_production', 'cancelled']),
  in_production: new Set(['received', 'cancelled']),
  received:      new Set(['closed', 'cancelled']),
  closed:        new Set([]),                   // terminal
  cancelled:     new Set([]),                   // terminal
};

function assertLegalTransition(from, to) {
  const allowed = PO_TRANSITIONS[from];
  if (!allowed || !allowed.has(to)) {
    throw new Error(`Illegal PO transition: ${from} → ${to}`);
  }
}

// ── POs ────────────────────────────────────────────────────────────────────

export async function listPOs({ status = null, vendor_id = null, style_id = null } = {}) {
  let rows = readLocal(PO_KEY);
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase.from('purchase_orders').select('*').order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map(r => r.id));
      rows = [...data, ...rows.filter(r => !remoteIds.has(r.id))];
    } else if (error) {
      console.error('listPOs:', error);
    }
  }
  return rows
    .filter(r => (status ? r.status === status : true))
    .filter(r => (vendor_id ? r.vendor_id === vendor_id : true))
    .filter(r => (style_id ? r.style_id === style_id : true))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getPO(id) {
  if (!id) return null;
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle();
    if (!error && data) return data;
  }
  return readLocal(PO_KEY).find(r => r.id === id) || null;
}

export async function createPO(input = {}) {
  const rows = readLocal(PO_KEY);
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const id = newId();
  const row = {
    id,
    code: nextPOCode(rows, year),
    status: 'draft',
    vendor_id: input.vendor_id || '',
    style_id: input.style_id || '',
    units: Number(input.units) || 0,
    unit_cost_usd: Number(input.unit_cost_usd) || 0,
    lead_days: Number(input.lead_days) || 0,
    // Size break: { S: 30, M: 40, L: 50, XL: 30, … }. Sum should equal
    // `units` but isn't enforced — vendors sometimes round odd totals.
    size_break: input.size_break || {},
    placed_at: null,
    received_at: null,
    closed_at: null,
    cancelled_at: null,
    notes: input.notes || '',
    created_at: now,
    updated_at: now,
    ...input,
  };
  // Force the canonical fields even if the caller passed overrides above.
  row.id = id;
  row.code = row.code; // already set
  row.status = 'draft';
  row.created_at = now;
  row.updated_at = now;

  rows.push(row);
  writeLocal(PO_KEY, rows);

  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('purchase_orders').insert({ ...row, user_id: userId });
      if (error) console.error('createPO:', error);
    }
  }
  return row;
}

const PO_EDITABLE_FIELDS = new Set(['units', 'unit_cost_usd', 'lead_days', 'notes', 'vendor_id', 'style_id', 'size_break']);

// Only fields in PO_EDITABLE_FIELDS can change via updatePO. Status changes
// are owned by transitionPO so the state-machine rules can't be bypassed.
export async function updatePO(id, patch = {}) {
  if (!id) return null;
  if ('status' in patch) {
    throw new Error('Use transitionPO to change PO status; updatePO cannot.');
  }
  const allowed = {};
  for (const k of Object.keys(patch)) {
    if (PO_EDITABLE_FIELDS.has(k)) allowed[k] = patch[k];
  }
  if (Object.keys(allowed).length === 0) return getPO(id);

  const now = new Date().toISOString();
  const rows = readLocal(PO_KEY);
  const idx = rows.findIndex(r => r.id === id);
  let updated = null;
  if (idx >= 0) {
    updated = { ...rows[idx], ...allowed, updated_at: now };
    rows[idx] = updated;
    writeLocal(PO_KEY, rows);
  }
  if (IS_SUPABASE_ENABLED) {
    const { error } = await supabase.from('purchase_orders').update({ ...allowed, updated_at: now }).eq('id', id);
    if (error) console.error('updatePO:', error);
  }
  return updated;
}

export async function transitionPO(id, newStatus, payload = {}) {
  if (!id) return null;
  const current = await getPO(id);
  if (!current) throw new Error(`PO ${id} not found`);
  assertLegalTransition(current.status, newStatus);

  const now = new Date().toISOString();
  const stamp = {};
  if (newStatus === 'placed') stamp.placed_at = now;
  if (newStatus === 'received') stamp.received_at = now;
  if (newStatus === 'closed') stamp.closed_at = now;
  if (newStatus === 'cancelled') stamp.cancelled_at = now;

  // Side effect: at PO placement, freeze a deep clone of the source style's
  // BOM. Snapshot is immutable — later edits to the pack do NOT mutate it.
  if (current.status === 'draft' && newStatus === 'placed' && current.style_id) {
    try {
      const { getTechPack } = await import('./techPackStore');
      const pack = await getTechPack(current.style_id);
      const fabrics = pack?.data?.fabrics || [];
      const trims   = pack?.data?.trimsAccessories || [];
      const labels  = pack?.data?.labelsBranding || [];
      const bom = JSON.parse(JSON.stringify([
        ...fabrics.map(r => ({ ...r, _section: 'fabric' })),
        ...trims.map(r   => ({ ...r, _section: 'trim' })),
        ...labels.map(r  => ({ ...r, _section: 'label' })),
      ]));
      await createBOMSnapshot({
        po_id: id,
        bom,
        pack: pack ? {
          id: pack.id,
          style_name: pack.style_name || pack.data?.styleName || '',
          version: pack.data?.revision || '',
        } : null,
      });
    } catch (err) {
      console.error('placePO snapshot:', err);
    }
  }

  // Side effect: on close, write append-only atom_usage rows from `payload.actuals`
  // and recompute rolling averages on each touched atom record.
  let totalCostActual = 0;
  if (current.status === 'received' && newStatus === 'closed') {
    const actuals = Array.isArray(payload?.actuals) ? payload.actuals : [];
    for (const a of actuals) {
      const units = Number(a.units_used) || 0;
      const cost = Number(a.actual_cost_per_unit_usd) || 0;
      totalCostActual += units * cost;
      try {
        await appendAtomUsage({
          po_id: id,
          atom_type: a.atom_type,
          atom_id: a.atom_id,
          atom_name: a.atom_name,
          atom_code: a.atom_code,
          atom_version: a.atom_version,
          lot: a.physical_lot_number || a.lot || '',
          notes: a.quality_notes || a.notes || '',
          qc_photo_urls: a.qc_photo_urls || [],
          units,
          unit_cost_usd: cost || null,
          lead_days: a.actual_lead_days != null ? Number(a.actual_lead_days) : null,
          defect_pct: a.defect_rate_pct != null ? Number(a.defect_rate_pct) : null,
          recorded_at: a.produced_at || now,
        });
      } catch (err) { console.error('appendAtomUsage during close:', err); }
    }
    await recomputeAtomRollups(actuals);
  }

  // Strip side-effect-only fields from the payload before persisting onto the PO row.
  const payloadRest = { ...(payload || {}) };
  delete payloadRest.actuals;

  const updates = { ...payloadRest, ...stamp, status: newStatus, updated_at: now };
  if (newStatus === 'closed' && totalCostActual > 0) updates.total_cost_actual = totalCostActual;

  const next = { ...current, ...updates };
  const rows = readLocal(PO_KEY);
  const idx = rows.findIndex(r => r.id === id);
  if (idx >= 0) { rows[idx] = next; writeLocal(PO_KEY, rows); }
  if (IS_SUPABASE_ENABLED) {
    const { error } = await supabase.from('purchase_orders').update(updates).eq('id', id);
    if (error) console.error('transitionPO:', error);
  }
  return next;
}

// After a close, recompute rolling averages on each atom touched by the
// payload. Treatments are the only atom type with a writeable store today;
// other atom types are skipped silently and will pick up the same hook as
// their stores ship in later sprints.
async function recomputeAtomRollups(actuals) {
  const seen = new Map();
  for (const a of actuals) {
    if (!a?.atom_id || !a?.atom_type) continue;
    const k = `${a.atom_type}:${a.atom_id}`;
    if (!seen.has(k)) seen.set(k, { atom_type: a.atom_type, atom_id: a.atom_id });
  }
  for (const { atom_type, atom_id } of seen.values()) {
    const all = await listAtomUsage({ atom_type, atom_id });
    const sorted = [...all].sort((x, y) => (y.recorded_at || '').localeCompare(x.recorded_at || ''));
    const last3 = sorted.slice(0, 3);
    if (last3.length === 0) continue;
    const totalUnits = last3.reduce((s, r) => s + (Number(r.units) || 0), 0);
    const wAvg = (key) => {
      let sum = 0; let weight = 0;
      for (const r of last3) {
        const v = r[key];
        if (v == null) continue;
        const w = totalUnits > 0 ? (Number(r.units) || 0) : 1;
        sum += Number(v) * w;
        weight += w;
      }
      return weight > 0 ? sum / weight : null;
    };
    const cost_per_unit_usd = wAvg('unit_cost_usd');
    const lead_time_days = wAvg('lead_days');
    const defect_rate_pct = wAvg('defect_pct');
    const units_produced_total = sorted.reduce((s, r) => s + (Number(r.units) || 0), 0);

    if (atom_type === 'treatment') {
      try {
        const { updateTreatment } = await import('./treatmentStore');
        const patch = { units_produced_total };
        if (cost_per_unit_usd != null) patch.cost_per_unit_usd = Number(cost_per_unit_usd.toFixed(2));
        if (lead_time_days != null)    patch.lead_time_days    = Math.round(lead_time_days);
        if (defect_rate_pct != null)   patch.defect_rate_pct   = Number(defect_rate_pct.toFixed(2));
        await updateTreatment(atom_id, patch);
      } catch (err) { console.error('recompute treatment rollup:', err); }
    }
    // fabric/color/trim/embellishment/pattern: no writeable store yet — skip.
  }
}

// ── BOM snapshots (immutable after creation) ───────────────────────────────

export async function listBOMSnapshots(po_id) {
  let rows = readLocal(BOM_SNAP_KEY);
  if (IS_SUPABASE_ENABLED) {
    const q = supabase.from('bom_snapshots').select('*');
    const { data, error } = po_id ? await q.eq('po_id', po_id) : await q;
    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map(r => r.id));
      rows = [...data, ...rows.filter(r => !remoteIds.has(r.id))];
    }
  }
  return po_id ? rows.filter(r => r.po_id === po_id) : rows;
}

export async function createBOMSnapshot({ po_id, bom = [], pack = null }) {
  if (!po_id) throw new Error('createBOMSnapshot: po_id required');
  const existing = readLocal(BOM_SNAP_KEY).find(r => r.po_id === po_id);
  if (existing) {
    throw new Error('bom_snapshot is immutable. A snapshot already exists for this PO.');
  }
  const row = {
    id: newId(),
    po_id,
    snapshot_at: new Date().toISOString(),
    bom: Array.isArray(bom) ? JSON.parse(JSON.stringify(bom)) : [],
    pack: pack ? JSON.parse(JSON.stringify(pack)) : null,
  };
  const rows = readLocal(BOM_SNAP_KEY);
  rows.push(row);
  writeLocal(BOM_SNAP_KEY, rows);
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('bom_snapshots').insert({ ...row, user_id: userId });
      if (error) console.error('createBOMSnapshot:', error);
    }
  }
  return row;
}

// Explicit refusals — wired so a misuse throws loudly instead of partial-failing.
export function updateBOMSnapshot() {
  throw new Error('bom_snapshot is immutable. Inserts only.');
}
export function deleteBOMSnapshot() {
  throw new Error('bom_snapshot is immutable. Inserts only.');
}

// ── Atom usage (append-only) ───────────────────────────────────────────────

export async function listAtomUsage({ atom_type = null, atom_id = null, po_id = null } = {}) {
  let rows = readLocal(ATOM_USAGE_KEY);
  if (IS_SUPABASE_ENABLED) {
    let q = supabase.from('atom_usage').select('*');
    if (atom_type) q = q.eq('atom_type', atom_type);
    if (atom_id)   q = q.eq('atom_id', atom_id);
    if (po_id)     q = q.eq('po_id', po_id);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map(r => r.id));
      rows = [...data, ...rows.filter(r => !remoteIds.has(r.id))];
    }
  }
  return rows
    .filter(r => (atom_type ? r.atom_type === atom_type : true))
    .filter(r => (atom_id ? r.atom_id === atom_id : true))
    .filter(r => (po_id ? r.po_id === po_id : true));
}

export async function appendAtomUsage(input) {
  if (!input || !input.po_id || !input.atom_type || !input.atom_id) {
    throw new Error('appendAtomUsage: po_id, atom_type, atom_id are required');
  }
  // Pass through any caller-supplied display fields (atom_name, atom_code,
  // atom_version, lot, notes, etc.) — the typedef calls out the validated
  // numerics but the store doesn't strip extras.
  const row = {
    ...input,
    id: newId(),
    po_id: input.po_id,
    atom_type: input.atom_type,
    atom_id: input.atom_id,
    units: input.units != null ? Number(input.units) : null,
    unit_cost_usd: input.unit_cost_usd != null ? Number(input.unit_cost_usd) : null,
    lead_days: input.lead_days != null ? Number(input.lead_days) : null,
    defect_pct: input.defect_pct != null ? Number(input.defect_pct) : null,
    recorded_at: input.recorded_at || new Date().toISOString(),
  };
  const rows = readLocal(ATOM_USAGE_KEY);
  rows.push(row);
  writeLocal(ATOM_USAGE_KEY, rows);
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('atom_usage').insert({ ...row, user_id: userId });
      if (error) console.error('appendAtomUsage:', error);
    }
  }
  return row;
}

export function updateAtomUsage() {
  throw new Error('atom_usage is append-only. Inserts only.');
}
export function deleteAtomUsage() {
  throw new Error('atom_usage is append-only. Inserts only.');
}

// ── Drift log (append-only) ────────────────────────────────────────────────

export async function listDriftLogs({ treatment_id = null, po_id = null } = {}) {
  let rows = readLocal(DRIFT_LOG_KEY);
  if (IS_SUPABASE_ENABLED) {
    let q = supabase.from('drift_logs').select('*');
    if (treatment_id) q = q.eq('treatment_id', treatment_id);
    if (po_id)        q = q.eq('po_id', po_id);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map(r => r.id));
      rows = [...data, ...rows.filter(r => !remoteIds.has(r.id))];
    }
  }
  return rows
    .filter(r => (treatment_id ? r.treatment_id === treatment_id : true))
    .filter(r => (po_id ? r.po_id === po_id : true));
}

export async function appendDriftLog(input) {
  if (!input || !input.treatment_id || !input.po_id) {
    throw new Error('appendDriftLog: treatment_id and po_id are required');
  }
  const row = {
    id: newId(),
    treatment_id: input.treatment_id,
    po_id: input.po_id,
    score_pct: Number(input.score_pct) || 0,
    retrained: !!input.retrained,
    predicted_grad: Array.isArray(input.predicted_grad) ? input.predicted_grad : null,
    actual_grad: Array.isArray(input.actual_grad) ? input.actual_grad : null,
    recorded_at: input.recorded_at || new Date().toISOString(),
  };
  const rows = readLocal(DRIFT_LOG_KEY);
  rows.push(row);
  writeLocal(DRIFT_LOG_KEY, rows);
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('drift_logs').insert({ ...row, user_id: userId });
      if (error) console.error('appendDriftLog:', error);
    }
  }
  return row;
}

export function updateDriftLog() {
  throw new Error('drift_log is append-only. Inserts only.');
}
export function deleteDriftLog() {
  throw new Error('drift_log is append-only. Inserts only.');
}

// ── Seed PO ────────────────────────────────────────────────────────────────
// One closed PO so the Treatment detail page has live rollup data on the
// very first load. Idempotent: returns immediately if any POs already exist.
// Depends on `seedTreatmentsIfEmpty` having already run (we look up the
// stone-wash treatment by id). Style is materialized directly into
// `cashmodel_techpacks` localStorage so we get a stable, human-friendly
// style_id (`AP-HD-STONE-01`) instead of a UUID — the production list and
// the BOM snapshot tree both render the id verbatim.
const SEED_STYLE_ID = 'AP-HD-STONE-01';
const SEED_TREATMENT_ID = 'seed-stone-wash';
const SEED_VENDOR_NAME = 'Guangdong Ocean Wash';

function ensureSeedStyle() {
  const TECHPACKS_KEY = 'cashmodel_techpacks';
  let packs;
  try { packs = JSON.parse(localStorage.getItem(TECHPACKS_KEY) || '[]'); }
  catch { packs = []; }
  if (packs.find(p => p.id === SEED_STYLE_ID)) return;
  const now = new Date().toISOString();
  packs.push({
    id: SEED_STYLE_ID,
    style_name: 'Borderless stone hoodie',
    product_category: 'Hoodie',
    status: 'Production',
    completion_pct: 85,
    data: {
      styleName: 'Borderless stone hoodie',
      productCategory: 'Hoodie',
      revision: 'V1.0',
      status: 'Production',
      vendor: SEED_VENDOR_NAME,
      vendorContact: 'Mr. Lin · WeChat',
      fabrics: [{
        component: 'Fabric',
        fabricType: 'Heavy cotton twill',
        composition: '100% Cotton',
        weightGsm: '420',
        colorPantone: 'Sienna',
        supplier: 'Guangdong Mill',
        notes: '',
        treatment_id: SEED_TREATMENT_ID,
      }],
      trimsAccessories: [],
      labelsBranding: [],
    },
    images: [],
    created_at: now,
    updated_at: now,
  });
  try { localStorage.setItem(TECHPACKS_KEY, JSON.stringify(packs)); }
  catch (err) { console.error('seed style write:', err); }
}

export async function seedProductionIfEmpty() {
  if (readLocal(PO_KEY).length > 0) return null;
  const { getTreatment } = await import('./treatmentStore');
  const stoneWash = await getTreatment(SEED_TREATMENT_ID);
  if (!stoneWash) return null;

  ensureSeedStyle();

  const po = await createPO({
    style_id: SEED_STYLE_ID,
    vendor_id: SEED_VENDOR_NAME,
    units: 320,
    unit_cost_usd: 3.80,
    lead_days: 12,
    notes: 'Seed PO for demo data',
  });

  await transitionPO(po.id, 'placed');
  await transitionPO(po.id, 'in_production');
  await transitionPO(po.id, 'received');
  await transitionPO(po.id, 'closed', {
    actuals: [{
      atom_type: 'treatment',
      atom_id: SEED_TREATMENT_ID,
      atom_name: stoneWash.name,
      atom_code: stoneWash.code,
      atom_version: stoneWash.version,
      physical_lot_number: 'GO-2602-A',
      units_used: 320,
      actual_cost_per_unit_usd: 3.80,
      actual_lead_days: 12,
      defect_rate_pct: 0.3,
      quality_notes: 'Clean run, no callbacks.',
      qc_photo_urls: [],
    }],
  });

  await appendDriftLog({
    po_id: po.id,
    treatment_id: SEED_TREATMENT_ID,
    score_pct: 3.1,
    retrained: false,
    predicted_grad: ['#D4956A', '#B87048'],
    actual_grad: ['#D0906A', '#BA744C'],
    recorded_at: new Date().toISOString(),
  });

  return po;
}
