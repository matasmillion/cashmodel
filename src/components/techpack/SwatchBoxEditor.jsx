// SwatchBoxEditor — per-swatch crop editor for the AI Color Scanner.
//
// Claude Vision predetermines one bounding box per fabric swatch (via
// extractSwatchRegions). This editor overlays each of those boxes on the
// source card and lets the operator fine-tune any one that's off:
//   · drag a box body to move it
//   · drag a corner handle to resize it
//   · click to select; the × removes it
// Unlike the uniform grid overlay it replaces, every box is an independent
// crop region ({ label, x, y, w, h } in 0-1 fractions of the source image),
// so a single drifted swatch can be nudged without disturbing its neighbours.

import { useRef, useCallback, useEffect } from 'react';
import { FR } from './techPackConstants';

// Corner handles. cx/cy place the handle on the box; the id letters tell the
// resize math which edges that corner drives (n/s/e/w).
const CORNERS = [
  { id: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
  { id: 'ne', cx: 1, cy: 0, cursor: 'nesw-resize' },
  { id: 'sw', cx: 0, cy: 1, cursor: 'nesw-resize' },
  { id: 'se', cx: 1, cy: 1, cursor: 'nwse-resize' },
];

const clamp01 = v => Math.max(0, Math.min(1, v));
const pctOf = v => `${v * 100}%`;
const MIN = 0.015; // smallest box edge, as a fraction of the image

export default function SwatchBoxEditor({ src, boxes, selected, onSelect, onChange }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null); // { mode:'move'|cornerId, index, box, grab:{dx,dy} }

  const pointFromEvent = useCallback((e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  // Functional updates only (onChange === parent setState), so the window
  // listeners never read a stale `boxes` array mid-drag.
  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = pointFromEvent(e);
    if (!p) return;
    onChange(prev => {
      const next = prev.slice();
      const b = d.box;
      if (d.mode === 'move') {
        const x = Math.max(0, Math.min(p.x - d.grab.dx, 1 - b.w));
        const y = Math.max(0, Math.min(p.y - d.grab.dy, 1 - b.h));
        next[d.index] = { ...b, x, y };
      } else {
        let { x, y, w, h } = b;
        const right = x + w;
        const bottom = y + h;
        if (d.mode.includes('w')) { x = clamp01(Math.min(p.x, right - MIN)); w = right - x; }
        if (d.mode.includes('e')) { w = clamp01(Math.max(p.x, x + MIN)) - x; }
        if (d.mode.includes('n')) { y = clamp01(Math.min(p.y, bottom - MIN)); h = bottom - y; }
        if (d.mode.includes('s')) { h = clamp01(Math.max(p.y, y + MIN)) - y; }
        next[d.index] = { ...b, x, y, w, h };
      }
      return next;
    });
  }, [onChange, pointFromEvent]);

  const endDrag = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
    };
  }, [onPointerMove, endDrag]);

  const startMove = i => (e) => {
    const p = pointFromEvent(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(i);
    const b = boxes[i];
    dragRef.current = { mode: 'move', index: i, box: { ...b }, grab: { dx: p.x - b.x, dy: p.y - b.y } };
  };
  const startCorner = (i, id) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(i);
    dragRef.current = { mode: id, index: i, box: { ...boxes[i] } };
  };
  const removeBox = i => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(prev => prev.filter((_, idx) => idx !== i));
    onSelect?.(null);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={() => onSelect?.(null)}
      style={{ position: 'relative', userSelect: 'none', touchAction: 'none', lineHeight: 0 }}
    >
      <img src={src} alt="" draggable={false} style={{ display: 'block', width: '100%', borderRadius: 4 }} />

      {boxes.map((b, i) => {
        const isSel = i === selected;
        return (
          <div
            key={i}
            onPointerDown={startMove(i)}
            style={{
              position: 'absolute',
              left: pctOf(b.x), top: pctOf(b.y), width: pctOf(b.w), height: pctOf(b.h),
              border: `${isSel ? 2 : 1}px solid ${isSel ? FR.sienna : 'rgba(58,58,58,0.8)'}`,
              background: isSel ? 'rgba(212,149,106,0.14)' : 'transparent',
              boxShadow: isSel ? '0 0 0 1px rgba(255,255,255,0.55) inset' : 'none',
              boxSizing: 'border-box',
              cursor: 'move',
            }}
          >
            {/* Label / index tag, clipped to the box width. */}
            <div style={{
              position: 'absolute', top: 0, left: 0, maxWidth: '100%',
              fontSize: 8.5, lineHeight: '12px', padding: '0 3px',
              background: isSel ? FR.sienna : 'rgba(58,58,58,0.8)', color: '#fff',
              borderRadius: '2px 0 3px 0', fontFamily: 'inherit',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {b.label || i + 1}
            </div>

            {isSel && (
              <>
                <div
                  onPointerDown={removeBox(i)}
                  title="Remove this box"
                  style={{ position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: 9, background: FR.slate, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, lineHeight: 1, zIndex: 2 }}
                >×</div>
                {CORNERS.map(c => (
                  <div
                    key={c.id}
                    onPointerDown={startCorner(i, c.id)}
                    style={{ position: 'absolute', left: pctOf(c.cx), top: pctOf(c.cy), width: 12, height: 12, transform: 'translate(-50%, -50%)', borderRadius: 6, background: FR.salt, border: `2px solid ${FR.sienna}`, cursor: c.cursor, zIndex: 2 }}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
