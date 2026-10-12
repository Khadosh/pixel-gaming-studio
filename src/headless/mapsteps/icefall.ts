// A frozen waterfall: the icefall step. The water froze on its way down a face of rock and hangs there as a curtain
// of ice columns side by side, narrow at the lip and spreading toward its foot. Each column is round (its edge
// toward the light lit, a dark gutter on the other side), a little lighter or darker than its neighbours; the
// curtain as a whole is lit on the side of the light and in shade on the other; the columns swell in bulges where
// the ice built up (a lighter rim over a darker fold), long threads of light run down some of them, the outline is
// ink on the shaded side; each column ends in its own icicle, a px wide at its tip; a heap of ice and frozen spray
// can sit at the foot over them. Not a pale patch on the rock: a thing with columns, light and an end.

import { h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { IcefallStep } from './icefallschema';

export function runIcefall(ctx: Ctx, st: IcefallStep): void {
  const layer = ctx.layer(st.layer ?? 'ground'), onGround = (st.layer ?? 'ground') === 'ground';
  const t = (i: number) => ctx.tone(st.material, i);
  const [cx, ty] = ctx.P(st.at[0], st.at[1]);
  const len = st.length, [w0, w1] = st.width;
  const [fMin, fMax] = st.flutes ?? [2, 4];
  const ice = st.icicles ?? 5, salt = st.salt ?? 1471;
  const sun = st.light === 'east' ? -1 : 1;           // +1: the light from the west
  const put = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
    layer.set(x, y, c);
    if (onGround) ctx.setKind(x, y, st.material);
  };
  const half = (y: number) => {
    const k = Math.max(0, Math.min(1, (y - ty) / len));
    return w0 + (w1 - w0) * Math.pow(k, 0.8) + 0.9 * n1((y - ty) / 9, salt);
  };
  // the columns across: cut once for the widest row, so a column keeps its place all the way down
  const left = Math.floor(cx - Math.max(w0, w1) - 3), right = Math.ceil(cx + Math.max(w0, w1) + 3);
  const cols: { x0: number; x1: number; k: number; b: number; drop: number }[] = [];
  for (let x = left, k = 0; x <= right; k++) {
    const w = fMin + Math.floor(h2(k, 1, salt + 1) * (fMax - fMin + 1));
    cols.push({ x0: x, x1: x + w - 1, k, b: h2(k, 2, salt + 1) - 0.5, drop: Math.round(h2(k, 3, salt + 4) * ice) });
    x += w;
  }
  const colOf = (x: number) => cols.find(c => x >= c.x0 && x <= c.x1)!;
  const toneOf = (v: number) => (v > 0.55 ? 5 : v > 0.22 ? 4 : v > -0.12 ? 3 : v > -0.45 ? 2 : 1);
  const foot = ty + len;
  for (let y = Math.trunc(ty); y < foot; y++) {
    const hw = half(y), xl = Math.round(cx - hw), xr = Math.round(cx + hw);
    for (let x = xl; x <= xr; x++) {
      const c = colOf(x);
      const across = ((x + 0.5 - cx) / Math.max(hw, 1)) * sun;          // -1 on the side of the light
      const inCol = c.x1 === c.x0 ? 0.5 : (x - c.x0) / (c.x1 - c.x0);
      const f = sun > 0 ? inCol : 1 - inCol;                         // 0 at the edge toward the light
      let v = -0.42 * across + 0.5 * c.b + (f === 0 ? 0.3 : f === 1 ? -0.4 : 0.05);
      // bulges: where the ice built up, a lighter rim over a darker fold
      const fold = n1((y - ty + c.k * 5) / 7, salt + 2);
      v += fold > 0.55 ? 0.28 : fold < -0.6 ? -0.25 : 0;
      // threads of light running down a column
      if (f === 0 && h2(c.k, Math.trunc((y - ty) / 6), salt + 3) > 0.72) v += 0.45;
      let tone = toneOf(v);
      if (x === (sun > 0 ? xr : xl)) tone = 0;                       // the outline on the shaded side: ink
      else if (x === (sun > 0 ? xl : xr)) tone = Math.max(2, Math.min(tone, 3));
      put(x, y, t(tone));
    }
  }
  // the icicles: each column hangs on past the foot by its own length, one px at its tip
  for (const c of cols) {
    const hw = half(foot - 1), xl = Math.round(cx - hw), xr = Math.round(cx + hw);
    if (c.x1 < xl || c.x0 > xr || c.drop <= 0) continue;
    const mid = Math.max(xl, Math.min(xr, Math.round((c.x0 + c.x1) / 2)));
    for (let d = 0; d < c.drop; d++) {
      const w = d < c.drop / 2 ? Math.max(0, Math.min(c.x1, xr) - Math.max(c.x0, xl)) : 0;
      for (let x = Math.max(c.x0, xl, mid - Math.floor(w / 2)); x <= Math.min(c.x1, xr, mid + Math.ceil(w / 2)); x++) {
        const edge = x === Math.min(c.x1, xr) && w > 0;
        put(x, foot + d, t(d === c.drop - 1 ? 4 : edge ? 1 : sun > 0 && x === Math.max(c.x0, xl) ? 4 : 3));
      }
    }
  }
  // the heap at the foot: ice and frozen spray, lit on top toward the light, a dark rim at its bottom
  if (st.foot) {
    const [rx, ry] = st.foot, fy = foot - 1;
    for (let y = Math.floor(fy - ry); y <= Math.ceil(fy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - fy) / ry;
        const r = Math.hypot(dx, dy) + 0.18 * n1(Math.atan2(dy, dx) * 2.2, salt + 5);
        if (r > 1) continue;
        const v = -0.6 * dy - 0.35 * dx * sun + 0.3 * (h2(x, y, salt + 5) - 0.5);
        put(x, y, t(r > 0.86 && dy > 0.2 ? 1 : v > 0.35 ? 5 : v > -0.05 ? 4 : v > -0.45 ? 3 : 2));
      }
    }
  }
}
