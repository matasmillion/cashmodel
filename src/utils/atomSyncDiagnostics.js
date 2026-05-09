// Diagnostic surface for the four PLM atom stores (fabrics, treatments,
// patterns, embellishments). Plus the two libraries that already sync
// (vendors, colors) for comparison — if those numbers match across
// devices but atoms don't, the user can prove the difference is in the
// atom code path, not the auth/RLS plumbing.
//
// Surface design goal: the user has no Chrome DevTools / console
// access, so every signal we have to communicate "what's wrong with
// sync?" must come through visible UI. This module collects the data
// the SyncDiagnosticsPanel needs, and exposes one button hook
// (forceResyncAllAtoms) the user can press to retry every local-only
// row through the robust upsert path.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getCurrentUserIdSync, getClerkToken, getJwtOrgId } from '../lib/auth';
import {
  getReconciledOrgId,
  robustUpsertAtomBatch,
  getSyncLog,
  getLastSyncErrorByTable,
  resetEnsureOrgCache,
} from './atomCloudSync';

// One entry per atom-style table we want to inspect. The first four
// drive the fix; vendors + colors are pulled in as a control so the
// user can see at-a-glance whether their cloud reads are working at
// all.
const ATOM_TABLES = [
  { table: 'fabrics',        lsKey: 'cashmodel_fabrics',        label: 'Fabrics',        kind: 'atom' },
  { table: 'treatments',     lsKey: 'cashmodel_treatments',     label: 'Treatments',     kind: 'atom' },
  { table: 'cut_sew',        lsKey: 'cashmodel_cut_sew',        label: 'Cut & Sew',      kind: 'atom' },
  { table: 'embellishments', lsKey: 'cashmodel_embellishments', label: 'Embellishments', kind: 'atom' },
  { table: 'vendors',        lsKey: 'cashmodel_vendors',        label: 'Vendors',        kind: 'control', shape: 'object' },
  { table: 'colors',         lsKey: 'cashmodel_fr_colors',      label: 'Colors',         kind: 'control', shape: 'object' },
];

// Decode a JWT body (base64url JSON middle segment). Used for the
// "client says X, JWT says Y" comparison in the diagnostic panel.
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function readLocalRows({ table, lsKey, shape }) {
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Atoms are stored as an array of rows keyed by id.
      return parsed.filter(r => r && r.id).map(r => ({ id: r.id, name: r.name || r.code || r.id }));
    }
    if (parsed && typeof parsed === 'object' && shape === 'object') {
      // Vendor + color libraries are stored as a name-keyed map.
      return Object.keys(parsed).map(name => ({ id: name, name }));
    }
    return [];
  } catch (err) {
    console.error(`atomSyncDiagnostics readLocal ${table}:`, err);
    return [];
  }
}

async function readCloudRows(db, { table, kind, shape }) {
  const orgId = getCurrentOrgIdSync();
  if (!db || !orgId) return { ok: false, rows: [], error: 'No client / org' };
  // Atoms key by id; control tables (vendors, colors) key by name.
  const idCol = (shape === 'object') ? 'name' : 'id';
  const nameCol = (kind === 'atom') ? 'name' : 'name';
  const cols = idCol === nameCol ? idCol : `${idCol}, ${nameCol}`;
  const { data, error } = await db
    .from(table)
    .select(cols)
    .eq('organization_id', orgId);
  if (error) return { ok: false, rows: [], error: error.message, code: error.code };
  return {
    ok: true,
    rows: (data || []).map(r => ({ id: r[idCol], name: r[nameCol] || r[idCol] })),
  };
}

// Returns one diagnostic row per inspected table:
//   { table, label, kind, localCount, cloudCount, localOnly, cloudOnly, cloudError }
async function buildTableDiff(db) {
  const out = [];
  for (const t of ATOM_TABLES) {
    const local = readLocalRows(t);
    const cloudResult = await readCloudRows(db, t);
    const cloudIds = new Set(cloudResult.rows.map(r => r.id));
    const localIds = new Set(local.map(r => r.id));
    const localOnly = local.filter(r => !cloudIds.has(r.id));
    const cloudOnly = cloudResult.rows.filter(r => !localIds.has(r.id));
    out.push({
      table: t.table,
      label: t.label,
      kind: t.kind,
      localCount: local.length,
      cloudCount: cloudResult.rows.length,
      localOnly: localOnly.slice(0, 10),
      cloudOnly: cloudOnly.slice(0, 10),
      localOnlyExtra: Math.max(0, localOnly.length - 10),
      cloudOnlyExtra: Math.max(0, cloudOnly.length - 10),
      cloudError: cloudResult.ok ? null : (cloudResult.error || 'unknown'),
      cloudErrorCode: cloudResult.code || null,
      synced: cloudResult.ok && localOnly.length === 0 && cloudOnly.length === 0,
    });
  }
  return out;
}

// Server-side probe — calls the jwt_org_id() Postgres function via RPC
// to verify Postgres can actually read the JWT we sent. This is the one
// check that catches the "client JWT looks fine but server can't decode
// it" failure mode (e.g. JWT signing key mismatch between Clerk and
// Supabase) — the most common silent killer of cross-device sync.
async function probeServerJwtOrgId(db) {
  if (!db) return { ok: false, error: 'No client' };
  try {
    const { data, error } = await db.rpc('jwt_org_id');
    if (error) return { ok: false, error: error.message, code: error.code };
    return { ok: true, value: data ?? null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// One-call entrypoint the panel uses. Returns everything the UI needs.
export async function getSyncDiagnosticsReport() {
  const userId = getCurrentUserIdSync();
  const clientOrgId = getCurrentOrgIdSync();
  let token = null;
  try { token = await getClerkToken('supabase'); } catch (_) { /* swallow */ }
  const jwtOrgId = await getJwtOrgId();
  const jwtPayload = decodeJwtPayload(token);

  const identity = {
    supabaseEnabled: IS_SUPABASE_ENABLED,
    userId,
    clientOrgId,
    jwtOrgId,
    jwtSub: jwtPayload?.sub || null,
    jwtExp: jwtPayload?.exp || null,
    tokenPresent: !!token,
  };

  const issues = [];
  if (!IS_SUPABASE_ENABLED) issues.push({ severity: 'fatal', message: 'Supabase is not enabled in this build (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).' });
  if (!userId) issues.push({ severity: 'fatal', message: 'No Clerk user is signed in.' });
  if (!clientOrgId) issues.push({ severity: 'fatal', message: 'No active Clerk organization. Open the org switcher and pick one.' });
  if (!token) issues.push({ severity: 'fatal', message: 'Clerk did not produce a Supabase JWT — open the Clerk dashboard JWT template named "supabase".' });
  if (token && !jwtOrgId) issues.push({ severity: 'fatal', message: 'JWT is missing the org_id claim. Add { "org_id": "{{org.id}}" } to the Clerk Supabase JWT template.' });
  if (token && jwtOrgId && clientOrgId && jwtOrgId !== clientOrgId) {
    issues.push({ severity: 'warn', message: `JWT carries org "${jwtOrgId}" but the active client org is "${clientOrgId}". Sign out + back in.` });
  }

  let serverJwt = { ok: false, error: 'unknown' };
  let tableDiff = [];
  let db = null;
  if (IS_SUPABASE_ENABLED) {
    try {
      db = await getAuthedSupabase();
      serverJwt = await probeServerJwtOrgId(db);
      if (serverJwt.ok && jwtOrgId && serverJwt.value !== jwtOrgId) {
        issues.push({
          severity: 'fatal',
          message: `Postgres jwt_org_id() returns "${serverJwt.value || '(null)'}" but the JWT bytes carry "${jwtOrgId}". The Clerk template's signing key probably doesn't match Supabase's JWT secret. Set Clerk → JWT Templates → "supabase" → Signing key to your Supabase project's JWT secret.`,
        });
      }
      if (db) tableDiff = await buildTableDiff(db);
    } catch (err) {
      issues.push({ severity: 'warn', message: `Could not run cloud diff: ${err?.message || err}` });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    identity,
    serverJwt,
    issues,
    tables: tableDiff,
    log: getSyncLog().slice(0, 30),
    lastErrorByTable: getLastSyncErrorByTable(),
  };
}

// "Force resync now" button. Walks each atom table, finds local-only
// rows, runs them through the robust upsert path. Returns per-table
// counters the panel surfaces. Resets the per-session ensure_org cache
// first so the RPC is exercised again — proves the auth path is intact.
export async function forceResyncAllAtoms() {
  resetEnsureOrgCache();
  const results = [];
  if (!IS_SUPABASE_ENABLED) return results;
  const db = await getAuthedSupabase();
  if (!db) return results;
  const orgId = await getReconciledOrgId();
  if (!orgId) return results;

  // Only the four atoms — vendors / colors have their own paths and
  // are excluded so the diagnostic shows per-fix data only.
  const atomTables = [
    { table: 'fabrics',        lsKey: 'cashmodel_fabrics',        toRow: r => r },
    { table: 'treatments',     lsKey: 'cashmodel_treatments',     toRow: r => r },
    { table: 'cut_sew',        lsKey: 'cashmodel_cut_sew',        toRow: r => r },
    { table: 'embellishments', lsKey: 'cashmodel_embellishments', toRow: r => r },
  ];

  for (const t of atomTables) {
    let local = [];
    try {
      const raw = localStorage.getItem(t.lsKey);
      local = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(local)) local = [];
    } catch { local = []; }

    if (local.length === 0) {
      results.push({ table: t.table, attempted: 0, succeeded: 0, failed: 0, errors: [] });
      continue;
    }

    // Project to cloud-shape via each store's own toXCloudRow filter.
    // Lazy import keeps this util dependency-light for the UI.
    let projected = local;
    try {
      if (t.table === 'fabrics') {
        const mod = await import('./fabricStore');
        if (mod.toFabricCloudRow) projected = local.map(mod.toFabricCloudRow);
      } else if (t.table === 'treatments') {
        const mod = await import('./treatmentStore');
        if (mod.toTreatmentCloudRow) projected = local.map(mod.toTreatmentCloudRow);
      } else if (t.table === 'cut_sew') {
        const mod = await import('./cutSewStore');
        if (mod.toCutSewCloudRow) projected = local.map(mod.toCutSewCloudRow);
      } else if (t.table === 'embellishments') {
        const mod = await import('./embellishmentStore');
        if (mod.toEmbellishmentCloudRow) projected = local.map(mod.toEmbellishmentCloudRow);
      }
    } catch (err) {
      // Project module failed; fall back to raw rows (atomCloudSync
      // will surface a clear error per row if columns are wrong).
      console.error('forceResyncAllAtoms project:', err);
    }

    const summary = await robustUpsertAtomBatch(t.table, projected);
    results.push({
      table: t.table,
      attempted: projected.length,
      succeeded: summary.succeeded,
      failed: summary.failed,
      errors: summary.errors.slice(0, 5),
    });
  }
  return results;
}
