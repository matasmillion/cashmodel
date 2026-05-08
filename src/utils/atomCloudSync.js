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
const MAX_LOG = 80;

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

// Robust single-row upsert. Returns { ok, error, retried, skipped }.
// `row` must be a fully-projected payload — column allowlisting happens
// in the caller (each atom store has its own toXCloudRow filter).
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

  let payload = { ...row, organization_id: orgId, user_id: row?.user_id || userId };
  const upsertOpts = opts.onConflict ? { onConflict: opts.onConflict } : undefined;

  const first = await db.from(table).upsert(payload, upsertOpts);
  if (!first.error) {
    recordSyncEvent({ table, op: 'upsert', id: row?.id, ok: true });
    return { ok: true };
  }

  // RLS rejection — refresh the JWT (so a token minted before the
  // active org was set gets replaced) and retry once with the fresh
  // org_id.
  if (isRlsError(first.error)) {
    db = await refreshAuthedSupabase();
    const fresh = await getJwtOrgId({ skipCache: true });
    if (fresh) payload = { ...payload, organization_id: fresh };
    const second = await db.from(table).upsert(payload, upsertOpts);
    if (!second.error) {
      recordSyncEvent({ table, op: 'upsert', id: row?.id, ok: true, retried: true });
      return { ok: true, retried: true };
    }
    recordSyncEvent({
      table, op: 'upsert', id: row?.id, ok: false, retried: true,
      error: second.error.message, code: second.error.code,
    });
    return { ok: false, retried: true, error: second.error };
  }

  recordSyncEvent({
    table, op: 'upsert', id: row?.id, ok: false,
    error: first.error.message, code: first.error.code, details: first.error.details,
  });
  return { ok: false, error: first.error };
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
