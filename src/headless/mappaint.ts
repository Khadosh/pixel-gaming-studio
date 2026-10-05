// The map painter: runs a map recipe (maprecipe.ts) and returns its layers, one
// palette color name per pixel. Pure: no disk, no Node. The algorithms are the
// ones of The Unwritten Dao's drawing scripts (scripts/suelo_*.py), generalized:
// with the same numbers a recipe gives the same pixels the ladera script gave.
//
// What each step does (docs/map_recipes.md has the long version):
// - area: paints a material on a shape (all, organic blobs, cells of the game
//   grid through grid_mask, a rect, the outside of the map as a forest edge, or
//   crowns poking in from that edge on another layer). `face` raises it: a south
//   face of N px from a lit edge to a dark foot, and moss on the lit lip.
// - path: a Catmull-Rom ribbon whose half width breathes, with clearings and
//   tongues, the bank shadow on the side of the light, a lit lip on the far
//   grass, ruts, tufts creeping in, and stairs where it climbs.
// - water: bands by distance to the shore, the high bank and its reflection,
//   foam on the low shore, waves, glints on a layer.
// - light: shadows cast down-light by the decor of the game, the edges of the
//   forest and the faces of raised areas, one step down each material's ramp.
// - scatter: tufts (tips on a layer that sways), flowers, pebbles, dew, boulders
//   and fixed stamps, by density, spacing, near/far from materials, never on a
//   walkable cell when asked.

import { gridMask } from './gridmask';
import { Mask, catmull, clean, distanceIn, fbm, h2, n1, organic, ribbon, type Pt } from './mapnoise';
import type { MapGame, MapMaterial, MapRecipe, MapShape, MapStep } from './maprecipe';
import { runCliff } from './mapsteps/cliff';
import { runFlight } from './mapsteps/flight';
import { runFeature } from './mapsteps/feature';
import { textureFlagstones } from './mapsteps/flagstones';
import { runNetwork } from './mapsteps/network';
import { texturePaving } from './mapsteps/paving';
import { texturePlanks } from './mapsteps/planks';
import { runRope } from './mapsteps/rope';
import { runFurnish, runSun, runWall } from './mapsteps/room';
import { runCloudsea, runConifers, runCrag, runLedge, runMountain, runPond, runShadows, runShrub, runSnowfield, runSparkles, runSpindrift, runStones, runTracks, runTrail, runTussocks } from './mapsteps/alpine';
import { runBeams, runCanes, runOutcrop, runShade, runThicket, runUndergrowth, scatterDashes } from './mapsteps/grove';
import { runCast, runDamp, runOverlook, runStraw, runWoodedge, standing } from './mapsteps/lowland';
import {
  betweenMask, runBeach, runClaypan, runDitch, runFloodwater, runFootpath, runLines, runMeadow, runMudbank, runPier, runReeds,
  runRocks, runShimmer, runSlabs, runUmbra, runWildwood,
} from './mapsteps/riverbank';
import { runCarvings, runCavern, runFormation, runGloom, runHangroots, runPool, runRootladder, runSoften } from './mapsteps/cavern';
import { runGlen, runCushions, runMudtrail, runShingle, runLedgeslabs, runPlunge, runWetstones, runWetwood, runGlenshade, runGlenlitter, runGlenflow, runBoughs } from './mapsteps/glen';
import { runArena, runAshlar, runBalustrade, runCloudbanks, runCourses, runFallen, runMotes, runOverhang, runRunner, runSprigs, runStairway } from './mapsteps/terrace';

export class Layer {
  readonly px: (string | null)[];
  constructor(readonly w: number, readonly h: number) { this.px = new Array(w * h).fill(null); }
  get(x: number, y: number): string | null { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null; }
  set(x: number, y: number, c: string | null): void { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  used(): string[] { return [...new Set(this.px.filter((c): c is string => c !== null))].sort(); }
}

export interface PaintedMap {
  width: number;
  height: number;
  cell: number;
  /** The map's top-left corner inside the picture, px. */
  origin: [number, number];
  /** Layer name → pixels ("ground" always). */
  layers: Record<string, Layer>;
  /** Material name of each ground pixel ('' = none). */
  kind: string[];
}

type Side = 'l' | 'r' | 't' | 'b';
interface Edge { sides: Side[]; at: (side: Side, along: number) => number; material: string }

const STEP_DEFAULTS: Record<string, number> = { area: 0, path: 0, water: 0, light: 0, scatter: 0, cliff: 200, flight: 0, feature: 0, network: 0, rope: 0, wall: 0, furnish: 0, sun: 0, thicket: 0, outcrop: 0, undergrowth: 0, canes: 0, shade: 0, beams: 0, snowfield: 0, ledge: 0, cloudsea: 0, crag: 0, mountain: 0, conifers: 0, trail: 0, tracks: 0, pond: 0, shrub: 0, shadows: 0, tussocks: 0, stones: 0, sparkles: 0, spindrift: 0, straw: 0, overlook: 0, woodedge: 0, damp: 0, cast: 0, lines: 0, wildwood: 0, beach: 0, mudbank: 0, footpath: 0, pier: 0, reeds: 0, rocks: 0, umbra: 0, meadow: 0, shimmer: 0, slabs: 0, ditch: 0, claypan: 0, floodwater: 0, cloudbanks: 0, ashlar: 0, courses: 0, runner: 0, arena: 0, balustrade: 0, stairway: 0, sprigs: 0, fallen: 0, motes: 0, overhang: 0, cavern: 0, hangroots: 0, carvings: 0, rootladder: 0, pool: 0, formation: 0, gloom: 0, soften: 0, glen: 0, cushions: 0, mudtrail: 0, shingle: 0, ledgeslabs: 0, plunge: 0, wetstones: 0, wetwood: 0, glenshade: 0, glenlitter: 0, glenflow: 0, boughs: 0 };

/** The painting context every step shares (exported for the steps in mapsteps/). */
export class Ctx {
  readonly W: number; readonly H: number; readonly cell: number;
  readonly ox: number; readonly oy: number; readonly mw: number; readonly mh: number;
  readonly seed: number;
  readonly dir: [number, number];
  readonly layers: Record<string, Layer> = {};
  readonly kind: string[];
  readonly face: Uint8Array;
  readonly raised: Mask;
  readonly masks = new Map<string, Mask>();
  readonly dists = new Map<string, Int32Array>();
  readonly centers = new Map<string, Pt[]>();
  readonly clearings = new Map<string, Pt[]>();
  readonly pathMaterial = new Map<string, string>();
  readonly edges = new Map<string, Edge>();
  readonly walk: Uint8Array;
  private rngI = 0;

  constructor(readonly recipe: MapRecipe, readonly game: MapGame) {
    this.cell = recipe.cell ?? 16;
    const [mx, my] = recipe.margin ?? [0, 0];
    this.W = (game.width + 2 * mx) * this.cell;
    this.H = (game.height + 2 * my) * this.cell;
    this.ox = mx * this.cell; this.oy = my * this.cell;
    this.mw = game.width * this.cell; this.mh = game.height * this.cell;
    this.seed = recipe.seed ?? 0;
    const l = recipe.light ?? [1, 1];
    this.dir = [Math.sign(l[0]) || 1, Math.sign(l[1]) || 1];
    this.kind = new Array(this.W * this.H).fill('');
    this.face = new Uint8Array(this.W * this.H);
    this.raised = new Mask(this.W, this.H);
    this.walk = new Uint8Array(game.width * game.height);
    game.grid.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === '.' || row[u] === 'E') this.walk[v * game.width + u] = 1; });
    this.layer('ground');
  }

  P(u: number, v: number): Pt { return [this.ox + u * this.cell, this.oy + v * this.cell]; }
  layer(name = 'ground'): Layer { return (this.layers[name] ??= new Layer(this.W, this.H)); }
  get ground(): Layer { return this.layers.ground; }
  kindAt(x: number, y: number): string { return x >= 0 && y >= 0 && x < this.W && y < this.H ? this.kind[y * this.W + x] : ''; }
  setKind(x: number, y: number, k: string): void { if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.kind[y * this.W + x] = k; }
  mat(name: string): MapMaterial {
    const m = this.recipe.materials[name];
    if (!m) throw new Error(`map: no material "${name}" (have: ${Object.keys(this.recipe.materials).join(', ')})`);
    return m;
  }
  /** The tone `i` of a material, clamped to its ramp. */
  tone(name: string, i: number): string { const r = this.mat(name).ramp; return r[Math.max(0, Math.min(r.length - 1, i))]; }
  base(name: string): number { const m = this.mat(name); return m.base ?? Math.floor(m.ramp.length / 2); }
  /** Walkable cell of the game under a pixel (the margin is not). */
  walkable(x: number, y: number): boolean {
    const u = Math.floor((x - this.ox) / this.cell), v = Math.floor((y - this.oy) / this.cell);
    return u >= 0 && v >= 0 && u < this.game.width && v < this.game.height && this.walk[v * this.game.width + u] === 1;
  }
  /** The shared random stream of the scatter steps (one draw per call). */
  rnd(): number { this.rngI += 1; return h2(this.rngI, 7, (this.recipe.scatter_salt ?? 131) + this.seed); }
  /** A material with this texture (the first one), for steps that need "the grass". */
  byTexture(t: string): string | undefined {
    return Object.entries(this.recipe.materials).find(([, m]) => m.texture === t)?.[0];
  }
  /** One step lighter and warmer, by the recipe's lighten table (a color not in it stays). */
  lighten(c: string): string { return this.recipe.lighten?.[c] ?? c; }
  /** One step darker (and colder) inside a material's ramp, with its floor and ceiling. */
  shade(c: string | null, kind: string): string | null {
    if (c === null) return c;
    if (this.recipe.shade) return this.recipe.shade[c] ?? c;
    const tryRamp = (name: string): string | null => {
      const m = this.recipe.materials[name];
      const i = m?.ramp.indexOf(c) ?? -1;
      if (!m || i < 0) return null;
      const max = m.shade_max ?? this.base(name) - 1, min = m.shade_min ?? 0;
      return m.ramp[Math.max(Math.min(i - 1, max), Math.min(i, min), 0)];
    };
    return (kind && tryRamp(kind)) || Object.keys(this.recipe.materials).map(tryRamp).find(v => v !== null) || c;
  }
}

// ------------------------------------------------------------------ shapes

function shapeMask(ctx: Ctx, shape: MapShape, seed: number, keep?: (x: number, y: number) => boolean): Mask {
  const m = new Mask(ctx.W, ctx.H);
  if (shape === 'all') { m.data.fill(1); return m; }
  if ('blobs' in shape) {
    for (const b of shape.blobs) {
      const [u, v, rx, ry] = b, wob = b[4] ?? 0.14;
      const [cx, cy] = ctx.P(u, v);
      for (const [x, y] of organic(ctx.W, ctx.H, cx, cy, rx * ctx.cell, ry * ctx.cell, b[5] ?? Math.trunc(u * 10 + v) + seed, wob, b[6] ?? 0.05)) {
        if (!keep || keep(x, y)) m.set(x, y);
      }
    }
    clean(m);
    return m;
  }
  if ('curve' in shape) {
    const [w0, w1] = shape.width, per = shape.period ?? 14, salt = shape.salt ?? seed;
    ribbon(m, catmull(shape.curve.map(([u, v]) => ctx.P(u, v))), (i) => w0 + w1 * n1(i / per, salt));
    clean(m);
    return m;
  }
  if ('between' in shape) return betweenMask(ctx, shape.between);
  if ('rect' in shape) {
    const [u, v, w, h] = shape.rect;
    const [x0, y0] = ctx.P(u, v);
    for (let y = Math.round(y0); y < Math.round(y0 + h * ctx.cell); y++) for (let x = Math.round(x0); x < Math.round(x0 + w * ctx.cell); x++) m.set(x, y);
    return m;
  }
  if ('cells' in shape) {
    const want = new Set(shape.cells.split(''));
    const [mx, my] = ctx.recipe.margin ?? [0, 0];
    const cols = ctx.game.width + 2 * mx, rows = ctx.game.height + 2 * my;
    const grid: string[] = [];
    for (let v = -my; v < rows - my; v++) {
      let row = '';
      for (let u = -mx; u < cols - mx; u++) row += want.has(ctx.game.grid[v]?.[u] ?? ' ') ? 'x' : '.';
      grid.push(row);
    }
    const g = gridMask({ grid, cell: ctx.cell, round: shape.round, wobble: shape.wobble ?? 3, seed: seed + 5 });
    g.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === 'x') m.set(x, y); });
    return m;
  }
  throw new Error('map: this shape is painted by its own step');
}

// ------------------------------------------------------------------ textures

/** Grass: light patches stretched along the light, a mode filter, blades up. */
export function texturePatches(ctx: Ctx, mask: Mask, name: string, seed: number): void {
  const { W, H } = ctx, m = ctx.mat(name), top = m.ramp.length - 1, b = ctx.base(name);
  const s = (m.scale ?? 26) / 26, p = m.patches ?? {};
  const [shScale, shSalt, below] = p.shade ?? [26 * s, 9 + seed, 0.40];
  const [along, across, sunSalt] = p.sun ?? [70 * s, 15 * s, 3 + seed];
  const steps = p.steps ?? [0.62, 0.67, 0.73], bright = p.bright === undefined ? 0.62 : p.bright;
  const blades = p.blades ?? 41 + seed, bladesUp = p.blades_up ?? blades + 2;
  const [bladeOdds, bladeOdds2] = p.blade_odds ?? [0.55, 0.35];
  const [sx, sy] = ctx.dir;
  let tone = new Int8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = (x * sx + y * sy) * 0.7071, bb = (y * sx - x * sy) * 0.7071;
      const shade = fbm(x / shScale, y / shScale, shSalt, 3);
      const sun = fbm(a / along, bb / across, sunSalt, 3);
      let t = b;
      if (shade < below) t = b - 1;
      else if (p.half && shade < p.half[0]) t = sun > p.half[1] ? b : b - 1;
      else if (sun > steps[0]) { t = b + 1; for (let i = 1; i < steps.length; i++) if (sun >= steps[i]) t = b + 1 + i; }
      else if (bright !== null && shade > bright) t = b + 1;
      tone[y * W + x] = Math.max(0, Math.min(top, t));
    }
  }
  for (let p = 0; p < 2; p++) {
    const next = tone.slice();
    const cnt = new Int32Array(top + 1);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        cnt.fill(0);
        let best = -1, bestN = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[tone[(y + dy) * W + x + dx]]++;
        // the first most common value in the order the scripts counted (row by row)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const v = tone[(y + dy) * W + x + dx];
          if (cnt[v] > bestN) { best = v; bestN = cnt[v]; }
        }
        if (bestN >= 5) next[y * W + x] = best;
      }
    }
    tone = next;
  }
  for (let y = H - 1; y > 0; y--) {
    for (let x = 0; x < W; x++) {
      const t = tone[y * W + x], up = tone[(y - 1) * W + x];
      if (t > up && h2(x, y, blades) < bladeOdds && x % 2 === Math.floor(y / 3) % 2) {
        tone[(y - 1) * W + x] = t;
        if (h2(x, y, bladesUp) < bladeOdds2 && y > 1) tone[(y - 2) * W + x] = t;
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    ctx.ground.set(x, y, m.ramp[tone[y * W + x]]);
    ctx.setKind(x, y, name);
  }
}

/** Earth: three tones at 5 px and grains with their light. */
function textureMottled(ctx: Ctx, mask: Mask, name: string, seed: number): void {
  const b = ctx.base(name);
  for (let y = 0; y < ctx.H; y++) for (let x = 0; x < ctx.W; x++) {
    if (!mask.has(x, y)) continue;
    ctx.ground.set(x, y, mottledAt(ctx, name, b, x, y, 51 + seed));
    ctx.setKind(x, y, name);
  }
}

/** One pixel of mottled earth; `salt` is that of the tones (the grains use salt + 3). */
function mottledAt(ctx: Ctx, name: string, b: number, x: number, y: number, salt: number): string {
  const [lo, hi] = ctx.mat(name).levels ?? [0.40, 0.66];
  const v = fbm(x / 5.5, y / 4.5, salt, 3);
  let t = v < lo ? b : v > hi ? b + 2 : b + 1;
  if (h2(x, y, salt + 3) < 0.035) t = b - 1;
  else if (h2(x + 1, y + 1, salt + 3) < 0.035 && t !== b) t = b + 2;
  return ctx.tone(name, t);
}

function textureFlat(ctx: Ctx, mask: Mask, name: string): void {
  const c = ctx.tone(name, ctx.base(name));
  for (let y = 0; y < ctx.H; y++) for (let x = 0; x < ctx.W; x++) if (mask.has(x, y)) { ctx.ground.set(x, y, c); ctx.setKind(x, y, name); }
}

/** Laid stones: Voronoi cells stretched sideways, a lit lip up-left, the joint down-right. */
function textureSlabs(ctx: Ctx, mask: Mask, name: string, seed: number): void {
  const m = ctx.mat(name), b = ctx.base(name);
  const bounds = mask.bounds();
  if (!bounds) return;
  const [x0, y0, x1, y1] = bounds;
  let area = 0;
  for (const v of mask.data) area += v;
  const n = Math.max(2, Math.round(area / 90)), stretch = 1.6;
  const seeds: Pt[] = [];
  for (let k = 0; seeds.length < n && k < n * 60; k++) {
    const x = x0 + h2(k, 1, seed) * (x1 - x0 + 1), y = y0 + h2(k, 2, seed) * (y1 - y0 + 1);
    if (mask.has(Math.trunc(x), Math.trunc(y)) && seeds.every(([a, c]) => (x - a) ** 2 / stretch ** 2 + (y - c) ** 2 > 16)) seeds.push([x, y]);
  }
  const owner = new Map<number, number>();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!mask.has(x, y)) continue;
    const ds = seeds.map(([a, c], i) => [(x + 0.5 - a) ** 2 / stretch ** 2 + (y + 0.5 - c) ** 2, i]).sort((p, q) => p[0] - q[0]);
    owner.set(y * ctx.W + x, ds.length < 2 || ds[1][0] - ds[0][0] > 5 ? ds[0][1] : -1);
  }
  const o = (x: number, y: number) => owner.get(y * ctx.W + x) ?? -2;
  const moss = m.moss ?? [];
  for (const [key, i] of owner) {
    const x = key % ctx.W, y = Math.floor(key / ctx.W);
    let c: string;
    if (i < 0) c = moss.length && fbm(x / 3, y / 3, seed + 3, 2) > 0.8 ? moss[Math.min(1, moss.length - 1)] : ctx.tone(name, b - 2);
    else if (o(x - 1, y) !== i || o(x, y - 1) !== i) c = ctx.tone(name, b + 1);
    else if (o(x + 1, y) !== i || o(x, y + 1) !== i) c = ctx.tone(name, b - 1);
    else c = ctx.tone(name, h2(i, 3, seed) < 0.7 ? b : b + 1);
    ctx.ground.set(x, y, c);
    ctx.setKind(x, y, name);
  }
}

// ------------------------------------------------------------------ crowns

export type Clump = [number, number, number, string[]];

/** Crowns and bushes: a lit crescent up-left, shadow down-right, a line against what is behind. */
export function paintClumps(W: number, H: number, clumps: Clump[], seed: number): Map<number, string> {
  const owner = new Map<number, number>();
  clumps.forEach(([cx, cy, r], i) => {
    const lobes = 7 + Math.trunc(h2(i, 1, seed) * 5), phase = h2(i, 2, seed) * 6.283;
    for (let y = Math.trunc(cy - r * 1.2) - 1; y < Math.trunc(cy + r * 1.2) + 2; y++) {
      for (let x = Math.trunc(cx - r * 1.2) - 1; x < Math.trunc(cx + r * 1.2) + 2; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
        const rr = r * (1 + 0.10 * Math.sin(a * lobes + phase) + 0.08 * n1(a * 2 + i, seed + 3));
        if (dx * dx + dy * dy <= rr * rr) owner.set(y * W + x, i);
      }
    }
  });
  const out = new Map<number, string>();
  const o = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? owner.get(y * W + x) ?? -1 : -1);
  for (const [key, i] of owner) {
    const x = key % W, y = Math.floor(key / W), ramp = clumps[i][3];
    const behind = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => o(x + dx, y + dy)).filter(v => v < i);
    let c: string;
    if (behind.length) c = behind.includes(-1) ? ramp[4] : ramp[3];
    else if (o(x - 1, y - 1) !== i || o(x, y - 1) !== i) c = ramp[0];
    else if (o(x - 2, y - 2) !== i || o(x - 3, y - 1) !== i) c = ramp[1];
    else if (o(x + 2, y + 2) !== i || o(x + 1, y + 3) !== i) c = ramp[3];
    else {
      c = ramp[2];
      if (ramp[2] === ramp[4]) { /* the deep forest: nothing inside */ }
      else if (h2(Math.floor(x / 2), y, seed + 7) < 0.06) c = ramp[1];
      else if (h2(Math.floor(x / 2), y - 1, seed + 7) < 0.06) c = ramp[3];
    }
    out.set(key, c);
  }
  return out;
}

/** The ramps of a canopy material by depth: [glint, light, mid, shadow, line]. */
function canopyRamps(ctx: Ctx, name: string): { depth: string[][]; lit: string[] } {
  const T = ctx.mat(name).ramp.length - 1, t = (i: number) => ctx.tone(name, i);
  return {
    depth: [
      [t(T - 1), t(T - 2), t(T - 3), t(T - 4), t(0)],
      [t(T - 2), t(T - 3), t(T - 4), t(0), t(0)],
      [t(T - 4), t(T - 4), t(0), t(0), t(0)],
      [t(0), t(0), t(0), t(0), t(0)],
    ],
    lit: [t(T), t(T - 1), t(T - 2), t(T - 3), t(T - 4)],
  };
}

type OutsideOpts = Extract<MapShape, { outside: unknown }>['outside'];

function outsideArea(ctx: Ctx, id: string, name: string, opts: OutsideOpts, seed: number, layer: Layer): void {
  const { W, H, ox, oy, mw, mh } = ctx;
  const sides = (opts.sides ?? 'lr').split('').filter((s): s is Side => 'lrtb'.includes(s));
  const gap = opts.inset ?? 2, wob = opts.wobble ?? 2.4;
  const base: Record<Side, number> = { l: ox - gap, r: ox + mw + gap, t: oy - gap, b: oy + mh + gap };
  const salt: Record<Side, number> = { l: 71, r: 73, t: 75, b: 77 };
  const outward: Record<Side, number> = { l: -1, r: 1, t: -1, b: 1 };
  const openings = (opts.openings ?? []).map(([at, half, depth]) => [at * ctx.cell, half, depth]);
  const at = (side: Side, along: number) => {
    let e = base[side] + wob * n1(along / 19, salt[side] + seed) + wob / 2 * n1(along / 7, salt[side] + 1 + seed);
    for (const [a, half, depth] of openings) {
      const g = a + (side === 'l' || side === 'r' ? oy : ox);
      if (Math.abs(along - g) < half) e += outward[side] * depth * Math.cos((along - g) / half * Math.PI / 2) ** 2;
    }
    return e;
  };
  ctx.edges.set(id, { sides, at, material: name });
  const outside = (x: number, y: number) => sides.some(s => (s === 'l' ? x < at('l', y) : s === 'r' ? x >= at('r', y) : s === 't' ? y < at('t', x) : y >= at('b', x)));
  const beyond = (x: number, y: number): number => {
    let dd = -1;
    for (const s of sides) {
      const e = at(s, s === 'l' || s === 'r' ? y : x);
      if (s === 'l' && x < e + 2) dd = Math.max(dd, e - x);
      if (s === 'r' && x > e - 2) dd = Math.max(dd, x - e);
      if (s === 't' && y < e + 2) dd = Math.max(dd, e - y);
      if (s === 'b' && y > e - 2) dd = Math.max(dd, y - e);
    }
    return dd;
  };
  const { depth, lit } = canopyRamps(ctx, name);
  const litSide = (x: number, y: number) => (ctx.dir[0] > 0 ? x > ox + mw / 2 : x < ox + mw / 2) && (sides.includes('l') || sides.includes('r')) && (y >= oy || !sides.includes('t'));
  const clumps: Clump[] = [];
  const seeds: [number, number, number][] = [];
  const band = opts.crowns, bandSide = sides.find(s => s === 'l' || s === 'r');
  const bandFrom = band?.from ?? -10, touch = band?.touch ?? -2, far = opts.far ?? 46;
  const cut = opts.cut === undefined ? null : ctx.masks.get(opts.cut);
  if (opts.cut !== undefined && !cut) throw new Error(`map: outside: no mask "${opts.cut}" before it`);
  const [clearX, clearY] = opts.clear ?? [14, 12];
  const nearCut = (x: number, y: number) => !!cut && [-clearX, 0, clearX].some(i => [-clearY, 0, clearY].some(j => cut.has(x + i, y + j)));
  for (let k = 0; k < (band ? band.tries ?? 1600 : opts.tries ?? 2600); k++) {
    let x: number, dd: number;
    const y = h2(k, 2, 81 + seed) * (H + 24) - 12;
    if (band && bandSide) {
      // the band by one side: from a little inside the map edge to past the picture
      const start = bandSide === 'r' ? ox + mw + bandFrom : ox - bandFrom;
      x = bandSide === 'r' ? start + h2(k, 1, 81 + seed) * (W - start + 10) : start - h2(k, 1, 81 + seed) * (start + 10);
      dd = bandSide === 'r' ? x - at('r', y) : at('l', y) - x;
      if (dd < touch || dd > 46) continue;
      dd = Math.max(dd, 0);
    } else {
      x = h2(k, 1, 81 + seed) * W;
      dd = beyond(x, y);
      if (dd < 2.5 || dd > far) continue;
    }
    let r = 6 + Math.min(dd, 90) * 0.32 + h2(k, 3, 81 + seed) * 5;
    if (cut && [-r, 0, r].some(i => [-r * 0.6, 0, r * 0.8].some(j => cut.has(Math.trunc(x + i), Math.trunc(y + j))))) continue;
    if (seeds.some(([a, b, rb]) => (x - a) ** 2 + (y - b) ** 2 < (0.8 * Math.min(r, rb)) ** 2)) continue;
    seeds.push([x, y, r]);
    const d = dd < 9 ? 0 : dd < 26 ? 1 : dd < 52 ? 2 : 3;
    let ramp = depth[d];
    if (d === 0 && litSide(x, y)) ramp = lit;
    if (d === 0) r = Math.min(r, 7.5);
    clumps.push([x, y, r, ramp]);
  }
  clumps.sort((p, q) => p[1] - q[1]);
  const painted = paintClumps(W, H, clumps, 85 + seed);
  const dark = ctx.tone(name, 0);
  const clip = band?.clip ?? -4;
  const kept = (x: number) => !band || !bandSide || (bandSide === 'r' ? x >= ox + mw + clip : x < ox - clip);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = painted.get(y * W + x);
    if (c !== undefined && kept(x)) layer.set(x, y, c);
    else if (outside(x, y) && !(cut && (cut.has(x, y) || nearCut(x, y)))) layer.set(x, y, dark);
    else continue;
    if (layer === ctx.ground) ctx.setKind(x, y, name);
  }
  if (cut && opts.fade) fadeCut(ctx, cut, sides, at, name, opts.fade);
}

/** The cut (a road) past the forest edge goes into the shade; the grass left by it too. */
function fadeCut(ctx: Ctx, cut: Mask, sides: Side[], at: (side: Side, along: number) => number, name: string,
  f: NonNullable<OutsideOpts['fade']>): void {
  const { W, H } = ctx, g = ctx.ground;
  const [c0, c1, c2, c3] = f.at ?? [10, 22, 44, 60], salt = f.salt ?? 257, gr = f.grass ?? 20;
  const [d0, d1] = f.dark ?? [ctx.tone(name, 0), ctx.tone(name, 1)];
  const grass = new Set(f.on ?? Object.keys(ctx.recipe.materials).filter(m => ctx.mat(m).texture === 'patches'));
  for (let y = 0; y < H; y++) {
    const left = sides.includes('l') ? at('l', y) : -Infinity, right = sides.includes('r') ? at('r', y) : Infinity;
    for (let x = 0; x < W; x++) {
      const k = ctx.kindAt(x, y);
      if (cut.has(x, y) && (x < left - c0 || x > right + c0)) {
        const far = x < left ? left - c0 - x : x - right - c0;
        let c = g.get(x, y);
        c = far < c1 ? ctx.shade(c, k) : ctx.shade(ctx.shade(c, k), k);
        if (far > c2) c = far > c3 || h2(x, y, salt) < 0.5 ? d0 : d1;
        g.set(x, y, c);
      } else if (grass.has(k) && (x < left || x >= right)) {
        const far = x < left ? left - x : x - right;
        const c = g.get(x, y);
        g.set(x, y, far < gr ? ctx.shade(c, k) : ctx.shade(ctx.shade(c, k), k));
      }
    }
  }
}

function pokeArea(ctx: Ctx, name: string, opts: Extract<MapShape, { poke: unknown }>, seed: number, layer: Layer): void {
  const edge = ctx.edges.get(opts.poke);
  if (!edge) throw new Error(`map: no outside area "${opts.poke}" before this poke`);
  const sides = edge.sides.filter(s => s === 'l' || s === 'r');
  const [r0, r1] = opts.r ?? [7, 15], [p0, p1] = opts.reach ?? [2, 7];
  const { depth, lit } = canopyRamps(ctx, name);
  const cut = opts.cut === undefined ? null : ctx.masks.get(opts.cut);
  if (opts.cut !== undefined && !cut) throw new Error(`map: poke: no mask "${opts.cut}" before it`);
  const over: [number, number, number, string[], Side][] = [];
  for (let k = 0; k < (opts.count ?? 60); k++) {
    const y = h2(k, 1, 141 + seed) * (ctx.H + 10) - 5;
    const side = sides[k % sides.length];
    if (!side) break;
    const e = edge.at(side, y);
    const r = r0 + h2(k, 2, 141 + seed) * (r1 - r0), poke = p0 + h2(k, 3, 141 + seed) * (p1 - p0);
    const cx = side === 'l' ? e - r + poke : e + r - poke;
    if (cut && [-r, 0, r].some(i => [-r, 0, r].some(j => cut.has(Math.trunc(cx + i), Math.trunc(y + j))))) continue;
    if ((opts.gaps ?? []).some(([v, half]) => Math.abs(y - ctx.P(0, v)[1]) < half)) continue;
    if (over.some(c => Math.abs(y - c[1]) < (opts.spacing ?? 38) && c[4] === side)) continue;
    const isLit = side === 'r' ? ctx.dir[0] > 0 : ctx.dir[0] < 0;
    over.push([cx, y, r, isLit ? lit : depth[0], side]);
  }
  for (const [u, v, r, d] of opts.crowns ?? []) {
    const [cx, cy] = ctx.P(u, v);
    over.push([cx, cy, r, d < 0 ? lit : depth[Math.min(3, d)], 'l']);
  }
  const painted = paintClumps(ctx.W, ctx.H, over.sort((p, q) => p[1] - q[1]).map(c => [c[0], c[1], c[2], c[3]] as Clump), 145 + seed);
  for (const [key, c] of painted) layer.set(key % ctx.W, Math.floor(key / ctx.W), c);
}

// ------------------------------------------------------------------ stone

/** Stone tones by role on an 8-tone ramp: ink, line, dark, shadow, mid, speck, light, highlight. */
export function stoneRoles(ctx: Ctx, name: string) {
  const t = (i: number) => ctx.tone(name, i);
  const moss = ctx.mat(name).moss ?? [t(3), t(4), t(6), t(7)];
  return { ink: t(0), line: t(1), dark: t(2), shadow: t(3), mid: t(4), speck: t(5), light: t(6), high: t(7), moss };
}

/** A boulder with volume: light bands up-left, the face below in cold shadow, outline, moss on top. */
export function stone(ctx: Ctx, name: string, cx: number, cy: number, rx: number, ry: number, seed: number, moss = true): Map<number, Pt> {
  const s = stoneRoles(ctx, name), g = ctx.ground, W = ctx.W;
  const pts = new Map<number, Pt>();
  for (let y = Math.trunc(cy - ry) - 2; y < Math.trunc(cy + ry) + 3; y++) {
    for (let x = Math.trunc(cx - rx) - 2; x < Math.trunc(cx + rx) + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= ctx.H) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
      let rr = 1 + 0.07 * n1(a * 2.2, seed) + 0.04 * Math.sin(a * 5 + seed);
      if (dy > 0.55) rr *= 1.0 + (dy - 0.55) * 0.25;
      if (dx * dx + dy * dy <= rr * rr) pts.set(y * W + x, [dx / rr, dy / rr]);
    }
  }
  const has = (x: number, y: number) => pts.has(y * W + x);
  for (let p = 0; p < 2; p++) {
    for (const key of [...pts.keys()]) {
      const x = key % W, y = Math.floor(key / W);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([i, j]) => has(x + i, y + j)).length <= 1) pts.delete(key);
    }
  }
  const faceAt = (dx: number) => 0.5 - 0.1 * n1(dx * 3, seed + 1);
  for (const [key, [dx, dy]] of pts) {
    const x = key % W, y = Math.floor(key / W);
    const out = (X: number, Y: number) => !has(X, Y);
    const z = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    const lum = -0.6 * dx - 0.7 * dy + 0.35 * z;
    const face = dy > faceAt(dx);
    let c: string;
    if (out(x + 1, y) || out(x, y + 1) || out(x - 1, y) || out(x, y - 1)) c = dy > -0.2 || dx > 0.3 ? s.line : s.dark;
    else if (face) {
      c = lum > -0.1 ? s.shadow : s.dark;
      if (has(x, y - 2) && has(x, y - 1) && !(dy - 1.0 / ry > faceAt(dx))) c = s.mid;
    } else if (lum > 0.78) c = s.high;
    else if (lum > 0.5) c = s.light;
    else if (lum > 0.0) c = s.mid;
    else c = s.shadow;
    if (moss && !face && c !== s.line && c !== s.dark && dy < -0.9 + 0.95 * fbm(x / 4, y / 2.5, seed + 2, 2) && lum > -0.2) {
      c = c === s.high ? s.moss[3] : c === s.light ? s.moss[2] : c === s.mid ? s.moss[1] : s.moss[0];
    }
    g.set(x, y, c);
    ctx.setKind(x, y, name);
  }
  if (rx > 8) {
    const gx = cx + (h2(seed, 1, 77) - 0.3) * rx * 0.6, gy = cy - ry * 0.3;
    for (let k = 0; k < Math.trunc(ry * 0.9); k++) {
      const X = Math.trunc(gx + n1(k / 3, seed) * 1.2), Y = Math.trunc(gy + k);
      if (has(X, Y) && g.get(X, Y) !== s.line) {
        g.set(X, Y, s.dark);
        if (has(X - 1, Y) && (g.get(X - 1, Y) === s.mid || g.get(X - 1, Y) === s.shadow)) g.set(X - 1, Y, s.light);
      }
    }
  }
  return pts;
}

/** A raised area: the top in streaks along the light with moss on the lit lip, a south face, holes at its foot. */
function raisedArea(ctx: Ctx, mask: Mask, name: string, faceH: number, holes: Pt[], seed: number): void {
  const { W, H } = ctx, s = stoneRoles(ctx, name), g = ctx.ground;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    let below = 0;
    while (below < faceH && mask.has(x, y + below + 1)) below++;
    const edge = !(mask.has(x - 1, y) && mask.has(x + 1, y) && mask.has(x, y - 1) && mask.has(x, y + 1));
    let c: string;
    ctx.setKind(x, y, name);
    ctx.raised.set(x, y);
    if (below < faceH) {
      ctx.face[y * W + x] = 1;
      const vein = h2(x, 0, 62 + seed) < 0.16;
      if (edge || below === 0) c = s.line;
      else if (below <= 3) c = below === 1 || vein ? s.line : s.dark;
      else if (below === faceH - 1) c = s.mid;
      else c = vein ? s.dark : s.shadow;
    } else {
      const litEdge = !mask.has(x - 1, y) || !mask.has(x, y - 1);
      if (edge) c = litEdge ? s.dark : s.line;
      else {
        const v = fbm((x + y) * 0.7071 / 10, (y - x) * 0.7071 / 3, 63 + seed, 3);
        c = v > 0.64 ? s.light : v < 0.30 ? s.shadow : s.mid;
        const rim = !mask.has(x - 3, y - 2) || !mask.has(x - 1, y - 4);
        if (rim && fbm(x / 4, y / 4, 64 + seed, 2) > 0.45) c = litEdge || !mask.has(x - 1, y - 1) ? s.moss[2] : s.moss[1];
      }
    }
    g.set(x, y, c);
  }
  for (const [hu, hr] of holes) {
    const hx = ctx.P(hu, 0)[0], col = Math.trunc(hx);
    const rows: number[] = [];
    for (let y = 0; y < H; y++) if (ctx.face[y * W + col]) rows.push(y);
    if (!rows.length) continue;
    const hy = (Math.min(...rows) + Math.max(...rows)) / 2 + 1;
    for (const [x, y] of organic(W, H, hx, hy, hr * 1.5, hr, Math.trunc(hu * 31), 0.2)) {
      if (ctx.face[y * W + x] && g.get(x, y) !== s.line) g.set(x, y, s.ink);
    }
  }
  for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
    if (mask.has(x, y) && !ctx.face[y * W + x] && !mask.has(x, y - 1) && mask.has(x, y + 1) && mask.has(x - 1, y) && mask.has(x + 1, y)) g.set(x, y + 1, s.high);
  }
}

// ------------------------------------------------------------------ steps

function runArea(ctx: Ctx, st: Extract<MapStep, { step: 'area' }>, seed: number, idx: number): void {
  const layer = ctx.layer(st.layer ?? 'ground');
  const id = st.id ?? `area${idx}`;
  if (st.shape !== 'all' && 'outside' in st.shape) return outsideArea(ctx, id, st.material, st.shape.outside, seed, layer);
  if (st.shape !== 'all' && 'poke' in st.shape) return pokeArea(ctx, st.material, st.shape, seed, layer);
  const on = st.on ? new Set(st.on) : null;
  const mask = shapeMask(ctx, st.shape, seed, on ? (x, y) => on.has(ctx.kindAt(x, y)) : undefined);
  ctx.masks.set(id, mask);
  const m = ctx.mat(st.material);
  if (st.face) return raisedArea(ctx, mask, st.material, st.face, st.holes ?? [], seed);
  switch (m.texture ?? 'flat') {
    case 'patches': return texturePatches(ctx, mask, st.material, seed);
    case 'mottled': return textureMottled(ctx, mask, st.material, seed);
    case 'slabs': return textureSlabs(ctx, mask, st.material, seed + 11);
    case 'flagstones': return textureFlagstones(ctx, mask, st.material, seed, st.stones ?? [12, 7], st.wear);
    case 'paving': {
      const b = mask.bounds();
      const mid: Pt = b ? [((b[0] + b[2] + 1) / 2 - ctx.ox) / ctx.cell, ((b[1] + b[3] + 1) / 2 - ctx.oy) / ctx.cell] : [0, 0];
      return texturePaving(ctx, mask, st.material, st.paving ?? { at: mid });
    }
    case 'planks': return texturePlanks(ctx, mask, st.material, st.planks);
    case 'canopy': {
      const painted = paintClumps(ctx.W, ctx.H, blobClumps(ctx, mask, st.material, seed), 85 + seed);
      for (const [key, c] of painted) if (mask.data[key]) { layer.set(key % ctx.W, Math.floor(key / ctx.W), c); ctx.kind[key] = st.material; }
      return;
    }
    default: return textureFlat(ctx, mask, st.material);
  }
}

function blobClumps(ctx: Ctx, mask: Mask, name: string, seed: number): Clump[] {
  const { depth } = canopyRamps(ctx, name), d = distanceIn(mask), out: Clump[] = [];
  for (let k = 0; k < 2000; k++) {
    const x = h2(k, 1, 83 + seed) * ctx.W, y = h2(k, 2, 83 + seed) * ctx.H;
    if (!mask.has(Math.trunc(x), Math.trunc(y))) continue;
    const dd = d[Math.trunc(y) * ctx.W + Math.trunc(x)];
    const r = 5 + Math.min(dd, 20) * 0.3 + h2(k, 3, 83 + seed) * 3;
    if (out.some(([a, b, rb]) => (x - a) ** 2 + (y - b) ** 2 < (0.8 * Math.min(r, rb)) ** 2)) continue;
    out.push([x, y, r, depth[dd < 9 ? 0 : dd < 20 ? 1 : 2]]);
  }
  return out.sort((p, q) => p[1] - q[1]);
}

function runPath(ctx: Ctx, st: Extract<MapStep, { step: 'path' }>, seed: number, idx: number): void {
  const { W, H, cell, oy } = ctx, g = ctx.ground;
  const id = st.id ?? `path${idx}`;
  const curve = catmull(st.points.map(([u, v]) => ctx.P(u, v)));
  const path = new Mask(W, H);
  const dcen = new Float64Array(W * H).fill(99);
  for (let i = 0; i < curve.length; i += 2) {
    const [cx, cy] = curve[i];
    for (let y = Math.trunc(cy - 13); y < Math.trunc(cy + 14); y++) for (let x = Math.trunc(cx - 13); x < Math.trunc(cx + 14); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dd < dcen[y * W + x]) dcen[y * W + x] = dd;
    }
  }
  const [w0, w1] = st.width ?? [6.6, 2.8];
  const [p1, p2, share] = st.breath ?? [46, 22, 0.25];
  const salt = { wave: 21 + seed, wave2: 22 + seed, mottle: 51 + seed, ...st.salts };
  ribbon(path, curve, (i) => {
    const v = (curve[i][1] - oy) / cell;
    let w = w0 + w1 * n1(i / p1, salt.wave) + w1 * share * n1(i / p2, salt.wave2);
    for (const wd of st.widen ?? []) w += wd.add * Math.exp(-(((v - wd.at) / (wd.spread ?? 1.3)) ** 2));
    return Math.max(st.min ?? 4.6, w);
  });
  const clearings: Pt[] = [];
  (st.clearings ?? []).forEach((b, i) => {
    const [cx, cy] = ctx.P(b[0], b[1]);
    clearings.push([cx, cy]);
    for (const [x, y] of organic(W, H, cx, cy, b[2] * cell, b[3] * cell, b[5] ?? 31 + 4 * i + seed, b[4] ?? 0.2, b[6] ?? 0.05)) path.set(x, y);
  });
  for (const br of st.branches ?? []) {
    const lc = catmull(br.points.map(([u, v]) => ctx.P(u, v)));
    const [b0, b1] = br.width ?? [8, -2.2];
    if (br.breath) ribbon(path, lc, (i) => b0 + b1 * n1(i / br.breath!, br.salt ?? 34 + seed));
    else ribbon(path, lc, (i) => b0 + b1 * Math.sin(Math.PI * i / lc.length) + 0.8 * n1(i / 9, br.salt ?? 34 + seed));
  }
  clean(path);
  const dpath = distanceIn(path);
  ctx.masks.set(id, path);
  ctx.dists.set(id, dpath);
  ctx.centers.set(id, curve);
  ctx.clearings.set(id, clearings);
  ctx.pathMaterial.set(id, st.material);
  const name = st.material, b = ctx.base(name);
  const [sx, sy] = ctx.dir;
  const [r0, r1] = st.ruts ?? [3, 4];
  const bank = st.bank !== false;
  const onlyOn = st.on ? new Set(st.on) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!path.has(x, y) || (onlyOn && !onlyOn.has(ctx.kindAt(x, y)))) continue;
    const d = dpath[y * W + x];
    let kOut: number | null = null;
    for (let k = 1; k < 4; k++) if (!path.has(x - k * sx, y - k * sy)) { kOut = k; break; }
    let c: string;
    if (bank && d === 1) c = ctx.tone(name, kOut === 1 ? b - 2 : b);
    else if (bank && kOut !== null && kOut <= 2) c = ctx.tone(name, b - 1);
    else {
      c = mottledAt(ctx, name, b, x, y, salt.mottle);
      if (dcen[y * W + x] >= r0 && dcen[y * W + x] < r1 && fbm(x / 3, y / 5, 52 + seed, 2) > 0.5 && c !== ctx.tone(name, b + 2)) {
        c = c === ctx.tone(name, b) ? ctx.tone(name, b - 1) : ctx.tone(name, b);
      }
    }
    g.set(x, y, c);
    ctx.setKind(x, y, name);
  }
  const grass = ctx.byTexture('patches');
  if (bank) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = ctx.kindAt(x, y);
      if (!k || k === name || ctx.mat(k).texture !== 'patches') continue;
      const lip = onlyOn ? (X: number, Y: number) => ctx.kindAt(X, Y) === name : (X: number, Y: number) => path.has(X, Y);
      if ((y > 0 && lip(x, y - sy)) || (x > 0 && lip(x - sx, y))) g.set(x, y, ctx.tone(k, ctx.mat(k).ramp.length - 2));
    }
  }
  if (grass && (st.tufts ?? 260) > 0) {
    const [clx, cly] = clearings[0] ?? [-1e9, -1e9];
    const gb = ctx.base(grass);
    for (let k = 0; k < (st.tufts ?? 260); k++) {
      const x = Math.trunc(h2(k, 1, 57 + seed) * W), y = Math.trunc(h2(k, 2, 57 + seed) * H);
      if (!path.has(x, y)) continue;
      const d = dpath[y * W + x];
      const mid = Math.hypot(x - clx, y - cly) < 14;
      if (!((d >= 2 && d <= 3) || (mid && d >= 5 && h2(k, 3, 57 + seed) < 0.35))) continue;
      const shape = h2(k, 4, 57 + seed) < 0.5 ? ['h.h', '.l.'] : ['h..', 'lh.', '.l.'];
      let ok = true;
      for (let j = 0; j < shape.length && ok; j++) for (let i = 0; i < 3; i++) if (!path.has(x + i, y + j) || dpath[(y + j) * W + x + i] < 2) { ok = false; break; }
      if (!ok) continue;
      shape.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.set(x + i, y + j, ctx.tone(grass, ch === 'h' ? gb : gb - 1)); }));
    }
  }
  if (st.stairs) stairs(ctx, path, dpath, curve, st.stairs, grass, seed);
}

function stairs(ctx: Ctx, path: Mask, dpath: Int32Array, curve: Pt[], o: { to: number; every?: number; material: string }, grass: string | undefined, seed: number): void {
  const { W, cell } = ctx, g = ctx.ground, s = stoneRoles(ctx, o.material);
  const STEP = o.every ?? 10, endY = ctx.oy + Math.trunc(o.to * cell);
  const gr = (i: number) => (grass ? ctx.tone(grass, i) : s.dark);
  const centerX = (y: number) => curve.reduce((best, p) => (Math.abs(p[1] - y) < Math.abs(best[1] - y) ? p : best))[0];
  for (let y = 0; y < endY; y++) {
    const k = Math.floor(y / STEP), t = y % STEP;
    const cx = centerX(y);
    const joint = Math.trunc(cx - 0.5 * cell + 0.9 * h2(k, 3, 71 + seed) * cell);
    for (let x = 0; x < W; x++) {
      if (!path.has(x, y) || dpath[y * W + x] < 2) continue;
      if (dpath[y * W + x] < 2 + Math.trunc(2.5 * h2(k, x < cx ? 1 : 2, 71 + seed))) continue;
      let c: string;
      if (t === 0) c = x < joint - 2 ? s.high : s.light;
      else if (t <= 5) { c = t === 1 ? s.light : s.mid; if (fbm(x / 4, y / 3, 72 + seed, 2) > 0.66) c = s.speck; }
      else if (t <= 7) c = s.shadow;
      else c = t === 8 ? s.dark : h2(x, y, 73 + seed) < 0.3 ? gr(1) : s.line;
      if (x === joint && t < 8) c = s.dark;
      else if (x === joint + 1 && t > 0 && t <= 5) c = s.light;
      ctx.setKind(x, y, o.material);
      g.set(x, y, c);
    }
    if (t === 8) for (let x = 0; x < W; x++) {
      if (ctx.kindAt(x, y) === o.material && !ctx.raised.has(x, y) && h2(Math.floor(x / 2), k, 74 + seed) < 0.22) { g.set(x, y - 1, gr(2)); g.set(x, y, gr(3)); }
    }
  }
}

function runWater(ctx: Ctx, st: Extract<MapStep, { step: 'water' }>, seed: number, idx: number): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material;
  const mask = shapeMask(ctx, st.shape, seed);
  ctx.masks.set(st.id ?? `water${idx}`, mask);
  const dist = distanceIn(mask);
  const t = (i: number) => ctx.tone(name, i);
  const [deep, mid, shallow, foam] = [t(0), t(1), t(2), t(3)];
  const bank = st.bank ?? [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    ctx.setKind(x, y, name);
    let up: number | null = null, down: number | null = null;
    for (let k = 1; k < 9; k++) if (y - k < 0 || !mask.has(x, y - k)) { up = y - k < 0 ? null : k; break; }
    for (let k = 1; k < 4; k++) if (y + k >= H || !mask.has(x, y + k)) { down = k; break; }
    const dd = dist[y * W + x] + 5 * (fbm(x / 11, y / 4, seed, 2) - 0.5);
    let c = dd < 6 ? shallow : mid;
    if (dd > 14 && fbm(x / 20, y / 4, seed + 1, 2) > 0.56) c = deep;
    if (up !== null) {
      if (up <= bank.length) c = bank[up - 1];
      else if (st.reflection && up <= bank.length + 3 + Math.trunc(2 * fbm(x / 6, 0.5, seed + 2, 2))) c = (y + Math.trunc(x / 7)) % 4 ? st.reflection : mid;
    }
    if (down === 1) c = foam;
    else if (down === 2) c = fbm(x / 3, y, seed + 3, 2) > 0.45 ? foam : shallow;
    else if (down === 3 && c === deep) c = mid;
    g.set(x, y, c);
  }
  const ramp = ctx.mat(name).ramp;
  const up = (c: string | null) => { const i = c ? ramp.indexOf(c) : -1; return i >= 0 ? ramp[Math.min(ramp.length - 1, i + 1)] : c; };
  const per = st.waves ?? 420;
  if (per > 0) for (let k = 0; k < Math.trunc(W * H / per); k++) {
    const x = Math.trunc(h2(k, 1, seed + 4) * W), y = Math.trunc(h2(k, 2, seed + 4) * H);
    if (!mask.has(x, y) || dist[y * W + x] < 4) continue;
    const n = 3 + Math.trunc(h2(k, 3, seed + 4) * 4);
    let ok = true;
    for (let i = 0; i < n; i++) if (!mask.has(x + i, y)) ok = false;
    if (!ok) continue;
    for (let i = 0; i < n; i++) g.set(x + i, y, up(g.get(x + i, y)));
    if (mask.has(x + 1, y + 1)) g.set(x + 1, y + 1, ctx.shade(g.get(x + 1, y + 1), name));
  }
  if (st.glints) {
    const layer = ctx.layer(st.glints);
    for (let k = 0; k < Math.trunc(W * H / 260); k++) {
      const x = Math.trunc(h2(k, 1, seed + 6) * W), y = Math.trunc(h2(k, 2, seed + 6) * H);
      if (!mask.has(x, y) || dist[y * W + x] < 3) continue;
      const n = 1 + Math.trunc(h2(k, 4, seed + 6) * 3);
      for (let i = 0; i < n; i++) if (mask.has(x + i, y)) layer.set(x + i, y, i === 0 ? t(4) : foam);
    }
  }
}

function runLight(ctx: Ctx, st: Extract<MapStep, { step: 'light' }>, seed: number): void {
  const { W, H, cell } = ctx, g = ctx.ground;
  const [sx] = ctx.dir;
  const shadow = new Mask(W, H), deep = new Mask(W, H);
  const cast = (cx: number, cy: number, rx: number, ry: number, s: number) => {
    const lobes = 8 + (s % 4);
    for (let y = Math.trunc(cy - ry * 1.3) - 1; y < Math.trunc(cy + ry * 1.3) + 2; y++) {
      for (let x = Math.trunc(cx - rx * 1.3) - 1; x < Math.trunc(cx + rx * 1.3) + 2; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
        const rr = 1 + 0.11 * Math.sin(a * lobes + s) + 0.07 * n1(a * 2, s);
        if (dx * dx + dy * dy <= rr * rr) shadow.set(x, y);
      }
    }
  };
  if (st.decor !== false) {
    const trunks = st.trunks ?? ['pino', 'arbol'], skip = new Set(st.skip ?? []);
    for (const piece of ctx.game.decor ?? []) {
      if (piece.when || skip.has(piece.sprite) || piece.shadow === false) continue;
      const [w, h] = piece.size ?? [1, 1];
      const cx = piece.at[0] + 0.5 + (w % 2 === 0 ? 0.5 : 0), foot = piece.at[1] + 1;
      if (h >= 2) {
        const [px, py] = ctx.P(cx + 0.3 * w * sx, foot - 0.22);
        cast(px, py, 0.48 * w * cell, 0.22 * w * cell + 1, Math.abs(Math.trunc(cx * 7 + foot)));
        if (trunks.some(p => piece.sprite.startsWith(p))) {
          const [bx, by] = ctx.P(cx, foot - 0.08);
          for (let k = 0; k < Math.trunc(0.3 * w * cell); k++) for (const t of [0, 1]) shadow.set(Math.trunc(bx + k * sx), Math.trunc(by + k * 0.35 + t));
        }
      } else if (piece.shadow && (!st.low || st.low.some(p => piece.sprite.startsWith(p)))) {
        const [px, py] = ctx.P(cx + 0.25 * sx, foot - 0.12);
        cast(px, py, 0.48 * cell, 0.26 * cell, Math.abs(Math.trunc(cx * 13 + foot)));
      }
    }
  }
  for (const [u0, u1, foot, depth, side, salt] of st.buildings ?? []) {
    // a building: a band under it and a wedge off its right side
    const [X0, Y] = ctx.P(u0, foot), X1 = ctx.P(u1, 0)[0];
    for (let y = Math.trunc(Y - side); y < Math.trunc(Y + depth); y++) {
      const k = y - (Y - side);
      for (let x = Math.trunc(X0 + 4 + k * 0.6); x < Math.trunc(X1 + 2 + k * 0.6 + 1.5 * n1(y / 3.0, salt)); x++) {
        if (y >= Y - 1 + (x > X1 ? 0 : side)) shadow.set(x, y);
      }
      for (let x = Math.trunc(X1); x < Math.trunc(X1 + Math.min(k, side) * 0.7 + 3); x++) shadow.set(x, y);
    }
  }
  for (const [u0, u1, foot, depth, skew, salt, side] of st.blocks ?? []) {
    // a block lit from the upper left: a wedge off its right side, a band under its foot leaning right
    const x0 = ctx.P(u0, 0)[0], x1 = ctx.P(u1, 0)[0], fy = ctx.P(0, foot)[1];
    for (let k = -side; k <= depth; k++) {
      const y = Math.trunc(fy + k);
      const a = k < 0 ? x1 : x0 + 3 + k;
      const b = k < 0 ? x1 + Math.trunc((k + side) * 0.9) : x1 + Math.trunc(side * 0.9) + Math.trunc(k * skew) + Math.trunc(1.5 * n1(y / 3.0, salt));
      for (let x = Math.trunc(a); x < Math.trunc(b); x++) {
        shadow.set(x, y);
        if (k >= 0 && k <= 1 && x < x1) deep.set(x, y);
      }
    }
  }
  for (const [u, v, length, slope] of st.stripes ?? []) {
    const [bx, by] = ctx.P(u, v);
    for (let k = 0; k < length; k++) for (const t of [0, 1]) shadow.set(Math.trunc(bx + k), Math.trunc(by + k * slope + t));
  }
  for (const c of st.casts ?? []) {
    const [u, v, rx, ry, salt] = c, [px, py] = ctx.P(u, v);
    cast(px + (c[5] ?? 0), py + (c[6] ?? 0), rx, ry, salt);
  }
  for (const id of st.rim ?? []) {
    const e = ctx.edges.get(id);
    if (!e) throw new Error(`map: light: no outside area "${id}"`);
    for (const side of e.sides.filter(s => s === 'l' || s === 'r')) for (let y = 0; y < H; y++) {
      const edge = e.at(side, y), reach = 4 + 4 * fbm(y / 9, 3.3, 121 + seed, 2);
      const [a, b] = side === 'r' ? [Math.trunc(edge - reach), Math.trunc(edge)] : [Math.trunc(edge), Math.trunc(edge + reach)];
      for (let x = a; x <= b; x++) if (x >= 0 && x < W && ctx.kindAt(x, y) !== e.material) shadow.set(x, y);
    }
  }
  const casting = new Set<string>();
  for (const id of st.edges ?? []) {
    const e = ctx.edges.get(id);
    if (!e) throw new Error(`map: light: no outside area "${id}"`);
    casting.add(e.material);
    const side: Side = sx > 0 ? 'l' : 'r';
    if (!e.sides.includes(side)) continue;
    const [re0, re1] = st.reach ?? [4, 4];
    for (let y = 0; y < H; y++) {
      const edge = e.at(side, y), reach = re0 + re1 * fbm(y / 9, 3.3, 121 + seed, 2);
      const [a, b] = sx > 0 ? [Math.trunc(edge), Math.trunc(edge + reach)] : [Math.trunc(edge - reach), Math.trunc(edge)];
      for (let x = a; x <= b; x++) if (x >= 0 && x < W && ctx.kindAt(x, y) !== e.material) shadow.set(x, y);
    }
  }
  if (st.faces !== false) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!ctx.face[y * W + x] || ctx.raised.has(x, y + 1)) continue;
      casting.add(ctx.kindAt(x, y));
      const reach = 13 + Math.trunc(7 * fbm(x / 6, 1.7, 67 + seed, 2));
      for (let k = 1; k <= reach; k++) for (let dx = 0; dx <= Math.floor(k / 2); dx++) {
        const X = x + (dx + Math.floor(k / 3)) * sx, Y = y + k;
        if (X >= 0 && X < W && Y < H && !ctx.raised.has(X, Y)) { shadow.set(X, Y); if (k <= 5) deep.set(X, Y); }
      }
    }
  }
  clean(shadow, 1);
  const on = st.on ? new Set(st.on) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!shadow.has(x, y)) continue;
    const k = ctx.kindAt(x, y);
    if (!k || (on ? !on.has(k) : casting.has(k) || ctx.raised.has(x, y))) continue;
    let c = ctx.shade(g.get(x, y), k);
    if (deep.has(x, y)) c = ctx.shade(c, k);
    g.set(x, y, c);
  }
}

/** Near the border of a mask that has a distance (a thicket floor, a path): this many px or less from it. */
function edgeTest(ctx: Ctx, edge: [string, number] | undefined): ((x: number, y: number) => boolean) | null {
  if (!edge) return null;
  const d = ctx.dists.get(edge[0]);
  if (!d) throw new Error(`map: scatter: no mask with a distance "${edge[0]}" before it`);
  return (x, y) => d[y * ctx.W + x] <= edge[1];
}

const TUFTS = [
  ['h...h', '.l.l.', '..l..'],
  ['h.h', 'l.l', '.l.'],
  ['.h...h.', 'hl.h.lh', '.l.l.l.'],
  ['..h..', 'h.l.h', '.lll.'],
];

function runScatter(ctx: Ctx, st: Extract<MapStep, { step: 'scatter' }>, seed: number): void {
  const { W, H, cell } = ctx, g = ctx.ground;
  const grass = ctx.byTexture('patches');
  const on = new Set(st.on ?? (grass ? [grass] : []));
  const near = new Set(st.near ?? Object.keys(ctx.recipe.materials).filter(m => !on.has(m)));
  const nearKind = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) if (near.has(ctx.kindAt(x + dx, y + dy))) return true;
    return false;
  };
  const okCell = (x: number, y: number) => st.walkable !== false || !ctx.walkable(x, y);
  const rnd = () => ctx.rnd();
  const rampIdx = (x: number, y: number) => { const k = ctx.kindAt(x, y), c = g.get(x, y); return k && c ? ctx.mat(k).ramp.indexOf(c) : -1; };
  switch (st.what) {
    case 'tufts': {
      const tips = ctx.layer(st.layer ?? 'tips');
      const placed: Pt[] = [];
      const r = st.near_px ?? 6, sp = st.spacing ?? 8;
      const shapes = st.shapes ?? TUFTS;
      const nearEdge = edgeTest(ctx, st.edge);
      const [liftL, liftH] = st.lift ?? [0, 0];
      for (let n = 0; n < (st.count ?? 9000); n++) {
        const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
        if (!on.has(ctx.kindAt(x, y)) || !okCell(x, y)) continue;
        if (st.left !== undefined && !(ctx.ox + st.left < x)) continue;
        const edge = nearEdge ? nearEdge(x, y) : nearKind(x, y, r);
        const [oddsNear, oddsFar] = st.odds ?? [0.9, 0.28];
        if (st.odds !== null && rnd() > (edge ? oddsNear : oddsFar)) continue;
        const gap = edge ? sp : st.far_spacing ?? sp * 11 / 8;
        if (!placed.every(([a, b]) => (x - a) ** 2 + (y - b) ** 2 >= gap * gap)) continue;
        const shape = shapes[Math.trunc(rnd() * shapes.length)];
        const sh = shape.length, sw = shape[0].length, x0 = x - Math.floor(sw / 2), y0 = y - sh + 1;
        let ok = true;
        for (let j = 0; j < sh && ok; j++) for (let i = 0; i < sw; i++) {
          if (shape[j][i] !== '.' && !(x0 + i >= 0 && x0 + i < W && y0 + j >= 0 && y0 + j < H && on.has(ctx.kindAt(x0 + i, y0 + j)))) { ok = false; break; }
        }
        if (!ok) continue;
        const k = ctx.kindAt(x, y);
        let t = rampIdx(x, y);
        if (t < 0 && st.unknown !== undefined) t = st.unknown;
        if (t < 0 && st.straw) {
          // on straw: a dry stalk, gold, no shadow under it
          const [stem, tip] = st.straw;
          shape.forEach((row, j) => [...row].forEach((ch, i) => {
            if (ch === 'l') g.set(x0 + i, y0 + j, stem);
            else if (ch === 'h') tips.set(x0 + i, y0 + j, tip);
          }));
          placed.push([x, y]);
          continue;
        }
        if (t < 0) continue;
        const ramp = ctx.mat(k).ramp, top = ramp.length - 1, lo = ctx.mat(k).shade_min ?? 1;
        const lc = ramp[Math.min(top, Math.max(liftL, t + 1))];
        const hc = st.dry && rnd() < st.dry[0] ? st.dry[1] : ramp[Math.min(top, Math.max(liftH, t + 2))];
        const dc = ramp[Math.max(lo, t - 1)];
        shape.forEach((row, j) => [...row].forEach((ch, i) => {
          if (ch === 'l') g.set(x0 + i, y0 + j, lc);
          else if (ch === 'h') tips.set(x0 + i, y0 + j, hc);
        }));
        if (st.foot !== false) for (let i = 0; i < sw; i++) {
          const c = g.get(x0 + i + 1, y0 + sh);
          if (c && ramp.indexOf(c) >= 1 && shape[sh - 1][i] !== '.') g.set(x0 + i + 1, y0 + sh, dc);
        }
        placed.push([x, y]);
      }
      return;
    }
    case 'flowers': {
      const groups = st.colors ?? [['flor clara', 'flor', 'túnica luz'], ['oro claro', 'oro']];
      for (let n = 0; n < (st.count ?? 45); n++) {
        const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
        if (!on.has(ctx.kindAt(x, y))) continue;
        if (st.reach !== undefined && !(ctx.ox - st.reach < x && x < ctx.ox + ctx.mw + st.reach)) continue;
        if (near.size && !nearKind(x, y, st.near_px ?? 10)) continue;
        let cols: string[];
        if (st.odds_each) {
          // each group tries its own odds with a draw of its own
          let i = 0;
          while (i < groups.length - 1 && !(rnd() < (st.odds?.[i] ?? 0.5))) i++;
          cols = groups[i];
        } else {
          const pick = rnd();
          cols = st.odds
            ? groups[Math.min(groups.length - 1, (i => (i < 0 ? st.odds!.length : i))(st.odds.findIndex(o => pick < o)))]
            : groups[Math.min(groups.length - 1, Math.trunc(pick * groups.length))];
        }
        const [least, more] = st.many ?? [3, 4];
        const many = least + Math.trunc(rnd() * more);
        for (let j = 0; j < many; j++) {
          const X = x + Math.trunc((rnd() - 0.5) * 9), Y = y + Math.trunc((rnd() - 0.5) * 6);
          if (X >= 0 && X < W && Y >= 0 && Y + 1 < H && on.has(ctx.kindAt(X, Y)) && on.has(ctx.kindAt(X, Y + 1)) && rampIdx(X, Y) >= 1 && okCell(X, Y)) {
            g.set(X, Y, cols[Math.trunc(rnd() * cols.length)]);
            const k = ctx.kindAt(X, Y + 1), below = rampIdx(X, Y + 1);
            const [lo, hi] = st.stem ?? [1, ctx.base(k) - 1];
            g.set(X, Y + 1, ctx.tone(k, below >= 1 && below <= hi ? lo : hi));
          }
        }
      }
      return;
    }
    case 'pebbles': {
      const pathId = st.more_in ?? [...ctx.dists.keys()][0];
      const pathMask = pathId ? ctx.masks.get(pathId) : undefined, dpath = pathId ? ctx.dists.get(pathId) : undefined;
      const pathMat = (pathId && ctx.pathMaterial.get(pathId)) || '';
      const stoneName = st.material ?? ctx.byTexture('grain') ?? Object.keys(ctx.recipe.materials)[0];
      const s = stoneRoles(ctx, stoneName);
      const [clx, cly] = (pathId && ctx.clearings.get(pathId)?.[0]) || [-1e9, -1e9];
      const eb = pathMat ? ctx.base(pathMat) : 0;
      const e = (i: number) => (pathMat ? ctx.tone(pathMat, i) : s.shadow);
      const nearStone = (x: number, y: number) => {
        for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
          const k = ctx.kindAt(x + dx, y + dy);
          if (k === pathMat || ctx.face[(y + dy) * W + x + dx]) return true;
        }
        return false;
      };
      const inP = (x: number, y: number, d = 1) => !!pathMask?.has(x, y) && dpath![y * W + x] >= d && (!st.own || ctx.kindAt(x, y) === pathMat);
      const [keep, big, small] = st.odds ?? [0.16, 0.3, 0.65];
      for (let n = 0; n < (st.count ?? 900); n++) {
        const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
        const kd = ctx.kindAt(x, y);
        const claro = Math.hypot(x - clx, y - cly) < 24;
        if (pathMask && kd === pathMat && dpath![y * W + x] >= 3 && rnd() < (claro ? 0.6 : keep)) {
          const r = rnd();
          if (r < big) {
            const stamp: [number, number, string][] = [[1, 0, s.light], [2, 0, s.light], [0, 1, s.light], [1, 1, s.mid], [2, 1, s.mid],
              [3, 1, s.shadow], [1, 2, e(0)], [2, 2, e(0)], [3, 2, e(eb - 1)]];
            for (const [i, j, c] of stamp) if (inP(x + i, y + j, 2)) g.set(x + i, y + j, c);
          } else if (r < small) {
            g.set(x, y, s.light);
            if (st.mid !== false && inP(x + 1, y)) g.set(x + 1, y, s.mid);
            if (inP(x + 1, y + 1)) g.set(x + 1, y + 1, e(0));
          } else {
            g.set(x, y, st.dust && g.get(x, y) === e(eb + 2) ? st.dust : e(eb + 2));
            if (inP(x + 1, y + 1)) g.set(x + 1, y + 1, e(eb - 1));
          }
        } else if (on.has(kd) && nearStone(x, y) && rnd() < 0.15) {
          g.set(x, y, s.light);
          g.set(x, y + 1, s.shadow);
        }
      }
      return;
    }
    case 'dew': {
      const layer = ctx.layer(st.layer ?? 'dew');
      const others = Object.entries(ctx.layers).filter(([n, l]) => n !== 'ground' && l !== layer).map(([, l]) => l);
      const cols = st.colors?.[0] ?? ['ojo', 'celeste luz'];
      const sp = st.spacing ?? 8, spy = st.spacing_y ?? sp, reach = st.reach ?? 40, over = st.over ? new Set(st.over) : null, around = st.around;
      const deep = st.inside ? ctx.dists.get(st.inside[0]) : null;
      if (st.inside && !deep) throw new Error(`map: dew: no mask with a distance "${st.inside[0]}" before it`);
      for (let n = 0; n < (st.count ?? 500); n++) {
        const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
        const k = ctx.kindAt(x, y);
        if (!on.has(k)) continue;
        const t = rampIdx(x, y), top = ctx.mat(k).ramp.length - 1;
        if (st.over === null ? false : over ? !over.has(g.get(x, y) ?? '') : t < top - 2) continue;
        if ((st.alone !== false && others.some(l => l.get(x, y) !== null)) || !(ctx.ox - reach < x && x < ctx.ox + ctx.mw + reach)) continue;
        if (around) {
          const [acx, acy] = ctx.P(around[0], around[1]);
          if (!(Math.hypot((x - acx) / (around[3] ?? 1), y - acy) < around[2])) continue;
        }
        if (deep && st.inside && !(deep[y * W + x] >= st.inside[1])) continue;
        let free = true;
        for (let j = -spy; j <= spy && free; j++) for (let i = -sp; i <= sp; i++) if (layer.get(x + i, y + j) !== null) { free = false; break; }
        if (free) layer.set(x, y, rnd() < 0.6 ? cols[0] : cols[Math.min(1, cols.length - 1)]);
      }
      return;
    }
    case 'boulders': {
      const name = st.material ?? ctx.byTexture('grain');
      if (!name) throw new Error('map: boulders need a stone material');
      const s = stoneRoles(ctx, name);
      const list = [...(st.at ?? [])].sort((p, q) => p[1] - q[1]);
      list.forEach(([u, v, rx, ry], k) => {
        const [cx, cy] = ctx.P(u, v), RX = rx * cell, RY = ry * cell;
        for (const [x, y] of organic(W, H, cx + RX * 0.35, cy + RY * 0.55, RX * 0.95, RY * 0.55, 400 + k + seed, 0.08)) {
          const c = g.get(x, y);
          if (ctx.raised.has(x, y) && !ctx.face[y * W + x]) {
            if (c !== s.line && c !== s.dark) g.set(x, y, Math.hypot((x - cx) / RX, (y - cy - RY * 0.6) / RY) < 0.5 ? s.dark : s.shadow);
          } else if (!ctx.raised.has(x, y)) g.set(x, y, ctx.shade(c, ctx.kindAt(x, y)));
        }
        stone(ctx, name, cx, cy, RX, RY, 300 + k + seed, true);
      });
      return;
    }
    case 'litter': {
      // fallen needles (three dashes) near a tree and pebbles, on the inside of a path
      const pathId = st.path ?? [...ctx.dists.keys()][0];
      const pathMask = pathId ? ctx.masks.get(pathId) : undefined, dpath = pathId ? ctx.dists.get(pathId) : undefined;
      if (!pathMask || !dpath) throw new Error('map: litter needs a path before it');
      const pathMat = ctx.pathMaterial.get(pathId)!;
      const s = stoneRoles(ctx, st.material ?? ctx.byTexture('grain') ?? Object.keys(ctx.recipe.materials)[0]);
      const e = (i: number) => ctx.tone(pathMat, i);
      const trees = (st.at ?? []).map(([u, v, r, squash]) => [...ctx.P(u, v), r ?? 40, squash ?? 1.6]);
      const [needles, pebbles] = st.odds ?? [0.6, 0.75];
      const inP = (x: number, y: number) => pathMask.has(x, y);
      for (let n = 0; n < (st.count ?? 700); n++) {
        const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
        if (!on.has(ctx.kindAt(x, y)) || dpath[y * W + x] < 3) continue;
        const nearTree = trees.some(([tx, ty, r, q]) => Math.hypot(x - tx, (y - ty) * q) < r);
        const r = rnd();
        if (nearTree && r < needles) {
          const dx = rnd() < 0.5 ? 1 : -1;
          for (let t = 0; t < 3; t++) {
            const X = x + t * dx, Y = y + Math.floor((rnd() < 0.3 ? t : 0) / 2);
            if (inP(X, Y) && dpath[Y * W + X] >= 2 && on.has(ctx.kindAt(X, Y))) g.set(X, Y, t === 1 ? e(0) : e(1));
          }
        } else if (r < pebbles) {
          g.set(x, y, s.light);
          if (inP(x + 1, y)) g.set(x + 1, y, s.mid);
          if (inP(x + 1, y + 1)) g.set(x + 1, y + 1, e(0));
        }
      }
      return;
    }
    case 'leaves': {
      // dry leaves fallen near the trees: one or two px, the px below in shadow
      const trees = (st.at ?? []).map(([u, v, r, q]) => [...ctx.P(u, v), r ?? 30, q ?? 1]);
      const cols = st.colors?.[0] ?? ['oro', 'madera clara', 'piel sombra', 'oro claro'], twin = st.colors?.[1] ?? cols;
      const [skipOdds, pairOdds] = st.odds ?? [0.5, 0.5];
      const fade = st.fade;
      for (let n = 0; n < (st.count ?? 700); n++) {
        const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
        if (!on.has(ctx.kindAt(x, y))) continue;
        if (fade !== undefined) {
          // fewer away from the tree: skipped with odds distance / fade
          const d = Math.min(...trees.map(([a, b, , q]) => Math.hypot((x - a) / q, y - b)));
          if (!trees.some(([a, b, r, q]) => !(Math.hypot((x - a) / q, y - b) > r)) || rnd() < d / fade) continue;
        } else {
          if (!trees.some(([a, b, r, q]) => Math.hypot((x - a) / q, y - b) < r)) continue;
          if (rnd() < skipOdds) continue;
        }
        const i = Math.trunc(rnd() * cols.length);
        g.set(x, y, cols[i]);
        if (rnd() < pairOdds) g.set(x + 1, y, twin[i] ?? cols[i]);
        const below = g.get(x, y + 1);
        if (below !== null && (!st.below_on || on.has(ctx.kindAt(x, y + 1)))) g.set(x, y + 1, ctx.shade(below, ctx.kindAt(x, y + 1)));
      }
      return;
    }
    case 'dashes': return scatterDashes(ctx, st, edgeTest(ctx, st.edge));
    case 'stamp': {
      const layer = ctx.layer(st.layer ?? 'ground');
      const rows = st.rows ?? [], gl = st.glyphs ?? {};
      for (const [u, v] of st.at ?? []) {
        const [x0, y0] = ctx.P(u, v);
        rows.forEach((row, j) => [...row].forEach((ch, i) => {
          if (ch === '.' || !gl[ch]) return;
          const X = Math.round(x0) + i, Y = Math.round(y0) + j;
          layer.set(X, Y, gl[ch]);
          if (st.kind) ctx.setKind(X, Y, st.kind);
          if (st.stands) standing(ctx).set(`${X},${Y}`, Math.max(standing(ctx).get(`${X},${Y}`) ?? 0, rows.length - 1 - j));
        }));
      }
      return;
    }
  }
}

/** Runs every step of a recipe on the game grid. */
export function paintMap(recipe: MapRecipe, game: MapGame): PaintedMap {
  const ctx = new Ctx(recipe, game);
  recipe.steps.forEach((st, i) => {
    const seed = ctx.seed + (st.seed ?? STEP_DEFAULTS[st.step] ?? 0);
    switch (st.step) {
      case 'area': return runArea(ctx, st, seed, i);
      case 'path': return runPath(ctx, st, seed, i);
      case 'water': return runWater(ctx, st, seed, i);
      case 'light': return runLight(ctx, st, seed);
      case 'scatter': return runScatter(ctx, st, seed);
      case 'cliff': return runCliff(ctx, st, seed);
      case 'flight': return runFlight(ctx, st, seed);
      case 'feature': return runFeature(ctx, st, seed);
      case 'network': return runNetwork(ctx, st, seed, i);
      case 'rope': return runRope(ctx, st);
      case 'wall': return runWall(ctx, st, i);
      case 'furnish': return runFurnish(ctx, st);
      case 'sun': return runSun(ctx, st);
      case 'thicket': return runThicket(ctx, st, seed, i);
      case 'outcrop': return runOutcrop(ctx, st, i);
      case 'undergrowth': return runUndergrowth(ctx, st);
      case 'canes': return runCanes(ctx, st);
      case 'shade': return runShade(ctx, st);
      case 'beams': return runBeams(ctx, st);
      case 'snowfield': return runSnowfield(ctx, st);
      case 'ledge': return runLedge(ctx, st);
      case 'cloudsea': return runCloudsea(ctx, st);
      case 'crag': return runCrag(ctx, st);
      case 'mountain': return runMountain(ctx, st);
      case 'conifers': return runConifers(ctx, st);
      case 'trail': return runTrail(ctx, st);
      case 'tracks': return runTracks(ctx, st);
      case 'pond': return runPond(ctx, st);
      case 'shrub': return runShrub(ctx, st);
      case 'shadows': return runShadows(ctx, st);
      case 'tussocks': return runTussocks(ctx, st);
      case 'stones': return runStones(ctx, st);
      case 'sparkles': return runSparkles(ctx, st);
      case 'spindrift': return runSpindrift(ctx, st);
      case 'straw': return runStraw(ctx, st);
      case 'overlook': return runOverlook(ctx, st);
      case 'woodedge': return runWoodedge(ctx, st);
      case 'damp': return runDamp(ctx, st);
      case 'cast': return runCast(ctx, st);
      case 'lines': return runLines(ctx, st);
      case 'wildwood': return runWildwood(ctx, st);
      case 'beach': return runBeach(ctx, st);
      case 'mudbank': return runMudbank(ctx, st);
      case 'footpath': return runFootpath(ctx, st, i);
      case 'pier': return runPier(ctx, st);
      case 'reeds': return runReeds(ctx, st);
      case 'rocks': return runRocks(ctx, st);
      case 'umbra': return runUmbra(ctx, st);
      case 'meadow': return runMeadow(ctx, st);
      case 'shimmer': return runShimmer(ctx, st);
      case 'slabs': return runSlabs(ctx, st);
      case 'ditch': return runDitch(ctx, st);
      case 'claypan': return runClaypan(ctx, st);
      case 'floodwater': return runFloodwater(ctx, st);
      case 'cloudbanks': return runCloudbanks(ctx, st);
      case 'ashlar': return runAshlar(ctx, st);
      case 'courses': return runCourses(ctx, st);
      case 'runner': return runRunner(ctx, st);
      case 'arena': return runArena(ctx, st);
      case 'balustrade': return runBalustrade(ctx, st);
      case 'stairway': return runStairway(ctx, st);
      case 'sprigs': return runSprigs(ctx, st);
      case 'fallen': return runFallen(ctx, st);
      case 'motes': return runMotes(ctx, st);
      case 'overhang': return runOverhang(ctx, st);
      case 'cavern': return runCavern(ctx, st, seed);
      case 'hangroots': return runHangroots(ctx, st);
      case 'carvings': return runCarvings(ctx, st);
      case 'rootladder': return runRootladder(ctx, st);
      case 'pool': return runPool(ctx, st);
      case 'formation': return runFormation(ctx, st);
      case 'gloom': return runGloom(ctx, st);
      case 'soften': return runSoften(ctx, st);
      case 'glen': return runGlen(ctx, st);
      case 'cushions': return runCushions(ctx, st);
      case 'mudtrail': return runMudtrail(ctx, st);
      case 'shingle': return runShingle(ctx, st);
      case 'ledgeslabs': return runLedgeslabs(ctx, st);
      case 'plunge': return runPlunge(ctx, st);
      case 'wetstones': return runWetstones(ctx, st);
      case 'wetwood': return runWetwood(ctx, st);
      case 'glenshade': return runGlenshade(ctx, st);
      case 'glenlitter': return runGlenlitter(ctx, st);
      case 'glenflow': return runGlenflow(ctx, st);
      case 'boughs': return runBoughs(ctx, st);
    }
  });
  // a layer the export names exists even if no step painted on it (an empty front layer)
  for (const name of Object.keys(recipe.export?.layers ?? {})) ctx.layer(name);
  return { width: ctx.W, height: ctx.H, cell: ctx.cell, origin: [ctx.ox, ctx.oy], layers: ctx.layers, kind: ctx.kind };
}
