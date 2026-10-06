// Stamping a directional drawing over a character that was built elsewhere:
// putting a garment on a borrowed body. A pack of sprites gives you a walking
// body for free, but at 16 px three characters end up sharing it: the only way
// to tell them apart is a few pixels of their own (a bandage over the deaf ear,
// a bun and a brush, a rag on the head).
//
// The drawing holds one frame per view, each after its own `== <view>` line and
// the size of the sprite, where "." leaves what was already there. Every frame
// of every animation of that view (idle, walk, hurt, attack) gets it, shifted
// with the head — the first row of the frame with any pixel — so the stamp
// follows the bob of the walk instead of floating over it.
//
// Which animations belong to a view is a naming convention, so it is a
// parameter: `anims` ("*_{view}" by default, as in idle_down / walk_left) and
// `anchor` (the animation whose first frame sets the reference head row).

import type { SpriteAsset } from '../lib/types';
import { colorIndex, composite, dims, findAnimation, frameCount, getFrame, matchAnimations } from './asset';

export interface StampOptions {
  /** The drawing: one animation per view, its first frame the stamp. */
  drawing: SpriteAsset;
  /** Animations a view covers; "*" matches anything. Default "*_{view}". */
  anims?: string;
  /** Animation whose first frame sets the reference head row. Default "idle_{view}". */
  anchor?: string;
  /** "head" (default) shifts each stamp with the head; "none" never shifts. */
  align?: 'head' | 'none';
  /** Layer the stamp is painted on. Default 0 (the base). */
  layer?: number;
}

export interface StampedView {
  view: string;
  /** Animations of the asset this view stamped, in order. */
  anims: string[];
  frames: number;
  pixels: number;
  /** How far the stamp moved on each frame, lowest to highest. */
  shifts: number[];
}

export interface StampResult {
  views: StampedView[];
  /** Views of the drawing with no anchor animation on the asset: nothing stamped. */
  skipped: string[];
  frames: number;
  pixels: number;
}

/** First row of a frame with any pixel on it (0 when the frame is empty). */
export function headRow(asset: SpriteAsset, frame: number): number {
  const { width, height } = dims(asset);
  const grid = composite(asset, frame);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (grid[y]?.[x]) return y;
  }
  return 0;
}

/**
 * Stamps every view of `drawing` over `asset`, in place. Returns what each view
 * reached. The asset keeps its frames and animations: only pixels change.
 */
export function stampDrawing(asset: SpriteAsset, opts: StampOptions): StampResult {
  const { width, height } = dims(asset);
  const d = dims(opts.drawing);
  if (d.width !== width || d.height !== height) {
    throw new Error(`the drawing is ${d.width}x${d.height}, the asset is ${width}x${height}`);
  }
  const layer = opts.layer ?? 0;
  const animsPattern = opts.anims ?? '*_{view}';
  const anchorPattern = opts.anchor ?? 'idle_{view}';
  const align = opts.align ?? 'head';
  // Measured before anything is stamped: a stamp can add pixels above the head
  // and would move the reference under its own feet.
  const heads = Array.from({ length: frameCount(asset) }, (_, f) => (align === 'head' ? headRow(asset, f) : 0));

  const views: StampedView[] = [];
  const skipped: string[] = [];
  for (const anim of opts.drawing.animations ?? []) {
    const view = anim.name;
    const anchor = findAnimation(asset, anchorPattern.replace('{view}', view));
    if (!anchor || anchor.frameIndices.length === 0) {
      skipped.push(view);
      continue;
    }
    const reference = heads[anchor.frameIndices[0]] ?? 0;
    const stamp = composite(opts.drawing, anim.frameIndices[0]);
    const targets = matchAnimations(asset, animsPattern.replace('{view}', view));
    const seen = new Set<number>();
    const row: StampedView = { view, anims: targets.map(a => a.name), frames: 0, pixels: 0, shifts: [] };
    for (const target of targets) {
      for (const f of target.frameIndices) {
        if (seen.has(f)) continue;
        seen.add(f);
        const dy = (heads[f] ?? 0) - reference;
        const frame = getFrame(asset, f, layer);
        let painted = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const v = stamp[y]?.[x];
            if (!v) continue;
            const ty = y + dy;
            if (ty < 0 || ty >= height) continue;
            frame[ty][x] = colorIndex(asset, opts.drawing.palette[v]);
            painted++;
          }
        }
        row.frames++;
        row.pixels += painted;
        row.shifts.push(dy);
      }
    }
    row.shifts.sort((a, b) => a - b);
    views.push(row);
  }
  return {
    views,
    skipped,
    frames: views.reduce((n, v) => n + v.frames, 0),
    pixels: views.reduce((n, v) => n + v.pixels, 0),
  };
}
