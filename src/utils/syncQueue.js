// Durable sync outbox — the "work offline, never lose an edit" engine.
//
// Every cloud write that can't reach Supabase right now (no wifi, network
// blip, JWT not loaded yet) is parked here in localStorage and retried when
// connectivity returns. Because it's localStorage-backed, a queued edit
// survives a page reload or browser restart — close the laptop offline,
// reopen it on wifi, and the edit syncs.
//
// Design points:
//   • Coalescing — repeated edits to the SAME {table,id} collapse to one
//     entry (the newest updated_at wins). 50 keystrokes offline = 1 push.
//   • Op precedence — a queued delete supersedes a queued upsert for the
//     same row, and vice-versa, based on which is newer.
//   • Registered flusher — the actual cloud write lives in cloudSync.js.
//     syncQueue calls a handler registered via registerFlusher() so there's
//     no circular import (stores → cloudSync → syncQueue → cloudSync).
//   • Backoff — a row that keeps failing isn't hammered; attempts grows and
//     the flush respects a per-entry cooldown.

import { isOnline, onConnectivityChange } from './connectivity';

const KEY = 'cashmodel_sync_queue';
const LAST_SYNC_KEY = 'cashmodel_sync_last_at';
const MAX_ATTEMPTS = 12;
const BACKOFF_MS = [0, 1000, 3000, 8000, 20000, 60000]; // capped at last value

let _flusher = null;       // async (entry) => { ok, retryable?, conflict? }
let _flushing = false;
let _flushTimer = null;
let _intervalTimer = null;

const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function write(rows) {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); }
  catch (err) { console.error('syncQueue write:', err); }
  notify();
}

function notify() {
  const n = queueLength();
  for (const fn of listeners) {
    try { fn(n); } catch (err) { console.error('syncQueue listener:', err); }
  }
}

/** Number of pending entries — drives the "N pending" status chip. */
export function queueLength() {
  return read().length;
}

/** ISO timestamp of the last successful cloud sync, or null. */
export function getLastSyncAt() {
  try { return localStorage.getItem(LAST_SYNC_KEY) || null; }
  catch { return null; }
}

function markSynced() {
  try { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); }
  catch (err) { console.error('syncQueue lastSync:', err); }
}

export function getQueue() {
  return read();
}

/**
 * Park a cloud mutation for later. Coalesces by {table,id}: if an entry for
 * the same row already exists, the one carrying the newer updated_at wins
 * (so older keystrokes never overwrite newer ones, even in the queue).
 *
 * @param {{ table: string, id: string, op?: 'upsert'|'delete', payload: any,
 *           onConflict?: string, updated_at?: string }} entry
 */
export function enqueue(entry) {
  if (!entry || !entry.table || !entry.id) return;
  const q = read();
  const next = {
    table: entry.table,
    id: entry.id,
    op: entry.op || 'upsert',
    payload: entry.payload,
    onConflict: entry.onConflict || 'id',
    updated_at: entry.updated_at || entry.payload?.updated_at || new Date().toISOString(),
    enqueued_at: Date.now(),
    attempts: 0,
    next_attempt_at: 0,
  };
  const idx = q.findIndex(e => e.table === next.table && e.id === next.id);
  if (idx >= 0) {
    // Keep whichever carries the newer updated_at.
    if ((next.updated_at || '') >= (q[idx].updated_at || '')) q[idx] = next;
  } else {
    q.push(next);
  }
  write(q);
  scheduleFlush(150);
}

/** cloudSync registers the function that actually performs a cloud write. */
export function registerFlusher(fn) {
  _flusher = fn;
}

function backoffFor(attempts) {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/**
 * Drain the queue. Each entry is handed to the registered flusher, which
 * returns { ok, retryable, conflict }:
 *   • ok            → remove from queue
 *   • conflict      → removed (the flusher already stashed a backup)
 *   • retryable     → keep, bump attempts, apply backoff
 *   • !retryable    → drop after MAX_ATTEMPTS to avoid a poison entry wedging
 *                     the whole queue forever (it's already safe in localStorage)
 */
export async function flush({ force = false } = {}) {
  if (_flushing) return;
  if (!_flusher) return;
  if (!force && !isOnline()) return;
  _flushing = true;
  try {
    let q = read();
    if (q.length === 0) {
      if (force) markSynced(); // always stamp the timestamp on an explicit "Sync now"
      return;
    }
    const now = Date.now();
    const remaining = [];
    let synced = 0;
    for (const entry of q) {
      if (!force && entry.next_attempt_at && entry.next_attempt_at > now) {
        remaining.push(entry);
        continue;
      }
      let result;
      try {
        result = await _flusher(entry);
      } catch (err) {
        result = { ok: false, retryable: true, error: err };
      }
      if (result && result.ok) { synced += 1; continue; }  // synced — drop
      if (result && result.conflict) { synced += 1; continue; } // resolved by LWW — drop
      const attempts = (entry.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        console.error('syncQueue: dropping entry after max attempts', entry.table, entry.id, result?.error);
        continue;
      }
      remaining.push({ ...entry, attempts, next_attempt_at: Date.now() + backoffFor(attempts) });
    }
    if (synced > 0) markSynced();
    write(remaining);
    // If anything is still waiting on a backoff window, come back for it.
    if (remaining.length > 0) scheduleFlush(Math.min(...remaining.map(e => Math.max(0, (e.next_attempt_at || 0) - Date.now())), 30000) || 30000);
  } finally {
    _flushing = false;
  }
}

function scheduleFlush(delay = 0) {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => { _flushTimer = null; flush(); }, delay);
}

/** Force a flush now (e.g. the "Sync now" button), ignoring backoff windows. */
export function syncNow() {
  return flush({ force: true });
}

let _started = false;

/**
 * Wire the queue's triggers: flush on reconnect, flush on a light interval
 * while online, and an initial flush at boot. Idempotent.
 */
export function startSyncQueue({ intervalMs = 45000 } = {}) {
  if (_started) return;
  _started = true;
  onConnectivityChange((online) => { if (online) flush(); });
  if (typeof window !== 'undefined') {
    if (_intervalTimer) clearInterval(_intervalTimer);
    _intervalTimer = setInterval(() => { if (isOnline()) flush(); }, intervalMs);
  }
  scheduleFlush(500);
}

/** Subscribe to queue-length changes — drives the status chip. */
export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
