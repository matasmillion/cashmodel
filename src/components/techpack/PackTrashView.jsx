// Trash view for trim packs / tech packs — opens as a modal, lists every
// soft-deleted pack for the org with Restore + Delete-Forever actions.
//
// Restore moves the pack back into the active list (deleted_at → null,
// Storage files were never touched). Delete-forever invokes the store's
// purge function which hard-deletes the row + every Storage object the
// pack referenced.

import { useEffect, useState } from 'react';
import { Trash2, RotateCcw, X, AlertTriangle } from 'lucide-react';
import { FR } from './techPackConstants';
import CoverThumb from './CoverThumb';

const RETENTION_DAYS = 30;

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

// Days remaining before this row is auto-purged. Rows are eligible for
// purge once they've been in trash longer than RETENTION_DAYS.
function daysUntilPurge(deletedAtIso) {
  if (!deletedAtIso) return RETENTION_DAYS;
  const deletedMs = new Date(deletedAtIso).getTime();
  if (Number.isNaN(deletedMs)) return RETENTION_DAYS;
  const ageMs = Date.now() - deletedMs;
  const remainingMs = RETENTION_DAYS * 24 * 60 * 60 * 1000 - ageMs;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

export default function PackTrashView({
  title,
  emptyHint,
  list,        // async () => [{ id, ..., deleted_at, cover_image }]
  restore,     // async (id) => void
  purge,       // async (id) => void
  nameOf,      // (row) => string
  onClose,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // id currently being acted on
  const [confirmingPurge, setConfirmingPurge] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await list();
      const live = Array.isArray(data) ? data : [];

      // Opportunistic purge: any row already past the retention window gets
      // hard-deleted right now. The scheduled Edge Function (purge-plm-trash)
      // is the canonical path; this is a best-effort fallback so an active
      // user surfaces a Trash list that already reflects retention rules.
      const expired = live.filter(r => daysUntilPurge(r.deleted_at) <= 0);
      if (expired.length) {
        await Promise.allSettled(expired.map(r => purge(r.id)));
      }
      setRows(live.filter(r => daysUntilPurge(r.deleted_at) > 0));
    } catch (err) {
      console.error('TrashView load:', err);
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const onRestore = async (row) => {
    setBusy(row.id);
    try {
      await restore(row.id);
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (err) { console.error('restore:', err); }
    setBusy(null);
  };

  const onPurge = async (row) => {
    setBusy(row.id);
    try {
      await purge(row.id);
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (err) { console.error('purge:', err); }
    setBusy(null);
    setConfirmingPurge(null);
  };

  return (
    <div role="dialog"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', maxHeight: '85vh', background: FR.salt, borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `0.5px solid ${FR.sand}` }}>
        <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${FR.sand}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: FR.slate, lineHeight: 1.1 }}>
              {title}
            </div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 2, letterSpacing: 0.4 }}>
              Restore brings it back to the active list. Items auto-delete after {RETENTION_DAYS} days; Delete forever is immediate.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 28, height: 28, borderRadius: 14, background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: FR.stone }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: FR.stone }}>
              {emptyHint || 'Trash is empty.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(row => (
                <div key={row.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: '#fff', borderRadius: 6, border: `0.5px solid ${FR.sand}` }}>
                  <div style={{ width: 44, height: 44, flexShrink: 0, background: FR.salt, borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${FR.sand}` }}>
                    {row.cover_image && <CoverThumb src={row.cover_image} alt="" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: FR.slate, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nameOf(row) || 'Untitled'}
                    </div>
                    <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, letterSpacing: 0.3, display: 'flex', gap: 8 }}>
                      <span>Deleted {formatDate(row.deleted_at)}</span>
                      <span style={{ color: daysUntilPurge(row.deleted_at) <= 3 ? '#854F0B' : FR.stone }}>
                        · auto-deletes in {daysUntilPurge(row.deleted_at)} day{daysUntilPurge(row.deleted_at) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  {confirmingPurge === row.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#A32D2D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={11} /> Forever?
                      </span>
                      <button onClick={() => onPurge(row)} disabled={busy === row.id}
                        style={{ padding: '4px 10px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: busy === row.id ? 'wait' : 'pointer' }}>
                        Yes, delete
                      </button>
                      <button onClick={() => setConfirmingPurge(null)}
                        style={{ padding: '4px 10px', background: 'transparent', color: FR.stone, border: `0.5px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => onRestore(row)} disabled={busy === row.id}
                        title="Restore"
                        style={{ padding: '5px 10px', background: FR.salt, color: FR.slate, border: `0.5px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: busy === row.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <RotateCcw size={11} /> Restore
                      </button>
                      <button onClick={() => setConfirmingPurge(row.id)} disabled={busy === row.id}
                        title="Delete forever"
                        style={{ padding: '5px 10px', background: 'transparent', color: '#A32D2D', border: `0.5px solid rgba(163,45,45,0.3)`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: busy === row.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Trash2 size={11} /> Delete forever
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
