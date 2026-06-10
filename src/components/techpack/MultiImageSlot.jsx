// MultiImageSlot — gallery-style uploader for an array of labeled images.
// Used by FabricBuilder for the color card (every swatch a mill provides
// gets its own thumbnail + label) and any future multi-photo atom.
//
// Each entry: { url, label, hex }
//   • url: storage path or data URL (legacy mode emits data URLs)
//   • label: free-text English colorway name
//   • hex: optional hex code for renderers that just need a fill
//
// When `assetScope` + `assetOwnerId` are provided, drops upload to Supabase
// Storage and the entry's `url` is the path; otherwise we fall back to
// in-memory data URLs. Mirrors the CoverImagePicker contract.

import { useRef, useState } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { FR } from './techPackConstants';
import { uploadAsset, deleteAsset, getAssetUrl, dataUrlToBlob, isLegacyDataUrl } from '../../utils/plmAssets';
import { resizeImage } from './techPackConstants';

function Thumb({ src }) {
  const [resolved, setResolved] = useState(isLegacyDataUrl(src) || /^https?:\/\//i.test(src) ? src : '');
  if (!resolved && src) {
    getAssetUrl(src).then(u => { if (u) setResolved(u); });
  }
  if (!resolved) return null;
  return <img src={resolved} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
}

export default function MultiImageSlot({
  value = [],
  onChange,
  assetScope,
  assetOwnerId,
  assetSlot = 'colorcard',
  hint = 'Add color swatches',
  selectable = false,
}) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const storageMode = !!(assetScope && assetOwnerId);

  const update = (idx, patch) => {
    const next = value.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const isStored = (url) => storageMode && url && !isLegacyDataUrl(url) && !/^https?:\/\//i.test(url);

  const remove = (idx) => {
    const next = value.slice();
    const [gone] = next.splice(idx, 1);
    onChange(next);
    if (isStored(gone?.url)) deleteAsset(gone.url);
  };

  const toggleOne = (i) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const selectAll  = () => setSelected(new Set(value.map((_, i) => i)));
  const clearSel   = () => setSelected(new Set());
  const enterSelect = () => { setSelected(new Set()); setSelectMode(true); };
  const exitSelect  = () => { setSelected(new Set()); setSelectMode(false); };

  const deleteSelected = () => {
    if (!selected.size) return;
    const next = value.filter((_, i) => !selected.has(i));
    value.forEach((entry, i) => { if (selected.has(i) && isStored(entry?.url)) deleteAsset(entry.url); });
    onChange(next);
    exitSelect();
  };

  const addFiles = async (files) => {
    setBusy(true);
    try {
      const additions = [];
      for (const file of files) {
        const dataUrl = await resizeImage(file, 1600);
        if (storageMode) {
          const blob = dataUrlToBlob(dataUrl);
          if (!blob) continue;
          const ref = await uploadAsset({ scope: assetScope, ownerId: assetOwnerId, slot: `${assetSlot}-${Date.now()}-${additions.length}`, blob, skipCompress: false });
          // ref.path when the upload reached Storage; ref.data (inline data URL) when
          // the cloud was unavailable and the bytes were kept locally — either way the
          // swatch renders and is never lost.
          additions.push({ url: ref.path || ref.data, label: '', hex: '' });
        } else {
          additions.push({ url: dataUrl, label: '', hex: '' });
        }
      }
      onChange([...(value || []), ...additions]);
    } catch (err) {
      console.error('MultiImageSlot:', err);
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFiles(files);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) addFiles(files);
  };

  const tbBtn = { fontSize: 10, padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${FR.sand}`, background: '#fff', color: FR.slate, cursor: 'pointer', fontFamily: 'inherit' };
  const tbDanger = { ...tbBtn, border: 'none', background: selected.size ? '#A32D2D' : FR.sand, color: FR.salt, cursor: selected.size ? 'pointer' : 'default' };

  return (
    <div>
      {selectable && value.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {!selectMode ? (
            <button onClick={enterSelect} style={tbBtn}>Select</button>
          ) : (
            <>
              <button onClick={selectAll} style={tbBtn}>Select all</button>
              <button onClick={clearSel} style={tbBtn}>Deselect all</button>
              <button onClick={deleteSelected} disabled={!selected.size} style={tbDanger}>
                Delete selected{selected.size ? ` (${selected.size})` : ''}
              </button>
              <button onClick={exitSelect} style={{ ...tbBtn, marginLeft: 'auto' }}>Done</button>
            </>
          )}
        </div>
      )}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: 8,
        }}
      >
        {value.map((c, i) => (
          <div key={i} style={{ position: 'relative', border: `0.5px solid ${selectMode && selected.has(i) ? FR.slate : FR.sand}`, borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
            <div
              onClick={selectMode ? () => toggleOne(i) : undefined}
              style={{ width: '100%', aspectRatio: '1 / 1', background: c.hex || FR.salt, position: 'relative', cursor: selectMode ? 'pointer' : 'default' }}>
              {c.url && <Thumb src={c.url} />}
              {selectMode ? (
                <>
                  <div style={{ position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${FR.slate}`, background: selected.has(i) ? FR.slate : 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected.has(i) && <Check size={12} color={FR.salt} />}
                  </div>
                  {!selected.has(i) && <div style={{ position: 'absolute', inset: 0, background: 'rgba(245,240,232,0.45)' }} />}
                </>
              ) : (
                <button
                  onClick={() => remove(i)}
                  title="Remove"
                  style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, background: 'rgba(58,58,58,0.85)', color: FR.salt, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <input
              value={c.label || ''}
              onChange={e => update(i, { label: e.target.value })}
              placeholder="Color name"
              style={{ width: '100%', padding: '4px 6px', border: 'none', borderTop: `0.5px solid ${FR.sand}`, fontSize: 10, color: FR.slate, background: '#fff', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}
            />
          </div>
        ))}
        {!selectMode && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={{
              aspectRatio: '1 / 1',
              border: `1.5px dashed ${FR.sand}`,
              borderRadius: 6,
              background: FR.salt,
              color: FR.stone,
              cursor: busy ? 'wait' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontSize: 10,
            }}
          >
            <Plus size={16} />
            <span>{busy ? 'Uploading…' : (value.length === 0 ? hint : 'Add more')}</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: 'none' }} />
    </div>
  );
}
