// A gorge: a stream that drops into a cleft cut across a terrace, seen from above and a little from the south (the
// Campana Alta of The Unwritten Dao, #339: after the bridge, the water is seen falling to the level below). Two walls
// of rock come down the sides of the cleft, the one facing the light lit and the other in shade, both darker the deeper
// they go, split by vertical cracks, their outer edge broken and capped with snow; between them the water falls: a
// glint at the lip where it bends over, then threads of the shallow and mid tones that lengthen as it drops, more and
// more foam toward the foot, and at the foot a heap of foam and spray. On a flow layer, the light threads run down.

import { h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { GorgeStep } from './gorgeschema';

export function runGorge(ctx: Ctx, st: GorgeStep): void {
  const g = ctx.ground, salt = st.salt ?? 1601;
  const t = (i: number) => ctx.tone(st.material, i);
  const r = (i: number) => ctx.tone(st.rock, i);
  const flow = st.flow ? ctx.layer(st.flow) : null;
  const [cx, ty] = ctx.P(st.at[0], st.at[1]);
  const top = Math.round(ty), len = st.length, foot = top + len, [w0, w1] = st.width, ww = st.walls ?? 7;
  const sun = st.light === 'east' ? -1 : 1;
  const put = (x: number, y: number, c: string, kind: string) => {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
    g.set(x, y, c);
    ctx.setKind(x, y, kind);
  };
  for (let y = top; y < foot; y++) {
    const k = (y - top) / len, hw = w0 + (w1 - w0) * k, sway = 0.6 * n1((y - top) / 13, salt);
    // each wall: its width wanders, its rim broken
    const wl = ww * (0.75 + 0.5 * h2(Math.floor(y / 3), 1, salt + 1)) + 1.5 * n1(y / 5, salt + 2);
    const wr = ww * (0.75 + 0.5 * h2(Math.floor(y / 3), 2, salt + 1)) + 1.5 * n1(y / 5, salt + 3);
    const x0 = cx + sway - hw, x1 = cx + sway + hw;
    for (let x = Math.floor(x0 - wl - 1); x <= Math.ceil(x1 + wr + 1); x++) {
      const px = x + 0.5;
      if (px >= x0 && px <= x1) {
        // the water: the lip, then threads that lengthen as they fall, then foam
        const dx = (px - cx - sway) / hw;
        const run = 3 + Math.trunc(h2(x, 1, salt + 4) * 5) + Math.trunc(k * 8);
        const s = h2(x, Math.floor((y + 11 * h2(x, 0, salt + 4)) / run), salt + 5);
        let c = s < 0.25 ? t(1) : s < 0.75 ? t(2) : t(3);
        if (k > 0.55 && h2(x, y, salt + 6) < (k - 0.55) * 1.8) c = t(3);
        if (Math.abs(dx) > 0.8) c = dx * sun > 0 ? t(0) : t(1);
        if (y - top < 2) c = y === top ? t(4) : t(3);
        put(x, y, c, st.material);
        if (flow && Math.abs(dx) < 0.8 && y - top >= 2 && h2(x, Math.floor(y / 3), salt + 7) < 0.35) flow.set(x, y, (y % 3) === 0 ? t(4) : t(3));
        continue;
      }
      const west = px < x0, d = west ? x0 - px : px - x1, w = west ? wl : wr;
      if (d > w) continue;
      // the wall: facing the light, lit; facing away, in shade; darker deeper and against the water; cracks down it
      const lit = west ? sun < 0 : sun > 0;
      let i = lit ? 4 : 2;
      if (k > 0.5) i -= 1;
      if (d < 1.5) i = lit ? 2 : 0;
      else if (h2(Math.floor(px), Math.floor(y / 6), salt + 8) < 0.18) i = Math.max(0, i - 1);
      if (d > w - 1.2) i = st.snow ? -1 : Math.min(5, i + 1);
      if (i < 0) put(x, y, d > w - 0.6 || lit ? st.snow![0] : st.snow![1], st.rock);
      else put(x, y, r(i), st.rock);
    }
  }
  // the foot: a heap of foam and spray where the water lands, lit on top, broken at its rim
  const [rx, ry] = st.foot ?? [w1 + 5, 5];
  if (rx > 0 && ry > 0) {
    const fy = foot - 1;
    for (let y = Math.floor(fy - ry); y <= Math.ceil(fy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - fy) / ry;
      const q = Math.hypot(dx, dy) + 0.25 * (h2(x, y, salt + 9) - 0.5);
      if (q > 1) continue;
      put(x, y, q > 0.8 ? t(2) : dy < -0.1 && h2(x, y, salt + 10) < 0.6 ? t(4) : t(3), st.material);
    }
  }
}
