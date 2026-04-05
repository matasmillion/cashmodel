import { useApp } from '../context/AppContext';
import { formatCurrency, formatPercent } from '../utils/calculations';
import { TrendingUp, TrendingDown, DollarSign, Package, CreditCard, BarChart3, Shield, Wallet } from 'lucide-react';

export default function KPICards() {
  const { projections, totalMonthlyOpex, state } = useApp();
  if (!projections.length) return null;

  const current = projections[0]; // Current week
  const lastProjected = projections[projections.length - 1];
  const weeklyRevenue = current.revenue;
  const monthlyRevenue = weeklyRevenue * 4.33;
  const cashOnHand = current.totalCash;
  const activePOs = (state.manualPOs?.length || 0);

  const freeCash = current.freeCash || 0;
  const stLiabilities = current.stLiabilities || 0;

  const cards = [
    { label: 'Cash on Hand', value: formatCurrency(cashOnHand), icon: DollarSign, color: 'sage', sub: current.isCurrent ? 'Current Week' : `Week ${current.week}` },
    { label: 'Free Cash', value: formatCurrency(freeCash), icon: Shield, color: freeCash > 0 ? 'sea' : 'sienna', sub: `Payables: ${formatCurrency((current.stAdsPayable || 0) + (current.stFulfillmentPayable || 0))} | WC: ${formatCurrency(current.workingCapital || 0)}` },
    { label: 'Weekly Revenue', value: formatCurrency(weeklyRevenue), icon: TrendingUp, color: 'sea', sub: formatCurrency(monthlyRevenue) + '/mo' },
    { label: 'Weekly Ad Spend', value: formatCurrency(current.weeklyAdSpend), icon: BarChart3, color: 'soil', sub: `Daily: ${formatCurrency(current.dailyAdSpend)}` },
    { label: 'Inventory Value', value: formatCurrency(current.inventory), icon: Package, color: 'sienna', sub: `${activePOs} active POs` },
    { label: 'Working Capital', value: formatCurrency(current.workingCapital || 0), icon: Wallet, color: 'stone', sub: `Tied up in fulfillment` },
  ];

  const colorMap = {
    sage: { bg: '#ADBDA3', text: '#3A3A3A', accent: 'rgba(173,189,163,0.15)', border: 'rgba(173,189,163,0.4)' },
    sea: { bg: '#B5C7D3', text: '#3A3A3A', accent: 'rgba(181,199,211,0.15)', border: 'rgba(181,199,211,0.4)' },
    soil: { bg: '#9A816B', text: '#3A3A3A', accent: 'rgba(154,129,107,0.15)', border: 'rgba(154,129,107,0.4)' },
    sienna: { bg: '#D4956A', text: '#3A3A3A', accent: 'rgba(212,149,106,0.15)', border: 'rgba(212,149,106,0.4)' },
    stone: { bg: '#716F70', text: '#3A3A3A', accent: 'rgba(113,111,112,0.12)', border: 'rgba(113,111,112,0.3)' },
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        const c = colorMap[card.color];
        return (
          <div key={i} className="rounded-xl p-4 animate-fade-in border"
            style={{ background: c.accent, borderColor: c.border }}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} style={{ color: c.bg }} />
              <span className="text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: '#716F70' }}>{card.label}</span>
            </div>
            <div className="text-xl font-semibold" style={{ color: '#3A3A3A', fontFamily: "'Cormorant Garamond', serif" }}>{card.value}</div>
            <div className="text-[11px] mt-1" style={{ color: '#716F70' }}>{card.sub}</div>
          </div>
        );
      })}
    </div>
  );
}
