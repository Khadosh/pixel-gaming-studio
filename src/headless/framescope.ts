// A retouch that is painted once and holds for many frames.
//
// A retouch is a drawing laid over another frame by frame, so a collar painted
// on the cat standing still showed up on that frame and nowhere else: the cat
// walked and the collar blinked (issue #43, the cat of el-patio). What the
// person painting means is "the cat has a collar", not "frame 3 has a collar".
//
// So a frame of a retouch can name the frames it holds for instead of being one
// of them: `== *` holds for every frame of the drawing, `== *_right` for every
// frame of every animation whose name matches (`idle_right`, `walk_right`: the
// right view). Only `*` is special, and only in a `retouch_of:` file. The frames
// are found in the drawing underneath when the retouch is laid, so a base that
// is redrawn — or that grows a frame — still gets the collar on all of them.
//
// Pure: no Node imports, the web editor uses it to paint across a view and to
// write such a block when what was painted is the same on every frame of it.

import type { SpriteAsset } from '../lib/types';
import { VIEWS8 } from './contract';

/** Every frame of the drawing. */
export const SCOPE_ALL = '*';

/** Is this frame slot a scope (`*`, `*_right`, `walk_*`) rather than "<anim> [pos]"? */
export function isScope(slot: string): boolean {
  return slot.includes('*');
}

/** Does `name` match `pattern`, where `*` stands for any run of characters? */
export function matchesScope(pattern: string, name: string): boolean {
  const re = new RegExp(`^${pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return re.test(name);
}

function frameTotal(asset: SpriteAsset): number {
  return asset.layers?.[0]?.frames.length ?? asset.frames?.length ?? 0;
}

/**
 * The frames of `asset` a scope holds for, in order: all of them for `*`, else
 * every frame of every animation whose name matches. Empty when nothing matches.
 */
export function framesOfScope(asset: SpriteAsset, pattern: string): number[] {
  if (pattern === SCOPE_ALL) return Array.from({ length: frameTotal(asset) }, (_, i) => i);
  const out = new Set<number>();
  for (const a of asset.animations ?? []) {
    if (matchesScope(pattern, a.name)) for (const f of a.frameIndices) out.add(f);
  }
  return [...out].sort((a, b) => a - b);
}

/** The view an animation name ends in (`walk_down_right` → `down_right`), if any. */
export function viewOf(anim: string): string | undefined {
  const views = [...VIEWS8].sort((a, b) => b.length - a.length);
  return views.find(v => anim === v || anim.endsWith(`_${v}`));
}

export interface ViewGroup {
  view: string;
  /** The scope that names exactly these frames (`*_right`). */
  pattern: string;
  frames: number[];
}

/**
 * The frames of each view: a frame belongs to a view when every animation it is
 * in ends in that view. A group is given only when its scope, laid back, names
 * exactly those frames — `*_right` also matches `walk_down_right`, so on a
 * sprite with diagonals that view has no scope of its own — and only when it
 * has more than one frame, which is when painting once is worth anything.
 */
export function viewGroups(asset: SpriteAsset): ViewGroup[] {
  const viewOfFrame = new Map<number, string | null>();
  for (const a of asset.animations ?? []) {
    const v = viewOf(a.name) ?? null;
    for (const f of a.frameIndices) {
      const had = viewOfFrame.get(f);
      viewOfFrame.set(f, had === undefined || had === v ? v : null);
    }
  }
  const byView = new Map<string, number[]>();
  for (const [f, v] of viewOfFrame) {
    if (!v) continue;
    if (!byView.has(v)) byView.set(v, []);
    byView.get(v)!.push(f);
  }
  const groups: ViewGroup[] = [];
  for (const [view, frames] of byView) {
    frames.sort((a, b) => a - b);
    const pattern = `*_${view}`;
    const named = framesOfScope(asset, pattern);
    if (frames.length < 2 || named.length !== frames.length || named.some((f, i) => f !== frames[i])) continue;
    groups.push({ view, pattern, frames });
  }
  return groups.sort((a, b) => a.frames[0] - b.frames[0]);
}

/** Where painting on a frame also lands: that frame only, its view, or every frame. */
export type PaintAcross = 'frame' | 'view' | 'all';

/** The frames a stroke on `frame` lands on (always including `frame`). */
export function framesAcross(asset: SpriteAsset, frame: number, across: PaintAcross): number[] {
  if (across === 'all') return framesOfScope(asset, SCOPE_ALL);
  if (across === 'view') {
    const g = viewGroups(asset).find(v => v.frames.includes(frame));
    if (g) return g.frames;
  }
  return [frame];
}
