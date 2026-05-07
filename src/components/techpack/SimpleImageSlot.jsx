// SimpleImageSlot — uncropped image upload for places where the user
// wants to keep the photo's native aspect (front/back fabric texture).
// Mirrors CoverImagePicker's storage contract minus the crop modal.

import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { FR } from './techPackConstants';
import { uploadAsset, deleteAsset, getAssetUrl, dataUrlToBlob, isLegacyDataUrl } from '../../utils/plmAssets';
import { resizeImage } from './techPackConstants';

export default function SimpleImageSlot({
  value,
  onChange,
  label = 'Image',
  hint = 'Drop a photo',
  height = 140,
  assetScope,
  assetOwnerId,
  assetSlot = 'image',
}) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState('');
  const storageMode = !!(assetScope && assetOwnerId);

  const inlineSrc = isLegacyDataUrl(value) || (typeof value === 'string' && /^https?:\/\//i.test(value)) ? value : '';
  useEffect(() => {
    if (!value || inlineSrc) { setResolved(''); return undefined; }
    let cancelled = false;
    getAssetUrl(value).then(u => { if (!cancelled && u) setResolved(u); });
    return () => { cancelled = true; };
  }, [value, inlineSrc]);
  const previewSrc = inlineSrc || resolved;

  const handle = async (file) => {
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file, 1800);
      if (!storageMode) { onChange(dataUrl); return; }
      const blob = dataUrlToBlob(dataUrl);
      if (!blob) throw new Error('Bad encoding');
      const ref = await uploadAsset({ scope: assetScope, ownerId: assetOwnerId, slot: assetSlot, blob, skipCompress: false });
      const previous = value;
      onChange(ref.path);
      if (previous && !isLegacyDataUrl(previous) && !/^https?:\/\//i.test(previous) && previous !== ref.path) {
        deleteAsset(previous);
      }
    } catch (err) {
      console.error('SimpleImageSlot:', err);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    const previous = value;
    onChange('');
    if (storageMode && previous && !isLegacyDataUrl(previous) && !/^https?:\/\//i.test(previous)) deleteAsset(previous);
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: FR.stone, marginBottom: 4, letterSpacing: 0.2 }}>{label}</div>
      <div
        onClick={() => !value && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handle(f); }}
        style={{
          height,
          border: `1.5px dashed ${value ? 'transparent' : FR.sand}`,
          borderRadius: 6,
          background: value ? '#fff' : FR.salt,
          cursor: value ? 'default' : 'pointer',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ''; }} style={{ display: 'none' }} />
        {previewSrc ? (
          <>
            <img src={previewSrc} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <button onClick={remove} title="Remove" style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={11} />
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 8 }}>
            <Upload size={18} style={{ color: FR.sand, margin: '0 auto 4px', display: 'block' }} />
            <div style={{ fontSize: 11, color: FR.stone }}>{busy ? 'Uploading…' : hint}</div>
          </div>
        )}
      </div>
    </div>
  );
}
