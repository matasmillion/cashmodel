// CoverImagePicker — small dropzone that opens CropModal and stores the
// resulting data URL via onChange. Used by every PLM atom card detail
// page so each library entry can carry a 2:3 hero image.
//
// Locked to a 2:3 portrait crop by default (matches a 4×6 fashion crop)
// so cards across Patterns / Fabrics / Treatments / Embellishments have
// a consistent visual rhythm. Aspect can still be overridden by the
// caller for one-off uses.

import { useRef, useState } from 'react';
import { Camera, X, RotateCw } from 'lucide-react';
import { FR } from './techPackConstants';
import CropModal from './CropModal';
import { resizeImage } from './techPackConstants';

const DEFAULT_ASPECT = 2 / 3;

export default function CoverImagePicker({
  value,
  onChange,
  aspect = DEFAULT_ASPECT,
  label = 'Cover image',
  hint = 'Drop a photo · cropped to 2:3 portrait',
  width = 240,
}) {
  const fileRef = useRef(null);
  const [cropSrc, setCropSrc] = useState(null);

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

  const handleConfirm = (dataUrl) => {
    onChange(dataUrl);
    setCropSrc(null);
  };

  const recrop = () => {
    if (!value) return;
    setCropSrc(value);
  };

  const remove = () => {
    onChange(null);
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
            <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
