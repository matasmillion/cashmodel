// Category performance — bar list of top-level categories by trailing
// revenue + sell-through %. Tracked SKUs only.

import { useEffect, useMemo, useState } from 'react';
import { list as listInventory } from '../../utils/inventoryStore';
import { INV, FADE, TYPE, CARD, EYEBROW, SECTION_TITLE } from './inventoryTokens';

export default function CategoryPerformance() {
  const [skus, setSkus] = useState([]);

  useEffect(() => {
    listInventory().then(setSkus).catch(err => console.error('CategoryPerformance:', err));
  }, []);

  const cats = useMemo(() => buildCategories(skus), [skus]);

  return (
    <div style={CARD}>
      <div style={{ marginBottom: 12 }}>
        <div style={EYEBROW}>Category performance</div>
        <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>Trailing 12W</h3>
      </div>

      {cats.length === 0 && (
        <div style={{ fontSize: 12, color: FADE.slate60, padding: '12px 0' }}>
          No tracked SKUs to bucket.
        </div>
      )}

      {cats.map(c => (
        <CatRow key={c.name} cat={c} />
      ))}
    </div>
  );
}

function CatRow({ cat }) {
  return (
    <div style={{
      padding: '10px 0',
      borderTop: `1px solid ${FADE.slate06}`,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 4,
      }}>
        <span style={{
          fontFamily: TYPE.sans,
          fontSize: 12,
          color: INV.slate,
        }}>
          {cat.name}
        </span>
        <span style={{
          fontFamily: TYPE.mono,
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          color: INV.slate,
        }}>
          ${cat.revenue >= 1000 ? `${(cat.revenue / 1000).toFixed(1)}k` : Math.round(cat.revenue)}
        </span>
      </div>

      <div style={{
        height: 4,
        background: FADE.slate06,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, cat.sellThruPct)}%`,
          background: INV.slate,
        }} />
      </div>

      <div style={{
        fontSize: 9,
        color: FADE.slate60,
        marginTop: 3,
        fontFamily: TYPE.sans,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {cat.sellThruPct.toFixed(0)}% sell-thru
      </div>
    </div>
  );
}

const PRIORITY_ORDER = ['Hoodies', 'Sweatpants', 'Cargos', 'Tees', 'Outerwear', 'Accessories'];

function buildCategories(skus) {
  const map = new Map();
  for (const s of skus) {
    if (!s.tracked) continue;
    const cat = s.cat || 'Other';
    if (!map.has(cat)) map.set(cat, { name: cat, on_hand: 0, sold_12w: 0, allocated: 0, revenue: 0 });
    const row = map.get(cat);
    row.on_hand   += s.on_hand   || 0;
    row.sold_12w  += s.sold_12w  || 0;
    row.allocated += s.allocated || 0;
    row.revenue   += (s.sold_12w || 0) * (s.retail || 0);
  }

  const arr = [];
  for (const [, row] of map) {
    const denom = row.on_hand + row.sold_12w + row.allocated;
    arr.push({
      ...row,
      sellThruPct: denom > 0 ? (row.sold_12w / denom) * 100 : 0,
    });
  }

  // Order by priority list first, then by revenue desc.
  arr.sort((a, b) => {
    const ai = PRIORITY_ORDER.indexOf(a.name);
    const bi = PRIORITY_ORDER.indexOf(b.name);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return b.revenue - a.revenue;
  });

  return arr;
}
