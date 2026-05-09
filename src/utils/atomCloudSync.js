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

const RLS_CODE = '42501';
const SCHEMA_CACHE_CODE = 'PGRST204';
const MAX_LOG = 80;
const MAX_SCHEMA_DROPS = 6;
const PROTECTED_COLUMNS = new Set(['id', 'organization_id', 'user_id', 'code', 'name', 'updated_at', 'created_at']);

const _syncLog = [];
const _lastErrorByTable = new Map();
let _ensuredOrgs = new Set();

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
  const userId = getCurrentUserIdSync();
  const orgId = await getReconciledOrgId();
  if (!orgId) {
    const error = new Error('JWT is missing the org_id claim — open Sync Diagnostics to investigate.');
    error.code = 'NO_JWT_ORG_ID';
    recordSyncEvent({ table, op: 'upsert', id: row?.id, ok: false, error: error.message, code: error.code });
    return { ok: false, error };
  }

  let db = await getAuthedSupabase();
  if (!db) {
    const error = new Error('Supabase client not available.');
    recordSyncEvent({ table, op: 'upsert', id: row?.id, ok: false, error: error.message });
    return { ok: false, error };
  }

  await ensureOrgExists(db, orgId);

  const initialPayload = { ...row, organization_id: orgId, user_id: row?.user_id || userId };
  const upsertOpts = opts.onConflict ? { onConflict: opts.onConflict } : undefined;

  let result = await tryUpsertWithSchemaRecovery(db, table, initialPayload, upsertOpts);
  if (result.ok) {
    recordSyncEvent({
      table, op: 'upsert', id: row?.id, ok: true,
      droppedColumns: result.dropped.length ? result.dropped : undefined,
    });
    return { ok: true, droppedColumns: result.dropped };
  }

  // RLS rejection — refresh the JWT (so a token minted before the
  // active org was set gets replaced) and retry once with the fresh
  // org_id. Schema-cache recovery runs on the retry too.
  if (isRlsError(result.error)) {
    db = await refreshAuthedSupabase();
    const fresh = await getJwtOrgId({ skipCache: true });
    const retryPayload = fresh
      ? { ...result.payload, organization_id: fresh }
      : result.payload;
    result = await tryUpsertWithSchemaRecovery(db, table, retryPayload, upsertOpts);
    if (result.ok) {
      recordSyncEvent({
        table, op: 'upsert', id: row?.id, ok: true, retried: true,
        droppedColumns: result.dropped.length ? result.dropped : undefined,
      });
      return { ok: true, retried: true, droppedColumns: result.dropped };
    }
    recordSyncEvent({
      table, op: 'upsert', id: row?.id, ok: false, retried: true,
      error: result.error.message, code: result.error.code,
      droppedColumns: result.dropped.length ? result.dropped : undefined,
    });
    return { ok: false, retried: true, error: result.error, droppedColumns: result.dropped };
  }

  recordSyncEvent({
    table, op: 'upsert', id: row?.id, ok: false,
    error: result.error.message, code: result.error.code, details: result.error.details,
    droppedColumns: result.dropped.length ? result.dropped : undefined,
  });
  return { ok: false, error: result.error, droppedColumns: result.dropped };
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
