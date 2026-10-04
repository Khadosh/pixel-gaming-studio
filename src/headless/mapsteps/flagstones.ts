// Flagstones: laid stones, one per cell of a staggered grid (a Voronoi cell
// stretched to the stone size), the lit lip up-left, the joint in shadow
// down-right, moss creeping into the joints of the border, and a worn middle.
// Too small a stone at the border is left out (the grass stays). Port of
// lay_stones of The Unwritten Dao's sect script (scripts/suelo_secta.py).

import { fbm, h2, type Mask } from '../mapnoise';
import { stoneRoles, type Ctx } from '../mappaint';

/** Paints the flagstones of `name` (an 8-tone stone ramp with moss) on the mask. */
export function textureFlagstones(ctx: Ctx, mask: Mask, name: string, seed: number, size: [number, number],
  wear?: [number, number, number, number, number]): void {
  const { W, H } = ctx, [sx, sy] = size, s = stoneRoles(ctx, name);
  const moss = ctx.mat(name).moss ?? [s.shadow, s.mid];
  const cols = Math.floor(W / sx) + 3, rows = Math.floor(H / sy) + 3;
  // the seed of each stone, jittered, every other row shifted half a stone
  const seedX = new Float64Array(cols * rows), seedY = new Float64Array(cols * rows);
  for (let gy = -1; gy < rows - 1; gy++) for (let gx = -1; gx < cols - 1; gx++) {
    const jx = (h2(gx, gy, seed) - 0.5) * 0.7 + (gy % 2 ? 0.5 : 0);
    const jy = (h2(gx, gy, seed + 1) - 0.5) * 0.6;
    const i = (gy + 1) * cols + gx + 1;
    seedX[i] = (gx + 0.5 + jx) * sx; seedY[i] = (gy + 0.5 + jy) * sy;
  }
  const owner = new Int32Array(W * H).fill(-1);
  const count = new Map<number, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    const gx = Math.floor(x / sx), gy = Math.floor(y / sy);
    let best = -1, bd = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cx = gx + i, cy = gy + j;
      if (cx < -1 || cy < -1 || cx >= cols - 1 || cy >= rows - 1) continue;
      const k = (cy + 1) * cols + cx + 1;
      const d = ((x + 0.5 - seedX[k]) / sx) ** 2 + ((y + 0.5 - seedY[k]) / sy) ** 2;
      if (d < bd) { best = k; bd = d; }
    }
    owner[y * W + x] = best;
    count.set(best, (count.get(best) ?? 0) + 1);
  }
  for (let i = 0; i < W * H; i++) if (owner[i] >= 0 && count.get(owner[i])! < sx * sy * 0.45) owner[i] = -1;
  const o = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? owner[y * W + x] : -1);
  const [wu, wv, amount, wrx, wry] = wear ?? [0, 0, 0, 1, 1];
  const [wcx, wcy] = ctx.P(wu, wv);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = owner[y * W + x];
    if (i < 0) continue;
    const right = o(x + 1, y), down = o(x, y + 1), left = o(x - 1, y), up = o(x, y - 1);
    const gx = (i % cols) - 1, gy = Math.floor(i / cols) - 1;
    const tone = h2(gx, gy, seed + 3);
    const w = wear ? amount * Math.exp(-(((x - wcx) / wrx) ** 2) - ((y - wcy) / wry) ** 2) : 0;
    let c: string;
    if (right !== i || down !== i) {
      c = s.shadow;
      if ((right < 0 || down < 0) && h2(Math.floor(x / 2), Math.floor(y / 2), seed + 5) < 0.5) c = down < 0 ? moss[0] : moss[1];
    } else if (left !== i || up !== i) c = tone + w > 0.35 ? s.high : s.light;
    else {
      const v = fbm(x / 5.0, y / 4.0, seed + 7, 2) * 0.5 + tone * 0.5 + w;
      c = v > 0.56 ? s.light : v > 0.36 ? s.speck : s.mid;
    }
    ctx.ground.set(x, y, c);
    ctx.setKind(x, y, name);
  }
}
