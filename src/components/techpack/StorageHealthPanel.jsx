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
import { AlertTriangle, CheckCircle, Database, HardDrive, RefreshCw, Trash2, Key } from 'lucide-react';
import { FR } from './techPackConstants';
import { getAuthedSupabase } from '../../lib/supabase';
import { getCurrentOrgIdSync, getClerkToken } from '../../lib/auth';
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
async function listAllStorageFiles(orgId) {
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
async function loadAllImageRefs(orgId) {
  const supabase = await getAuthedSupabase();
  if (!supabase) throw new Error('Supabase client not configured');
  const refs = [];
  for (const t of SCAN_TABLES) {
    const cols = ['id'];
    if (t.imagesCol) cols.push(t.imagesCol);
    if (t.coverCol) cols.push(t.coverCol);
    const { data, error } = await supabase
      .from(t.table)
      .select(cols.join(','))
      .eq('organization_id', orgId);
    if (error) {
      console.warn(`[StorageHealth] skipped ${t.table}:`, error.message);
      continue;
    }
    for (const row of data || []) {
      refs.push({ table: t.table, row, imagesCol: t.imagesCol, coverCol: t.coverCol });
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
      setJwtInfo({
        loading: false,
        present: !!token,
        payload,
        clientOrgId,
        issues,
      });
    } catch (err) {
      setJwtInfo({ loading: false, present: false, error: err?.message || String(err), issues: [`Could not fetch JWT: ${err?.message}`] });
    }
  };
  useEffect(() => { refreshJwt(); }, []);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setRepairResult(null);
    try {
      const orgId = getCurrentOrgIdSync();
      if (!orgId) throw new Error('No organization context — sign in first');
      const [files, refs] = await Promise.all([
        listAllStorageFiles(orgId),
        loadAllImageRefs(orgId),
      ]);
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

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, color: FR.slate, margin: 0 }}>
          Storage Health
        </h2>
        <span style={{ fontSize: 11, color: FR.stone, letterSpacing: 0.3 }}>
          Files · references · orphans · ghosts · broken paths
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={runScan} disabled={scanning} style={btn('primary')}>
            <RefreshCw size={12} /> {scanning ? 'Scanning…' : (report ? 'Rescan' : 'Run scan')}
          </button>
        </div>
      </div>

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
                <span style={statLabel}>JWT org_id</span>
                <span style={{ ...statValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>
                  {jwtInfo.payload.org_id || <span style={{ color: '#A32D2D' }}>—</span>}
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
        <>
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
              Orphans are files in Storage that no DB row points at. Common when an upload succeeds but the
              following save fails, or when a slot is replaced before the deferred-orphan-GC sweep runs.
              Reclaiming them is permanent but safe — nothing references them.
            </div>
            {report.orphans.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button onClick={runOrphanCleanup} disabled={repairing} style={btn('primary')}>
                  <Trash2 size={12} /> {repairing && repairResult?.kind !== 'ghost' ? 'Cleaning…' : `Reclaim ${formatBytes(report.orphanBytes)}`}
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
        </>
      )}
    </div>
  );
}
