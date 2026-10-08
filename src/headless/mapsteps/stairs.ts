// Worn stone steps, shared by the stairway (terrace.ts) and the flight that
// climbs (flight.ts): the roles of the ramp of a stone, the staggered joints
// between the stones of a tread and what wears them (a sunk stone, a chipped
// nose, moss in a joint). Pure: it only answers colors and positions.

import { h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';

export interface StairRoles {
  /** the front edge of a tread, the brightest */
  nose: string;
  lit: string;
  tread: string;
  /** a speck on the tread, the cap of a wall in its own shade */
  speck: string;
  /** the riser, in shadow */
  riser: string;
  /** the joint between two stones, the outline of a wall */
  joint: string;
  /** the joint at the foot of a riser */
  deep: string;
  /** the cap of a low wall, darker than the treads so the steps stand out between the walls */
  wall: string;
  /** its edge toward the light */
  wallLit: string;
  moss: [string, string];
}

/** The roles of a stone ramp, dark to light: 6 tones (a light stair) or 8 (ink to highlight). */
export function stairRoles(ctx: Ctx, name: string): StairRoles {
  const r = ctx.mat(name).ramp, n = r.length, t = (i: number) => r[Math.max(0, Math.min(n - 1, i))];
  const moss = ctx.mat(name).moss;
  // 8 tones: the riser three under the speck, the joints and the foot darker still; 6: the riser at the bottom of the ramp
  const [riser, joint, deep] = n >= 8 ? [t(n - 5), t(n - 6), t(n - 7)] : [t(0), t(1), ctx.shade(t(0), name) ?? t(0)];
  return {
    nose: t(n - 1), lit: t(n - 2), tread: t(n - 3), speck: t(n - 4), riser, joint, deep,
    wall: n >= 8 ? t(n - 5) : t(0), wallLit: n >= 8 ? t(n - 4) : t(1),
    moss: moss ? [moss[0], moss[1]] : ['hoja sombra', 'hoja'],
  };
}

/** The columns of the joints between the stones of tread `k` laid from x0 to x1 (exclusive), staggered tread by tread. */
export function treadJoints(x0: number, x1: number, k: number, seed: number, blocks: [number, number]): number[] {
  const [lo, hi] = blocks, out: number[] = [];
  let x = x0 + Math.trunc(h2(k, 3, seed) * hi);   // the first stone is cut where the one above was not
  for (let i = 0; x < x1 - Math.max(2, lo / 2); i++) {
    if (x > x0 + 1) out.push(x);
    x += lo + Math.trunc(h2(k, 10 + i, seed) * (hi - lo + 1));
  }
  return out;
}

/** The height of tread `k`: `every`, a px more or less on some (jitter), never shorter than what it needs. */
export function treadHeight(every: number, k: number, seed: number, jitter: number, least: number): number {
  const d = h2(k, 1, seed);
  const dh = d < jitter * 0.25 ? -1 : d > 1 - jitter * 0.25 ? 1 : 0;
  return Math.max(least, every + dh);
}

/** One step darker for a shadow cast on whatever is there: the recipe's shade table, else a tone down the ramp of its material. */
export function castOn(ctx: Ctx, x: number, y: number): void {
  const c = ctx.ground.get(x, y), k = ctx.kindAt(x, y);
  if (c === null) return;
  let d = ctx.shade(c, k) ?? c;
  if (d === c && k && ctx.recipe.materials[k]) {
    const r = ctx.mat(k).ramp, i = r.indexOf(c);
    if (i > 0) d = r[i - 1];
  }
  ctx.ground.set(x, y, d);
}
