// A trench: a channel cut down into the ground along a curve, seen from above and a little from the south (The
// Unwritten Dao, #379: the canals of the top of the wall of water and the seam of the ice caves were ribbons laid flat
// on the snow). Across the cut you see the face of the far bank, the one that looks south, lit at its rim and darker
// toward the water (or lit from below, when the bottom glows); along a cut that runs north-south its side walls show
// from above, the one facing the light lit; the near lip is a dark edge that hides the foot of its own wall. The water
// runs at the bottom, darker in the shadow of the face. A bridge is a deck of slabs on both banks and, under its south
// edge, its face down to the water with the arch the water runs through.

import { h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { TrenchStep } from './trenchschema';

export function runTrench(ctx: Ctx, st: TrenchStep): void {
  const g = ctx.ground, salt = st.salt ?? 1747;
  const t = (i: number) => ctx.tone(st.material, i);
  const r = (i: number) => ctx.tone(st.rock, i);
  const flow = st.flow ? ctx.layer(st.flow) : null;
  const sun = st.light === 'east' ? -1 : 1, depth = st.depth, side = st.side ?? 3;
  const put = (x: number, y: number, c: string, kind: string) => {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
    g.set(x, y, c);
    ctx.setKind(x, y, kind);
  };
  // the middle line, sampled every half px, with its half width; the rim wanders a little
  const pts = st.curve.map(([u, v, w]) => { const [x, y] = ctx.P(u, v); return [x, y, w] as const; });
  const samples: [number, number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay, aw] = pts[i], [bx, by, bw] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let k = 0; k < n; k++) samples.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n, aw + (bw - aw) * k / n]);
  }
  samples.push([...pts[pts.length - 1]]);
  const pad = Math.max(...samples.map(s => s[2])) + depth + side + 6;
  const x0 = Math.floor(Math.min(...samples.map(s => s[0])) - pad), x1 = Math.ceil(Math.max(...samples.map(s => s[0])) + pad);
  const y0 = Math.floor(Math.min(...samples.map(s => s[1])) - pad), y1 = Math.ceil(Math.max(...samples.map(s => s[1])) + pad);
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const open = new Uint8Array(W * H), along = new Float32Array(W * H).fill(-1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < samples.length; i++) {
      const [sx, sy, sw] = samples[i], d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy) - sw * (1 + 0.12 * n1((sx + sy) / 9, salt));
      if (d < best) { best = d; bi = i; }
    }
    if (best <= 0) { open[(y - y0) * W + x - x0] = 1; along[(y - y0) * W + x - x0] = bi / samples.length; }
  }
  // water already there (the pool the channel leaves from): the cut opens into it, no bank, no face, no lip
  const wetBefore = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x >= 0 && y >= 0 && x < ctx.W && y < ctx.H && ctx.kindAt(x, y) === st.material) wetBefore[(y - y0) * W + x - x0] = 1;
  }
  const wet = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && wetBefore[(y - y0) * W + x - x0] === 1;
  const isOpen = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && open[(y - y0) * W + x - x0] === 1;
  // the bridges: the rows of each deck and of its face under it
  const decks = (st.bridges ?? []).map(b => {
    const [, cy] = ctx.P(0, b.v), th = b.thick ?? 8;
    return { top: Math.round(cy - th / 2), bot: Math.round(cy + th / 2) - 1, reach: b.reach ?? 4, mat: b.material ?? st.rock };
  });
  const deckAt = (y: number) => decks.find(d => y >= d.top && y <= d.bot);
  const faceAt = (y: number) => decks.find(d => y > d.bot && y <= d.bot + depth);
  for (let y = y0; y <= y1; y++) {
    // the opening of this row: where it starts and ends (for the side walls and the arch)
    for (let x = x0; x <= x1; x++) {
      const o = isOpen(x, y);
      if (!o && wet(x, y)) continue;
      if (!o) {
        // the lips: the far one lit (snow on it if any), the near one a dark edge, the sides a mid tone
        const below = isOpen(x, y + 1), above = isOpen(x, y - 1), beside = isOpen(x - 1, y) || isOpen(x + 1, y);
        const dk = deckAt(y);
        if (dk && (below || above || beside || isOpen(x - 1 - dk.reach, y) || isOpen(x + 1 + dk.reach, y))) {
          let near = false;
          for (let k = 1; k <= dk.reach + 1 && !near; k++) near = isOpen(x - k, y) || isOpen(x + k, y);
          if (near) { deckPx(x, y, dk); continue; }
        }
        if (below) put(x, y, st.snow ? st.snow[0] : r(5), st.snow ? st.rock : st.rock);
        else if (above) put(x, y, r(0), st.rock);
        else if (beside && !isOpen(x, y + 2)) put(x, y, r(2), st.rock);
        continue;
      }
      const dk = deckAt(y);
      if (dk) { deckPx(x, y, dk); continue; }
      // how far up the far bank is (its face), and how far each side wall is
      let j = 1;
      while (j <= depth + 2 && isOpen(x, y - j) && !deckAt(y - j)) j++;
      if (j <= depth + 2 && wet(x, y - j)) j = depth + 3;    // open to the pool above: no face
      const fromDeck = j <= depth && !!deckAt(y - j);
      let lw = 1; while (lw <= side + 1 && isOpen(x - lw, y)) lw++;
      let le = 1; while (le <= side + 1 && isOpen(x + le, y)) le++;
      const fa = faceAt(y);
      if (fa) {
        // the face of a bridge: the arch the water runs through, its ring of stones, the spandrels
        let a = 0, b = 0; while (isOpen(x - a - 1, y)) a++; while (isOpen(x + b + 1, y)) b++;
        const half = (a + b + 1) / 2, dx = (a - b) / 2 / Math.max(1, half), h = y - fa.bot;
        const archTop = depth * 0.35 + depth * 0.65 * dx * dx;     // the crown high in the middle
        if (h > archTop + 1) { put(x, y, h > archTop + 2 ? t(0) : r(0), st.material); continue; }
        put(x, y, h > archTop ? r(4) : h === 1 ? r(1) : (Math.floor((x + (h >> 1)) / 4) % 2 ? r(3) : r(2)), st.rock);
        continue;
      }
      if (j <= depth && !fromDeck) {
        // the face of the far bank: lit at the rim, darker toward the water (lighter, when the bottom glows), in blocks
        const k = (j - 1) / Math.max(1, depth - 1);
        let i = st.glow ? (k < 0.3 ? 3 : k < 0.7 ? 2 : 4) : (k < 0.25 ? 4 : k < 0.6 ? 3 : k < 0.85 ? 2 : 1);
        const block = Math.floor((x + 3 * h2(Math.floor((y - j) / 5), 0, salt + 1)) / 5);
        if (h2(block, Math.floor((y - j + j) / 5), salt + 2) < 0.3) i = Math.max(1, i - 1);
        if ((x + Math.floor(y / 5)) % 5 === 0 && j > 1) i = Math.max(0, i - 2);   // the joints between blocks
        put(x, y, r(i), st.rock);
        continue;
      }
      if (lw <= side || le <= side) {
        // a side wall seen from above: the one facing the light lit, the other in shade, darker toward the bottom
        const west = lw <= side && (lw <= le || le > side), d = west ? lw : le;
        const lit = (west ? 1 : -1) * sun < 0;   // the east wall faces west: lit when the light is west
        const i = (lit ? 4 : 2) - (d > side / 2 ? 1 : 0);
        put(x, y, r(st.glow ? Math.min(5, i + 1) : i), st.rock);
        continue;
      }
      // the bottom: the water, darker under the face and against the walls; or the glowing seam
      const kk = along[(y - y0) * W + x - x0];
      const run = 4 + Math.trunc(h2(x, 1, salt + 3) * 6);
      const s = h2(x, Math.floor((y + 9 * h2(x, 0, salt + 3)) / run), salt + 4);
      let c: string;
      // how near the middle of the bottom (0 at a wall, 1 in the middle)
      let a = lw, b = le; while (a < 40 && isOpen(x - a, y)) a++; while (b < 40 && isOpen(x + b, y)) b++;
      const mid = Math.min(a, b) / Math.max(1, (a + b) / 2);
      if (st.glow) c = mid > 0.7 + 0.15 * (h2(x >> 1, y >> 2, salt + 7) - 0.5) ? (s < 0.4 ? t(4) : t(3)) : mid > 0.4 ? t(2) : t(1);
      else {
        c = s < 0.22 ? t(2) : s < 0.96 ? t(1) : t(3);
        if (j <= depth + 2 || lw <= side + 1 || le <= side + 1) c = t(0);
        if (kk >= 0 && kk < 0.05 && h2(x, y, salt + 5) < 0.4) c = t(3);
      }
      put(x, y, c, st.material);
      if (flow && !st.glow && j > depth + 2 && h2(x, Math.floor(y / 4), salt + 6) < 0.12) flow.set(x, y, (y % 3) === 0 ? t(4) : t(3));
    }
  }
  // a px of the deck of a bridge: slabs, the north edge lit, the south edge dark, the joints across
  function deckPx(x: number, y: number, dk: { top: number; bot: number; mat: string }) {
    const m = (i: number) => ctx.tone(dk.mat, i), n = ctx.mat(dk.mat).ramp.length;
    const top = n - 1, mid = Math.max(1, n - 3);
    let c = y === dk.top ? m(top) : y === dk.bot ? m(1) : y === dk.bot - 1 ? m(mid - 1) : m(mid);
    // slabs in two courses, their joints staggered; the north row of each slab a tone up
    const course = Math.floor((y - dk.top - 1) / Math.max(2, Math.floor((dk.bot - dk.top - 1) / 2))), cx = x + 4 * course;
    if (y > dk.top && y < dk.bot - 1) {
      if (cx % 8 === 0) c = m(Math.max(1, mid - 2));
      else if (y === dk.top + 1 + course * Math.max(2, Math.floor((dk.bot - dk.top - 1) / 2)) && course > 0) c = m(Math.max(1, mid - 2));
      else if (h2(Math.floor(cx / 8), course, salt + 9) < 0.35) c = m(Math.min(top, mid + 1));
    }
    put(x, y, c, dk.mat);
  }
}
