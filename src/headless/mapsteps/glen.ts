// A glen at the foot of a waterfall: the layout as masks (a plunge pool, the
// stream that leaves it, a river under a line, trodden earth, a ledge of slabs,
// a gravel beach), wet moss cushions by the water, the wet earth trail, the
// gravel beach, the ledge of wet slabs, the water with its high banks, its foam
// and the rings at the foot of the fall, wet stones with their wake, the wet
// wood on the sides, cold cast shadows, the small things by the shared random
// stream, what moves on the water and the boughs that reach in front.
// Port of the upriver script of The Unwritten Dao (scripts/suelo_rio_arriba.py):
// same numbers, same pixels.

import { Mask, catmull, clean, distanceIn, fbm, h2, n1, organic, ribbon, type Pt } from '../mapnoise';
import { paintClumps, stone, stoneRoles, type Clump, type Ctx } from '../mappaint';
import { registerFooted } from './settle';
import { lineY } from './riverbank';
import { castCrown, castMass, castOval, decorFoot, flushSun, shadeMask, sunOn } from './sun';
import type {
  BoughsStep, CushionsStep, GlenStep, GlenflowStep, GlenlitterStep, GlenshadeStep, LedgeslabsStep, MudtrailStep, PlungeStep,
  ShingleStep, WetstonesStep, WetwoodStep,
} from './glenschema';

type Wave = [number, number, number];
const waved = (base: number, waves: Wave[], t: number) => { let e = base; for (const [a, p, s] of waves) e += a * n1(t / p, s); return e; };

function need(ctx: Ctx, id: string, step: string): Mask {
  const m = ctx.masks.get(id);
  if (!m) throw new Error(`map: ${step}: no mask "${id}" (a glen step before it makes it)`);
  return m;
}
function dist(ctx: Ctx, id: string, step: string): Int32Array {
  const d = ctx.dists.get(id);
  if (!d) throw new Error(`map: ${step}: no distance "${id}" (a glen step before it makes it)`);
  return d;
}

// ------------------------------------------------------------------ the layout

export function runGlen(ctx: Ctx, st: GlenStep): void {
  const { W, H } = ctx;
  const pool = new Mask(W, H);
  for (const [u, v, rx, ry, salt, wob] of st.pool) {
    const [cx, cy] = ctx.P(u, v);
    for (const [x, y] of organic(W, H, cx, cy, rx, ry, salt, wob)) pool.set(x, y);
  }
  clean(pool);
  const stream = new Mask(W, H), s = st.stream;
  ribbon(stream, catmull(s.points.map(([u, v]) => ctx.P(u, v))), (i) => s.width[0] + s.width[1] * n1(i / s.period, s.salt));
  const top = lineY(ctx, st.river), river = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y >= top(x)) river.set(x, y);
  const water = new Mask(W, H);
  for (let i = 0; i < W * H; i++) water.data[i] = pool.data[i] | stream.data[i] | river.data[i];
  clean(water);

  const earth = new Mask(W, H), centers: Pt[] = [], e = st.earth;
  const min = e.min ?? 3.6, per = e.period ?? 30, [fa, fp] = e.fine ?? [0.6, 9];
  for (const road of e.roads) {
    const curve = catmull(road.points.map(([u, v]) => ctx.P(u, v)));
    const [w0, w1] = road.width, salt = road.salt;
    ribbon(earth, curve, (i) => Math.max(min, w0 + w1 * n1(i / per, salt) + fa * n1(i / fp, salt + 1)));
    for (let i = 0; i < curve.length; i += 2) centers.push(curve[i]);
  }
  for (const [u, v, rx, ry, salt, wob] of e.clearings ?? []) {
    const [cx, cy] = ctx.P(u, v);
    for (const [x, y] of organic(W, H, cx, cy, rx, ry, salt, wob)) earth.set(x, y);
  }
  clean(earth);
  const ledge = new Mask(W, H);
  for (const [u, v, rx, ry, salt, wob] of st.ledge) {
    const [cx, cy] = ctx.P(u, v);
    for (const [x, y] of organic(W, H, cx, cy, rx, ry, salt, wob)) ledge.set(x, y);
  }
  clean(ledge);
  const btop = lineY(ctx, st.beach), sand = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (btop(x) <= y && !water.has(x, y)) sand.set(x, y);
  clean(sand);
  for (let i = 0; i < W * H; i++) {
    if (water.data[i]) earth.data[i] = ledge.data[i] = sand.data[i] = 0;
    else if (sand.data[i]) earth.data[i] = 0;
  }
  const land = new Mask(W, H);
  for (let i = 0; i < W * H; i++) land.data[i] = water.data[i] ? 0 : 1;
  for (const [id, m] of [['pool', pool], ['stream', stream], ['river', river], ['water', water], ['earth', earth], ['ledge', ledge], ['sand', sand], ['land', land]] as [string, Mask][]) ctx.masks.set(id, m);
  ctx.dists.set('earth', distanceIn(earth));
  ctx.dists.set('water', distanceIn(water));
  ctx.dists.set('land', distanceIn(land));
  ctx.centers.set('earth', centers);
}

// ------------------------------------------------------------------ wet moss cushions

export function runCushions(ctx: Ctx, st: CushionsStep): void {
  const { W, H } = ctx, g = ctx.ground, farW = dist(ctx, 'land', 'cushions');
  const [rb, rm, rp, rs] = st.reach ?? [9, 4, 6, 337], [nx, ny, ns, above] = st.noise ?? [5, 4, 338, 0.42];
  const map = st.map ?? { 'bambú': 'hoja' }, other = st.else ?? 'vida sombra';
  const wet = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (farW[y * W + x] < rb + rm * fbm(x / rp, y / rp, rs, 2) && fbm(x / nx, y / ny, ns, 2) > above) wet.set(x, y);
  }
  clean(wet);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (wet.has(x, y)) g.set(x, y, map[g.get(x, y) ?? ''] ?? other);
  }
}

// ------------------------------------------------------------------ the wet trail

export function runMudtrail(ctx: Ctx, st: MudtrailStep): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i), b = ctx.base(name);
  const earth = need(ctx, 'earth', 'mudtrail'), dE = dist(ctx, 'earth', 'mudtrail'), farW = dist(ctx, 'land', 'mudtrail');
  const [sTone, sRut, sGrain, sWet, sTuft] = st.salts ?? [341, 342, 343, 344, 345];
  const [l0, l1, l2] = st.levels ?? [0.30, 0.42, 0.62], [wb, wm, wp] = st.wet ?? [14, 6, 6], odds = st.grains ?? 0.035;
  const dcen = new Float64Array(W * H).fill(99);
  for (const [cx, cy] of ctx.centers.get('earth') ?? []) {
    for (let y = Math.trunc(cy - 8); y < Math.trunc(cy + 9); y++) for (let x = Math.trunc(cx - 8); x < Math.trunc(cx + 9); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < dcen[y * W + x]) dcen[y * W + x] = d;
    }
  }
  const dark = t(b - 2), shadow = t(b - 1), base = t(b), light = t(b + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!earth.has(x, y)) continue;
    ctx.setKind(x, y, name);
    const d = dE[y * W + x];
    let kOut: number | null = null;
    for (let k = 1; k < 4; k++) if (!earth.has(x - k, y - k)) { kOut = k; break; }
    let c: string;
    if (d === 1) c = kOut === 1 ? dark : base;
    else if (kOut !== null && kOut <= 2) c = shadow;
    else {
      const v = fbm(x / 5.5, y / 4.5, sTone, 3);
      c = v < l1 ? base : v > l2 ? light : base;
      if (v < l0) c = shadow;
      if (farW[y * W + x] < wb + wm * fbm(x / wp, y / wp, sWet, 2)) c = c === light ? base : c === base ? shadow : c;
      if (h2(x, y, sGrain) < odds) c = dark;
      else if (h2(x + 1, y + 1, sGrain) < odds && c !== shadow) c = light;
      const r = dcen[y * W + x];
      if (r >= 2.5 && r < 3.5 && fbm(x / 3.0, y / 5.0, sRut, 2) > 0.5) c = c !== shadow ? shadow : dark;
    }
    g.set(x, y, c);
  }
  if (st.lip) {
    const not = (st.lip.not ?? []).map(id => need(ctx, id, 'mudtrail'));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (ctx.kindAt(x, y) === st.lip.grass && !not.some(m => m.has(x, y))
        && ((y > 0 && ctx.kindAt(x, y - 1) === name) || (x > 0 && ctx.kindAt(x - 1, y) === name))) g.set(x, y, st.lip.color);
    }
  }
  const tf = st.tufts ?? { count: 380, colors: ['bambú', 'hoja'] as [string, string] };
  for (let k = 0; k < tf.count; k++) {
    const x = Math.trunc(h2(k, 1, sTuft) * W), y = Math.trunc(h2(k, 2, sTuft) * H);
    if (!earth.has(x, y) || !(dE[y * W + x] >= 2 && dE[y * W + x] <= 3)) continue;
    const shape = h2(k, 4, sTuft) < 0.5 ? ['h.h', '.l.'] : ['h..', 'lh.', '.l.'];
    let ok = true;
    for (let j = 0; j < shape.length && ok; j++) for (let i = 0; i < 3; i++) {
      if (!(earth.has(x + i, y + j) && dE[(y + j) * W + x + i] >= 2)) { ok = false; break; }
    }
    if (!ok) continue;
    shape.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.set(x + i, y + j, ch === 'h' ? tf.colors[0] : tf.colors[1]); }));
  }
}

// ------------------------------------------------------------------ the gravel beach

export function runShingle(ctx: Ctx, st: ShingleStep): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const sand = need(ctx, 'sand', 'shingle'), water = need(ctx, 'water', 'shingle');
  const [sTone, sFace] = st.salts ?? [351, 352];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!sand.has(x, y)) continue;
    ctx.setKind(x, y, name);
    let up: number | null = null, wd: number | null = null;
    for (let k = 1; k < 4; k++) if (!sand.has(x, y - k)) { up = k; break; }
    for (let k = 1; k < 5; k++) if (water.has(x, y + k)) { wd = k; break; }
    const v = fbm(x / 6.0, y / 4.0, sTone, 3);
    let c: string;
    if (up === 1) c = t(1);
    else if (up === 2) c = h2(x, y, sFace) < 0.2 ? t(0) : t(2);
    else if (wd !== null && wd <= 3) c = wd <= 1 ? t(2) : t(3);
    else c = v > 0.42 ? t(4) : t(3);
    g.set(x, y, c);
  }
  if (st.lip) {
    const [grass, color] = st.lip;
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      if (sand.has(x, y) && !sand.has(x, y - 1) && !water.has(x, y - 1) && ctx.kindAt(x, y - 1) === grass) g.set(x, y - 1, color);
    }
  }
}

// ------------------------------------------------------------------ the ledge of wet slabs

export function runLedgeslabs(ctx: Ctx, st: LedgeslabsStep): void {
  const { W, H } = ctx, g = ctx.ground, ledge = need(ctx, 'ledge', 'ledgeslabs');
  const [bx, bw, by, bh] = st.box ?? [-18, 36, -34, 62], n = st.count ?? 16, tries = st.tries ?? 600, gap = st.gap ?? 8;
  const sy = st.stretch ?? 1.3, joint = st.joint ?? 12;
  const [sSeed, sJoint, sTone, sMoss] = st.salts ?? [361, 363, 365, 366];
  const tn = st.tones ?? {};
  const [jA, jB] = tn.joint ?? ['vida sombra', 'hoja sombra'], lip = tn.lip ?? 'piedra clara', edge = tn.edge ?? 'túnica oscura';
  const slabs = tn.slabs ?? ['piedra', 'piedra sombra', 'piedra'], moss = tn.moss ?? 'hoja';
  const [rimS, rimJ] = tn.rim ?? ['túnica oscura', 'hoja sombra'];
  const seeds: Pt[] = [];
  const [lx, ly] = ctx.P(st.at[0], st.at[1]);
  let k = 0;
  while (seeds.length < n && k < tries) {
    const x = lx + bx + h2(k, 1, sSeed) * bw, y = ly + by + h2(k, 2, sSeed) * bh;
    k++;
    if (ledge.has(Math.trunc(x), Math.trunc(y)) && seeds.every(([a, b]) => (x - a) ** 2 + ((y - b) * sy) ** 2 > gap ** 2)) seeds.push([x, y]);
  }
  const owner = new Map<number, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ledge.has(x, y)) continue;
    let d0 = Infinity, d1 = Infinity, i0 = -1;
    seeds.forEach(([a, b], i) => {
      const d = (x + 0.5 - a) ** 2 + ((y + 0.5 - b) * sy) ** 2;
      if (d < d0) { d1 = d0; d0 = d; i0 = i; } else if (d < d1) d1 = d;
    });
    owner.set(y * W + x, seeds.length > 1 && d1 - d0 > joint ? i0 : -1);
  }
  const o = (X: number, Y: number) => (X >= 0 && Y >= 0 && X < W && Y < H ? owner.get(Y * W + X) ?? -2 : -2);
  for (const [key, i] of owner) {
    const x = key % W, y = Math.floor(key / W);
    ctx.setKind(x, y, st.material);
    let c: string;
    if (i < 0) c = fbm(x / 3.0, y / 3.0, sJoint, 2) > 0.45 ? jA : jB;
    else if (o(x - 1, y) !== i || o(x, y - 1) !== i) c = lip;
    else if (o(x + 1, y) !== i || o(x, y + 1) !== i) c = edge;
    else {
      c = slabs[Math.trunc(h2(i, 3, sTone) * slabs.length)];
      if (fbm(x / 3.0, y / 2.0, sMoss, 2) > 0.66) c = moss;
    }
    g.set(x, y, c);
  }
  for (const [key, i] of owner) {
    const x = key % W, y = Math.floor(key / W);
    if (!ledge.has(x + 1, y) || !ledge.has(x, y + 1)) g.set(x, y, i >= 0 ? rimS : rimJ);
  }
}

// ------------------------------------------------------------------ the water

export function runPlunge(ctx: Ctx, st: PlungeStep): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const water = need(ctx, 'water', 'plunge'), pool = need(ctx, 'pool', 'plunge'), stream = need(ctx, 'stream', 'plunge');
  const river = need(ctx, 'river', 'plunge'), dW = dist(ctx, 'water', 'plunge'), top = lineY(ctx, st.river);
  const [sRiver, sChan, sPool, sFoam] = st.salts ?? [371, 372, 373, 374];
  const faces = st.faces ?? { earth: ['tierra sombra', 'madera sombra'], rock: ['túnica oscura', 'túnica noche'] };
  const deep = t(0), mid = t(1), shallow = t(2), foam = t(3), glint = t(4);
  const banks = new Set(st.banks);
  if (st.ledge) banks.add(st.ledge);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!water.has(x, y)) continue;
    ctx.setKind(x, y, name);
    let up: number | null = null, down: number | null = null;
    for (let k = 1; k < 6; k++) if (y - k >= 0 && !water.has(x, y - k)) { up = k; break; }
    for (let k = 1; k < 4; k++) if (y + k < H && !water.has(x, y + k)) { down = k; break; }
    const wd = dW[y * W + x];
    let c: string, dd: number;
    if (river.has(x, y) && !pool.has(x, y)) {
      const dr = y - top(x);
      dd = dr + 6.0 * (fbm(x / 9.0, y / 5.0, sRiver, 2) - 0.5);
      c = dd < 9 ? shallow : dd < 20 ? mid : deep;
      if (33 < dd && fbm(x / 14.0, y / 6.0, sChan, 2) > 0.55) c = mid;
    } else {
      dd = wd + 4.0 * (fbm(x / 7.0, y / 5.0, sPool, 2) - 0.5);
      c = dd < 3.0 ? shallow : dd < 7 ? mid : deep;
    }
    const aboveK = up !== null ? ctx.kindAt(x, y - up) : null;
    if (up !== null && aboveK !== null && banks.has(aboveK)) {
      const rock = aboveK === st.ledge;
      if (up === 1) c = rock ? faces.rock[0] : faces.earth[0];
      else if (up === 2) c = rock ? faces.rock[1] : faces.earth[1];
      else if (up <= 4) c = c !== deep ? ctx.shade(c, name)! : c;
    } else if (up !== null && aboveK === st.beach && up <= 2) c = up === 1 ? foam : shallow;
    else if (down === 1) c = foam;
    else if (down === 2 && c !== foam) c = shallow;
    else if (wd === 1) c = deep;
    else if (wd === 2 && fbm(x / 3.0, y / 3.0, sFoam, 2) > 0.42) c = foam;
    else if (stream.has(x, y) && !pool.has(x, y) && !river.has(x, y)) c = dd < 3.0 ? shallow : mid;
    g.set(x, y, c);
  }
  const [pTries, pSalt] = st.pebbles ?? [600, 375];
  for (let k = 0; k < pTries; k++) {
    const x = Math.trunc(h2(k, 1, pSalt) * W), y = Math.trunc(h2(k, 2, pSalt) * H);
    if (!river.has(x, y) || !water.has(x, y) || g.get(x, y) !== shallow) continue;
    if (g.get(x + 1, y) === shallow && h2(k, 3, pSalt) < 0.5) { g.set(x, y, foam); g.set(x + 1, y, mid); }
  }
  if (st.foam) {
    const f = st.foam, [fx, fy] = ctx.P(f.at[0], f.at[1]), sq = f.squash ?? 1.9, salt = f.salt ?? 381;
    const rings = f.rings ?? [[12, 1.5, 5, 382, 0.4, foam], [17, 1.5, 6, 383, 0.52, shallow]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!pool.has(x, y)) continue;
      const e = Math.hypot((x + 0.5 - fx) / sq, y + 0.5 - fy), v = fbm(x / 4.0, y / 3.0, salt, 2);
      if (e < 5 + 3 * v) { g.set(x, y, v > 0.5 ? glint : foam); continue; }
      if (e < 8 + 2 * v && v > 0.45) { g.set(x, y, foam); continue; }
      for (const [r, sw, per, s, above, col] of rings) {
        if (Math.abs(e - (r + sw * n1(x / per, s))) < 0.6 && v > above) { g.set(x, y, col); break; }
      }
    }
  }
}

// ------------------------------------------------------------------ wet stones

export function runWetstones(ctx: Ctx, st: WetstonesStep): void {
  const { W } = ctx, g = ctx.ground, water = need(ctx, 'water', 'wetstones');
  const [foam, wake] = st.colors ?? ['ojo', 'celeste luz'];
  for (const s of st.stones) {
    const [cx, cy] = ctx.P(s.at[0], s.at[1]);
    const pts = stone(ctx, st.material, cx, cy, s.r[0], s.r[1], s.salt, s.moss ?? true);
    registerFooted(ctx, 'wetstones', 'stone', [...pts.keys()].map(i => [i % W, Math.floor(i / W)]), { ink: [stoneRoles(ctx, st.material).line] });
    if (s.wake === false) continue;
    const has = (x: number, y: number) => pts.has(y * W + x);
    for (const key of pts.keys()) {
      const x = key % W, y = Math.floor(key / W);
      if (!has(x - 1, y) && water.has(x - 1, y) && !has(x - 1, y - 1)) g.set(x - 1, y, foam);
    }
    const ys = [...new Set([...pts.keys()].map(k => Math.floor(k / W)))].sort((a, b) => a - b);
    const half = Math.floor(ys.length / 2);
    for (const yy of ys.slice(half, half + 2)) {
      let xr = -Infinity;
      for (const k of pts.keys()) if (Math.floor(k / W) === yy) xr = Math.max(xr, k % W);
      for (let k = 1; k < 7; k++) {
        if (water.has(xr + k, yy + Math.floor(k / 4)) && h2(k, yy, s.salt) < 0.8) g.set(xr + k, yy + Math.floor(k / 4), wake);
      }
    }
  }
}

// ------------------------------------------------------------------ the wet wood

interface Edges { left: (y: number) => number; right: (y: number) => number }
const EDGES = new WeakMap<Ctx, Edges>();
function edges(ctx: Ctx, step: string): Edges {
  const e = EDGES.get(ctx);
  if (!e) throw new Error(`map: ${step}: no wetwood step before it`);
  return e;
}

export function runWetwood(ctx: Ctx, st: WetwoodStep): void {
  const { W, H, ox, oy, mw } = ctx, g = ctx.ground, name = st.material;
  const left = (y: number) => waved(ox + st.left.at, st.left.waves as Wave[], y);
  const right = (y: number) => waved(ox + mw + st.right.at, st.right.waves as Wave[], y);
  EDGES.set(ctx, { left, right });
  const earth = need(ctx, 'earth', 'wetwood'), water = need(ctx, 'water', 'wetwood'), sand = need(ctx, 'sand', 'wetwood');
  const ledge = need(ctx, 'ledge', 'wetwood'), top = lineY(ctx, st.river);
  const salt = st.salt ?? 421, fill = st.fill ?? 'túnica noche';
  const clumps: Clump[] = [], seeds: [number, number, number][] = [];
  for (let k = 0; k < (st.tries ?? 3200); k++) {
    const x = h2(k, 1, salt) * W, y = h2(k, 2, salt) * (H + 24) - 12;
    const l = left(y), r0 = right(y);
    const dd = x < l + 2 ? l - x : x > r0 - 2 ? x - r0 : -1;
    if (dd < 2.5 || dd > 62) continue;
    let r = 6 + Math.min(dd, 90) * 0.32 + h2(k, 3, salt) * 5;
    if (y + r * 0.8 > top(x) - 3) continue;
    let hit = false;
    for (const i of [-r, 0, r]) for (const j of [-r * 0.6, 0, r * 0.8]) if (earth.has(Math.trunc(x + i), Math.trunc(y + j))) hit = true;
    if (hit) continue;
    if (seeds.some(([a, b, rb]) => (x - a) ** 2 + (y - b) ** 2 < (0.8 * Math.min(r, rb)) ** 2)) continue;
    seeds.push([x, y, r]);
    const depth = dd < 9 ? 0 : dd < 26 ? 1 : dd < 52 ? 2 : 3;
    let ramp = st.ramps[depth];
    if (depth === 0 && x > ox + mw / 2) ramp = st.lit;
    if (depth === 0) r = Math.min(r, 7.5);
    clumps.push([x, y, r, ramp]);
  }
  clumps.sort((p, q) => p[1] - q[1]);
  const painted = paintClumps(W, H, clumps, salt + 4);
  for (let y = 0; y < H; y++) {
    const l = left(y), r0 = right(y);
    for (let x = 0; x < W; x++) {
      if (water.has(x, y) || sand.has(x, y)) continue;
      const c = painted.get(y * W + x);
      if (c !== undefined) { g.set(x, y, c); ctx.setKind(x, y, name); }
      else if (x < l || x >= r0) {
        let nearRoad = false;
        for (const i of [-14, 0, 14]) for (const j of [-12, 0, 12]) if (earth.has(x + i, y + j)) nearRoad = true;
        if (!nearRoad && y < top(x) - 10) { g.set(x, y, fill); ctx.setKind(x, y, name); }
      }
    }
  }
  const [past, one, deepFrom, allDark, fSalt] = st.fade ?? [10, 24, 52, 66, 427];
  const [dA, dB] = st.deep ?? ['túnica noche', 'hoja sombra'];
  for (let y = 0; y < H; y++) {
    const l = left(y), r0 = right(y);
    for (let x = 0; x < W; x++) {
      if (ctx.kindAt(x, y) === name) continue;
      if (x < l - past || x > r0 + past) {
        const far = x < l ? l - past - x : x - r0 - past;
        const k = ctx.kindAt(x, y);
        let c = g.get(x, y);
        c = far < one ? ctx.shade(c, k) : ctx.shade(ctx.shade(c, k), k);
        if (far > deepFrom && !water.has(x, y) && !sand.has(x, y)) c = far > allDark || h2(x, y, fSalt) < 0.5 ? dA : dB;
        g.set(x, y, c);
      }
    }
  }
  const [tFar, tNear, tPx] = st.top ?? ['túnica noche', 'hoja sombra', 5];
  for (let y = 0; y < oy; y++) for (let x = 0; x < W; x++) if (!ledge.has(x, y)) g.set(x, y, y < oy - tPx ? tFar : tNear);
}

// ------------------------------------------------------------------ the shadows

export function runGlenshade(ctx: Ctx, st: GlenshadeStep): void {
  const { W, H } = ctx, g = ctx.ground, top = lineY(ctx, st.river);
  const shadow = new Mask(W, H), deep = new Mask(W, H);
  const cast = (cx: number, cy: number, rx: number, ry: number, seed: number, dark = false) => {
    const lobes = 8 + (seed % 4);
    for (let y = Math.trunc(cy - ry * 1.3) - 1; y < Math.trunc(cy + ry * 1.3) + 2; y++) {
      for (let x = Math.trunc(cx - rx * 1.3) - 1; x < Math.trunc(cx + rx * 1.3) + 2; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
        const rr = 1 + 0.11 * Math.sin(a * lobes + seed) + 0.07 * n1(a * 2, seed);
        if (dx * dx + dy * dy <= rr * rr) { shadow.set(x, y); if (dark) deep.set(x, y); }
      }
    }
  };
  if (ctx.sun) {
    // the sun: a caster with a trunk is a crown on it, any other a pool of its `r` from the ground to its top; the wood
    // is a mass `height` px high (on every side, not only the left); the hand-placed ovals are laid as they are drawn.
    // `at`, `deep`, `trunk`'s numbers and `rim` are the old light.
    const on = new Set(st.on);
    sunOn(ctx, on);
    for (const piece of ctx.game.decor ?? []) {
      if (piece.landmark) continue;
      const when = piece.when as Record<string, unknown> | undefined;
      if (when && when.de_noche) continue;
      const rule = st.casters.find(c => piece.sprite.startsWith(c.prefix));
      if (!rule) continue;
      const [w, h] = piece.size ?? [1, 1], [px, py] = decorFoot(ctx, piece);
      const cx = piece.at[0] + 0.5 + (w % 2 === 0 ? 0.5 : 0), foot = piece.at[1] + 1;
      const seed = typeof rule.salt === 'number' ? rule.salt : Math.trunc(cx * rule.salt[0] + foot);
      if (rule.trunk) castCrown(ctx, px, py, w, h, seed);
      else castOval(ctx, px, py - 1, rule.r[0], rule.r[1], 0, h * ctx.cell, seed);
    }
    for (const [u, v, rx, ry, salt] of st.casts ?? []) { const [cx, cy] = ctx.P(u, v); cast(cx, cy, rx, ry, salt); }
    shadeMask(ctx, shadow);
    castMass(ctx, (x, y) => ctx.kindAt(x, y) === st.wood, st.height ?? 32, (x, y) => y < top(x));
    flushSun(ctx);
    return;
  }
  for (const piece of ctx.game.decor ?? []) {
    if (piece.landmark) continue;
    const when = piece.when as Record<string, unknown> | undefined;
    if (when && when.de_noche) continue;
    const rule = st.casters.find(c => piece.sprite.startsWith(c.prefix));
    if (!rule) continue;
    const w = (piece.size ?? [1, 1])[0];
    const cx = piece.at[0] + 0.5 + (w % 2 === 0 ? 0.5 : 0), foot = piece.at[1] + 1;
    const seed = typeof rule.salt === 'number' ? rule.salt : Math.trunc(cx * rule.salt[0] + foot);
    if (!rule.at) throw new Error(`map: glenshade: caster "${rule.prefix}" needs its at without a sun`);
    const [sx, sy] = ctx.P(cx + rule.at[0], foot + rule.at[1]);
    cast(sx, sy, rule.r[0], rule.r[1], seed, rule.deep ?? false);
    if (rule.trunk) {
      const [dv, len, slope] = rule.trunk, [bx, by] = ctx.P(cx, foot + dv);
      for (let k = 0; k < len; k++) for (const t of [0, 1]) shadow.set(Math.trunc(bx + k), Math.trunc(by + k * slope + t));
    }
  }
  for (const [u, v, rx, ry, salt] of st.casts ?? []) { const [cx, cy] = ctx.P(u, v); cast(cx, cy, rx, ry, salt); }
  // the rim of the wood is the old light: only it needs the edges of a wetwood (under the sun the wood is any mass of `wood`)
  const edge = edges(ctx, 'glenshade');
  const [rb, rm, rp, rrow, rs] = st.rim ?? [4, 5, 9, 3.3, 431];
  const on = new Set(st.on);
  for (let y = 0; y < H; y++) {
    const e = edge.left(y), reach = rb + rm * fbm(y / rp, rrow, rs, 2);
    for (let x = Math.trunc(e); x < Math.trunc(e + reach) + 1; x++) {
      if (x >= 0 && x < W && ctx.kindAt(x, y) !== st.wood && y < top(x)) shadow.set(x, y);
    }
  }
  clean(shadow, 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!shadow.has(x, y) || !on.has(ctx.kindAt(x, y))) continue;
    const k = ctx.kindAt(x, y);
    let c = ctx.shade(g.get(x, y), k);
    if (deep.has(x, y)) c = ctx.shade(c, k);
    g.set(x, y, c);
  }
}

// ------------------------------------------------------------------ the small things

const TUFTS = [['h...h', '.l.l.', '..l..'], ['h.h', 'l.l', '.l.'], ['.h...h.', 'hl.h.lh', '.l.l.l.'], ['..h..', 'h.l.h', '.lll.']];

export function runGlenlitter(ctx: Ctx, st: GlenlitterStep): void {
  const { W, H, ox, mw } = ctx, g = ctx.ground, rnd = () => ctx.rnd();
  const earth = need(ctx, 'earth', 'glenlitter'), dE = dist(ctx, 'earth', 'glenlitter'), farW = dist(ctx, 'land', 'glenlitter');
  const grass = st.grass, G = ctx.mat(grass).ramp, GRASS = new Set(G.slice(1));
  const kind = (x: number, y: number) => ctx.kindAt(x, y);
  // tufts
  const tf = st.tufts ?? {};
  const tips = ctx.layer(tf.layer ?? 'mechones'), shapes = tf.shapes ?? TUFTS;
  const [oddsNear, oddsFar] = tf.odds ?? [0.9, 0.35], [spNear, spFar] = tf.spacing ?? [8, 11], [nearW, nearE] = tf.near ?? [10, 6];
  const [unkColor, unkTone] = tf.unknown ?? ['vida sombra', 1];
  const placed: Pt[] = [];
  for (let n = 0; n < (tf.count ?? 9000); n++) {
    const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
    if (kind(x, y) !== grass) continue;
    let edge = farW[y * W + x] < nearW;
    if (!edge && dE[y * W + x] === 0) {
      for (const i of [-nearE, 0, nearE]) for (const j of [-nearE, 0, nearE]) if (earth.has(x + i, y + j)) edge = true;
    }
    if (rnd() > (edge ? oddsNear : oddsFar)) continue;
    const r = edge ? spNear : spFar;
    if (!placed.every(([a, b]) => (x - a) ** 2 + (y - b) ** 2 >= r * r)) continue;
    const shape = shapes[Math.trunc(rnd() * shapes.length)];
    const sh = shape.length, sw = shape[0].length, x0 = x - Math.floor(sw / 2), y0 = y - sh + 1;
    let ok = true;
    for (let j = 0; j < sh && ok; j++) for (let i = 0; i < sw; i++) {
      if (shape[j][i] !== '.' && !(x0 + i >= 0 && x0 + i < W && y0 + j >= 0 && y0 + j < H && kind(x0 + i, y0 + j) === grass)) { ok = false; break; }
    }
    if (!ok) continue;
    const here = g.get(x, y);
    let t = here === null ? -1 : G.indexOf(here);
    if (t < 0) t = here === unkColor ? unkTone : -1;
    if (t < 0) continue;
    const top = G.length - 1;
    const lc = G[Math.min(top, t + 1)], hc = G[Math.min(top, t + 2)], dc = G[Math.max(1, t - 1)];
    shape.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === 'l') g.set(x0 + i, y0 + j, lc);
      else if (ch === 'h') tips.set(x0 + i, y0 + j, hc);
    }));
    for (let i = 0; i < sw; i++) {
      const c = g.get(x0 + i + 1, y0 + sh);
      if (c !== null && GRASS.has(c) && shape[sh - 1][i] !== '.') g.set(x0 + i + 1, y0 + sh, dc);
    }
    placed.push([x, y]);
  }
  // pale flowers by the water
  const fl = st.flowers ?? {};
  const [fOdds, fA, fB] = fl.colors ?? [0.6, ['túnica luz', 'pergamino'], ['celeste luz', 'túnica luz']];
  const reach = fl.reach ?? 8, far = fl.far ?? 22, stem = fl.stem ?? 'hoja sombra';
  const onFlower = new Set([...GRASS, unkColor]);
  for (let n = 0; n < (fl.count ?? 36); n++) {
    const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
    if (kind(x, y) !== grass || !(ox - reach < x && x < ox + mw + reach) || farW[y * W + x] > far) continue;
    const cols = rnd() < fOdds ? fA : fB;
    const many = 2 + Math.trunc(rnd() * 4);
    for (let j = 0; j < many; j++) {
      const X = x + Math.trunc((rnd() - 0.5) * 8), Y = y + Math.trunc((rnd() - 0.5) * 5);
      if (X >= 0 && X < W && Y + 1 >= 0 && Y + 1 < H && kind(X, Y) === grass && kind(X, Y + 1) === grass && onFlower.has(g.get(X, Y) ?? '')) {
        g.set(X, Y, cols[Math.trunc(rnd() * cols.length)]);
        g.set(X, Y + 1, stem);
      }
    }
  }
  // pebbles and puddles on the earth, pebbles on the beach
  for (let n = 0; n < (st.stones?.count ?? 1300); n++) {
    const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
    const de = dE[y * W + x];
    if (kind(x, y) === st.earth && de >= 3 && rnd() < 0.2) {
      const r = rnd();
      if (r < 0.12 && de >= 4) {
        const pw = 4 + Math.trunc(rnd() * 3);
        let ok = true;
        for (let i = -1; i < pw + 1 && ok; i++) for (let j = -1; j < 3; j++) {
          if (!(earth.has(x + i, y + j) && kind(x + i, y + j) === st.earth && dE[(y + j) * W + x + i] >= 3)) { ok = false; break; }
        }
        if (ok) {
          for (let i = 0; i < pw; i++) {
            g.set(x + i, y, 'madera sombra');
            g.set(x + i, y + 1, i === 1 ? 'celeste luz' : i === 0 ? 'celeste oscuro' : 'celeste');
            if (i > 0 && i < pw - 1) g.set(x + i, y + 2, 'celeste oscuro');
            ctx.setKind(x + i, y + 1, st.water);
          }
        }
      } else if (r < 0.4) {
        g.set(x, y, 'piedra');
        if (earth.has(x + 1, y + 1) && kind(x + 1, y + 1) === st.earth) g.set(x + 1, y + 1, 'madera sombra');
        if (earth.has(x - 1, y) && kind(x - 1, y) === st.earth) g.set(x - 1, y, 'piedra clara');
      } else g.set(x, y, g.get(x, y) !== 'tierra' ? 'tierra' : 'madera clara');
    } else if (kind(x, y) === st.beach && rnd() < 0.35) {
      const c = g.get(x, y);
      if (c === 'arena' || c === 'madera clara') {
        const pc = (['piedra clara', 'piedra', 'niebla sombra'] as const)[Math.trunc(rnd() * 3)];
        g.set(x, y, pc);
        if (kind(x + 1, y) === st.beach && rnd() < 0.6) g.set(x + 1, y, pc !== 'piedra' ? 'piedra' : 'piedra sombra');
        if (y + 1 < H && kind(x, y + 1) === st.beach) g.set(x, y + 1, 'tierra');
      }
    }
  }
  // fallen leaves near the trees
  const lv = st.leaves ?? {}, lr = lv.r ?? 26, lcols = lv.colors ?? ['oro', 'hoja clara', 'madera clara'];
  const trees = (ctx.game.decor ?? []).filter(p => !p.landmark && p.sprite.startsWith('arbol')).map(p => ctx.P(p.at[0] + 1.0, p.at[1] + 0.6));
  const onLeaf = new Set([st.earth, grass, st.beach]);
  for (let n = 0; n < (lv.count ?? 500); n++) {
    const x = Math.trunc(rnd() * W), y = Math.trunc(rnd() * H);
    if (!onLeaf.has(kind(x, y)) || !trees.some(([a, b]) => Math.hypot(x - a, y - b) < lr) || rnd() < 0.55) continue;
    g.set(x, y, lcols[Math.trunc(rnd() * lcols.length)]);
    const below = g.get(x, y + 1);
    if (below !== null && kind(x, y + 1) !== st.water) g.set(x, y + 1, ctx.shade(below, kind(x, y + 1)));
  }
}

// ------------------------------------------------------------------ what moves on the water

export function runGlenflow(ctx: Ctx, st: GlenflowStep): void {
  const { W, H } = ctx, name = st.water, t = (i: number) => ctx.tone(name, i);
  const water = need(ctx, 'water', 'glenflow'), pool = need(ctx, 'pool', 'glenflow'), stream = need(ctx, 'stream', 'glenflow');
  const river = need(ctx, 'river', 'glenflow'), dW = dist(ctx, 'water', 'glenflow'), top = lineY(ctx, st.river);
  const [lg, ls, lr] = st.layers ?? ['brillos', 'corriente', 'rio'];
  const glints = ctx.layer(lg), sflow = ctx.layer(ls), rflow = ctx.layer(lr);
  const [along, across, sSalt, sAbove] = st.sun ?? [64, 13, 333, 0.6];
  const white = t(4), foam = t(3);
  const isW = (x: number, y: number) => ctx.kindAt(x, y) === name;
  const onlyStream = (x: number, y: number) => stream.has(x, y) && !pool.has(x, y) && !river.has(x, y);
  for (let k = 0; k < 9000; k++) {
    const x = Math.trunc(h2(k, 1, 451) * W), y = Math.trunc(h2(k, 2, 451) * H);
    if (!water.has(x, y) || !isW(x, y)) continue;
    if (onlyStream(x, y)) continue;
    if (dW[y * W + x] < 3) continue;
    const sunny = fbm((x + y) * 0.7071 / along, (y - x) * 0.7071 / across, sSalt, 3) > sAbove;
    const n = 2 + Math.trunc(h2(k, 3, 451) * 2);
    if (h2(k, 4, 451) > (pool.has(x, y) ? 0.18 : 0.1)) continue;
    let free = true;
    for (let i = -3; i < n + 3 && free; i++) for (const j of [-1, 0, 1]) if (glints.get(x + i, y + j) !== null) { free = false; break; }
    if (!free) continue;
    let all = true;
    for (let i = 0; i < n; i++) if (!(water.has(x + i, y) && isW(x + i, y))) { all = false; break; }
    if (!all) continue;
    for (let i = 0; i < n; i++) glints.set(x + i, y, sunny ? white : foam);
  }
  if (st.fall) {
    const [fx, fy] = ctx.P(st.fall[0], st.fall[1]);
    for (let k = 0; k < 140; k++) {
      const x = Math.trunc(fx + (h2(k, 1, 453) - 0.5) * 36), y = Math.trunc(fy + (h2(k, 2, 453) - 0.2) * 14);
      if (pool.has(x, y) && glints.get(x, y) === null && glints.get(x - 1, y) === null) {
        glints.set(x, y, h2(k, 3, 453) < 0.5 ? white : foam);
        if (h2(k, 4, 453) < 0.4) glints.set(x + 1, y, foam);
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (onlyStream(x, y) && water.has(x, y) && isW(x, y)) {
      if (h2(x, Math.floor(y / 3), 455) < 0.16 && dW[y * W + x] >= 2) {
        const n = 2 + Math.trunc(h2(x, y, 456) * 3);
        for (let j = 0; j < n; j++) if (stream.has(x, y + j) && isW(x, y + j)) sflow.set(x, y + j, j === 0 ? white : foam);
      }
    }
    if (river.has(x, y) && isW(x, y) && y - top(x) > 4) {
      if (h2(Math.floor(x / 6), y, 457) < 0.035 && h2(x, y, 458) < 0.7) rflow.set(x, y, h2(x, y, 459) < 0.7 ? foam : white);
    }
  }
}

// ------------------------------------------------------------------ the boughs in front

export function runBoughs(ctx: Ctx, st: BoughsStep): void {
  const { W, H } = ctx, edge = edges(ctx, 'boughs'), top = lineY(ctx, st.river), earth = need(ctx, 'earth', 'boughs');
  const layer = ctx.layer(st.layer ?? 'copas'), [salt, hSalt] = st.salts ?? [461, 467], [hang, tip] = st.hang ?? ['hoja clara', 'bambú'];
  const over: [number, number, number, string[], 'l' | 'r'][] = [];
  for (let k = 0; k < (st.count ?? 70); k++) {
    const y = h2(k, 1, salt) * (H + 10) - 5, side = k % 2 === 0 ? 'l' : 'r';
    const e = side === 'l' ? edge.left(y) : edge.right(y);
    const r = 7 + h2(k, 2, salt) * 8, poke = 2 + h2(k, 3, salt) * 5;
    const cx = side === 'l' ? e - r + poke : e + r - poke;
    if (y + r > top(cx) - 4) continue;
    let hit = false;
    for (const i of [-r, 0, r]) for (const j of [-r, 0, r]) if (earth.has(Math.trunc(cx + i), Math.trunc(y + j))) hit = true;
    if (hit) continue;
    if (over.some(c => Math.abs(y - c[1]) < 38 && c[4] === side)) continue;
    over.push([cx, y, r, side === 'l' ? st.ramps[0] : st.ramps[1], side]);
  }
  const sorted = [...over].sort((p, q) => p[1] - q[1]).map(c => [c[0], c[1], c[2], c[3]] as Clump);
  const painted = paintClumps(W, H, sorted, salt + 4);
  for (const [key, c] of painted) layer.set(key % W, Math.floor(key / W), c);
  for (let x = 0; x < W; x++) {
    let low = -1;
    for (let y = 0; y < H; y++) if (layer.get(x, y) !== null) low = y;
    if (low < 0 || h2(x, 1, hSalt) > 0.3) continue;
    const n = 2 + Math.trunc(h2(x, 2, hSalt) * 5);
    for (let j = 1; j <= n; j++) layer.set(x, low + j, j < n ? hang : tip);
  }
}
