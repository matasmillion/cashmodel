// Shared cloud-sync helper for the four PLM atom stores (fabrics,
// treatments, patterns, embellishments).
//
// Why this exists: the atom stores were doing fire-and-forget upserts
// like
//
//   const orgId = getCurrentOrgIdSync();
//   await db.from('fabrics').upsert({ organization_id: orgId, ... });
//
// which silently fails when the Clerk JWT cached by Supabase carries a
// stale org_id (most commonly: the token was minted before the active
// org was set, or right after an org switch). Postgres evaluates RLS on
// the cached token, jwt_org_id() returns null or the previous org, the
// WITH CHECK fails, the row never reaches the cloud — and the user
// sees their fabric on one laptop only.
//
// techPackStore / componentPackStore solved this with a four-part fix:
//   1. derive the body's organization_id from the JWT itself (not the
//      client-side org context, which can drift)
//   2. force-refresh the JWT when the body and JWT disagree
//   3. ensure_org_exists() RPC before the first write of a fresh org
//   4. one RLS retry with a fully-refreshed JWT before giving up
//
// This module captures that pattern in one place so the four atom
// stores can call it instead of re-implementing the same dance four
// times. Errors are also written to a small in-memory ring buffer so
// the in-app SyncDiagnosticsPanel can surface them — the user has no
// console / DevTools access on the deployed site.

import { IS_SUPABASE_ENABLED, getAuthedSupabase, refreshAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getCurrentUserIdSync, getJwtOrgId } from '../lib/auth';
import { enqueue, registerFlusher } from './syncQueue';
import { recordConflict } from './conflictBackup';

const RLS_CODE = '42501';
const SCHEMA_CACHE_CODE = 'PGRST204';
const MAX_LOG = 80;
const MAX_SCHEMA_DROPS = 6;
const PROTECTED_COLUMNS = new Set(['id', 'organization_id', 'user_id', 'code', 'name', 'updated_at', 'created_at']);

const _syncLog = [];
const _lastErrorByTable = new Map();
let _ensuredOrgs = new Set();

// localStorage keys for the record-based stores, so the conflict path can
// converge a device's local mirror to the cloud winner. Keyed by DB table.
const LOCAL_KEY_BY_TABLE = {
  fabrics: 'cashmodel_fabrics',
  treatments: 'cashmodel_treatments',
  cut_sew: 'cashmodel_cut_sew',
  embellishments: 'cashmodel_embellishments',
  patterns: 'cashmodel_patterns',
  tech_packs: 'cashmodel_techpacks',
  component_packs: 'cashmodel_component_packs',
};

function readLocalArray(lsKey) {
  try { return JSON.parse(localStorage.getItem(lsKey) || '[]'); }
  catch { return []; }
}

function writeLocalArray(lsKey, rows) {
  try { localStorage.setItem(lsKey, JSON.stringify(rows)); }
  catch (err) { console.error('cloudSync local mirror write:', err); }
}

// On a lost conflict, overwrite the local copy of {id} with the cloud winner
// so the device immediately reflects the version that won.
function applyCloudWinnerToLocal(table, cloudRow) {
  const lsKey = LOCAL_KEY_BY_TABLE[table];
  if (!lsKey || !cloudRow || !cloudRow.id) return;
  const rows = readLocalArray(lsKey);
  const idx = rows.findIndex(r => r && r.id === cloudRow.id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...cloudRow };
  else rows.push(cloudRow);
  writeLocalArray(lsKey, rows);
}

// Transient = worth retrying later from the outbox (offline, blip, timeout,
// rate-limit, 5xx). Anything else (RLS, bad column) won't fix itself by
// waiting, so it shouldn't sit in the queue forever.
export function isTransientNetworkError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return /networkerror|failed to fetch|fetch failed|timeout|aborted|temporarily|rate limit|429|503|502|504|connection|offline/i.test(msg);
}

// Merge cloud + local rows keeping the NEWEST updated_at per id. This is the
// read-side half of last-write-wins: a record edited offline (newer local
// updated_at) shows the local edit until it syncs; a record edited on the
// other laptop (newer cloud updated_at) shows the cloud version. Replaces the
// old "cloud always wins" union so unsynced local edits never vanish from a
// list, and stale local copies never mask a newer cloud edit.
export function mergeByIdNewest(cloudRows, localRows) {
  const map = new Map();
  for (const r of cloudRows || []) {
    if (r && r.id) map.set(r.id, r);
  }
  for (const r of localRows || []) {
    if (!r || !r.id) continue;
    const existing = map.get(r.id);
    if (!existing) { map.set(r.id, r); continue; }
    if ((r.updated_at || '') > (existing.updated_at || '')) map.set(r.id, r);
  }
  return [...map.values()];
}

// Two computers editing the library offline at the same time can both mint the
// same display code (e.g. TR-WSH-004) because each only sees its own local
// sequence. Codes aren't primary keys, so this is cosmetic — but the operator
// asked for it cleaned up. findDuplicateCodeRows returns the rows that should
// be re-coded: for each duplicated code we keep the earliest-created row and
// flag the rest.
export function findDuplicateCodeRows(rows) {
  const byCode = new Map();
  for (const r of rows || []) {
    if (!r || !r.code) continue;
    const group = byCode.get(r.code) || [];
    group.push(r);
    byCode.set(r.code, group);
  }
  const dupes = [];
  for (const group of byCode.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    dupes.push(...sorted.slice(1));
  }
  return dupes;
}

// Reissue colliding codes once. `nextCode(discriminator, rows)` mints a fresh
// non-colliding code (each atom store's own nextCodeFor); `save(id, patch)`
// persists it (which also re-syncs through the LWW writer). Returns the row
// list with the new codes applied so the caller can render the reconciled set
// immediately. No-op (and zero writes) when there are no duplicates.
export async function dedupeCodesOnce(rows, { discriminatorField, nextCode, save }) {
  const dupes = findDuplicateCodeRows(rows);
  if (!dupes.length) return rows;
  let working = [...rows];
  for (const d of dupes) {
    try {
      const fresh = nextCode(d[discriminatorField], working);
      if (!fresh || fresh === d.code) continue;
      await save(d.id, { code: fresh });
      working = working.map(r => (r.id === d.id ? { ...r, code: fresh } : r));
      recordSyncEvent({ table: 'dedupe', op: 'recode', id: d.id, ok: true, from: d.code, to: fresh });
    } catch (err) {
      console.error('dedupeCodesOnce:', err);
    }
  }
  return working;
}

export function recordSyncEvent(evt) {
  const entry = { ts: Date.now(), ...evt };
  _syncLog.push(entry);
  while (_syncLog.length > MAX_LOG) _syncLog.shift();
  if (!evt.ok && evt.table) _lastErrorByTable.set(evt.table, entry);
}

export function getSyncLog() {
  return [..._syncLog].reverse();
}

export function getLastSyncErrorByTable() {
  return Object.fromEntries(_lastErrorByTable.entries());
}

export function clearSyncLog() {
  _syncLog.length = 0;
  _lastErrorByTable.clear();
}

export function isRlsError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === RLS_CODE || /row-level security|row level security/.test(msg);
}

// PostgREST schema cache miss — Postgres has the column but the API's
// cached schema doesn't. Most commonly happens when a new column was
// added by migration and PostgREST didn't reload (Supabase autoreloads,
// but with a delay). Detected via the PGRST204 code or a textual
// "Could not find the 'X' column" / "schema cache" message.
export function isSchemaCacheError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  if (code === SCHEMA_CACHE_CODE) return true;
  const msg = String(err.message || '') + ' ' + String(err.details || '');
  return /Could not find the '[^']+' column/i.test(msg)
    || /column .* (?:does not exist|of relation)/i.test(msg)
    || /schema cache/i.test(msg);
}

// Pull the offending column name out of the Postgres / PostgREST error
// so the caller can drop it from the payload and retry. Returns null
// when no column name can be parsed (e.g. unrelated error).
export function extractMissingColumn(err) {
  if (!err) return null;
  const msg = String(err.message || '') + ' ' + String(err.details || '');
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "?([\w.]+)"? of relation/i,
    /column "?([\w.]+)"? does not exist/i,
    /the '([^']+)' column .* schema cache/i,
  ];
  for (const pat of patterns) {
    const m = pat.exec(msg);
    if (m && m[1]) {
      // Strip table qualifier if present (e.g. "fabrics.moq_meters" → "moq_meters").
      return m[1].split('.').pop();
    }
  }
  return null;
}

// Resolve the org_id we should put in the request body. The JWT's claim
// is authoritative because Postgres only sees the JWT — putting the
// client-side getCurrentOrgIdSync() value in the body is a recipe for
// silent RLS failures when they disagree. If the cached token is stale
// (no org_id, or different from the active client org), force a fresh
// fetch.
export async function getReconciledOrgId() {
  const clientOrgId = getCurrentOrgIdSync();
  let jwtOrgId = await getJwtOrgId();
  if (!jwtOrgId || (clientOrgId && jwtOrgId !== clientOrgId)) {
    jwtOrgId = await getJwtOrgId({ skipCache: true });
  }
  return jwtOrgId || null;
}

// ensure_org_exists is a SECURITY DEFINER RPC defined in
// supabase/migrations/20260503000000_ensure_org_rpc.sql. It upserts the
// row in public.organizations so PLM rows that FK-reference it succeed
// on the first save of a fresh org. Idempotent — safe to call on every
// write but we cache per session so we only hit it once per org.
export async function ensureOrgExists(db, orgId) {
  if (!db || !orgId) return;
  if (_ensuredOrgs.has(orgId)) return;
  try {
    await db.rpc('ensure_org_exists', { p_org_id: orgId, p_org_name: '' });
    _ensuredOrgs.add(orgId);
  } catch (_) {
    // Best-effort. If the RPC isn't deployed we just proceed and let
    // the upsert surface whatever error Postgres returns.
  }
}

// Run an upsert and, on a PostgREST schema-cache miss (PGRST204 / "column
// not found"), drop the offending column and retry. Loops until either
// the upsert succeeds, a non-schema error is returned, or we hit
// MAX_SCHEMA_DROPS — one column dropped per iteration. Protected columns
// (id / org / user / code / name / timestamps) are never dropped because
// without them the row can't be addressed.
//
// The set of columns we ended up dropping is returned so the caller can
// surface it in the diagnostic ring buffer — that's how the user sees
// "the schema cache was stale, we worked around it by dropping
// moq_meters" without ever opening DevTools.
async function tryUpsertWithSchemaRecovery(db, table, payload, upsertOpts) {
  let working = payload;
  const dropped = [];
  for (let i = 0; i <= MAX_SCHEMA_DROPS; i++) {
    const { error } = await db.from(table).upsert(working, upsertOpts);
    if (!error) return { ok: true, payload: working, dropped };
    if (!isSchemaCacheError(error)) return { ok: false, error, payload: working, dropped };
    const col = extractMissingColumn(error);
    if (!col || !(col in working) || PROTECTED_COLUMNS.has(col)) {
      // Couldn't pinpoint the column, or it's something we refuse to
      // drop. Bail with the original error so the caller surfaces it.
      return { ok: false, error, payload: working, dropped };
    }
    const next = { ...working };
    delete next[col];
    working = next;
    dropped.push(col);
  }
  return {
    ok: false,
    error: new Error(`Hit MAX_SCHEMA_DROPS (${MAX_SCHEMA_DROPS}) — schema cache severely stale on ${table}. Run NOTIFY pgrst, 'reload schema'; in Supabase SQL Editor.`),
    payload: working,
    dropped,
  };
}

// Robust single-row upsert. Returns { ok, error, retried, skipped, droppedColumns }.
// `row` must be a fully-projected payload — column allowlisting happens
// in the caller (each atom store has its own toXCloudRow filter).
//
// Failure modes handled:
//   1. JWT missing org_id claim → returns a structured NO_JWT_ORG_ID error
//   2. PGRST204 / column-not-found → drops unknown column and retries
//   3. RLS rejection (42501) → refreshes JWT, re-derives org_id, retries
//      once. Schema-cache recovery runs on both attempts.
export async function robustUpsertAtom(table, row, opts = {}) {
  if (!IS_SUPABASE_ENABLED) {
    return { ok: false, skipped: 'supabase-disabled' };
  }
  const onConflict = opts.onConflict || 'id';
  const result = await executeCloudWrite({
    table, id: row?.id, op: 'upsert', payload: row, onConflict, updated_at: row?.updated_at,
  });

  if (result.ok) {
    recordSyncEvent({
      table, op: 'upsert', id: row?.id, ok: true, retried: result.retried,
      droppedColumns: result.droppedColumns?.length ? result.droppedColumns : undefined,
    });
    return { ok: true, retried: result.retried, droppedColumns: result.droppedColumns };
  }

  // Cloud held a NEWER version — last-write-wins resolved it without us. The
  // losing copy was stashed (conflictBackup) and local converged to the
  // winner; from the caller's POV this is a success, not a dropped edit.
  if (result.conflict) {
    recordSyncEvent({ table, op: 'upsert', id: row?.id, ok: true, conflict: true });
    return { ok: true, conflict: true };
  }

  // Couldn't reach the cloud (offline / blip / JWT not ready) — park the edit
  // in the durable outbox so it syncs when connectivity returns. The edit is
  // already safe in localStorage; this just guarantees it reaches the cloud.
  if (result.retryable) {
    enqueue({ table, id: row?.id, op: 'upsert', payload: row, onConflict, updated_at: row?.updated_at });
  }
  recordSyncEvent({
    table, op: 'upsert', id: row?.id, ok: false, queued: !!result.retryable,
    error: result.error?.message, code: result.error?.code,
    droppedColumns: result.droppedColumns?.length ? result.droppedColumns : undefined,
  });
  return { ok: false, error: result.error, queued: !!result.retryable, droppedColumns: result.droppedColumns };
}

// The canonical cloud writer used by BOTH the immediate save path
// (robustUpsertAtom) and the outbox flush (registered below). Returns a
// normalized { ok, retryable, conflict, retried, droppedColumns, error }.
//
//   • Last-write-wins guard: for id-keyed records, if the cloud copy carries
//     a newer updated_at than ours, we stand down — stash our version as a
//     recoverable backup, converge local to the cloud winner, return
//     { conflict: true }. This is what stops a stale offline edit from
//     clobbering a newer edit made on another computer.
//   • retryable distinguishes "try again later from the queue" (offline,
//     timeout, 5xx, JWT-not-ready) from "won't fix itself" (RLS, bad column).
export async function executeCloudWrite(entry) {
  if (!IS_SUPABASE_ENABLED) return { ok: false, retryable: true, skipped: 'supabase-disabled' };

  const orgId = await getReconciledOrgId();
  if (!orgId) {
    const error = Object.assign(new Error('JWT is missing the org_id claim — retry when signed-in/online.'), { code: 'NO_JWT_ORG_ID' });
    return { ok: false, retryable: true, error };
  }
  let db = await getAuthedSupabase();
  if (!db) return { ok: false, retryable: true, error: new Error('Supabase client not available.') };
  await ensureOrgExists(db, orgId);

  // Hard delete (purge) — rare; soft-delete/archive flows through upsert.
  if (entry.op === 'delete') {
    const { error } = await db.from(entry.table).delete().eq('id', entry.id).eq('organization_id', orgId);
    if (!error) return { ok: true };
    if (isTransientNetworkError(error)) return { ok: false, retryable: true, error };
    if (isRlsError(error)) {
      db = await refreshAuthedSupabase();
      const r2 = await db.from(entry.table).delete().eq('id', entry.id).eq('organization_id', orgId);
      if (!r2.error) return { ok: true };
      return { ok: false, retryable: isTransientNetworkError(r2.error), error: r2.error };
    }
    return { ok: false, retryable: false, error };
  }

  const onConflict = entry.onConflict || 'id';
  const userId = getCurrentUserIdSync();
  const payload = { ...entry.payload, organization_id: orgId, user_id: entry.payload?.user_id || userId };

  // Last-write-wins guard (id-keyed records that carry a timestamp).
  if (onConflict === 'id' && entry.updated_at) {
    const sel = await db.from(entry.table).select('*').eq('id', entry.id).eq('organization_id', orgId).maybeSingle();
    if (sel.error && isTransientNetworkError(sel.error)) return { ok: false, retryable: true, error: sel.error };
    const cloudRow = sel.data;
    if (cloudRow && (cloudRow.updated_at || '') > (entry.updated_at || '')) {
      recordConflict({ table: entry.table, id: entry.id, localVersion: entry.payload, cloudVersion: cloudRow });
      applyCloudWinnerToLocal(entry.table, cloudRow);
      return { ok: false, conflict: true };
    }
  }

  const upsertOpts = { onConflict };
  let result = await tryUpsertWithSchemaRecovery(db, entry.table, payload, upsertOpts);
  if (result.ok) return { ok: true, droppedColumns: result.dropped };

  // RLS rejection — refresh the JWT and retry once with the re-derived org_id.
  if (isRlsError(result.error)) {
    db = await refreshAuthedSupabase();
    const fresh = await getJwtOrgId({ skipCache: true });
    const retryPayload = fresh ? { ...result.payload, organization_id: fresh } : result.payload;
    result = await tryUpsertWithSchemaRecovery(db, entry.table, retryPayload, upsertOpts);
    if (result.ok) return { ok: true, retried: true, droppedColumns: result.dropped };
    return { ok: false, retryable: isTransientNetworkError(result.error), error: result.error, droppedColumns: result.dropped };
  }

  if (isTransientNetworkError(result.error)) return { ok: false, retryable: true, error: result.error, droppedColumns: result.dropped };
  return { ok: false, retryable: false, error: result.error, droppedColumns: result.dropped };
}

// Batch wrapper — iterates per-row so a single bad row doesn't poison
// the whole heal pass. Returns aggregated counters.
export async function robustUpsertAtomBatch(table, rows, opts = {}) {
  let succeeded = 0;
  let failed = 0;
  const errors = [];
  for (const row of rows) {
    const result = await robustUpsertAtom(table, row, opts);
    if (result.ok) succeeded += 1;
    else { failed += 1; if (result.error) errors.push({ id: row?.id, message: result.error.message }); }
  }
  return { succeeded, failed, errors };
}

// Resets the per-session "we've called ensure_org_exists for this org"
// memo. Called from the Sync Diagnostics panel's "Force resync" button
// so the user can prove the RPC path runs cleanly.
export function resetEnsureOrgCache() {
  _ensuredOrgs = new Set();
}

// Wire the durable outbox: when a parked edit is retried, run it through the
// same canonical writer (LWW guard included) and log the outcome so the Sync
// Diagnostics panel reflects queue drains. Returning the normalized result
// lets syncQueue decide keep/drop.
registerFlusher(async (entry) => {
  const result = await executeCloudWrite(entry);
  if (result.ok) {
    recordSyncEvent({ table: entry.table, op: entry.op, id: entry.id, ok: true, fromQueue: true, retried: result.retried });
  } else if (result.conflict) {
    recordSyncEvent({ table: entry.table, op: entry.op, id: entry.id, ok: true, fromQueue: true, conflict: true });
  } else if (!result.retryable) {
    recordSyncEvent({ table: entry.table, op: entry.op, id: entry.id, ok: false, fromQueue: true, error: result.error?.message, code: result.error?.code });
  }
  return result;
});
