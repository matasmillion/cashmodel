// Conflict backups — the "never lose data" safety net for multi-device edits.
//
// The PLM uses last-write-wins (newest updated_at) to resolve the case where
// the same record was edited on two computers signed into the same account.
// LWW is deterministic and never crashes, but the "losing" edit would
// normally be discarded. That's unacceptable for the operator's stance of
// "i dont want to lose data."
//
// So whenever the sync layer is about to let a newer version win over an
// older one for the SAME record, it stashes the losing version here first.
// The Sync Diagnostics panel surfaces unacknowledged conflicts so the
// operator can review the discarded edit and restore it if it mattered.
//
// localStorage-backed, capped ring (newest first). Append-only in spirit —
// entries are only ever acknowledged (soft) or restored, never silently
// dropped except by the size cap.

const KEY = 'cashmodel_conflict_backups';
const MAX = 100;

const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function write(rows) {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); }
  catch (err) { console.error('conflictBackup write:', err); }
}

function notify() {
  const open = getUnresolvedConflicts();
  for (const fn of listeners) {
    try { fn(open); } catch (err) { console.error('conflictBackup listener:', err); }
  }
}

/**
 * Record that `localVersion` lost to `cloudVersion` for {table,id}. The
 * losing version is kept verbatim so it can be restored.
 * @param {{ table: string, id: string, localVersion: any, cloudVersion?: any, resolution?: string }} entry
 */
export function recordConflict({ table, id, localVersion, cloudVersion = null, resolution = 'cloud_newer' }) {
  const rows = read();
  rows.unshift({
    ts: Date.now(),
    table,
    id,
    resolution,
    localVersion,
    cloudVersion,
    acknowledged: false,
  });
  while (rows.length > MAX) rows.pop();
  write(rows);
  notify();
}

/** All recorded conflicts, newest first. */
export function getConflicts() {
  return read();
}

/** Conflicts the operator hasn't dismissed yet — drives the prompt badge. */
export function getUnresolvedConflicts() {
  return read().filter(c => !c.acknowledged);
}

/** Dismiss a conflict (operator reviewed it, keeping the winning version). */
export function acknowledgeConflict(ts) {
  write(read().map(c => (c.ts === ts ? { ...c, acknowledged: true } : c)));
  notify();
}

/**
 * Return the stashed losing version for a conflict so the caller can re-save
 * it (which will then win, since the re-save stamps a fresh updated_at). Also
 * marks the conflict acknowledged. Returns null if not found.
 */
export function takeConflictForRestore(ts) {
  const row = read().find(c => c.ts === ts);
  if (!row) return null;
  acknowledgeConflict(ts);
  return { table: row.table, id: row.id, version: row.localVersion };
}

/**
 * Subscribe to conflict changes. Fires with the current unresolved list.
 * Returns an unsubscribe function.
 * @param {(open: any[]) => void} fn
 */
export function onConflict(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
