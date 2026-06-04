// Local-first storage engine — IndexedDB-backed, with an in-memory cache that
// makes reads synchronous and writes non-blocking.
//
// WHY THIS EXISTS
// ───────────────
// The PLM / inventory / cash-model stores were all built on localStorage:
//   • synchronous — every read/write JSON-(de)serializes the WHOLE collection
//     on the main thread (jank, especially the cash-model blob autosaved every
//     500ms while typing),
//   • capped at ~5 MB per origin — once the combined footprint crossed the
//     ceiling, writes threw QuotaExceededError and were SILENTLY swallowed, so
//     nothing persisted locally and every session re-pulled from the cloud.
//
// This engine moves the local substrate to IndexedDB:
//   • effectively unlimited (hundreds of MB — bounded by disk quota, not 5 MB),
//   • writes are async (off the render path) and coalesced per key,
//   • an in-memory cache, hydrated once at boot, keeps reads synchronous so the
//     existing store API (synchronous readLocal()) is unchanged.
//
// MIGRATION (lazy, per-key, staleness-free)
// ─────────────────────────────────────────
// On the first engine access for a key whose data still lives in localStorage,
// we import that value into the cache + IDB at that moment (so we always read
// the CURRENT localStorage value, never a stale boot-time copy). For keys whose
// every reader has been converted to the engine (RECLAIMABLE_KEYS), the
// localStorage copy is then deleted to free the 5 MB quota. Other keys are
// copy-only — their stale localStorage copy is left untouched so any
// not-yet-converted direct reader keeps working.
//
// FALLBACK
// ────────
// If IndexedDB is unavailable (private mode, ancient browser), the engine
// transparently degrades to the original localStorage behaviour.

const DB_NAME = 'cashmodel_local';
const DB_VERSION = 1;
const STORE = 'kv';

// Keys the engine must never touch — owned by syncQueue.js directly.
const ENGINE_DENYLIST = new Set([
  'cashmodel_sync_queue',
  'cashmodel_sync_last_at',
]);

// Keys whose every reader has been migrated to the engine, so the localStorage
// copy is safe to delete (reclaims quota). Grow this set as more store clusters
// are converted. See the per-commit conversion notes.
const RECLAIMABLE_KEYS = new Set([
  'cashmodel_state',
  // PLM library + production — every reader/writer now goes through the engine,
  // so the legacy localStorage copies are safe to drop (frees the ~5MB quota).
  'cashmodel_techpacks',
  'cashmodel_component_packs',
  'cashmodel_treatments',
  'cashmodel_fabrics',
  'cashmodel_embellishments',
  'cashmodel_cut_sew',
  'cashmodel_patterns',
  'cashmodel_vendors',
  'cashmodel_fr_colors',
  'cashmodel_plm_suppliers',
  'cashmodel_plm_people',
  'cashmodel_plm_trim_types',
  'cashmodel_sample_requests',
  'cashmodel_pos',
  'cashmodel_bom_snapshots',
  'cashmodel_atom_usage',
  'cashmodel_drift_logs',
]);

const FLUSH_DEBOUNCE_MS = 120;

// ─── In-memory state ──────────────────────────────────────────────────────
const cache = new Map();        // key -> JSON value (array | object | scalar)
const imported = new Set();     // keys we've already checked localStorage for
const dirty = new Set();        // keys with un-persisted changes
let _db = null;                 // open IDBDatabase
let _useLS = false;             // true → IndexedDB unavailable, use localStorage
let _ready = false;
let _flushTimer = null;

// ─── Minimal promise-wrapped IndexedDB ──────────────────────────────────────
function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(mode) {
  const tx = _db.transaction(STORE, mode);
  return tx.objectStore(STORE);
}

// ─── localStorage helpers (fallback + lazy import) ──────────────────────────
function lsRead(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch { return undefined; }
}

function lsWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22
      || /quota/i.test(err.message || ''));
    console.error('localDb localStorage write failed:', key, err);
    return { ok: false, error: err, quota: !!isQuota };
  }
}

// Pull a key's legacy localStorage value into the cache the first time it's
// touched. Idempotent per key. For reclaimable keys, the localStorage copy is
// removed once the value is safely persisted to IDB (handled in flush()).
function ensureImported(key) {
  if (_useLS || imported.has(key)) return;
  imported.add(key);
  if (cache.has(key)) return;          // already hydrated from IDB at boot
  const legacy = lsRead(key);
  if (legacy === undefined) return;    // nothing to import
  cache.set(key, legacy);
  markDirty(key);                      // persist into IDB (+ reclaim if listed)
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** True once hydrate() has completed. */
export function isReady() { return _ready; }

/** True when running on the localStorage fallback (IndexedDB unavailable). */
export function isFallback() { return _useLS; }

/**
 * Boot the engine: open IndexedDB and load every persisted key into the
 * in-memory cache so subsequent reads are synchronous. Falls back to
 * localStorage if IndexedDB can't be opened. Call once, awaited, before render.
 */
export async function hydrate() {
  if (_ready) return;
  if (typeof indexedDB === 'undefined') {
    _useLS = true;
    _ready = true;
    return;
  }
  try {
    _db = await openDb();
    await new Promise((resolve, reject) => {
      const out = [];
      const req = txStore('readonly').openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cache.set(cursor.key, cursor.value);
          imported.add(cursor.key); // already in IDB — don't re-import from LS
          out.push(cursor.key);
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('localDb: IndexedDB unavailable, falling back to localStorage:', err);
    _useLS = true;
    _db = null;
  }
  _ready = true;
  if (typeof window !== 'undefined') {
    // Best-effort durability: flush pending writes when the tab is backgrounded
    // or closed (the debounce window may not have fired yet).
    const flushOnHide = () => { if (dirty.size) flush(); };
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    });
    window.addEventListener('pagehide', flushOnHide);
  }
}

/**
 * Read a collection (array of records). Returns a shallow copy so callers can
 * freely push / splice / reassign elements before writing it back, exactly
 * like the old `readLocal()` contract.
 * @param {string} key
 * @returns {any[]}
 */
export function getCollection(key) {
  if (_useLS) { const v = lsRead(key); return Array.isArray(v) ? v : []; }
  ensureImported(key);
  const v = cache.get(key);
  return Array.isArray(v) ? v.slice() : [];
}

/**
 * Write a collection. Updates the cache synchronously and schedules an async,
 * coalesced persist to IndexedDB. Returns { ok } synchronously (IDB has no
 * 5 MB quota so there's no quota branch in the IDB path).
 * @param {string} key
 * @param {any[]} arr
 */
export function setCollection(key, arr) {
  if (_useLS) return lsWrite(key, arr);
  imported.add(key);
  cache.set(key, arr);
  markDirty(key);
  return { ok: true };
}

/**
 * Read a singleton blob (object / map / scalar). Returns the live cached value
 * (callers in this codebase build new objects rather than mutating in place).
 * @param {string} key
 * @returns {any}
 */
export function getBlob(key) {
  if (_useLS) { const v = lsRead(key); return v === undefined ? null : v; }
  ensureImported(key);
  return cache.has(key) ? cache.get(key) : null;
}

/** Write a singleton blob. @param {string} key @param {any} value */
export function setBlob(key, value) {
  if (_useLS) return lsWrite(key, value);
  imported.add(key);
  cache.set(key, value);
  markDirty(key);
  return { ok: true };
}

/** Remove a key from the cache, IndexedDB, and localStorage. */
export function removeKey(key) {
  cache.delete(key);
  imported.add(key);
  dirty.delete(key);
  if (_useLS) { try { localStorage.removeItem(key); } catch { /* ignore */ } return; }
  try {
    const store = txStore('readwrite');
    store.delete(key);
  } catch (err) { console.error('localDb delete failed:', key, err); }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** navigator.storage.estimate() passthrough for the Storage Health panel. */
export async function estimateUsage() {
  try {
    if (navigator?.storage?.estimate) return await navigator.storage.estimate();
  } catch { /* ignore */ }
  return null;
}

// ─── Persistence ────────────────────────────────────────────────────────────
function markDirty(key) {
  if (ENGINE_DENYLIST.has(key)) return;
  dirty.add(key);
  scheduleFlush();
}

function scheduleFlush() {
  if (_flushTimer || _useLS || !_db) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; flush(); }, FLUSH_DEBOUNCE_MS);
}

/** Persist every dirty key to IndexedDB in one transaction. */
export function flush() {
  if (_useLS || !_db || dirty.size === 0) return Promise.resolve();
  const keys = [...dirty];
  dirty.clear();
  return new Promise((resolve) => {
    let store;
    try {
      const tx = _db.transaction(STORE, 'readwrite');
      store = tx.objectStore(STORE);
      tx.oncomplete = () => {
        // Reclaim the 5 MB quota for fully-converted keys now that the value is
        // durably in IndexedDB.
        for (const key of keys) {
          if (RECLAIMABLE_KEYS.has(key)) {
            try { localStorage.removeItem(key); } catch { /* ignore */ }
          }
        }
        resolve();
      };
      tx.onerror = () => { keys.forEach(k => dirty.add(k)); resolve(); };
      tx.onabort = () => { keys.forEach(k => dirty.add(k)); resolve(); };
    } catch (err) {
      console.error('localDb flush tx failed:', err);
      keys.forEach(k => dirty.add(k));
      resolve();
      return;
    }
    for (const key of keys) {
      try {
        if (cache.has(key)) store.put(cache.get(key), key);
        else store.delete(key);
      } catch (err) { console.error('localDb flush put failed:', key, err); }
    }
  });
}
