// The water of a mountain stream cut into the ground (The Unwritten Dao, the ice pass, #350): a river painted flush with
// the snow reads as a ribbon laid on top. `cut` digs its bed: around the water, walls of wet rock go down to it, wide
// where the wall looks south (the bank above the water shows its whole face), narrow along the sides and only a dark
// edge where the bank lies below the water; the wall that looks toward the light is lit and the other in shade, darker
// toward the water, split by cracks down the face, with a lip of snow on top and a wet dark line at the foot. `rim`
// lays plates of shore ice over the edges of the water, of uneven width, with a lit edge toward the open water and a
// few cracks.

import { fbm, h2, type Mask } from '../mapnoise';
import type { Ctx } from '../mappaint';

export interface WaterCut {
  material: string;
  px: [number, number];
  snow?: [string, string];
  on?: string[];
  ragged?: number;
  salt?: number;
}

export interface WaterRim {
  px: [number, number];
  colors: [string, string, string];
  salt?: number;
}

/** The light comes from here (a unit vector pointing at the light, on the picture). */
function toLight(ctx: Ctx): [number, number] {
  const l = ctx.sun && !ctx.sun.source && (ctx.sun.lean[0] || ctx.sun.lean[1]) ? ctx.sun.lean : ctx.dir;
  const n = Math.hypot(l[0], l[1]) || 1;
  return [-l[0] / n, -l[1] / n];
}

export function paintCut(ctx: Ctx, mask: Mask, cut: WaterCut, water: string): void {
  const { W, H } = ctx, g = ctx.ground, salt = cut.salt ?? 1701;
  const [side, north] = cut.px, reach = Math.ceil(Math.max(side, north) + 2);
  const ramp = ctx.mat(cut.material).ramp, top = ramp.length - 1;
  const on = cut.on ? new Set(cut.on) : null;
  // distance to the water and the water px it comes from (4-neighbour fronts, up to `reach`)
  const d = new Int32Array(W * H).fill(-1), src = new Int32Array(W * H).fill(-1);
  let front: number[] = [];
  for (let i = 0; i < W * H; i++) if (mask.data[i]) { d[i] = 0; src[i] = i; front.push(i); }
  for (let k = 1; k <= reach && front.length; k++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % W, y = (i / W) | 0;
      for (const j of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < H ? i + W : -1, y > 0 ? i - W : -1]) {
        if (j < 0 || d[j] >= 0) continue;
        d[j] = k; src[j] = src[i]; next.push(j);
      }
    }
    front = next;
  }
  const [lx, ly] = toLight(ctx);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = d[i];
    if (k <= 0) continue;
    const kind = ctx.kindAt(x, y);
    if (kind === water || kind === cut.material || (on && !on.has(kind))) continue;
    // the way down to the water, averaged over the water px of the neighbours (a smooth normal)
    let nx = 0, ny = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const s = src[Y * W + X];
      if (s < 0) continue;
      nx += (s % W) - X; ny += ((s / W) | 0) - Y;
    }
    const n = Math.hypot(nx, ny) || 1;
    nx /= n; ny /= n;
    const wob = (cut.ragged ?? 2.2) * (fbm(x / 6, y / 6, salt, 2) - 0.5);
    const width = (ny > 0 ? side + (north - side) * ny : Math.max(1, side * (1 + 0.8 * ny))) + wob;
    if (k > width) continue;
    const f = k / Math.max(1, width);
    const lit = nx * lx + ny * ly;   // the face looks toward the water: lit when that is toward the light
    let c: string;
    if (k === 1) c = ramp[0];
    else if (k >= width - 1 && cut.snow) c = lit > -0.8 ? cut.snow[0] : cut.snow[1];
    else {
      // cracks run down the face: noise long along the way to the water, short across it
      const a = x * nx + y * ny, b = -x * ny + y * nx;
      const crack = fbm(b / 1.4, a / 7, salt + 1, 2) > 0.68;
      let t = 1 + f * (top - 2) * 0.75 + lit * 1.6 + 1.4 * (fbm(b / 2.5, a / 5, salt + 2, 2) - 0.5);
      if (crack) t -= 1.5;
      if (h2(x, y, salt + 3) < 0.05) t += 1;
      c = ramp[Math.max(1, Math.min(top - 1, Math.round(t)))];
    }
    g.set(x, y, c);
    ctx.setKind(x, y, cut.material);
  }
}

export function paintRim(ctx: Ctx, mask: Mask, dist: Int32Array, rim: WaterRim): void {
  const { W, H } = ctx, g = ctx.ground, salt = rim.salt ?? 1711;
  const [lo, hi] = rim.px, [light, mid, dark] = rim.colors;
  const reach = (x: number, y: number) => lo + (hi - lo) * Math.max(0, Math.min(1, (fbm(x / 9, y / 9, salt, 2) - 0.3) / 0.45));
  const ice = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask.has(x, y) && dist[y * W + x] <= reach(x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ice(x, y)) continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mask.has(x + dx, y + dy) && !ice(x + dx, y + dy));
    let c = mid;
    if (open) c = mask.has(x, y - 1) && !ice(x, y - 1) ? mid : light;
    else if (fbm(x / 2, y / 2, salt + 1, 1) > 0.74 && h2(x, y, salt + 2) < 0.7) c = dark;
    else if (h2(x, y, salt + 3) < 0.12) c = light;
    g.set(x, y, c);
  }
  // the edge of a plate throws a px of shadow on the open water under it
  for (let y = H - 1; y > 0; y--) for (let x = 0; x < W; x++) if (mask.has(x, y) && !ice(x, y) && ice(x, y - 1)) g.set(x, y, dark);
}
