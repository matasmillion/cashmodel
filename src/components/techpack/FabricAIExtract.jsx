// FabricAIExtract — modal that lets the user drop one or more mill
// fabric-card images / PDFs, runs Claude Vision over them, and previews
// the parsed JSON before applying it to the FabricBuilder draft.
//
// User can selectively keep / drop fields from the AI suggestion. Color
// swatches the model identifies are pushed into color_card_images with
// their hex (no image attached — those still need to be uploaded
// individually for tactile accuracy).

import { useRef, useState } from 'react';
import { Sparkles, X, Upload, FileText, Image as ImageIcon, Check } from 'lucide-react';
import { FR } from './techPackConstants';
import { extractFabricFromMedia, fileToMedia } from '../../utils/aiFabricExtract';
import { categoryForWeave, FABRIC_WEAVES } from '../../utils/fabricLibrary';

const VALID_WEAVES = new Set(FABRIC_WEAVES.map(w => w.id));

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
    setError(null); setBusy(true); setResult(null);
    try {
      const media = await Promise.all(files.map(fileToMedia));
      const json = await extractFabricFromMedia({ media });
      if (json.weave && !VALID_WEAVES.has(json.weave)) json.weave = 'other';
      if (!json.category && json.weave) json.category = categoryForWeave(json.weave);
      if (json.category && !['knit', 'woven'].includes(json.category)) json.category = null;
      setResult(json);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'AI extraction failed');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result) return;
    const patch = {};
    const fields = [
      'name', 'mill_fabric_no', 'category', 'weave', 'composition',
      'weight_gsm', 'width_cm', 'shrinkage_pct', 'stretch_pct',
      'hand', 'mill_id', 'lead_time_days', 'moq_yards', 'price_per_yard_usd', 'notes',
    ];
    fields.forEach(k => {
      if (result[k] != null && result[k] !== '') patch[k] = result[k];
    });
    if (Array.isArray(result.colors) && result.colors.length) {
      patch.color_card_images = result.colors.map(c => ({
        url: '', label: c.label || '', hex: c.hex || '',
      }));
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
              <Row label="Mill / supplier" value={result.mill_id} />
              <Row label="Lead time"      value={result.lead_time_days} suffix=" days" />
              <Row label="MOQ"            value={result.moq_yards} suffix=" yd" />
              <Row label="Price"          value={result.price_per_yard_usd ? `$${Number(result.price_per_yard_usd).toFixed(2)} / yd` : null} />
              <Row label="Notes"          value={result.notes} />
              {Array.isArray(result.colors) && result.colors.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: FR.stone, marginBottom: 6 }}>{result.colors.length} colors detected</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.colors.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#fff', borderRadius: 4, border: `0.5px solid ${FR.sand}` }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: c.hex || FR.salt, border: `0.5px solid ${FR.sand}` }} />
                        <span style={{ fontSize: 10, color: FR.slate }}>{c.label || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
            <button onClick={run} disabled={busy || files.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: (busy || files.length === 0) ? 'not-allowed' : 'pointer', opacity: (busy || files.length === 0) ? 0.55 : 1 }}>
              <Sparkles size={13} /> {busy ? 'Analyzing…' : 'Analyze'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
