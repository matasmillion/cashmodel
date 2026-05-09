// Sell-through under the Inventory module. Renders the existing
// SellThrough component as a transitional shim until Phase 5 rebuilds
// it as an inventory-native velocity matrix.

import SellThrough from '../SellThrough';

export default function InventorySellThrough() {
  return <SellThrough />;
}
