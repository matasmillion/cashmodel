// Cockpit — daily operator view. Composes:
//   1. KPI tiles row              ✅ Phase 2B
//   2. Multi-SKU calendar          ✅ Phase 2C  (now with SKU filter)
//   3. Urgent reorders + health    ✅ Phase 2D
//   4. Revenue trend + categories  ✅ Phase 2E

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import InventorySyncButton from './InventorySyncButton';
import CockpitKPIs from './CockpitKPIs';
import CockpitCalendar from './CockpitCalendar';
import UrgentReorders from './UrgentReorders';
import InventoryHealth from './InventoryHealth';
import RevenueTrend from './RevenueTrend';
import CategoryPerformance from './CategoryPerformance';
import { INV, FADE, TYPE } from './inventoryTokens';

export default function InventoryCockpit() {
  // Bump on every sync so child components reload from the fresh snapshot.
  const [syncTick, setSyncTick] = useState(0);
  // Inventory-cover SKU filter — case-insensitive substring match on
  // sku / style_name / color / size / cat. Empty = show all.
  const [coverSearch, setCoverSearch] = useState('');

  return (
    <div>
      <InventorySyncButton onSynced={() => setSyncTick(t => t + 1)} />
      <CockpitKPIs key={`kpi-${syncTick}`} />

      {/* Filter strip above the inventory cover calendar. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        padding: '0 4px',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          border: `1px solid ${FADE.slate10}`,
          borderRadius: 4,
          background: '#FFF',
          minWidth: 320,
          flex: 1,
          maxWidth: 540,
        }}>
          <Search size={11} color={FADE.slate60} />
          <input
            value={coverSearch}
            onChange={(e) => setCoverSearch(e.target.value)}
            placeholder="Filter inventory cover by SKU, style, color, size, or category"
            style={{
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontFamily: TYPE.sans,
              fontSize: 11,
              color: INV.slate,
              flex: 1,
              padding: '2px 0',
            }}
          />
          {coverSearch && (
            <button
              onClick={() => setCoverSearch('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: FADE.slate60,
                cursor: 'pointer',
                display: 'inline-flex',
                padding: 0,
              }}
              title="Clear filter"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <CockpitCalendar
        key={`cal-${syncTick}`}
        searchQuery={coverSearch}
      />

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
