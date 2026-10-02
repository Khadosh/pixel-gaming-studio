// AI as raw material, headless: a prompt becomes a PNG through fal.ai, and a
// PNG becomes a pixel-art asset through the same quantizer the editor uses.
//
// The models mirror supabase/functions/generate-sprite-fal (owner's decision,
// do not change without asking). The key comes from FAL_AI_KEY in the
// environment or from supabase/functions/.env (git-ignored), never from a
// command argument, so it never lands in a shell history or a transcript.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SpriteAsset } from '../lib/types';
import { imageToPixelData, medianCut, nearestPaletteIndex, rgbToHex } from '../lib/imageToPixelData';
import { createAsset } from './asset';
import { encodePng, type Rgba } from './png';
import { decodeImage, isJpegBytes, isPngBytes } from './image';

export const TXT2IMG_MODEL = 'fal-ai/flux/schnell';
export const IMG2IMG_MODEL = 'fal-ai/bytedance/seedream/v4/edit';
export const FAL_BASE_URL = 'https://fal.run';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** FAL_AI_KEY from the environment, else from supabase/functions/.env. */
export function loadFalKey(envFile = join(repoRoot(), 'supabase', 'functions', '.env')): string {
  const fromEnv = process.env.FAL_AI_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*FAL_AI_KEY\s*=\s*(.+?)\s*$/);
      if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('no FAL_AI_KEY: export it or put it in supabase/functions/.env');
}

export interface GenerateOptions {
  prompt: string;
  /** Optional reference image (public URL) for image-to-image. */
  imageUrl?: string;
  /** Hex colors to ask for. */
  palette?: string[];
  /** Perspective hint appended to the prompt, e.g. "top-down". */
  perspective?: string;
  /** Skip the pixel-art wrapper and send the prompt as is. */
  raw?: boolean;
  /** fal image_size preset (default square_hd), or an exact size (the edit model takes one). */
  imageSize?: string | { width: number; height: number };
}

/** The same technical prompt the edge function builds. */
export function technicalPrompt(o: GenerateOptions): string {
  if (o.raw) return o.prompt;
  const palette = o.palette && o.palette.length > 1 ? `Use strictly this color palette: ${o.palette.join(', ')}. ` : '';
  const perspective = o.perspective ? ` The character must strictly adhere to a ${o.perspective} game perspective.` : '';
  return `Professional pixel art sprite of ${o.prompt}. ${palette}${perspective} Isolated character on a solid flat LIME GREEN background (#00FF00). Full body, centered, clean retro pixel art.`;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  model: string;
  bytes: Buffer;
}

/** Calls fal.ai and downloads the first image. `fetchImpl` is injectable for tests. */
/**
 * A local PNG as a data URI, so image-to-image can start from a file on disk
 * (a render to fix, a hand drawing to repaint) without hosting it anywhere.
 */
export function pngDataUri(bytes: Uint8Array): string {
  if (isJpegBytes(bytes)) return 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64');
  if (!isPngBytes(bytes)) throw new Error('image must be a PNG or a JPEG');
  return 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
}

export async function generateImage(o: GenerateOptions, key: string, fetchImpl: FetchLike = fetch): Promise<GeneratedImage> {
  const prompt = technicalPrompt(o);
  const model = o.imageUrl ? IMG2IMG_MODEL : TXT2IMG_MODEL;
  // output_format png: flux answers jpeg by default, and pixelize reads PNG.
  const body: Record<string, unknown> = o.imageUrl
    ? { prompt, image_urls: [o.imageUrl], sync_mode: true, image_size: o.imageSize ?? 'square_hd', enable_safety_checker: false, output_format: 'png' }
    : { prompt, image_size: o.imageSize ?? 'square_hd', num_inference_steps: 4, enable_safety_checker: false, output_format: 'png' };
  const res = await fetchImpl(`${FAL_BASE_URL}/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { images?: { url?: string }[] };
  const url = json.images?.[0]?.url;
  if (!url) throw new Error('fal returned no image');
  const img = await fetchImpl(url);
  if (!img.ok) throw new Error(`could not download the image (${img.status})`);
  let bytes = Buffer.from(await img.arrayBuffer());
  // The edit model answers JPEG whatever output_format says: decode it and
  // hand back a PNG, so everything after (pixelize, illustrate) reads it.
  if (!isPngBytes(bytes)) bytes = encodePng(decodeImage(bytes));
  return { url, prompt, model, bytes };
}

/** Is this pixel part of a flat lime-green chroma background? */
function isChromaGreen(r: number, g: number, b: number): boolean {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return false;
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  h *= 360;
  return h >= 60 && h <= 170 && sat > 0.4 && l > 0.3;
}

/** The flat background color: the color most corners agree on, if any. */
export function detectBackground(img: Rgba): [number, number, number] | null {
  const off = Math.min(5, img.width - 1, img.height - 1);
  const corners: [number, number][] = [[off, off], [img.width - 1 - off, off], [off, img.height - 1 - off], [img.width - 1 - off, img.height - 1 - off]];
  const colors = corners.map(([x, y]) => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] as [number, number, number, number];
  });
  for (const c of colors) {
    if (c[3] < 8) continue;
    const agree = colors.filter(d => d[3] >= 8 && Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) < 30).length;
    if (agree >= 2) return [c[0], c[1], c[2]];
  }
  return null;
}

function isBackgroundPixel(r: number, g: number, b: number, a: number, bg: [number, number, number] | null): boolean {
  if (a < 8) return true;
  if (!bg) return false;
  const dist = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  if (isChromaGreen(bg[0], bg[1], bg[2])) return dist < 90 || isChromaGreen(r, g, b);
  return dist < 65;
}

export interface CropResult {
  image: Rgba;
  box: { x: number; y: number; w: number; h: number };
}

/**
 * Which pixels are the figure: not background, and not a speck. A speck is a
 * connected blob far smaller than the biggest one (a shadow crumb, a stray
 * dot the model left on the chroma): it would otherwise widen the crop and
 * leave a lone pixel in the air after sampling. `minFraction` is the size
 * under which a blob, relative to the largest, is a speck (0 keeps all).
 */
export function contentMask(img: Rgba, background?: [number, number, number] | null, minFraction = 0.01): Uint8Array {
  const bg = background === undefined ? detectBackground(img) : background;
  const { width: w, height: h } = img;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (!isBackgroundPixel(img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3], bg)) mask[i] = 1;
  }
  if (minFraction <= 0) return mask;
  // Label 4-connected blobs and measure them.
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = sizes.length;
    sizes.push(0);
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      sizes[id]++;
      const x = i % w, y = (i - x) / w;
      const around = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of around) {
        if (j >= 0 && mask[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
  }
  const largest = Math.max(0, ...sizes);
  const floor = largest * minFraction;
  for (let i = 0; i < w * h; i++) {
    if (mask[i] && sizes[label[i]] < floor) mask[i] = 0;
  }
  return mask;
}

/**
 * Crops the image to the square around whatever is not background (chroma
 * green or transparent), with a margin, so a small figure in a big render
 * fills the grid instead of dissolving into a few cells. Specks are ignored
 * (see contentMask); pass `mask` to reuse one already computed.
 */
export function cropToContent(img: Rgba, marginFraction = 0.04, background?: [number, number, number] | null, mask?: Uint8Array): CropResult {
  const bg = background === undefined ? detectBackground(img) : background;
  const content = mask ?? contentMask(img, bg);
  const pad: [number, number, number, number] = bg ? [bg[0], bg[1], bg[2], 255] : [0, 0, 0, 0];
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!content[y * img.width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { image: img, box: { x: 0, y: 0, w: img.width, h: img.height } };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const side = Math.round(Math.max(w, h) * (1 + 2 * marginFraction));
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
  const sx = cx - Math.floor(side / 2), sy = cy - Math.floor(side / 2);
  const out: Rgba = { width: side, height: side, data: new Uint8Array(side * side * 4) };
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const px = sx + x, py = sy + y;
      const o = (y * side + x) * 4;
      if (px < 0 || py < 0 || px >= img.width || py >= img.height || !content[py * img.width + px]) {
        out.data.set(pad, o); // outside, background or speck: more of the same background
        continue;
      }
      const i = (py * img.width + px) * 4;
      out.data.set(img.data.subarray(i, i + 4), o);
    }
  }
  return { image: out, box: { x: sx, y: sy, w: side, h: side } };
}

export interface PixelizeOptions {
  id: string;
  name?: string;
  /** Output grid size (square). */
  size: number;
  maxColors?: number;
  alphaThreshold?: number;
  removeBackground?: boolean;
  /** Map to this palette instead of quantizing. */
  fixedPalette?: Record<number, string>;
  category?: SpriteAsset['category'];
  /** Crop to the non-background content first. Default true. */
  crop?: boolean;
  /** Blobs smaller than this fraction of the largest one are specks and vanish (default 0.01; 0 keeps everything). */
  speckFraction?: number;
}

/** Makes every background pixel (and every speck) transparent so cell averages do not bleed green into the edges. */
export function knockOutBackground(img: Rgba, background?: [number, number, number] | null, mask?: Uint8Array): Rgba {
  const bg = background === undefined ? detectBackground(img) : background;
  const content = mask ?? contentMask(img, bg);
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < content.length; i++) {
    if (!content[i]) out.data[i * 4 + 3] = 0;
  }
  return out;
}

/** RGBA image → one-frame asset with a quantized palette (the editor's importer, headless). */
export function pixelize(source: Rgba, o: PixelizeOptions): SpriteAsset {
  // The background is read once from the full render: after a tight crop the
  // corners may already be inside the figure.
  const bg = detectBackground(source);
  const mask = contentMask(source, bg, o.speckFraction ?? 0.01);
  // The crop already drops the background and the specks, so a cropped
  // image needs no second knockout; an uncropped one does.
  const cropped = (o.crop ?? true) ? cropToContent(source, 0.04, bg, mask).image : source;
  const img = (o.removeBackground ?? true) ? knockOutBackground(cropped, bg, (o.crop ?? true) ? undefined : mask) : cropped;
  const imageData = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height, colorSpace: 'srgb' } as unknown as ImageData;
  const result = imageToPixelData(imageData, {
    targetSize: o.size,
    maxColors: o.maxColors,
    alphaThreshold: o.alphaThreshold,
    // Already knocked out above; the quantizer's own corner sampling would
    // otherwise pick the figure itself as "background" on a tight crop.
    removeBackground: false,
    fixedPalette: o.fixedPalette,
  });
  const asset = createAsset({ id: o.id, name: o.name, width: o.size, category: o.category ?? 'character' });
  asset.layers![0].frames[0] = result.frame;
  asset.palette = { ...result.palette };
  asset.colorNames = { ...result.colorNames };
  // Index 0 is transparent by convention and never listed in the palette.
  delete asset.palette[0];
  delete asset.colorNames[0];
  return asset;
}

export interface IllustrateOptions {
  id: string;
  name?: string;
  width: number;
  height: number;
  maxColors?: number;
  /**
   * Crop closer than "cover": 1.5 keeps two thirds of the width and height
   * around the focus. A render that leaves its subject small in the middle
   * comes out filling the picture. Default 1.
   */
  zoom?: number;
  /** Where to keep the crop when the render has another aspect: 0 = left/top, 1 = right/bottom. Default 0.5. */
  focusX?: number;
  focusY?: number;
  category?: SpriteAsset['category'];
  /**
   * How a cell picks its color: "average" (default) blends everything under
   * it; "mode" takes the color most of its pixels share, so flat areas stay
   * flat and a stray highlight does not tint the cell.
   */
  sample?: 'average' | 'mode';
  /**
   * Keep thin dark lines: when at least this fraction (0..1) of a cell is
   * near-black (luma < 70), the cell takes that dark instead. A 1 px outline
   * of a big render otherwise averages away. 0 / undefined = off.
   */
  outline?: number;
  /**
   * The background is what touches the border: the colors that make up at
   * least 15% of the edge, flood-filled inwards. "flat" paints all of it with
   * its most common color (a sky gradient stops dithering into noise).
   */
  background?: 'keep' | 'flat';
  /** Draw a 1 px contour of this color around the subject, inside its edge (thick-outline sprite look). */
  contour?: string;
  /** RGB distance under which a cell joins the background (default 48). */
  backgroundTolerance?: number;
  /**
   * Keep bright accents: when at least this fraction (0..1) of a cell is
   * vivid (saturated and bright: a spark, a glowing crack, a leaf against
   * stone) and the cell's own pick is not, the cell takes the vivid color.
   * Thin bright lines otherwise lose against the dark around them. 0 / undefined = off.
   */
  accent?: number;
  /**
   * Quantize straight onto these colors (hex) instead of a median cut: each
   * cell takes its nearest palette color, then the least used are folded
   * into the nearest kept one until only maxColors remain. A small vivid
   * area (a purple wisp, an ember) keeps its own color instead of being
   * averaged into a bigger box before the palette fit ever sees it.
   */
  palette?: string[];
  /**
   * Ordered (Bayer 4 × 4) dithering between the two nearest colors, 0..1 (0 /
   * undefined = off, 1 = full). A wide scene (a battle backdrop) gets the
   * in-between tones a small palette does not have: a haze that fades, a sky
   * that lightens towards the horizon. Only pairs closer than `ditherReach`
   * (OKLab, default 0.12) mix, so a dark trunk never speckles into the sky.
   * Run no despeckle after it: the checkerboard is exactly what it removes.
   */
  dither?: number;
  ditherReach?: number;
}

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/**
 * The dithered pick: the nearest color, or the second nearest when the cell
 * sits far enough along the segment between them for this pixel's Bayer
 * threshold. Exported for the test.
 */
export function ditherPick(c: Rgb, list: Rgb[], x: number, y: number, strength: number, reach = 0.12): number {
  const a = oklab(c);
  const labs = list.map(oklab);
  const d = labs.map(b => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  const order = d.map((_, i) => i).sort((i, j) => d[i] - d[j]);
  const first = order[0], second = order[1];
  if (second === undefined || strength <= 0) return first;
  const p = labs[first], q = labs[second];
  const seg = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const len2 = seg[0] ** 2 + seg[1] ** 2 + seg[2] ** 2;
  if (len2 === 0 || Math.sqrt(len2) > reach) return first;
  const t = Math.min(1, Math.max(0, ((a[0] - p[0]) * seg[0] + (a[1] - p[1]) * seg[1] + (a[2] - p[2]) * seg[2]) / len2));
  const threshold = 0.5 + ((BAYER4[y % 4][x % 4] + 0.5) / 16 - 0.5) * Math.min(1, strength);
  return t > threshold ? second : first;
}

/**
 * The box coverCrop keeps, in source pixels: the largest box of the aspect
 * that fits, made smaller by zoom and placed by the focus. A zone drawn on
 * the render (edit_zone, layers) maps to the illustration through it.
 */
export function coverBox(width: number, height: number, aspect: number, focusX = 0.5, focusY = 0.5, zoom = 1):
    { x: number; y: number; w: number; h: number } {
  let w = width, h = Math.round(width / aspect);
  if (h > height) {
    h = height;
    w = Math.round(height * aspect);
  }
  // Zoom in: a smaller box of the same aspect, still placed by the focus.
  if (zoom > 1) {
    w = Math.max(1, Math.round(w / zoom));
    h = Math.max(1, Math.round(h / zoom));
  }
  const x = Math.round((width - w) * Math.min(1, Math.max(0, focusX)));
  const y = Math.round((height - h) * Math.min(1, Math.max(0, focusY)));
  return { x, y, w, h };
}

/**
 * Cuts the render to the target aspect around (focusX, focusY), the largest
 * box that fits ("cover", like a card window or a book plate).
 */
export function coverCrop(img: Rgba, aspect: number, focusX = 0.5, focusY = 0.5, zoom = 1): Rgba {
  const { x: x0, y: y0, w, h } = coverBox(img.width, img.height, aspect, focusX, focusY, zoom);
  const out: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * img.width + x0) * 4;
    out.data.set(img.data.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

/**
 * A whole scene, not a figure: an illustration that fills a rectangle edge to
 * edge (a card's picture, a plate in a book). No background is removed and
 * nothing is cropped to content; the render is cut to the aspect ("cover"),
 * each cell takes the average of the pixels under it, and the colors are
 * reduced with the same median cut as pixelize. Fit it to a palette after.
 */
export function illustrate(source: Rgba, o: IllustrateOptions): SpriteAsset {
  const img = coverCrop(source, o.width / o.height, o.focusX, o.focusY, o.zoom ?? 1);
  const cw = img.width / o.width, ch = img.height / o.height;
  const cells: { r: number; g: number; b: number }[] = [];
  for (let gy = 0; gy < o.height; gy++) {
    for (let gx = 0; gx < o.width; gx++) {
      const sx0 = Math.floor(gx * cw), sx1 = Math.max(sx0 + 1, Math.floor((gx + 1) * cw));
      const sy0 = Math.floor(gy * ch), sy1 = Math.max(sy0 + 1, Math.floor((gy + 1) * ch));
      cells.push(sampleCell(img, sx0, sy0, sx1, sy1, o.sample ?? 'average', o.outline ?? 0, o.accent ?? 0));
    }
  }
  const colors = o.palette && o.palette.length > 0
    ? paletteQuantize(cells, o.palette.map(hexToRgb), o.maxColors ?? 16, o.dither ? (o.ditherReach ?? 0.12) : 0)
    : medianCut(cells, o.maxColors ?? 16);
  const asset = createAsset({ id: o.id, name: o.name, width: o.width, height: o.height, category: o.category ?? 'ui' });
  colors.forEach((c, i) => {
    asset.palette[i + 1] = rgbToHex(c.r, c.g, c.b);
    asset.colorNames[i + 1] = `color ${i + 1}`;
  });
  const frame = asset.layers![0].frames[0];
  const pick = o.palette && o.palette.length > 0 ? nearestOf : nearestPaletteIndex;
  cells.forEach((c, i) => {
    const x = i % o.width, y = Math.floor(i / o.width);
    frame[y][x] = (o.dither ? ditherPick(c, colors, x, y, o.dither, o.ditherReach) : pick(c, colors)) + 1;
  });
  if ((o.background ?? 'keep') !== 'keep' || o.contour) {
    const { mask: bg, ref } = backgroundMask(cells, o.width, o.height, o.backgroundTolerance ?? 48);
    if (o.background === 'flat' && ref) {
      const top = pick(ref, colors) + 1;
      frame.forEach((row, y) => row.forEach((_, x) => { if (bg[y][x]) row[x] = top; }));
    }
    if (o.contour) {
      let idx = Number(Object.keys(asset.palette).find(k => asset.palette[Number(k)].toLowerCase() === o.contour!.toLowerCase()) ?? 0);
      if (!idx) {
        idx = Math.max(0, ...Object.keys(asset.palette).map(Number)) + 1;
        asset.palette[idx] = o.contour.toLowerCase();
        asset.colorNames[idx] = 'contour';
      }
      const h = frame.length, w = frame[0].length;
      const edge: [number, number][] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (bg[y][x]) continue;
          const near = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) =>
            nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny][nx]);
          if (near) edge.push([x, y]);
        }
      }
      for (const [x, y] of edge) frame[y][x] = idx;
    }
  }
  return asset;
}

/**
 * Which cells are background: the color that dominates the border (at least
 * 15% of it) is the reference, and the background floods inwards from the
 * border through every cell within `tolerance` (RGB distance) of it, so a sky
 * gradient or a paper texture counts as one background.
 */
export function backgroundMask(cells: { r: number; g: number; b: number }[], w: number, h: number, tolerance = 48):
    { mask: boolean[][]; ref: { r: number; g: number; b: number } | null } {
  const at = (x: number, y: number) => cells[y * w + x];
  const border: { r: number; g: number; b: number }[] = [];
  for (let x = 0; x < w; x++) border.push(at(x, 0), at(x, h - 1));
  for (let y = 1; y < h - 1; y++) border.push(at(0, y), at(w - 1, y));
  const buckets = new Map<number, { r: number; g: number; b: number }[]>();
  for (const c of border) {
    const key = ((c.r >> 5) << 6) | ((c.g >> 5) << 3) | (c.b >> 5);
    const list = buckets.get(key);
    if (list) list.push(c); else buckets.set(key, [c]);
  }
  // Only the dominant border color is background: a second one (the ground
  // under a sky) is part of the picture and must not be flattened into it.
  const refs = [...buckets.values()].filter(l => l.length >= border.length * 0.15).sort((a, b) => b.length - a.length).slice(0, 1).map(meanOf);
  const mask = Array.from({ length: h }, () => Array(w).fill(false) as boolean[]);
  if (refs.length === 0) return { mask, ref: null };
  const close = (c: { r: number; g: number; b: number }) => refs.some(r => Math.hypot(c.r - r.r, c.g - r.g, c.b - r.b) < tolerance);
  const stack: [number, number][] = [];
  const seed = (x: number, y: number) => {
    if (!mask[y][x] && close(at(x, y))) { mask[y][x] = true; stack.push([x, y]); }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  return { mask, ref: refs[0] };
}

export type Rgb = { r: number; g: number; b: number };

function meanOf(px: Rgb[]): Rgb {
  let r = 0, g = 0, b = 0;
  for (const p of px) { r += p.r; g += p.g; b += p.b; }
  const n = Math.max(1, px.length);
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

export function hexToRgb(hex: string): Rgb {
  const n = hex.replace('#', '').slice(0, 6);
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}

/** OKLab: distances in it follow hue, so a night blue never lands on a dark green. */
export function oklab(c: Rgb): [number, number, number] {
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const r = lin(c.r), g = lin(c.g), b = lin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function nearestOf(c: Rgb, list: Rgb[]): number {
  const a = oklab(c);
  let best = 0, bestD = Infinity;
  list.forEach((p, i) => {
    const b = oklab(p);
    const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/**
 * The colors of an illustration taken straight from a palette: every cell
 * votes for its nearest palette color; the least voted are folded into the
 * nearest survivor until at most maxColors remain. Returns the survivors.
 */
export function paletteQuantize(cells: Rgb[], palette: Rgb[], maxColors: number, ditherReach = 0): Rgb[] {
  const votes = new Map<number, number>();
  const labs = ditherReach > 0 ? palette.map(oklab) : [];
  for (const c of cells) {
    const i = nearestOf(c, palette);
    votes.set(i, (votes.get(i) ?? 0) + 1);
    // Dithering mixes a cell with its second nearest: that color has to survive too.
    if (ditherReach > 0) {
      const rest = palette.map((_, k) => k).filter(k => k !== i);
      const j = rest[nearestOf(c, rest.map(k => palette[k]))];
      if (j !== undefined) {
        const a = labs[i], b = labs[j];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= ditherReach) votes.set(j, (votes.get(j) ?? 0) + 0.5);
      }
    }
  }
  const kept = [...votes.keys()];
  while (kept.length > Math.max(1, maxColors)) {
    kept.sort((a, b) => (votes.get(a) ?? 0) - (votes.get(b) ?? 0));
    const gone = kept.shift()!;
    const into = kept[nearestOf(palette[gone], kept.map(i => palette[i]))];
    votes.set(into, (votes.get(into) ?? 0) + (votes.get(gone) ?? 0));
  }
  kept.sort((a, b) => a - b);
  return kept.map(i => palette[i]);
}

/** Saturated and bright: what a spark, an ember or a leaf looks like. */
function isVivid(p: Rgb): boolean {
  const max = Math.max(p.r, p.g, p.b), min = Math.min(p.r, p.g, p.b);
  return max >= 115 && (max - min) / Math.max(1, max) >= 0.45;
}

/** One cell of an illustration: average, mode, the dark-line rule and the bright-accent rule. */
function sampleCell(img: Rgba, x0: number, y0: number, x1: number, y1: number, mode: 'average' | 'mode', outline: number, accent = 0): Rgb {
  const px: Rgb[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      px.push({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
    }
  }
  if (accent > 0) {
    const vivid = px.filter(isVivid);
    if (vivid.length >= accent * px.length && vivid.length < px.length * 0.5) return meanOf(vivid);
  }
  if (outline > 0) {
    const dark = px.filter(p => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b < 70);
    if (dark.length >= outline * px.length) return meanOf(dark);
  }
  if (mode === 'average') return meanOf(px);
  // Buckets of 32 levels per channel: the biggest one wins, and the cell takes its mean.
  const buckets = new Map<number, Rgb[]>();
  for (const p of px) {
    const key = ((p.r >> 5) << 6) | ((p.g >> 5) << 3) | (p.b >> 5);
    const list = buckets.get(key);
    if (list) list.push(p); else buckets.set(key, [p]);
  }
  let best: Rgb[] = [];
  for (const list of buckets.values()) if (list.length > best.length) best = list;
  return meanOf(best);
}
