// One light for the whole map: the sun of the mother recipe.
//
// A recipe whose `light` is an object (`{dir, length, tone}`) has a sun, and
// every step that throws a shadow throws it with the same rule: a point h px
// above the ground lands `length`·h px away from its foot, along `dir`. A tree,
// a building, a stall, a fence, a bed, a stamp that stands, a decor piece and
// a hand-placed umbra all add their shadow to one mask, and the mask is laid
// on the ground once (at a `light` step, and at the end of the map): one tone
// of shadow per material (`tone` steps down the recipe's `shade`), and two
// shadows over each other darken it once, not twice. A place inlined into the
// mother paints with the mother's context, so it has the mother's sun and no
// light of its own.
//
// A recipe whose `light` is the old pair of numbers (or no light at all) has no
// sun: every step throws its own shadow its own way, pixel for pixel as before.

import { Mask, clean, fbm, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { MapRecipe } from '../maprecipe';

export interface Sun {
  /** px a point 1 px high is thrown from its foot: [x, y] (`length` along the unit `dir`). */
  lean: [number, number];
  /** tones down the shade of the material (1 or more), and per material where it is not that. */
  tone: number;
  tones: Record<string, number>;
  /** px of the rim of a shadow one tone lighter than its body (its penumbra; 0: none). */
  soft: number;
  /** how much more of a volume (a crown) is on its dark side: 0 as drawn, 0.2 a good deal more. */
  contrast: number;
  /** materials that take a shadow; null: the ones the casting steps name. */
  on: string[] | null;
  /** how much of the edge is bitten back into light, in bites a few px across (a frayed edge, not a ruled one). */
  fray: number;
  /** a tree's crown seen from above: [rx, ry] times the crown width. */
  crown: [number, number];
}

/** The sun of a recipe, or null when its light is the old direction (or absent). */
export function sunOf(light: MapRecipe['light']): Sun | null {
  if (!light || Array.isArray(light)) return null;
  const [dx, dy] = light.dir, n = Math.hypot(dx, dy) || 1, len = light.length;
  return {
    lean: [(len * dx) / n, (len * dy) / n],
    tone: light.tone ?? 1,
    tones: light.tones ?? {},
    soft: light.soft ?? 0,
    contrast: light.contrast ?? 0,
    on: light.on ?? null,
    fray: light.fray ?? 0.3,
    crown: light.crown ?? [0.55, 0.24],
  };
}

interface SunState { mask: Mask; done: Mask; block: Mask; on: Set<string> }
const STATE = new WeakMap<Ctx, SunState>();

function state(ctx: Ctx): SunState {
  let s = STATE.get(ctx);
  if (!s) {
    s = { mask: new Mask(ctx.W, ctx.H), done: new Mask(ctx.W, ctx.H), block: new Mask(ctx.W, ctx.H), on: new Set() };
    STATE.set(ctx, s);
  }
  return s;
}

/** The materials a casting step names as the ones its shadow falls on (when the sun names none). */
export function sunOn(ctx: Ctx, on: Iterable<string> | null | undefined): void {
  if (!on) return;
  const s = state(ctx);
  for (const k of on) s.on.add(k);
}

/** Whether a material takes the sun's shadow (the sun's `on`, or what the casting steps named so far). */
export function sunTakes(ctx: Ctx, kind: string): boolean {
  if (!ctx.sun || !kind) return false;
  return ctx.sun.on ? ctx.sun.on.includes(kind) : state(ctx).on.has(kind);
}

/** A px in the shadow (it is laid on the ground at the next flush). */
export function shade(ctx: Ctx, x: number, y: number): void {
  const X = Math.round(x), Y = Math.round(y);
  if (X >= 0 && Y >= 0 && X < ctx.W && Y < ctx.H) state(ctx).mask.set(X, Y);
}

/** A px of something that casts: it never takes a shadow (a wall, a post, the counter of a stall). */
export function block(ctx: Ctx, x: number, y: number): void { state(ctx).block.set(x, y); }

/** The px of a mask, all in the shadow (a shadow a step drew its own way, now laid by the sun). */
export function shadeMask(ctx: Ctx, m: Mask): void {
  const s = state(ctx);
  for (let i = 0; i < m.data.length; i++) if (m.data[i]) s.mask.data[i] = 1;
}

/** Where the sun throws a point h px above the ground whose foot is (x, foot). */
export function thrown(ctx: Ctx, x: number, foot: number, h: number): [number, number] {
  const [lx, ly] = ctx.sun!.lean;
  return [x + lx * h, foot + ly * h];
}

/** A px that stands (x, y on the picture, h px above its foot): its shadow, and it never takes one. */
export function castStanding(ctx: Ctx, x: number, y: number, h: number): void {
  block(ctx, x, y);
  if (h < 0) return;
  const [X, Y] = thrown(ctx, x, y + h, h);
  shade(ctx, X, Y);
  // a thin thing still throws a shadow two px wide down-light of its foot: the contact
  if (h <= 1) { const [lx] = ctx.sun!.lean; shade(ctx, X + Math.sign(lx || 1), Y); }
}

/**
 * A footprint on the ground (`inside` over its box, in px) lifted from h0 to h1 px: its shadow is the footprint
 * swept along the sun from h0 to h1 (a crown from where its leaves start to its top, an awning at its height).
 */
export function castFootprint(ctx: Ctx, box: [number, number, number, number], inside: (x: number, y: number) => boolean,
  h0: number, h1: number): void {
  const [lx, ly] = ctx.sun!.lean, reach = Math.hypot(lx, ly) * Math.max(0, h1 - h0);
  const n = Math.max(1, Math.ceil(reach * 2));
  const [x0, y0, x1, y1] = box;
  const s = state(ctx);
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    if (!inside(x, y)) continue;
    for (let k = 0; k <= n; k++) {
      const h = h0 + ((h1 - h0) * k) / n, X = Math.round(x + lx * h), Y = Math.round(y + ly * h);
      if (X >= 0 && Y >= 0 && X < ctx.W && Y < ctx.H) s.mask.set(X, Y);
    }
  }
}

/**
 * A pool under a crown (or a rock) at (cx, cy), rx × ry px, lifted from h0 to h1 px: an oval at each height, narrower
 * over its upper half (a crown thins toward its top), slid along the sun; their union is a blot with no straight run (a swept oval
 * would have two parallel sides). Its edge in lobes a few px across, the same size whatever the pool.
 */
export function castOval(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, h0: number, h1: number, salt: number): void {
  if (rx <= 0 || ry <= 0) return;
  const [lx, ly] = ctx.sun!.lean, reach = Math.hypot(lx, ly) * Math.max(0, h1 - h0);
  const n = Math.max(1, Math.ceil(reach / 2));
  const lobes = Math.max(5, Math.round((2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2)) / 9));
  const amp = Math.min(0.16, 3.5 / Math.min(rx, ry) + 0.04);
  const edge = (a: number) => 1 + amp * Math.sin(a * lobes + salt) + 0.12 * n1(a * 1.5, salt + 7) + 0.6 * amp * n1(a * 3, salt) + 0.4 * amp * n1(a * 7, salt + 3);
  const s = state(ctx);
  // a blot, not an oval: the body squashed off true (wider on one side) and three or four lobes out of its rim, toward
  // the sides and down (where roots and low branches spread), each its own size
  const lean = 0.25 * (2 * ((salt * 0.6180339) % 1) - 1);
  const blots: [number, number, number][] = [[0, 0, 0.86]];
  const nb = 3 + (salt % 2);
  for (let i = 0; i < nb; i++) {
    const u = ((salt * 0.7548777 + i * 0.5698403) % 1), a = Math.PI * (-0.15 + 1.3 * ((i + u) / nb));   // from a bit over east, round the bottom, to a bit over west
    const d = 0.66 + 0.14 * ((salt * 0.2360680 + i * 0.4142) % 1);
    blots.push([d * Math.cos(a), d * Math.sin(a) * 0.9, 0.3 + 0.2 * ((salt * 0.3819660 + i * 0.7071) % 1)]);
  }
  for (let k = 0; k <= n; k++) {
    const f = k / n, h = h0 + (h1 - h0) * f, sc = 1 - 0.5 * Math.max(0, f - 0.5), ox = cx + lx * h, oy = cy + ly * h, Rx = rx * sc, Ry = ry * sc;
    if (Rx < 0.5 || Ry < 0.5) continue;
    for (let y = Math.floor(oy - Ry * 1.3) - 1; y <= Math.ceil(oy + Ry * 1.3) + 1; y++) for (let x = Math.floor(ox - Rx * 1.3) - 1; x <= Math.ceil(ox + Rx * 1.3) + 1; x++) {
      if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) continue;
      const ux = (x + 0.5 - ox) / Rx, uy = (y + 0.5 - oy) / Ry;
      const inside = blots.some(([bx, by, br], i) => {
        const dx = (ux - bx) / (i ? br : br * (1 + lean * Math.sign(ux))), dy = (uy - by) / (i ? br : br * 0.92);
        const r = edge(Math.atan2(dy, dx) + i);
        return dx * dx + dy * dy <= r * r;
      });
      if (inside) s.mask.set(x, y);
    }
  }
}

/**
 * Lays the shadow gathered so far on the ground: each px once, `tone` steps down the shade of its material, only on
 * the materials that take a shadow and never on a px that casts; its edge frays. A px already laid is not darkened
 * again by a later flush.
 */
export function flushSun(ctx: Ctx): void {
  const sun = ctx.sun, s = STATE.get(ctx);
  if (!sun || !s) return;
  const { W, H } = ctx, g = ctx.ground;
  const pending = s.mask;
  for (let i = 0; i < pending.data.length; i++) if (s.done.data[i] || s.block.data[i]) pending.data[i] = 0;
  clean(pending, 1);
  const on = sun.on ? new Set(sun.on) : s.on.size ? s.on : null;
  const inShadow = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || pending.has(x, y) || s.done.has(x, y) || s.block.has(x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!pending.has(x, y) || s.block.has(x, y)) continue;
    const k = ctx.kindAt(x, y);
    if (!k || (on ? !on.has(k) : ctx.raised.has(x, y))) continue;
    // how far in from the edge (1: the edge itself), up to soft + 1
    let d = 0;
    for (let j = 1; j <= sun.soft + 1 && !d; j++) if (!inShadow(x + j, y) || !inShadow(x - j, y) || !inShadow(x, y + j) || !inShadow(x, y - j)) d = j;
    // the edge frays in bites a few px across (smooth noise, never a px here and there), the penumbra swells and thins
    if (d > 0 && d <= 2 && fbm(x / 4, y / 4, 4243, 2) < sun.fray + (d === 1 ? 0.12 : -0.02)) continue;
    let tone = sun.tones[k] ?? sun.tone;
    if (sun.soft > 0 && tone > 1 && d > 0 && d <= Math.round(sun.soft * (0.4 + 1.2 * fbm(x / 6, y / 6, 4247, 2)))) tone -= 1;
    let c = g.get(x, y);
    for (let t = 0; t < tone; t++) c = ctx.shade(c, k);
    g.set(x, y, c);
    s.done.set(x, y);
  }
  pending.data.fill(0);
}
