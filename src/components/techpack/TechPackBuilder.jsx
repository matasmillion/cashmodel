// Main Tech Pack builder — 14-step wizard + PLM features (revisions, cost, samples, variants)
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, History, Plus, CheckCircle, XCircle, Clock, Camera, Save } from 'lucide-react';
import VersionHistoryPanel from './VersionHistoryPanel';
import { FR, DEFAULT_DATA, DEFAULT_LIBRARY, STEPS, IMG_STEPS, computeCompletion, isStepLocked, computeBOMCost, computeColorwayCost, SAMPLE_TYPES, SAMPLE_VERDICTS } from './techPackConstants';
import SendToVendorButton from './SendToVendorButton';
import { useApp } from '../../context/AppContext';
import { STEP_FNS } from './TechPackSteps';
import TechPackPagePreview from './TechPackPagePreview';
import ImageAnnotator from './ImageAnnotator';
import { loadBlockAnnotations, saveBlockSlotAnnotations, slotAnnotations, withSlotAnnotations, describeSlot } from '../../utils/cutSewAnnotations';
import { saveTechPack } from '../../utils/techPackStore';
import { generateTechPackPDF } from '../../utils/techPackPDF';
import { generateTechPackSVGAsync, svgToBlob } from '../../utils/techPackSVG';
import { resizeImage } from './techPackConstants';
import { parsePLMHash, replacePLMHash } from '../../utils/plmRouting';
import { getFRColorCost } from '../../utils/colorLibrary';
import { formatCost } from './TechPackPrimitives';
import { uploadAsset, dataUrlToBlob, isLegacyDataUrl, useResolvedImageEntries, isGhostImage } from '../../utils/plmAssets';
import { computePackDiff } from '../../utils/techPackDiff';
import { listTreatments } from '../../utils/treatmentStore';
import { listEmbellishments } from '../../utils/embellishmentStore';
import { getVendor } from '../../utils/vendorLibrary';

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
  const [expandedIdx, setExpandedIdx] = useState(null);
  const allReversed = [...revisions].reverse();
  const shown = showAll ? allReversed : allReversed.slice(0, 5);

  return (
    <div style={{ marginTop: 16, padding: 12, background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: FR.slate }}>
          <History size={13} /> Version History ({revisions.length})
        </div>
        <button onClick={onCreateRevision}
          style={{ padding: '4px 10px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
          + Manual Snapshot
        </button>
      </div>
      {shown.length === 0 ? (
        <p style={{ fontSize: 10, color: FR.stone, margin: 0 }}>No snapshots yet. Snapshots are created automatically on download.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {shown.map((r, i) => {
            const isExpanded = expandedIdx === i;
            const changedCount = (r.changedFields || []).length;
            return (
              <div key={i} style={{ background: 'white', borderRadius: 4, border: `1px solid ${FR.sand}`, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  style={{ fontSize: 10, color: FR.stone, padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: changedCount > 0 ? 'pointer' : 'default' }}>
                  <span>
                    <strong style={{ color: FR.slate, fontFamily: 'ui-monospace,monospace', fontSize: 9 }}>v{r.version}</strong>
                    <span style={{ marginLeft: 6, color: FR.soil }}>{r.status}</span>
                    {r.triggeredBy === 'download' ? (
                      <span style={{ marginLeft: 6, padding: '1px 5px', background: FR.sand, borderRadius: 2, fontSize: 9, color: FR.stone }}>download</span>
                    ) : (
                      <span style={{ marginLeft: 6, padding: '1px 5px', background: '#f0ede6', borderRadius: 2, fontSize: 9, color: FR.stone }}>manual</span>
                    )}
                    {r.note ? <span style={{ marginLeft: 6, color: FR.stone }}>{r.note}</span> : null}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {changedCount > 0 && (
                      <span style={{ fontSize: 9, color: FR.soil }}>{changedCount} change{changedCount !== 1 ? 's' : ''} {isExpanded ? '▲' : '▼'}</span>
                    )}
                    <span style={{ color: FR.stone }}>{new Date(r.date).toLocaleDateString()}</span>
                  </span>
                </div>
                {isExpanded && changedCount > 0 && (
                  <div style={{ padding: '4px 8px 6px', borderTop: `1px solid ${FR.sand}`, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.changedFields.map(f => (
                      <span key={f} style={{ fontSize: 9, padding: '2px 6px', background: FR.sand, borderRadius: 2, color: FR.slate }}>{f}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {revisions.length > 5 && (
            <button onClick={() => setShowAll(!showAll)} style={{ fontSize: 10, color: FR.soil, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              {showAll ? 'Show less' : `Show all ${revisions.length} versions`}
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
  const { state } = useApp();
  // Initial step comes from the URL so refresh keeps you on the same wizard step.
  const [step, setStep] = useState(() => {
    const { packId, step } = parsePLMHash();
    if (packId === pack.id) return Math.min(step, STEPS.length - 1);
    // Default to Style Overview (cover) on open — designers expect to land
    // there, not on the pre-tech-pack Merchandising pages.
    const coverIdx = STEPS.findIndex(s => s.id === 'cover');
    return coverIdx >= 0 ? coverIdx : 0;
  });
  // Sub-page index within the Fabrics step. When the operator picks two or
  // three fabrics the sidebar surfaces virtual 03.1, 03.2 entries that share
  // step=fabricsIdx but flip the active fabric in the preview.
  const [fabricPageIdx, setFabricPageIdx] = useState(0);
  const [data, setData] = useState(pack.data || DEFAULT_DATA);
  const [images, setImages] = useState(pack.images || []);
  const [library, setLibrary] = useState(pack.library || DEFAULT_LIBRARY);
  // Call-out image annotations (red box/text). Single source of truth = the
  // LINKED Cut & Sew block, so they always match the library card and any other
  // Style on that block. Loaded by id; unlinked styles fall back to data.calloutAnnotations.
  const [blockAnnotations, setBlockAnnotations] = useState({});
  const [annoTarget, setAnnoTarget] = useState(null); // { slot, title } photo being annotated
  // Treatment library cache, keyed by id, for resolving fabric.treatment_id
  // selections into name/code/process on the live preview without forcing
  // PageTreatments to do async work mid-render.
  const [treatmentsById, setTreatmentsById] = useState({});
  const [embellishmentsById, setEmbellishmentsById] = useState({});
  // True once BOTH the treatment + embellishment libraries have loaded. The cost
  // roll-up waits on this (via costInputsReady) so it never persists a partial
  // total computed before these maps are populated. Monotonic — only flips true.
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listTreatments({ includeArchived: true }),
      listEmbellishments({ includeArchived: true }),
    ]).then(([trows, erows]) => {
      if (cancelled) return;
      const tmap = {};
      (trows || []).forEach(t => { if (t.id) tmap[t.id] = t; });
      setTreatmentsById(tmap);
      const emap = {};
      (erows || []).forEach(e => { if (e.id) emap[e.id] = e; });
      setEmbellishmentsById(emap);
      setLibrariesLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Resolve picked Component Pack rows for the BOM live preview pages —
  // covers, vendor, color, length, size all come from the library, not from
  // the pack's own data. Keyed by component pack id.
  const [componentsById, setComponentsById] = useState({});
  // Tracks the componentIdKey the resolver finished a pass for — feeds costInputsReady.
  const [componentsResolvedKey, setComponentsResolvedKey] = useState('');
  // Mirror of componentsById for the async resolver below, so it can reuse
  // already-resolved entries (and their signed image URLs) instead of
  // re-fetching + re-signing every image on every refresh tick.
  const componentsByIdRef = useRef({});
  useEffect(() => { componentsByIdRef.current = componentsById; }, [componentsById]);
  // Bumps every time the window regains focus or this tab becomes visible.
  // Library edits typically happen in another tab; when the user comes back
  // we want every BOM-side resolver to re-fetch so they see the new data.
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const bump = () => setRefreshTick(t => t + 1);
    const onFocus = () => bump();
    const onVis   = () => { if (!document.hidden) bump(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('plm-store-updated', bump);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('plm-store-updated', bump);
    };
  }, []);
  // Load the linked Cut & Sew block's annotations, and re-load on focus / any
  // cut_sew store update (refreshTick bumps for both) so a mark drawn in the
  // library card — or another Style on the same block — appears here live.
  useEffect(() => {
    const blockId = data.pickedCutSewBlockId;
    if (!blockId) { setBlockAnnotations({}); return undefined; }
    let cancelled = false;
    loadBlockAnnotations(blockId).then(map => { if (!cancelled) setBlockAnnotations(map || {}); });
    return () => { cancelled = true; };
  }, [data.pickedCutSewBlockId, refreshTick]);
  const componentIdKey = [
    ...(data.pickedTrims || []).map(p => p?.componentId || p?.id || ''),
    ...(data.pickedPackaging || []).map(p => p?.componentId || p?.id || ''),
  ].filter(Boolean).join('|');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = componentIdKey.split('|').filter(Boolean);
      if (!ids.length) {
        setComponentsById(prev => (Object.keys(prev).length ? {} : prev));
        setComponentsResolvedKey(k => (k === componentIdKey ? k : componentIdKey));
        return;
      }
      const { getComponentPack } = await import('../../utils/componentPackStore');
      const { getAssetUrl, invalidateAssetUrl } = await import('../../utils/plmAssets');
      const prev = componentsByIdRef.current || {};
      const next = {};
      let changed = false;
      // Resolve every picked component CONCURRENTLY. The old sequential for-loop
      // serialized getComponentPack + 3–4 signed-URL fetches per item, so a cold
      // URL cache made the whole BOM (trims + packaging) crawl in one at a time.
      // Unchanged packs are still reused untouched (no re-signing on refocus).
      await Promise.all(ids.map(async (id) => {
        const row = await getComponentPack(id);   // local-first → instant
        if (cancelled) return;
        if (!row) { if (prev[id]) changed = true; return; }
        const v = row.updated_at;
        // Reuse the already-resolved entry (including its signed image URLs)
        // when this pack hasn't changed since we last resolved it. This is what
        // stops images from re-loading every time the tab refocuses, a sync
        // fires, or you click around — and it breaks the refresh→re-resolve loop.
        const existing = prev[id];
        if (existing && existing._resolvedAt === v) { next[id] = existing; return; }
        changed = true;
        // Pack changed (or first load) — re-sign its images. invalidate forces a
        // fresh signed URL since a changed cover can reuse the same path.
        const stripQuery = (s) => (typeof s === 'string' ? s.split('?')[0] : s);
        const resolveCover = async (path) => {
          if (!path || typeof path !== 'string') return null;
          if (/^(https?:|data:|blob:)/.test(path)) return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(v || '')}`;
          try { invalidateAssetUrl?.(stripQuery(path)); } catch {}
          try {
            const url = await getAssetUrl(path);
            return url ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(v || '')}` : null;
          } catch { return null; }
        };
        const findImage = async (slot) => {
          const entry = (row.images || []).find(img => img.slot === slot);
          if (!entry) return null;
          if (entry.data?.startsWith?.('data:')) return entry.data;
          if (entry.path) return await resolveCover(entry.path);
          return null;
        };
        // Cover priority: construction-diagram → design-sketch → cover_image.
        // The three independent image lookups now run concurrently per item.
        const [top, nested, diagramUrl] = await Promise.all([
          resolveCover(row.cover_image),
          resolveCover(row?.data?.cover_image),
          (async () => (await findImage('construction-diagram')) || (await findImage('design-sketch')))(),
        ]);
        if (cancelled) return;
        next[id] = {
          ...row,
          cover_image: top || row.cover_image,
          data: { ...(row.data || {}), cover_image: nested || row?.data?.cover_image },
          _constructionDiagram: diagramUrl,
          _resolvedAt: v,
        };
      }));
      if (cancelled) return;
      // Only commit when something actually changed — an unchanged refresh tick
      // must not setState, or it re-triggers the plm-store-updated loop.
      if (changed || Object.keys(next).length !== Object.keys(prev).length) {
        componentsByIdRef.current = next;
        setComponentsById(next);
      }
      setComponentsResolvedKey(k => (k === componentIdKey ? k : componentIdKey));
    })();
    return () => { cancelled = true; };
  }, [componentIdKey, refreshTick]);

  // Same idea for picked fabrics — fabric library row + resolved cover.
  const [fabricsById, setFabricsById] = useState({});
  // Mirror so the resolver can reuse already-resolved entries (and their signed
  // cover URLs) instead of re-fetching + re-signing on every refresh tick — this
  // is what stops the fabric preview from re-showing "Loading fabric…" on focus.
  const fabricsByIdRef = useRef({});
  useEffect(() => { fabricsByIdRef.current = fabricsById; }, [fabricsById]);
  // Tracks the fabricIdKey the resolver finished a pass for — feeds costInputsReady.
  const [fabricsResolvedKey, setFabricsResolvedKey] = useState('');
  const fabricIdKey = (data.pickedFabrics || []).map(p => p?.fabricId || '').filter(Boolean).join('|');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = fabricIdKey.split('|').filter(Boolean);
      if (!ids.length) {
        setFabricsById(prev => (Object.keys(prev).length ? {} : prev));
        setFabricsResolvedKey(k => (k === fabricIdKey ? k : fabricIdKey));
        return;
      }
      const { getFabric } = await import('../../utils/fabricStore');
      const { getAssetUrl, invalidateAssetUrl } = await import('../../utils/plmAssets');
      const { getVendor } = await import('../../utils/vendorLibrary');
      const prev = fabricsByIdRef.current || {};
      const next = {};
      let changed = false;
      for (const id of ids) {
        const row = await getFabric(id);   // local-first → instant
        if (cancelled) return;
        if (!row) { if (prev[id]) changed = true; continue; }
        const v = row.updated_at;
        // Reuse the already-resolved entry (incl. its signed cover URL) when this
        // fabric hasn't changed since we last resolved it — no re-sign, no reload.
        const existing = prev[id];
        if (existing && existing._resolvedAt === v) { next[id] = existing; continue; }
        changed = true;
        // Match the Fabric library's priority (front_image_url first) so the
        // BOM card and live preview render the same swatch the library card shows.
        let cover = row.front_image_url || row.cover_image || null;
        if (cover && !/^(https?:|data:|blob:)/.test(cover)) {
          try { invalidateAssetUrl?.(cover); } catch {}
          cover = await getAssetUrl(cover).catch(() => null) || row.front_image_url || row.cover_image;
        }
        const tagged = cover ? `${cover}${cover.includes('?') ? '&' : '?'}v=${encodeURIComponent(v || '')}` : null;
        // Vendor contact lookup so the SVG card can show email / phone / contact.
        const vendor = row.mill_id ? getVendor(row.mill_id) : null;
        const finalUrl = tagged || cover || row.cover_image;
        next[id] = {
          ...row,
          cover_image:      finalUrl,
          front_image_url:  finalUrl,
          _vendorEmail:     vendor?.email || '',
          _vendorPhone:     vendor?.phone || '',
          _vendorContact:   vendor?.primary_contact || '',
          _resolvedAt:      v,
        };
      }
      if (cancelled) return;
      // Only commit when something actually changed — an unchanged refresh tick
      // must not setState (it would re-trigger the store-updated loop).
      if (changed || Object.keys(next).length !== Object.keys(prev).length) {
        fabricsByIdRef.current = next;
        setFabricsById(next);
      }
      setFabricsResolvedKey(k => (k === fabricIdKey ? k : fabricIdKey));
    })();
    return () => { cancelled = true; };
  }, [fabricIdKey, refreshTick]);

  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  // Single-writer locking removed (solo operator, two devices) — the editor is
  // always editable. `readOnly` is kept as a constant so the existing guards
  // (auto-save skip, fieldset) stay valid without restructuring the workflow.
  const readOnly = false;
  const [savedRecently, setSavedRecently] = useState(false);
  const savedTimerRef = useRef(null);
  const [saveError, setSaveError] = useState(null);
  // Manual-save layer state (additive). `dirty` reflects edits not yet confirmed
  // saved; dirtyRef mirrors it for synchronous reads in the unload / exit guards.
  // hydratedRef skips the first edit-tracking pass so opening a style is not
  // mis-read as "unsaved".
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const saveTimerRef = useRef(null);
  // Pack id can rotate when an upsert hits an unrecoverable RLS conflict
  // (existing cloud row owned by another org / NULL org). saveTechPack
  // returns { idChanged } and we move the live id here so subsequent
  // saves target the new row.
  const packIdRef = useRef(pack.id);

  // Mirror the ComponentPackBuilder pattern: track in-flight uploads so the
  // debounced save waits for them, instead of persisting placeholder rows
  // that have no Storage path yet.
  const pendingUploadsRef = useRef(0);
  const [pendingUploads, setPendingUploads] = useState(0);
  const bumpPending = useCallback((delta) => {
    pendingUploadsRef.current = Math.max(0, pendingUploadsRef.current + delta);
    setPendingUploads(pendingUploadsRef.current);
  }, []);
  const waitForUploads = useCallback(async (timeoutMs = 20000) => {
    if (pendingUploadsRef.current === 0) return true;
    const start = Date.now();
    while (pendingUploadsRef.current > 0) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise(r => setTimeout(r, 100));
    }
    return true;
  }, []);

  // Push step into URL on every change (replaceState — flicking through
  // 14 steps shouldn't pollute the back stack).
  useEffect(() => {
    replacePLMHash({ section: 'styles', packId: packIdRef.current, step });
  }, [step, pack.id]);

  // Browser back/forward → keep wizard step in sync with the URL
  useEffect(() => {
    const sync = () => {
      const { packId, step: urlStep } = parsePLMHash();
      if (packId === packIdRef.current && urlStep !== step) {
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

  // Derived: full unit-cost roll-up — picked fabrics + trims + packaging
  // + treatments + colorways + cut/sew labor. The garment's design-phase
  // cost is the entire reason this builder exists, so every line item the
  // designer adds rolls up into a phase pill in the sidebar and a total
  // unit cost in the header.
  const componentUnitCost = (full) => {
    if (!full) return 0;
    const tier = (full.data?.costTiers || [])[0];
    return parseFloat(tier?.unitCost) || parseFloat(full.cost_per_unit) || parseFloat(full.data?.targetUnitCost) || 0;
  };
  const fabricUnitCost = (row) => {
    if (!row) return 0;
    const d = row.data || row;
    const tier = (d?.costTiers || [])[0];
    const gsm = parseFloat(row.weight_gsm ?? d?.weight_gsm) || 0;
    const widthCm = parseFloat(row.width_cm ?? d?.width_cm) || 0;
    const kgUsd = parseFloat(row.price_per_kg_usd ?? d?.price_per_kg_usd) || 0;
    const fromKg = (kgUsd && gsm && widthCm) ? kgUsd * (gsm * widthCm / 100000) : 0;
    // fabricStore canonical: price_per_meter_usd. Older shapes covered too.
    return (
      parseFloat(row.price_per_meter_usd) ||
      parseFloat(d?.price_per_meter_usd) ||
      fromKg ||
      parseFloat(tier?.unitCost) ||
      parseFloat(row.cost_per_unit) ||
      parseFloat(d?.cost_per_unit) ||
      parseFloat(d?.costPerYard) ||
      parseFloat(d?.costPerMeter) || 0
    );
  };
  const parseQty = (q) => {
    if (q === null || q === undefined || q === '') return 1;
    const n = parseFloat(String(q).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const fabricsCost = (data.pickedFabrics || []).reduce((sum, p) => {
    const row = fabricsById[p?.fabricId];
    const d = row?.data || row;
    const gsm = parseFloat(row?.weight_gsm ?? d?.weight_gsm) || 0;
    const widthCm = parseFloat(row?.width_cm ?? d?.width_cm) || 0;
    const kpm = (gsm && widthCm) ? gsm * widthCm / 100000 : 0;

    // Per-style overrides take precedence over library cost
    const mOverride = parseFloat(p?.chosenPricePerMeterUsd);
    const kOverride = parseFloat(p?.chosenPricePerKgUsd);
    let baseCostPerMeter;
    if (Number.isFinite(mOverride) && p?.chosenPricePerMeterUsd != null) {
      baseCostPerMeter = mOverride;
    } else if (Number.isFinite(kOverride) && p?.chosenPricePerKgUsd != null && kpm) {
      baseCostPerMeter = kOverride * kpm;
    } else {
      baseCostPerMeter = fabricUnitCost(row);
    }

    // Finish costs: per-meter delta first, per-kg converted as fallback
    const finishes = p?.chosenFinishes ?? (d?.finishes || []);
    const finishCostPerMeter = (finishes || []).reduce((s, f) => {
      const fm = parseFloat(f?.delta_per_meter_usd);
      if (Number.isFinite(fm) && fm > 0) return s + fm;
      const fk = parseFloat(f?.delta_per_kg_usd);
      if (Number.isFinite(fk) && fk > 0 && kpm) return s + fk * kpm;
      return s;
    }, 0);

    const mpu = p?.metersPerUnit;
    const totalPerMeter = baseCostPerMeter + finishCostPerMeter;
    return sum + (mpu ? totalPerMeter * mpu : totalPerMeter);
  }, 0);
  const trimsCost = (data.pickedTrims || []).reduce((sum, p) => {
    const full = componentsById[p?.componentId || p?.id];
    return sum + componentUnitCost(full) * parseQty(p?.quantity);
  }, 0);
  const packagingCost = (data.pickedPackaging || []).reduce((sum, p) => {
    const full = componentsById[p?.componentId || p?.id];
    return sum + componentUnitCost(full) * parseQty(p?.quantity);
  }, 0);

  // Treatments cost: legacy BOM-fabric-linked treatments (data.fabrics[].treatment_id)
  // plus the per-row costs designers now enter on the Treatments tab — Wash
  // Types, Wash & Dye, Distressing & Finishes. When a row is linked to a
  // library atom (treatment_id set), the library's cost wins; otherwise the
  // row's free-typed cost_per_unit_usd wins. Same precedence we apply to
  // fabric finishes so a library edit propagates everywhere instantly.
  const rowTreatmentCost = (r) => {
    if (r?.treatment_id && treatmentsById[r.treatment_id]) {
      const t = treatmentsById[r.treatment_id];
      return parseFloat(t?.cost_per_unit_usd) || parseFloat(t?.target_cost) || parseFloat(t?.cost_per_unit) || 0;
    }
    return parseFloat(r?.cost_per_unit_usd) || 0;
  };
  const treatmentsCost = (() => {
    let sum = 0;
    (data.fabrics || []).forEach(f => {
      if (!f?.treatment_id) return;
      const t = treatmentsById[f.treatment_id];
      sum += parseFloat(t?.cost_per_unit_usd) || parseFloat(t?.target_cost) || parseFloat(t?.cost_per_unit) || 0;
    });
    (data.treatmentWashTypes || []).forEach(r => { sum += rowTreatmentCost(r); });
    (data.treatments || []).forEach(r => { sum += rowTreatmentCost(r); });
    (data.distressing || []).forEach(r => { sum += rowTreatmentCost(r); });
    return sum;
  })();

  // Embellishments cost: colorways (library-resolved) plus the per-row
  // artwork placement costs the designer enters on the Embellishments tab.
  // Linked rows pull from the embellishment library, free rows use their
  // own cost_per_unit_usd.
  const artworkRowCost = (r) => {
    if (r?.embellishment_id && embellishmentsById[r.embellishment_id]) {
      const e = embellishmentsById[r.embellishment_id];
      return parseFloat(e?.cost_per_unit_usd) || 0;
    }
    return parseFloat(r?.cost_per_unit_usd) || 0;
  };
  const artworkRowsCost = (data.artworkPlacements || []).reduce((s, r) => s + artworkRowCost(r), 0);

  const cutSewCost = parseFloat(data.cutSewLaborCost) || 0;

  const bomCost = computeBOMCost(data);  // legacy free-text BOM, kept for old packs
  const colorwayCost = computeColorwayCost(data, getFRColorCost);
  const embellishmentsCost = colorwayCost + artworkRowsCost;
  const billOfMaterialsCost = fabricsCost + trimsCost + packagingCost + bomCost;
  const preMarkupCost = billOfMaterialsCost + embellishmentsCost + treatmentsCost + cutSewCost;

  // Vendor markup: a flat % the named factory tacks on top of landed unit
  // cost. Lives on the vendor entry so every pack that names this vendor
  // inherits the same rate. Surfaces as its own line item in the header
  // so the operator sees where the bump comes from. We track whether
  // the named vendor has a library record so the UI can hint "set markup
  // on vendor record" when the lookup falls through to directory-only.
  const vendorRecord = data.vendor ? getVendor(data.vendor) : null;
  const vendorMarkupPct = (() => {
    const n = parseFloat(vendorRecord?.markupPct);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const vendorMarkupCost = preMarkupCost * (vendorMarkupPct / 100);
  const totalUnitCost = preMarkupCost + vendorMarkupCost;
  // Show the persisted (settled) figure so the header reads the known cost
  // instantly on open and never visibly climbs from $0 while the fabric / trim /
  // treatment libraries resolve — and so it matches the grid card (both read
  // data.totalUnitCost). New styles with nothing saved fall back to the live
  // figure (climbing as you add items is expected there).
  const savedUnitCost = parseFloat(data.totalUnitCost);
  const displayUnitCost = (Number.isFinite(savedUnitCost) && savedUnitCost > 0) ? savedUnitCost : totalUnitCost;
  // The async library maps (fabrics, trims/packaging, treatments, embellishments)
  // fill in over a few ticks; until they're all resolved, `totalUnitCost` is a
  // PARTIAL sum that climbs. Gate the persist below on this so we only ever write
  // the fully-resolved figure into data.totalUnitCost (the field both the builder
  // header and the grid card read) — no more climbing / card-vs-builder mismatch.
  // Key-equality (not map-has-every-id) avoids a deadlock when a picked id is
  // genuinely missing; empty packs are ready immediately ('' === '').
  const costInputsReady =
    librariesLoaded &&
    fabricsResolvedKey === fabricIdKey &&
    componentsResolvedKey === componentIdKey;

  // Per-phase cost subtotals shown as pills in the sidebar phase headers.
  const phaseCosts = {
    'Bill of Materials': billOfMaterialsCost,
    'Cut & Sew': cutSewCost,
    'Embellishments': embellishmentsCost,
    'Treatments': treatmentsCost,
  };
  const targetFOB = parseFloat(data.targetFOB) || 0;
  const costVariance = targetFOB > 0 ? totalUnitCost - targetFOB : 0;

  // Maximum FOB: targetRetail × (COGS% + Fulfillment%) − fulfillmentCost + shippingCharge − seaFreightSpot
  // COGS% + Fulfillment% pulled from the 13-week cashflow assumptions on the Cash tab.
  // fulfillmentCost (per-unit) already includes pickPack + weight-tier rate + packaging materials.
  const a = state.assumptions || {};
  const cogsRate = parseFloat(a.cogsRate ?? 0.27);
  const fulfillmentPercent = parseFloat(a.fulfillmentPercent ?? 0.10);
  const packAssumptions = data.assumptions || {};
  const seaFreightSpot = parseFloat(packAssumptions.seaFreightSpot ?? 4);
  const shippingCharge = parseFloat(packAssumptions.shippingCharge ?? 0);
  const fulfillmentUnitCost = (() => {
    const w = parseFloat(data.weightKg);
    const rc = state.rateCard;
    if (!w || !rc) return 0;
    const lbs = w * 2.20462;
    const tier = (rc.weightTiers || []).find(t => lbs >= t.minLbs && lbs < t.maxLbs)
      || (rc.weightTiers || []).slice(-1)[0];
    return (rc.pickPack || 0) + (tier ? (tier.rate || 0) : 0) + (rc.packagingMaterials || 0);
  })();
  const targetRetail = parseFloat(data.targetRetail) || 0;
  const productWeightKg = parseFloat(data.weightKg ?? data.shippingWeightKg ?? 0) || 0;
  const seaFreightCost = seaFreightSpot * productWeightKg;
  const maxFOB = targetRetail > 0
    ? targetRetail * (cogsRate + fulfillmentPercent) - fulfillmentUnitCost + shippingCharge - seaFreightCost
    : 0;
  const fobDelta = maxFOB > 0 ? displayUnitCost - maxFOB : null;

  // Mirror computed maxFOB into data so the SVG preview can render it without
  // re-pulling AppContext. Debounced + skip-if-matching like totalUnitCost so we
  // persist the settled value (not partials while cashflow assumptions resolve)
  // and don't bump updated_at just from opening a style.
  useEffect(() => {
    const next = maxFOB > 0 ? Number(maxFOB.toFixed(2)) : 0;
    if (next <= 0) return undefined;
    const persisted = parseFloat(data.maxFOB);
    if (Number.isFinite(persisted) && Math.abs(next - persisted) < 0.005) return undefined;
    const t = setTimeout(() => {
      setData(p => {
        const cur = parseFloat(p.maxFOB);
        if (Number.isFinite(cur) && Math.abs(next - cur) < 0.005) return p;
        return { ...p, maxFOB: next };
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [maxFOB, data.maxFOB]);

  // Mirror the fully-computed totalUnitCost into data.totalUnitCost so the grid
  // cards (which can't resolve async fabric/trim/treatment library specs) read a
  // stable, accurate figure. CRITICAL: debounce so we persist the SETTLED value,
  // not the partial values that appear while those libraries resolve on open —
  // persisting intermediates was why card prices changed on every reload and
  // didn't match the builder. Skip when the stored value already matches so
  // merely opening a style doesn't bump updated_at / churn sync.
  useEffect(() => {
    if (!costInputsReady) return undefined; // never persist a partial/climbing value
    const next = totalUnitCost > 0 ? Number(totalUnitCost.toFixed(2)) : 0;
    if (next <= 0) return undefined;
    const persisted = parseFloat(data.totalUnitCost);
    if (Number.isFinite(persisted) && Math.abs(next - persisted) < 0.005) return undefined;
    const t = setTimeout(() => {
      setData(p => {
        const cur = parseFloat(p.totalUnitCost);
        if (Number.isFinite(cur) && Math.abs(next - cur) < 0.005) return p;
        return { ...p, totalUnitCost: next };
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [costInputsReady, totalUnitCost, data.totalUnitCost]);
  const fobDeltaColor = fobDelta === null ? FR.stone
    : fobDelta <= 0 ? '#3B6D11'
    : fobDelta / maxFOB <= 0.10 ? '#854F0B'
    : '#A32D2D';

  // ── Manual-save layer (additive; the debounced auto-save below stays the
  // backstop). Mark dirty on real edits. Skip the first effect pass so opening
  // a style — which hydrates data/images/library asynchronously — doesn't read
  // as "unsaved".
  useEffect(() => {
    if (!hydratedRef.current) { hydratedRef.current = true; return undefined; }
    dirtyRef.current = true;
    setDirty(true);
    return undefined;
  }, [data, images, library]);

  // Single persistence path shared by the debounced auto-save AND the manual
  // Save button / ⌘S / exit guard. Waits for in-flight Storage uploads first so
  // we never persist a placeholder image entry without a path. Returns true when
  // the work is safely persisted (cloud-saved, or saved locally + queued to the
  // durable outbox); false only on a genuine failure.
  const persistNow = useCallback(async () => {
    if (readOnly) return true; // a read-only viewer never persists edits
    setSaving(true);
    const uploadsSettled = await waitForUploads();
    if (!uploadsSettled) {
      setSaveError('Image upload still pending — try again in a moment');
      setSaving(false);
      return false;
    }
    try {
      const result = await saveTechPack(packIdRef.current, {
        data, images, library,
        style_name: data.styleNumber || data.styleName || '',
        product_category: data.productCategory || '',
        status: data.status || 'Design',
        completion_pct: computeCompletion(data),
      });
      if (result && result.ok === false) {
        // A queued result means the LOCAL save succeeded and the cloud copy is
        // safely parked in the durable outbox (the global Sync badge shows the
        // pending state). That is NOT a failure — don't raise the red "Save
        // failed" alarm for it; only surface genuine, non-queued errors.
        setSaveError(result.queued ? null : (result.error?.message || 'Cloud save failed'));
        if (result.queued) { dirtyRef.current = false; setDirty(false); }
        setTimeout(() => setSaving(false), 300);
        return !!result.queued;
      }
      if (result && result.idChanged) {
        packIdRef.current = result.idChanged.to;
        replacePLMHash({ section: 'styles', packId: packIdRef.current, step });
      }
      setSaveError(null);
      dirtyRef.current = false; setDirty(false);
      setSavedRecently(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedRecently(false), 2000);
      setTimeout(() => setSaving(false), 300);
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      setSaveError(err?.message || String(err));
      setTimeout(() => setSaving(false), 300);
      return false;
    }
  }, [data, images, library, waitForUploads, readOnly]);

  // Save immediately, cancelling any pending debounce so we never double-save.
  const saveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    return persistNow();
  }, [persistNow]);

  // Debounced auto-save — unchanged 600ms cadence, now routed through persistNow
  // so the manual Save button and auto-save share one persistence path.
  useEffect(() => {
    if (readOnly) return undefined; // a read-only viewer never persists edits
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { persistNow(); }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [persistNow, readOnly]);

  // ⌘S / Ctrl-S → save now.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

  // Warn before tab close / refresh when the latest edits aren't safely persisted.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirtyRef.current || saveError) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveError]);

  // Exit guard: flush a save before leaving the builder. Only interrupt the user
  // with a confirm if that save genuinely failed (work kept on this device but
  // not yet in the cloud).
  const handleBack = useCallback(async () => {
    if (dirtyRef.current || saving) {
      const ok = await saveNow();
      if (!ok) {
        const leave = window.confirm(
          'Your most recent changes could not be saved to the cloud yet (they are kept on this device). Leave this style anyway?'
        );
        if (!leave) return;
      }
    }
    onBack();
  }, [saveNow, saving, onBack]);

  // ── Undo / redo ────────────────────────────────────────────────────────────
  // Every user edit on the pages flows through set() below, so we snapshot the
  // prior `data` there. Cmd/Ctrl+Z steps back; Cmd/Ctrl+Shift+Z (or Ctrl+Y)
  // steps forward. Purely additive — saving and all other state are unchanged.
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const historyRef = useRef({ past: [], future: [] });
  const recordHistory = useCallback(() => {
    const h = historyRef.current;
    h.past.push(dataRef.current);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
  }, []);
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length) return;
    h.future.push(dataRef.current);
    setData(h.past.pop());
  }, []);
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    h.past.push(dataRef.current);
    setData(h.future.pop());
  }, []);

  const set = useCallback((k, v) => { recordHistory(); setData(p => ({ ...p, [k]: v })); }, [recordHistory]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return; // leave native text undo alone
      if (annoTarget) return; // the photo annotator owns the key while it's open
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, annoTarget]);

  // Async upload: insert a transient blob: placeholder so the slot renders
  // immediately, upload to Storage in the background, then atomically
  // replace the placeholder with the persisted ref. Failures mark the
  // entry with _uploadError so the user can see/retry.
  const handleImgUpload = useCallback(async (slot, b64, name) => {
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const blob = dataUrlToBlob(b64);
    if (!blob) {
      setImages(p => [...p, { slot, data: b64, name }]);
      return;
    }
    const blobUrl = URL.createObjectURL(blob);
    setImages(p => [...p, { slot, name, _tempId: tempId, _blobUrl: blobUrl, _blob: blob, _uploading: true }]);
    bumpPending(+1);
    try {
      const ref = await uploadAsset({
        scope: 'tech-packs',
        ownerId: pack.id,
        slot,
        blob,
        skipCompress: false, // canonical compression at upload layer (2400 / WebP 0.92)
      });
      setImages(p => p.map(img => {
        if (img && img._tempId === tempId) {
          if (img._blobUrl) URL.revokeObjectURL(img._blobUrl);
          return { ...ref, name: img.name };
        }
        return img;
      }));
    } catch (err) {
      console.error('handleImgUpload (techpack):', err);
      setImages(p => p.map(img => (
        img && img._tempId === tempId
          ? { ...img, _uploading: false, _uploadError: err?.message || String(err) }
          : img
      )));
      setSaveError(err?.message || 'Image upload failed');
    } finally {
      bumpPending(-1);
    }
  }, [pack.id, bumpPending]);

  const handleImgRemove = useCallback((slot, idx) => {
    setImages(p => {
      let c = 0;
      return p.filter(img => {
        if (img.slot === slot) {
          if (c === idx) {
            c++;
            if (img._blobUrl) URL.revokeObjectURL(img._blobUrl);
            return false;
          }
          c++;
        }
        return true;
      });
    });
  }, []);

  // Seed images from a library atom (e.g. Cut & Sew block). Only injects
  // entries for slots that are currently empty — never overwrites user uploads.
  const handleSeedImages = useCallback((imageMap) => {
    setImages(prev => {
      const next = [...(prev || [])];
      for (const [slot, pathOrUrl] of Object.entries(imageMap || {})) {
        if (!pathOrUrl) continue;
        const alreadyHas = next.some(img => img && img.slot === slot);
        if (alreadyHas) continue;
        if (/^(data:|blob:|https?:)/i.test(pathOrUrl)) {
          next.push({ slot, data: pathOrUrl, name: 'from-library' });
        } else {
          next.push({ slot, path: pathOrUrl, name: 'from-library' });
        }
      }
      return next;
    });
  }, []);

  // Lazy migration of legacy base64 image entries → Supabase Storage.
  // Runs once per pack mount; user can keep editing while it works in the
  // background. AssetImage renders both shapes so nothing flickers.
  const migratedRef = useRef(false);
  // One-shot ghost cleanup — see ComponentPackBuilder for the full
  // rationale. Failed uploads (e.g. the JWT-template misconfiguration)
  // poisoned existing rows with sourceless { slot, name } entries that
  // would otherwise lock slots into a blank state forever. Scrubbing on
  // mount + marking dirty makes the next save remove them from cloud.
  const ghostCleanedRef = useRef(false);
  useEffect(() => {
    if (ghostCleanedRef.current) return;
    const initial = pack.images || [];
    const ghostCount = initial.filter(isGhostImage).length;
    if (ghostCount === 0) { ghostCleanedRef.current = true; return; }
    ghostCleanedRef.current = true;
    setImages(prev => (prev || []).filter(img => !isGhostImage(img)));
    setIsDirty(true);
    setSaved(false);
  }, [pack.id, pack.images]);
  useEffect(() => {
    if (migratedRef.current) return;
    const initialImages = pack.images || [];
    const legacyEntries = initialImages
      .map((img, i) => ({ img, i }))
      .filter(({ img }) => img && isLegacyDataUrl(img.data) && !img.path);
    if (legacyEntries.length === 0) {
      migratedRef.current = true;
      return;
    }
    let cancelled = false;
    migratedRef.current = true;
    (async () => {
      // Capture each legacy entry by object reference; replacement uses
      // reference equality on the live state so concurrent user edits
      // can't shift the migration onto the wrong slot.
      const uploads = await Promise.allSettled(legacyEntries.map(async ({ img, i }) => {
        const blob = dataUrlToBlob(img.data);
        if (!blob) return { entry: img, ref: null };
        const ref = await uploadAsset({
          scope: 'tech-packs',
          ownerId: pack.id,
          slot: img.slot || `legacy-${i}`,
          blob,
          skipCompress: false,
        });
        return { entry: img, ref };
      }));
      if (cancelled) return;
      const replacements = new Map(); // legacy entry object → upload ref
      for (const r of uploads) {
        if (r.status === 'fulfilled' && r.value?.ref) {
          replacements.set(r.value.entry, r.value.ref);
        }
      }
      if (replacements.size === 0) return;
      setImages(prev => prev.map(img => {
        const ref = replacements.get(img);
        return ref ? { ...ref, name: img.name } : img;
      }));
    })();
    return () => { cancelled = true; };
  }, [pack.id, pack.images]);
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
  const buildSnapshot = useCallback((currentData, triggeredBy = 'manual', noteOverride = undefined) => {
    const revisions = currentData.revisions || [];
    const version = revisions.length + 1;
    const note = noteOverride !== undefined ? noteOverride
      : (prompt(`Snapshot v${version} note (optional):`) || '');
    const prevSnapshot = revisions.length > 0 ? revisions[revisions.length - 1].dataSnapshot : null;
    const changedFields = prevSnapshot ? computePackDiff(prevSnapshot, currentData) : [];
    return {
      rev: `V${version}.0`,
      date: new Date().toISOString().slice(0, 10),
      changedBy: '',
      section: '',
      description: note || `${triggeredBy === 'download' ? 'Downloaded' : 'Snapshot'} at ${currentData.status || 'Design'}`,
      approvedBy: '',
      version,
      status: currentData.status,
      note,
      triggeredBy,
      changedFields,
      dataSnapshot: JSON.parse(JSON.stringify(currentData)),
    };
  }, []);

  const createRevision = useCallback(() => {
    const snapshot = buildSnapshot(data, 'manual');
    setData(p => ({ ...p, revisions: [...(p.revisions || []), snapshot] }));
  }, [data, buildSnapshot]);

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
      // Auto-snapshot on every download — no prompt, triggered automatically
      const snapshot = buildSnapshot(data, 'download', '');
      const updatedData = { ...data, revisions: [...(data.revisions || []), snapshot] };
      setData(updatedData);

      const version = snapshot.version;
      const filename = sanitizeFilename(data.styleNumber || data.styleName || 'techpack');
      const fullPack = { ...pack, data: updatedData, images, library };
      const pdfBlob = await generateTechPackPDF(fullPack);
      downloadBlob(pdfBlob, `${filename}_v${version}.pdf`);
      const svgString = await generateTechPackSVGAsync(fullPack);
      downloadBlob(svgToBlob(svgString), `${filename}_v${version}.svg`);
      const finalSave = await saveTechPack(packIdRef.current, {
        data: updatedData, images, library,
        style_name: updatedData.styleNumber || updatedData.styleName || '',
        product_category: updatedData.productCategory || '',
        status: updatedData.status || 'Design',
        completion_pct: computeCompletion(updatedData),
      });
      if (finalSave && finalSave.idChanged) {
        packIdRef.current = finalSave.idChanged.to;
        replacePLMHash({ section: 'styles', packId: packIdRef.current, step });
      }
      setSubmitResult({ filename });
    } catch (err) {
      console.error('Generate failed:', err);
      setSubmitResult({ error: err.message || String(err) });
    }
    setSubmitting(false);
  }, [pack, data, images, library, buildSnapshot]);

  const Comp = STEP_FNS[step];
  const skippedSteps = data.skippedSteps || [];
  const isCurrentSkipped = skippedSteps.includes(step);
  const libCount = (library.bom || []).length + (library.trims || []).length;
  // Resolved view for the SVG live preview — path-only entries get a
  // signed URL so <image href> renders. Legacy/blob entries pass through.
  const previewImages = useResolvedImageEntries(images);
  const pickedBlockId = data.pickedCutSewBlockId || null;
  // Single source of truth = the linked block; unlinked styles fall back to their own data.
  const effectiveAnnotations = pickedBlockId ? blockAnnotations : (data.calloutAnnotations || {});
  const openAnnotate = (slot, title) => setAnnoTarget({ slot, title });
  const onAnnotationsChange = (slot, next) => {
    if (pickedBlockId) saveBlockSlotAnnotations(pickedBlockId, slot, next).then(map => setBlockAnnotations(map)).catch(() => {});
    else set('calloutAnnotations', withSlotAnnotations(data.calloutAnnotations, slot, next));
  };
  // Lock state for the CURRENT step, computed off the real STEPS index so the
  // editor lock always agrees with the sidebar padlock. `stepOverridden` = the
  // step would be locked by status but the operator chose "edit anyway".
  const naturalLocked = isStepLocked(step, data.status);
  const stepOverridden = naturalLocked && !!(data.lockOverrides && data.lockOverrides[step]);
  const stepLocked = naturalLocked && !stepOverridden;
  const toggleLockOverride = () => set('lockOverrides', { ...(data.lockOverrides || {}), [step]: !(data.lockOverrides && data.lockOverrides[step]) });
  const stepProps = {
    data, set, images, onUpload: handleImgUpload, onRemove: handleImgRemove,
    onSeedImages: handleSeedImages,
    annotations: effectiveAnnotations, onAnnotate: openAnnotate,
    library, saveToLibrary,
    onSubmit: handleSubmit, submitting, submitResult,
    bomCost, costVariance,
    existingSuppliers,
    onCreateRevision: createRevision,
    packId: pack.id,
    stepLocked, stepOverridden, toggleLockOverride,
  };

  return (
    <div style={{ background: FR.salt, fontFamily: "'Helvetica Neue','Inter',sans-serif", borderRadius: 8, overflow: 'hidden', border: `1px solid ${FR.sand}` }}>
      <VersionHistoryPanel
        table="tech_packs"
        id={packIdRef.current}
        open={showVersions}
        onClose={() => setShowVersions(false)}
        onRestore={(v) => { if (v?.data) setData(v.data); if (v && 'images' in v) setImages(v.images || []); }}
      />
      {/* Header */}
      <div style={{ background: FR.slate, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleBack}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: FR.salt, padding: '5px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> Back
          </button>
          <button onClick={() => setShowVersions(true)} title="Browse and restore past saved versions of this style"
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: FR.salt, padding: '5px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <History size={12} /> Restore points
          </button>
          <div>
            <div style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              color: FR.salt,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}>
              FOREIGN RESOURCE
              {data.parentStyleName && (
                <span style={{ fontFamily: "'General Sans', 'Inter', sans-serif", letterSpacing: 0, marginLeft: 8, fontWeight: 400, fontSize: 10, color: FR.stone }}>
                  variant of {data.parentStyleName}
                </span>
              )}
            </div>
            <div style={{
              fontFamily: "'General Sans', 'Inter', 'Helvetica Neue', sans-serif",
              color: FR.salt,
              fontSize: 14,
              marginTop: 2,
              letterSpacing: 0.2,
            }}>
              {data.styleNumber || data.styleName || 'New Tech Pack'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <SendToVendorButton vendorName={data.vendor || ''} styleId={pack.id} variant="header" />
          <button
            onClick={saveNow}
            disabled={saving || (!dirty && !saveError)}
            title="Save now (⌘S / Ctrl-S)"
            style={{
              background: (dirty || saveError) ? FR.salt : 'rgba(255,255,255,0.1)',
              color: (dirty || saveError) ? FR.slate : FR.stone,
              border: 'none', padding: '5px 12px', borderRadius: 3, fontSize: 10, fontWeight: 600,
              letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4,
              cursor: (saving || (!dirty && !saveError)) ? 'default' : 'pointer',
              opacity: (saving || (!dirty && !saveError)) ? 0.55 : 1,
            }}>
            <Save size={12} /> Save
          </button>
          {pendingUploads > 0
            ? <span style={{ fontSize: 10, color: FR.soil }}>Uploading {pendingUploads} image{pendingUploads === 1 ? '' : 's'}…</span>
            : saving
              ? <span style={{ fontSize: 10, color: FR.stone, fontStyle: 'italic' }}>Saving…</span>
              : saveError
                ? <span title={saveError} style={{ fontSize: 10, color: '#A32D2D', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚠︎ Save failed (kept locally): {saveError}</span>
                : dirty
                  ? <span style={{ fontSize: 10, color: '#E0B45E', fontWeight: 600 }}>● Unsaved changes</span>
                  : savedRecently
                    ? <span style={{ fontSize: 10, color: '#a8d5a2', fontWeight: 600 }}>✓ Saved</span>
                    : <span style={{ fontSize: 10, color: '#a8d5a2', fontWeight: 600 }}>✓ All changes saved</span>}
          {/* Cost roll-up — BOM + colorway (wash/dye) + vendor markup. */}
          <div style={{ textAlign: 'right' }} title={`BOM ${formatCost(bomCost)}  ·  Colorways ${formatCost(colorwayCost)}${vendorMarkupPct > 0 ? `  ·  Vendor +${vendorMarkupPct}% ${formatCost(vendorMarkupCost)}` : ''}${maxFOB > 0 ? `  ·  Max FOB ${formatCost(maxFOB)}` : ''}`}>
            <div style={{ fontSize: 9, color: FR.stone }}>Total Unit Cost</div>
            <div style={{ fontSize: 13, color: displayUnitCost > 0 ? FR.salt : FR.stone, fontWeight: 600 }}>
              {formatCost(displayUnitCost)}
            </div>
            {data.vendor && (
              vendorMarkupPct > 0 ? (
                <div style={{ fontSize: 9, color: FR.sand, marginTop: 1, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}
                  title={`Markup on ${data.vendor} (${vendorRecord?._hasRecord ? 'library record' : 'directory-only'})`}>
                  incl. {data.vendor} +{vendorMarkupPct}% · {formatCost(vendorMarkupCost)}
                </div>
              ) : (
                <div style={{ fontSize: 9, color: FR.stone, marginTop: 1, fontStyle: 'italic' }}
                  title={`No markup % set on ${data.vendor}. Open PLM → Library → Vendors → ${data.vendor} and fill in "Factory Markup (%)".`}>
                  {data.vendor} markup not set
                </div>
              )
            )}
            {fobDelta !== null && (
              <div style={{ fontSize: 9, color: fobDeltaColor, fontWeight: 600, marginTop: 1 }}>
                {fobDelta > 0 ? '+' : ''}{fobDelta.toFixed(2)} vs max FOB
              </div>
            )}
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
          <div style={{ padding: '8px 0', flex: 1, overflowY: 'auto' }}>
            {STEPS.map((s, i) => {
              const stepLocked = isStepLocked(i, data.status, data.lockOverrides);
              const stepSkipped = skippedSteps.includes(i);
              const phaseChanged = i === 0 || STEPS[i - 1].phase !== s.phase;
              return (
                <div key={s.id}>
                  {phaseChanged && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: i === 0 ? '10px 16px 6px' : '14px 16px 6px', borderTop: i === 0 ? 'none' : `1px solid ${FR.sand}`, marginTop: i === 0 ? 0 : 6 }}>
                      <span style={{ fontSize: 8, color: FR.soil, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{s.phase}</span>
                      {phaseCosts[s.phase] > 0 && (
                        <span style={{ fontSize: 9, color: FR.soil, background: FR.sand, borderRadius: 4, padding: '2px 6px', fontWeight: 600, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}>
                          {formatCost(phaseCosts[s.phase])}
                        </span>
                      )}
                    </div>
                  )}
                  <button onClick={() => { setStep(i); setFabricPageIdx(0); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 16px', border: 'none', cursor: 'pointer', background: i === step && fabricPageIdx === 0 ? FR.white : 'transparent', borderLeft: i === step && fabricPageIdx === 0 ? `3px solid ${FR.soil}` : '3px solid transparent' }}>
                    <span style={{ fontSize: 10, color: stepSkipped ? '#C0392B' : (i === step && fabricPageIdx === 0 ? FR.soil : FR.stone), fontWeight: 700, width: 18, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {stepSkipped ? '×' : s.icon}
                    </span>
                    <span style={{ fontSize: 11, color: i === step && fabricPageIdx === 0 ? FR.slate : FR.stone, textAlign: 'left', flex: 1, textDecoration: stepSkipped ? 'line-through' : 'none', opacity: stepSkipped ? 0.55 : (stepLocked ? 0.5 : 1) }}>
                      {s.title}
                    </span>
                    {stepLocked && !stepSkipped && <span style={{ fontSize: 10, color: FR.stone }}>🔒</span>}
                  </button>
                  {/* Sub-pages for the Fabrics step — one extra row per
                      additional picked fabric so each gets its own preview. */}
                  {s.id === 'fabrics' && (data.pickedFabrics || []).filter(p => p?.fabricId).length > 1 && (
                    (data.pickedFabrics || []).filter(p => p?.fabricId).slice(1).map((_, j) => {
                      const subIdx = j + 1;
                      const active = i === step && fabricPageIdx === subIdx;
                      return (
                        <button key={`fab-sub-${subIdx}`}
                          onClick={() => { setStep(i); setFabricPageIdx(subIdx); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '6px 16px 6px 28px', border: 'none', cursor: 'pointer', background: active ? FR.white : 'transparent', borderLeft: active ? `3px solid ${FR.soil}` : '3px solid transparent' }}>
                          <span style={{ fontSize: 10, color: active ? FR.soil : FR.stone, fontWeight: 700, width: 26, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}>
                            {`${s.icon}.${subIdx}`}
                          </span>
                          <span style={{ fontSize: 11, color: active ? FR.slate : FR.stone, textAlign: 'left', flex: 1 }}>
                            {s.title}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
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
          <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
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
          </fieldset>

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
          <TechPackPagePreview data={{ ...data, calloutAnnotations: effectiveAnnotations }} images={previewImages} step={step} skippedSteps={skippedSteps} treatmentsById={treatmentsById} componentsById={componentsById} fabricsById={fabricsById} fabricPageIdx={fabricPageIdx} />
        </div>
      </div>

      {annoTarget && (
        <ImageAnnotator
          image={images.find(i => i.slot === annoTarget.slot)}
          annos={slotAnnotations(effectiveAnnotations, annoTarget.slot)}
          onChange={next => onAnnotationsChange(annoTarget.slot, next)}
          onClose={() => setAnnoTarget(null)}
          title={annoTarget.title || describeSlot(annoTarget.slot).title}
          aspect={describeSlot(annoTarget.slot).aspect}
          fit={describeSlot(annoTarget.slot).fit}
        />
      )}
    </div>
  );
}
