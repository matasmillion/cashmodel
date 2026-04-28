// @ts-check
// RelatedPolicies — small footer block surfaced at the bottom of every
// /legal/<policy> page (above <PolicyFooter>). Lists the OTHER policies
// in POLICY_INDEX so a reviewer reading one policy can hop to the
// related ones without going back to /legal first.
//
// Behaviour:
//   • Excludes the policy whose page it's rendered on (passed via
//     `currentPolicyId`).
//   • Live entries are <Link>s. Pending entries render as disabled
//     rows with a "Coming soon" tag — same shape as the /legal index
//     so the visual rhythm is consistent across surfaces.
//
// One source of truth: every cross-link is driven by POLICY_INDEX, so
// flipping a policy's `live` flag in constants.js promotes it
// everywhere it's referenced (index, footer, related-policies block)
// without per-page edits.

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { POLICY_INDEX } from '../../lib/legal/constants';

/**
 * @param {{ currentPolicyId: 'infosec' | 'dataRetention' | 'accessControl' }} props
 */
export default function RelatedPolicies({ currentPolicyId }) {
  const others = POLICY_INDEX.filter(p => p.id !== currentPolicyId);
  if (others.length === 0) return null;

  return (
    <section
      aria-label="Related policies"
      style={{
        marginTop: 36,
        padding: '20px 22px',
        background: '#F5F0E8',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 8,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(58,58,58,0.55)',
        marginBottom: 12,
      }}>
        Related policies
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {others.map(p => (
          <li key={p.id}>
            {p.live
              ? <LiveRow to={`/legal/${p.slug}`} title={p.title} />
              : <PendingRow title={p.title} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LiveRow({ to, title }) {
  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        background: '#fff',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 6,
        textDecoration: 'none',
        color: '#3A3A3A',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <span style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 17,
        color: '#3A3A3A',
      }}>
        {title}
      </span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 600,
        color: '#3A3A3A',
        whiteSpace: 'nowrap',
      }}>
        Read <ArrowRight size={12} />
      </span>
    </Link>
  );
}

function PendingRow({ title }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      padding: '10px 12px',
      background: '#fff',
      border: '0.5px solid rgba(58,58,58,0.15)',
      borderRadius: 6,
      opacity: 0.55,
    }}>
      <span style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 17,
        color: '#3A3A3A',
      }}>
        {title}
      </span>
      <span style={{
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 600,
        color: 'rgba(58,58,58,0.5)',
        whiteSpace: 'nowrap',
      }}>
        Coming soon
      </span>
    </div>
  );
}
