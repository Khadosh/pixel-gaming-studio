// Running water falling down a face: the spill step. Where a stream reaches the edge of a terrace (a retaining wall,
// a step of rock) it pours over it: a lit lip at the head where the water bends over, then a band of falling water
// split in streaks (long runs of the shallow and the mid tone, a few of foam), its edges a tone darker (the deep one
// on the side away from the light), a little wider at its foot, where it lands in a ring of foam. On a flow layer, the
// light streaks the game makes run down. Not ice (that is `icefall`, columns that stand still): water that moves.

import { h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { SpillStep } from './spillschema';

export function runSpill(ctx: Ctx, st: SpillStep): void {
  const g = ctx.ground, salt = st.salt ?? 1491;
  const t = (i: number) => ctx.tone(st.material, i);
  const flow = st.flow ? ctx.layer(st.flow) : null;
  const [cx, ty] = ctx.P(st.at[0], st.at[1]);
  const top = Math.round(ty), len = st.length, foot = top + len, [w0, w1] = st.width;
  const sun = st.light === 'east' ? -1 : 1;
  const put = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
    g.set(x, y, c);
    ctx.setKind(x, y, st.material);
  };
  const ledges = [...(st.ledges ?? [])].sort((a, b) => a.at - b.at)
    .map(l => ({ y: top + Math.round(l.at * len), widen: l.widen ?? 3, shift: l.shift ?? 0, pool: l.pool ?? 0 }));
  // under each ledge the water is wider and moved: what the ledges above a row add up to
  const under = (y: number) => ledges.reduce((a, l) => (y > l.y + 1 ? { w: a.w + l.widen, s: a.s + l.shift } : a), { w: 0, s: 0 });
  const half = (y: number) => Math.max(1.5, w0 + (w1 - w0) * Math.min(1, Math.max(0, (y - top) / len)) + under(y).w
    + (st.wobble ? st.wobble * n1((y - top) / 9, salt + 11) : 0));
  // two threads: between `split` shares of the length a gap opens in the middle, widest half way through
  const gap = (y: number) => {
    if (!st.split) return 0;
    const k = ((y - top) / len - st.split[0]) / Math.max(0.01, st.split[1] - st.split[0]);
    return k <= 0 || k >= 1 ? 0 : 0.32 * Math.sin(Math.PI * k);
  };
  // wet rock beside the fall: the face a tone down, flecks of spray near the water
  if (st.wet) {
    for (let y = top; y < foot; y++) {
      const hw = half(y), u = under(y), sway = 0.5 * n1((y - top) / 11, salt) + u.s;
      for (let x = Math.floor(cx + sway - hw - st.wet - 1); x <= Math.ceil(cx + sway + hw + st.wet + 1); x++) {
        const d = Math.abs(x + 0.5 - cx - sway) - hw;
        if (d <= 0 || d > st.wet * (0.7 + 0.5 * h2(x, y >> 2, salt + 12)) || x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) continue;
        const c = g.get(x, y);
        if (c === null || ctx.kindAt(x, y) === st.material) continue;   // the rock gets wet, not the water of a fall beside it
        g.set(x, y, d < 2.5 && h2(x, y, salt + 13) < 0.22 ? t(3) : ctx.shade(c, ctx.kindAt(x, y)) ?? c);
      }
    }
  }
  const head = (x: number) => (st.ragged ? Math.round(st.ragged * h2(Math.floor(x / 3), 9, salt + 6) ** 1.5) : 0);
  for (let y = top; y < foot; y++) {
    const hw = half(y), u = under(y), sway = 0.5 * n1((y - top) / 11, salt) + u.s;
    for (let x = Math.floor(cx + u.s - hw - 1); x <= Math.ceil(cx + u.s + hw + 1); x++) {
      const dx = (x + 0.5 - cx - sway) / hw;
      if (Math.abs(dx) > 1 || Math.abs(dx) < gap(y)) continue;
      const h0 = top + head(x);
      if (y < h0) continue;
      // streaks: each column of px breaks into runs of its own length, so the fall reads as threads of water
      const run = 4 + Math.trunc(h2(x, 1, salt + 1) * 7);
      const s = h2(x, Math.floor((y + 13 * h2(x, 0, salt + 1)) / run), salt + 2);
      let c = s < 0.3 ? t(1) : s < 0.8 ? t(2) : t(3);
      if (Math.abs(dx) > 0.78) c = dx * sun > 0 ? t(0) : t(1);       // the edges: the deep tone away from the light
      if (y - h0 < 2) c = y === h0 ? t(4) : t(3);                    // the lip where it bends over
      // a ledge: its lip of rock across the water, the foam it throws up just under it
      // with a broken lip (`ragged`) each ledge is broken too: its lip a px or two up or down from one pair of columns to the next
      const off = (e: { y: number }) => (st.ragged ? Math.round((h2(x >> 1, e.y, salt + 8) - 0.5) * Math.min(4, st.ragged)) : 0);
      const l = ledges.find(e => y >= e.y + off(e) - 1 && y <= e.y + off(e) + 3);
      if (l) {
        const d = y - l.y - off(l);
        if (d <= 0) c = st.rock ? ctx.tone(st.rock, d === 0 ? 2 : 3) : t(0);
        else c = d === 1 || h2(x, y, salt + 7) < 0.55 ? t(4) : t(3);
      }
      put(x, y, c);
      if (flow && !l && Math.abs(dx) < 0.78 && y - h0 >= 2 && h2(x, Math.floor(y / 3), salt + 3) < 0.35) flow.set(x, y, (y % 3) === 0 ? t(4) : t(3));
    }
  }
  // the basins on the ledges: an irregular pool wider than the fall, where the water gathers: still water (mid and
  // shallow, a glint), a rim of rock around it, and over its broken lower lip, where the fall goes on, foam
  for (const l of ledges) {
    if (!l.pool) continue;
    const above = under(l.y - 2), bx = cx + above.s, by = l.y - l.pool / 2, rx = half(l.y - 2) + l.pool + 2, ry = l.pool / 2 + 1;
    const below = half(l.y + 3), sx = cx + under(l.y + 3).s;
    for (let y = Math.floor(by - ry - 1); y <= Math.ceil(by + ry + 1); y++) for (let x = Math.floor(bx - rx - 2); x <= Math.ceil(bx + rx + 2); x++) {
      const a = Math.atan2(y + 0.5 - by, x + 0.5 - bx), wob = 1 + 0.18 * n1(a * 2.2, salt + 14) + 0.08 * (h2(x >> 1, y >> 1, salt + 15) - 0.5);
      const q = Math.hypot((x + 0.5 - bx) / rx, (y + 0.5 - by) / ry) / wob;
      if (q > 1) continue;
      const rim = q > 0.78, lower = y + 0.5 > by;
      let c: string;
      if (rim && lower && Math.abs(x + 0.5 - sx) < below) c = h2(x, y, salt + 16) < 0.6 ? t(4) : t(3);   // the overflow
      else if (rim) c = st.rock ? ctx.tone(st.rock, lower ? 1 : 3) : t(0);
      else c = y + 0.5 < by - ry * 0.4 && h2(x, y, salt + 17) < 0.3 ? t(4) : h2(x >> 2, y, salt + 18) < 0.5 ? t(1) : t(2);
      put(x, y, c);
    }
  }
  // the foam where it lands: a flat ring of foam and shallow water, lit on top, broken at its rim
  const [rx, ry] = st.foot ?? [w1 + 4, 4];
  if (rx > 0 && ry > 0) {
    const fy = foot - 1, fx = cx + under(foot).s;
    for (let y = Math.floor(fy - ry); y <= Math.ceil(fy + ry); y++) {
      for (let x = Math.floor(fx - rx); x <= Math.ceil(fx + rx); x++) {
        const dx = (x + 0.5 - fx) / rx, dy = (y + 0.5 - fy) / ry;
        const r = Math.hypot(dx, dy) + 0.22 * (h2(x, y, salt + 4) - 0.5);
        if (r > 1) continue;
        put(x, y, r > 0.8 ? t(2) : dy < -0.2 && h2(x, y, salt + 5) < 0.6 ? t(4) : t(3));
      }
    }
  }
}
