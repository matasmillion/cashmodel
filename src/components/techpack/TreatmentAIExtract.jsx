// TreatmentAIExtract — modal that lets the user drop one or more vendor
// treatment-card images / PDFs (a stone-wash sample card, a print
// strike-off, a dye lab dip), runs Claude Vision over them, and
// previews the parsed JSON before applying it to the TreatmentBuilder
// draft.

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Upload, FileText, Image as ImageIcon, Check, Loader2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { extractTreatmentFromMedia, fileToMedia } from '../../utils/aiTreatmentExtract';
import { TREATMENT_TYPES } from '../../utils/treatmentLibrary';
import { listVendors } from '../../utils/vendorLibrary';
import { listFRColors } from '../../utils/colorLibrary';
import { getUsdCnyRate, cnyToUsd, usdToCny } from '../../utils/fxRates';

const VALID_TYPES = new Set(TREATMENT_TYPES.map(t => t.id));

function normalizeVendorName(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[　.,()·\-_/]/g, ' ')
    .replace(/\b(ltd|co|inc|corp|corporation|company|group|holdings|industry|industries|industrial|laundry|wash|works|dyehouse|dye|dyeing|print|printing|finishing|garment|factory)\b/gi, ' ')
    .replace(/(洗水|洗涤|染厂|印花厂|工厂|有限公司|公司|集团)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findVendorMatch(suggested, knownNames) {
  if (!suggested) return null;
  const target = normalizeVendorName(suggested);
  if (!target) return null;
  for (const name of knownNames) {
    const norm = normalizeVendorName(name);
    if (!norm) continue;
    if (norm === target || norm.includes(target) || target.includes(norm)) return name;
  }
  return null;
}

// Hex-distance match: when the model returns a swatch hex, snap it to
// the nearest named color in our library if they're visually within
// roughly the same bucket. Falls back to a fuzzy name match otherwise.
function hexDistance(a, b) {
  const pa = parseInt(a.replace('#', ''), 16);
  const pb = parseInt(b.replace('#', ''), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function findBaseColorMatch({ name, hex }, palette) {
  if (name) {
    const target = String(name).toLowerCase().trim();
    const exact = palette.find(c => c.name.toLowerCase() === target);
    if (exact) return exact.name;
  }
  if (hex && /^#?[0-9a-f]{6}$/i.test(hex)) {
    const normHex = hex.startsWith('#') ? hex : `#${hex}`;
    let best = null; let bestDist = Infinity;
    palette.forEach(c => {
      if (!c.hex) return;
      const d = hexDistance(normHex, c.hex);
      if (d < bestDist) { bestDist = d; best = c.name; }
    });
    if (best && bestDist < 60) return best;
  }
  return null;
}

function Row({ label, value, kind = 'text', suffix = '' }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: `0.5px dashed ${FR.sand}` }}>
      <span style={{ fontSize: 11, color: FR.stone }}>{label}</span>
      <span style={{ fontSize: 12, color: FR.slate, fontFamily: kind === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}>{value}{suffix}</span>
    </div>
  );
}

export default function TreatmentAIExtract({ onClose, onApply }) {
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [palette, setPalette] = useState([]);
  const [vendorMatched, setVendorMatched] = useState(null);
  const [colorMatched, setColorMatched] = useState(null);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    let cancelled = false;
    listVendors().then(rows => { if (!cancelled) setVendors(rows || []); })
      .catch(err => console.error('TreatmentAIExtract listVendors:', err));
    try { setPalette(listFRColors() || []); } catch { /* noop */ }
    return () => { cancelled = true; };
  }, []);

  const onPick = (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length) setFiles(prev => [...prev, ...list]);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length) setFiles(prev => [...prev, ...list]);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const run = async () => {
    setError(null); setBusy(true); setResult(null); setVendorMatched(null); setColorMatched(null);
    try {
      const media = await Promise.all(files.map(fileToMedia));
      const knownVendors = vendors.map(v => v.name).filter(Boolean);
      const json = await extractTreatmentFromMedia({ media, knownVendors, instructions });
      if (json.type && !VALID_TYPES.has(json.type)) json.type = null;

      if (json.primary_vendor) {
        const matched = findVendorMatch(json.primary_vendor, knownVendors);
        if (matched && matched !== json.primary_vendor) {
          setVendorMatched({ suggested: json.primary_vendor, matched });
          json.primary_vendor = matched;
        }
      }

      const matchedColor = findBaseColorMatch(
        { name: json.base_color_name, hex: json.base_color_hex },
        palette,
      );
      if (matchedColor) setColorMatched({ suggested: json.base_color_name || json.base_color_hex, matched: matchedColor });

      setResult({ ...json, _resolved_base_color_id: matchedColor || null });
    } catch (err) {
      console.error(err);
      setError(err?.message || 'AI extraction failed');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    const patch = {};
    const direct = ['name', 'type', 'lead_time_days', 'moq_units', 'shrinkage_expected_pct', 'notes'];
    direct.forEach(k => {
      if (result[k] != null && result[k] !== '') patch[k] = result[k];
    });
    if (result._resolved_base_color_id) patch.base_color_id = result._resolved_base_color_id;

    if (result.primary_vendor) {
      const found = vendors.find(v => v.name === result.primary_vendor);
      if (found) patch.primary_vendor_id = found.id;
    }

    // FX backfill so the builder shows USD even if the card quoted RMB only.
    let usd = result.cost_per_unit_usd;
    const cny = result.cost_per_unit_cny;
    if (usd == null && cny != null) {
      try {
        const fx = await getUsdCnyRate();
        if (fx?.usdPerCny) usd = cnyToUsd(cny, fx.usdPerCny);
      } catch (err) {
        console.error('TreatmentAIExtract FX backfill:', err);
      }
    }
    if (usd != null) patch.cost_per_unit_usd = usd;
    // Mirror to CNY too if we only had USD — kept locally on the result
    // for the preview, not stored on the treatment record (treatments
    // only carry USD).
    if (result.cost_per_unit_usd != null && cny == null) {
      try {
        const fx = await getUsdCnyRate();
        if (fx?.usdPerCny) usdToCny(result.cost_per_unit_usd, fx.usdPerCny);
      } catch { /* noop */ }
    }

    onApply(patch);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 720, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${FR.sand}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} style={{ color: FR.soil }} />
            <h3 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: FR.slate }}>AI treatment-card import</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          <p style={{ fontSize: 12, color: FR.stone, margin: '0 0 12px', lineHeight: 1.5 }}>
            Upload one or more images / PDFs of a vendor's wash, dye, print, or finish sample card
            (Chinese, Japanese, or English). Claude reads the process type, base color, vendor,
            lead time, MOQ, and unit cost, then drops the values onto your draft so you can
            review before saving.
          </p>

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${FR.sand}`, borderRadius: 8, padding: '20px 14px',
              background: FR.salt, cursor: 'pointer', textAlign: 'center',
            }}
          >
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={onPick} style={{ display: 'none' }} />
            <Upload size={20} style={{ color: FR.sand, margin: '0 auto 6px', display: 'block' }} />
            <div style={{ fontSize: 12, color: FR.slate }}>Drop images or PDFs here, or click to browse</div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 4 }}>Supports JPG, PNG, WebP, PDF · multiple files OK</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 10, color: FR.stone, marginBottom: 4, display: 'block', letterSpacing: 0.2, textTransform: 'uppercase', fontWeight: 600 }}>
              Instructions (optional)
            </label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={2}
              placeholder={`e.g. "Just refresh vendor + lead time, leave name and type alone."`}
              style={{
                width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`,
                borderRadius: 4, fontSize: 12, color: FR.slate, background: '#fff',
                fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, lineHeight: 1.4 }}>
              Tell the AI what to focus on. Fields you don't mention stay untouched.
            </div>
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: FR.salt, borderRadius: 4 }}>
                  {f.type === 'application/pdf' ? <FileText size={14} style={{ color: FR.soil }} /> : <ImageIcon size={14} style={{ color: FR.soil }} />}
                  <span style={{ fontSize: 11, color: FR.slate, flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: 10, color: FR.stone }}>{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', padding: 2 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(163,45,45,0.08)', border: '0.5px solid #A32D2D', borderRadius: 4, color: '#A32D2D', fontSize: 11 }}>
              {error}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 14, padding: 12, background: FR.salt, borderRadius: 6, border: `0.5px solid ${FR.sand}` }}>
              <div style={{ fontSize: 11, color: FR.stone, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 }}>AI suggestion</div>
              <Row label="Name"           value={result.name} />
              <Row label="Type"           value={TREATMENT_TYPES.find(t => t.id === result.type)?.label || result.type} />
              <Row label="Base color"     value={result.base_color_name} />
              {result.base_color_hex && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: `0.5px dashed ${FR.sand}` }}>
                  <span style={{ fontSize: 11, color: FR.stone }}>Base color hex</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: FR.slate, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: result.base_color_hex, border: `0.5px solid ${FR.sand}` }} />
                    {result.base_color_hex}
                  </span>
                </div>
              )}
              {colorMatched && (
                <div style={{ fontSize: 10, color: FR.stone, padding: '2px 0 6px', lineHeight: 1.4 }}>
                  ↳ matched to library color <strong>{colorMatched.matched}</strong>
                </div>
              )}
              <Row label="Vendor"         value={result.primary_vendor} />
              {vendorMatched && (
                <div style={{ fontSize: 10, color: FR.stone, padding: '2px 0 6px', lineHeight: 1.4 }}>
                  ↳ matched <em>{vendorMatched.suggested}</em> to existing vendor <strong>{vendorMatched.matched}</strong>
                </div>
              )}
              <Row label="Lead time"      value={result.lead_time_days} suffix=" days" />
              <Row label="MOQ"            value={result.moq_units} suffix=" units" />
              <Row label="Cost / unit (USD)" value={result.cost_per_unit_usd != null ? `$${Number(result.cost_per_unit_usd).toFixed(2)}` : null} />
              <Row label="Cost / unit (RMB)" value={result.cost_per_unit_cny != null ? `¥${Number(result.cost_per_unit_cny).toFixed(2)}` : null} />
              <Row label="Shrinkage"      value={result.shrinkage_expected_pct} suffix=" %" />
              <Row label="Notes"          value={result.notes} />
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: `0.5px solid ${FR.sand}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
          {result ? (
            <button onClick={apply} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Check size={13} /> Apply to treatment
            </button>
          ) : (
            <button onClick={run} disabled={busy || files.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: (busy || files.length === 0) ? 'not-allowed' : 'pointer', opacity: files.length === 0 ? 0.55 : 1 }}>
              {busy
                ? <><Loader2 size={13} className="spin" /> Analyzing…</>
                : <><Sparkles size={13} /> Analyze</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
