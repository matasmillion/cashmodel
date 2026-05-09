// Open-to-Buy grid — class × quarter view of planned vs committed vs remaining.
// Per spec §5C: editable planned cells, committed = sum of open POs landing
// in that quarter, remaining = planned − committed (red when negative).

import { useEffect, useMemo, useState } from 'react';
import { listPOs } from '../../utils/productionStore';
import { listTechPacks } from '../../utils/techPackStore';
import {
  getPlanned,
  setPlanned,
  listPlan,
  quartersFromNow,
  computeCommitted,
} from '../../utils/otbStore';
import { INV, FADE, TYPE, CARD, EYEBROW, SECTION_TITLE } from './inventoryTokens';

// Default class set when techpacks haven't supplied any. Matches the
// product types we see on Foreign Resource's Shopify catalog plus a few
// canonical apparel classes.
const DEFAULT_CLASSES = [
  'Hoodies',
  'Pants',
  'T-Shirts',
  'Sweatpants',
  'Sweatshirts',
  'Jackets',
  'Accessories',
];

export default function InventoryOTB() {
  const [pos, setPos]     = useState([]);
  const [packs, setPacks] = useState([]);
  const [plan, setPlan]   = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'q::class' | null
  const [editVal, setEditVal] = useState('');

  useEffect(() => { refresh(); }, []);

  function refresh() {
    setLoading(true);
    Promise.all([listPOs(), listTechPacks().catch(() => [])])
      .then(([rows, p]) => {
        setPos(rows || []);
        setPacks(p || []);
        setPlan(listPlan());
        setLoading(false);
      })
      .catch(err => { console.error('InventoryOTB:', err); setLoading(false); });
  }

  const styleById = useMemo(() => {
    const m = new Map();
    for (const p of packs) if (p?.id) m.set(p.id, p);
    return m;
  }, [packs]);

  // Class label for a PO: pluralize the techpack productCategory, fall
  // back to the style_id stem.
  const klassFor = useMemo(() => (po) => {
    const pack = styleById.get(po.style_id);
    const raw  = pack?.data?.productCategory || pack?.product_category || '';
    if (!raw) return 'Other';
    return pluralizeClass(raw);
  }, [styleById]);

  // Discover the union of classes from techpacks + the default list.
  const classes = useMemo(() => {
    const set = new Set(DEFAULT_CLASSES);
    for (const p of packs) {
      const c = p?.data?.productCategory || p?.product_category;
      if (c) set.add(pluralizeClass(c));
    }
    return [...set].sort();
  }, [packs]);

  const quarters  = useMemo(() => quartersFromNow(4), []);
  const committed = useMemo(() => computeCommitted(pos, klassFor), [pos, klassFor]);

  function startEdit(q, k) {
    const key = `${q}::${k}`;
    setEditing(key);
    setEditVal(String(getPlanned(q, k) || ''));
  }

  function commitEdit() {
    if (!editing) return;
    const [q, k] = editing.split('::');
    const v = Number(editVal.replace(/[^0-9.-]/g, '')) || 0;
    setPlanned(q, k, v);
    setPlan(listPlan());
    setEditing(null);
    setEditVal('');
  }

  function cancelEdit() {
    setEditing(null);
    setEditVal('');
  }

  const totals = useMemo(() => buildTotals(plan, committed, quarters, classes), [plan, committed, quarters, classes]);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={EYEBROW}>Open-to-Buy</div>
        <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>Quarterly receipts plan</h3>
        <p style={{ fontSize: 11, color: FADE.slate60, fontFamily: TYPE.sans, margin: '4px 0 0' }}>
          Planned receipt $ per class per quarter. Click a planned cell to edit. Committed = sum of open POs landing in that quarter at unit cost.
        </p>
      </div>

      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            minWidth: 900,
            borderCollapse: 'collapse',
            fontFamily: TYPE.sans,
            fontSize: 12,
          }}>
            <thead>
              <tr style={{ background: 'rgba(58,58,58,0.025)' }}>
                <th style={thStyle()}>Class</th>
                {quarters.map(q => (
                  <th key={q} colSpan={3} style={thStyle({ center: true, borderLeft: true })}>
                    {q}
                  </th>
                ))}
                <th style={thStyle({ center: true, borderLeft: true })}>Total remaining</th>
              </tr>
              <tr style={{ background: 'rgba(58,58,58,0.015)' }}>
                <th style={thStyle({ size: 8 })} />
                {quarters.map(q => (
                  <SubHeader key={q} />
                ))}
                <th style={thStyle({ size: 8 })} />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={2 + quarters.length * 3} style={{ padding: 24, textAlign: 'center', color: FADE.slate60 }}>
                  Loading…
                </td></tr>
              )}
              {!loading && classes.map(k => (
                <ClassRow
                  key={k}
                  klass={k}
                  quarters={quarters}
                  plan={plan}
                  committed={committed}
                  editing={editing}
                  editVal={editVal}
                  onStartEdit={startEdit}
                  onChangeEdit={setEditVal}
                  onCommitEdit={commitEdit}
                  onCancelEdit={cancelEdit}
                />
              ))}
              {!loading && (
                <TotalsRow totals={totals} quarters={quarters} />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────

function ClassRow({
  klass, quarters, plan, committed,
  editing, editVal, onStartEdit, onChangeEdit, onCommitEdit, onCancelEdit,
}) {
  let totalRemaining = 0;
  for (const q of quarters) {
    const key = `${q}::${klass}`;
    totalRemaining += (Number(plan[key]) || 0) - (Number(committed[key]) || 0);
  }
  return (
    <tr style={{ borderTop: `1px solid ${FADE.slate06}` }}>
      <td style={tdStyle()}>
        <span style={{ fontWeight: 500 }}>{klass}</span>
      </td>
      {quarters.map(q => {
        const key       = `${q}::${klass}`;
        const planned   = Number(plan[key]) || 0;
        const cMmt      = Number(committed[key]) || 0;
        const remaining = planned - cMmt;
        const isEditing = editing === key;
        return (
          <Cell
            key={key}
            cellKey={key}
            planned={planned}
            committed={cMmt}
            remaining={remaining}
            isEditing={isEditing}
            editVal={editVal}
            onStartEdit={onStartEdit}
            onChangeEdit={onChangeEdit}
            onCommitEdit={onCommitEdit}
            onCancelEdit={onCancelEdit}
          />
        );
      })}
      <td style={tdStyle({ right: true, mono: true, borderLeft: true, color: totalRemaining < 0 ? INV.bad : INV.slate, bold: true })}>
        {fmtMoney(totalRemaining)}
      </td>
    </tr>
  );
}

function Cell({
  cellKey, planned, committed, remaining,
  isEditing, editVal,
  onStartEdit, onChangeEdit, onCommitEdit, onCancelEdit,
}) {
  const [q, k] = cellKey.split('::');
  const overcommitted = remaining < 0;

  return (
    <>
      <td
        onClick={() => !isEditing && onStartEdit(q, k)}
        style={tdStyle({ right: true, mono: true, borderLeft: true, cursor: 'pointer' })}
        title="Click to edit planned"
      >
        {isEditing ? (
          <input
            autoFocus
            value={editVal}
            onChange={(e) => onChangeEdit(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitEdit();
              else if (e.key === 'Escape') onCancelEdit();
            }}
            placeholder="$"
            style={{
              fontFamily: TYPE.mono,
              fontSize: 12,
              border: `1px solid ${INV.sienna}`,
              borderRadius: 2,
              padding: '2px 6px',
              width: 80,
              textAlign: 'right',
              background: '#FFF',
              color: INV.slate,
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        ) : (
          <span style={{ color: planned > 0 ? INV.slate : FADE.slate60 }}>
            {planned > 0 ? fmtMoney(planned) : '—'}
          </span>
        )}
      </td>
      <td style={tdStyle({ right: true, mono: true, color: FADE.slate60 })}>
        {committed > 0 ? fmtMoney(committed) : '—'}
      </td>
      <td style={tdStyle({ right: true, mono: true, color: overcommitted ? INV.bad : INV.slate, bold: overcommitted })}>
        {planned > 0 || committed > 0 ? fmtMoney(remaining) : '—'}
      </td>
    </>
  );
}

function TotalsRow({ totals, quarters }) {
  return (
    <tr style={{
      borderTop: `2px solid ${FADE.slate10}`,
      background: 'rgba(58,58,58,0.025)',
    }}>
      <td style={tdStyle({ bold: true })}>Total</td>
      {quarters.map(q => {
        const t = totals[q] || { planned: 0, committed: 0, remaining: 0 };
        return [
          <td key={`${q}-p`} style={tdStyle({ right: true, mono: true, borderLeft: true, bold: true })}>
            {fmtMoney(t.planned)}
          </td>,
          <td key={`${q}-c`} style={tdStyle({ right: true, mono: true, color: FADE.slate60 })}>
            {fmtMoney(t.committed)}
          </td>,
          <td key={`${q}-r`} style={tdStyle({ right: true, mono: true, color: t.remaining < 0 ? INV.bad : INV.slate, bold: true })}>
            {fmtMoney(t.remaining)}
          </td>,
        ];
      })}
      <td style={tdStyle({ right: true, mono: true, borderLeft: true, bold: true, color: totals.grand < 0 ? INV.bad : INV.slate })}>
        {fmtMoney(totals.grand)}
      </td>
    </tr>
  );
}

function SubHeader() {
  const cell = {
    ...EYEBROW,
    fontSize: 8,
    padding: '6px 12px',
    textAlign: 'right',
    color: FADE.slate60,
    borderLeft: `1px solid ${FADE.slate06}`,
  };
  return [
    <th key="planned"   style={{ ...cell, borderLeft: `1px solid ${FADE.slate10}` }}>Planned</th>,
    <th key="committed" style={cell}>Committed</th>,
    <th key="remaining" style={cell}>Remaining</th>,
  ];
}

// ── Style helpers ────────────────────────────────────────────────────────

function thStyle({ center = false, borderLeft = false, size = 9 } = {}) {
  return {
    ...EYEBROW,
    fontSize: size,
    textAlign: center ? 'center' : 'left',
    padding: '10px 12px',
    whiteSpace: 'nowrap',
    borderLeft: borderLeft ? `1px solid ${FADE.slate10}` : 'none',
  };
}

function tdStyle({ right = false, mono = false, borderLeft = false, color, bold = false, cursor = 'default' } = {}) {
  return {
    padding: '8px 12px',
    textAlign: right ? 'right' : 'left',
    fontFamily: mono ? TYPE.mono : TYPE.sans,
    fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
    color: color || INV.slate,
    fontWeight: bold ? 600 : 'normal',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    borderLeft: borderLeft ? `1px solid ${FADE.slate10}` : 'none',
    cursor,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildTotals(plan, committed, quarters, classes) {
  const out = { grand: 0 };
  for (const q of quarters) {
    let p = 0, c = 0;
    for (const k of classes) {
      const key = `${q}::${k}`;
      p += Number(plan[key]) || 0;
      c += Number(committed[key]) || 0;
    }
    out[q] = { planned: p, committed: c, remaining: p - c };
    out.grand += (p - c);
  }
  return out;
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  let str;
  if (abs >= 1e6) str = `$${(n / 1e6).toFixed(1)}M`;
  else if (abs >= 1e3) str = `$${(n / 1e3).toFixed(0)}k`;
  else str = `$${Math.round(n).toLocaleString()}`;
  return str;
}

function pluralizeClass(raw) {
  const s = String(raw).trim();
  if (!s) return '';
  if (/s$/i.test(s)) return s; // already plural
  // Special-case the common product types we know of.
  const lc = s.toLowerCase();
  if (lc === 'pant')        return 'Pants';
  if (lc === 'hoodie')      return 'Hoodies';
  if (lc === 't-shirt')     return 'T-Shirts';
  if (lc === 'sweatpant')   return 'Sweatpants';
  if (lc === 'sweatshirt')  return 'Sweatshirts';
  if (lc === 'jacket')      return 'Jackets';
  // Default: append "s".
  return s + 's';
}
