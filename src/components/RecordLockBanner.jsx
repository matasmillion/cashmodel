// Read-only banner shown when another teammate holds the edit lock on a record.
// Brand-styled (amber warn). No actions — the lock auto-releases when the holder
// finishes or their session times out, at which point the view promotes itself
// to editable. Used by the atom / style / PO builders alongside useRecordLock.

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', amber: '#854F0B', sand: '#EBE5D5' };

export default function RecordLockBanner({ holder, noun = 'record' }) {
  const who = holder?.userName || holder?.userId || 'Someone';
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#FBF3E6', border: `0.5px solid ${FR.amber}`, borderRadius: 8,
        padding: '10px 14px', margin: '0 0 14px',
        color: FR.amber, fontSize: 12.5, lineHeight: 1.5,
        fontFamily: "'General Sans', 'Inter', 'Helvetica Neue', sans-serif",
      }}
    >
      <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>READ-ONLY</span>
      <span style={{ color: FR.slate }}>
        {who} is editing this {noun}. You can view it, but it'll unlock for editing
        once they finish or step away.
      </span>
    </div>
  );
}
