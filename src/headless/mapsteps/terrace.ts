// A terrace in the sky: the sea of clouds seen from above with floating peaks,
// the ashlar face of the terrace sinking into the clouds, big stones laid in
// courses worn where people walk, a runner of long slabs, the round arena of a
// duel, lacquered balustrades on their curbs (they stand up: a cast step throws
// their shadow), a stairway going down, sprigs in the mossy joints, fallen
// leaves, motes of light and the branch of a cliff pine reaching over it all.
// Port of the duel terrace script of The Unwritten Dao
// (scripts/suelo_terraza.py): same numbers, same pixels.

import { Mask, catmull, clean, fbm, h2, n1, pyRound, type Pt } from '../mapnoise';
import { stoneRoles, textureMottled, texturePatches, type Ctx, type Layer } from '../mappaint';
import { textureFlagstones } from './flagstones';
import { standing } from './lowland';
import { castOn, stairRoles, treadHeight, treadJoints } from './stairs';
import type {
  ArenaStep, AshlarStep, BalustradeStep, CloudbanksStep, CoursesStep, FallenStep, MotesStep, OverhangStep, RunnerStep, SprigsStep, StairwayStep, WornStairs,
} from './terraceschema';

const pyMod = (a: number, b: number): number => { let m = a % b; if (m !== 0 && (b < 0) !== (m < 0)) m += b; return m; };
const X = (ctx: Ctx, u: number) => Math.trunc(ctx.P(u, 0)[0]);
const Y = (ctx: Ctx, v: number) => Math.trunc(ctx.P(0, v)[1]);

// ------------------------------------------------------------------ cloudbanks

/** One bank: domed lumps on top, a flat belly below; painted over what is there. */
export function cloudBank(ctx: Ctx, t: (i: number) => string, y0: number, x0: number, x1: number, thick: number, seed: number, into?: Layer): void {
  const { W, H } = ctx, g = into ?? ctx.ground;
  const tops = new Map<number, number>();
  let x = x0;
  for (let k = 0; x < x1; k++) {
    const r = 4 + h2(k, 1, seed) * 7;
    for (let i = Math.trunc(-r); i < Math.trunc(r) + 1; i++) {
      const X = Math.trunc(x + i);
      const hgt = Math.sqrt(Math.max(0.0, r * r - i * i)) * 0.7;
      tops.set(X, Math.min(tops.has(X) ? tops.get(X)! : 1e9, y0 - hgt));
    }
    x += r * (1.1 + h2(k, 2, seed) * 0.9);
  }
  for (const [X, tyf] of tops) {
    if (!(X >= 0 && X < W)) continue;
    const ty = pyRound(tyf);
    const bot = y0 + thick + Math.trunc(pyRound(1.6 * n1(X / 6.0, seed + 3) + 0.9 * n1(X / 2.3, seed + 4)));
    for (let Yy = Math.max(0, ty); Yy < Math.min(H, bot + 1); Yy++) {
      const d = Yy - ty;
      let c: string;
      if (d === 0) c = t(4);
      else if (Yy >= bot) c = t(2);
      else if (d <= 2 + Math.trunc(h2(Math.floor(X / 3), 0, seed) * 2)) c = d === 1 ? t(4) : t(3);
      else if (Yy >= bot - 2) c = t(2);
      else c = t(3);
      g.set(X, Yy, c);
    }
  }
  // the lumps inside: a line of shadow between one lump and the next
  let prev: number | null = null;
  for (const X of [...tops.keys()].sort((a, b) => a - b)) {
    const ty = pyRound(tops.get(X)!);
    if (prev !== null && ty < prev - 1 && X >= 0 && X < W) {
      for (let Yy = ty + 2; Yy < Math.min(H, ty + 5); Yy++) if (g.get(X - 1, Yy) === t(3)) g.set(X - 1, Yy, t(2));
    }
    prev = ty;
  }
}

export function runCloudbanks(ctx: Ctx, st: CloudbanksStep): void {
  if (st.within) {
    // the whole sky again, kept only inside the mask: the same pixels the first one laid there
    const mask = ctx.masks.get(st.within);
    if (!mask) throw new Error(`cloudbanks: no mask "${st.within}" (a brink with that id goes before)`);
    const px = ctx.ground.px.slice(), kind = ctx.kind.slice();
    runCloudbanks(ctx, { ...st, within: undefined });
    for (let i = 0; i < px.length; i++) if (!mask.data[i]) { ctx.ground.px[i] = px[i]; ctx.kind[i] = kind[i]; }
    if (st.drift) {
      // the banks that drift: only where, moved px each way, they still fall on the sky
      const l = ctx.layer(st.drift.layer), W = ctx.W, d = st.drift.px;
      for (let i = 0; i < l.px.length; i++) {
        if (l.px[i] === null) continue;
        const x = i % W;
        for (let k = -d; k <= d; k++) if (x + k < 0 || x + k >= W || !mask.data[i + k]) { l.px[i] = null; break; }
      }
    }
    return;
  }
  const { W, H } = ctx, g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const [hx, hy, hs, below] = st.haze ?? [60, 7, 1211, 0.3];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    g.set(x, y, fbm(x / hx, y / hy, hs, 2) < below ? t(0) : t(1));
    ctx.setKind(x, y, name);
  }
  const rows = st.rows ?? {};
  const every = rows.every ?? 16, s = rows.salt ?? 1250, bs = rows.bank_salt ?? 1260, be = rows.bank_every ?? 7;
  const banks: [number, number, number, number][] = [];
  for (let k = 0, y0 = rows.from ?? -2; y0 < H + every; k++, y0 += every) {
    let x = -20 + h2(k, 0, s) * 60;
    while (x < W + 20) {
      const ix = Math.trunc(x);
      const ln = 50 + h2(k, ix, s + 1) * 110;
      if (h2(k, ix, s + 2) < 0.55) banks.push([y0 + Math.trunc((h2(k, ix, s + 3) - 0.5) * 6), x, x + ln, 4 + Math.trunc(h2(k, ix, s + 4) * 3)]);
      x += ln + 6 + h2(k, ix, s + 5) * 30;
    }
  }
  banks.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  const drifting = st.drift ? ctx.layer(st.drift.layer) : undefined;
  banks.forEach(([y0, x0, x1, th], i) => cloudBank(ctx, t, y0, x0, x1, th, bs + i * be, drifting));
  // the floating peaks: columns of rock with pines on top
  const [sl, sr, sc, se, sp] = st.peak_salts ?? [1220, 1225, 1230, 1231, 1241];
  const [trunk, pLit, pMid, pUnder, pLight] = st.pines ?? ['madera sombra', 'bambú', 'hoja', 'hoja sombra', 'bambú claro'];
  const peaks: [number, number, number, number][] = [];
  (st.peaks ?? []).forEach(([u, v, hw, hh, npines], k) => {
    const [cx, top] = ctx.P(u, v);
    peaks.push([cx, top, hw, hh]);
    const rock = new Map<number, [number, number]>();
    for (let y = Math.trunc(top); y < Math.min(H, Math.trunc(top + hh)); y++) {
      const f = Math.max(0.0, (y - top) / hh);
      const ledge = [0, 1].includes(pyMod(y - Math.trunc(top), 9)) ? 1.5 : 0;
      const lft = hw * (0.55 + 0.45 * f ** 0.8) + 1.2 * n1(y / 4.0, sl + k) + ledge;
      const rgt = hw * (0.5 + 0.5 * f ** 0.8) + 1.2 * n1(y / 4.0, sr + k);
      for (let x = Math.trunc(cx - lft) - 1; x < Math.trunc(cx + rgt) + 2; x++) {
        if (x >= 0 && x < W && y >= 0 && y < H && cx - lft <= x + 0.5 && x + 0.5 <= cx + rgt) {
          rock.set(y * W + x, [(x + 0.5 - cx) / (x + 0.5 > cx ? rgt : lft), pyMod(y - top, 9)]);
        }
      }
    }
    const out = (x: number, y: number) => !(x >= 0 && x < W && rock.has(y * W + x));
    for (const [key, [dx, strat]] of rock) {
      const x = key % W, y = Math.floor(key / W);
      let c: string;
      if (out(x + 1, y)) c = t(0);
      else if (out(x - 1, y)) c = h2(x, Math.floor(y / 3), se + k) < 0.5 ? t(4) : t(3);
      else if (strat === 2 && dx < 0.5) c = dx < -0.2 ? t(2) : t(1);   // the ledge: its shadow
      else if (dx < -0.35) c = t(3);
      else if (dx < 0.25) c = t(2);
      else c = t(1);
      if ((c === t(3) || c === t(2)) && h2(Math.floor(x / 2), Math.floor(y / 5), sc + k) < 0.08) c = t(1);   // a crack
      g.set(x, y, c);
    }
    // flat pines on top (crowns in layers)
    for (let i = 0; i < npines; i++) {
      const mid = i === Math.floor(npines / 2);
      const px = cx + (i - (npines - 1) / 2.0) * hw * 0.8 + (h2(k, i, sp) - 0.5) * 3;
      const py = top - 1 - (mid ? 2 : 0);
      for (let j = 0; j < 4 + (mid ? 2 : 0); j++) g.set(Math.trunc(px), Math.trunc(top) - j, trunk);
      for (const [dy, w] of [[mid ? -6 : -4, 3], [mid ? -3 : -2, 4]]) {
        for (let Xx = Math.trunc(px - w); Xx < Math.trunc(px + w) + 1; Xx++) {
          const Yy = Math.trunc(py + dy);
          g.set(Xx, Yy, Xx < px ? pLit : pMid);
          g.set(Xx, Yy + 1, pUnder);
          if (Math.abs(Xx - px) < w - 1) g.set(Xx, Yy - 1, Xx >= px ? pMid : pLight);
        }
      }
    }
  });
  // clouds hiding the feet of the peaks
  const [fs, fe, fth, spread, up] = st.feet ?? [1290, 5, 5, 2.2, 3];
  peaks.forEach(([cx, top, hw, hh], k) => cloudBank(ctx, t, Math.trunc(top + hh - up), cx - hw * spread, cx + hw * spread, fth, fs + k * fe));
}

// ------------------------------------------------------------------ ashlar

export function runAshlar(ctx: Ctx, st: AshlarStep): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const x0 = X(ctx, st.x[0]), x1 = X(ctx, st.x[1]), y0 = Y(ctx, st.y[0]), y1 = Y(ctx, st.y[1]);
  const every = st.course ?? 5, salt = st.salt ?? 1301;
  const rows = y1 - y0;
  // a rubble top: each stone of the top course a little lower or not, its top corners worn
  const rag = st.ragged ?? 0, off0 = Math.trunc(h2(0, 0, salt) * 9) % 15;
  const topAt = (x: number): number => {
    if (!rag) return y0;
    const k = Math.floor((x + off0) / 13), a = k * 13 - off0, b = a + 13;
    const drop = Math.trunc(h2(k, 7, salt) * (rag + 1));
    return y0 + drop + (x === a + 1 || x === b - 1 ? 1 : 0) + (x === a ? 2 : 0);
  };
  for (let y = y0; y < y1; y++) {
    const course = Math.floor((y - y0) / every), tt = (y - y0) % every, deep = y - y0;
    const off = (course * 7 + Math.trunc(h2(course, 0, salt) * 9)) % 15;
    for (let x = x0; x < x1; x++) {
      const top = topAt(x);
      if (y < top) continue;
      const joint = (x + off) % (13 + course % 3) === 0;
      let c: string;
      if (tt === every - 1 || joint) c = t(1);
      else if (tt === 0 || (rag && y === top)) c = deep < rows * 5 / 16 ? t(3) : t(2);
      else c = deep < rows * 10 / 16 ? t(2) : t(1);
      if (deep >= rows - 3 && (h2(Math.floor(x / 2), y, salt + 1) < 0.4 || deep >= rows - 1)) c = t(0);
      g.set(x, y, c);
      ctx.setKind(x, y, name);
    }
  }
  const foot = y1 - 1;
  if (st.sink) {
    const sea = st.sink.material, s = (i: number) => ctx.tone(sea, i), salt2 = st.sink.salt ?? 1303;
    for (let x = X(ctx, st.sink.x[0]); x < X(ctx, st.sink.x[1]); x++) {
      const top = foot - 2 + Math.trunc(2.5 * (1 + n1(x / 7.0, salt2))) - Math.trunc(h2(Math.floor(x / 2), 0, salt2 + 1) * ((st.sink.rough ?? 0) + 1));
      for (let y = top; y < Math.min(H, foot + 6); y++) {
        if (x >= 0 && x < W) {
          g.set(x, y, y === top ? s(3) : y < top + 3 ? s(4) : s(3));
          ctx.setKind(x, y, sea);
        }
      }
    }
  }
  if (st.moss) {
    const m = st.moss, salt3 = m.salt ?? 1305, a = X(ctx, m.x[0]), b = X(ctx, m.x[1]);
    const [lit, dark] = m.colors ?? ['hoja', 'hoja sombra'];
    for (let k = 0; k < m.count; k++) {
      const x = a + Math.trunc(h2(k, 1, salt3) * (b - a));
      if (m.skip && X(ctx, m.skip[0]) <= x && x <= X(ctx, m.skip[1])) continue;
      for (let j = 0; j < 1 + Math.trunc(h2(k, 2, salt3) * 4); j++) {
        const yt = topAt(x);
        g.set(x, yt + j, j === 0 ? lit : dark);
        if (j < 2) g.set(x + 1, yt + j, dark);
      }
    }
  }
}

// ------------------------------------------------------------------ courses

type Wear = NonNullable<CoursesStep['wear']>;
function wearAt(ctx: Ctx, w: Wear | undefined): (x: number, y: number) => number {
  if (!w) return () => 0;
  const lanes = (w.lanes ?? []).map(([u, v, half, amt]) => [ctx.P(u, 0)[0], ctx.P(0, v)[1], half, amt]);
  const rings = (w.rings ?? []).map(([u, v, rx, ry, amt, at, half]) => [...ctx.P(u, v), rx, ry, amt, at, half]);
  const spots = w.spots ? w.spots.at.map(([u, v]) => ctx.P(u, v)) : [];
  return (x, y) => {
    let r = 0.0;
    for (const [cx, from, half, amt] of lanes) if (Math.abs(x - cx) < half && y > from) r = Math.max(r, amt * (1 - Math.abs(x - cx) / half));
    for (const [cx, cy, rx, ry, amt, at, half] of rings) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (at - half < d && d < at + half) r = Math.max(r, amt * (1 - Math.abs(d - at) / half));
    }
    if (w.spots) {
      const { amount, r: [rx, ry] } = w.spots;
      for (const [px, py] of spots) r = Math.max(r, amount * Math.exp(-(((x - px) / rx) ** 2) - ((y - py) / ry) ** 2));
    }
    return r;
  };
}

export function runCourses(ctx: Ctx, st: CoursesStep): void {
  const g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const [moss0, moss1] = ctx.mat(name).moss ?? ['hoja sombra', 'hoja'];
  const x0 = X(ctx, st.box[0]), y0 = Y(ctx, st.box[1]), x1 = X(ctx, st.box[2]), y1 = Y(ctx, st.box[3]);
  const rowH = st.row ?? 15, seed = st.salt ?? 1321;
  const wear = wearAt(ctx, st.wear);
  // where nobody walks: by the sides, in the corners
  const e = st.edge;
  const edge = new Mask(ctx.W, ctx.H);
  // how deep in the edge band each px is: 1 at the walls, 0 at the inner limit of the band, below 0 past it
  const depth = new Float32Array(ctx.W * ctx.H).fill(-9);
  if (e) {
    const [wl, wr, wt, wb] = e.sides ?? [1, 1, 1.4, 1.6];
    const [bp, bn, bs, bsalt] = e.band ?? [9, 6, 9, 1311];
    const right = x1 - 1;
    const cpt = { tl: [x0, y0], tr: [right, y0], bl: [x0, y1], br: [right, y1] } as const;
    const corners = e.corners ?? [['bl', 1], ['tr', 1], ['tl', 1.3]];
    const cr = e.corner ?? 22;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const d = Math.min((x - x0) * wl, (right - x) * wr, (y - y0) * wt, (y1 - y) * wb);
      const corner = Math.min(...corners.map(([c, wt2]) => Math.hypot(x - cpt[c][0], y - cpt[c][1]) * wt2));
      const lim = bp + bn * fbm(x / bs, y / bs, bsalt, 2);
      if (d < lim || corner < cr) edge.set(x, y);
      if (st.overgrow) depth[y * ctx.W + x] = Math.max(1 - d / lim, 1 - corner / cr);
    }
    ctx.masks.set(e.id, edge);
  }
  const moss = (x: number, y: number) => !!e && edge.has(x, y);
  const joints = new Mask(ctx.W, ctx.H);
  for (let y = y0; y < y1; y++) {
    const k = Math.floor((y - y0) / rowH);
    // the cut of each slab of the course k
    const cuts: number[] = [];
    let xs = -40 + Math.trunc(h2(k, 0, seed) * 20);
    for (let j = 0; xs < x1 + 50; j++) { cuts.push(xs); xs += 22 + Math.trunc(h2(k, j, seed + 1) * 22); }
    cuts.push(xs);
    let j = 0;
    for (let x = x0; x < x1; x++) {
      while (cuts[j + 1] <= x) j++;
      const sx0 = cuts[j], sx1 = cuts[j + 1];
      const yk = y0 + k * rowH, tt = y - yk;
      const tone = h2(k, j, seed + 3), w = wear(x, y);
      const rightEdge = x === sx1 - 1, bottom = tt === rowH - 1;
      let c: string;
      if (rightEdge || bottom) {
        // the joint, light (stone well laid): dark only where two cross
        c = (rightEdge && bottom) || (rightEdge && tt >= rowH - 3) ? t(1) : t(5);
        if (bottom && h2(Math.floor(x / 4), k, seed + 9) < 0.25) c = t(2);
        if (bottom && !rightEdge && moss(x, y) && h2(Math.floor(x / 5), y, seed + 5) < 0.5) c = (x + y) % 3 ? moss0 : moss1;
      } else if (x === sx0) c = tone + w > 0.3 ? t(7) : t(6);
      else if (tt === 0) c = tone + w > 0.35 ? t(7) : t(6);
      else {
        const v = fbm(x / 7.0, y / 4.0, seed + 7, 2) * 0.4 + tone * 0.45 + w;
        c = v > 0.74 ? t(7) : v > 0.36 ? t(6) : v > 0.26 ? t(4) : t(5);
        // the grain of the stone: loose cold dots
        if ((c === t(6) || c === t(7)) && h2(x, y, seed + 13) < 0.04) c = t(3);
        else if (c === t(4) && h2(x, y, seed + 13) < 0.12) c = t(5);
      }
      g.set(x, y, c);
      ctx.setKind(x, y, name);
      if (rightEdge || bottom) joints.set(x, y);
    }
  }
  // moss and grass come in from the walls where nobody walks; the joints hold a line of moss
  if (st.overgrow && e) {
    const o = st.overgrow, at = o.at ?? 0.4, [ns, na, nsalt] = o.noise ?? [11, 0.7, 1317];
    const greens = o.colors ?? ctx.mat(name).moss ?? ['hoja sombra', 'hoja'];
    const dark = greens[0], n = greens.length;
    const green = new Mask(ctx.W, ctx.H), lift = new Float32Array(ctx.W * ctx.H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const v = depth[y * ctx.W + x] + na * (fbm(x / ns, y / ns, nsalt, 2) - 0.5) * 2 - at;
      // near its front a slab peeks through here and there
      if (v > 0 && fbm(x / 6, y / 6, nsalt + 4, 2) > 0.62 - 1.2 * v) { green.set(x, y); lift[y * ctx.W + x] = v; }
    }
    clean(green, 1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (ctx.kindAt(x, y) !== name) continue;
      if (green.has(x, y)) {
        // the green stands a little over the stone: its south and east rims are in shadow
        const rim = !green.has(x, y + 1) || !green.has(x + 1, y);
        const v = Math.min(1, lift[y * ctx.W + x] * 1.6) * 0.6 + fbm(x / 4, y / 3, nsalt + 5, 2) * 0.5 + (h2(x, y, nsalt + 1) - 0.5) * 0.3;
        g.set(x, y, rim ? dark : greens[Math.max(1, Math.min(n - 1, 1 + Math.floor(v * (n - 1))))]);
        if (o.kind) ctx.setKind(x, y, o.kind);
      } else if (o.joints && joints.has(x, y) && (Math.floor(x / 5) + Math.floor(y / 5)) % 2 === 0
        && h2(Math.floor(x / 5), Math.floor(y / 5), nsalt + 2) < o.joints * 2 && h2(x, y, nsalt + 3) < 0.8) {
        // in short tufts (never longer than 5 px): a line of moss all along a joint would be a ruled line
        g.set(x, y, h2(x, y, nsalt + 6) < 0.55 ? dark : greens[Math.min(1, n - 1)]);   // a line of moss along the joint
      }
    }
  }
  // a few cracks, with their lit edge
  for (let n = 0; n < (st.cracks ?? 9); n++) {
    const x = Math.trunc(x0 + h2(n, 1, seed + 11) * (x1 - 1 - x0));
    const y = Math.trunc(y0 + 4 + h2(n, 2, seed + 11) * (y1 - y0 - 8));
    for (let i = 0; i < 4 + Math.trunc(h2(n, 3, seed + 11) * 6); i++) {
      const Xx = x + i, Yy = y + Math.floor((i * (n % 2 ? 1 : -1)) / 3);
      if (ctx.kindAt(Xx, Yy) === name && g.get(Xx, Yy) !== t(1)) {
        g.set(Xx, Yy, t(1));
        if ([t(4), t(5), t(6)].includes(g.get(Xx, Yy - 1) ?? '')) g.set(Xx, Yy - 1, t(7));
      }
    }
  }
}

// ------------------------------------------------------------------ runner

export function runRunner(ctx: Ctx, st: RunnerStep): void {
  const g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const x0 = X(ctx, st.x[0]), x1 = X(ctx, st.x[1]), y0 = Y(ctx, st.y[0]), y1 = Y(ctx, st.y[1]);
  const mid = ctx.P(st.middle, 0)[0], every = st.every ?? 7;
  const [odd, even] = st.split ?? [-3, 4];
  const [crown, crownPx] = st.crown ?? [0.25, 10];
  const salt = st.salt ?? 1331;
  for (let y = y0; y < y1; y++) {
    const k = Math.floor((y - y0) / every), tt = (y - y0) % every;
    const split = mid + (k % 2 ? odd : even);
    for (let x = x0; x < x1; x++) {
      let c: string;
      if (x === x0 || x === x1 - 1) c = x === x0 ? t(1) : t(0);
      else if (tt === every - 1 || x === split) c = t(1);
      else if (tt === 0 || x === split + 1) c = t(7);
      else {
        const v = fbm(x / 5.0, y / 3.0, salt, 2) + crown * (1 - Math.abs(x - mid) / crownPx);
        c = v > 0.62 ? t(6) : v > 0.5 ? t(5) : t(4);
      }
      g.set(x, y, c);
      ctx.setKind(x, y, name);
    }
  }
}

// ------------------------------------------------------------------ arena

export function runArena(ctx: Ctx, st: ArenaStep): void {
  const g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const [cx, cy] = ctx.P(st.at[0], st.at[1]);
  const [rx, ry] = st.r, FACE = st.face ?? 3;
  const [bronze, gold, goldLight] = st.bronze ?? ['bronce', 'oro', 'oro claro'];
  const nv = st.voussoirs ?? 28, [n0, n1r] = st.rays ?? [18, 10], salt = st.salt ?? 1341;
  // the top (dx, dy, r) or the face (null)
  const top = new Map<string, [number, number, number] | null>();
  const keys: [number, number][] = [];
  for (let y = Math.trunc(cy - ry) - 1; y < Math.trunc(cy + ry + FACE) + 2; y++) {
    for (let x = Math.trunc(cx - rx) - 1; x < Math.trunc(cx + rx) + 2; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const r = Math.hypot(dx, dy);
      if (r <= 1.0) { top.set(`${x},${y}`, [dx, dy, r]); keys.push([x, y]); }
      else if (dy > 0 && Math.hypot(dx, (y + 0.5 - FACE - cy) / ry) <= 1.0) { top.set(`${x},${y}`, null); keys.push([x, y]); }
    }
  }
  const has = (x: number, y: number) => top.has(`${x},${y}`);
  for (const [x, y] of keys) {
    const v = top.get(`${x},${y}`)!;
    if (v === null) {
      const below = !has(x, y + 1);
      let c = below ? t(0) : (top.get(`${x},${y - 1}`) ?? null) !== null ? t(2) : t(3);
      if (!below && x > cx + rx * 0.4) c = c === t(2) ? t(1) : t(2);
      g.set(x, y, c);
      ctx.setKind(x, y, name);
      continue;
    }
    const [dx, dy, r] = v;
    const a = Math.atan2(dy, dx);
    const lit = -0.7 * dx - 0.7 * dy;
    const edge = [[1, 0], [-1, 0], [0, -1]].some(([i, j]) => !has(x + i, y + j));
    let c: string;
    if (edge) c = lit < -0.3 ? t(2) : t(3);
    else if (r > 0.9) {
      // the curb of voussoirs, the joint every so often
      const seg = (a + Math.PI) / (2 * Math.PI) * nv;
      if (seg % 1 < 0.06 || r > 0.985) c = lit > -0.2 ? t(3) : t(2);
      else if (r < 0.925) c = lit > 0.1 ? t(7) : lit > -0.4 ? t(6) : t(5);
      else c = lit > -0.2 ? t(5) : t(4);
    } else if (r > 0.87) c = t(3);                       // the carved gutter
    else if (r > 0.3) {
      const ring = r > 0.58 ? 0 : 1;
      const n = ring === 0 ? n0 : n1r;
      const seg = (a + Math.PI) / (2 * Math.PI) * n + (ring ? 0.5 : 0);
      if (Math.abs(r - 0.58) < 0.025) c = t(3);
      else if (seg % 1 < 0.05) c = t(3);
      else if (seg % 1 < 0.10 || Math.abs(r - 0.6) < 0.025) c = t(7);
      else {
        // the worn band where people step when they fight
        const w = 0.22 * Math.exp(-(((r - 0.57) / 0.17) ** 2));
        const vv = fbm(x / 5.0, y / 4.0, salt, 2) * 0.5 + h2(Math.trunc(seg), ring, salt + 1) * 0.3 + w;
        c = vv > 0.55 ? t(6) : vv > 0.42 ? t(5) : t(4);
      }
    } else if (r > 0.27) c = t(3);                       // the gutter of the disc
    else if (r > 0.215) c = lit > 0.2 ? t(7) : lit > -0.3 ? t(6) : t(5);
    else if (r > 0.17) c = lit > 0.3 ? gold : bronze;   // the bronze ring set in it
    else {
      c = lit > 0.3 ? t(7) : lit > -0.2 ? t(6) : t(4);
      if (r < 0.05) c = gold;
    }
    g.set(x, y, c);
    ctx.setKind(x, y, name);
  }
  // the studs of the curb
  const studs = st.studs ?? 8;
  for (let k = 0; k < studs; k++) {
    const a = k * Math.PI / (studs / 2);
    const x = Math.trunc(pyRound(cx + Math.cos(a) * rx * 0.945 - 0.5));
    const y = Math.trunc(pyRound(cy + Math.sin(a) * ry * 0.945 - 0.5));
    g.set(x, y, [3, 4, 5, 6].includes(k) ? goldLight : gold);
    g.set(x + 1, y, bronze);
  }
  // scuffs of those who fought: short arcs on the worn band
  for (let k = 0; k < (st.scuffs ?? 16); k++) {
    const a = h2(k, 1, salt + 10) * 6.283;
    const r = 0.42 + h2(k, 2, salt + 10) * 0.3;
    const len = 3 + Math.trunc(h2(k, 3, salt + 10) * 4);
    for (let i = 0; i < len; i++) {
      const aa = a + i * 0.05;
      const x = Math.trunc(cx + Math.cos(aa) * rx * r), y = Math.trunc(cy + Math.sin(aa) * ry * r);
      if ([t(6), t(5), t(4)].includes(g.get(x, y) ?? '')) g.set(x, y, t(8));
    }
  }
}

// ------------------------------------------------------------------ balustrade

export function runBalustrade(ctx: Ctx, st: BalustradeStep): void {
  const g = ctx.ground, name = st.material, tall = standing(ctx);
  const [ink, dark, mid, light] = st.lacquer ?? ['tinta', 'madera sombra', 'bermellón', 'bermellón claro'];
  const [cDark, cMid, cLight, cHigh] = st.curb ?? ['piedra sombra', 'piedra', 'piedra clara', 'niebla'];
  const [gDark, gMid, gLight] = st.gold ?? ['bronce', 'oro', 'oro claro'];
  const put = (x: number, y: number, c: string, h: number | null, kind = true) => {
    g.set(x, y, c);
    if (kind) ctx.setKind(x, y, name);
    if (h !== null) tall.set(`${x},${y}`, h);
  };
  for (const run of st.across ?? []) {
    const gaps = (run.gaps ?? []).map(([a, b]) => [X(ctx, a), X(ctx, b)]);
    const inGap = (x: number) => gaps.some(([a, b]) => a <= x && x < b);
    const yb = Y(ctx, run.y);
    // the stone curb
    const c0 = X(ctx, run.curb[0]), c1 = X(ctx, run.curb[1]);
    for (let x = c0; x <= c1; x++) {
      if (inGap(x)) continue;
      [x < Math.floor((c0 + c1) / 2) ? cHigh : cLight, cLight, cMid, cDark].forEach((c, k) => put(x, yb + k, c, 2));
    }
    // the rail: posts every so often with a gold finial, the handrail on top, balusters between
    const x0 = X(ctx, run.rail[0]), x1 = X(ctx, run.rail[1]), height = run.height;
    const posts = new Set<number>();
    for (let x = x0; x <= x1; x += run.posts) posts.add(x);
    for (const [a, b] of gaps) { posts.add(a - 3); posts.add(b); }
    const postX = [...posts].filter(p => x0 <= p && p <= x1 - 2 && !inGap(p) && !inGap(p + 2)).sort((a, b) => a - b);
    const top = yb - height;
    for (let x = x0; x <= x1; x++) {
      if (inGap(x)) continue;
      [light, mid, dark].forEach((c, dy) => put(x, top + dy, c, height - dy));
      if (run.balusters !== false && (x - x0) % 5 === 2) for (let y = top + 3; y < yb; y++) put(x, y, mid, yb - y);
    }
    for (const px of postX) {
      for (let y = top - 1; y < yb; y++) [ink, light, mid, dark, ink].forEach((c, i) => put(px - 1 + i, y, c, yb - y));
      [gDark, gLight, gLight, gMid, gDark].forEach((c, i) => put(px - 1 + i, top - 2, c, height + 2, false));
      put(px, top - 3, gLight, height + 3, false);
      put(px + 1, top - 3, gMid, null, false);
    }
  }
  if (st.down) {
    const d = st.down, y0 = Y(ctx, d.y[0]), y1 = Y(ctx, d.y[1]);
    for (const [xc, side] of [[X(ctx, d.x[0]), -1], [X(ctx, d.x[1]), 1]]) {
      for (let y = y0; y < y1; y++) {
        for (let k = 0; k < 3; k++) {
          const xx = xc + (side < 0 ? 3 + k : 2 - k);
          put(xx, y, side < 0 ? [cMid, cLight, cHigh][k] : [cDark, cMid, cLight][k], null);
        }
        [light, mid, dark].forEach((c, k) => put(xc + (side < 0 ? k : 1 + k), y, c, null));
        put(side < 0 ? xc - 1 : xc + 4, y, ink, null, false);
      }
      for (let y = y0 + 8; y < y1 - 4; y += d.finials) {
        [gLight, gLight, gMid].forEach((c, dx) => {
          const xx = xc + dx + (side < 0 ? 0 : 1);
          put(xx, y, c, null, false);
          put(xx, y + 1, dx ? gDark : gMid, null, false);
        });
      }
    }
  }
  // a dark hole in the curb (a hatch)
  const [lip, hole] = st.hole ?? ['piedra sombra', 'túnica oscura'];
  for (const run of st.across ?? []) {
    const yb = Y(ctx, run.y);
    for (const [a, b] of run.holes ?? []) {
      for (let y = yb; y < yb + 4; y++) for (let x = X(ctx, a); x < X(ctx, b); x++) g.set(x, y, y > yb ? hole : lip);
    }
  }
}

// ------------------------------------------------------------------ stairway

export function runStairway(ctx: Ctx, st: StairwayStep): void {
  if (st.worn) return stairwayWorn(ctx, st, st.worn);
  const { H } = ctx, g = ctx.ground, name = st.material;
  const s0 = X(ctx, st.x[0]), s1 = X(ctx, st.x[1]), y0 = Y(ctx, st.from), mid = ctx.P(st.middle, 0)[0];
  const yEnd = st.to === undefined ? H : Math.min(H, Y(ctx, st.to));
  const every = st.every ?? 5, fade = st.fade ?? 2;
  const [noseL, noseR, r1, r2, r3, r4] = st.tread ?? ['túnica luz', 'pergamino', 'piedra clara', 'túnica sombra', 'piedra', 'piedra sombra'];
  const [outer, wmid, inner] = st.wall ?? ['piedra', 'piedra sombra', 'túnica oscura'];
  for (let y = y0; y < yEnd; y++) {
    const tt = (y - y0) % every, k = Math.floor((y - y0) / every);
    for (let x = s0 - 2; x < s1 + 2; x++) {
      let c: string | null;
      if (x < s0 || x >= s1) c = x === s0 - 2 ? outer : x === s0 - 1 || x === s1 ? inner : wmid;
      else if (tt === 0) c = x < mid ? noseL : noseR;
      else c = [r1, r2, r3, r4][Math.min(tt, 4) - 1];
      for (let i = 0; i < Math.max(0, k - fade); i++) c = ctx.shade(c, name);
      g.set(x, y, c);
      ctx.setKind(x, y, name);
    }
  }
}

/**
 * The stairway with weight: tread by tread from the top, the tread lit, its nose
 * one px brighter, the riser in shadow with the dark joint at its foot; the
 * stones of a tread staggered against the ones above, some sunk a tone, chipped
 * noses, moss in some joints; a low wall at each side (the cap lit on the west,
 * an outline), the west one casting a px of shadow on the treads and the whole
 * flight casting `shadow` px on the ground to the east. With `rock`, from the
 * lip on, the walls are the rock cut around the steps and the risers taller.
 */
function stairwayWorn(ctx: Ctx, st: StairwayStep, w: WornStairs): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, R = stairRoles(ctx, name);
  const s0 = X(ctx, st.x[0]), s1 = X(ctx, st.x[1]), y0 = Y(ctx, st.from);
  const yEnd = st.to === undefined ? H : Math.min(H, Y(ctx, st.to));
  const every = st.every ?? 7, fade = st.fade ?? 2, riser = w.riser ?? 2, wall = w.wall ?? 4;
  const jitter = w.jitter ?? 0.5, mossOdds = w.moss ?? 0.3, shadow = w.shadow ?? 2, seed = w.seed ?? 4210;
  const blocks = (w.blocks ?? [6, 11]) as [number, number];
  const rock = w.rock ? { y: Y(ctx, w.rock.from), r: stoneRoles(ctx, w.rock.material), wide: w.rock.wide ?? 4 } : null;
  // light from the west: the west wall shades the treads, the flight shades the ground to the east (mirrored with the light)
  const sun = ctx.dir[0] >= 0 ? 1 : -1;
  const set = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    g.set(x, y, c);
    ctx.setKind(x, y, name);
  };
  // further down, darker: a step every two treads past `fade`
  const dim = (c: string, k: number) => { for (let i = 0; i < Math.max(0, Math.ceil((k - fade) / 2)); i++) c = ctx.shade(c, name) ?? c; return c; };
  const shade1 = (c: string) => ctx.shade(c, name) ?? c;
  // perspective: the flight narrows toward the top of the picture by `taper` degrees a side, as wide as `x` at `hold`
  const top = w.top ? { landing: w.top.landing ?? 6, face: w.top.face ?? 10, spread: w.top.spread ?? 12, rise: w.top.rise ?? 8 } : null;
  const lean = Math.tan(((w.taper ?? 0) * Math.PI) / 180);
  const yHold = w.hold !== undefined ? Y(ctx, w.hold) : top ? yEnd - 1 : y0;
  const off = (y: number) => Math.round((y - yHold) * lean);
  const left = (y: number) => s0 - off(y), right = (y: number) => s1 + off(y);
  const near = Math.max(1, right(yEnd - 1) - left(yEnd - 1)), foreshorten = w.foreshorten ?? (top ? 1 : 0);
  // the head of a flight that climbs: the lip of the level above, the landing under it
  const yLip = top ? y0 + top.rise : y0;
  const yTreads = top ? yLip + 1 + top.landing : y0;
  if (top) stairHead(ctx, st, w, R, { y0, yLip, yTreads, left, right, wall, sun, seed, set, rise: top.rise, face: top.face, spread: top.spread });
  if (w.foot) stairFoot(ctx, st, w, R, { y0, yEnd, left, right, wall, seed, below: w.foot.at ? w.foot.at === 'to' : top !== null });
  for (let y = yTreads, k = 0; y < yEnd; k++) {
    const deep = rock !== null && y >= rock.y;
    const rz = riser + (deep ? 1 : 0);
    let h = treadHeight(every, k, seed, jitter, rz + 3);
    // the far treads foreshortened: their lit part shorter, the riser as tall
    if (lean !== 0 && foreshorten > 0) {
      const s = Math.min(1, (right(y) - left(y)) / near), f = 1 - (1 - s * s) * foreshorten;
      h = Math.max(1, Math.round((h - rz - 1) * f)) + rz + 1;
    }
    const nose = h - rz - 1;
    const t0 = left(y), t1 = right(y);
    const joints = treadJoints(t0, t1, k, seed, blocks);
    const wl = wall + (deep && rock ? rock.wide : 0);
    // the stones of this tread: which one each column is, sunk or not
    const stoneOf = (x: number) => joints.filter(j => j <= x).length;
    const sunk = (b: number) => h2(k * 16 + b, 4, seed) < jitter * 0.35;
    const wallJoint = h2(k, 7, seed) < 0.55;
    for (let t = 0; t < h && y + t < yEnd; t++) {
      const yy = y + t, a0 = left(yy), a1 = right(yy);
      // the treads
      for (let x = a0; x < a1; x++) {
        const isJoint = joints.includes(x), b = stoneOf(x);
        let c: string;
        if (t < nose) {
          if (isJoint) c = h2(x, k, seed + 5) < mossOdds ? (t === nose - 1 ? R.moss[1] : R.moss[0]) : R.joint;
          else {
            c = t === nose - 1 ? R.lit : fbm(x / 3.0, yy / 2.0, seed + 1, 2) > 0.68 ? R.speck : R.tread;
            if (sunk(b)) c = shade1(c);
          }
        } else if (t === nose) {
          c = isJoint ? R.riser : sunk(b) || h2(x, k, seed + 6) < 0.15 * jitter ? R.lit : R.nose;
        } else c = t === h - 1 || isJoint ? R.deep : R.riser;
        // the shadow of the west wall on the treads (two px under the rock)
        const fromWall = sun > 0 ? x - a0 : a1 - 1 - x;
        if (t <= nose && fromWall < (deep ? 3 : 1)) c = shade1(c);
        if (t <= nose && deep && fromWall === 0) c = shade1(c);
        set(x, yy, dim(c, k));
      }
      // the walls
      for (const side of [-1, 1]) {
        for (let i = 0; i < wl; i++) {
          const x = side < 0 ? a0 - 1 - i : a1 + i;   // i = 0 at the steps, wl - 1 at the outside
          // the wall on the side of the light has its cap lit; cut in the rock it is the other way: the face that looks west is lit
          const lit = deep ? side === sun : side === -sun;
          let c: string;
          if (deep && rock) {
            const r = rock.r, crack = h2(x, Math.floor(yy / 9), seed + 8) < 0.12;
            if (i === wl - 1 || crack) c = r.line;
            else if (i === 0) c = lit ? r.high : r.line;
            else {
              const streak = h2(x, Math.floor((yy + 5 * h2(x, 0, seed + 9)) / 12), seed + 10);
              c = lit ? (streak < 0.5 ? r.light : r.mid) : (streak < 0.5 ? r.shadow : r.dark);
            }
            // the top of the cut, under the lip: a lit edge and moss hanging over it
            const down = yy - rock.y;
            if (down === 0 && i < wl - 1) c = r.high;
            else if (down < 4 && h2(x, yy, seed + 11) < mossOdds * (1 - down / 4) * 1.6) c = down < 2 ? r.moss[1] : r.moss[0];
          } else {
            if (i === wl - 1) c = R.deep;                                    // the outline
            else if (i === 0) c = lit ? R.deep : R.wallLit;                  // the face toward the steps: in shadow, or lit
            else c = lit && i === wl - 2 ? R.wallLit : R.wall;                // the cap, its edge toward the light lit
            const foot = st.to !== undefined && yEnd - yy <= riser + 1;      // the end of the wall where the flight lands: its face
            if (i > 0 && i < wl - 1) {
              if (foot) c = yy === yEnd - 1 ? R.deep : R.riser;
              else if (yy === y0) c = R.speck;                                 // the lit top end of the wall
              else if (wallJoint && t === h - 1) c = R.joint;                  // the joint between two blocks of the cap
              else if (wallJoint && t === 0 && k > 0) c = R.wallLit;           // and the lit edge of the lower block
              else if (h2(x, yy, seed + 12) < mossOdds * 0.1) c = R.moss[h2(x, yy, seed + 13) < 0.5 ? 0 : 1];
            }
          }
          set(x, yy, dim(c, k));
        }
      }
      // the shadow it casts on the ground at its shaded side
      for (let i = 0; i < shadow; i++) {
        const x = sun > 0 ? a1 + wl + i : a0 - wl - 1 - i;
        if (x >= 0 && x < W && ctx.kindAt(x, yy) !== name) { castOn(ctx, x, yy); if (i === 0) castOn(ctx, x, yy); }
      }
    }
    y += h;
  }
}

/**
 * The foot of a stair: a short apron where the way that comes to it (`foot.width`
 * cells wide, of `foot.material`) opens out to the width of the stair with its
 * walls, its sides in a soft ragged diagonal, painted in the texture of that
 * material; and across the end of the stair a sill of worn stones in its own
 * ramp, where the first step starts. Below `to` for a flight that climbs (with
 * `top`), above `from` for one that goes down.
 */
function stairFoot(ctx: Ctx, st: StairwayStep, w: WornStairs, R: ReturnType<typeof stairRoles>, G: {
  y0: number; yEnd: number; wall: number; seed: number; below: boolean;
  left: (y: number) => number; right: (y: number) => number;
}): void {
  const f = w.foot!, { W, H, cell } = ctx;
  const len = Math.max(6, Math.round((f.length ?? 1.75) * cell)), sill = 5;
  const yStair = G.below ? G.yEnd : G.y0 - 1;                               // the row of the stair it meets
  const a0 = G.left(yStair) - G.wall, a1 = G.right(yStair) + G.wall;
  const mid = (a0 + a1) / 2, far = (f.width * cell) / 2, near = (a1 - a0) / 2;
  const mask = new Mask(W, H), blend = ctx.mat(f.material).texture !== 'flagstones';   // stones are not dithered into stones
  for (let d = 0; d < len; d++) {
    const y = G.below ? yStair + d : yStair - d;
    // 0 at the stair, 1 at the far end: the sides open in a soft S from the way to the stair
    const t = d / (len - 1), e = t * t * (3 - 2 * t);
    const half = near + (far - near) * e;
    const cx = mid + (f.shift ?? 0) * cell * e;
    const wob = (side: number) => (fbm(y / 3.5, side * 7.3, G.seed + 41, 2) - 0.5) * 3 * Math.min(1, t * 3);
    for (let x = Math.floor(cx - half + wob(-1)); x < Math.ceil(cx + half + wob(1)); x++) {
      // toward the far end it gives way to the way itself where that is already there, a px here and there
      if (blend && t > 0.45 && ctx.kindAt(x, y) === f.material && h2(x, y, G.seed + 42) < (t - 0.45) / 0.55) continue;
      mask.set(x, y);
    }
  }
  const name = f.material, tex = ctx.mat(name).texture ?? 'flat';
  if (tex === 'flagstones') textureFlagstones(ctx, mask, name, G.seed + 43, (f.stones ?? [9, 6]) as [number, number]);
  else if (tex === 'mottled') textureMottled(ctx, mask, name, G.seed + 43);
  else if (tex === 'patches') texturePatches(ctx, mask, name, G.seed + 43);
  else for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask.has(x, y)) { ctx.ground.set(x, y, ctx.tone(name, ctx.base(name))); ctx.setKind(x, y, name); }
  // the sill: a course of worn stones across the end of the stair and its walls, a px wider each side,
  // lit along its top edge, joints between the stones, the joint in shadow along its foot
  if (f.sill === false) return;
  const top0 = G.below ? yStair : yStair - sill + 1;
  let jx = a0 + 1 + Math.floor(h2(1, 2, G.seed + 44) * 5);
  const joints = new Set<number>();
  for (let i = 0; jx < a1 - 2; i++) { joints.add(jx); jx += 6 + Math.floor(h2(i, 3, G.seed + 44) * 5); }
  for (let j = 0; j < sill; j++) {
    const y = top0 + j;
    for (let x = a0 - 1; x < a1 + 1; x++) {
      if ((x === a0 - 1 || x === a1) && (j === 0 || h2(x, y, G.seed + 45) < 0.4)) continue;   // the corners worn round
      let c = j === sill - 1 ? R.deep : joints.has(x) ? R.joint : j === 0 ? R.nose : h2(x, y, G.seed + 46) < 0.25 ? R.speck : j === 1 ? R.lit : R.tread;
      if (j === 0 && h2(x, 7, G.seed + 47) < 0.15) c = R.lit;              // a chipped edge
      if (y < 0 || y >= H || x < 0 || x >= W) continue;
      ctx.ground.set(x, y, c);
      ctx.setKind(x, y, st.material);
    }
  }
}

interface HeadGeometry {
  y0: number; yLip: number; yTreads: number; rise: number; face: number; spread: number; wall: number; sun: number; seed: number;
  left: (y: number) => number; right: (y: number) => number; set: (x: number, y: number, c: string) => void;
}

/**
 * The head of a flight that climbs away: the lip of the level above at each side
 * of the stair (a lit stone edge running out past its walls, stepped down toward
 * its ends) with the face of that level under it in courses of blocks, in
 * shadow, its shadow at the foot; the walls of the stair ending in a post at the
 * lip; the landing in flagstones going on up into the level, and over the level
 * the mist, thicker upward: so the flight arrives somewhere higher instead of
 * going into the rock.
 */
function stairHead(ctx: Ctx, st: StairwayStep, w: WornStairs, R: ReturnType<typeof stairRoles>, G: HeadGeometry): void {
  const name = st.material, t = w.top!;
  const stone = t.material ? stoneRoles(ctx, t.material) : null;
  const faceDark = stone ? stone.dark : R.wall, faceMid = stone ? stone.shadow : R.wallLit, faceLit = stone ? stone.mid : R.speck;
  const line = stone ? stone.line : R.deep, cap = stone ? stone.high : R.nose, capMid = stone ? stone.light : R.lit;
  const a0 = G.left(G.yLip) - G.wall, a1 = G.right(G.yLip) + G.wall;     // the stair with its walls, at the lip
  const out0 = a0 - G.spread, out1 = a1 + G.spread;
  // how far down the face goes at column x: stepped down block by block toward its ends
  const depth = (x: number) => {
    const fromEnd = x < a0 ? x - out0 : out1 - 1 - x;
    const ragged = Math.round(h2(Math.floor((x - out0) / 5), 3, G.seed + 31) * 2);
    return Math.max(0, Math.min(G.face, Math.round(fromEnd * 0.8)) - ragged);
  };
  for (let x = out0; x < out1; x++) {
    if (x >= a0 && x < a1) continue;
    const d = depth(x);
    if (d <= 0) continue;
    // the lip: the lit edge of the level above
    G.set(x, G.yLip - 1, h2(x, 1, G.seed + 32) < 0.25 ? capMid : cap);
    // the face under it: courses of 3 px, staggered blocks, their top lit, a dark joint between
    for (let j = 0; j < d; j++) {
      const y = G.yLip + j, course = Math.floor(j / 3), row = j % 3;
      const shift = course * 4 + Math.floor(h2(course, 2, G.seed + 33) * 5), blockLen = 7;
      const isJoint = (x - out0 + shift) % blockLen === 0, block = Math.floor((x - out0 + shift) / blockLen);
      let c = row === 2 || isJoint ? line : row === 0 ? faceLit : h2(block, course, G.seed + 34) < 0.35 ? faceMid : faceDark;
      if (j === d - 1) c = line;                                          // the foot of the face, on the ground
      G.set(x, y, c);
    }
    // its shadow on the ground at the foot
    castOn(ctx, x, G.yLip + d);
    castOn(ctx, x, G.yLip + d);
    if (G.sun > 0 ? x > a1 : x < a0) castOn(ctx, x, G.yLip + d + 1);
  }
  // the landing: flagstones between the walls, from the top of the head down to the first tread
  for (let y = G.y0; y < G.yTreads; y++) {
    const l0 = G.left(y), l1 = G.right(y), j = y - G.y0;
    for (let x = l0; x < l1; x++) {
      const course = Math.floor(j / 4), jy = j % 4 === 3;
      const jx = (x - l0 + (course % 2 ? 4 : 0)) % 8 === 7;
      const c = jy || jx ? R.joint : j % 4 === 0 ? R.lit : fbm(x / 3, y / 2, G.seed + 36, 2) > 0.62 ? R.speck : R.tread;
      G.set(x, y, c);
    }
    // the walls of the stair run up to the lip and end there in a post a px wider
    if (y < G.yLip - 1) continue;
    const post = y < G.yLip + 4;
    for (const side of [-1, 1]) {
      const n = G.wall + (post ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = side < 0 ? l0 - 1 - i : l1 + i;
        let c = i === n - 1 ? R.deep : i === 0 ? (side === -G.sun ? R.wallLit : R.deep) : R.wall;
        if (post && i > 0 && i < n - 1) c = y === G.yLip - 1 ? R.nose : y === G.yLip ? R.lit : y === G.yLip + 3 ? R.deep : R.riser;
        G.set(x, y, c);
      }
    }
  }
  // over the level the mist: a soft bank of its second and third lightest tones in a checker, none at the lip, thickest up
  // in the middle and thinning out to the ends and to the top, so nothing of it has a straight edge
  if (!t.mist) return;
  const mist = ctx.mat(t.mist).ramp, m1 = mist[Math.max(0, mist.length - 2)], m2 = mist[Math.max(0, mist.length - 3)];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cx = (out0 + out1) / 2, hw = (out1 - out0) / 2 + 2;
  for (let y = G.y0; y < G.yLip - 1; y++) {
    const up = (G.yLip - 1 - y) / G.rise;                                  // 0 at the lip, 1 at the top
    for (let x = out0 - 2; x < out1 + 2; x++) {
      if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) continue;
      const dx = (x - cx) / hw, dy = (up - 0.62) / 0.62;
      const amount = Math.min(0.5, (1 - dx * dx - dy * dy) * 0.9) + (h2(x, y, G.seed + 37) - 0.5) * 0.25;
      const v = bayer[(y & 3) * 4 + (x & 3)] / 16;
      if (v >= amount) continue;
      ctx.ground.set(x, y, v < amount * 0.4 ? m1 : m2);
      ctx.setKind(x, y, name);
    }
  }
}

// ------------------------------------------------------------------ the little things

export function runSprigs(ctx: Ctx, st: SprigsStep): void {
  const { W, H } = ctx, g = ctx.ground, tips = ctx.layer(st.layer);
  const on = new Set(st.on), over = new Set(st.over), gap2 = st.spacing * st.spacing;
  const [stem, tip] = st.colors ?? ['hoja', 'bambú'];
  const placed: Pt[] = [];
  for (let n = 0; n < st.tries; n++) {
    const x = Math.trunc(ctx.rnd() * W), y = Math.trunc(ctx.rnd() * H);
    if (!on.has(ctx.kindAt(x, y)) || !over.has(g.get(x, y) ?? '')) continue;
    if (placed.some(([a, b]) => (x - a) ** 2 + (y - b) ** 2 < gap2)) continue;
    const shape = st.shapes[Math.trunc(ctx.rnd() * st.shapes.length)];
    const x0 = x - Math.floor(shape[0].length / 2), y0 = y - shape.length + 1;
    shape.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === 'l') g.set(x0 + i, y0 + j, stem);
      else if (ch === 'h') tips.set(x0 + i, y0 + j, tip);
    }));
    placed.push([x, y]);
  }
}

export function runFallen(ctx: Ctx, st: FallenStep): void {
  const g = ctx.ground, on = new Set(st.on);
  const edge = ctx.masks.get(st.edge);
  if (!edge) throw new Error(`map: fallen: no mask "${st.edge}" before it`);
  const [a, b, tail] = st.colors ?? ['oro', 'oro claro', 'bronce'];
  const x0 = ctx.P(st.box[0], 0)[0], y0 = ctx.P(0, st.box[1])[1], x1 = ctx.P(st.box[2], 0)[0], y1 = ctx.P(0, st.box[3])[1];
  for (let k = 0; k < st.count; k++) {
    const x = Math.trunc(x0 + ctx.rnd() * (x1 - x0));
    const y = Math.trunc(y0 + ctx.rnd() * (y1 - y0));
    if (!on.has(ctx.kindAt(x, y)) || !edge.has(x, y)) continue;
    g.set(x, y, ctx.rnd() < 0.5 ? a : b);
    g.set(x + 1, y, on.has(ctx.kindAt(x + 1, y)) ? tail : g.get(x + 1, y));
  }
}

export function runMotes(ctx: Ctx, st: MotesStep): void {
  const { W, H } = ctx, g = ctx.ground, layer: Layer = ctx.layer(st.layer);
  const on = new Set(st.on), over = new Set(st.over), [rx, ry] = st.clear;
  for (let k = 0; k < st.tries; k++) {
    const x = Math.trunc(ctx.rnd() * W), y = Math.trunc(ctx.rnd() * H);
    if (!on.has(ctx.kindAt(x, y)) || !over.has(g.get(x, y) ?? '')) continue;
    let free = true;
    for (let i = -rx; i <= rx && free; i++) for (let j = -ry; j <= ry; j++) if (layer.get(x + i, y + j) !== null) { free = false; break; }
    if (!free) continue;
    const c = st.colors.length === 1 ? st.colors[0] : ctx.rnd() < 0.5 ? st.colors[0] : st.colors[1];
    layer.set(x, y, c);
    if (st.pair && over.has(g.get(x + 1, y) ?? '')) layer.set(x + 1, y, c);
  }
}

// ------------------------------------------------------------------ overhang

export function runOverhang(ctx: Ctx, st: OverhangStep): void {
  const { W, H } = ctx, g = ctx.ground, above = ctx.layer(st.layer);
  const [w0, w1] = st.width ?? [2.0, 1.2];
  const [bLight, bMid, bDark, line] = st.bark ?? ['madera clara', 'madera', 'madera sombra', 'túnica noche'];
  const [night, shadow, leaf, crown, light, glint] = st.leaves ?? ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'bambú claro', 'hoja clara'];
  const [sBark, sLump, sSpot] = st.salts ?? [1811, 1800, 1820];
  const trunk = catmull(st.trunk.map(([u, v]) => ctx.P(u, v)));
  trunk.forEach(([cx, cy], i) => {
    const wdt = w0 - w1 * i / trunk.length;
    for (let x = Math.trunc(cx - wdt); x < Math.trunc(cx + wdt) + 1; x++) {
      for (let y = Math.trunc(cy - wdt * 0.8); y < Math.trunc(cy + wdt * 0.8) + 1; y++) {
        const d = (y + 0.5 - cy) / Math.max(wdt * 0.8, 0.5);
        let c = d < -0.4 ? bLight : d < 0.4 ? bMid : bDark;
        if (c === bMid && h2(x, Math.floor(y / 2), sBark) < 0.18) c = bDark;   // the bark in scales
        above.set(x, y, c);
      }
    }
  });
  const bark: Pt[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ([bLight, bMid, bDark].includes(above.get(x, y) ?? '')) bark.push([x, y]);
  for (const [x, y] of bark) for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (above.get(x + dx, y + dy) === null) above.set(x + dx, y + dy, line);
  st.pads.forEach(([u, v, rxp, ryp], k) => {
    const [px, py] = ctx.P(u, v);
    const pad = new Set<string>();
    const cells: Pt[] = [];
    for (let y = Math.trunc(py - ryp * 1.6) - 1; y < Math.trunc(py + ryp) + 2; y++) {
      for (let x = Math.trunc(px - rxp * 1.2) - 1; x < Math.trunc(px + rxp * 1.2) + 2; x++) {
        const dx = (x + 0.5 - px) / rxp;
        let ok: boolean;
        if (y + 0.5 < py) {
          const lump = 0.75 + 0.25 * Math.abs(Math.sin((x + k * 3) * 0.45)) + 0.1 * n1(x * 0.3, sLump + k);
          ok = ((y + 0.5 - py) / (ryp * 1.4 * lump)) ** 2 + dx * dx <= 1;
        } else ok = ((y + 0.5 - py) / (ryp * 0.7)) ** 2 + dx * dx <= 1;
        if (ok) { pad.add(`${x},${y}`); cells.push([x, y]); }
      }
    }
    const o = (x: number, y: number) => pad.has(`${x},${y}`);
    for (const [x, y] of cells) {
      let c: string;
      if (!o(x, y + 1) || !o(x + 1, y)) c = !o(x, y + 1) ? night : shadow;
      else if (!o(x - 1, y) && !o(x, y - 1)) c = light;
      else if (!o(x, y - 1) || !o(x - 1, y - 1)) c = x < px ? light : crown;
      else if (!o(x, y + 2)) c = shadow;
      else {
        c = x < px - rxp * 0.2 ? crown : leaf;
        if (h2(Math.floor(x / 2), y, sSpot + k) < 0.12) c = glint;
        else if (h2(Math.floor(x / 2), y - 1, sSpot + k) < 0.12) c = shadow;
      }
      above.set(x, y, c);
    }
  });
  if (st.shadow) {
    const [ddx, ddy] = st.shadow.at, on = new Set(st.shadow.on);
    const src: Pt[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (above.get(x, y) !== null) src.push([x, y]);
    for (const [x, y] of src) {
      const Xx = x + ddx, Yy = y + ddy;
      if (Xx >= 0 && Xx < W && Yy >= 0 && Yy < H && on.has(ctx.kindAt(Xx, Yy)) && above.get(Xx, Yy) === null) g.set(Xx, Yy, ctx.shade(g.get(Xx, Yy), ctx.kindAt(Xx, Yy)));
    }
  }
}
