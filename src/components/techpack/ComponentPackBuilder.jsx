// Component Pack Builder — 8-step wizard with live page preview.
// Mirrors the Tech Pack builder architecture: left sidebar with numbered steps,
// center form for the active section, right pane showing the matching A4
// landscape page of the component pack.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FR, DEFAULT_COMPONENT_DATA, COMPONENT_STEPS } from './componentPackConstants';
import { FR_COLOR_OPTIONS } from './techPackConstants';
import { COMPONENT_STEP_FNS } from './ComponentPackSteps';
import ComponentPackPagePreview from './ComponentPackPagePreview';
import { saveComponentPack } from '../../utils/componentPackStore';

export default function ComponentPackBuilder({ pack, onBack }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(pack.data || DEFAULT_COMPONENT_DATA);
  const [images, setImages] = useState(pack.images || []);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveComponentPack(pack.id, {
          data, images,
          component_name: data.componentName || '',
          component_category: data.componentCategory || '',
          status: data.status || 'Design',
          supplier: data.supplier || '',
          cost_per_unit: data.costPerUnit || '',
          currency: data.currency || 'USD',
        });
      } catch (err) { console.error(err); }
      setTimeout(() => setSaving(false), 300);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [data, images, pack.id]);

  const set = useCallback((k, v) => setData(p => ({ ...p, [k]: v })), []);

  const handleImgUpload = useCallback((slot, b64, name) =>
    setImages(p => [...p, { slot, data: b64, name }]), []);
  const handleImgRemove = useCallback((slot, idx) => {
    setImages(p => {
      let c = 0;
      return p.filter(img => {
        if (img.slot === slot) { if (c === idx) { c++; return false; } c++; }
        return true;
      });
    });
  }, []);

  // Auto-fill hex from FR color
  const pickFRColor = useCallback((colorName) => {
    set('frColor', colorName);
    const match = FR_COLOR_OPTIONS.find(c => c.name === colorName);
    if (match) set('hex', match.hex);
  }, [set]);

  const Comp = COMPONENT_STEP_FNS[step];
  const stepProps = { data, set, images, onUpload: handleImgUpload, onRemove: handleImgRemove, pickFRColor };

  return (
    <div style={{ background: FR.salt, fontFamily: "'Helvetica Neue','Inter',sans-serif", borderRadius: 8, overflow: 'hidden', border: `1px solid ${FR.sand}` }}>
      {/* Header */}
      <div style={{ background: FR.slate, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: FR.salt, padding: '5px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> Back to Components
          </button>
          <div>
            <div style={{ color: FR.salt, fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>F R · C O M P O N E N T  P A C K</div>
            <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", color: FR.salt, fontSize: 16, marginTop: 2 }}>
              {data.componentName || 'New Component'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && <span style={{ fontSize: 10, color: FR.sage }}>Saving…</span>}
          <span style={{ fontSize: 9, color: FR.stone }}>{data.componentCategory || '—'}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <div style={{ width: 220, minWidth: 220, borderRight: `1px solid ${FR.sand}`, background: FR.salt, padding: '14px 0' }}>
          {COMPONENT_STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', border: 'none', cursor: 'pointer', background: i === step ? FR.white : 'transparent', borderLeft: i === step ? `3px solid ${FR.soil}` : '3px solid transparent' }}>
              <span style={{ fontSize: 10, color: i === step ? FR.soil : FR.stone, fontWeight: 700, width: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 11, color: i === step ? FR.slate : FR.stone, textAlign: 'left', flex: 1 }}>{s.title}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, padding: '20px 28px', maxHeight: '75vh', overflowY: 'auto' }}>
          <Comp {...stepProps} />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${FR.sand}` }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{ padding: '8px 20px', background: 'none', border: `1px solid ${step === 0 ? FR.sand : FR.slate}`, borderRadius: 3, color: step === 0 ? FR.sand : FR.slate, fontSize: 12, cursor: step === 0 ? 'default' : 'pointer' }}>
              Previous
            </button>
            <span style={{ fontSize: 10, color: FR.stone, alignSelf: 'center' }}>Step {step + 1} of {COMPONENT_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(COMPONENT_STEPS.length - 1, step + 1))} disabled={step === COMPONENT_STEPS.length - 1}
              style={{ padding: '8px 20px', background: step === COMPONENT_STEPS.length - 1 ? FR.sand : FR.slate, border: 'none', borderRadius: 3, color: FR.salt, fontSize: 12, cursor: step === COMPONENT_STEPS.length - 1 ? 'default' : 'pointer' }}>
              Next
            </button>
          </div>
        </div>

        {/* Live page preview */}
        <div style={{ width: 480, minWidth: 360, maxWidth: 520, borderLeft: `1px solid ${FR.sand}`, background: FR.sand, padding: '20px 20px', maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: FR.stone, letterSpacing: 2, fontWeight: 600, textTransform: 'uppercase' }}>Live Preview</div>
            <div style={{ fontSize: 9, color: FR.stone }}>Page {step + 1} / {COMPONENT_STEPS.length}</div>
          </div>
          <ComponentPackPagePreview data={data} images={images} step={step} />
        </div>
      </div>
    </div>
  );
}
