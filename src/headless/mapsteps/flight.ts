// Flights of stone steps. down: treads stacked from the top of the picture
// down to a row, between two low walls whose edges wander a pixel per tread,
// each tread with its lit nose, its riser in shadow and grass at its foot.
// climb: treads side by side along x rising to the right, between two walls,
// cut into a forest (the cut becomes grass) and darker as they go into its
// shade. Port of the sect script of The Unwritten Dao (scripts/suelo_secta.py).
// worn: the climb as stone steps with weight (flightClimbWorn).

import { fbm, h2, n1 } from '../mapnoise';
import { stoneRoles, type Ctx } from '../mappaint';
import type { FlightStep } from './schema';
import { castOn, stairRoles } from './stairs';

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
