// Full-screen crop UI wrapped around react-easy-crop. The slot locks the
// crop rectangle to a fixed aspect ratio and the user drags / zooms to
// position. Rotate buttons pre-rotate the source image on a canvas (90°
// increments) so the Cropper always works on an axis-aligned image and
// getCroppedDataUrl needs no extra rotation logic.

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, RotateCcw, RotateCw } from 'lucide-react';
import { FR } from './techPackConstants';
import { getCroppedDataUrl } from '../../utils/cropImage';

function rotateDataUrl(dataUrl, deg) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const swap = deg === 90 || deg === 270;
      const cw = swap ? img.height : img.width;
      const ch = swap ? img.width  : img.height;
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  });
}

export default function CropModal({ src, aspect, label, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rotatedSrc, setRotatedSrc] = useState(src);
  const [rotating, setRotating] = useState(false);

  const onCropComplete = useCallback((_, areaPixels) => {
    setPixels(areaPixels);
  }, []);

  const handleRotate = async (deg) => {
    if (rotating) return;
    setRotating(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    const next = await rotateDataUrl(rotatedSrc, deg);
    setRotatedSrc(next);
    setRotating(false);
  };

  const handleSave = async () => {
    if (!pixels) return;
    setSaving(true);
    try {
      const dataUrl = await getCroppedDataUrl(rotatedSrc, pixels);
      onConfirm(dataUrl);
    } catch (err) {
      console.error('Crop failed:', err);
      setSaving(false);
    }
  };

  const btnStyle = (disabled) => ({
    padding: '5px 10px', background: 'rgba(255,255,255,0.1)', color: disabled ? FR.stone : FR.salt,
    border: 'none', borderRadius: 3, cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
  });

  return (
    <div role="dialog"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: FR.slate, color: FR.salt }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>CROP TO FIT</div>
          <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", fontSize: 18, marginTop: 2 }}>
            {label || 'Drag to position · scroll to zoom'}
          </div>
        </div>
        <button onClick={onCancel} aria-label="Cancel"
          style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#111' }}>
        {rotating
          ? <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: FR.stone, fontSize: 12 }}>Rotating…</div>
          : <Cropper
              image={rotatedSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition={false} />
        }
      </div>

      <div style={{ padding: '14px 20px', background: FR.slate, color: FR.salt, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Rotate controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 600, color: FR.stone }}>ROTATE</span>
          <button onClick={() => handleRotate(270)} disabled={rotating} style={btnStyle(rotating)} title="Rotate left 90°">
            <RotateCcw size={13} /> Left
          </button>
          <button onClick={() => handleRotate(90)} disabled={rotating} style={btnStyle(rotating)} title="Rotate right 90°">
            <RotateCw size={13} /> Right
          </button>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

        {/* Zoom control */}
        <label style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 600 }}>ZOOM</label>
        <input type="range" min={1} max={4} step={0.01}
          value={zoom} onChange={e => setZoom(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 400 }} />
        <span style={{ fontSize: 10, color: FR.stone, fontVariantNumeric: 'tabular-nums' }}>{zoom.toFixed(2)}×</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onCancel}
            style={{ padding: '6px 14px', background: 'transparent', color: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!pixels || saving || rotating}
            style={{ padding: '6px 14px', background: FR.salt, color: FR.slate, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: (saving || rotating) ? 'wait' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
