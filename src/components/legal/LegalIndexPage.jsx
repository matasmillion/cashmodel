// @ts-check
// /legal — the landing page that lists every published policy. Pulls
// the entries from POLICY_INDEX so each prompt only has to flip a
// `live` flag to surface a new policy (and update its slug if needed).
//
// "Coming soon" rows render with disabled styling and no link. Live
// rows render as <Link>s into the per-policy detail page.

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { POLICY_INDEX, PUBLIC_BASE_URL } from '../../lib/legal/constants';
import { usePageMeta } from '../../hooks/usePageMeta';

export default function LegalIndexPage() {
  usePageMeta({
    title: 'Legal — Foreign Resource',
    description:
      'Information Security, Data Retention, and Access Control policies governing how Foreign Resource Co. operates its internal ERP and protects banking, business, and (forthcoming) consumer data.',
    canonical: `${PUBLIC_BASE_URL}/legal`,
    ogTitle: 'Legal — Foreign Resource',
    ogType: 'website',
  });

  return (
    <article>
      <header style={{ marginBottom: 36 }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(58,58,58,0.55)', marginBottom: 10,
        }}>
          Foreign Resource Co.
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: 42,
          lineHeight: 1.1,
          color: '#3A3A3A',
          margin: 0,
        }}>
          Legal
        </h1>
        <p style={{
          marginTop: 18,
          fontSize: 15,
          lineHeight: 1.7,
          color: '#3A3A3A',
          maxWidth: 600,
        }}>
          The policies below govern how Foreign Resource Co. operates its
          internal ERP and protects banking, business, and (forthcoming)
          consumer data. They are published publicly for transparency and
          to support our partners&rsquo; review processes.
        </p>
      </header>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {POLICY_INDEX.map(p => (
          <li key={p.id}>
            {p.live
              ? <PolicyRow live to={`/legal/${p.slug}`} title={p.title} summary={p.summary} />
              : <PolicyRow title={p.title} summary={p.summary} />}
          </li>
        ))}
      </ul>
    </article>
  );
}

/**
 * @param {{ title: string; summary: string; live?: boolean; to?: string }} props
 */
function PolicyRow({ title, summary, live, to }) {
  const card = (
    <div style={{
      background: '#fff',
      border: '0.5px solid rgba(58,58,58,0.15)',
      borderRadius: 8,
      padding: '20px 22px',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      opacity: live ? 1 : 0.55,
      cursor: live ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s, transform 0.15s',
    }}
    onMouseEnter={live ? (e) => {
      e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    } : undefined}
    onMouseLeave={live ? (e) => {
      e.currentTarget.style.boxShadow = 'none';
      e.currentTarget.style.transform = 'none';
    } : undefined}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: 22,
          color: '#3A3A3A',
          lineHeight: 1.2,
          marginBottom: 6,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: '#3A3A3A',
        }}>
          {summary}
        </div>
      </div>
      <div style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: live ? '#3A3A3A' : 'rgba(58,58,58,0.5)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        marginTop: 4,
      }}>
        {live ? <>Read <ArrowRight size={13} /></> : 'Coming soon'}
      </div>
    </div>
  );
  return live && to
    ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>
    : card;
}
