// A rope tied across the street (in front of people), sagging in the middle,
// with things hanging from it: lanterns, flags. Port of the lantern rope of The
// Unwritten Dao's village script (scripts/suelo_aldea.py).
//
// `sag` as [x, y] px (unwritten-dao, the bridges of the Campana Alta, 11 oct): the middle hangs that far along x and
// y; a chain along a bridge that runs north-south droops outward, off the side of the deck, as the painters draw it
// (with the sag only down the screen it would read as a straight line on top of itself). `chain` draws it in links.

import { pyRound, type Pt } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { RopeStep } from './schema';

export function runRope(ctx: Ctx, st: RopeStep): void {
  const layer = ctx.layer(st.layer ?? 'front');
  const [ax, ay] = ctx.P(st.from[0], st.from[1]), [bx, by] = ctx.P(st.to[0], st.to[1]);
  const vec = Array.isArray(st.sag);
  const [sx, sy]: [number, number] = vec ? st.sag as [number, number] : [0, (st.sag as number | undefined) ?? 5];
  const sag = sy, color = st.color ?? 'madera sombra';
  const rope: Pt[] = [];
  if (!vec && bx - ax >= Math.abs(by - ay)) {
    // across (the street): one px per column, as the village script drew it
    const n = Math.trunc(bx - ax);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      rope.push([pyRound(ax + i), pyRound(ay + (by - ay) * t + sag * Math.sin(Math.PI * t))]);
    }
  } else {
    // steeper than 1 (two houses one south of the other), tied right to left, or with a sag that is a vector: along its
    // long axis, a px at a time, and where the sag makes it jump more than a px between two steps the gap is filled, so
    // it never breaks into dots
    const n = Math.max(1, Math.trunc(Math.max(Math.abs(by - ay), Math.abs(bx - ax))));
    let last: Pt | null = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = Math.sin(Math.PI * t);
      const p: Pt = [pyRound(ax + (bx - ax) * t + sx * s), pyRound(ay + (by - ay) * t + sy * s)];
      if (vec && last && p[0] === last[0] && p[1] === last[1]) continue;
      if (last) {
        const k = Math.max(Math.abs(p[0] - last[0]), Math.abs(p[1] - last[1]));
        for (let j = 1; j < k; j++) rope.push([Math.round(last[0] + (p[0] - last[0]) * j / k), Math.round(last[1] + (p[1] - last[1]) * j / k)]);
      }
      rope.push(p);
      last = p;
    }
  }
  if (st.chain) {
    // links: every `link` px a new one; a link seen flat (even) is an open ring, its two ends in the dark tone and its
    // middle lit, a px of the dark tone beside it (the far side of the ring); a link seen edge on (odd) is a dark bar
    const [dark, light] = st.chain.colors ?? ['basalto sombra', 'basalto luz'];
    const len = Math.max(2, st.chain.link ?? 3);
    for (let i = 0; i < rope.length; i++) {
      const [x, y] = rope[i];
      const k = Math.floor(i / len), j = i % len;
      const flat = k % 2 === 0;
      layer.set(x, y, flat && j > 0 && j < len - 1 ? light : dark);
      if (flat && j === Math.floor(len / 2)) {
        const [px, py] = rope[Math.max(0, i - 1)], [nx, ny] = rope[Math.min(rope.length - 1, i + 1)];
        const steep = Math.abs(ny - py) > Math.abs(nx - px);
        layer.set(steep ? x + 1 : x, steep ? y : y + 1, dark);
      }
    }
  } else {
    for (const [x, y] of rope) layer.set(x, y, color);
  }
  const n = rope.length - 1;
  for (const h of st.hang ?? []) {
    const [x, y] = rope[Math.trunc(h.at * n)];
    const [dx, dy] = h.offset ?? [0, 0];
    h.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && h.glyphs[ch]) layer.set(x + dx + i, y + dy + j, h.glyphs[ch]); }));
  }
}
