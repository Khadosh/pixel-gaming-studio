// The brink: the south edge of an island in the sky, seen in 3/4. The ground
// ends at a wavy lip (never a straight line); under it the rock face falls in
// tall columns lit from the left, dark at the foot, with grass hanging over the
// lip in curtains and bushes leaning over it; past the foot, far below, the
// haze of the sky (a cloudbanks step with `within` paints the same sky there
// again), banks of cloud hide the foot, and waterfalls pour over the lip and
// fall into them. Born for the sect of The Unwritten Dao, an island that falls
// away on every side (docs/referencia/isla_sin_edificios.webp of the game).

import { Mask, fbm, h2, n1, type Pt } from '../mapnoise';
import { paintClumps, stoneRoles, type Clump, type Ctx } from '../mappaint';
import { cloudBank } from './terrace';
import { cumulus, type Tones4 } from './sky';
import type { BrinkStep } from './schema';

const KEY = (x: number, y: number) => (y + 4096) * 16384 + (x + 4096);

/** Columns: Voronoi seeds on a jittered grid stretched tall. Returns the owner key of a px. */
function columns(seed: number, sx: number, sy: number, jitter = 0.7): (x: number, y: number) => number {
  return (x, y) => {
    const gx = Math.floor(x / sx), gy = Math.floor(y / sy);
    let best = 0, bd = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cx = (gx + i + 0.5 + (h2(gx + i, gy + j, seed) - 0.5) * jitter) * sx;
      const cy = (gy + j + 0.5 + (h2(gx + i, gy + j, seed + 1) - 0.5) * 0.9) * sy;
      const d = ((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2;
      if (d < bd) { best = KEY(gx + i, gy + j); bd = d; }
    }
    return best;
  };
}
/**
 * Strips: upright columns of different widths (basalt), each broken in blocks of its own heights.
 * Returns the owner key of a px, as columns() does. Covers x in [-64, W + 64), y in [-64, H + 64).
 */
function strips(seed: number, sx: number, sy: number, jitter: number, W: number, H: number): (x: number, y: number) => number {
  const X0 = -64, of = new Int32Array(W + 128);
  for (let x = X0, k = 0, next = X0 + sx * (1 + jitter * (h2(0, 0, seed) - 0.5)); x < W + 64; x++) {
    if (x >= next) { k++; next += Math.max(3, sx * (1 + jitter * (h2(k, 0, seed) - 0.5) * 2)); }
    of[x - X0] = k;
  }
  const breaks = new Map<number, number[]>();
  const rows = (k: number) => {
    let b = breaks.get(k);
    if (!b) {
      b = [];
      for (let y = -64 - sy * h2(k, 1, seed), j = 0; y < H + 64; j++) { b.push(y); y += Math.max(4, sy * (0.5 + h2(k, 2 + j, seed))); }
      breaks.set(k, b);
    }
    return b;
  };
  return (x, y) => {
    const k = of[Math.max(0, Math.min(of.length - 1, x - X0))], b = rows(k);
    let j = 0;
    while (j + 1 < b.length && b[j + 1] <= y) j++;
    return KEY(k, j);
  };
}
const kx = (key: number) => (key % 16384) - 4096;
const ky = (key: number) => Math.floor(key / 16384) - 4096;

/** y of a polyline at x, eased between its points (flat at each one: no corners), level past its ends. */
function along(pts: Pt[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) {
      const t = x1 === x0 ? 1 : (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t * t * (3 - 2 * t);
    }
  }
  return pts[pts.length - 1][1];
}

export function runBrink(ctx: Ctx, st: BrinkStep, idx: number): void {
  if (st.ring) return runRing(ctx, st, idx);
  const { W, H } = ctx, g = ctx.ground, rock = st.face, sea = st.sea;
  const r = stoneRoles(ctx, rock), t = (i: number) => ctx.tone(sea, i);
  const salt = st.salt ?? 1500;
  const keep = new Set(st.skip ?? []);
  const clear = (st.clear ?? []).map(n => ctx.layer(n));
  const pts = [...st.lip].map(([u, v]) => ctx.P(u, v)).sort((a, b) => a[0] - b[0]);
  const [w1, w2] = st.wobble ?? [2.4, 1.2];
  const [d0, d1, d2] = st.drop ?? [40, 10, 6];
  const lipAt = (x: number) => along(pts, x) + w1 * n1(x / 23.0, salt + 1) + w2 * n1(x / 7.0, salt + 2);
  const [sx, sy] = st.slabs ?? [6, 30];
  const col = columns(salt + 31, sx, sy);
  // the foot: each column ends at its own depth, so the bottom is jagged
  const footAt = (x: number) => lipAt(x) + d0 + d1 * fbm(x / 11.0, 0.5, salt + 3, 2) + d2 * h2(Math.floor(x / sx), 0, salt + 4);
  // a column whose lip is already sky (past the end of the island) has no face: the sky goes on below the lip;
  // a slit of sky narrower than `gap` between two solid columns is closed (the face goes on under it)
  const sky = new Set(st.sky ?? [sea]);
  const lip = new Float64Array(W), foot = new Float64Array(W), solid = new Uint8Array(W);
  for (let x = 0; x < W; x++) {
    lip[x] = lipAt(x);
    solid[x] = sky.has(ctx.kindAt(x, Math.ceil(lip[x]) - 1)) ? 0 : 1;
  }
  const gap = st.gap ?? 8;
  for (let x = 1; x < W; x++) {
    if (solid[x] || !solid[x - 1]) continue;
    let e = x;
    while (e < W && !solid[e]) e++;
    if (e < W && e - x <= gap) solid.fill(1, x, e);
    x = e;
  }
  // the face shrinks toward the ends of a solid run: the corner turns round instead of ending in a straight side
  const taper = st.taper ?? 16;
  const toEnd = new Float64Array(W).fill(1e9);
  for (let x = 0, last = -1e9; x < W; x++) { if (!solid[x]) last = x; toEnd[x] = x - last; }
  for (let x = W - 1, last = 1e9; x >= 0; x--) { if (!solid[x]) last = x; toEnd[x] = Math.min(toEnd[x], last - x); }
  for (let x = 0; x < W; x++) {
    const k = taper > 0 ? Math.min(1, toEnd[x] / taper) : 1;
    foot[x] = solid[x] ? lip[x] + (footAt(x) - lip[x]) * Math.sqrt(k) : lip[x];
  }
  const at = (x: number) => Math.max(0, Math.min(W - 1, Math.trunc(x)));
  const free = (x: number, y: number) => !keep.has(ctx.kindAt(x, y));
  const paint = (x: number, y: number, c: string, kind: string, over = false) => {
    if (x < 0 || y < 0 || x >= W || y >= H || (!over && !free(x, y))) return false;
    g.set(x, y, c);
    ctx.setKind(x, y, kind);
    for (const l of clear) l.set(x, y, null);
    return true;
  };
  const beyond = new Mask(W, H);
  const [hx, hy, hs] = st.haze ?? [60, 7, 1211];
  // past the foot: the haze far below (the sky a cloudbanks step paints again with `within`)
  for (let x = 0; x < W; x++) {
    for (let y = Math.max(0, Math.ceil(foot[x])); y < H; y++) {
      if (paint(x, y, fbm(x / hx, y / hy, hs, 2) < 0.3 ? t(0) : t(1), sea)) beyond.set(x, y);
    }
  }
  // the face: tall columns lit from the left, darker going down, a crack on the right of each one
  for (let x = 0; x < W; x++) {
    if (!solid[x]) continue;
    const y0 = Math.ceil(lip[x]), y1 = Math.ceil(foot[x]);
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      const d = (y - lip[x]) / Math.max(1, foot[x] - lip[x]);
      const f = col(x, y), fr = h2(kx(f), ky(f), salt + 33) * 2 - 1;
      const lum = 0.3 - 0.32 * fr - 1.0 * d + 0.22 * n1(x / 2.6, salt + 34) + 0.1 * n1(y / 6.0 + x, salt + 37);
      let c = lum > 0.42 ? r.light : lum > 0.1 ? r.mid : lum > -0.25 ? r.shadow : lum > -0.6 ? r.dark : r.line;
      const right = col(x + 1, y) !== f, left = col(x - 1, y) !== f, under = col(x, y + 1) !== f;
      if (right && !under) c = d > 0.5 ? r.ink : r.line;                               // the crack between two columns
      else if (left && lum > 0.12) c = r.light;                                       // its lit left edge
      else if (under && h2(kx(f), ky(f), salt + 35) < 0.35) c = r.dark;               // a ledge: shadow under it
      if (y - lip[x] < 2.2) c = r.line;                                                // under the overhanging grass
      if (y1 - y <= 1 + Math.trunc(h2(x, 1, salt + 36) * 2)) c = r.ink;                // the foot sinks into the dark
      paint(x, y, c, rock);
    }
  }
  // grass hanging over the lip, in curtains
  const [odds, longest] = st.drape ?? [0.75, 12];
  const moss = r.moss, grass = st.grass ?? [moss[moss.length - 1], moss[Math.max(0, moss.length - 2)], moss[1] ?? moss[0], moss[0]];
  for (let x0 = -6, k = 0; x0 < W; k++) {
    const wd = 3 + Math.trunc(h2(k, 1, salt + 41) * 8);
    if (h2(k, 2, salt + 41) < odds) {
      const L = 2 + h2(k, 3, salt + 41) ** 1.5 * (longest - 2);
      for (let x = x0; x < x0 + wd; x++) {
        if (x < 0 || x >= W || !solid[x]) continue;
        const s = Math.sin(Math.PI * (x - x0 + 0.5) / wd);
        const len = Math.max(1, Math.round(L * s ** 0.6 + 2.5 * (h2(x, 4, salt + 41) - 0.5)));
        const top = Math.ceil(lip[x]) - 1;
        for (let j = 0; j <= len; j++) {
          const y = top + j;
          if (y >= foot[x] - 3) break;
          const edge = j === len || x === x0 || x === x0 + wd - 1;
          const c = j === 0 ? grass[0] : edge ? grass[3] : j < len * 0.5 ? grass[1] : grass[2];
          paint(x, y, c, rock);
        }
      }
    }
    x0 += wd + Math.trunc(h2(k, 5, salt + 41) * 5);
  }
  // the lit rim of the grass on the lip, broken
  for (let x = 0; x < W; x++) {
    if (!solid[x]) continue;
    const y = Math.ceil(lip[x]) - 2;
    if (h2(Math.floor(x / 3), 6, salt + 42) < 0.7) paint(x, y, grass[0], ctx.kindAt(x, y));
  }
  // bushes leaning over the lip, half on the grass, half over the face
  const [bEvery, bRad] = st.bushes ?? [22, 6];
  if (bEvery > 0) {
    const ramp = [grass[0], grass[1], grass[2], grass[3], r.ink];
    const bushes: Clump[] = [];
    // in clumps of one to four, big and small, with bare stretches between
    for (let x = 4 + h2(0, 0, salt + 71) * bEvery, k = 0; x < W; k++) {
      if (h2(k, 1, salt + 71) < 0.7) {
        const many = 1 + Math.trunc(h2(k, 3, salt + 71) * 4);
        let bx = x;
        for (let i = 0; i < many; i++) {
          const rr = bRad * (0.45 + 0.85 * h2(k, 10 + i, salt + 71) ** 1.4);
          const xi = at(bx);
          if (solid[xi]) bushes.push([bx, lip[xi] + rr * (0.1 + 0.4 * h2(k, 20 + i, salt + 71)), rr, ramp]);
          bx += rr * (1.0 + 0.6 * h2(k, 30 + i, salt + 71));
        }
        x = bx;
      }
      x += bEvery * (0.4 + 1.2 * h2(k, 4, salt + 71));
    }
    for (const [key, c] of paintClumps(W, H, bushes, salt + 72)) {
      const x = key % W, y = Math.floor(key / W);
      if (y < foot[x] - 6) paint(x, y, c, y >= Math.ceil(lip[x]) ? rock : ctx.kindAt(x, y) || rock);
    }
  }
  const water = st.water;
  // the falls: water runs to the lip in a notch and falls straight into the clouds
  const flow = st.flow ? ctx.layer(st.flow) : null;
  const falls: [number, number][] = [];
  if (st.falls && water) {
    const wt = (i: number) => ctx.tone(water, i);   // deep, mid, shallow, foam, glint
    st.falls.forEach(([u, hw], k) => {
      const cx = ctx.P(u, 0)[0];
      // from the lip, or out of a cleft `spring` px down the face
      const spring = st.spring ?? 0;
      const top = Math.ceil(lip[at(cx)]) + (spring > 0 ? spring : -2);
      let bottom = 0;
      for (let x = Math.trunc(cx - hw) - 1; x <= cx + hw + 1; x++) bottom = Math.max(bottom, foot[at(x)]);
      bottom += 2;
      falls.push([cx, bottom]);
      for (let y = top; y < Math.min(H, bottom); y++) {
        const sway = 0.6 * n1(y / 9.0, salt + 51 + k), half = hw * (1 + 0.25 * Math.min(1, (y - top) / 30));
        for (let x = Math.trunc(cx - half - 1); x <= Math.trunc(cx + half + 1); x++) {
          const dx = (x + 0.5 - cx - sway) / half;
          if (Math.abs(dx) > 1) continue;
          const streak = h2(x, Math.floor((y + 13 * h2(x, 0, salt + 52 + k)) / (4 + Math.trunc(h2(x, 1, salt + 52 + k) * 7))), salt + 53 + k);
          let c = Math.abs(dx) > 0.8 ? (dx < 0 ? wt(1) : wt(0)) : streak < 0.42 ? wt(1) : streak < 0.85 ? wt(2) : wt(3);
          if (y - top < 2) c = y === top ? wt(4) : wt(3);                      // the spill over the lip
          paint(x, y, c, water, true);
          beyond.set(x, y, false);
          if (flow && Math.abs(dx) < 0.8 && h2(x, Math.floor(y / 3), salt + 54 + k) < 0.4) flow.set(x, y, (y % 3) === 0 ? wt(4) : wt(3));
        }
      }
      if (spring > 0) {
        // the cleft it comes out of: dark, a little wider than the water
        for (let y = top - 4; y < top + 1; y++) {
          const half = (hw + 1.5) * Math.sqrt(Math.max(0, 1 - ((y - top + 1.5) / 3.2) ** 2));
          for (let x = Math.trunc(cx - half); x <= Math.trunc(cx + half); x++) paint(x, y, y >= top - 1 && Math.abs(x + 0.5 - cx) < hw ? wt(3) : r.ink, rock, true);
        }
        return;
      }
      // the stream it comes from: a notch of water in the grass above the lip, with dark banks
      const run = st.run ?? 12;
      for (let y = top - run; y < top; y++) {
        const f = (y - top + run) / run, half = hw * (0.45 + 0.55 * f) + 0.8 * n1(y / 4.0, salt + 56 + k);
        const mid = cx + 1.5 * n1(y / 7.0, salt + 57 + k) * (1 - f);
        for (let x = Math.trunc(mid - half) - 1; x <= Math.trunc(mid + half) + 1; x++) {
          const dx = (x + 0.5 - mid) / Math.max(1, half);
          if (Math.abs(dx) > 1.25) continue;
          const c = Math.abs(dx) > 1 ? (dx < 0 ? r.line : r.dark) : Math.abs(dx) > 0.7 ? wt(1) : h2(x, y, salt + 58 + k) < 0.2 ? wt(3) : wt(2);
          paint(x, y, c, Math.abs(dx) > 1 ? rock : water, true);
          if (flow && Math.abs(dx) < 0.6 && h2(x, Math.floor(y / 2), salt + 59 + k) < 0.3) flow.set(x, y, wt(3));
        }
      }
    });
  }
  // banks of cloud hiding the foot (and the spray where the falls go into them), over everything
  const [every, thick, up] = st.mist ?? [40, 5, 4];
  const before = g.px.slice();
  for (let x = -20 + h2(0, 0, salt + 61) * 20, k = 0; x < W + 20; k++) {
    const ln = every * (0.6 + 0.9 * h2(k, 1, salt + 61));
    const xi = at(x + ln / 2);
    if (h2(k, 2, salt + 61) < 0.85) {
      cloudBank(ctx, t, Math.trunc(foot[xi] - up + 4 * (h2(k, 3, salt + 61) - 0.5)), x, x + ln, thick + Math.trunc(h2(k, 5, salt + 61) * 3), salt + 63 + k);
    }
    x += ln * (0.55 + 0.4 * h2(k, 4, salt + 61));
  }
  falls.forEach(([cx, bottom], k) => cloudBank(ctx, t, Math.trunc(bottom - 6), cx - 14, cx + 14, 6, salt + 91 + k));
  // what goes down the face (a stairway) is swallowed by a bank where it reaches the foot
  if (keep.size) {
    let from = -1;
    for (let x = 0; x <= W; x++) {
      let hit = false;
      if (x < W && solid[x]) for (let y = Math.trunc(foot[x]) - 4; y < foot[x] + 30 && !hit; y++) hit = keep.has(ctx.kindAt(x, y));
      if (hit && from < 0) from = x;
      if (!hit && from >= 0) {
        const mid = at((from + x) / 2);
        cloudBank(ctx, t, Math.trunc(foot[mid] - 2), from - 10, x + 10, 8, salt + 95 + from);
        from = -1;
      }
    }
  }
  for (let i = 0; i < g.px.length; i++) {
    if (g.px[i] === before[i]) continue;
    const x = i % W, y = Math.floor(i / W);
    if (y < lip[x] + 10) { g.px[i] = before[i]; continue; }   // never over the lip
    ctx.kind[i] = sea;
    beyond.set(x, y, false);
    for (const l of clear) l.set(x, y, null);
  }
  ctx.masks.set(st.id ?? `brink${idx}`, beyond);
}

/** A closed Catmull-Rom curve through the points, about one point per `step` px. */
function closedCurve(pts: Pt[], step = 1): Pt[] {
  const n = pts.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const k = Math.max(2, Math.floor(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const at = (q: 0 | 1) => 0.5 * ((2 * p1[q]) + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2
        + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  return out;
}

/**
 * The whole island: `lip` is a closed loop around it. Inside stays as it is;
 * outside, the south faces fall under every lip that looks south (the top
 * shifted down: in 3/4 the sides of the cliff come out vertical, as a column's
 * do), a narrower face of rock shows on the sides (lit on the west, in shade on
 * the east), the north lip gets a crisp edge and nothing hangs from it, and
 * everything else is the sky far below. With `view` the faces are seen in
 * perspective instead (see sweep): no upright side bands.
 */
function runRing(ctx: Ctx, st: BrinkStep, idx: number): void {
  const { W, H } = ctx, g = ctx.ground, rock = st.face, sea = st.sea;
  const r = stoneRoles(ctx, rock), t = (i: number) => ctx.tone(sea, i);
  const salt = st.salt ?? 1500;
  const keep = new Set(st.skip ?? []);
  const clear = (st.clear ?? []).map(n => ctx.layer(n));
  const [w1, w2] = st.wobble ?? [2.4, 1.2];
  const [d0, d1, d2] = st.drop ?? [40, 10, 6];
  const [sx, sy] = st.slabs ?? [6, 30];
  const col = st.strips ? strips(salt + 31, sx, sy, st.jitter ?? 0.7, W, H) : columns(salt + 31, sx, sy, st.jitter ?? 0.7);
  const at = (x: number) => Math.max(0, Math.min(W - 1, Math.trunc(x)));
  // the lip: the loop, smooth, pushed in and out along its normal by two waves
  const base = closedCurve(st.lip.map(([u, v]) => ctx.P(u, v)), 1);
  let sum = 0;
  const loop: Pt[] = base.map((p, i) => {
    const q = base[(i + 1) % base.length], o = base[(i - 1 + base.length) % base.length];
    if (i > 0) sum += Math.hypot(p[0] - o[0], p[1] - o[1]);
    const tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1;
    const off = w1 * n1(sum / 23.0, salt + 1) + w2 * n1(sum / 7.0, salt + 2);
    return [p[0] + (ty / tl) * off, p[1] - (tx / tl) * off];
  });
  // the top: inside the loop (even-odd, at the centre of each px)
  const top = new Mask(W, H);
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5, xs: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      const [ax, ay] = loop[i], [bx, by] = loop[(i + 1) % loop.length];
      if ((ay <= yc) !== (by <= yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < Math.min(W, Math.ceil(xs[k + 1] - 0.5)); x++) top.set(x, y);
  }
  const free = (x: number, y: number) => !keep.has(ctx.kindAt(x, y));
  const paint = (x: number, y: number, c: string, kind: string, over = false) => {
    if (x < 0 || y < 0 || x >= W || y >= H || (!over && !free(x, y))) return false;
    g.set(x, y, c);
    ctx.setKind(x, y, kind);
    for (const l of clear) l.set(x, y, null);
    return true;
  };
  // the south faces: under each lip that looks south, as deep as the drop of its column
  const [sw0, sw1, sw2] = st.swell ?? [0, 1, 0];
  const dropAt = (x: number) => d0 + d1 * fbm(x / 11.0, 0.5, salt + 3, 2) + d2 * h2(Math.floor(x / sx), 0, salt + 4)
    + (sw0 ? sw0 * (fbm(x / sw1, 0.5, sw2, 2) - 0.5) * 2 : 0);
  const depth = new Float32Array(W * H).fill(-1);   // 0..1 down a south face
  const lipY = new Float32Array(W).fill(-1), foot = new Float32Array(W).fill(-1);
  for (let x = 0; x < W; x++) {
    const drop = dropAt(x);
    let last = -1e9;
    for (let y = 0; y < H; y++) {
      if (top.has(x, y)) { last = y; continue; }
      const d = y - last;
      if (d <= drop) {
        depth[y * W + x] = d / drop;
        if (d === 1) { lipY[x] = y; foot[x] = y + drop; }
      }
    }
  }
  // view: the faces in perspective instead (every face hangs from its own lip, as wide as it looks south; no `side`)
  const fv = st.view ? sweep(W, H, st.view, loop, base, top, dropAt, sx, sy, st.jitter ?? 0.7, salt + 31) : null;
  if (fv) {
    depth.fill(-1);
    foot.fill(-1);
    for (let i = 0; i < W * H; i++) {
      if (fv.key[i] < 0) continue;
      depth[i] = fv.frac[i];
      const x = i % W, y = Math.floor(i / W);
      if (y + 1 > foot[x]) foot[x] = y + 1;
    }
  }
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (top.has(x, y) || depth[y * W + x] >= 0);
  // the sides: rock seen at an angle, as wide as `side` px, never above a lip (no face looks north)
  const [s0, s1, sWest = 0] = fv ? [0, 0, 0] : st.side ?? [7, 5];
  const sideAt = (y: number) => s0 + s1 * fbm(y / 9.0, 0.5, salt + 5, 2) + 3 * h2(Math.floor(y / 5), 0, salt + 6) + 1.5 * n1(y / 3.0, salt + 7);
  // the west side, in the light, can be wider: the face seen more from the front
  const westAt = (y: number) => sideAt(y) + sWest * (0.75 + 0.5 * fbm(y / 23.0, 0.5, salt + 8, 2));
  const side = new Float32Array(W * H).fill(0);    // + west (lit), - east (shade): how far out, 0..1
  for (let y = 0; y < H && !fv; y++) {
    const sw = sideAt(y), ww = westAt(y);
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      let above = false;
      for (let k = 1; k <= 3; k++) if (top.has(x, y + k)) above = true;
      if (above) continue;
      let dl = 0, dr = 0;
      for (let k = 1; k <= Math.max(sw, ww); k++) { if (!dr && k <= ww && solid(x + k, y)) dr = k; if (!dl && k <= sw && solid(x - k, y)) dl = k; }
      // the extra west width only beside the top or the upper face, never off the foot of a south face
      if (dr > sw && !top.has(x + dr, y) && depth[y * W + x + dr] > 0.5) dr = 0;
      if (dr && (!dl || dr <= dl)) side[y * W + x] = dr / ww;
      else if (dl) side[y * W + x] = -dl / sw;
    }
  }
  // a bay (the lip bites into the island): the face of the back of the bay goes on behind the lip of the
  // shoulder in front of it, instead of a slit of sky between them (a face beside, the top just past it, same row)
  for (let y = 0; y < H && !fv; y++) {
    for (let x = 0; x < W - 1; x++) {
      if (solid(x, y) || side[y * W + x] <= 0 || side[y * W + x + 1] !== 0) continue;
      let k = 1;
      while (k <= 4 && x + k < W && !solid(x + k, y) && side[y * W + x + k] === 0) k++;
      if (k > 4 || x + k >= W || !top.has(x + k, y)) continue;
      for (let j = 1; j < k; j++) side[y * W + x + j] = side[y * W + x];
    }
    for (let x = W - 1; x >= 1; x--) {
      if (solid(x, y) || side[y * W + x] >= 0 || side[y * W + x - 1] !== 0) continue;
      let k = 1;
      while (k <= 4 && x - k >= 0 && !solid(x - k, y) && side[y * W + x - k] === 0) k++;
      if (k > 4 || x - k < 0 || !top.has(x - k, y)) continue;
      for (let j = 1; j < k; j++) side[y * W + x - j] = side[y * W + x];
    }
  }
  // a wider west side shows its columns narrower, seen at an angle (both sides, so they match)
  const narrow = (x: number) => (x < W / 2 ? Math.floor(x * 1.7) : W - 1 - Math.floor((W - 1 - x) * 1.7));
  const cl = fv
    ? (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H && fv.key[y * W + x] >= 0 ? fv.key[y * W + x] : col(x, y))
    : sWest > 0
    ? (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H && side[y * W + x] !== 0 ? col(narrow(x), y) : col(x, y))
    : col;
  const beyond = new Mask(W, H);
  const [hx, hy, hs] = st.haze ?? [60, 7, 1211];
  const moss = r.moss, grass = st.grass ?? [moss[moss.length - 1], moss[Math.max(0, moss.length - 2)], moss[1] ?? moss[0], moss[0]];
  const contrast = st.contrast ?? 0.32, ledges = st.ledges ?? 0, dim = st.dim ?? 1.0, eastLum = st.shade ?? -0.3, westLum = st.lit ?? 0.45;
  // a cap of grass on the top of a block of a column (where it sits on the one below): px from that top, or -1
  const capAt = (x: number, y: number, f: number): number => {
    if (!ledges || h2(kx(f), ky(f), salt + 44) >= ledges) return -1;
    let j = 0;
    while (j < 6 && cl(x, y - j - 1) === f) j++;
    // a clump: thick in the middle of the block, ragged at its ends, a tongue hanging here and there
    const ends = (cl(x - 1, y - j) !== f ? 1 : 0) + (cl(x + 1, y - j) !== f ? 1 : 0);
    const len = 2 + Math.trunc(h2(x, ky(f), salt + 45) * 3) + (h2(x >> 1, ky(f), salt + 47) < 0.3 ? 3 : 0) - 2 * ends;
    return j < len && solid(x, y - j - 1) && !top.has(x, y - j - 1) ? (j === len - 1 ? 3 : j === 0 ? 0 : j <= len / 2 ? 1 : 2) : -1;
  };
  const [fOdds, fLong] = st.fringe ?? [0, 0];
  const tongue = (y: number, east: number): number => {
    const k = Math.floor((y + 4) / 5), y0 = k * 5 - 4, hgt = 2 + Math.trunc(h2(k, 1 + east, salt + 46) * 6);
    if (h2(k, 2 + east, salt + 46) >= fOdds || y - y0 >= hgt) return 0;
    return Math.max(1, Math.round(fLong * (0.3 + 0.7 * h2(k, 3 + east, salt + 46)) * Math.sin(Math.PI * (y - y0 + 0.5) / hgt) ** 0.6));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (top.has(x, y)) continue;
    const i = y * W + x, d = depth[i], sd = side[i];
    const f = cl(x, y), fr = h2(kx(f), ky(f), salt + 33) * 2 - 1;
    const right = cl(x + 1, y) !== f, left = cl(x - 1, y) !== f, under = cl(x, y + 1) !== f;
    if (fv && fv.key[i] >= 0) {
      // a face in perspective: its columns follow the strip they hang along (they lean out on the sides),
      // lit on the west, in shade on the east, darker going down; the cracks and ledges in its own columns
      const nx = fv.nx[i], cu = kx(f), cb = ky(f);
      const lum = 0.3 + (nx < 0 ? westLum - 0.3 : eastLum - 0.3) * Math.abs(nx) - contrast * fr - dim * fv.frac[i]
        + 0.22 * n1((fv.u[i] * (1 - Math.abs(nx)) + x * Math.abs(nx)) / 2.6, salt + 34) + 0.1 * n1(y / 6.0 + x, salt + 37);   // streaks: upright on a side
      let c = lum > 0.42 ? r.light : lum > 0.1 ? r.mid : lum > -0.25 ? r.shadow : lum > -0.6 ? r.dark : r.line;
      let crack = false, lit = false, ledge = false, rim = false;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const X = x + ax, Y = y + ay;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const k = fv.key[Y * W + X];
        if (k < 0) { if (!top.has(X, Y)) rim = true; continue; }
        if (kx(k) > cu) crack = true;
        else if (kx(k) < cu) lit = true;
        else if (ky(k) > cb) ledge = true;
      }
      if (crack) c = Math.abs(nx) > 0.5 ? (lum > 0.1 ? r.shadow : r.dark) : fv.frac[i] > 0.5 ? r.ink : r.line;   // softer on a side, seen at an angle
      else if (lit && lum > 0.12) c = r.light;
      else if (ledge && h2(cu, cb, salt + 35) < 0.35) c = r.dark;
      const cap = fv.frac[i] < 0.85 && !crack ? capAt(x, y, f) : -1;
      if (cap >= 0) c = grass[cap];
      if (fv.out[i] < 2.2) c = r.line;                                                   // in the shadow of the grass over the lip
      if (fv.foot[i] - fv.down[i] < 1 + Math.trunc(h2(x, 1, salt + 36) * 2)) c = r.ink;  // the foot sinks into the dark
      else if (rim) c = nx < -0.3 ? r.dark : r.line;                                      // its edge against the sky
      paint(x, y, c, rock);
    } else if (d >= 0) {
      // a south face: tall columns lit from the left, darker going down
      const lum = 0.3 - contrast * fr - dim * d + 0.22 * n1(x / 2.6, salt + 34) + 0.1 * n1(y / 6.0 + x, salt + 37);
      let c = lum > 0.42 ? r.light : lum > 0.1 ? r.mid : lum > -0.25 ? r.shadow : lum > -0.6 ? r.dark : r.line;
      if (right && !under) c = d > 0.5 ? r.ink : r.line;
      else if (left && lum > 0.12) c = r.light;
      else if (under && h2(kx(f), ky(f), salt + 35) < 0.35) c = r.dark;
      const cap = d < 0.85 && !right ? capAt(x, y, f) : -1;
      if (cap >= 0) c = grass[cap];
      if (top.has(x, y - 1) || top.has(x, y - 2)) c = r.line;                         // under the overhanging grass
      if (!solid(x, y + 1) || !solid(x, y + 1 + Math.trunc(h2(x, 1, salt + 36) * 2))) c = r.ink; // the foot sinks into the dark
      if (!solid(x - 1, y) && side[i - 1] === 0 || !solid(x + 1, y) && side[i + 1] === 0) c = r.ink;
      paint(x, y, c, rock);
    } else if (sd !== 0) {
      // a side: lit on the west, in shade on the east, the outer px dark
      const a = Math.abs(sd), west = sd > 0;
      // down each block of a column it darkens (dim): the blocks read as ledges stacked down the side, not flat panels
      let jt = 0, jb = 0;
      if (sWest > 0) {
        while (jt < 48 && cl(x, y - jt - 1) === f) jt++;
        while (jb < 48 && cl(x, y + jb + 1) === f) jb++;
      }
      const lum = (west ? westLum : eastLum) - 0.5 * a - (contrast * 0.94) * fr + 0.2 * n1(x / 2.6, salt + 34) + 0.12 * n1(y / 3.0 + x, salt + 38)
        - (sWest > 0 ? dim * 0.6 * (jt / (jt + jb + 1) - 0.4) : 0);
      let c = lum > 0.42 ? r.light : lum > 0.1 ? r.mid : lum > -0.25 ? r.shadow : lum > -0.6 ? r.dark : r.line;
      if (right && !under) c = west ? r.dark : r.line;                                    // the cracks between columns
      else if (left && west && lum > 0.1) c = r.light;
      else if (under && h2(kx(f), ky(f), salt + 35) < 0.35) c = r.dark;
      const cap = !right ? capAt(x, y, f) : -1;
      if (cap >= 0) c = grass[cap];
      const wd = west ? westAt(y) : sideAt(y);
      if (a * wd > wd - 1.2) c = west ? r.line : r.ink;                                    // the far edge, against the sky

      paint(x, y, c, rock);
    } else if (paint(x, y, fbm(x / hx, y / hy, hs, 2) < 0.3 ? t(0) : t(1), sea)) beyond.set(x, y);
  }
  // clumps of green sitting on some ledges, half over the face below
  const [tOdds, tRad, tReach = 2] = st.tufts ?? [0, 0];
  if (tOdds > 0) {
    const clumps: Clump[] = [], ramp = [grass[0], grass[1], grass[1], grass[2], grass[3]];   // no ink outline: a cushion, not a ball
    for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
      if (top.has(x, y) || !(depth[y * W + x] >= 0 || side[y * W + x] !== 0)) continue;
      const f = cl(x, y);
      if (cl(x, y - 1) === f || cl(x - 1, y) === f || top.has(x, y - 1) || !solid(x, y - 1)) continue;   // the first px of the top row of a block
      if (h2(kx(f), ky(f), salt + 48) >= tOdds) continue;
      let w = 1;
      while (w < 40 && cl(x + w, y) === f) w++;
      const rr = tRad * (0.55 + 0.6 * h2(kx(f), ky(f), salt + 49));
      clumps.push([x + w * (0.25 + 0.5 * h2(kx(f), ky(f), salt + 50)), y - rr * 0.25, rr, ramp]);
    }
    for (const [key, c] of paintClumps(W, H, clumps, salt + 51)) {
      const x = key % W, y = Math.floor(key / W);
      if (top.has(x, y) || !(depth[key] >= 0 || side[key] !== 0)) continue;
      // a cushion: only what sits on the ledge (a block boundary up to 3 px below) or 2 px over the block under it
      let on = false;
      for (let j = -tReach; j <= 3 && !on; j++) if (cl(x, y + j) !== cl(x, y + j - 1)) on = true;
      if (on) paint(x, y, c, rock);
    }
  }
  // grass hanging out over the sides from the lip, in tongues (where the edge looks west or east, not under a south lip)
  if (fOdds > 0) {
    for (let y = 2; y < H; y++) for (let x = 0; x < W; x++) {
      if (top.has(x, y) || top.has(x, y - 1) || top.has(x, y - 2) || (depth[y * W + x] < 0 && side[y * W + x] === 0)) continue;
      for (const dir of [1, -1]) {
        let out = 1;
        while (out <= fLong && !top.has(x + dir * out, y)) out++;
        if (out > fLong) continue;
        const len = tongue(y, dir > 0 ? 0 : 7);
        if (out > len) continue;
        const lit = dir > 0;   // the west side is in the light
        const c = out === len ? grass[3] : out === 1 ? (lit ? grass[0] : grass[1]) : out < len * 0.6 ? (lit ? grass[1] : grass[2]) : grass[2];
        paint(x, y, c, rock);
        break;
      }
    }
  }
  // the lip: grass over the edge. South: curtains hanging down the face; north: a crisp dark line and a lit rim
  const [odds, longest] = st.drape ?? [0.75, 12];
  const curtain = (x: number): number => {
    const k = Math.floor((x + 6) / 7), x0 = k * 7 - 6, wd = 3 + Math.trunc(h2(k, 1, salt + 41) * 8);
    if (h2(k, 2, salt + 41) >= odds || x - x0 >= wd) return 0;
    const L = 2 + h2(k, 3, salt + 41) ** 1.5 * (longest - 2), sn = Math.sin(Math.PI * (x - x0 + 0.5) / wd);
    return Math.max(1, Math.round(L * sn ** 0.6 + 2.5 * (h2(x, 4, salt + 41) - 0.5)));
  };
  for (let x = 0; x < W; x++) for (let y = 1; y < H - 1; y++) {
    if (!top.has(x, y)) continue;
    if (!top.has(x, y + 1) && depth[(y + 1) * W + x] >= 0) {
      const len = curtain(x);
      for (let j = 0; j <= len; j++) {
        const Y = y + j, dd = depth[Y * W + x];
        if (j > 0 && (dd < 0 || dd > 0.75)) break;
        const c = j === 0 ? grass[0] : j === len ? grass[3] : j < len * 0.5 ? grass[1] : grass[2];
        paint(x, Y, c, j === 0 ? ctx.kindAt(x, Y) : rock);
      }
      if (h2(Math.floor(x / 3), 6, salt + 42) < 0.7) paint(x, y - 1, grass[0], ctx.kindAt(x, y - 1));
    } else if (!top.has(x, y - 1)) {
      paint(x, y, grass[3], ctx.kindAt(x, y));
      if (top.has(x, y + 1)) paint(x, y + 1, grass[0], ctx.kindAt(x, y + 1));
      // in perspective, the thickness of the far lip: a px or two of its rock over the sky
      if (fv && y > 1 && fv.key[(y - 1) * W + x] < 0) {
        if (paint(x, y - 1, r.line, rock)) beyond.set(x, y - 1, false);
        if (h2(x >> 1, 9, salt + 43) < 0.35 && fv.key[(y - 2) * W + x] < 0 && !top.has(x, y - 2) && paint(x, y - 2, r.dark, rock)) beyond.set(x, y - 2, false);
      }
    }
  }
  // bushes leaning over the lip all around, in clumps of one to four, with bare stretches between
  // (and none at all in a bay: `bare`, where the grass runs to the edge)
  const [bEvery, bRad] = st.bushes ?? [22, 6], bare = st.bare ?? [];
  const pinned = new Mask(W, H);
  if (bEvery > 0) {
    const ramp = [grass[0], grass[1], grass[2], grass[3], r.ink];
    const bushes: Clump[] = [];
    let walked = 0, next = h2(0, 0, salt + 71) * bEvery, k = 0;
    for (let i = 1; i < loop.length; i++) {
      walked += Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]);
      if (walked < next) continue;
      if (h2(k, 1, salt + 71) < 0.7) {
        const many = 1 + Math.trunc(h2(k, 3, salt + 71) * 4);
        for (let j = 0; j < many; j++) {
          const rr = bRad * (0.45 + 0.85 * h2(k, 10 + j, salt + 71) ** 1.4);
          const q = loop[Math.min(loop.length - 1, i + Math.trunc(j * rr * 1.2))];
          // in a bay the bush is still drawn, with no size: the bushes after it keep their shapes
          const gone = bare.some(([u, v, br]) => Math.hypot(q[0] - ctx.P(u, v)[0], q[1] - ctx.P(u, v)[1]) < br * ctx.cell + rr);
          bushes.push([q[0], q[1] + rr * 0.3, gone ? 0 : rr, ramp]);
        }
      }
      next = walked + bEvery * (0.6 + 1.2 * h2(k, 4, salt + 71));
      k++;
    }
    for (const [key, c] of paintClumps(W, H, bushes, salt + 72)) {
      const x = key % W, y = Math.floor(key / W);
      const dd = depth[key];
      if (dd > 0.6) continue;
      if (paint(x, y, c, top.has(x, y) ? ctx.kindAt(x, y) || rock : rock)) { beyond.set(x, y, false); pinned.set(x, y); }
    }
  }
  const water = st.water;
  const flow = st.flow ? ctx.layer(st.flow) : null;
  const falls: [number, number][] = [];
  if (st.falls && water) {
    const wt = (i: number) => ctx.tone(water, i);
    st.falls.forEach((fall, k) => {
      const [u, hw] = fall, spring = st.spring ?? 0;
      let cx: number, topY: number, bottom: number;
      if (fall.length === 4) {
        // from the first edge at or below (u, v), straight down `length` px over the side and the sky
        const [px, py] = ctx.P(u, fall[2]);
        cx = px;
        // inside the island: out to the nearer side edge first
        let y = Math.trunc(py);
        if (top.has(Math.trunc(cx), y)) {
          let l = Math.trunc(cx), r = Math.trunc(cx);
          while (l > 0 && top.has(l, y)) l--;
          while (r < W - 1 && top.has(r, y)) r++;
          cx = cx - l <= r - cx ? l : r;
        }
        while (y < H && top.has(Math.trunc(cx), y)) y++;
        topY = y + spring;
        bottom = topY + fall[3];
      } else {
        cx = ctx.P(u, 0)[0];
        const lip = lipY[at(cx)], ft = foot[at(cx)];
        if (lip < 0) return;
        topY = Math.ceil(lip) + spring;
        bottom = ft + 2;
      }
      falls.push([cx, bottom]);
      if (st.pour) {
        pour(ctx, st.pour, cx, topY, bottom, hw, salt + 50 + k, wt, st.clouds ?? [t(6), t(5), t(4), t(3)], r.ink, rock, water, flow,
          (x, y) => fall.length === 4 && top.has(x, y), paint, (x, y) => beyond.set(x, y, false));
        return;
      }
      for (let y = topY; y < Math.min(H, bottom); y++) {
        const sway = 0.6 * n1(y / 9.0, salt + 51 + k), half = hw * (1 + 0.25 * Math.min(1, (y - topY) / 30));
        for (let x = Math.trunc(cx - half - 1); x <= Math.trunc(cx + half + 1); x++) {
          const dx = (x + 0.5 - cx - sway) / half;
          if (Math.abs(dx) > 1 || (fall.length === 4 && top.has(x, y))) continue;   // a fall off a side passes behind the island where it bulges
          const streak = h2(x, Math.floor((y + 13 * h2(x, 0, salt + 52 + k)) / (4 + Math.trunc(h2(x, 1, salt + 52 + k) * 7))), salt + 53 + k);
          let c = Math.abs(dx) > 0.8 ? (dx < 0 ? wt(1) : wt(0)) : streak < 0.42 ? wt(1) : streak < 0.85 ? wt(2) : wt(3);
          if (y - topY < 2) c = y === topY ? wt(4) : wt(3);
          paint(x, y, c, water, true);
          beyond.set(x, y, false);
          if (flow && Math.abs(dx) < 0.8 && h2(x, Math.floor(y / 3), salt + 54 + k) < 0.4) flow.set(x, y, (y % 3) === 0 ? wt(4) : wt(3));
        }
      }
      for (let y = topY - 4; y < topY + 1; y++) {
        const half = (hw + 1.5) * Math.sqrt(Math.max(0, 1 - ((y - topY + 1.5) / 3.2) ** 2));
        for (let x = Math.trunc(cx - half); x <= Math.trunc(cx + half); x++) {
          if (fall.length === 4 && top.has(x, y)) continue;
          paint(x, y, y >= topY - 1 && Math.abs(x + 0.5 - cx) < hw ? wt(3) : r.ink, rock, true);
        }
      }
    });
  }
  // banks of cloud hiding the feet, over everything but the top
  const [every, thick, up] = st.mist ?? [40, 5, 4];
  const before = g.px.slice();
  if (st.billows) {
    // masses of cumulus swallowing the foot, big and small; the falls end in a big one
    const [bEvery, bR, bUp] = st.billows, tones: Tones4 = st.clouds ?? [t(6), t(5), t(4), t(3)];
    const put = (x: number, y: number, c: string) => g.set(x, y, c);
    const masses: [number, number, number, number][] = [];
    for (let x = -10 + h2(0, 0, salt + 81) * bEvery, k = 0; x < W + 10; k++) {
      const xi = at(x);
      let ft = foot[xi];
      // past the end of the south faces: the foot of the side, where the island ends going down
      if (ft <= 0) for (let y = H - 1; y > 0; y--) if (solid(xi, y) || side[y * W + xi] !== 0) { ft = y + 1; break; }
      // in perspective, none at the foot of a side face that ends higher up (it would float by the side of the island)
      if (fv && ft > 0 && Math.abs(fv.nx[Math.min(H - 1, Math.trunc(ft - 1)) * W + xi]) > 0.7) ft = 0;
      if (ft > 0) masses.push([x, ft - bUp + 14 * (h2(k, 3, salt + 81) - 0.35), bR * (0.45 + 1.45 * h2(k, 2, salt + 81) ** 2), salt + 83 + k]);
      x += bEvery * (0.5 + 0.8 * h2(k, 4, salt + 81));
    }
    falls.forEach(([cx, bottom], k) => masses.push([cx, bottom - bUp * 0.5, bR * 1.25, salt + 97 + k]));
    masses.sort((a, b) => a[1] - b[1]);
    const skyTones = new Set([t(0), t(1), t(2)]);
    const edge = st.soft ? {
      rim: [st.soft.rim?.[0] ?? t(2), st.soft.rim?.[1] ?? t(2)] as [string, string], lumps: st.soft.lumps, ragged: st.soft.ragged, bright: st.soft.bright, smooth: st.soft.smooth,
      free: (x: number, y: number) => !top.has(x, y) && skyTones.has(g.get(x, y) ?? ''),
    } : {};
    for (const [x, y, r, s] of masses) cumulus(W, H, x, y, r, s, tones, put, 0.7, edge);
  } else {
    for (let x = -20 + h2(0, 0, salt + 61) * 20, k = 0; x < W + 20; k++) {
      const ln = every * (0.6 + 0.9 * h2(k, 1, salt + 61));
      const xi = at(x + ln / 2);
      if (h2(k, 2, salt + 61) < 0.85 && foot[xi] > 0) {
        cloudBank(ctx, t, Math.trunc(foot[xi] - up + 4 * (h2(k, 3, salt + 61) - 0.5)), x, x + ln, thick + Math.trunc(h2(k, 5, salt + 61) * 3), salt + 63 + k);
      }
      x += ln * (0.55 + 0.4 * h2(k, 4, salt + 61));
    }
    falls.forEach(([cx, bottom], k) => cloudBank(ctx, t, Math.trunc(bottom - 6), cx - 14, cx + 14, 6, salt + 91 + k));
  }
  if (keep.size) {
    let from = -1;
    for (let x = 0; x <= W; x++) {
      let hit = false;
      if (x < W && foot[x] > 0) for (let y = Math.trunc(foot[x]) - 4; y < foot[x] + 30 && !hit; y++) hit = keep.has(ctx.kindAt(x, y));
      if (hit && from < 0) from = x;
      if (!hit && from >= 0) {
        if (st.billows) {
          const tones: Tones4 = st.clouds ?? [t(6), t(5), t(4), t(3)], mid = (from + x) / 2;
          cumulus(W, H, mid, foot[at(mid)] - st.billows[2] * 0.5, Math.max(st.billows[1], (x - from) * 0.7), salt + 95 + from, tones, (X, Y, c) => g.set(X, Y, c));
        } else cloudBank(ctx, t, Math.trunc(foot[at((from + x) / 2)] - 2), from - 10, x + 10, 8, salt + 95 + from);
        from = -1;
      }
    }
  }
  for (let i = 0; i < g.px.length; i++) {
    if (g.px[i] === before[i]) continue;
    const x = i % W, y = Math.floor(i / W);
    if (top.has(x, y) || (fv ? fv.key[i] >= 0 && fv.out[i] < 9 : lipY[x] >= 0 && y < lipY[x] + 9)) { g.px[i] = before[i]; continue; }
    ctx.kind[i] = sea;
    beyond.set(x, y, false);
    for (const l of clear) l.set(x, y, null);
  }
  ctx.masks.set(st.id ?? `brink${idx}`, beyond);
  ctx.masks.set(`${st.id ?? `brink${idx}`} top`, top);
}


/**
 * A fall that pours (brink `pour`): the water comes out of a cleft whose edge is
 * broken (dark rock biting into the head at different depths), narrow there and
 * spreading as it drops; long threads run down it — light ones of foam, dark
 * ones of the deep — bending with the sway; the last `fade` px dissolve, in a
 * fine ordered dither, into the cloud tones, so the water becomes the spray of
 * the clouds at the foot instead of ending on a straight line.
 */
function pour(ctx: Ctx, [spread, fade]: [number, number], cx: number, topY: number, bottom: number, hw: number, seed: number,
  wt: (i: number) => string, clouds: Tones4, ink: string, rock: string, water: string, flow: ReturnType<Ctx['layer']> | null,
  hidden: (x: number, y: number) => boolean, paint: (x: number, y: number, c: string, kind: string, over?: boolean) => unknown,
  open: (x: number, y: number) => void): void {
  const { H } = ctx, len = Math.max(1, bottom - topY), fd = Math.min(fade, len * 0.6);
  const halfAt = (y: number) => {
    const t = Math.min(1, (y - topY) / Math.max(8, Math.min(48, len * 0.45)));
    return hw * (0.85 + spread * t) * (1 + 0.5 * Math.max(0, (y - (bottom - fd)) / Math.max(1, fd)));
  };
  // the head: where the water starts in each column (a ragged lip), the cleft above it
  const head = (x: number) => topY + Math.trunc(5 * h2(x >> 1, 0, seed + 1) * Math.min(1, Math.abs(x + 0.5 - cx) / Math.max(1, hw)) ** 0.7);
  for (let y = topY; y < Math.min(H, bottom + 2); y++) {
    const sway = 0.7 * n1(y / 11.0, seed + 1), half = halfAt(y);
    const mist = y > bottom - fd ? (y - (bottom - fd)) / fd : 0;
    for (let x = Math.trunc(cx - half - 1); x <= Math.trunc(cx + half + 1); x++) {
      const dx = (x + 0.5 - cx - sway) / half;
      if (Math.abs(dx) > 1 || hidden(x, y) || y < head(x)) continue;
      // spray in clumps (a slow noise, not a screen): more of it lower down, ragged at the sides
      if (mist > 0 && mist * 1.3 + 0.2 * Math.abs(dx) > fbm(x / 4, y / 3, seed + 8, 2) + 0.25) {
        if (Math.abs(dx) > 0.8 && h2(x, y, seed + 9) < 0.5) continue;
        paint(x, y, Math.abs(dx) < 0.45 ? clouds[0] : mist > 0.6 ? clouds[1] : clouds[2], water, true);
        open(x, y);
        continue;
      }
      // threads: a column of the water keeps its tone for a long stretch
      const col = Math.round(x - sway), seg = 10 + Math.trunc(h2(col, 2, seed) * 22);
      const v = h2(col, Math.floor((y + 40 * h2(col, 3, seed)) / seg), seed + 4);
      let c = v < 0.3 ? wt(1) : v < 0.76 ? wt(2) : v < 0.94 ? wt(3) : wt(4);
      if (Math.abs(dx) > 0.82) c = dx < 0 ? wt(1) : wt(0);
      else if (Math.abs(dx) > 0.62 && v < 0.5) c = dx < 0 ? wt(1) : wt(0);
      if (y - head(x) < 2) c = y === head(x) ? wt(4) : wt(3);   // the spill out of the cleft
      paint(x, y, c, water, true);
      open(x, y);
      if (flow && !mist && Math.abs(dx) < 0.75 && v > 0.55 && h2(x, Math.floor(y / 3), seed + 5) < 0.45) flow.set(x, y, (y % 3) === 0 ? wt(4) : wt(3));
    }
  }
  // the cleft: dark rock above the head, deeper in some columns than in others, a little wider than the water
  const ch = hw * 0.6 + 2;
  for (let x = Math.trunc(cx - ch - 1); x <= Math.trunc(cx + ch + 1); x++) {
    const off = Math.abs(x + 0.5 - cx) / ch;
    if (off > 1) continue;
    const deep = 2 + Math.trunc(3 * h2(x, 7, seed) * (1 - off * 0.6));
    for (let y = head(x) - deep; y < head(x); y++) if (!hidden(x, y)) paint(x, y, ink, rock, true);
  }
}

/** The faces of a ring seen in perspective (brink `view`), per px of the picture; -1 where there is none. */
interface Faces {
  /** Owner key of the block of a column (as columns() gives), -1 where no face. */
  key: Int32Array;
  /** u along the lip (west to east on a south lip), px down the face, its foot px, 0..1 of its drop, px out from the lip. */
  u: Float32Array; down: Float32Array; foot: Float32Array; frac: Float32Array; out: Float32Array;
  /** x of the outward normal of the lip it hangs from: - west, + east. */
  nx: Float32Array;
}

/**
 * The faces of a ring seen from above and a little from the south (brink `view`).
 * Each point of the lip hangs a strip of face toward its foot, `lean × drop` px
 * out along its normal and down the rest of the drop, so a mountain that widens
 * going down: a lip that looks south shows all its drop, one that looks west or
 * east `lean × drop` px (escorzo) with its columns leaning out a little, one that
 * looks north hangs behind the top and only the lip shows. The faces of the
 * sides go `sides` of the way down (lost in the cloud before the south). Where
 * two strips overlap the one more to the south (nearer) is seen.
 */
function sweep(W: number, H: number, [lean, sides]: [number, number], loop: Pt[], base: Pt[], top: Mask,
  dropAt: (u: number) => number, sx: number, sy: number, jitter: number, seed: number): Faces {
  const n = loop.length, N = W * H;
  const F: Faces = {
    key: new Int32Array(N).fill(-1), u: new Float32Array(N), down: new Float32Array(N), foot: new Float32Array(N),
    frac: new Float32Array(N), out: new Float32Array(N).fill(-1), nx: new Float32Array(N),
  };
  const z = new Float32Array(N).fill(-1e9);
  let area = 0;
  for (let i = 0; i < n; i++) area += base[i][0] * base[(i + 1) % n][1] - base[(i + 1) % n][0] * base[i][1];
  const sg = area > 0 ? 1 : -1;
  // outward normals of the smooth loop (not of the wobble), smoothed again
  const K = 6, raw: Pt[] = base.map((_, i) => {
    const a = base[(i + K) % n], b = base[(i - K + n) % n], tx = a[0] - b[0], ty = a[1] - b[1], l = Math.hypot(tx, ty) || 1;
    return [sg * ty / l, -sg * tx / l];
  });
  const nrm: Pt[] = raw.map((_, i) => {
    let ax = 0, ay = 0;
    for (let k = -4; k <= 4; k++) { ax += raw[(i + k + n) % n][0]; ay += raw[(i + k + n) % n][1]; }
    const l = Math.hypot(ax, ay) || 1;
    return [ax / l, ay / l];
  });
  // u: arc length, growing west to east along a south lip
  const u = new Float64Array(n);
  // (slower on the sides: a column there is wider along the lip, so it reads as a slab seen at an angle and not as hatching)
  const pace = (i: number) => 1 / (1 + 1.5 * Math.abs(nrm[i][0]));
  for (let i = 1; i < n; i++) u[i] = u[i - 1] - sg * pace(i) * Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]);
  const bound = (k: number) => k * sx + (h2(k, 0, seed) - 0.5) * jitter * sx;
  const colOf = (v: number) => { let c = Math.floor(v / sx); if (v < bound(c)) c--; else if (v >= bound(c + 1)) c++; return c; };
  // (shorter blocks on the sides: tiers stepping down, not one long panel)
  const blockOf = (c: number, d: number, side: number) => {
    const h = sy * (1 - 0.45 * side);
    let y = -h * h2(c, 1, seed), j = 0;
    for (;;) { const s = Math.max(4, h * (0.5 + h2(c, 2 + j, seed))); if (y + s > d) return j; y += s; j++; }
  };
  // per point: drop, the vector to the foot, how far down it goes and how far out of the lip it shows
  const D = new Float64Array(n), fx = new Float64Array(n), fy = new Float64Array(n), tm = new Float64Array(n), em = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [nx, ny] = nrm[i], d = dropAt(u[i]), S = Math.min(0.48, lean) * d;
    const t = ny >= 0 ? sides + (1 - sides) * ny : sides;
    // down: the whole drop on a side (its columns lean out only a little), less what leans out on a south lip
    D[i] = d; tm[i] = t; fx[i] = S * nx; fy[i] = (d - S * Math.max(0, ny)) * t + S * ny; em[i] = fx[i] * nx + fy[i] * ny;
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (em[i] < 0.5 && em[j] < 0.5) continue;
    const uj = u[i] - sg * pace(j) * Math.hypot(loop[j][0] - loop[i][0], loop[j][1] - loop[i][1]);
    const across = Math.max(Math.hypot(loop[j][0] - loop[i][0], loop[j][1] - loop[i][1]),
      Math.hypot(loop[j][0] + fx[j] - loop[i][0] - fx[i], loop[j][1] + fy[j] - loop[i][1] - fy[i]));
    const len = Math.max(Math.hypot(fx[i], fy[i]), Math.hypot(fx[j], fy[j]));
    const na = Math.ceil(across * 2) + 1, nt = Math.ceil(len * 2) + 1;
    for (let a = 0; a < na; a++) {
      const A = a / na, B = 1 - A, lerp = (p: ArrayLike<number>) => p[i] * B + p[j] * A;
      const px = loop[i][0] * B + loop[j][0] * A, py = loop[i][1] * B + loop[j][1] * A;
      const vx = lerp(fx), vy = lerp(fy), d = lerp(D), t = lerp(tm), e = lerp(em), uu = u[i] * B + uj * A;
      const nx = nrm[i][0] * B + nrm[j][0] * A, ny = nrm[i][1] * B + nrm[j][1] * A;
      const c = colOf(uu);
      for (let k = 0; k <= nt; k++) {
        const T = k / nt, X = Math.floor(px + vx * T), Y = Math.floor(py + vy * T);
        if (X < 0 || Y < 0 || X >= W || Y >= H || top.has(X, Y)) continue;
        const q = Y * W + X, ground = py + Math.min(0.48, lean) * d * ny * t * T;
        if (ground < z[q]) continue;
        z[q] = ground;
        const down = T * t * d;
        F.key[q] = KEY(c, 3000 + blockOf(c, down, Math.abs(nx)));
        F.u[q] = uu; F.down[q] = down; F.foot[q] = t * d; F.frac[q] = T * t; F.out[q] = T * e; F.nx[q] = nx;
      }
    }
  }
  return F;
}
