// Pattern storage — localStorage primary with optional Supabase mirror
// behind IS_SUPABASE_ENABLED, mirroring the treatmentStore pattern.
//
// A Pattern is the geometric skeleton a Style inherits from — the DXF
// blocks, the sloper version, the grading rules. Each record carries
// the category (Hoodie, Tee, Sweatpant, …), a base block reference, the
// graded size set, an optional DXF asset URL, ease + drop notes, and
// the usual atom envelope (status, version, created/updated_at).
//
// Auto-code: PT-{category-code}-{seq} — PT-HD-001, PT-TE-007, …
// Archive vs delete: there is no hard delete. archivePattern flips the
// status to 'archived' and the list view hides it by default. Records
// stay so any tech pack that referenced them still resolves.
//
// Append-only? No. Patterns are mutable — designers refine slopers all
// the time. The append-only constraint applies to atom_usage / state
// transitions, not the atom records themselves.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';
import { emptyPattern, PATTERN_CATEGORIES, PATTERN_CATEGORY_CODE } from './patternLibrary';
import { copyCoverImage } from './plmAssets';
import { robustUpsertAtom, robustUpsertAtomBatch, robustUpdateAtomOptimistic } from './atomCloudSync';

const LOCAL_KEY = 'cashmodel_patterns';

const PATTERN_CLOUD_COLUMNS = new Set([
  'id', 'code', 'name', 'status', 'version', 'created_at', 'updated_at',
  'category', 'base_block', 'sizes', 'grade_rule', 'ease_chest_cm',
  'drop_cm', 'seam_allowance_cm', 'cad_file_url', 'thumbnail_url',
  'cover_image', 'notes',
  'organization_id', 'user_id',
]);

export function toPatternCloudRow(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    if (PATTERN_CLOUD_COLUMNS.has(k)) out[k] = row[k];
  }
  return out;
}

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
  catch (err) { console.error('patternStore write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

function nextCodeFor(category, rows) {
  const codePrefix = PATTERN_CATEGORY_CODE[category] || 'GEN';
  const re = new RegExp(`^PT-${codePrefix}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  const next = String(max + 1).padStart(3, '0');
  return `PT-${codePrefix}-${next}`;
}

function filterRows(rows, { includeArchived = false, status = null, category = null } = {}) {
  let out = rows;
  if (status) out = out.filter(r => r.status === status);
  else if (!includeArchived) out = out.filter(r => r.status !== 'archived');
  if (category) out = out.filter(r => r.category === category);
  return out;
}

// Cloud + local always get unioned at read time so local-only rows never
// disappear from the list view (cloud insert failed silently, RLS rejected,
// network blip, JWT/org not loaded yet).
function unionByIdCloudFirst(cloudRows, localRows) {
  const seen = new Set();
  const out = [];
  (cloudRows || []).forEach(r => { if (r && r.id && !seen.has(r.id)) { seen.add(r.id); out.push(r); } });
  (localRows || []).forEach(r => { if (r && r.id && !seen.has(r.id)) { seen.add(r.id); out.push(r); } });
  return out;
}

async function healOrphanPatterns(localRows, cloudRows) {
  if (!Array.isArray(localRows) || localRows.length === 0) return;
  const cloudIds = new Set((cloudRows || []).map(r => r.id));
  const orphans = localRows.filter(r => r && r.id && !cloudIds.has(r.id));
  if (orphans.length === 0) return;
  await robustUpsertAtomBatch('patterns', orphans.map(r => toPatternCloudRow(r)));
}

export async function listPatterns({ includeArchived = false, status = null, category = null } = {}) {
  const filterOpts = { includeArchived, status, category };
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('patterns')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listPatterns:', error);
    try { await healOrphanPatterns(readLocal(), cloudRows); }
    catch (err) { console.error('healOrphanPatterns:', err); }
  }
  const merged = unionByIdCloudFirst(cloudRows, readLocal());
  return filterRows(merged, filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getPattern(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('patterns')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!error && data) {
      // Mirror cloud row into localStorage so subsequent savePattern can
      // find it and update rather than silently skip.
      try {
        const local = readLocal();
        const idx = local.findIndex(r => r.id === id);
        if (idx >= 0) local[idx] = { ...local[idx], ...data };
        else local.push(data);
        writeLocal(local);
      } catch (err) { console.error('getPattern mirror:', err); }
      return data;
    }
    if (error) console.error('getPattern:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

export async function createPattern({ category = 'hoodie', ...overrides } = {}) {
  const local = readLocal();
  const id = newId();
  const code = nextCodeFor(category, local);
  const row = emptyPattern({ id, code, category, ...overrides });

  local.push(row);
  writeLocal(local);

  await robustUpsertAtom('patterns', toPatternCloudRow(row));
  return row;
}

// See fabricStore.saveFabric for the OCC return shape and contract.
export async function savePattern(id, updates, opts = {}) {
  if (!id) return { ok: false, error: new Error('savePattern: id required') };
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  const before = idx >= 0 ? local[idx] : null;
  let merged;
  if (idx >= 0) {
    merged = { ...local[idx], ...updates, updated_at: now };
    local[idx] = merged;
  } else {
    merged = { id, ...updates, updated_at: now };
    local.push(merged);
  }
  writeLocal(local);

  const base = opts.base_updated_at || before?.updated_at || null;
  if (!base) {
    await robustUpsertAtom('patterns', toPatternCloudRow(merged));
    return { ok: true, row: merged };
  }
  const result = await robustUpdateAtomOptimistic('patterns', id, base, toPatternCloudRow(merged));
  if (result.ok && result.row) {
    const refreshed = readLocal();
    const j = refreshed.findIndex(r => r.id === id);
    if (j >= 0) {
      refreshed[j] = { ...refreshed[j], updated_at: result.row.updated_at };
      writeLocal(refreshed);
    }
    return { ok: true, row: { ...merged, updated_at: result.row.updated_at } };
  }
  return result;
}

export const updatePattern = savePattern;

async function savePatternWithRetry(id, updates) {
  let result = await savePattern(id, updates);
  if (result?.ok || !result?.conflict) return result;
  const latest = result.latest;
  if (!latest) return result;
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  if (idx >= 0) {
    local[idx] = { ...local[idx], ...latest };
    writeLocal(local);
  }
  return savePattern(id, updates, { base_updated_at: latest.updated_at });
}

export async function archivePattern(id) {
  return savePatternWithRetry(id, { status: 'archived' });
}

export async function restorePattern(id) {
  return savePatternWithRetry(id, { status: 'draft' });
}

export async function duplicatePattern(id) {
  const source = await getPattern(id);
  if (!source) return null;
  const local = readLocal();
  const newCode = nextCodeFor(source.category, local);
  const now = new Date().toISOString();
  const dupId = newId();
  const dupCover = await copyCoverImage(source.cover_image, { newOwnerId: dupId, newScope: 'patterns' });
  const copy = {
    ...source,
    id: dupId,
    code: newCode,
    name: source.name ? `${source.name} (Copy)` : 'Copy',
    status: 'draft',
    version: 'v1.0',
    cover_image: dupCover,
    created_at: now,
    updated_at: now,
  };
  delete copy.user_id;
  delete copy.organization_id;
  local.push(copy);
  writeLocal(local);
  await robustUpsertAtom('patterns', toPatternCloudRow(copy));
  return copy;
}

// Three seed patterns mirror the visual rhythm of seedTreatmentsIfEmpty —
// a hoodie sloper, a tee sloper, and a sweatpant block. Idempotent.
export async function seedPatternsIfEmpty() {
  if (localStorage.getItem('cashmodel_seeded')) return [];
  const local = readLocal();
  if (local.length > 0) return [];
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { count, error } = await db
      .from('patterns')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if (error) console.error('seedPatternsIfEmpty count:', error);
    if ((count || 0) > 0) {
      localStorage.setItem('cashmodel_seeded', '1');
      return [];
    }
  }
  const now = new Date().toISOString();
  const seeds = [
    {
      id: 'seed-hoodie-block-v3',
      code: 'PT-HD-001',
      name: 'FR Hoodie Block',
      category: 'hoodie',
      status: 'approved',
      version: 'v3.2',
      base_block: 'FR-MASTER-HD',
      sizes: ['S', 'M', 'L', 'XL'],
      grade_rule: '2 cm chest grade · 1.5 cm length grade · 0.6 cm shoulder',
      ease_chest_cm: 14,
      drop_cm: 4,
      seam_allowance_cm: 1.0,
      cad_file_url: 'fr_hoodie_block_v3.dxf',
      thumbnail_url: '',
      notes: 'Drop-shoulder construction. Hood depth 36 cm. Kangaroo pocket placement 22 cm from HPS.',
      created_at: '2025-04-12T00:00:00.000Z',
      updated_at: '2026-01-14T00:00:00.000Z',
    },
    {
      id: 'seed-tee-block-v2',
      code: 'PT-TE-001',
      name: 'FR Tee Block',
      category: 'tee',
      status: 'approved',
      version: 'v2.0',
      base_block: 'FR-MASTER-TE',
      sizes: ['S', 'M', 'L', 'XL'],
      grade_rule: '2 cm chest · 1.2 cm length · 0.5 cm shoulder',
      ease_chest_cm: 8,
      drop_cm: 0,
      seam_allowance_cm: 1.0,
      cad_file_url: 'fr_tee_block_v2.dxf',
      thumbnail_url: '',
      notes: 'Boxy fit. Set-in sleeve. Cuff-less.',
      created_at: '2025-06-02T00:00:00.000Z',
      updated_at: '2025-11-20T00:00:00.000Z',
    },
    {
      id: 'seed-sweatpant-block-v1',
      code: 'PT-SP-001',
      name: 'FR Sweatpant Block',
      category: 'sweatpant',
      status: 'testing',
      version: 'v1.4',
      base_block: 'FR-MASTER-SP',
      sizes: ['S', 'M', 'L', 'XL'],
      grade_rule: '3 cm waist · 2 cm hip · 1.5 cm inseam',
      ease_chest_cm: 0,
      drop_cm: 0,
      seam_allowance_cm: 1.0,
      cad_file_url: 'fr_sweatpant_block_v1.dxf',
      thumbnail_url: '',
      notes: 'Tapered leg, elastic waistband + drawstring, 30 cm hem.',
      created_at: '2025-09-10T00:00:00.000Z',
      updated_at: '2026-02-02T00:00:00.000Z',
    },
  ];
  const filled = seeds.map(s => ({ ...emptyPattern(s), updated_at: s.updated_at || now, created_at: s.created_at || now }));
  writeLocal(filled);
  await robustUpsertAtomBatch('patterns', filled.map(r => toPatternCloudRow(r)));
  return filled;
}

export { PATTERN_CATEGORIES };
