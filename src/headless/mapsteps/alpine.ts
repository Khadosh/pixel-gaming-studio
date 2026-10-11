// A snowy mountain: the snow and where it ends, the ledge over a sea of clouds
// with peaks that float, crags by a height field (snow on top, faces split in
// facets, veins of qi), a mountain wall, a wall of snowy conifers, trails
// (earth, trodden snow, wind-swept slabs), tracks, frozen ponds, shrubs, the
// shadows they cast and what lives on top (tufts of cold grass, stones poking
// out, sparkles and spindrift on layers). Port of the summit script of The
// Unwritten Dao (scripts/suelo_cumbre.py): same numbers, same pixels.

import { Mask, catmull, clean, distanceIn, fbm, h2, n1, organic, pyRound, ribbon, type Pt } from '../mapnoise';
import { paintClumps, texturePatches, type Clump, type Ctx, type Layer } from '../mappaint';
import { castColumn, castCrown, castLow, decorFoot, flushSun, shadeMask, sunOn } from './sun';
import { lightToward, litBy } from './rockform';
import type { Relief } from './rockformschema';
import type {
  CloudseaStep, ConifersStep, CragStep, LedgeStep, MountainStep, PondStep, ShadowsStep, ShrubStep, SnowfieldStep,
  SparklesStep, SpindriftStep, StonesStep, TracksStep, TrailStep, TussocksStep,
} from './alpineschema';

type Wave = [number, number, number];

/** Python's % (the sign of the divisor). */
const pyMod = (a: number, b: number): number => { let m = a % b; if (m !== 0 && (b < 0) !== (m < 0)) m += b; return m; };

const LINES = new WeakMap<Ctx, Map<string, (x: number) => number>>();
const SHADOW = new WeakMap<Ctx, Mask>();

function lines(ctx: Ctx): Map<string, (x: number) => number> {
  let m = LINES.get(ctx);
  if (!m) { m = new Map(); LINES.set(ctx, m); }
  return m;
}
function lineOf(ctx: Ctx, id: string): (x: number) => number {
  const f = lines(ctx).get(id);
  if (!f) throw new Error(`map: no snowfield line "${id}"`);
  return f;
}
/** The shadow the crags leave pending until a shadows step lays it. */
export function pendingShadow(ctx: Ctx): Mask {
  let m = SHADOW.get(ctx);
  if (!m) { m = new Mask(ctx.W, ctx.H); SHADOW.set(ctx, m); }
  return m;
}

const isIn = (ctx: Ctx, kinds: string[]) => (x: number, y: number) => kinds.includes(ctx.kindAt(x, y));

/** An edge along y: base + Σ amount·n1(y / period, salt), summed left to right. */
function edgeFn(base: number, waves: Wave[]): (py: number) => number {
  return (py) => { let e = base; for (const [a, p, s] of waves) e += a * n1(py / p, s); return e; };
}

// ------------------------------------------------------------------ snow

function snowSurface(ctx: Ctx, mat: string, seed: number, only: Mask | null, hollows: [number, number]): void {
  const { W, H } = ctx, g = ctx.ground, t = (i: number) => ctx.tone(mat, i);
  const hol = new Mask(W, H), crest = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hf = fbm(x / 90.0, y / 26.0, seed, 3) + 0.18 * fbm(x / 30.0, y / 12.0, seed + 1, 2);
    if (hf < hollows[0]) hol.set(x, y);
    if (hf > hollows[1]) crest.set(x, y);
  }
  clean(hol, 3);
  clean(crest, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (only && !only.has(x, y)) continue;
    let c: string;
    if (hol.has(x, y)) {
      const up = y > 0 && !hol.has(x, y - 1);
      c = up && h2(Math.floor(x / 4), y, seed + 5) < 0.7 ? t(1) : t(2);
    } else if (y > 0 && hol.has(x, y - 1)) c = t(4);
    else if (crest.has(x, y) && y > 0 && !crest.has(x, y - 1)) c = t(4);
    else c = t(3);
    g.set(x, y, c);
    ctx.setKind(x, y, mat);
  }
  // frost and wind ripples: short flat dashes
  const n = Math.trunc(W * H / 900);
  for (let k = 0; k < n; k++) {
    const x = Math.trunc(h2(k, 1, seed + 7) * W), y = Math.trunc(h2(k, 2, seed + 7) * H);
    if (ctx.kindAt(x, y) !== mat || g.get(x, y) !== t(3)) continue;
    const ln = 2 + Math.trunc(h2(k, 3, seed + 7) * 4);
    let ok = true;
    for (let i = 0; i < ln && ok; i++) ok = x + i >= 0 && x + i < W && ctx.kindAt(x + i, y) === mat && g.get(x + i, y) === t(3);
    if (ok) for (let i = 0; i < ln; i++) g.set(x + i, y, t(2));
  }
}

export function runSnowfield(ctx: Ctx, st: SnowfieldStep): void {
  const { W, H, cell, oy } = ctx, mat = st.material, seed = st.salt ?? 321;
  const hollows = st.hollows ?? [0.40, 0.70];
  const cv = st.cover;
  if (!cv) { snowSurface(ctx, mat, seed, null, hollows); return; }
  const cw = (cv.line.cells ?? [[0.6, 38, 301], [0.3, 12, 302]]) as Wave[];
  const pw = (cv.line.px ?? [[1.6, 4, 303]]) as Wave[];
  const v0 = cv.line.v;
  const lineAt = (x: number) => {
    let v = v0; for (const [a, p, s] of cw) v += a * n1(x / p, s);
    let y = oy + cell * v; for (const [a, p, s] of pw) y += a * n1(x / p, s);
    return y;
  };
  if (st.id) lines(ctx).set(st.id, lineAt);
  const [ba, bb, bw, bc, bs0, bs1, bo, babove, bclear] = cv.bare ?? [16, 9, 0.4, 5, 317, 311, 2, 0.7, 38.4];
  const [oc, oa, ob, ow, occ, os0, os1, oo, oabove] = cv.old ?? [4, 22, 11, 0.4, 6, 319, 313, 3, 0.55];
  const snow = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ln = lineAt(x);
    if (y < ln) {
      snow.set(x, y, !(fbm(x / ba, y / bb + bw * n1(x / bc, bs0), bs1, bo) > babove + Math.max(0.0, ln - bclear - y) / 14.0));
    } else {
      const d = (y - ln) / (cell * oc);
      snow.set(x, y, d < 1 && fbm(x / oa, y / ob + ow * n1(x / occ, os0), os1, oo) > oabove + d * 0.25);
    }
  }
  clean(snow, cv.smooth ?? 6);
  // small patches of old snow go (they read as scraps of paper)
  const min = cv.min ?? 70, seen = new Uint8Array(W * H);
  for (let i0 = 0; i0 < W * H; i0++) {
    if (!snow.data[i0] || seen[i0]) continue;
    const comp = [i0], stack = [i0];
    seen[i0] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = Y * W + X;
        if (X >= 0 && X < W && Y >= 0 && Y < H && snow.data[j] && !seen[j]) { seen[j] = 1; stack.push(j); comp.push(j); }
      }
    }
    if (comp.length < min) for (const i of comp) snow.data[i] = 0;
  }
  const grass = cv.grass;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ctx.setKind(x, y, snow.has(x, y) ? mat : grass);
  snowSurface(ctx, mat, seed, snow, hollows);
  const bare = new Mask(W, H);
  for (let i = 0; i < W * H; i++) bare.data[i] = snow.data[i] ? 0 : 1;
  texturePatches(ctx, bare, grass, seed + 10);
  // the lip: the snow has a thickness (lit on top, shaded below, its shadow on the grass)
  const g = ctx.ground, t = (i: number) => ctx.tone(mat, i);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = ctx.kindAt(x, y), up = ctx.kindAt(x, y - 1), dn = ctx.kindAt(x, y + 1);
    if (k === grass && up === mat) g.set(x, y, ctx.tone(grass, 1));
    if (k === mat && dn === grass) g.set(x, y, t(2));
    if (k === mat && up === grass) g.set(x, y, t(4));
  }
}

// ------------------------------------------------------------------ the ledge and the sea of clouds

export function runLedge(ctx: Ctx, st: LedgeStep): void {
  const { W, H, ox, mw } = ctx, g = ctx.ground, side = st.side === 'l' ? -1 : 1;
  const out = st.out ?? 4, salt = st.salt ?? 345;
  const edge = edgeFn(side < 0 ? ox - out : ox + mw + out, (st.wobble ?? [[3.0, 26, 341], [1.4, 9, 342]]) as Wave[]);
  const [f0, fa, fp, fs, na, np, ns] = st.width ?? [7, 4, 6, 343, 2.5, 17, 344];
  const faceW = (py: number) => f0 + fa * fbm(py / fp, 0.5, fs, 2) + na * n1(py / np, ns);
  const snowLine = st.snow && st.snow !== 'all' ? lineOf(ctx, st.snow[0]) : null;
  const below = st.snow && st.snow !== 'all' ? st.snow[1] : 0;
  const snowy = (x: number, y: number) => !snowLine || y < snowLine(x) + below;
  for (let y = 0; y < H; y++) {
    const e = edge(y), fw = faceW(y);
    for (let x = 0; x < W; x++) if (side < 0 ? x < e : x > e) ctx.setKind(x, y, st.sea);
    const x0 = side < 0 ? Math.trunc(e - fw) : Math.trunc(e), x1 = side < 0 ? Math.trunc(e) : Math.trunc(e + fw);
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= W) continue;
      const d = side < 0 ? e - x : x - e, f = d / fw, sn = snowy(x, y);
      let c: string;
      if (d < 1.2) c = sn ? 'túnica luz' : 'madera sombra';
      else if (d < 2.2 && sn) c = 'nieve sombra';
      else if (f > 0.92) c = 'nieve noche';
      else {
        const crack = h2(Math.floor(x / 3), Math.floor(y / 5), salt) < 0.3 && x % 3 === 0;
        c = f < 0.2 ? 'piedra' : f < 0.5 ? 'nieve honda' : f < 0.8 ? 'nieve noche' : 'túnica noche';
        if (side > 0) c = f < 0.35 ? 'nieve honda' : f < 0.75 ? 'nieve noche' : 'túnica noche';
        if (crack) c = ctx.shade(c, st.material)!;
        else if (h2(Math.floor(x / 2), Math.floor(y / 3), salt + 1) < 0.10 && f < 0.7) c = sn ? 'nieve sombra' : 'piedra';
      }
      g.set(x, y, c);
      ctx.setKind(x, y, st.material);
    }
  }
}

const CLOUD = ['túnica luz', 'nieve', 'nieve', 'nieve sombra', 'nieve honda'];

export function runCloudsea(ctx: Ctx, st: CloudseaStep): void {
  const { W, H, ox, mw } = ctx, g = ctx.ground, sea = st.sea, seed = st.salt ?? 351;
  const [xFrom, xTo] = st.side === 'l' ? [0, ox] : [ox + mw, W];
  const isSea = (x: number, y: number) => ctx.kindAt(x, y) === sea;
  for (let y = 0; y < H; y++) for (let x = xFrom; x < xTo; x++) {
    if (!isSea(x, y)) continue;
    const v = fbm(x / 40.0, y / 9.0, seed, 2);
    g.set(x, y, v > 0.55 ? 'celeste' : v > 0.38 ? 'nieve honda' : 'celeste oscuro');
  }
  const clouds: Clump[] = [];
  const every = st.banks ?? 26;
  for (let bank = 0, by = -6; by < H + 20; bank++, by += every) {
    let x = xFrom - 16.0 + h2(bank, 0, seed + 1) * 20;
    for (let k = 0; x < xTo + 16; k++) {
      const r = 6 + h2(bank, k, seed + 2) * 11;
      const y = by + 8 * n1(x / 40.0, seed + 3 + bank) + (h2(bank, k, seed + 4) - 0.5) * 6;
      if (h2(bank, k, seed + 5) < 0.86) clouds.push([x, y, r, CLOUD]);
      x += r * (0.9 + h2(bank, k, seed + 6) * 1.0);
    }
  }
  clouds.sort((p, q) => p[1] - q[1]);
  for (const [key, c] of paintClumps(W, H, clouds, seed + 7)) if (ctx.kind[key] === sea) g.px[key] = c;
  // peaks that float: columns of rock eaten by the clouds, snow and a small pine on top
  const ps = st.peak_salt ?? seed + 10;
  const peaks = (st.peaks ?? []).map(([u, v, hw, hh]) => [ctx.P(u, v)[0], ctx.P(0, v)[1], hw, hh] as [number, number, number, number]);
  peaks.forEach(([cx, top, hw, hh], k) => {
    for (let y = Math.trunc(top); y < Math.min(H, Math.trunc(top + hh)); y++) {
      const t = (y - top) / hh;
      const half = hw * (0.55 + 0.45 * t) + 1.0 * n1(y / 5.0, ps + k);
      for (let x = Math.trunc(cx - half) - 1; x < Math.trunc(cx + half) + 2; x++) {
        if (x < 0 || x >= W || !isSea(x, y)) continue;
        const dx = (x + 0.5 - cx) / Math.max(half, 1);
        if (Math.abs(dx) > 1) continue;
        let c: string;
        if (Math.abs(dx) > 0.84) c = dx > 0 ? 'nieve noche' : 'nieve honda';
        else if (dx < -0.25) c = t < 0.5 ? 'piedra clara' : 'piedra';
        else if (dx < 0.3) c = t < 0.5 ? 'piedra' : 'nieve honda';
        else c = t < 0.6 ? 'nieve honda' : 'nieve noche';
        if (h2(x, Math.floor(y / 4), ps + 20 + k) < 0.07 && Math.abs(dx) < 0.84) c = 'nieve sombra';
        g.set(x, y, c);
      }
    }
    for (let i = -hw - 1; i < hw + 2; i++) for (let j = -4; j < 3; j++) {
      const x = Math.trunc(cx + i), y = Math.trunc(top + j);
      const r = (i / (hw + 1)) ** 2 + ((j + 1.0) / 3.5) ** 2;
      if (r < 0.95 + 0.3 * n1(i * 0.8, ps + 40 + k) && x >= 0 && x < W && y >= 0 && y < H && isSea(x, y)) {
        g.set(x, y, j < 0 && i < 0 ? 'túnica luz' : j < 1 ? 'nieve' : 'nieve sombra');
      }
    }
    const px = Math.trunc(cx + hw * 0.35);
    for (const [j, w] of [[-6, 0], [-5, 1], [-4, 1], [-3, 2], [-2, 2]]) {
      for (let i = -w; i < w + 1; i++) {
        const x = px + i, y = Math.trunc(top) + j;
        if (x >= 0 && x < W && y >= 0 && y < H && isSea(x, y)) g.set(x, y, i < 0 ? 'hoja sombra' : 'túnica noche');
      }
    }
  });
  const feet: Clump[] = [];
  peaks.forEach(([cx, top, hw, hh], k) => {
    for (let i = -1; i < 2; i++) feet.push([cx + i * hw * 0.9, top + hh - 3 + 2 * h2(k, i, ps + 60), 6 + hw * 0.45, CLOUD]);
  });
  feet.sort((p, q) => p[1] - q[1]);
  for (const [key, c] of paintClumps(W, H, feet, ps + 61)) if (ctx.kind[key] === sea) g.px[key] = c;
}

// ------------------------------------------------------------------ crags

const KEY = (x: number, y: number) => (y + 4096) * 16384 + (x + 4096);

/** Voronoi seeds on a jittered grid stretched tall: the faces split in vertical slabs. Returns the owner cell key. */
function facets(seed: number, sx = 6, sy = 13): (x: number, y: number) => number {
  return (x, y) => {
    const gx = Math.floor(x / sx), gy = Math.floor(y / sy);
    let best = 0, bd = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cx = (gx + i + 0.5 + (h2(gx + i, gy + j, seed) - 0.5) * 0.9) * sx;
      const cy = (gy + j + 0.5 + (h2(gx + i, gy + j, seed + 1) - 0.5) * 0.9) * sy;
      const d = ((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2;
      if (d < bd) { best = KEY(gx + i, gy + j); bd = d; }
    }
    return best;
  };
}
const fx = (key: number) => (key % 16384) - 4096;
const fy = (key: number) => Math.floor(key / 16384) - 4096;

type Top = { x: number; y: number; t: 't'; bi: number; dx: number; dy: number; slope: number; fdx: number; gx: number; gy: number };
type Face = { x: number; y: number; t: 'f'; bi: number; d: number; dx: number };
type Part = Top | Face;

interface CragOpts {
  shadow: Mask | null; veins: number; veinLayer: Layer | null; snowCap: number; mark: string; ink: string;
  /** relief of its faces (mapsteps/rockform.ts): the lajas turned to the light of the recipe; null: as drawn before */
  relief?: Relief | null; light?: Pt;
  /** the top's rock (and its snow) shaded by the light from the ramp of this material instead of the fixed stone tones */
  topRamp?: string | null;
}

/**
 * A crag: masses [cx, cy, rx, ry, face] in px, back to front. Its height field
 * seen in 3/4: snow gathers on top (its lip lit, dripping down the face), the
 * south face of rock in facets lit from the left, violet shade on the right,
 * dark at the foot, a one px outline. Returns its pixels.
 */
export function crag(ctx: Ctx, blobs: number[][], seed: number, o: CragOpts): Map<number, Part> {
  const { W, H } = ctx, g = ctx.ground;
  const hmap = new Map<number, { x: number; y: number; h: number; bi: number; dx: number; dy: number }>();
  blobs.forEach(([cx, cyt, rx, ry, face], bi) => {
    const gcy = cyt + face;
    for (let gy = Math.trunc(gcy - ry * 1.4) - 1; gy < Math.trunc(gcy + ry * 1.4) + 2; gy++) {
      for (let x = Math.trunc(cx - rx * 1.4) - 1; x < Math.trunc(cx + rx * 1.4) + 2; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (gy + 0.5 - gcy) / ry;
        const a = Math.atan2(dy, dx);
        const rr = 1 + 0.13 * n1(a * 1.7 + bi, seed + bi) + 0.09 * Math.abs(n1(a * 4.5, seed + 9 + bi)) - 0.04;
        const r2 = (dx * dx + dy * dy) / (rr * rr);
        if (r2 > 1) continue;
        const cone = 1 - Math.sqrt(r2);
        const hgt = face * (0.35 + 0.65 * cone ** 0.8) * (1 + 0.3 * n1(x / 5.0, seed + 3 + bi))
          + 4.0 * Math.abs(n1(x / 3.0 + gy / 7.0, seed + 7));
        const k = KEY(x, gy), old = hmap.get(k);
        if (old === undefined || hgt > old.h) hmap.set(k, { x, y: gy, h: hgt, bi, dx, dy });
      }
    }
  });
  const part = new Map<number, Part>();
  const order = [...hmap.values()].sort((p, q) => p.y - q.y || p.x - q.x);
  for (const e of order) {
    const { x, y: gy, h: hgt, bi, dx, dy } = e;
    const top = pyRound(gy - hgt);
    const hl = hmap.get(KEY(x - 1, gy))?.h ?? hgt * 0.4;
    const hr = hmap.get(KEY(x + 1, gy))?.h ?? hgt * 0.4;
    const hu = hmap.get(KEY(x, gy - 1))?.h ?? hgt * 0.4;
    const hd = hmap.get(KEY(x, gy + 1))?.h ?? hgt * 0.4;
    const gxs = (hr - hl) / 2.0, gys = (hd - hu) / 2.0;
    const slope = Math.abs(gxs) + Math.max(0.0, hu - hgt);
    const nxt = hmap.get(KEY(x, gy + 1));
    const nexttop = nxt ? pyRound(gy + 1 - nxt.h) : gy + 1;
    const fdx = -0.45 * gxs + 0.6 * dx;
    if (top >= 0 && top < H) part.set(KEY(x, top), { x, y: top, t: 't', bi, dx, dy, slope, fdx, gx: gxs, gy: gys });
    if (nexttop - top <= 2 && nxt) {
      for (let y = top + 1; y < gy + 1; y++) part.set(KEY(x, y), { x, y, t: 't', bi, dx, dy, slope, fdx, gx: gxs, gy: gys });
      continue;
    }
    for (let y = top + 1; y < gy + 1; y++) {
      part.set(KEY(x, y), { x, y, t: 'f', bi, d: (y - top) / Math.max(1, gy - top), dx: Math.max(-1.0, Math.min(1.0, fdx)) });
    }
  }
  // no one-pixel spikes
  for (let p = 0; p < 2; p++) {
    for (const k of [...part.keys()]) {
      const q = part.get(k)!;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([i, j]) => part.has(KEY(q.x + i, q.y + j))).length;
      if (n <= 1) part.delete(k);
    }
  }
  const rel = o.relief ?? null, [rlx, rly] = o.light ?? [-1, 0];
  // with relief the lajas are wider (fewer facets: bigger slabs) and each turns its own way to the light
  const lajaW = rel ? Math.round(30 / (rel.facets ?? 5)) + 2 : 6;
  const fo = rel ? facets(seed + 31, lajaW, lajaW * 2) : facets(seed + 31);
  const lsx = rlx > 0.2 ? 1 : rlx < -0.2 ? -1 : 0;
  // what of the top is rock (steep, or where it shows): clean patches
  let rocky = new Map<number, boolean>();
  for (const [k, pr] of part) {
    if (pr.t === 't') {
      const v = fbm(pr.x / 7.0, pr.y / 4.0, seed + 41, 2) + 0.35 * (-pr.dx - pr.dy) * 0.5;
      rocky.set(k, pr.slope > 1.9 - o.snowCap || v < 0.82 - o.snowCap);
    }
  }
  // (shaded from the ramp the rock is darker than the old stone: a scrap of snow on it reads as a speck, so the patches
  // are smoothed twice more)
  for (let p = 0; p < (o.topRamp ? 5 : 2); p++) {
    const next = new Map<number, boolean>();
    for (const [k, r] of rocky) {
      const pr = part.get(k)!;
      let n = 0, s = 0;
      for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
        const v = rocky.get(KEY(pr.x + i, pr.y + j));
        if (v !== undefined) { n++; if (v) s++; }
      }
      next.set(k, s * 2 > n + 1 ? true : s * 2 < n - 1 ? false : r);
    }
    rocky = next;
  }
  const out = (X: number, Y: number) => !part.has(KEY(X, Y));
  const topTone = o.topRamp ? cragTopTones(ctx, part, o.topRamp, seed, rel, o.light ?? [-1, 0]) : null;
  for (const pr of part.values()) {
    const { x, y } = pr;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    let c: string;
    if (pr.t === 'f') {
      const { bi, d: t, dx } = pr;
      const f = fo(x, y);
      const fr = h2(fx(f), fy(f), seed + 33) * 2 - 1;
      let lum = -1.15 * dx - 0.3 * fr - 0.6 * t + 0.08;
      if (rel) {
        // the laja faces nx (−1 left, +1 right), turned by its own salt as much as the relief stands out; lit by how
        // much it looks at the light across, a little more near the top when the light comes from behind it
        const nx = Math.max(-1.3, Math.min(1.3, dx + 0.55 * (rel.height ?? 1) * (h2(fx(f), fy(f), seed + 35) * 2 - 1)));
        const facing = lsx === 0 ? 0 : nx * lsx;
        lum = 1.25 * facing * Math.sqrt(Math.abs(rlx)) - 0.15 * fr - 0.6 * t + 0.08 + 0.3 * Math.max(0, -rly) * (1 - t);
        // the core: just under the lip, on a laja turned away
        if (facing < 0 && t < 0.3) lum -= 0.4;
      }
      c = lum > 0.5 ? 'piedra clara' : lum > 0.05 ? 'piedra' : lum > -0.5 ? 'nieve honda' : 'nieve noche';
      if (fo(x + 1, y) !== f) c = c !== 'nieve noche' ? 'nieve noche' : o.ink;
      else if (fo(x - 1, y) !== f && lum > -0.2) c = lum > 0.2 ? 'piedra clara' : 'piedra';
      else if (fo(x, y + 1) !== f && h2(fx(f), fy(f), seed + 34) < 0.2) c = dx < 0.3 && t < 0.7 ? 'nieve sombra' : 'nieve honda';
      if (rel) {
        // cracks: a fine line down the middle of some lajas, in the ink; the rim: one px of light inside the edge
        // that meets the light
        const mid = Math.round((fx(f) + 0.5) * lajaW);
        if (x === mid && t > 0.15 && t < 0.75 && h2(fx(f), fy(f), seed + 38) < Math.min(3, rel.cracks ?? 1) * 0.25) c = o.ink;
        else if (lsx !== 0 && out(x + 2 * lsx, y) && !out(x + lsx, y) && lum > -0.5) c = 'piedra clara';
      }
      if (out(x, y + 1)) c = o.ink;
      else if (out(x - 1, y) || out(x + 1, y)) c = o.ink;
      const above = part.get(KEY(x, y - 1));
      if (above && above.t === 't' && !rocky.get(KEY(x, y - 1)) && h2(Math.floor(x / 2), bi, seed + 37) < 0.6) {
        c = dx < 0.25 ? 'nieve sombra' : 'nieve honda';
      }
    } else if (topTone) {
      c = topTone(pr, rocky.get(KEY(x, y)) ?? false, rocky.get(KEY(x, y - 1)), out(x, y - 1) || out(x - 1, y) || out(x + 1, y),
        [1, 2, 3].every(k => part.get(KEY(x, y + k))?.t === 'f'));
    } else {
      const { dx, dy, fdx } = pr;
      if (out(x, y - 1) || out(x - 1, y) || out(x + 1, y)) c = dx < 0.3 ? 'nieve honda' : 'nieve noche';
      else if (rocky.get(KEY(x, y))) {
        c = fdx < -0.35 ? 'piedra clara' : fdx < 0.15 ? 'piedra' : 'nieve honda';
        if (rocky.get(KEY(x, y - 1)) === false) c = fdx > 0 ? 'nieve noche' : 'piedra sombra';
      } else {
        const l2 = -0.7 * dx - 0.8 * dy;
        c = l2 > 0.6 ? 'túnica luz' : l2 > -0.3 ? 'nieve' : 'nieve sombra';
        if ([1, 2, 3].every(k => part.get(KEY(x, y + k))?.t === 'f') && dx < 0.4) c = 'túnica luz';
      }
    }
    g.set(x, y, c);
    ctx.setKind(x, y, o.mark);
  }
  // the shadow it casts: under the sun each column of its height field from its foot up, never on itself
  if (o.shadow && ctx.sun) {
    for (const e of hmap.values()) castColumn(ctx, e.x, e.y, e.h, (X, Y) => part.has(KEY(X, Y)));
  } else if (o.shadow) {
    for (const e of hmap.values()) {
      const reach = Math.trunc(e.h * 0.55) + 2;
      for (let k = 1; k < reach; k++) {
        const X = e.x + k, Y = e.y + Math.trunc(k * 0.55) + 1;
        if (!part.has(KEY(X, Y)) && X >= 0 && X < W && Y >= 0 && Y < H) o.shadow.set(X, Y);
      }
    }
  }
  // veins of qi: they climb the face, thin, and fork
  if (o.veins) {
    const faces = [...part.values()].filter(p => p.t === 'f' && p.d > 0.25).map(p => [p.x, p.y] as Pt);
    faces.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (let v = 0; v < o.veins; v++) {
      if (!faces.length) break;
      const [sx, sy] = faces[Math.trunc(h2(v, 1, seed + 51) * faces.length)];
      const pts: Pt[] = [];
      let x = sx, y = sy;
      for (let step = 0; step < 60; step++) {
        const pr = part.get(KEY(x, y));
        if (!pr || pr.t !== 'f') break;
        pts.push([x, y]);
        y -= 1;
        const r = h2(step, v, seed + 53);
        x += r < 0.28 ? 1 : r > 0.72 ? -1 : 0;
      }
      pts.forEach(([X, Y], i) => {
        if (g.get(X, Y) === o.ink) return;
        g.set(X, Y, i % 5 ? 'qi sombra' : 'qi');
        o.veinLayer?.set(X, Y, i % 3 === 0 ? 'ojo' : 'qi');
      });
    }
  }
  return part;
}

/**
 * The top of a crag shaded by the light from the ramp of `mat` (crag `top_colors: "ramp"`): the normal of its height
 * field (the slope across and along, as `relief` reads a rock) against the light of the recipe, raised 35°. The flat
 * top takes the main tone of the material (`base`), a slope toward the light one or two up, one away one or two down;
 * the edge two down on the side away from the light and one on the other, the rock just under the snow one down.
 * With `relief` the top breaks in planes too (Voronoi cells, each tilted by its salt as much as `height`), and where
 * two planes of one band meet the one turned farther from the light goes a tone down: a ridge, not a line of ink.
 * Its snow takes the same light (lit, snow, shadow).
 */
function cragTopTones(ctx: Ctx, part: Map<number, Part>, mat: string, seed: number, rel: Relief | null, light: Pt) {
  const n = ctx.mat(mat).ramp.length, base = ctx.base(mat);
  const tone = (i: number) => ctx.tone(mat, Math.max(0, Math.min(n - 1, i)));
  const s0 = litBy(0, 0, light), [lx, ly] = light;
  const w = rel ? Math.round(36 / (rel.facets ?? 5)) + 3 : 0;
  const cell = rel ? facets(seed + 61, w * 1.4, w) : null;
  const tilt = (key: number): Pt => [(h2(fx(key), fy(key), seed + 62) - 0.5) * 0.7 * (rel?.height ?? 1), (h2(fx(key), fy(key), seed + 63) - 0.5) * 0.7 * (rel?.height ?? 1)];
  /** how much more (or less) lit than a flat top: the slope of the field halved (seen from above it reads flatter) */
  const lit = (p: Top, x: number, y: number): number => {
    let gx = 0.5 * p.gx, gy = 0.5 * p.gy;
    if (cell) { const [tx, ty] = tilt(cell(x, y)); gx += tx; gy += ty; }
    return litBy(gx, gy, light) - s0;
  };
  const band = (d: number) => (d > 0.22 ? 2 : d > 0.08 ? 1 : d > -0.1 ? 0 : d > -0.28 ? -1 : -2);
  return (p: Top, rocky: boolean, rockyAbove: boolean | undefined, edge: boolean, overFace: boolean): string => {
    const { x, y } = p;
    if (edge) return tone(base + ((p.dx * lx + p.dy * ly) > -0.3 ? -1 : -2));
    const d = lit(p, x, y);
    if (!rocky) {
      if (overFace && p.dx * lx + p.dy * ly > -0.4) return 'túnica luz';
      return d > 0.1 ? 'túnica luz' : d > -0.15 ? 'nieve' : 'nieve sombra';
    }
    if (rockyAbove === false) return tone(base - 1);
    let b = band(d);
    if (cell) {
      // a ridge between two planes of one band: the px of the plane turned farther from the light one down
      const f = cell(x, y);
      for (const [i, j] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const q = part.get(KEY(x + i, y + j));
        if (!q || q.t !== 't' || cell(x + i, y + j) === f) continue;
        const e = lit(q, x + i, y + j);
        if (band(e) === b && e > d) { b -= 1; break; }
      }
    }
    return tone(base + b);
  };
}

export function runCrag(ctx: Ctx, st: CragStep): void {
  const { W, H } = ctx, g = ctx.ground, mark = st.material;
  const blobs = st.masses.map(([u, v, rx, ry, face, dy]) => { const [cx, cy] = ctx.P(u, v); return [cx, cy + (dy ?? 0), rx, ry, face]; });
  const part = crag(ctx, blobs, st.salt, {
    shadow: st.shadow ? pendingShadow(ctx) : null, veins: st.veins ?? 0,
    veinLayer: st.veins ? ctx.layer(st.vein_layer ?? 'vetas') : null, snowCap: st.snow_cap ?? 0.42, mark,
    ink: st.ink ?? 'túnica noche',
    relief: st.relief ?? null,
    light: (st.relief || st.top_colors === 'ramp') && blobs.length ? lightToward(ctx, blobs[0][0], blobs[0][1] + blobs[0][4]) : undefined,
    topRamp: st.top_colors === 'ramp' ? mark : null,
  });
  if (st.cleft) {
    const [u, v, rows = 8, spread = 0.45] = st.cleft;
    const [gx, gy] = ctx.P(u, v);
    for (let y = Math.trunc(gy) - (rows - 1); y < Math.trunc(gy) + 1; y++) {
      const w = (y - (gy - rows)) * spread;
      for (let x = Math.trunc(gx - w); x < Math.trunc(gx + w) + 1; x++) {
        if (ctx.kindAt(x, y) === mark) g.set(x, y, Math.abs(x - gx) < w - 0.7 ? 'túnica noche' : 'nieve noche');
      }
    }
  }
  if (st.face_colors) {
    for (const pr of part.values()) {
      if (pr.t === 'f' && pr.x >= 0 && pr.x < W && pr.y >= 0 && pr.y < H) {
        const c = g.get(pr.x, pr.y)!;
        g.set(pr.x, pr.y, st.face_colors[c] ?? c);
      }
    }
  }
  const tc = st.top_colors;
  if (tc && tc !== 'ramp') {
    for (const pr of part.values()) {
      if (pr.t === 't' && pr.x >= 0 && pr.x < W && pr.y >= 0 && pr.y < H) {
        const c = g.get(pr.x, pr.y)!;
        g.set(pr.x, pr.y, tc[c] ?? c);
      }
    }
  }
  if (st.mouth) {
    const m = st.mouth, [mx, my] = ctx.P(m.at[0], m.at[1]), [rx, ry] = m.r, rim = m.rim ?? 0.72;
    const [left, right, inside] = m.colors ?? ['nieve noche', 'nieve honda', 'túnica noche'];
    const irx = Math.trunc(rx), iry = Math.trunc(ry);
    for (let y = Math.trunc(my) - iry - 1; y < Math.trunc(my) + 1; y++) {
      for (let x = Math.trunc(mx) - irx - 2; x < Math.trunc(mx) + irx + 3; x++) {
        const dx = (x + 0.5 - mx) / rx, dy = (y + 0.5 - my) / ry;
        if (dx * dx + dy * dy <= 1.0 && ctx.kindAt(x, y) === mark) {
          g.set(x, y, dx * dx + dy * dy > rim ? (dx < 0 ? left : right) : inside);
        }
      }
    }
    if (m.icicles) {
      const [salt, curve, most] = m.icicles;
      for (let i = 0, x = Math.trunc(mx) - irx; x < Math.trunc(mx) + irx + 1; i++, x += 2) {
        const top = Math.trunc(my) - iry + Math.trunc(Math.abs(x - mx) ** 1.6 * curve);
        for (let k = 0; k < 1 + Math.trunc(h2(i, 1, salt) * most); k++) {
          if (g.get(x, top + k) === inside) g.set(x, top + k, k === 0 ? 'ojo' : 'celeste luz');
        }
      }
    }
  }
  if (st.icicles !== undefined) {
    for (const pr of part.values()) {
      const { x, y } = pr;
      if (pr.t === 'f' && !part.has(KEY(x, y + 1)) && h2(x, y, st.salt + 1) < st.icicles && x % 2 === 0) {
        g.set(x, y, 'ojo');
        if (y - 1 >= 0 && y - 1 < H && part.get(KEY(x, y - 1))?.t === 'f') g.set(x, y - 1, 'celeste luz');
      }
    }
  }
}

export function runMountain(ctx: Ctx, st: MountainStep): void {
  const { W, H, ox } = ctx, g = ctx.ground, salt = st.salt ?? 553;
  const edge = edgeFn(ox - (st.out ?? 3), (st.wobble ?? [[2.6, 21, 551], [1.3, 7, 552]]) as Wave[]);
  const blobs: number[][] = [];
  for (let k = 0; k < (st.count ?? 60); k++) {
    const y = h2(k, 1, salt) * (H + 40) - 20;
    const x = edge(y) - 4 - h2(k, 2, salt) * 120;
    blobs.push([x, y, 16 + h2(k, 3, salt) * 14, 9 + h2(k, 4, salt) * 6, 10 + h2(k, 5, salt) * 12]);
  }
  blobs.sort((p, q) => (p[1] + p[3] + p[4]) - (q[1] + q[3] + q[4]));
  const part = crag(ctx, blobs, salt + 2, { shadow: st.shadow === false ? null : pendingShadow(ctx), veins: 0, veinLayer: null, snowCap: 0.42, mark: st.material, ink: 'túnica noche' });
  const [d1, d2] = st.depth ?? [26, 60];
  for (const { x, y } of part.values()) {
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const d = edge(y) - x;
    for (let i = 0; i < (d < d1 ? 0 : d < d2 ? 1 : 2); i++) g.set(x, y, ctx.shade(g.get(x, y), st.material));
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < Math.trunc(edge(y)) - 2; x++) {
      if (x >= 0 && x < W && st.on.includes(ctx.kindAt(x, y))) {
        g.set(x, y, ctx.shade(ctx.shade(g.get(x, y), st.material), st.material));
        ctx.setKind(x, y, st.material);
      }
    }
  }
}

// ------------------------------------------------------------------ the forest

export function runConifers(ctx: Ctx, st: ConifersStep): void {
  const { W, H, ox, mw } = ctx, g = ctx.ground, mark = st.material, seed = st.salt ?? 383;
  const edge = edgeFn(ox + mw + (st.out ?? 3), (st.wobble ?? [[2.4, 19, 381], [1.2, 7, 382]]) as Wave[]);
  const snowy = st.snow ? lineOf(ctx, st.snow) : null;
  const above = ctx.layer(st.layer ?? 'copas');
  const xTo = W;
  for (let y = 0; y < H; y++) {
    const e = edge(y);
    for (let x = Math.trunc(e); x < xTo; x++) {
      if (x >= 0 && x < W) { g.set(x, y, snowy && y < snowy(x) ? 'nieve noche' : 'túnica noche'); ctx.setKind(x, y, mark); }
    }
  }
  const trees: [number, number, number, number][] = [];
  for (let k = 0; k < (st.tries ?? 900); k++) {
    const x = h2(k, 1, seed) * (xTo + 30) - 10, y = h2(k, 2, seed) * (H + 30) - 10;
    const dd = x - edge(y);
    if (dd < -3 || x >= xTo + 8) continue;
    trees.push([y, x, Math.max(dd, 0), k]);
  }
  trees.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  for (const [fy, x, dd, k] of trees) {
    const depth = dd < 8 ? 0 : dd < 22 ? 1 : dd < 44 ? 2 : 3;
    const hgt = 15 + h2(k, 3, seed) * 9 - depth * 1.5, w = hgt * 0.42;
    const [body, snow] = depth === 0 ? [['hoja', 'hoja sombra', 'túnica noche'], ['túnica luz', 'nieve', 'nieve sombra']]
      : depth === 1 ? [['hoja sombra', 'túnica noche', 'túnica noche'], ['nieve', 'nieve sombra', 'nieve honda']]
      : depth === 2 ? [['túnica noche', 'túnica noche', 'túnica noche'], ['nieve sombra', 'nieve honda', 'nieve noche']]
      : [['túnica noche', 'túnica noche', 'túnica noche'], ['nieve honda', 'nieve noche', 'nieve noche']];
    const tiers = 3;
    for (let y = Math.trunc(fy - hgt); y < Math.trunc(fy) + 1; y++) {
      if (y < 0 || y >= H) continue;
      const t = (y - (fy - hgt)) / hgt;
      const tier = pyMod(t * tiers, 1.0);
      const half = w * (0.25 + 0.75 * t) * (0.55 + 0.45 * tier) + 0.5;
      for (let X = Math.trunc(x - half); X < Math.trunc(x + half) + 1; X++) {
        if (X < 0 || X >= W) continue;
        if (ctx.kindAt(X, y) !== mark && depth > 0) continue;
        const e = edge(y);
        if (X < e - 3) continue;
        const dxr = (X + 0.5 - x) / Math.max(half, 1);
        let c: string;
        if (Math.abs(dxr) > 0.82) c = body[2];
        else if (tier < 0.32) c = dxr < -0.1 ? snow[0] : dxr < 0.4 ? snow[1] : snow[2];
        else if (tier < 0.42) c = snow[2];
        else c = dxr < -0.2 ? body[0] : body[1];
        if (depth === 0 && X < e + 2) above.set(X, y, c);
        else { g.set(X, y, c); ctx.setKind(X, y, mark); }
      }
    }
    for (let y = Math.trunc(fy) + 1; y < Math.trunc(fy) + 3; y++) {
      const X = Math.trunc(x);
      if (y >= 0 && y < H && X >= 0 && X < W && ctx.kindAt(X, y) === mark) g.set(X, y, depth === 0 ? 'madera sombra' : 'túnica noche');
    }
  }
}

// ------------------------------------------------------------------ trails and tracks

function strokes(ctx: Ctx, st: TrailStep): { mask: Mask; curves: Pt[][] } {
  const { W, H } = ctx, mask = new Mask(W, H), curves: Pt[][] = [];
  for (const c of st.curves) {
    const cv = catmull(c.points.map(([u, v]) => ctx.P(u, v)));
    const [base, ...waves] = c.width as [number, ...Wave[]];
    ribbon(mask, cv, (i) => { let r = base; for (const [a, p, s] of waves) r += a * n1(i / p, s); return r; });
    curves.push(cv);
  }
  for (const [u, v, rx, ry, salt, wob, fine] of st.blobs ?? []) {
    const [cx, cy] = ctx.P(u, v);
    for (const [x, y] of organic(W, H, cx, cy, rx, ry, salt, wob ?? 0.14, fine ?? 0.05)) mask.set(x, y);
  }
  if (st.cover) {
    const [a, b, salt, oct, above] = st.cover;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask.has(x, y) && fbm(x / a, y / b, salt, oct) > above) mask.set(x, y, false);
  }
  clean(mask, st.smooth ?? 2);
  return { mask, curves };
}

export function runTrail(ctx: Ctx, st: TrailStep): void {
  const { W, H } = ctx, g = ctx.ground, mark = st.material, seed = st.salt;
  const { mask, curves } = strokes(ctx, st);
  if (st.id) { ctx.masks.set(st.id, mask); }
  const on = isIn(ctx, st.on);
  if (st.style === 'earth') {
    const d = distanceIn(mask);
    const t = (i: number) => ctx.tone(mark, i);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask.has(x, y) || !on(x, y)) continue;
      ctx.setKind(x, y, mark);
      let kOut: number | null = null;
      for (let k = 1; k < 4; k++) if (!mask.has(x - k, y - k)) { kOut = k; break; }
      let c: string;
      if (d[y * W + x] === 1) c = kOut === 1 ? t(0) : t(1);
      else if (kOut !== null && kOut <= 2) c = t(1);
      else {
        const v = fbm(x / 5.5, y / 4.5, seed, 3);
        c = v < 0.3 ? t(0) : v < 0.52 ? t(1) : v < 0.7 ? t(2) : t(3);
      }
      g.set(x, y, c);
    }
    if (st.grass) {
      const lip = ctx.tone(st.grass, 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (ctx.kindAt(x, y) === st.grass && ((y > 0 && ctx.kindAt(x, y - 1) === mark) || (x > 0 && ctx.kindAt(x - 1, y) === mark))) g.set(x, y, lip);
      }
    }
    // stones on the climb: two or three px with their shadow
    const n = Math.trunc(W * H / 60);
    for (let k = 0; k < n; k++) {
      const x = Math.trunc(h2(k, 1, seed + 5) * W), y = Math.trunc(h2(k, 2, seed + 5) * H);
      if (!(ctx.kindAt(x, y) === mark && d[y * W + x] >= 2 && mask.has(x + 2, y + 1) && y + 1 < H && d[(y + 1) * W + x] >= 2)) continue;
      const big = h2(k, 3, seed + 5) < 0.4;
      g.set(x, y, 'piedra clara');
      g.set(x + 1, y, big ? 'piedra' : 'piedra sombra');
      if (big) { g.set(x, y + 1, 'piedra'); g.set(x + 1, y + 1, 'piedra sombra'); g.set(x + 2, y + 1, 'madera sombra'); }
      else g.set(x + 1, y + 1, 'madera sombra');
    }
    if (st.slush) {
      const [id, below, salt, above] = st.slush, line = lineOf(ctx, id);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (ctx.kindAt(x, y) === mark && y < line(x) + below && fbm(x / 4.0, y / 3.0, salt, 2) > above && d[y * W + x] > 1) g.set(x, y, 'nieve sombra');
      }
    }
    return;
  }
  if (st.style === 'trodden') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask.has(x, y) || !on(x, y)) continue;
      let kOut: number | null = null, kIn: number | null = null;
      for (let k = 1; k < 3; k++) if (!mask.has(x - k, y - k)) { kOut = k; break; }
      for (let k = 1; k < 3; k++) if (!mask.has(x + k, y + k)) { kIn = k; break; }
      let c: string;
      if (kOut !== null) c = 'nieve honda';
      else if (kIn === 1) c = 'túnica luz';
      else c = fbm(x / 5.0, y / 4.0, seed, 2) < 0.8 ? 'nieve sombra' : 'nieve';
      g.set(x, y, c);
      ctx.setKind(x, y, mark);
    }
    // the outer rim, up-left: snow heaped in the sun
    for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
      if (on(x, y) && y + 1 < H && ctx.kindAt(x, y + 1) === mark && g.get(x, y) !== 'túnica luz') g.set(x, y, 'túnica luz');
    }
    const every = st.prints ?? 3;
    if (every > 0) tracks(ctx, curves.flat(), every, seed + 9, isIn(ctx, [mark]), false, 'nieve honda');
    return;
  }
  // slabs: rock swept by the wind, split in slabs, snow in some joints
  const fo = facets(seed, 9, 6);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y) || !on(x, y)) continue;
    const outUl = !mask.has(x - 1, y - 1) || !mask.has(x, y - 1);
    const outDr = !mask.has(x + 1, y + 1) || !mask.has(x, y + 1);
    const outDr2 = !mask.has(x, y + 2);
    const f = fo(x, y), tone = h2(fx(f), fy(f), seed + 2);
    let c: string;
    if (outDr) c = 'nieve noche';
    else if (outDr2) c = 'nieve honda';
    else if (outUl) c = h2(Math.floor(x / 3), y, seed + 3) < 0.5 ? 'nieve' : 'piedra clara';
    else if (fo(x + 1, y) !== f || fo(x, y + 1) !== f) c = h2(fx(f), fy(f), seed + 4) < 0.35 ? 'nieve sombra' : 'piedra sombra';
    else if (fo(x - 1, y) !== f || fo(x, y - 1) !== f) c = 'piedra clara';
    else {
      const v = fbm(x / 5.0, y / 4.0, seed + 5, 2) * 0.5 + tone * 0.5;
      c = v > 0.62 ? 'piedra clara' : v > 0.36 ? 'piedra' : 'piedra sombra';
    }
    g.set(x, y, c);
    ctx.setKind(x, y, mark);
  }
  // its shadow on the snow, down to the right
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
    if (on(x, y) && (ctx.kindAt(x - 1, y - 1) === mark || (y > 1 && ctx.kindAt(x - 1, y - 2) === mark))) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }
}

/** Prints along a curve: boots in pairs, each two px with a lit lip; paws in a line, 2 × 2 holes. */
function tracks(ctx: Ctx, curve: Pt[], every: number, seed: number, allowed: (x: number, y: number) => boolean, paws: boolean, color: string): void {
  void seed;
  const g = ctx.ground;
  for (let i = 0; i < curve.length - 1; i += every) {
    const [x0, y0] = curve[i], [x1, y1] = curve[Math.min(i + 1, curve.length - 1)];
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const side = Math.floor(i / every) % 2 ? 1 : -1;
    const off = paws ? 0.7 : 2;
    const px = pyRound(x0 - Math.sin(ang) * off * side), py = pyRound(y0 + Math.cos(ang) * off * side);
    const pat: [number, number, string][] = paws
      ? [[0, 0, 'nieve honda'], [1, 0, 'nieve honda'], [0, 1, 'nieve honda'], [1, 1, 'nieve noche'], [0, -1, 'túnica luz'], [2, 1, 'nieve sombra']]
      : [[0, 0, color], [1, 0, color], [0, -1, 'túnica luz'], [2, 1, 'nieve sombra']];
    for (const [dx, dy, c] of pat) {
      const X = px + dx, Y = py + dy;
      if (Y >= 0 && Y < ctx.H && X >= 0 && X < ctx.W && allowed(X, Y)) g.set(X, Y, c);
    }
  }
}

export function runTracks(ctx: Ctx, st: TracksStep): void {
  const curve = st.curves.flatMap(c => catmull(c.map(([u, v]) => ctx.P(u, v)), st.sample ?? 1.0));
  tracks(ctx, curve, st.every ?? 6, st.salt ?? 0, isIn(ctx, st.on), st.paws ?? true, st.color ?? 'nieve honda');
}

// ------------------------------------------------------------------ ice, shrubs, shadows

export function runPond(ctx: Ctx, st: PondStep): void {
  const { W, H } = ctx, g = ctx.ground, mark = st.material;
  for (const [u, v, rx, ry, s] of st.at) {
    const [cx, cy] = ctx.P(u, v);
    const pond = new Set<number>();
    for (const [x, y] of organic(W, H, cx, cy, rx, ry, s, 0.16, 0.05)) pond.add(KEY(x, y));
    const out = (X: number, Y: number) => !pond.has(KEY(X, Y));
    for (const k of pond) {
      const x = fx(k), y = fy(k);
      if (!st.on.includes(ctx.kindAt(x, y))) continue;
      let c: string;
      if (out(x, y - 1) || out(x - 1, y)) c = 'nieve honda';
      else if (out(x, y + 1) || out(x + 1, y)) c = 'túnica luz';
      else if (out(x, y - 2) || out(x - 2, y)) c = 'celeste';
      else {
        const vv = fbm(x / 9.0, y / 5.0, s + 1, 2);
        c = vv > 0.45 ? 'celeste luz' : 'ojo';
        if ([0, 1].includes(pyMod(x - y + Math.trunc(6 * n1(y / 7.0, s)), 23)) && vv > 0.35) c = 'ojo';
      }
      g.set(x, y, c);
      ctx.setKind(x, y, mark);
    }
    for (let gi = 0; gi < 3; gi++) {
      let x = cx + (h2(gi, 1, s) - 0.5) * rx, y = cy + (h2(gi, 2, s) - 0.5) * ry;
      let a = h2(gi, 3, s) * 6.28;
      for (let st2 = 0; st2 < Math.trunc(rx * 0.9); st2++) {
        const X = Math.trunc(x), Y = Math.trunc(y);
        if (pond.has(KEY(X, Y)) && ctx.kindAt(X, Y) === mark && ['celeste luz', 'ojo'].includes(g.get(X, Y) ?? '')) g.set(X, Y, 'celeste');
        a += (h2(st2, gi, s + 3) - 0.5) * 0.9;
        x += Math.cos(a);
        y += Math.sin(a) * 0.6;
      }
    }
  }
}

export function runShrub(ctx: Ctx, st: ShrubStep): void {
  const ramp = st.ramp ?? ['nieve', 'hoja', 'hoja sombra', 'túnica noche', 'túnica noche'];
  for (const [u, v, seed] of st.at) {
    const [cx, cy] = ctx.P(u, v);
    const j = (k: number, a: number) => (h2(k, a, seed) - 0.5) * 1.6;
    const cl: Clump[] = ([[0, -2, 3.6], [-3.5, 1, 3.4], [3.5, 0.5, 3.6], [0, 2, 3.4]] as const)
      .map(([dx, dy, r], k) => [cx + dx + j(k, 1), cy + dy + j(k, 2), r, ramp] as Clump);
    cl.sort((p, q) => p[1] - q[1]);
    for (const [key, c] of paintClumps(ctx.W, ctx.H, cl, seed)) { ctx.ground.px[key] = c; ctx.kind[key] = st.material; }
  }
}

function castRound(m: Mask, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  const lobes = 8 + pyMod(seed, 4);
  for (let y = Math.trunc(cy - ry * 1.3) - 1; y < Math.trunc(cy + ry * 1.3) + 2; y++) {
    for (let x = Math.trunc(cx - rx * 1.3) - 1; x < Math.trunc(cx + rx * 1.3) + 2; x++) {
      if (x < 0 || x >= m.w || y < 0 || y >= m.h) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const a = Math.atan2(dy, dx);
      const rr = 1 + 0.11 * Math.sin(a * lobes + seed) + 0.07 * n1(a * 2, seed);
      if (dx * dx + dy * dy <= rr * rr) m.set(x, y);
    }
  }
}

export function runShadows(ctx: Ctx, st: ShadowsStep): void {
  const { W, H, cell } = ctx, m = pendingShadow(ctx), g = ctx.ground;
  if (ctx.sun) {
    // the sun: a pine is a crown on its trunk, anything else big a pool from the ground to its top; the crags cast into
    // the sun's mask already, and the hand-placed shadows are laid as they are drawn, with every other one
    sunOn(ctx, st.on);
    if (st.decor !== false) for (const piece of ctx.game.decor ?? []) {
      if (piece.when || (piece.landmark && !st.landmarks) || (st.skip ?? []).includes(piece.sprite)) continue;
      const [w, h] = piece.size ?? [1, 1], [px, py, salt] = decorFoot(ctx, piece);
      if (piece.sprite.startsWith('pino')) castCrown(ctx, px, py, w, h, salt);
      else if (w * h >= 4) castLow(ctx, px, py, w, h, salt);
    }
    for (const [u, v, rx, ry, salt] of st.casts ?? []) { const [x, y] = ctx.P(u, v); castRound(m, x, y, rx, ry, salt); }
    clean(m, 1);
    shadeMask(ctx, m);
    flushSun(ctx);
    SHADOW.delete(ctx);
    return;
  }
  if (st.decor !== false) {
    for (const piece of ctx.game.decor ?? []) {
      if (piece.when) continue;
      if (piece.landmark && !st.landmarks) continue;
      if ((st.skip ?? []).includes(piece.sprite)) continue;
      const [w, h] = piece.size ?? [1, 1];
      const cx = piece.at[0] + 0.5 + (w % 2 === 0 ? 0.5 : 0), foot = piece.at[1] + 1;
      if (piece.sprite.startsWith('pino')) {
        const [sx, sy] = ctx.P(cx + 0.45 * w, foot - 0.15);
        castRound(m, sx, sy, 0.5 * w * cell, 0.2 * w * cell + 1, Math.trunc(cx * 7 + foot));
        const [bx, by] = ctx.P(cx, foot - 0.08);
        for (let k = 0; k < Math.trunc(0.45 * w * cell); k++) for (const t of [0, 1]) {
          const X = Math.trunc(bx + k), Y = Math.trunc(by + k * 0.4 + t);
          if (X >= 0 && X < W && Y >= 0 && Y < H) m.set(X, Y);
        }
      } else if (w * h >= 4) {
        const [sx, sy] = ctx.P(cx + 0.35 * w, foot - 0.1);
        castRound(m, sx, sy, 0.48 * w * cell, 0.26 * w * cell, Math.trunc(cx * 13 + foot));
      }
    }
  }
  for (const [u, v, rx, ry, salt] of st.casts ?? []) { const [x, y] = ctx.P(u, v); castRound(m, x, y, rx, ry, salt); }
  clean(m, 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m.has(x, y) && st.on.includes(ctx.kindAt(x, y))) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }
  SHADOW.delete(ctx);
}

// ------------------------------------------------------------------ what lives on top

const TUSSOCKS = [['h...h', '.l.l.', '..l..'], ['h.h', 'l.l', '.l.'], ['.h...h.', 'hl.h.lh', '.l.l.l.']];

export function runTussocks(ctx: Ctx, st: TussocksStep): void {
  const { W, H } = ctx, g = ctx.ground, tips = ctx.layer(st.layer ?? 'mechones'), seed = st.salt ?? 491;
  const G = ctx.mat(st.material).ramp, GRASS = new Set(G.slice(1)), grass = st.material, dryOdds = st.dry ?? 0.3;
  const placed: Pt[] = [];
  const near = (x: number, y: number, r: number) => {
    for (let dy = -r; dy < r + 1; dy += 2) for (let dx = -r; dx < r + 1; dx += 2) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && X < W && Y >= 0 && Y < H && st.near.includes(ctx.kindAt(X, Y))) return true;
    }
    return false;
  };
  for (let k = 0; k < (st.count ?? 9000); k++) {
    const x = Math.trunc(h2(k, 1, seed) * W), y = Math.trunc(h2(k, 2, seed) * H);
    if (ctx.kindAt(x, y) !== grass) continue;
    const edge = near(x, y, 6);
    if (h2(k, 3, seed) > (edge ? 0.8 : 0.22)) continue;
    const sp = edge ? 8 : 12;
    if (placed.some(([a, b]) => (x - a) ** 2 + (y - b) ** 2 < sp ** 2)) continue;
    const shape = TUSSOCKS[Math.trunc(h2(k, 4, seed) * TUSSOCKS.length)];
    const sh = shape.length, sw = shape[0].length, x0 = x - Math.floor(sw / 2), y0 = y - sh + 1;
    let fits = true;
    for (let j = 0; j < sh && fits; j++) for (let i = 0; i < sw; i++) {
      if (shape[j][i] === '.') continue;
      const X = x0 + i, Y = y0 + j;
      if (!(X >= 0 && X < W && Y >= 0 && Y < H && ctx.kindAt(X, Y) === grass)) { fits = false; break; }
    }
    if (!fits) continue;
    const t = G.indexOf(g.get(x, y) ?? '');
    if (t < 0) continue;
    const dry = h2(k, 5, seed) < dryOdds;
    const lc = G[Math.min(4, t + 1)];
    const hc = dry ? (h2(k, 6, seed) < 0.6 ? 'arena' : 'oro claro') : G[Math.min(4, t + 2)];
    const dc = G[Math.max(1, t - 1)];
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const c = shape[j][i];
      if (c === 'l') g.set(x0 + i, y0 + j, dry ? 'oro' : lc);
      else if (c === 'h') tips.set(x0 + i, y0 + j, hc);
    }
    for (let i = 0; i < sw; i++) {
      if (GRASS.has(g.get(x0 + i + 1, y0 + sh) ?? '') && shape[sh - 1][i] !== '.') g.set(x0 + i + 1, y0 + sh, dc);
    }
    placed.push([x, y]);
  }
}

export function runStones(ctx: Ctx, st: StonesStep): void {
  const { W, H } = ctx, g = ctx.ground, seed = st.salt ?? 493, snow = st.on, c3 = ctx.tone(snow, 3), odds = st.odds ?? 0.25;
  for (let k = 0; k < (st.count ?? 260); k++) {
    const x = Math.trunc(h2(k, 1, seed) * W), y = Math.trunc(h2(k, 2, seed) * H);
    if (ctx.kindAt(x, y) === snow && g.get(x, y) === c3 && g.get(x + 1, y) === c3 && y + 1 < H
      && ctx.kindAt(x, y + 1) === snow && h2(k, 3, seed) < odds) {
      g.set(x, y, 'piedra');
      g.set(x + 1, y, ctx.tone(snow, 1));
    }
  }
}

export function runSparkles(ctx: Ctx, st: SparklesStep): void {
  const { W, H } = ctx, g = ctx.ground, layer = ctx.layer(st.layer ?? 'brillos'), seed = st.salt, gap = st.gap ?? 8;
  const over = st.over ?? ['nieve', 'túnica luz', 'nieve sombra', 'ojo', 'celeste luz'];
  const colors = st.colors ?? ['túnica luz', 'ojo'];
  const taken: Pt[] = [];
  for (let k = 0; k < (st.tries ?? 4000); k++) {
    const x = Math.trunc(h2(k, 1, seed) * W), y = Math.trunc(h2(k, 2, seed) * H);
    if (!st.on.includes(ctx.kindAt(x, y)) || !over.includes(g.get(x, y) ?? '')) continue;
    if (taken.some(([a, b]) => Math.abs(x - a) < gap && Math.abs(y - b) < gap)) continue;
    taken.push([x, y]);
    layer.set(x, y, colors[k % colors.length]);
    if (h2(k, 3, seed) < 0.3 && x + 1 < W) layer.set(x + 1, y, colors[0]);
  }
}

export function runSpindrift(ctx: Ctx, st: SpindriftStep): void {
  const { W, H } = ctx, g = ctx.ground, layer = ctx.layer(st.layer ?? 'viento'), seed = st.salt;
  for (let k = 0; k < st.count; k++) {
    const x = Math.trunc(h2(k, 1, seed) * W), y = Math.trunc(h2(k, 2, seed) * H);
    const ln = 2 + Math.trunc(h2(k, 3, seed) * 5);
    for (let i = 0; i < ln; i++) {
      const X = x + i, Y = y + (i > ln * 0.6 && h2(k, 4, seed) < 0.4 ? 1 : 0);
      if (X >= 0 && X < W && Y >= 0 && Y < H && st.on.includes(ctx.kindAt(X, Y))) {
        layer.set(X, Y, ['nieve sombra', 'nieve honda'].includes(g.get(X, Y) ?? '') ? 'túnica luz' : 'ojo');
      }
    }
  }
}
