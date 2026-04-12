import { AppProvider, useApp } from './context/AppContext';
import KPICards from './components/KPICards';
import CashflowChart from './components/CashflowChart';
import CashflowTable from './components/CashflowTable';
import UnitEconomics from './components/UnitEconomics';
import POBuilder from './components/POBuilder';
import POSchedule from './components/POSchedule';
import OpexManager from './components/OpexManager';
import ScenarioManager from './components/ScenarioManager';
import IntegrationsPanel from './components/IntegrationsPanel';
import RevenueForecast from './components/RevenueForecast';
import AdUnitModel from './components/AdUnitModel';
import RateCardManager from './components/RateCardManager';
import { LayoutDashboard, Table2, Calculator, Package, Receipt, Sliders, Plug, TrendingUp, Film, CalendarRange, Truck } from 'lucide-react';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'revenue', label: 'Revenue', icon: TrendingUp },
  { id: 'cashflow', label: 'P&L + Cash', icon: Table2 },
  { id: 'ad-units', label: 'Creative', icon: Film },
  { id: 'unit-economics', label: 'Unit Econ', icon: Calculator },
  { id: 'fulfillment', label: 'Fulfillment', icon: Truck },
  { id: 'po-schedule', label: 'PO Schedule', icon: CalendarRange },
  { id: 'pos', label: 'New PO', icon: Package },
  { id: 'opex', label: 'OPEX', icon: Receipt },
  { id: 'scenarios', label: 'Scenarios', icon: Sliders },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

function Dashboard() {
  const { state, dispatch } = useApp();

  return (
    <div className="min-h-screen" style={{ background: '#F5F0E8' }}>
      <header className="backdrop-blur-sm border-b sticky top-0 z-50" style={{ background: 'rgba(245,240,232,0.95)', borderColor: '#EBE5D5' }}>
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl tracking-wide" style={{ color: '#3A3A3A', fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '0.05em' }}>
                FOREIGN RESOURCE
              </h1>
              <p className="text-xs uppercase tracking-[0.15em] mt-0.5" style={{ color: '#716F70', fontFamily: "'Inter', sans-serif" }}>
                Growth Model & Operating Dashboard
              </p>
            </div>
            <nav className="flex gap-1 flex-wrap">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = state.activeTab === tab.id;
                return (
                  <button key={tab.id}
                    onClick={() => dispatch({ type: 'SET_TAB', payload: tab.id })}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                      background: isActive ? '#3A3A3A' : 'transparent',
                      color: isActive ? '#F5F0E8' : '#716F70',
                      fontFamily: "'Inter', sans-serif",
                    }}
                    onMouseEnter={e => { if (!isActive) { e.target.style.background = '#EBE5D5'; e.target.style.color = '#3A3A3A'; } }}
                    onMouseLeave={e => { if (!isActive) { e.target.style.background = 'transparent'; e.target.style.color = '#716F70'; } }}
                  >
                    <Icon size={13} />
                    <span className="hidden lg:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {state.activeTab === 'dashboard' && (
          <>
            <KPICards />
            <CashflowChart />
            <CashflowTable />
          </>
        )}
        {state.activeTab === 'revenue' && <RevenueForecast />}
        {state.activeTab === 'cashflow' && <CashflowTable />}
        {state.activeTab === 'ad-units' && <AdUnitModel />}
        {state.activeTab === 'unit-economics' && <UnitEconomics />}
        {state.activeTab === 'fulfillment' && <RateCardManager />}
        {state.activeTab === 'po-schedule' && <POSchedule />}
        {state.activeTab === 'pos' && <POBuilder />}
        {state.activeTab === 'opex' && <OpexManager />}
        {state.activeTab === 'scenarios' && <ScenarioManager />}
        {state.activeTab === 'integrations' && <IntegrationsPanel />}
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}

export default App;
