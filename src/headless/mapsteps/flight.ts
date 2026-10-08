// Flights of stone steps. down: treads stacked from the top of the picture
// down to a row, between two low walls whose edges wander a pixel per tread,
// each tread with its lit nose, its riser in shadow and grass at its foot.
// climb: treads side by side along x rising to the right, between two walls,
// cut into a forest (the cut becomes grass) and darker as they go into its
// shade. Port of the sect script of The Unwritten Dao (scripts/suelo_secta.py).
// worn: the climb as stone steps with weight (flightClimbWorn); with rock, cut
// into a crest of rock, its steps seen from the front (flightClimbRock).

import { fbm, h2, n1 } from '../mapnoise';
import { stoneRoles, type Ctx } from '../mappaint';
import type { FlightStep } from './schema';
import { castOn, stairRoles, treadHeight, treadJoints } from './stairs';

export function runFlight(ctx: Ctx, st: FlightStep, seed: number): void {
  if (st.style === 'down') return flightDown(ctx, st, seed);
  return flightClimb(ctx, st, seed);
}

function flightDown(ctx: Ctx, st: FlightStep, seed: number): void {
  const g = ctx.ground, s = stoneRoles(ctx, st.material), name = st.material;
  const grass = (ctx.mat(name).moss ?? [s.dark, s.dark])[1];
  const STEP = st.every ?? 8;
  const [u0, u1] = st.x ?? [0, 1];
  const sx0 = Math.trunc(ctx.P(u0, 0)[0]), sx1 = Math.trunc(ctx.P(u1, 0)[0]);
  const endY = Math.trunc(ctx.P(0, st.to ?? 1)[1]);
  for (let y = 0; y < endY; y++) {
    const k = Math.floor(y / STEP), t = y % STEP;
    const lo = sx0 + Math.trunc(2 * h2(k, 1, seed)), hi = sx1 - Math.trunc(2 * h2(k, 2, seed));
    for (let x = lo - 2; x < hi + 2; x++) {
      let c: string;
      if (x < lo || x >= hi) c = x === lo - 1 || x === hi ? s.shadow : s.dark;   // the low wall
      else if (t === 0) c = x < Math.floor((lo + hi) / 2) ? s.high : s.light;
      else if (t <= 4) { c = t === 1 ? s.light : s.mid; if (fbm(x / 4.0, y / 3.0, seed + 1, 2) > 0.66) c = s.speck; }
      else if (t <= 6) c = s.shadow;
      else c = s.dark;
      g.set(x, y, c);
      ctx.setKind(x, y, name);
    }
    if (t === 7) for (let x = lo; x < hi; x++) if (h2(Math.floor(x / 2), k, seed + 2) < 0.22) g.set(x, y - 1, grass);
  }
}

function flightClimb(ctx: Ctx, st: FlightStep, seed: number): void {
  const { H } = ctx, g = ctx.ground, s = stoneRoles(ctx, st.material), name = st.material;
  const [u, v] = st.from ?? [0, 0];
  const start = Math.trunc(ctx.P(u, 0)[0]), yMid = ctx.P(0, v)[1];
  const slope = st.slope ?? 0.22, len = st.length ?? 56, hw = st.half ?? 5.5, every = st.every ?? 7;
  const [cut, breath] = st.clearing ?? [10, 1.5];
  const [fadeAt, fadeEvery] = st.fade ?? [24, 12];
  const forest = st.through ?? ctx.byTexture('canopy');
  const grass = ctx.byTexture('patches');
  // stepped: each tread is level and the next one starts higher, so the edges climb in steps (reads as a stair, not a ramp)
  const center = (x: number) => yMid - (st.stepped || st.worn ? Math.floor(Math.max(0, x - start) / every) * every : Math.max(0, x - start)) * slope;
  const end = start + len;
  // the opening in the forest: grass, lit on the upper half
  for (let x = start - 6; x < end + 8; x++) {
    const yc = center(x);
    const half = (cut + breath * n1(x / 6.0, seed)) * Math.min(1.0, (end + 8 - x) / 20.0);
    for (let y = Math.trunc(yc - half); y < Math.trunc(yc + half) + 1; y++) {
      if (y < 0 || y >= H || ctx.kindAt(x, y) !== forest) continue;
      const d = Math.abs(y + 0.5 - yc) / half;
      const gt = (i: number) => (grass ? ctx.tone(grass, i) : s.dark);
      g.set(x, y, d > 0.75 ? gt(1) : y > yc ? gt(2) : gt(3));
      if (grass) ctx.setKind(x, y, grass);
    }
  }
  if (st.worn?.rock) return flightClimbRock(ctx, st, seed, start, yMid);
  if (st.worn) return flightClimbWorn(ctx, st, seed, start, yMid);
  for (let x = start; x < end; x++) {
    const yc = center(x), t = (x - start) % every;
    for (let y = Math.trunc(yc - hw - 1); y < Math.trunc(yc + hw + 2); y++) {
      if (y < 0 || y >= H) continue;
      const dy = y + 0.5 - yc;
      if (Math.abs(dy) > hw + 1) continue;
      let c: string | null;
      if (dy < -hw) c = s.dark;                          // the wall above
      else if (dy > hw) c = s.line;                      // the one below, in shadow
      else if (st.stepped && t === 0) c = s.line;        // the joint: the riser of this tread in shadow
      else if (st.stepped && t === 1) c = dy < 0 ? s.high : s.light;
      else if (st.stepped) c = t >= every - 1 ? s.shadow : dy < -hw * 0.3 ? s.light : s.mid;
      else if (t === 0) c = dy < 0 ? s.high : s.light;
      else if (t <= 3) c = dy < -1 ? s.light : s.mid;
      else if (t <= 5) c = dy < -1 ? s.mid : s.shadow;
      else c = s.dark;
      // further up the stairs are already in the shade of the forest
      for (let i = 0; i < Math.max(0, Math.floor((x - start - fadeAt) / fadeEvery)); i++) c = ctx.shade(c, name);
      g.set(x, y, c);
      ctx.setKind(x, y, name);
    }
  }
}

/**
 * The climb as stone steps with weight, each level and the next one higher.
 * Down a column of a step: the outline and the lit cap of the north wall, its
 * face in shadow, the tread (a lit nose on its west end, where it looks down
 * the flight, a dark joint at its east end under the next step; some cut
 * across in two stones), the cap of the south wall and its face in shadow,
 * taller than the rise, so each step rests on the one before; then its shadow
 * on the ground.
 */
function flightClimbWorn(ctx: Ctx, st: FlightStep, seed: number, start: number, yMid: number): void {
  const { H } = ctx, name = st.material, R = stairRoles(ctx, name), w = st.worn!;
  const slope = st.slope ?? 0.22, len = st.length ?? 56, hw = st.half ?? 5.5, every = st.every ?? 7;
  const [fadeAt, fadeEvery] = st.fade ?? [24, 12];
  const wall = w.wall ?? 3, riser = w.riser ?? 2, jitter = w.jitter ?? 0.5, mossOdds = w.moss ?? 0.3, shadow = w.shadow ?? 2;
  const s2 = w.seed ?? seed, split = w.blocks ? 0.5 : 0.3;
  const rise = every * slope;
  const set = (x: number, y: number, c: string) => {
    if (y < 0 || y >= H) return;
    for (let i = 0; i < Math.max(0, Math.floor((x - start - fadeAt) / fadeEvery)); i++) c = ctx.shade(c, name) ?? c;
    ctx.ground.set(x, y, c);
    ctx.setKind(x, y, name);
  };
  const steps = Math.ceil(len / every);
  for (let k = 0; k < steps; k++) {
    const x0 = start + k * every, x1 = Math.min(start + len, x0 + every);
    const sag = h2(k, 1, s2) < jitter * 0.3 ? 1 : 0;   // a worn step sits a px lower
    const yc = yMid - k * rise;
    const top = Math.round(yc - hw) + sag, bot = Math.round(yc + hw);
    const cut = h2(k, 2, s2) < split ? top + 2 + Math.trunc(h2(k, 3, s2) * Math.max(1, bot - top - 4)) : -1;
    const sunk = h2(k, 4, s2) < jitter * 0.3;
    for (let x = x0; x < x1; x++) {
      const c0 = x - x0, toNext = x1 - 1 - x, under = k < steps - 1 && toNext === 0;
      // the low wall on the north side: its outline and its cap, stepping with the treads
      for (let y = top - wall; y < top; y++) {
        const i = y - (top - wall);
        let c = i === 0 ? R.joint : i === wall - 1 ? R.riser : c0 === 0 ? R.nose : R.lit;
        if (i > 0 && i < wall - 1 && h2(x, y, s2 + 7) < mossOdds * 0.15) c = R.moss[1];
        set(x, y, c);
      }
      // the tread: the nose on its west end, a dark joint under the next step on its east end
      for (let y = top; y < bot; y++) {
        let c: string;
        if (under) c = y < top + Math.round(rise) ? R.riser : R.speck;   // under the next step: its shadow, deeper where it stands over this one
        else if (c0 === 0) c = R.nose;                              // the nose, lit, looking down the flight
        else if (y === cut) c = h2(x, k, s2 + 5) < mossOdds ? R.moss[0] : R.joint;
        else c = fbm(x / 3.0, y / 2.0, s2 + 1, 2) > 0.68 ? R.speck : c0 === 1 ? R.lit : R.tread;
        if (sunk && !under && c0 > 0 && c !== R.joint) c = ctx.shade(c, name) ?? c;
        if (c0 === 1 && y >= bot - 2 && h2(k, 6, s2) < mossOdds) c = R.moss[y === bot - 1 ? 0 : 1];   // moss in the corner
        set(x, y, c);
      }
      // the flank of the flight under the treads, in shadow: its top climbs in steps, its foot runs along the slope
      const foot = Math.round(yMid + hw + riser + 3 - (x - start) * slope + rise);
      for (let y = bot; y <= Math.max(bot + 1, foot); y++) {
        let c = y >= Math.max(bot + 1, foot) ? R.deep : R.riser;   // the face, its foot
        if (y > bot && y < foot && (y - bot) % 4 === 0 && h2(x >> 2, y, s2 + 9) < 0.5) c = R.joint;   // the courses of the flank
        if (y > bot && y < foot && h2(x, y, s2 + 8) < mossOdds * 0.08) c = R.moss[0];
        set(x, y, c);
      }
      for (let y = Math.max(bot + 2, foot + 1); y < Math.max(bot + 2, foot + 1) + shadow && y < H; y++) if (ctx.kindAt(x, y) !== name) castOn(ctx, x, y);
    }
  }
}

interface ClimbStep { L: number; R: number; T: number; h: number }

/**
 * The climb cut into a crest of rock. Its steps are seen from the front, as the
 * stairway's: the tread lit, its nose a px brighter, the riser in shadow with
 * the dark joint at its foot, the stones staggered, some sunk, chipped noses,
 * moss in some joints. Each step is `every` px to the right of the last and as
 * much higher as it is tall, so they climb on a diagonal, overlapping. Above
 * them the rock the flight was cut into (a lit rim, moss hanging over it, its
 * face in streaks and a dark line where it meets a tread); below them the face
 * of the crest in columns lit from the left, taller step by step as the flight
 * leaves the ground, grass creeping up its foot and its shadow on the ground.
 * Every px is of the flight's material, so a brink that skips it leaves it whole.
 */
function flightClimbRock(ctx: Ctx, st: FlightStep, seed: number, start: number, yMid: number): void {
  const { W, H } = ctx, name = st.material, R = stairRoles(ctx, name), w = st.worn!, rk = w.rock!;
  const r = stoneRoles(ctx, rk.material), moss = ctx.mat(rk.material).moss ?? R.moss;
  const slope = st.slope ?? 0.22, len = st.length ?? 56, every = st.every ?? 7;
  const width = Math.max(every + 2, Math.round(2 * (st.half ?? 5.5)));
  const riser = w.riser ?? 2, jitter = w.jitter ?? 0.5, mossOdds = w.moss ?? 0.3, shadow = w.shadow ?? 2;
  const back = w.wall ?? 5, face0 = rk.face ?? 5, grow = rk.grow ?? 0, root = rk.root ?? 0;
  const s2 = w.seed ?? seed, blocks = (w.blocks ?? [7, 13]) as [number, number];
  const [fadeAt, fadeEvery] = st.fade ?? [24, 12];
  const rise = Math.max(riser + 4, Math.round(every * slope));
  const n = Math.max(1, Math.ceil(len / every));
  const shade1 = (c: string) => ctx.shade(c, name) ?? c;
  const set = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    for (let i = 0; i < Math.max(0, Math.floor((x - start - fadeAt) / fadeEvery)); i++) c = ctx.shade(c, name) ?? c;
    ctx.ground.set(x, y, c);
    ctx.setKind(x, y, name);
  };
  // the steps, bottom first: each a px wider or narrower at its ends, a px taller or shorter (jitter)
  const steps: ClimbStep[] = [];
  for (let k = 0, T = Math.round(yMid - rise / 2); k < n; k++) {
    const h = treadHeight(rise, k, s2, jitter, riser + 4);
    if (k > 0) T -= h;
    const L = start + k * every + (h2(k, 20, s2) < jitter * 0.3 ? 1 : 0);
    steps.push({ L, R: start + k * every + width - (h2(k, 21, s2) < jitter * 0.3 ? 1 : 0), T, h });
  }
  const x0 = steps[0].L, x1 = steps[n - 1].R;
  const top = new Int32Array(x1 - x0).fill(1 << 20), bot = new Int32Array(x1 - x0).fill(-(1 << 20));
  for (const s of steps) for (let x = s.L; x < s.R; x++) { top[x - x0] = Math.min(top[x - x0], s.T); bot[x - x0] = Math.max(bot[x - x0], s.T + s.h); }
  // the lines through the upper west corners and the lower east corners of the steps: the cheeks of rock run along them
  const corner = (pts: [number, number][], x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x < pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
    return pts[pts.length - 1][1];
  };
  const upper = steps.map(s => [s.L, s.T] as [number, number]), lower = steps.map(s => [s.R - 1, s.T + s.h] as [number, number]);
  // the cut rock above the treads: its rim along the line of the steps' upper corners, a px or two of wobble
  for (let x = x0; x < x1; x++) {
    const tp = top[x - x0];
    if (tp > 1 << 19) continue;
    const ramp = Math.min(1, (x - x0 + 1) / every), endRamp = Math.min(1, (x1 - x) / 3);
    const up = corner(upper, x);
    const rim = Math.round(Math.min(tp, up) - (back + 1.2 * n1(x / 5.0, s2 + 30) + 0.8 * n1(x / 2.0, s2 + 36)) * ramp * endRamp);
    if (rim < tp) set(x, rim - 1, r.ink);   // the outline of the crest against the grass
    const sx = Math.floor((x + 3 * h2(Math.floor(x / 4), 0, s2 + 31)) / 4);
    for (let y = rim; y < tp; y++) {
      const i = y - rim, streak = h2(sx, Math.floor((y + 4 * h2(sx, 1, s2 + 32)) / 5), s2 + 33);
      // its top in the sun (a lit rim), then its face toward the steps in streaks, a dark line where it meets a tread
      let c = i === 0 ? r.high : i === 1 ? r.light : y === tp - 1 ? r.dark : streak < 0.12 ? r.shadow : streak < 0.55 ? r.mid : r.speck;
      if (i > 1 && y < tp - 1 && h2(x, y, s2 + 34) < 0.04) c = r.dark;   // a crack
      if (i < 2 && h2(x, 0, s2 + 35) < mossOdds * (i === 0 ? 1.4 : 0.7)) c = moss[Math.min(moss.length - 1, i === 0 ? 2 : 1)];   // grass over the rim
      set(x, y, c);
    }
  }
  // the face of the crest under the treads: columns lit from the left, darker going down, taller step by step
  const lastRoot = x1 - every * 2;
  for (let x = x0; x < x1; x++) {
    const bt = bot[x - x0];
    if (bt < -(1 << 19)) continue;
    const along = (x - x0) / every, ramp = Math.min(1, (x - x0 + 1) / every), endRamp = Math.min(1, (x1 - x) / 3);
    const low = corner(lower, x);
    let depth = (face0 + grow * along) * ramp * endRamp + 1.5 * n1(x / 4.0, s2 + 40);
    if (root > 0 && x >= lastRoot) depth += root * Math.min(1, (x - lastRoot) / every) * (0.6 + 0.4 * h2(Math.floor(x / 3), 0, s2 + 41));
    const foot = Math.max(bt + 1, Math.round(Math.max(low, bt) + depth));
    const col = Math.floor((x + 2 * h2(Math.floor(x / 5), 1, s2 + 42)) / 5), edge = Math.floor((x - 1 + 2 * h2(Math.floor((x - 1) / 5), 1, s2 + 42)) / 5) !== col;
    const right = Math.floor((x + 1 + 2 * h2(Math.floor((x + 1) / 5), 1, s2 + 42)) / 5) !== col;
    const fr = h2(col, 2, s2 + 43);
    const cap = Math.max(bt + 1, Math.round(Math.max(low, bt)) + 1);   // the top of the crest beside the steps, in the sun
    for (let y = bt; y < foot; y++) {
      let c: string;
      if (y < cap) c = y === bt ? r.high : fbm(x / 3.0, y / 2.0, s2 + 47, 2) > 0.6 ? r.speck : r.light;
      else {
        const d = (y - cap) / 10;
        const lum = 0.15 - 0.35 * fr - d + (edge ? 0.4 : 0) - (right ? 0.45 : 0) + 0.12 * n1(y / 3.0 + x, s2 + 48);
        c = y === cap ? r.mid : lum > 0.5 ? r.light : lum > 0.15 ? r.speck : lum > -0.15 ? r.mid : lum > -0.5 ? r.shadow : r.dark;
        if (h2(x, Math.floor(y / 3), s2 + 44) < 0.03) c = r.dark;   // a crack across
      }
      if (y >= cap && foot - y <= 1 + Math.trunc(3 * h2(x, 3, s2 + 45)) && h2(x, y, s2 + 46) < mossOdds * 2) c = moss[foot - y === 1 ? 1 : 0];   // grass creeping up the foot
      set(x, y, c);
    }
    set(x, foot, r.ink);   // the outline of the crest against the grass
    for (let y = foot + 1; y < foot + 1 + shadow; y++) if (y >= 0 && y < H && ctx.kindAt(x, y) !== name) castOn(ctx, x, y);
  }
  // the steps, top first so the lower one (nearer) lies over the one above where they meet
  for (let k = n - 1; k >= 0; k--) {
    const { L, R: Rx, T, h } = steps[k], rz = riser, nose = h - rz - 1;
    const joints = treadJoints(L + 1, Rx - 1, k, s2, blocks);
    const stoneOf = (x: number) => joints.filter(j => j <= x).length;
    const sunk = (b: number) => h2(k * 16 + b, 4, s2) < jitter * 0.35;
    for (let t = 0; t < h; t++) {
      const y = T + t;
      for (let x = L; x < Rx; x++) {
        const isJoint = joints.includes(x), b = stoneOf(x), end = x === L || x === Rx - 1;
        let c: string;
        if (t < nose) {
          if (x === Rx - 1) c = R.joint;
          else if (isJoint) c = h2(x, k, s2 + 5) < mossOdds ? (t === nose - 1 ? R.moss[1] : R.moss[0]) : R.joint;
          else {
            c = t === nose - 1 ? R.lit : fbm(x / 3.0, y / 2.0, s2 + 1, 2) > 0.68 ? R.speck : R.tread;
            if (sunk(b)) c = shade1(c);
            if (t === 0 || x <= L + 1) c = shade1(c);   // the shade of the cut rock behind and at the west end
          }
          if (x === L && t >= nose - 2 && h2(k, 6, s2) < mossOdds) c = R.moss[t === nose - 1 ? 0 : 1];   // moss in the corner
        } else if (t === nose) c = end || isJoint ? R.riser : sunk(b) || h2(x, k, s2 + 6) < 0.15 * jitter ? R.lit : R.nose;
        else c = t === h - 1 || isJoint || end ? R.deep : R.riser;
        set(x, y, c);
      }
    }
  }
}
