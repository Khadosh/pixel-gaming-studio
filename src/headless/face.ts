// Finding the face on a sprite nobody drew for you.
//
// A sprite pack hands you a body with a face already on it, and if you want to
// add something of your own — a moustache, a headband, glasses, a scar, a tear
// — you first have to know where the face is, frame by frame, while the head
// bobs with the walk and turns with the direction. These are the landmarks a
// few palette colors are enough to find:
//
// - the eyes: ink with skin on both sides of it (two of them facing the camera,
//   one in profile);
// - the hairline: hair with the shade of the forehead under it, with how many
//   rows of hair there are above that shade (so a headband can sit one, two or
//   three pixels up without a second pass over the pixels);
// - the skin: every pixel of it and its bounding box, so anything painted on a
//   face (a moustache, a blush, a scar) can stay off the outline.
//
// Nothing here draws: it reports. Which animation belongs to which direction is
// a naming convention, so it is a parameter (`anims`, "*_{view}" by default).

import type { SpriteAsset } from '../lib/types';
import { composite, dims, frameCount, matchAnimations, normalizeHex } from './asset';

export interface FacePointsOptions {
  /** Skin colors, lit and shaded; with `ink`, the eyes are reported. */
  skin?: string[];
  /** Outline / eye colors. */
  ink?: string[];
  /** Hair colors, for the hairline. */
  hair?: string[];
  /** The shade of the forehead right under the hairline. */
  forehead?: string[];
  /** Animations a view covers; "*" matches anything. Default "*_{view}". */
  anims?: string;
  /** Views looked for, in order. Default down, up, left, right. */
  views?: string[];
}

export interface FaceEyes {
  /** Topmost row with eyes on it: the line a moustache or a pair of glasses hangs from. */
  row: number;
  /** Columns of the eyes on that row, left to right (one of them in profile). */
  xs: number[];
  /** Every eye pixel found, top to bottom and left to right. */
  pixels: [number, number][];
}

export interface FaceSkin {
  /** [x0, y0, x1, y1]: the head, the cheek and the chin at a glance. */
  box: [number, number, number, number];
  /** Every skin pixel, top to bottom and left to right: what may be painted on. */
  pixels: [number, number][];
}

export interface FacePoints {
  frame: number;
  /** The view that claims the frame, null when no animation does. */
  view: string | null;
  /** Animations the frame belongs to. */
  anims: string[];
  eyes: FaceEyes | null;
  /** [x, y, depth]: a hair pixel and how many rows below it the forehead starts. */
  hairline: [number, number, number][];
  skin: FaceSkin | null;
}

export interface FacePointsResult {
  width: number;
  height: number;
  frames: FacePoints[];
}

const DEFAULT_VIEWS = ['down', 'up', 'left', 'right'];

function colorSet(colors: string[] | undefined): Set<string> {
  return new Set((colors ?? []).map(normalizeHex));
}

/** Every frame's face landmarks, with the view each frame belongs to. */
export function facePoints(asset: SpriteAsset, opts: FacePointsOptions): FacePointsResult {
  const { width, height } = dims(asset);
  const skin = colorSet(opts.skin);
  const ink = colorSet(opts.ink);
  const hair = colorSet(opts.hair);
  const forehead = colorSet(opts.forehead);
  const pattern = opts.anims ?? '*_{view}';

  const view = new Map<number, string>();
  const anims = new Map<number, string[]>();
  for (const v of opts.views ?? DEFAULT_VIEWS) {
    for (const anim of matchAnimations(asset, pattern.replace('{view}', v))) {
      for (const f of anim.frameIndices) if (!view.has(f)) view.set(f, v);
    }
  }
  for (const anim of asset.animations ?? []) {
    for (const f of anim.frameIndices) {
      const list = anims.get(f) ?? [];
      if (!list.includes(anim.name)) list.push(anim.name);
      anims.set(f, list);
    }
  }

  const frames: FacePoints[] = [];
  for (let f = 0; f < frameCount(asset); f++) {
    const grid = composite(asset, f);
    const at = (x: number, y: number): string | null => {
      const v = grid[y]?.[x];
      return v ? normalizeHex(asset.palette[v] ?? '') : null;
    };
    const is = (set: Set<string>, x: number, y: number): boolean => {
      const hex = at(x, y);
      return hex !== null && set.has(hex);
    };

    const pixels: [number, number][] = [];
    if (skin.size > 0 && ink.size > 0) {
      for (let y = 0; y < height; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (is(ink, x, y) && is(skin, x - 1, y) && is(skin, x + 1, y)) pixels.push([x, y]);
        }
      }
    }
    let eyes: FaceEyes | null = null;
    if (pixels.length > 0) {
      const row = Math.min(...pixels.map(p => p[1]));
      eyes = { row, xs: pixels.filter(p => p[1] === row).map(p => p[0]).sort((a, b) => a - b), pixels };
    }

    const hairline: [number, number, number][] = [];
    if (hair.size > 0 && forehead.size > 0) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!is(hair, x, y)) continue;
          let depth = 1;
          while (y + depth < height && is(hair, x, y + depth)) depth++;
          if (y + depth < height && is(forehead, x, y + depth)) hairline.push([x, y, depth]);
        }
      }
    }

    let box: [number, number, number, number] | null = null;
    const bare: [number, number][] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!is(skin, x, y)) continue;
        bare.push([x, y]);
        box = box
          ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
          : [x, y, x, y];
      }
    }

    frames.push({
      frame: f, view: view.get(f) ?? null, anims: anims.get(f) ?? [], eyes, hairline,
      skin: box ? { box, pixels: bare } : null,
    });
  }
  return { width, height, frames };
}

/** One line per frame, for a person reading the terminal. */
export function facePointsTable(result: FacePointsResult): string {
  const lines = ['frame view   eyes                 skin box         hairline (x,y/rows of hair)'];
  for (const f of result.frames) {
    const eyes = f.eyes ? `row ${f.eyes.row} x ${f.eyes.xs.join(',')}` : '-';
    const skin = f.skin ? f.skin.box.join(',') : '-';
    const hair = f.hairline.length > 0
      ? f.hairline.map(([x, y, d]) => `${x},${y}/${d}`).join(' ')
      : '-';
    lines.push(`${String(f.frame).padEnd(5)} ${(f.view ?? '-').padEnd(6)} ${eyes.padEnd(20)} ${skin.padEnd(16)} ${hair}`);
  }
  return lines.join('\n');
}
