// Tech Pack storage — dual-write to localStorage + Supabase when available
// Used by the TechPack list and builder views

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';

const LOCAL_KEY = 'cashmodel_techpacks';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(packs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(packs));
  } catch (err) {
    console.error('Failed to save tech packs locally:', err);
  }
}

function currentUserId() {
  // Supabase client caches the session; we read synchronously from localStorage-backed cache
  try {
    const raw = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!raw) return null;
    const session = JSON.parse(localStorage.getItem(raw));
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// List all tech packs (summary rows only — no image blobs)
export async function listTechPacks() {
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('tech_packs')
      .select('id, style_name, product_category, status, completion_pct, updated_at, created_at')
      .order('updated_at', { ascending: false });
    if (error) console.error('listTechPacks:', error);
    if (data) return data;
  }
  // Fallback — localStorage
  return readLocal()
    .map(p => ({
      id: p.id,
      style_name: p.data?.styleName || '',
      product_category: p.data?.productCategory || '',
      status: p.data?.status || 'Development',
      completion_pct: p.completion_pct || 0,
      updated_at: p.updated_at,
      created_at: p.created_at,
    }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

// Fetch one tech pack including data + images
export async function getTechPack(id) {
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('tech_packs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) return data;
  }
  const local = readLocal().find(p => p.id === id);
  return local || null;
}

// Create a new empty tech pack
export async function createTechPack(defaultData, defaultLibrary) {
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();
  const row = {
    id,
    style_name: '',
    product_category: '',
    status: 'Development',
    completion_pct: 0,
    data: defaultData,
    images: [],
    library: defaultLibrary,
    created_at: now,
    updated_at: now,
  };

  // Local first (always)
  const packs = readLocal();
  packs.push(row);
  writeLocal(packs);

  // Cloud if available
  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('tech_packs').insert({ ...row, user_id: userId });
      if (error) console.error('createTechPack:', error);
    }
  }
  return row;
}

// Save full tech pack (used for debounced auto-save)
export async function saveTechPack(id, updates) {
  const now = new Date().toISOString();
  const packs = readLocal();
  const idx = packs.findIndex(p => p.id === id);
  if (idx >= 0) {
    packs[idx] = { ...packs[idx], ...updates, updated_at: now };
    writeLocal(packs);
  }

  if (IS_SUPABASE_ENABLED) {
    const { error } = await supabase
      .from('tech_packs')
      .update({ ...updates, updated_at: now })
      .eq('id', id);
    if (error) console.error('saveTechPack:', error);
  }
}

// Delete a tech pack
export async function deleteTechPack(id) {
  const packs = readLocal().filter(p => p.id !== id);
  writeLocal(packs);

  if (IS_SUPABASE_ENABLED) {
    const { error } = await supabase.from('tech_packs').delete().eq('id', id);
    if (error) console.error('deleteTechPack:', error);
  }
}

// Duplicate a tech pack — returns the new row
export async function duplicateTechPack(id) {
  const source = await getTechPack(id);
  if (!source) return null;
  const newId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();
  const copy = {
    ...source,
    id: newId,
    style_name: (source.style_name || source.data?.styleName || '') + ' (Copy)',
    data: { ...source.data, styleName: (source.data?.styleName || '') + ' (Copy)' },
    created_at: now,
    updated_at: now,
  };
  delete copy.user_id;

  const packs = readLocal();
  packs.push(copy);
  writeLocal(packs);

  if (IS_SUPABASE_ENABLED) {
    const userId = currentUserId();
    if (userId) {
      const { error } = await supabase.from('tech_packs').insert({ ...copy, user_id: userId });
      if (error) console.error('duplicateTechPack:', error);
    }
  }
  return copy;
}
