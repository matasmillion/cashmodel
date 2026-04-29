// Fabric storage — localStorage primary with optional Supabase mirror
// behind IS_SUPABASE_ENABLED, mirroring the treatmentStore pattern.
//
// Auto-code: FB-{weave-code}-{seq} — FB-FRT-007, FB-DNM-001, …
// Sequence numbers are scoped per weave family and never reused.
//
// Archive vs delete: there is no hard delete. archiveFabric flips status
// to 'archived'; the record stays so any tech pack that referenced it
// still resolves.

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';
import { getCurrentUserIdSync } from '../lib/auth';
import { emptyFabric, FABRIC_WEAVE_CODE } from './fabricLibrary';

const LOCAL_KEY = 'cashmodel_fabrics';

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
  catch (err) { console.error('fabricStore write:', err); }
}

// Synchronous reader; null if Clerk is still loading or no user signed in.
const currentUserId = getCurrentUserIdSync;

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

function nextCodeFor(weave, rows) {
  const codePrefix = FABRIC_WEAVE_CODE[weave] || 'GEN';
  const re = new RegExp(`^FB-${codePrefix}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  const next = String(max + 1).padStart(3, '0');
  return `FB-${codePrefix}-${next}`;
}

function filterRows(rows, { includeArchived = false, status = null, weave = null } = {}) {
  let out = rows;
  if (status) out = out.filter(r => r.status === status);
  else if (!includeArchived) out = out.filter(r => r.status !== 'archived');
  if (weave) out = out.filter(r => r.weave === weave);
  return out;
}

export async function listFabrics({ includeArchived = false, status = null, weave = null } = {}) {
  const local = readLocal();
  const filterOpts = { includeArchived, status, weave };
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('fabrics')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map(r => r.id));
      const merged = [...data, ...local.filter(r => !remoteIds.has(r.id))];
      return filterRows(merged, filterOpts)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }
    if (error) console.error('listFabrics:', error);
  }
  return filterRows(local, filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getFabric(id) {
  if (!id) return null;
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('fabrics')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) return data;
  }
  return readLocal().find(r => r.id === id) || null;
}

export async function createFabric({ weave = 'jersey', ...overrides } = {}) {
  const local = readLocal();
  const id = newId();
  const code = nextCodeFor(weave, local);
  const row = emptyFabric({ id, code, weave, ...overrides });

  local.push(row);
  writeLocal(local);

  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('fabrics').insert({ ...row, user_id: userId });
      if (error) console.error('createFabric:', error);
    }
  }
  return row;
}

export async function saveFabric(id, updates) {
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
      .from('fabrics')
      .update({ ...updates, updated_at: now })
      .eq('id', id);
    if (error) console.error('saveFabric:', error);
  }
  return merged;
}

export const updateFabric = saveFabric;

export async function archiveFabric(id) {
  return saveFabric(id, { status: 'archived' });
}

export async function restoreFabric(id) {
  return saveFabric(id, { status: 'draft' });
}

export async function duplicateFabric(id) {
  const source = await getFabric(id);
  if (!source) return null;
  const local = readLocal();
  const newCode = nextCodeFor(source.weave, local);
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
      const { error } = await supabase.from('fabrics').insert({ ...copy, user_id: userId });
      if (error) console.error('duplicateFabric:', error);
    }
  }
  return copy;
}

export async function seedFabricsIfEmpty() {
  const local = readLocal();
  if (local.length > 0) return [];
  const now = new Date().toISOString();
  const seeds = [
    {
      id: 'seed-fabric-french-terry-340',
      code: 'FB-FRT-001',
      name: 'FR French Terry 340',
      composition: '100% Cotton (combed)',
      weight_gsm: 340,
      weave: 'french_terry',
      hand: 'Soft, slightly brushed loop back',
      width_cm: 180,
      shrinkage_pct: 4.5,
      stretch_pct: 0,
      color_id: 'PFD',
      mill_id: 'Lien Hsing Knits (Taipei)',
      lead_time_days: 35,
      moq_yards: 800,
      price_per_yard_usd: 6.40,
      currency: 'USD',
      status: 'approved',
      version: 'v1.2',
      notes: 'House hoodie / sweat fabric. Run on cotton-only programs.',
      created_at: '2025-03-12T00:00:00.000Z',
      updated_at: '2026-01-22T00:00:00.000Z',
    },
    {
      id: 'seed-fabric-jersey-180',
      code: 'FB-JSY-001',
      name: 'FR Combed Jersey 180',
      composition: '100% Cotton (combed)',
      weight_gsm: 180,
      weave: 'jersey',
      hand: 'Smooth, dry hand',
      width_cm: 170,
      shrinkage_pct: 3.0,
      stretch_pct: 0,
      color_id: 'PFD',
      mill_id: 'Lien Hsing Knits (Taipei)',
      lead_time_days: 28,
      moq_yards: 600,
      price_per_yard_usd: 4.10,
      currency: 'USD',
      status: 'approved',
      version: 'v2.0',
      notes: 'House tee fabric. Compatible with Vintage Soft finish.',
      created_at: '2025-04-02T00:00:00.000Z',
      updated_at: '2025-12-15T00:00:00.000Z',
    },
    {
      id: 'seed-fabric-denim-13oz',
      code: 'FB-DNM-001',
      name: '13 oz Selvedge Denim',
      composition: '100% Cotton (rigid)',
      weight_gsm: 440,
      weave: 'denim',
      hand: 'Crisp, dry, slightly hairy face',
      width_cm: 81,
      shrinkage_pct: 9.0,
      stretch_pct: 0,
      color_id: 'Slate',
      mill_id: 'Kuroki Mills (Okayama)',
      lead_time_days: 56,
      moq_yards: 300,
      price_per_yard_usd: 22.0,
      currency: 'USD',
      status: 'testing',
      version: 'v1.0',
      notes: 'Selvedge ID red. Best paired with Stone Wash treatment.',
      created_at: '2025-09-04T00:00:00.000Z',
      updated_at: '2026-02-08T00:00:00.000Z',
    },
  ];
  const filled = seeds.map(s => ({ ...emptyFabric(s), updated_at: s.updated_at || now, created_at: s.created_at || now }));
  writeLocal(filled);
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('fabrics').insert(
        filled.map(r => ({ ...r, user_id: userId }))
      );
      if (error) console.error('seedFabrics:', error);
    }
  }
  return filled;
}
