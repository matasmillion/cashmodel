// Cockpit — the daily operator view. Composes:
//   1. KPI tiles row              (Phase 2B — done)
//   2. Multi-SKU calendar          (Phase 2C)
//   3. Urgent reorders + health    (Phase 2D)
//   4. Revenue trend + categories  (Phase 2E)

import CockpitKPIs from './CockpitKPIs';
import CockpitCalendar from './CockpitCalendar';

export default function InventoryCockpit() {
  return (
    <div>
      <CockpitKPIs />
      <CockpitCalendar />
    </div>
  );
}
