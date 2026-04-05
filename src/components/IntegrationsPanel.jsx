import { Plug, ShoppingBag, BarChart3, CreditCard, Mail, Truck } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

const integrations = [
  { name: 'Shopify', description: 'Revenue, orders, payouts, inventory levels', icon: ShoppingBag, color: FR.sage },
  { name: 'Meta Ads', description: 'Ad spend, ROAS, CPA, campaign performance', icon: BarChart3, color: FR.sea },
  { name: 'Banking (Chase/AMEX)', description: 'Account balances, transactions, credit card statements', icon: CreditCard, color: FR.sienna },
  { name: 'Klaviyo', description: 'Email revenue attribution, subscriber growth', icon: Mail, color: FR.soil },
  { name: '3PL / Fulfillment', description: 'Shipping costs, pick & pack, warehouse fees', icon: Truck, color: FR.stone },
];

export default function IntegrationsPanel() {
  return (
    <div className="space-y-4">
      <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Integrations</h2>
      <p className="text-sm" style={{ color: FR.stone }}>Connect your data sources for live updates. Currently using imported Excel data.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map(int => {
          const Icon = int.icon;
          return (
            <div key={int.name} className="rounded-xl p-4 border" style={{ background: 'white', borderColor: FR.sand }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ background: FR.salt }}>
                    <Icon size={20} style={{ color: int.color }} />
                  </div>
                  <div>
                    <h3 className="font-medium" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{int.name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: FR.stone }}>{int.description}</p>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full" style={{ background: FR.sand, color: FR.stone }}>Coming Soon</span>
              </div>
              <button className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border cursor-not-allowed"
                style={{ background: FR.salt, borderColor: FR.sand, color: FR.stone }}>
                <Plug size={14} /> Connect
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
