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
import { lightToward } from './rockform';

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
  if (keep.size && st.swallow !== false) {
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
  const paintAny = paint;
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
  // where each fall pours: x of the water, the first row under its lip, and the side of the island it is on
  const heads = st.falls && st.water ? st.falls.map(fall => fallHead(ctx, top, lipY, fall)) : [];
  // notch: the lip opens around each fall, so the water falls in front of a face seen from the front
  const topBefore = st.notch && st.view && heads.length ? top.clone() : top;
  const notches = st.notch && st.view ? heads.map((h, k) => (h ? notch(ctx, top, lipY, h, st.falls![k], st.notch!, dropAt, salt + 130 + k) : null)) : [];
  // view: the faces in perspective instead (every face hangs from its own lip, as wide as it looks south; no `side`)
  const fv = st.view ? sweep(W, H, st.view, loop, base, top, dropAt, sx, sy, st.jitter ?? 0.7, salt + 31, st.flank, st.strata, st.flank !== undefined ? st.buttress : undefined) : null;
  if (fv) for (const n of notches) if (n) stampNotch(fv, n, top, col, W, H);
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
  const contrast = st.contrast ?? 0.32, ledges = st.ledges ?? 0, dim = st.dim ?? 1.0;
  const buttressRound = st.buttress?.round ?? 0.8, gutter = st.buttress?.gutter ?? 1;
  // the side in the light: the west, unless the sun of the recipe comes from the east (then the east side is lit)
  const fromEast = ctx.sun ? lightToward(ctx, W / 2, H / 2)[0] > 0.2 : false;
  const eastLum = fromEast ? st.lit ?? 0.45 : st.shade ?? -0.3, westLum = fromEast ? st.shade ?? -0.3 : st.lit ?? 0.45;
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
  // veil: the foot of every face lost in mist. a, 0..1: how deep in it a px is (0 above it, 1 at the foot)
  const veil = fv ? st.veil : undefined, veilA = new Float32Array(W * H);
  const veilH = (x: number, length: number) => (veil ? Math.min(length * 0.45, veil[0] + veil[1] * fbm(x / 41.0, 0.5, salt + 120, 2) + 1.6 * n1(x / 4.0, salt + 121)) : 0);
  const veilAt = (x: number, y: number, above: number, length: number, out: number): number => {
    if (!veil || out < 6) return 0;
    const v = veilH(x, length);
    if (v <= 0) return 0;
    // its top in lumps, as the cloud it is, not a level band
    const a = 1 - above / v + 0.3 * (fbm(x / 9.0, y / 6.0, salt + 122, 2) - 0.5);
    return a > 0 ? Math.min(1, a) : 0;
  };
  const flat = (c: string) => (c === r.ink || c === r.line ? r.dark : c === r.light ? r.mid : c);
  // the rock flattened under the first breath of mist, then a fine checker of the deep belly of the cloud, then the
  // deep belly with the seams of the rock guessed in its upper part, and the cloud tones thickening toward the foot
  const mist = (x: number, y: number, a: number, c: string, seam: boolean): string => {
    const odd = ((x + y) & 1) === 1, b = BAYER[(y & 3) * 4 + (x & 3)];
    if (a < 0.14) return flat(c);
    if (a < 0.24) return odd ? t(3) : flat(c);
    if (a < 0.5) return seam && a < 0.4 && b < 10 ? r.shadow : t(3);
    if (a < 0.58) return odd ? t(4) : t(3);
    if (a < 0.84) return t(4);
    if (a < 0.92) return odd ? t(5) : t(4);
    return t(5);
  };
  // a ledge of grass `shelves` px wide (rounded ends) about the top of the mist, in some stretches of the
  // face: lit along its top, its foot swallowed by the mist. Returns the tone of the grass, or -1
  const [shOdds, shWide] = st.shelves ?? [0, 0];
  const shelf = (x: number, u: number, above: number, length: number, out: number): number => {
    if (!veil || shOdds <= 0 || out < 10) return -1;
    const k = Math.floor(u / shWide), f = u / shWide - k;
    if (h2(k, 0, salt + 125) >= shOdds) return -1;
    const v = veilH(x, length), round = Math.sin(Math.PI * f) ** 0.5;
    const lt = v * (1.15 + 0.35 * h2(k, 1, salt + 125)) + 1.5 * n1(x / 2.5, salt + 126) + 3 * (round - 1);
    const j = lt - above, deep = 2 + 4 * round;
    if (j < 0 || j > deep + 1.5 || round < 0.25) return -1;
    return j < 1 ? 0 : j < deep * 0.5 ? 1 : j < deep - 0.5 ? 2 : j <= deep ? 3 : 4;   // 4: its shadow on the rock under it
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (top.has(x, y)) continue;
    const i = y * W + x, d = depth[i], sd = side[i];
    const f = cl(x, y), fr = h2(kx(f), ky(f), salt + 33) * 2 - 1;
    const right = cl(x + 1, y) !== f, left = cl(x - 1, y) !== f, under = cl(x, y + 1) !== f;
    if (fv && fv.key[i] >= 0) {
      // a face in perspective: its columns follow the strip they hang along (they lean out on the sides),
      // lit on the west, in shade on the east, darker going down; the cracks and ledges in its own columns
      const nx = fv.nx[i], cu = kx(f), cb = ky(f), span = fv.span[i];
      // (buttress) across the column from the side of the sun: 0 its lit edge, 1 the one in shade
      const sunAcross = fromEast ? 1 - fv.across[i] : fv.across[i];
      const lum = 0.3 + (nx < 0 ? westLum - 0.3 : eastLum - 0.3) * Math.abs(nx) - contrast * fr - dim * fv.frac[i]
        + (span ? 0.06 : 0.22) * n1((fv.u[i] * (1 - Math.abs(nx)) + x * Math.abs(nx)) / 2.6, salt + 34) + 0.1 * n1(y / 6.0 + x, salt + 37)   // streaks: upright on a side
        // a flank's column is round: lit on the side of the sun, turning into shade across it
        // (buttress) a face toward the sun that turns fast into the gutter, and the granite in long flutes down it
        + (span ? buttressRound * 0.55 * (1 - 2 * Math.min(1, sunAcross * 1.05) ** 2) + 0.3 * (fbm(x / 3.0, y / 16.0, salt + 61, 2) - 0.5) * 2
          : fv.across[i] >= 0 ? 0.6 * (0.5 - fv.across[i]) * (fromEast ? -1 : 1) : 0);
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
      if (span) {
        // (buttress) the gutter: the deep channel on the shaded side of a column; its lit edge a px of light
        crack = (1 - sunAcross) * span < gutter;
        if (crack) c = r.line;
        else if (ledge) c = r.dark;
        else if (sunAcross * span < 1 && lum > 0.3 && h2(cu, y >> 2, salt + 62) < 0.45) c = r.light;
      } else if (crack) c = Math.abs(nx) > 0.5 ? (lum > 0.1 ? r.shadow : r.dark) : fv.frac[i] > 0.5 ? r.ink : r.line;   // softer on a side, seen at an angle
      else if (lit && lum > 0.12) c = r.light;
      else if (ledge && (st.strata || h2(cu, cb, salt + 35) < 0.35)) c = r.dark;
      const cap = fv.frac[i] < 0.85 && !crack ? capAt(x, y, f) : -1;
      if (cap >= 0) c = grass[cap];
      if (fv.out[i] < 2.2) c = r.line;                                                   // in the shadow of the grass over the lip
      // (measured from where the foot would be without its jags: the mist and the shelves run level, not column by column)
      const above = veil ? fv.foot[i] * (1 - d2 * (h2(Math.floor(fv.u[i] / sx), 0, salt + 4) - 0.5) / Math.max(1, dropAt(fv.u[i]))) - fv.down[i] : 0;
      const a = veil ? veilAt(x, y, above, fv.foot[i], fv.out[i]) : 0;
      // shelves: a ledge of grass lower down, in the upper mist
      const shelfTone = shelf(x, fv.u[i], above, fv.foot[i], fv.out[i]);
      if (shelfTone >= 0) c = shelfTone === 4 ? r.line : grass[shelfTone];
      else if (a > 0) {
        veilA[i] = a;
        // (deep in it, its edge against the cloud beyond melts in the lighter tones: no outline of the rock)
        c = rim && a > 0.4 ? (((x + y) & 1) ? t(5) : t(4)) : mist(x, y, a, c, crack || rim);
      } else if (fv.foot[i] - fv.down[i] < 1 + Math.trunc(h2(x, 1, salt + 36) * 2)) c = r.ink;  // the foot sinks into the dark
      else if (rim) c = (fromEast ? nx > 0.3 : nx < -0.3) ? r.dark : r.line;              // its edge against the sky
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
      if (on && veilA[key] < 0.2) paint(x, y, c, rock);
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
      // (short off a shelf: a fringe over the rock that holds it up, not a curtain hiding it)
      const onShelf = notches.some(n => n && n.side && x >= n.xa - 2 && x <= n.xb + 2 && Math.abs(y - n.hy) < 24);
      const len = onShelf ? Math.min(curtain(x), 2 + (x * 7 + 3) % 4) : curtain(x);
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
          const gone = bare.some(([u, v, br]) => Math.hypot(q[0] - ctx.P(u, v)[0], q[1] - ctx.P(u, v)[1]) < br * ctx.cell + rr)
            || notches.some(n => n && Math.hypot(q[0] - (n.xa + n.xb) / 2, q[1] - n.hy) < n.reach + rr);
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
  // spume: which fall each px of water belongs to, and what was there before the water (to show under the clouds)
  const spume = st.billows && st.spume && water ? st.spume : null;
  const fallOf = spume ? new Int16Array(W * H).fill(-1) : null, preFall = spume ? g.px.slice() : null;
  if (st.falls && water) {
    const wt = (i: number) => ctx.tone(water, i);
    st.falls.forEach((fall, k) => {
      const paint = fallOf ? (x: number, y: number, c: string, kind: string, over = false) => {
        const ok = paintAny(x, y, c, kind, over);
        if (ok) fallOf[y * W + x] = kind === water ? k : -1;
        return ok;
      } : paintAny;
      const hw = fall[1], spring = st.spring ?? 0, head = heads[k], nt = notches[k];
      if (!head) return;
      // from the first edge at or below (u, v), straight down `length` px over the side and the sky; or from a south lip
      // (out of the face of its notch, if it has one)
      const cx = nt ? nt.hx : head.cx;
      const topY = (nt ? nt.lip(Math.trunc(cx)) : head.y) + spring;
      // off a shelf the water leaves a groove worn in the rock of its face, in shade; elsewhere a dark cleft
      const groove: [string, string] = nt && nt.side ? [r.dark, r.shadow] : [r.ink, r.ink];
      const bottom = fall.length === 4 ? topY + fall[3] : foot[at(cx)] + 2;
      falls.push([cx, bottom]);
      if (st.pour) {
        pour(ctx, st.pour, cx, topY, bottom, hw, salt + 50 + k, wt, st.clouds ?? [t(6), t(5), t(4), t(3)], groove, rock, water, flow,
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
          paint(x, y, y >= topY - 1 && Math.abs(x + 0.5 - cx) < hw ? wt(3) : y >= topY - 2 ? groove[0] : groove[1], rock, true);
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
      // (with veil they rise there too, lower: the mist of the side)
      const sideFoot = fv && ft > 0 && Math.abs(fv.nx[Math.min(H - 1, Math.trunc(ft - 1)) * W + xi]) > 0.7;
      if (sideFoot && !veil) ft = 0;
      if (ft > 0) masses.push([x, ft - bUp + 14 * (h2(k, 3, salt + 81) - 0.35), bR * (0.45 + 1.45 * h2(k, 2, salt + 81) ** 2) * (sideFoot ? 0.7 : 1), salt + 83 + k]);
      x += bEvery * (0.5 + 0.8 * h2(k, 4, salt + 81));
    }
    falls.forEach(([cx, bottom], k) => masses.push([cx, bottom - bUp * 0.5, bR * 1.25, salt + 97 + k]));
    masses.sort((a, b) => a[1] - b[1]);
    const skyTones = new Set([t(0), t(1), t(2)]);
    const edge = st.soft ? {
      rim: [st.soft.rim?.[0] ?? t(2), st.soft.rim?.[1] ?? t(2)] as [string, string], lumps: st.soft.lumps, ragged: st.soft.ragged, bright: st.soft.bright, smooth: st.soft.smooth,
      free: (x: number, y: number) => !top.has(x, y) && skyTones.has(g.get(x, y) ?? ''),
    } : {};
    if (spume) {
      // a round, lumpy belly instead of the cut of the cumulus, and the rim drawn after, over rock and water too
      const cloud = new Uint8Array(W * H), soft = { ...edge, rim: undefined };
      for (const [x, y, rr, s] of masses) cumulus(W, H, x, y, rr, s, tones, bellyPut(x, y, rr, s, tones, cloud, g), 0.7, soft);
      const rim: [string, string] = [st.soft?.rim?.[0] ?? t(2), st.soft?.rim?.[1] ?? t(2)];
      spumeRim(W, H, cloud, tones, rim, (x, y) => !top.has(x, y), skyTones, g);
      const wt = (i: number) => ctx.tone(water!, i);
      const mist = (x: number, y: number) => !top.has(x, y) && [sea, rock, water].includes(ctx.kindAt(x, y));   // (never over grass)
      falls.forEach(([cx], k) => spumeFall(W, H, k, cx, st.falls![k][1], spume, cloud, fallOf!, preFall!, tones, wt, mist,
        (x, y) => ctx.kindAt(x, y) === sea, (x, y) => ctx.setKind(x, y, sea), g, flow, salt + 140 + k));
    } else for (const [x, y, r, s] of masses) cumulus(W, H, x, y, r, s, tones, put, 0.7, edge);
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
  if (keep.size && st.swallow !== false) {
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
  // (the top as the lip draws it, without the shelves of the notches nor their bites: what goes on the top after stays put)
  if (topBefore !== top) for (let i = 0; i < W * H; i++) if (!top.has(i % W, Math.floor(i / W))) topBefore.set(i % W, Math.floor(i / W), false);
  ctx.masks.set(`${st.id ?? `brink${idx}`} top`, topBefore);
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
  wt: (i: number) => string, clouds: Tones4, [back, rim]: [string, string], rock: string, water: string, flow: ReturnType<Ctx['layer']> | null,
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
    for (let y = head(x) - deep; y < head(x); y++) if (!hidden(x, y)) paint(x, y, y >= head(x) - 2 ? back : rim, rock, true);
  }
}

/**
 * brink `spume`: the put of a mass of billows that cuts its belly round and lumpy (lobes hanging, rising toward the
 * ends) instead of the near-level cut of the cumulus, darkens the px just over that belly (its underside) and marks
 * the px it keeps in `cloud`.
 */
export function bellyPut(cx: number, cy: number, r: number, seed: number, tones: Tones4, cloud: Uint8Array, g: Ctx['ground']):
  (x: number, y: number, c: string) => void {
  const W = g.w, wh = r * (0.9 + 0.8 * h2(0, 1, seed));   // the half width of the mass, as cumulus draws it
  // round lobes of their own widths and depths hanging under the mass, the whole belly rising toward the ends
  const P = Math.max(5, r * (0.5 + 0.3 * h2(0, 30, seed))), ph = h2(0, 31, seed) * P;
  const belly = (x: number) => {
    const q = x + 0.5 - cx + ph, j = Math.floor(q / P), w = 0.65 + 0.7 * h2(j, 34, seed);
    const u = Math.min(1, (q / P - j) / w);   // (narrower lobes leave a notch between them)
    const lobe = P * w * 0.5 * (0.5 + 0.7 * h2(j, 32, seed)) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
    const e = Math.min(1.2, Math.abs(x + 0.5 - cx) / (wh + r * 0.5));
    return cy + r * (-0.12 + 0.06 * n1(x / 9.0, seed + 33)) - r * 0.7 * e * e + lobe;
  };
  return (x, y, c) => {
    const b = belly(x);
    if (y > b) return;
    if (y + 1.6 > b) c = tones[Math.min(3, tones.indexOf(c as never) + 1)] ?? c;
    g.set(x, y, c);
    cloud[y * W + x] = 1;
  };
}

/**
 * brink `spume`: the soft edge of the billows, as the rim of cumulus soft but over whatever is under the belly (the
 * sky, the rock lost in its veil, the water): where the cloud is in shade a band of the near tone then a checker of
 * the far one; the crest stays crisp. Over the sky the tones of `rim`; over rock or water the belly tones of the cloud.
 */
function spumeRim(W: number, H: number, cloud: Uint8Array, tones: Tones4, rim: [string, string], may: (x: number, y: number) => boolean,
  sky: Set<string>, g: Ctx['ground']): void {
  const shade = (c: string) => (c === tones[2] || c === tones[3] ? 2 : c === tones[1] ? 1 : 0);
  const put: [number, string][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (cloud[i] || !may(x, y)) continue;
    let d = 3, sh = -1, below = true;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const X = x + a, Y = y + b;
      if (X < 0 || Y < 0 || X >= W || Y >= H || !cloud[Y * W + X]) continue;
      const dd = Math.max(Math.abs(a), Math.abs(b)), s = shade(g.get(X, Y) ?? '');
      if (b <= 0) below = false;
      if (dd < d) { d = dd; sh = s; } else if (dd === d) sh = Math.max(sh, s);
    }
    if (d > 2 || sh <= 0 || below) continue;
    const over = g.get(x, y) ?? '', [near, far] = sky.has(over) ? rim : [tones[3], tones[2]];
    if (d === 1 && sh === 2) put.push([i, h2(x, y, 2201) < 0.18 ? far : near]);
    else if ((x + y) % 2 === 0 && h2(x, y, 2202) < 0.85) put.push([i, far]);
  }
  for (const [i, c] of put) g.set(i % W, Math.floor(i / W), c);
}

/**
 * brink `spume`: a fall meets the billows. Over the cloud, `foam` px where the water widens, lightens and breaks into
 * a fine checker of the cloud tones, with puffs of spray on the cloud where it goes in; under the cloud no water: what
 * was behind it, with a veil of light water dots fading out over `trail` px.
 */
function spumeFall(W: number, H: number, k: number, cx: number, hw: number, [foam, trail]: [number, number], cloud: Uint8Array,
  fallOf: Int16Array, pre: (string | null)[], tones: Tones4, wt: (i: number) => string, may: (x: number, y: number) => boolean,
  inSky: (x: number, y: number) => boolean, mark: (x: number, y: number) => void, g: Ctx['ground'],
  flow: ReturnType<Ctx['layer']> | null, seed: number): void {
  // the px of this fall, and its first row
  let y0 = H, x0 = W, x1 = -1;
  for (let i = 0; i < W * H; i++) if (fallOf[i] === k) {
    const x = i % W, y = Math.floor(i / W);
    if (y < y0) y0 = y;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  if (x1 < 0) return;
  // where the cloud takes each column of the water (the first cloud px under the head), and where it takes the middle
  const ctop = new Int32Array(x1 - x0 + 1).fill(-1);
  for (let x = x0; x <= x1; x++) for (let y = y0 + 3; y < H; y++) if (cloud[y * W + x]) { ctop[x - x0] = y; break; }
  let meet = -1;
  for (let x = Math.trunc(cx - Math.max(1, hw * 0.5)); x <= Math.trunc(cx + Math.max(1, hw * 0.5)); x++) {
    const c = x >= x0 && x <= x1 ? ctop[x - x0] : -1;
    if (c >= 0 && (meet < 0 || c < meet)) meet = c;
  }
  if (meet < 0) return;
  const cAt = (x: number) => (x >= x0 && x <= x1 && ctop[x - x0] >= 0 ? Math.min(ctop[x - x0], meet + 6) : meet);
  const water = [wt(0), wt(1), wt(2), wt(3), wt(4)];
  const set = (x: number, y: number, c: string | null) => {
    if (x < 0 || y < 0 || x >= W || y >= H || !may(x, y)) return;
    g.px[y * W + x] = c;
    mark(x, y);   // (no longer water, even where its tone happens to be one of the sky's)
    if (flow) flow.set(x, y, null);
  };
  // under the cloud: what was behind the water, a veil of its light tone fading out
  for (let i = 0; i < W * H; i++) {
    if (fallOf[i] !== k) continue;
    const x = i % W, y = Math.floor(i / W);
    if (y < cAt(x)) continue;
    if (cloud[i]) { mark(x, y); continue; }   // (the cloud over it, even where its tone is one of the water's)
    const e = (y - meet) / Math.max(1, trail), b = BAYER[(y & 3) * 4 + (x & 3)] / 16;
    const fresh = e < 1 && b < 0.42 * (1 - e) * (1 - 0.6 * Math.abs(x + 0.5 - cx) / Math.max(1, hw + 1));
    set(x, y, fresh ? (b < 0.12 * (1 - e) ? tones[1] : wt(3)) : pre[i]);
  }
  // over the cloud: the water opens, lightens and turns to foam (its light threads first), in a fine ordered dither
  const reach = Math.max(3, hw * 0.8 + 3);
  for (let y = meet - foam - 2; y < meet + 6; y++) {
    if (y < y0 + 2) continue;
    let l = W, rr = -1;
    for (let x = x0; x <= x1; x++) if (fallOf[y * W + x] === k) { l = Math.min(l, x); rr = Math.max(rr, x); }
    if (rr < 0) continue;
    for (let x = l - Math.ceil(reach); x <= rr + Math.ceil(reach); x++) {
      const c0 = cAt(x), d = c0 - y;
      if (d <= 0 || d > foam || x < 0 || x >= W) continue;
      const i = y * W + x, tt = 1 - d / foam, b = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      const n = fbm(x / 3, y / 2.5, seed, 2) - 0.5;
      if (fallOf[i] === k) {
        const j = water.indexOf(g.px[i] ?? '');
        const lv = tt * 1.2 + (j < 0 ? 0.3 : j / 4) * 0.5 + n * 0.4 + b * 0.35 - 0.25;
        if (lv < 0.2) continue;
        set(x, y, lv < 0.45 ? water[Math.min(3, Math.max(0, j) + 1)] : lv < 0.7 ? (b < 0 ? wt(3) : wt(4)) : lv < 0.95 ? tones[1] : tones[0]);
      } else if (!cloud[i]) {
        // spray beside the water, wider and thicker near the cloud
        const out = (x < l ? l - x : x - rr) / (reach * (0.25 + 0.75 * tt));
        // (thinner over the rock: a breath of it, not a white screen over the dark)
        const lv = tt * (1 - out) * 1.3 + n * 0.5 + b * 0.5 - (inSky(x, y) ? 0.3 : 0.55);
        if (out < 1 && lv > 0) set(x, y, lv > 0.45 ? tones[0] : lv > 0.2 ? tones[1] : wt(4));
      }
    }
  }
  // puffs of spray on the cloud where the water goes in: a big one rising on each side of the water, small ones between
  const np = 2 + Math.trunc(hw / 4);
  for (let p = 0; p < np; p++) {
    const f = np === 1 ? 0 : p / (np - 1) * 2 - 1, edge = Math.abs(f) > 0.99;
    const px = cx + f * (hw + (edge ? 1.5 : 0)) + (h2(p, 1, seed) - 0.5) * 2;
    const pr = edge ? 2 + hw * 0.3 + h2(p, 2, seed) * 1.5 : 1.3 + hw * 0.12 + h2(p, 2, seed) * 1.4;
    const py = cAt(Math.trunc(px)) - pr * (edge ? 0.75 : 0.5) + h2(p, 3, seed);
    for (let y = Math.floor(py - pr); y <= Math.ceil(py + pr); y++) for (let x = Math.floor(px - pr); x <= Math.ceil(px + pr); x++) {
      const dx = (x + 0.5 - px) / pr, dy = (y + 0.5 - py) / pr, q = dx * dx + dy * dy;
      if (q > 1 || (q > 0.72 && h2(x, y, seed + 4) < 0.5)) continue;
      set(x, y, dx * 0.6 + dy < -0.15 ? tones[0] : dy > 0.5 ? tones[2] : tones[1]);
      if (x >= 0 && y >= 0 && x < W && y < H) cloud[y * W + x] = 1;
    }
  }
}

/** A 4×4 ordered dither, 0..15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Where a fall of a ring pours: x of the water, the first row under the lip, and the side (-1 west, +1 east, 0 a south lip). */
interface Head { cx: number; y: number; side: number; edge: number }
function fallHead(ctx: Ctx, top: Mask, lipY: Float32Array, fall: number[]): Head | null {
  const { W, H } = ctx;
  if (fall.length === 4) {
    // from the first edge at or below (u, v); inside the island, out to the nearer side edge first
    const [px, py] = ctx.P(fall[0], fall[2]);
    let cx = px, y = Math.trunc(py), side = 0, edge = cx;
    if (top.has(Math.trunc(cx), y)) {
      let l = Math.trunc(cx), r = Math.trunc(cx);
      while (l > 0 && top.has(l, y)) l--;
      while (r < W - 1 && top.has(r, y)) r++;
      if (cx - l <= r - cx) { cx = l; side = -1; } else { cx = r; side = 1; }
      edge = cx;
    } else {
      // out in the sky: the side of the island beside it on its row (for a notch)
      const x0 = Math.trunc(cx);
      for (let k = 1; k < 64 && !side; k++) {
        if (x0 + k < W && top.has(x0 + k, y)) { side = -1; edge = x0 + k - 1; }
        else if (x0 - k >= 0 && top.has(x0 - k, y)) { side = 1; edge = x0 - k + 1; }
      }
    }
    while (y < H && top.has(Math.trunc(cx), y)) y++;
    return { cx, y, side, edge };
  }
  const cx = ctx.P(fall[0], 0)[0], lip = lipY[Math.max(0, Math.min(W - 1, Math.trunc(cx)))];
  return lip < 0 ? null : { cx, y: Math.ceil(lip), side: 0, edge: cx };
}

/** The notch of a fall (brink `notch`): the face seen from the front that hangs behind the water. */
interface Notch {
  hx: number; hy: number; half: number; reach: number; seed: number;
  /** -1 a shelf off the west side, +1 off the east, 0 a south lip. */
  side: number;
  /** x from where to where its face hangs (a shelf off a side: the whole shelf). */
  xa: number; xb: number;
  x0: number; lips: Int32Array; lens: Float32Array;
  /** The first row under the lip of the notch at x (the head of the water), or the row of the head. */
  lip: (x: number) => number;
}
/**
 * Opens the lip around a fall. On a south lip the lip bites `bite` px into the island (rounded), the face
 * under it seen from the front. Off a side, a shelf of grass juts out of the edge (rounded at its far end,
 * `bite` px tall where it leaves the island) and its south lip, a little dipped where the water leaves it,
 * hangs a whole face as long as the water: rock on both sides of the fall, whatever the side shows.
 * Changes `top` (the shelf is ground, its grass copied from the top beside it, mirrored).
 */
function notch(ctx: Ctx, top: Mask, lipY: Float32Array, h: Head, fall: number[], [rock, bite]: [number, number],
  dropAt: (x: number) => number, seed: number): Notch {
  const { W, H } = ctx, g = ctx.ground, hw = fall[1], half = hw + rock;
  // off a side, the water just clear of the edge, with its rock on the island side too
  const hx = h.side ? h.edge + h.side * half : h.cx, hy = h.y;
  const near = h.edge - h.side * 2, far = hx + h.side * half;
  const xa = h.side ? Math.min(near, far) : hx - half, xb = h.side ? Math.max(near, far) : hx + half;
  const x0 = Math.floor(xa) - 2, x1 = Math.ceil(xb) + 2;
  const wob = (x: number) => Math.round(1.1 * n1(x / 5.0, seed));
  const inside = (x: number) => x >= 0 && x < W;
  if (h.side) {
    // the shelf: out from the island, rounded at its far end, its top in lumps (grass over rock, not a plank);
    // and on under the edge of the island a little, so no slit of sky is left where its top meets the lip beside
    const add: [number, number, string, string][] = [], ext = 0.6 * Math.abs(far - near);
    for (let x = Math.floor(xa - ext) - 2; x <= Math.ceil(xb + ext) + 2; x++) {
      if (!inside(x)) continue;
      const rel = (x - near) / (far - near);
      if (rel < -0.6 || rel > 1) continue;
      // (cushions of grass along it, each its own height, a little ragged)
      const fm = x / 7.0 + h2(0, 1, seed + 2), km = Math.floor(fm);
      const lumps = 1.5 - (1.0 + 2.2 * h2(km, 3, seed + 2)) * Math.sin(Math.PI * (fm - km)) ** 0.6 + 0.9 * n1(x / 2.5, seed + 3);
      const yt = Math.round(hy - 2 - bite * Math.max(0, 1 - rel) ** 0.7 + lumps * Math.min(1, 3 * (1 - rel)));
      // (down to the top of the island if it is a few px under it: no hole between the shelf and the lip below)
      let yEnd = hy + wob(x);
      for (let y = yEnd; y < yEnd + 8 && y < H; y++) if (top.has(x, y)) { yEnd = y; break; }
      for (let y = Math.max(0, yt); y < Math.min(H, yEnd); y++) {
        if (top.has(x, y)) continue;
        // the grass of the top beside it, mirrored across the edge
        let sx = Math.round(2 * h.edge - x - h.side * 2);
        for (let k = 0; k < 40 && inside(sx) && !top.has(sx, y); k++) sx -= h.side;
        if (!inside(sx) || !top.has(sx, y)) continue;
        add.push([x, y, g.get(sx, y) ?? '', ctx.kindAt(sx, y)]);
      }
    }
    for (const [x, y, c, k] of add) { top.set(x, y); if (c) g.set(x, y, c); ctx.setKind(x, y, k); }
  }
  // the bite: on a south lip, a rounded bay; off a side, the dip of the lip where the water leaves the shelf
  const bw = h.side ? hw * 0.8 + 1 : half, bd = h.side ? 3 : bite;
  for (let x = Math.floor(hx - bw); x <= Math.ceil(hx + bw); x++) {
    if (!inside(x)) continue;
    const v = Math.sqrt(Math.max(0, 1 - ((x + 0.5 - hx) / bw) ** 2));
    const ly = h.side ? hy + wob(x) : (lipY[x] >= 0 ? lipY[x] : hy);
    for (let y = Math.max(0, Math.round(ly - bd * v)); y < ly; y++) top.set(x, y, false);
  }
  // the lip of the face: the row under the last row of the top, in each column the notch hangs from
  const lips = new Int32Array(x1 - x0 + 1).fill(-1), lens = new Float32Array(x1 - x0 + 1);
  const yA = hy - bite - 8, yB = hy + 6;
  for (let x = x0; x <= x1; x++) {
    if (!inside(x)) continue;
    let last = -1;
    for (let y = Math.max(0, yA); y <= Math.min(H - 1, yB); y++) if (top.has(x, y)) last = y;
    if (last < 0 || last >= Math.min(H - 1, yB)) continue;
    lips[x - x0] = last + 1;
    lens[x - x0] = fall.length === 4 ? fall[3] + 6 : dropAt(x);
  }
  const lip = (x: number) => {
    const l = x >= x0 && x <= x1 ? lips[x - x0] : -1;
    return l >= 0 ? l : hy;
  };
  return { side: h.side, hx, hy, half, reach: Math.max(half, (xb - xa) / 2) + bite, seed, xa, xb, x0, lips, lens, lip };
}
/** Hangs the face of a notch in the faces of the ring: seen from the front, in front of what was there. */
function stampNotch(F: Faces, n: Notch, top: Mask, col: (x: number, y: number) => number, W: number, H: number): void {
  for (let j = 0; j < n.lips.length; j++) {
    const x = n.x0 + j, l = n.lips[j], len = n.lens[j];
    if (l < 0 || x < 0 || x >= W) continue;
    for (let y = l; y < Math.min(H, l + len); y++) {
      const w = 1.3 * n1(y / 5.0, n.seed + 1);
      if (top.has(x, y) || x + 0.5 < n.xa - w || x + 0.5 > n.xb + w) continue;
      const q = y * W + x, down = y - l;
      // (off a shelf its columns narrower: a face that close, beside the water, shows several of them, not a flat panel)
      F.key[q] = n.side ? col(Math.round(n.x0 + (x - n.x0) * 1.8), y) : col(x, y); F.u[q] = x; F.down[q] = down; F.foot[q] = len; F.frac[q] = down / len; F.out[q] = down; F.nx[q] = 0;
    }
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
  /** on a flank (`flank`): 0..1 across its column from west to east, else -1 */
  across: Float32Array;
  /** on a flank with `buttress`: px wide of its column, else 0 */
  span: Float32Array;
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
  dropAt: (u: number) => number, sx: number, sy: number, jitter: number, seed: number,
  flank?: number, strata?: [number, number], buttress?: BrinkStep['buttress']): Faces {
  const n = loop.length, N = W * H;
  const F: Faces = {
    key: new Int32Array(N).fill(-1), u: new Float32Array(N), down: new Float32Array(N), foot: new Float32Array(N),
    frac: new Float32Array(N), out: new Float32Array(N).fill(-1), nx: new Float32Array(N), across: new Float32Array(N).fill(-1),
    span: new Float32Array(N),
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
    // strata: the blocks of every column break at the same levels down the face, give or take `jitter` px a column
    if (strata) return Math.max(0, Math.floor((d + strata[1] * (h2(c, 7, seed) - 0.5) * 2) / strata[0]));
    const h = sy * (1 - 0.45 * side);
    let y = -h * h2(c, 1, seed), j = 0;
    for (;;) { const s = Math.max(4, h * (0.5 + h2(c, 2 + j, seed))); if (y + s > d) return j; y += s; j++; }
  };
  // a course of a flank: the strata are level, each column off by up to `jitter` px, and about half the joints of a
  // column are not open (one block spans two or three courses), so it reads as granite and not as brick
  const course = (c: number, y: number) => {
    let L = Math.floor((y + strata![1] * (h2(c, 7, seed) - 0.5) * 2) / strata![0]);
    for (let k = 0; k < 2 && h2(c, L, seed + 8) < 0.5; k++) L--;
    return L;
  };
  // (buttress) the columns of a flank of very unequal width, one after the other across the screen, and their
  // blocks long: a stratum breaks a column only now and then (`joints`), so no course runs through the wall
  const bStart: number[] = [], bCol = new Int32Array(buttress ? W : 0);
  if (buttress) {
    const [w0, w1] = buttress.width ?? [6, 12];
    for (let k = 0, x = 0; x < W; k++) {
      bStart.push(x);
      const w = Math.max(2, Math.round(w0 + h2(k, 11, seed) * (w1 - w0 + 0.999) - 0.5));
      for (let j = 0; j < w && x < W; j++, x++) bCol[x] = k;
    }
    bStart.push(W);
  }
  const [bApart, bJit] = strata ?? [24, 8], bOpen = buttress?.joints ?? 0.3;
  const tier = (c: number, y: number) => {
    let L = Math.floor((y + bJit * (h2(c, 7, seed) - 0.5) * 2) / bApart);
    for (let k = 0; k < 12 && h2(c, L, seed + 8) >= bOpen; k++) L--;
    return L;
  };
  // per point: drop, the vector to the foot, how far down it goes and how far out of the lip it shows
  const D = new Float64Array(n), fx = new Float64Array(n), fy = new Float64Array(n), tm = new Float64Array(n), em = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [nx, ny] = nrm[i], d = dropAt(u[i]);
    // flank: a lip that looks west or east shows that many px of its face, whatever the drop (a tall map's sides)
    const S = flank === undefined ? Math.min(0.48, lean) * d : Math.min(0.48, lean) * d * (1 - Math.abs(nx)) + flank * Math.abs(nx);
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
        if (flank !== undefined && Math.abs(nx) > 0.6 && buttress) {
          // the gutters wander a px or two down the wall: each column swells and narrows (no ruled pipes)
          const edge = (j: number) => bStart[j] + Math.round(1.7 * n1(Y / 13.0 + j * 7.3, seed + 12));
          let k = bCol[X];
          if (k + 1 < bStart.length - 1 && X >= edge(k + 1)) k++;
          else if (k > 0 && X < edge(k)) k--;
          const w = Math.max(2, edge(k + 1) - edge(k)), sc = 6000 + k;
          // a stratum that breaks it is a fracture, not a joint: it wanders a px or two up and down across the column
          F.key[q] = KEY(sc, 3000 + tier(sc, Y + Math.round(1.8 * n1(X / 3.0 + k * 1.7, seed + 13))));
          F.across[q] = Math.max(0, Math.min(1, (X + 0.5 - edge(k)) / w));
          F.span[q] = w;
        } else if (flank !== undefined && Math.abs(nx) > 0.6) {
          // a flank seen from the south: upright columns across the screen and courses down it (granite in
          // buttresses, its strata level), not the strips of the lip leaning out
          const cx = colOf(X), sc = 5000 + cx, b0 = bound(cx);
          F.key[q] = KEY(sc, 3000 + (strata ? course(sc, Y) : blockOf(sc, Y, 1)));
          F.across[q] = Math.max(0, Math.min(1, (X + 0.5 - b0) / Math.max(1, bound(cx + 1) - b0)));
        } else { F.key[q] = KEY(c, 3000 + blockOf(c, down, Math.abs(nx))); F.across[q] = -1; }
        F.u[q] = uu; F.down[q] = down; F.foot[q] = t * d; F.frac[q] = T * t; F.out[q] = T * e; F.nx[q] = nx;
      }
    }
  }
  return F;
}
