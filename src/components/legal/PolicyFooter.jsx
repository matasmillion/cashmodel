// @ts-check
// PolicyFooter — the closing block on every policy page. Surfaces the
// version + effective date as a single line, then a small "Last
// updated" timestamp underneath. Visually balances <PolicyHeader>.

/**
 * @param {{ title: string; version: string; effective: string; lastReviewed: string }} props
 */
export default function PolicyFooter({ title, version, effective, lastReviewed }) {
  return (
    <footer style={{
      marginTop: 48,
      paddingTop: 22,
      borderTop: '0.5px solid rgba(58,58,58,0.15)',
      fontFamily: "'Inter', sans-serif",
      color: '#3A3A3A',
    }}>
      <div style={{
        fontSize: 12, letterSpacing: '0.04em',
        color: 'rgba(58,58,58,0.6)',
        marginBottom: 6,
      }}>
        End of {title} — v{version} — Effective {effective}
      </div>
      <div style={{
        fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(58,58,58,0.4)',
      }}>
        Last reviewed {lastReviewed}
      </div>
    </footer>
  );
}
