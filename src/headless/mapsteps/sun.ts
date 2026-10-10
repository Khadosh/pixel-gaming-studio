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
//
// A light with a `source` instead of a `dir` is a lamp in the room (a candle, a
// furnace, the shaft of a stair): one point `h` px above the ground at the
// cell `at`. A point z px high whose foot is F lands where the line from the
// lamp through it meets the floor, F + (F − lamp)·z/(h − z): away from the lamp,
// longer the farther from it and the taller, never more than `length`·z. The
// steps do not know which light it is: they ask `leanAt` for the lean at a foot.

import { Mask, clean, fbm, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { MapRecipe } from '../maprecipe';

export interface Sun {
  /** px a point 1 px high is thrown from its foot: [x, y] (`length` along the unit `dir`; [0, 0] under a lamp: ask `leanAt`). */
  lean: [number, number];
  /** the most a point 1 px high is thrown (px). */
  length: number;
  /** a lamp instead of the sun: where it stands (px on the picture) and how high (px); null: the sun of `dir`. */
  source: { x: number; y: number; h: number } | null;
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

/**
 * The sun of a recipe, or null when its light is the old direction (or absent). `P` turns a cell into px on the
 * picture (the map's margin and cell), for a lamp's `at`; without it the lamp stands at the cell's px as if no margin.
 */
export function sunOf(light: MapRecipe['light'], P: (u: number, v: number) => [number, number] = (u, v) => [u * 16, v * 16]): Sun | null {
  if (!light || Array.isArray(light)) return null;
  const len = light.length;
  let lean: [number, number] = [0, 0], source: Sun['source'] = null;
  if (light.source) {
    const [x, y] = P(light.source.at[0] + 0.5, light.source.at[1] + 0.5);
    source = { x, y, h: light.source.h };
  } else if (light.dir) {
    const [dx, dy] = light.dir, n = Math.hypot(dx, dy) || 1;
    lean = [(len * dx) / n, (len * dy) / n];
  } else throw new Error('map: light: a sun needs `dir` (where shadows fall) or `source` (a lamp: {at, h})');
  return {
    lean,
    length: len,
    source,
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

/**
 * The lean of the light for a point h px high whose foot is (x, foot): px it is thrown per px of height, [x, y]. The
 * sun's `lean` everywhere; under a lamp, away from it, (foot − lamp)/(h_lamp − h), never longer than `length` (a point
 * as high as the lamp or higher throws `length`; a foot under the lamp throws nothing).
 */
export function leanAt(ctx: Ctx, x: number, foot: number, h: number): [number, number] {
  const sun = ctx.sun!, s = sun.source;
  if (!s) return sun.lean;
  const dx = x - s.x, dy = foot - s.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return [0, 0];
  const room = s.h - Math.max(0, h), k = room > 0 ? Math.min(sun.length, d / room) : sun.length;
  return [(k * dx) / d, (k * dy) / d];
}

/**
 * The lean walked back from a px that takes a shadow (x, y) toward what casts it, per px of the caster's height: the
 * sun's `lean`; under a lamp, the foot of a point z px high that lands on (x, y) is (x, y) − (x, y − lamp)·z/h_lamp.
 */
export function leanBack(ctx: Ctx, x: number, y: number): [number, number] {
  const sun = ctx.sun!, s = sun.source;
  if (!s) return sun.lean;
  const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return [0, 0];
  const k = Math.min(sun.length, d / Math.max(1, s.h));
  return [(k * dx) / d, (k * dy) / d];
}

/** Where the light throws a point h px above the ground whose foot is (x, foot). */
export function thrown(ctx: Ctx, x: number, foot: number, h: number): [number, number] {
  const [lx, ly] = leanAt(ctx, x, foot, h);
  return [x + lx * h, foot + ly * h];
}

/**
 * A px that stands (x, y on the picture, h px above its foot): its shadow, and it never takes one (`blocks`: false
 * for a px on a layer of its own, a bough over the ground: the ground under it can still take a shadow).
 */
export function castStanding(ctx: Ctx, x: number, y: number, h: number, blocks = true): void {
  if (blocks) block(ctx, x, y);
  if (h < 0) return;
  const [X, Y] = thrown(ctx, x, y + h, h);
  shade(ctx, X, Y);
  // a thin thing still throws a shadow two px wide down-light of its foot: the contact
  if (h <= 1) { const [lx] = leanAt(ctx, x, y + h, h); shade(ctx, X + Math.sign(lx || 1), Y); }
}

/**
 * A mass that stands `height` px over every px where `casts` is true (a thicket, the wood of a glen): a px where
 * `takes` is true is in its shadow when the sun, walked back from it up to that height, meets the mass. The edge of
 * the shadow is the edge of the mass slid along the sun, as far as its height says.
 */
export function castMass(ctx: Ctx, casts: (x: number, y: number) => boolean, height: number,
  takes: (x: number, y: number) => boolean): void {
  const lamp = !!ctx.sun!.source, s = state(ctx);
  let [lx, ly] = ctx.sun!.lean, n = Math.max(1, Math.ceil(Math.hypot(lx, ly) * Math.max(0, height) * 2));
  for (let y = 0; y < ctx.H; y++) for (let x = 0; x < ctx.W; x++) {
    if (casts(x, y) || !takes(x, y)) continue;
    if (lamp) { [lx, ly] = leanBack(ctx, x, y); n = Math.max(1, Math.ceil(Math.hypot(lx, ly) * Math.max(0, height) * 2)); }
    for (let k = 1; k <= n; k++) {
      const h = (height * k) / n;
      if (casts(Math.round(x - lx * h), Math.round(y - ly * h))) { s.mask.set(x, y); break; }
    }
  }
}

/** A column h px high whose foot is (x, foot) on the picture (a crag over its ground): its shadow, from its foot up. */
export function castColumn(ctx: Ctx, x: number, foot: number, h: number, skip?: (x: number, y: number) => boolean): void {
  const [lx, ly] = leanAt(ctx, x, foot, h), n = Math.max(1, Math.ceil(Math.hypot(lx, ly) * h * 2));
  for (let k = 0; k <= n; k++) {
    const t = (h * k) / n, X = Math.round(x + lx * t), Y = Math.round(foot + ly * t);
    if (!skip?.(X, Y)) shade(ctx, X, Y);
  }
}

/** Where a piece of the decor stands (the middle of its foot, px) and the salt of its shadow, the way the light step reads it. */
export function decorFoot(ctx: Ctx, piece: { at: [number, number]; size?: [number, number]; offset?: [number, number] }): [number, number, number] {
  const [w] = piece.size ?? [1, 1], [du, dv] = piece.offset ?? [0, 0];
  const [px, py] = ctx.P(piece.at[0] + du + 0.5 + (w % 2 === 0 ? 0.5 : 0), piece.at[1] + dv + 1);
  return [px, py, Math.abs(Math.trunc(px * 7 + py))];
}

/**
 * The shadow of a crown on a trunk w × h cells whose foot is (px, py): its footprint (the sun's `crown`) swept from
 * where the crown starts to its top. A wide crown (a pine of a garden, eleven cells across) shades mostly near its
 * trunk: past two cells the pool grows by a third of what the crown does.
 */
export function castCrown(ctx: Ctx, px: number, py: number, w: number, h: number, salt: number): void {
  const sun = ctx.sun!, cell = ctx.cell;
  const k = Math.min(w, 2 + (w - 2) / 3), rx = sun.crown[0] * k * cell, ry = sun.crown[1] * k * cell;
  castOval(ctx, px, py - 0.8 * ry, rx, ry, 0.3 * h * cell, h * cell, salt);   // a crown over its trunk: the pool reaches behind it
}

/** The shadow of something low and solid w × h cells whose foot is (px, py): a pool from the ground to its top. */
export function castLow(ctx: Ctx, px: number, py: number, w: number, h: number, salt: number): void {
  castOval(ctx, px, py - 1, 0.45 * w * ctx.cell, 0.2 * w * ctx.cell + 1, 0, h * ctx.cell, salt);
}

/**
 * A footprint on the ground (`inside` over its box, in px) lifted from h0 to h1 px: its shadow is the footprint
 * swept along the sun from h0 to h1 (a crown from where its leaves start to its top, an awning at its height).
 */
export function castFootprint(ctx: Ctx, box: [number, number, number, number], inside: (x: number, y: number) => boolean,
  h0: number, h1: number): void {
  const [x0, y0, x1, y1] = box, fx = (x0 + x1) / 2;
  // under a lamp the whole footprint leans as its middle does (at each height), so it is slid, never sheared
  const lean = (h: number) => leanAt(ctx, fx, y1, h);
  const [lx, ly] = lean(h1), reach = Math.hypot(lx, ly) * Math.max(0, h1 - h0);
  const n = Math.max(1, Math.ceil(reach * 2));
  const s = state(ctx);
  const leans = Array.from({ length: n + 1 }, (_, k) => lean(h0 + ((h1 - h0) * k) / n));
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    if (!inside(x, y)) continue;
    for (let k = 0; k <= n; k++) {
      const h = h0 + ((h1 - h0) * k) / n, [ax, ay] = leans[k], X = Math.round(x + ax * h), Y = Math.round(y + ay * h);
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
  const leanH = (h: number) => leanAt(ctx, cx, cy, h);
  const [lx, ly] = leanH(h1), reach = Math.hypot(lx, ly) * Math.max(0, h1 - h0);
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
    const f = k / n, h = h0 + (h1 - h0) * f, [ax, ay] = leanH(h), sc = 1 - 0.5 * Math.max(0, f - 0.5), ox = cx + ax * h, oy = cy + ay * h, Rx = rx * sc, Ry = ry * sc;
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

/**
 * What each step that casts has of its own light: the parameters of the old shadow (an offset, a reach, a slope),
 * which a recipe with a sun does not use. Written down so a recipe with a sun that still declares one hears about
 * it: two lights where one is silent are the ones nobody notices.
 */
const OLD_LIGHT: Record<string, string[]> = {
  shade: ['reach', 'slope', 'deep'],
  glenshade: ['rim', 'casters[].at', 'casters[].deep'],
  overhang: ['shadow.at'],
  light: ['trunks', 'crowns', 'trees'],
  cast: ['lean', 'smooth', 'min'],
  rocks: ['shadow'],
  building: ['shadow.offset'],
  beds: ['shadow.offset'],
  stall: ['shadow.offset'],
  pier: ['shadow', 'under'],
  furnish: ['shape'],
};

/** The steps of a recipe with a sun that declare a parameter of the old light, one line each (none without a sun). */
export function sunIgnored(recipe: Pick<MapRecipe, 'light' | 'steps'>): string[] {
  if (!sunOf(recipe.light)) return [];
  const out: string[] = [];
  const has = (o: unknown, path: string[]): boolean => {
    if (o === undefined || o === null) return false;
    if (!path.length) return true;
    const [head, ...rest] = path;
    if (head.endsWith('[]')) {
      const list = (o as Record<string, unknown>)[head.slice(0, -2)];
      return Array.isArray(list) && list.some(v => has(v, rest));
    }
    return has((o as Record<string, unknown>)[head], rest);
  };
  recipe.steps.forEach((st, i) => {
    const params = OLD_LIGHT[st.step];
    if (!params) return;
    const used = params.filter(p => has(st, p.split('.')));
    if (!used.length) return;
    const id = 'id' in st && typeof st.id === 'string' ? ` "${st.id}"` : '';
    out.push(`step ${i} (${st.step}${id}): ${used.join(', ')} ${used.length > 1 ? 'are' : 'is'} the old light, not used under the sun: take ${used.length > 1 ? 'them' : 'it'} out (the sun says where the shadow falls)`);
  });
  return out;
}
