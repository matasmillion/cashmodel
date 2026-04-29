// Compact sync status pill — surfaces auto-sync state from AppContext.
// Hidden until either a sync has run or sources exist; otherwise shows
// status + last-synced timestamp and acts as a manual re-sync button.

import { RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function SyncIndicator() {
  const { autoSyncState, triggerAutoSync } = useApp();
  const { status, sources, errors, syncedAt } = autoSyncState;

  if (status === 'idle' && sources.length === 0 && !syncedAt) return null;

  const timeAgo = syncedAt ? (() => {
    const secs = Math.floor((Date.now() - new Date(syncedAt).getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  })() : '';

  const cfg = {
    syncing: { icon: Loader, label: 'Syncing…', color: '#716F70', spin: true },
    ok:      { icon: CheckCircle, label: `Synced ${timeAgo}`, color: '#4CAF7D' },
    partial: { icon: AlertCircle, label: `Partial sync ${timeAgo}`, color: '#D97706' },
    error:   { icon: AlertCircle, label: 'Sync failed', color: '#C0392B' },
    idle:    { icon: RefreshCw, label: 'Sync', color: '#716F70' },
  }[status] || {};

  const Icon = cfg.icon;
  const tooltip = Object.keys(errors || {}).length
    ? Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(' · ')
    : `Sources: ${sources.join(', ') || 'none connected'}`;

  return (
    <button
      onClick={triggerAutoSync}
      disabled={status === 'syncing'}
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'transparent',
        border: '0.5px solid rgba(58,58,58,0.12)',
        color: cfg.color,
        fontSize: 11,
        fontFamily: "'Inter', sans-serif",
        letterSpacing: '0.02em',
        cursor: status === 'syncing' ? 'wait' : 'pointer',
        transition: 'background 160ms ease, border-color 160ms ease',
      }}
      onMouseEnter={e => {
        if (status === 'syncing') return;
        e.currentTarget.style.background = 'rgba(235,229,213,0.55)';
        e.currentTarget.style.borderColor = 'rgba(58,58,58,0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'rgba(58,58,58,0.12)';
      }}
    >
      <Icon size={11} className={cfg.spin ? 'animate-spin' : ''} strokeWidth={1.6} />
      <span>{cfg.label}</span>
    </button>
  );
}
