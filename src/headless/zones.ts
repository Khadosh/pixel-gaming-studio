// Redoing one zone of a render: a mask (rectangle, polygon or a mask image)
// and an instruction go to the edit model, and only what falls inside the
// mask comes back. The rest of the picture stays exactly as it was, so a
// render that is right except for one thing (a cave mouth full of sky) is
// fixed instead of rolled again. The same zone can then re-illustrate only
// its cells on top of the pixel art that already exists (mergeOutsideZone).

import type { SpriteAsset } from '../lib/types';
import { coverBox, generateImage, oklab, type FetchLike } from './ai';
import { getFrame } from './asset';
import { decodeImage } from './image';
import { encodePng, type Rgba } from './png';

/**
 * Where to edit, in fractions of the image (0..1, so the same zone works on a
 * 1024 render and on its 320 × 180 illustration): `rect` [x0, y0, x1, y1],
 * `polygon` [[x, y], …], or `mask`, an image where light / opaque means
 * "inside" (resampled to the target). They add up; `invert` flips it.
 */
export interface ZoneSpec {
  rect?: number[];
  polygon?: number[][];
  mask?: Rgba;
  invert?: boolean;
}

function insidePolygon(px: number, py: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * How much of each pixel of a w × h image is in the zone, 0..1. `feather`
 * (pixels) softens the edge with a box blur, so the edited part fades into
 * the original instead of showing a seam.
 */
export function zoneCoverage(spec: ZoneSpec, w: number, h: number, feather = 0): Float32Array {
  const cov = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / w, fy = (y + 0.5) / h;
      let v = 0;
      if (spec.rect && spec.rect.length === 4) {
        const [x0, y0, x1, y1] = spec.rect;
        if (fx >= Math.min(x0, x1) && fx < Math.max(x0, x1) && fy >= Math.min(y0, y1) && fy < Math.max(y0, y1)) v = 1;
      }
      if (!v && spec.polygon && spec.polygon.length >= 3 && insidePolygon(fx, fy, spec.polygon)) v = 1;
      if (!v && spec.mask) {
        const m = spec.mask;
        const mx = Math.min(m.width - 1, Math.floor(fx * m.width)), my = Math.min(m.height - 1, Math.floor(fy * m.height));
        const o = (my * m.width + mx) * 4;
        const luma = (0.299 * m.data[o] + 0.587 * m.data[o + 1] + 0.114 * m.data[o + 2]) / 255;
        v = luma * (m.data[o + 3] / 255) >= 0.5 ? 1 : 0;
      }
      cov[y * w + x] = spec.invert ? 1 - v : v;
    }
  }
  return feather > 0 ? boxBlur(cov, w, h, Math.round(feather)) : cov;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** The pixel box around everything with some coverage, or null when the zone is empty. */
export function zoneBox(cov: Float32Array, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cov[y * w + x] <= 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function cropImage(img: Rgba, box: { x: number; y: number; w: number; h: number }): Rgba {
  const out: Rgba = { width: box.w, height: box.h, data: new Uint8Array(box.w * box.h * 4) };
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * img.width + box.x) * 4;
    out.data.set(img.data.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  return out;
}

/** Bilinear resize (the edit model answers at its own size). */
export function resizeBilinear(img: Rgba, w: number, h: number): Rgba {
  if (img.width === w && img.height === h) return img;
  const out: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const sy = Math.max(0, Math.min(img.height - 1, (y + 0.5) * img.height / h - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(img.height - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(img.width - 1, (x + 0.5) * img.width / w - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(img.width - 1, x0 + 1), tx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c];
        const d = img.data[(y1 * img.width + x0) * 4 + c], e = img.data[(y1 * img.width + x1) * 4 + c];
        out.data[(y * w + x) * 4 + c] = Math.round((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty);
      }
    }
  }
  return out;
}

/**
 * `patch` (already the size of `box`) over `base` inside the zone only: each
 * pixel mixes by its coverage, so outside the mask the base is untouched.
 */
export function compositeZone(base: Rgba, patch: Rgba, cov: Float32Array, box: { x: number; y: number; w: number; h: number }): Rgba {
  const out: Rgba = { width: base.width, height: base.height, data: new Uint8Array(base.data) };
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const bx = box.x + x, by = box.y + y;
      const k = cov[by * base.width + bx];
      if (k <= 0) continue;
      const o = (by * base.width + bx) * 4, p = (y * box.w + x) * 4;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(base.data[o + c] * (1 - k) + patch.data[p + c] * k);
    }
  }
  return out;
}

/**
 * The edit model regrades the whole picture (warmer, lighter) even where it
 * was told to keep it. Outside the zone the answer should equal the base, so
 * the difference there is that drift: each channel of the patch is brought to
 * the base's mean and spread measured outside the zone, and the zone stops
 * showing as a lighter blot. No pixels outside: the patch as is.
 */
export function matchGrade(base: Rgba, patch: Rgba, cov: Float32Array, box: { x: number; y: number; w: number; h: number }): Rgba {
  const sum = [0, 0, 0, 0, 0, 0], sq = [0, 0, 0, 0, 0, 0];
  let n = 0;
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const bx = box.x + x, by = box.y + y;
      if (cov[by * base.width + bx] > 0) continue;
      const o = (by * base.width + bx) * 4, p = (y * box.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        sum[c] += base.data[o + c]; sq[c] += base.data[o + c] ** 2;
        sum[c + 3] += patch.data[p + c]; sq[c + 3] += patch.data[p + c] ** 2;
      }
      n++;
    }
  }
  if (n < 16) return patch;
  const mean = sum.map(v => v / n), sd = sq.map((v, i) => Math.sqrt(Math.max(1, v / n - mean[i] ** 2)));
  const out: Rgba = { width: patch.width, height: patch.height, data: new Uint8Array(patch.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = (patch.data[i + c] - mean[c + 3]) / sd[c + 3] * sd[c] + mean[c];
      out.data[i + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

/** The size the edit model is asked for: the crop's aspect, the short side at least 1024, nothing over 4096. */
export function editSize(w: number, h: number): { width: number; height: number } {
  let k = 1024 / Math.min(w, h);
  if (Math.max(w, h) * k > 4096) k = 4096 / Math.max(w, h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

export interface EditZoneOptions {
  /** Pixels of soft edge (default: 1.5 % of the image's short side). */
  feather?: number;
  /** How much picture around the zone the model sees, as a fraction of each side of the zone (default 0.25). */
  context?: number;
  /** Bring the answer to the base's grade measured outside the zone (default true; see matchGrade). */
  match?: boolean;
  /**
   * Keep what the model only re-touched (default 0: off): inside the zone a
   * pixel of the answer whose OKLab distance to the base is under `changed`
   * keeps the base; from `changed` to twice that it fades in. So adding
   * something to a sky (far peaks, a temple) brings back only the new thing,
   * and the sky around it, its gradient and its dither stay as they were.
   */
  changed?: number;
  /**
   * Push what comes back into the distance (default 0): the answer is mixed
   * with the base by this much (0.5 = half the base shows through), like
   * the haze of air between far mountains and the eye.
   */
  haze?: number;
  /**
   * Regrade the answer locally (default 0: off), a radius in pixels: the
   * model also shifts the light of the sky in broad gradients that a single
   * grade (match) can't undo. The difference answer − base, blurred this
   * wide, is taken off the answer, so the broad drift goes and what is small
   * and new (a far peak, a temple) stays. Pair it with changed.
   */
  local?: number;
}

/** The answer with the broad drift from the base taken off (see EditZoneOptions.local). */
export function localGrade(base: Rgba, patch: Rgba, box: { x: number; y: number; w: number; h: number }, radius: number): Rgba {
  const n = box.w * box.h;
  const out: Rgba = { width: patch.width, height: patch.height, data: new Uint8Array(patch.data) };
  for (let c = 0; c < 3; c++) {
    const d = new Float32Array(n);
    for (let y = 0; y < box.h; y++) {
      for (let x = 0; x < box.w; x++) {
        d[y * box.w + x] = patch.data[(y * box.w + x) * 4 + c] - base.data[((box.y + y) * base.width + box.x + x) * 4 + c];
      }
    }
    const drift = boxBlur(d, box.w, box.h, Math.round(radius));
    for (let i = 0; i < n; i++) out.data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(patch.data[i * 4 + c] - drift[i])));
  }
  return out;
}

/** The zone's coverage, cut where the answer is (almost) the base: see EditZoneOptions.changed. */
export function changedCoverage(base: Rgba, patch: Rgba, cov: Float32Array, box: { x: number; y: number; w: number; h: number },
    changed: number): Float32Array {
  const out = new Float32Array(cov.length);
  const px = (d: Uint8Array, o: number) => ({ r: d[o], g: d[o + 1], b: d[o + 2] });
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const i = (box.y + y) * base.width + box.x + x;
      if (cov[i] <= 0) continue;
      const a = oklab(px(base.data, i * 4)), b = oklab(px(patch.data, (y * box.w + x) * 4));
      const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
      out[i] = cov[i] * Math.min(1, Math.max(0, (d - changed) / changed));
    }
  }
  return out;
}

/** The instruction as it goes to the model: only the zone changes. */
export function editPrompt(instruction: string): string {
  return `${instruction.trim().replace(/\.$/, '')}. Change only that; keep the rest of the picture, its style, its light and its colors exactly as they are.`;
}

/** The zone's coverage and the box sent to the model (the zone plus context). */
export function zoneFrame(base: Rgba, spec: ZoneSpec, o: EditZoneOptions = {}): { cov: Float32Array; box: { x: number; y: number; w: number; h: number } } {
  const feather = o.feather ?? Math.round(Math.min(base.width, base.height) * 0.015);
  const cov = zoneCoverage(spec, base.width, base.height, feather);
  const zone = zoneBox(cov, base.width, base.height);
  if (!zone) throw new Error('the zone is empty: give rect, polygon or a mask with something inside');
  const ctx = o.context ?? 0.25;
  const mx = Math.round(zone.w * ctx), my = Math.round(zone.h * ctx);
  const x0 = Math.max(0, zone.x - mx), y0 = Math.max(0, zone.y - my);
  return { cov, box: { x: x0, y: y0, w: Math.min(base.width, zone.x + zone.w + mx) - x0, h: Math.min(base.height, zone.y + zone.h + my) - y0 } };
}

/**
 * The model's answer (any size) blended into `base` inside the zone: brought
 * to the box, regraded (unless match is false) and mixed by coverage. Also
 * what re-composes an answer saved earlier without asking the model again.
 */
export function applyAnswer(base: Rgba, spec: ZoneSpec, answer: Rgba, o: EditZoneOptions = {}):
    { image: Rgba; patch: Rgba; box: { x: number; y: number; w: number; h: number } } {
  const { cov, box } = zoneFrame(base, spec, o);
  const raw = resizeBilinear(answer, box.w, box.h);
  let patch = o.match === false ? raw : matchGrade(base, raw, cov, box);
  if (o.local && o.local > 0) patch = localGrade(base, patch, box, o.local);
  let k = o.changed && o.changed > 0 ? changedCoverage(base, patch, cov, box, o.changed) : cov;
  if (o.haze && o.haze > 0) k = k.map(v => v * (1 - Math.min(1, o.haze!)));
  return { image: compositeZone(base, patch, k, box), patch: raw, box };
}

/**
 * Redo one zone of `base` with the edit model: the zone plus some context is
 * cropped and sent with the instruction, the answer (PNG or JPEG, any size)
 * is brought back to the crop and blended in only inside the zone.
 */
export async function editZone(base: Rgba, spec: ZoneSpec, instruction: string, key: string,
    fetchImpl: FetchLike = fetch, o: EditZoneOptions = {}): Promise<{ image: Rgba; patch: Rgba; box: { x: number; y: number; w: number; h: number }; model: string }> {
  const { box } = zoneFrame(base, spec, o);
  const uri = 'data:image/png;base64,' + encodePng(cropImage(base, box)).toString('base64');
  const answer = await generateImage({ prompt: editPrompt(instruction), imageUrl: uri, raw: true, imageSize: editSize(box.w, box.h) }, key, fetchImpl);
  return { ...applyAnswer(base, spec, decodeImage(answer.bytes), o), model: answer.model };
}

/**
 * After re-illustrating an edited render: every cell whose center falls
 * outside the zone takes back the pixel the old illustration had (`base`, the
 * same size), so only the zone changes in the pixel art too. The zone is in
 * fractions of the render; cells map to it through the same cover crop
 * illustrate used. Returns how many cells kept the new drawing.
 */
export function mergeOutsideZone(asset: SpriteAsset, base: SpriteAsset, spec: ZoneSpec,
    source: { width: number; height: number }, crop: { focusX?: number; focusY?: number; zoom?: number } = {}): number {
  const frame = getFrame(asset, 0, 0), old = getFrame(base, 0, 0);
  const h = frame.length, w = frame[0].length;
  if (old.length !== h || old[0].length !== w) throw new Error(`base is ${old[0].length}x${old.length}, the illustration ${w}x${h}`);
  const box = coverBox(source.width, source.height, w / h, crop.focusX, crop.focusY, crop.zoom ?? 1);
  const cov = zoneCoverage(spec, source.width, source.height);
  const indexOf = new Map<string, number>();
  for (const [k, hex] of Object.entries(asset.palette)) indexOf.set(String(hex).toLowerCase(), Number(k));
  let kept = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(source.width - 1, Math.floor(box.x + (x + 0.5) * box.w / w));
      const sy = Math.min(source.height - 1, Math.floor(box.y + (y + 0.5) * box.h / h));
      if (cov[sy * source.width + sx] >= 0.5) { kept++; continue; }
      const was = old[y][x];
      if (!was) { frame[y][x] = 0; continue; }
      const hex = String(base.palette[was]).toLowerCase();
      let idx = indexOf.get(hex);
      if (idx === undefined) {
        idx = Math.max(0, ...Object.keys(asset.palette).map(Number)) + 1;
        asset.palette[idx] = hex;
        asset.colorNames[idx] = base.colorNames?.[was] ?? `color ${idx}`;
        indexOf.set(hex, idx);
      }
      frame[y][x] = idx;
    }
  }
  return kept;
}
