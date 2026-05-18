// Shared Vendor library. Mirrors colorLibrary.js — the library store holds
// the rich metadata (contact info, MOQ, lead time, specialties, notes,
// logo image, capabilities, payment terms, rating) per vendor, keyed by
// the same name string used in pack dropdowns (data.supplier / data.vendor
// / material.supplier).
//
// Renamed from `factoryLibrary` as part of the Library/Styles/Production
// IA migration. On first read we silently migrate records from the legacy
// `cashmodel_factories` key to `cashmodel_vendors`; writes target the new
// key only. Reads from either key never fail — if a name only exists in
// the legacy store we surface it with its data intact.
//
// plmDirectory.listAllSuppliers() stays the source of "what names are in
// use anywhere in the app." This library layers richer data on top — when
// a name exists in the directory but not yet in the store, VendorManager
// shows it with an empty record and a muted "No details yet" badge.
//
// Storage is localStorage-only for now to match the color library; cloud
// sync can follow the same dual-write pattern the pack stores use.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../types/atoms';
import { listAllSuppliers } from './plmDirectory';
import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LS_KEY = 'cashmodel_vendors';
const LEGACY_LS_KEY = 'cashmodel_factories';

let _migrated = false;

// Migrate legacy `cashmodel_factories` records into `cashmodel_vendors`
// exactly once per tab session. Idempotent: if the new key already has the
// record it wins; legacy-only records get copied over. The legacy key is
// left in place (additive only) so a user who rolls back doesn't lose data.
function migrateLegacyIfNeeded() {
  if (_migrated) return;
  _migrated = true;
  try {
    const legacyRaw = localStorage.getItem(LEGACY_LS_KEY);
    if (!legacyRaw) return;
    const legacy = JSON.parse(legacyRaw) || {};
    const currentRaw = localStorage.getItem(LS_KEY);
    const current = currentRaw ? JSON.parse(currentRaw) : {};
    let changed = false;
    Object.keys(legacy).forEach(name => {
      if (!current[name]) {
        current[name] = legacy[name];
        changed = true;
      }
    });
    if (changed) localStorage.setItem(LS_KEY, JSON.stringify(current));
  } catch (err) {
    console.error('vendorLibrary migrate:', err);
  }
}

// Map a Supabase row (snake_case projection) back into the camelCase
// shape the rest of the app uses on entries pulled from localStorage.
function fromSupabaseRow(row) {
  if (!row) return null;
  return {
    name: row.name,
    country: row.country || '',
    city: row.city || '',
    primaryContact: row.primary_contact || '',
    email: row.email || '',
    phone: row.phone || '',
    website: row.website || '',
    moq: row.moq || '',
    leadTimeDays: row.lead_time_days != null ? String(row.lead_time_days) : '',
    specialties: row.specialties || '',
    notes: row.notes || '',
    logoImage: row.logo_image || null,
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    moq_units: Number(row.moq_units) || 0,
    lead_time_days: Number(row.lead_time_days) || 0,
    payment_terms: row.payment_terms || '',
    rating: Number(row.rating) || 0,
    samRateUsdPerMin: row.sam_rate_usd_per_min != null && row.sam_rate_usd_per_min !== 0
      ? String(row.sam_rate_usd_per_min)
      : '',
    markupPct: row.markup_pct != null && row.markup_pct !== 0
      ? String(row.markup_pct)
      : '',
    archivedAt: row.archived_at || null,
  };
}

// Pull every vendor row for the current org from Supabase and merge into
// the local store (cloud-wins on collisions, since cloud is the source
// of truth across devices). Idempotent — safe to call on every mount.
// Returns the hydrated vendor map keyed by name.
async function hydrateVendorsFromCloud() {
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return null;
  try {
    const db = await getAuthedSupabase();
    if (!db) return null;
    const { data, error } = await db
      .from('vendors')
      .select('*')
      .eq('organization_id', orgId);
    if (error) {
      console.error('vendorLibrary hydrate:', error);
      return null;
    }
    const cloudByName = {};
    (data || []).forEach(row => {
      const camel = fromSupabaseRow(row);
      if (camel?.name) cloudByName[camel.name] = camel;
    });
    // Cloud-wins merge into local store — but only for fields the cloud
    // actually has a value for. fromSupabaseRow returns '' for missing
    // columns (e.g. markup_pct before that column is added to the
    // Supabase schema), and without this guard those empty defaults
    // would clobber any locally-saved value on the very next refresh.
    // Result: edits made offline / before the cloud migration is run
    // silently disappear when the editor modal closes.
    const isEmpty = (v) => v === '' || v == null || (Array.isArray(v) && v.length === 0);
    const local = readStore();
    const merged = { ...local };
    Object.entries(cloudByName).forEach(([name, entry]) => {
      const cloudNonEmpty = {};
      Object.entries(entry).forEach(([k, v]) => {
        if (!isEmpty(v)) cloudNonEmpty[k] = v;
      });
      merged[name] = { ...(local[name] || {}), ...cloudNonEmpty };
    });
    writeStore(merged);
    return merged;
  } catch (err) {
    console.error('vendorLibrary hydrate:', err);
    return null;
  }
}

function readStore() {
  migrateLegacyIfNeeded();
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); }
  catch (err) { console.error('vendorLibrary write:', err); }
}

function syncVendorToCloud(name, entry) {
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return;
  getAuthedSupabase().then(db => {
    if (!db) return;
    db.from('vendors').upsert({
      organization_id: orgId,
      name,
      country: entry.country || '',
      city: entry.city || '',
      primary_contact: entry.primaryContact || '',
      email: entry.email || '',
      phone: entry.phone || '',
      website: entry.website || '',
      moq: entry.moq || '',
      lead_time_days: Number(entry.lead_time_days) || 0,
      specialties: entry.specialties || '',
      notes: entry.notes || '',
      logo_image: entry.logoImage || null,
      capabilities: entry.capabilities || [],
      payment_terms: entry.payment_terms || '',
      rating: Number(entry.rating) || 0,
      sam_rate_usd_per_min: Number(entry.samRateUsdPerMin) || 0,
      markup_pct: Number(entry.markupPct) || 0,
      archived_at: entry.archivedAt || null,
    }, { onConflict: 'organization_id,name' })
    .then(({ error }) => {
      if (!error) return;
      // Most common cause: a column added in the local app (e.g. markup_pct,
      // sam_rate_usd_per_min) hasn't been migrated to the Supabase schema.
      // Surface a one-line hint with the SQL needed so the operator can run
      // it in the dashboard. The local write already succeeded, so the
      // value persists; only cross-device sync is blocked.
      const msg = error.message || '';
      const missing = msg.match(/column ['"]?(\w+)['"]? of ['"]?vendors['"]?/i)?.[1]
                   || msg.match(/Could not find the ['"]?(\w+)['"]? column/i)?.[1];
      if (missing) {
        console.error(`vendorLibrary sync: missing column "${missing}" on Supabase \`vendors\` table. Local write succeeded; cross-device sync blocked until you run:  ALTER TABLE vendors ADD COLUMN ${missing} numeric DEFAULT 0;`);
      } else {
        console.error('vendorLibrary sync:', error);
      }
    });
  });
}

function deleteVendorFromCloud(name) {
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return;
  getAuthedSupabase().then(db => {
    if (!db) return;
    db.from('vendors').delete().eq('organization_id', orgId).eq('name', name)
      .then(({ error }) => { if (error) console.error('vendorLibrary delete:', error); });
  });
}

const emptyEntry = (name) => ({
  name,
  country: '',
  city: '',
  primaryContact: '',
  email: '',
  phone: '',
  website: '',
  moq: '',
  leadTimeDays: '',
  specialties: '',
  notes: '',
  logoImage: null,
  // Additive schema fields for Prompt 1 — default to empty for existing records.
  capabilities: [],
  moq_units: 0,
  lead_time_days: 0,
  payment_terms: '',
  rating: 0,
  // Fully-loaded SAM (Standard Allowed Minute) billing rate the factory
  // charges for cut & sew, in USD per minute. Optional — only set on
  // vendors that are cut & sew manufacturers. The AI labor cost
  // estimator uses this rate × estimated SAM minutes when present, and
  // falls back to regional CMT benchmarks when blank.
  samRateUsdPerMin: '',
  // Flat factory profit markup, expressed as a percentage on top of the
  // landed unit cost (fabrics + trims + treatments + cut & sew). Sticks
  // with the vendor so every tech pack that names them inherits the
  // same %. Stored as a string so blank stays blank in the UI; coerced
  // to Number at cost-rollup time.
  markupPct: '',
  // Soft-archive timestamp. NULL/empty = active and shown in the
  // Vendors directory. Non-null = archived; hidden by default but
  // visible behind the "Show archived" toggle. Restore by clearing.
  archivedAt: null,
});

// Synchronous snapshot of library records. By default returns active
// vendors only; pass { includeArchived: true } to include archived ones.
// VendorManager shows this immediately on mount, then augments with
// `listAllSuppliers()` in the background to include names that appear
// in packs but have no rich entry.
export function listVendorsLocal({ includeArchived = false } = {}) {
  const store = readStore();
  return Object.keys(store)
    .map(name => ({ ...emptyEntry(name), ...store[name], _hasRecord: true }))
    .filter(v => includeArchived || !v.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Full async list — library store + every name pulled from supplier
// aggregation. Names that aren't in the store are returned as empty
// records with `_hasRecord: false` so the UI can badge them. Archived
// vendors are filtered unless `includeArchived: true` is passed.
export async function listVendors({ includeArchived = false } = {}) {
  // Hydrate from cloud first so a fresh device sees vendors created on
  // another laptop. Cloud-wins merge into localStorage; subsequent sync
  // reads (getVendor, listVendorsLocal) then return the merged set.
  const hydrated = await hydrateVendorsFromCloud();
  const store = hydrated || readStore();
  const fromStore = Object.keys(store)
    .map(name => ({ ...emptyEntry(name), ...store[name], _hasRecord: true }))
    .filter(v => includeArchived || !v.archivedAt);
  let fromDirectory = [];
  try {
    const names = await listAllSuppliers();
    const seen = new Set(fromStore.map(f => f.name));
    // Names archived in the library are also hidden from the directory-
    // backed entries — otherwise an archived vendor that's still
    // referenced in a pack would reappear as a `_hasRecord: false` row.
    const archivedSet = new Set(
      Object.values(store)
        .filter(v => v && v.archivedAt)
        .map(v => v.name)
    );
    fromDirectory = names
      .filter(n => n && !seen.has(n) && (includeArchived || !archivedSet.has(n)))
      .map(name => ({ ...emptyEntry(name), _hasRecord: false }));
  } catch (err) {
    console.error('listVendors directory lookup:', err);
  }
  return [...fromStore, ...fromDirectory].sort((a, b) => a.name.localeCompare(b.name));
}

export function getVendor(name) {
  if (!name) return null;
  const store = readStore();
  if (!store[name]) return { ...emptyEntry(name), _hasRecord: false };
  return { ...emptyEntry(name), ...store[name], _hasRecord: true };
}

// Resolve a vendor by either the current name key or a legacy identifier.
// The prompt calls for accepting legacy `factory_id` values; nothing in
// this codebase uses numeric/UUID FKs for vendors today (they're all
// name strings), but we keep the signature flexible so Prompts 2+ and any
// future foreign-key refactor can call this one helper and get the same
// resolution path — new name → legacy name → null.
export function resolveVendor(nameOrId) {
  if (!nameOrId) return null;
  const store = readStore();
  if (store[nameOrId]) {
    return { ...emptyEntry(nameOrId), ...store[nameOrId], _hasRecord: true };
  }
  // Legacy-compat read: check the old `cashmodel_factories` key directly
  // for any record the migration didn't catch (e.g. written by an older
  // tab after this one already migrated).
  try {
    const legacyRaw = localStorage.getItem(LEGACY_LS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) || {};
      if (legacy[nameOrId]) {
        return { ...emptyEntry(nameOrId), ...legacy[nameOrId], _hasRecord: true };
      }
    }
  } catch {/* ignore */}
  return null;
}

// Merge a partial update into the vendor's record. Any empty-string field
// is ignored so a blank edit doesn't wipe a previously-saved value. Writing
// any field also establishes the record in the library store, so names
// that only lived in plmDirectory get promoted on first edit.
export function updateVendor(name, patch) {
  if (!name || !patch) return;
  const store = readStore();
  const current = store[name] || {};
  const next = { ...current };
  Object.entries(patch).forEach(([k, v]) => {
    if (v === '' || v == null) return;
    next[k] = v;
  });
  store[name] = next;
  writeStore(store);
  syncVendorToCloud(name, next);
}

// Clear a specific field (used when removing the logo image).
export function clearVendorField(name, field) {
  if (!name || !field) return;
  const store = readStore();
  if (!store[name]) return;
  const { [field]: _, ...rest } = store[name];
  store[name] = rest;
  writeStore(store);
  syncVendorToCloud(name, rest);
}

// Create a new vendor. Returns { ok: true } on success or
// { ok: false, reason } if the name is empty or already in the store.
export function addVendor(name, patch = {}) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, reason: 'Name required.' };
  const store = readStore();
  if (store[clean]) return { ok: false, reason: 'A vendor with that name already exists.' };
  const entry = { ...emptyEntry(clean) };
  Object.entries(patch || {}).forEach(([k, v]) => {
    if (v === '' || v == null) return;
    entry[k] = v;
  });
  store[clean] = entry;
  writeStore(store);
  syncVendorToCloud(clean, entry);
  return { ok: true };
}

// Drop the library entry. Idempotent — succeeds even when the vendor
// only ever existed via plmDirectory (i.e. a name in a pack with no
// rich record yet). In that case there's nothing in the library store
// to delete, but we still scrub the manually-added supplier list so
// the name doesn't reappear from there. Pack references are intentionally
// left alone — deleting vendor metadata must never silently rewrite a
// pack's data. If the user wants the name fully gone, they should
// archive the vendor instead (archive hides it from the directory even
// when packs still reference it).
export function deleteVendor(name) {
  if (!name) return { ok: false, reason: 'Name required.' };
  const store = readStore();
  if (store[name]) {
    const { [name]: _, ...rest } = store;
    writeStore(rest);
    deleteVendorFromCloud(name);
  }
  // Also scrub the manually-added supplier list (cashmodel_plm_suppliers)
  // so a directory-only vendor disappears for real after delete.
  try {
    const customRaw = localStorage.getItem('cashmodel_plm_suppliers');
    if (customRaw) {
      const arr = JSON.parse(customRaw);
      if (Array.isArray(arr) && arr.includes(name)) {
        localStorage.setItem(
          'cashmodel_plm_suppliers',
          JSON.stringify(arr.filter(s => s !== name))
        );
      }
    }
  } catch {/* ignore */}
  return { ok: true };
}

// Archive a vendor — hides it from the default Vendors directory but
// keeps the record so it can be restored. Unlike delete, archive holds
// over directory-only fallbacks too: archived names don't reappear in
// listVendors() even if a pack still references them. If the vendor
// has no library record yet, archive establishes one so we have somewhere
// to stamp the archivedAt timestamp.
export function archiveVendor(name) {
  if (!name) return { ok: false, reason: 'Name required.' };
  const store = readStore();
  const current = store[name] || {};
  const next = { ...current, archivedAt: new Date().toISOString() };
  store[name] = next;
  writeStore(store);
  syncVendorToCloud(name, next);
  return { ok: true };
}

// Restore an archived vendor.
export function restoreVendor(name) {
  if (!name) return { ok: false, reason: 'Name required.' };
  const store = readStore();
  if (!store[name]) return { ok: false, reason: 'No such vendor.' };
  const { archivedAt: _, ...rest } = store[name];
  store[name] = rest;
  writeStore(store);
  syncVendorToCloud(name, rest);
  return { ok: true };
}

// Rename a vendor and cascade the change through every PLM
// localStorage row that references the old name. Vendor names are
// used as the cross-row foreign key (no UUIDs), so renaming is a
// real surgery: re-key the vendor entry, rename in cloud, and walk
// every dependent pack/atom in localStorage to update its
// vendor-pointing fields.
//
// Cloud-side cascade is best-effort:
//   • The vendor row itself is UPDATEd to the new name.
//   • Pack / atom rows in cloud still carry the old name in their
//     JSONB or projection columns; they'll heal on the next save
//     of each of those rows. We don't run mass cross-table UPDATEs
//     because they're hard to make atomic and a partial failure
//     would be worse than a slow heal.
//
// Returns { ok: true, renamed, localRefsUpdated } on success or
// { ok: false, reason } if the new name is empty / already taken.
export function renameVendor(oldName, newName) {
  const oldClean = String(oldName || '').trim();
  const newClean = String(newName || '').trim();
  if (!oldClean || !newClean) return { ok: false, reason: 'Both names required.' };
  if (oldClean === newClean) return { ok: true, renamed: false, localRefsUpdated: 0 };
  const store = readStore();
  if (!store[oldClean]) return { ok: false, reason: 'Original vendor not found.' };
  if (store[newClean]) return { ok: false, reason: 'A vendor with that name already exists.' };

  // 1. Re-key the vendor entry in the local store.
  const entry = { ...store[oldClean], name: newClean };
  const next = { ...store, [newClean]: entry };
  delete next[oldClean];
  writeStore(next);

  // 2. Cascade local references. Each PLM store keeps its own
  // localStorage key; we walk known vendor-pointing fields on each
  // and rewrite. Unknown fields are left alone — better to miss a
  // reference than to corrupt unrelated data.
  let localRefsUpdated = 0;
  const VENDOR_REF_KEYS = ['cashmodel_techpacks', 'cashmodel_component_packs', 'cashmodel_treatments', 'cashmodel_embellishments', 'cashmodel_fabrics', 'cashmodel_cut_sew', 'cashmodel_purchase_orders', 'cashmodel_production'];
  for (const lsKey of VENDOR_REF_KEYS) {
    let raw;
    try { raw = localStorage.getItem(lsKey); } catch { continue; }
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    let dirty = false;
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      // Top-level keys we know hold a vendor name.
      for (const k of ['supplier', 'vendor', 'vendor_id', 'vendorId', 'primary_vendor_id', 'primaryVendorId', 'vendorName']) {
        if (row[k] === oldClean) { row[k] = newClean; dirty = true; localRefsUpdated++; }
      }
      // Same keys nested under data (most PLM rows put domain fields
      // into the JSONB data column rather than projection columns).
      const d = row.data;
      if (d && typeof d === 'object') {
        for (const k of ['supplier', 'vendor', 'vendor_id', 'vendorId', 'primary_vendor_id', 'primaryVendorId', 'vendorName']) {
          if (d[k] === oldClean) { d[k] = newClean; dirty = true; localRefsUpdated++; }
        }
      }
    }
    if (dirty) {
      try { localStorage.setItem(lsKey, JSON.stringify(parsed)); }
      catch (err) { console.error('renameVendor cascade write:', err); }
    }
  }

  // 3. Cloud-side: update the vendor row's name. Cross-table refs
  // heal on next save of each affected row; not worth the partial-
  // failure risk of a mass cascade here.
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    getAuthedSupabase().then(db => {
      if (!db) return;
      db.from('vendors')
        .update({ name: newClean })
        .eq('organization_id', orgId)
        .eq('name', oldClean)
        .then(({ error }) => { if (error) console.error('renameVendor cloud:', error); });
    });
  }

  return { ok: true, renamed: true, localRefsUpdated };
}
