// Treatment storage — dual-write to localStorage + Supabase (when configured),
// mirroring the techPackStore pattern. Each treatment record is the JSON
// shape defined by `emptyTreatment()` in treatmentLibrary.js.
//
// Auto-code: TR-{type-code}-{seq} — TR-WSH-001, TR-GDY-007, TR-FIN-002, …
// Sequence numbers are scoped per treatment-type, padded to three digits,
// and never reused (archived rows still hold their slot). Codes are assigned
// at create time and never regenerated, so renaming a treatment doesn't
// rewrite history.
//
// Archive vs delete: there is no hard delete. `archiveTreatment(id)` flips
// `status` to 'archived' and the list views hide it by default — but the
// record stays so any production order that referenced it still resolves.
// Restoring just flips the status back.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentUserIdSync, getCurrentOrgIdSync } from '../lib/auth';
import { emptyTreatment, TREATMENT_TYPE_CODE } from './treatmentLibrary';
import { addVendor } from './vendorLibrary';

const LOCAL_KEY = 'cashmodel_treatments';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('treatmentStore write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

// Highest sequence already used for a given treatment type — peeks at the
// codes we've issued so the next one slots in just above the current max.
function nextCodeFor(type, rows) {
  const codePrefix = TREATMENT_TYPE_CODE[type] || 'TRT';
  const re = new RegExp(`^TR-${codePrefix}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  const next = String(max + 1).padStart(3, '0');
  return `TR-${codePrefix}-${next}`;
}

// Filter helper — list views hide archived rows by default; the detail
// view opts in via `{ includeArchived: true }`. `status` / `type` further
// narrow the result (status implies includeArchived when set explicitly).
function filterRows(rows, { includeArchived = false, status = null, type = null } = {}) {
  let out = rows;
  if (status) out = out.filter(r => r.status === status);
  else if (!includeArchived) out = out.filter(r => r.status !== 'archived');
  if (type) out = out.filter(r => r.type === type);
  return out;
}

// List every treatment (most recent first). Pulls from Supabase when
// configured and org is active, falls back to localStorage.
export async function listTreatments({ includeArchived = false, status = null, type = null } = {}) {
  const filterOpts = { includeArchived, status, type };
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('treatments')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      return filterRows(data, filterOpts)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }
    if (error) console.error('listTreatments:', error);
  }
  return filterRows(readLocal(), filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getTreatment(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('treatments')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!error && data) return data;
    if (error) console.error('getTreatment:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

// Create a new treatment. Type is required so we can issue the code; the
// rest defaults to `emptyTreatment(overrides)`. Returns the persisted row.
export async function createTreatment({ type = 'wash', ...overrides } = {}) {
  const local = readLocal();
  const id = newId();
  const code = nextCodeFor(type, local);
  const row = emptyTreatment({ id, code, type, ...overrides });

  local.push(row);
  writeLocal(local);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    const db = await getAuthedSupabase();
    const { error } = await db.from('treatments').insert({ ...row, user_id: userId, organization_id: orgId });
    if (error) console.error('createTreatment:', error);
  }
  return row;
}

// Persist a partial update. Auto-stamps `updated_at`. Empty-string fields
// overwrite — unlike colorLibrary, treatments need to be able to clear a
// note or chemistry value, so we don't filter falsy.
export async function saveTreatment(id, updates) {
  if (!id) return null;
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  let merged = null;
  if (idx >= 0) {
    merged = { ...local[idx], ...updates, updated_at: now };
    local[idx] = merged;
    writeLocal(local);
  }
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db
      .from('treatments')
      .update({ ...updates, updated_at: now })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('saveTreatment:', error);
  }
  return merged;
}

export const updateTreatment = saveTreatment;

// Production log for a treatment. Joins `atom_usage` rows with the
// originating PO and the latest `drift_log` for the same {po_id, treatment_id}
// pair. Sorted most-recent first. Returns rows shaped for the production-log
// table on the treatment detail page.
export async function getProductionLog(treatmentId) {
  if (!treatmentId) return [];
  const [{ listAtomUsage, listDriftLogs, getPO }] = await Promise.all([
    import('./productionStore'),
  ]);
  const usage = await listAtomUsage({ atom_type: 'treatment', atom_id: treatmentId });
  if (!usage.length) return [];
  const driftRows = await listDriftLogs({ treatment_id: treatmentId });
  const driftByPO = new Map(driftRows.map(d => [d.po_id, d]));

  const sorted = [...usage].sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
  const out = [];
  for (const r of sorted) {
    const po = await getPO(r.po_id);
    const drift = driftByPO.get(r.po_id);
    const date = (po?.placed_at || r.recorded_at || '').slice(0, 7); // YYYY-MM
    out.push({
      po_code: po?.code || r.po_id,
      date,
      style: po?.style_id || '—',
      units: r.units != null ? Number(r.units) : null,
      lot: r.lot || r.physical_lot_number || '—',
      cost: r.unit_cost_usd != null ? Number(r.unit_cost_usd) : null,
      lead: r.lead_days != null ? Number(r.lead_days) : null,
      defect: r.defect_pct != null ? Number(r.defect_pct) : null,
      drift: drift?.score_pct != null ? Number(drift.score_pct) : null,
    });
  }
  return out;
}

export async function archiveTreatment(id) {
  return saveTreatment(id, { status: 'archived' });
}

export async function restoreTreatment(id) {
  return saveTreatment(id, { status: 'draft' });
}

// Duplicate — copies a treatment, issues a fresh id + code, prefixes the
// name with "Copy of". Useful when you need a near-identical wash on a
// different base color.
export async function duplicateTreatment(id) {
  const source = await getTreatment(id);
  if (!source) return null;
  const local = readLocal();
  const newCode = nextCodeFor(source.type, local);
  const now = new Date().toISOString();
  const copy = {
    ...source,
    id: newId(),
    code: newCode,
    name: source.name ? `${source.name} (Copy)` : 'Copy',
    status: 'draft',
    version: 'v1.0',
    created_at: now,
    updated_at: now,
  };
  delete copy.user_id;
  delete copy.organization_id;
  local.push(copy);
  writeLocal(local);
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    const db = await getAuthedSupabase();
    const { error } = await db.from('treatments').insert({ ...copy, user_id: userId, organization_id: orgId });
    if (error) console.error('duplicateTreatment:', error);
  }
  return copy;
}

// Rollups — every treatment list/detail card surfaces unit counts, latest
// cost, latest lead, defect rate. Computed live from append-only `atom_usage`
// rows: weighted by units across the last three runs for cost/lead/defect,
// totalled across all runs for `units_produced`. First-run + PO count
// derived from the same data set. Returns zeros when no PO has closed
// against this treatment yet.
export async function getTreatmentRollups(treatmentId) {
  if (!treatmentId) return emptyRollups();
  const { listAtomUsage } = await import('./productionStore');
  const rows = await listAtomUsage({ atom_type: 'treatment', atom_id: treatmentId });
  if (!rows.length) return emptyRollups();

  const sorted = [...rows].sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
  const last3 = sorted.slice(0, 3);
  const totalUnitsLast3 = last3.reduce((s, r) => s + (Number(r.units) || 0), 0);
  const wAvg = (key) => {
    let sum = 0; let weight = 0;
    for (const r of last3) {
      const v = r[key];
      if (v == null) continue;
      const w = totalUnitsLast3 > 0 ? (Number(r.units) || 0) : 1;
      sum += Number(v) * w;
      weight += w;
    }
    return weight > 0 ? sum / weight : 0;
  };
  const units_produced = sorted.reduce((s, r) => s + (Number(r.units) || 0), 0);
  const earliest = sorted[sorted.length - 1];
  return {
    units_produced,
    pos_count: new Set(sorted.map(r => r.po_id)).size,
    first_run_at: earliest?.recorded_at || null,
    latest_cost_usd: wAvg('unit_cost_usd'),
    latest_lead_days: wAvg('lead_days'),
    defect_rate_pct: wAvg('defect_pct'),
  };
}

function emptyRollups() {
  return {
    units_produced: 0,
    pos_count: 0,
    first_run_at: null,
    latest_cost_usd: 0,
    latest_lead_days: 0,
    defect_rate_pct: 0,
  };
}

// Distinct styles that have ever produced this treatment, with cumulative
// units. Status reflects the underlying tech pack's status when available.
export async function getUsedInForTreatment(treatmentId) {
  if (!treatmentId) return [];
  const { listAtomUsage, getPO } = await import('./productionStore');
  const rows = await listAtomUsage({ atom_type: 'treatment', atom_id: treatmentId });
  if (!rows.length) return [];
  const byPO = new Map();
  for (const r of rows) {
    if (!byPO.has(r.po_id)) byPO.set(r.po_id, []);
    byPO.get(r.po_id).push(r);
  }
  const styleAgg = new Map();
  for (const [po_id, runs] of byPO) {
    const po = await getPO(po_id);
    const styleId = po?.style_id || '—';
    const units = runs.reduce((s, r) => s + (Number(r.units) || 0), 0);
    if (!styleAgg.has(styleId)) styleAgg.set(styleId, { style_id: styleId, units: 0, status: 'live' });
    styleAgg.get(styleId).units += units;
  }
  // Best-effort tech pack lookup for style_name + status.
  const { getTechPack } = await import('./techPackStore');
  const out = [];
  for (const entry of styleAgg.values()) {
    let style_name = '';
    let status = entry.status;
    try {
      const pack = await getTechPack(entry.style_id);
      if (pack) {
        style_name = pack.style_name || pack.data?.styleName || '';
        status = pack.status || pack.data?.status || status;
      }
    } catch {/* missing pack — keep style_id-only display */}
    out.push({ ...entry, style_name, status });
  }
  return out;
}


// Seed the two wash houses the treatment seeds reference. Idempotent — the
// vendorLibrary's addVendor returns `{ ok: false }` if the name is already in
// the library, so this is safe to call on every PLM mount.
function seedSeedVendors() {
  addVendor('Guangdong Ocean Wash', {
    country: 'China',
    city: 'Foshan',
    primaryContact: 'Mr. Lin',
    moq: '300 units',
    leadTimeDays: 14,
    specialties: 'Enzyme washes, garment dye',
    payment_terms: 'Net 30 · 50% deposit',
    capabilities: ['wash', 'garment_dye'],
    moq_units: 300,
    lead_time_days: 14,
    rating: 4,
  });
  addVendor('Foshan Blue Wash', {
    country: 'China',
    city: 'Foshan',
    primaryContact: 'Ms. Chen',
    moq: '300 units',
    leadTimeDays: 10,
    specialties: 'Stone wash, vintage finish',
    payment_terms: 'Net 30',
    capabilities: ['wash', 'finish'],
    moq_units: 300,
    lead_time_days: 10,
    rating: 4,
  });
}

// Seed three treatments on first run if the store is empty. Idempotent —
// only fires when there are zero local rows. Numbers and copy match the
// reference mockup so the UI lands populated.
export async function seedTreatmentsIfEmpty() {
  if (localStorage.getItem('cashmodel_seeded')) return [];
  // Vendor seeds are idempotent on their own and need to be present even when
  // treatments are already seeded (e.g. data migrated in from another device).
  try { seedSeedVendors(); } catch (err) { console.error('seedSeedVendors:', err); }
  const local = readLocal();
  if (local.length > 0) return [];
  const now = new Date().toISOString();
  const seeds = [
    {
      id: 'seed-stone-wash',
      code: 'TR-WSH-001',
      name: 'Stone wash',
      type: 'wash',
      status: 'approved',
      version: 'v2.1',
      base_color_id: 'Sienna',
      chemistry: 'Enzyme (cellulase 2%) + pumice, softener finish, pH 5.5 ± 0.3',
      duration_minutes: 40,
      temperature_c: 55,
      compatible_fabric_ids: [],
      compatible_pattern_categories: ['Hoodie', 'Sweatpant', 'Cargo'],
      shrinkage_expected_pct: 3.5,
      primary_vendor_id: 'Guangdong Ocean Wash',
      backup_vendor_id: 'Foshan Blue Wash',
      cost_per_unit_usd: 3.80,
      lead_time_days: 12,
      moq_units: 500,
      notes: 'Net 30 · 50% deposit. Run on cotton, cotton-linen ≥ 70%.',
      digital: {
        ...emptyTreatment().digital,
        digital_source: 'lora_trained',
        lora_checkpoint_url: 'fr_stone_wash_v2.safetensors',
        lora_base_model: 'flux',
        lora_trigger_phrase: 'fr_stone_wash',
        lora_training_image_urls: new Array(127).fill('').map((_, i) => `seed:stone:${i}`),
        lora_trained_at: '2026-02-12T00:00:00.000Z',
        lora_version: 'v2',
        last_digital_sync_at: '2026-02-18T00:00:00.000Z',
      },
      created_at: '2025-05-01T00:00:00.000Z',
      updated_at: '2026-02-18T00:00:00.000Z',
    },
    {
      id: 'seed-vintage-soft',
      code: 'TR-FIN-001',
      name: 'Vintage soft',
      type: 'finish',
      status: 'approved',
      version: 'v1.3',
      base_color_id: 'Sand',
      chemistry: 'Silicone softener 1.5% + low-temp tumble, no enzyme',
      duration_minutes: 25,
      temperature_c: 40,
      compatible_fabric_ids: [],
      compatible_pattern_categories: ['Tee'],
      shrinkage_expected_pct: 2.0,
      primary_vendor_id: 'Foshan Blue Wash',
      backup_vendor_id: '',
      cost_per_unit_usd: 2.95,
      lead_time_days: 10,
      moq_units: 300,
      notes: 'Best on combed cotton ≥ 180 GSM.',
      digital: {
        ...emptyTreatment().digital,
        digital_source: 'lora_trained',
        lora_checkpoint_url: 'fr_vintage_soft_v1.safetensors',
        lora_base_model: 'flux',
        lora_trigger_phrase: 'fr_vintage_soft',
        lora_training_image_urls: new Array(64).fill('').map((_, i) => `seed:vintage:${i}`),
        lora_trained_at: '2025-10-22T00:00:00.000Z',
        lora_version: 'v1',
        last_digital_sync_at: '2026-01-08T00:00:00.000Z',
      },
      created_at: '2025-09-01T00:00:00.000Z',
      updated_at: '2026-01-08T00:00:00.000Z',
    },
    {
      id: 'seed-gone-global-dye',
      code: 'TR-GDY-001',
      name: 'Gone — global dye',
      type: 'garment_dye',
      status: 'approved',
      version: 'v1.0',
      base_color_id: 'Slate',
      chemistry: 'Reactive dye full-immersion, 60 °C, salt-fixed, soaping rinse ×2',
      duration_minutes: 90,
      temperature_c: 60,
      compatible_fabric_ids: [],
      compatible_pattern_categories: ['Hoodie'],
      shrinkage_expected_pct: 4.0,
      primary_vendor_id: 'Guangdong Ocean Wash',
      backup_vendor_id: '',
      cost_per_unit_usd: 4.65,
      lead_time_days: 18,
      moq_units: 300,
      notes: 'PFD garment in, finished color out. Requires PFD-grade fabric.',
      digital: {
        ...emptyTreatment().digital,
        digital_source: 'lora_trained',
        lora_checkpoint_url: 'fr_gone_global_dye_v1.safetensors',
        lora_base_model: 'flux',
        lora_trigger_phrase: 'fr_gone_dye',
        lora_training_image_urls: new Array(48).fill('').map((_, i) => `seed:gone:${i}`),
        lora_trained_at: '2025-11-30T00:00:00.000Z',
        lora_version: 'v1',
        last_digital_sync_at: '2025-12-12T00:00:00.000Z',
      },
      created_at: '2025-12-01T00:00:00.000Z',
      updated_at: '2025-12-12T00:00:00.000Z',
    },
  ];
  // Use empty defaults for any field a seed left out.
  const filled = seeds.map(s => ({ ...emptyTreatment(s), updated_at: s.updated_at || now, created_at: s.created_at || now }));
  writeLocal(filled);
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    const db = await getAuthedSupabase();
    const { error } = await db.from('treatments').insert(
      filled.map(r => ({ ...r, user_id: userId, organization_id: orgId }))
    );
    if (error) console.error('seedTreatments:', error);
  }
  return filled;
}
