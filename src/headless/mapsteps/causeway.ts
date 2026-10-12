// A causeway: a stone bridge that crosses water from south to north, seen from above. Out of both sides of its deck,
// at even steps, stick the piers: noses of stone pointed up and downstream, their top lit on the side of the light, a
// rim of ink outside, their south face a few px of shade under the top. Between two piers the water passes under an
// arch: right by the deck it is dark, deepest at the middle of the span and fading to the piers, a half moon of shade
// that reads as the arch seen from above; on the side away from the light it reaches farther (the deck stands over
// the water and throws its shade there). It only paints over the water (`on`): the deck, its curbs and the banks
// stay. Not a flat strip over the lake: a bridge on arches.

import { h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { CausewayStep } from './causewayschema';

export function runCauseway(ctx: Ctx, st: CausewayStep): void {
  const g = ctx.ground, on = new Set(st.on), salt = st.salt ?? 1571;
  const n = ctx.mat(st.material).ramp.length;
  const t = (i: number) => ctx.tone(st.material, i);
  const INK = t(0), SHADOW = t(1), MID = t(2), LIGHT = t(3), LIT = t(n - 1);
  const [xw] = ctx.P(st.x[0], 0), [xe] = ctx.P(st.x[1], 0);
  const [, yn] = ctx.P(0, st.y[0]), [, ys] = ctx.P(0, st.y[1]);
  const every = st.every ?? 22, [out, long] = st.pier ?? [5, 8], rise = st.rise ?? 3;
  const [archW, archE] = st.arch ?? [3, 6];
  const [deep, edge] = st.shade ?? [SHADOW, MID];
  const water = (x: number, y: number) => on.has(ctx.kindAt(x, y));
  const L = Math.round(xw), R = Math.round(xe) - 1;          // the last px of the deck on each side
  // the piers: their middles along the deck, the first and last half a step in from the ends
  const count = Math.max(1, Math.round((ys - yn) / every));
  const step = (ys - yn) / count;
  const mids: number[] = [];
  for (let k = 0; k <= count; k++) mids.push(yn + k * step);
  // the arches first (the piers go over their ends)
  for (let k = 0; k < mids.length - 1; k++) {
    const a = mids[k], b = mids[k + 1], mid = (a + b) / 2, half = (b - a) / 2;
    for (let y = Math.floor(a); y <= Math.ceil(b); y++) {
      const f = 1 - ((y + 0.5 - mid) / half) ** 2;
      if (f <= 0) continue;
      for (const [side, reach] of [[-1, archW], [1, archE]] as const) {
        const d = reach * Math.sqrt(f);
        for (let i = 1; i <= Math.ceil(d); i++) {
          const x = side < 0 ? L - i : R + i;
          if (!water(x, y)) continue;
          g.set(x, y, i <= d * 0.7 ? deep : edge);
        }
      }
    }
  }
  // the piers: a block out of the deck with its outer corners cut, its top lit on the side of the light, a line of ink
  // around it, and under its top its south face in shade down to the water
  mids.forEach((m, k) => {
    const len = long + Math.round((h2(k, 1, salt) - 0.5) * 2);
    const top = Math.round(m - len / 2 - rise / 2), bot = top + len - 1;
    const width = (y: number) => {
      const yy = Math.min(y, bot), cut = Math.min(yy - top, bot - yy);
      return cut >= 2 ? out : out - (2 - cut);                 // the corners cut by 2, 1 px
    };
    for (const side of [-1, 1]) {
      for (let y = top; y <= bot + rise; y++) {
        const w = width(y);
        for (let i = 1; i <= w; i++) {
          const x = side < 0 ? L - i : R + i;
          if (!water(x, y)) continue;
          let c: string;
          const rim = i === w || (y <= bot && i > width(y - 1)) || y === top;
          if (y > bot) c = y === bot + rise || i === w ? INK : side < 0 ? MID : SHADOW;        // the south face
          else if (rim) c = INK;
          else if (y === top + 1 || (side < 0 && i === w - 1)) c = LIT;                         // the lit edges
          else if (y === bot) c = side < 0 ? LIGHT : MID;                                       // the lip over the face
          else c = side < 0 ? LIGHT : (i === 1 ? MID : LIGHT);
          g.set(x, y, c);
          ctx.setKind(x, y, st.material);
        }
      }
    }
  });
}
