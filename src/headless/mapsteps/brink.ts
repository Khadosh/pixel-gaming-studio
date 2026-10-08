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
import type { BrinkStep } from './schema';

const KEY = (x: number, y: number) => (y + 4096) * 16384 + (x + 4096);

/** Columns: Voronoi seeds on a jittered grid stretched tall. Returns the owner key of a px. */
function columns(seed: number, sx: number, sy: number): (x: number, y: number) => number {
  return (x, y) => {
    const gx = Math.floor(x / sx), gy = Math.floor(y / sy);
    let best = 0, bd = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cx = (gx + i + 0.5 + (h2(gx + i, gy + j, seed) - 0.5) * 0.7) * sx;
      const cy = (gy + j + 0.5 + (h2(gx + i, gy + j, seed + 1) - 0.5) * 0.9) * sy;
      const d = ((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2;
      if (d < bd) { best = KEY(gx + i, gy + j); bd = d; }
    }
    return best;
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
