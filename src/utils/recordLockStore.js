// Record-lock client — single-writer check-out. Mirrors the RPCs in
// supabase/migrations/20260603000000_record_locks.sql.
//
// Locking is a cloud coordination primitive: it only matters when more than one
// person is online. So when Supabase is unavailable (offline solo work), every
// call resolves to "acquired (offline)" — a lone editor is never blocked, and
// the hook re-acquires for real once connectivity / auth returns.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';

const OFFLINE = { ok: true, acquired: true, offline: true, holder: null };

/**
 * Try to take the lock on a record (or refresh it if already mine, or steal it
 * if the prior holder's heartbeat went stale).
 * @returns {Promise<{ ok:boolean, acquired:boolean, offline:boolean,
 *   holder:{userId:string,userName:string}|null, acquiredAt?:string, heartbeatAt?:string }>}
 */
export async function acquireLock(resourceType, resourceId, userId, userName) {
  if (!IS_SUPABASE_ENABLED || !resourceId || !userId) return OFFLINE;
  try {
    const db = await getAuthedSupabase();
    if (!db) return OFFLINE;
    const { data, error } = await db.rpc('acquire_record_lock', {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_user_id: userId,
      p_user_name: userName || '',
    });
    if (error) { console.error('acquireLock:', error); return { ...OFFLINE, ok: false }; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return OFFLINE;
    return {
      ok: true,
      acquired: !!row.acquired,
      offline: false,
      holder: row.acquired ? null : { userId: row.holder_user_id, userName: row.holder_user_name },
      acquiredAt: row.acquired_at,
      heartbeatAt: row.heartbeat_at,
    };
  } catch (err) {
    console.error('acquireLock:', err);
    return { ...OFFLINE, ok: false };
  }
}

/** Keep my lock alive. Returns false if I no longer hold it (expired + stolen). */
export async function heartbeatLock(resourceType, resourceId, userId) {
  if (!IS_SUPABASE_ENABLED || !resourceId || !userId) return false;
  try {
    const db = await getAuthedSupabase();
    if (!db) return false;
    const { data, error } = await db.rpc('heartbeat_record_lock', {
      p_resource_type: resourceType, p_resource_id: resourceId, p_user_id: userId,
    });
    return !error && !!data;
  } catch { return false; }
}

/** Release my lock on close / navigate-away. Best-effort. */
export async function releaseLock(resourceType, resourceId, userId) {
  if (!IS_SUPABASE_ENABLED || !resourceId || !userId) return false;
  try {
    const db = await getAuthedSupabase();
    if (!db) return false;
    const { error } = await db.rpc('release_record_lock', {
      p_resource_type: resourceType, p_resource_id: resourceId, p_user_id: userId,
    });
    return !error;
  } catch { return false; }
}
