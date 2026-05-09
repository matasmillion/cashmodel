// Bill of Materials phase — three pages: Fabrics, Trims, Packaging.
// Library-first: components must exist in the PLM library before they can
// be picked here. No free-text adding. The actual specs (composition,
// vendor, color, length, etc.) live on the library row — this file just
// holds thin references and renders the picker UI.

import React, { useEffect, useState } from 'react';
import { FR, GARMENT_YIELDS } from './techPackConstants';
import { SectionTitle, AssetImage } from './TechPackPrimitives';
import { listFabrics } from '../../utils/fabricStore';
import { listComponentPacks, getComponentPack } from '../../utils/componentPackStore';
import { getAssetUrl } from '../../utils/plmAssets';
import { FABRIC_GARMENT_AREAS, MILL_FINISH_CATALOG, FINISH_EXECUTED_AT } from '../../utils/fabricLibrary';

// Cover images in fabric / component pack rows are stored as Supabase
// Storage paths, not URLs. The browser can't render them directly — we
// need to swap them for short-lived signed URLs first. Already-resolved
// HTTP URLs and data URIs pass through unchanged.
//
// The optional `version` (typically the row's updated_at) is appended as
// `?v=…` so the browser's HTTP cache busts whenever the underlying row
// changes — this is what stops stale cover images sticking around after
// the user updates a fabric / component in the library.
// Returns a counter that bumps every time the window regains focus or
// this tab becomes visible. Use it as a useEffect dep to force a
// re-fetch when the user comes back from editing the library in another
// tab — without it, the picker keeps showing yesterday's data.
function useFocusRefresh() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setTick(t => t + 1);
    const onVis   = () => { if (!document.hidden) setTick(t => t + 1); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return tick;
}

async function resolveCoverPath(value, version) {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  const tag = version ? `v=${encodeURIComponent(version)}` : '';
  const append = (url) => {
    if (!tag) return url;
    return url + (url.includes('?') ? '&' : '?') + tag;
  };
  if (value.startsWith('http') || value.startsWith('data:') || value.startsWith('blob:')) return append(value);
  try {
    const url = await getAssetUrl(value);
    return url ? append(url) : null;
  } catch { return null; }
}

const labelStyle = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' };

// ─── Reusable picker modal ──────────────────────────────────────────────────
// Generic picker that lists items from the library. The caller supplies
// `fetchItems` (async fn returning rows), `renderItem` (per-row tile), and
// `getId` (key extractor). Modal closes on select.
function LibraryPickerModal({ title, subtitle, fetchItems, renderItem, getId, onSelect, onClose }) {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = (await fetchItems()) || [];
      // Resolve every cover_image into a versioned signed URL — the
      // ?v=updated_at cache buster keeps the browser from showing
      // yesterday's image after the row was edited in the library.
      const resolved = await Promise.all(rows.map(async r => {
        const url = await resolveCoverPath(r?.cover_image, r?.updated_at);
        return url && url !== r.cover_image ? { ...r, cover_image: url } : r;
      }));
      if (!cancelled) setItems(resolved);
    })();
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (items || []).filter(it => {
    if (!q) return true;
    return JSON.stringify(it).toLowerCase().includes(q);
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: FR.salt, borderRadius: 8, padding: 22, width: 880, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', border: `0.5px solid rgba(58,58,58,0.15)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: FR.slate }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: FR.stone, lineHeight: 1 }}>×</button>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the library…"
          autoFocus
          style={{ width: '100%', padding: '8px 12px', border: `0.5px solid ${FR.sand}`, borderRadius: 4, fontSize: 12, marginBottom: 16, boxSizing: 'border-box', background: FR.white, color: FR.slate, outline: 'none' }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {items === null && <div style={{ padding: 24, textAlign: 'center', color: FR.stone, fontSize: 12 }}>Loading…</div>}
          {items !== null && filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: FR.stone, fontSize: 12, fontStyle: 'italic' }}>
              No matches. Create a new component in the Library first.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {filtered.map(item => (
              <button
                key={getId(item)}
                onClick={() => onSelect(item)}
                style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6, padding: 0, cursor: 'pointer', overflow: 'hidden', textAlign: 'left', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = FR.soil; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = FR.sand; }}
              >
                {renderItem(item)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Area-of-product picker shown immediately after a fabric is selected.
// Defaults to the fabric's library default; user can override per-style.
// Picking an area moves the flow on to the color picker (or commits if
// the fabric has no color cards).
function FabricAreaPickerModal({ fabric, defaultArea, onSelect, onClose }) {
  const [area, setArea] = useState(defaultArea || fabric?.default_garment_area || 'Body');
  const areas = FABRIC_GARMENT_AREAS;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: FR.salt, borderRadius: 8, padding: 22, width: 560, maxWidth: '94vw', border: `0.5px solid rgba(58,58,58,0.15)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: FR.slate }}>Where on the garment?</div>
            <div style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>
              {fabric?.name || fabric?.mill_fabric_no || 'Selected fabric'} — pick the area this fabric is cut for.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: FR.stone, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
          {areas.map(a => (
            <button key={a} onClick={() => setArea(a)}
              style={{
                padding: '10px 8px',
                background: area === a ? FR.slate : FR.white,
                color: area === a ? FR.salt : FR.slate,
                border: `1px solid ${area === a ? FR.slate : FR.sand}`,
                borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
              {a}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, color: FR.stone }}>
            Cancel
          </button>
          <button onClick={() => onSelect(area)}
            style={{ padding: '7px 18px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            Continue → {fabric?.color_card_images?.length ? 'pick color' : 'commit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Color picker shown after a fabric is selected. Each color_card_images
// entry on the fabric is rendered as a clickable swatch — pick one to
// commit the fabric + color, or skip to commit without a colorway.
function FabricColorPickerModal({ fabric, onSelect, onSkip, onClose }) {
  const colors = fabric?.color_card_images || [];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: FR.salt, borderRadius: 8, padding: 22, width: 720, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', border: `0.5px solid rgba(58,58,58,0.15)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: FR.slate }}>Pick a Colorway</div>
            <div style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>{colors.length} color{colors.length === 1 ? '' : 's'} on this fabric.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: FR.stone, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {colors.map((c, i) => (
            <button
              key={i}
              onClick={() => onSelect(i, c)}
              style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6, padding: 0, cursor: 'pointer', overflow: 'hidden', textAlign: 'left' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = FR.soil; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = FR.sand; }}
            >
              <div style={{ aspectRatio: '1 / 1', background: c.hex || FR.salt, overflow: 'hidden' }}>
                {c.url && <img src={c.url} alt={c.label || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ padding: '6px 8px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: FR.slate }}>{c.label || `Color ${i + 1}`}</div>
                {c.hex && <div style={{ fontSize: 9, color: FR.stone, fontFamily: 'ui-monospace,Menlo,monospace' }}>{c.hex}</div>}
              </div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onSkip} style={{ padding: '7px 14px', background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, color: FR.stone }}>
            Skip — no colorway yet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function specOf(componentRow) {
  // listComponentPacks returns thin projection rows (cover_image, supplier).
  // For the deeper specs (color, length, size) we lazily fetch the full pack.
  return {
    name:    componentRow?.component_name || componentRow?.name || 'Untitled',
    vendor:  componentRow?.supplier || '—',
    cover:   componentRow?.cover_image || null,
  };
}

// Display fabric snapshot. fabricStore returns rows with the fields below
// in `fabric_data` or top-level columns depending on shape.
function fabricSpec(row) {
  const d = row?.data || row?.fabric_data || row || {};
  const tier = (d?.costTiers || [])[0];
  const gsm = parseFloat(row?.weight_gsm ?? d?.weight_gsm) || 0;
  const widthCm = parseFloat(row?.width_cm ?? d?.width_cm) || 0;
  const kgUsd = parseFloat(row?.price_per_kg_usd ?? d?.price_per_kg_usd) || 0;
  const fromKg = (kgUsd && gsm && widthCm) ? kgUsd * (gsm * widthCm / 100000) : 0;
  const unitCost =
    parseFloat(row?.price_per_meter_usd) ||
    parseFloat(d?.price_per_meter_usd) ||
    fromKg ||
    parseFloat(tier?.unitCost) ||
    parseFloat(row?.cost_per_unit) ||
    parseFloat(d?.cost_per_unit) ||
    parseFloat(d?.costPerYard) ||
    parseFloat(d?.costPerMeter) || 0;
  const weightGsm = row?.weight_gsm || d?.weight_gsm;
  return {
    name:        row?.name || d.name || row?.mill_fabric_no || 'Untitled fabric',
    composition: row?.composition || d?.composition || '—',
    weight:      weightGsm ? `${weightGsm} GSM` : '—',
    weave:       row?.weave || d?.weave || '—',
    millId:      row?.mill_id || d?.mill_id || d?.supplier || row?.supplier || row?.mill || '',
    cover:       row?.front_image_url || row?.cover_image || d?.front_image_url || d?.cover_image || null,
    colors:      row?.color_card_images || d?.color_card_images || [],
    finishes:    row?.mill_finishes || d?.mill_finishes || [],
    unitCost,
    currency:    d.currency || tier?.currency || 'USD',
  };
}

// ─── Mill Finishes inline editor (per fabric slot in StepFabrics) ────────────

const EXEC_LABEL = { mill: 'At mill', secondary: 'Secondary', at_treatment: 'Wash house' };

function MillFinishesPanel({ entry, libraryFinishes, onChange }) {
  const finishes = entry.chosenFinishes ?? libraryFinishes;
  const isOverridden = entry.chosenFinishes != null;

  // All catalog names + any custom ones already in the list
  const allCatalog = [...new Set([...MILL_FINISH_CATALOG, ...finishes.map(f => f.name).filter(Boolean)])];

  function updateFinish(idx, patch) {
    const next = finishes.map((f, i) => i === idx ? { ...f, ...patch } : f);
    onChange(next);
  }

  function removeFinish(idx) {
    onChange(finishes.filter((_, i) => i !== idx));
  }

  function addFinish(name) {
    if (!name) return;
    onChange([...finishes, { name, executed_at: 'mill', delta_per_meter_usd: 0, delta_per_meter_cny: 0 }]);
  }

  return (
    <div style={{ paddingTop: 6, paddingBottom: 6, borderTop: `0.5px solid ${FR.sand}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Mill Finishes</span>
        {isOverridden && finishes.length === 0 && libraryFinishes.length > 0 && (
          <button
            onClick={() => onChange(null)}
            style={{ fontSize: 9, color: FR.stone, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >Reset to library</button>
        )}
      </div>
      {finishes.map((f, fi) => (
        <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <div style={{ flex: 1, fontSize: 10, color: FR.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
          <select
            value={f.executed_at || 'mill'}
            onChange={e => updateFinish(fi, { executed_at: e.target.value })}
            style={{ fontSize: 9, border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '2px 3px', color: FR.stone, background: FR.white, outline: 'none', maxWidth: 90 }}
          >
            {FINISH_EXECUTED_AT.map(opt => <option key={opt.id} value={opt.id}>{EXEC_LABEL[opt.id]}</option>)}
          </select>
          <button
            onClick={() => removeFinish(fi)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: FR.stone, fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
          >×</button>
        </div>
      ))}
      <select
        value=""
        onChange={e => { addFinish(e.target.value); e.target.value = ''; }}
        style={{ width: '100%', fontSize: 10, border: `0.5px dashed ${FR.sand}`, borderRadius: 3, padding: '4px 6px', color: FR.stone, background: FR.white, outline: 'none', cursor: 'pointer' }}
      >
        <option value="">+ Add finish…</option>
        {allCatalog.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
  );
}

// ─── Picked card UI shared by Fabric / Trim / Packaging slots ──────────────

function EmptyPickerSlot({ onPick, label, hint }) {
  return (
    <button
      onClick={onPick}
      style={{
        width: '100%',
        aspectRatio: '1 / 1.1',
        border: `1.5px dashed ${FR.sand}`,
        borderRadius: 8,
        background: FR.white,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        transition: 'all 0.15s',
        color: FR.stone,
      }}
      onMouseOver={e => { e.currentTarget.style.borderColor = FR.soil; e.currentTarget.style.color = FR.soil; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = FR.sand; e.currentTarget.style.color = FR.stone; }}
    >
      <div style={{ fontSize: 32, fontWeight: 200 }}>+</div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label || 'Pick from Library'}</div>
      {hint && <div style={{ fontSize: 10, fontStyle: 'italic', textAlign: 'center', color: FR.stone }}>{hint}</div>}
    </button>
  );
}

// ─── Page 03 — Fabrics ──────────────────────────────────────────────────────

export function StepFabrics({ data, set }) {
  const [pickerSlot, setPickerSlot] = useState(null); // 0..2 | null
  const [resolved, setResolved] = useState({}); // fabricId -> spec
  const refreshTick = useFocusRefresh();

  const picked = data.pickedFabrics || [];
  const slots = [0, 1, 2]; // up to 3 fabrics

  // After fabric is picked, the flow is fabric → area → (color if any) → commit.
  // areaPickFor holds the pending fabric while the area-of-product modal is open;
  // colorPickFor takes over once an area is picked and the fabric has color cards.
  const [areaPickFor, setAreaPickFor] = useState(null); // { fabric, slot } | null
  const [colorPickFor, setColorPickFor] = useState(null); // { fabric, slot, area } | null

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = picked.map(p => p?.fabricId).filter(Boolean);
      if (!ids.length) { setResolved({}); return; }
      const { getFabric } = await import('../../utils/fabricStore');
      const { getVendor } = await import('../../utils/vendorLibrary');
      const next = {};
      for (const id of ids) {
        const row = await getFabric(id);
        if (cancelled) return;
        if (!row) continue;
        const spec = fabricSpec(row);
        spec.cover = await resolveCoverPath(spec.cover, row.updated_at);
        // Resolve every color card image (Storage paths become signed URLs).
        spec.colors = await Promise.all((spec.colors || []).map(async c => ({
          ...c,
          url: await resolveCoverPath(c.url, row.updated_at) || c.url,
        })));
        // Pull vendor contact info (email, phone, primary contact) from
        // the vendor library so the BOM card can show "who to call".
        if (spec.millId) {
          const v = getVendor(spec.millId);
          spec.vendor = {
            name:    spec.millId,
            email:   v?.email || '',
            phone:   v?.phone || '',
            contact: v?.primary_contact || '',
          };
        } else {
          spec.vendor = { name: '—', email: '', phone: '', contact: '' };
        }
        next[id] = spec;
      }
      if (!cancelled) setResolved(next);
    })();
    return () => { cancelled = true; };
  }, [picked.map(p => p?.fabricId).join('|'), refreshTick]);

  function setSlot(i, next) {
    const arr = [...(picked || [])];
    while (arr.length <= i) arr.push(null);
    arr[i] = next;
    set('pickedFabrics', arr.filter(Boolean));
  }

  async function pickFabric(item) {
    const slotIdx = pickerSlot;
    setPickerSlot(null);
    // Always ask for area of product first — the library default seeds
    // the modal but we surface the choice explicitly so the user can't
    // commit the wrong area silently.
    setAreaPickFor({ fabric: item, slot: slotIdx });
  }

  function pickArea(area) {
    const ctx = areaPickFor;
    setAreaPickFor(null);
    if (!ctx) return;
    const colors = ctx.fabric.color_card_images || [];
    if (colors.length > 0) {
      setColorPickFor({ fabric: ctx.fabric, slot: ctx.slot, area });
    } else {
      commitFabric(ctx.slot, ctx.fabric, null, area);
    }
  }

  function commitFabric(slotIdx, item, colorChoice, area) {
    const role = area || picked[slotIdx]?.role || item.default_garment_area || FABRIC_GARMENT_AREAS[0] || '';
    setSlot(slotIdx, {
      fabricId:   item.id,
      role,
      notes:      '',
      colorIndex: colorChoice?.index ?? null,
      colorLabel: colorChoice?.label || '',
      colorHex:   colorChoice?.hex || '',
      colorUrl:   colorChoice?.url || '',
    });
  }

  const fabricsSubtotal = picked.reduce((sum, p) => {
    const cost = resolved[p?.fabricId]?.unitCost || 0;
    const mpu = p?.metersPerUnit;
    return sum + (mpu ? cost * mpu : cost);
  }, 0);
  const fabricsHaveYield = picked.some(p => p?.metersPerUnit);
  const fabricsAllYield  = picked.length > 0 && picked.every(p => p?.metersPerUnit);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
        <SectionTitle>Fabrics</SectionTitle>
        <span style={{ fontSize: 12, color: FR.slate, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600 }}>
          Fabrics subtotal · {formatMoney(fabricsSubtotal)}{fabricsHaveYield ? (fabricsAllYield ? ' /unit' : ' /unit (partial est.)') : ' /m'}
        </span>
      </div>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, lineHeight: 1.5 }}>
        Up to three fabrics per garment, each picked from the PLM Fabric library. Add a new fabric in the library first if it isn't here.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {slots.map(i => {
          const entry = picked[i];
          if (!entry) {
            return <EmptyPickerSlot key={i} onPick={() => setPickerSlot(i)} label="Pick fabric" hint="Body / Lining / Rib / …" />;
          }
          const spec = resolved[entry.fabricId];
          return (
            <div key={i} style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4 / 3', background: FR.salt, position: 'relative' }}>
                {spec?.cover ? (
                  <img src={spec.cover} alt={spec.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: FR.stone, fontSize: 10, fontStyle: 'italic' }}>No cover image</div>
                )}
                <button onClick={() => setSlot(i, null)} style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, background: FR.slate, color: FR.salt, border: 'none', fontSize: 12, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 9, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Area:</span>
                  <select
                    value={entry.role || ''}
                    onChange={e => setSlot(i, { ...entry, role: e.target.value })}
                    style={{ background: 'transparent', border: 'none', color: FR.soil, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', outline: 'none' }}
                  >
                    {FABRIC_GARMENT_AREAS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: FR.slate, lineHeight: 1.2, marginBottom: 4 }}>
                  {spec?.name || 'Loading…'}
                </div>
                {spec?.millId && (
                  <div style={{ fontSize: 10, color: FR.stone, marginBottom: 8 }}>
                    {[spec.millId, spec.composition, spec.weight].filter(v => v && v !== '—').join(' · ')}
                  </div>
                )}
                {/* Selected colorway badge */}
                {entry.colorLabel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {entry.colorUrl ? (
                      <img src={entry.colorUrl} alt={entry.colorLabel} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', border: `0.5px solid ${FR.sand}` }} />
                    ) : (
                      <span style={{ width: 28, height: 28, borderRadius: 4, background: entry.colorHex || FR.salt, border: `0.5px solid ${FR.sand}`, display: 'inline-block' }} />
                    )}
                    <span style={{ fontSize: 11, color: FR.slate, fontWeight: 500 }}>{entry.colorLabel}</span>
                    <button
                      onClick={() => setColorPickFor({ fabric: { id: entry.fabricId, color_card_images: spec?.colors || [] }, slot: i })}
                      style={{ marginLeft: 'auto', fontSize: 9, color: FR.soil, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >Change</button>
                  </div>
                )}
                {!entry.colorLabel && spec?.colors?.length > 0 && (
                  <button
                    onClick={() => setColorPickFor({ fabric: { id: entry.fabricId, color_card_images: spec.colors }, slot: i })}
                    style={{ marginBottom: 8, fontSize: 10, color: FR.soil, background: FR.salt, border: `0.5px dashed ${FR.sand}`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer', width: '100%' }}
                  >+ Pick colorway ({spec.colors.length} available)</button>
                )}
                <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5, marginBottom: 8 }}>
                  <div>{spec?.composition || '—'}</div>
                  <div>{spec?.weight} · {spec?.weave}</div>
                  <div style={{ marginTop: 4, paddingTop: 4, borderTop: `0.5px solid ${FR.sand}` }}>
                    <div style={{ fontWeight: 600, color: FR.slate }}>{spec?.vendor?.name || '—'}</div>
                    {spec?.vendor?.contact && <div>{spec.vendor.contact}</div>}
                    {spec?.vendor?.email && <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10 }}>{spec.vendor.email}</div>}
                    {spec?.vendor?.phone && <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10 }}>{spec.vendor.phone}</div>}
                  </div>
                </div>
                {/* Mill Finishes — per-style override; falls back to library defaults */}
                <MillFinishesPanel
                  entry={entry}
                  libraryFinishes={spec?.finishes || []}
                  onChange={finishes => setSlot(i, { ...entry, chosenFinishes: finishes })}
                />

                <div style={{ paddingTop: 6, borderTop: `0.5px solid ${FR.sand}` }}>
                  {/* Cost value — shows /unit when yield is known, /m otherwise */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    <span style={{ fontSize: 10, color: FR.stone }}>
                      {entry.metersPerUnit
                        ? (entry.yieldIsActual ? 'Cost / unit' : 'Cost / unit (est.)')
                        : 'Cost / m'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: FR.slate }}>
                      {entry.metersPerUnit
                        ? formatMoney((spec?.unitCost || 0) * entry.metersPerUnit, spec?.currency)
                        : formatMoney(spec?.unitCost || 0, spec?.currency)}
                    </span>
                  </div>
                  {/* Yield selector — garment type picks a standard m/unit estimate */}
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 9, color: FR.soil, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Yield</span>
                      <select
                        value={entry.yieldIsActual ? '' : (entry.metersPerUnit || '')}
                        onChange={e => {
                          const v = e.target.value;
                          setSlot(i, { ...entry, metersPerUnit: v ? parseFloat(v) : null, yieldIsActual: false });
                        }}
                        style={{ flex: 1, border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '3px 5px', fontSize: 10, color: FR.slate, background: FR.white, outline: 'none' }}
                      >
                        <option value="">— garment type —</option>
                        {GARMENT_YIELDS.map(g => (
                          <option key={g.label} value={g.metersPerUnit}>{g.label} · {g.metersPerUnit}m</option>
                        ))}
                      </select>
                    </div>
                    {entry.metersPerUnit && (
                      <div style={{ marginTop: 3, fontSize: 8, fontFamily: 'ui-monospace, Menlo, monospace', color: entry.yieldIsActual ? '#3B6D11' : '#854F0B' }}>
                        {entry.metersPerUnit}m/unit · {entry.yieldIsActual ? 'CLO3D actual' : 'std. estimate'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pickerSlot !== null && (
        <LibraryPickerModal
          title="Pick a Fabric"
          subtitle="From the PLM Fabric library"
          fetchItems={() => listFabrics({ includeArchived: false })}
          getId={item => item.id}
          renderItem={item => {
            const s = fabricSpec(item);
            return (
              <div>
                <div style={{ aspectRatio: '4 / 3', background: FR.salt, overflow: 'hidden' }}>
                  {s.cover && <img src={s.cover} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: FR.slate, marginBottom: 2 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: FR.stone }}>{s.weight} · {s.weave}</div>
                </div>
              </div>
            );
          }}
          onSelect={pickFabric}
          onClose={() => setPickerSlot(null)}
        />
      )}
      {areaPickFor && (
        <FabricAreaPickerModal
          fabric={areaPickFor.fabric}
          defaultArea={picked[areaPickFor.slot]?.role || areaPickFor.fabric?.default_garment_area || 'Body'}
          onSelect={pickArea}
          onClose={() => setAreaPickFor(null)}
        />
      )}
      {colorPickFor && (
        <FabricColorPickerModal
          fabric={colorPickFor.fabric}
          onSelect={(idx, color) => {
            commitFabric(colorPickFor.slot, colorPickFor.fabric, { index: idx, ...color }, colorPickFor.area);
            setColorPickFor(null);
          }}
          onSkip={() => {
            commitFabric(colorPickFor.slot, colorPickFor.fabric, null, colorPickFor.area);
            setColorPickFor(null);
          }}
          onClose={() => setColorPickFor(null)}
        />
      )}
    </div>
  );
}

// ─── Page 04 — Trims (image-first, 6-card grid) ─────────────────────────────

const MAX_TRIMS = 6;

// Read the most useful spec fields from a Component Pack data row.
// `cover` is just the Component Pack cover image — designers manage
// what shows there in the library, and the BOM card mirrors it.
export function readComponentSpec(fullData) {
  const c = fullData?.data || {};
  const tier = (c.costTiers || [])[0];
  const unitCost = parseFloat(tier?.unitCost) || parseFloat(fullData?.cost_per_unit) || parseFloat(c?.targetUnitCost) || 0;
  return {
    name:     fullData?.component_name || c.componentName || '—',
    type:     c.componentType || fullData?.component_category || '',
    cover:    fullData?.cover_image || c.cover_image || null,
    unitCost,
    currency: c.currency || tier?.currency || 'USD',
  };
}

function formatMoney(n, currency = 'USD') {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function ComponentSlotCard({ entry, fullData, onClear, onChangeRole, onChangeQty, roleLabel = 'Type' }) {
  const s = readComponentSpec(fullData);
  const qtyNum = parseFloat(String(entry.quantity || '').replace(/[^0-9.]/g, '')) || 1;
  const lineCost = s.unitCost * qtyNum;

  // Back-fill the saved role from the library's componentType the moment
  // it lands. We always overwrite, even for non-empty values, so renames
  // in the library propagate automatically. Skipped if the type matches
  // already (no-op write).
  useEffect(() => {
    if (s.type && entry.role !== s.type) onChangeRole(s.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.type]);

  const packHref = entry.componentId ? `#plm/library/trims/${entry.componentId}` : null;

  return (
    <div style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Cover image — taller now since we dropped the spec table. */}
      <div style={{ aspectRatio: '4 / 3', background: FR.salt, position: 'relative' }}>
        {s.cover ? (
          <img src={s.cover} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: FR.stone, fontSize: 9, fontStyle: 'italic' }}>No image</div>
        )}
        <button onClick={onClear} style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, background: FR.slate, color: FR.salt, border: 'none', fontSize: 10, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: FR.soil }}>
          {roleLabel}: {s.type || '—'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 14, color: FR.slate, lineHeight: 1.15, flex: 1 }}>{s.name}</div>
          {packHref && (
            <a
              href={packHref}
              style={{ fontSize: 10, color: FR.soil, textDecoration: 'none', borderBottom: `0.5px solid ${FR.soil}`, paddingBottom: 1, whiteSpace: 'nowrap' }}
              title="Open this component pack in the Library"
            >
              View tech pack ↗
            </a>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4, borderTop: `0.5px solid ${FR.sand}` }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: FR.soil, letterSpacing: 0.4, textTransform: 'uppercase' }}>Qty</span>
          <input
            type="text"
            value={entry.quantity || ''}
            onChange={e => onChangeQty(e.target.value)}
            placeholder="e.g. 1, 2 m, 4 cm"
            style={{ flex: 1, border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '3px 6px', fontSize: 10, color: FR.slate, background: FR.white, outline: 'none', fontFamily: "'Helvetica Neue', sans-serif" }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, fontFamily: "ui-monospace, Menlo, monospace" }}>
          <span style={{ fontSize: 9, color: FR.stone }}>
            Unit · {formatMoney(s.unitCost, s.currency)}
            {qtyNum > 1 && ` × ${qtyNum}`}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: FR.slate }}>
            {formatMoney(lineCost, s.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function StepTrims({ data, set, packId }) {
  return (
    <ComponentBOMPage
      title="Trims"
      singularNoun="Trim"
      roleLabel="Trim Type"
      subtitle="Image-first detail of every trim and hardware component on this garment. Pick from the Component Pack library — must be created there first."
      fieldName="pickedTrims"
      data={data}
      set={set}
      packId={packId}
      pickerSubtitle="Pulled from the Component Pack library."
      maxSlots={MAX_TRIMS}
    />
  );
}

// ─── Page 05 — Packaging ────────────────────────────────────────────────────

export function StepPackaging({ data, set, packId }) {
  return (
    <ComponentBOMPage
      title="Packaging"
      singularNoun="Packaging Component"
      roleLabel="Type"
      subtitle="Polybags, hang tags, stickers, branded boxes — every packaging component, picked from the Component Pack library."
      fieldName="pickedPackaging"
      data={data}
      set={set}
      packId={packId}
      pickerSubtitle="Pulled from the Component Pack library."
      maxSlots={MAX_TRIMS}
    />
  );
}

// ─── Shared component-pack BOM page (used by Trims + Packaging) ────────────

function ComponentBOMPage({ title, singularNoun, roleLabel = 'Type', subtitle, fieldName, data, set, pickerSubtitle, maxSlots }) {
  const noun = singularNoun || title.replace(/s$/, '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const refreshTick = useFocusRefresh();
  const [fullById, setFullById] = useState({});

  const picked = data?.[fieldName] || [];

  // Always re-fetch picked components — never short-circuit on cached
  // entries. Library edits (cover updates, type rename, color change) need
  // to land in the slot card the moment the user comes back to this page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = picked.map(p => p?.componentId || p?.id).filter(Boolean);
      if (!ids.length) { setFullById({}); return; }
      const next = {};
      for (const id of ids) {
        const row = await getComponentPack(id);
        if (cancelled) return;
        if (!row) continue;
        const v = row.updated_at;
        const resolvedTop    = await resolveCoverPath(row.cover_image, v);
        const resolvedNested = await resolveCoverPath(row?.data?.cover_image, v);
        // Cover image priority for the BOM card / live preview:
        //   1. Construction → Measurement Diagram   (slot: construction-diagram)
        //   2. Design → Sketch                       (slot: design-sketch)
        //   3. Pack cover_image                      (fallback)
        // The first two come from the pack's images[] array. We try them
        // in order and the first non-null wins.
        const findImage = async (slot) => {
          const entry = (row.images || []).find(img => img.slot === slot);
          if (!entry) return null;
          if (entry.data?.startsWith?.('data:')) return entry.data;
          if (entry.path) return await resolveCoverPath(entry.path, v);
          return null;
        };
        const diagramUrl = await findImage('construction-diagram') || await findImage('design-sketch');
        next[id] = {
          ...row,
          cover_image: resolvedTop || row.cover_image,
          data: { ...(row.data || {}), cover_image: resolvedNested || row?.data?.cover_image },
          _constructionDiagram: diagramUrl,
        };
      }
      if (!cancelled) setFullById(next);
    })();
    return () => { cancelled = true; };
  }, [picked.map(p => p?.componentId || p?.id).join('|'), refreshTick]);

  async function addComponent(item) {
    if (picked.length >= maxSlots) return;
    // Pull the full pack so we can auto-populate role from componentType.
    let role = item.component_category || '';
    try {
      const full = await getComponentPack(item.id);
      if (full?.data?.componentType) role = full.data.componentType;
      // Cache it for the slot card so it renders immediately.
      if (full) {
        const v = full.updated_at;
        const resolvedTop    = await resolveCoverPath(full.cover_image, v);
        const resolvedNested = await resolveCoverPath(full?.data?.cover_image, v);
        const findImage = async (slot) => {
          const entry = (full.images || []).find(img => img.slot === slot);
          if (!entry) return null;
          if (entry.data?.startsWith?.('data:')) return entry.data;
          if (entry.path) return await resolveCoverPath(entry.path, v);
          return null;
        };
        // Construction diagram is the canonical hero; fall back to the
        // Design Sketch if no diagram has been uploaded yet.
        const diagramUrl = await findImage('construction-diagram') || await findImage('design-sketch');
        setFullById(prev => ({
          ...prev,
          [item.id]: {
            ...full,
            cover_image: resolvedTop || full.cover_image,
            data: { ...(full.data || {}), cover_image: resolvedNested || full?.data?.cover_image },
            _constructionDiagram: diagramUrl,
          },
        }));
      }
    } catch { /* fall back to category */ }
    set(fieldName, [...picked, { componentId: item.id, role, notes: '' }]);
    setPickerOpen(false);
  }

  function removeComponent(idx) {
    set(fieldName, picked.filter((_, i) => i !== idx));
  }

  function setRole(idx, role) {
    set(fieldName, picked.map((p, i) => (i === idx ? { ...p, role } : p)));
  }

  function setQty(idx, quantity) {
    set(fieldName, picked.map((p, i) => (i === idx ? { ...p, quantity } : p)));
  }

  // Section subtotal — sum of every picked slot's line cost, displayed
  // beside the page title so the designer always sees what this section
  // contributes to the unit cost.
  const sectionSubtotal = picked.reduce((sum, p) => {
    const full = fullById[p?.componentId || p?.id];
    if (!full) return sum;
    const s = readComponentSpec(full);
    const qtyNum = parseFloat(String(p?.quantity || '').replace(/[^0-9.]/g, '')) || 1;
    return sum + (s.unitCost * qtyNum);
  }, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
        <SectionTitle>{title}</SectionTitle>
        <span style={{ fontSize: 12, color: FR.slate, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600 }}>
          {title} subtotal · {formatMoney(sectionSubtotal)}
        </span>
      </div>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, lineHeight: 1.5 }}>
        {subtitle} Each card links straight to its component pack — the supplier can click <strong>View tech pack ↗</strong> to see the full spec.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
        {Array.from({ length: maxSlots }).map((_, i) => {
          const entry = picked[i];
          if (!entry) {
            return <EmptyPickerSlot key={i} onPick={() => setPickerOpen(true)} label={`Pick ${noun.toLowerCase()}`} />;
          }
          return (
            <ComponentSlotCard
              key={(entry.componentId || entry.id || '') + ':' + i}
              entry={entry}
              fullData={fullById[entry.componentId || entry.id]}
              onClear={() => removeComponent(i)}
              onChangeRole={role => setRole(i, role)}
              onChangeQty={quantity => setQty(i, quantity)}
              roleLabel={roleLabel}
            />
          );
        })}
      </div>

      {pickerOpen && (
        <LibraryPickerModal
          title={`Pick a ${noun}`}
          subtitle={pickerSubtitle}
          fetchItems={listComponentPacks}
          getId={item => item.id}
          renderItem={item => {
            const s = specOf(item);
            return (
              <div>
                <div style={{ aspectRatio: '1 / 1', background: FR.salt, overflow: 'hidden' }}>
                  {s.cover && <img src={s.cover} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: FR.slate, marginBottom: 2 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: FR.stone }}>{s.vendor}</div>
                </div>
              </div>
            );
          }}
          onSelect={addComponent}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
