// Per-vendor email/notification audit. Renders inside VendorEditor
// below the Portal Access panel — same surface, same vendor scope, so
// the operator never has to leave the vendor card to confirm "did the
// PO email actually go out for Lin's last order?"
//
// Reads vendor_notifications via vendorNotificationStore.

import { useCallback, useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { listVendorNotifications } from '../../utils/vendorNotificationStore';

const STATUS_COLORS = {
  sent:    { fg: '#3B6D11', bg: 'rgba(59,109,17,0.10)' },
  pending: { fg: '#854F0B', bg: 'rgba(133,79,11,0.10)' },
  failed:  { fg: '#A32D2D', bg: 'rgba(163,45,45,0.10)' },
};

const EVENT_LABELS = {
  'po.placed': 'PO placed',
  'sample.requested': 'Sample requested',
};

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{
      fontSize: 9,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '3px 8px',
      borderRadius: 5,
      color: c.fg,
      background: c.bg,
      fontWeight: 600,
    }}>{status || 'pending'}</span>
  );
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

export default function VendorNotificationLog({ vendorName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listVendorNotifications(vendorName, { limit: 25 });
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [vendorName]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: FR.slate, letterSpacing: '0.04em' }}>
            NOTIFICATION HISTORY
          </div>
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
            Emails sent to this vendor — POs, sample requests, delivery status.
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          style={{ background: 'transparent', border: `1px solid ${FR.sand}`, color: FR.stone, fontSize: 10, padding: '4px 10px', borderRadius: 3, cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: FR.stone, padding: 10 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 11, color: FR.stone, padding: 12, background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 4, textAlign: 'center' }}>
          No notifications sent yet. New POs and sample requests will appear here.
        </div>
      ) : (
        <div style={{ border: `1px solid ${FR.sand}`, borderRadius: 4, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.id}
              title={r.delivery_error || ''}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1.5fr 1fr 0.8fr',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderTop: i === 0 ? 'none' : `1px solid ${FR.sand}`,
                fontSize: 11,
                color: FR.slate,
              }}>
              <div style={{ fontSize: 10, color: FR.stone }}>{fmtDateTime(r.created_at)}</div>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {EVENT_LABELS[r.event_type] || r.event_type}
                </div>
                <div style={{ fontSize: 10, color: FR.stone, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.subject_id}
                </div>
              </div>
              <div><StatusPill status={r.delivery_status} /></div>
              <div style={{ fontSize: 10, color: FR.stone, textAlign: 'right' }}>
                {r.delivered_at ? `Sent ${fmtDateTime(r.delivered_at)}` : (r.delivery_error ? 'Hover for error' : '—')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
