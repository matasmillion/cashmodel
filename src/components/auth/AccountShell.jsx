// @ts-check
// AccountShell — minimal brand wrapper for /account/* pages. Mirrors
// LegalLayout's chrome (sticky brand header + readable column) so the
// surfaces feel of-a-piece. RequireAuth gates the route in App.jsx; by
// the time a child renders we know the user is signed in.

import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * @param {{ heading: string; eyebrow?: string; children: any }} props
 */
export default function AccountShell({ heading, eyebrow = 'Account', children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F0E8',
      color: '#3A3A3A',
      fontFamily: "'Inter', sans-serif",
    }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(245,240,232,0.95)',
        backdropFilter: 'saturate(140%) blur(6px)',
        borderBottom: '0.5px solid rgba(58,58,58,0.15)',
      }}>
        <div style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <Link to="/account/security" style={{
            textDecoration: 'none',
            color: '#3A3A3A',
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 2,
          }}>
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
              {eyebrow}
            </span>
          </Link>
          <Link to="/" style={{
            fontSize: 12,
            color: '#716F70',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            Back to app <ArrowUpRight size={13} />
          </Link>
        </div>
      </header>

      <main style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '40px 24px 80px',
      }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(58,58,58,0.55)', marginBottom: 10,
        }}>
          Foreign Resource Co.
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: 38,
          lineHeight: 1.1,
          color: '#3A3A3A',
          margin: 0,
          marginBottom: 28,
        }}>
          {heading}
        </h1>
        {children}
      </main>
    </div>
  );
}
