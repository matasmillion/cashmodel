// Full-screen crop UI wrapped around react-easy-crop. The slot locks the
// crop rectangle to a fixed aspect ratio (A4 landscape or 2:3 portrait in
// the trim pack) and the user drags / zooms to position. "Save crop" runs
// getCroppedDataUrl with the returned pixel rectangle and passes the result
// to the owner, which stores it in the pack's images[] array.

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X } from 'lucide-react';
import { FR } from './techPackConstants';
import { getCroppedDataUrl } from '../../utils/cropImage';

export default function CropModal({ src, aspect, label, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_, areaPixels) => {
    setPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!pixels) return;
    setSaving(true);
    try {
      const dataUrl = await getCroppedDataUrl(src, pixels);
      onConfirm(dataUrl);
    } catch (err) {
      console.error('Crop failed:', err);
      setSaving(false);
    }
  };

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
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          restrictPosition={false} />
      </div>

      <div style={{ padding: '14px 20px', background: FR.slate, color: FR.salt, display: 'flex', alignItems: 'center', gap: 16 }}>
        <label style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 600 }}>ZOOM</label>
        <input type="range" min={1} max={4} step={0.01}
          value={zoom} onChange={e => setZoom(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 420 }} />
        <span style={{ fontSize: 10, color: FR.stone, fontVariantNumeric: 'tabular-nums' }}>{zoom.toFixed(2)}×</span>
        <button onClick={onCancel}
          style={{ padding: '6px 14px', background: 'transparent', color: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={!pixels || saving}
          style={{ padding: '6px 14px', background: FR.salt, color: FR.slate, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save crop'}
        </button>
      </div>
    </div>
  );
}
