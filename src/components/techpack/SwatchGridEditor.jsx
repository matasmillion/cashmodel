// SwatchGridEditor — drag-to-fit grid overlay for the AI Color Scanner.
//
// The vision model reads a fabric card's codes and row/column counts
// reliably but CANNOT place pixel-accurate grid edges on a dense,
// downsampled card — it tends to anchor the matrix top at the masthead /
// spec band instead of the first fabric row, so every crop shifts. Rather
// than keep guessing geometry, the operator confirms it here.
//
// Key property that makes this reliable: a printed mill card is a UNIFORM
// grid, so the four corners of the fabric matrix + the row/column counts
// fully determine every cell. The operator never places individual lines —
// they drag one rectangle onto the matrix and even-division does the rest.
//
// Emits the flat grid shape SwatchScanModal holds and gridToRegions()
// consumes: { x0, y0, x1, y1, rows[], columns[], cell_fabric_bottom_frac }.

import { useRef, useCallback, useEffect } from 'react';
import { FR } from './techPackConstants';

// Corner handles, keyed to which grid edge each axis drives.
const CORNERS = [
  { id: 'nw', xKey: 'x0', yKey: 'y0', cursor: 'nwse-resize' },
  { id: 'ne', xKey: 'x1', yKey: 'y0', cursor: 'nesw-resize' },
  { id: 'sw', xKey: 'x0', yKey: 'y1', cursor: 'nesw-resize' },
  { id: 'se', xKey: 'x1', yKey: 'y1', cursor: 'nwse-resize' },
];

const clamp01 = v => Math.max(0, Math.min(1, v));
const pctOf = v => `${v * 100}%`;

export default function SwatchGridEditor({ src, grid, onChange }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);

  const pointFromEvent = useCallback((e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = pointFromEvent(e);
    if (!p) return;
    if (d.type === 'move') {
      const w = d.start.x1 - d.start.x0;
      const h = d.start.y1 - d.start.y0;
      const x0 = Math.max(0, Math.min(p.x - d.grab.dx, 1 - w));
      const y0 = Math.max(0, Math.min(p.y - d.grab.dy, 1 - h));
      onChange({ ...grid, x0, y0, x1: x0 + w, y1: y0 + h });
    } else {
      const next = { ...grid };
      if (d.type.includes('w')) next.x0 = Math.min(p.x, grid.x1 - 0.02);
      if (d.type.includes('e')) next.x1 = Math.max(p.x, grid.x0 + 0.02);
      if (d.type.includes('n')) next.y0 = Math.min(p.y, grid.y1 - 0.02);
      if (d.type.includes('s')) next.y1 = Math.max(p.y, grid.y0 + 0.02);
      onChange(next);
    }
  }, [grid, onChange, pointFromEvent]);

  const endDrag = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
    };
  }, [onPointerMove, endDrag]);

  const startCorner = id => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { type: id };
  };
  const startMove = (e) => {
    const p = pointFromEvent(e);
    if (!p) return;
    e.preventDefault();
    dragRef.current = { type: 'move', start: { ...grid }, grab: { dx: p.x - grid.x0, dy: p.y - grid.y0 } };
  };

  const { x0, y0, x1, y1 } = grid;
  const R = Math.max(1, grid.rows?.length || 1);
  const C = Math.max(1, grid.columns?.length || 1);
  const fabricBot = grid.cell_fabric_bottom_frac ?? 0.78;
  const gw = x1 - x0;
  const gh = y1 - y0;
  const rowH = gh / R;

  const vLines = [];
  for (let i = 1; i < C; i++) vLines.push(x0 + (i / C) * gw);
  const hLines = [];
  for (let j = 1; j < R; j++) hLines.push(y0 + (j / R) * gh);
  const strips = [];
  for (let j = 0; j < R; j++) {
    const top = y0 + j * rowH + rowH * fabricBot;
    strips.push({ top, h: y0 + (j + 1) * rowH - top });
  }

  const accent = FR.slate;

  return (
    <div ref={wrapRef} style={{ position: 'relative', userSelect: 'none', touchAction: 'none', lineHeight: 0 }}>
      <img src={src} alt="" draggable={false} style={{ display: 'block', width: '100%', borderRadius: 4 }} />

      {/* Visual overlay — fractional coords via 0..1 viewBox, non-scaling strokes. */}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {/* Dim everything outside the matrix box. */}
        <rect x="0" y="0" width="1" height={y0} fill="rgba(58,58,58,0.38)" />
        <rect x="0" y={y1} width="1" height={1 - y1} fill="rgba(58,58,58,0.38)" />
        <rect x="0" y={y0} width={x0} height={gh} fill="rgba(58,58,58,0.38)" />
        <rect x={x1} y={y0} width={1 - x1} height={gh} fill="rgba(58,58,58,0.38)" />
        {/* Label strips (excluded from each crop). */}
        {strips.map((s, i) => (
          <rect key={`s${i}`} x={x0} y={s.top} width={gw} height={s.h} fill="rgba(212,149,106,0.30)" />
        ))}
        {/* Matrix border + internal cell lines. */}
        <rect x={x0} y={y0} width={gw} height={gh} fill="none" stroke={accent} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {vLines.map((x, i) => (
          <line key={`v${i}`} x1={x} y1={y0} x2={x} y2={y1} stroke={accent} strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {hLines.map((y, i) => (
          <line key={`h${i}`} x1={x0} y1={y} x2={x1} y2={y} stroke={accent} strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {/* Drag-to-move target (below the corner handles in z-order). */}
      <div
        onPointerDown={startMove}
        style={{ position: 'absolute', left: pctOf(x0), top: pctOf(y0), width: pctOf(gw), height: pctOf(gh), cursor: 'move' }}
      />

      {/* Corner resize handles. */}
      {CORNERS.map(c => (
        <div
          key={c.id}
          onPointerDown={startCorner(c.id)}
          style={{
            position: 'absolute',
            left: pctOf(grid[c.xKey]),
            top: pctOf(grid[c.yKey]),
            width: 16,
            height: 16,
            transform: 'translate(-50%, -50%)',
            borderRadius: 8,
            background: FR.salt,
            border: `2px solid ${accent}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
            cursor: c.cursor,
          }}
        />
      ))}
    </div>
  );
}
