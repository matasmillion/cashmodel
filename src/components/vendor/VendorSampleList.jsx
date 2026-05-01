// @ts-check
// Vendor-facing sample requests. Internal `cost_per_unit_usd`,
// `internal_notes`, and `rating` are stripped at the store layer.

import { useEffect, useState } from 'react';
import { useT, useLocale, formatDate } from '../../i18n';
import { listVendorSamples } from '../../utils/vendorPortalStore';

export default function VendorSampleList() {
  const t = useT();
  const { locale } = useLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    listVendorSamples().then(r => { if (mounted) { setRows(r); setLoading(false); } });
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
        {t('vendor.sample.title')}
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
              <th style={th}>{t('vendor.sample.style')}</th>
              <th style={th}>{t('vendor.sample.type')}</th>
              <th style={th}>{t('vendor.sample.requestedAt')}</th>
              <th style={th}>{t('vendor.common.open')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} style={{ borderTop: '0.5px solid rgba(58,58,58,0.08)' }}>
                <td style={td}>{s.style_id || '—'}</td>
                <td style={td}>{s.sample_type || '—'}</td>
                <td style={td}>{s.requested_at ? formatDate(s.requested_at, locale) : '—'}</td>
                <td style={td}>
                  <span style={{
                    fontSize: 11,
                    padding: '5px 12px',
                    borderRadius: 5,
                    background: '#FAF7F1',
                    border: '0.5px solid rgba(58,58,58,0.15)',
                  }}>
                    {t(`vendor.sample.verdict.${s.verdict || 'Pending'}`)}
                  </span>
                </td>
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
