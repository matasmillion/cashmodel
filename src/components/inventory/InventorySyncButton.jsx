// Manual Shopify sync button for the inventory module. Triggers
// syncShopifyInventory() and shows a parity summary (variant count,
// total on-hand, units sold L90, oversold) so the operator can
// compare against Shopify Admin → Products at a glance.

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { syncShopifyInventory } from '../../utils/liveDataSync';
import { readLocal as readSnapshot } from '../../utils/sellThroughStore';
import { INV, FADE, TYPE } from './inventoryTokens';

export default function InventorySyncButton({ onSynced }) {
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [report, setReport]   = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);

  // Hydrate "last synced" from localStorage on mount.
  useEffect(() => {
    const snap = readSnapshot();
    if (snap?.syncedAt) setSyncedAt(snap.syncedAt);
  }, []);

  async function handleSync() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await syncShopifyInventory();
      setReport(r);
      setSyncedAt(r.syncedAt);
      if (onSynced) onSynced(r);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 14,
      padding: '8px 12px',
      background: INV.card,
      border: `1px solid ${FADE.slate10}`,
      borderRadius: 4,
    }}>
      <button
        onClick={handleSync}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: busy ? FADE.slate10 : INV.slate,
          color: INV.salt,
          border: 'none',
          padding: '6px 12px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: TYPE.sans,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <RefreshCw size={11} className={busy ? 'spin' : undefined} />
        {busy ? 'Syncing…' : 'Sync from Shopify'}
      </button>

      {syncedAt && !busy && (
        <span style={{ fontSize: 10, color: FADE.slate60, fontFamily: TYPE.sans, letterSpacing: '0.06em' }}>
          Last synced {formatRelative(syncedAt)}
        </span>
      )}

      {report && (
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: 16,
          fontSize: 10,
          color: FADE.slate60,
          fontFamily: TYPE.sans,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          <ReportField label="Variants" value={report.variantCount.toLocaleString()} />
          <ReportField label="On hand"  value={report.totalOnHand.toLocaleString()} />
          <ReportField label="Sold L90" value={report.soldL90.toLocaleString()} />
          {report.oversold > 0 && (
            <ReportField label="Oversold" value={report.oversold} color={INV.bad} />
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginLeft: 'auto',
          fontSize: 10,
          color: INV.bad,
          fontFamily: TYPE.sans,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function ReportField({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ fontSize: 9, color: FADE.slate60 }}>{label}</span>
      <span style={{
        fontSize: 12,
        fontFamily: TYPE.mono,
        fontVariantNumeric: 'tabular-nums',
        color: color || INV.slate,
        textTransform: 'none',
        letterSpacing: 'normal',
      }}>
        {value}
      </span>
    </div>
  );
}

function formatRelative(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
