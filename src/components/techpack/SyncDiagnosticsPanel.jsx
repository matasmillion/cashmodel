// In-app sync diagnostic surface. The user has no Chrome DevTools / no
// console — every signal we have to communicate "what's wrong with
// cross-device sync?" must come through visible UI. This panel:
//
//   1. Verifies the auth chain: Clerk user, active org, Supabase JWT,
//      JWT org_id claim, and (critically) what Postgres reads from
//      jwt_org_id() RPC. The last check catches the "client JWT looks
//      fine but server can't decode it" failure mode.
//
//   2. Counts every atom and control library locally vs cloud. If
//      vendors / colors agree but fabrics / treatments / patterns /
//      embellishments drift, the user can see at a glance that the fix
//      lives in atom code, not auth.
//
//   3. Lists which exact ids are local-only (would need healing) or
//      cloud-only (would arrive on next refresh). Capped at 10 per
//      bucket so a runaway state can't blow up the panel.
//
//   4. Surfaces the most recent sync error per table from the in-
//      memory ring buffer in atomCloudSync.
//
//   5. Force-resyncs every local atom row on demand, reporting
//      per-table succeeded / failed counters with the first error
//      message from each failure.
//
// Wired into every atom Library tab — Fabric, Treatment, Pattern,
// Embellishment — as a "Sync diagnostics" toggle button next to the
// "Add X" button. Inline expandable, not a modal, so it doesn't pull
// the user out of context.

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { FR } from './techPackConstants';
import { getSyncDiagnosticsReport, forceResyncAllAtoms } from '../../utils/atomSyncDiagnostics';

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function StatusDot({ ok, warn }) {
  const color = ok ? '#3B6D11' : warn ? '#854F0B' : '#A32D2D';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, marginRight: 6, verticalAlign: 'middle' }} />;
}

function Field({ label, value, mono = false, tone = 'normal' }) {
  const valueColor = tone === 'good' ? '#3B6D11' : tone === 'warn' ? '#854F0B' : tone === 'bad' ? '#A32D2D' : FR.slate;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12, borderBottom: '0.5px solid rgba(58,58,58,0.06)' }}>
      <span style={{ color: FR.stone }}>{label}</span>
      <span style={{ color: valueColor, fontFamily: mono ? MONO : 'inherit', textAlign: 'right', wordBreak: 'break-all' }}>{value ?? <em style={{ color: FR.stone }}>not set</em>}</span>
    </div>
  );
}

function IssueList({ issues }) {
  if (!issues || issues.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {issues.map((iss, i) => {
        const fatal = iss.severity === 'fatal';
        return (
          <div key={i} style={{
            display: 'flex', gap: 8, padding: '8px 10px', marginBottom: 6, borderRadius: 6,
            background: fatal ? 'rgba(163,45,45,0.08)' : 'rgba(133,79,11,0.08)',
            border: `0.5px solid ${fatal ? 'rgba(163,45,45,0.30)' : 'rgba(133,79,11,0.30)'}`,
            color: fatal ? '#A32D2D' : '#854F0B', fontSize: 11.5, lineHeight: 1.5,
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ whiteSpace: 'pre-wrap' }}>{iss.message}</span>
          </div>
        );
      })}
    </div>
  );
}

function TableDiffRow({ row }) {
  const drift = row.localCount !== row.cloudCount || (row.localOnly?.length || 0) > 0 || (row.cloudOnly?.length || 0) > 0;
  const errored = !!row.cloudError;
  const ok = !drift && !errored;
  return (
    <tr>
      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid rgba(58,58,58,0.06)', fontSize: 12 }}>
        <StatusDot ok={ok} warn={!ok && !errored} />
        <span style={{ color: FR.slate, verticalAlign: 'middle' }}>{row.label}</span>
        {row.kind === 'control' && (
          <span style={{ marginLeft: 6, fontSize: 10, color: FR.stone, fontStyle: 'italic' }}>(control)</span>
        )}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid rgba(58,58,58,0.06)', fontSize: 12, fontFamily: MONO, textAlign: 'right' }}>
        {row.localCount}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid rgba(58,58,58,0.06)', fontSize: 12, fontFamily: MONO, textAlign: 'right' }}>
        {errored ? <span style={{ color: '#A32D2D' }}>!</span> : row.cloudCount}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '0.5px solid rgba(58,58,58,0.06)', fontSize: 11, color: FR.stone }}>
        {errored ? (
          <span style={{ color: '#A32D2D' }}>{row.cloudError}{row.cloudErrorCode ? ` (${row.cloudErrorCode})` : ''}</span>
        ) : ok ? (
          <span style={{ color: '#3B6D11' }}><CheckCircle2 size={11} style={{ verticalAlign: 'middle' }} /> in sync</span>
        ) : (
          <span style={{ color: '#854F0B' }}>
            {row.localOnly?.length ? `${row.localOnly.length} local-only` : ''}
            {row.localOnly?.length && row.cloudOnly?.length ? ', ' : ''}
            {row.cloudOnly?.length ? `${row.cloudOnly.length} cloud-only` : ''}
          </span>
        )}
      </td>
    </tr>
  );
}

function DriftDetails({ row }) {
  const localOnly = row.localOnly || [];
  const cloudOnly = row.cloudOnly || [];
  if (localOnly.length === 0 && cloudOnly.length === 0) return null;
  return (
    <div style={{ marginLeft: 14, marginTop: 4, marginBottom: 8, paddingLeft: 10, borderLeft: '2px solid rgba(58,58,58,0.10)', fontSize: 11, color: FR.stone, fontFamily: MONO }}>
      {localOnly.length > 0 && (
        <div>
          <strong style={{ color: FR.slate, fontFamily: 'inherit' }}>Local-only ({row.label}):</strong>
          {localOnly.map(r => <div key={r.id} style={{ marginLeft: 10 }}>• {r.name || r.id} <span style={{ color: 'rgba(58,58,58,0.45)' }}>({r.id})</span></div>)}
          {row.localOnlyExtra > 0 && <div style={{ marginLeft: 10, fontStyle: 'italic' }}>… and {row.localOnlyExtra} more</div>}
        </div>
      )}
      {cloudOnly.length > 0 && (
        <div style={{ marginTop: localOnly.length ? 6 : 0 }}>
          <strong style={{ color: FR.slate, fontFamily: 'inherit' }}>Cloud-only ({row.label}):</strong>
          {cloudOnly.map(r => <div key={r.id} style={{ marginLeft: 10 }}>• {r.name || r.id} <span style={{ color: 'rgba(58,58,58,0.45)' }}>({r.id})</span></div>)}
          {row.cloudOnlyExtra > 0 && <div style={{ marginLeft: 10, fontStyle: 'italic' }}>… and {row.cloudOnlyExtra} more</div>}
        </div>
      )}
    </div>
  );
}

function ResyncResultBlock({ results }) {
  if (!results) return null;
  if (results.length === 0) {
    return <div style={{ marginTop: 8, padding: 8, fontSize: 11, color: FR.stone }}>Resync ran but had nothing to do (no local rows, or Supabase isn't enabled).</div>;
  }
  return (
    <div style={{ marginTop: 10, padding: 10, background: '#FAF8F3', borderRadius: 6, border: `0.5px solid ${FR.sand}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: FR.slate, marginBottom: 6 }}>Force resync results</div>
      {results.map(r => (
        <div key={r.table} style={{ fontSize: 11.5, color: FR.slate, marginBottom: 6 }}>
          <span style={{ fontFamily: MONO }}>{r.table}:</span>{' '}
          <span style={{ color: '#3B6D11' }}>{r.succeeded} ok</span>
          {r.failed > 0 && <span style={{ color: '#A32D2D' }}> · {r.failed} failed</span>}
          {' '}
          <span style={{ color: FR.stone }}>(of {r.attempted})</span>
          {r.errors && r.errors.length > 0 && (
            <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#A32D2D', fontSize: 11, fontFamily: MONO }}>
              {r.errors.map((e, i) => <li key={i}>{e.id}: {e.message}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// Detect a stale-PostgREST-cache failure across recent errors. Catches
// both the PGRST204 code and the "Could not find the 'X' column ... in
// the schema cache" textual variant.
function detectSchemaCacheMiss(lastErrorByTable) {
  const offenders = [];
  for (const [table, evt] of Object.entries(lastErrorByTable || {})) {
    const msg = String(evt?.error || '');
    const code = String(evt?.code || '');
    if (code === 'PGRST204' || /schema cache|Could not find the '[^']+' column/i.test(msg)) {
      const m = /'([^']+)' column/i.exec(msg);
      offenders.push({ table, column: m ? m[1] : null });
    }
  }
  return offenders;
}

// When PostgREST's schema cache lags behind the actual DB schema (e.g.
// after a fresh migration), every upsert that includes the not-yet-cached
// column silently fails with PGRST204. Fix is one SQL statement —
// surface it in the panel so the user can copy-paste without leaving
// context. (We also have client-side fallback that drops the unknown
// column and retries; this banner is for the durable fix.)
function SchemaCacheBanner({ offenders }) {
  if (!offenders || offenders.length === 0) return null;
  const sql = "NOTIFY pgrst, 'reload schema';";
  const cols = offenders.filter(o => o.column).map(o => `${o.table}.${o.column}`).join(', ');
  return (
    <div style={{
      marginTop: 10,
      padding: '12px 14px',
      background: 'rgba(133,79,11,0.08)',
      border: '0.5px solid rgba(133,79,11,0.30)',
      borderRadius: 6,
      color: '#854F0B',
      fontSize: 12, lineHeight: 1.55,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AlertTriangle size={14} />
        <strong style={{ color: '#854F0B' }}>PostgREST schema cache is stale</strong>
      </div>
      <div style={{ marginBottom: 8 }}>
        Postgres has the column{cols ? ` (${cols})` : 's'}, but Supabase&rsquo;s API cached the older schema and rejects every write that references the new column. Refresh the cache by pasting this into your Supabase SQL Editor and pressing Run:
      </div>
      <pre style={{
        margin: '6px 0 8px', padding: '8px 10px',
        background: '#fff', border: `0.5px solid ${FR.sand}`, borderRadius: 4,
        fontFamily: MONO, fontSize: 12, color: FR.slate, whiteSpace: 'pre-wrap',
      }}>{sql}</pre>
      <div style={{ fontSize: 11, color: FR.stone }}>
        Refresh is instant. After it lands, click <strong>Re-run</strong> above; counts should converge. Until then, the client drops the unknown column and saves the rest of the row so data isn&rsquo;t lost.
      </div>
    </div>
  );
}

function LastErrorsBlock({ lastErrorByTable }) {
  const entries = Object.entries(lastErrorByTable || {});
  if (entries.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: FR.slate, marginBottom: 6 }}>Most recent sync errors</div>
      {entries.map(([table, evt]) => (
        <div key={table} style={{ fontSize: 11.5, color: '#A32D2D', fontFamily: MONO, padding: '3px 0' }}>
          {table}: {evt.error}{evt.code ? ` (${evt.code})` : ''}
        </div>
      ))}
    </div>
  );
}

// Toggle button — render in the page header next to "Add X". Pair
// with <SyncDiagnosticsPanel /> below the header to render the
// expanded surface only when `open` is true.
export function SyncDiagnosticsToggle({ open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title="Diagnose cross-device sync issues for this library"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        background: open ? FR.sand : '#fff',
        color: FR.slate,
        border: `1px solid ${FR.sand}`, borderRadius: 6,
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
        fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
      }}
    >
      <Zap size={12} /> {open ? 'Hide sync diagnostics' : 'Sync diagnostics'}
    </button>
  );
}

export default function SyncDiagnosticsPanel({ open, atomLabel = 'Atoms' }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncResults, setResyncResults] = useState(null);
  const [expandedDrift, setExpandedDrift] = useState({});

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await getSyncDiagnosticsReport();
      setReport(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !report) refresh();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onResync = async () => {
    setResyncing(true);
    setResyncResults(null);
    try {
      const r = await forceResyncAllAtoms();
      setResyncResults(r);
      await refresh();
    } finally {
      setResyncing(false);
    }
  };

  if (!open) return null;

  const fatalCount = report?.issues?.filter(i => i.severity === 'fatal').length || 0;
  const drifted = (report?.tables || []).filter(t => !t.synced && !t.cloudError);
  const errored = (report?.tables || []).filter(t => t.cloudError);

  return (
    <div style={{
      width: '100%',
      marginTop: 14,
      padding: 18,
      background: '#fff',
      border: '0.5px solid rgba(58,58,58,0.15)',
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h4 style={{ margin: 0, color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20 }}>
            Sync diagnostics — {atomLabel}
          </h4>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: FR.stone }}>
            Cross-device sync state for the four atom libraries, plus vendors and colors as a control.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={refresh}
            disabled={loading}
            title="Re-run all checks"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px',
              background: '#fff', color: FR.slate,
              border: `1px solid ${FR.sand}`, borderRadius: 6,
              fontSize: 11, cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Checking…' : 'Re-run'}
          </button>
        </div>
      </div>

      {!report && loading && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: FR.stone }}>Running checks…</div>
      )}

      {report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: FR.slate, marginBottom: 4 }}>Identity</div>
              <Field label="Clerk user id" value={report.identity.userId} mono />
              <Field label="Clerk active org" value={report.identity.clientOrgId} mono />
              <Field label="JWT org_id (client decode)" value={report.identity.jwtOrgId} mono
                tone={report.identity.jwtOrgId === report.identity.clientOrgId && report.identity.jwtOrgId ? 'good' : 'warn'} />
              <Field label="JWT sub (client decode)" value={report.identity.jwtSub} mono />
              <Field
                label="Postgres jwt_org_id() (server)"
                value={report.serverJwt?.ok ? (report.serverJwt.value || <em style={{ color: '#A32D2D' }}>NULL — server can't read JWT</em>) : <span style={{ color: '#A32D2D' }}>{report.serverJwt?.error || 'unreachable'}</span>}
                mono
                tone={report.serverJwt?.ok && report.serverJwt.value === report.identity.jwtOrgId ? 'good' : 'bad'}
              />
              <Field label="Token present" value={report.identity.tokenPresent ? 'yes' : 'no'} tone={report.identity.tokenPresent ? 'good' : 'bad'} />
              <Field label="Supabase enabled" value={report.identity.supabaseEnabled ? 'yes' : 'no'} tone={report.identity.supabaseEnabled ? 'good' : 'bad'} />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: FR.slate, marginBottom: 4 }}>Library counts</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ fontSize: 10, color: FR.stone, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: `0.5px solid ${FR.sand}` }}>Library</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: `0.5px solid ${FR.sand}` }}>Local</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: `0.5px solid ${FR.sand}` }}>Cloud</th>
                    <th style={{ textAlign: 'left',  padding: '4px 8px', borderBottom: `0.5px solid ${FR.sand}` }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tables.map(t => (
                    <TableDiffRow key={t.table} row={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <IssueList issues={report.issues} />

          <SchemaCacheBanner offenders={detectSchemaCacheMiss(report.lastErrorByTable)} />

          {(drifted.length > 0 || errored.length > 0) && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setExpandedDrift(v => ({ ...v, all: !v.all }))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'transparent', border: 'none',
                  color: FR.stone, cursor: 'pointer', fontSize: 11, padding: 0,
                }}
              >
                {expandedDrift.all ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expandedDrift.all ? 'Hide drift detail' : 'Show drift detail'}
              </button>
              {expandedDrift.all && drifted.map(t => <DriftDetails key={t.table} row={t} />)}
            </div>
          )}

          <LastErrorsBlock lastErrorByTable={report.lastErrorByTable} />

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={onResync}
              disabled={resyncing || fatalCount > 0}
              title={fatalCount > 0 ? 'Fix the fatal issues above first' : 'Re-upload every local-only atom row through the robust upsert path'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                background: fatalCount > 0 ? FR.sand : FR.slate,
                color: fatalCount > 0 ? FR.stone : FR.salt,
                border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                cursor: resyncing || fatalCount > 0 ? 'not-allowed' : 'pointer',
                opacity: resyncing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={12} style={{ animation: resyncing ? 'spin 1s linear infinite' : 'none' }} />
              {resyncing ? 'Resyncing…' : 'Force resync atoms'}
            </button>
            <span style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
              Re-uploads every local fabric / treatment / pattern / embellishment row through the robust upsert path.
              Refresh after to confirm the cloud counts now match local.
            </span>
          </div>

          <ResyncResultBlock results={resyncResults} />
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
