// FabricBOMPreview — on-screen A4-portrait preview of the one-page fabric
// BOM card that lands inside the Tech Pack. It's the visual contract
// between the library (where mill-supplied data lives) and the tech pack
// BOM section (where the mill receives the spec). Same content, same
// layout, scaled to fit the panel.
//
// Implemented as DOM/CSS rather than canvas so on-screen text is crisp.
// The PDF generator (fabricBOMPDF.js) ships the printable equivalent.

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { FABRIC_WEAVE_LABEL } from '../../utils/fabricLibrary';
import { getAssetUrl, isLegacyDataUrl } from '../../utils/plmAssets';

function useResolved(ref) {
  const inline = ref && (isLegacyDataUrl(ref) || /^https?:\/\//i.test(ref)) ? ref : '';
  // Resolved Storage URLs keyed by path so we keep the cached value across
  // ref changes without ever calling setState synchronously inside the
  // effect body — only the async resolver writes.
  const [resolvedByRef, setResolvedByRef] = useState({});
  useEffect(() => {
    if (!ref || inline) return undefined;
    if (resolvedByRef[ref]) return undefined;
    let cancelled = false;
    getAssetUrl(ref).then(u => {
      if (cancelled || !u) return;
      setResolvedByRef(m => ({ ...m, [ref]: u }));
    });
    return () => { cancelled = true; };
  }, [ref, inline, resolvedByRef]);
  return inline || resolvedByRef[ref] || '';
}

function fmtPrice(p) {
  if (p == null || p === '' || Number.isNaN(Number(p))) return '—';
  return `$${Number(p).toFixed(2)} / yd`;
}

function fmtNum(n, suffix = '') {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `${Number(n)}${suffix}`;
}

function Cell({ label, value }) {
  return (
    <div style={{ padding: '6px 8px', borderRight: `0.5px solid ${FR.sand}` }}>
      <div style={{ fontSize: 7, color: FR.stone, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 11, color: FR.slate, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</div>
    </div>
  );
}

function Photo({ src, label }) {
  const resolved = useResolved(src);
  return (
    <div style={{ position: 'relative', flex: 1, background: FR.salt, border: `0.5px solid ${FR.sand}`, overflow: 'hidden' }}>
      {resolved ? (
        <img src={resolved} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: FR.stone, fontStyle: 'italic' }}>No image</div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, padding: '2px 6px', background: FR.slate, color: FR.salt, fontSize: 7, fontWeight: 700, letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  );
}

function Swatch({ entry }) {
  const resolved = useResolved(entry.url);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ width: '100%', aspectRatio: '1 / 1', background: entry.hex || FR.salt, border: `0.5px solid ${FR.sand}`, overflow: 'hidden' }}>
        {resolved && <img src={resolved} alt={entry.label || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <div style={{ fontSize: 7, color: FR.slate, marginTop: 2, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.label || '—'}
      </div>
    </div>
  );
}

export default function FabricBOMPreview({ fabric }) {
  const subtitle = [
    fabric.code,
    fabric.mill_fabric_no ? `Mill # ${fabric.mill_fabric_no}` : null,
    fabric.version,
    FABRIC_WEAVE_LABEL[fabric.weave] || fabric.weave,
    fabric.category ? fabric.category.toUpperCase() : null,
  ].filter(Boolean).join('  ·  ');

  const colors = fabric.color_card_images || [];

  // A4 portrait at 0.6mm/px = 350 × 495. Scale rooted to width to fit panel.
  return (
    <div style={{
      width: '100%',
      maxWidth: 420,
      margin: '0 auto',
      aspectRatio: '210 / 297',
      background: '#fff',
      border: `0.5px solid ${FR.sand}`,
      boxShadow: '0 2px 14px rgba(0,0,0,0.06)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header */}
      <div style={{ background: FR.slate, color: FR.salt, padding: '10px 12px' }}>
        <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 0.6 }}>FOREIGN RESOURCE CO.  ·  FABRIC BOM CARD</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, marginTop: 2 }}>
          {fabric.name || 'Untitled fabric'}
        </div>
        <div style={{ fontSize: 8, color: FR.sand, marginTop: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {subtitle}
        </div>
      </div>

      {/* Spec table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `0.5px solid ${FR.sand}` }}>
        <Cell label="Mill / Vendor"   value={fabric.mill_id} />
        <Cell label="Mill Fabric #"   value={fabric.mill_fabric_no} />
        <Cell label="Composition"     value={fabric.composition} />
        <Cell label="Weight"          value={fmtNum(fabric.weight_gsm, ' gsm')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `0.5px solid ${FR.sand}` }}>
        <Cell label="Lead Time"  value={fmtNum(fabric.lead_time_days, ' days')} />
        <Cell label="MOQ"        value={fmtNum(fabric.moq_yards, ' yd')} />
        <Cell label="Price"      value={fmtPrice(fabric.price_per_yard_usd)} />
        <Cell label="Width"      value={fmtNum(fabric.width_cm, ' cm')} />
      </div>

      {/* Front / Back photos */}
      <div style={{ display: 'flex', gap: 6, padding: 8 }}>
        <Photo src={fabric.front_image_url} label="FRONT" />
        <Photo src={fabric.back_image_url} label="BACK" />
      </div>

      {/* Color card */}
      <div style={{ padding: '0 8px 8px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: FR.slate, letterSpacing: 0.5 }}>COLOR CARD</div>
          <div style={{ fontSize: 7, color: FR.stone }}>{colors.length} colorways</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, overflow: 'hidden' }}>
          {colors.slice(0, 18).map((c, i) => <Swatch key={i} entry={c} />)}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: `0.5px solid ${FR.soil}`, display: 'flex', justifyContent: 'space-between', fontSize: 7, color: FR.stone }}>
        <span>{fabric.code}  ·  {fabric.version}</span>
        <span>FOREIGN RESOURCE CO.</span>
      </div>
    </div>
  );
}
