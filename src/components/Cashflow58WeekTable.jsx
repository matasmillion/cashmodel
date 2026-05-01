import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { generateCashflow58, CASHFLOW_DEFAULTS } from '../utils/cashflow58Week';
import { formatCurrency } from '../utils/calculations';

const FR = {
  slate: '#3A3A3A',
  salt: '#F5F0E8',
  sand: '#EBE5D5',
  stone: '#716F70',
  navy: '#1F3A57',
  navyDeep: '#162B43',
  good: '#3B6D11',
  warn: '#854F0B',
  bad: '#A32D2D',
  blue: '#2563eb',
};

// Find a Plaid-classified bank account (or null) given seed.bankAccounts and a role.
function pickAccountName(bankAccounts, role, fallback) {
  if (!bankAccounts || !bankAccounts.length) return fallback;
  const match = bankAccounts.find(a => a.role === role);
  if (!match) return fallback;
  const lastFour = match.mask ? `(${match.mask})` : '';
  return `${match.name} ${lastFour}`.trim();
}

// Section spec — the order is the workbook's row order. Each row carries:
//   key       : field on the week object
//   label     : column B (row label)
//   leftLabel : column A — top of a 2-row pair (group label like "H1 Growth")
//   leftValue : column A — bottom of the same pair (the % value, e.g. "104%")
//   kind      : balance | inflow | outflow | subtotal | percent | pending | index | driver
//
// Section headers are separate row objects with header=true. We render them
// as a single row spanning across the table with a date appended.
function buildSections(seed = {}, C = CASHFLOW_DEFAULTS) {
  const accs = seed.bankAccounts;
  const operatingLabel = pickAccountName(accs, 'operating', 'SB - Main (9773)');
  const salesTaxLabel = pickAccountName(accs, 'salesTax', 'SB - Sales Tax (6735)');
  const corpTaxLabel = pickAccountName(accs, 'corporateTax', 'SB - Corporate Tax (6735)');
  const wcLabel = pickAccountName(accs, 'workingCapital', 'Working Capital (2465)');
  const pct = v => `${Math.round(v * 100)}%`;

  return [
    { header: true, label: 'Revenue Run Rate As Of', anchorKey: 'date' },
    { key: 'shopifyRevenue', label: 'Shopify Store',  kind: 'driver',
      leftLabel: 'H1 Growth', leftValue: pct(C.h1Growth - 1) },
    { key: 'dailyAdSpend',   label: 'Daily Spend',     kind: 'driver' },
    { key: 'fbAdSpend',      label: 'FB Ad Spend',     kind: 'driver',
      leftLabel: 'MER', leftValue: pct(C.mer) },
    { key: 'cogsRate',       label: 'COGS %',          kind: 'percent' },

    { header: true, label: 'Balance Sheet As Of', anchorKey: 'date' },
    { key: 'shopifyPayouts',     label: 'Shopify Payouts',     kind: 'balance',
      leftLabel: 'Weekly Growth', leftValue: pct(C.h2Growth - 1) },
    { key: 'sbMain',             label: operatingLabel,        kind: 'balance',
      leftLabel: 'Profit %', leftValue: pct(C.profitPercentForWC) },
    { key: 'sbSalesTax',         label: salesTaxLabel,         kind: 'balance' },
    { key: 'sbCorpTax',          label: corpTaxLabel,          kind: 'balance' },
    { key: 'shopifyCapRepayment',label: 'Shopify Capital Repayment', kind: 'balance' },
    { key: '_poMilestonesPending', label: 'PO Milestones',     kind: 'pending' },
    { key: 'totalCashOnHand',    label: 'Total Cash On Hand',  kind: 'subtotal' },
    { key: 'inventory',          label: 'Inventory',           kind: 'balance' },
    { key: 'workingCapital',     label: wcLabel,               kind: 'balance' },
    { key: 'totalAssets',        label: 'Total Assets',        kind: 'subtotal' },

    { header: true, label: 'ST Liabilities' },
    { key: 'adsPayable',         label: 'Ads Payable (01000)',         kind: 'balance' },
    { key: 'fulfillmentPayable', label: 'Fullfillment Payable (2907)', kind: 'balance' },

    { header: true, label: 'LT Liabilities' },
    { key: 'chase5718',     label: 'CHASE 5718',     kind: 'balance', leftLabel: 'OPEX CARDS' },
    { key: 'amexPlum',      label: 'AMEX PLUM 0000', kind: 'balance' },
    { key: 'amexBlue',      label: 'AMEX BLUE 71005', kind: 'balance' },
    { key: 'shopifyCapital',label: 'Shopify Capital', kind: 'balance' },
    { key: 'longTermLoan',  label: 'Long Term Loan',  kind: 'balance' },
    { key: 'totalLiabilities',  label: 'Total Liabilities', kind: 'subtotal' },
    { key: 'totalEquity',       label: 'Total Equity',      kind: 'subtotal' },
    { key: 'netCashOfStLiab',   label: 'Net Cash of ST Liabilities', kind: 'subtotal' },

    { header: true, label: 'Projected Statement of Cashflows For WK Starting', anchorKey: 'date' },
    { key: 'onlineStore',     label: 'Online Store', kind: 'inflow',
      leftLabel: 'PP %', leftValue: pct(C.ppPercent) },
    { key: 'transferToWC',    label: 'Transfer to WC',           kind: 'outflow' },
    { key: 'totalInflows',    label: 'Total Inflows',            kind: 'subtotal' },
    { key: 'adsPaid',         label: 'Ads Payable (01000)',      kind: 'outflow', leftLabel: 'Variable Overhead' },
    { key: 'fulfillmentPaid', label: 'Fullfillment Payable (2907)', kind: 'outflow' },
    { key: 'payChase',        label: 'CHASE 5718',     kind: 'outflow', leftLabel: 'Working Capital' },
    { key: 'payAmexPlum',     label: 'AMEX PLUM 0000', kind: 'outflow' },
    { key: 'payAmexBlue',     label: 'AMEX BLUE 71005', kind: 'outflow' },
    { key: 'payShopifyCapital',label: 'Shopify Capital', kind: 'outflow' },
    { key: 'payLtLoan',       label: 'LT Loan (Nathan)', kind: 'outflow' },
    { key: 'creativeProduction', label: 'Creative Production', kind: 'outflow',
      leftLabel: '% of Ad Spend', leftValue: pct(C.creativePercentOfAdSpend) },
    { key: 'salary',          label: 'Salary',          kind: 'outflow', leftLabel: 'Fixed Overhead' },
    { key: 'ga',              label: 'G&A',             kind: 'outflow' },
    { key: 'rd',              label: 'R&D',             kind: 'outflow' },
    { key: 'interest',        label: 'Interest',        kind: 'outflow' },
    { key: 'fulfillmentPaid', label: 'Fulfillment',     kind: 'outflow',
      leftLabel: 'Fulfillment %', leftValue: pct(C.fulfillmentPercent) },
    { key: 'totalOutflows',   label: 'Total Outflows',  kind: 'subtotal-out' },
    { key: 'netCashFlow',     label: 'Net Cash Flow',   kind: 'subtotal' },
    { key: 'weekIndex',       label: 'Week #',          kind: 'index' },

    { header: true, label: 'Working Capital' },
    { key: 'workingCapitalTotal', label: 'Working Capital', kind: 'subtotal' },
    { key: 'workingCapitalOwed',  label: 'Owed',            kind: 'balance' },
  ];
}

function fmt(v, kind) {
  if (v == null) return '';
  if (kind === 'percent') return `${(v * 100).toFixed(0)}%`;
  if (kind === 'index') return Math.round(v);
  if (kind === 'pending') return '';
  return formatCurrency(v);
}

function colorFor(v, kind, isHistorical, isCurrent) {
  if (v == null || kind === 'pending' || kind === 'index') return FR.slate;
  if (isCurrent) return FR.blue;
  if (isHistorical) return FR.slate;
  if (kind === 'subtotal' || kind === 'inflow') return v > 0 ? FR.good : v < 0 ? FR.bad : FR.slate;
  if (kind === 'outflow' || kind === 'subtotal-out') return v > 0 ? FR.bad : FR.slate;
  return v < 0 ? FR.bad : FR.slate;
}

const COL_W_LEFT = 80;   // column A
const COL_W_LABEL = 220; // column B
const COL_W_DATA = 88;

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

  const sections = useMemo(
    () => buildSections(state.seed, { ...CASHFLOW_DEFAULTS, ...state.assumptions }),
    [state.seed, state.assumptions]
  );

  // Month spans for the top header (e.g. "MAY" colSpan=4)
  const monthSpans = useMemo(() => {
    const spans = [];
    let cur = '', span = 0;
    visibleWeeks.forEach(w => {
      if (w.monthLabel !== cur) {
        if (cur) spans.push({ month: cur, span });
        cur = w.monthLabel;
        span = 1;
      } else span += 1;
    });
    if (cur) spans.push({ month: cur, span });
    return spans;
  }, [visibleWeeks]);

  const monthlyTotals = useMemo(() => {
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

  const currentWeekIndex = visibleWeeks.findIndex(w => w.isCurrent);
  const monthDt = (mLabel) => {
    const w = visibleWeeks.find(x => x.monthLabel === mLabel);
    return w?.date ?? '';
  };

  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: 'white', borderColor: FR.sand }}>
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: FR.sand }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 22 }}>
            13 Week Cashflow
          </h3>
          <p className="text-xs mt-1" style={{ color: FR.stone }}>
            {visibleWeeks.length} weeks · live from Plaid + OPEX · ports the workbook 1:1
          </p>
        </div>
        <button
          onClick={() => setShowHistorical(s => !s)}
          className="text-xs px-3 py-1.5 rounded-lg border"
          style={{
            background: showHistorical ? FR.slate : 'transparent',
            color: showHistorical ? FR.salt : FR.slate,
            borderColor: FR.sand, fontFamily: "'Inter', sans-serif",
          }}
        >
          {showHistorical ? 'Hide historical' : 'Show 12 weeks of historical'}
        </button>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="text-xs" style={{ fontFamily: "'Inter', sans-serif", borderCollapse: 'separate', borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: COL_W_LEFT }} />
            <col style={{ width: COL_W_LABEL }} />
            {visibleWeeks.map((_, i) => <col key={i} style={{ width: COL_W_DATA }} />)}
          </colgroup>

          <thead>
            {/* Row 1: grand total + monthly subtotals */}
            <tr style={{ background: FR.navyDeep, color: FR.salt }}>
              <th colSpan={2} className="sticky left-0 z-20 px-3 py-1.5 text-right font-semibold tabular-nums"
                  style={{ background: FR.navyDeep, color: FR.salt, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                ${Math.round(grandTotal).toLocaleString()}
              </th>
              {monthSpans.map((m, i) => (
                <th key={i} colSpan={m.span} className="px-2 py-1 text-center border-l text-[10px] font-medium"
                    style={{ borderColor: FR.navy, color: FR.salt, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  ${Math.round(monthlyTotals[m.month] || 0).toLocaleString()}
                </th>
              ))}
            </tr>
            {/* Row 2: month names */}
            <tr style={{ background: FR.navy, color: FR.salt }}>
              <th colSpan={2} className="sticky left-0 z-20 px-3 py-1.5 text-left font-semibold uppercase tracking-[0.06em]"
                  style={{ background: FR.navy }}></th>
              {monthSpans.map((m, i) => (
                <th key={i} colSpan={m.span} className="px-2 py-1.5 text-center border-l font-semibold uppercase tracking-[0.08em]"
                    style={{ borderColor: FR.navyDeep, color: FR.salt, fontFamily: "'Cormorant Garamond', serif", fontSize: 13 }}>
                  {m.month}
                </th>
              ))}
            </tr>
            {/* Row 3: week numbers */}
            <tr style={{ background: FR.navy, color: FR.salt }}>
              <th className="sticky left-0 z-20 px-3 py-1 text-left text-[10px] font-medium" style={{ background: FR.navy, color: FR.salt }}>Week</th>
              <th className="sticky px-3 py-1" style={{ background: FR.navy, position: 'sticky', left: COL_W_LEFT, zIndex: 19 }}></th>
              {visibleWeeks.map((w, i) => (
                <th key={i} className="px-2 py-1 text-center border-l text-[10px]"
                    style={{ borderColor: FR.navyDeep, color: FR.salt, background: w.isCurrent ? FR.navyDeep : undefined }}>
                  {w.weekIndex + 1}
                </th>
              ))}
            </tr>
            {/* Row 4: dates */}
            <tr style={{ background: FR.navy, color: FR.salt }}>
              <th className="sticky left-0 z-20 px-3 py-1 text-left text-[10px] font-medium" style={{ background: FR.navy, color: FR.salt }}>Date</th>
              <th className="sticky px-3 py-1" style={{ background: FR.navy, position: 'sticky', left: COL_W_LEFT, zIndex: 19 }}></th>
              {visibleWeeks.map((w, i) => (
                <th key={i} className="px-2 py-1 text-center border-l text-[10px] tabular-nums"
                    style={{
                      borderColor: FR.navyDeep, color: FR.salt,
                      background: w.isCurrent ? FR.navyDeep : undefined,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontWeight: w.isCurrent ? 700 : 400,
                    }}>
                  {w.dateLabel}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sections.map((row, ri) => (
              row.header
                ? <SectionHeader key={ri} row={row} weeks={visibleWeeks} />
                : <DataRow key={ri} row={row} weeks={visibleWeeks} prevRow={sections[ri - 1]} currentWeekIndex={currentWeekIndex} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionHeader({ row, weeks }) {
  // First weekly column shows the date if anchorKey is set ('date')
  const firstDate = row.anchorKey === 'date' && weeks[0] ? weeks[0].dateLabel : '';
  return (
    <tr>
      <td colSpan={2} className="sticky left-0 z-10 px-3 py-1.5 font-semibold uppercase text-[10px] tracking-[0.12em]"
          style={{ background: FR.sand, color: FR.slate }}>
        {row.label}
      </td>
      <td className="px-2 py-1.5 text-center text-[10px] tabular-nums border-l"
          style={{ background: FR.sand, color: FR.stone, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', borderColor: 'rgba(255,255,255,0.5)' }}>
        {firstDate}
      </td>
      {weeks.slice(1).map((_, i) => (
        <td key={i} className="px-2 py-1.5 border-l" style={{ background: FR.sand, borderColor: 'rgba(255,255,255,0.5)' }} />
      ))}
    </tr>
  );
}

function DataRow({ row, weeks, prevRow, currentWeekIndex }) {
  const isSubtotal = row.kind === 'subtotal' || row.kind === 'subtotal-out';
  const rowBg = isSubtotal ? 'rgba(235,229,213,0.25)' : 'transparent';

  // If the previous row in the same group had the same leftLabel, skip rendering it
  const showLeftLabel = row.leftLabel && (!prevRow || prevRow.leftLabel !== row.leftLabel);
  // Always show leftValue when present (it's the row directly under leftLabel)
  const leftCellTop = row.leftLabel || '';
  const leftCellBottom = row.leftValue || '';

  return (
    <tr style={{ background: rowBg }}>
      <td className="sticky left-0 z-10 px-2 py-0.5 align-top"
          style={{ background: 'white', minWidth: COL_W_LEFT, borderRight: `1px solid ${FR.sand}` }}>
        {showLeftLabel && (
          <div style={{ color: FR.stone, fontSize: 9.5, lineHeight: 1.1, textAlign: 'right', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {leftCellTop}
          </div>
        )}
        {leftCellBottom && (
          <div style={{ color: FR.slate, fontSize: 11, textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {leftCellBottom}
          </div>
        )}
      </td>
      <td className="sticky px-3 py-1"
          style={{
            background: 'white', color: FR.slate, fontWeight: isSubtotal ? 600 : 400,
            position: 'sticky', left: COL_W_LEFT, zIndex: 9, minWidth: COL_W_LABEL,
            borderRight: `1px solid ${FR.sand}`,
          }}>
        {row.label}
      </td>
      {weeks.map((w, wi) => {
        const v = w[row.key];
        const isCurrentCol = wi === currentWeekIndex;
        const display = row.kind === 'pending'
          ? <span style={{ color: FR.stone, fontStyle: 'italic', fontSize: 10 }}>pending</span>
          : fmt(v, row.kind);
        const color = colorFor(v, row.kind, w.isHistorical, isCurrentCol);
        return (
          <td key={wi} className="px-2 py-1 text-right border-l tabular-nums"
              style={{
                color, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: isSubtotal ? 600 : 400,
                borderColor: FR.sand,
                background: isCurrentCol ? 'rgba(31,58,87,0.06)' : undefined,
                fontSize: 11,
              }}>
            {display}
          </td>
        );
      })}
    </tr>
  );
}
