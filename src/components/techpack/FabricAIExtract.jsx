// FabricAIExtract — modal that lets the user drop one or more mill
// fabric-card images / PDFs, runs Claude Vision over them, and previews
// the parsed JSON before applying it to the FabricBuilder draft.
//
// User can selectively keep / drop fields from the AI suggestion. Color
// swatches the model identifies are pushed into color_card_images with
// their hex (no image attached — those still need to be uploaded
// individually for tactile accuracy).

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Upload, FileText, Image as ImageIcon, Check, Loader2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { extractFabricFromMedia, fileToMedia, detectAndCropSwatches } from '../../utils/aiFabricExtract';
import { categoryForWeave, FABRIC_WEAVES } from '../../utils/fabricLibrary';
import { listVendors } from '../../utils/vendorLibrary';
import { getUsdCnyRate, cnyToUsd, usdToCny } from '../../utils/fxRates';

const VALID_WEAVES = new Set(FABRIC_WEAVES.map(w => w.id));

// Normalize a vendor / mill name for fuzzy comparison: lowercase, drop
// company-suffix noise ("ltd", "co", "textile", "mill", "factory", "工厂"…),
// and collapse whitespace. Matches "Jufeng Textile" / "Jufeng Cloth Industry
// Ltd" / "Jufeng Mill" all to "jufeng" so the picker reuses the existing
// library entry instead of creating a near-duplicate.
function normalizeVendorName(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[　.,()·\-_/]/g, ' ')
    .replace(/\b(ltd|co|inc|corp|corporation|company|group|holdings|industry|industries|industrial|textile|textiles|mill|mills|factory|cloth|knit|knits|weaving|knitting|fabric|fabrics|trading)\b/gi, ' ')
    .replace(/(纺织|工厂|有限公司|公司|集团|针织|布业)/g, ' ')
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

function Row({ label, value, kind = 'text', suffix = '' }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: `0.5px dashed ${FR.sand}` }}>
      <span style={{ fontSize: 11, color: FR.stone }}>{label}</span>
      <span style={{ fontSize: 12, color: FR.slate, fontFamily: kind === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}>{value}{suffix}</span>
    </div>
  );
}

export default function FabricAIExtract({ onClose, onApply }) {
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [vendorMatched, setVendorMatched] = useState(null); // { suggested, matched } | null
  const [instructions, setInstructions] = useState('');
  const [phase, setPhase] = useState(''); // '' | 'reading' | 'cropping'
  const [swatches, setSwatches] = useState([]); // [{ label, blob, blobUrl, selected }]

  // Revoke cropped-swatch object URLs on unmount.
  useEffect(() => () => { swatches.forEach(s => s.blobUrl && URL.revokeObjectURL(s.blobUrl)); }, [swatches]);

  useEffect(() => {
    let cancelled = false;
    listVendors().then(rows => { if (!cancelled) setVendors(rows || []); })
      .catch(err => console.error('FabricAIExtract listVendors:', err));
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
    setError(null); setBusy(true); setResult(null); setVendorMatched(null);
    setSwatches(prev => { prev.forEach(s => s.blobUrl && URL.revokeObjectURL(s.blobUrl)); return []; });
    try {
      setPhase('reading');
      const media = await Promise.all(files.map(fileToMedia));
      const knownVendors = vendors.map(v => v.name).filter(Boolean);
      const json = await extractFabricFromMedia({ media, knownVendors, instructions });
      if (json.weave && !VALID_WEAVES.has(json.weave)) json.weave = 'other';
      if (!json.category && json.weave) json.category = categoryForWeave(json.weave);
      if (json.category && !['knit', 'woven'].includes(json.category)) json.category = null;

      // Vendor de-dup: even with the prompt hint, the model can still
      // surface a near-duplicate ("Jufeng Cloth Industry Ltd" when we
      // already have "Jufeng Textile"). Snap the suggestion to the
      // existing library entry whenever the normalized forms collide.
      if (json.mill_id) {
        const matched = findVendorMatch(json.mill_id, knownVendors);
        if (matched && matched !== json.mill_id) {
          setVendorMatched({ suggested: json.mill_id, matched });
          json.mill_id = matched;
        }
      }
      setResult(json);

      // Second pass: crop the actual swatch images out of every dropped
      // IMAGE (PDFs can't be cropped client-side). The model labels each
      // crop with the color number printed on the card, so we store the
      // real fabric texture instead of a flat hex estimate.
      const imageFiles = files.filter(f => (f.type || '').startsWith('image/'));
      if (imageFiles.length) {
        setPhase('cropping');
        const all = [];
        for (const f of imageFiles) {
          try {
            const cropped = await detectAndCropSwatches(f);
            cropped.forEach(c => all.push({ ...c, blobUrl: URL.createObjectURL(c.blob), selected: true }));
          } catch (err) { console.error('FabricAIExtract swatch crop:', err); }
        }
        setSwatches(all);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || 'AI extraction failed');
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  const toggleSwatch = (i) => setSwatches(prev => prev.map((s, idx) => idx === i ? { ...s, selected: !s.selected } : s));
  const setSwatchLabel = (i, label) => setSwatches(prev => prev.map((s, idx) => idx === i ? { ...s, label } : s));

  const apply = async () => {
    if (!result) return;
    const patch = {};
    const fields = [
      'name', 'mill_fabric_no', 'category', 'weave', 'composition',
      'weight_gsm', 'width_cm', 'shrinkage_pct', 'stretch_pct',
      'hand', 'mill_id', 'lead_time_days', 'moq_meters',
      'price_per_meter_usd', 'price_per_meter_cny',
      'price_per_kg_usd',    'price_per_kg_cny',
      'notes',
    ];
    fields.forEach(k => {
      if (result[k] != null && result[k] !== '') patch[k] = result[k];
    });
    // Mill fabric # is the primary handle (rendered as the card title).
    // The descriptive `name` is an optional subtitle — leave it null
    // when the card didn't carry one, so the title shows the number
    // alone instead of "B1750 B1750".
    // The model is told to capture each price exactly as the card shows
    // it (RMB/m, RMB/kg, USD/m, …) without converting. Fill in the
    // missing side of each pair using the live FX rate so the builder
    // shows both currencies even if only one was on the card.
    try {
      const fx = await getUsdCnyRate();
      if (fx?.usdPerCny) {
        if (patch.price_per_meter_cny != null && patch.price_per_meter_usd == null) {
          patch.price_per_meter_usd = cnyToUsd(patch.price_per_meter_cny, fx.usdPerCny);
        }
        if (patch.price_per_meter_usd != null && patch.price_per_meter_cny == null) {
          patch.price_per_meter_cny = usdToCny(patch.price_per_meter_usd, fx.usdPerCny);
        }
        if (patch.price_per_kg_cny != null && patch.price_per_kg_usd == null) {
          patch.price_per_kg_usd = cnyToUsd(patch.price_per_kg_cny, fx.usdPerCny);
        }
        if (patch.price_per_kg_usd != null && patch.price_per_kg_cny == null) {
          patch.price_per_kg_cny = usdToCny(patch.price_per_kg_usd, fx.usdPerCny);
        }
      }
    } catch (err) {
      console.error('FabricAIExtract FX backfill:', err);
    }
    // Prefer the actual cropped swatch images (with their printed color
    // number as the label) over flat hex estimates. Fall back to hex-only
    // entries when no crops are available (e.g. the card was a PDF, or
    // detection found nothing).
    const selectedSwatches = swatches.filter(s => s.selected);
    if (!selectedSwatches.length && Array.isArray(result.colors) && result.colors.length) {
      patch.color_card_images = result.colors.map(c => ({
        url: '', label: c.label || '', hex: c.hex || '',
      }));
    }
    // Pass the original mill-card source files up to the builder so they get
    // archived to the fabric's documents list — the user always wants the
    // raw card preserved for reference, not just the parsed fields. Cropped
    // swatches ride up as _aiSwatches so the builder uploads each blob and
    // appends a color_card_images entry with the real image URL.
    onApply({
      ...patch,
      _aiSourceFiles: files,
      _aiSwatches: selectedSwatches.map(s => ({ label: s.label, blob: s.blob })),
    });
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
            <h3 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: FR.slate }}>AI fabric-card import</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          <p style={{ fontSize: 12, color: FR.stone, margin: '0 0 12px', lineHeight: 1.5 }}>
            Upload one or more images / PDFs of a mill's fabric card (Chinese, Japanese, or English).
            Claude reads composition, weight, width, shrinkage, weave, and every color swatch on the card,
            then drops the values onto your draft so you can review before saving.
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
              placeholder={`e.g. "Just add these new colors to my existing fabric, don't touch composition / weight / vendor."`}
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
              <Row label="Mill fabric #"  value={result.mill_fabric_no} kind="mono" />
              <Row label="Category"       value={result.category} />
              <Row label="Weave"          value={result.weave} />
              <Row label="Composition"    value={result.composition} />
              <Row label="Weight"         value={result.weight_gsm} suffix=" gsm" />
              <Row label="Width"          value={result.width_cm} suffix=" cm" />
              <Row label="Shrinkage"      value={result.shrinkage_pct} suffix=" %" />
              <Row label="Stretch"        value={result.stretch_pct} suffix=" %" />
              <Row label="Hand"           value={result.hand} />
              <Row label="Vendor"         value={result.mill_id} />
              {vendorMatched && (
                <div style={{ fontSize: 10, color: FR.stone, padding: '2px 0 6px', lineHeight: 1.4 }}>
                  ↳ matched <em>{vendorMatched.suggested}</em> to existing vendor <strong>{vendorMatched.matched}</strong>
                </div>
              )}
              <Row label="Lead time"      value={result.lead_time_days} suffix=" days" />
              <Row label="MOQ"            value={result.moq_meters} suffix=" m" />
              <Row label="Price / m (USD)" value={result.price_per_meter_usd != null ? `$${Number(result.price_per_meter_usd).toFixed(2)}` : null} />
              <Row label="Price / m (RMB)" value={result.price_per_meter_cny != null ? `¥${Number(result.price_per_meter_cny).toFixed(2)}` : null} />
              <Row label="Price / kg (USD)" value={result.price_per_kg_usd != null ? `$${Number(result.price_per_kg_usd).toFixed(2)}` : null} />
              <Row label="Price / kg (RMB)" value={result.price_per_kg_cny != null ? `¥${Number(result.price_per_kg_cny).toFixed(2)}` : null} />
              <Row label="Notes"          value={result.notes} />
              {swatches.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: FR.stone, marginBottom: 6 }}>
                    {swatches.filter(s => s.selected).length} of {swatches.length} cropped swatches — click to deselect, edit the color number
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
                    {swatches.map((s, i) => (
                      <div key={i} style={{ opacity: s.selected ? 1 : 0.35, cursor: 'pointer' }} onClick={() => toggleSwatch(i)}>
                        <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: `2px solid ${s.selected ? FR.slate : FR.sand}`, marginBottom: 4 }}>
                          <img src={s.blobUrl} alt={s.label} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                          {!s.selected && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <X size={16} color={FR.stone} />
                            </div>
                          )}
                        </div>
                        <input
                          value={s.label}
                          onChange={e => { e.stopPropagation(); setSwatchLabel(i, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', fontSize: 9, border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '2px 4px', color: FR.slate, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (Array.isArray(result.colors) && result.colors.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: FR.stone, marginBottom: 6 }}>{result.colors.length} colors detected (hex only — drop an image to crop the actual swatches)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.colors.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#fff', borderRadius: 4, border: `0.5px solid ${FR.sand}` }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: c.hex || FR.salt, border: `0.5px solid ${FR.sand}` }} />
                        <span style={{ fontSize: 10, color: FR.slate }}>{c.label || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: `0.5px solid ${FR.sand}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
          {result ? (
            <button onClick={apply} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Check size={13} /> Apply to fabric
            </button>
          ) : (
            <button onClick={run} disabled={busy || files.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: (busy || files.length === 0) ? 'not-allowed' : 'pointer', opacity: files.length === 0 ? 0.55 : 1 }}>
              {busy
                ? <><Loader2 size={13} className="spin" /> {phase === 'cropping' ? 'Cropping swatches…' : 'Analyzing…'}</>
                : <><Sparkles size={13} /> Analyze</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
