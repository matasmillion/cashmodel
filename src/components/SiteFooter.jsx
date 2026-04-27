// @ts-check
// SiteFooter — minimal footer mounted at the bottom of the FR app
// dashboard shell (NOT on /legal/* pages — those have their own
// PolicyFooter via LegalLayout, and NOT inside the PLM tab content
// either).
//
// This first cut surfaces a "Security & Privacy" group with a Legal
// link. Prompts 2 and 3 will fill in Data Retention and Access Control
// once those pages land — for now they show as muted "Coming soon" to
// match the /legal index.

import { Link } from 'react-router-dom';
import { POLICY_INDEX } from '../lib/legal/constants';

export default function SiteFooter() {
  return (
    <footer
      style={{
        marginTop: 48,
        padding: '24px 24px 32px',
        borderTop: '0.5px solid #EBE5D5',
        background: 'transparent',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        color: '#716F70',
        fontSize: 11,
      }}>
        <div>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 14,
            letterSpacing: '0.05em',
            color: '#3A3A3A',
          }}>
            FOREIGN RESOURCE
          </div>
          <div style={{ marginTop: 4 }}>© 2026 Foreign Resource Co.</div>
        </div>

        <nav aria-label="Security &amp; privacy" style={{ minWidth: 200 }}>
          <div style={{
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#9A9A9A',
            marginBottom: 8,
          }}>
            Security &amp; Privacy
          </div>
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 12,
          }}>
            <li>
              <Link to="/legal" style={{ color: '#3A3A3A', textDecoration: 'none' }}>
                Legal
              </Link>
            </li>
            {POLICY_INDEX.map(p => (
              <li key={p.id} style={{ paddingLeft: 12 }}>
                {p.live
                  ? (
                    <Link to={`/legal/${p.slug}`} style={{ color: '#3A3A3A', textDecoration: 'none' }}>
                      {p.title}
                    </Link>
                  )
                  : (
                    <span style={{ color: 'rgba(58,58,58,0.45)' }}>
                      {p.title} <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>· Coming soon</span>
                    </span>
                  )
                }
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
