// Cut & Sew storage — localStorage primary with optional Supabase mirror
// behind IS_SUPABASE_ENABLED, mirroring the treatmentStore pattern.
//
// A Cut & Sew block is the geometric skeleton a Style inherits from — the DXF
// pieces, the sloper version, the grading rules. Each record carries the
// category (Hoodie, Tee, Sweatpant, …), a base block reference, the graded
// size set, an optional DXF asset URL, ease + drop notes, and the usual atom
// envelope (status, version, created/updated_at).
//
// Auto-code: CS-{category-code}-{seq} — CS-HD-001, CS-TE-007, …
// Archive vs delete: there is no hard delete. archiveCutSew flips the
// status to 'archived' and the list view hides it by default. Records
// stay so any tech pack that referenced them still resolves.
//
// Replaces patternStore.js. The Supabase table is `cut_sew`; the old
// `patterns` table is kept in the DB for historical PO snapshots.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';
import { emptyCutSew, CUT_SEW_CATEGORIES, CUT_SEW_CATEGORY_CODE } from './cutSewLibrary';
import { copyCoverImage } from './plmAssets';
import { robustUpsertAtom, robustUpsertAtomBatch, mergeByIdNewest, dedupeCodesOnce } from './atomCloudSync';
import { getCollection, setCollection } from './localDb';

const LOCAL_KEY = 'cashmodel_cut_sew';

const CUT_SEW_CLOUD_COLUMNS = new Set([
  'id', 'code', 'name', 'status', 'version', 'created_at', 'updated_at',
  'category', 'base_block', 'sizes', 'grade_rule', 'ease_chest_cm',
  'drop_cm', 'seam_allowance_cm', 'cad_file_url', 'thumbnail_url',
  'cover_image', 'notes',
  'organization_id', 'user_id',
]);

export function toCutSewCloudRow(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    if (CUT_SEW_CLOUD_COLUMNS.has(k)) out[k] = row[k];
  }
  return out;
}

function readLocal() {
  return getCollection(LOCAL_KEY);
}

function writeLocal(rows) {
  setCollection(LOCAL_KEY, rows);
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

function nextCodeFor(category, rows) {
  const codePrefix = CUT_SEW_CATEGORY_CODE[category] || 'GEN';
  const re = new RegExp(`^CS-${codePrefix}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  const next = String(max + 1).padStart(3, '0');
  return `CS-${codePrefix}-${next}`;
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
  // Last-write-wins merge — newest updated_at per id (see atomCloudSync).
  return mergeByIdNewest(cloudRows, localRows);
}

async function healOrphanCutSew(localRows, cloudRows) {
  if (!Array.isArray(localRows) || localRows.length === 0) return;
  const cloudIds = new Set((cloudRows || []).map(r => r.id));
  const orphans = localRows.filter(r => r && r.id && !cloudIds.has(r.id));
  if (orphans.length === 0) return;
  await robustUpsertAtomBatch('cut_sew', orphans.map(r => toCutSewCloudRow(r)));
}

let _cutSewListSyncing = false;
async function _syncCutSewListFromCloud() {
  if (_cutSewListSyncing) return;
  _cutSewListSyncing = true;
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) { _cutSewListSyncing = false; return; }
  try {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('cut_sew')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      const localNow = readLocal();
      const localById = new Map(localNow.map(r => [r.id, r]));
      const hasChanges = data.some(r => { const loc = localById.get(r.id); return !loc || (r.updated_at || '') > (loc.updated_at || ''); });
      if (hasChanges) {
        try { await healOrphanCutSew(localNow, data); } catch { /* ok */ }
        const merged = unionByIdCloudFirst(data, readLocal());
        try { writeLocal(merged); } catch { /* ok */ }
        try { await dedupeCodesOnce(merged, { discriminatorField: 'category', nextCode: nextCodeFor, save: saveCutSew }); } catch { /* ok */ }
        window.dispatchEvent(new CustomEvent('plm-store-updated', { detail: { table: 'cut_sew' } }));
      }
    }
  } catch { /* ok */ } finally { _cutSewListSyncing = false; }
}

export async function listCutSew({ includeArchived = false, status = null, category = null } = {}) {
  const filterOpts = { includeArchived, status, category };
  const local = readLocal();
  const orgId = getCurrentOrgIdSync();
  if (local.length > 0) {
    if (IS_SUPABASE_ENABLED && orgId) _syncCutSewListFromCloud().catch(() => {});
    return filterRows(unionByIdCloudFirst(null, local), filterOpts)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }
  if (IS_SUPABASE_ENABLED && orgId) await _syncCutSewListFromCloud();
  return filterRows(unionByIdCloudFirst(null, readLocal()), filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

async function _syncCutSewFromCloud(id) {
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return null;
  try {
    const db = await getAuthedSupabase();
    const { data, error } = await db.from('cut_sew').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (error || !data) { if (error) console.error('getCutSew:', error); return null; }
    const local = readLocal();
    const idx = local.findIndex(r => r.id === id);
    const localRow = idx >= 0 ? local[idx] : null;
    if (localRow && (localRow.updated_at || '') > (data.updated_at || '')) return localRow;
    const merged = localRow ? { ...localRow, ...data } : data;
    if (idx >= 0) local[idx] = merged; else local.push(merged);
    writeLocal(local);
    window.dispatchEvent(new CustomEvent('plm-store-updated', { detail: { table: 'cut_sew', id } }));
    return merged;
  } catch { return null; }
}

export async function getCutSew(id) {
  if (!id) return null;
  const local = readLocal().find(r => r.id === id);
  if (local) { _syncCutSewFromCloud(id).catch(() => {}); return local; }
  return await _syncCutSewFromCloud(id);
}

export async function createCutSew({ category = 'hoodie', ...overrides } = {}) {
  const local = readLocal();
  const id = newId();
  const code = nextCodeFor(category, local);
  const row = emptyCutSew({ id, code, category, ...overrides });

  local.push(row);
  writeLocal(local);

  await robustUpsertAtom('cut_sew', toCutSewCloudRow(row));
  return row;
}

export async function saveCutSew(id, updates) {
  if (!id) return null;
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  let merged;
  if (idx >= 0) {
    merged = { ...local[idx], ...updates, updated_at: now };
    local[idx] = merged;
  } else {
    merged = { id, ...updates, updated_at: now };
    local.push(merged);
  }
  writeLocal(local);

  await robustUpsertAtom('cut_sew', toCutSewCloudRow({ ...merged, updated_at: now }));
  return merged;
}

export const updateCutSew = saveCutSew;

export async function archiveCutSew(id) {
  return saveCutSew(id, { status: 'archived' });
}

export async function restoreCutSew(id) {
  return saveCutSew(id, { status: 'draft' });
}

export async function duplicateCutSew(id) {
  const source = await getCutSew(id);
  if (!source) return null;
  const local = readLocal();
  const newCode = nextCodeFor(source.category, local);
  const now = new Date().toISOString();
  const dupId = newId();
  const dupCover = await copyCoverImage(source.cover_image, { newOwnerId: dupId, newScope: 'cut-sew' });
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
  await robustUpsertAtom('cut_sew', toCutSewCloudRow(copy));
  return copy;
}

// Three seed blocks mirror the visual rhythm of seedTreatmentsIfEmpty —
// a hoodie, a tee, and a sweatpant block. Idempotent.
export async function seedCutSewIfEmpty() {
  if (localStorage.getItem('cashmodel_seeded')) return [];
  const local = readLocal();
  if (local.length > 0) return [];
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { count, error } = await db
      .from('cut_sew')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if (error) console.error('seedCutSewIfEmpty count:', error);
    if ((count || 0) > 0) {
      localStorage.setItem('cashmodel_seeded', '1');
      return [];
    }
  }
  const now = new Date().toISOString();
  const seeds = [
    {
      id: 'seed-hoodie-block-v3',
      code: 'CS-HD-001',
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
      code: 'CS-TE-001',
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
      code: 'CS-SP-001',
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
  const filled = seeds.map(s => ({ ...emptyCutSew(s), updated_at: s.updated_at || now, created_at: s.created_at || now }));
  writeLocal(filled);
  await robustUpsertAtomBatch('cut_sew', filled.map(r => toCutSewCloudRow(r)));
  return filled;
}

export { CUT_SEW_CATEGORIES };
