// A river bank: wavy lines across the map (the shores) that shapes and steps
// read by name; the wood in silhouette around the map, kept off the river; a
// sand beach with the wet sand by the water, the lip of the grass and shells;
// a mud bank under the far shore; footpaths of trodden earth (sand where they
// cross the beach); a pier of planks on pilings with its shadow on the water;
// reeds stalk by stalk (the tips sway, those in the water stand in front of
// people); rocks with their shadow; ovals and bands of shade; tufts and
// flowers by their own draws; glints and streaks of current; a dry ditch with
// stone lips; a dry pond of cracked mud with a stone rim and a walk of slabs
// across; Voronoi slabs; and the water that comes back to the ditch and the
// pond, on a layer of its own. Port of the river script of The Unwritten Dao
// (scripts/suelo_embarcadero.py): same numbers, same pixels.

import { Mask, catmull, clean, distanceIn, fbm, h2, n1, organic, pyRound, ribbon, type Pt } from '../mapnoise';
import { paintClumps, stone, stoneRoles, type Clump, type Ctx } from '../mappaint';
import type {
  BeachStep, ClaypanStep, DitchStep, FloodwaterStep, FootpathStep, LinesStep, MeadowStep, MudbankStep, PierStep,
  ReedsStep, RocksStep, ShimmerStep, SlabsStep, UmbraStep, WildwoodStep,
} from './riverbankschema';
import { registerFooted } from './settle';
import { block as sunBlock, castColumn, castOval, shade as sunShade, sunOn, thrown } from './sun';

type Wave = [number, number, number];
const waved = (base: number, waves: Wave[], t: number) => { let e = base; for (const [a, p, s] of waves) e += a * n1(t / p, s); return e; };
const scaled = (base: number, waves: Wave[], t: number) => { let e = base; for (const [a, f, s] of waves) e += a * n1(t * f, s); return e; };

// ------------------------------------------------------------------ lines

interface Line { at: number; waves: Wave[]; sines?: Wave[]; slope?: [number, number] }
const LINES = new WeakMap<Ctx, Map<string, Line>>();

export function runLines(ctx: Ctx, st: LinesStep): void {
  let m = LINES.get(ctx);
  if (!m) { m = new Map(); LINES.set(ctx, m); }
  for (const [name, l] of Object.entries(st.lines)) m.set(name, { at: l.at, waves: l.waves as Wave[], sines: l.sines as Wave[] | undefined, slope: l.slope });
}

/** A line of a lines step: its row (px) at each x. */
export function lineY(ctx: Ctx, name: string): (x: number) => number {
  const l = LINES.get(ctx)?.get(name);
  if (!l) throw new Error(`map: no line "${name}" (a lines step before it names it)`);
  const base = ctx.oy + l.at * ctx.cell;
  const { sines, slope } = l;
  if (!sines && !slope) return (x) => waved(base, l.waves, x);
  const from = slope ? ctx.P(slope[0], 0)[0] : 0;
  return (x) => {
    let e = waved(base, l.waves, x);
    for (const [a, p, ph] of sines ?? []) e += a * Math.sin(x / p + ph);
    if (slope) e += Math.max(0.0, x - from) * slope[1];
    return e;
  };
}

/** The px between two lines (top inclusive, bottom exclusive); null = the picture side. */
export function betweenMask(ctx: Ctx, between: [string | null, string | null]): Mask {
  const m = new Mask(ctx.W, ctx.H);
  const top = between[0] === null ? null : lineY(ctx, between[0]), bot = between[1] === null ? null : lineY(ctx, between[1]);
  for (let y = 0; y < ctx.H; y++) for (let x = 0; x < ctx.W; x++) {
    if ((top === null || top(x) <= y) && (bot === null || y < bot(x))) m.set(x, y);
  }
  return m;
}

// ------------------------------------------------------------------ the wood around

export function runWildwood(ctx: Ctx, st: WildwoodStep): void {
  const { W, H, ox, oy, mw, mh } = ctx, g = ctx.ground, name = st.material;
  const from = st.clear?.from ? { y: lineY(ctx, st.clear.from[0]), px: st.clear.from[1] } : null;
  const to = st.clear?.to ? { y: lineY(ctx, st.clear.to[0]), px: st.clear.to[1] } : null;
  const bot = st.bottom, botLine = bot?.line ? lineY(ctx, bot.line) : null;
  const top = st.top, left = st.left, right = st.right;
  const keep = (x: number, y: number): number | null => {
    if (st.clear) {
      const lo = from ? from.y(x) + from.px : -Infinity, hi = to ? to.y(x) + to.px : Infinity;
      if (lo < y && y < hi) return null;
    }
    if (bot) {
      const far = waved((botLine ? botLine(x) : oy + mh) + bot.at, bot.waves as Wave[], x);
      if (y > far) return y - far + bot.depth;
    }
    if (top && y < waved(oy + top.at, top.waves as Wave[], x) && (!top.gap || Math.abs(x - ctx.P(top.gap[0], 0)[0]) > top.gap[1])) return oy - y + top.depth;
    if (left) { const e = waved(ox + left.at, left.waves as Wave[], y); if (x < e) return e - x; }
    if (right) { const e = waved(ox + mw + right.at, right.waves as Wave[], y); if (x > e) return x - e; }
    return null;
  };
  const salt = st.salt, [ra, rb, cap, rc] = st.radius ?? [6, 0.25, 60, 4];
  const [nearD, nearR] = st.near ?? [9, 8], [d1, d2] = st.depths ?? [9, 24];
  const seeds: [number, number, number][] = [], clumps: Clump[] = [];
  for (let k = 0; k < (st.tries ?? 4000); k++) {
    const x = h2(k, 1, salt) * W, y = h2(k, 2, salt) * H;
    const dd = keep(x, y);
    if (dd === null || dd < 1) continue;
    const r = ra + Math.min(dd, cap) * rb + h2(k, 3, salt) * rc;
    if (seeds.some(([a, b, rs]) => (x - a) ** 2 + (y - b) ** 2 < (0.8 * Math.min(r, rs)) ** 2)) continue;
    seeds.push([x, y, r]);
    clumps.push([x, y, dd < nearD ? Math.min(r, nearR) : r, st.ramps[dd < d1 ? 0 : dd < d2 ? 1 : 2]]);
  }
  clumps.sort((p, q) => p[1] - q[1]);
  const painted = paintClumps(W, H, clumps, salt + 5), fill = st.fill ?? 'túnica noche';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dd = keep(x + 0.5, y + 0.5);
    if (dd === null) continue;
    const c = painted.get(y * W + x);
    if (c !== undefined) g.set(x, y, c);
    else if (dd >= 1) g.set(x, y, fill);
    else continue;
    ctx.setKind(x, y, name);
  }
}

// ------------------------------------------------------------------ the beach and the mud bank

export function runBeach(ctx: Ctx, st: BeachStep): void {
  const { W, H } = ctx, g = ctx.ground;
  const top = lineY(ctx, st.between[0]), wat = lineY(ctx, st.between[1]);
  const sand = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (top(x) <= y && y < wat(x)) sand.set(x, y);
  ctx.masks.set(st.id ?? 'beach', sand);
  const [nx, ny, nSalt] = st.noise ?? [6, 4, 1121];
  const bands = st.bands ?? [[2.5, -1, 'tierra', 'tierra'], [5, 0.45, 'madera clara', 'tierra'], [null, 0.40, 'arena', 'madera clara']];
  const [lipPx, lipSalt, lipOdds, lipA, lipB] = st.lip ?? [1.2, 1122, 0.6, 'hoja sombra', 'vida sombra'];
  const [spSalt, spOdds, spPx, spColor] = st.specks ?? [1123, 0.02, 4, 'piedra'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!sand.has(x, y)) continue;
    ctx.setKind(x, y, st.material);
    const wd = wat(x) - y, v = fbm(x / nx, y / ny, nSalt, 3);
    const band = bands.find(([px]) => px === null || wd < px)!;
    let c = v > band[1] ? band[2] : band[3];
    if (y - top(x) < lipPx) c = h2(x, 0, lipSalt) < lipOdds ? lipA : lipB;
    if (h2(x, y, spSalt) < spOdds && wd > spPx) c = spColor;
    g.set(x, y, c);
  }
  const sh = st.shells;
  if (sh) for (let k = 0; k < sh.count; k++) {
    const x = Math.trunc(h2(k, 1, sh.salt) * W), y = Math.trunc(h2(k, 2, sh.salt) * H);
    if (x + 1 < W && y + 1 < H && sand.has(x, y) && sand.has(x + 1, y + 1) && wat(x) - y > sh.clear) {
      g.set(x, y, h2(k, 3, sh.salt) < sh.colors[0] ? sh.colors[1] : sh.colors[2]);
      g.set(x + 1, y + 1, sh.shadow);
    }
  }
}

export function runMudbank(ctx: Ctx, st: MudbankStep): void {
  const { W, H } = ctx, g = ctx.ground, line = lineY(ctx, st.below), skip = new Set(st.skip ?? []);
  const [px, more, per, row, salt] = st.depth;
  const [nx, ny, nSalt, above, hi, lo] = st.noise;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (skip.has(ctx.kindAt(x, y))) continue;
    const b = y - line(x);
    if (!(0 <= b && b < px + more * fbm(x / per, row, salt, 2))) continue;
    ctx.setKind(x, y, st.material);
    g.set(x, y, st.bands.find(([d]) => b < d)?.[1] ?? (fbm(x / nx, y / ny, nSalt, 2) > above ? hi : lo));
  }
}

// ------------------------------------------------------------------ footpaths

export function runFootpath(ctx: Ctx, st: FootpathStep, idx: number): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material;
  const mask = new Mask(W, H), dcen = new Float64Array(W * H).fill(99);
  for (const part of st.parts) {
    if ('points' in part) {
      const curve = catmull(part.points.map(([u, v]) => ctx.P(u, v)));
      const [w0, w1] = part.width, s = part.salt;
      ribbon(mask, curve, (i) => Math.max(2.4, w0 + w1 * n1(i / 30.0, s) + 0.5 * n1(i / 8.0, s + 1)));
      for (let i = 0; i < curve.length; i += 2) {
        const [cx, cy] = curve[i];
        for (let y = Math.trunc(cy - 9); y < Math.trunc(cy + 10); y++) for (let x = Math.trunc(cx - 9); x < Math.trunc(cx + 10); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dd < dcen[y * W + x]) dcen[y * W + x] = dd;
        }
      }
    } else {
      const [u, v, rx, ry, salt, wob] = part.blob, [cx, cy] = ctx.P(u, v);
      for (const [x, y] of organic(W, H, cx, cy, rx, ry, salt, wob)) mask.set(x, y);
    }
  }
  const av = st.avoid;
  if (av) {
    const kinds = new Set(av.kinds ?? []), river = av.between ? betweenMask(ctx, av.between) : null;
    const row = av.rows ? ctx.P(0, av.rows[0])[1] : 0;
    for (let i = 0; i < W * H; i++) {
      if (!mask.data[i]) continue;
      const y = Math.floor(i / W);
      if ((river && river.data[i]) || (kinds.has(ctx.kind[i]) && (!av.rows || Math.abs(y - row) > av.rows[1]))) mask.data[i] = 0;
    }
  }
  clean(mask);
  const dpath = distanceIn(mask), b = ctx.base(name), t = (i: number) => ctx.tone(name, i), salt = st.salt;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    ctx.setKind(x, y, name);
    const d = dpath[y * W + x];
    const kOut = !mask.has(x - 1, y - 1) ? 1 : !mask.has(x - 2, y - 2) ? 2 : null;
    let c: string;
    if (d === 1) c = kOut === 1 ? t(b - 2) : t(b - 1);
    else if (kOut !== null) c = t(b - 1);
    else {
      const v = fbm(x / 5.5, y / 4.5, salt, 3);
      c = v < 0.40 ? t(b) : v > 0.66 ? t(b + 2) : t(b + 1);
      if (h2(x, y, salt + 1) < 0.03) c = t(b - 1);
      const dc = dcen[y * W + x];
      if (dc >= 2.5 && dc < 3.5 && fbm(x / 3.0, y / 5.0, salt + 2, 2) > 0.5 && c !== t(b + 2)) c = c === t(b) ? t(b - 1) : t(b);
    }
    g.set(x, y, c);
  }
  if (st.lip) {
    const [grass, color] = st.lip;
    for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
      if (ctx.kindAt(x, y) === grass && (ctx.kindAt(x, y - 1) === name || ctx.kindAt(x - 1, y) === name)) g.set(x, y, color);
    }
  }
  if (st.over) {
    const o = st.over, other = ctx.masks.get(o.mask);
    if (!other) throw new Error(`map: footpath: no mask "${o.mask}" before it`);
    const [s, odds, a, c2] = o.pick;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask.has(x, y) || !other.has(x, y)) continue;
      ctx.setKind(x, y, o.material);
      const c = g.get(x, y);
      if (c !== null && o.colors.includes(c)) g.set(x, y, h2(x, y, s) < odds ? a : c2);
    }
  }
  ctx.masks.set(st.id ?? `footpath${idx}`, mask);
}

// ------------------------------------------------------------------ the pier

export function runPier(ctx: Ctx, st: PierStep): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const water = ctx.masks.get(st.water);
  if (!water) throw new Error(`map: pier: no mask "${st.water}" before it`);
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const x0 = Math.trunc(ctx.P(st.x[0], 0)[0]) + st.x[1], x1 = Math.trunc(ctx.P(st.x[2], 0)[0]) + st.x[3];
  const yAt = (s: PierStep['y'][0]) => typeof s === 'number' ? Math.trunc(ctx.P(0, s)[1]) : Math.trunc(lineY(ctx, s.line)(ctx.P(s.at, 0)[0]) + s.add);
  const y0 = yAt(st.y[0]), y1 = yAt(st.y[1]), salt = st.salt;
  // the planks across, their ends uneven, the joint of each in shadow
  const deck = new Set<number>();
  for (let y = y0, plank = 0; y < y1; y += 3, plank++) {
    const a = x0 + (h2(plank, 1, salt) < 0.35 ? 1 : 0) - (h2(plank, 2, salt) < 0.2 ? 1 : 0);
    const b = x1 - (h2(plank, 3, salt) < 0.35 ? 1 : 0) + (h2(plank, 4, salt) < 0.2 ? 1 : 0);
    const tone = [t(4), t(3), t(4), t(2)][Math.trunc(h2(plank, 5, salt) * 4)];
    for (let x = a; x <= b; x++) for (let j = 0; j < 3; j++) {
      if (y + j >= y1 || !ok(x, y + j)) continue;
      let c = j < 2 ? tone : t(1);
      if (j === 0 && x < a + 2) c = tone === t(4) ? t(5) : t(4);
      if (x === b) c = t(1);
      if (j < 2 && h2(Math.floor(x / 5), plank, salt + 1) < 0.15 && x % 5 === 2) c = t(1);
      g.set(x, y + j, c);
      ctx.setKind(x, y + j, name);
      deck.add((y + j) * W + x);
    }
  }
  const wet = (x: number, y: number) => ok(x, y) && water.has(x, y) && !deck.has(y * W + x);
  // the stringers and the posts are wood too: their px take the pier's material, so nothing of the water (the glints and
  // streaks of `shimmer`, its `skip`) is laid over them
  const was = new Map<number, string>();   // the water kind under a stringer, back if a ripple covers it
  if (st.stringers) for (let y = y0 + 2; y < y1 + 4; y++) for (const x of [x0 - 1, x1 + 1]) if (wet(x, y)) {
    g.set(x, y, Math.floor(y / 3) % 2 ? t(1) : t(0));
    was.set(y * W + x, ctx.kindAt(x, y));
    ctx.setKind(x, y, name);
  }
  const sun = ctx.sun !== null && ctx.sun !== undefined;
  const lift = st.height ?? 8;
  if (sun) {
    // the sun lays its shadow with every other one: the deck is a floor `height` px over the water, so each plank
    // throws where the sun puts that height (on the water, never on the deck); the posts stand from the water up
    sunOn(ctx, [ctx.kindAt(x0, y1 + 1) || st.water]);
    for (const i of deck) {
      const x = i % W, y = Math.floor(i / W);
      sunBlock(ctx, x, y);
      const [X, Y] = thrown(ctx, x, y, lift);
      if (wet(Math.round(X), Math.round(Y))) sunShade(ctx, X, Y);
    }
  }
  const sh = sun ? undefined : st.shadow;
  if (sh) for (let y = y0 + sh.rows[0]; y < y1 + sh.rows[1]; y++) for (let x = x1 + sh.from; x < x1 + sh.to; x++) {
    if (wet(x, y) && x - x1 < sh.width + (y % 3 === 0 ? 1 : 0)) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }
  if (st.under && !sun) for (let x = x0; x < x1 + 4; x++) for (let y = y1; y < y1 + st.under; y++) if (wet(x, y)) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  const [foam, ripple] = st.ripple ?? ['celeste luz', 'celeste'];
  for (const [[xs, dx], ys] of st.pilings ?? []) {
    const px = (xs === 'l' ? x0 : x1) + dx;
    const py = typeof ys === 'number' ? Math.trunc(ctx.P(0, ys)[1]) : (ys[0] === 't' ? y0 : ys[0] === 'b' ? y1 : Math.floor((y0 + y1) / 2)) + ys[1];
    for (let j = -6; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (!ok(px + i, py + j)) continue;
      g.set(px + i, py + j, i === 0 && j < 0 ? t(3) : j < 1 ? t(1) : t(0));
      ctx.setKind(px + i, py + j, name);
    }
    const piling: [number, number][] = [];
    for (let j = -6; j < 2; j++) for (let i = 0; i < 2; i++) if (ok(px + i, py + j)) piling.push([px + i, py + j]);
    registerFooted(ctx, 'pier', 'piling', piling, { ink: [] });
    if (sun) for (let i = 0; i < 2; i++) {
      for (let j = -6; j < 2; j++) sunBlock(ctx, px + i, py + j);
      castColumn(ctx, px + i, py + 1, lift, (X, Y) => !wet(X, Y));
    }
    for (let i = -1; i < 3; i++) if (wet(px + i, py + 2)) {
      g.set(px + i, py + 2, i === -1 || i === 2 ? foam : ripple);
      const k = was.get((py + 2) * W + px + i);
      if (k !== undefined) ctx.setKind(px + i, py + 2, k);
    }
  }
}

// ------------------------------------------------------------------ reeds

interface ReedOpts { front: boolean; tall: number; keep: ((x: number, y: number) => boolean) | null; tips: string; layer: string; mark: [Set<string>, string] | null }

function reedClump(ctx: Ctx, cx: number, foot: number, n: number, spread: number, seed: number, o: ReedOpts): void {
  const g = ctx.ground, tips = ctx.layer(o.tips), above = ctx.layer(o.layer);
  const ramp = ['hoja clara', 'bambú', 'hoja', 'hoja sombra'];
  for (let k = 0; k < n; k++) {
    const x = pyRound(cx + (h2(k, 1, seed) - 0.5) * 2 * spread);
    const y0 = pyRound(foot + h2(k, 2, seed) * 2);
    const hgt = Math.trunc((7 + h2(k, 3, seed) * 9) * o.tall);
    const lean = (h2(k, 4, seed) - 0.5) * 0.35;
    const col = ramp[Math.min(3, Math.trunc(h2(k, 5, seed) * 3) + (x > cx ? 1 : 0))];
    const cattail = h2(k, 6, seed) < 0.3 && hgt > 9;
    for (let i = 0; i < hgt; i++) {
      const X = x + pyRound(lean * i), Y = y0 - i;
      if (o.keep && !o.keep(X, Y)) break;
      if (X < 0 || Y < 0 || X >= ctx.W || Y >= ctx.H) break;
      let c = i > 1 ? col : 'hoja sombra';
      if (cattail && i >= hgt - 4) {
        c = i < hgt - 1 ? 'madera' : 'madera sombra';
        if (i === hgt - 4) c = 'madera clara';
      }
      const layer = o.front ? above : i >= hgt - 4 ? tips : g;
      layer.set(X, Y, c);
      if (!o.front && layer === g && o.mark && o.mark[0].has(ctx.kindAt(X, Y))) ctx.setKind(X, Y, o.mark[1]);
    }
    // a leaf that bends
    if (h2(k, 7, seed) < 0.5 && hgt > 8) {
      const side = h2(k, 8, seed) < 0.5 ? 1 : -1, sy = y0 - Math.floor(hgt / 2);
      for (let j = 0; j < 4; j++) {
        const X = x + side * (j + 1), Y = sy - 2 + j + (j > 1 ? 1 : 0);
        if (o.keep && !o.keep(X, Y)) break;
        (o.front ? above : tips).set(X, Y, j < 2 ? 'bambú' : 'hoja');
      }
    }
  }
}

export function runReeds(ctx: Ctx, st: ReedsStep): void {
  const not = st.not, lo = not ? ctx.P(not[0], 0)[0] : 0, hi = not ? ctx.P(not[1], 0)[0] : 0;
  const o: ReedOpts = {
    front: st.front ?? false, tall: st.tall ?? 1.0,
    keep: not ? (x) => !(lo <= x && x <= hi) : null,
    tips: st.tips ?? 'mechones', layer: st.layer ?? 'copas',
    mark: st.mark ? [new Set(st.mark[0]), st.mark[1]] : null,
  };
  const line = st.line ? lineY(ctx, st.line) : null, shift = st.shift ?? 0;
  for (const [u, v, n, spread, salt] of st.clumps ?? []) {
    const cx = ctx.P(u + shift, 0)[0];
    reedClump(ctx, cx, line ? line(cx) + v : ctx.P(0, v)[1], n, spread, salt, o);
  }
  const r = st.rows;
  if (r) {
    const rl = lineY(ctx, r.line), [js, ja] = r.jitter;
    for (let k = 0; k < r.count; k++) {
      const u = r.start + k * r.step + (h2(k, 1, js) - 0.5) * ja;
      if ((r.skip ?? []).some(([a, b]) => a < u && u < b)) continue;
      const x = ctx.P(u, 0)[0];
      reedClump(ctx, x, rl(x) + r.foot[0] + h2(k, 2, js) * r.foot[1], r.stalks[0] + Math.trunc(h2(k, 3, js) * r.stalks[1]), r.spread, r.salt + k, o);
    }
  }
}

// ------------------------------------------------------------------ rocks and shade

function oval(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number, on: Set<string>, deep: boolean): void {
  const g = ctx.ground;
  if (ctx.sun) {
    // the sun lays it with every other shadow: one tone, never twice over
    sunOn(ctx, on);
    for (let y = Math.trunc(cy - ry * 1.3) - 1; y < Math.trunc(cy + ry * 1.3) + 2; y++) for (let x = Math.trunc(cx - rx * 1.3) - 1; x < Math.trunc(cx + rx * 1.3) + 2; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
      if (dx * dx + dy * dy <= (1 + 0.08 * Math.sin(a * 6 + seed)) ** 2) sunShade(ctx, x, y);
    }
    return;
  }
  for (let y = Math.trunc(cy - ry * 1.3) - 1; y < Math.trunc(cy + ry * 1.3) + 2; y++) {
    for (let x = Math.trunc(cx - rx * 1.3) - 1; x < Math.trunc(cx + rx * 1.3) + 2; x++) {
      if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H || !on.has(ctx.kindAt(x, y))) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
      if (dx * dx + dy * dy <= (1 + 0.08 * Math.sin(a * 6 + seed)) ** 2) {
        const k = ctx.kindAt(x, y), c = ctx.shade(g.get(x, y), k);
        g.set(x, y, deep ? ctx.shade(c, k) : c);
      }
    }
  }
}

export function runRocks(ctx: Ctx, st: RocksStep): void {
  const on = new Set(st.on), [sx, sy, srx, sry] = st.shadow ?? [0.5, 0.6, 1.1, 0.8];
  for (const r of st.at) {
    const [u, v, rx, ry, salt] = r, moss = r[5] ?? true, [cx, cy] = ctx.P(u, v);
    if (ctx.sun) { sunOn(ctx, on); castOval(ctx, cx, cy + ry * 0.3, rx * 1.05, ry * 0.75, 0, 1.6 * ry, salt); }
    else oval(ctx, cx + rx * sx, cy + ry * sy, rx * srx, ry * sry, salt, on, false);
    const pts = stone(ctx, st.material, cx, cy, rx, ry, salt, moss);
    registerFooted(ctx, 'rocks', 'stone', [...pts.keys()].map(i => [i % ctx.W, Math.floor(i / ctx.W)]), { ink: [stoneRoles(ctx, st.material).line] });
  }
}

export function runUmbra(ctx: Ctx, st: UmbraStep): void {
  const on = new Set(st.on), g = ctx.ground;
  for (const [u, v, rx, ry, salt] of st.ovals ?? []) { const [cx, cy] = ctx.P(u, v); oval(ctx, cx, cy, rx, ry, salt, on, st.deep ?? false); }
  for (const b of st.bands ?? []) {
    const ytop = ctx.P(0, b.rows[0])[1], [px, wv, per, salt] = b.top;
    for (let y = Math.trunc(ytop); y < Math.trunc(ctx.P(0, b.rows[1])[1]); y++) {
      for (let x = Math.trunc(ctx.P(b.x[0], 0)[0]); x < Math.trunc(ctx.P(b.x[1], 0)[0]); x++) {
        if (y < ytop + px + wv * n1(x / per, salt)) continue;
        const k = ctx.kindAt(x, y);
        if (ctx.sun) { sunOn(ctx, on); sunShade(ctx, x, y); } else if (on.has(k)) g.set(x, y, ctx.shade(g.get(x, y), k));
      }
    }
  }
}

// ------------------------------------------------------------------ tufts and flowers by their own draws

const SPRIGS = [['h...h', '.l.l.', '..l..'], ['h.h', 'l.l', '.l.'], ['.h.h.', 'hl.lh', '.l.l.']];

export function runMeadow(ctx: Ctx, st: MeadowStep): void {
  const { W, H } = ctx, g = ctx.ground, on = st.on, salt = st.salt;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  if (st.what === 'tufts') {
    const tips = ctx.layer(st.layer ?? 'mechones'), shapes = st.shapes ?? SPRIGS;
    const ramp = ctx.mat(on).ramp, top = ramp.length - 1, b = ctx.base(on);
    const below = st.odds_below ? ctx.P(0, st.odds_below[0])[1] : Infinity;
    const placed: Pt[] = [];
    for (let k = 0; k < st.count; k++) {
      const x = Math.trunc(h2(k, 1, salt) * W), y = Math.trunc(h2(k, 2, salt) * H);
      if (!ok(x, y) || ctx.kindAt(x, y) !== on) continue;
      if (st.odds !== undefined && !(h2(k, 9, salt) < (y > below ? st.odds_below![1] : st.odds))) continue;
      if (placed.some(([a, c]) => (x - a) ** 2 + (y - c) ** 2 < 100)) continue;
      const shape = shapes[Math.trunc(h2(k, 3, salt) * shapes.length)];
      const sh = shape.length, sw = shape[0].length, x0 = x - Math.floor(sw / 2), y0 = y - sh + 1;
      let fits = true;
      for (let j = 0; j < sh && fits; j++) for (let i = 0; i < sw; i++) {
        if (shape[j][i] !== '.' && !(ok(x0 + i, y0 + j) && ctx.kindAt(x0 + i, y0 + j) === on)) { fits = false; break; }
      }
      if (!fits) continue;
      const i0 = ramp.indexOf(g.get(x, y) ?? ''), tt = i0 >= 0 ? i0 : b;
      const lc = ramp[Math.min(top, Math.max(b, tt + 1))], hc = ramp[Math.min(top, Math.max(b + 1, tt + 2))];
      shape.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === 'l') g.set(x0 + i, y0 + j, lc);
        else if (ch === 'h') tips.set(x0 + i, y0 + j, hc);
      }));
      placed.push([x, y]);
    }
    return;
  }
  const cols = st.colors ?? [['túnica luz', 'pergamino'], ['flor clara', 'flor'], ['celeste luz', 'túnica luz']];
  for (let k = 0; k < st.count; k++) {
    const x = Math.trunc(h2(k, 1, salt) * W), y = Math.trunc(h2(k, 2, salt) * H);
    if (!(ok(x - 1, y - 1) && ok(x + 1, y + 1))) continue;
    let all = true;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) if (ctx.kindAt(x + i, y + j) !== on) all = false;
    if (!all) continue;
    const [a, c] = cols[Math.trunc(h2(k, 3, salt) * cols.length)];
    g.set(x, y, a);
    g.set(x + 1, y, c);
    g.set(x, y + 1, st.stem ?? 'hoja sombra');
  }
}

// ------------------------------------------------------------------ glints and current

export function runShimmer(ctx: Ctx, st: ShimmerStep): void {
  const { W, H } = ctx, g = ctx.ground, salt = st.salt;
  const mask = ctx.masks.get(st.water);
  if (!mask) throw new Error(`map: shimmer: no mask "${st.water}" before it`);
  const dist = distanceIn(mask), glints = ctx.layer(st.glints), flow = ctx.layer(st.flow);
  const skip = new Set(st.skip ?? []), sun = st.sun === undefined ? null : ctx.P(st.sun, 0)[0];
  const [bright, glint] = st.colors ?? ['ojo', 'celeste luz'];
  const ramp = ctx.mat(st.material).ramp, other = st.else ?? 'celeste';
  for (let k = 0; k < Math.trunc(W * H / 260); k++) {
    const x = Math.trunc(h2(k, 1, salt) * W), y = Math.trunc(h2(k, 2, salt) * H);
    if (!mask.has(x, y) || dist[y * W + x] < 3) continue;
    const sunny = sun === null || x < sun || h2(k, 3, salt) < 0.3;
    const n = 1 + Math.trunc(h2(k, 4, salt) * 3);
    for (let i = 0; i < n; i++) if (mask.has(x + i, y)) glints.set(x + i, y, sunny && i === 0 ? bright : glint);
  }
  for (let y = 0; y < H; y++) {
    if (h2(y, 0, salt + 1) >= 0.4) continue;
    for (let x = 0; x < W; x++) {
      if (!mask.has(x, y) || dist[y * W + x] < 6) continue;
      const i = ramp.indexOf(g.get(x, y) ?? '');
      flow.set(x, y, i >= 0 ? ramp[Math.min(ramp.length - 1, i + 1)] : other);
    }
  }
  if (skip.size) for (let i = 0; i < W * H; i++) if (skip.has(ctx.kind[i])) { glints.px[i] = null; flow.px[i] = null; }
}

// ------------------------------------------------------------------ slabs

interface VoronoiOpts { n: number; stretch?: number; salt: number; moss?: number; ramp?: [string, string, string]; joint?: string; moss_color?: string }

/** Laid slabs: each a Voronoi cell (stretched sideways), a lit lip up-left, a dark edge down-right, joints between. */
export function voronoiSlabs(ctx: Ctx, mask: Mask, name: string, o: VoronoiOpts): void {
  const { W, H } = ctx, g = ctx.ground, salt = o.salt, stretch = o.stretch ?? 1.6;
  const ramp = o.ramp ?? ['piedra clara', 'piedra', 'piedra sombra'], joint = o.joint ?? 'túnica oscura', moss = o.moss ?? 0;
  const pts: Pt[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask.has(x, y)) pts.push([x, y]);
  if (!pts.length) return;
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const [x, y] of pts) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
  const seeds: Pt[] = [];
  for (let k = 0; seeds.length < o.n && k < o.n * 60;) {
    const x = mnx + h2(k, 1, salt) * (mxx - mnx + 1), y = mny + h2(k, 2, salt) * (mxy - mny + 1);
    k++;
    if (mask.has(Math.trunc(x), Math.trunc(y)) && seeds.every(([a, b]) => (x - a) ** 2 / stretch ** 2 + (y - b) ** 2 > 16)) seeds.push([x, y]);
  }
  const owner = new Map<number, number>();
  for (const [x, y] of pts) {
    const ds = seeds.map(([a, b], i) => [(x + 0.5 - a) ** 2 / stretch ** 2 + (y + 0.5 - b) ** 2, i]).sort((p, q) => p[0] - q[0]);
    owner.set(y * W + x, ds.length < 2 || ds[1][0] - ds[0][0] > 5 ? ds[0][1] : -1);
  }
  const ow = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? owner.get(y * W + x) ?? -2 : -2);
  for (const [key, i] of owner) {
    const x = key % W, y = Math.floor(key / W);
    ctx.setKind(x, y, name);
    let c: string;
    if (i < 0) {
      c = joint;
      if (moss && fbm(x / 3.0, y / 3.0, salt + 3, 2) > 1 - moss) c = o.moss_color ?? 'hoja';
    } else if (ow(x - 1, y) !== i || ow(x, y - 1) !== i) c = ramp[0];
    else if (ow(x + 1, y) !== i || ow(x, y + 1) !== i) c = ramp[2];
    else {
      c = h2(i, 3, salt) < 0.7 ? ramp[1] : ramp[0];
      if (h2(x, y, salt + 4) < 0.04) c = ramp[2];
    }
    g.set(x, y, c);
  }
}

export function runSlabs(ctx: Ctx, st: SlabsStep): void {
  const [u, v, rx, ry, salt, wob] = st.blob, [cx, cy] = ctx.P(u, v);
  const mask = new Mask(ctx.W, ctx.H);
  for (const [x, y] of organic(ctx.W, ctx.H, cx, cy, rx, ry, salt, wob)) mask.set(x, y);
  voronoiSlabs(ctx, mask, st.material, st);
}

// ------------------------------------------------------------------ a dry ditch

export function runDitch(ctx: Ctx, st: DitchStep): void {
  const { W, H, oy, cell } = ctx, g = ctx.ground;
  const water = betweenMask(ctx, st.river);
  const mid = ctx.P(st.u, 0)[0];
  const ax = (v: number) => scaled(mid, st.waves as Wave[], v);
  const ditch = new Mask(W, H), lip = new Mask(W, H), lipPx = st.lip ?? 1.8;
  const y0 = Math.trunc(lineY(ctx, st.from[0])(mid) + st.from[1]), y1 = Math.trunc(ctx.P(0, st.to)[1]);
  const [hw0, hwa, hwf, hws] = st.half;
  for (let y = y0; y < y1; y++) {
    const v = (y - oy) / cell, c = ax(v), hw = hw0 + hwa * n1(v * hwf, hws);
    for (let x = Math.trunc(c - hw - 4); x < Math.trunc(c + hw + 5); x++) {
      const d = Math.abs(x + 0.5 - c);
      if (d < hw) ditch.set(x, y);
      else if (d < hw + lipPx && y > y0 + 2) lip.set(x, y);
    }
  }
  const s = stoneRoles(ctx, st.stone), e = (i: number) => ctx.tone(st.earth, i), [sLip, sEarth, sSpeck] = st.salts;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (water.has(x, y)) continue;
    if (lip.has(x, y) && !ditch.has(x, y)) {
      ctx.setKind(x, y, st.stone);
      const left = x < ax((y - oy) / cell);
      let c = h2(Math.floor(x / 2), Math.floor(y / 3), sLip) > 0.3 ? (left ? s.mid : s.light) : s.shadow;
      if ((Math.floor(y / 3) + Math.floor(x / 2)) % 3 === 0) c = s.shadow;
      g.set(x, y, c);
    } else if (ditch.has(x, y)) {
      ctx.setKind(x, y, st.earth);
      let inx = 9;
      for (let k = 1; k < 5; k++) if (!ditch.has(x - k, y)) { inx = k; break; }
      let c = inx <= 3 ? e(0) : fbm(x / 3.0, y / 4.0, sEarth, 2) > 0.4 ? e(1) : e(2);
      if (h2(x, y, sSpeck) < 0.05 && inx > 3) c = s.mid;
      g.set(x, y, c);
    }
  }
  ctx.masks.set(st.id ?? 'ditch', ditch);
}

// ------------------------------------------------------------------ a dry pond

export function runClaypan(ctx: Ctx, st: ClaypanStep): void {
  const { W, H, oy, cell } = ctx, g = ctx.ground, id = st.id ?? 'claypan';
  const [px0, py0] = ctx.P(st.rect[0], st.rect[1]), [px1, py1] = ctx.P(st.rect[2], st.rect[3]);
  const pcx = (px0 + px1) / 2.0, pcy = (py0 + py1) / 2.0, inset = st.inset ?? 5;
  const pa = (px1 - px0) / 2.0 - inset, pb = (py1 - py0) / 2.0 - inset, pw = st.power ?? 3.2;
  const [rimPx, rimPer, rimSalt] = st.rim;
  const pond = new Mask(W, H), rim = new Mask(W, H), walk = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - pcx) / pa, dy = (y + 0.5 - pcy) / pb, a = Math.atan2(dy, dx);
    const e = (Math.abs(dx) ** pw + Math.abs(dy) ** pw) ** (1 / pw);
    const wob = scaled(0, st.wobble as Wave[], a);
    if (e <= 1 + wob) pond.set(x, y);
    else if (e <= 1 + wob + rimPx / pb * (0.8 + 0.4 * Math.abs(dy)) * (1 + 0.45 * n1((x + y) / rimPer, rimSalt))) rim.set(x, y);
  }
  const w = st.walk;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = (y - oy) / cell;
    const top = waved(w.rows[0], w.top as Wave[], x), bot = waved(w.rows[1], w.bottom as Wave[], x);
    if (top <= v && v < bot && waved(ctx.P(w.x[0], 0)[0], w.left as Wave[], y) <= x && x < waved(ctx.P(w.x[1], 0)[0], w.right as Wave[], y)) walk.set(x, y);
  }
  for (let i = 0; i < W * H; i++) if (walk.data[i]) { pond.data[i] = 0; rim.data[i] = 0; }
  // the mud: Voronoi plates with cracks
  const [count, spacing, salt, cSalt] = st.plates;
  const seeds: Pt[] = [];
  for (let k = 0; seeds.length < count && k < 8000;) {
    const x = px0 + h2(k, 1, salt) * (px1 - px0), y = py0 + h2(k, 2, salt) * (py1 - py0);
    k++;
    if (pond.has(Math.trunc(x), Math.trunc(y)) && seeds.every(([a, b]) => (x - a) ** 2 + (y - b) ** 2 > spacing ** 2)) seeds.push([x, y]);
  }
  const owner = new Map<number, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!pond.has(x, y)) continue;
    const ds = seeds.map(([a, b], i) => [(x + 0.5 - a) ** 2 + (y + 0.5 - b) ** 2, i]).sort((p, q) => p[0] - q[0]);
    owner.set(y * W + x, ds[1][0] - ds[0][0] > 6 ? ds[0][1] : -1);
  }
  const rimdist = distanceIn(pond), m = (i: number) => ctx.tone(st.mud, i);
  const ow = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? owner.get(y * W + x) ?? -2 : -2);
  for (const [key, i] of owner) {
    const x = key % W, y = Math.floor(key / W);
    ctx.setKind(x, y, st.mud);
    let c: string;
    if (i < 0) c = m(0);
    else if (ow(x - 1, y) !== i || ow(x, y - 1) !== i) c = m(3);
    else if (ow(x + 1, y) !== i || ow(x, y + 1) !== i) c = m(1);
    else c = [m(2), m(2), m(3), m(2)][Math.trunc(h2(i, 3, cSalt) * 4)];
    const rd = rimdist[key];
    if (rd <= 4 && c !== m(0)) c = m(1);
    else if (rd <= 6 && c === m(3) && y < pcy) c = m(2);
    g.set(x, y, c);
  }
  voronoiSlabs(ctx, rim, st.stone, st.rim_slabs);
  voronoiSlabs(ctx, walk, w.material, w);
  // the face of the walk over the mud and the rim
  const joint = w.joint ?? 'túnica oscura';
  for (let y = 0; y < H - 2; y++) for (let x = 0; x < W; x++) {
    if (walk.has(x, y) && !walk.has(x, y + 1) && (pond.has(x, y + 1) || rim.has(x, y + 1))) {
      g.set(x, y + 1, joint);
      if (pond.has(x, y + 2)) g.set(x, y + 2, m(1));
    }
  }
  ctx.masks.set(id, pond);
  ctx.masks.set(`${id}_rim`, rim);
  ctx.masks.set(`${id}_walk`, walk);
}

// ------------------------------------------------------------------ the water that comes back

export function runFloodwater(ctx: Ctx, st: FloodwaterStep): void {
  const { W, H, ox, oy, mw, mh } = ctx, layer = ctx.layer(st.layer), salt = st.salt;
  const wet = new Mask(W, H);
  for (const id of st.from) {
    const m = ctx.masks.get(id);
    if (!m) throw new Error(`map: floodwater: no mask "${id}" before it`);
    for (let i = 0; i < W * H; i++) if (m.data[i]) wet.data[i] = 1;
  }
  const river = ctx.masks.get(st.water);
  if (!river) throw new Error(`map: floodwater: no mask "${st.water}" before it`);
  const wd = distanceIn(wet), skip = new Set(st.skip), t = (i: number) => ctx.tone(st.material, i);
  const chan = st.channel ? ctx.masks.get(st.channel.mask) : undefined, wall = st.channel?.wall ?? 0;
  if (st.channel && !chan) throw new Error(`map: floodwater: no mask "${st.channel.mask}" before it`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!wet.has(x, y) || river.has(x, y)) continue;
    const X = x - ox, Y = y - oy;
    if (!(X >= 0 && X < mw && Y >= 0 && Y < mh) || skip.has(ctx.kindAt(x, y))) continue;
    if (chan && chan.has(x, y)) {
      // the ditch: its shaded wall stays dry, the water deep, the far bank lit
      let inx = 99;
      for (let k = 1; k <= wall; k++) if (!chan.has(x - k, y)) { inx = k; break; }
      if (inx <= wall) continue;
      const n = fbm(x / 3.0, y / 6.0, salt + 2, 2);
      let c = !chan.has(x + 1, y) ? t(2) : n > 0.58 ? t(2) : n < 0.36 ? t(0) : t(1);
      if (!wet.has(x, y - 1)) c = st.edge ?? 'túnica oscura';
      layer.set(x, y, c);
      continue;
    }
    const d = wd[y * W + x] + 3.0 * (fbm(x / 9.0, y / 5.0, salt, 2) - 0.5);
    let c = d < 4 ? t(2) : d < 11 ? t(1) : t(0);
    let up: number | null = null;
    for (let k = 1; k < 5; k++) if (!wet.has(x, y - k)) { up = k; break; }
    if (up === 1) c = st.edge ?? 'túnica oscura';
    else if (up !== null && up <= 4) c = (Math.floor(x / 5) + y) % 3 ? t(0) : t(1);
    else if (wd[y * W + x] === 1) c = t(3);
    layer.set(x, y, c);
  }
  // ripples: three px one step lighter
  const ramp = ctx.mat(st.material).ramp, mids = [t(2), t(1)];
  const at = (X: number, Y: number) => (X >= 0 && Y >= 0 && X < mw && Y < mh ? layer.get(X + ox, Y + oy) : null);
  for (let k = 0; k < 400; k++) {
    const X = Math.trunc(h2(k, 1, salt + 1) * mw), Y = Math.trunc(h2(k, 2, salt + 1) * mh);
    const a = at(X, Y), b = at(X + 3, Y);
    if (a === null || b === null || !mids.includes(a) || !mids.includes(b)) continue;
    if (chan && (chan.has(X + ox, Y + oy) || chan.has(X + 3 + ox, Y + oy))) continue;
    for (let i = 0; i < 3; i++) {
      const c = at(X + i, Y), j = c === null ? -1 : ramp.indexOf(c);
      if (j >= 0) layer.set(X + i + ox, Y + oy, ramp[Math.min(ramp.length - 1, j + 1)]);
    }
  }
}
