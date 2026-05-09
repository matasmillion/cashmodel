// Cockpit — daily operator view. Composes:
//   1. KPI tiles row              ✅ Phase 2B
//   2. Multi-SKU calendar          ✅ Phase 2C
//   3. Urgent reorders + health    ✅ Phase 2D
//   4. Revenue trend + categories  ✅ Phase 2E

import { useState } from 'react';
import InventorySyncButton from './InventorySyncButton';
import CockpitKPIs from './CockpitKPIs';
import CockpitCalendar from './CockpitCalendar';
import UrgentReorders from './UrgentReorders';
import InventoryHealth from './InventoryHealth';
import RevenueTrend from './RevenueTrend';
import CategoryPerformance from './CategoryPerformance';

export default function InventoryCockpit() {
  // Bump on every sync so child components reload from the fresh snapshot.
  const [syncTick, setSyncTick] = useState(0);

  return (
    <div>
      <InventorySyncButton onSynced={() => setSyncTick(t => t + 1)} />
      <CockpitKPIs key={`kpi-${syncTick}`} />
      <CockpitCalendar key={`cal-${syncTick}`} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 14,
        marginBottom: 14,
      }}>
        <UrgentReorders key={`urg-${syncTick}`} />
        <InventoryHealth key={`hth-${syncTick}`} />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 14,
        marginBottom: 14,
      }}>
        <RevenueTrend key={`rev-${syncTick}`} />
        <CategoryPerformance key={`cat-${syncTick}`} />
      </div>
    </div>
  );
}
