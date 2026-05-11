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
// If preferMask is provided, an account with that exact mask wins over a generic
// role match — used so the Operating Cash label can pin to mask 6848 even when
// other Mercury sub-accounts (Treasury, Vault, Savings) are also role=operating.
function pickAccountName(bankAccounts, role, fallback, preferMask) {
  if (!bankAccounts || !bankAccounts.length) return fallback;
  const match =
    (preferMask && bankAccounts.find(a => a.mask === preferMask)) ||
    bankAccounts.find(a => a.role === role);
  if (!match) return fallback;
  // Strip "Foreign Resource" / "- Foreign Resource" from the Plaid account
  // name — it's the brand and reading it on every row is noise.
  const cleanName = (match.name || '')
    .replace(/[\s-]*foreign\s*resource/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lastFour = match.mask ? `(${match.mask})` : '';
  return `${cleanName} ${lastFour}`.trim();
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
  // Operating Cash = total Mercury depository balance (sum of every
  // Mercury sub-account, available). Renamed to "Cash Balance" per
  // operator since the row is no longer pinned to a single account.
  const operatingLabel = 'Cash Balance';
  const salesTaxLabel = pickAccountName(accs, 'salesTax', 'Sales Tax (6735)');
  const corpTaxLabel = pickAccountName(accs, 'corporateTax', 'Corporate Tax (8298)');
  const wcLabel = pickAccountName(accs, 'workingCapital', 'Working Capital (5125)');
  const fulfillmentLabel = pickAccountName(accs, 'fulfillment', 'Mercury Fulfillment (7301)');
  const marketingLabel = pickAccountName(accs, 'marketing', 'Mercury Marketing (3135)');
  const pct = v => `${Math.round(v * 100)}%`;

  // Shopify Payouts sub-label: only surface a hint when something
  // ACTUALLY went wrong (scope error, Mercury reconcile skipped, etc.)
  // — never when it's just a normal $725-pending kind of day. Keeps the
  // row clean. Breakdown still lives on seed for the curious.
  const reconcileSkipped = seed.shopifyPayoutsReconciliationSkipped;
  const reconcileReason = seed.shopifyPayoutsReconciliationSkipReason;
  const shopifyErrors = seed.shopifyPayoutsErrors || {};
  const shopifyErr = shopifyErrors.shopify_scheduled || shopifyErrors.shopify_in_transit || shopifyErrors.shopify_paid;
  let payoutsSubLabel = null;
  if (shopifyErr) {
    payoutsSubLabel = `Shopify API error: ${shopifyErr.slice(0, 160)}`;
  } else if (reconcileSkipped) {
    payoutsSubLabel = `Mercury reconcile skipped${reconcileReason ? ': ' + reconcileReason.slice(0, 180) : ''}`;
  }

  return [
    { header: true, label: 'Revenue Run Rate As Of', anchorKey: 'date' },
    { key: 'shopifyRevenue', label: 'Shopify Store',  kind: 'driver',
      leftLabel: 'Weekly Growth', leftValue: pct(C.weeklyGrowth - 1),
      leftEditableKey: 'weeklyGrowth', leftEditableType: 'growth' },
    { key: 'dailyAdSpend',   label: 'Daily Ad Spend',  kind: 'driver' },
    { key: 'fbAdSpend',      label: 'Weekly Ad Spend', kind: 'driver',
      leftLabel: 'MER', leftValue: pct(C.mer),
      leftEditableKey: 'mer', leftEditableType: 'percent' },
    { key: 'cogsRate',       label: 'COGS %',          kind: 'percent' },

    { header: true, label: 'Balance Sheet As Of', anchorKey: 'date' },
    { key: 'shopifyPayouts',     label: 'Shopify Payouts',     kind: 'balance', subLabel: payoutsSubLabel },
    { key: 'sbMain',             label: operatingLabel,        kind: 'balance',
      leftLabel: 'Profit %', leftValue: pct(C.profitPercentForWC) },
    // Working Capital lives WITHIN the Mercury cash balance — it's not
    // separately spendable cash. Operator wants it gray + italic above
    // Total Cash On Hand so the breakdown is visible without
    // double-counting.
    { key: 'workingCapital',     label: wcLabel,               kind: 'balance', subRow: true },
    { key: 'sbSalesTax',         label: salesTaxLabel,         kind: 'balance', subRow: true },
    { key: 'sbCorpTax',          label: corpTaxLabel,          kind: 'balance', subRow: true },
    { key: 'shopifyCapRepayment',label: 'Shopify Capital Repayment', kind: 'balance',
      subLabel: seed.shopifyCapitalPendingError ? `Shopify API error: ${String(seed.shopifyCapitalPendingError).slice(0, 160)}` : null },
    { key: '_poMilestonesPending', label: 'PO Milestones',     kind: 'pending' },
    { key: 'totalCashOnHand',    label: 'Total Cash On Hand',  kind: 'subtotal' },
    { key: 'inventory',          label: 'Inventory',           kind: 'balance' },
    { key: 'totalAssets',        label: 'Total Assets',        kind: 'subtotal' },

    { header: true, label: 'ST Liabilities' },
    { key: 'adsPayable',         label: 'Ads Payable',                 kind: 'balance' },
    // Mercury 3135 — cash earmarked toward Ads Payable. Gray italic so
    // the operator can see how funded the liability is at a glance.
    { key: 'mercuryMarketing',   label: marketingLabel,                kind: 'balance', subRow: true },
    { key: 'fulfillmentPayable', label: 'Fulfillment Payable',         kind: 'balance' },
    // Mercury 7301 — cash earmarked toward Fulfillment Payable.
    { key: 'mercuryFulfillment', label: fulfillmentLabel,              kind: 'balance', subRow: true },

    { header: true, label: 'LT Liabilities' },
    { key: 'chase5718',     label: 'CHASE 5718',     kind: 'balance', leftLabel: 'OPEX CARDS' },
    { key: 'amexPlum',      label: 'AMEX PLUM 0000', kind: 'balance' },
    { key: 'amexBlue',      label: 'AMEX BLUE 71005', kind: 'balance' },
    { key: 'shopifyCapital',label: 'Shopify Capital', kind: 'balance',
      subLabel: seed.shopifyCapitalOutstandingError ? `Shopify API error: ${String(seed.shopifyCapitalOutstandingError).slice(0, 160)}` : null },
    { key: 'longTermLoan',  label: 'Long Term Loan',  kind: 'balance' },
    { key: 'totalLiabilities',  label: 'Total Liabilities', kind: 'subtotal' },
    { key: 'totalEquity',       label: 'Total Equity',      kind: 'subtotal' },
    { key: 'netCashOfStLiab',   label: 'Net Cash of ST Liabilities', kind: 'subtotal' },

    { header: true, label: 'Projected Statement of Cashflows For WK Starting', anchorKey: 'date' },
    { key: 'onlineStore',     label: 'Online Store', kind: 'inflow',
      leftLabel: 'PP %', leftValue: pct(C.ppPercent) },
    { key: 'transferToWC',    label: 'Transfer to WC',           kind: 'outflow' },
    { key: 'totalInflows',    label: 'Total Inflows',            kind: 'subtotal' },
    { key: 'adsPaid',         label: 'Ads Payable',              kind: 'outflow', leftLabel: 'Variable Overhead' },
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

function colorFor(v, kind, isHistorical, isCurrent, informational) {
  if (v == null || kind === 'pending' || kind === 'index') return FR.slate;
  // Informational rows (e.g. Sales Tax reserve) are decoupled from Total
  // Cash — render in muted stone regardless of sign or week.
  if (informational) return FR.stone;
  if (isCurrent) return FR.blue;
  if (isHistorical) return FR.slate;
  if (kind === 'subtotal' || kind === 'inflow') return v > 0 ? FR.good : v < 0 ? FR.bad : FR.slate;
  if (kind === 'outflow' || kind === 'subtotal-out') return v > 0 ? FR.bad : FR.slate;
  return v < 0 ? FR.bad : FR.slate;
}

const COL_W_LEFT = 80;   // column A
const COL_W_LABEL = 220; // column B
const COL_W_DATA = 88;

function formatSyncAge(iso) {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'synced just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `synced ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `synced ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `synced ${days}d ago`;
}

export default function Cashflow58WeekTable() {
  const { state, dispatch, autoSyncState, triggerAutoSync } = useApp();
  const [showHistorical, setShowHistorical] = useState(false);
  const syncing = autoSyncState?.status === 'syncing';

  const weeks = useMemo(() => generateCashflow58({
    assumptions: state.assumptions,
    seed: state.seed,
    subscriptions: state.subscriptions,
    creditCards: state.creditCards,
    loans: state.loans,
    actualsHistory: state.actualsHistory,
    cardPaymentsActuals: state.cardPaymentsActuals,
  }), [state.assumptions, state.seed, state.subscriptions, state.creditCards, state.loans, state.actualsHistory, state.cardPaymentsActuals]);

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
            {visibleWeeks.length} weeks · live from Plaid + Shopify + Meta + OPEX
            {state.seed?.syncedAt && (
              <> · <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatSyncAge(state.seed.syncedAt)}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={() => triggerAutoSync({ realTime: true })}
            disabled={syncing}
            title="Force live refresh from Plaid + Shopify + Meta. Hits /accounts/balance/get on every bank (~$0.10/account, 10-30s)."
            className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{
              background: syncing ? FR.sand : FR.slate,
              color: syncing ? FR.stone : FR.salt,
              border: 'none', fontFamily: "'Inter', sans-serif",
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: syncing ? FR.stone : '#7DBE7D',
              animation: syncing ? 'pulse 1.4s ease-in-out infinite' : undefined,
            }} />
            {syncing ? 'Refreshing…' : 'Force real-time refresh'}
          </button>
        </div>
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
                : <DataRow key={ri} row={row} weeks={visibleWeeks} prevRow={sections[ri - 1]} currentWeekIndex={currentWeekIndex} assumptions={state.assumptions} dispatch={dispatch} />
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

function EditableLeftValue({ rawValue, editableType, onCommit }) {
  // rawValue is the assumption itself (e.g. 1.04 or 0.33). Display:
  //   editableType='growth'  → "4%"   (value 1.04 shown as 4%)
  //   editableType='percent' → "33%"  (value 0.33 shown as 33%)
  const toDisplay = (v) => {
    if (editableType === 'growth') return `${Math.round((v - 1) * 100)}%`;
    return `${Math.round(v * 100)}%`;
  };
  const fromDisplay = (s) => {
    const n = parseFloat(s.replace('%', '').trim());
    if (!Number.isFinite(n)) return null;
    return editableType === 'growth' ? 1 + n / 100 : n / 100;
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toDisplay(rawValue));

  const commit = () => {
    const next = fromDisplay(draft);
    if (next != null && next !== rawValue) onCommit(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(toDisplay(rawValue)); setEditing(false); }
        }}
        style={{
          width: '100%', textAlign: 'right', border: `1px solid ${FR.blue}`, borderRadius: 3,
          padding: '0 4px', fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: FR.slate, background: 'white', outline: 'none',
        }}
      />
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={() => { setDraft(toDisplay(rawValue)); setEditing(true); }}
      onKeyDown={e => { if (e.key === 'Enter') { setDraft(toDisplay(rawValue)); setEditing(true); } }}
      style={{
        color: FR.slate, fontSize: 11, textAlign: 'right',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        cursor: 'pointer', borderBottom: `1px dashed rgba(31,58,87,0.35)`,
      }}
    >
      {toDisplay(rawValue)}
    </div>
  );
}

function DataRow({ row, weeks, prevRow, currentWeekIndex, assumptions, dispatch }) {
  const isSubtotal = row.kind === 'subtotal' || row.kind === 'subtotal-out';
  const isSubRow = !!row.subRow;
  // Sub-rows (gray italic) sit visually attached to the row above
  // them — Mercury 3135 under Ads Payable, Mercury 7301 under
  // Fulfillment Payable. They show how much cash is set aside toward
  // that liability so the operator can see the funding gap.
  const rowBg = isSubtotal ? 'rgba(235,229,213,0.25)' : 'transparent';

  // If the previous row in the same group had the same leftLabel, skip rendering it
  const showLeftLabel = row.leftLabel && (!prevRow || prevRow.leftLabel !== row.leftLabel);
  // Always show leftValue when present (it's the row directly under leftLabel)
  const leftCellTop = row.leftLabel || '';
  const leftCellBottom = row.leftValue || '';
  const isEditable = !!row.leftEditableKey;
  const rawValue = isEditable
    ? (assumptions?.[row.leftEditableKey] ?? CASHFLOW_DEFAULTS[row.leftEditableKey])
    : null;

  const labelColor = isSubRow ? FR.stone : FR.slate;
  const labelStyle = isSubRow ? { fontStyle: 'italic', fontSize: 10.5, paddingLeft: 18 } : {};

  return (
    <tr style={{ background: rowBg }}>
      <td className="sticky left-0 z-10 px-2 py-0.5 align-top"
          style={{ background: 'white', minWidth: COL_W_LEFT, borderRight: `1px solid ${FR.sand}` }}>
        {showLeftLabel && (
          <div style={{ color: FR.stone, fontSize: 9.5, lineHeight: 1.1, textAlign: 'right', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {leftCellTop}
          </div>
        )}
        {isEditable ? (
          <EditableLeftValue
            rawValue={rawValue}
            editableType={row.leftEditableType}
            onCommit={(next) => dispatch({ type: 'UPDATE_ASSUMPTIONS', payload: { [row.leftEditableKey]: next } })}
          />
        ) : leftCellBottom && (
          <div style={{ color: FR.slate, fontSize: 11, textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {leftCellBottom}
          </div>
        )}
      </td>
      <td className="sticky px-3 py-1"
          style={{
            background: 'white', color: labelColor, fontWeight: isSubtotal ? 600 : 400,
            position: 'sticky', left: COL_W_LEFT, zIndex: 9, minWidth: COL_W_LABEL,
            borderRight: `1px solid ${FR.sand}`,
            ...labelStyle,
          }}>
        {row.label}
        {row.subLabel && (
          <div style={{
            color: FR.stone, fontStyle: 'italic', fontSize: 9.5,
            lineHeight: 1.2, marginTop: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>
            {row.subLabel}
          </div>
        )}
      </td>
      {weeks.map((w, wi) => {
        const v = w[row.key];
        const isCurrentCol = wi === currentWeekIndex;
        const display = row.kind === 'pending'
          ? <span style={{ color: FR.stone, fontStyle: 'italic', fontSize: 10 }}>pending</span>
          : fmt(v, row.kind);
        // Sub-rows always render in muted stone italic regardless of sign —
        // they're informational ("cash earmarked toward this liability"),
        // not part of any P&L.
        const color = isSubRow ? FR.stone : colorFor(v, row.kind, w.isHistorical, isCurrentCol, row.informational);
        return (
          <td key={wi} className="px-2 py-1 text-right border-l tabular-nums"
              style={{
                color, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: isSubtotal ? 600 : 400,
                fontStyle: isSubRow ? 'italic' : undefined,
                borderColor: FR.sand,
                background: isCurrentCol ? 'rgba(31,58,87,0.06)' : undefined,
                fontSize: isSubRow ? 10.5 : 11,
              }}>
            {display}
          </td>
        );
      })}
    </tr>
  );
}
