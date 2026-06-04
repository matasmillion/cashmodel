// SwatchBoxEditor — per-swatch crop editor for the AI Color Scanner.
//
// Pass 1 seeds one rough box per swatch (no labels); this editor lets the
// operator crop each one exactly before Pass 2 reads the names back off the
// crops. Interactions:
//   · click a box to select it; drag the body to move it
//   · shift-click to add/remove boxes from a multi-selection
//   · drag any selected box to move the whole selection together (rigid)
//   · drag a corner handle to resize (single selection only)
//   · × on a box, the side-panel Remove, or Delete key removes the selection
// Every box is an independent crop region ({ label, x, y, w, h } in 0-1
// fractions of the source image).

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

export default function SwatchBoxEditor({ src, boxes, selected, onSelect, onChange, onDeleteSelected }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null); // move: { mode:'move', start:[{idx,box}], grab } | resize: { mode:cornerId, index, box }

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
    if (d.mode === 'move') {
      // Rigid group move: clamp one shared delta so every moved box stays in
      // bounds and relative positions are preserved.
      let dx = p.x - d.grab.x;
      let dy = p.y - d.grab.y;
      let loX = -Infinity, hiX = Infinity, loY = -Infinity, hiY = Infinity;
      for (const m of d.start) {
        loX = Math.max(loX, -m.box.x);
        hiX = Math.min(hiX, 1 - m.box.w - m.box.x);
        loY = Math.max(loY, -m.box.y);
        hiY = Math.min(hiY, 1 - m.box.h - m.box.y);
      }
      dx = Math.max(loX, Math.min(dx, hiX));
      dy = Math.max(loY, Math.min(dy, hiY));
      onChange(prev => {
        const next = prev.slice();
        for (const m of d.start) next[m.idx] = { ...m.box, x: m.box.x + dx, y: m.box.y + dy };
        return next;
      });
    } else {
      const b = d.box;
      let { x, y, w, h } = b;
      const right = x + w;
      const bottom = y + h;
      if (d.mode.includes('w')) { x = clamp01(Math.min(p.x, right - MIN)); w = right - x; }
      if (d.mode.includes('e')) { w = clamp01(Math.max(p.x, x + MIN)) - x; }
      if (d.mode.includes('n')) { y = clamp01(Math.min(p.y, bottom - MIN)); h = bottom - y; }
      if (d.mode.includes('s')) { h = clamp01(Math.max(p.y, y + MIN)) - y; }
      onChange(prev => {
        const next = prev.slice();
        next[d.index] = { ...b, x, y, w, h };
        return next;
      });
    }
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

  // Delete / Backspace removes the current selection (unless typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (selected.length) { e.preventDefault(); onDeleteSelected?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onDeleteSelected]);

  const startPointer = i => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) { onSelect(i, true); return; } // toggle in/out of the selection; no drag
    // Decide what moves from the CURRENT selection, before the parent updates:
    // dragging a box already in a multi-selection moves the whole group;
    // dragging anything else first reduces the selection to that one box.
    const movers = (selected.includes(i) && selected.length > 1) ? selected : [i];
    onSelect(i, false);
    const p = pointFromEvent(e);
    if (!p) return;
    dragRef.current = {
      mode: 'move',
      start: movers.map(idx => ({ idx, box: { ...boxes[idx] } })),
      grab: { x: p.x, y: p.y },
    };
  };
  const startCorner = (i, id) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(i, false);
    dragRef.current = { mode: id, index: i, box: { ...boxes[i] } };
  };
  const removeBox = i => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(prev => prev.filter((_, idx) => idx !== i));
    onSelect(null);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={() => onSelect(null)}
      style={{ position: 'relative', userSelect: 'none', touchAction: 'none', lineHeight: 0 }}
    >
      <img src={src} alt="" draggable={false} style={{ display: 'block', width: '100%', borderRadius: 4 }} />

      {boxes.map((b, i) => {
        const isSel = selected.includes(i);
        const isSolo = isSel && selected.length === 1;
        return (
          <div
            key={i}
            onPointerDown={startPointer(i)}
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

            {/* Per-box × and resize handles only when this is the sole selection. */}
            {isSolo && (
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
