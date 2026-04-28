// @ts-check
// /legal/version-history — placeholder until v2 of any policy ships.
// Reviewers (Plaid, search engines) get a real page rather than a 404
// when they follow links from a future "what changed?" reference.

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { POLICY_INDEX, POLICY_META, PUBLIC_BASE_URL } from '../../../lib/legal/constants';
import { usePageMeta } from '../../../hooks/usePageMeta';

const CANONICAL = `${PUBLIC_BASE_URL}/legal/version-history`;

export default function VersionHistoryPage() {
  usePageMeta({
    title: 'Version History — Foreign Resource Legal',
    description:
      'Version history for the policies published on /legal. Currently every policy is at v1.0; this page will be filled in on the next material update.',
    canonical: CANONICAL,
    ogTitle: 'Version History — Foreign Resource Legal',
    ogType: 'article',
  });

  return (
    <article>
      <header style={{ marginBottom: 32 }}>
        <Link
          to="/legal"
          style={{
            fontSize: 12,
            color: '#716F70',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 18,
          }}
        >
          <ArrowLeft size={13} /> All policies
        </Link>
        <div style={{
          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(58,58,58,0.55)', marginBottom: 10,
        }}>
          Foreign Resource Co.
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: 40,
          lineHeight: 1.1,
          color: '#3A3A3A',
          margin: 0,
        }}>
          Version history
        </h1>
      </header>

      <p style={{
        fontSize: 15,
        lineHeight: 1.7,
        color: '#3A3A3A',
        margin: '0 0 18px',
      }}>
        Version history will be published on the next material update. Until
        then, every policy on /legal is at v1.0, effective {POLICY_META.infosec.effective}.
        Material change includes a substantive shift in scope, control surface,
        retention behavior, or access model — minor copy edits do not bump the
        version.
      </p>

      <p style={{
        fontSize: 14,
        lineHeight: 1.7,
        color: '#3A3A3A',
        margin: '0 0 28px',
      }}>
        Each future revision will list: version, effective date, summary of the
        material change, link to the prior PDF (preserved at a versioned URL),
        and the diff URL in the source repository.
      </p>

      <section style={{
        background: '#fff',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 8,
        padding: '20px 22px',
      }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(58,58,58,0.55)', marginBottom: 12,
        }}>
          Current versions
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {POLICY_INDEX.map(p => {
            const meta = POLICY_META[p.id];
            return (
              <li key={p.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <span style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 17,
                  color: '#3A3A3A',
                }}>
                  {p.title}
                </span>
                <span style={{ color: 'rgba(58,58,58,0.6)' }}>
                  {p.live ? `v${meta.version} · effective ${meta.effective}` : `v${meta.version} · pending publication`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
