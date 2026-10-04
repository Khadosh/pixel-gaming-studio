// The noise and the shape helpers of the map painter (mappaint.ts). They are an
// exact port of the drawing scripts of The Unwritten Dao (scripts/suelo_ladera.py:
// h2, vnoise, fbm, n1, catmull, ribbon, clean, distance_in), so a recipe with
// the same numbers gives the same pixels the scripts gave.

/** Hash of an integer point and a seed, in [0, 1). Same bits as the Python `h2`. */
export function h2(ix: number, iy: number, s: number): number {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 2147483647)) >>> 0;
  n = Math.imul((n ^ (n >>> 13)) >>> 0, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) & 0xffffff) / 0x1000000;
}

export function vnoise(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy, s), b = h2(ix + 1, iy, s), c = h2(ix, iy + 1, s), d = h2(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal value noise in [0, 1]. */
export function fbm(x: number, y: number, s: number, octaves = 3): number {
  let tot = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    tot += amp * vnoise(x, y, s + o * 101);
    norm += amp;
    x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return tot / norm;
}

/** One-dimensional noise in [-1, 1]. */
export const n1 = (t: number, s: number): number => vnoise(t, 0.5, s) * 2 - 1;

export type Pt = [number, number];

/** A smooth curve through the points (px), sampled every `step` px. */
export function catmull(points: Pt[], step = 0.25): Pt[] {
  const pts = [points[0], ...points, points[points.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.floor(seg / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const at = (j: 0 | 1) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
        + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** A W×H boolean mask, row-major. */
export class Mask {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.data = new Uint8Array(w * h); }
  has(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.data[y * this.w + x] === 1; }
  set(x: number, y: number, v = true): void { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = v ? 1 : 0; }
  clone(): Mask { const m = new Mask(this.w, this.h); m.data.set(this.data); return m; }
  bounds(): [number, number, number, number] | null {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.data[y * this.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }
}

/** Marks the pixels closer than half(i) to the curve. */
export function ribbon(mask: Mask, curve: Pt[], half: (i: number) => number, value = true): void {
  curve.forEach(([cx, cy], i) => {
    const r = half(i);
    if (r <= 0) return;
    const r2 = r * r;
    for (let y = Math.trunc(cy - r) - 1; y < Math.trunc(cy + r) + 2; y++) {
      for (let x = Math.trunc(cx - r) - 1; x < Math.trunc(cx + r) + 2; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) mask.set(x, y, value);
      }
    }
  });
}

/** No lone pixels nor one-pixel bites: the border is a line. */
export function clean(mask: Mask, passes = 2): void {
  const { w, h } = mask;
  for (let p = 0; p < passes; p++) {
    const src = mask.data.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const n4 = src[i - w] + src[i + w] + src[i - 1] + src[i + 1];
        if (src[i] && n4 <= 1) mask.data[i] = 0;
        else if (!src[i] && n4 >= 3) mask.data[i] = 1;
      }
    }
  }
}

/** Steps (4-neighbour) from each pixel of the mask to its border; 0 outside. */
export function distanceIn(mask: Mask): Int32Array {
  const { w, h } = mask;
  const big = 1e6;
  const d = new Int32Array(w * h);
  let frontier: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (mask.data[i]) d[i] = big; else frontier.push(i);
  }
  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier) {
      const v = d[i] + 1, x = i % w, y = (i / w) | 0;
      if (x + 1 < w && d[i + 1] > v) { d[i + 1] = v; next.push(i + 1); }
      if (x > 0 && d[i - 1] > v) { d[i - 1] = v; next.push(i - 1); }
      if (y + 1 < h && d[i + w] > v) { d[i + w] = v; next.push(i + w); }
      if (y > 0 && d[i - w] > v) { d[i - w] = v; next.push(i - w); }
    }
    frontier = next;
  }
  return d;
}

/** The pixels of a blob with a wavy border (a few big waves and a fine roughness). */
export function* organic(w: number, h: number, cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.14, fine = 0.05): Generator<Pt> {
  for (let y = Math.trunc(cy - ry * 1.4) - 1; y < Math.trunc(cy + ry * 1.4) + 2; y++) {
    for (let x = Math.trunc(cx - rx * 1.4) - 1; x < Math.trunc(cx + rx * 1.4) + 2; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const a = Math.atan2(dy, dx);
      const rr = 1 + wob * n1(a * 1.6 + 3, seed) + fine * n1(a * 7, seed + 1);
      if (dx * dx + dy * dy <= rr * rr) yield [x, y];
    }
  }
}

/** Python's round(): halves go to the even neighbour (the drawing scripts rounded so). */
export function pyRound(v: number): number {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Degrees to radians the way Python's math.radians does it (same bits). */
export const radians = (deg: number): number => deg * (Math.PI / 180);
