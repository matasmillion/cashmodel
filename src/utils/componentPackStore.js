// Component Pack storage — dual-write to localStorage + Supabase
// Mirrors techPackStore.js but for the `component_packs` table

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';

const LOCAL_KEY = 'cashmodel_component_packs';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch (err) { console.error(err); }
}
function currentUserId() {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const session = JSON.parse(localStorage.getItem(key));
    return session?.user?.id ?? null;
  } catch { return null; }
}

export async function listComponentPacks() {
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('component_packs')
      .select('id, component_name, component_category, status, supplier, cost_per_unit, currency, updated_at, created_at')
      .order('updated_at', { ascending: false });
    if (!error && data) return data;
  }
  return readLocal()
    .map(p => ({
      id: p.id,
      component_name: p.data?.componentName || '',
      component_category: p.data?.componentCategory || '',
      status: p.data?.status || 'Design',
      supplier: p.data?.supplier || '',
      cost_per_unit: p.data?.costPerUnit || '',
      currency: p.data?.currency || 'USD',
      updated_at: p.updated_at,
      created_at: p.created_at,
    }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getComponentPack(id) {
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase.from('component_packs').select('*').eq('id', id).maybeSingle();
    if (!error && data) return data;
  }
  return readLocal().find(p => p.id === id) || null;
}

export async function createComponentPack(defaultData) {
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();
  const row = {
    id,
    component_name: '',
    component_category: '',
    status: 'Design',
    supplier: '',
    cost_per_unit: '',
    currency: 'USD',
    data: defaultData,
    images: [],
    created_at: now,
    updated_at: now,
  };

  const rows = readLocal(); rows.push(row); writeLocal(rows);

  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('component_packs').insert({ ...row, user_id: userId });
      if (error) console.error('createComponentPack:', error);
    }
  }
  return row;
}

export async function saveComponentPack(id, updates) {
  const now = new Date().toISOString();
  const rows = readLocal();
  const idx = rows.findIndex(p => p.id === id);
  if (idx >= 0) { rows[idx] = { ...rows[idx], ...updates, updated_at: now }; writeLocal(rows); }

  if (IS_SUPABASE_ENABLED) {
    const { error } = await supabase.from('component_packs').update({ ...updates, updated_at: now }).eq('id', id);
    if (error) console.error('saveComponentPack:', error);
  }
}

export async function deleteComponentPack(id) {
  writeLocal(readLocal().filter(p => p.id !== id));
  if (IS_SUPABASE_ENABLED) {
    const { error } = await supabase.from('component_packs').delete().eq('id', id);
    if (error) console.error('deleteComponentPack:', error);
  }
}

export async function duplicateComponentPack(id) {
  const source = await getComponentPack(id);
  if (!source) return null;
  const newId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();
  const copy = {
    ...source, id: newId,
    component_name: (source.component_name || source.data?.componentName || '') + ' (Copy)',
    data: { ...source.data, componentName: (source.data?.componentName || '') + ' (Copy)' },
    created_at: now, updated_at: now,
  };
  delete copy.user_id;

  const rows = readLocal(); rows.push(copy); writeLocal(rows);
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('component_packs').insert({ ...copy, user_id: userId });
      if (error) console.error('duplicateComponentPack:', error);
    }
  }
  return copy;
}
