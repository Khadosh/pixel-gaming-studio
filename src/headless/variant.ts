// Variants of an asset: the same drawing with a few pixels changed (a face
// that frowns, a sword with blood), kept on a layer of their own so the base
// is never touched. Rebuilding a variant after the base changes is running
// the same command again.

import type { Frame, SpriteAsset, SpriteLayer } from '../lib/types';
import { blankFrame, colorIndex, dims, frameCount } from './asset';
import { applyDrawOps, type DrawOp } from './ops';
import { ERASE, fromAscii } from './ascii';
import type { RetouchCoverage } from './divergence';
import { framesOfScope } from './framescope';

export interface VariantOptions {
  id: string;
  name?: string;
  /** Name of the layer that holds the changes (default "variante"). */
  layer?: string;
  /** First frame the overlay and the ops land on (default 0). */
  frame?: number;
  ops?: DrawOp[];
  /**
   * A from_ascii drawing the size of the asset: every glyph but "." is laid over
   * the base, and "!" takes the pixel underneath out (see `ERASE_GLYPH`).
   */
  overlay?: string;
  overlaySource?: string;
}

export interface VariantResult extends RetouchCoverage {
  asset: SpriteAsset;
}

/** The visible layers of a frame flattened into one grid of palette indices. */
function composited(asset: SpriteAsset, f: number, width: number, height: number, upTo: number): Frame {
  const grid = blankFrame(width, height);
  for (let l = 0; l < upTo; l++) {
    const layer = asset.layers![l];
    if (!layer.isVisible || layer.opacity === 0) continue;
    const src = layer.frames[f];
    if (!src) continue;
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (src[r]?.[c]) grid[r][c] = src[r][c];
  }
  return grid;
}

/**
 * A deep copy of `base` with the changes on a new top layer. `base` is not
 * modified.
 *
 * An overlay can also **take pixels out** (`!`, `ERASE_GLYPH`). There is no way
 * to express a hole with plain layer compositing, so an erased pixel is cleared
 * from the layers underneath in the copy: the file on disk is untouched, the
 * recipe is still the source, and everything that reads the result — the PNG,
 * the `.pss.json`, `to_ascii`, the contact sheets — simply finds no pixel there.
 */
export function makeVariant(base: SpriteAsset, opts: VariantOptions): VariantResult {
  const asset: SpriteAsset = JSON.parse(JSON.stringify(base));
  asset.id = opts.id;
  asset.name = opts.name ?? opts.id;
  const { width, height } = dims(asset);
  const count = frameCount(asset);
  const start = opts.frame ?? 0;
  if (start < 0 || start >= count) throw new Error(`frame ${start} does not exist (the asset has ${count})`);

  const layer: SpriteLayer = {
    id: `layer-${opts.layer ?? 'variante'}`,
    name: opts.layer ?? 'variante',
    isVisible: true,
    isLocked: false,
    opacity: 1,
    frames: Array.from({ length: count }, () => blankFrame(width, height)),
  };
  asset.layers = [...asset.layers!, layer];
  const top = asset.layers.length - 1;

  // What the base said before the layer got a word: the divergence is measured
  // against this, so it has to be read before a hole is punched in it.
  const under: Frame[] = Array.from({ length: count }, (_, f) => composited(asset, f, width, height, top));

  // Where the overlay says "take this out": cleared from every layer below,
  // because a layer cannot paint a hole.
  const holes: [number, number, number][] = [];
  if (opts.overlay !== undefined) {
    const { asset: over, scoped } = fromAscii(opts.overlay, { sourcePath: opts.overlaySource, defaultId: opts.id });
    const od = dims(over);
    if (od.width !== width || od.height !== height) {
      throw new Error(`overlay is ${od.width}x${od.height}, the asset is ${width}x${height}`);
    }
    const frames = over.layers![0].frames;
    if (start + frames.length > count) {
      throw new Error(`overlay has ${frames.length} frames from ${start}, the asset has ${count}`);
    }
    const lay = (src: Frame, f: number) => {
      const dst = layer.frames[f];
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const v = src[r][c];
          if (v === ERASE) holes.push([f, r, c]);
          else if (v) dst[r][c] = colorIndex(asset, over.palette[v]);
        }
      }
    };
    // What holds for many frames first, so a frame of its own paints over it.
    // The frames are looked up in the base, never in the overlay: a base that
    // grew a frame of walking gets the collar on it too.
    for (const s of scoped) {
      const targets = framesOfScope(base, s.pattern);
      if (targets.length === 0) {
        const names = (base.animations ?? []).map(a => a.name).join(', ') || 'none';
        throw new Error(`overlay "== ${s.pattern}" names no frame of the drawing (its animations: ${names})`);
      }
      for (const f of targets) lay(s.grid, f);
    }
    frames.forEach((src, k) => lay(src, start + k));
  }
  for (const [f, r, c] of holes) {
    for (let l = 0; l < top; l++) {
      const below = asset.layers![l].frames[f];
      if (below?.[r]?.[c]) below[r][c] = 0;
    }
  }
  if (opts.ops && opts.ops.length > 0) applyDrawOps(asset, start, opts.ops, top);

  let painted = 0;
  let changed = 0;
  let erased = 0;
  let ink = 0;
  let divergent = 0;
  for (let f = 0; f < count; f++) {
    const was = under[f];
    const now = composited(asset, f, width, height, asset.layers!.length);
    const mine = layer.frames[f];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const v = mine[r][c];
        if (v) {
          painted++;
          if (asset.palette[was[r][c]] !== asset.palette[v]) changed++;
        }
        if (was[r][c] && !now[r][c]) erased++;
        if (was[r][c] || now[r][c]) ink++;
        if (asset.palette[was[r][c]] !== asset.palette[now[r][c]]) divergent++;
      }
    }
  }
  return { asset, painted, changed, erased, divergent, ink, share: ink === 0 ? 0 : divergent / ink };
}
