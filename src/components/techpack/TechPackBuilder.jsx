// Main Tech Pack builder — 14-step wizard embedded inside the Product tab
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FR, DEFAULT_DATA, DEFAULT_LIBRARY, STEPS, IMG_STEPS, computeCompletion } from './techPackConstants';
import { STEP_FNS } from './TechPackSteps';
import { saveTechPack } from '../../utils/techPackStore';
import { generateTechPackPDF } from '../../utils/techPackPDF';
import { generateTechPackSVG, svgToBlob } from '../../utils/techPackSVG';

function sanitizeFilename(s) {
  return (s || 'techpack').replace(/[^\w\-]+/g, '_').slice(0, 60);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function TechPackBuilder({ pack, onBack }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(pack.data || DEFAULT_DATA);
  const [images, setImages] = useState(pack.images || []);
  const [library, setLibrary] = useState(pack.library || DEFAULT_LIBRARY);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const saveTimerRef = useRef(null);

  // Debounced auto-save on any state change
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveTechPack(pack.id, {
          data,
          images,
          library,
          style_name: data.styleName || '',
          product_category: data.productCategory || '',
          status: data.status || 'Development',
          completion_pct: computeCompletion(data),
        });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
      setTimeout(() => setSaving(false), 300);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [data, images, library, pack.id]);

  const set = useCallback((k, v) => {
    setData(p => ({ ...p, [k]: v }));
  }, []);

  const handleImgUpload = useCallback((slot, b64, name) => {
    setImages(p => [...p, { slot, data: b64, name }]);
  }, []);

  const handleImgRemove = useCallback((slot, idx) => {
    setImages(p => {
      let c = 0;
      return p.filter(img => {
        if (img.slot === slot) {
          if (c === idx) { c++; return false; }
          c++;
        }
        return true;
      });
    });
  }, []);

  const saveToLibrary = useCallback((category, item) => {
    setLibrary(p => ({ ...p, [category]: [...(p[category] || []), { ...item }] }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const filename = sanitizeFilename(data.styleName || data.styleNumber || 'techpack');
      const fullPack = { ...pack, data, images, library };

      // Generate PDF
      const pdfBlob = await generateTechPackPDF(fullPack);
      downloadBlob(pdfBlob, `${filename}.pdf`);

      // Generate SVG
      const svgString = generateTechPackSVG(fullPack);
      downloadBlob(svgToBlob(svgString), `${filename}.svg`);

      // Mark as submitted in the DB (bump updated_at)
      await saveTechPack(pack.id, {
        data,
        images,
        library,
        style_name: data.styleName || '',
        product_category: data.productCategory || '',
        status: data.status || 'Development',
        completion_pct: computeCompletion(data),
      });

      setSubmitResult({ filename });
    } catch (err) {
      console.error('Generate failed:', err);
      setSubmitResult({ error: err.message || String(err) });
    }
    setSubmitting(false);
  }, [pack, data, images, library]);

  const Comp = STEP_FNS[step];
  const libCount = (library.trims || []).length + (library.fabrics || []).length;
  const stepProps = {
    data, set, images, onUpload: handleImgUpload, onRemove: handleImgRemove,
    library, saveToLibrary,
    onSubmit: handleSubmit, submitting, submitResult,
  };

  return (
    <div style={{ background: FR.salt, fontFamily: "'Helvetica Neue','Inter',sans-serif", borderRadius: 8, overflow: 'hidden', border: `1px solid ${FR.sand}` }}>
      {/* Builder header */}
      <div style={{ background: FR.slate, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: FR.salt, padding: '5px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> Back to Tech Packs
          </button>
          <div>
            <div style={{ color: FR.salt, fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>F O R E I G N  R E S O U R C E  C O .</div>
            <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", color: FR.salt, fontSize: 16, marginTop: 2 }}>
              {data.styleName || 'New Tech Pack'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && <span style={{ fontSize: 10, color: FR.sage }}>Saving…</span>}
          <span style={{ fontSize: 9, color: FR.stone }}>{images.length} photos · {libCount} in library</span>
          <span style={{ fontSize: 9, color: FR.stone }}>{computeCompletion(data)}%</span>
        </div>
      </div>
      {/* Body */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: 220, minWidth: 220, padding: '14px 0', borderRight: `1px solid ${FR.sand}`, background: FR.salt }}>
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', border: 'none', cursor: 'pointer', background: i === step ? FR.white : 'transparent', borderLeft: i === step ? `3px solid ${FR.soil}` : '3px solid transparent' }}>
              <span style={{ fontSize: 10, color: i === step ? FR.soil : FR.stone, fontWeight: 700, width: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 11, color: i === step ? FR.slate : FR.stone, textAlign: 'left' }}>{s.title}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, padding: '20px 28px', maxHeight: '75vh', overflowY: 'auto' }}>
          <Comp {...stepProps} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${FR.sand}` }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{ padding: '8px 20px', background: 'none', border: `1px solid ${step === 0 ? FR.sand : FR.slate}`, borderRadius: 3, color: step === 0 ? FR.sand : FR.slate, fontSize: 12, cursor: step === 0 ? 'default' : 'pointer' }}>
              Previous
            </button>
            <span style={{ fontSize: 10, color: FR.stone, alignSelf: 'center' }}>Step {step + 1} of {STEPS.length}</span>
            <button onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))} disabled={step === STEPS.length - 1}
              style={{ padding: '8px 20px', background: step === STEPS.length - 1 ? FR.sand : FR.slate, border: 'none', borderRadius: 3, color: FR.salt, fontSize: 12, cursor: step === STEPS.length - 1 ? 'default' : 'pointer' }}>
              {step === STEPS.length - 2 ? 'Review' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
