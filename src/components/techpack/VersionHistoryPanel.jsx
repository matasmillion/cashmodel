// VersionHistoryPanel — calm, browsable list of a record's saved versions with
// one-click Restore. Replaces the scary "Restore mine / Keep theirs" conflict
// popup: every meaningful save (and any version that lost a multi-device clash)
// is captured in the local version vault, and the operator restores any of them
// here. Restoring applies the snapshot to the open editor immediately (the
// builder's setData/setImages), so there's no reload and no cloud round-trip.
//
// FR palette only. No emojis.

import { useEffect, useState } from 'react';
import { X, RotateCcw, History } from 'lucide-react';
import { listVersions, onVersionHistory } from '../../utils/versionHistoryStore';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#8A8278' };

function timeAgo(ts) {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function VersionHistoryPanel({ table, id, open, onClose, onRestore }) {
  const [versions, setVersions] = useState([]);

  useEffect(() => {
    if (!open || !table || !id) return undefined;
    const refresh = () => setVersions(listVersions(table, id));
    refresh();
    const off = onVersionHistory(refresh);
    return () => off();
  }, [open, table, id]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.35)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 440, maxHeight: '72vh', background: '#fff', border: `0.5px solid ${FR.sand}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(58,58,58,0.22)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `0.5px solid ${FR.sand}`, background: FR.salt }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: FR.slate, fontFamily: "'General Sans', 'Inter', sans-serif" }}>
            <History size={15} /> Version history
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FR.stone, lineHeight: 0 }}><X size={16} /></button>
        </div>

        <div style={{ padding: '6px 0', overflowY: 'auto' }}>
          {versions.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 12, color: FR.stone, fontStyle: 'italic', lineHeight: 1.6 }}>
              No saved versions yet. As you edit this style, point-in-time backups
              appear here automatically — restore any of them with one click.
            </div>
          ) : versions.map((v, i) => (
            <div key={v.ts} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 16px', borderBottom: `0.5px solid ${FR.salt}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: FR.slate, fontWeight: 500 }}>
                  {new Date(v.ts).toLocaleString()}{i === 0 ? '  ·  current' : ''}
                </div>
                <div style={{ fontSize: 10.5, color: FR.stone, marginTop: 1 }}>
                  {timeAgo(v.ts)} · {v.reason === 'clash-backup' ? 'kept after a device clash' : 'auto-saved'}
                </div>
              </div>
              <button
                onClick={() => { onRestore?.(v); onClose?.(); }}
                disabled={i === 0}
                title={i === 0 ? 'This is the current version' : 'Restore this version'}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: '#fff', color: i === 0 ? FR.stone : FR.slate, border: `0.5px solid ${i === 0 ? FR.sand : FR.slate}`, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: i === 0 ? 'default' : 'pointer', flexShrink: 0, opacity: i === 0 ? 0.55 : 1 }}
              >
                <RotateCcw size={11} /> Restore
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 16px', borderTop: `0.5px solid ${FR.sand}`, fontSize: 10.5, color: FR.stone, lineHeight: 1.5 }}>
          Restoring brings a past version back into the editor. Your current version
          stays in this list, so a restore is always reversible.
        </div>
      </div>
    </div>
  );
}
