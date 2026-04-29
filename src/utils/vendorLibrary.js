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
    }, { onConflict: 'organization_id,name' })
    .then(({ error }) => { if (error) console.error('vendorLibrary sync:', error); });
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
});

// Synchronous snapshot of every library record. VendorManager shows these
// immediately on mount, then augments with `listAllSuppliers()` in the
// background to include names that appear in packs but have no rich entry.
export function listVendorsLocal() {
  const store = readStore();
  return Object.keys(store)
    .map(name => ({ ...emptyEntry(name), ...store[name], _hasRecord: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Full async list — library store + every name pulled from supplier
// aggregation. Names that aren't in the store are returned as empty
// records with `_hasRecord: false` so the UI can badge them.
export async function listVendors() {
  const store = readStore();
  const fromStore = Object.keys(store)
    .map(name => ({ ...emptyEntry(name), ...store[name], _hasRecord: true }));
  let fromDirectory = [];
  try {
    const names = await listAllSuppliers();
    const seen = new Set(fromStore.map(f => f.name));
    fromDirectory = names
      .filter(n => n && !seen.has(n))
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

// Drop the library entry. If the name is still referenced by a pack it
// will keep showing up in listVendors() via the plmDirectory fallback,
// just with an empty record. That's intentional — deleting the vendor
// metadata should never silently rename anything in a pack.
export function deleteVendor(name) {
  if (!name) return { ok: false, reason: 'Name required.' };
  const store = readStore();
  if (!store[name]) return { ok: false, reason: 'No such vendor.' };
  const { [name]: _, ...rest } = store;
  writeStore(rest);
  deleteVendorFromCloud(name);
  return { ok: true };
}
