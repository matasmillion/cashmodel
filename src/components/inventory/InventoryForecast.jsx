// Forecast — forward 12 months with assumptions strip. Phase 6 replaces this stub.

export default function InventoryForecast() {
  return (
    <Placeholder title="Forecast" subtitle="Forward 12 months — spend × MER → demand → SKU-level coverage." />
  );
}

function Placeholder({ title, subtitle }) {
  return (
    <div style={{
      background: '#FBF7EE',
      border: '1px solid rgba(58,58,58,0.10)',
      borderRadius: 4,
      padding: 32,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 20, color: '#3A3A3A', margin: 0 }}>{title}</h3>
      <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: '#716F70' }}>{subtitle}</p>
    </div>
  );
}
