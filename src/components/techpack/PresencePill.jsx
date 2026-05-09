// PresencePill — small chip that appears in a builder header when other
// editors are present on the same record via Realtime presence.
//
// Hidden when zero peers. Tooltip on hover lists peer display names.
// Brand-conformant Sand chip (FR.sand background, slate text).

import { Users } from 'lucide-react';
import { FR } from './techPackConstants';

export default function PresencePill({ peers }) {
  if (!Array.isArray(peers) || peers.length === 0) return null;
  const names = peers.map(p => p?.displayName || p?.userId || 'someone');
  const label = peers.length === 1
    ? `${names[0]} is also editing`
    : `${peers.length} others editing`;
  const tooltip = names.join(', ');
  return (
    <span
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        background: FR.sand,
        color: FR.slate,
        border: `0.5px solid rgba(58,58,58,0.15)`,
        borderRadius: 5,
        fontSize: 11,
        letterSpacing: '0.06em',
        fontWeight: 500,
      }}>
      <Users size={11} />
      {label}
    </span>
  );
}
