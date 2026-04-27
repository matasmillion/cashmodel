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

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';
import { emptyTreatment, TREATMENT_TYPE_CODE } from './treatmentLibrary';

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

function currentUserId() {
  try {
    const raw = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!raw) return null;
    const session = JSON.parse(localStorage.getItem(raw));
    return session?.user?.id ?? null;
  } catch { return null; }
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
// configured, falls back to localStorage. Reads merge — Supabase rows for
// records the local store hasn't seen, local rows for the offline path.
export async function listTreatments({ includeArchived = false, status = null, type = null } = {}) {
  const local = readLocal();
  const filterOpts = { includeArchived, status, type };
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('treatments')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      // Supabase wins for any id present remotely; local-only rows tag along.
      const remoteIds = new Set(data.map(r => r.id));
      const merged = [
        ...data,
        ...local.filter(r => !remoteIds.has(r.id)),
      ];
      return filterRows(merged, filterOpts)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }
    if (error) console.error('listTreatments:', error);
  }
  return filterRows(local, filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getTreatment(id) {
  if (!id) return null;
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('treatments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) return data;
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

  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('treatments').insert({ ...row, user_id: userId });
      if (error) console.error('createTreatment:', error);
    }
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
  if (IS_SUPABASE_ENABLED) {
    const { error } = await supabase
      .from('treatments')
      .update({ ...updates, updated_at: now })
      .eq('id', id);
    if (error) console.error('saveTreatment:', error);
  }
  return merged;
}

// Soft-delete: flip status to 'archived'. Records stay in the store so any
// production order or BOM line that references them still resolves.
// Public alias matching the prompt-spec signature. `saveTreatment` was the
// initial name; `updateTreatment` is the canonical public verb.
export const updateTreatment = saveTreatment;

// Mock production log used by the treatment detail table until chunk 18
// replaces it with a real query against the production store. Returns an
// empty array for unknown ids so the UI renders the empty-state cleanly.
export async function getMockProductionLog(treatmentId) {
  if (!treatmentId) return [];
  const rollups = await getTreatmentRollups(treatmentId);
  return Array.isArray(rollups?.log) ? rollups.log : [];
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
  local.push(copy);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('treatments').insert({ ...copy, user_id: userId });
      if (error) console.error('duplicateTreatment:', error);
    }
  }
  return copy;
}

// Rollups — every treatment list/detail card surfaces unit counts, latest
// cost, latest lead, defect rate. Until production writeback ships in
// Prompt 3 these are mocked from the seed data; once `atom_usage` exists
// the real implementation lands in productionStore + this stub gets
// replaced (kept here as the public contract so callers don't change).
//
// Returns a Promise so the eventual real data path (Supabase aggregate)
// drops in without breaking the UI's await chain.
export async function getTreatmentRollups(treatmentId) {
  if (!treatmentId) return emptyRollups();
  // Real implementation lives in productionStore.computeAtomRollups; we
  // attempt the import lazily so this module doesn't pull production code
  // into the bundle until production is mounted.
  try {
    const mod = await import('./productionStore');
    if (mod && typeof mod.computeAtomRollups === 'function') {
      return mod.computeAtomRollups('treatment', treatmentId);
    }
  } catch {/* productionStore not available yet — fall through to mock */}
  return MOCK_ROLLUPS[treatmentId] || emptyRollups();
}

function emptyRollups() {
  return {
    units_produced: 0,
    pos_count: 0,
    first_run_at: null,
    // `latest_cost_usd` is the public contract from the prompt; the suffixed
    // `latest_unit_cost` mirror is what richer UI surfaces already read.
    latest_cost_usd: 0,
    latest_unit_cost: null,
    latest_unit_cost_delta_pct: null,
    latest_lead_days: 0,
    latest_lead_delta_days: null,
    defect_rate_pct: 0,
    defect_rate_delta_pct: null,
    drift_30d_pct: null,
    log: [],
    drift: [],
    used_in: [],
  };
}

// Mock fallback — covers the three seed treatments before Prompt 3 wires
// real production data. Numbers come from the mockup so the seeded UI
// matches the reference at first paint.
const MOCK_ROLLUPS = {
  'seed-stone-wash': {
    units_produced: 1240,
    pos_count: 4,
    first_run_at: '2025-05-01',
    latest_cost_usd: 3.80,
    latest_unit_cost: 3.80,
    latest_unit_cost_delta_pct: -9.5,
    latest_lead_days: 12,
    latest_lead_delta_days: -4,
    defect_rate_pct: 0.3,
    defect_rate_delta_pct: -73,
    drift_30d_pct: 4.2,
    log: [
      { po_code: '#0024', date: '2026-02', style: 'AP-HD-STONE-01',     units: 320, lot: 'GO-2602-A', cost: 3.80, lead: 12, defect: 0.3, drift: 3.1 },
      { po_code: '#0019', date: '2025-11', style: 'AP-PA-STONE-01',     units: 260, lot: 'GO-2511-B', cost: 3.85, lead: 13, defect: 0.4, drift: 4.8 },
      { po_code: '#0014', date: '2025-08', style: 'AP-HD-STONE-01',     units: 420, lot: 'GO-2508-A', cost: 4.00, lead: 14, defect: 0.8, drift: 9.2 },
      { po_code: '#0009', date: '2025-05', style: 'AP-PA-ECARGO-10',    units: 240, lot: 'FB-2505-A', cost: 4.20, lead: 16, defect: 1.1, drift: 12.4 },
    ],
    drift: [
      { po_code: '#0024', date: '2026-02', score: 3.1, retrained: false, predicted_grad: ['#D4956A', '#B87048'], actual_grad: ['#D0906A', '#BA744C'] },
      { po_code: '#0019', date: '2025-11', score: 4.8, retrained: false, predicted_grad: ['#D4956A', '#B87048'], actual_grad: ['#CE8C64', '#B56E45'] },
      { po_code: '#0014', date: '2025-08', score: 9.2, retrained: true,  predicted_grad: ['#D4956A', '#B87048'], actual_grad: ['#C17E52', '#A45E38'] },
    ],
    used_in: [
      { style_id: 'AP-HD-STONE-01',  style_name: 'Borderless stone hoodie',     units: 740, status: 'live' },
      { style_id: 'AP-PA-STONE-01',  style_name: 'Borderless stone sweatpant',  units: 260, status: 'live' },
      { style_id: 'AP-PA-ECARGO-10', style_name: 'Elements cargo W34',          units: 240, status: 'archived' },
    ],
  },
  'seed-vintage-soft': {
    units_produced: 480, pos_count: 2, first_run_at: '2025-09-01',
    latest_cost_usd: 2.95,
    latest_unit_cost: 2.95, latest_unit_cost_delta_pct: -3.2,
    latest_lead_days: 10, latest_lead_delta_days: -2,
    defect_rate_pct: 0.5, defect_rate_delta_pct: -40,
    drift_30d_pct: 5.1,
    log: [
      { po_code: '#0021', date: '2026-01', style: 'AP-TS-VINTAGE-01', units: 280, lot: 'FB-2601-A', cost: 2.95, lead: 10, defect: 0.5, drift: 5.1 },
      { po_code: '#0012', date: '2025-09', style: 'AP-TS-VINTAGE-01', units: 200, lot: 'FB-2509-B', cost: 3.05, lead: 12, defect: 0.9, drift: 7.2 },
    ],
    drift: [
      { po_code: '#0021', date: '2026-01', score: 5.1, retrained: false, predicted_grad: ['#EBE5D5', '#D6CFB9'], actual_grad: ['#E6E0CD', '#D0C8AE'] },
      { po_code: '#0012', date: '2025-09', score: 7.2, retrained: false, predicted_grad: ['#EBE5D5', '#D6CFB9'], actual_grad: ['#DDD3B8', '#C5BA9A'] },
    ],
    used_in: [
      { style_id: 'AP-TS-VINTAGE-01', style_name: 'Vintage soft tee', units: 480, status: 'live' },
    ],
  },
  'seed-gone-global-dye': {
    units_produced: 360, pos_count: 1, first_run_at: '2025-12-01',
    latest_cost_usd: 4.65,
    latest_unit_cost: 4.65, latest_unit_cost_delta_pct: 0,
    latest_lead_days: 18, latest_lead_delta_days: 0,
    defect_rate_pct: 0.6, defect_rate_delta_pct: 0,
    drift_30d_pct: 3.4,
    log: [
      { po_code: '#0020', date: '2025-12', style: 'AP-HD-GONE-01', units: 360, lot: 'GO-2512-A', cost: 4.65, lead: 18, defect: 0.6, drift: 3.4 },
    ],
    drift: [
      { po_code: '#0020', date: '2025-12', score: 3.4, retrained: false, predicted_grad: ['#3A3A3A', '#1F1F1F'], actual_grad: ['#3D3D3D', '#212121'] },
    ],
    used_in: [
      { style_id: 'AP-HD-GONE-01', style_name: 'Gone hoodie · slate', units: 360, status: 'live' },
    ],
  },
};

// Seed three treatments on first run if the store is empty. Idempotent —
// only fires when there are zero local rows. Numbers and copy match the
// reference mockup so the UI lands populated.
export async function seedTreatmentsIfEmpty() {
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
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('treatments').insert(
        filled.map(r => ({ ...r, user_id: userId }))
      );
      if (error) console.error('seedTreatments:', error);
    }
  }
  return filled;
}
