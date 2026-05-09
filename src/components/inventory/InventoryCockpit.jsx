// Cockpit — daily operator view. Composes:
//   1. KPI tiles row              ✅ Phase 2B
//   2. Multi-SKU calendar          ✅ Phase 2C
//   3. Urgent reorders + health    ✅ Phase 2D
//   4. Revenue trend + categories  ✅ Phase 2E

import CockpitKPIs from './CockpitKPIs';
import CockpitCalendar from './CockpitCalendar';
import UrgentReorders from './UrgentReorders';
import InventoryHealth from './InventoryHealth';
import RevenueTrend from './RevenueTrend';
import CategoryPerformance from './CategoryPerformance';

export default function InventoryCockpit() {
  return (
    <div>
      <CockpitKPIs />
      <CockpitCalendar />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 14,
        marginBottom: 14,
      }}>
        <UrgentReorders />
        <InventoryHealth />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 14,
        marginBottom: 14,
      }}>
        <RevenueTrend />
        <CategoryPerformance />
      </div>
    </div>
  );
}
