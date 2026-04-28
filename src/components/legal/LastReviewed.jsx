// @ts-check
// LastReviewed — small inline timestamp pulled from POLICY_META.<policy>.
// Single source of truth: every surface that displays a policy's last-
// reviewed date imports this rather than typing the date as a literal,
// so a version bump only happens in src/lib/legal/constants.js.
//
// Used inline (e.g. "Last reviewed: April 27, 2026") next to the
// SiteFooter's policy entries, in PolicyFooter, and anywhere else a
// reviewer wants the freshness signal.

import { POLICY_META } from '../../lib/legal/constants';

/**
 * @param {{ policy: 'infosec' | 'dataRetention' | 'accessControl'; prefix?: string; style?: any }} props
 */
export default function LastReviewed({ policy, prefix = 'Last reviewed', style }) {
  const meta = POLICY_META[policy];
  if (!meta) return null;
  return (
    <time
      dateTime={meta.iso}
      style={{
        fontSize: 11,
        letterSpacing: '0.04em',
        color: 'rgba(58,58,58,0.55)',
        fontFamily: "'Inter', sans-serif",
        ...style,
      }}
    >
      {prefix} {meta.lastReviewed}
    </time>
  );
}
