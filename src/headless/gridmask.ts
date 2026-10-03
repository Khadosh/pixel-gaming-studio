// grid_mask: the organic autotile. A map is a grid of cells (wall, floor,
// water…) and the game walks on that grid, but a painted map should not show
// it: walls with straight 16 px borders and square corners read as tiles.
// gridMask turns the grid into a per-pixel shape, one letter per pixel, that a
// drawing script then paints however it likes:
//
// - each pixel takes the letter that weighs most in a square window around it
//   (`round` px of radius), so convex and concave corners are cut round;
// - the window is centered on a point moved by smooth noise (`wobble` px,
//   `wobble_scale` px per bump), so borders meander instead of running straight;
// - `keep` guarantees the middle of every cell of a letter (inset px from the
//   cell border), so a one-cell corridor never closes;
// - `clean` passes remove lone pixels and one-pixel bites and spurs: the border
//   is a drawn line, never a dither (the rule that rejected `terrain`'s brush).
//
// Deterministic by seed. Unlike `terrain` it does not color anything.

export interface GridMaskOptions {
  /** One string per row of cells, one letter per cell. */
  grid: string[];
  cell?: number;
  /** Window radius in px (corners are cut this much). Default cell / 3. */
  round?: number;
  /** How far the border wanders, px. Default 3. */
  wobble?: number;
  /** Size of a wobble bump, px. Default 9. */
  wobble_scale?: number;
  seed?: number;
  /** Letter → inset in px: the middle of each of its cells always keeps it. */
  keep?: Record<string, number>;
  /** Cleaning passes (lone pixels, bites). Default 2. */
  clean?: number;
}

export interface GridMask {
  width: number;
  height: number;
  /** One string per pixel row, one letter per pixel. */
  rows: string[];
}

function valueNoise(seed: number): (x: number, y: number) => number {
  const hash = (ix: number, iy: number): number => {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
  };
  const fade = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = fade(x - ix), fy = fade(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  };
}

/** Two octaves, roughly in [-1, 1]. */
const fbm = (n: (x: number, y: number) => number, x: number, y: number): number =>
  n(x, y) * 0.7 + n(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.3;

export function gridMask(opts: GridMaskOptions): GridMask {
  const grid = opts.grid;
  if (!grid.length || !grid[0].length) throw new Error('grid_mask: empty grid');
  const cw = grid[0].length, ch = grid.length;
  grid.forEach((row, i) => { if (row.length !== cw) throw new Error(`grid_mask: row ${i} has ${row.length} cells, expected ${cw}`); });
  const cell = opts.cell ?? 16;
  const round = Math.max(1, Math.round(opts.round ?? cell / 3));
  const wobble = opts.wobble ?? 3, wscale = opts.wobble_scale ?? 9;
  const seed = opts.seed ?? 1;
  const letters = [...new Set(grid.join(''))];
  const index = new Map(letters.map((c, i) => [c, i]));
  const w = cw * cell, h = ch * cell;
  const L = letters.length;

  // Summed-area table per letter, at pixel resolution.
  const sat = letters.map(() => new Int32Array((w + 1) * (h + 1)));
  for (let y = 0; y < h; y++) {
    const row = grid[Math.floor(y / cell)];
    for (let x = 0; x < w; x++) {
      const m = index.get(row[Math.floor(x / cell)])!;
      for (let k = 0; k < L; k++) {
        const t = sat[k];
        t[(y + 1) * (w + 1) + x + 1] = (k === m ? 1 : 0) + t[y * (w + 1) + x + 1] + t[(y + 1) * (w + 1) + x] - t[y * (w + 1) + x];
      }
    }
  }
  const boxSum = (t: Int32Array, x0: number, y0: number, x1: number, y1: number): number =>
    t[y1 * (w + 1) + x1] - t[y0 * (w + 1) + x1] - t[y1 * (w + 1) + x0] + t[y0 * (w + 1) + x0];

  const nx = valueNoise(seed + 11), ny = valueNoise(seed + 23);
  const mat = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const qx = Math.round(x + wobble * fbm(nx, x / wscale, y / wscale));
    const qy = Math.round(y + wobble * fbm(ny, x / wscale + 31.7, y / wscale - 12.3));
    const x0 = Math.max(0, Math.min(w, qx - round)), x1 = Math.max(0, Math.min(w, qx + round + 1));
    const y0 = Math.max(0, Math.min(h, qy - round)), y1 = Math.max(0, Math.min(h, qy + round + 1));
    const own = index.get(grid[Math.max(0, Math.min(ch - 1, Math.floor(qy / cell)))][Math.max(0, Math.min(cw - 1, Math.floor(qx / cell)))])!;
    let best = own, bestN = -1;
    if (x1 > x0 && y1 > y0) {
      for (let k = 0; k < L; k++) {
        const n = boxSum(sat[k], x0, y0, x1, y1) + (k === own ? 0.5 : 0);
        if (n > bestN) { bestN = n; best = k; }
      }
    }
    mat[y * w + x] = best;
  }

  const keepCells = (): void => {
    for (const [c, inset] of Object.entries(opts.keep ?? {})) {
      const k = index.get(c);
      if (k === undefined) continue;
      for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
        if (grid[cy][cx] !== c) continue;
        for (let y = cy * cell + inset; y < (cy + 1) * cell - inset; y++)
          for (let x = cx * cell + inset; x < (cx + 1) * cell - inset; x++) mat[y * w + x] = k;
      }
    }
  };
  keepCells();

  // A pixel with at most one 4-neighbour of its own letter is a lone pixel or
  // the tip of a one-pixel spur: it takes the letter most of its neighbours have.
  for (let pass = 0; pass < (opts.clean ?? 2); pass++) {
    const next = mat.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const m = mat[y * w + x];
      const around: number[] = [];
      if (x > 0) around.push(mat[y * w + x - 1]);
      if (x < w - 1) around.push(mat[y * w + x + 1]);
      if (y > 0) around.push(mat[(y - 1) * w + x]);
      if (y < h - 1) around.push(mat[(y + 1) * w + x]);
      const same = around.filter(n => n === m).length;
      if (same > 1 || around.length < 3) continue;
      const counts = new Map<number, number>();
      for (const n of around) if (n !== m) counts.set(n, (counts.get(n) ?? 0) + 1);
      let best = m, bestN = 0;
      for (const [n, k] of counts) if (k > bestN) { bestN = k; best = n; }
      next[y * w + x] = best;
    }
    mat.set(next);
    keepCells();
  }

  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += letters[mat[y * w + x]];
    rows.push(s);
  }
  return { width: w, height: h, rows };
}
