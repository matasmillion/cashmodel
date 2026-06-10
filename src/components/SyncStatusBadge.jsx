// Floating sync status badge — the operator's at-a-glance "is my work safe?"
// indicator. Bottom-LEFT (the inventory agent chat owns bottom-right). Shows:
//   • online / offline dot
//   • "Syncing · N left" while edits are parked in the durable outbox
//   • "Synced · <time>" when the outbox is empty
//
// No conflict prompt. For a solo operator the cloud is a SILENT background
// backup, never a boss — so a multi-device edit clash is resolved quietly and
// the version that didn't win is preserved in Version History (browse + restore
// from a style's "History" button), never surfaced as a scary red
// "Restore mine / Keep theirs" popup.
//
// FR palette only. No emojis.

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, X } from 'lucide-react';
import { isOnline, onConnectivityChange } from '../utils/connectivity';
import { onQueueChange, queueLength, getLastSyncAt, syncNow } from '../utils/syncQueue';

const SALT = '#F5F0E8';
const SLATE = '#3A3A3A';
const SAND = '#EBE5D5';
const STONE = '#8A8278';
const GREEN = '#3B6D11';
const AMBER = '#854F0B';

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
  const [lastSync, setLastSync] = useState(getLastSyncAt());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const offConn = onConnectivityChange(setOnline);
    const offQ = onQueueChange((n) => { setPending(n); setLastSync(getLastSyncAt()); });
    // Re-render the relative time periodically.
    const t = setInterval(() => setLastSync(getLastSyncAt()), 30000);
    return () => { offConn(); offQ(); clearInterval(t); };
  }, []);

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

  const dotColor = online ? (pending > 0 ? AMBER : GREEN) : STONE;
  const label = !online
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
            <div style={{ fontSize: 10, color: STONE, lineHeight: 1.5, marginTop: 2 }}>
              Your work is saved on this device first; the cloud syncs it in the
              background and keeps your two computers in step. Past versions of a
              style are kept under its “History” button.
            </div>
          </div>
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
