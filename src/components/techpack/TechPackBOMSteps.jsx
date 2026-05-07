// Bill of Materials phase — three pages: Fabrics, Trims, Packaging.
// Library-first: components must exist in the PLM library before they can
// be picked here. No free-text adding. The actual specs (composition,
// vendor, color, length, etc.) live on the library row — this file just
// holds thin references and renders the picker UI.

import React, { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { SectionTitle, AssetImage } from './TechPackPrimitives';
import { listFabrics } from '../../utils/fabricStore';
import { listComponentPacks, getComponentPack } from '../../utils/componentPackStore';
import { getAssetUrl } from '../../utils/plmAssets';

// Cover images in fabric / component pack rows are stored as Supabase
// Storage paths, not URLs. The browser can't render them directly — we
// need to swap them for short-lived signed URLs first. Already-resolved
// HTTP URLs and data URIs pass through unchanged.
async function resolveCoverPath(value) {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  if (value.startsWith('http') || value.startsWith('data:') || value.startsWith('blob:')) return value;
  try { return await getAssetUrl(value); } catch { return null; }
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
      // Resolve any path-based cover_image to a signed URL up front so
      // the grid doesn't render broken-image icons.
      const resolved = await Promise.all(rows.map(async r => {
        const url = await resolveCoverPath(r?.cover_image);
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
  return {
    name:        d.name || row?.name || 'Untitled fabric',
    composition: d.composition || '—',
    weight:      d.weight_gsm ? `${d.weight_gsm} GSM` : '—',
    weave:       d.weave || row?.weave || '—',
    vendor:      d.supplier || row?.supplier || '—',
    cover:       d.cover_image || row?.cover_image || null,
  };
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

const FABRIC_ROLES = ['Body', 'Lining', 'Rib / Trim', 'Other'];

export function StepFabrics({ data, set }) {
  const [pickerSlot, setPickerSlot] = useState(null); // 0..2 | null
  const [resolved, setResolved] = useState({}); // fabricId -> spec

  const picked = data.pickedFabrics || [];
  const slots = [0, 1, 2]; // up to 3 fabrics

  // Lazy-resolve picked fabric specs so we can render the spec card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = picked.map(p => p?.fabricId).filter(Boolean).filter(id => !resolved[id]);
      if (!ids.length) return;
      const { getFabric } = await import('../../utils/fabricStore');
      const next = { ...resolved };
      for (const id of ids) {
        const row = await getFabric(id);
        if (!cancelled && row) {
          const spec = fabricSpec(row);
          spec.cover = await resolveCoverPath(spec.cover);
          next[id] = spec;
        }
      }
      if (!cancelled) setResolved(next);
    })();
    return () => { cancelled = true; };
  }, [picked.map(p => p?.fabricId).join('|')]);

  function setSlot(i, next) {
    const arr = [...(picked || [])];
    while (arr.length <= i) arr.push(null);
    arr[i] = next;
    set('pickedFabrics', arr.filter(Boolean));
  }

  function pickFabric(item) {
    setSlot(pickerSlot, { fabricId: item.id, role: picked[pickerSlot]?.role || FABRIC_ROLES[pickerSlot] || '', notes: '' });
    setPickerSlot(null);
  }

  return (
    <div>
      <SectionTitle>Fabrics</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, lineHeight: 1.5 }}>
        Up to three fabrics per garment, each picked from the PLM Fabric library. Add a new fabric in the library first if it isn't here.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {slots.map(i => {
          const entry = picked[i];
          if (!entry) {
            return <EmptyPickerSlot key={i} onPick={() => setPickerSlot(i)} label="Pick fabric" hint="Body / Lining / Rib" />;
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
                <div style={{ fontSize: 9, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                  <select
                    value={entry.role || ''}
                    onChange={e => setSlot(i, { ...entry, role: e.target.value })}
                    style={{ background: 'transparent', border: 'none', color: FR.soil, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', outline: 'none' }}
                  >
                    {FABRIC_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, color: FR.slate, lineHeight: 1.2, marginBottom: 8 }}>
                  {spec?.name || 'Loading…'}
                </div>
                <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
                  <div>{spec?.composition || '—'}</div>
                  <div>{spec?.weight} · {spec?.weave}</div>
                  <div>Vendor: {spec?.vendor || '—'}</div>
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
    </div>
  );
}

// ─── Page 04 — Trims (image-first, 6-card grid) ─────────────────────────────

const MAX_TRIMS = 6;

// Read the most useful spec fields from a Component Pack data row.
// Color prefers the Colorways picker on the pack (colorwayPicks[0] or
// colorwaysList[0].frColor) — that's the canonical color the trim is
// being supplied in. Length/Size live on the first material row.
export function readComponentSpec(fullData) {
  const c = fullData?.data || {};
  const m = (c.materials || [])[0] || {};
  return {
    name:   fullData?.component_name || c.componentName || '—',
    type:   c.componentType || fullData?.component_category || '',
    cover:  fullData?.cover_image || c.cover_image || null,
    vendor: m.vendor || c.supplier || fullData?.supplier || '—',
    color:  (c.colorwayPicks || [])[0] || (c.colorwaysList || [])[0]?.frColor || m.color || '—',
    length: m.length || '—',
    size:   m.size || '—',
  };
}

function ComponentSlotCard({ entry, fullData, onClear, onChangeRole, roleOptions, roleLabel = 'Type' }) {
  const s = readComponentSpec(fullData);

  // Self-heal: if the entry was saved with an empty role (e.g. before this
  // auto-populate logic shipped) and the full pack has a componentType,
  // back-fill it now so the dropdown reflects the library value.
  useEffect(() => {
    if (!entry.role && s.type) onChangeRole(s.type);
    // Only reacts when type lands; entry.role intentionally not in deps so
    // we don't loop after the heal write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.type]);

  return (
    <div style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ aspectRatio: '4 / 3', background: FR.salt, position: 'relative', overflow: 'hidden' }}>
        {s.cover ? (
          <img src={s.cover} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: FR.stone, fontSize: 9, fontStyle: 'italic' }}>No cover</div>
        )}
        <button onClick={onClear} style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, background: FR.slate, color: FR.salt, border: 'none', fontSize: 10, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <select
          value={entry.role || s.type || ''}
          onChange={e => onChangeRole(e.target.value)}
          style={{ background: 'transparent', border: 'none', color: FR.soil, fontSize: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', outline: 'none', padding: 0 }}
        >
          <option value="">— {roleLabel} —</option>
          {(roleOptions || []).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 13, color: FR.slate, lineHeight: 1.15 }}>{s.name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: 9, color: FR.stone, lineHeight: 1.3 }}>
          <div><span style={{ color: FR.soil, fontWeight: 600 }}>Vendor</span> {s.vendor}</div>
          <div><span style={{ color: FR.soil, fontWeight: 600 }}>Color</span> {s.color}</div>
          <div><span style={{ color: FR.soil, fontWeight: 600 }}>Length</span> {s.length}</div>
          <div><span style={{ color: FR.soil, fontWeight: 600 }}>Size</span> {s.size}</div>
        </div>
      </div>
    </div>
  );
}

const TRIM_ROLES = ['Zipper', 'Drawcord', 'Aglet', 'Button', 'Snap', 'Rivet', 'Bartack', 'Eyelet', 'Patch', 'Hardware', 'Tape', 'Other'];

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
      roleOptions={TRIM_ROLES}
      maxSlots={MAX_TRIMS}
    />
  );
}

// ─── Page 05 — Packaging ────────────────────────────────────────────────────

const PACKAGING_ROLES = ['Polybag', 'Carton', 'Sticker', 'Hang Tag', 'Care Card', 'Tissue', 'Branded Box', 'Other'];

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
      roleOptions={PACKAGING_ROLES}
      maxSlots={MAX_TRIMS}
    />
  );
}

// ─── Shared component-pack BOM page (used by Trims + Packaging) ────────────

function ComponentBOMPage({ title, singularNoun, roleLabel = 'Type', subtitle, fieldName, data, set, pickerSubtitle, roleOptions, maxSlots }) {
  const noun = singularNoun || title.replace(/s$/, '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullById, setFullById] = useState({});

  const picked = data?.[fieldName] || [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = picked.map(p => p?.componentId).filter(Boolean).filter(id => !fullById[id]);
      if (!ids.length) return;
      const next = { ...fullById };
      for (const id of ids) {
        const row = await getComponentPack(id);
        if (!cancelled && row) {
          // Storage paths → signed URLs so the slot cover can render.
          const resolvedTop = await resolveCoverPath(row.cover_image);
          const resolvedNested = await resolveCoverPath(row?.data?.cover_image);
          next[id] = {
            ...row,
            cover_image: resolvedTop || row.cover_image,
            data: { ...(row.data || {}), cover_image: resolvedNested || row?.data?.cover_image },
          };
        }
      }
      if (!cancelled) setFullById(next);
    })();
    return () => { cancelled = true; };
  }, [picked.map(p => p?.componentId).join('|')]);

  async function addComponent(item) {
    if (picked.length >= maxSlots) return;
    // Pull the full pack so we can auto-populate role from componentType.
    let role = item.component_category || '';
    try {
      const full = await getComponentPack(item.id);
      if (full?.data?.componentType) role = full.data.componentType;
      // Cache it for the slot card so it renders immediately.
      if (full) {
        const resolvedTop    = await resolveCoverPath(full.cover_image);
        const resolvedNested = await resolveCoverPath(full?.data?.cover_image);
        setFullById(prev => ({
          ...prev,
          [item.id]: {
            ...full,
            cover_image: resolvedTop || full.cover_image,
            data: { ...(full.data || {}), cover_image: resolvedNested || full?.data?.cover_image },
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

  // Aggregate file refs from every picked component for the bottom strip.
  const aggregatedFiles = picked
    .map(p => fullById[p.componentId])
    .filter(Boolean)
    .flatMap(c => (c.data?.attachments || []).map(a => ({ ...a, componentName: c.component_name })));

  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, lineHeight: 1.5 }}>{subtitle}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {Array.from({ length: maxSlots }).map((_, i) => {
          const entry = picked[i];
          if (!entry) {
            return <EmptyPickerSlot key={i} onPick={() => setPickerOpen(true)} label={`Pick ${noun.toLowerCase()}`} />;
          }
          return (
            <ComponentSlotCard
              key={entry.componentId + ':' + i}
              entry={entry}
              fullData={fullById[entry.componentId]}
              onClear={() => removeComponent(i)}
              onChangeRole={role => setRole(i, role)}
              roleOptions={roleOptions}
              roleLabel={roleLabel}
            />
          );
        })}
      </div>

      {/* Aggregated component files */}
      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>Component Files</label>
        {aggregatedFiles.length === 0 ? (
          <div style={{ padding: '14px 16px', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 6, fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>
            Files attached to picked components will appear here automatically.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {aggregatedFiles.map((f, i) => (
              <div key={i} style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '8px 10px', fontSize: 11, color: FR.slate }}>
                <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: 9, color: FR.stone }}>{f.componentName}</div>
              </div>
            ))}
          </div>
        )}
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
