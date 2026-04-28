// @ts-check
// LegalLayout — the standalone shell for every /legal/* page. Sticky
// brand header at the top, a max-width readable column (~720px) for
// the body, and a quiet "Back to app" link in the header.
//
// This layout is rendered OUTSIDE the FR app dashboard nav, on purpose:
// reviewers (Plaid) and search engines see the legal pages as
// standalone, customer-facing surfaces. The PLM tab nav, AuthGate, and
// Supabase session are deliberately not part of this tree.

import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * @param {{ children: any }} props
 */
export default function LegalLayout({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F0E8',
      color: '#3A3A3A',
      fontFamily: "'Inter', sans-serif",
    }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(245,240,232,0.95)',
          backdropFilter: 'saturate(140%) blur(6px)',
          borderBottom: '0.5px solid rgba(58,58,58,0.15)',
        }}
      >
        <div style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <Link
            to="/legal"
            style={{
              textDecoration: 'none',
              color: '#3A3A3A',
              display: 'inline-flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 22,
              letterSpacing: '0.05em',
            }}>
              FOREIGN RESOURCE
            </span>
            <span style={{
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#716F70',
            }}>
              Legal
            </span>
          </Link>
          <Link
            to="/"
            style={{
              fontSize: 12,
              color: '#716F70',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Back to app <ArrowUpRight size={13} />
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '48px 24px 96px',
        }}
      >
        {children}
      </main>
    </div>
  );
}
