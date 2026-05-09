// SKU detail drill-down — 12-month calendar, incoming POs, pause/hold actions.
// Phase 3 replaces this stub.

import { setInventoryHash } from '../../utils/inventoryRouting';

export default function SkuDetail({ sku }) {
  return (
    <div style={{
      background: '#FBF7EE',
      border: '1px solid rgba(58,58,58,0.10)',
      borderRadius: 4,
      padding: 32,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <button
        onClick={() => setInventoryHash({ view: 'inventory' })}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#716F70',
          fontSize: 11,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 12,
        }}
      >
        ← Back to inventory
      </button>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 22, color: '#3A3A3A', margin: 0 }}>
        SKU detail
      </h3>
      <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: '#716F70', fontFamily: "'SF Mono', Menlo, monospace" }}>
        {sku}
      </p>
      <p style={{ marginTop: 12, fontSize: 12, color: '#716F70' }}>
        12-month calendar, incoming POs, pause/hold actions land in Phase 3.
      </p>
    </div>
  );
}
