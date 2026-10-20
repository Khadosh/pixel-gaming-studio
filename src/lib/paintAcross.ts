// Painting once for many frames (issue #43).
//
// The editor edits one frame at a time, and an animated drawing is many: a
// collar painted on the cat standing still was on that frame and nowhere else,
// so in the game it blinked as the cat walked. With "paint across" on, what a
// stroke changes on the frame being edited is copied to the other frames of
// its view (or of the whole drawing), cell by cell, on the same layer. Only the
// cells the stroke changed travel: the legs that move in the walking frames
// stay as they are.
//
// The frames are still separate in the editor, so what you see is still what
// the drawing ends up being; saving a retouch gathers what came out the same on
// every frame of a view into one block (`gatherScoped` in textDrawing.ts).

import type { Frame, SpriteAsset } from './types';
import { framesAcross, type PaintAcross } from '@/headless/framescope';

export type { PaintAcross };

/**
 * `next` with every cell where `after` differs from `before` copied, on layer
 * `layer`, to the other frames that `frame` paints across. Returns `next`
 * itself when there is nothing to copy. Neither argument is modified.
 */
export function spreadEdit(
  next: SpriteAsset,
  layer: number,
  frame: number,
  before: Frame,
  after: Frame,
  across: PaintAcross,
): SpriteAsset {
  const targets = framesAcross(next, frame, across).filter(f => f !== frame);
  if (targets.length === 0) return next;
  const changed: [number, number, number][] = [];
  after.forEach((row, r) => row.forEach((v, c) => { if (before[r]?.[c] !== v) changed.push([r, c, v]); }));
  if (changed.length === 0) return next;
  const layers = next.layers!.map((l, i) => {
    if (i !== layer) return l;
    const frames = [...l.frames];
    for (const f of targets) {
      if (!frames[f]) continue;
      const copy = frames[f].map(row => [...row]);
      for (const [r, c, v] of changed) if (copy[r] && c < copy[r].length) copy[r][c] = v;
      frames[f] = copy;
    }
    return { ...l, frames };
  });
  return { ...next, layers };
}

/**
 * Is `next` the same as `prev` except for one frame of one layer? Only then is
 * a change a stroke that can be spread; adding a frame, a layer or moving
 * animations is not, and is let through untouched.
 */
export function onlyFrameChanged(prev: SpriteAsset, next: SpriteAsset, layer: number, frame: number): boolean {
  const a = prev.layers ?? [];
  const b = next.layers ?? [];
  if (a.length !== b.length || layer < 0 || layer >= b.length) return false;
  return b.every((l, i) => {
    if (l.id !== a[i].id || l.frames.length !== a[i].frames.length) return false;
    return l.frames.every((f, k) => (i === layer && k === frame) || f === a[i].frames[k]);
  });
}
