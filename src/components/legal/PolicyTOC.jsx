// @ts-check
// PolicyTOC — anchor table of contents rendered above the policy body.
// Each entry deep-links to a <PolicySection id="..."> further down. The
// browser's native scroll-to-anchor handles the jump; we add `scroll-
// margin-top` on the section so the sticky LegalLayout header doesn't
// overlap the section title.

/**
 * @typedef {Object} PolicyTOCEntry
 * @property {string} id     - matches the id passed to <PolicySection>
 * @property {string} title
 */

/**
 * @param {{ entries: PolicyTOCEntry[] }} props
 */
export default function PolicyTOC({ entries }) {
  if (!entries || entries.length === 0) return null;
  return (
    <nav
      aria-label="Table of contents"
      style={{
        marginBottom: 32,
        padding: '18px 22px',
        background: '#F5F0E8',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 8,
      }}
    >
      <div style={{
        fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(58,58,58,0.55)', marginBottom: 10,
        fontFamily: "'Inter', sans-serif",
      }}>
        Contents
      </div>
      <ol style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '4px 18px',
        fontSize: 13,
        fontFamily: "'Inter', sans-serif",
      }}>
        {entries.map((entry, i) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              style={{
                color: '#3A3A3A',
                textDecoration: 'none',
                display: 'inline-flex',
                gap: 8,
                lineHeight: 1.5,
              }}
            >
              <span style={{
                color: 'rgba(58,58,58,0.4)',
                fontVariantNumeric: 'tabular-nums',
                minWidth: 22,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ borderBottom: '1px solid transparent' }}>
                {entry.title}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
