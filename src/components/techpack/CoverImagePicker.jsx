// CoverImagePicker — small dropzone that opens CropModal and stores the
// resulting cover image. Used by every PLM atom card detail page so each
// library entry can carry a 2:3 hero image.
//
// Two modes:
//   • Legacy (no assetScope/assetOwnerId): emits a base64 data URL via
//     onChange. Same as before. Used until all callers are migrated.
//   • Storage-backed (with assetScope + assetOwnerId): uploads the cropped
//     image to Supabase Storage and emits the file PATH via onChange.
//     The caller stores that path string in their cover_image column.
//
// `value` may be either a base64 data URL or a Storage path; the picker
// resolves a Storage path into a signed URL for rendering.
//
// Locked to a 2:3 portrait crop by default (matches a 4×6 fashion crop)
// so cards across Patterns / Fabrics / Treatments / Embellishments have
// a consistent visual rhythm. Aspect can still be overridden by the
// caller for one-off uses.

import { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCw } from 'lucide-react';
import { FR } from './techPackConstants';
import CropModal from './CropModal';
import { resizeImage } from './techPackConstants';
import { uploadAsset, deleteAsset, getAssetUrl, dataUrlToBlob, isLegacyDataUrl } from '../../utils/plmAssets';

const DEFAULT_ASPECT = 2 / 3;

export default function CoverImagePicker({
  value,
  onChange,
  aspect = DEFAULT_ASPECT,
  label = 'Cover image',
  hint = 'Drop a photo · cropped to 2:3 portrait',
  width = 240,
  // Storage-backed mode (Phase 3+). When both are set, uploads go to the
  // `plm-assets` bucket under {org}/{assetScope}/{assetOwnerId}/cover-… and
  // onChange receives the path. When omitted, falls back to data URL mode.
  assetScope,
  assetOwnerId,
  assetSlot = 'cover',
}) {
  const fileRef = useRef(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [resolvedSrc, setResolvedSrc] = useState('');

  const storageMode = !!(assetScope && assetOwnerId);

  // Render src — handles all three shapes value can take:
  //   • null/empty → no preview
  //   • data: URL  → render directly
  //   • path       → resolve to signed URL (cached at the helper level)
  const inlineSrc = isLegacyDataUrl(value) || (typeof value === 'string' && /^https?:\/\//i.test(value)) ? value : '';
  useEffect(() => {
    if (!value || inlineSrc) { setResolvedSrc(''); return undefined; }
    let cancelled = false;
    getAssetUrl(value).then(url => { if (!cancelled && url) setResolvedSrc(url); });
    return () => { cancelled = true; };
  }, [value, inlineSrc]);
  const previewSrc = inlineSrc || resolvedSrc;

  const openCropFor = async (file) => {
    if (!file) return;
    // Resize huge phone photos before handing to the cropper so the canvas
    // doesn't choke. resizeImage returns a JPEG data URL.
    const dataUrl = await resizeImage(file, 1600);
    setCropSrc(dataUrl);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) openCropFor(file);
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) openCropFor(file);
    e.target.value = '';
  };

  const handleConfirm = async (dataUrl) => {
    setCropSrc(null);
    if (!storageMode) {
      onChange(dataUrl);
      return;
    }
    // Storage mode: upload the cropped output, hand the path to the caller,
    // and best-effort delete the previous file so the bucket doesn't fill
    // with orphan crops every time the user retries.
    setUploading(true);
    setUploadError(null);
    try {
      const blob = dataUrlToBlob(dataUrl);
      if (!blob) throw new Error('Could not decode cropped image');
      const ref = await uploadAsset({
        scope: assetScope,
        ownerId: assetOwnerId,
        slot: assetSlot,
        blob,
        skipCompress: true, // already resized + cropped client-side
      });
      const previousValue = value;
      onChange(ref.path);
      if (previousValue && !isLegacyDataUrl(previousValue) && previousValue !== ref.path) {
        deleteAsset(previousValue);
      }
    } catch (err) {
      console.error('CoverImagePicker upload:', err);
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const recrop = async () => {
    if (!value) return;
    if (isLegacyDataUrl(value)) {
      setCropSrc(value);
      return;
    }
    // Path-based: fetch the signed URL → blob → data URL so the cropper
    // can manipulate it without re-uploading on cancel.
    if (!previewSrc) return;
    try {
      const resp = await fetch(previewSrc);
      const blob = await resp.blob();
      const r = new FileReader();
      r.onload = () => setCropSrc(r.result);
      r.readAsDataURL(blob);
    } catch (err) {
      console.error('CoverImagePicker recrop fetch:', err);
    }
  };

  const remove = () => {
    const previousValue = value;
    onChange(null);
    if (storageMode && previousValue && !isLegacyDataUrl(previousValue)) {
      deleteAsset(previousValue);
    }
  };

  // height derived from aspect — for 2:3 portrait at width=240, height=360.
  const height = Math.round(width / aspect);

  return (
    <div>
      <div style={{ fontSize: 11, color: FR.stone, marginBottom: 6, letterSpacing: 0.2 }}>{label}</div>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        style={{
          width,
          height,
          border: `2px dashed ${value ? 'transparent' : FR.sand}`,
          borderRadius: 8,
          background: value ? '#fff' : FR.salt,
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        {value ? (
          <>
            {previewSrc && (
              <img src={previewSrc} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
            {(uploading || (!previewSrc && !inlineSrc)) && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(245,240,232,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5 }}>
                {uploading ? 'Uploading…' : 'Loading…'}
              </div>
            )}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
              <button onClick={e => { e.stopPropagation(); recrop(); }}
                title="Recrop"
                style={{ padding: '4px 10px', borderRadius: 12, background: FR.soil, color: FR.salt, border: 'none', fontSize: 10, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RotateCw size={11} /> Recrop
              </button>
              <button onClick={e => { e.stopPropagation(); remove(); }}
                title="Remove"
                style={{ width: 24, height: 24, borderRadius: 12, background: FR.slate, color: FR.salt, border: 'none', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={11} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Camera size={26} style={{ color: FR.sand, margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontSize: 12, color: FR.stone }}>{hint}</div>
            <div style={{ fontSize: 10, color: FR.sand, marginTop: 4 }}>Click or drop to upload</div>
          </div>
        )}
      </div>
      {uploadError && (
        <div style={{ fontSize: 10, color: '#A32D2D', marginTop: 4 }}>{uploadError}</div>
      )}

      {cropSrc && (
        <CropModal
          src={cropSrc}
          aspect={aspect}
          label="2:3 portrait · drag to position · scroll or slider to zoom"
          onCancel={() => setCropSrc(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
