// A dry lowland road: straw lying in strands on the grass, the lip of the high
// land with the far plain below in the haze (pale fields, a river, a road), a
// wood of crowns past some sides of the map, damp earth where water spilt, and
// the shadow each pixel of the decor casts by its height above its foot. Port of
// the lower road script of The Unwritten Dao (scripts/suelo_camino.py): same
// numbers, same pixels.

import { Mask, clean, distanceIn, fbm, h2, n1, organic } from '../mapnoise';
import { paintClumps, type Clump, type Ctx } from '../mappaint';
import { castStanding, sunOn } from './sun';
import type { CastStep, DampStep, OverlookStep, StrawStep, WoodedgeStep } from './lowlandschema';

type Wave = [number, number, number];

const STANDING = new WeakMap<Ctx, Map<string, number>>();
/** Pixels that stand up (a stamped pillar): "x,y" → px above their foot. A cast step throws their shadow. */
export function standing(ctx: Ctx): Map<string, number> {
  let m = STANDING.get(ctx);
  if (!m) { m = new Map(); STANDING.set(ctx, m); }
  return m;
}

const waved = (base: number, waves: Wave[], t: number) => { let e = base; for (const [a, p, s] of waves) e += a * n1(t / p, s); return e; };

/** Python's float // (CPython's algorithm: fmod, then the floor of the exact quotient). */
function pyFloorDiv(a: number, b: number): number {
  let mod = a % b, div = (a - mod) / b;
  if (mod && (b < 0) !== (mod < 0)) { mod += b; div -= 1.0; }
  if (!div) return 0;
  let f = Math.floor(div);
  if (div - f > 0.5) f += 1.0;
  return f;
}
const pyMod = (a: number, b: number): number => { let m = a % b; if (m !== 0 && (b < 0) !== (m < 0)) m += b; return m; };

// ------------------------------------------------------------------ straw

export function runStraw(ctx: Ctx, st: StrawStep): void {
  const { W, H } = ctx, g = ctx.ground, on = st.on;
  const [a, b, salt, c, d, salt2, fine, above] = st.patch ?? [34, 17, 851, 6, 3, 852, 0.12, 0.55];
  const straw = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (fbm(x / a, y / b, salt, 3) + fine * fbm(x / c, y / d, salt2, 2) > above) straw.set(x, y);
  }
  clean(straw, st.smooth ?? 2);
  const grass = new Mask(W, H);
  for (let i = 0; i < W * H; i++) if (ctx.kind[i] === on) grass.data[i] = 1;
  const gdist = distanceIn(grass), margin = st.margin ?? 2;
  const [sx, sy, sSalt] = st.strands ?? [2.2, 5.0, 853];
  const lit = st.lit ?? [[0.40, 'oro claro'], [0.33, 'oro']], rest = st.rest ?? 'pasto';
  const sh = st.shaded ?? { colors: ['hoja', 'hoja sombra', 'bambú'], strand: [0.5, 'oro'], speck: [854, 3, 0.15, 'bronce'] };
  const dark = new Set(sh.colors);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!straw.has(x, y) || ctx.kindAt(x, y) !== on || gdist[y * W + x] < margin) continue;
    const v = fbm(x / sx, y / sy, sSalt, 2);
    const g0 = g.get(x, y);
    let col: string | null;
    if (g0 !== null && dark.has(g0)) {
      const [spSalt, rows, odds, speck] = sh.speck;
      col = v > sh.strand[0] ? sh.strand[1] : h2(x, Math.floor(y / rows), spSalt) < odds ? speck : g0;
    } else col = lit.find(([lv]) => v > lv)?.[1] ?? rest;
    g.set(x, y, col);
  }
}

// ------------------------------------------------------------------ the far land

export function runOverlook(ctx: Ctx, st: OverlookStep): void {
  const { W, H } = ctx, g = ctx.ground, kind = st.material;
  const waves = (st.waves ?? [[1.6, 13, 901], [0.8, 4, 902]]) as Wave[];
  const lip = (y: number) => waved(ctx.ox + st.at, waves, y);
  const bands = st.bands ?? [[1, 'pasto'], [2.5, 'madera sombra']];
  const [fpx, fwob, fper, fsalt, fcol] = st.face ?? [4.0, 1.2, 5, 903, 'túnica noche'];
  const f = st.fields;
  for (let y = 0; y < H; y++) {
    const e = lip(y);
    for (let x = 0; x < Math.trunc(e) + 1; x++) {
      ctx.setKind(x, y, kind);
      const depth = e - x;
      let c = bands.find(([dp]) => depth < dp)?.[1];
      if (c === undefined && depth < fpx + fwob * n1(y / fper, fsalt)) c = fcol;
      if (c === undefined) {
        // the plain, far below in the haze: big pale parcels, their borders a little lighter
        const u = x * f.u[0] + y * f.u[1], v = x * f.v[0] + y * f.v[1];
        const fi = pyFloorDiv(u, f.size[0]), fj = pyFloorDiv(v, f.size[1]);
        c = f.colors[Math.trunc(h2(fi, fj, f.salt) * f.colors.length)];
        if ((pyMod(u, f.size[0]) < 1 || pyMod(v, f.size[1]) < 1) && c !== f.line) c = f.line;
      }
      g.set(x, y, c);
    }
  }
  const clear = st.clear ?? 5;
  for (let y = 0; y < H; y++) {
    if (st.river) {
      const rx = waved(st.river.at, st.river.waves as Wave[], y);
      st.river.colors.forEach((c, k) => {
        const X = Math.trunc(rx) + k;
        if (ctx.kindAt(X, y) === kind && X < lip(y) - clear) g.set(X, y, c);
      });
    }
    if (st.road) {
      const X = Math.trunc(st.road.at + st.road.sway[0] * Math.sin(y / st.road.sway[1]));
      if (ctx.kindAt(X, y) === kind && X < lip(y) - clear && y > ctx.oy + st.road.from * ctx.cell) g.set(X, y, st.road.color);
    }
  }
}

// ------------------------------------------------------------------ the wood past the sides

export function runWoodedge(ctx: Ctx, st: WoodedgeStep): void {
  const { W, H, ox, oy, mw, mh } = ctx, g = ctx.ground, name = st.material;
  const inset = st.inset ?? 3;
  const waves = (st.waves ?? [[2.4, 19, 911], [1.2, 7, 912]]) as Wave[];
  const right = (py: number) => waved(ox + mw + inset, waves, py);
  const top = oy - inset, bottom = oy + mh + inset;
  if (st.id) {
    ctx.edges.set(st.id, { sides: ['r', 't', 'b'], at: (side, along) => (side === 'r' ? right(along) : side === 't' ? top : bottom), material: name });
  }
  const T = ctx.mat(name).ramp.length - 1, t = (i: number) => ctx.tone(name, i);
  const ramps = st.ramps ?? [[t(T), t(T - 1), t(T - 2), t(T - 3), t(T - 4)], [t(T - 1), t(T - 2), t(T - 3), t(T - 4), t(T - 4)], [t(T - 3), t(T - 3), t(0), t(0), t(0)]];
  const salt = st.salt ?? 913, [from, to] = st.range ?? [2.5, 60], [ra, rb, cap, rc] = st.radius ?? [6, 0.3, 90, 5];
  const [d1, d2] = st.depths ?? [10, 28], left = st.left ?? 6;
  const cut = st.cut === undefined ? null : ctx.masks.get(st.cut);
  if (st.cut !== undefined && !cut) throw new Error(`map: woodedge: no mask "${st.cut}" before it`);
  const clumps: Clump[] = [], seeds: [number, number, number][] = [];
  for (let k = 0; k < (st.tries ?? 2500); k++) {
    const x = h2(k, 1, salt) * W, y = h2(k, 2, salt) * (H + 24) - 12;
    const r0 = right(y);
    let dd = x > r0 - 2 ? x - r0 : -1;
    if (x < ox + left) continue;
    dd = Math.max(dd, top - y, y - bottom);
    if (dd < from || dd > to) continue;
    const r = ra + Math.min(dd, cap) * rb + h2(k, 3, salt) * rc;
    if (cut && [-r, 0, r].some(i => [-r * 0.6, 0, r * 0.8].some(j => cut.has(Math.trunc(x + i), Math.trunc(y + j))))) continue;
    if (seeds.some(([a, b, rs]) => (x - a) ** 2 + (y - b) ** 2 < (0.8 * Math.min(r, rs)) ** 2)) continue;
    seeds.push([x, y, r]);
    const depth = dd < d1 ? 0 : dd < d2 ? 1 : 2;
    clumps.push([x, y, depth === 0 ? Math.min(r, 7.5) : r, ramps[depth]]);
  }
  clumps.sort((p, q) => p[1] - q[1]);
  for (const [key, c] of paintClumps(W, H, clumps, salt + 2)) {
    if (st.keep !== undefined && ctx.kind[key] === st.keep) continue;
    g.px[key] = c;
    ctx.kind[key] = name;
  }
  // past the edge the earth and the grass go into the shade of the wood
  for (let y = 0; y < H; y++) {
    const r0 = right(y);
    for (let x = 0; x < W; x++) {
      const k = ctx.kindAt(x, y);
      if (st.earth && k === st.earth[0] && x > r0 + st.earth[1]) {
        const far = x - r0 - st.earth[1], c = g.get(x, y);
        g.set(x, y, far < st.earth[2] ? ctx.shade(c, k) : ctx.shade(ctx.shade(c, k), k));
      } else if (st.grass && k === st.grass.on && (x >= r0 || y < oy - st.grass.reach || y > oy + mh + st.grass.reach) && x > ox) {
        const c = g.get(x, y);
        if (c !== null) g.set(x, y, st.grass.shade[c] ?? c);
      }
    }
  }
}

// ------------------------------------------------------------------ damp earth

export function runDamp(ctx: Ctx, st: DampStep): void {
  const { W, H } = ctx, g = ctx.ground;
  const [cx, cy] = ctx.P(st.at[0], st.at[1]);
  const mask = ctx.masks.get(st.on[0]), dist = ctx.dists.get(st.on[0]), mat = ctx.pathMaterial.get(st.on[0]);
  if (!mask || !dist) throw new Error(`map: damp: no mask with a distance "${st.on[0]}" before it`);
  const [px, salt, above] = st.noise;
  for (const [x, y] of organic(W, H, cx, cy, st.r[0], st.r[1], st.salt, st.wobble ?? 0.25)) {
    if (ctx.kindAt(x, y) === mat && dist[y * W + x] >= st.on[1]) g.set(x, y, fbm(x / px, y / px, salt, 2) > above ? st.colors[0] : st.colors[1]);
  }
}

// ------------------------------------------------------------------ cast shadows

/** Each opaque px of the decor (its silhouette) and of what stands (stamps) casts by its height above its foot. */
export function runCast(ctx: Ctx, st: CastStep): void {
  const { W, H, cell, ox, oy } = ctx, g = ctx.ground;
  const tall = new Map<string, number>();
  const put = (x: number, y: number, h: number) => { const k = `${x},${y}`; tall.set(k, Math.max(tall.get(k) ?? 0, h)); };
  const skipWhen = (st.skip_when ?? []).map(w => JSON.stringify(w));
  for (const piece of ctx.game.decor ?? []) {
    if ((piece.landmark && !st.landmarks) || !piece.mask) continue;
    if (piece.when !== undefined && skipWhen.includes(JSON.stringify(piece.when))) continue;
    if ((st.skip ?? []).some(p => piece.sprite.startsWith(p))) continue;
    const [sw, sh] = piece.size ?? [1, 1];
    const [du, dv] = piece.offset ?? [0, 0];
    const u = st.offset ? piece.at[0] + du : piece.at[0], v = st.offset ? piece.at[1] + dv : piece.at[1];
    const bx = Math.trunc(ox + (u + 0.5 + (sw % 2 === 0 ? 0.5 : 0)) * cell - sw * cell / 2);
    const by = Math.trunc(oy + (v + 1) * cell - sh * cell);
    const foot = st.foot === 'lowest' ? piece.mask.reduce((f, row, y) => (row.includes('#') ? y : f), piece.mask.length - 1) : piece.mask.length - 1;
    piece.mask.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') put(bx + x, by + y, foot - y); });
  }
  for (const [k, h] of standing(ctx)) { const [x, y] = k.split(',').map(Number); put(x, y, h); }
  if (ctx.sun) {
    // the sun: each px thrown from its height like everything else that stands (st.lean is the old rule)
    sunOn(ctx, st.on);
    for (const [k, h] of tall) { const [x, y] = k.split(',').map(Number); castStanding(ctx, x, y, h); }
    return;
  }
  const [across, down] = st.lean ?? [0.55, 0.22], min = st.min ?? 1;
  const shadow = new Mask(W, H);
  for (const [k, h] of tall) {
    if (h <= min) continue;
    const [x, y] = k.split(',').map(Number), gy = y + h;
    for (const s of [0, 1]) {
      const X = Math.trunc(x + across * h + s * 0.5), Y = Math.trunc(gy + down * h);
      if (X >= 0 && X < W && Y >= 0 && Y < H) shadow.set(X, Y);
    }
  }
  clean(shadow, st.smooth ?? 2);
  const on = new Set(st.on);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (shadow.has(x, y) && on.has(ctx.kindAt(x, y)) && (st.covers ? !tall.has(`${x},${y}`) : (tall.get(`${x},${y}`) ?? 0) === 0)) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }
}
