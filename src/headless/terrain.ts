// Terrain: a whole ground painted from a grid of cells, with organic borders.
//
// A tile map draws a ground cell by cell, and a 16 px tile repeated gives ruler
// borders: square steps where the path turns, the same water pattern every cell,
// a hard line between grass and mud. `paintTerrain` paints the ground of a map
// as one picture from the same grid of letters (one material per cell):
//
// - Borders: every pixel takes the material whose cells weigh most around it
//   (bilinear between cell centers, so corners round), sampled at a point moved
//   by smooth noise (`wobble`), so the line meanders instead of stepping.
// - Variation: each material is a ramp of tones; a low noise picks the tone in
//   wide patches, with an ordered dither only where two patches meet.
// - Height: materials have a `layer`. Where a higher one meets a lower one the
//   lower gets a cast `rim` under the bank (only below it: light from above), the
//   higher gets its bank face (`lip`) on its south side, an `edge` band all around
//   (the foam of the water), and `fringe` blades of the higher one over the line.
// - Depth: a material can pick its tone by distance to the shore (`depth`).
// - Details: small stamps (pebbles, flowers, tufts) dropped at random inside
//   their material, away from its border, never on top of each other.
// - Decals: stamps at a fixed place (the stones of a ford).
// - Shadows: ellipses (in cells) that darken whatever is under them a tone.
// - Pieces: sparse dashes of a color over some materials (`pieces`), for a game
//   to animate on top (glints on the water, the current of a stream).
//
// Deterministic: the same recipe and seed give the same picture.

import type { SpriteAsset } from '../lib/types';
import { colorIndex, createAsset, getFrame, normalizeHex } from './assetModel';
import { seededRandom } from './ops';

export interface TerrainStamp {
  /** Rows of glyphs; '.' is transparent. */
  rows: string[];
  colors: Record<string, string>;
  /** Expected stamps per cell of this material. */
  per_cell: number;
  /** Pixels kept away from any other material (default 2). */
  margin?: number;
}

export interface TerrainFringe {
  colors: string[];
  /** 0..1 share of the border pixels that get a blade (default 0.3). */
  chance?: number;
  /** Blade length in pixels, [min, max] (default [1, 2]). */
  len?: [number, number];
}

export interface TerrainMaterial {
  name?: string;
  /** Tones from dark to light. */
  tones: string[];
  /** Index of the main tone (default: the middle one). */
  base?: number;
  /** How many tones the patches reach away from the base (default 1). */
  spread?: number;
  /** Patch size in pixels (default 10). */
  patch?: number;
  /** 0..1 width of the dithered seam between two patches (default 0.3). */
  dither?: number;
  /** Pixels this material grows into its neighbors (negative shrinks). */
  grow?: number;
  /** Height order: water low, mud and path in the middle, grass high. */
  layer?: number;
  /** Colors of the band just below a higher material (by distance, 1st px first). */
  rim?: string[];
  /** Colors of this material's south face over a lower one (1st px is the border). */
  lip?: string[];
  /** Band all around, inside this material, where it touches a higher one. */
  edge?: string[];
  /** 0..1 share of rim / lip / edge pixels left out, in clumps (default 0). */
  break?: number;
  /** Tone index by distance to any other material (each entry `depth_step` px). */
  depth?: number[];
  depth_step?: number;
  /** Blades of this material that cross into a lower neighbor. */
  fringe?: TerrainFringe;
  stamps?: TerrainStamp[];
}

export interface TerrainShadow {
  /** Center, in cells (fractions allowed). */
  at: [number, number];
  /** Radii, in cells. */
  r: [number, number];
}

export interface TerrainPiece {
  id: string;
  /** Material letters it lives on. */
  materials: string;
  color: string;
  /** 0..1 share of the eligible pixels that start a dash (default 0.03). */
  density?: number;
  /** Dash length [min, max] in pixels (default [2, 3]). */
  len?: [number, number];
  /** Dash direction (default h). */
  dir?: 'h' | 'v';
  /** Pixels kept away from the shore (default 1). */
  margin?: number;
}

export interface TerrainDecal {
  rows: string[];
  colors: Record<string, string>;
  /** Center, in cells (fractions allowed). */
  at: [number, number];
}

export interface TerrainRecipe {
  /** Cell size in pixels (default 16). */
  cell?: number;
  /** One string per row, one letter per cell. */
  grid: string[];
  materials: Record<string, TerrainMaterial>;
  seed?: number;
  /** How far a border wanders, in pixels (default 4). */
  wobble?: number;
  /** Size of the wander, in pixels (default 14). */
  wobble_scale?: number;
  shadows?: TerrainShadow[];
  /** Stamps at a fixed place, over everything but the shadows (the stones of a ford). */
  decals?: TerrainDecal[];
  /** Darker color for a color under a shadow, when it is not a tone of a material. */
  shade?: Record<string, string>;
  pieces?: TerrainPiece[];
}

export interface TerrainResult {
  asset: SpriteAsset;
  pieces: { id: string; asset: SpriteAsset; cells: number }[];
  /** Pixels per material letter. */
  share: Record<string, number>;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x: number, y: number): number => BAYER4[(y & 3) * 4 + (x & 3)];

/** Smooth value noise in [-1, 1], one lattice per seed. */
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

function fbm(noise: (x: number, y: number) => number, x: number, y: number): number {
  return noise(x, y) * 0.7 + noise(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.3;
}

/** Multi-source BFS inside each material: distance (4-neighbor steps, 1 at the sources) up to `cap`. */
function distanceFrom(sources: Uint8Array, mat: Uint8Array, w: number, h: number, cap: number): Uint8Array {
  const dist = new Uint8Array(w * h).fill(255);
  let frontier: number[] = [];
  for (let i = 0; i < w * h; i++) if (sources[i]) { dist[i] = 1; frontier.push(i); }
  for (let d = 2; d <= cap && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w, y = (i - x) / w;
      const around = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of around) {
        if (j < 0 || dist[j] !== 255 || mat[j] !== mat[i]) continue;
        dist[j] = d;
        next.push(j);
      }
    }
    frontier = next;
  }
  return dist;
}

export function paintTerrain(recipe: TerrainRecipe, opts: { id?: string; names?: Record<string, string> } = {}): TerrainResult {
  const cell = recipe.cell ?? 16;
  const grid = recipe.grid;
  if (!grid.length) throw new Error('terrain: empty grid');
  const cw = grid[0].length, ch = grid.length;
  grid.forEach((row, i) => { if (row.length !== cw) throw new Error(`terrain: row ${i} has ${row.length} cells, expected ${cw}`); });
  const letters = Object.keys(recipe.materials);
  for (const row of grid) for (const c of row) if (!recipe.materials[c]) throw new Error(`terrain: no material for "${c}"`);
  for (const [k, m] of Object.entries(recipe.materials)) {
    if (k.length !== 1) throw new Error(`terrain: material key "${k}" must be one letter`);
    if (!m.tones?.length) throw new Error(`terrain: material "${k}" needs tones`);
  }
  const w = cw * cell, h = ch * cell;
  const seed = recipe.seed ?? 1;
  const rand = seededRandom(seed);
  const wobbleNoiseX = valueNoise(seed + 11), wobbleNoiseY = valueNoise(seed + 23);
  const toneNoise = valueNoise(seed + 37), breakNoise = valueNoise(seed + 53);
  const wobble = recipe.wobble ?? 4, wscale = recipe.wobble_scale ?? 14;
  const matIndex = new Map(letters.map((k, i) => [k, i]));
  const mats = letters.map(k => recipe.materials[k]);
  const layerOf = mats.map(m => m.layer ?? 0);
  const cellMat = (cx: number, cy: number): number =>
    matIndex.get(grid[Math.min(ch - 1, Math.max(0, cy))][Math.min(cw - 1, Math.max(0, cx))])!;

  // 1. Which material each pixel shows.
  const mat = new Uint8Array(w * h);
  const weights = new Float32Array(mats.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const qx = x + 0.5 + wobble * fbm(wobbleNoiseX, x / wscale, y / wscale);
    const qy = y + 0.5 + wobble * fbm(wobbleNoiseY, x / wscale + 31.7, y / wscale - 12.3);
    const gx = qx / cell - 0.5, gy = qy / cell - 0.5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const u = gx - x0, v = gy - y0;
    weights.fill(0);
    weights[cellMat(x0, y0)] += (1 - u) * (1 - v);
    weights[cellMat(x0 + 1, y0)] += u * (1 - v);
    weights[cellMat(x0, y0 + 1)] += (1 - u) * v;
    weights[cellMat(x0 + 1, y0 + 1)] += u * v;
    let best = 0, bestW = -Infinity;
    for (let m = 0; m < mats.length; m++) {
      if (weights[m] <= 0) continue;
      const score = weights[m] + (mats[m].grow ?? 0) / cell;
      if (score > bestW) { bestW = score; best = m; }
    }
    mat[y * w + x] = best;
  }

  // 2. Distances to the borders.
  const at = (x: number, y: number): number => mat[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const borderAny = new Uint8Array(w * h), borderUp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = mat[y * w + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const n = mat[yy * w + xx];
      if (n === m) continue;
      borderAny[y * w + x] = 1;
      if (layerOf[n] > layerOf[m]) borderUp[y * w + x] = 1;
    }
  }
  const distAny = distanceFrom(borderAny, mat, w, h, 24);
  const distUp = distanceFrom(borderUp, mat, w, h, 8);

  // 3. Colors.
  const asset = createAsset({ id: opts.id ?? 'terrain', width: w, height: h, category: 'terrain' });
  const frame = getFrame(asset, 0, 0);
  const idx = (hex: string): number => {
    const i = colorIndex(asset, hex);
    const name = opts.names?.[normalizeHex(hex)];
    if (name) asset.colorNames[i] = name;
    return i;
  };
  const toneIdx = mats.map(m => m.tones.map(idx));
  const shadeOf = new Map<number, number>();
  mats.forEach((m, mi) => toneIdx[mi].forEach((t, i) => { if (!shadeOf.has(t)) shadeOf.set(t, toneIdx[mi][Math.max(0, i - 1)]); }));
  for (const [from, to] of Object.entries(recipe.shade ?? {})) shadeOf.set(idx(from), idx(to));
  const broken = (m: TerrainMaterial, x: number, y: number): boolean =>
    (m.break ?? 0) > 0 && (breakNoise(x / 3, y / 3) + 1) / 2 < (m.break ?? 0);

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, mi = mat[i], m = mats[mi];
    const tones = toneIdx[mi];
    const base = m.base ?? Math.floor((tones.length - 1) / 2);
    let t: number;
    if (m.depth?.length) {
      const step = m.depth_step ?? 2;
      const d = distAny[i];
      const k = Math.min(m.depth.length - 1, Math.floor((Math.min(d, 254) - 1 + (bayer(x, y) - 0.5) * step * 0.9) / step));
      t = m.depth[Math.max(0, k)];
    } else {
      const v = fbm(toneNoise, x / (m.patch ?? 10), y / (m.patch ?? 10)) * 1.6 * (m.spread ?? 1);
      t = base + Math.round(v + (bayer(x, y) - 0.5) * (m.dither ?? 0.3));
    }
    frame[y][x] = tones[Math.max(0, Math.min(tones.length - 1, t))];
    // The band around, toward a higher material.
    if (m.edge?.length) {
      const d = distUp[i];
      if (d <= m.edge.length && !broken(m, x, y)) frame[y][x] = idx(m.edge[d - 1]);
    }
    // The cast shadow under a higher bank (the bank is above this pixel).
    if (m.rim?.length) {
      for (let k = 1; k <= m.rim.length; k++) {
        const n = at(x, y - k);
        if (y - k < 0 || n === mi) continue;
        if (layerOf[n] > layerOf[mi]) {
          let clear = true;
          for (let j = 1; j < k; j++) if (at(x, y - j) !== mi) clear = false;
          if (clear && !broken(m, x + 7, y)) frame[y][x] = idx(m.rim[k - 1]);
        }
        break;
      }
    }
    // The face of this bank over a lower material below it.
    if (m.lip?.length) {
      for (let k = 1; k <= m.lip.length; k++) {
        const n = at(x, y + k);
        if (y + k >= h || n === mi) continue;
        if (layerOf[n] < layerOf[mi]) {
          let clear = true;
          for (let j = 1; j < k; j++) if (at(x, y + j) !== mi) clear = false;
          if (clear && !broken(m, x, y + 5)) frame[y][x] = idx(m.lip[m.lip.length - k]);
        }
        break;
      }
    }
  }

  // 4. Fringe: blades of a higher material over the line.
  for (let mi = 0; mi < mats.length; mi++) {
    const f = mats[mi].fringe;
    if (!f) continue;
    const colors = f.colors.map(idx);
    const [lo, hi] = f.len ?? [1, 2];
    const r = seededRandom(seed * 31 + mi);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mat[y * w + x] !== mi) continue;
      // Blades grow up and sideways from a pixel of this material into a lower one.
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const n = mat[yy * w + xx];
        if (n === mi || layerOf[n] >= layerOf[mi]) continue;
        if (r() >= (f.chance ?? 0.3)) continue;
        const len = lo + Math.floor(r() * (hi - lo + 1));
        const c = colors[Math.floor(r() * colors.length)];
        for (let k = 0; k < len; k++) {
          const px = x + dx * (k + 1) + (dy !== 0 && k > 0 ? (r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0) : 0);
          const py = y + (dy !== 0 ? dy * (k + 1) : -k);
          if (px < 0 || py < 0 || px >= w || py >= h) break;
          if (layerOf[mat[py * w + px]] >= layerOf[mi]) break;
          frame[py][px] = c;
        }
      }
    }
  }

  // 5. Stamps.
  const taken = new Uint8Array(w * h);
  for (let mi = 0; mi < mats.length; mi++) {
    for (const stamp of mats[mi].stamps ?? []) {
      const rows = stamp.rows;
      const sh = rows.length, sw = Math.max(...rows.map(r => r.length));
      const cols: Record<string, number> = {};
      for (const [g, hex] of Object.entries(stamp.colors)) cols[g] = idx(hex);
      const margin = stamp.margin ?? 2;
      for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
        if (matIndex.get(grid[cy][cx]) !== mi) continue;
        let n = Math.floor(stamp.per_cell) + (rand() < stamp.per_cell % 1 ? 1 : 0);
        for (let tries = 0; n > 0 && tries < n * 6; tries++) {
          const ox = cx * cell + Math.floor(rand() * (cell + 4)) - 2, oy = cy * cell + Math.floor(rand() * (cell + 4)) - 2;
          let ok = true;
          for (let sy = 0; sy < sh && ok; sy++) for (let sx = 0; sx < sw && ok; sx++) {
            if ((rows[sy][sx] ?? '.') === '.') continue;
            const px = ox + sx, py = oy + sy;
            if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) { ok = false; break; }
            const i = py * w + px;
            if (mat[i] !== mi || distAny[i] <= margin || taken[i]) ok = false;
          }
          if (!ok) continue;
          for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) {
            const g = rows[sy][sx] ?? '.';
            if (g === '.') continue;
            if (cols[g] === undefined) throw new Error(`terrain: stamp glyph "${g}" has no color`);
            frame[oy + sy][ox + sx] = cols[g];
          }
          for (let sy = -1; sy <= sh; sy++) for (let sx = -1; sx <= sw; sx++) {
            const px = ox + sx, py = oy + sy;
            if (px >= 0 && py >= 0 && px < w && py < h) taken[py * w + px] = 1;
          }
          n--;
        }
      }
    }
  }

  // 6. Decals.
  for (const d of recipe.decals ?? []) {
    const sh = d.rows.length, sw = Math.max(...d.rows.map(r => r.length));
    const ox = Math.round(d.at[0] * cell - sw / 2), oy = Math.round(d.at[1] * cell - sh / 2);
    for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) {
      const g = d.rows[sy][sx] ?? '.';
      const px = ox + sx, py = oy + sy;
      if (g === '.' || px < 0 || py < 0 || px >= w || py >= h) continue;
      if (d.colors[g] === undefined) throw new Error(`terrain: decal glyph "${g}" has no color`);
      frame[py][px] = idx(d.colors[g]);
    }
  }

  // 7. Shadows.
  for (const s of recipe.shadows ?? []) {
    const cx = s.at[0] * cell, cy = s.at[1] * cell, rx = s.r[0] * cell, ry = s.r[1] * cell;
    for (let y = Math.max(0, Math.floor(cy - ry - 1)); y < Math.min(h, Math.ceil(cy + ry + 1)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx - 1)); x < Math.min(w, Math.ceil(cx + rx + 1)); x++) {
        const e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (e < 1 - (bayer(x, y) - 0.5) * 0.45 - 0.12) {
          const to = shadeOf.get(frame[y][x]);
          if (to !== undefined) frame[y][x] = to;
        }
      }
    }
  }

  // 8. Pieces to animate.
  const pieces: TerrainResult['pieces'] = [];
  for (const p of recipe.pieces ?? []) {
    const piece = createAsset({ id: `${asset.id}_${p.id}`, width: w, height: h, category: 'terrain' });
    const pf = getFrame(piece, 0, 0);
    const ci = colorIndex(piece, p.color);
    const pname = opts.names?.[normalizeHex(p.color)];
    if (pname) piece.colorNames[ci] = pname;
    const allowed = new Set([...p.materials].map(k => matIndex.get(k)).filter(v => v !== undefined));
    const r = seededRandom(seed * 7 + p.id.length * 131 + p.id.charCodeAt(0));
    const [lo, hi] = p.len ?? [2, 3];
    const margin = p.margin ?? 1;
    let cells = 0;
    const ok = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h
      && allowed.has(mat[y * w + x]) && distAny[y * w + x] > margin && !pf[y][x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!ok(x, y) || r() >= (p.density ?? 0.03)) continue;
      const len = lo + Math.floor(r() * (hi - lo + 1));
      const ddx = p.dir === 'v' ? 0 : 1, ddy = p.dir === 'v' ? 1 : 0;
      // Not touching another dash.
      let free = true;
      for (let k = -1; k <= len && free; k++) for (const o of [-1, 0, 1]) {
        const xx = x + ddx * k + ddy * o, yy = y + ddy * k + ddx * o;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && pf[yy][xx]) free = false;
      }
      if (!free) continue;
      for (let k = 0; k < len; k++) {
        const xx = x + ddx * k, yy = y + ddy * k;
        if (!ok(xx, yy)) break;
        pf[yy][xx] = ci;
        cells++;
      }
    }
    pieces.push({ id: p.id, asset: piece, cells });
  }

  const share: Record<string, number> = {};
  for (const k of letters) share[k] = 0;
  for (let i = 0; i < w * h; i++) share[letters[mat[i]]]++;
  return { asset, pieces, share };
}
