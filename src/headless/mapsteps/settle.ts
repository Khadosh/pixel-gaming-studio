// Settle («asentar»): what stands on the ground sits in it, not on it.
//
// A stamp is laid whole, its ink closed on all four sides, and its only bond
// with the ground was the shadow of the sun: a rock by a pond read as a ball of
// rock put there (Joaquín, 10 October). The steps that lay something with a
// foot register it as they paint (`registerFooted`): a stamp that stands, a
// rock, a boulder or a wet stone, the trunk of a tree, a post of a fence, a
// piling of a pier, the walls of a building. A `settle` step takes the ones
// laid before it (all, or its `targets` by step id, step name or kind) and, by
// rule:
//
// 1. sink: the lowest `sink` rows go under the ground, cut along a bitten line
//    (a straight built base — a crate, a barrel — sinks level; legs sink a px),
//    and the ground below the foot is painted back over them. Only on ground:
//    where another thing (a trunk, a post, a stamp) is under the foot, the foot
//    stays, and only ground is mirrored up (never the top of a gravestone);
// 2. ink: the ink of the lower quarter of its outline turns the deepest tone of
//    the material just above it in its column (or inward), less toward the
//    sides (the ink above stays; the red of a tassel never paints a post);
// 3. ring: an occlusion ring at its foot, a tone or two down the ground, wider
//    below than at the sides, frayed: there whatever the sun does;
// 4. tufts: blades of the grass around (or pebbles on earth) over the edge of
//    its foot, as many as the grass around it says, only rooted on ground;
// 5. by context: water at its foot wets it (a band two tones down, irregular,
//    only on the material that touches the water,
//    a broken line of foam, the thing mirrored into the water in its tones,
//    dithered and broken); a foot in shaded grass grows moss on the side away
//    from the sun (the rule of roof.moss: a soft-noise score and a threshold).
//    Moss is off unless asked (`moss: true`): in the pilot of 10 October it
//    read as grass climbing the rock, and it greened crates and flowers.
//
// Registering paints nothing, so a recipe without `settle` paints what it
// painted. Pure and deterministic: its noise is its own salt, never the shared
// random stream of the scatter steps (what a later scatter draws is drawn the
// same; only where it lands can change, on the ground a foot gave back).

import { fbm, h2 } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';
import type { PaintedMap } from '../mappaint';
import { standing } from './lowland';
import { sunShaded, unblock } from './sun';
import type { SettleStep } from './settleschema';
import { settleKinds } from './settleschema';

export type FootedKind = typeof settleKinds[number];

/** A thing with a foot, as laid: which step laid it, its px on its layer and its ink. */
export interface Footed {
  from: string;
  id?: string;
  kind: FootedKind;
  layer: string;
  /** px index → the color the thing has there (kept up to date by settle). */
  px: Map<number, string>;
  /** Its outline colors (the ink); empty: drawn with none. */
  ink: Set<string>;
  settled?: boolean;
}

const FOOTED = new WeakMap<Ctx, Footed[]>();

/** The things with a foot laid so far. */
export function footedOf(ctx: Ctx): Footed[] {
  let list = FOOTED.get(ctx);
  if (!list) { list = []; FOOTED.set(ctx, list); }
  return list;
}

/** How light a color is, 0..1: by its hex when the recipe gave the palette, else by its place in a ramp. */
export function lum(ctx: Ctx, c: string): number {
  const hex = ctx.hex?.[c];
  if (hex && /^#[0-9a-f]{6}/i.test(hex)) {
    const n = parseInt(hex.slice(1, 7), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  for (const m of Object.values(ctx.recipe.materials)) {
    const i = m.ramp.indexOf(c);
    if (i >= 0) return m.ramp.length > 1 ? i / (m.ramp.length - 1) : 0.5;
  }
  return 0.5;
}

/** The ink of a thing: its darkest colors that live mostly on its outline (none when its darkest does not). */
function inferInk(ctx: Ctx, px: Map<number, string>): Set<string> {
  const W = ctx.W, total = new Map<string, number>(), edge = new Map<string, number>();
  for (const [i, c] of px) {
    total.set(c, (total.get(c) ?? 0) + 1);
    const x = i % W;
    const out = (x > 0 ? !px.has(i - 1) : true) || (x < W - 1 ? !px.has(i + 1) : true) || !px.has(i - W) || !px.has(i + W);
    if (out) edge.set(c, (edge.get(c) ?? 0) + 1);
  }
  const share = (c: string) => (edge.get(c) ?? 0) / (total.get(c) ?? 1);
  const cols = [...total.keys()].sort((a, b) => lum(ctx, a) - lum(ctx, b));
  if (!cols.length || share(cols[0]) < 0.4) return new Set();
  const floor = lum(ctx, cols[0]);
  return new Set(cols.filter(c => lum(ctx, c) <= floor + 0.06 && share(c) >= 0.4));
}

/**
 * A step laid a thing with a foot: its px (on `layer`, ground by default) are read now, as they are. `ink` when the
 * step knows it (a rock's outline), else the darkest colors of its outline.
 */
export function registerFooted(ctx: Ctx, from: string, kind: FootedKind, pts: Iterable<[number, number]>,
  opts: { id?: string; layer?: string; ink?: string[] } = {}): void {
  const layer = opts.layer ?? 'ground', L = ctx.layers[layer];
  if (!L) return;
  const px = new Map<number, string>();
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) continue;
    const c = L.get(x, y);
    if (c !== null) px.set(y * ctx.W + x, c);
  }
  if (px.size < 2) return;
  footedOf(ctx).push({ from, id: opts.id, kind, layer, px, ink: opts.ink ? new Set(opts.ink) : inferInk(ctx, px) });
}

const STAMPED = new WeakMap<Ctx, Map<string, Map<number, string>>>();

/**
 * A stamp was laid (standing or not): its px on `layer`, as they are now. Settle reads it to tell ground from a thing:
 * the ground mirrored up over a foot, a blade, a ring never come from (or fall on) another stamp. Paints nothing.
 */
export function registerStamped(ctx: Ctx, layer: string, pts: Iterable<[number, number]>): void {
  const L = ctx.layers[layer];
  if (!L) return;
  let all = STAMPED.get(ctx);
  if (!all) { all = new Map(); STAMPED.set(ctx, all); }
  let m = all.get(layer);
  if (!m) { m = new Map(); all.set(layer, m); }
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) continue;
    const c = L.get(x, y);
    if (c !== null) m.set(y * ctx.W + x, c);
  }
}

// ------------------------------------------------------------------ the step

/** Per layer, px → the last thing with a foot laid there (a later one was painted over the earlier). */
type Owners = Map<string, Map<number, Footed>>;

function ownersOf(ctx: Ctx): Owners {
  const out: Owners = new Map();
  for (const r of footedOf(ctx)) {
    let m = out.get(r.layer);
    if (!m) { m = new Map(); out.set(r.layer, m); }
    for (const i of r.px.keys()) m.set(i, r);
  }
  return out;
}

/** Whether px `k` of `layer` is still a thing other than `rec`: another thing with a foot, or a stamp. */
function otherThing(ctx: Ctx, owners: Owners, rec: Footed, layer: string, k: number): boolean {
  const L = ctx.layers[layer];
  if (!L) return false;
  const c = L.px[k];
  if (c === null) return false;
  const o = owners.get(layer)?.get(k);
  if (o && o !== rec && o.px.get(k) === c) return true;
  return !rec.px.has(k) && STAMPED.get(ctx)?.get(layer)?.get(k) === c;
}

interface Geometry {
  own: Set<number>;
  x0: number; x1: number; y0: number; y1: number;
  /** column → its lowest px of the thing. */
  bottom: Map<number, number>;
}

function geometry(ctx: Ctx, rec: Footed, L: Layer, owners: Owners): Geometry | null {
  const W = ctx.W, own = new Set<number>(), mine = owners.get(rec.layer);
  // only what is still the thing: a later step may have painted over part of it (a later thing with a foot, even in
  // the same colors: the trunk in front over the foot of the one behind)
  for (const [i, c] of rec.px) if (L.px[i] === c && (mine?.get(i) ?? rec) === rec) own.add(i); else rec.px.delete(i);
  if (own.size < 2) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const bottom = new Map<number, number>();
  for (const i of own) {
    const x = i % W, y = Math.floor(i / W);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if ((bottom.get(x) ?? -1) < y) bottom.set(x, y);
  }
  return { own, x0, x1, y0, y1, bottom };
}

/** By default every thing with a foot but a building (its walls stand on a plinth or a floor: name it to settle it). */
const matches = (rec: Footed, targets: string[] | undefined) => !targets ? rec.kind !== 'building' : targets.some(t => t === rec.id || t === rec.from || t === rec.kind);

/** Settles every thing with a foot laid before it (its `targets`, or all) that no settle took yet. */
export function runSettle(ctx: Ctx, st: SettleStep): void {
  const salt = st.salt ?? 2971, owners = ownersOf(ctx);
  for (const rec of footedOf(ctx)) {
    if (rec.settled || !matches(rec, st.targets)) continue;
    rec.settled = true;
    settleOne(ctx, rec, st, salt, owners);
  }
}

/** The tones darker than `c` along the recipe's shade table (or its material ramp), nearest first. */
function darkerChain(ctx: Ctx, c: string, max = 6): string[] {
  const out: string[] = [];
  if (ctx.recipe.shade) {
    let cur = c;
    for (let n = 0; n < max; n++) {
      const nx = ctx.recipe.shade[cur];
      if (!nx || nx === cur || out.includes(nx) || nx === c) break;
      out.push(nx); cur = nx;
    }
    return out;
  }
  for (const m of Object.values(ctx.recipe.materials)) {
    const i = m.ramp.indexOf(c);
    if (i > 0) return m.ramp.slice(Math.max(0, i - max), i).reverse();
  }
  return out;
}

/** Two tones of one material: one a shade (two at most) of the other, or both in one material ramp. */
function sameMaterial(ctx: Ctx, a: string, b: string): boolean {
  if (a === b) return true;
  if (darkerChain(ctx, a, 2).includes(b) || darkerChain(ctx, b, 2).includes(a)) return true;
  if (ctx.recipe.shade) return false;
  return Object.values(ctx.recipe.materials).some(m => m.ramp.includes(a) && m.ramp.includes(b));
}

function settleOne(ctx: Ctx, rec: Footed, st: SettleStep, salt0: number, owners: Owners): void {
  const { W, H } = ctx, L = ctx.layer(rec.layer), g = ctx.ground, onGround = rec.layer === 'ground';
  const geo = geometry(ctx, rec, L, owners);
  if (!geo) return;
  const { own, x0, x1, y0 } = geo;
  let y1 = geo.y1;
  const salt = salt0 + (Math.imul(x0, 73) + Math.imul(y1, 151)) % 9973;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const isOwn = (x: number, y: number) => ok(x, y) && own.has(y * W + x);
  const hgt = y1 - y0 + 1, cx = (x0 + x1) / 2, half = Math.max(1, (x1 - x0 + 1) / 2);

  // the water around: the materials, and the layers that can hold it over the ground
  const wetO = st.wet === false ? null : st.wet ?? {};
  const waterMats = new Set(wetO?.materials ?? Object.entries(ctx.recipe.materials).filter(([, m]) => m.texture === 'water').map(([k]) => k));
  const waterCols = new Set<string>();
  for (const k of waterMats) for (const c of ctx.recipe.materials[k]?.ramp ?? []) waterCols.add(c);
  const waterLayers = (wetO?.layers ?? []).map(n => ctx.layers[n]).filter((l): l is Layer => !!l);
  /** The layer the water of this px is on (null: no water there). */
  const waterAt = (x: number, y: number): Layer | null => {
    if (!ok(x, y) || isOwn(x, y)) return null;
    for (const wl of waterLayers) { const c = wl.get(x, y); if (c !== null && waterCols.has(c)) return wl; }
    return waterMats.has(ctx.kindAt(x, y)) ? g : null;
  };
  const grassMats = new Set(Object.entries(ctx.recipe.materials).filter(([, m]) => m.texture === 'patches').map(([k]) => k));

  // ground: a px of a ground material that is no thing (not this one, not another with a foot, not a stamp); on a
  // layer, its px there is empty too. Only ground is mirrored up over a sunk foot and only on ground do blades root
  const isGround = (x: number, y: number) => {
    if (!ok(x, y) || isOwn(x, y) || !ctx.kindAt(x, y)) return false;
    const k = y * W + x;
    if (otherThing(ctx, owners, rec, 'ground', k)) return false;
    return onGround || (L.get(x, y) === null || !otherThing(ctx, owners, rec, rec.layer, k));
  };

  // ---- 1. sink: the ground line across the foot, bitten; under it the ground comes back
  // 1 px for a small thing, 2 for most, 3 only for a big one (a slender lamp keeps the plinth it was drawn with)
  let sink = st.sink ?? (rec.kind === 'building' || hgt < 12 ? 1 : hgt >= 24 && x1 - x0 + 1 >= 20 ? 3 : 2);
  // a straight built base (a crate, a barrel: most of its columns end on its lowest row) sinks level, never bitten
  const cols0 = [...geo.bottom.values()];
  const straight = cols0.filter(b => b === y1).length >= 0.8 * cols0.length;
  // legs (the lowest rows split in runs: a brazier, a bench) sink a third of their height at most, level too
  let legs = 0;
  for (let y = y1; y >= y0; y--) {
    let runs = 0;
    for (let x = x0; x <= x1; x++) if (isOwn(x, y) && !isOwn(x - 1, y)) runs++;
    if (runs < 2) break;
    legs++;
  }
  // never more than a third of the thing (a log three px high keeps two)
  sink = Math.min(sink, Math.max(1, Math.floor((legs || hgt) / 3)));
  const level = straight || legs > 0;
  // the line meanders a px up and down in runs a few px long: never teeth (a small rock on teeth reads as a table)
  const bite = (x: number) => level ? 0 : Math.max(-1, Math.min(1, Math.round((fbm(x / 5, 0.5, salt, 2) - 0.5) * 2.6)));
  const cut = (x: number) => y1 - Math.min(Math.max(0, sink - bite(x)), Math.max(1, Math.floor(hgt / 3)));
  if (sink > 0) {
    // the foot stays where it stands on another thing (a trunk in front, a post, the top of a gravestone): only a
    // column whose foot is on ground goes into it
    const onThing = new Set<number>();
    for (const [x, b] of geo.bottom) if (!isGround(x, b + 1)) onThing.add(x);
    const stamped = STAMPED.get(ctx)?.get(rec.layer);
    for (const i of [...own]) {
      const x = i % W, y = Math.floor(i / W);
      if (y <= cut(x) || onThing.has(x)) continue;
      const b = geo.bottom.get(x)!;
      // the ground just under the foot, mirrored up over what sank (its texture and its shadow go on up), and the
      // water a layer holds there (a pond the game fills: the water closes over the foot too). Only ground: when
      // there is none near, the px stays the thing
      let sx = -1, sy = -1;
      for (let k = 1; k <= 8 && sx < 0; k++) {
        const yy = b + (b - y) + k;
        if (isGround(x, yy)) { sx = x; sy = yy; }
      }
      for (let d = 1; d <= 6 && sx < 0; d++) for (const xx of [x - d, x + d]) {
        if (sx < 0 && isGround(xx, y)) { sx = xx; sy = y; }
      }
      if (sx < 0) continue;
      own.delete(i);
      rec.px.delete(i);
      stamped?.delete(i);
      if (!onGround) { L.set(x, y, null); continue; }
      g.set(x, y, g.get(sx, sy)); ctx.setKind(x, y, ctx.kindAt(sx, sy));
      for (const wl of waterLayers) wl.set(x, y, wl.get(sx, sy));
      unblock(ctx, x, y);
      standing(ctx).delete(`${x},${y}`);
    }
    if (own.size < 2) return;
    y1 = Math.max(...[...own].map(i => Math.floor(i / W)));
  }
  const bottomNow = new Map<number, number>();
  for (const i of own) { const x = i % W, y = Math.floor(i / W); if ((bottomNow.get(x) ?? -1) < y) bottomNow.set(x, y); }
  const hNow = y1 - y0 + 1;
  // the foot: the columns that end on its lowest row (a px of curve allowed) on ground. A tassel, a handle or the
  // belly of a brazier between its legs end higher: no blade, no wet band, no reflection under them
  // (as drawn, before it sank: once sunk, a tassel can end as low as the foot)
  const foot = new Map([...bottomNow].filter(([x, b]) => geo.bottom.get(x)! >= geo.y1 - 1 && (isGround(x, b + 1) || !!waterAt(x, b + 1))));

  // the colors of the thing, dark to light, and its deepest tone that is not ink
  const cols = [...new Set([...own].map(i => L.px[i]!))].sort((a, b) => lum(ctx, a) - lum(ctx, b));
  const body = cols.filter(c => !rec.ink.has(c));
  const deep = body[0];
  const set = (wl: Layer, x: number, y: number, c: string) => { wl.set(x, y, c); if (wl === L) rec.px.set(y * W + x, c); };

  // ---- 2. no ink along the foot: the lower quarter of the outline takes the deepest tone of the material just above
  // it in its column (inward when that is ink too: the curve of its side), never of the whole thing (the red of a
  // lantern would paint the foot of its post). On legs only the legs, and only under their material: their sides
  // stay ink (a leg without its outline is a smear), and the belly over them keeps its own
  if (st.ink !== false && rec.ink.size && deep) {
    const yq = Math.max(y0 + 0.75 * hNow, legs ? geo.y1 - legs + 1 : -Infinity), bodySet = new Set(body);
    const tone = (x: number, y: number): string | null => {
      let a: string | null = null;
      if (isOwn(x, y - 1) && !rec.ink.has(L.get(x, y - 1)!)) a = L.get(x, y - 1);
      const step = x < cx ? 1 : -1;
      for (let d = 1; d <= 3 && !a && !legs; d++) {
        if (!isOwn(x + step * d, y)) break;
        const c = L.get(x + step * d, y)!;
        if (!rec.ink.has(c)) a = c;
      }
      if (!a) return null;
      const fam = [a, ...darkerChain(ctx, a)].filter(c => bodySet.has(c));
      return fam.sort((p, q) => lum(ctx, p) - lum(ctx, q))[0] ?? a;
    };
    const turn: [number, number, string][] = [];
    for (const i of own) {
      const x = i % W, y = Math.floor(i / W), c = L.px[i]!;
      if (y < yq || !rec.ink.has(c)) continue;
      if (isOwn(x - 1, y) && isOwn(x + 1, y) && isOwn(x, y - 1) && isOwn(x, y + 1)) continue;
      // what faces the ground (nothing of it below) always; what faces the sides, less toward the sides and up
      const ws = 1 - ((x + 0.5 - (cx + 0.5)) / (half + 0.5)) ** 2, wr = (y - yq) / Math.max(1, y1 - yq);
      if (!isOwn(x, y + 1) || ws * (0.4 + 0.6 * wr) > 0.3 + 0.2 * (h2(x, y, salt + 1) - 0.5)) {
        const c2 = tone(x, y);
        if (c2) turn.push([x, y, c2]);
      }
    }
    for (const [x, y, c2] of turn) set(L, x, y, c2);
  }

  // the ground around the foot: a band below and at the sides (what the ring, the tufts and the context read)
  const around: [number, number][] = [];
  for (const [x, b] of foot) for (let dy = 1; dy <= 3; dy++) if (ok(x, b + dy) && !isOwn(x, b + dy)) around.push([x, b + dy]);
  for (let y = Math.max(y0, y1 - 2); y <= y1; y++) for (const x of [x0 - 1, x0 - 2, x1 + 1, x1 + 2]) if (ok(x, y) && !isOwn(x, y)) around.push([x, y]);
  const share = (f: (x: number, y: number) => boolean) => around.length ? around.filter(([x, y]) => f(x, y)).length / around.length : 0;
  const near = wetO?.near ?? 2;
  let water: Layer | null = null;
  if (wetO) {
    for (const [x, b] of foot) {
      for (let dy = 0; dy <= near && !water; dy++) for (let dx = -near; dx <= near && !water; dx++) {
        if (Math.abs(dx) + dy <= near + 1) water = waterAt(x + dx, b + dy);
      }
      if (water) break;
    }
  }
  const grassShare = share((x, y) => grassMats.has(ctx.kindAt(x, y)));

  // ---- 3. the occlusion ring: a tone down the ground at the foot, wider below than at the sides, frayed
  if (st.ring !== false) {
    const r = st.ring ?? {}, tones = r.tones ?? 1, below = r.below ?? (hNow >= 18 ? 3 : 2), side = r.side ?? 1, fray = r.fray ?? 0.4;
    const low = y1 - Math.max(2, Math.round(hNow * 0.3));
    const best = new Map<number, number>();
    for (const i of own) {
      const ox = i % W, oy = Math.floor(i / W);
      if (oy < low) continue;
      for (let dy = -1; dy <= Math.ceil(below); dy++) for (let dx = -Math.ceil(side); dx <= Math.ceil(side); dx++) {
        const x = ox + dx, y = oy + dy;
        if (!ok(x, y) || isOwn(x, y) || (dy < 0 && dx === 0)) continue;
        const e = (dx / (side + 0.5)) ** 2 + (Math.max(0, dy) / (below + 0.5)) ** 2;
        if (e > 1) continue;
        const k = y * W + x;
        if (e < (best.get(k) ?? 2)) best.set(k, e);
      }
    }
    for (const [k, e] of best) {
      const x = k % W, y = Math.floor(k / W), kind = ctx.kindAt(x, y);
      if (!kind || waterMats.has(kind) || waterAt(x, y)) continue;
      if (rec.px.has(k) || otherThing(ctx, owners, rec, 'ground', k)) continue;   // never on another thing (a stone touching it)
      if (e > 0.35 && fbm(x / 2.5, y / 2.5, salt + 2, 2) < fray) continue;
      let c = g.get(x, y);
      for (let t = 0; t < tones; t++) c = ctx.shade(c, kind);
      g.set(x, y, c);
    }
  }

  // ---- 4. blades of the grass around over the edge of the foot (or pebbles on earth)
  if (st.tufts !== false && !water) {
    const tf = st.tufts ?? {}, density = tf.density ?? 1;
    const width = x1 - x0 + 1, slots = Math.round((width / 5) * density * Math.min(1, grassShare * 1.25));
    const xs = [...foot.keys()].sort((a, b) => a - b);
    const taken: number[] = [];
    for (let n = 0, tries = 0; xs.length && n < slots && tries < slots * 6; tries++) {
      // toward the ends of the foot, where the ground meets the sides (a blade in the middle of a small rock reads as a hole)
      const u = h2(tries, 3, salt + 3), f = u < 0.5 ? 0.42 * Math.sqrt(u * 2) : 1 - 0.42 * Math.sqrt((1 - u) * 2);
      const x = xs[Math.min(xs.length - 1, Math.floor((u < 0.5 ? f : f) * xs.length))];
      if (taken.some(t => Math.abs(t - x) < 3)) continue;
      const root = foot.get(x)! + 1, kind = ctx.kindAt(x, root);
      if (!grassMats.has(kind) || !isGround(x, root)) continue;
      const ramp = ctx.mat(kind).ramp, top = ramp.length - 1, b = ctx.base(kind);
      const i0 = ramp.indexOf(g.get(x, root) ?? ''), tt = i0 >= 0 ? i0 : b;
      const stem = ramp[Math.min(top, Math.max(b, tt + 1))], tip = ramp[Math.min(top, Math.max(b + 1, tt + 2))];
      const tall = 2 + (hNow >= 18 && h2(x, root, salt + 4) < 0.4 ? 1 : 0), lean = x < cx ? -1 : 1;
      // the blade stands on the ground at the foot and goes up over the thing, lighter than both where it crosses it
      const blade: [number, number, string][] = [[x, root, stem], [x, root - 1, tip]];
      if (tall > 2) blade.push([x + lean, root - 2, tip]);
      if (h2(x, root, salt + 6) < 0.35) blade.push([x - lean, root, stem]);
      for (const [bx, by, c] of blade) {
        if (!ok(bx, by)) continue;
        // over a straight built base (a crate) a blade grows beside it, not over its edge (it would read as a bite)
        if (isOwn(bx, by)) { if (!straight) { L.set(bx, by, c); own.delete(by * W + bx); rec.px.delete(by * W + bx); } }
        else if (grassMats.has(ctx.kindAt(bx, by)) && isGround(bx, by)) g.set(bx, by, c);
      }
      taken.push(x); n++;
    }
    if (tf.pebbles !== false && grassShare < 0.3 && xs.length) {
      const pebbles = Math.round(width / 8);
      for (let n = 0; n < pebbles; n++) {
        const x = xs[Math.floor(h2(n, 7, salt + 7) * xs.length)], y = foot.get(x)! + 1 + (h2(n, 8, salt + 7) < 0.5 ? 1 : 0);
        const kind = ctx.kindAt(x, y);
        if (!kind || waterMats.has(kind) || !isGround(x, y)) continue;
        const ramp = ctx.mat(kind).ramp, i0 = ramp.indexOf(g.get(x, y) ?? '');
        if (i0 < 0) continue;
        g.set(x, y, ramp[Math.min(ramp.length - 1, i0 + 1)]);
        if (isGround(x, y + 1) && ctx.kindAt(x, y + 1) === kind) g.set(x, y + 1, ctx.shade(g.get(x, y + 1), kind));
      }
    }
  }

  // ---- 5a. by water: a wet band up from the foot, foam where it meets the water, its reflection broken in the water
  if (water && wetO) {
    const rows = wetO.rows ?? (hNow < 10 ? 2 : 3), tones = wetO.tones ?? 2;
    // down its own material (the shade table, or its ramp), never into another color of the thing nor into its ink
    const darker = (c: string) => {
      if (rec.ink.has(c)) return c;
      const down = darkerChain(ctx, c, tones).filter(d => !rec.ink.has(d));
      return down[down.length - 1] ?? c;
    };
    const wl = water === g ? L : water;
    // only the foot gets wet, and only the material that touches the water (the tassel of a lantern stays dry)
    for (const i of own) {
      const x = i % W, y = Math.floor(i / W), b = foot.get(x);
      if (b === undefined) continue;
      const top = b - rows + 1 - Math.round((fbm(x / 2.5, 1.5, salt + 8, 2) - 0.5) * 2.4);
      const c = L.px[i]!, wetC = L.get(x, b)!;
      if (y < top || !sameMaterial(ctx, c, wetC)) continue;
      set(wl, x, y, darker(c));
    }
    // the water: where it is, its ramp (the material of the px on the ground; on a layer, the first water material)
    const ramp = (x: number, y: number) => {
      const k = ctx.kindAt(x, y);
      return ctx.mat(waterMats.has(k) ? k : [...waterMats][0]).ramp;
    };
    const mid = lum(ctx, cols[Math.floor(cols.length / 2)] ?? cols[0]);
    const reflect = wetO.reflect ?? 4;
    for (const [x, b] of foot) {
      let wy = -1;
      for (let dy = 1; dy <= near + 1; dy++) if (waterAt(x, b + dy) === water) { wy = b + dy; break; }
      if (wy < 0) continue;
      // foam: under the foot only (not up its sides, where it would read as a halo), broken, never at its ends
      if (wetO.foam !== false && wy === b + 1 && x > x0 && x < x1 && h2(x, wy, salt + 9) > 0.3) {
        const rp = ramp(x, wy);
        water.set(x, wy, rp[Math.max(0, rp.length - 2)]);
      }
      for (let k = 0; k < reflect; k++) {
        const ty = wy + 1 + k;
        if (waterAt(x, ty) !== water) break;
        if ((x + ty) & 1) continue;                                         // dithered
        if (h2(x, ty, salt + 10) < 0.06 + 0.12 * k) continue;               // broken, more the deeper
        const sx = k === 0 ? x : x + (h2(ty, 0, salt + 11) < 0.3 ? -1 : h2(ty, 0, salt + 11) > 0.75 ? 1 : 0);
        const src = isOwn(sx, b - k) ? L.get(sx, b - k) : null;
        if (src === null) continue;
        const rp = ramp(x, ty), now = water.get(x, ty), i0 = now === null ? -1 : rp.indexOf(now);
        if (i0 < 0) continue;
        water.set(x, ty, rp[Math.max(0, i0 - (lum(ctx, src) < mid ? 2 : 1))]);
      }
    }
  }

  // ---- 5b. by shaded grass: moss on the side away from the sun. Its foot is in the shade when the grass on the side
  // toward the light is (its own pool falls the other way: it does not count)
  if (st.moss && !water && rec.kind !== 'building') {
    const mo = st.moss === true ? {} : st.moss;
    const [lx, ly] = ctx.sun ? (ctx.sun.source ? [cx - ctx.sun.source.x, y1 - ctx.sun.source.y] : ctx.sun.lean) : ctx.dir;
    const lit: [number, number][] = [];
    const sx0 = lx >= 0 ? x0 - 8 : x1 + 3;
    for (let y = y1 - 3; y <= y1 + 2; y++) for (let x = sx0; x <= sx0 + 5; x++) if (ok(x, y) && !isOwn(x, y)) lit.push([x, y]);
    const grassAt = lit.map(([x, y]) => ctx.kindAt(x, y)).find(k => grassMats.has(k));
    // in the sun's shadow; with no sun, two tones under the base of the grass (one under is only its texture)
    const shadedAt = (x: number, y: number) => {
      const k = ctx.kindAt(x, y);
      if (!grassMats.has(k)) return false;
      if (ctx.sun) return sunShaded(ctx, x, y);
      const i = ctx.mat(k).ramp.indexOf(g.get(x, y) ?? '');
      return i >= 0 && i <= ctx.base(k) - 2;
    };
    const shaded = lit.length ? lit.filter(([x, y]) => shadedAt(x, y)).length / lit.length : 0;
    const grassy = lit.length ? lit.filter(([x, y]) => grassMats.has(ctx.kindAt(x, y))).length / lit.length : 0;
    if (grassAt && grassy >= 0.5 && shaded >= (mo.shade ?? 0.5)) {
      const gr = ctx.mat(grassAt).ramp, b = ctx.base(grassAt), at = (i: number) => gr[Math.max(0, Math.min(gr.length - 1, i))];
      const mc = mo.colors ?? [at(b - 2), at(b - 1), at(b)];
      const ln = Math.hypot(lx, ly) || 1, cy = (y0 + y1) / 2, ry = Math.max(1, hNow / 2);
      const scored: [number, number][] = [];
      for (const i of own) {
        const c = L.px[i]!;
        const x = i % W, y = Math.floor(i / W);
        if (rec.ink.has(c) || y > y1 - 2) continue;   // never down on the ground, where it would read as the grass
        const away = (((x - cx) / half) * lx + ((y - cy) / ry) * ly) / ln;   // 1: the side the shadow falls to
        scored.push([i, fbm(x / 5, y / 4, salt + 12, 2) + 0.7 * away]);
      }
      if (scored.length) {
        const sorted = scored.map(q => q[1]).sort((a, b2) => b2 - a);
        const thr = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (mo.odds ?? 0.14)))];
        const mossy = new Set(scored.filter(q => q[1] >= thr).map(q => q[0]));
        // in patches, never a px alone
        const keep = [...mossy].filter(i => [1, -1, W, -W].filter(d => mossy.has(i + d)).length >= 2);
        const lo = lum(ctx, cols[0]), hi = lum(ctx, cols[cols.length - 1]);
        for (const i of keep) {
          const f = (lum(ctx, L.px[i]!) - lo) / Math.max(1e-6, hi - lo);
          set(L, i % W, Math.floor(i / W), mc[Math.min(mc.length - 1, Math.floor(f * mc.length))]);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ the lint: stamps closed by ink below

export interface ClosedInk { closed: number; total: number; ids: string[] }
const CLOSED = new WeakMap<PaintedMap, ClosedInk>();

/**
 * The stamps that stand whose base is all ink, as painted: every px of the lowest row of the stamp (its feet) is ink.
 * Measured once the map is painted, on the px that are still the stamp's. Not a flat thing (4 px high or less: a log
 * is all outline), not a base whose tone is the thing's own (one that does not close its top too is no outline but
 * the shaded side of its material), and not a foot hidden behind a thing in front (its lowest row under a third of it).
 */
export function measureClosedInk(ctx: Ctx, map: PaintedMap): void {
  const W = ctx.W, out: ClosedInk = { closed: 0, total: 0, ids: [] };
  for (const rec of footedOf(ctx)) {
    if (rec.kind !== 'stamp') continue;
    const L = ctx.layers[rec.layer];
    const own = [...rec.px].filter(([i, c]) => L?.px[i] === c);
    const ys = own.map(([i]) => Math.floor(i / W)), yb = Math.max(...ys), yt = Math.min(...ys);
    if (own.length >= 2 && yb - yt + 1 <= 4) continue;
    out.total++;
    if (own.length < 2 || !rec.ink.size) continue;
    const row = own.filter(([i]) => Math.floor(i / W) === yb);
    const top = new Set(own.filter(([i]) => Math.floor(i / W) === yt).map(([, c]) => c));
    // a foot hidden behind what was laid in front of it (its lowest row a px or two of its side) is no base
    const xs = own.map(([i]) => i % W), wide = Math.max(...xs) - Math.min(...xs) + 1;
    if (row.length >= Math.max(2, wide / 3) && row.every(([, c]) => rec.ink.has(c) && top.has(c))) {
      out.closed++;
      if (out.ids.length < 8) out.ids.push(`${rec.id ?? rec.from} at ${row[0][0] % W},${yb}`);
    }
  }
  CLOSED.set(map, out);
}

/** The closed-ink measure of a painted map (null when nothing was measured). */
export function closedInkOf(map: PaintedMap): ClosedInk | null { return CLOSED.get(map) ?? null; }
