// Trace a reference that already looks like pixel art (an AI render in pixel
// style) without washing it out: `pixelize method=trace`.
//
// Such a render has no real grid (its blocks run from 4 to 28 px in the same
// image) and its edges come blurred, so averaging a cell or median-cutting the
// cells mixes an outline into the skin next to it. Here the palette comes
// first and nothing is ever averaged:
//
// 1. `tracePalette`: the dominant color of every cell of a coarse 96 x 96
//    pass (at 32 levels per channel, the median of the pixels sharing it),
//    near-equal colors folded into the most used (`foldColors`) until `max`.
// 2. `toPalette`: every pixel of the image goes to its palette color, after a
//    5 x 5 median that sharpens the blurred edges. Only then it is shrunk.
// 3. `dominantCells`: the image is cut into size x size even cells (nothing is
//    deformed) and every cell takes the palette color most of its pixels have:
//    a cell straddling an edge falls on one side or the other.
// 4. `traceBackground`: what touches the border and looks like the corner is
//    out, and the rim left tinted by the background takes the outline.
// 5. `fileTeeth`: the lone cell that juts out of a straight edge is filed off.
//
// Ported from the studio's portrait tracer (estudio#782, estudio#783), cell
// for cell: the same seven portraits come out the same.

import type { Rgba } from './png';

type Rgb = [number, number, number];
type Cells = Map<number, Rgb>; // key: y * width + x

/** numpy's rint: halves go to the even neighbour. */
function rint(x: number): number {
  const f = Math.floor(x);
  if (x - f === 0.5) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

/** The edges of `n` even cells over `length` (numpy linspace, rounded). */
export function evenEdges(length: number, n: number): number[] {
  const step = length / n;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(i === n ? length : rint(i * step));
  return out;
}

/** Weighted RGB distance ("redmean"): what the eye weighs. */
export function colorDistance(a: Rgb, b: Rgb): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Per cell of an even n x n grid, the key most of its pixels share (ties: the smallest key). */
function modeCells(keys: Int32Array, width: number, height: number, n: number,
  pick: (key: number, y0: number, y1: number, x0: number, x1: number) => Rgb): Cells {
  const ys = evenEdges(height, n), xs = evenEdges(width, n);
  const out: Cells = new Map();
  const count = new Map<number, number>();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      count.clear();
      for (let y = ys[j]; y < ys[j + 1]; y++) {
        for (let x = xs[i]; x < xs[i + 1]; x++) {
          const k = keys[y * width + x];
          count.set(k, (count.get(k) ?? 0) + 1);
        }
      }
      let best = -1, most = 0;
      for (const [k, c] of count) if (c > most || (c === most && k < best)) { best = k; most = c; }
      if (best >= 0) out.set(j * n + i, pick(best, ys[j], ys[j + 1], xs[i], xs[i + 1]));
    }
  }
  return out;
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const h = values.length >> 1;
  return values.length % 2 ? values[h] : (values[h - 1] + values[h]) / 2;
}

/** Near-equal colors go to the most used one, until only `max` remain. */
export function foldColors(cells: Cells, max = 60, near = 8): Cells {
  const count = new Map<string, number>();
  const rgb = new Map<string, Rgb>();
  for (const c of cells.values()) {
    const k = c.join(',');
    count.set(k, (count.get(k) ?? 0) + 1);
    rgb.set(k, c);
  }
  const to = new Map<string, string>();
  // First each rarely used color joins the most used one close to it; if that
  // still leaves too many to compare in pairs, again a little looser.
  for (;;) {
    const leaders: string[] = [];
    const order = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)!);
    for (const c of order) {
      const boss = leaders.find((d) => colorDistance(rgb.get(c)!, rgb.get(d)!) <= near);
      if (boss === undefined) leaders.push(c);
      else {
        count.set(boss, count.get(boss)! + count.get(c)!);
        count.delete(c);
        to.set(c, boss);
      }
    }
    if (count.size <= Math.max(max * 3, 120)) break;
    near *= 1.15;
  }
  // Then in pairs: the closest pair folds into the more used of the two.
  const alive = [...count.keys()];
  const n = alive.length;
  const m = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) m[i * n + j] = i === j ? Infinity : colorDistance(rgb.get(alive[i])!, rgb.get(alive[j])!);
  }
  for (let left = n; left > max; left--) {
    let at = 0;
    for (let k = 1; k < n * n; k++) if (m[k] < m[at]) at = k;
    const i = Math.floor(at / n), j = at % n;
    const [small, big] = count.get(alive[i])! <= count.get(alive[j])! ? [i, j] : [j, i];
    count.set(alive[big], count.get(alive[big])! + count.get(alive[small])!);
    count.delete(alive[small]);
    to.set(alive[small], alive[big]);
    for (let k = 0; k < n; k++) m[small * n + k] = m[k * n + small] = Infinity;
  }
  const final = (c: string): string => { while (to.has(c)) c = to.get(c)!; return c; };
  const out: Cells = new Map();
  for (const [p, c] of cells) out.set(p, rgb.get(final(c.join(',')))!);
  return out;
}

/** The colors of the image, dominant first and never averaged: an outline stays dark. */
export function tracePalette(img: Rgba, max = 60, near = 8, coarse = 96): Rgb[] {
  const { width, height, data } = img;
  const keys = new Int32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    keys[p] = ((data[p * 4] >> 3) << 10) | ((data[p * 4 + 1] >> 3) << 5) | (data[p * 4 + 2] >> 3);
  }
  const cells = modeCells(keys, width, height, coarse, (k, y0, y1, x0, x1) => {
    const ch: number[][] = [[], [], []];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = y * width + x;
        if (keys[p] === k) for (let c = 0; c < 3; c++) ch[c].push(data[p * 4 + c]);
      }
    }
    return ch.map((v) => Math.trunc(median(v))) as Rgb;
  });
  const seen = new Map<string, Rgb>();
  for (const c of foldColors(cells, max, near).values()) seen.set(c.join(','), c);
  return [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

/** A 5 x 5 median per channel, the border repeated outwards (PIL's MedianFilter(5)). */
export function median5(img: Rgba): Uint8Array {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height * 3);
  const win = new Uint8Array(25);
  const hist = new Uint16Array(256);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -2; dx <= 2; dx++) {
            const xx = Math.min(width - 1, Math.max(0, x + dx));
            win[n++] = data[(yy * width + xx) * 4 + c];
          }
        }
        for (let k = 0; k < 25; k++) hist[win[k]]++;
        let v = 0;
        for (let seen = 0; ; v++) { seen += hist[v]; if (seen > 12) break; }
        out[(y * width + x) * 3 + c] = v;
        for (let k = 0; k < 25; k++) hist[win[k]] = 0;
      }
    }
  }
  return out;
}

/** The palette index of every pixel, edges sharpened first; float32 like the original. */
export function toPalette(img: Rgba, palette: Rgb[]): Int32Array {
  const f = Math.fround;
  const sharp = median5(img);
  const n = img.width * img.height;
  const best = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    const r = sharp[p * 3], g = sharp[p * 3 + 1], b = sharp[p * 3 + 2];
    let least = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i];
      const rm = f((r + c[0]) / 2);
      const d0 = r - c[0], d1 = g - c[1], d2 = b - c[2];
      const t0 = f(f(2 + f(rm / 256)) * f(d0 * d0));
      const t1 = f(4 * f(d1 * d1));
      const t2 = f(f(2 + f(f(255 - rm) / 256)) * f(d2 * d2));
      const k = f(f(t0 + t1) + t2);
      if (k < least) { least = k; best[p] = i; }
    }
  }
  return best;
}

/** The palette color most pixels of each even cell have. */
export function dominantCells(indices: Int32Array, width: number, height: number, palette: Rgb[], n: number): Cells {
  return modeCells(indices, width, height, n, (k) => palette[k]);
}

/** File the teeth: a lone cell against a straight edge (its two neighbours on one
 * axis and one on the other share a color) takes it. A 1-cell line is no tooth. */
export function fileTeeth(px: Cells, n: number): Cells {
  const out: Cells = new Map(px);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? undefined : px.get(y * n + x));
  const same = (a?: Rgb, b?: Rgb) => a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  for (const [p, c] of px) {
    const x = p % n, y = Math.floor(p / n);
    const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
    if (l !== undefined && same(l, r) && !same(l, c) && (same(u, l) || same(d, l))) out.set(p, l);
    else if (u !== undefined && same(u, d) && !same(u, c) && (same(l, u) || same(r, u))) out.set(p, u);
  }
  return out;
}

function tint(c: Rgb): number[] {
  const m = (c[0] + c[1] + c[2]) / 3;
  return c.map((v) => v - m);
}

/** Out goes what touches the border and looks like the top-left corner (a
 * gradient background is followed neighbour by neighbour), and the enclosed
 * holes of a color already out; the rim left tinted by it takes the outline. */
export function traceBackground(px: Cells, n: number, tolerance = 60): Cells {
  const bg = px.get(0)!;
  const near = (p: number) => colorDistance(px.get(p)!, bg) < tolerance;
  const out = new Set<number>();
  const queue: number[] = [];
  for (let k = 0; k < n; k++) for (const p of [k, (n - 1) * n + k, k * n, k * n + n - 1]) {
    if (!out.has(p) && near(p)) { out.add(p); queue.push(p); }
  }
  while (queue.length) {
    const p = queue.pop()!;
    const x = p % n, y = Math.floor(p / n);
    for (const [qx, qy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const q = qy * n + qx;
      if (qx >= 0 && qy >= 0 && qx < n && qy < n && !out.has(q) && near(q)) { out.add(q); queue.push(q); }
    }
  }
  const gone = [...out].sort((a, b) => a - b);
  const step = Math.max(1, Math.floor(gone.length / 40));
  const samples: Rgb[] = [];
  for (let k = 0; k < gone.length; k += step) samples.push(px.get(gone[k])!);
  const keep: Cells = new Map();
  for (const [p, c] of px) {
    if (!out.has(p) && !samples.some((s) => colorDistance(c, s) < tolerance * 0.5)) keep.set(p, c);
  }
  const tb = tint(bg), nb = Math.hypot(...tb);
  const tinted = (c: Rgb) => {
    const t = tint(c), nt = Math.hypot(...t);
    return nt > 18 && nb > 0 && (t[0] * tb[0] + t[1] * tb[1] + t[2] * tb[2]) / (nt * nb) > 0.85;
  };
  const luma = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  // Two rounds: the tinted rim can be two cells wide.
  for (let round = 0; round < 2; round++) {
    const before: Cells = new Map(keep);
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && before.has(y * n + x);
    for (const [p, c] of before) {
      const x = p % n, y = Math.floor(p / n);
      const onEdge = !has(x + 1, y) || !has(x - 1, y) || !has(x, y + 1) || !has(x, y - 1);
      if (!onEdge || !tinted(c)) continue;
      let darkest: Rgb | undefined;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        if (!has(x + i, y + j)) continue;
        const v = before.get((y + j) * n + x + i)!;
        if (!tinted(v) && (darkest === undefined || luma(v) < luma(darkest))) darkest = v;
      }
      if (darkest) keep.set(p, darkest);
      else keep.delete(p);
    }
  }
  return keep;
}

export interface TraceOptions {
  /** cells per side */
  size: number;
  maxColors?: number;
  removeBackground?: boolean;
}

/** An image to size x size cells of hex colors (key y * size + x); a missing key is transparent. */
export function trace(img: Rgba, o: TraceOptions): Map<number, string> {
  const palette = tracePalette(img, o.maxColors ?? 60);
  let px = dominantCells(toPalette(img, palette), img.width, img.height, palette, o.size);
  if (o.removeBackground ?? true) px = traceBackground(px, o.size);
  px = fileTeeth(px, o.size);
  const hex = (c: Rgb) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  return new Map([...px].map(([p, c]) => [p, hex(c)]));
}
