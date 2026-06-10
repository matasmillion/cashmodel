// versionHistoryStore — local-first "version vault": silent point-in-time
// snapshots of a record so the operator can never truly lose work.
//
// WHY THIS EXISTS
// ───────────────
// The cloud is a SILENT background backup, never a boss. When two devices edit
// the same style, last-write-wins picks a winner — but the version that didn't
// win, and every meaningful save along the way, is captured here. The operator
// browses the timeline and restores any past version from a style's "History"
// button. This replaces the scary "Restore mine / Keep theirs" popup with a
// calm, browsable safety net.
//
// localStorage→IndexedDB via localDb (instant, offline-capable). Append-only in
// spirit: snapshots are only ever ADDED (capped) or read; a restore writes a NEW
// snapshot of the chosen version, it never deletes history.

import { getCollection, setCollection } from './localDb.js';

const KEY = 'cashmodel_version_history';
const PER_RECORD_CAP = 20;       // keep the last N versions per record
const GLOBAL_CAP = 400;          // hard ceiling across all records
const THROTTLE_MS = 90 * 1000;   // coalesce snapshots of the same record within 90s
                                 // (auto-save fires every ~600ms — don't keep a version per keystroke)

const listeners = new Set();
function notify() {
  for (const fn of listeners) { try { fn(); } catch (e) { console.error('versionHistory listener:', e); } }
}

/** Subscribe to vault changes. Returns an unsubscribe fn. */
export function onVersionHistory(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function readAll() { return getCollection(KEY); }
function writeAll(rows) { setCollection(KEY, rows); notify(); }
function keyOf(table, id) { return `${table}::${id}`; }

/**
 * Capture a point-in-time snapshot of a record's data + images. Throttled per
 * record and de-duped (skips when identical to the latest snapshot), so the
 * 600ms auto-save can call it freely without spamming the vault. Within the
 * throttle window the most-recent snapshot is updated in place (one rolling
 * "latest"); after it, a new snapshot is appended.
 *
 * @param {{ table:string, id:string, label?:string, code?:string, name?:string,
 *           data?:any, images?:any, reason?:'save'|'clash-backup'|'restore' }} entry
 * @returns {boolean} true if the vault changed
 */
export function snapshotVersion({ table, id, label = '', code = '', name = '', data = null, images = null, reason = 'save' } = {}) {
  if (!table || !id) return false;
  const rows = readAll();
  const k = keyOf(table, id);
  const latest = rows.find(r => r._k === k); // newest first (we unshift)
  const now = Date.now();
  const sig = JSON.stringify({ data: data ?? null, images: images ?? null });

  if (latest) {
    if (latest._sig === sig) return false; // nothing material changed → skip
    if (reason === 'save' && now - latest.ts < THROTTLE_MS && latest.reason === 'save') {
      // Coalesce into the rolling latest rather than minting a keystroke version.
      latest.ts = now; latest._sig = sig; latest.data = data; latest.images = images;
      if (label) latest.label = label; if (code) latest.code = code; if (name) latest.name = name;
      writeAll(rows);
      return true;
    }
  }

  rows.unshift({ ts: now, _k: k, table, id, label, code, name, reason, data, images, _sig: sig });
  writeAll(enforceCaps(rows));
  return true;
}

function enforceCaps(rows) {
  const perRecord = new Map();
  const kept = [];
  for (const r of rows) { // rows are newest-first
    const c = perRecord.get(r._k) || 0;
    if (c >= PER_RECORD_CAP) continue;
    perRecord.set(r._k, c + 1);
    kept.push(r);
  }
  return kept.slice(0, GLOBAL_CAP);
}

/** All snapshots for a record, newest first. */
export function listVersions(table, id) {
  const k = keyOf(table, id);
  return readAll().filter(r => r._k === k);
}

/** A single snapshot by timestamp, or null. */
export function getVersion(ts) {
  return readAll().find(r => r.ts === ts) || null;
}

/** Distinct records that have any history (for a global browse), newest first. */
export function listRecordsWithHistory() {
  const seen = new Map();
  for (const r of readAll()) {
    if (!seen.has(r._k)) seen.set(r._k, { table: r.table, id: r.id, label: r.label, code: r.code, name: r.name, count: 0, latestTs: r.ts });
    seen.get(r._k).count += 1;
  }
  return [...seen.values()].sort((a, b) => b.latestTs - a.latestTs);
}

// Test-only: wipe the vault.
export function __resetVersionHistoryForTests() { writeAll([]); }
