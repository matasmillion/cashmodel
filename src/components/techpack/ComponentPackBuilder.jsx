// Component Pack Builder — 8-step wizard with live page preview.
// Mirrors the Tech Pack builder architecture: left sidebar with numbered steps,
// center form for the active section, right pane showing the matching A4
// landscape page of the component pack.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, History, Printer, X, Download } from 'lucide-react';
import { FR, DEFAULT_COMPONENT_DATA, COMPONENT_STEPS, LEGACY_STATUS_MIGRATION, LEGACY_SAMPLE_TYPE_MIGRATION } from './componentPackConstants';
import { getFRColor } from '../../utils/colorLibrary';
import { COMPONENT_STEP_FNS } from './ComponentPackSteps';
import ComponentPackPagePreview from './ComponentPackPagePreview';
import { saveComponentPack } from '../../utils/componentPackStore';
import { parsePLMHash, replacePLMHash } from '../../utils/plmRouting';
import { addPerson } from '../../utils/plmDirectory';
import { generateComponentPackPDF, generateComponentPackSVG, svgToBlob } from '../../utils/componentPackExport';
import { downloadBlob } from '../../utils/downloadBlob';
import { CostPill } from './TechPackPrimitives';

function sanitizeFilename(s) {
  return (s || 'trimpack').replace(/[^\w\-]+/g, '_').slice(0, 60);
}

// Sidebar panel that lists every snapshot made on this trim. Click a row to
// open the full 4-page rendering of that version in a modal — this is the
// "finalized PDF" view for the iteration. Window print saves it as a PDF.
function VersionPanel({ revisions, onSnapshot, onOpenVersion }) {
  return (
    <div style={{ borderTop: `1px solid ${FR.sand}`, marginTop: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: FR.slate }}>
          <History size={12} /> Versions ({revisions.length})
        </span>
        <button onClick={onSnapshot}
          style={{ padding: '3px 8px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 9, cursor: 'pointer' }}>
          + Snapshot
        </button>
      </div>
      {revisions.length === 0 ? (
        <div style={{ fontSize: 9, color: FR.stone, fontStyle: 'italic' }}>
          No snapshots yet. Take one when a proto or iteration is finalized.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
          {[...revisions].reverse().map((r, i) => {
            const originalIdx = revisions.length - 1 - i;
            return (
              <button key={originalIdx} onClick={() => onOpenVersion(originalIdx)}
                style={{ textAlign: 'left', padding: '5px 7px', background: 'white', border: `1px solid ${FR.sand}`, borderRadius: 3, cursor: 'pointer', fontSize: 10, color: FR.slate }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{r.rev || `V${originalIdx + 1}.0`}</strong>
                  <span style={{ color: FR.stone, fontSize: 9 }}>{r.date || ''}</span>
                </div>
                {r.note && <div style={{ fontSize: 9, color: FR.stone, marginTop: 2 }}>{r.note}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VersionViewer({ revision, onClose }) {
  if (!revision) return null;
  const snapshotData = revision.dataSnapshot || {};
  const snapshotImages = revision.imagesSnapshot || [];
  const pageCount = COMPONENT_STEPS.length;

  const handlePrint = () => {
    // Window.print targets the modal contents — they're styled to be the only
    // thing visible when printed (see print CSS below).
    window.print();
  };

  return (
    <div role="dialog"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #plm-version-print, #plm-version-print * { visibility: visible !important; }
          #plm-version-print { position: absolute; left: 0; top: 0; width: 100%; }
          #plm-version-chrome { display: none !important; }
        }
      `}</style>

      <div id="plm-version-chrome"
        style={{ background: FR.slate, color: FR.salt, padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>F R · T R I M  P A C K</div>
          <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", fontSize: 18, marginTop: 2 }}>
            {snapshotData.componentName || 'Trim'} · {revision.rev || `V${(revision.version || 1)}.0`}
          </div>
          {revision.note && <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>{revision.note}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePrint}
            style={{ padding: '6px 14px', background: FR.salt, color: FR.slate, border: 'none', borderRadius: 3, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={12} /> Save as PDF
          </button>
          <button onClick={onClose} aria-label="Close"
            style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div id="plm-version-print"
        style={{ flex: 1, overflowY: 'auto', padding: '24px 40px', background: '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        {Array.from({ length: pageCount }).map((_, i) => (
          <div key={i} style={{ width: '100%', maxWidth: 1000, background: FR.white, borderRadius: 4 }}>
            <ComponentPackPagePreview data={snapshotData} images={snapshotImages} step={i} skippedSteps={snapshotData.skippedSteps || []} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComponentPackBuilder({ pack, onBack, existingSuppliers = [], existingPeople = [] }) {
  const [step, setStep] = useState(() => {
    const { packId, step } = parsePLMHash();
    return packId === pack.id ? Math.min(step, COMPONENT_STEPS.length - 1) : 0;
  });
  // One-time migrations for legacy packs run on first open:
  //   1. finalApproval.brandOwner → finalApproval.manager
  //   2. status: Sampling/Testing/Pre-Production/Production/Released →
  //      the new 3-stage set (Design / Sample / Production-Ready).
  //   3. samples[].type: Proto/Fit/SMS/PP/TOP → new Design/Sample/
  //      Production-Ready set.
  const [data, setData] = useState(() => {
    let next = pack.data || DEFAULT_COMPONENT_DATA;

    // (1) brandOwner → manager
    const fa = next.finalApproval || {};
    if (fa.brandOwner) {
      const hasManagerData = fa.manager && (fa.manager.name || fa.manager.signature || fa.manager.date);
      const hasBrandOwnerData = fa.brandOwner && (fa.brandOwner.name || fa.brandOwner.signature || fa.brandOwner.date);
      const { brandOwner, ...rest } = fa;
      next = {
        ...next,
        finalApproval: (hasBrandOwnerData && !hasManagerData)
          ? { ...rest, manager: brandOwner }
          : rest,
      };
    }

    // (2) Status migration
    if (next.status && LEGACY_STATUS_MIGRATION[next.status]) {
      next = { ...next, status: LEGACY_STATUS_MIGRATION[next.status] };
    }

    // (3) Sample type migration
    if (Array.isArray(next.samples) && next.samples.length) {
      const migratedSamples = next.samples.map(s => {
        const mapped = LEGACY_SAMPLE_TYPE_MIGRATION[s?.type];
        return mapped ? { ...s, type: mapped } : s;
      });
      next = { ...next, samples: migratedSamples };
    }

    // (4) Sanitise revision descriptions. Early snapshot code accidentally
    // wrote an object into `description`, which rendered as "[object Object]"
    // in the revision history. Coerce anything non-string back to a readable
    // string so old rows render cleanly.
    if (Array.isArray(next.revisions) && next.revisions.length) {
      const sanitised = next.revisions.map(r => {
        if (r == null) return r;
        const fix = (v) => typeof v === 'string' ? v : (v == null ? '' : String(v));
        const description = typeof r.description === 'string'
          ? r.description
          : (typeof r.note === 'string' && r.note)
            ? r.note
            : `Snapshot at ${r.status || 'Design'}`;
        return {
          ...r,
          rev: fix(r.rev),
          date: fix(r.date),
          changedBy: fix(r.changedBy),
          approvedBy: fix(r.approvedBy),
          description,
        };
      });
      next = { ...next, revisions: sanitised };
    }

    return next;
  });
  const [images, setImages] = useState(pack.images || []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [viewingVersionIdx, setViewingVersionIdx] = useState(null);
  const [exporting, setExporting] = useState(null); // 'pdf' | 'svg' | null
  const [exportError, setExportError] = useState(null);
  const saveTimerRef = useRef(null);

  // Build a filename stem from the trim name + current revision so repeated
  // exports across iterations don't overwrite each other in the browser.
  const exportFilename = useCallback(() => {
    const stem = sanitizeFilename(data.componentName || 'trimpack');
    const rev = (data.revisions || []).length + 1;
    return `${stem}_V${rev}`;
  }, [data.componentName, data.revisions]);

  const handleDownloadPDF = useCallback(async () => {
    setExporting('pdf');
    setExportError(null);
    try {
      const blob = await generateComponentPackPDF(data, images);
      await downloadBlob(blob, `${exportFilename()}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      setExportError(err?.message || 'PDF export failed');
    }
    setExporting(null);
  }, [data, images, exportFilename]);

  const handleDownloadSVG = useCallback(async () => {
    setExporting('svg');
    setExportError(null);
    try {
      const svg = generateComponentPackSVG(data, images);
      await downloadBlob(svgToBlob(svg), `${exportFilename()}.svg`);
    } catch (err) {
      console.error('SVG export failed:', err);
      setExportError(err?.message || 'SVG export failed');
    }
    setExporting(null);
  }, [data, images, exportFilename]);

  // Push step into URL on every change so refresh keeps you on the same step.
  useEffect(() => {
    replacePLMHash({ section: 'components', packId: pack.id, step });
  }, [step, pack.id]);

  // Sync from browser back/forward
  useEffect(() => {
    const sync = () => {
      const { packId, step: urlStep } = parsePLMHash();
      if (packId === pack.id && urlStep !== step) {
        setStep(Math.min(urlStep, COMPONENT_STEPS.length - 1));
      }
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [step, pack.id]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const result = await saveComponentPack(pack.id, {
          data, images,
          component_name: data.componentName || '',
          component_category: data.componentCategory || '',
          status: data.status || 'Design',
          supplier: data.supplier || '',
          cost_per_unit: data.targetUnitCost || data.costPerUnit || '',
          currency: data.currency || 'USD',
        });
        if (result && result.ok === false) {
          setSaveError(result.error?.message || 'Cloud save failed');
        } else {
          setSaveError(null);
        }
      } catch (err) {
        console.error(err);
        setSaveError(err?.message || String(err));
      }
      setTimeout(() => setSaving(false), 300);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [data, images, pack.id]);

  // Every mutation stamps dateCreated with today's date — the UI renders
  // this as "Date Last Updated" and the field is read-only so the only way
  // it moves is through an actual edit.
  const todayStamp = () => new Date().toISOString().slice(0, 10);
  const stampDate = useCallback((p) => ({ ...p, dateCreated: todayStamp() }), []);

  const set = useCallback((k, v) => setData(p => stampDate({ ...p, [k]: v })), [stampDate]);

  const handleImgUpload = useCallback((slot, b64, name) => {
    setImages(p => [...p, { slot, data: b64, name }]);
    setData(stampDate);
  }, [stampDate]);
  const handleImgRemove = useCallback((slot, idx) => {
    setImages(p => {
      let c = 0;
      return p.filter(img => {
        if (img.slot === slot) { if (c === idx) { c++; return false; } c++; }
        return true;
      });
    });
    setData(stampDate);
  }, [stampDate]);

  // Auto-fill hex from the color library — picks up custom colors too.
  const pickFRColor = useCallback((colorName) => {
    set('frColor', colorName);
    const match = getFRColor(colorName);
    if (match && match.hex) set('hex', match.hex);
  }, [set]);

  const handleAddPerson = useCallback((name) => {
    addPerson(name);
  }, []);

  // Take a frozen snapshot of the current trim pack — data + images + derived
  // revision number. The snapshot becomes the contents of "V{n}.0" when you
  // re-open that version in the viewer. When a `presetNote` is supplied (e.g.
  // from the Overview workflow buttons), skip the prompt and use it directly.
  const createSnapshot = useCallback((presetNote) => {
    setData(prev => {
      const existing = prev.revisions || [];
      const nextVersion = existing.length + 1;
      const note = presetNote !== undefined
        ? String(presetNote || '').trim()
        : (prompt(`Snapshot note for V${nextVersion}.0 (optional):`) ?? '').trim();
      const today = new Date().toISOString().slice(0, 10);
      const fa = prev.finalApproval || {};
      const snapshot = {
        rev: `V${nextVersion}.0`,
        date: today,
        version: nextVersion,
        status: prev.status,
        note,
        description: note || `Snapshot at ${prev.status || 'Design'}`,
        changedBy: fa.designer?.name || '',
        approvedBy: fa.manager?.name || '',
        dataSnapshot: JSON.parse(JSON.stringify(prev)),
        imagesSnapshot: JSON.parse(JSON.stringify(images)),
      };
      return {
        ...prev,
        revision: `V${nextVersion + 1}.0`,
        revisions: [...existing, snapshot],
        dateCreated: todayStamp(),
      };
    });
  }, [images]);

  // Stamp the clicked approval role with today's date. Factory uses a
  // separate dateChop key (per traditional factory "chop" sign-off convention).
  const confirmRole = useCallback((role) => {
    const dateKey = role === 'factory' ? 'dateChop' : 'date';
    setData(prev => {
      const fa = prev.finalApproval || {};
      const slot = fa[role] || {};
      return stampDate({
        ...prev,
        finalApproval: {
          ...fa,
          [role]: { ...slot, [dateKey]: todayStamp() },
        },
      });
    });
  }, [stampDate]);

  const unconfirmRole = useCallback((role) => {
    const dateKey = role === 'factory' ? 'dateChop' : 'date';
    setData(prev => {
      const fa = prev.finalApproval || {};
      const slot = fa[role] || {};
      return stampDate({
        ...prev,
        finalApproval: {
          ...fa,
          [role]: { ...slot, [dateKey]: '' },
        },
      });
    });
  }, [stampDate]);

  const toggleSkip = useCallback((stepIdx) => {
    setData(prev => {
      const current = prev.skippedSteps || [];
      const next = current.includes(stepIdx)
        ? current.filter(i => i !== stepIdx)
        : [...current, stepIdx];
      return stampDate({ ...prev, skippedSteps: next });
    });
  }, [stampDate]);

  // Samples on the trim pack — mirrors the Tech Pack panel wiring.
  const addSample = useCallback((sample) => {
    setData(prev => stampDate({ ...prev, samples: [...(prev.samples || []), sample] }));
  }, [stampDate]);
  const updateSample = useCallback((idx, updated) => {
    setData(prev => stampDate({ ...prev, samples: (prev.samples || []).map((s, i) => i === idx ? updated : s) }));
  }, [stampDate]);
  const removeSample = useCallback((idx) => {
    setData(prev => stampDate({ ...prev, samples: (prev.samples || []).filter((_, i) => i !== idx) }));
  }, [stampDate]);

  const Comp = COMPONENT_STEP_FNS[step];
  const skippedSteps = data.skippedSteps || [];
  const isCurrentSkipped = skippedSteps.includes(step);
  const stepProps = {
    data, set, images, onUpload: handleImgUpload, onRemove: handleImgRemove,
    pickFRColor, existingSuppliers, existingPeople, onAddPerson: handleAddPerson,
    createSnapshot, confirmRole, unconfirmRole,
    addSample, updateSample, removeSample,
    onDownloadPDF: handleDownloadPDF, onDownloadSVG: handleDownloadSVG,
    exporting, exportError,
  };
  const viewingRevision = viewingVersionIdx != null ? (data.revisions || [])[viewingVersionIdx] : null;

  return (
    <>
    {viewingRevision && (
      <VersionViewer revision={viewingRevision} onClose={() => setViewingVersionIdx(null)} />
    )}
    <div style={{ background: FR.salt, fontFamily: "'Helvetica Neue','Inter',sans-serif", borderRadius: 8, overflow: 'hidden', border: `1px solid ${FR.sand}` }}>
      {/* Header */}
      <div style={{ background: FR.slate, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: FR.salt, padding: '5px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> Back to Trims
          </button>
          <div>
            <div style={{ color: FR.salt, fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>F R · T R I M  P A C K</div>
            <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", color: FR.salt, fontSize: 16, marginTop: 2 }}>
              {data.componentName || 'New Trim'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && <span style={{ fontSize: 10, color: FR.sage }}>Saving…</span>}
          {saveError && (
            <span title={saveError} style={{ fontSize: 10, color: '#D4956A', background: 'rgba(212,149,106,0.12)', padding: '2px 8px', borderRadius: 3 }}>
              ⚠︎ Cloud save failed — edits kept locally
            </span>
          )}
          {exportError && (
            <span title={exportError} style={{ fontSize: 10, color: '#D4956A', background: 'rgba(212,149,106,0.12)', padding: '2px 8px', borderRadius: 3 }}>
              ⚠︎ Export failed
            </span>
          )}
          <button onClick={handleDownloadPDF} disabled={!!exporting}
            title="Download all 7 pages as an A4 landscape PDF"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: FR.salt, color: FR.slate, border: 'none', borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer' }}>
            <Download size={11} /> {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
          <button onClick={handleDownloadSVG} disabled={!!exporting}
            title="Download all 7 pages as a single editable SVG"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,255,255,0.1)', color: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer' }}>
            <Download size={11} /> {exporting === 'svg' ? 'Exporting…' : 'SVG'}
          </button>
          <CostPill amount={data.targetUnitCost} currency={data.currency || 'USD'} title="Target unit cost of this trim" style={{ background: FR.salt, color: FR.slate }} />
          <span style={{ fontSize: 9, color: FR.stone }}>{data.componentCategory || '—'}</span>
          <span style={{ fontSize: 9, color: FR.stone }}>v{(data.revisions || []).length}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <div style={{ width: 220, minWidth: 220, borderRight: `1px solid ${FR.sand}`, background: FR.salt, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 0', flex: 1 }}>
            {COMPONENT_STEPS.map((s, i) => {
              const stepSkipped = skippedSteps.includes(i);
              return (
                <button key={s.id} onClick={() => setStep(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', border: 'none', cursor: 'pointer', background: i === step ? FR.white : 'transparent', borderLeft: i === step ? `3px solid ${FR.soil}` : '3px solid transparent' }}>
                  <span style={{ fontSize: 10, color: stepSkipped ? '#C0392B' : (i === step ? FR.soil : FR.stone), fontWeight: 700, width: 18 }}>
                    {stepSkipped ? '×' : s.icon}
                  </span>
                  <span style={{ fontSize: 11, color: i === step ? FR.slate : FR.stone, textAlign: 'left', flex: 1, textDecoration: stepSkipped ? 'line-through' : 'none', opacity: stepSkipped ? 0.55 : 1 }}>
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
          <VersionPanel
            revisions={data.revisions || []}
            onSnapshot={createSnapshot}
            onOpenVersion={(idx) => setViewingVersionIdx(idx)} />
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
        <div style={{ flex: '1 1 560px', minWidth: 400, maxWidth: 820, borderLeft: `1px solid ${FR.sand}`, background: FR.sand, padding: '20px 20px', maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: FR.stone, letterSpacing: 2, fontWeight: 600, textTransform: 'uppercase' }}>Live Preview</div>
            <div style={{ fontSize: 9, color: FR.stone }}>Page {step + 1} / {COMPONENT_STEPS.length}</div>
          </div>
          <ComponentPackPagePreview data={data} images={images} step={step} skippedSteps={skippedSteps} />
        </div>
      </div>
    </div>
    </>
  );
}
