// Sprite sheets in and out.
//
// Import cuts a PNG on a grid and keeps every color exactly (no quantization,
// no rescale): the point is to bring existing pixel art in 1:1.
// Export writes a 1:1 (or scaled) PNG plus a JSON in the Aseprite "array"
// layout, which Godot, Unity and most engines already understand.

import { basename } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import {
  blankFrame, composite, createAsset, dims, frameCount, frameDuration, setAnimation,
} from './asset';
import { blankImage, blit, getPixel, readPng, type Rgba } from './png';
import { renderFrame, rgbaToHex } from './render';

export interface TagInput {
  name: string;
  /** Frame indices (row-major over the grid) or "row:N" / "col:N". */
  frames: number[] | string;
  fps?: number;
  durations?: number[];
  loop?: boolean;
}

export interface ImportSheetOptions {
  png: string;
  /**
   * Append into this existing asset instead of creating one: same frame size,
   * colors merged into its palette by hex, frame indices offset past its frames.
   */
  into?: SpriteAsset;
  frameWidth: number;
  frameHeight: number;
  margin?: number;
  spacing?: number;
  /** Alpha below this counts as transparent. Default 1 (only fully transparent). */
  alphaThreshold?: number;
  id?: string;
  name?: string;
  category?: SpriteAsset['category'];
  tags?: TagInput[];
  /** Drop frames that are fully transparent. Default false. */
  skipEmpty?: boolean;
}

export interface ImportSheetResult {
  asset: SpriteAsset;
  columns: number;
  rows: number;
}

function resolveTagFrames(spec: number[] | string, columns: number, rows: number): number[] {
  if (Array.isArray(spec)) return spec;
  const [kind, n] = spec.split(':');
  const k = Number(n);
  if (kind === 'row') return Array.from({ length: columns }, (_, c) => k * columns + c);
  if (kind === 'col') return Array.from({ length: rows }, (_, r) => r * columns + k);
  throw new Error(`unknown frame spec "${spec}" (use a list, "row:N" or "col:N")`);
}

export function importSheetImage(img: Rgba, opts: Omit<ImportSheetOptions, 'png'> & { png?: string }): ImportSheetResult {
  const margin = opts.margin ?? 0;
  const spacing = opts.spacing ?? 0;
  const threshold = opts.alphaThreshold ?? 1;
  const fw = opts.frameWidth;
  const fh = opts.frameHeight;
  const columns = Math.floor((img.width - 2 * margin + spacing) / (fw + spacing));
  const rows = Math.floor((img.height - 2 * margin + spacing) / (fh + spacing));
  if (columns < 1 || rows < 1) {
    throw new Error(`the ${img.width}x${img.height} image has no room for ${fw}x${fh} frames`);
  }
  const id = opts.id ?? basename(opts.png ?? 'sheet').replace(/\.png$/i, '');
  let asset: SpriteAsset;
  const byHex = new Map<string, number>();
  if (opts.into) {
    asset = opts.into;
    const have = dims(asset);
    if (have.width !== fw || have.height !== fh) {
      throw new Error(`cannot append ${fw}x${fh} frames into a ${have.width}x${have.height} asset`);
    }
    for (const [idx, hex] of Object.entries(asset.palette)) byHex.set(hex.toLowerCase(), Number(idx));
  } else {
    asset = createAsset({ id, name: opts.name ?? id, width: fw, height: fh, category: opts.category, frames: 1 });
    asset.layers![0].frames = [];
  }
  const offset = asset.layers![0].frames.length;
  const kept: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const frame = blankFrame(fw, fh);
      let any = false;
      const ox = margin + c * (fw + spacing);
      const oy = margin + r * (fh + spacing);
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const p = getPixel(img, ox + x, oy + y);
          if (p[3] < threshold) continue;
          const hex = rgbaToHex(p);
          let idx = byHex.get(hex);
          if (idx === undefined) {
            idx = Math.max(0, ...byHex.values()) + 1;
            byHex.set(hex, idx);
            asset.palette[idx] = hex;
            asset.colorNames[idx] = hex;
          }
          frame[y][x] = idx;
          any = true;
        }
      }
      const gridIndex = r * columns + c;
      if (opts.skipEmpty && !any) continue;
      kept.push(gridIndex);
      for (const [li, layer] of asset.layers!.entries()) {
        layer.frames.push(li === 0 ? frame : blankFrame(fw, fh));
      }
    }
  }
  if (asset.layers![0].frames.length === 0) asset.layers![0].frames.push(blankFrame(fw, fh));
  for (const tag of opts.tags ?? []) {
    const gridFrames = resolveTagFrames(tag.frames, columns, rows);
    const frameIndices = gridFrames.map(g => {
      const i = kept.indexOf(g);
      if (i < 0) throw new Error(`tag ${tag.name}: grid frame ${g} was skipped or does not exist`);
      return offset + i;
    });
    setAnimation(asset, { name: tag.name, frameIndices, fps: tag.fps, durations: tag.durations, loop: tag.loop });
  }
  return { asset, columns, rows };
}

/**
 * Append every frame of `from` (flattened) to the end of `into`, with its
 * animations shifted past the frames `into` already had: a pose drawn apart
 * (a text drawing) joins a character built elsewhere. Same frame size; colors
 * merged into the palette by hex. An animation with a name `into` already has
 * is replaced.
 */
export function appendAsset(into: SpriteAsset, from: SpriteAsset): SpriteAsset {
  const { width, height } = dims(from);
  const n = frameCount(from);
  const strip = blankImage(width * n, height);
  for (let f = 0; f < n; f++) blit(strip, renderFrame(from, composite(from, f), 1), f * width, 0);
  const tags: TagInput[] = (from.animations ?? []).map(a => ({
    name: a.name, frames: a.frameIndices, fps: a.fps, durations: a.durations, loop: a.loop,
  }));
  return importSheetImage(strip, { into, frameWidth: width, frameHeight: height, tags }).asset;
}

export function importSheet(opts: ImportSheetOptions): ImportSheetResult {
  return importSheetImage(readPng(opts.png), opts);
}

// ── Export ──────────────────────────────────────────────────────────────

export interface SheetFrameMeta {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

export interface SheetTagMeta {
  name: string;
  from: number;
  to: number;
  direction: 'forward';
  /** Extension over Aseprite: whether the engine should loop this tag. */
  loop: boolean;
}

export interface SheetMeta {
  frames: SheetFrameMeta[];
  meta: {
    app: string;
    version: string;
    image: string;
    format: 'RGBA8888';
    size: { w: number; h: number };
    scale: string;
    frameTags: SheetTagMeta[];
    /**
     * What made this pair of files, as data, in the same shape as the
     * `generated_by:` of a text drawing ("export_sheet path=…"). A sheet is
     * never retouched by hand — this is the line that says so.
     */
    generated_by?: string;
  };
}

export interface ExportSheetOptions {
  /** Basename written into meta.image. */
  imageName: string;
  scale?: number;
  spacing?: number;
  /** 'rows': one row per animation. 'strip': every unique frame in one row. */
  layout?: 'rows' | 'strip';
  /** The `generated_by:` line written into the JSON (`export_sheet path=…`). */
  generatedBy?: string;
}

export interface ExportSheetResult {
  image: Rgba;
  meta: SheetMeta;
}

export function exportSheet(asset: SpriteAsset, opts: ExportSheetOptions): ExportSheetResult {
  const scale = opts.scale ?? 1;
  const spacing = opts.spacing ?? 0;
  const layout = opts.layout ?? 'rows';
  const { width, height } = dims(asset);
  const cw = width * scale;
  const ch = height * scale;

  type Row = { name: string; indices: number[]; durations: number[]; loop: boolean };
  let rowsSpec: Row[];
  if (layout === 'strip' || asset.animations.length === 0) {
    const all = Array.from({ length: frameCount(asset) }, (_, i) => i);
    rowsSpec = [{ name: asset.animations.length ? 'all' : asset.id, indices: all, durations: all.map(() => 100), loop: true }];
  } else {
    rowsSpec = asset.animations.map(a => ({
      name: a.name,
      indices: a.frameIndices,
      durations: a.frameIndices.map((_, i) => frameDuration(a, i)),
      loop: a.loop ?? true,
    }));
  }
  const cols = Math.max(...rowsSpec.map(r => r.indices.length));
  const image = blankImage(cols * cw + (cols - 1) * spacing, rowsSpec.length * ch + (rowsSpec.length - 1) * spacing);
  const frames: SheetFrameMeta[] = [];
  const frameTags: SheetTagMeta[] = [];
  rowsSpec.forEach((row, rowIdx) => {
    const from = frames.length;
    row.indices.forEach((frameIdx, colIdx) => {
      const x = colIdx * (cw + spacing);
      const y = rowIdx * (ch + spacing);
      blit(image, renderFrame(asset, composite(asset, frameIdx), scale), x, y);
      frames.push({
        filename: `${asset.id} ${row.name} ${colIdx}`,
        frame: { x, y, w: cw, h: ch },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cw, h: ch },
        sourceSize: { w: cw, h: ch },
        duration: row.durations[colIdx],
      });
    });
    frameTags.push({ name: row.name, from, to: frames.length - 1, direction: 'forward', loop: row.loop });
  });
  // In 'strip' layout the animations still exist: tag them over the strip.
  if (layout === 'strip' && asset.animations.length > 0) {
    frameTags.length = 0;
    for (const a of asset.animations) {
      const sorted = [...a.frameIndices];
      const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
      if (!contiguous) {
        throw new Error(`strip layout needs contiguous frames; ${a.name} uses ${a.frameIndices.join(',')}. Use layout "rows".`);
      }
      frameTags.push({ name: a.name, from: sorted[0], to: sorted[sorted.length - 1], direction: 'forward', loop: a.loop ?? true });
      sorted.forEach((f, i) => { frames[f].duration = frameDuration(a, i); });
    }
  }
  return {
    image,
    meta: {
      frames,
      meta: {
        app: 'pixel-sprite-studio',
        version: '1',
        image: opts.imageName,
        format: 'RGBA8888',
        size: { w: image.width, h: image.height },
        scale: String(scale),
        frameTags,
        ...(opts.generatedBy ? { generated_by: opts.generatedBy } : {}),
      },
    },
  };
}
