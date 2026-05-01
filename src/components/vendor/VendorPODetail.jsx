// @ts-check
// Single-PO detail view. Includes an "Acknowledge" button that records
// the vendor's confirmation in vendor_po_acknowledgements (append-only).

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useT, useLocale, formatDate, formatNumber } from '../../i18n';
import { getVendorPO, acknowledgeVendorPO } from '../../utils/vendorPortalStore';

const CARD = {
  background: '#FFFFFF',
  border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8,
  padding: 22,
};

export default function VendorPODetail() {
  const { id } = useParams();
  const t = useT();
  const { locale } = useLocale();
  const [po, setPO] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acked, setAcked] = useState(false);

  useEffect(() => {
    let mounted = true;
    getVendorPO(id).then(r => { if (mounted) { setPO(r); setLoading(false); } });
    return () => { mounted = false; };
  }, [id]);

  if (loading) return <p>{t('vendor.common.loading')}</p>;
  if (!po) return <p>{t('vendor.common.empty')}</p>;

  const onAck = async () => {
    setAcked(true);
    await acknowledgeVendorPO(po.id);
  };

  return (
    <div>
      <Link to="/vendor/pos" style={{ fontSize: 12, color: '#716F70' }}>
        ← {t('vendor.common.back')}
      </Link>

      <h2 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        fontSize: 28,
        margin: '12px 0 24px',
      }}>
        <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 24 }}>
          {po.code || po.id}
        </span>
      </h2>

      <section style={{ ...CARD, marginBottom: 16 }}>
        <Row label={t('vendor.po.style')} value={po.style_id || '—'} />
        <Row label={t('vendor.po.units')} value={formatNumber(po.units, locale)} />
        <Row label={t('vendor.po.placedAt')} value={po.placed_at ? formatDate(po.placed_at, locale) : '—'} />
        <Row label={t('vendor.po.detail.notes')} value={po.notes || '—'} />
      </section>

      <section style={CARD}>
        <h3 style={{ margin: 0, marginBottom: 8, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400 }}>
          {t('vendor.po.detail.ack')}
        </h3>
        <p style={{ fontSize: 13, color: '#716F70', margin: '0 0 16px' }}>
          {t('vendor.po.detail.ackHint')}
        </p>
        <button
          type="button"
          disabled={acked}
          onClick={onAck}
          style={{
            background: acked ? '#EBE5D5' : '#3A3A3A',
            color: acked ? '#3A3A3A' : '#F5F0E8',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 13,
            cursor: acked ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {acked ? t('vendor.common.acknowledged') : t('vendor.common.acknowledge')}
        </button>
      </section>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(58,58,58,0.08)' }}>
      <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#716F70' }}>{label}</span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}
