// Cut & Sew image annotations — the red box / red text overlays the operator
// draws on call-out photos (pages 07/08).
//
// One map lives on each Cut & Sew block:  block.annotations = { [slot]: Annotation[] }
// keyed by the SAME image slot names the call-out photos already use
// (sketch-callout-page1/2, construction-detail-{1..8}, construction-detail-N-support).
// Because the library block and every Style tech pack that borrowed it point at
// the one block, a mark drawn in either place shows everywhere — they always match.
//
// Persistence rides on the existing cut_sew localStorage record (annotations is
// not a cloud column, exactly like the placed dots and call-out text). The Style
// side reads/writes the linked block BY ID so it never forks into its own copy.

import { getCutSew, saveCutSew } from './cutSewStore';
import { CALLOUT_REF_RATIO, CALLOUT_MAIN_RATIO, CALLOUT_SUPPORT_RATIO } from '../components/techpack/techPackConstants';

/**
 * @typedef {{ id: string, type: 'box',  x: number, y: number, w: number, h: number, rot?: number }
 *         | { id: string, type: 'text', x: number, y: number, text: string }} Annotation
 * Coordinates are normalized 0..1 of the displayed photo, so a mark lands in the
 * same spot in the editor, the live preview and the PDF, at any size.
 */

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
  `an-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** A fresh red box, centred-ish so the operator can drag it into place. */
export function newBox()  { return { id: uid(), type: 'box',  x: 0.30, y: 0.28, w: 0.34, h: 0.30, rot: 0 }; }
/** A fresh red text mark, ready to edit. */
export function newText() { return { id: uid(), type: 'text', x: 0.28, y: 0.55, text: 'Note' }; }

/** The annotation list for one slot — always an array. */
export function slotAnnotations(map, slot) {
  return (map && Array.isArray(map[slot])) ? map[slot] : [];
}

/** Immutably set one slot's list; drops the key when the list is empty. */
export function withSlotAnnotations(map, slot, list) {
  const next = { ...(map || {}) };
  if (list && list.length) next[slot] = list;
  else delete next[slot];
  return next;
}

// How a given image slot should be shown in the annotator. The aspect here is
// only a pre-load FALLBACK + the title — the annotator measures the real cropped
// image and opens at its exact width-to-height, so the editor always matches the
// card/page no matter the slot (single ref, two stacked 2:3 refs, stitch cards…).
// Ordered so `-support` and the `…-callout-…` references are matched before the
// generic stitch / detail close-ups.
export function describeSlot(slot) {
  const s = slot || '';
  if (s.endsWith('-support'))               return { title: 'Supporting image', aspect: CALLOUT_SUPPORT_RATIO, fit: 'cover' };
  if (s.startsWith('sketch-callout-'))      return { title: 'Garment reference', aspect: CALLOUT_REF_RATIO,    fit: 'contain' };
  if (s.startsWith('seam-stitch-callout-')) return { title: 'Stitch reference',  aspect: CALLOUT_REF_RATIO,    fit: 'contain' };
  if (s.startsWith('seam-stitch-'))         return { title: 'Stitch close-up',   aspect: CALLOUT_MAIN_RATIO,   fit: 'cover' };
  if (s.startsWith('construction-detail-')) return { title: 'Detail close-up',   aspect: CALLOUT_MAIN_RATIO,   fit: 'cover' };
  return { title: 'Image', aspect: 1, fit: 'cover' };
}

// ── Style-side glue: read/write annotations on the LINKED Cut & Sew block ──
// Single source of truth = the block. Read-merge-write only the edited slot so
// two concurrent editors clobber at most one slot, not the whole map.

/** Load the linked block's whole annotations map (or {}). */
export async function loadBlockAnnotations(blockId) {
  if (!blockId) return {};
  const block = await getCutSew(blockId);
  return (block && block.annotations) || {};
}

/** Persist one slot's list onto the linked block; returns the merged map. */
export async function saveBlockSlotAnnotations(blockId, slot, list) {
  if (!blockId) return {};
  const block = await getCutSew(blockId);
  const merged = withSlotAnnotations((block && block.annotations) || {}, slot, list);
  await saveCutSew(blockId, { annotations: merged });
  return merged;
}
