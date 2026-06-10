// Floating sync status badge — the operator's at-a-glance "is my work safe?"
// indicator, plus the conflict prompt the operator asked for.
//
// Bottom-LEFT (the inventory agent chat owns bottom-right). Shows:
//   • online / offline dot
//   • "N pending" when edits are parked in the durable outbox
//   • "Synced · <time>" when the outbox is empty
//   • a red conflict badge + expandable prompt when a multi-device edit clash
//     was resolved by last-write-wins, so the operator can review and restore
//     the version that lost.
//
// FR palette only (Salt / Slate / Sand + delta green/amber/red). No emojis.

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, X, RotateCcw } from 'lucide-react';
import { isOnline, onConnectivityChange } from '../utils/connectivity';
import { onQueueChange, queueLength, getLastSyncAt, syncNow } from '../utils/syncQueue';
import { onConflict, getUnresolvedConflicts, acknowledgeConflict, takeConflictForRestore } from '../utils/conflictBackup';

const SALT = '#F5F0E8';
const SLATE = '#3A3A3A';
const SAND = '#EBE5D5';
const STONE = '#8A8278';
const GREEN = '#3B6D11';
const AMBER = '#854F0B';
const RED = '#A32D2D';

// Maps a conflict's table to the store save fn used to re-apply ("restore")
// the losing version. Re-saving stamps a fresh updated_at so it wins next sync.
const SAVER_LOADERS = {
  treatments:     () => import('../utils/treatmentStore').then(m => m.saveTreatment),
  fabrics:        () => import('../utils/fabricStore').then(m => m.saveFabric),
  embellishments: () => import('../utils/embellishmentStore').then(m => m.saveEmbellishment),
  cut_sew:        () => import('../utils/cutSewStore').then(m => m.saveCutSew),
  tech_packs:     () => import('../utils/techPackStore').then(m => m.saveTechPack),
  component_packs:() => import('../utils/componentPackStore').then(m => m.saveComponentPack),
};

const TABLE_LABEL = {
  treatments: 'Treatment', fabrics: 'Fabric', embellishments: 'Embellishment',
  cut_sew: 'Cut & Sew', tech_packs: 'Style', component_packs: 'Component',
};

function timeAgo(iso) {
  if (!iso) return 'never';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SyncStatusBadge() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(queueLength());
  const [conflicts, setConflicts] = useState(getUnresolvedConflicts());
  const [lastSync, setLastSync] = useState(getLastSyncAt());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const offConn = onConnectivityChange(setOnline);
    const offQ = onQueueChange((n) => { setPending(n); setLastSync(getLastSyncAt()); });
    const offC = onConflict(setConflicts);
    // Re-render the relative time periodically.
    const t = setInterval(() => setLastSync(getLastSyncAt()), 30000);
    return () => { offConn(); offQ(); offC(); clearInterval(t); };
  }, []);

  // Auto-open the panel the first time a conflict appears so the prompt is seen.
  useEffect(() => { if (conflicts.length > 0) setOpen(true); }, [conflicts.length]);

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      await syncNow();
      // Also pull from cloud so any changes made on other devices appear now.
      window.dispatchEvent(new CustomEvent('plm-store-updated', { detail: { table: 'all', forced: true } }));
    } finally {
      setBusy(false);
      setPending(queueLength());
      setLastSync(getLastSyncAt());
    }
  };

  const handleRestore = async (c) => {
    const loader = SAVER_LOADERS[c.table];
    if (!loader) { acknowledgeConflict(c.ts); return; }
    setBusy(true);
    try {
      const save = await loader();
      const taken = takeConflictForRestore(c.ts);
      if (taken && taken.version) {
        // Strip server-managed fields so the save stamps a fresh updated_at
        // (which makes this restored version win on the next sync).
        const rest = { ...taken.version };
        delete rest.updated_at; delete rest.created_at;
        delete rest.organization_id; delete rest.user_id;
        await save(taken.id, rest);
        await syncNow();
      }
    } catch (err) {
      console.error('restore conflict:', err);
    } finally {
      setBusy(false);
      setConflicts(getUnresolvedConflicts());
    }
  };

  const hasConflicts = conflicts.length > 0;
  const dotColor = hasConflicts ? RED : (online ? (pending > 0 ? AMBER : GREEN) : STONE);
  const label = hasConflicts
    ? `${conflicts.length} sync conflict${conflicts.length === 1 ? '' : 's'}`
    : !online
      ? (pending > 0 ? `Offline · ${pending} queued` : 'Offline')
      : pending > 0
        ? `Syncing · ${pending} left`
        : `Synced · ${timeAgo(lastSync)}`;

  return (
    <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9000, fontFamily: "'Helvetica Neue', Inter, sans-serif" }}>
      {open && (
        <div style={{ width: 320, marginBottom: 8, background: '#fff', border: `0.5px solid ${SAND}`, borderRadius: 8, boxShadow: '0 6px 24px rgba(58,58,58,0.14)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `0.5px solid ${SAND}`, background: SALT }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: SLATE, letterSpacing: 0.3 }}>Sync status</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: STONE, lineHeight: 0 }}><X size={15} /></button>
          </div>

          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: SLATE }}>
              {online ? <Cloud size={15} color={GREEN} /> : <CloudOff size={15} color={STONE} />}
              <span>{online ? 'Online' : 'Offline — edits are saved on this device'}</span>
            </div>
            <div style={{ fontSize: 11, color: STONE }}>
              {pending > 0 ? `${pending} edit${pending === 1 ? '' : 's'} waiting to reach the cloud` : 'All edits synced to the cloud'}
              {' · last sync '}{timeAgo(lastSync)}
            </div>
            <button
              onClick={handleSyncNow}
              disabled={busy}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, padding: '6px 12px', background: SLATE, color: SALT, border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
            >
              <RefreshCw size={12} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} /> Sync now
            </button>
          </div>

          {hasConflicts && (
            <div style={{ borderTop: `0.5px solid ${SAND}`, padding: '12px 14px', background: '#FBF3F1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AlertTriangle size={14} color={RED} />
                <span style={{ fontSize: 11, fontWeight: 700, color: RED, letterSpacing: 0.3 }}>Edit conflicts resolved</span>
              </div>
              <p style={{ fontSize: 11, color: SLATE, lineHeight: 1.5, margin: '0 0 10px' }}>
                A newer edit on another computer won. The version edited here was kept as a backup — restore it to make it the current one, or keep the other.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {conflicts.map(c => (
                  <div key={c.ts} style={{ border: `0.5px solid ${SAND}`, borderRadius: 6, padding: '8px 10px', background: '#fff' }}>
                    <div style={{ fontSize: 11, color: SLATE, fontWeight: 600 }}>
                      {TABLE_LABEL[c.table] || c.table}
                      <span style={{ color: STONE, fontWeight: 400, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                        {' '}· {c.localVersion?.code || c.localVersion?.name || c.id?.slice(0, 8)}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: STONE, marginTop: 2 }}>{timeAgo(new Date(c.ts).toISOString())}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => handleRestore(c)}
                        disabled={busy}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#fff', color: SLATE, border: `0.5px solid ${SLATE}`, borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
                      >
                        <RotateCcw size={11} /> Restore mine
                      </button>
                      <button
                        onClick={() => { acknowledgeConflict(c.ts); setConflicts(getUnresolvedConflicts()); }}
                        disabled={busy}
                        style={{ padding: '4px 10px', background: 'none', color: STONE, border: `0.5px solid ${SAND}`, borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Keep theirs
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#fff', border: `0.5px solid ${SAND}`, borderRadius: 18, boxShadow: '0 2px 8px rgba(58,58,58,0.10)', cursor: 'pointer' }}
        title="Sync status"
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: SLATE, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      </button>

      <style>{'@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
