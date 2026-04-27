// @ts-check
// PolicySection — h2 + content slot. Each numbered section in a policy
// renders as one <PolicySection>. The `id` is anchored by <PolicyTOC>
// for in-page navigation; `scroll-margin-top` keeps the heading clear of
// the LegalLayout sticky header when the user clicks a TOC link.

/**
 * @param {{ id: string; title: string; number?: number; children: any }} props
 */
export default function PolicySection({ id, title, number, children }) {
  return (
    <section
      id={id}
      style={{
        marginBottom: 36,
        scrollMarginTop: 96,
      }}
    >
      <h2 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        fontSize: 26,
        lineHeight: 1.2,
        color: '#3A3A3A',
        margin: '0 0 14px',
        display: 'flex',
        gap: 14,
        alignItems: 'baseline',
      }}>
        {typeof number === 'number' && (
          <span style={{
            fontSize: 14,
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(58,58,58,0.5)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.04em',
          }}>
            {String(number).padStart(2, '0')}
          </span>
        )}
        {title}
      </h2>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 14.5,
        lineHeight: 1.7,
        color: '#3A3A3A',
      }}>
        {children}
      </div>
    </section>
  );
}
