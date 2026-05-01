// @ts-check
// Vendor dashboard — top-of-portal landing. Shows two cards: open POs
// and open sample requests. Numbers come from the vendor-scoped store.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { listVendorPOs, listVendorSamples } from '../../utils/vendorPortalStore';

const CARD = {
  background: '#FFFFFF',
  border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8,
  padding: 22,
};

const STAT = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: 36,
  lineHeight: 1,
  margin: 0,
};

const LABEL = {
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#716F70',
  marginBottom: 8,
};

const LINK = {
  display: 'inline-block',
  marginTop: 14,
  fontSize: 12,
  color: '#3A3A3A',
  textDecoration: 'underline',
  textUnderlineOffset: 4,
};

export default function VendorDashboard() {
  const t = useT();
  const [pos, setPos] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([listVendorPOs(), listVendorSamples()])
      .then(([p, s]) => {
        if (!mounted) return;
        setPos(p); setSamples(s); setLoading(false);
      })
      .catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const openPos = pos.filter(p => p.status === 'placed' || p.status === 'in_production').length;
  const openSamples = samples.filter(s => s.verdict === 'Pending' || !s.verdict).length;

  if (loading) return <p>{t('vendor.common.loading')}</p>;

  return (
    <div>
      <h2 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        fontSize: 28,
        margin: '0 0 24px',
      }}>
        {t('vendor.dashboard.title')}
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
      }}>
        <section style={CARD}>
          <div style={LABEL}>{t('vendor.dashboard.newPOs')}</div>
          <p style={STAT}>{openPos}</p>
          <Link to="/vendor/pos" style={LINK}>{t('vendor.dashboard.seeAllPOs')}</Link>
        </section>
        <section style={CARD}>
          <div style={LABEL}>{t('vendor.dashboard.newSamples')}</div>
          <p style={STAT}>{openSamples}</p>
          <Link to="/vendor/samples" style={LINK}>{t('vendor.dashboard.seeAllSamples')}</Link>
        </section>
      </div>

      <p style={{ marginTop: 32, fontSize: 12, color: '#716F70' }}>
        {t('vendor.common.contact')}
      </p>
    </div>
  );
}
