// SimpleImageSlot — image upload that keeps the photo's native aspect on
// drop, with an always-available Crop option for trimming the shot down to
// the fabric (front/back/ribbing/placement). Mirrors CoverImagePicker's
// storage contract; the crop step is optional and only appears when a
// `cropAspect` is supplied.

import { useEffect, useRef, useState } from 'react';
import { Upload, X, Crop as CropIcon } from 'lucide-react';
import { FR } from './techPackConstants';
import { uploadAsset, deleteAsset, getAssetUrl, dataUrlToBlob, isLegacyDataUrl } from '../../utils/plmAssets';
import { resizeImage } from './techPackConstants';
import CropModal from './CropModal';

export default function SimpleImageSlot({
  value,
  onChange,
  label = 'Image',
  hint = 'Drop a photo',
  height = 140,
  assetScope,
  assetOwnerId,
  assetSlot = 'image',
  cropAspect,            // when set, a Crop button is offered (e.g. 2/3, 1, 220/260)
  cropLabel = 'Drag to position · scroll to zoom',
}) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState('');
  const [cropSrc, setCropSrc] = useState(null);
  const storageMode = !!(assetScope && assetOwnerId);

  const inlineSrc = isLegacyDataUrl(value) || (typeof value === 'string' && /^https?:\/\//i.test(value)) ? value : '';
  useEffect(() => {
    if (!value || inlineSrc) { setResolved(''); return undefined; }
    let cancelled = false;
    getAssetUrl(value).then(u => { if (!cancelled && u) setResolved(u); });
    return () => { cancelled = true; };
  }, [value, inlineSrc]);
  const previewSrc = inlineSrc || resolved;

  // Persist a (possibly cropped) JPEG/WebP data URL: upload to Storage and emit
  // the path, or emit the data URL directly in legacy mode. Best-effort deletes
  // the previous file so retries don't orphan blobs.
  const persist = async (dataUrl) => {
    if (!storageMode) { onChange(dataUrl); return; }
    setBusy(true);
    try {
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

  // Drop / pick → upload at native aspect (no forced crop).
  const handle = async (file) => {
    const dataUrl = await resizeImage(file, 1800);
    await persist(dataUrl);
  };

  // Crop the current image: resolve it to a data URL the cropper can edit
  // without re-uploading on cancel, then open the modal.
  const openCrop = async () => {
    if (!value) return;
    if (inlineSrc && isLegacyDataUrl(value)) { setCropSrc(value); return; }
    if (!previewSrc) return;
    try {
      const resp = await fetch(previewSrc);
      const blob = await resp.blob();
      const r = new FileReader();
      r.onload = () => setCropSrc(r.result);
      r.readAsDataURL(blob);
    } catch (err) {
      console.error('SimpleImageSlot crop fetch:', err);
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
            {busy && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(245,240,232,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5 }}>
                Uploading…
              </div>
            )}
            <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 6 }}>
              {cropAspect != null && (
                <button onClick={e => { e.stopPropagation(); openCrop(); }} title="Crop"
                  style={{ height: 22, padding: '0 9px', borderRadius: 11, background: FR.soil, color: FR.salt, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>
                  <CropIcon size={11} /> Crop
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); remove(); }} title="Remove"
                style={{ width: 22, height: 22, borderRadius: 11, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={11} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 8 }}>
            <Upload size={18} style={{ color: FR.sand, margin: '0 auto 4px', display: 'block' }} />
            <div style={{ fontSize: 11, color: FR.stone }}>{busy ? 'Uploading…' : hint}</div>
          </div>
        )}
      </div>

      {cropSrc && (
        <CropModal
          src={cropSrc}
          aspect={cropAspect}
          label={cropLabel}
          onCancel={() => setCropSrc(null)}
          onConfirm={async (dataUrl) => { setCropSrc(null); await persist(dataUrl); }}
        />
      )}
    </div>
  );
}
