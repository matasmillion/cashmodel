// InventoryView — top-level inventory page. Reads the inventory hash and
// renders the matching sub-view. Mirrors PLMView's pattern.

import { useEffect, useState } from 'react';
import { parseInventoryHash, setInventoryHash, INVENTORY_VIEWS } from '../../utils/inventoryRouting';
import InventoryCockpit from './InventoryCockpit';
import InventoryTable from './InventoryTable';
import InventorySellThrough from './InventorySellThrough';
import InventoryOTB from './InventoryOTB';
import InventoryPOs from './InventoryPOs';
import InventoryForecast from './InventoryForecast';
import SkuDetail from './SkuDetail';

const FR = {
  slate: '#3A3A3A',
  salt:  '#F5F0E8',
  sand:  '#EBE5D5',
  stone: '#716F70',
};

const SUBTABS = [
  { id: 'cockpit',      label: 'Cockpit' },
  { id: 'inventory',    label: 'Inventory' },
  { id: 'sell-through', label: 'Sell-Through' },
  { id: 'otb',          label: 'Open-to-Buy' },
  { id: 'pos',          label: 'POs' },
  { id: 'forecast',     label: 'Forecast' },
];

export default function InventoryView() {
  const [route, setRoute] = useState(() => parseInventoryHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseInventoryHash());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const currentView = route.view || 'cockpit';

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <h2 style={{
          color: FR.slate,
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 24,
          margin: 0,
          marginRight: 16,
          fontWeight: 400,
        }}>
          Inventory
        </h2>

        <div style={{
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
          borderBottom: `1px solid ${FR.sand}`,
          paddingBottom: 4,
          flex: 1,
        }}>
          {SUBTABS.map(t => {
            const active = currentView === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setInventoryHash({ view: t.id })}
                style={{
                  background: active ? FR.slate : 'transparent',
                  color: active ? FR.salt : FR.stone,
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {currentView === 'cockpit'      && <InventoryCockpit />}
      {currentView === 'inventory'    && <InventoryTable />}
      {currentView === 'sell-through' && <InventorySellThrough />}
      {currentView === 'otb'          && <InventoryOTB />}
      {currentView === 'pos'          && <InventoryPOs />}
      {currentView === 'forecast'     && <InventoryForecast />}
      {currentView === 'sku' && route.sku && <SkuDetail sku={route.sku} />}
    </div>
  );
}
