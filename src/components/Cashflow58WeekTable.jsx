import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { generateCashflow58 } from '../utils/cashflow58Week';
import { formatCurrency } from '../utils/calculations';

const FR = {
  slate: '#3A3A3A',
  salt: '#F5F0E8',
  sand: '#EBE5D5',
  stone: '#716F70',
  navy: '#1F3A57',     // header bar (mirrors xlsx)
  navyDeep: '#162B43',
  good: '#3B6D11',
  warn: '#854F0B',
  bad: '#A32D2D',
  highlight: '#FFF4B8', // manual-input cells (xlsx yellow)
  posSoft: '#E8F0DA',   // weak green for projected positives
  negSoft: '#F4D8D8',   // weak red for projected negatives
};

// Row spec: every row in the table, in the same order as the workbook.
// `key` is the field on each week object; `kind` controls colouring/formatting.
//   bold      → bold white-on-navy section header (no values)
//   driver    → driver row (drivers section)
//   balance   → asset/liability balance (default formatting)
//   inflow    → green-tinted positive inflow
//   outflow   → red-tinted negative outflow (display as negative)
//   subtotal  → bold subtotal row
//   pending   → "(pending)" placeholder row
//   percent   → format as percent
const SECTIONS = [
  { header: 'Revenue Run Rate', rows: [
    { label: 'Shopify Store',  key: 'shopifyRevenue', kind: 'driver', leftLabel: 'H1 Growth' },
    { label: 'Daily Spend',    key: 'dailyAdSpend',   kind: 'driver' },
    { label: 'FB Ad Spend',    key: 'fbAdSpend',      kind: 'driver', leftLabel: 'MER' },
    { label: 'COGS %',         key: 'cogsRate',       kind: 'percent' },
  ]},
  { header: 'Balance Sheet', rows: [
    { label: 'Shopify Payouts',         key: 'shopifyPayouts',     kind: 'balance', leftLabel: 'Weekly Growth' },
    { label: 'SB - Main (9773)',        key: 'sbMain',             kind: 'balance', leftLabel: 'Profit %' },
    { label: 'SB - Sales Tax (6735)',   key: 'sbSalesTax',         kind: 'balance' },
    { label: 'SB - Corporate Tax (6735)', key: 'sbCorpTax',        kind: 'balance' },
    { label: 'Shopify Capital Repayment', key: 'shopifyCapRepayment', kind: 'balance' },
    { label: 'PO Milestones',           key: '_poMilestonesPending', kind: 'pending' },
    { label: 'Total Cash On Hand',      key: 'totalCashOnHand',    kind: 'subtotal' },
    { label: 'Inventory',               key: 'inventory',          kind: 'balance' },
    { label: 'Working Capital (2465)',  key: 'workingCapital',     kind: 'balance' },
    { label: 'Total Assets',            key: 'totalAssets',        kind: 'subtotal' },
  ]},
  { header: 'ST Liabilities', rows: [
    { label: 'Ads Payable (01000)',         key: 'adsPayable',         kind: 'balance' },
    { label: 'Fullfillment Payable (2907)', key: 'fulfillmentPayable', kind: 'balance' },
  ]},
  { header: 'LT Liabilities', rows: [
    { label: 'CHASE 5718',         key: 'chase5718',     kind: 'balance', leftLabel: 'OPEX CARDS' },
    { label: 'AMEX PLUM 0000',     key: 'amexPlum',      kind: 'balance' },
    { label: 'AMEX BLUE 71005',    key: 'amexBlue',      kind: 'balance' },
    { label: 'Shopify Capital',    key: 'shopifyCapital', kind: 'balance' },
    { label: 'Long Term Loan',     key: 'longTermLoan',   kind: 'balance' },
    { label: 'Total Liabilities',  key: 'totalLiabilities', kind: 'subtotal' },
    { label: 'Total Equity',       key: 'totalEquity',      kind: 'subtotal' },
    { label: 'Net Cash of ST Liabilities', key: 'netCashOfStLiab', kind: 'subtotal' },
  ]},
  { header: 'Projected Statement of Cashflows', rows: [
    { label: 'Online Store',       key: 'onlineStore',  kind: 'inflow', leftLabel: 'PP %' },
    { label: 'Transfer to WC (6848)', key: 'transferToWC', kind: 'outflow' },
    { label: 'Total Inflows',      key: 'totalInflows', kind: 'subtotal' },
    { label: 'Ads Payable (01000)', key: 'adsPaid',     kind: 'outflow', leftLabel: 'Variable Overhead' },
    { label: 'Fullfillment Payable (2907)', key: 'fulfillmentPaid', kind: 'outflow' },
    { label: 'CHASE 5718',         key: 'payChase',         kind: 'outflow', leftLabel: 'Working Capital' },
    { label: 'AMEX PLUM 0000',     key: 'payAmexPlum',      kind: 'outflow' },
    { label: 'AMEX BLUE 71005',    key: 'payAmexBlue',      kind: 'outflow' },
    { label: 'Shopify Capital',    key: 'payShopifyCapital', kind: 'outflow' },
    { label: 'LT Loan (Nathan)',   key: 'payLtLoan',         kind: 'outflow' },
    { label: 'Creative Production', key: 'creativeProduction', kind: 'outflow', leftLabel: 'Fixed Overhead' },
    { label: 'Salary',             key: 'salary',     kind: 'outflow' },
    { label: 'G&A',                key: 'ga',         kind: 'outflow' },
    { label: 'R&D',                key: 'rd',         kind: 'outflow' },
    { label: 'Interest',           key: 'interest',   kind: 'outflow' },
    { label: 'Fulfillment',        key: 'fulfillmentPaid', kind: 'outflow' },
    { label: 'Total Outflows',     key: 'totalOutflows',   kind: 'subtotal-out' },
    { label: 'Net Cash Flow',      key: 'netCashFlow',     kind: 'subtotal' },
    { label: 'Week #',             key: 'weekIndex',       kind: 'index' },
  ]},
  { header: 'Working Capital', rows: [
    { label: 'Working Capital', key: 'workingCapitalTotal', kind: 'subtotal' },
    { label: 'Owed',            key: 'workingCapitalOwed',  kind: 'balance' },
  ]},
];

function fmtVal(v, kind) {
  if (v == null) return '';
  if (kind === 'percent') return `${(v * 100).toFixed(0)}%`;
  if (kind === 'index') return Math.round(v);
  if (kind === 'pending') return '';
  return formatCurrency(v);
}

function cellColor(v, kind, isHistorical) {
  if (v == null || kind === 'pending' || kind === 'percent' || kind === 'index') return FR.slate;
  if (isHistorical) return FR.slate;
  if (kind === 'subtotal' || kind === 'inflow') {
    if (v > 0) return FR.good;
    if (v < 0) return FR.bad;
  }
  if (kind === 'outflow' || kind === 'subtotal-out') {
    if (v > 0) return FR.bad;
  }
  if (v < 0) return FR.bad;
  return FR.slate;
}

export default function Cashflow58WeekTable() {
  const { state } = useApp();
  const [showHistorical, setShowHistorical] = useState(false);

  const weeks = useMemo(() => generateCashflow58({
    assumptions: state.assumptions,
    seed: state.seed,
    subscriptions: state.subscriptions,
    creditCards: state.creditCards,
    loans: state.loans,
    manualPOs: state.manualPOs,
  }), [state.assumptions, state.seed, state.subscriptions, state.creditCards, state.loans, state.manualPOs]);

  const visibleWeeks = useMemo(
    () => showHistorical ? weeks : weeks.filter(w => !w.isHistorical),
    [weeks, showHistorical]
  );

  // Build month spans for the top header row (e.g. "MAY" colSpan=4)
  const monthSpans = useMemo(() => {
    const spans = [];
    let cur = '';
    let span = 0;
    visibleWeeks.forEach(w => {
      if (w.monthLabel !== cur) {
        if (cur) spans.push({ month: cur, span });
        cur = w.monthLabel;
        span = 1;
      } else {
        span += 1;
      }
    });
    if (cur) spans.push({ month: cur, span });
    return spans;
  }, [visibleWeeks]);

  const monthlyTotals = useMemo(() => {
    // Sum revenue per month for the title row above the month bar
    const totals = {};
    visibleWeeks.forEach(w => {
      totals[w.monthLabel] = (totals[w.monthLabel] || 0) + w.shopifyRevenue;
    });
    return totals;
  }, [visibleWeeks]);

  const grandTotal = useMemo(
    () => visibleWeeks.reduce((s, w) => s + w.shopifyRevenue, 0),
    [visibleWeeks]
  );

  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: 'white', borderColor: FR.sand }}>
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: FR.sand }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 22 }}>
            13 Week Cashflow — {visibleWeeks.length} weeks
          </h3>
          <p className="text-xs mt-1" style={{ color: FR.stone }}>
            Live from OPEX, credit cards, loans + Excel-derived formulas. Ports the workbook 1:1.
          </p>
        </div>
        <button
          onClick={() => setShowHistorical(s => !s)}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
          style={{
            background: showHistorical ? FR.slate : 'transparent',
            color: showHistorical ? FR.salt : FR.slate,
            borderColor: FR.sand,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {showHistorical ? 'Hide historical' : 'Show 12 weeks of historical'}
        </button>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="text-xs" style={{ fontFamily: "'Inter', sans-serif", borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {/* Row 1: grand total + month titles */}
            <tr style={{ background: FR.navy, color: FR.salt }}>
              <th className="sticky left-0 z-20 px-3 py-1.5 text-right font-semibold" style={{ background: FR.navy, color: FR.salt, minWidth: 80 }}></th>
              <th className="sticky px-3 py-1.5 text-right font-semibold" style={{ background: FR.navy, color: FR.salt, minWidth: 200, position: 'sticky', left: 80, zIndex: 19 }}>
                ${Math.round(grandTotal).toLocaleString()}
              </th>
              {monthSpans.map((m, i) => (
                <th key={i} colSpan={m.span} className="px-2 py-1.5 text-center font-semibold border-l" style={{ borderColor: FR.navyDeep, color: FR.salt }}>
                  {m.month} <span style={{ opacity: 0.7, fontWeight: 400 }}>${Math.round(monthlyTotals[m.month] || 0).toLocaleString()}</span>
                </th>
              ))}
            </tr>
            {/* Row 2: Week numbers */}
            <tr style={{ background: FR.navyDeep, color: FR.salt }}>
              <th className="sticky left-0 z-20 px-3 py-1 text-left" style={{ background: FR.navyDeep, color: FR.salt }}>Week</th>
              <th className="sticky px-3 py-1 text-left" style={{ background: FR.navyDeep, color: FR.salt, position: 'sticky', left: 80, zIndex: 19 }}></th>
              {visibleWeeks.map((w, i) => (
                <th key={i} className="px-2 py-1 text-center font-medium border-l" style={{ borderColor: FR.navy, minWidth: 70 }}>
                  {w.weekIndex + 1}
                </th>
              ))}
            </tr>
            {/* Row 3: Date row */}
            <tr style={{ background: FR.navyDeep, color: FR.salt }}>
              <th className="sticky left-0 z-20 px-3 py-1 text-left" style={{ background: FR.navyDeep, color: FR.salt }}>Date</th>
              <th className="sticky px-3 py-1 text-left" style={{ background: FR.navyDeep, color: FR.salt, position: 'sticky', left: 80, zIndex: 19 }}></th>
              {visibleWeeks.map((w, i) => (
                <th key={i} className="px-2 py-1 text-center border-l" style={{ borderColor: FR.navy, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: w.isCurrent ? 700 : 400 }}>
                  {w.dateLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section, si) => (
              <SectionBlock key={si} section={section} weeks={visibleWeeks} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionBlock({ section, weeks }) {
  return (
    <>
      <tr>
        <td colSpan={2 + weeks.length} className="px-3 py-1.5 font-semibold uppercase text-[10px] tracking-[0.12em]" style={{ background: FR.sand, color: FR.soil ?? FR.stone }}>
          {section.header}
        </td>
      </tr>
      {section.rows.map((row, ri) => (
        <DataRow key={ri} row={row} weeks={weeks} />
      ))}
    </>
  );
}

function DataRow({ row, weeks }) {
  const isSubtotal = row.kind === 'subtotal' || row.kind === 'subtotal-out';
  const rowBg = isSubtotal ? 'rgba(235,229,213,0.25)' : 'transparent';
  return (
    <tr style={{ background: rowBg }}>
      <td className="sticky left-0 z-10 px-3 py-1 text-right text-[10px]" style={{ background: 'white', color: FR.stone, minWidth: 80 }}>
        {row.leftLabel || ''}
      </td>
      <td className="sticky px-3 py-1" style={{ background: 'white', color: FR.slate, fontWeight: isSubtotal ? 600 : 400, position: 'sticky', left: 80, zIndex: 9, minWidth: 200 }}>
        {row.label}
      </td>
      {weeks.map((w, wi) => {
        const v = w[row.key];
        const display = row.kind === 'pending' ? <span style={{ color: FR.stone, fontStyle: 'italic', fontSize: 10 }}>pending</span> : fmtVal(v, row.kind);
        const color = cellColor(v, row.kind, w.isHistorical);
        return (
          <td key={wi} className="px-2 py-1 text-right border-l tabular-nums"
              style={{
                color,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: isSubtotal ? 600 : 400,
                borderColor: FR.sand,
                background: w.isCurrent ? 'rgba(31,58,87,0.05)' : 'transparent',
                fontSize: 11,
              }}>
            {display}
          </td>
        );
      })}
    </tr>
  );
}
