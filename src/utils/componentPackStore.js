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

function extractCover(images) {
  const list = Array.isArray(images) ? images : [];
  const cover = list.find(img => img && img.slot === 'component-cover');
  return cover ? cover.data : null;
}

// See listTechPacks comment — avoid pulling the images JSONB column from
// Supabase because it's the source of heavy lag when components have photos.
// A dedicated cover_image text column gives us thumbnails without that cost.
export async function listComponentPacks() {
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase
      .from('component_packs')
      .select('id, component_name, component_category, status, supplier, cost_per_unit, currency, cover_image, updated_at, created_at')
      .order('updated_at', { ascending: false });
    if (!error && data) {
      // Until every row has had its cover_image + cost_per_unit backfilled
      // (pre-projection rows are null for both), lean on the dual-written
      // local copy to fill in any missing projected fields.
      const local = readLocal();
      return data.map(r => {
        let row = r;
        const mirror = row.cover_image && row.cost_per_unit ? null : local.find(l => l.id === r.id);
        if (!row.cover_image && mirror) row = { ...row, cover_image: extractCover(mirror.images) };
        if (!row.cost_per_unit && mirror) {
          const cost = mirror.data?.targetUnitCost || mirror.data?.costPerUnit || '';
          if (cost) row = { ...row, cost_per_unit: cost };
        }
        return row;
      });
    }
  }
  return readLocal()
    .map(p => ({
      id: p.id,
      component_name: p.data?.componentName || '',
      component_category: p.data?.componentCategory || '',
      status: p.data?.status || 'Design',
      supplier: p.data?.supplier || '',
      cost_per_unit: p.data?.targetUnitCost || p.data?.costPerUnit || '',
      currency: p.data?.currency || 'USD',
      updated_at: p.updated_at,
      created_at: p.created_at,
      cover_image: extractCover(p.images),
    }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getComponentPack(id) {
  if (IS_SUPABASE_ENABLED) {
    const { data, error } = await supabase.from('component_packs').select('*').eq('id', id).maybeSingle();
    if (!error && data) {
      // Lazy backfill: older rows predate the cover_image column; populate it
      // the first time they're opened so subsequent list views show the
      // thumbnail without another edit.
      if (!data.cover_image) {
        const cover = extractCover(data.images);
        if (cover) {
          supabase.from('component_packs').update({ cover_image: cover }).eq('id', id)
            .then(({ error: upErr }) => { if (upErr) console.error('cover_image backfill:', upErr); });
          return { ...data, cover_image: cover };
        }
      }
      return data;
    }
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
  const cover = updates.images !== undefined ? extractCover(updates.images) : undefined;
  // cover_image is kept separate from the core patch: the Supabase migration
  // that adds the column may not have been applied yet, and mixing them in
  // one UPDATE would fail the entire save on a missing-column error.
  const corePatch = { ...updates, updated_at: now };
  const localPatch = cover !== undefined ? { ...corePatch, cover_image: cover } : corePatch;

  const rows = readLocal();
  const idx = rows.findIndex(p => p.id === id);
  if (idx >= 0) { rows[idx] = { ...rows[idx], ...localPatch }; writeLocal(rows); }

  if (!IS_SUPABASE_ENABLED) return { ok: true };

  const { error } = await supabase.from('component_packs').update(corePatch).eq('id', id);
  if (error) {
    console.error('saveComponentPack:', error);
    return { ok: false, error };
  }

  // Best-effort cover_image write — tolerates pre-migration schemas.
  if (cover !== undefined) {
    const { error: coverErr } = await supabase
      .from('component_packs')
      .update({ cover_image: cover })
      .eq('id', id);
    if (coverErr && !/column .* does not exist|could not find.*column/i.test(coverErr.message || '')) {
      console.error('saveComponentPack cover:', coverErr);
    }
  }
  return { ok: true };
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
    cover_image: extractCover(source.images),
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
