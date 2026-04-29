import { useApp } from '../context/AppContext';

const DOT_STYLE = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  flexShrink: 0,
  transition: 'background 300ms ease',
};

export default function SyncIndicator() {
  const { autoSyncState, triggerAutoSync } = useApp();
  const { status, sources, errors, syncedAt } = autoSyncState;

  if (status === 'idle' && sources.length === 0 && !syncedAt) return null;

  const isError  = status === 'error' || status === 'partial';
  const isSyncing = status === 'syncing';
  const color = isError ? '#C0392B' : isSyncing ? '#D97706' : '#4CAF7D';

  const tooltip = (() => {
    if (Object.keys(errors || {}).length)
      return Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(' · ');
    if (syncedAt) {
      const secs = Math.floor((Date.now() - new Date(syncedAt).getTime()) / 1000);
      if (secs < 60) return 'Synced just now';
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `Synced ${mins}m ago`;
      return `Synced ${Math.floor(mins / 60)}h ago`;
    }
    return sources.length ? `Sources: ${sources.join(', ')}` : 'Click to sync';
  })();

  return (
    <button
      onClick={triggerAutoSync}
      disabled={isSyncing}
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: 'none',
        background: 'transparent',
        cursor: isSyncing ? 'wait' : 'pointer',
        padding: 0,
        marginRight: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(58,58,58,0.07)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        className={!isError && !isSyncing ? 'sync-dot-pulse' : isSyncing ? 'sync-dot-spin' : ''}
        style={{ ...DOT_STYLE, background: color }}
      />
    </button>
  );
}
