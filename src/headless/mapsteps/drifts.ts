// Drifts («lomas de nieve»): snow with a shape. The hollows of `snowfield` are flat lavender patches; a slope of
// snow on a mountain has mounds with a side to the sun and a side in shade, and snow banked against what stands in it
// (a rock, a trunk, the foot of a wall). Born for the ladera of the caves of The Unwritten Dao (#245, its
// `docs/diseno/cuevas.md` §4.2).
//
// A height field over the snow (the px of `on`), as `relief` builds one for a rock: the free mounds — long on the
// side the wind comes from and short on the lee, their rim wobbling — and the banks: around every thing with a foot
// laid before (`registerFooted`, as `settle` reads them) and every px of the materials of `against`, the snow rises
// toward the foot, more where the wind meets it, lumpy along it. The field is shaded with the rule of the relief
// (`litBy`: its normal against the light of the recipe raised 35°), on the ramp of the snow: the slope toward the
// light one tone up, the flat its snow, the slope away one and two down. No outline: a drift is read by its light,
// not by a line. Pure and deterministic; its noise is its own salt. Registering nothing, painting only the snow.

import { Mask, fbm, h2, n1, type Pt } from '../mapnoise';
import type { Ctx } from '../mappaint';
import { lightToward, litBy } from './rockform';
import { footedOf } from './settle';
import type { DriftsStep } from './alpineschema';

/** The height field the drifts of a step raised (px), for the tests and whoever lays something over it. */
const FIELDS = new WeakMap<Ctx, Map<string, Float32Array>>();
export function driftField(ctx: Ctx, id: string): Float32Array | undefined { return FIELDS.get(ctx)?.get(id); }

export function runDrifts(ctx: Ctx, st: DriftsStep, idx: number): void {
  const { W, H } = ctx, g = ctx.ground, on = new Set(st.on), mat = st.material, salt = st.salt ?? 2451;
  const snow = new Mask(W, H);
  let area = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on.has(ctx.kindAt(x, y))) { snow.set(x, y); area++; }
  const field = new Float32Array(W * H);
  const raise = (i: number, h: number) => { if (h > field[i]) field[i] = h; };
  // the wind: where it blows toward (the lee is that way)
  const [wx0, wy0] = st.wind ?? [1, 0.2], wl = Math.hypot(wx0, wy0) || 1, wx = wx0 / wl, wy = wy0 / wl;
  const peak = st.height ?? 5;
  // a mound at (cx, cy): rx along the wind (long upwind, short on the lee), ry across it, its crest toward the lee
  const mound = (cx: number, cy: number, rx: number, ry: number, h: number, s: number) => {
    const R = Math.max(rx, ry) * 1.3;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (!snow.has(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const a = dx * wx + dy * wy, b = -dx * wy + dy * wx;
      const ang = Math.atan2(b, a), wob = 1 + 0.22 * n1(ang * 1.6 + s, s) + 0.08 * n1(ang * 4.3, s + 3);
      // (the crest 0.3 rx toward the lee: 1.4 rx of slope upwind of it, 0.45 rx on the lee)
      const along = a < rx * 0.3 ? (a - rx * 0.3) / (rx * 1.4) : (a - rx * 0.3) / (rx * 0.45);
      const d2 = (along * along + (b / ry) ** 2) / (wob * wob);
      if (d2 >= 1) continue;
      raise(y * W + x, h * (1 - d2) ** 2);
    }
  };
  // fixed mounds: [u, v, rx, ry, height?]
  for (const [k, m] of (st.at ?? []).entries()) {
    const [cx, cy] = ctx.P(m[0], m[1]);
    mound(cx, cy, m[2], m[3], m[4] ?? peak, salt + 11 * k);
  }
  // free mounds over the snow
  const [r0, r1] = st.size ?? [16, 40];
  const count = st.count ?? Math.round(area / 4000);
  for (let k = 0, tries = 0; k < count && tries < count * 8; tries++) {
    const x = Math.floor(h2(tries, 1, salt) * W), y = Math.floor(h2(tries, 2, salt) * H);
    if (!snow.has(x, y)) continue;
    const r = r0 + (r1 - r0) * h2(tries, 3, salt);
    mound(x + 0.5, y + 0.5, r, r * (0.45 + 0.25 * h2(tries, 4, salt)), peak * (0.6 + 0.6 * h2(tries, 5, salt)), salt + 101 + tries);
    k++;
  }
  // banks: snow heaped against what stands in it, more where the wind meets it
  const ag = st.against;
  if (ag) {
    const kinds = new Set(ag.kinds ?? []), targets = ag.targets;
    const block = new Mask(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (kinds.has(ctx.kindAt(x, y))) block.set(x, y);
    for (const rec of footedOf(ctx)) {
      if (targets && !targets.some(t => t === rec.id || t === rec.from || t === rec.kind)) continue;
      if (!targets && rec.kind === 'building') continue;
      for (const i of rec.px.keys()) block.data[i] = 1;
    }
    const reach = ag.reach ?? 7, hb = ag.height ?? peak * 0.8;
    // distance (8-steps) from the blocks over the snow, and the way back to the nearest block
    const dist = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
    let ring: number[] = [];
    for (let i = 0; i < W * H; i++) if (block.data[i]) { dist[i] = 0; from[i] = i; ring.push(i); }
    for (let d = 1; d <= reach && ring.length; d++) {
      const next: number[] = [];
      for (const i of ring) {
        const x = i % W, y = (i / W) | 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const X = x + ox, Y = y + oy, j = Y * W + X;
          if (X < 0 || Y < 0 || X >= W || Y >= H || dist[j] <= d || !snow.data[j] || block.data[j]) continue;
          dist[j] = d; from[j] = from[i]; next.push(j);
        }
      }
      ring = next;
    }
    for (let i = 0; i < W * H; i++) {
      const d = dist[i];
      if (!(d > 0 && d <= reach) || from[i] < 0) continue;
      const x = i % W, y = (i / W) | 0, bx = from[i] % W, by = (from[i] / W) | 0;
      // the wind side: the block is downwind of this px (the snow is stopped there)
      const nx = bx - x, ny = by - y, nl = Math.hypot(nx, ny) || 1;
      const meet = (nx * wx + ny * wy) / nl;
      const r = reach * (0.75 + 0.5 * fbm(x / 9, y / 7, salt + 31, 2)) * (1 + 0.35 * meet);
      if (d >= r) continue;
      raise(i, hb * (1 + 0.3 * meet) * (0.7 + 0.6 * fbm(x / 6, y / 5, salt + 33, 2)) * (1 - d / r) ** 1.4);
    }
  }
  (FIELDS.get(ctx) ?? FIELDS.set(ctx, new Map()).get(ctx)!).set(st.id ?? `drifts${idx}`, field);
  // the light on it
  // (the snow is the tone under the lit one: [night, deep, shadow, snow, lit] → 3)
  const n = ctx.mat(mat).ramp.length, base = st.base ?? ctx.mat(mat).base ?? Math.max(0, n - 2);
  const tone = (i: number) => ctx.tone(mat, Math.max(0, Math.min(n - 1, i)));
  const sunLight = ctx.sun && !ctx.sun.source ? lightToward(ctx, W / 2, H / 2) : null;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? field[y * W + x] : 0);
  // the side toward the light keeps the snow (its lit tone over a whole slope reads as a stain, not as light); the side
  // away goes one and two down; the crest — the last px toward the light before the shade — takes the lit tone
  const band = new Int8Array(W * H).fill(9), lit = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (field[i] < 0.35 || !snow.data[i]) continue;
    // (the slope over 2 px each way: the bands follow the mound, not the px)
    const gx = (at(x + 2, y) + at(x + 1, y) - at(x - 1, y) - at(x - 2, y)) / 6, gy = (at(x, y + 2) + at(x, y + 1) - at(x, y - 1) - at(x, y - 2)) / 6;
    const light: Pt = sunLight ?? lightToward(ctx, x, y);
    const d = litBy(gx, gy, light) - litBy(0, 0, light);
    lit[i] = d;
    band[i] = d > -0.09 ? 0 : d > -0.42 ? -1 : -2;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (band[i] === 9) continue;
    let b = band[i];
    if (b === 0 && lit[i] > -0.03) {
      const [lx, ly] = sunLight ?? lightToward(ctx, x, y);
      const X = x - Math.round(lx * 1.4), Y = y - Math.round(ly * 1.4);
      if (X >= 0 && Y >= 0 && X < W && Y < H && band[Y * W + X] !== 9 && band[Y * W + X] < 0) b = 1;
    }
    g.set(x, y, tone(base + b));
  }
}
