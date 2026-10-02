// A painted backdrop as more than a flat picture: split in depth layers for
// parallax, and the light sources it painted read back as data, so a game can
// light its scene where the picture says the torches are.

import type { SpriteAsset } from '../lib/types';
import { coverBox, FAL_BASE_URL, hexToRgb, oklab, pngDataUri, type FetchLike } from './ai';
import { createAsset, getFrame } from './asset';
import { decodeImage } from './image';
import type { Rgba } from './png';

/** Monocular depth on fal (light = near). Only used by `depth`. */
export const DEPTH_MODEL = 'fal-ai/image-preprocessors/depth-anything/v2';

/** A depth map of a render: light is near, dark is far. `fetchImpl` is injectable for tests. */
export async function estimateDepth(bytes: Uint8Array, key: string, fetchImpl: FetchLike = fetch): Promise<Rgba> {
  const res = await fetchImpl(`${FAL_BASE_URL}/${DEPTH_MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: pngDataUri(bytes) }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { image?: { url?: string }; images?: { url?: string }[] };
  const url = json.image?.url ?? json.images?.[0]?.url;
  if (!url) throw new Error('fal returned no depth image');
  const img = await fetchImpl(url);
  if (!img.ok) throw new Error(`could not download the depth image (${img.status})`);
  return decodeImage(new Uint8Array(await img.arrayBuffer()));
}

export interface LayerOptions {
  /** Depth cuts, 0..1 (0 far … 1 near) after normalizing the map: n cuts give n + 1 layers. Default [0.4, 0.75]. */
  cuts?: number[];
  /** Where the illustration was cut from the render (the same as illustrate). */
  focusX?: number;
  focusY?: number;
  zoom?: number;
  /** Mode-filter passes over the layer map (no lone cells of another layer). Default 2. */
  smooth?: number;
  /** How far (cells) a layer is painted on under the nearer ones, so a shift does not open holes. Default 6; the farthest layer is always filled whole. */
  fill?: number;
  /** Dark is near instead of light. */
  invert?: boolean;
}

/** Which layer every cell of a w × h illustration belongs to (0 = farthest). */
export function layerMap(depth: Rgba, w: number, h: number, o: LayerOptions = {}): number[][] {
  const box = coverBox(depth.width, depth.height, w / h, o.focusX, o.focusY, o.zoom ?? 1);
  const raw: number[][] = [];
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(box.x + x * box.w / w), sx1 = Math.max(sx0 + 1, Math.floor(box.x + (x + 1) * box.w / w));
      const sy0 = Math.floor(box.y + y * box.h / h), sy1 = Math.max(sy0 + 1, Math.floor(box.y + (y + 1) * box.h / h));
      let sum = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * depth.width + sx) * 4;
          sum += 0.299 * depth.data[i] + 0.587 * depth.data[i + 1] + 0.114 * depth.data[i + 2];
          n++;
        }
      }
      const v = sum / Math.max(1, n) / 255;
      row.push(o.invert ? 1 - v : v);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    raw.push(row);
  }
  if (o.invert) [lo, hi] = [1 - hi, 1 - lo];
  const cuts = [...(o.cuts ?? [0.4, 0.75])].sort((a, b) => a - b);
  let map = raw.map(row => row.map(v => {
    const t = hi > lo ? (v - lo) / (hi - lo) : 0;
    return cuts.filter(c => t >= c).length;
  }));
  for (let pass = 0; pass < (o.smooth ?? 2); pass++) map = modeFilter(map, cuts.length + 1);
  return map;
}

function modeFilter(map: number[][], n: number): number[][] {
  const h = map.length, w = map[0].length;
  return map.map((row, y) => row.map((v, x) => {
    const count = new Array(n).fill(0);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx));
        count[map[yy][xx]]++;
      }
    }
    const best = count.indexOf(Math.max(...count));
    return count[best] >= 5 ? best : v;
  }));
}

/**
 * The illustration split in layers by `map` (layerMap). Layer 0 is opaque
 * edge to edge; each nearer layer keeps its own cells and is transparent
 * elsewhere. Under the cells of nearer layers a layer is painted on with its
 * own nearest color in the row (up to `fill` cells; the farthest, all), so
 * when the layers slide apart for parallax no hole opens and no edge doubles.
 */
export function splitLayers(asset: SpriteAsset, map: number[][], fill = 6): SpriteAsset[] {
  const frame = getFrame(asset, 0, 0);
  const h = frame.length, w = frame[0].length;
  const n = Math.max(...map.flat()) + 1;
  const out: SpriteAsset[] = [];
  for (let k = 0; k < n; k++) {
    const layer = createAsset({ id: `${asset.id}_${k}`, name: `${asset.name} (${k})`, width: w, height: h, category: asset.category });
    layer.palette = { ...asset.palette };
    layer.colorNames = { ...asset.colorNames };
    const f = getFrame(layer, 0, 0);
    const reach = k === 0 ? Infinity : fill;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = map[y][x];
        if (at === k) { f[y][x] = frame[y][x]; continue; }
        if (at < k) continue;
        // Under a nearer layer: the nearest own cell in the row, else above.
        let pick = 0;
        for (let d = 1; d <= Math.min(reach, w); d++) {
          if (x - d >= 0 && map[y][x - d] === k) { pick = frame[y][x - d]; break; }
          if (x + d < w && map[y][x + d] === k) { pick = frame[y][x + d]; break; }
        }
        if (!pick) {
          for (let d = 1; d <= Math.min(reach, h); d++) {
            if (y - d >= 0 && map[y - d][x] === k) { pick = frame[y - d][x]; break; }
          }
        }
        if (!pick && k === 0) pick = frame[y][x];
        f[y][x] = pick;
      }
    }
    out.push(layer);
  }
  return out;
}

export interface PaintedLight {
  /** Center in fractions of the picture. */
  at: [number, number];
  /** Center in pixels. */
  px: [number, number];
  /** The color the light was painted with (the most common in its core). */
  color: string;
  /** How far its glow reaches, in pixels. */
  radius: number;
  /** Cells in its bright core. */
  size: number;
}

export interface LightOptions {
  /** Hex colors that are light (the flame, the lantern); default: any bright and vivid color. */
  colors?: string[];
  /** OKLab lightness a light needs without `colors` (default 0.78). */
  minLightness?: number;
  /** OKLab chroma a light needs without `colors` (default 0.07). */
  minChroma?: number;
  /** Smallest core, in cells (default 3). */
  minCells?: number;
  /** Cores whose boxes are this close (pixels) are one light (default 4). */
  merge?: number;
  /** The picture is above this row fraction only (ignore a bright floor): default 1. */
  maxY?: number;
}

/**
 * The lights a picture painted: bright vivid cores (a flame, a lantern, a
 * glowing window), merged when close, each with its center, its color and
 * how far its glow reaches (where the light around it falls back to the dark
 * of the picture).
 */
export function paintedLights(asset: SpriteAsset, o: LightOptions = {}): { width: number; height: number; lights: PaintedLight[] } {
  const frame = getFrame(asset, 0, 0);
  const h = frame.length, w = frame[0].length;
  const lab = new Map<number, [number, number, number]>();
  for (const [k, hex] of Object.entries(asset.palette)) lab.set(Number(k), oklab(hexToRgb(String(hex))));
  const L = (x: number, y: number) => (frame[y][x] ? lab.get(frame[y][x])![0] : 0);
  const wanted = o.colors?.map(c => c.toLowerCase().slice(0, 7));
  const isLight = (idx: number): boolean => {
    if (!idx) return false;
    if (wanted) return wanted.includes(String(asset.palette[idx]).toLowerCase().slice(0, 7));
    const [l, a, b] = lab.get(idx)!;
    return l >= (o.minLightness ?? 0.78) && Math.hypot(a, b) >= (o.minChroma ?? 0.07);
  };
  const maxY = Math.round(h * (o.maxY ?? 1));
  // Bright cores: 8-connected blobs of light cells.
  const seen = new Uint8Array(w * h);
  type Blob = { cells: [number, number][] };
  const blobs: Blob[] = [];
  for (let y = 0; y < maxY; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !isLight(frame[y][x])) continue;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[y * w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        cells.push([cx, cy]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= maxY || seen[ny * w + nx] || !isLight(frame[ny][nx])) continue;
            seen[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      blobs.push({ cells });
    }
  }
  // Close cores are one light (a flame in two tongues, a tip cut off by the
  // dither): blobs whose boxes are within `merge` pixels of each other.
  const merge = o.merge ?? 4;
  const center = (b: Blob) => [b.cells.reduce((s, c) => s + c[0], 0) / b.cells.length, b.cells.reduce((s, c) => s + c[1], 0) / b.cells.length];
  const bbox = (b: Blob) => {
    const xs = b.cells.map(c => c[0]), ys = b.cells.map(c => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const gap = (p: Blob, q: Blob) => {
    const [a0, a1, a2, a3] = bbox(p), [b0, b1, b2, b3] = bbox(q);
    return Math.hypot(Math.max(0, b0 - a2, a0 - b2), Math.max(0, b1 - a3, a1 - b3));
  };
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < blobs.length && !merged; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        if (gap(blobs[i], blobs[j]) <= merge) {
          blobs[i].cells.push(...blobs[j].cells);
          blobs.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  const lights: PaintedLight[] = [];
  for (const b of blobs) {
    if (b.cells.length < (o.minCells ?? 3)) continue;
    const [cx, cy] = center(b);
    const counts = new Map<number, number>();
    for (const [x, y] of b.cells) counts.set(frame[y][x], (counts.get(frame[y][x]) ?? 0) + 1);
    const top = [...counts.entries()].sort((p, q) => q[1] - p[1])[0][0];
    // The glow: mean lightness in rings around the center; the radius is
    // where it falls to a quarter of the way from the dark around to the core.
    const ring = (r0: number, r1: number) => {
      let s = 0, n = 0;
      for (let y = Math.max(0, Math.floor(cy - r1)); y <= Math.min(h - 1, Math.ceil(cy + r1)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r1)); x <= Math.min(w - 1, Math.ceil(cx + r1)); x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d >= r0 && d < r1) { s += L(x, y); n++; }
        }
      }
      return n ? s / n : 0;
    };
    const core = Math.sqrt(b.cells.length / Math.PI);
    const far = Math.max(16, core * 10);
    const dark = ring(far, far + 4);
    const bright = ring(0, Math.max(1, core));
    let radius = far;
    for (let r = Math.ceil(core); r < far; r += 1) {
      if (ring(r, r + 2) - dark < 0.25 * (bright - dark)) { radius = r; break; }
    }
    radius = Math.max(radius, core * 2);
    lights.push({
      at: [round3(cx / w), round3(cy / h)], px: [Math.round(cx), Math.round(cy)],
      color: String(asset.palette[top]).toLowerCase().slice(0, 7), radius: Math.round(radius * 10) / 10, size: b.cells.length,
    });
  }
  lights.sort((p, q) => p.px[0] - q.px[0]);
  return { width: w, height: h, lights };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
