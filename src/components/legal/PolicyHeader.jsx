// @ts-check
// PolicyHeader — the title block at the top of every /legal/<policy>
// page. Surfaces the policy title (display serif), version, effective
// date, last reviewed, owner, classification, and a Download PDF button.
//
// Designed to render under <LegalLayout>'s sticky brand header — it
// supplies the per-policy identity. Keep it dumb: pure presentation,
// fields come in via props, no fetching.

import { Download } from 'lucide-react';

/**
 * @typedef {Object} PolicyHeaderProps
 * @property {string} title
 * @property {string} version
 * @property {string} effective       - human-readable effective date
 * @property {string} lastReviewed    - human-readable last-reviewed date
 * @property {string} owner
 * @property {string} classification
 * @property {string=} pdfHref        - relative or absolute URL to the PDF
 * @property {string=} pdfFilename    - download filename hint
 */

/** @param {PolicyHeaderProps} props */
export default function PolicyHeader({
  title,
  version,
  effective,
  lastReviewed,
  owner,
  classification,
  pdfHref,
  pdfFilename,
}) {
  return (
    <header style={{ marginBottom: 32, paddingBottom: 22, borderBottom: '0.5px solid rgba(58,58,58,0.15)' }}>
      <div style={{
        fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(58,58,58,0.55)', marginBottom: 10,
      }}>
        Policy
      </div>

      <h1 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        fontSize: 38,
        lineHeight: 1.1,
        color: '#3A3A3A',
        margin: 0,
      }}>
        {title}
      </h1>

      <dl style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px, max-content) 1fr',
        rowGap: 6,
        columnGap: 16,
        marginTop: 22,
        fontSize: 13,
        lineHeight: 1.5,
        color: '#3A3A3A',
        fontFamily: "'Inter', sans-serif",
      }}>
        <Term>Version</Term><Def>v{version}</Def>
        <Term>Effective</Term><Def>{effective}</Def>
        <Term>Last reviewed</Term><Def>{lastReviewed}</Def>
        <Term>Owner</Term><Def>{owner}</Def>
        <Term>Classification</Term><Def>{classification}</Def>
      </dl>

      {pdfHref && (
        <div style={{ marginTop: 20 }}>
          <a
            href={pdfHref}
            download={pdfFilename || true}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: '#3A3A3A',
              color: '#F5F0E8',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <Download size={13} /> Download PDF
          </a>
        </div>
      )}
    </header>
  );
}

function Term({ children }) {
  return (
    <dt style={{ color: 'rgba(58,58,58,0.55)', fontSize: 12, letterSpacing: '0.04em' }}>
      {children}
    </dt>
  );
}

function Def({ children }) {
  return <dd style={{ margin: 0, color: '#3A3A3A' }}>{children}</dd>;
}
