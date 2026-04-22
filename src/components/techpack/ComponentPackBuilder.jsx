// Component Pack Builder — 8-step wizard with live page preview.
// Mirrors the Tech Pack builder architecture: left sidebar with numbered steps,
// center form for the active section, right pane showing the matching A4
// landscape page of the component pack.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, History, Printer, X } from 'lucide-react';
import { FR, DEFAULT_COMPONENT_DATA, COMPONENT_STEPS } from './componentPackConstants';
import { FR_COLOR_OPTIONS } from './techPackConstants';
import { COMPONENT_STEP_FNS } from './ComponentPackSteps';
import ComponentPackPagePreview from './ComponentPackPagePreview';
import { saveComponentPack } from '../../utils/componentPackStore';
import { parsePLMHash, replacePLMHash } from '../../utils/plmRouting';
import { addPerson } from '../../utils/plmDirectory';

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
            <ComponentPackPagePreview data={snapshotData} images={snapshotImages} step={i} />
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
  const [data, setData] = useState(pack.data || DEFAULT_COMPONENT_DATA);
  const [images, setImages] = useState(pack.images || []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [viewingVersionIdx, setViewingVersionIdx] = useState(null);
  const saveTimerRef = useRef(null);

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
          cost_per_unit: data.costPerUnit || '',
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

  // Auto-fill hex from FR color
  const pickFRColor = useCallback((colorName) => {
    set('frColor', colorName);
    const match = FR_COLOR_OPTIONS.find(c => c.name === colorName);
    if (match) set('hex', match.hex);
  }, [set]);

  const handleAddPerson = useCallback((name) => {
    addPerson(name);
  }, []);

  // Take a frozen snapshot of the current trim pack — data + images + derived
  // revision number. The snapshot becomes the contents of "V{n}.0" when you
  // re-open that version in the viewer.
  const createSnapshot = useCallback(() => {
    setData(prev => {
      const existing = prev.revisions || [];
      const nextVersion = existing.length + 1;
      const note = (prompt(`Snapshot note for V${nextVersion}.0 (optional):`) ?? '').trim();
      const today = new Date().toISOString().slice(0, 10);
      const snapshot = {
        rev: `V${nextVersion}.0`,
        date: today,
        version: nextVersion,
        status: prev.status,
        note,
        description: note || `Snapshot at ${prev.status || 'Design'}`,
        changedBy: prev.designedBy?.name || '',
        approvedBy: prev.approvedBy?.name || '',
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

  const Comp = COMPONENT_STEP_FNS[step];
  const stepProps = { data, set, images, onUpload: handleImgUpload, onRemove: handleImgRemove, pickFRColor, existingSuppliers, existingPeople, onAddPerson: handleAddPerson };
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
          <span style={{ fontSize: 9, color: FR.stone }}>{data.componentCategory || '—'}</span>
          <span style={{ fontSize: 9, color: FR.stone }}>v{(data.revisions || []).length}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <div style={{ width: 220, minWidth: 220, borderRight: `1px solid ${FR.sand}`, background: FR.salt, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 0', flex: 1 }}>
            {COMPONENT_STEPS.map((s, i) => (
              <button key={s.id} onClick={() => setStep(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', border: 'none', cursor: 'pointer', background: i === step ? FR.white : 'transparent', borderLeft: i === step ? `3px solid ${FR.soil}` : '3px solid transparent' }}>
                <span style={{ fontSize: 10, color: i === step ? FR.soil : FR.stone, fontWeight: 700, width: 18 }}>{s.icon}</span>
                <span style={{ fontSize: 11, color: i === step ? FR.slate : FR.stone, textAlign: 'left', flex: 1 }}>{s.title}</span>
              </button>
            ))}
          </div>
          <VersionPanel
            revisions={data.revisions || []}
            onSnapshot={createSnapshot}
            onOpenVersion={(idx) => setViewingVersionIdx(idx)} />
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
        <div style={{ flex: '1 1 560px', minWidth: 400, maxWidth: 820, borderLeft: `1px solid ${FR.sand}`, background: FR.sand, padding: '20px 20px', maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: FR.stone, letterSpacing: 2, fontWeight: 600, textTransform: 'uppercase' }}>Live Preview</div>
            <div style={{ fontSize: 9, color: FR.stone }}>Page {step + 1} / {COMPONENT_STEPS.length}</div>
          </div>
          <ComponentPackPagePreview data={data} images={images} step={step} />
        </div>
      </div>
    </div>
    </>
  );
}
