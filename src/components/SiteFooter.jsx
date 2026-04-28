// @ts-check
// SiteFooter — minimal footer mounted at the bottom of the FR app
// dashboard shell (NOT on /legal/* pages — those have their own
// PolicyFooter via LegalLayout, and NOT inside the PLM tab content
// either).
//
// Layout: two columns, both top-aligned and left-aligned within their
// own column. The right column lists every policy at the same x-offset
// as "Legal" (no indentation) so the eye doesn't have to track jagged
// indents.
//
// Visual hierarchy:
//   • Policy titles: slate (#3A3A3A) — equally prominent regardless of
//     whether they're live or "Coming soon". Live entries are <Link>s,
//     pending ones are plain <span>s, but they share the same weight so
//     the column reads as one consistent list.
//   • Underpinnings (Last reviewed, Coming soon, Version history): a
//     light, low-contrast tone so they read as metadata sitting under
//     the policy title rather than a separate item.

import { Link } from 'react-router-dom';
import { POLICY_INDEX } from '../lib/legal/constants';
import LastReviewed from './legal/LastReviewed';

const LABEL_COLOR = '#3A3A3A';      // slate — primary text + policy titles
const META_COLOR = 'rgba(58,58,58,0.45)';  // muted underpinning
const EYEBROW_COLOR = '#9A9A9A';    // section eyebrow + brand kicker

export default function SiteFooter() {
  return (
    <footer
      style={{
        marginTop: 48,
        padding: '28px 24px 36px',
        borderTop: '0.5px solid #EBE5D5',
        background: 'transparent',
        fontFamily: "'Inter', sans-serif",
        color: LABEL_COLOR,
        fontSize: 12,
      }}
    >
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 32,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        {/* Brand column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 14,
            letterSpacing: '0.05em',
            color: LABEL_COLOR,
          }}>
            FOREIGN RESOURCE
          </div>
          <div style={{ color: META_COLOR, fontSize: 11 }}>
            © 2026 Foreign Resource Co.
          </div>
        </div>

        {/* Security & Privacy column — every row left-aligned at the
            same x. Eyebrow sits at the top, then a flat list of: the
            section landing link, three policy titles each with a
            metadata underpinning, then a Version history link at the
            bottom. Top-aligned with the brand column. */}
        <nav aria-label="Security &amp; privacy" style={{ minWidth: 240 }}>
          <div style={{
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: EYEBROW_COLOR,
            marginBottom: 10,
          }}>
            Security &amp; Privacy
          </div>

          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <li>
              <Link to="/legal" style={{ color: LABEL_COLOR, textDecoration: 'none', fontWeight: 500 }}>
                Legal
              </Link>
            </li>

            {POLICY_INDEX.map(p => (
              <li key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {p.live
                  ? (
                    <Link to={`/legal/${p.slug}`} style={{ color: LABEL_COLOR, textDecoration: 'none' }}>
                      {p.title}
                    </Link>
                  )
                  : (
                    <span style={{ color: LABEL_COLOR }}>{p.title}</span>
                  )
                }
                {p.live
                  ? <LastReviewed policy={p.id} style={{ fontSize: 10, color: META_COLOR, letterSpacing: '0.02em' }} />
                  : <span style={{ fontSize: 10, color: META_COLOR, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Coming soon</span>
                }
              </li>
            ))}

            <li>
              <Link to="/legal/version-history" style={{
                color: META_COLOR,
                textDecoration: 'none',
                fontSize: 11,
              }}>
                Version history
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
