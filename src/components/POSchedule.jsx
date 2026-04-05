import React from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/calculations';
import { Package, AlertTriangle, Check } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

export default function POSchedule() {
  const { projections, autoPOs, state } = useApp();

  const allPOs = [...autoPOs, ...state.manualPOs];

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Purchase Order Schedule</h2>
        <p className="text-xs mt-1" style={{ color: FR.stone }}>
          Auto-generated from inventory model. 30/40/30 payment split | {state.assumptions.leadTime || 10}-week lead time | {state.assumptions.poCooldownWeeks || 8}-week cooldown
        </p>
      </div>

      {/* PO Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: 'white', borderColor: FR.sand }}>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs" style={{ fontFamily: "'Inter', sans-serif" }}>
            <thead>
              <tr style={{ background: FR.sand }}>
                <th className="px-3 py-2 text-left font-medium" style={{ color: FR.stone }}>PO</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: FR.stone }}>Order Date</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: FR.stone }}>Wk</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: FR.stone }}>Units</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: FR.stone }}>Full Cost</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: '#2563eb' }}>30% Deposit</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: FR.stone }}>Dep Date</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: FR.sienna }}>40% Prod</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: FR.stone }}>Prod Date</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: FR.sage }}>30% N30</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: FR.stone }}>N30 Date</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: FR.stone }}>Arrives</th>
              </tr>
            </thead>
            <tbody>
              {allPOs.map((po, i) => (
                <tr key={po.id || i} style={{ borderTop: `1px solid rgba(235,229,213,0.5)` }}>
                  <td className="px-3 py-2 font-medium" style={{ color: FR.slate }}>{po.id}</td>
                  <td className="px-3 py-2" style={{ color: FR.slate }}>{formatDate(po.orderDate)}</td>
                  <td className="px-3 py-2 text-right" style={{ color: FR.stone }}>{po.weekIndex}</td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: FR.slate }}>{po.units?.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: FR.slate }}>{formatCurrency(po.fullCost)}</td>
                  {po.payments?.map((pmt, j) => (
                    <React.Fragment key={j}>
                      <td className="px-3 py-2 text-right" style={{ color: j === 0 ? '#2563eb' : j === 1 ? FR.sienna : FR.sage }}>{formatCurrency(pmt.amount)}</td>
                      <td className="px-3 py-2" style={{ color: FR.stone }}>{formatDate(pmt.date)}</td>
                    </React.Fragment>
                  ))}
                  <td className="px-3 py-2" style={{ color: FR.slate }}>{formatDate(po.arrivalDate)}</td>
                </tr>
              ))}
              {allPOs.length > 0 && (
                <tr style={{ background: 'rgba(235,229,213,0.2)', borderTop: `1px solid ${FR.sand}` }}>
                  <td className="px-3 py-2 font-semibold" style={{ color: FR.slate }}>TOTALS</td>
                  <td></td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: FR.slate }}>{allPOs.reduce((s, po) => s + (po.units || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: FR.slate }}>{formatCurrency(allPOs.reduce((s, po) => s + (po.fullCost || 0), 0))}</td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: '#2563eb' }}>{formatCurrency(allPOs.reduce((s, po) => s + (po.payments?.[0]?.amount || 0), 0))}</td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: FR.sienna }}>{formatCurrency(allPOs.reduce((s, po) => s + (po.payments?.[1]?.amount || 0), 0))}</td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: FR.sage }}>{formatCurrency(allPOs.reduce((s, po) => s + (po.payments?.[2]?.amount || 0), 0))}</td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory Alerts */}
      <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
        <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18, marginBottom: 12 }}>Inventory Forecast</h3>
        <div className="space-y-2">
          {projections.filter(w => w.needsPO).slice(0, 5).map(w => (
            <div key={w.week} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(212,149,106,0.08)', border: `1px solid rgba(212,149,106,0.2)` }}>
              <AlertTriangle size={14} style={{ color: FR.sienna }} />
              <span className="text-xs" style={{ color: FR.slate }}>
                <strong>Week {w.week}</strong> ({formatDate(w.date)}) — {w.inventoryUnits} units on hand, {w.weeksOfInventory} weeks of supply. PO trigger reached.
              </span>
            </div>
          ))}
          {projections.filter(w => w.needsPO).length === 0 && (
            <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(173,189,163,0.08)', border: `1px solid rgba(173,189,163,0.2)` }}>
              <Check size={14} style={{ color: FR.sage }} />
              <span className="text-xs" style={{ color: FR.slate }}>Inventory levels healthy across all projected weeks.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
