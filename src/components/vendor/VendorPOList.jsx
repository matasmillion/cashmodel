// @ts-check
// Vendor PO list. Reads through vendorPortalStore — every cost field
// is already stripped at the store layer, so the table never needs to
// branch on permissions.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, useLocale, formatDate, formatNumber } from '../../i18n';
import { listVendorPOs } from '../../utils/vendorPortalStore';

const STATUS_COLORS = {
  placed: '#3A3A3A',
  in_production: '#854F0B',
  received: '#3B6D11',
  closed: '#716F70',
  cancelled: '#A32D2D',
};

function StatusPill({ status }) {
  const t = useT();
  return (
    <span style={{
      fontSize: 11,
      letterSpacing: '0.06em',
      padding: '5px 12px',
      borderRadius: 5,
      background: '#FFFFFF',
      border: `0.5px solid ${STATUS_COLORS[status] || '#3A3A3A'}`,
      color: STATUS_COLORS[status] || '#3A3A3A',
      textTransform: 'uppercase',
    }}>
      {t(`vendor.po.status.${status}`)}
    </span>
  );
}

export default function VendorPOList() {
  const t = useT();
  const { locale } = useLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    listVendorPOs().then(r => { if (mounted) { setRows(r); setLoading(false); } });
    return () => { mounted = false; };
  }, []);

  if (loading) return <p>{t('vendor.common.loading')}</p>;
  if (rows.length === 0) return <p>{t('vendor.common.empty')}</p>;

  return (
    <div>
      <h2 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        fontSize: 28,
        margin: '0 0 24px',
      }}>
        {t('vendor.po.title')}
      </h2>

      <div style={{
        background: '#FFFFFF',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#FAF7F1', textAlign: 'left' }}>
              <th style={th}>{t('vendor.po.number')}</th>
              <th style={th}>{t('vendor.po.style')}</th>
              <th style={th}>{t('vendor.po.units')}</th>
              <th style={th}>{t('vendor.po.placedAt')}</th>
              <th style={th}>{t('vendor.common.open')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(po => (
              <tr key={po.id} style={{ borderTop: '0.5px solid rgba(58,58,58,0.08)' }}>
                <td style={td}>
                  <Link
                    to={`/vendor/pos/${po.id}`}
                    style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: '#3A3A3A' }}
                  >
                    {po.code || po.id}
                  </Link>
                </td>
                <td style={td}>{po.style_id || '—'}</td>
                <td style={td}>{formatNumber(po.units, locale)}</td>
                <td style={td}>{po.placed_at ? formatDate(po.placed_at, locale) : '—'}</td>
                <td style={td}><StatusPill status={po.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: '12px 18px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#716F70', fontWeight: 500 };
const td = { padding: '14px 18px', verticalAlign: 'middle' };
