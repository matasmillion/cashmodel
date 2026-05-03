// StorageHealthPanel — Fort Knox-grade DAM diagnostic for the PLM file
// pipeline. Surfaces:
//
//   • Storage usage  — total files in plm-assets, total bytes, % of tier
//   • Ghost refs     — image entries in DB without a path or data URL
//                      (created by failed uploads before the
//                      persistableImages-filter fix landed). Locks slots
//                      into a blank state. Repair drops them.
//   • Orphan files   — files in Storage that no DB row references
//                      anymore. Storage cost only — safe to delete.
//   • Broken refs    — DB references to files that don't exist in
//                      Storage. Render as broken slots; user must
//                      re-upload (we can only flag them).
//
// All checks are read-only by default. Each repair is gated behind an
// explicit confirm and runs in a single batched pass per scope.
//
// Hidden behind the route #plm/storage-health (no nav button by
// default — link from PLMView's footer or call directly). Org-scoped
// via getCurrentOrgIdSync; cannot leak into another org.

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Database, HardDrive, RefreshCw, Trash2, Key, Zap } from 'lucide-react';
import { FR } from './techPackConstants';
import { getAuthedSupabase } from '../../lib/supabase';
import { getCurrentOrgIdSync, getCurrentUserIdSync, getClerkToken } from '../../lib/auth';
import { isGhostImage, persistableImages, deleteAssets } from '../../utils/plmAssets';

const BUCKET = 'plm-assets';

// Decode a JWT payload without verifying. We only ever use this to
// surface what claims the client is actually sending — never to
// authorize anything. The middle segment is base64url-encoded JSON.
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

// Tables that hold image refs we want to scan. Each entry maps the
// table name to the columns it uses for image refs.
//   imagesCol:  JSONB array of { slot, path?, data? }
//   coverCol:   text (path or data URL) — single cover image
const SCAN_TABLES = [
  { table: 'tech_packs',       imagesCol: 'images', coverCol: 'cover_image' },
  { table: 'component_packs',  imagesCol: 'images', coverCol: 'cover_image' },
  { table: 'fabrics',          imagesCol: null,     coverCol: 'cover_image' },
  { table: 'patterns',         imagesCol: null,     coverCol: 'cover_image' },
  { table: 'treatments',       imagesCol: null,     coverCol: 'cover_image' },
  { table: 'embellishments',   imagesCol: null,     coverCol: 'cover_image' },
  { table: 'colors',           imagesCol: null,     coverCol: 'card_image' },
  { table: 'vendors',          imagesCol: null,     coverCol: 'logo_image' },
];

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Recursively list every file under {orgId}/ in plm-assets. Supabase's
// list endpoint returns one folder level at a time + max 1000 entries
// per page, so we DFS the tree and accumulate.
async function listAllStorageFiles(orgId, onProgress) {
  const supabase = await getAuthedSupabase();
  if (!supabase) throw new Error('Supabase client not configured');
  const out = [];
  const stack = [orgId];
  while (stack.length) {
    const dir = stack.pop();
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(dir, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const entry of data) {
        if (entry.id === null && entry.name) {
          // folder — Supabase distinguishes files by having metadata.size
          stack.push(`${dir}/${entry.name}`);
        } else if (entry.metadata && typeof entry.metadata.size === 'number') {
          out.push({
            path: `${dir}/${entry.name}`,
            size: entry.metadata.size,
            contentType: entry.metadata.mimetype || null,
            updatedAt: entry.updated_at || null,
          });
        }
      }
      if (typeof onProgress === 'function') onProgress(out.length);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  return out;
}

// Pull rows that hold image refs across every scanned table. Rows that
// fail (table doesn't exist, RLS denies, etc.) silently contribute zero
// — the diagnostic is best-effort and reports what it found, not what
// it couldn't reach.
async function loadAllImageRefs(orgId, onProgress) {
  const supabase = await getAuthedSupabase();
  if (!supabase) throw new Error('Supabase client not configured');
  const refs = [];
  // For each table, try the full projection first. If the cover column
  // doesn't exist (some atom tables predate the cover_image column),
  // retry without it so the row still contributes its imagesCol or at
  // least confirms the row exists. This is what was producing
  // "[StorageHealth] skipped fabrics: column fabrics.cover_image does
  // not exist" — without the retry, every atom table was invisible to
  // the scan and recovery couldn't see those rows.
  for (const t of SCAN_TABLES) {
    if (typeof onProgress === 'function') onProgress(t.table);
    let effectiveCoverCol = t.coverCol;
    let attempt = 0;
    while (attempt < 2) {
      const cols = ['id'];
      if (t.imagesCol) cols.push(t.imagesCol);
      if (effectiveCoverCol) cols.push(effectiveCoverCol);
      const { data, error } = await supabase
        .from(t.table)
        .select(cols.join(','))
        .eq('organization_id', orgId);
      if (error) {
        const msg = String(error.message || '');
        if (effectiveCoverCol && /column.*does not exist/i.test(msg)) {
          // Drop the cover column and retry once.
          effectiveCoverCol = null;
          attempt += 1;
          continue;
        }
        console.warn(`[StorageHealth] skipped ${t.table}:`, msg);
        break;
      }
      for (const row of data || []) {
        refs.push({ table: t.table, row, imagesCol: t.imagesCol, coverCol: effectiveCoverCol });
      }
      break;
    }
  }
  return refs;
}

// Walk every row's image refs and bucket them into:
//   referencedPaths  — every Storage path referenced anywhere in DB
//   ghosts           — JSONB entries with no path and no data
//   legacyDataRefs   — JSONB / cover entries that are inline base64
//                      data URLs. Not broken, just inefficient.
function summarizeRefs(refs) {
  const referencedPaths = new Set();
  const ghosts = []; // { table, rowId, slot, name }
  let legacyDataCount = 0;
  for (const r of refs) {
    if (r.coverCol) {
      const v = r.row[r.coverCol];
      if (typeof v === 'string' && v.startsWith('data:')) {
        legacyDataCount += 1;
      } else if (typeof v === 'string' && v.length > 0) {
        referencedPaths.add(v);
      }
    }
    if (r.imagesCol) {
      const arr = Array.isArray(r.row[r.imagesCol]) ? r.row[r.imagesCol] : [];
      for (const img of arr) {
        if (!img || typeof img !== 'object') {
          ghosts.push({ table: r.table, rowId: r.row.id, slot: '?', name: '?' });
          continue;
        }
        if (typeof img.path === 'string' && img.path.length > 0) {
          referencedPaths.add(img.path);
        } else if (typeof img.data === 'string' && img.data.startsWith('data:')) {
          legacyDataCount += 1;
        } else {
          ghosts.push({
            table: r.table,
            rowId: r.row.id,
            slot: img.slot || '?',
            name: img.name || '?',
          });
        }
      }
    }
  }
  return { referencedPaths, ghosts, legacyDataCount };
}

// Repair: drop ghost entries from every row that has them. Runs in a
// single pass per row — one UPDATE per affected row — so the cost
// scales with actual damage, not total row count.
async function repairGhosts(refs) {
  const supabase = await getAuthedSupabase();
  if (!supabase) throw new Error('Supabase client not configured');
  let cleanedRows = 0;
  let droppedEntries = 0;
  for (const r of refs) {
    if (!r.imagesCol) continue;
    const arr = Array.isArray(r.row[r.imagesCol]) ? r.row[r.imagesCol] : [];
    if (!arr.length) continue;
    const cleaned = persistableImages(arr);
    if (cleaned.length === arr.length) continue;
    const dropped = arr.length - cleaned.length;
    const { error } = await supabase
      .from(r.table)
      .update({ [r.imagesCol]: cleaned })
      .eq('id', r.row.id);
    if (error) {
      console.warn(`[StorageHealth] repair failed for ${r.table}/${r.row.id}:`, error.message);
      continue;
    }
    cleanedRows += 1;
    droppedEntries += dropped;
  }
  return { cleanedRows, droppedEntries };
}

// Maps a Storage scope folder (the second path segment under the org
// prefix) to the table that owns that scope and how it stores image
// references. `imagesCol` rows store an array of { slot, path, … } in
// JSONB. `coverCol` rows store a single text path (the FR atom tables
// — fabrics, patterns, treatments, embellishments, colors, vendors).
const SCOPE_MAP = {
  'tech-packs':       { table: 'tech_packs',      imagesCol: 'images', coverCol: 'cover_image', lsKey: 'cashmodel_techpacks' },
  'component-packs':  { table: 'component_packs', imagesCol: 'images', coverCol: 'cover_image', lsKey: 'cashmodel_component_packs' },
  'fabrics':          { table: 'fabrics',         imagesCol: null,     coverCol: 'cover_image', lsKey: 'cashmodel_fabrics' },
  'patterns':         { table: 'patterns',        imagesCol: null,     coverCol: 'cover_image', lsKey: 'cashmodel_patterns' },
  'treatments':       { table: 'treatments',      imagesCol: null,     coverCol: 'cover_image', lsKey: 'cashmodel_treatments' },
  'embellishments':   { table: 'embellishments',  imagesCol: null,     coverCol: 'cover_image', lsKey: 'cashmodel_embellishments' },
  'colors':           { table: 'colors',          imagesCol: null,     coverCol: 'card_image',  lsKey: 'cashmodel_fr_colors' },
  'vendors':          { table: 'vendors',         imagesCol: null,     coverCol: 'logo_image',  lsKey: 'cashmodel_vendors' },
};

// Build a localStorage index by row id for the given scope. Used as
// the fallback when a cloud row lookup misses — the most common reason
// a recovery candidate isn't in cloud is that the original CREATE
// INSERT got rejected by RLS during the JWT-broken window, so the row
// only ever existed locally.
function readLocalIndex(lsKey) {
  if (!lsKey) return new Map();
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return new Map();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Map();
    const out = new Map();
    for (const row of arr) {
      if (row && row.id) out.set(row.id, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

// Strip transient / unsafe fields from a local row before upserting it
// to cloud. Local rows can carry stale auth context, deleted_at flags,
// computed projections, etc. — the upsert needs a clean payload that
// matches the cloud schema's expected columns.
function sanitizeForUpsert(localRow, orgId, userId) {
  if (!localRow || typeof localRow !== 'object') return null;
  // eslint-disable-next-line no-unused-vars
  const { user_id, organization_id, deleted_at, ...rest } = localRow;
  return {
    ...rest,
    organization_id: orgId,
    user_id: userId,
  };
}

// Parse a Storage path like
//   "{orgId}/{scope}/{ownerId}/{slot}-{uuid}.{ext}"
// back into its semantic parts so we can stitch an orphan file back
// into the row that originally owned it.
function parseAssetPath(path) {
  if (typeof path !== 'string') return null;
  const parts = path.split('/');
  if (parts.length < 4) return null;
  const [orgId, scope, ownerId, ...rest] = parts;
  const filename = rest.join('/');
  const m = /^(.+?)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]{8,})\.([a-z0-9]+)$/i.exec(filename);
  const slot = m ? m[1] : 'recovered';
  const ext = m ? m[3] : (filename.split('.').pop() || 'bin');
  const contentType = ext === 'webp' ? 'image/webp'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png'
    : ext === 'gif' ? 'image/gif'
    : ext === 'svg' ? 'image/svg+xml'
    : 'application/octet-stream';
  return { orgId, scope, ownerId, slot, filename, ext, contentType };
}

// Plan a recovery: group orphan files by (scope, ownerId), pick the
// latest file per slot to avoid stacking duplicates if a slot was
// re-uploaded multiple times before saves were working, then build a
// per-table patch list. Read-only — returns the plan; caller decides
// whether to commit it.
async function planOrphanRecovery(orphans) {
  const supabase = await getAuthedSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  const userId = getCurrentUserIdSync();
  if (!orgId) throw new Error('No organization context');

  // Group orphans by scope + ownerId
  const groups = new Map();
  for (const o of orphans) {
    const parsed = parseAssetPath(o.path);
    if (!parsed) continue;
    const config = SCOPE_MAP[parsed.scope];
    if (!config) continue;
    const key = `${parsed.scope}/${parsed.ownerId}`;
    if (!groups.has(key)) groups.set(key, { scope: parsed.scope, ownerId: parsed.ownerId, config, files: [] });
    groups.get(key).files.push({ ...o, ...parsed });
  }

  // Cache localStorage indexes so we read each LS_KEY at most once even
  // when many groups share the same scope.
  const localIndexes = new Map();
  const indexFor = (lsKey) => {
    if (!localIndexes.has(lsKey)) localIndexes.set(lsKey, readLocalIndex(lsKey));
    return localIndexes.get(lsKey);
  };

  // For each group, fetch the row and build a recovery plan. Rows that
  // are missing from cloud but present in local get upgraded to a
  // restoreFromLocal plan: upsert the local row + link the orphans in
  // a single write.
  const plans = [];
  let unmatched = 0;
  let restoredFromLocal = 0;
  for (const g of groups.values()) {
    let effectiveCoverCol = g.config.coverCol;
    let row = null;
    let error = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const cols = ['id'];
      if (g.config.imagesCol) cols.push(g.config.imagesCol);
      if (effectiveCoverCol) cols.push(effectiveCoverCol);
      const r = await supabase
        .from(g.config.table)
        .select(cols.join(','))
        .eq('id', g.ownerId)
        .maybeSingle();
      if (r.error && effectiveCoverCol && /column.*does not exist/i.test(r.error.message || '')) {
        effectiveCoverCol = null;
        continue;
      }
      row = r.data;
      error = r.error;
      break;
    }
    let restoreFromLocal = false;
    let workingRow = row;
    if (error || !row) {
      // Cloud miss. Look in localStorage — the row likely exists there
      // because its CREATE INSERT was rejected by RLS during the
      // JWT-broken window. We'll upsert it back to cloud as part of
      // the recovery patch.
      const localRow = indexFor(g.config.lsKey).get(g.ownerId);
      if (!localRow) {
        unmatched += g.files.length;
        continue;
      }
      restoreFromLocal = true;
      workingRow = localRow;
      restoredFromLocal += 1;
    }

    // Pick the freshest file per slot — handles cases where a slot
    // was uploaded multiple times before saves were working. Most
    // recent wins so the row reflects the user's latest intent.
    const bySlot = new Map();
    for (const f of g.files) {
      const prev = bySlot.get(f.slot);
      if (!prev || (f.updatedAt || '') > (prev.updatedAt || '')) {
        bySlot.set(f.slot, f);
      }
    }

    if (g.config.imagesCol) {
      const existing = Array.isArray(workingRow[g.config.imagesCol]) ? workingRow[g.config.imagesCol] : [];
      const existingPaths = new Set(existing.map(i => i?.path).filter(Boolean));
      const toAdd = [];
      for (const f of bySlot.values()) {
        if (existingPaths.has(f.path)) continue;
        toAdd.push({
          slot: f.slot,
          path: f.path,
          size: f.size,
          content_type: f.contentType,
          uploaded_at: f.updatedAt || new Date().toISOString(),
        });
      }
      if (toAdd.length === 0 && !restoreFromLocal) continue;
      const newImages = [...existing, ...toAdd];
      const coverSlot = g.scope === 'tech-packs' ? 'cover'
        : g.scope === 'component-packs' ? 'component-cover'
        : null;
      let coverPatch = null;
      if (effectiveCoverCol && !workingRow[effectiveCoverCol] && coverSlot) {
        const coverEntry = newImages.find(i => i?.slot === coverSlot && i?.path);
        if (coverEntry) coverPatch = coverEntry.path;
      }
      const patch = restoreFromLocal
        ? {
            ...sanitizeForUpsert(workingRow, orgId, userId),
            [g.config.imagesCol]: newImages,
            ...(coverPatch ? { [effectiveCoverCol]: coverPatch } : {}),
          }
        : (coverPatch
            ? { [g.config.imagesCol]: newImages, [effectiveCoverCol]: coverPatch }
            : { [g.config.imagesCol]: newImages });
      plans.push({
        table: g.config.table,
        id: g.ownerId,
        patch,
        addedCount: toAdd.length,
        restoreFromLocal,
      });
    } else if (effectiveCoverCol) {
      // Single-cover atom WITH a working cover column.
      if (workingRow[effectiveCoverCol] && !restoreFromLocal) continue;
      const latest = [...bySlot.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
      if (!latest) continue;
      const patch = restoreFromLocal
        ? {
            ...sanitizeForUpsert(workingRow, orgId, userId),
            [effectiveCoverCol]: workingRow[effectiveCoverCol] || latest.path,
          }
        : { [effectiveCoverCol]: latest.path };
      plans.push({
        table: g.config.table,
        id: g.ownerId,
        patch,
        addedCount: 1,
        restoreFromLocal,
      });
    }
    // If neither imagesCol nor a working coverCol exists for this scope
    // (atom table where the cover_image migration never ran), there's
    // no place to link the file in the DB. Skip — the file stays an
    // orphan until the schema catches up.
  }
  return { plans, unmatched, restoredFromLocal };
}

// Execute the recovery plan. Plans flagged restoreFromLocal use upsert
// (insert-or-update on id) so missing-from-cloud rows are reconstructed
// from their local payload in the same write that links the orphan
// files. Cloud-existing rows use update.
async function executeOrphanRecovery(plans) {
  const supabase = await getAuthedSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  let rowsUpdated = 0;
  let rowsRestored = 0;
  let filesLinked = 0;
  const failures = [];
  for (const p of plans) {
    const payload = { ...p.patch, id: p.id, updated_at: new Date().toISOString() };
    let error;
    if (p.restoreFromLocal) {
      const res = await supabase.from(p.table).upsert(payload, { onConflict: 'id' });
      error = res.error;
    } else {
      const res = await supabase.from(p.table).update(payload).eq('id', p.id);
      error = res.error;
    }
    if (error) {
      failures.push({ table: p.table, id: p.id, error: error.message, restoreFromLocal: p.restoreFromLocal });
      continue;
    }
    if (p.restoreFromLocal) rowsRestored += 1;
    rowsUpdated += 1;
    filesLinked += p.addedCount;
  }
  return { rowsUpdated, rowsRestored, filesLinked, failures };
}

const card = {
  background: '#fff',
  border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8,
  padding: 20,
  marginBottom: 16,
};
const sectionTitle = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 18,
  color: FR.slate,
  margin: '0 0 12px 0',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
const statRow = { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 };
const statLabel = { fontSize: 11, color: FR.stone, letterSpacing: 0.3, minWidth: 140 };
const statValue = { fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate };
const btn = (variant) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 5,
  fontSize: 11,
  letterSpacing: 0.3,
  cursor: 'pointer',
  fontWeight: 600,
  border: 'none',
  background: variant === 'primary' ? FR.slate : 'transparent',
  color: variant === 'primary' ? FR.salt : FR.stone,
  ...(variant === 'ghost' && { border: `1px solid ${FR.sand}` }),
});

export default function StorageHealthPanel() {
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState(null);

  // JWT diagnostics — reads the actual Clerk-issued token the Supabase
  // client will send and surfaces every claim that affects RLS. The
  // overwhelming majority of "Cloud save failed" / "RLS policy violation"
  // errors trace back to a JWT problem (stale session after template
  // change, missing org_id when no org is active, role claim that's
  // not authenticated/anon/service_role). Showing the actual claims
  // makes those problems visible instead of having to guess.
  const [jwtInfo, setJwtInfo] = useState(null);
  const refreshJwt = async () => {
    setJwtInfo({ loading: true });
    try {
      const token = await getClerkToken('supabase');
      const payload = decodeJwtPayload(token);
      const clientOrgId = getCurrentOrgIdSync();
      const issues = [];
      if (!token) issues.push('No JWT issued — Clerk session may be missing the "supabase" template.');
      if (token && !payload) issues.push('JWT structure is unparseable.');
      if (payload && !payload.org_id) issues.push('Token has no org_id claim — add `"org_id": "{{org.id}}"` to the Clerk template.');
      if (payload && payload.org_id && clientOrgId && payload.org_id !== clientOrgId) {
        issues.push(`org_id mismatch: JWT carries "${payload.org_id}" but the active org is "${clientOrgId}". Sign out and back in to refresh the JWT.`);
      }
      if (payload && payload.role && !['authenticated', 'anon', 'service_role'].includes(payload.role)) {
        issues.push(`Top-level role claim is "${payload.role}" — Supabase requires authenticated/anon/service_role. Rename to app_role in the Clerk template, then sign out + back in.`);
      }
      if (payload && typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
        issues.push('Token is expired. Refresh the page or sign out + back in.');
      }

      // Server-side probe: ask Postgres what jwt_org_id() returns when
      // it parses the JWT we just sent. Critical because the client-
      // side decode above only proves the token *contains* org_id —
      // it can't tell us whether Postgres can read it. If the JWT
      // signing key isn't configured between Clerk and Supabase, the
      // server treats the token as anonymous and auth.jwt() returns
      // NULL even though the bytes are perfectly valid client-side.
      // That's exactly the failure mode that produces "RLS policy
      // violation" errors despite a green client-side check.
      let serverOrgId = null;
      let serverProbeError = null;
      try {
        const supabase = await getAuthedSupabase();
        if (supabase) {
          const { data, error } = await supabase.rpc('jwt_org_id');
          if (error) serverProbeError = error.message;
          else serverOrgId = data ?? null;
        }
      } catch (err) {
        serverProbeError = err?.message || String(err);
      }
      if (payload?.org_id && !serverOrgId) {
        issues.push(
          'Server-side jwt_org_id() returns NULL — Postgres cannot read the JWT. ' +
          'The Clerk JWT template is not signed with your Supabase JWT secret. ' +
          'In the Clerk Dashboard → JWT Templates → "supabase", set the Signing key to your Supabase project\'s JWT secret ' +
          '(Supabase → Project Settings → API → JWT Settings → JWT Secret), then sign out + back in.'
        );
      } else if (payload?.org_id && serverOrgId && serverOrgId !== payload.org_id) {
        issues.push(`Server sees org_id "${serverOrgId}" but JWT bytes carry "${payload.org_id}". Sign out + back in.`);
      }

      setJwtInfo({
        loading: false,
        present: !!token,
        payload,
        clientOrgId,
        serverOrgId,
        serverProbeError,
        issues,
      });
    } catch (err) {
      setJwtInfo({ loading: false, present: false, error: err?.message || String(err), issues: [`Could not fetch JWT: ${err?.message}`] });
    }
  };
  useEffect(() => { refreshJwt(); }, []);

  // Live cloud-write test. Runs a real INSERT (then DELETE) against
  // component_packs using the exact same payload shape as a normal
  // save. This is the diagnostic that resolves the "JWT looks fine
  // but saves keep failing with RLS" mystery for sure — it returns
  // the actual Postgres error verbatim instead of guessing.
  const [writeTest, setWriteTest] = useState(null);
  const runWriteTest = async () => {
    setWriteTest({ loading: true });
    try {
      const supabase = await getAuthedSupabase();
      if (!supabase) throw new Error('Supabase client not configured');
      const orgId = getCurrentOrgIdSync();
      const userId = getCurrentUserIdSync();
      if (!orgId) throw new Error('No active org');

      // Step 0: verify the org is visible via the authenticated client.
      // The organizations SELECT policy requires a user_org_memberships row,
      // so this check may return nothing even if the org row exists (RLS hides
      // it). We record the result as a warning but do NOT abort — we still
      // attempt the INSERT so Postgres can give us the real error code.
      const { data: orgRow, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', orgId)
        .maybeSingle();
      let orgWarning = null;
      if (orgErr) {
        orgWarning = `organizations SELECT error: ${orgErr.message} (code: ${orgErr.code})`;
      } else if (!orgRow) {
        orgWarning = `Org "${orgId}" is not visible via RLS. The row may exist but your user has no entry in user_org_memberships. Run this SQL in the Supabase editor:\n\nINSERT INTO public.users (clerk_user_id, email, name, role) VALUES ('${getCurrentUserIdSync()}', '', '', 'admin') ON CONFLICT (clerk_user_id) DO NOTHING;\nINSERT INTO public.organizations (id, name) VALUES ('${orgId}', 'My Org') ON CONFLICT (id) DO NOTHING;\nINSERT INTO public.user_org_memberships (user_id, org_id, role) VALUES ('${getCurrentUserIdSync()}', '${orgId}', 'admin') ON CONFLICT (user_id, org_id) DO NOTHING;`;
      }

      // Step 1: plain INSERT (not upsert). Upsert uses ON CONFLICT DO UPDATE
      // which evaluates BOTH insert and update RLS policies simultaneously —
      // a stale conflict row owned by another org would cause the update USING
      // check to fail even when the insert check would pass. A plain insert
      // only triggers the org_insert WITH CHECK, isolating the diagnosis.
      const testId = (crypto.randomUUID && crypto.randomUUID())
        || `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const payload = {
        id: testId,
        organization_id: orgId,
        user_id: userId,
        component_name: '__storage_health_write_test',
        data: { _test: true },
        images: [],
        updated_at: new Date().toISOString(),
      };
      const { error: insertErr } = await supabase
        .from('component_packs')
        .insert(payload);
      if (insertErr) {
        setWriteTest({
          loading: false,
          ok: false,
          phase: 'insert',
          message: `${insertErr.message}${insertErr.code ? ` (code: ${insertErr.code})` : ''}${insertErr.hint ? ` — hint: ${insertErr.hint}` : ''}${insertErr.details ? ` — details: ${insertErr.details}` : ''}${orgWarning ? `\n\nOrg visibility warning: ${orgWarning}` : ''}`,
          payload,
        });
        return;
      }
      // Cleanup — the test row served its purpose. Don't leave clutter.
      const { error: delErr } = await supabase
        .from('component_packs')
        .delete()
        .eq('id', testId)
        .eq('organization_id', orgId);
      setWriteTest({
        loading: false,
        ok: !orgWarning,
        phase: 'cleanup',
        message: delErr
          ? `Insert succeeded but cleanup delete returned: ${delErr.message} (test row left behind, run scan to surface it)`
          : orgWarning
            ? `INSERT passed RLS. However, org visibility warning: ${orgWarning}`
            : 'Cloud write path is fully operational. Saves should not fail with RLS errors against this org going forward.',
      });
    } catch (err) {
      setWriteTest({
        loading: false,
        ok: false,
        phase: 'unexpected',
        message: err?.message || String(err),
      });
    }
  };

  const runScan = async () => {
    setScanning(true);
    setScanStatus('Listing Storage bucket…');
    setError(null);
    setRepairResult(null);
    try {
      const orgId = getCurrentOrgIdSync();
      if (!orgId) throw new Error('No organization context — sign in first');
      let storageCount = 0;
      let scannedTable = '';
      const onStorageProgress = (n) => {
        storageCount = n;
        setScanStatus(`Listing Storage bucket… ${n} file${n === 1 ? '' : 's'} indexed${scannedTable ? ` · cross-referencing ${scannedTable}` : ''}`);
      };
      const onTableProgress = (t) => {
        scannedTable = t;
        setScanStatus(`Cross-referencing ${t}${storageCount ? ` · ${storageCount} files indexed` : ''}`);
      };
      const [files, refs] = await Promise.all([
        listAllStorageFiles(orgId, onStorageProgress),
        loadAllImageRefs(orgId, onTableProgress),
      ]);
      setScanStatus('Computing report…');
      const { referencedPaths, ghosts, legacyDataCount } = summarizeRefs(refs);
      const fileSet = new Set(files.map(f => f.path));
      const orphans = files.filter(f => !referencedPaths.has(f.path));
      const brokenRefs = [...referencedPaths].filter(p => !fileSet.has(p));
      const totalBytes = files.reduce((a, f) => a + (f.size || 0), 0);
      const orphanBytes = orphans.reduce((a, f) => a + (f.size || 0), 0);
      setReport({
        orgId,
        files,
        refs,
        referencedPathCount: referencedPaths.size,
        ghosts,
        legacyDataCount,
        orphans,
        brokenRefs,
        totalBytes,
        orphanBytes,
      });
    } catch (err) {
      console.error('StorageHealth scan:', err);
      setError(err?.message || String(err));
    } finally {
      setScanning(false);
      setScanStatus('');
    }
  };

  const runGhostRepair = async () => {
    if (!report) return;
    if (!window.confirm(`Drop ${report.ghosts.length} ghost entries from ${new Set(report.ghosts.map(g => g.rowId)).size} rows? This is safe — ghosts have no usable image source.`)) return;
    setRepairing(true);
    try {
      const result = await repairGhosts(report.refs);
      setRepairResult({
        kind: 'ghost',
        ok: true,
        message: `Cleaned ${result.cleanedRows} rows · dropped ${result.droppedEntries} ghost entries`,
      });
      await runScan();
    } catch (err) {
      setRepairResult({ kind: 'ghost', ok: false, message: err?.message || String(err) });
    } finally {
      setRepairing(false);
    }
  };

  const runOrphanCleanup = async () => {
    if (!report) return;
    if (!window.confirm(`Permanently delete ${report.orphans.length} orphan files (${formatBytes(report.orphanBytes)}) from Storage? This cannot be undone — but no DB row currently references any of these files.`)) return;
    setRepairing(true);
    try {
      const paths = report.orphans.map(o => o.path);
      const result = await deleteAssets(paths);
      setRepairResult({
        kind: 'orphan',
        ok: !!result.ok,
        message: result.ok
          ? `Reclaimed ${formatBytes(report.orphanBytes)} · deleted ${paths.length} orphan files`
          : (result.error?.message || 'Cleanup failed'),
      });
      await runScan();
    } catch (err) {
      setRepairResult({ kind: 'orphan', ok: false, message: err?.message || String(err) });
    } finally {
      setRepairing(false);
    }
  };

  // Recover orphan uploads → original packs/atoms. The plan is shown
  // first (read-only); the user explicitly confirms the apply step.
  const runOrphanRecovery = async () => {
    if (!report) return;
    setRepairing(true);
    try {
      const { plans, unmatched, restoredFromLocal } = await planOrphanRecovery(report.orphans);
      if (plans.length === 0) {
        setRepairResult({
          kind: 'recover',
          ok: false,
          message: unmatched > 0
            ? `Couldn't match any of the ${report.orphans.length} orphan files to existing rows in cloud or localStorage. The packs/atoms they belonged to were likely deleted before the JWT fix landed — the file bytes are intact in Storage but there's no row to link them to.`
            : 'Nothing to recover — every orphan is already linked or its row is missing.',
        });
        return;
      }
      const filesPlanned = plans.reduce((a, p) => a + p.addedCount, 0);
      const restoringLocalRows = plans.filter(p => p.restoreFromLocal).length;
      const detail = restoringLocalRows > 0
        ? `\n\n${restoringLocalRows} of those rows currently exist only in your browser's localStorage — they were created during the JWT-broken window so their cloud INSERT was rejected. Recovery will restore them to cloud as part of the same write.`
        : '';
      const ok = window.confirm(
        `Recover ${filesPlanned} orphan files into ${plans.length} rows?${detail}\n\n` +
        `Existing entries are kept first in the array, so nothing already visible gets replaced. ` +
        `Cover slots populate cover_image only when one isn't already set.` +
        `${unmatched > 0 ? `\n\n${unmatched} files belong to rows that no longer exist anywhere and will stay as orphans.` : ''}`
      );
      if (!ok) return;
      const result = await executeOrphanRecovery(plans);
      const restoredMsg = result.rowsRestored > 0 ? ` (${result.rowsRestored} restored from local to cloud)` : '';
      setRepairResult({
        kind: 'recover',
        ok: result.failures.length === 0,
        message: result.failures.length === 0
          ? `Recovered ${result.filesLinked} files across ${result.rowsUpdated} rows${restoredMsg}. Reload your library to see them.`
          : `Recovered ${result.filesLinked} files across ${result.rowsUpdated} rows${restoredMsg}; ${result.failures.length} writes failed (see console).`,
      });
      if (result.failures.length) console.error('Orphan recovery failures:', result.failures);
      // restoredFromLocal is reported only for telemetry symmetry
      if (restoredFromLocal !== undefined) console.info('[StorageHealth] groups restored from local:', restoredFromLocal);
      await runScan();
    } catch (err) {
      setRepairResult({ kind: 'recover', ok: false, message: err?.message || String(err) });
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, color: FR.slate, margin: 0 }}>
          Storage Health
        </h2>
        <span style={{ fontSize: 11, color: FR.stone, letterSpacing: 0.3 }}>
          Files · references · orphans · ghosts · broken paths
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {scanning && scanStatus && (
            <span style={{ fontSize: 11, color: FR.stone, letterSpacing: 0.2, fontStyle: 'italic' }}>
              {scanStatus}
            </span>
          )}
          <button onClick={runScan} disabled={scanning}
            style={{
              ...btn('primary'),
              ...(scanning ? { opacity: 0.85, cursor: 'wait' } : {}),
            }}>
            <RefreshCw size={12}
              style={scanning ? { animation: 'plm-spin 0.9s linear infinite' } : undefined} />
            {scanning ? 'Scanning…' : (report ? 'Rescan' : 'Run scan')}
          </button>
        </div>
      </div>
      <style>{`@keyframes plm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {scanning && (
        <div style={{
          ...card,
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'linear-gradient(90deg, rgba(245,240,232,0.6), rgba(255,255,255,0.6))',
        }}>
          <RefreshCw size={14} style={{ color: FR.soil, animation: 'plm-spin 0.9s linear infinite' }} />
          <div style={{ fontSize: 12, color: FR.stone }}>
            {scanStatus || 'Scanning…'}
          </div>
        </div>
      )}

      {/* JWT diagnostics — surfaces the most common cause of every
          mysterious "Cloud save failed" / "RLS policy violation" error. */}
      {jwtInfo && (
        <div style={{
          ...card,
          ...((jwtInfo.issues && jwtInfo.issues.length)
            ? { borderColor: 'rgba(163,45,45,0.4)', background: 'rgba(163,45,45,0.05)' }
            : {}),
        }}>
          <h3 style={sectionTitle}>
            {jwtInfo.loading
              ? <RefreshCw size={14} />
              : (jwtInfo.issues && jwtInfo.issues.length
                  ? <AlertTriangle size={14} color="#A32D2D" />
                  : <CheckCircle size={14} color="#3B6D11" />)}
            Auth & JWT diagnostics
            <button onClick={refreshJwt} disabled={jwtInfo.loading}
              style={{ ...btn('ghost'), marginLeft: 'auto', fontSize: 10 }}>
              <Key size={11} /> Re-check
            </button>
          </h3>
          {jwtInfo.loading && <div style={{ fontSize: 12, color: FR.stone }}>Reading current session token…</div>}
          {!jwtInfo.loading && jwtInfo.present && jwtInfo.payload && (
            <>
              <div style={statRow}>
                <span style={statLabel}>JWT org_id (token bytes)</span>
                <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>
                  {jwtInfo.payload.org_id || <span style={{ color: '#A32D2D' }}>—</span>}
                </span>
              </div>
              <div style={statRow}>
                <span style={statLabel}>Server jwt_org_id()</span>
                <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: jwtInfo.serverOrgId === jwtInfo.payload.org_id ? FR.slate : '#A32D2D' }}>
                  {jwtInfo.serverOrgId || <span style={{ color: '#A32D2D' }}>NULL · Postgres can&apos;t read JWT</span>}
                </span>
              </div>
              <div style={statRow}>
                <span style={statLabel}>Active org (client)</span>
                <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>
                  {jwtInfo.clientOrgId || <span style={{ color: '#A32D2D' }}>—</span>}
                </span>
              </div>
              <div style={statRow}>
                <span style={statLabel}>JWT role</span>
                <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: (!jwtInfo.payload.role || ['authenticated','anon','service_role'].includes(jwtInfo.payload.role)) ? FR.slate : '#A32D2D' }}>
                  {jwtInfo.payload.role || '(none — defaults to authenticated)'}
                </span>
              </div>
              <div style={statRow}>
                <span style={statLabel}>Subject (sub)</span>
                <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: FR.stone }}>
                  {jwtInfo.payload.sub || '—'}
                </span>
              </div>
              <div style={statRow}>
                <span style={statLabel}>Expires</span>
                <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: FR.stone }}>
                  {jwtInfo.payload.exp ? new Date(jwtInfo.payload.exp * 1000).toLocaleString() : '—'}
                </span>
              </div>
            </>
          )}
          {!jwtInfo.loading && !jwtInfo.present && (
            <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 8 }}>
              No JWT — Clerk session is missing the &quot;supabase&quot; template, or you are not signed in.
            </div>
          )}
          {jwtInfo.issues && jwtInfo.issues.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(163,45,45,0.06)', borderLeft: '3px solid #A32D2D', borderRadius: 3, fontSize: 12, color: '#A32D2D', lineHeight: 1.6 }}>
              <strong style={{ letterSpacing: 0.3 }}>{jwtInfo.issues.length === 1 ? 'Issue' : 'Issues'}:</strong>
              <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
                {jwtInfo.issues.map((i, idx) => <li key={idx} style={{ marginBottom: 4 }}>{i}</li>)}
              </ul>
            </div>
          )}
          {jwtInfo.payload && jwtInfo.issues && jwtInfo.issues.length === 0 && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(59,109,17,0.06)', borderLeft: '3px solid #3B6D11', borderRadius: 3, fontSize: 12, color: '#3B6D11' }}>
              JWT looks correct — RLS policies should pass for this org.
            </div>
          )}

          {/* Live write-path test — proves whether saves actually work
              against this org's component_packs table by performing a
              real INSERT + cleanup DELETE. Runs in under a second. */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${FR.sand}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={runWriteTest} disabled={writeTest?.loading}
                style={btn('ghost')}>
                <Zap size={11} /> {writeTest?.loading ? 'Testing…' : 'Test cloud write'}
              </button>
              <span style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5, flex: 1, minWidth: 280 }}>
                Performs a real INSERT against <code style={{ background: FR.salt, padding: '1px 5px', borderRadius: 3 }}>component_packs</code> with
                the same payload shape your saves use, then deletes it. The most direct proof that RLS will accept your writes.
              </span>
            </div>
            {writeTest && !writeTest.loading && (
              <div style={{
                marginTop: 10,
                padding: 10,
                background: writeTest.ok ? 'rgba(59,109,17,0.06)' : 'rgba(163,45,45,0.06)',
                borderLeft: `3px solid ${writeTest.ok ? '#3B6D11' : '#A32D2D'}`,
                borderRadius: 3,
                fontSize: 12,
                color: writeTest.ok ? '#3B6D11' : '#A32D2D',
                lineHeight: 1.6,
              }}>
                {writeTest.ok ? '✓ ' : '⚠ '}{writeTest.message}
                {!writeTest.ok && writeTest.payload && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 11, color: FR.stone }}>Show payload sent</summary>
                    <pre style={{ fontSize: 11, color: FR.stone, marginTop: 6, overflow: 'auto', maxWidth: 760 }}>
{JSON.stringify(writeTest.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...card, borderColor: 'rgba(163,45,45,0.4)', background: 'rgba(163,45,45,0.05)' }}>
          <div style={{ color: '#A32D2D', fontSize: 12 }}>Scan failed: {error}</div>
        </div>
      )}

      {!report && !scanning && !error && (
        <div style={card}>
          <p style={{ fontSize: 13, color: FR.stone, lineHeight: 1.6, margin: 0 }}>
            This panel inspects your organization's PLM file pipeline end-to-end. It walks
            the <code style={{ background: FR.salt, padding: '1px 5px', borderRadius: 3 }}>plm-assets</code> bucket,
            cross-references every image entry across the database, and reports any inconsistency
            you can act on. All checks are read-only until you explicitly click a repair button.
          </p>
          <p style={{ fontSize: 13, color: FR.stone, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
            Click <strong>Run scan</strong> to begin. A typical org with a few hundred files takes 2-5 seconds.
          </p>
        </div>
      )}

      {report && (
        <div style={scanning ? { opacity: 0.55, pointerEvents: 'none', transition: 'opacity 0.2s' } : { transition: 'opacity 0.2s' }}>
          <div style={card}>
            <h3 style={sectionTitle}><HardDrive size={14} /> Storage usage</h3>
            <div style={statRow}>
              <span style={statLabel}>Files in bucket</span>
              <span style={statValue}>{report.files.length.toLocaleString()}</span>
            </div>
            <div style={statRow}>
              <span style={statLabel}>Bytes used</span>
              <span style={statValue}>{formatBytes(report.totalBytes)}</span>
            </div>
            <div style={{ ...statRow, marginBottom: 0 }}>
              <span style={statLabel}>Org prefix</span>
              <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: FR.stone }}>{report.orgId}/</span>
            </div>
            <div style={{ marginTop: 12, padding: '8px 12px', background: FR.salt, borderRadius: 4, fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
              Supabase free tier: 1 GB Storage. Pro tier: 100 GB. Approximate per-image size with the canonical
              2400 px / WebP 0.92 pipeline is 400-700 KB.
            </div>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>
              <Database size={14} /> Reference inventory
            </h3>
            <div style={statRow}>
              <span style={statLabel}>Referenced files</span>
              <span style={statValue}>{report.referencedPathCount.toLocaleString()}</span>
            </div>
            <div style={statRow}>
              <span style={statLabel}>Legacy base64 entries</span>
              <span style={{ ...statValue, color: report.legacyDataCount > 0 ? '#854F0B' : FR.slate }}>
                {report.legacyDataCount.toLocaleString()}
              </span>
            </div>
            {report.legacyDataCount > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
                Legacy entries live in the database row itself as base64 strings. They render fine but bloat
                row size. Open each affected pack and the lazy migration runs automatically in the background.
              </div>
            )}
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>
              {report.ghosts.length > 0
                ? <AlertTriangle size={14} color="#A32D2D" />
                : <CheckCircle size={14} color="#3B6D11" />}
              Ghost references
            </h3>
            <div style={statRow}>
              <span style={statLabel}>Image entries with no source</span>
              <span style={{ ...statValue, color: report.ghosts.length > 0 ? '#A32D2D' : '#3B6D11' }}>
                {report.ghosts.length}
              </span>
            </div>
            <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5, marginTop: 8 }}>
              Ghost entries are JSONB image rows that have no file path and no inline data — created by uploads
              that failed silently before today's persist-filter fix. They lock slots into a blank state. Repair
              drops them and frees the slots.
            </div>
            {report.ghosts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button onClick={runGhostRepair} disabled={repairing} style={btn('primary')}>
                  <Trash2 size={12} /> {repairing && repairResult?.kind !== 'orphan' ? 'Repairing…' : `Drop ${report.ghosts.length} ghosts`}
                </button>
              </div>
            )}
            {report.ghosts.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 11, color: FR.stone, cursor: 'pointer', letterSpacing: 0.3 }}>
                  Show affected rows ({new Set(report.ghosts.map(g => `${g.table}/${g.rowId}`)).size})
                </summary>
                <div style={{ marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: FR.stone, maxHeight: 240, overflow: 'auto', background: FR.salt, padding: 8, borderRadius: 4 }}>
                  {report.ghosts.slice(0, 200).map((g, i) => (
                    <div key={i}>{g.table} · {g.rowId} · slot={g.slot} · name={g.name}</div>
                  ))}
                  {report.ghosts.length > 200 && (
                    <div style={{ marginTop: 6, fontStyle: 'italic' }}>
                      … and {report.ghosts.length - 200} more
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>
              {report.orphans.length > 0
                ? <AlertTriangle size={14} color="#854F0B" />
                : <CheckCircle size={14} color="#3B6D11" />}
              Orphan files
            </h3>
            <div style={statRow}>
              <span style={statLabel}>Files no row references</span>
              <span style={{ ...statValue, color: report.orphans.length > 0 ? '#854F0B' : '#3B6D11' }}>
                {report.orphans.length} · {formatBytes(report.orphanBytes)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5, marginTop: 8 }}>
              Orphans are files in Storage that no DB row currently points at. They are most often the result
              of uploads that landed successfully but whose follow-up save failed (a JWT misconfiguration,
              transient RLS rejection, etc.). Use <strong>Recover</strong> first — it reads each orphan&apos;s
              Storage path, finds the pack or atom whose id is encoded in the path, and stitches the
              reference back into that row. Anything that can&apos;t be matched to a still-existing row is a
              true orphan and only then is <strong>Reclaim</strong> safe.
            </div>
            {report.orphans.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={runOrphanRecovery} disabled={repairing} style={btn('primary')}>
                  <RefreshCw size={12} /> {repairing && repairResult?.kind !== 'ghost' && repairResult?.kind !== 'orphan' ? 'Recovering…' : `Recover ${report.orphans.length} files`}
                </button>
                <button onClick={runOrphanCleanup} disabled={repairing}
                  style={{ ...btn('ghost'), color: '#A32D2D', borderColor: 'rgba(163,45,45,0.4)' }}>
                  <Trash2 size={12} /> {repairing && repairResult?.kind !== 'ghost' && repairResult?.kind !== 'recover' ? 'Reclaiming…' : `Permanently delete ${formatBytes(report.orphanBytes)}`}
                </button>
              </div>
            )}
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>
              {report.brokenRefs.length > 0
                ? <AlertTriangle size={14} color="#A32D2D" />
                : <CheckCircle size={14} color="#3B6D11" />}
              Broken references
            </h3>
            <div style={statRow}>
              <span style={statLabel}>DB → missing file</span>
              <span style={{ ...statValue, color: report.brokenRefs.length > 0 ? '#A32D2D' : '#3B6D11' }}>
                {report.brokenRefs.length}
              </span>
            </div>
            <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5, marginTop: 8 }}>
              Broken refs are paths the DB references but that don't exist in Storage. Caused by manual file
              deletes, an interrupted GC cycle, or restoring a backup that pre-dates the file. Open the
              affected row, remove the slot, and re-upload to fix.
            </div>
            {report.brokenRefs.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 11, color: FR.stone, cursor: 'pointer', letterSpacing: 0.3 }}>
                  Show {report.brokenRefs.length} broken paths
                </summary>
                <div style={{ marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: FR.stone, maxHeight: 240, overflow: 'auto', background: FR.salt, padding: 8, borderRadius: 4 }}>
                  {report.brokenRefs.slice(0, 200).map((p, i) => <div key={i}>{p}</div>)}
                  {report.brokenRefs.length > 200 && (
                    <div style={{ marginTop: 6, fontStyle: 'italic' }}>
                      … and {report.brokenRefs.length - 200} more
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>

          {repairResult && (
            <div style={{
              ...card,
              borderColor: repairResult.ok ? 'rgba(59,109,17,0.4)' : 'rgba(163,45,45,0.4)',
              background: repairResult.ok ? 'rgba(59,109,17,0.05)' : 'rgba(163,45,45,0.05)',
            }}>
              <div style={{ fontSize: 12, color: repairResult.ok ? '#3B6D11' : '#A32D2D' }}>
                {repairResult.ok ? '✓ ' : '⚠ '}{repairResult.message}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
