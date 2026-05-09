// Urgent reorders — top 6 tracked SKUs by ascending FWOS. Each row:
// small swatch · style + sku · on-hand · weeks · status pill.
//
// "Generate POs →" drafts a productionStore PO for each row using
// size-curve allocation. Untracked SKUs NEVER appear here.

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listTracked } from '../../utils/inventoryStore';
import { createPO } from '../../utils/productionStore';
import { setInventoryHash } from '../../utils/inventoryRouting';
import { forwardWOS } from '../../utils/coverProjection';
import { INV, FADE, TYPE, CARD, EYEBROW, SECTION_TITLE, PILL } from './inventoryTokens';

export default function UrgentReorders() {
  const { state } = useApp();
  const [skus, setSkus] = useState([]);
  const [drafting, setDrafting] = useState(false);
  const [draftCount, setDraftCount] = useState(null);

  useEffect(() => {
    listTracked().then(setSkus).catch(err => console.error('UrgentReorders:', err));
  }, []);

  const rows = useMemo(
    () => buildUrgentRows(skus, state.assumptions),
    [skus, state.assumptions],
  );

  async function handleGenerate() {
    if (drafting || !rows.length) return;
    setDrafting(true);
    let count = 0;
    try {
      for (const r of rows) {
        await createPO({
          style_id:  r.style_id,
          units:     r.suggestedUnits,
          unit_cost_usd: r.cost || 0,
          lead_days: (Number(state.assumptions?.leadTime) || 10) * 7,
          notes:     `Auto-drafted from urgent reorders: ${r.label}`,
        });
        count++;
      }
      setDraftCount(count);
    } catch (err) {
      console.error('UrgentReorders generate POs:', err);
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12, gap: 10 }}>
        <span style={EYEBROW}>Action required</span>
        <h3 style={{ ...SECTION_TITLE }}>Urgent reorders ({rows.length})</h3>
        <button
          onClick={handleGenerate}
          disabled={drafting || !rows.length}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: drafting ? FADE.slate60 : INV.sienna,
            fontSize: 11,
            fontFamily: TYPE.sans,
            letterSpacing: '0.04em',
            cursor: drafting || !rows.length ? 'default' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="Drafts a productionStore PO for each row"
        >
          {drafting ? 'Drafting…' : 'Generate POs'} <ArrowRight size={12} />
        </button>
      </div>

      {draftCount != null && (
        <div style={{
          fontSize: 11,
          color: INV.good,
          marginBottom: 8,
          fontFamily: TYPE.sans,
        }}>
          Drafted {draftCount} PO{draftCount === 1 ? '' : 's'} — review at #inventory/pos
        </div>
      )}

      {rows.length === 0 && (
        <div style={{ fontSize: 12, color: FADE.slate60, padding: '12px 0' }}>
          No urgent reorders. Inventory cover is healthy across tracked SKUs.
        </div>
      )}

      {rows.map(r => (
        <div
          key={r.sku}
          onClick={() => setInventoryHash({ view: 'sku', sku: r.sku })}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 0',
            borderTop: `1px solid ${FADE.slate06}`,
            gap: 10,
            cursor: 'pointer',
          }}
        >
          <span style={{
            width: 16,
            height: 16,
            borderRadius: 2,
            background: r.colorSwatch,
            border: `1px solid ${FADE.slate10}`,
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: TYPE.sans,
              fontSize: 12,
              color: INV.slate,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {r.label}
            </div>
            <div style={{
              fontFamily: TYPE.mono,
              fontSize: 10,
              color: FADE.slate60,
              marginTop: 1,
            }}>
              {r.sku}
            </div>
          </div>
          <div style={{
            fontFamily: TYPE.mono,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            color: INV.slate,
            textAlign: 'right',
            minWidth: 60,
          }}>
            {r.on_hand}
            <div style={{ fontSize: 9, color: FADE.slate60, fontFamily: TYPE.sans, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              on hand
            </div>
          </div>
          <div style={{
            fontFamily: TYPE.mono,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            color: r.severity === 'stockout' ? INV.bad : r.severity === 'critical' ? INV.warn : INV.slate,
            textAlign: 'right',
            minWidth: 50,
          }}>
            {r.fwos != null ? `${r.fwos.toFixed(1)}w` : '—'}
            <div style={{ fontSize: 9, color: FADE.slate60, fontFamily: TYPE.sans, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              cover
            </div>
          </div>
          <span style={{
            ...PILL,
            background: severityBg(r.severity),
            color: severityFg(r.severity),
            minWidth: 70,
            justifyContent: 'center',
          }}>
            {severityLabel(r.severity)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function severityLabel(s) {
  if (s === 'stockout') return 'Stockout';
  if (s === 'critical') return 'Critical';
  return 'Reorder';
}
function severityBg(s) {
  if (s === 'stockout') return 'rgba(168,84,60,0.15)';
  if (s === 'critical') return 'rgba(200,146,74,0.15)';
  return 'rgba(58,58,58,0.06)';
}
function severityFg(s) {
  if (s === 'stockout') return INV.bad;
  if (s === 'critical') return INV.warn;
  return INV.slate;
}

function buildUrgentRows(skus, assumptions) {
  const lift = Number(assumptions?.liftMultiplier) || 1.10;
  const leadWeeks = Number(assumptions?.leadTime) || 10;

  const rows = [];
  for (const s of skus) {
    if (!s.tracked) continue;
    const wkVel = (s.sold_12w || 0) / 12;
    const fwos  = forwardWOS(s.on_hand || 0, wkVel, lift);
    if (fwos == null) continue;

    let severity = 'reorder';
    if ((s.on_hand || 0) <= 0)               severity = 'stockout';
    else if (fwos <= leadWeeks)              severity = 'critical';
    else if (fwos <= leadWeeks + 3)          severity = 'reorder';
    else continue; // healthy — skip

    // Suggested units: cover lead + 8 weeks at projected demand.
    const suggestedUnits = Math.max(50, Math.ceil(wkVel * lift * (leadWeeks + 8)));
    const colorSwatch = swatchFor(s.color);

    rows.push({
      sku: s.sku,
      style_id: s.style_id,
      label: `${s.style_name}${s.color ? ' · ' + s.color : ''}${s.size ? ' · ' + s.size : ''}`,
      on_hand: s.on_hand,
      fwos,
      severity,
      suggestedUnits,
      cost: s.cost,
      colorSwatch,
    });
  }

  rows.sort((a, b) => (a.fwos || 0) - (b.fwos || 0));
  return rows.slice(0, 6);
}

function swatchFor(colorName) {
  if (!colorName) return INV.sand;
  const lc = colorName.toLowerCase();
  if (lc.includes('slate'))  return '#3A3A3A';
  if (lc.includes('salt'))   return '#F5F0E8';
  if (lc.includes('sand'))   return '#EBE5D5';
  if (lc.includes('soil'))   return '#9A816B';
  if (lc.includes('sienna')) return INV.sienna;
  if (lc.includes('black'))  return '#1A1A1A';
  if (lc.includes('white'))  return '#FAFAFA';
  if (lc.includes('cream'))  return '#F2EBD7';
  if (lc.includes('navy'))   return '#1B2741';
  return INV.stone;
}
