// Flights of stone steps. down: treads stacked from the top of the picture
// down to a row, between two low walls whose edges wander a pixel per tread,
// each tread with its lit nose, its riser in shadow and grass at its foot.
// climb: treads side by side along x rising to the right, between two walls,
// cut into a forest (the cut becomes grass) and darker as they go into its
// shade. Port of the sect script of The Unwritten Dao (scripts/suelo_secta.py).

import { fbm, h2, n1 } from '../mapnoise';
import { stoneRoles, type Ctx } from '../mappaint';
import type { FlightStep } from './schema';

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
  const center = (x: number) => yMid - Math.max(0, x - start) * slope;
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
  for (let x = start; x < end; x++) {
    const yc = center(x), t = (x - start) % every;
    for (let y = Math.trunc(yc - hw - 1); y < Math.trunc(yc + hw + 2); y++) {
      if (y < 0 || y >= H) continue;
      const dy = y + 0.5 - yc;
      if (Math.abs(dy) > hw + 1) continue;
      let c: string | null;
      if (dy < -hw) c = s.dark;                          // the wall above
      else if (dy > hw) c = s.line;                      // the one below, in shadow
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
