// Shared FR color library. Stores one record per named color used across
// both tech packs and trim packs — Pantone TCX/TPG/C codes, hex, RGB, and
// the uploaded Pantone TCX card image. Any edit to a color made inside a
// pack's colorway card is written back here so the same color in any other
// pack immediately picks up the change.
//
// Storage is localStorage-only for now. Supabase sync can follow later in
// the same dual-write pattern used by the pack stores; until then a user
// editing on device A sees the update on device B after importing/opening
// any pack that references the color.

import { FR_COLOR_OPTIONS } from '../components/techpack/techPackConstants';

const LS_KEY = 'cashmodel_fr_colors';

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
  catch (err) { console.error('colorLibrary write:', err); }
}

const emptyEntry = (name, hex) => ({
  name,
  hex: hex || '',
  rgb: '',
  pantoneTCX: '',
  pantoneTPG: '',
  pantoneC: '',
  cardImage: null, // base64 data URL of the Pantone TCX swatch card photo
  usageNotes: '',
  // Per-unit cost of applying this color. A flat stock color is typically
  // free (the fabric is already that color). A wash / dye / print adds a
  // real charge per garment — the treatment plant rate. Kept as a string
  // so users can enter "0.85" without worrying about numeric coercion in
  // the input field; parseFloat on read.
  costPerUnit: '',
  currency: 'USD',
});

// Return every color we know about — the FR staples seeded from the palette,
// plus any ad-hoc colors a user has added inside a colorway card.
export function listFRColors() {
  const store = readStore();
  const seen = new Set();
  const out = [];
  FR_COLOR_OPTIONS.forEach(c => {
    seen.add(c.name);
    out.push({ ...emptyEntry(c.name, c.hex), ...(store[c.name] || {}) });
  });
  Object.keys(store).forEach(name => {
    if (seen.has(name)) return;
    out.push({ ...emptyEntry(name), ...store[name] });
  });
  return out;
}

export function getFRColor(name) {
  if (!name) return null;
  const store = readStore();
  const palette = FR_COLOR_OPTIONS.find(c => c.name === name);
  if (!palette && !store[name]) return null;
  return { ...emptyEntry(name, palette?.hex), ...(store[name] || {}) };
}

// Merge a partial update into the color's record. Any falsy-string field is
// ignored so an empty edit doesn't wipe a previously-saved value.
export function updateFRColor(name, patch) {
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

// Clear a specific field on a color (used when removing the Pantone card image).
export function clearFRColorField(name, field) {
  if (!name || !field) return;
  const store = readStore();
  if (!store[name]) return;
  const { [field]: _, ...rest } = store[name];
  store[name] = rest;
  writeStore(store);
}

// The 9 FR staples cannot be renamed or deleted from the UI — they're the
// identity of the brand. Custom colors (anything added through the
// "+ Add color" button) are fully editable and deletable.
export function isSeededFRColor(name) {
  return FR_COLOR_OPTIONS.some(c => c.name === name);
}

// Read costPerUnit as a number (0 if empty or unparseable). Used by the
// tech pack cost roll-up to charge for wash / treatment / dye colors.
export function getFRColorCost(name) {
  const entry = getFRColor(name);
  if (!entry) return 0;
  return parseFloat(entry.costPerUnit) || 0;
}

// Create a new ad-hoc color. Returns { ok: true } on success or
// { ok: false, reason } if the name is empty, already used, or a seed color.
export function addFRColor(name, patch = {}) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, reason: 'Name required.' };
  if (isSeededFRColor(clean)) return { ok: false, reason: 'That name is already a brand color.' };
  const store = readStore();
  if (store[clean]) return { ok: false, reason: 'A color with that name already exists.' };
  const entry = { ...emptyEntry(clean) };
  Object.entries(patch || {}).forEach(([k, v]) => {
    if (v === '' || v == null) return;
    entry[k] = v;
  });
  store[clean] = entry;
  writeStore(store);
  return { ok: true };
}

// Remove a custom color. Seeded FR brand colors cannot be deleted.
export function deleteFRColor(name) {
  if (!name) return { ok: false, reason: 'Name required.' };
  if (isSeededFRColor(name)) return { ok: false, reason: 'Brand colors cannot be deleted.' };
  const store = readStore();
  if (!store[name]) return { ok: false, reason: 'No such color.' };
  const { [name]: _, ...rest } = store;
  writeStore(rest);
  return { ok: true };
}
