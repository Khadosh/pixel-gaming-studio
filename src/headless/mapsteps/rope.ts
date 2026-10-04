// A rope tied across the street (in front of people), sagging in the middle,
// with things hanging from it: lanterns, flags. Port of the lantern rope of The
// Unwritten Dao's village script (scripts/suelo_aldea.py).

import { pyRound, type Pt } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { RopeStep } from './schema';

export function runRope(ctx: Ctx, st: RopeStep): void {
  const layer = ctx.layer(st.layer ?? 'front');
  const [ax, ay] = ctx.P(st.from[0], st.from[1]), [bx, by] = ctx.P(st.to[0], st.to[1]);
  const n = Math.trunc(bx - ax), sag = st.sag ?? 5, color = st.color ?? 'madera sombra';
  const rope: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = pyRound(ax + i), y = pyRound(ay + (by - ay) * t + sag * Math.sin(Math.PI * t));
    rope.push([x, y]);
    layer.set(x, y, color);
  }
  for (const h of st.hang ?? []) {
    const [x, y] = rope[Math.trunc(h.at * n)];
    const [dx, dy] = h.offset ?? [0, 0];
    h.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && h.glyphs[ch]) layer.set(x + dx + i, y + dy + j, h.glyphs[ch]); }));
  }
}
