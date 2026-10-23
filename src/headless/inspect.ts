// Control tools for a batch of assets: a contact sheet that puts each one next
// to a reference sprite (the player) on a grid, to catch scale mistakes before
// they reach a map, and a lint that flags off-palette colors, sizes off the
// grid, lone pixels and tiles whose edges do not meet when repeated.

import type { Frame, SpriteAsset } from '../lib/types';
import { composite, dims, frameCount, normalizeHex, onPalette } from './asset';
import { despeckle } from './ops';
import { matchesScope } from './framescope';
import { VIEWS, checkContract, contractViews, roleOf, viewOf, type AnimationContract } from './contract';
import { checkProportions, proportionWarnings, type ProportionBase, type ProportionReport } from './proportions';
import { blankImage, blitBlend, setPixel, type BlendMode, type Rgba } from './png';
import { hexToRgba, renderFrame, type RgbaTuple } from './render';

// ── A 3×5 pixel font for labels ─────────────────────────────────────────

const FONT: Record<string, string> = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110',
  e: '111100110100111', f: '111100110100100', g: '011100101101011', h: '101101111101101',
  i: '111010010010111', j: '001001001101010', k: '101101110101101', l: '100100100100111',
  m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100',
  q: '010101101110011', r: '110101110101101', s: '011100010001110', t: '111010010010010',
  u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101',
  y: '101101010010010', z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  _: '000000000000111', '-': '000000111000000', '.': '000000000000010', ' ': '000000000000000',
  '/': '001001010100100', '(': '010100100100010', ')': '010001001001010',
};

export function textWidth(text: string, px: number): number {
  return text.length === 0 ? 0 : (text.length * 4 - 1) * px;
}

/** Draws lowercase text with the 3×5 font; unknown characters become a box. */
export function drawText(img: Rgba, text: string, x: number, y: number, px: number, color: RgbaTuple): void {
  [...text.toLowerCase()].forEach((ch, i) => {
    const bits = FONT[ch] ?? '111101101101111';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (bits[r * 3 + c] !== '1') continue;
        for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
          setPixel(img, x + (i * 4 + c) * px + dx, y + r * px + dy, color);
        }
      }
    }
  });
}

// ── Contact sheet ───────────────────────────────────────────────────────

/**
 * The frame with the most painted pixels (the first one on a tie). An effect
 * that grows and fades (a sparkle, a ripple) usually starts on a dot or an
 * empty frame, so frame 0 says little about how big it gets on screen.
 */
export function fullestFrame(asset: SpriteAsset): number {
  let best = 0;
  let most = -1;
  for (let i = 0; i < frameCount(asset); i++) {
    const painted = composite(asset, i).reduce((n, row) => n + row.filter(v => v !== 0).length, 0);
    if (painted > most) { most = painted; best = i; }
  }
  return best;
}

export interface ContactItem {
  asset: SpriteAsset;
  frame?: number;
  /** The label under it (default: the asset id). */
  name?: string;
}

export interface ContactOptions {
  scale?: number;
  /** Background hex. */
  background?: string;
  /** Grid every N asset pixels (0 = none), anchored at each cell's feet. */
  grid?: number;
  /** Shown left of every item, bottom-aligned, to compare sizes. */
  reference?: ContactItem;
  /** Items per row before wrapping (default: all in one row up to 8). */
  columns?: number;
  /**
   * How each item is laid over the background: 'over' (default) composites
   * semi-transparent pixels the way the game does, so a shadow or a fog wisp
   * reads as it will on the map; 'add' sums them, to preview a light halo.
   * The reference is always drawn 'over'.
   */
  blend?: BlendMode;
  /** How many items go in each row, in order (overrides columns): every frame of an asset on its own row. */
  rows?: number[];
  /**
   * A picture (the reference a piece is drawn from, a PNG) on the left of the
   * sheet, as tall as the tallest item at its scale and standing on the first
   * row's baseline: the control "next to the reference" the art method asks
   * for (#33). Shrunk by averaging, grown by whole pixels.
   */
  picture?: { image: Rgba; name?: string };
}

/** A picture scaled to a height, keeping its proportions: averaged down, nearest up. */
export function scaleToHeight(src: Rgba, height: number): Rgba {
  const h = Math.max(1, Math.round(height));
  const w = Math.max(1, Math.round(src.width * h / src.height));
  const out = blankImage(w, h);
  const fx = src.width / w, fy = src.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4, al = src.data[i + 3];
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a) out.data.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / n)], o);
    }
  }
  return out;
}

function shade(rgba: RgbaTuple, amount: number): RgbaTuple {
  const lum = (rgba[0] * 299 + rgba[1] * 587 + rgba[2] * 114) / 1000;
  const k = lum > 128 ? -amount : amount;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v + k)));
  return [clamp(rgba[0]), clamp(rgba[1]), clamp(rgba[2]), 255];
}

/**
 * Each item in a cell: the reference on the left, the item on the right, both
 * standing on the same baseline over the background grid, name underneath.
 */
export function contactSheetMany(items: ContactItem[], opts: ContactOptions = {}): Rgba {
  if (items.length === 0) throw new Error('contact needs at least one asset');
  const scale = opts.scale ?? 4;
  const grid = opts.grid ?? 16;
  const bg = hexToRgba(opts.background ?? '#a6c778');
  const lineColor = shade(bg, 28);
  const textColor: RgbaTuple = shade(bg, 140);
  const label = Math.max(1, Math.floor(scale / 2));
  const pad = Math.max(grid, 4) * scale;
  const ref = opts.reference;
  const refDims = ref ? dims(ref.asset) : { width: 0, height: 0 };
  const gap = ref ? (grid || 4) : 0;

  const cells = items.map(it => {
    const d = dims(it.asset);
    const w = refDims.width + gap + d.width;
    const h = Math.max(refDims.height, d.height);
    const name = it.name ?? it.asset.id;
    return { it, d, w, h, name };
  });
  const columns = Math.max(1, opts.columns ?? Math.min(8, items.length));
  const rows: (typeof cells)[] = [];
  if (opts.rows) {
    let i = 0;
    for (const n of opts.rows) { if (n > 0) rows.push(cells.slice(i, i + n)); i += n; }
    if (i < cells.length) rows.push(cells.slice(i));
  } else {
    for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));
  }
  // The picture on the left, as tall as the tallest item drawn.
  const picture = opts.picture ? scaleToHeight(opts.picture.image, Math.max(...cells.map(c => c.d.height)) * scale) : undefined;
  const pictureName = opts.picture?.name ?? 'ref';
  const left = picture ? Math.max(picture.width, textWidth(pictureName, label)) + pad : 0;

  const labelH = (5 + 3) * label;
  const cellW = (c: (typeof cells)[number]) => Math.max(c.w * scale, textWidth(c.name, label));
  const rowW = rows.map(r => r.reduce((s, c) => s + cellW(c) + pad, pad + left));
  const rowH = rows.map(r => Math.max(...r.map(c => c.h)) * scale + labelH + pad);
  const img = blankImage(Math.max(...rowW), Math.max(rowH.reduce((s, h) => s + h, pad), pad + (picture?.height ?? 0) + labelH + pad), [bg[0], bg[1], bg[2], 255]);
  if (picture) {
    const baseline = pad + Math.max(...rows[0].map(c => c.h)) * scale;
    blitBlend(img, picture, pad, Math.max(pad, baseline - picture.height));
    drawText(img, pictureName, pad, Math.max(pad, baseline - picture.height) + picture.height + 3 * label, label, textColor);
  }

  let y0 = pad;
  rows.forEach((row, ri) => {
    const baseline = y0 + Math.max(...row.map(c => c.h)) * scale;
    let x0 = pad + left;
    for (const c of row) {
      const w = c.w * scale;
      // Grid lines behind the drawing area, anchored at the left edge and the baseline.
      if (grid > 0) {
        const top = baseline - c.h * scale;
        for (let gx = 0; gx <= c.w; gx += grid) {
          for (let y = top; y < baseline; y++) setPixel(img, x0 + gx * scale - (gx === c.w ? 1 : 0), y, lineColor);
        }
        for (let gy = 0; gy <= c.h; gy += grid) {
          const y = baseline - gy * scale - (gy === 0 ? 1 : 0);
          for (let x = x0; x < x0 + w; x++) setPixel(img, x, y, lineColor);
        }
      }
      if (ref) {
        const frame = composite(ref.asset, ref.frame ?? 0);
        blitBlend(img, renderFrame(ref.asset, frame, scale), x0, baseline - refDims.height * scale);
      }
      const frame = composite(c.it.asset, c.it.frame ?? 0);
      blitBlend(img, renderFrame(c.it.asset, frame, scale), x0 + (refDims.width + gap) * scale,
        baseline - c.d.height * scale, opts.blend ?? 'over');
      drawText(img, c.name, x0, baseline + 3 * label, label, textColor);
      x0 += cellW(c) + pad;
    }
    y0 += rowH[ri];
  });
  return img;
}

// ── Lint ────────────────────────────────────────────────────────────────

export interface LintOptions {
  /** Allowed hex colors; colors outside are reported. */
  palette?: string[];
  /**
   * The sides of a tile must be multiples of this. A sprite keeps the size it is drawn at (a 38 × 38 portrait, a
   * 32 × 48 chibi): the rule is for what lies on the grid, a tile (`tile`) or a terrain asset.
   */
  grid?: number;
  /**
   * The canvases a sprite may have, by name (`visual.sizes`): one that is none
   * of them is a warning naming them. Not on a tile, which the grid measures.
   */
  sizes?: Record<string, [number, number]>;
  /** Check that opposite edges meet when the asset is repeated as a tile. */
  tile?: boolean;
  /**
   * Report lone pixels (the despeckle rule). By default only on tiles and terrain, where a lone pixel is noise; on a
   * sprite it is mostly drawn on purpose (the light in an eye, a hair tip, a dot between two lines of ink), so a
   * sprite counts them only with `lone: true` (a sprite that came out of `pixelize`).
   */
  lone?: boolean;
  /** Same knobs as despeckle (defaults 1 and 5). */
  strength?: number;
  majority?: number;
  /**
   * Report detached pieces: in a frame, a group of painted pixels of at least
   * this size (true = 4) that does not touch the main body, not even on a
   * diagonal. For characters, where the body is one piece: a crown split off
   * by a transparent row, a bun left behind by a sheet cut one pixel off.
   */
  pieces?: boolean | number;
  /**
   * Animations drawn in pieces on purpose (`escondido`: two eyes in the dark;
   * `*_dark`), by name or with `*`: a frame only they use is not checked for
   * detached pieces. A frame another animation uses still is.
   */
  piecesSkip?: string[];
  /**
   * The animation contract the asset is supposed to keep (`contract.ts`):
   * an animation it asks for and the asset has not got, or has empty, is a
   * warning. Extras are not: a game sits one character down to meditate.
   */
  contract?: AnimationContract;
  /**
   * The project's proportion map (`proportions.ts`): a drawing whose chin,
   * shoulder or hem is somewhere else than the project declares. This is the
   * question a lint could not answer before — "is this character out of
   * proportion?" — and it is answered **per pose**, with one caveat the game
   * found out the hard way: the widths and the head/shoulder count only hold
   * facing the camera. A profile's shoulder is narrower on purpose, so those
   * checks are skipped there and said to be skipped.
   */
  proportions?: ProportionBase;
}

export interface Piece { size: number; x: number; y: number }

/**
 * Groups of painted pixels (8-connected) of at least minSize that are not the
 * biggest one, biggest first. x,y is the top-left pixel of each group.
 */
export function detachedPieces(frame: Frame, minSize = 4): Piece[] {
  const h = frame.length, w = frame[0]?.length ?? 0;
  const seen = new Uint8Array(w * h);
  const groups: Piece[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!frame[y][x] || seen[y * w + x]) continue;
      let size = 0, top = { x, y };
      const stack = [[x, y]];
      seen[y * w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        size++;
        if (cy < top.y || (cy === top.y && cx < top.x)) top = { x: cx, y: cy };
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || !frame[ny][nx]) continue;
            seen[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      groups.push({ size, x: top.x, y: top.y });
    }
  }
  groups.sort((a, b) => b.size - a.size);
  return groups.slice(1).filter(g => g.size >= minSize);
}

export interface LintReport {
  id: string;
  width: number;
  height: number;
  warnings: string[];
  /**
   * What the proportion map checked, pose by pose, including what it did
   * **not** check and why. A skipped check said out loud is not a pass: a
   * profile whose widths were never looked at should not read as clean.
   */
  proportions?: { pose: string; view: string; report: ProportionReport }[];
}

function usedIndices(asset: SpriteAsset): Map<number, number> {
  const counts = new Map<number, number>();
  for (let f = 0; f < frameCount(asset); f++) {
    for (const row of composite(asset, f)) for (const v of row) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

function mismatches(a: (i: number) => number, b: (i: number) => number, n: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (a(i) !== b(i)) k++;
  return k;
}

/** How unlike two opposite edges are, against how unlike neighbouring inner lines usually are. */
function seam(frame: Frame, axis: 'x' | 'y'): { edge: number; typical: number; holes: number } {
  const h = frame.length, w = frame[0]?.length ?? 0;
  const px = (x: number, y: number) => frame[y]?.[x] ?? 0;
  let edge: number, inner = 0, count = 0, holes = 0;
  if (axis === 'x') {
    edge = mismatches(y => px(w - 1, y), y => px(0, y), h);
    for (let x = 0; x < w - 1; x++) { inner += mismatches(y => px(x, y), y => px(x + 1, y), h); count++; }
    for (let y = 0; y < h; y++) { if (!px(0, y)) holes++; if (!px(w - 1, y)) holes++; }
  } else {
    edge = mismatches(x => px(x, h - 1), x => px(x, 0), w);
    for (let y = 0; y < h - 1; y++) { inner += mismatches(x => px(x, y), x => px(x, y + 1), w); count++; }
    for (let x = 0; x < w; x++) { if (!px(x, 0)) holes++; if (!px(x, h - 1)) holes++; }
  }
  return { edge, typical: count ? inner / count : 0, holes };
}

/** "walk_down 2" for each frame that belongs to an animation (the first one that lists it). */
function frameNames(asset: SpriteAsset): string[] {
  const names: string[] = [];
  for (const a of asset.animations ?? []) {
    a.frameIndices.forEach((fi, i) => { if (names[fi] === undefined) names[fi] = `${a.name} ${i}`; });
  }
  return names;
}

export function lintAsset(asset: SpriteAsset, opts: LintOptions = {}): LintReport {
  const { width, height } = dims(asset);
  const warnings: string[] = [];
  // the rules of what lies on the grid (its size, its noise) are a tile's, not a sprite's
  const tileLike = !!opts.tile || asset.category === 'terrain';

  if (opts.palette) {
    const allowed = new Set(opts.palette.map(normalizeHex));
    for (const [idx, n] of usedIndices(asset)) {
      const hex = asset.palette[idx];
      if (!hex) warnings.push(`index ${idx} is used (${n} px) but has no palette color`);
      else if (!onPalette(allowed, hex)) warnings.push(`color ${normalizeHex(hex)} is off the palette (${n} px)`);
    }
  }

  if (opts.grid && tileLike) {
    if (width % opts.grid || height % opts.grid) {
      warnings.push(`size ${width}x${height} is not a multiple of ${opts.grid}`);
    }
  }

  if (opts.sizes && !tileLike && Object.keys(opts.sizes).length) {
    const named = Object.entries(opts.sizes);
    if (!named.some(([, [w, h]]) => w === width && h === height)) {
      warnings.push(`size ${width}x${height} is none of the world's (${named.map(([n, [w, h]]) => `${n} ${w}x${h}`).join(', ')})`);
    }
  }

  if (opts.contract) {
    const c = checkContract(asset, opts.contract);
    if (c.missing.length) warnings.push(`contract ${c.id}: no animation ${c.missing.join(', ')}`);
    if (c.empty.length) warnings.push(`contract ${c.id}: animation ${c.empty.join(', ')} has no frame`);
  }

  let proportions: LintReport['proportions'];
  if (opts.proportions) {
    // The first frame of the poses the map describes — by default the idles,
    // and nothing else. A map is the body standing: mid-stride a walk swings
    // an arm past the shoulder and a sit folds the whole figure up, and
    // measuring those against the standing numbers reds a drawing that is
    // right. See `poses` in proportions.ts.
    const views = opts.contract ? contractViews(opts.contract) : [...VIEWS];
    const want = opts.proportions.poses ?? ['idle'];
    const anims = (asset.animations ?? [])
      .filter(a => a.frameIndices?.length && want.includes(roleOf(a.name, views)));
    const poses = anims.length
      ? anims.map(a => ({ label: a.name, view: viewOf(a.name, views), frame: a.frameIndices[0] }))
      : [{ label: 'frame 0', view: '', frame: 0 }];
    const seen = new Set<string>();
    proportions = [];
    for (const pose of poses) {
      const key = `${pose.frame}:${pose.view}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const report = checkProportions(composite(asset, pose.frame), opts.proportions, pose.view);
      proportions.push({ pose: pose.label, view: pose.view, report });
      for (const w of proportionWarnings(report)) warnings.push(`${pose.label}: ${w}`);
    }
  }

  // A ground painted by map_export comes out as terrain, but its lone pixels
  // are texture on purpose (a blade of grass, a flower): map_lint judges a
  // map's blur. Only lone=true counts them.
  const paintedMap = asset.generatedBy?.by === 'map_export';
  if (opts.lone ?? (tileLike && !paintedMap)) for (let f = 0; f < frameCount(asset); f++) {
    const probe = composite(asset, f).map(row => [...row]);
    const before = probe.map(row => [...row]);
    const changed = despeckle(probe, opts.strength ?? 1, opts.majority ?? 5);
    if (changed) {
      const where: string[] = [];
      for (let y = 0; y < height && where.length < 6; y++) {
        for (let x = 0; x < width && where.length < 6; x++) if (probe[y][x] !== before[y][x]) where.push(`${x},${y}`);
      }
      warnings.push(`frame ${f}: ${changed} lone pixel${changed > 1 ? 's' : ''} (x,y: ${where.join(' ')}${changed > where.length ? ' …' : ''})`);
    }
  }

  if (opts.pieces) {
    const min = opts.pieces === true ? 4 : opts.pieces;
    const names = frameNames(asset);
    const skipped = new Set<number>();
    if (opts.piecesSkip?.length) {
      const users = new Map<number, string[]>();
      for (const a of asset.animations ?? []) for (const f of a.frameIndices) users.set(f, [...(users.get(f) ?? []), a.name]);
      for (const [f, anims] of users) if (anims.every(n => opts.piecesSkip!.some(p => matchesScope(p, n)))) skipped.add(f);
    }
    for (let f = 0; f < frameCount(asset); f++) {
      if (skipped.has(f)) continue;
      const loose = detachedPieces(composite(asset, f), min);
      if (loose.length) {
        const list = loose.slice(0, 3).map(p => `${p.size} px at ${p.x},${p.y}`).join(', ');
        warnings.push(`frame ${f}${names[f] ? ` (${names[f]})` : ''}: ${loose.length} detached piece${loose.length > 1 ? 's' : ''} (${list}${loose.length > 3 ? ' …' : ''})`);
      }
    }
  }

  if (opts.tile) {
    const frame = composite(asset, 0);
    const lr = seam(frame, 'x');
    const tb = seam(frame, 'y');
    const report = (label: string, s: { edge: number; typical: number; holes: number }) => {
      if (s.holes) warnings.push(`tile: ${s.holes} transparent px on the ${label} edges (a gap when repeated)`);
      if (s.edge > Math.max(2, s.typical * 2)) {
        warnings.push(`tile: ${label} edges do not meet (${s.edge} px differ, inner lines differ by ${s.typical.toFixed(1)} on average)`);
      }
    };
    report('left/right', lr);
    report('top/bottom', tb);
  }

  return { id: asset.id, width, height, warnings, proportions };
}
