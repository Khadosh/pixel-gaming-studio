// A rope tied across the street (in front of people), sagging in the middle,
// with things hanging from it: lanterns, flags. Port of the lantern rope of The
// Unwritten Dao's village script (scripts/suelo_aldea.py).

import { pyRound, type Pt } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { RopeStep } from './schema';

export function runRope(ctx: Ctx, st: RopeStep): void {
  const layer = ctx.layer(st.layer ?? 'front');
  const [ax, ay] = ctx.P(st.from[0], st.from[1]), [bx, by] = ctx.P(st.to[0], st.to[1]);
  const sag = st.sag ?? 5, color = st.color ?? 'madera sombra';
  const rope: Pt[] = [];
  if (bx - ax >= Math.abs(by - ay)) {
    // across (the street): one px per column, as the village script drew it
    const n = Math.trunc(bx - ax);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      rope.push([pyRound(ax + i), pyRound(ay + (by - ay) * t + sag * Math.sin(Math.PI * t))]);
    }
  } else {
    // steeper than 1 (two houses one south of the other), or tied right to left: along its long axis, a px at a time,
    // and where the sag makes it drop more than a px between two steps the gap is filled, so it never breaks into dots
    const n = Math.max(1, Math.trunc(Math.max(Math.abs(by - ay), Math.abs(bx - ax))));
    let last: Pt | null = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p: Pt = [pyRound(ax + (bx - ax) * t), pyRound(ay + (by - ay) * t + sag * Math.sin(Math.PI * t))];
      if (last) {
        const k = Math.max(Math.abs(p[0] - last[0]), Math.abs(p[1] - last[1]));
        for (let j = 1; j < k; j++) rope.push([Math.round(last[0] + (p[0] - last[0]) * j / k), Math.round(last[1] + (p[1] - last[1]) * j / k)]);
      }
      rope.push(p);
      last = p;
    }
  }
  for (const [x, y] of rope) layer.set(x, y, color);
  const n = rope.length - 1;
  for (const h of st.hang ?? []) {
    const [x, y] = rope[Math.trunc(h.at * n)];
    const [dx, dy] = h.offset ?? [0, 0];
    h.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && h.glyphs[ch]) layer.set(x + dx + i, y + dy + j, h.glyphs[ch]); }));
  }
}
