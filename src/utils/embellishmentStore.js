// Embellishment storage — localStorage primary with optional Supabase
// mirror behind IS_SUPABASE_ENABLED, mirroring the treatmentStore pattern.
//
// Auto-code: EM-{type-code}-{seq} — EM-EMB-001, EM-SCR-007, …
//
// Archive vs delete: there is no hard delete. archiveEmbellishment flips
// status to 'archived'; the record stays so any tech pack that referenced
// it still resolves.

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';
import { getCurrentUserIdSync } from '../lib/auth';
import { emptyEmbellishment, EMBELLISHMENT_TYPE_CODE } from './embellishmentLibrary';

const LOCAL_KEY = 'cashmodel_embellishments';

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
  catch (err) { console.error('embellishmentStore write:', err); }
}

// Read the current user id synchronously from the Clerk global. Used
// when persisting rows to Supabase so the row's user_id matches the
// signed-in caller. Returns null while Clerk is still loading or when
// no user is signed in (in which case Supabase writes are skipped).
const currentUserId = getCurrentUserIdSync;

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

function nextCodeFor(type, rows) {
  const codePrefix = EMBELLISHMENT_TYPE_CODE[type] || 'GEN';
  const re = new RegExp(`^EM-${codePrefix}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  const next = String(max + 1).padStart(3, '0');
  return `EM-${codePrefix}-${next}`;
}

function filterRows(rows, { includeArchived = false, status = null, type = null } = {}) {
  let out = rows;
  if (status) out = out.filter(r => r.status === status);
  else if (!includeArchived) out = out.filter(r => r.status !== 'archived');
  if (type) out = out.filter(r => r.type === type);
  return out;
}

export async function listEmbellishments({ includeArchived = false, status = null, type = null } = {}) {
  const local = readLocal();
  const filterOpts = { includeArchived, status, type };
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('embellishments')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map(r => r.id));
      const merged = [...data, ...local.filter(r => !remoteIds.has(r.id))];
      return filterRows(merged, filterOpts)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }
    if (error) console.error('listEmbellishments:', error);
  }
  return filterRows(local, filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getEmbellishment(id) {
  if (!id) return null;
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('embellishments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) return data;
  }
  return readLocal().find(r => r.id === id) || null;
}

export async function createEmbellishment({ type = 'embroidery', ...overrides } = {}) {
  const local = readLocal();
  const id = newId();
  const code = nextCodeFor(type, local);
  const row = emptyEmbellishment({ id, code, type, ...overrides });

  local.push(row);
  writeLocal(local);

  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('embellishments').insert({ ...row, user_id: userId });
      if (error) console.error('createEmbellishment:', error);
    }
  }
  return row;
}

export async function saveEmbellishment(id, updates) {
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
      .from('embellishments')
      .update({ ...updates, updated_at: now })
      .eq('id', id);
    if (error) console.error('saveEmbellishment:', error);
  }
  return merged;
}

export const updateEmbellishment = saveEmbellishment;

export async function archiveEmbellishment(id) {
  return saveEmbellishment(id, { status: 'archived' });
}

export async function restoreEmbellishment(id) {
  return saveEmbellishment(id, { status: 'draft' });
}

export async function duplicateEmbellishment(id) {
  const source = await getEmbellishment(id);
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
      const { error } = await supabase.from('embellishments').insert({ ...copy, user_id: userId });
      if (error) console.error('duplicateEmbellishment:', error);
    }
  }
  return copy;
}

export async function seedEmbellishmentsIfEmpty() {
  const local = readLocal();
  if (local.length > 0) return [];
  const now = new Date().toISOString();
  const seeds = [
    {
      id: 'seed-emb-fr-monogram',
      code: 'EM-EMB-001',
      name: 'FR monogram embroidery',
      type: 'embroidery',
      status: 'approved',
      version: 'v1.1',
      technique: 'Flat satin stitch · 2 colors',
      placement: 'Left chest',
      size_w_cm: 4.5,
      size_h_cm: 1.8,
      color_count: 2,
      primary_vendor_id: 'Yiwu Embroidery Co.',
      cost_per_unit_usd: 0.45,
      lead_time_days: 7,
      moq_units: 200,
      notes: 'Standard left-chest placement: 8 cm down from HPS, 12 cm in from CF.',
      created_at: '2025-05-04T00:00:00.000Z',
      updated_at: '2026-01-30T00:00:00.000Z',
    },
    {
      id: 'seed-emb-back-art',
      code: 'EM-SCR-001',
      name: 'Mountain wave back art',
      type: 'screen_print',
      status: 'approved',
      version: 'v1.0',
      technique: 'Plastisol · 3 spot colors',
      placement: 'Back full',
      size_w_cm: 28,
      size_h_cm: 32,
      color_count: 3,
      primary_vendor_id: 'Foshan Print House',
      cost_per_unit_usd: 1.85,
      lead_time_days: 10,
      moq_units: 300,
      notes: 'Soft-hand additive, low-cure. Center 18 cm down from CB neck.',
      created_at: '2025-09-19T00:00:00.000Z',
      updated_at: '2025-12-22T00:00:00.000Z',
    },
  ];
  const filled = seeds.map(s => ({ ...emptyEmbellishment(s), updated_at: s.updated_at || now, created_at: s.created_at || now }));
  writeLocal(filled);
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('embellishments').insert(
        filled.map(r => ({ ...r, user_id: userId }))
      );
      if (error) console.error('seedEmbellishments:', error);
    }
  }
  return filled;
}
