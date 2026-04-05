import React from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatPercent, formatDate, getMonthFromDate } from '../utils/calculations';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

export default function CashflowTable() {
  const { projections } = useApp();
  const weeks = projections;

  const sections = [
    { title: 'Revenue Layer Cake', rows: [
      { label: 'Acquisition Revenue', key: 'acquisitionRevenue' },
      { label: 'Retention Revenue', key: 'retentionRevenue' },
      { label: 'Event Revenue', key: 'eventRevenue' },
      { label: 'Total Revenue', key: 'revenue', bold: true, highlight: true },
    ]},
    { title: 'P&L', rows: [
      { label: 'COGS', key: 'cogs' },
      { label: 'Gross Profit', key: 'grossProfit', highlight: true },
      { label: 'Gross Margin %', key: 'grossMargin', format: 'percent' },
      { label: 'Ad Spend', key: 'weeklyAdSpend', negate: true },
      { label: 'Creative', key: 'creativeCost' },
      { label: 'Contribution Margin', key: 'contributionMargin', bold: true, highlight: true },
      { label: 'CM %', key: 'cmPercent', format: 'percent' },
      { label: 'Variable + OPEX', key: 'variableCosts' },
      { label: 'Net Profit', key: 'plNetProfit', bold: true, highlight: true },
      { label: 'Net Margin %', key: 'plMargin', format: 'percent' },
    ]},
    { title: 'Cash Flow', rows: [
      { label: 'PO Payments', key: 'poPayments' },
      { label: 'Weekly Cash', key: 'weeklyCash', bold: true },
      { label: 'Cumulative Cash', key: 'cumulativeCash', bold: true, highlight: true },
    ]},
    { title: 'Free Cash Position', rows: [
      { label: 'Working Capital', key: 'workingCapital' },
      { label: 'ST Liabilities', key: 'stLiabilities' },
      { label: 'Free Cash', key: 'freeCash', bold: true, highlight: true },
    ]},
    { title: 'Inventory', rows: [
      { label: 'Orders', key: 'orders' },
      { label: 'Units Sold', key: 'unitsSold' },
      { label: 'On Hand (units)', key: 'inventoryUnits' },
      { label: 'Weeks of Inventory', key: 'weeksOfInventory', format: 'number' },
    ]},
    { title: 'Content & Creators', rows: [
      { label: 'Creator Videos', key: 'creatorVideos', format: 'number' },
      { label: 'Founder Videos', key: 'founderVideos', format: 'number' },
      { label: 'AI Concepts', key: 'aiConcepts', format: 'number' },
      { label: 'Total Concepts', key: 'totalConcepts', format: 'number' },
      { label: 'Winners', key: 'winners', format: 'number' },
    ]},
  ];

  const months = [];
  let currentMonth = '';
  let monthSpan = 0;
  weeks.forEach((w) => {
    const m = getMonthFromDate(w.date);
    if (m !== currentMonth) {
      if (currentMonth) months.push({ month: currentMonth, span: monthSpan });
      currentMonth = m;
      monthSpan = 1;
    } else { monthSpan++; }
  });
  if (currentMonth) months.push({ month: currentMonth, span: monthSpan });

  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: 'white', borderColor: FR.sand }}>
      <div className="p-4 border-b" style={{ borderColor: FR.sand }}>
        <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20 }}>
          Weekly P&L & Cash Flow — {weeks.length} Weeks Through Dec {new Date().getFullYear()}
        </h3>
        <p className="text-xs mt-1" style={{ color: FR.stone }}>Revenue = Acquisition + Retention + Events | Growth Model Framework</p>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs" style={{ fontFamily: "'Inter', sans-serif" }}>
          <thead>
            <tr style={{ background: FR.sand }}>
              <th className="sticky left-0 z-10 px-3 py-2 text-left font-medium w-40 min-w-[160px]" style={{ background: FR.sand, color: FR.stone }}>Month</th>
              {months.map((m, i) => (
                <th key={i} colSpan={m.span} className="px-2 py-2 text-center font-semibold border-l" style={{ color: FR.slate, borderColor: 'rgba(235,229,213,0.8)', fontFamily: "'Cormorant Garamond', serif", fontSize: 14 }}>{m.month}</th>
              ))}
            </tr>
            <tr style={{ background: 'rgba(235,229,213,0.3)' }}>
              <th className="sticky left-0 z-10 px-3 py-1 text-left font-medium" style={{ background: FR.salt, color: FR.stone }}>Week</th>
              {weeks.map((w, i) => <th key={i} className="px-2 py-1 text-center font-normal min-w-[80px]" style={{ color: FR.stone }}>{w.week}</th>)}
            </tr>
            <tr style={{ background: 'rgba(235,229,213,0.3)' }}>
              <th className="sticky left-0 z-10 px-3 py-1 text-left font-medium" style={{ background: FR.salt, color: FR.stone }}>Monday</th>
              {weeks.map((w, i) => <th key={i} className="px-2 py-1 text-center font-normal text-[10px]" style={{ color: FR.stone }}>{formatDate(w.date)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sections.map((section, si) => (
              <React.Fragment key={`section-${si}`}>
                <tr style={{ background: FR.sand }}>
                  <td colSpan={weeks.length + 1} className="sticky left-0 px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.12em]" style={{ color: FR.soil }}>{section.title}</td>
                </tr>
                {section.rows.map((row, ri) => (
                  <tr key={`${si}-${ri}`} className="hover:bg-[rgba(235,229,213,0.2)]" style={row.bold ? { background: 'rgba(235,229,213,0.15)' } : {}}>
                    <td className="sticky left-0 z-10 px-3 py-1.5" style={{ background: 'white', color: row.bold ? FR.slate : FR.stone, fontWeight: row.bold ? 600 : 400 }}>{row.label}</td>
                    {weeks.map((w, wi) => {
                      let val = w[row.key];
                      if (row.negate && val > 0) val = -val;
                      let display;
                      if (row.format === 'percent') display = formatPercent(val);
                      else if (row.format === 'number') display = val != null ? Math.round(val).toLocaleString() : '-';
                      else display = formatCurrency(val);

                      const isNeg = val < 0;
                      let cellColor = w.isActual ? '#2563eb' : FR.slate;
                      if (isNeg) cellColor = '#b91c1c';
                      if (row.highlight && val > 0 && !w.isActual) cellColor = '#166534';
                      if (row.key === 'weeksOfInventory' && val <= 11) cellColor = '#b91c1c';

                      return (
                        <td key={wi} className="px-2 py-1.5 text-right font-mono tabular-nums" style={{ color: cellColor, fontWeight: row.bold ? 600 : 400, fontSize: 11 }}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
