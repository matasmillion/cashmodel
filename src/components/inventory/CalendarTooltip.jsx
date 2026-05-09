// Floating date hover tooltip for calendar cells. Single instance lives
// at the page level; show/hide driven by parent state. Pinned in fixed
// position relative to the cursor.

import { INV, FADE, TYPE } from './inventoryTokens';

const STATE_DOT = {
  healthy:  INV.good,
  restock:  INV.warn,
  stockout: INV.bad,
  overstock: INV.sea,
};

const STATE_LABEL = {
  healthy:  'Healthy',
  restock:  'Restock window',
  stockout: 'Stockout',
  overstock: 'Overstock',
};

/**
 * Props:
 *   visible: bool
 *   x, y: number (page coordinates)
 *   date: Date instance
 *   state: 'healthy' | 'restock' | 'stockout' | 'overstock'
 *   poArrival: bool
 */
export default function CalendarTooltip({ visible, x, y, date, state, poArrival }) {
  if (!visible || !date) return null;

  const monthShort = date.toLocaleDateString('en-US', { month: 'short' });
  const day        = date.getDate();
  const dow        = date.toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div
      style={{
        position: 'fixed',
        top: y - 56,
        left: x + 14,
        background: INV.slate,
        color: INV.salt,
        padding: '8px 12px',
        borderRadius: 3,
        pointerEvents: 'none',
        zIndex: 100,
        boxShadow: '0 4px 14px rgba(58,58,58,0.20)',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{
        fontFamily: TYPE.serif,
        fontSize: 16,
        lineHeight: 1.1,
        fontWeight: 400,
        color: '#fff',
      }}>
        {monthShort} {day}
      </div>
      <div style={{
        fontSize: 10,
        color: 'rgba(245,240,232,0.70)',
        marginTop: 4,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontFamily: TYPE.sans,
      }}>
        <span style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          marginRight: 5,
          verticalAlign: 1,
          background: STATE_DOT[state] || INV.good,
        }} />
        {dow} · {STATE_LABEL[state] || state}
        {poArrival ? ' · PO arrives' : ''}
      </div>
    </div>
  );
}
