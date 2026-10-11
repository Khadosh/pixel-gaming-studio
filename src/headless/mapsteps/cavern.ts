// A cave lit only by a torch: the walls of the game grid as a mass of rock seen
// from above (pgs grid_mask), with their south faces where they give on a floor
// below; a cold stone floor; roots coming down the faces, dripping and hanging
// in front; inscriptions carved in columns; a ladder of roots down a shaft; a
// still pool; a formation carved in the floor that lights up on its own layer;
// the dark past the map; lone pixels softened into accents.
// Port of the roots-of-the-pine script of The Unwritten Dao
// (scripts/suelo_raices.py): same numbers, same pixels.

import { gridMask } from '../gridmask';
import { catmull, fbm, h2, n1, pyRound, type Pt } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';
import type {
  CarvingsStep, CavernStep, FormationStep, GloomStep, HangrootsStep, PoolStep, RootladderStep, SoftenStep,
} from './cavernschema';

const DEFAULT_TONES = {
  edge: ['niebla sombra', 'piedra'] as [string, string],
  under: 'piedra sombra',
  face: 'túnica oscura',
  strata: ['pelo claro', 'piedra sombra'] as [string, string],
  vein: 'pelo oscuro',
  wet: ['celeste luz', 'niebla sombra'] as [string, string],
  outline: 'tinta',
  lip: 'pelo claro',
  top: ['tinta', 'túnica noche', 'pelo oscuro'] as [string, string, string],
  floor: ['piedra sombra', 'piedra', 'niebla sombra'] as [string, string, string],
  crack: 'pelo claro',
  foot: 'túnica oscura',
  pebble: ['piedra clara', 'piedra', 'pelo oscuro'] as [string, string, string],
};

/** What the cavern step leaves for the steps that follow. */
interface Cave {
  s: number;
  rows: string[];
  floor: Uint8Array;
  down: Int32Array;
  faceH: (x: number) => number;
  darkest: string;
  rootCells: Pt[];
  outline: string;
}
const CAVES = new WeakMap<Ctx, Cave>();

function cave(ctx: Ctx, step: string): Cave {
  const c = CAVES.get(ctx);
  if (!c) throw new Error(`map: ${step} needs a cavern step before it`);
  return c;
}

/** The same noise per cell the game's maze builder uses (integer hash, of 100). */
export function cellNoise(x: number, y: number, salt: number): number {
  const h = (BigInt(x) * 73856093n) ^ (BigInt(y) * 19349663n) ^ (BigInt(salt) * 83492791n);
  return Number((h ^ (h >> 13n)) % 100n);
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/** n steps darker by the recipe shade table; a color not in it falls to the darkest. */
function darker(ctx: Ctx, c: string, n = 1, darkest = 'tinta'): string {
  for (let i = 0; i < n; i++) c = ctx.recipe.shade?.[c] ?? darkest;
  return c;
}

function isFloor(ctx: Ctx, cv: Cave, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < ctx.W && y < ctx.H && cv.floor[y * ctx.W + x] === 1;
}

function bfs(W: number, H: number, sources: (i: number) => boolean, passable: (i: number) => boolean, cap: number): Int32Array {
  const d = new Int32Array(W * H).fill(cap);
  let frontier: number[] = [];
  for (let i = 0; i < W * H; i++) if (sources(i)) { d[i] = 0; frontier.push(i); }
  let k = 0;
  while (frontier.length && k < cap) {
    k++;
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = Y * W + X;
        if (d[j] > k && passable(j)) { d[j] = k; next.push(j); }
      }
    }
    frontier = next;
  }
  return d;
}

const key = (x: number, y: number) => (y + 4096) * 16384 + (x + 4096);
const unkey = (k: number): Pt => [(k % 16384) - 4096, Math.floor(k / 16384) - 4096];

/**
 * A root: a tube lit on the left, shaded on the right, with an ink outline on the
 * side of the shade. Points in px. Returns the keys of its body.
 */
function tube(layer: Layer, pts: Pt[], r0: number, r1: number, opts: { outline?: boolean; tones?: readonly string[]; keep?: (x: number, y: number) => boolean; ink?: string } = {}): Set<number> {
  const tones = opts.tones ?? ['madera clara', 'madera', 'madera sombra'];
  const keep = opts.keep, outline = opts.outline ?? true;
  const curve = catmull(pts, 0.35);
  const n = curve.length;
  const body = new Map<number, number>();
  curve.forEach(([cx, cy], i) => {
    const r = r0 + (r1 - r0) * i / Math.max(1, n - 1);
    for (let y = Math.trunc(cy - r) - 1; y < Math.trunc(cy + r) + 2; y++) {
      for (let x = Math.trunc(cx - r) - 1; x < Math.trunc(cx + r) + 2; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + (y + 0.5 - cy) ** 2 <= r * r) {
          const side = dx / Math.max(r, 0.6);
          const t = side < -0.35 ? 0 : (side > 0.4 ? 2 : 1);
          const k = key(x, y), had = body.get(k);
          if (had === undefined || t < had) body.set(k, t);
        }
      }
    }
  });
  for (const [k, t] of body) {
    const [x, y] = unkey(k);
    if (!keep || keep(x, y)) {
      let c = tones[t];
      // bark: a dark mark across now and then
      if (t === 1 && h2(x, floorDiv(y, 3), 71) < 0.12) c = tones[2];
      layer.set(x, y, c);
    }
  }
  if (outline) {
    for (const k of body.keys()) {
      const [x, y] = unkey(k);
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        const X = x + dx, Y = y + dy;
        if (!body.has(key(X, Y)) && (!keep || keep(X, Y))) layer.set(X, Y, opts.ink ?? 'tinta');
      }
    }
  }
  return new Set(body.keys());
}

// ------------------------------------------------------------------ cavern

export function runCavern(ctx: Ctx, st: CavernStep, seed: number): void {
  const { W, H, cell } = ctx;
  const [mx, my] = ctx.recipe.margin ?? [0, 0];
  const game = ctx.game, Wc = game.width, Hc = game.height;
  const s = seed;
  const T = { ...DEFAULT_TONES, ...(st.tones ?? {}) };
  // the cell grid with its margin: '#' rock, '.' floor, 's' a shaft
  const rows: string[][] = [];
  for (let cy = -my; cy < Hc + my; cy++) {
    const row: string[] = [];
    for (let cx = -mx; cx < Wc + mx; cx++) {
      const inside = cx >= 0 && cx < Wc && cy >= 0 && cy < Hc;
      row.push(inside && game.grid[cy][cx] !== '#' ? '.' : '#');
    }
    rows.push(row);
  }
  if (st.exits ?? true) {
    for (let v = 0; v < Hc; v++) for (let u = 0; u < Wc; u++) {
      if (game.grid[v][u] !== 'E') continue;
      const dx = u === 0 ? -1 : (u === Wc - 1 ? 1 : 0), dy = v === 0 ? -1 : (v === Hc - 1 ? 1 : 0);
      for (let k = 1; k <= mx; k++) {
        const gx = u + dx * k + mx, gy = v + dy * k + my;
        if (gy >= 0 && gy < rows.length && gx >= 0 && gx < rows[0].length) rows[gy][gx] = '.';
      }
    }
  }
  for (const [u, v0, v1] of st.shafts ?? []) for (let v = v0; v <= v1; v++) rows[v + my][u + mx] = 's';
  const grid = rows.map(r => r.join(''));
  const [kf, ks] = st.keep ?? [3, 4];
  const g = gridMask({ grid, cell, round: st.round ?? 5, wobble: st.wobble ?? 4, wobble_scale: st.wobble_scale ?? 8, seed: s, keep: { '.': kf, s: ks } });
  const floor = new Uint8Array(W * H), shaft = new Uint8Array(W * H);
  g.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { if (row[x] === '.') floor[y * W + x] = 1; else if (row[x] === 's') shaft[y * W + x] = 1; } });

  const distF = bfs(W, H, i => floor[i] === 1, i => floor[i] !== 1, 40);
  const distW = bfs(W, H, i => floor[i] !== 1, i => floor[i] === 1, 8);
  const down = new Int32Array(W * H), upWall = new Int32Array(W * H);
  for (let x = 0; x < W; x++) {
    let k = 99;
    for (let y = H - 1; y >= 0; y--) { k = floor[y * W + x] ? 0 : Math.min(99, k + 1); down[y * W + x] = k; }
    k = 99;
    for (let y = 0; y < H; y++) { k = !floor[y * W + x] ? 0 : Math.min(99, k + 1); upWall[y * W + x] = k; }
  }
  const [fb, fs, fp, fs2, fp2] = st.face ?? [7, 1.5, 7, 0.7, 13];
  const faceH = (x: number) => fb + pyRound(fs * n1(x / fp, s + 3)) + pyRound(fs2 * n1(x / fp2 + 5.0, s + 4));
  const darkest = st.darkest ?? 'tinta';
  const dk = (c: string, n = 1) => darker(ctx, c, n, darkest);
  const cv = ctx.ground, glints = ctx.layer(st.glints ?? 'brillos');

  const facet = (x: number, y: number, size: number, salt: number): [Pt, number] => {
    const gx = x / size, gy = y / size;
    let best = 9e9, bestKey: Pt = [0, 0], second = 9e9;
    for (let j = Math.trunc(gy) - 1; j < Math.trunc(gy) + 2; j++) {
      for (let i = Math.trunc(gx) - 1; i < Math.trunc(gx) + 2; i++) {
        const px = i + h2(i, j, s + 50 + salt), py = j + h2(i, j, s + 60 + salt);
        const d = (gx - px) ** 2 + (gy - py) ** 2;
        if (d < best) { second = best; best = d; bestKey = [i, j]; } else if (d < second) second = d;
      }
    }
    return [bestKey, Math.sqrt(second) - Math.sqrt(best)];
  };
  const [topSize, floorSize] = st.facets ?? [12, 11];

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (floor[i]) continue;
    if (shaft[i]) { cv.set(x, y, 'tinta'); continue; }
    const hf = faceH(x), dn = down[i];
    if (dn <= hf && dn < 99) {
      const v = hf - dn;
      let c: string;
      if (v === 0) c = h2(floorDiv(x, 3), y, s + 7) > 0.35 ? T.edge[0] : T.edge[1];
      else if (v === 1) c = T.under;
      else if (dn <= 1) c = T.face;
      else {
        // the face: cold rock in strata going down
        c = T.face;
        const strata = n1(x / 1.7, s + 9);
        if (strata > 0.4) c = T.strata[0];
        else if (strata < -0.5 && v < hf - 3) c = T.strata[1];
        // a vein running sideways
        if (Math.abs(v - 3 - pyRound(1.5 * n1(x / 9.0, s + 11))) < 0.5 && n1(x / 4.0, s + 12) > 0.1) c = T.vein;
      }
      cv.set(x, y, c);
      // the rock sweats: a cold glint two px high, that twinkles
      if (v > 1 && v < hf - 2 && h2(x, floorDiv(y, 2), s + 14) < 0.012) {
        glints.set(x, y, T.wet[0]);
        glints.set(x, y + 1, T.wet[1]);
      }
      continue;
    }
    // above: rock in facets, with its outline and a lip where it gives on the floor
    const df = distF[i];
    if (df <= 1) { cv.set(x, y, T.outline); continue; }
    if (df === 2 && down[i] > hf + 1) { cv.set(x, y, T.lip); continue; }
    const [k, edge] = facet(x, y, topSize, 0);
    const r = h2(k[0], k[1], s + 70);
    let c = r < 0.62 ? T.top[0] : (r < 0.93 ? T.top[1] : T.top[2]);
    if (df <= 4 && c === T.top[0] && h2(floorDiv(x, 2), floorDiv(y, 2), s + 73) < 0.5) c = T.top[1];
    if (edge < 0.06 && c !== T.top[0]) c = T.top[0];
    cv.set(x, y, c);
  }

  // the floor: cold stone in cracked slabs, worn light, dark at the foot of the walls
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!floor[i]) continue;
    const t = fbm(x / 9.0, y / 9.0, s + 20);
    let c = T.floor[1];
    if (t < 0.36) c = T.floor[0];
    else if (t > 0.76 && h2(floorDiv(x, 11), floorDiv(y, 11), s + 22) < 0.5) c = T.floor[2];
    const [k, edge] = facet(x, y, floorSize, 5);
    if (edge < 0.06 && h2(k[0], k[1], s + 21) < 0.35 && n1(x / 5.0 + y / 7.0, s + 23) > -0.2) c = T.crack;
    const uw = upWall[i], dw = distW[i];
    if (uw <= 2) c = T.foot;
    else if (uw <= 4) c = dk(c);
    else if (dw <= 1) c = T.foot;
    else if (dw <= 3) c = dk(c);
    cv.set(x, y, c);
  }
  // loose pebbles (light on top, their shadow below)
  const odds = st.pebbles ?? 0.0015;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (floor[y * W + x] && floor[(y + 1) * W + x] && distW[y * W + x] > 2 && h2(x, y, s + 30) < odds) {
      cv.set(x, y, h2(x, y, s + 32) < 0.4 ? T.pebble[0] : T.pebble[1]);
      cv.set(x + 1, y, T.pebble[1]);
      cv.set(x, y + 1, T.pebble[2]);
      cv.set(x + 1, y + 1, T.pebble[2]);
    }
  }
  CAVES.set(ctx, { s, rows: grid, floor, down, faceH, darkest, rootCells: [], outline: T.outline });
}

/** The face cells of the grid: rock over floor inside the map, in grid order. */
function faceCells(ctx: Ctx, cv: Cave): Pt[] {
  const [mx, my] = ctx.recipe.margin ?? [0, 0];
  const out: Pt[] = [];
  for (let cy = 0; cy < ctx.game.height; cy++) for (let cx = 0; cx < ctx.game.width; cx++) {
    if (cv.rows[cy + my][cx + mx] === '#' && cy + 1 < ctx.game.height && cv.rows[cy + 1 + my][cx + mx] === '.') out.push([cx, cy]);
  }
  return out;
}

/** The first floor row below (x, y0). */
function faceBottom(ctx: Ctx, cv: Cave, x: number, y0: number): number {
  let y = y0;
  while (y < ctx.H && !cv.floor[y * ctx.W + x]) y++;
  return y;
}

// ------------------------------------------------------------------ hangroots

export function runHangroots(ctx: Ctx, st: HangrootsStep): void {
  const cv = cave(ctx, 'hangroots');
  const { W, H, cell, ox: OX, oy: OY } = ctx, s = cv.s, g = ctx.ground;
  const tones = st.tones ?? ['madera clara', 'madera', 'madera sombra'];
  const front = ctx.layer(st.front ?? 'raices'), drops = ctx.layer(st.drops ?? 'gotas'), glints = ctx.layer(st.glints ?? 'brillos');
  const fl = (x: number, y: number) => isFloor(ctx, cv, x, y);
  const roots = faceCells(ctx, cv).filter(([cx, cy]) => cellNoise(cx, cy, 1) < (st.odds ?? 24));
  cv.rootCells = roots;
  const occupied = new Set<number>();
  for (const d of ctx.game.decor ?? []) occupied.add(key(d.at[0], d.at[1]));
  for (const p of ctx.game.occupied ?? []) occupied.add(key(p[0], p[1]));
  const wood = new Set([...tones, cv.outline]);

  for (const [cx, cy] of roots) {
    const px0 = OX + cx * cell + 4 + Math.trunc(h2(cx, cy, s + 40) * 8);
    const top = OY + cy * cell;
    const fb = faceBottom(ctx, cv, px0, top);
    if (fb >= H) continue;
    const side = h2(cx, cy, s + 41) < 0.5 ? -1 : 1;
    const wide = 2.0 + h2(cx, cy, s + 42) * 0.9;
    // out of the rock above, thick, down the face and resting on the floor;
    // sometimes a thinner one by it, braided
    const body = tube(g, [[px0 + side * 6, top - 9], [px0 + side * 2, top + 1], [px0 + side, fb - 6], [px0 - side, fb + 1]], wide + 0.7, wide * 0.6, { tones, ink: cv.outline });
    if (h2(cx, cy, s + 50) < 0.5) {
      const q = px0 - side * 4;
      for (const k of tube(g, [[q - side * 3, top - 6], [q, top + 3], [q + side, fb - 3], [q + side * 2, fb + 3]], 1.3, 0.8, { tones, ink: cv.outline })) body.add(k);
    }
    // up there the root comes out of the rock in shadow: darker
    for (const k of body) {
      const [bx, by] = unkey(k);
      if (bx >= 0 && by >= 0 && bx < W && by < H && !fl(bx, by) && cv.down[by * W + bx] > cv.faceH(bx) && g.get(bx, by) !== cv.outline) {
        g.set(bx, by, darker(ctx, g.get(bx, by)!, 1, cv.darkest));
      }
    }
    // rootlets opening on the floor, the first ones two px thick
    const k = 3 + Math.trunc(h2(cx, cy, s + 43) * 2);
    for (let i = 0; i < k; i++) {
      const ang = -1.1 + 2.2 * (i + 0.5) / k + 0.3 * n1(i, s + 44 + cx);
      const ln = 6 + Math.trunc(h2(cx + i, cy, s + 45) * 9);
      const x0 = px0 - side, y0 = fb + 1;
      const pts: Pt[] = [];
      for (let j = 0; j < ln; j += 3) pts.push([x0 + Math.sin(ang) * j + 0.8 * n1(j / 3.0, s + i), y0 + Math.cos(ang) * j * 0.55]);
      if (pts.length < 2) continue;
      tube(g, pts, i % 2 === 0 ? 1.0 : 0.7, 0.5, { tones, ink: cv.outline, keep: fl });
    }
    // earth that came down with the root
    for (let yy = fb; yy < fb + 6; yy++) for (let xx = px0 - 6; xx < px0 + 7; xx++) {
      const d = ((xx - px0) / 6.0) ** 2 + ((yy - fb - 1) / 4.0) ** 2;
      const c = g.get(xx, yy);
      if (fl(xx, yy) && d < 0.7 + 0.35 * n1(xx / 2.0 + yy, s + 46) && !(c !== null && wood.has(c))) {
        g.set(xx, yy, d > 0.25 || h2(xx, yy, s + 47) < 0.6 ? 'tierra sombra' : 'tierra');
      }
    }
    // the one that drips: a thread falling from its tip and a puddle
    if (cellNoise(cx, cy, 6) < (st.drip ?? 55)) {
      const gx = px0 + (side < 0 ? 1 : -1) * 2;
      for (let yy = fb - 3; yy < fb + 4; yy++) if (yy >= 0 && yy < H) drops.set(gx, yy, 'celeste luz');
      for (let yy = fb + 4; yy < fb + 6; yy++) for (let xx = gx - 2; xx < gx + 3; xx++) {
        if (fl(xx, yy) && Math.abs(xx - gx) + (yy - fb - 4) * 2 <= 2) g.set(xx, yy, 'celeste oscuro');
      }
      g.set(gx - 1, fb + 4, 'celeste');
      glints.set(gx, fb + 5, 'celeste luz');
    }
    // in front: thin roots hanging from the lip, where nobody stands below
    if (!occupied.has(key(cx, cy + 1)) && cellNoise(cx, cy, 8) < (st.hang ?? 60)) {
      for (let k2 = 0; k2 < 2; k2++) {
        const hx = px0 + (k2 === 0 ? -4 : 5) + Math.trunc(h2(cx, k2, s + 48) * 2);
        const ln = (fb - top) + 3 + Math.trunc(h2(cx, cy + k2, s + 49) * 6);
        const pts: Pt[] = [[hx + 0.5, top - 2], [hx + 1.2 * n1(k2, s + 51), top + ln * 0.5], [hx + (k2 ? 1 : -1), top + ln]];
        tube(front, pts, k2 === 0 ? 1.0 : 0.8, 0.5, { tones, ink: cv.outline });
        front.set(hx + (k2 ? 1 : -1), top + ln + 1, tones[2]);
      }
    }
  }
}

// ------------------------------------------------------------------ carvings

/** A 3×3 stroke, illegible on purpose: always connected, never a character. */
const GLYPHS = [
  ['###', '.#.', '###'], ['#.#', '###', '#..'], ['##.', '.##', '..#'], ['.#.', '###', '#.#'],
  ['###', '#..', '.##'], ['#..', '###', '..#'], ['.##', '##.', '.#.'], ['###', '..#', '#.#'],
];
const glyph = (seed: number) => GLYPHS[Math.trunc(h2(seed, 3, 91) * GLYPHS.length) % GLYPHS.length];

export function runCarvings(ctx: Ctx, st: CarvingsStep): void {
  const cv = cave(ctx, 'carvings');
  const { W, H, cell, ox: OX, oy: OY } = ctx, s = cv.s, g = ctx.ground;
  const fl = (x: number, y: number) => cv.floor[y * W + x] === 1;
  const cols = st.cols ?? 3;
  const roots = new Set(cv.rootCells.map(([u, v]) => key(u, v)));
  const all = faceCells(ctx, cv);
  const faces = all.filter(([u, v]) => !roots.has(key(u, v)));
  const byNoise = [...faces].sort((a, b) => cellNoise(a[0], a[1], 9) - cellNoise(b[0], b[1], 9));
  const chosen: Pt[] = [...(st.at ?? [])];
  if (st.within) {
    const [u0, v0, u1, v1] = st.within.box;
    chosen.push(...byNoise.filter(([u, v]) => u >= u0 && u <= u1 && v >= v0 && v <= v1).slice(0, st.within.max));
  }
  chosen.push(...byNoise.slice(0, st.count ?? 2));
  for (const [cx, cy] of chosen) {
    const x0 = OX + cx * cell + 1 + Math.trunc(h2(cx, cy, s + 95) * 2);
    const top = OY + cy * cell;
    let fb = Infinity;
    for (let x = x0; x < x0 + cols * 4 + 1; x++) fb = Math.min(fb, faceBottom(ctx, cv, x, top));
    if (fb >= H) continue;
    const hf = cv.faceH(x0 + 3);
    const y0 = fb - hf + 1;
    if (hf < 7) continue;
    // the slab: smoothed stone, a bit lighter, with its edges
    for (let y = y0; y < fb - 1; y++) for (let x = x0 - 1; x < x0 + cols * 4 + 1; x++) if (!fl(x, y)) g.set(x, y, 'piedra sombra');
    for (let x = x0 - 1; x < x0 + cols * 4 + 1; x++) g.set(x, y0 - 1, 'piedra');
    for (let col = 0; col < cols; col++) for (let k = 0; k < 2; k++) {
      const bits = glyph(cx * 31 + cy * 7 + col * 3 + k + s);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const X = x0 + col * 4 + i, Y = y0 + 1 + k * 4 + j;
        if (bits[j][i] === '#' && Y < fb - 1 && !fl(X, Y)) {
          g.set(X, Y, st.ink ?? 'tinta');
          const below = j === 2 || bits[j + 1][i] !== '#';
          if (below && Y + 1 < fb - 1 && !fl(X, Y + 1)) g.set(X, Y + 1, 'piedra');
        }
      }
    }
  }
}

// ------------------------------------------------------------------ rootladder

export function runRootladder(ctx: Ctx, st: RootladderStep): void {
  const cv = cave(ctx, 'rootladder');
  const { cell, ox: OX, oy: OY } = ctx, s = cv.s, g = ctx.ground;
  const xs = OX + st.u * cell;
  const bottom = OY + st.bottom * cell;
  // two thick roots coming down twisted and braided, thin uneven rungs across
  for (const [rail, dx] of [[0, 3], [1, 12]]) {
    const pts: Pt[] = [[xs + dx + (rail ? 2 : -2), 0], [xs + dx + (rail ? -1 : 1), OY - 34], [xs + dx + (rail ? 1 : -1), OY - 12], [xs + dx, bottom - 6], [xs + dx + (rail ? 2 : -2), bottom]];
    tube(g, pts, 1.4, 2.2, { ink: cv.outline });
  }
  let ry = bottom - 4, k = 0;
  while (ry > 4) {
    const tilt = pyRound(2.5 * n1(k * 1.7, s + 96));
    tube(g, [[xs + 2, ry + tilt], [xs + 8, ry - 1 + (k % 2)], [xs + 14, ry - tilt]], 0.9 + 0.4 * (k % 2), 1.1, { ink: cv.outline });
    ry -= 5 + Math.trunc(h2(k, 0, s + 97) * 3);
    k++;
  }
  // up there it is lost in the black
  for (let y = 0; y < OY - 18; y++) for (let x = Math.trunc(xs - 2); x < xs + 18; x++) {
    const c = g.get(x, y);
    if (c && c !== cv.outline) g.set(x, y, darker(ctx, c, 1 + floorDiv(OY - 18 - y, 14), cv.darkest));
  }
}

// ------------------------------------------------------------------ pool

export function runPool(ctx: Ctx, st: PoolStep): void {
  const cv = cave(ctx, 'pool');
  const { W, H } = ctx, s = cv.s, g = ctx.ground;
  const glints = ctx.layer(st.glints ?? 'brillos');
  const [cx0, cy0] = ctx.P(st.at[0], st.at[1]);
  const [rx, ry] = st.r ?? [40, 13];
  const water = new Set<number>();
  for (let y = Math.trunc(cy0 - 22); y < Math.trunc(cy0 + 22); y++) for (let x = Math.trunc(cx0 - 50); x < Math.trunc(cx0 + 50); x++) {
    if (!isFloor(ctx, cv, x, y)) continue;
    let d = ((x + 0.5 - cx0) / rx) ** 2 + ((y + 0.5 - cy0) / ry) ** 2;
    d += 0.28 * n1(x / 6.0 + y / 9.0, s + 80);
    if (d < 1.0) {
      // still dark water; it reflects the ceiling in light veins
      let c = 'celeste oscuro';
      if (d < 0.55 && n1(x / 5.0, s + 82 + floorDiv(y, 2)) > 0.55) c = 'celeste';
      g.set(x, y, c);
      water.add(key(x, y));
    }
  }
  const wet = (x: number, y: number) => water.has(key(x, y));
  // the shore: the first px of water on top is light; under the bottom one, dark
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    if (!wet(x, y)) continue;
    if (!wet(x, y - 1)) g.set(x, y, 'celeste');
    else if (!wet(x, y + 1) && isFloor(ctx, cv, x, y + 1)) g.set(x, y + 1, 'túnica oscura');
  }
  // reflections in streaks
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (wet(x, y) && wet(x + 1, y) && h2(floorDiv(x, 3), y, s + 81) < 0.12) {
      glints.set(x, y, 'celeste luz');
      glints.set(x + 1, y, 'celeste');
    }
  }
}

// ------------------------------------------------------------------ formation

export function runFormation(ctx: Ctx, st: FormationStep): void {
  const cv = cave(ctx, 'formation');
  const { cell } = ctx, g = ctx.ground;
  const [cx, cy] = ctx.P(st.at[0], st.at[1]);
  const rx = st.r[0] * cell, ry = st.r[1] * cell;
  const [ix, iy] = st.inner ?? [9, 6];
  const carved = new Map<number, 'line' | 'stroke'>(), lit = new Map<number, string>();
  const mark = (p: Pt, kind: 'line' | 'stroke', c: string) => { const k = key(p[0], p[1]); carved.set(k, kind); lit.set(k, c); };
  const ring = (a: number, b: number) => {
    const n = Math.trunc(2 * Math.PI * Math.max(a, b) * 2);
    let last: number | null = null;
    for (let i = 0; i < n; i++) {
      const t = 2 * Math.PI * i / n;
      const p: Pt = [pyRound(cx + a * Math.cos(t) - 0.5), pyRound(cy + b * Math.sin(t) - 0.5)];
      const k = key(p[0], p[1]);
      if (k !== last) { mark(p, 'line', 'qi'); last = k; }
    }
  };
  ring(rx, ry);
  ring(rx - ix, ry - iy);
  // the eight trigrams of the earlier heaven, between the two rings
  const trig = ['111', '011', '101', '001', '110', '010', '100', '000'];
  for (let k = 0; k < 8; k++) {
    const t = 2 * Math.PI * k / 8 - Math.PI / 2;
    const mx = cx + (rx - 4.5) * Math.cos(t), my = cy + (ry - 3) * Math.sin(t);
    for (let j = 0; j < 3; j++) {
      const yy = pyRound(my - 2 + j * 2 - 0.5);
      for (let i = 0; i < 5; i++) {
        if (trig[k][j] === '0' && i === 2) continue;
        mark([pyRound(mx - 2.5) + i, yy], 'stroke', 'ojo');
      }
    }
  }
  // the qi runs from the outer ring to the inner one in eight short spokes
  for (let k = 0; k < 8; k++) {
    const t = 2 * Math.PI * (k + 0.5) / 8 - Math.PI / 2;
    for (let r = 0; r < 8; r++) mark([pyRound(cx + (rx - r) * Math.cos(t) - 0.5), pyRound(cy + (ry - r * 0.65) * Math.sin(t) - 0.5)], 'line', 'qi');
  }
  // the light around what is lit: a rim of qi shadow, one px
  for (const k of [...lit.keys()]) {
    const [x, y] = unkey(k);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = key(x + dx, y + dy);
      if (!lit.has(q)) lit.set(q, 'qi sombra');
    }
  }
  for (const [k, kind] of carved) {
    const [x, y] = unkey(k);
    if (!isFloor(ctx, cv, x, y)) continue;
    g.set(x, y, kind === 'line' ? 'pelo oscuro' : 'tinta');
    if (isFloor(ctx, cv, x, y + 1) && !carved.has(key(x, y + 1))) g.set(x, y + 1, 'piedra');
  }
  const layer = ctx.layer(st.layer);
  const [bu, bv, bw, bh] = st.box;
  const [x0, y0] = ctx.P(bu, bv);
  for (const [k, c] of lit) {
    const [x, y] = unkey(k);
    if (x >= x0 && y >= y0 && x < x0 + bw * cell && y < y0 + bh * cell && isFloor(ctx, cv, x, y)) layer.set(x, y, c);
  }
}

// ------------------------------------------------------------------ gloom

export function runGloom(ctx: Ctx, st: GloomStep): void {
  const cv = cave(ctx, 'gloom');
  const { W, H, ox: OX, oy: OY, mw, mh } = ctx, s = cv.s, g = ctx.ground;
  const [a, b, c3, d4] = st.at ?? [4, 18, 34, 52];
  const clear = (st.clear ?? ['brillos', 'gotas', 'raices']).map(n => ctx.layer(n));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const outX = Math.max(OX - x, x - (OX + mw - 1), 0), outY = Math.max(OY - y, y - (OY + mh - 1), 0);
    const d = Math.max(outX, outY) + 3 * n1(x / 7.0 + y / 5.0, s + 90);
    if (d <= a) continue;
    const steps = d < b ? 1 : (d < c3 ? 2 : (d < d4 ? 3 : 5));
    const c = g.get(x, y);
    if (c) g.set(x, y, darker(ctx, c, steps, cv.darkest));
    if (steps >= 2) for (const l of clear) if (l.get(x, y) !== null) l.set(x, y, null);
  }
}

// ------------------------------------------------------------------ soften

export function runSoften(ctx: Ctx, st: SoftenStep): void {
  const g = ctx.ground, { W, H } = ctx;
  const matOf = new Map<string, string>();
  for (const [name, m] of Object.entries(ctx.recipe.materials)) for (const c of m.ramp) if (!matOf.has(c)) matOf.set(c, name);
  for (let p = 0; p < (st.passes ?? 2); p++) {
    const mats: (string | null)[][] = [];
    for (let y = 0; y < H; y++) {
      const row: (string | null)[] = [];
      for (let x = 0; x < W; x++) { const c = g.px[y * W + x]; row.push(c ? matOf.get(c) ?? null : null); }
      let last = row.find(m => m) ?? null;
      for (let i = 0; i < W; i++) { if (row[i] === null) row[i] = last; else last = row[i]; }
      mats.push(row);
    }
    let changed = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const v = mats[y][x];
      if (mats[y][x - 1] === v || mats[y][x + 1] === v || mats[y - 1][x] === v || mats[y + 1][x] === v) continue;
      const nw = mats[y - 1][x - 1] === v, ne = mats[y - 1][x + 1] === v, sw = mats[y + 1][x - 1] === v, se = mats[y + 1][x + 1] === v;
      if ((nw && se && !ne && !sw) || (ne && sw && !nw && !se)) continue;
      const c = g.px[y * W + x];
      if (c !== null && Object.prototype.hasOwnProperty.call(st.accent, c)) { g.px[y * W + x] = st.accent[c]; changed++; }
    }
    if (!changed) break;
  }
}
