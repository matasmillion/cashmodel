// Inventory health — bucket counts of tracked SKUs by cover state.
// Stockout / Critical / Reorder Now / Reorder Soon / Healthy / Overstock
// Plus a 7th muted "Untracked" row.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { list as listInventory } from '../../utils/inventoryStore';
import { forwardWOS } from '../../utils/coverProjection';
import { INV, FADE, TYPE, CARD, EYEBROW, SECTION_TITLE } from './inventoryTokens';

const BUCKET_DEF = [
  { id: 'stockout',     label: 'Stockout',     color: INV.bad },
  { id: 'critical',     label: 'Critical',     color: INV.bad,  alpha: 0.65 },
  { id: 'reorder_now',  label: 'Reorder Now',  color: INV.warn },
  { id: 'reorder_soon', label: 'Reorder Soon', color: INV.warn, alpha: 0.65 },
  { id: 'healthy',      label: 'Healthy',      color: INV.good },
  { id: 'overstock',    label: 'Overstock',    color: INV.sea },
];

export default function InventoryHealth() {
  const { state } = useApp();
  const [skus, setSkus] = useState([]);

  useEffect(() => {
    listInventory().then(setSkus).catch(err => console.error('InventoryHealth:', err));
  }, []);

  const buckets = useMemo(
    () => bucketize(skus, state.assumptions),
    [skus, state.assumptions],
  );

  return (
    <div style={CARD}>
      <div style={{ marginBottom: 12 }}>
        <div style={EYEBROW}>Inventory health · tracked only</div>
        <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>Distribution</h3>
      </div>

      {BUCKET_DEF.map(b => (
        <BucketRow
          key={b.id}
          color={b.color}
          alpha={b.alpha || 1}
          label={b.label}
          count={buckets[b.id] || 0}
        />
      ))}

      <BucketRow
        color={FADE.slate60}
        alpha={1}
        label="Untracked"
        count={buckets.untracked || 0}
        muted
      />
    </div>
  );
}

function BucketRow({ color, alpha, label, count, muted }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 0',
      borderTop: `1px solid ${FADE.slate06}`,
      opacity: muted ? 0.55 : 1,
    }}>
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        opacity: alpha,
        marginRight: 10,
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: TYPE.sans,
        fontSize: 12,
        color: INV.slate,
        flex: 1,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: TYPE.mono,
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
        color: INV.slate,
      }}>
        {count}
      </span>
    </div>
  );
}

function bucketize(skus, assumptions) {
  const lift = Number(assumptions?.liftMultiplier) || 1.10;
  const leadWeeks = Number(assumptions?.leadTime) || 10;

  const out = {
    stockout: 0,
    critical: 0,
    reorder_now: 0,
    reorder_soon: 0,
    healthy: 0,
    overstock: 0,
    untracked: 0,
  };

  for (const s of skus) {
    if (!s.tracked) {
      out.untracked++;
      continue;
    }
    const wkVel = (s.sold_12w || 0) / 12;
    const fwos = forwardWOS(s.on_hand || 0, wkVel, lift);

    if ((s.on_hand || 0) <= 0)              out.stockout++;
    else if (fwos == null)                  out.healthy++;       // no velocity, keep on hand → healthy
    else if (fwos <= leadWeeks)             out.critical++;
    else if (fwos <= leadWeeks + 3)         out.reorder_now++;
    else if (fwos <= leadWeeks + 8)         out.reorder_soon++;
    else if (fwos > 26)                     out.overstock++;
    else                                     out.healthy++;
  }
  return out;
}
