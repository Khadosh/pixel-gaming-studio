// Running water falling down a face: the spill step. Where a stream reaches the edge of a terrace (a retaining wall,
// a step of rock) it pours over it: a lit lip at the head where the water bends over, then a band of falling water
// split in streaks (long runs of the shallow and the mid tone, a few of foam), its edges a tone darker (the deep one
// on the side away from the light), a little wider at its foot, where it lands in a ring of foam. On a flow layer, the
// light streaks the game makes run down; on a foam layer, the foam of the ledges and the foot and the spray churn (#356).
// Not ice (that is `icefall`, columns that stand still): water that moves.

import { h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import { foamPainter } from './foam';
import type { SpillStep } from './spillschema';

export function runSpill(ctx: Ctx, st: SpillStep): void {
  const g = ctx.ground, salt = st.salt ?? 1491;
  const t = (i: number) => ctx.tone(st.material, i);
  const flow = st.flow ? ctx.layer(st.flow) : null;
  const fp = foamPainter(ctx, st.foam, st.material, salt);
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
        g.set(x, y, ctx.shade(c, ctx.kindAt(x, y)) ?? c);
        if (d < 2.5 && h2(x, y, salt + 13) < 0.22) fp.spray(x, y, t(3));
      }
    }
  }
  const head = (x: number) => (st.ragged ? Math.round(st.ragged * h2(Math.floor(x / 3), 9, salt + 6) ** 1.5) : 0);
  // a lip of rock (#394): the head bowed toward the viewer, the calm water behind it narrowing back into the rock, the rock
  // lip around it (lit on top, wet and dark against the water); under the glint the sheet breaks in strands
  const rk = (i: number) => (st.rock ? ctx.tone(st.rock, i) : t(0));
  const lip = st.lip ? { bow: st.lip.bow ?? 3, back: st.lip.back ?? 3, rim: st.rock ? st.lip.rim ?? 2 : 0, mouth: st.lip.mouth ?? 0 } : null;
  const hw0 = half(top), cx0 = cx + 0.5 * n1(0, salt);
  const dxAt = (x: number) => (x + 0.5 - cx0) / hw0;
  const lipAt = (x: number) => Math.round(top + head(x) + (lip ? lip.bow * (1 - Math.min(1, dxAt(x) ** 2)) : 0));
  if (lip) {
    const { back, rim, mouth } = lip;
    // the mouth the water comes out of: an arch of dark rock over the calm water
    const arch = (x: number) => Math.round(top - back - mouth * Math.sqrt(Math.max(0, 1 - dxAt(x) ** 2)));
    const inside = (x: number, y: number) => Math.abs(dxAt(x)) <= 1 && y >= arch(x) && y < lipAt(x);
    for (let y = top - back - mouth - rim; y <= top + rim; y++) {
      for (let x = Math.floor(cx0 - hw0 - rim - 1); x <= Math.ceil(cx0 + hw0 + rim + 1); x++) {
        if (inside(x, y)) {
          if (y >= top - back) {
            // the calm water behind the lip, in the shade of the mouth: dark, streaked toward the edge, a tone lighter
            // just before it bends over
            put(x, y, y === lipAt(x) - 1 ? t(2) : h2(x, Math.floor((y - top) / 2), salt + 22) < 0.3 ? t(1) : t(0));
          } else {
            // the dark inside of the mouth, a tone up where the water comes out of it
            put(x, y, y >= top - back - 2 ? rk(1) : rk(0));
            ctx.setKind(x, y, st.rock!);
          }
          continue;
        }
        if (rim <= 0 || y >= top + rim) continue;
        // the rock lip around: wet and dark against the water and the mouth, lit on its outer edge
        let d = 0;
        for (let k = 1; k <= rim && !d; k++) {
          for (let oy = -k; oy <= k && !d; oy++) for (let ox = -k; ox <= k && !d; ox++) if (inside(x + ox, y + oy) && y + oy < top + 1) d = k;
        }
        if (!d) continue;
        put(x, y, d === 1 ? (y < top - back ? rk(2) : rk(1)) : y < top ? rk(5) : rk(3));
        ctx.setKind(x, y, st.rock!);
      }
    }
  }


  for (let y = top; y < foot; y++) {
    const hw = half(y), u = under(y), sway = 0.5 * n1((y - top) / 11, salt) + u.s;
    for (let x = Math.floor(cx + u.s - hw - 1); x <= Math.ceil(cx + u.s + hw + 1); x++) {
      const dx = (x + 0.5 - cx - sway) / hw;
      if (Math.abs(dx) > 1 || Math.abs(dx) < gap(y)) continue;
      const h0 = lip ? lipAt(x) : top + head(x);
      if (y < h0) continue;
      // streaks: each column of px breaks into runs of its own length, so the fall reads as threads of water
      const run = 4 + Math.trunc(h2(x, 1, salt + 1) * 7);
      const s = h2(x, Math.floor((y + 13 * h2(x, 0, salt + 1)) / run), salt + 2);
      let c = s < 0.3 ? t(1) : s < 0.8 ? t(2) : t(3);
      if (Math.abs(dx) > 0.78) c = dx * sun > 0 ? t(0) : t(1);       // the edges: the deep tone away from the light
      if (y - h0 < 2) c = y === h0 ? t(4) : t(3);                    // the lip where it bends over
      else if (lip && y - h0 < 6 && Math.abs(dx) > 0.82) c = rk(0);   // where it bends over, the edges thin to the rock behind
      // the break under the lip: some columns of the sheet are strands for a few px, the dark rock between them
      else if (lip && y - h0 < 2 + h2(x, 1, salt + 23) * 6 && h2(x, 2, salt + 24) < 0.24) c = rk(0);
      // a ledge: its lip of rock across the water, the foam it throws up just under it
      // with a broken lip (`ragged`) each ledge is broken too: its lip a px or two up or down from one pair of columns to the next
      const off = (e: { y: number }) => (st.ragged ? Math.round((h2(x >> 1, e.y, salt + 8) - 0.5) * Math.min(4, st.ragged)) : 0);
      const l = ledges.find(e => y >= e.y + off(e) - 1 && y <= e.y + off(e) + 3);
      if (l) {
        const d = y - l.y - off(l);
        if (d <= 0) c = st.rock ? ctx.tone(st.rock, d === 0 ? 2 : 3) : t(0);
        else c = d === 1 || h2(x, y, salt + 7) < 0.55 ? t(4) : t(3);
      }
      if (l && y - l.y - off(l) > 0) fp.foam(x, y, c, st.material); else put(x, y, c);
      if (flow && !l && !(lip && c === rk(0)) && Math.abs(dx) < 0.78 && y - h0 >= 2 && h2(x, Math.floor(y / 3), salt + 3) < 0.35) flow.set(x, y, (y % 3) === 0 ? t(4) : t(3));
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
      if (rim && lower && Math.abs(x + 0.5 - sx) < below) { fp.foam(x, y, h2(x, y, salt + 16) < 0.6 ? t(4) : t(3), st.material); continue; }   // the overflow
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
        fp.foam(x, y, r > 0.8 ? t(2) : dy < -0.2 && h2(x, y, salt + 5) < 0.6 ? t(4) : t(3), st.material);
      }
    }
  }
  fp.flush();
}
