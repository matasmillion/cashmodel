// Forecast tab — composition of the assumptions strip, the bridge chart,
// and a top-20 SKU stockout calendar with search filter.
//
// Per spec §6A/B/C. §6D (forecastStore + sprint-store integration) is a
// follow-up; the current strip drives the lift multiplier directly via
// AppContext, which is enough for the projections to update everywhere.

import { useState } from 'react';
import { Search } from 'lucide-react';
import AssumptionsStrip from './AssumptionsStrip';
import BridgeChart from './BridgeChart';
import CockpitCalendar from './CockpitCalendar';
import { INV, FADE, TYPE, EYEBROW, SECTION_TITLE } from './inventoryTokens';

export default function InventoryForecast() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={EYEBROW}>Forecast</div>
        <h3 style={{ ...SECTION_TITLE, marginTop: 4 }}>Forward 12 months</h3>
      </div>

      <AssumptionsStrip />

      <div style={{ marginBottom: 16 }}>
        <BridgeChart />
      </div>

      {/* Stockout calendar — top 20 by revenue with SKU search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
      }}>
        <div>
          <div style={EYEBROW}>Stockout calendar</div>
          <div style={{
            fontFamily: TYPE.serif,
            fontSize: 16,
            color: INV.slate,
            marginTop: 2,
          }}>
            Next 12 months · daily cover state
          </div>
        </div>
        <div style={{
          marginLeft: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          border: `1px solid ${FADE.slate10}`,
          borderRadius: 4,
          background: '#FFF',
          minWidth: 280,
        }}>
          <Search size={11} color={FADE.slate60} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter to a SKU (or leave blank for top 20)"
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
        </div>
      </div>

      <CockpitCalendar
        eyebrowOverride="Top 20 by revenue"
        searchQuery={searchQuery}
        topN={searchQuery ? null : 20}
      />
    </div>
  );
}
