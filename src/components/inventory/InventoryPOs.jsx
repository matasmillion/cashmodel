// POs under the Inventory module. Renders the existing POBuilder
// (form + list, both reading productionStore) and POSchedule
// (the cashflow milestone table) as a transitional shim until
// Phase 5 rebuilds an inventory-native PO view.

import POBuilder from '../POBuilder';
import POSchedule from '../POSchedule';

export default function InventoryPOs() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <POBuilder />
      <POSchedule />
    </div>
  );
}
