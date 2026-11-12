// Rendering frames to RGBA images and to text, so an agent can "see" a sprite
// without a browser.

import type { Frame, SpriteAsset } from '../lib/types';
import { composite, dims, frameCount, normalizeHex } from './asset';
import { findAnimation } from './assetModel';
import { blankImage, blit, setPixel, type Rgba } from './png';

export type RgbaTuple = [number, number, number, number];

export function hexToRgba(hex: string): RgbaTuple {
  const h = normalizeHex(hex);
  if (h === 'transparent') return [0, 0, 0, 0];
  const n = h.slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const a = n.length === 8 ? parseInt(n.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

export function rgbaToHex(rgba: RgbaTuple): string {
  const [r, g, b, a] = rgba;
  const part = (v: number) => v.toString(16).padStart(2, '0');
  return a === 255 ? `#${part(r)}${part(g)}${part(b)}` : `#${part(r)}${part(g)}${part(b)}${part(a)}`;
}

/** Draws one frame at the given integer scale. */
export function renderFrame(asset: SpriteAsset, frame: Frame, scale = 1): Rgba {
  const { width, height } = dims(asset);
  const img = blankImage(width * scale, height * scale);
  const cache = new Map<number, RgbaTuple>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const v = frame[r]?.[c] ?? 0;
      if (!v) continue;
      let rgba = cache.get(v);
      if (!rgba) {
        const hex = asset.palette[v];
        rgba = hex ? hexToRgba(hex) : [255, 0, 255, 255];
        cache.set(v, rgba);
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          setPixel(img, c * scale + dx, r * scale + dy, rgba);
        }
      }
    }
  }
  return img;
}

const GLYPHS = '.123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A frame as text: '.' is transparent, then one glyph per palette index. */
export function renderAscii(frame: Frame): string {
  return frame
    .map(row => row.map(v => GLYPHS[v] ?? '#').join(''))
    .join('\n');
}

export function asciiLegend(asset: SpriteAsset): string {
  return Object.entries(asset.palette)
    .map(([k, v]) => `${GLYPHS[Number(k)] ?? '#'} = ${k} ${v}${asset.colorNames[Number(k)] ? ' ' + asset.colorNames[Number(k)] : ''}`)
    .join('\n');
}

export interface ContactSheetOptions {
  scale?: number;
  /** Gap between cells, in scaled pixels. */
  gap?: number;
  /** Checkerboard background so transparent pixels are visible. */
  background?: boolean;
}

/**
 * One row per animation (or one row with every frame when there are none),
 * on a dark checkerboard. Meant for the agent to look at, not to ship.
 */
export function contactSheet(asset: SpriteAsset, opts: ContactSheetOptions = {}): Rgba {
  const scale = opts.scale ?? 4;
  const gap = opts.gap ?? 2;
  const { width, height } = dims(asset);
  const rows = asset.animations.length > 0
    ? asset.animations.map(a => a.frameIndices)
    : [Array.from({ length: frameCount(asset) }, (_, i) => i)];
  const cols = Math.max(...rows.map(r => r.length));
  const cellW = width * scale;
  const cellH = height * scale;
  const img = blankImage(cols * (cellW + gap) + gap, rows.length * (cellH + gap) + gap, [24, 22, 20, 255]);
  if (opts.background ?? true) {
    const tile = Math.max(1, scale);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const dark = ((Math.floor(x / tile) + Math.floor(y / tile)) % 2) === 0;
        setPixel(img, x, y, dark ? [40, 38, 34, 255] : [52, 49, 44, 255]);
      }
    }
  }
  rows.forEach((indices, rowIdx) => {
    indices.forEach((frameIdx, colIdx) => {
      const frame = composite(asset, frameIdx);
      const cell = renderFrame(asset, frame, scale);
      blit(img, cell, gap + colIdx * (cellW + gap), gap + rowIdx * (cellH + gap));
    });
  });
  return img;
}


/** Swatches of a palette in a row per 8 colors, each cell `cell` px, with a 1px index mark. */
export function paletteSheet(palette: Record<number, string>, cell = 24, perRow = 8): Rgba {
  const entries = Object.entries(palette).map(([k, v]) => [Number(k), v] as const).sort((a, b) => a[0] - b[0]);
  const rows = Math.max(1, Math.ceil(entries.length / perRow));
  const img = blankImage(perRow * cell, rows * cell, [24, 22, 20, 255]);
  entries.forEach(([idx, hex], i) => {
    const x0 = (i % perRow) * cell, y0 = Math.floor(i / perRow) * cell;
    const rgba = hexToRgba(hex);
    for (let y = 1; y < cell - 1; y++) for (let x = 1; x < cell - 1; x++) setPixel(img, x0 + x, y0 + y, rgba);
    // Index as a tiny tally along the top edge: idx dots.
    for (let d = 0; d < Math.min(idx, cell - 4); d++) setPixel(img, x0 + 2 + d, y0 + 2, [255, 255, 255, 255]);
  });
  return img;
}

export const SHEET_NOTE = 'contact sheet, for looking (checkerboard and margin): frame=0 gives the drawing alone';

/**
 * What `render` draws: one frame, one animation's sheet, or the contact sheet.
 * A drawing of one frame and no animations comes out as it is (transparent, no
 * margin), so it can go straight to a page; `sheet` forces the contact sheet.
 */
export function renderAsset(
  asset: SpriteAsset,
  opts: { scale: number; frame?: number; animation?: string; sheet?: boolean },
): { image: Rgba; kind: 'frame' | 'sheet' } {
  const single = frameCount(asset) === 1 && !asset.animations?.length;
  const frame = opts.frame ?? (single && !opts.sheet && !opts.animation ? 0 : undefined);
  if (frame !== undefined) return { image: renderFrame(asset, composite(asset, frame), opts.scale), kind: 'frame' };
  if (!opts.animation) return { image: contactSheet(asset, { scale: opts.scale }), kind: 'sheet' };
  const anim = findAnimation(asset, opts.animation);
  if (!anim) throw new Error(`no animation "${opts.animation}"`);
  return { image: contactSheet({ ...asset, animations: [anim] }, { scale: opts.scale }), kind: 'sheet' };
}
