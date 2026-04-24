// Shared Factory library. Mirrors colorLibrary.js — the library store holds
// the rich metadata (contact info, MOQ, lead time, specialties, notes,
// logo image) per factory, keyed by the same name string used in pack
// dropdowns (data.supplier / data.factory / material.supplier).
//
// plmDirectory.listAllSuppliers() stays the source of "what names are in
// use anywhere in the app." This library layers richer data on top — when
// a name exists in the directory but not yet in the store, FactoryManager
// shows it with an empty record and a muted "No details yet" badge.
//
// Storage is localStorage-only for now to match the color library; cloud
// sync can follow the same dual-write pattern the pack stores use.

import { listAllSuppliers } from './plmDirectory';

const LS_KEY = 'cashmodel_factories';

function readStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); }
  catch (err) { console.error('factoryLibrary write:', err); }
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
});

// Synchronous snapshot of every library record. FactoryManager shows these
// immediately on mount, then augments with `listAllSuppliers()` in the
// background to include names that appear in packs but have no rich entry.
export function listFactoriesLocal() {
  const store = readStore();
  return Object.keys(store)
    .map(name => ({ ...emptyEntry(name), ...store[name], _hasRecord: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Full async list — library store + every name pulled from supplier
// aggregation. Names that aren't in the store are returned as empty
// records with `_hasRecord: false` so the UI can badge them.
export async function listFactories() {
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
    console.error('listFactories directory lookup:', err);
  }
  return [...fromStore, ...fromDirectory].sort((a, b) => a.name.localeCompare(b.name));
}

export function getFactory(name) {
  if (!name) return null;
  const store = readStore();
  if (!store[name]) return { ...emptyEntry(name), _hasRecord: false };
  return { ...emptyEntry(name), ...store[name], _hasRecord: true };
}

// Merge a partial update into the factory's record. Any empty-string field
// is ignored so a blank edit doesn't wipe a previously-saved value. Writing
// any field also establishes the record in the library store, so names
// that only lived in plmDirectory get promoted on first edit.
export function updateFactory(name, patch) {
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
}

// Clear a specific field (used when removing the logo image).
export function clearFactoryField(name, field) {
  if (!name || !field) return;
  const store = readStore();
  if (!store[name]) return;
  const { [field]: _, ...rest } = store[name];
  store[name] = rest;
  writeStore(store);
}

// Create a new factory. Returns { ok: true } on success or
// { ok: false, reason } if the name is empty or already in the store.
export function addFactory(name, patch = {}) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, reason: 'Name required.' };
  const store = readStore();
  if (store[clean]) return { ok: false, reason: 'A factory with that name already exists.' };
  const entry = { ...emptyEntry(clean) };
  Object.entries(patch || {}).forEach(([k, v]) => {
    if (v === '' || v == null) return;
    entry[k] = v;
  });
  store[clean] = entry;
  writeStore(store);
  return { ok: true };
}

// Drop the library entry. If the name is still referenced by a pack it
// will keep showing up in listFactories() via the plmDirectory fallback,
// just with an empty record. That's intentional — deleting the factory
// metadata should never silently rename anything in a pack.
export function deleteFactory(name) {
  if (!name) return { ok: false, reason: 'Name required.' };
  const store = readStore();
  if (!store[name]) return { ok: false, reason: 'No such factory.' };
  const { [name]: _, ...rest } = store;
  writeStore(rest);
  return { ok: true };
}
