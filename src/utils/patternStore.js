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

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';
import { emptyPattern, PATTERN_CATEGORIES, PATTERN_CATEGORY_CODE } from './patternLibrary';

const LOCAL_KEY = 'cashmodel_patterns';

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

export async function listPatterns({ includeArchived = false, status = null, category = null } = {}) {
  const local = readLocal();
  const filterOpts = { includeArchived, status, category };
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('patterns')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map(r => r.id));
      const merged = [...data, ...local.filter(r => !remoteIds.has(r.id))];
      return filterRows(merged, filterOpts)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }
    if (error) console.error('listPatterns:', error);
  }
  return filterRows(local, filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getPattern(id) {
  if (!id) return null;
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('patterns')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) return data;
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

  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('patterns').insert({ ...row, user_id: userId });
      if (error) console.error('createPattern:', error);
    }
  }
  return row;
}

export async function savePattern(id, updates) {
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
      .from('patterns')
      .update({ ...updates, updated_at: now })
      .eq('id', id);
    if (error) console.error('savePattern:', error);
  }
  return merged;
}

export const updatePattern = savePattern;

export async function archivePattern(id) {
  return savePattern(id, { status: 'archived' });
}

export async function restorePattern(id) {
  return savePattern(id, { status: 'draft' });
}

export async function duplicatePattern(id) {
  const source = await getPattern(id);
  if (!source) return null;
  const local = readLocal();
  const newCode = nextCodeFor(source.category, local);
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
      const { error } = await supabase.from('patterns').insert({ ...copy, user_id: userId });
      if (error) console.error('duplicatePattern:', error);
    }
  }
  return copy;
}

// Three seed patterns mirror the visual rhythm of seedTreatmentsIfEmpty —
// a hoodie sloper, a tee sloper, and a sweatpant block. Idempotent.
export async function seedPatternsIfEmpty() {
  const local = readLocal();
  if (local.length > 0) return [];
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
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('patterns').insert(
        filled.map(r => ({ ...r, user_id: userId }))
      );
      if (error) console.error('seedPatterns:', error);
    }
  }
  return filled;
}

export { PATTERN_CATEGORIES };
