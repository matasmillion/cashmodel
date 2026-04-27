// Main Tech Pack builder — 14-step wizard + PLM features (revisions, cost, samples, variants)
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, History, Plus, CheckCircle, XCircle, Clock, Camera } from 'lucide-react';
import { FR, DEFAULT_DATA, DEFAULT_LIBRARY, STEPS, IMG_STEPS, computeCompletion, isStepLocked, computeBOMCost, computeColorwayCost, SAMPLE_TYPES, SAMPLE_VERDICTS } from './techPackConstants';
import { STEP_FNS } from './TechPackSteps';
import TechPackPagePreview from './TechPackPagePreview';
import { saveTechPack } from '../../utils/techPackStore';
import { generateTechPackPDF } from '../../utils/techPackPDF';
import { generateTechPackSVG, svgToBlob } from '../../utils/techPackSVG';
import { resizeImage } from './techPackConstants';
import { parsePLMHash, replacePLMHash } from '../../utils/plmRouting';
import { getFRColorCost } from '../../utils/colorLibrary';
import { formatCost } from './TechPackPrimitives';

function sanitizeFilename(s) {
  return (s || 'techpack').replace(/[^\w\-]+/g, '_').slice(0, 60);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ─── Revision Panel ──────────────────────────────────────────────────────────
function RevisionPanel({ revisions, onCreateRevision }) {
  const [showAll, setShowAll] = useState(false);
  const recent = showAll ? revisions : revisions.slice(0, 3);
  return (
    <div style={{ marginTop: 16, padding: 12, background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: FR.slate }}>
          <History size={13} /> Revisions ({revisions.length})
        </div>
        <button onClick={onCreateRevision}
          style={{ padding: '4px 10px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
          + Snapshot
        </button>
      </div>
      {recent.length === 0 ? (
        <p style={{ fontSize: 10, color: FR.stone, margin: 0 }}>No snapshots yet. Create one before sending to vendor.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {recent.map((r, i) => (
            <div key={i} style={{ fontSize: 10, color: FR.stone, padding: '4px 8px', background: 'white', borderRadius: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span><strong style={{ color: FR.slate }}>v{r.version}</strong> — {r.status} — {r.note || 'Snapshot'}</span>
              <span>{new Date(r.date).toLocaleDateString()}</span>
            </div>
          ))}
          {revisions.length > 3 && (
            <button onClick={() => setShowAll(!showAll)} style={{ fontSize: 10, color: FR.soil, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {showAll ? 'Show less' : `Show all ${revisions.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sample Tracking Panel ───────────────────────────────────────────────────
function SamplePanel({ samples, onAdd, onUpdate, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [newSample, setNewSample] = useState({ type: 'Proto', date: '', courier: '', trackingNumber: '', verdict: 'Pending', notes: '' });

  const commit = () => {
    if (!newSample.type) return;
    onAdd({ ...newSample, id: Date.now().toString(), createdAt: new Date().toISOString() });
    setNewSample({ type: 'Proto', date: '', courier: '', trackingNumber: '', verdict: 'Pending', notes: '' });
    setAdding(false);
  };

  const verdictIcon = (v) => {
    if (v === 'Approved') return <CheckCircle size={11} style={{ color: '#4CAF7D' }} />;
    if (v === 'Rejected') return <XCircle size={11} style={{ color: '#C0392B' }} />;
    return <Clock size={11} style={{ color: FR.stone }} />;
  };

  return (
    <div style={{ borderTop: `1px solid ${FR.sand}`, marginTop: 8, paddingTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 16px' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: FR.slate }}>Samples ({samples.length})</span>
        <button onClick={() => setAdding(!adding)}
          style={{ padding: '3px 8px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 9, color: FR.soil, cursor: 'pointer' }}>
          <Plus size={10} /> Log
        </button>
      </div>

      {adding && (
        <div style={{ padding: '8px 16px', background: FR.white, margin: '4px 8px', borderRadius: 4, border: `1px solid ${FR.sand}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <select value={newSample.type} onChange={e => setNewSample(p => ({ ...p, type: e.target.value }))}
              style={{ fontSize: 10, padding: 4, border: `1px solid ${FR.sand}`, borderRadius: 3 }}>
              {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input value={newSample.date} onChange={e => setNewSample(p => ({ ...p, date: e.target.value }))}
              placeholder="Date" type="date" style={{ fontSize: 10, padding: 4, border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
            <input value={newSample.courier} onChange={e => setNewSample(p => ({ ...p, courier: e.target.value }))}
              placeholder="Courier" style={{ fontSize: 10, padding: 4, border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
            <input value={newSample.trackingNumber} onChange={e => setNewSample(p => ({ ...p, trackingNumber: e.target.value }))}
              placeholder="Tracking #" style={{ fontSize: 10, padding: 4, border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
            <select value={newSample.verdict} onChange={e => setNewSample(p => ({ ...p, verdict: e.target.value }))}
              style={{ fontSize: 10, padding: 4, border: `1px solid ${FR.sand}`, borderRadius: 3 }}>
              {SAMPLE_VERDICTS.map(v => <option key={v}>{v}</option>)}
            </select>
            <button onClick={commit} style={{ fontSize: 10, padding: 4, background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>Save</button>
          </div>
          <input value={newSample.notes} onChange={e => setNewSample(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notes…" style={{ width: '100%', fontSize: 10, padding: 4, border: `1px solid ${FR.sand}`, borderRadius: 3, marginTop: 6, boxSizing: 'border-box' }} />
        </div>
      )}

      {samples.map((s, i) => (
        <div key={s.id || i} style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: FR.stone }}>
          {verdictIcon(s.verdict)}
          <span style={{ fontWeight: 600, color: FR.slate }}>{s.type}</span>
          {s.date && <span>{s.date}</span>}
          {s.courier && <span style={{ color: FR.stone }}>via {s.courier}</span>}
          <span style={{ marginLeft: 'auto' }}>
            <select value={s.verdict} onChange={e => onUpdate(i, { ...s, verdict: e.target.value })}
              style={{ fontSize: 9, padding: '2px 4px', border: `1px solid ${FR.sand}`, borderRadius: 2, color: FR.slate }}>
              {SAMPLE_VERDICTS.map(v => <option key={v}>{v}</option>)}
            </select>
          </span>
          <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 11, padding: 0 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Builder ────────────────────────────────────────────────────────────
export default function TechPackBuilder({ pack, onBack, existingSuppliers = [] }) {
  // Initial step comes from the URL so refresh keeps you on the same wizard step.
  const [step, setStep] = useState(() => {
    const { packId, step } = parsePLMHash();
    return packId === pack.id ? Math.min(step, STEPS.length - 1) : 0;
  });
  const [data, setData] = useState(pack.data || DEFAULT_DATA);
  const [images, setImages] = useState(pack.images || []);
  const [library, setLibrary] = useState(pack.library || DEFAULT_LIBRARY);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const saveTimerRef = useRef(null);

  // Push step into URL on every change (replaceState — flicking through
  // 14 steps shouldn't pollute the back stack).
  useEffect(() => {
    replacePLMHash({ section: 'styles', packId: pack.id, step });
  }, [step, pack.id]);

  // Browser back/forward → keep wizard step in sync with the URL
  useEffect(() => {
    const sync = () => {
      const { packId, step: urlStep } = parsePLMHash();
      if (packId === pack.id && urlStep !== step) {
        setStep(Math.min(urlStep, STEPS.length - 1));
      }
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [step, pack.id]);

  // Derived: full unit-cost roll-up — BOM + colorway library.
  // Every cash line on the garment contributes a per-unit number; vendors
  // aren't a line item here (they're the maker, not a part).
  const bomCost = computeBOMCost(data);
  const colorwayCost = computeColorwayCost(data, getFRColorCost);
  const totalUnitCost = bomCost + colorwayCost;
  const targetFOB = parseFloat(data.targetFOB) || 0;
  const costVariance = targetFOB > 0 ? totalUnitCost - targetFOB : 0;

  // Debounced auto-save
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveTechPack(pack.id, {
          data, images, library,
          style_name: data.styleName || '',
          product_category: data.productCategory || '',
          status: data.status || 'Design',
          completion_pct: computeCompletion(data),
        });
      } catch (err) { console.error('Auto-save failed:', err); }
      setTimeout(() => setSaving(false), 300);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [data, images, library, pack.id]);

  const set = useCallback((k, v) => setData(p => ({ ...p, [k]: v })), []);
  const handleImgUpload = useCallback((slot, b64, name) => setImages(p => [...p, { slot, data: b64, name }]), []);
  const handleImgRemove = useCallback((slot, idx) => {
    setImages(p => { let c = 0; return p.filter(img => { if (img.slot === slot) { if (c === idx) { c++; return false; } c++; } return true; }); });
  }, []);
  const saveToLibrary = useCallback((category, item) => {
    setLibrary(p => {
      const existing = p[category] || [];
      if (typeof item === 'string') { if (existing.includes(item)) return p; return { ...p, [category]: [...existing, item] }; }
      return { ...p, [category]: [...existing, { ...item }] };
    });
  }, []);

  const toggleSkip = useCallback((stepIdx) => {
    setData(prev => {
      const current = prev.skippedSteps || [];
      const next = current.includes(stepIdx)
        ? current.filter(i => i !== stepIdx)
        : [...current, stepIdx];
      return { ...prev, skippedSteps: next };
    });
  }, []);

  // ── Revision snapshots ──
  const createRevision = useCallback(() => {
    const revisions = data.revisions || [];
    const version = revisions.length + 1;
    const note = prompt(`Revision v${version} note (optional):`) || '';
    const today = new Date().toISOString().slice(0, 10);
    const snapshot = {
      rev: `V${version}.0`,
      date: today,
      changedBy: '',
      section: '',
      description: note || `Snapshot at ${data.status || 'Design'}`,
      approvedBy: '',
      // keep snapshot metadata for PLM audit trail
      version,
      status: data.status,
      note,
      dataSnapshot: JSON.parse(JSON.stringify(data)),
    };
    setData(p => ({ ...p, revisions: [...(p.revisions || []), snapshot] }));
  }, [data]);

  // ── Sample tracking ──
  const addSample = useCallback((sample) => {
    setData(p => ({ ...p, samples: [...(p.samples || []), sample] }));
  }, []);
  const updateSample = useCallback((idx, updated) => {
    setData(p => ({ ...p, samples: (p.samples || []).map((s, i) => i === idx ? updated : s) }));
  }, []);
  const removeSample = useCallback((idx) => {
    setData(p => ({ ...p, samples: (p.samples || []).filter((_, i) => i !== idx) }));
  }, []);

  // ── Export ──
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const filename = sanitizeFilename(data.styleName || data.styleNumber || 'techpack');
      const fullPack = { ...pack, data, images, library };
      const pdfBlob = await generateTechPackPDF(fullPack);
      downloadBlob(pdfBlob, `${filename}_v${(data.revisions || []).length || 1}.pdf`);
      const svgString = generateTechPackSVG(fullPack);
      downloadBlob(svgToBlob(svgString), `${filename}_v${(data.revisions || []).length || 1}.svg`);
      await saveTechPack(pack.id, {
        data, images, library,
        style_name: data.styleName || '',
        product_category: data.productCategory || '',
        status: data.status || 'Design',
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
  const skippedSteps = data.skippedSteps || [];
  const isCurrentSkipped = skippedSteps.includes(step);
  const libCount = (library.bom || []).length + (library.trims || []).length;
  const stepProps = {
    data, set, images, onUpload: handleImgUpload, onRemove: handleImgRemove,
    library, saveToLibrary,
    onSubmit: handleSubmit, submitting, submitResult,
    bomCost, costVariance,
    existingSuppliers,
    onCreateRevision: createRevision,
  };

  return (
    <div style={{ background: FR.salt, fontFamily: "'Helvetica Neue','Inter',sans-serif", borderRadius: 8, overflow: 'hidden', border: `1px solid ${FR.sand}` }}>
      {/* Header */}
      <div style={{ background: FR.slate, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: FR.salt, padding: '5px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> Back
          </button>
          <div>
            <div style={{ color: FR.salt, fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>
              F O R E I G N  R E S O U R C E  C O .
              {data.parentStyleName && <span style={{ color: FR.stone, letterSpacing: 0, marginLeft: 8, fontWeight: 400, fontSize: 9 }}>variant of {data.parentStyleName}</span>}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", color: FR.salt, fontSize: 16, marginTop: 2 }}>
              {data.styleName || 'New Tech Pack'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {saving && <span style={{ fontSize: 10, color: FR.sage }}>Saving…</span>}
          {/* Cost roll-up — BOM + colorway (wash/dye). */}
          <div style={{ textAlign: 'right' }} title={`BOM ${formatCost(bomCost)}  ·  Colorways ${formatCost(colorwayCost)}`}>
            <div style={{ fontSize: 9, color: FR.stone }}>Total Unit Cost</div>
            <div style={{ fontSize: 13, color: totalUnitCost > 0 ? (costVariance > 0 ? '#D4956A' : FR.sage) : FR.stone, fontWeight: 600 }}>
              {formatCost(totalUnitCost)}
              {targetFOB > 0 && costVariance !== 0 && (
                <span style={{ fontSize: 9, marginLeft: 4, color: costVariance > 0 ? '#C0392B' : FR.sage }}>
                  ({costVariance > 0 ? '+' : ''}{costVariance.toFixed(2)} vs target)
                </span>
              )}
            </div>
            <div style={{ fontSize: 8, color: FR.stone, marginTop: 1 }}>
              BOM {formatCost(bomCost)} · Color {formatCost(colorwayCost)}
            </div>
          </div>
          <span style={{ fontSize: 9, color: FR.stone }}>{computeCompletion(data)}%</span>
          <span style={{ fontSize: 9, color: FR.stone }}>v{(data.revisions || []).length || 0}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <div style={{ width: 220, minWidth: 220, borderRight: `1px solid ${FR.sand}`, background: FR.salt, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 0', flex: 1 }}>
            {STEPS.map((s, i) => {
              const stepLocked = isStepLocked(i, data.status);
              const stepSkipped = skippedSteps.includes(i);
              return (
                <button key={s.id} onClick={() => setStep(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', border: 'none', cursor: 'pointer', background: i === step ? FR.white : 'transparent', borderLeft: i === step ? `3px solid ${FR.soil}` : '3px solid transparent' }}>
                  <span style={{ fontSize: 10, color: stepSkipped ? '#C0392B' : (i === step ? FR.soil : FR.stone), fontWeight: 700, width: 18 }}>
                    {stepSkipped ? '×' : s.icon}
                  </span>
                  <span style={{ fontSize: 11, color: i === step ? FR.slate : FR.stone, textAlign: 'left', flex: 1, textDecoration: stepSkipped ? 'line-through' : 'none', opacity: stepSkipped ? 0.55 : (stepLocked ? 0.5 : 1) }}>
                    {s.title}
                  </span>
                  {stepLocked && !stepSkipped && <span style={{ fontSize: 10, color: FR.stone }}>🔒</span>}
                </button>
              );
            })}
          </div>
          {/* Sample tracking in sidebar */}
          <SamplePanel
            samples={data.samples || []}
            onAdd={addSample}
            onUpdate={updateSample}
            onRemove={removeSample}
          />
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, padding: '20px 28px', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Skip banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, padding: '9px 14px', background: isCurrentSkipped ? 'rgba(192,57,43,0.07)' : FR.salt, border: `1px solid ${isCurrentSkipped ? '#C0392B' : FR.sand}`, borderRadius: 6 }}>
            <div style={{ flex: 1, fontSize: 11, color: isCurrentSkipped ? '#C0392B' : FR.stone }}>
              {isCurrentSkipped ? 'This page is skipped — it will show a "PAGE NOT USED" slash in the export.' : 'Not using this page? Skip it and it will be crossed out in the export.'}
            </div>
            <button onClick={() => toggleSkip(step)}
              style={{ padding: '5px 14px', background: isCurrentSkipped ? '#C0392B' : 'transparent', color: isCurrentSkipped ? 'white' : FR.stone, border: `1px solid ${isCurrentSkipped ? '#C0392B' : FR.sand}`, borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {isCurrentSkipped ? 'Unskip' : 'Skip page'}
            </button>
          </div>

          <Comp {...stepProps} />

          {/* Revision panel on the Review step */}
          {step === STEPS.length - 1 && (
            <RevisionPanel revisions={data.revisions || []} onCreateRevision={createRevision} />
          )}

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

        {/* Live page preview */}
        <div style={{ flex: '1 1 560px', minWidth: 400, maxWidth: 820, borderLeft: `1px solid ${FR.sand}`, background: FR.sand, padding: '20px 20px', maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: FR.stone, letterSpacing: 2, fontWeight: 600, textTransform: 'uppercase' }}>Live Preview</div>
            <div style={{ fontSize: 9, color: FR.stone }}>Page {step + 1} / {STEPS.length}</div>
          </div>
          <TechPackPagePreview data={data} images={images} step={step} skippedSteps={skippedSteps} />
        </div>
      </div>
    </div>
  );
}
