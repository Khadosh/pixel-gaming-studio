// A wooden fence along a path, seen from above in three quarters: posts with a
// lit cap, two rails between them, runs at any angle (a run that goes down a
// slope is a diagonal: each post stands at its own height and the rails lean),
// gaps where you walk in, a post at every end. Its shadow falls on the ground
// down and to the right the way a cast step throws the shadow of the decor: a
// px h high lands 0.55·h to the right and 0.22·h down from its foot.

import { Mask, h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { FenceStep } from './buildingschema';

interface Post { x: number; f: number; h: number }
const LEAN: [number, number] = [0.55, 0.22];

export function runFence(ctx: Ctx, st: FenceStep): void {
  const { W, H } = ctx, name = st.material, g = ctx.ground;
  const layer = ctx.layer(st.layer ?? 'ground');
  const t = (i: number) => ctx.tone(name, i);
  const salt = st.salt ?? 1901;
  const spacing = st.spacing ?? 14, [pw, ph] = st.post ?? [3, 12], rails = st.rails ?? [4, 9], thick = st.rail ?? 2;
  const where = `map: fence${st.id ? ` "${st.id}"` : ''}`;
  const P = (p: [number, number]): [number, number] => { const [x, y] = ctx.P(p[0], p[1]); return [Math.round(x), Math.round(y)]; };
  const pts = st.path.map(P);

  // ---- the open intervals of each run, between the gaps
  const cuts: [number, number][][] = pts.slice(1).map(() => []);
  for (const [ga, gb] of st.gaps ?? []) {
    const a = ctx.P(ga[0], ga[1]), b = ctx.P(gb[0], gb[1]);
    let hit = -1, ta = 0, tb = 0;
    for (let i = 0; i < pts.length - 1 && hit < 0; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
      const proj = (p: [number, number]) => { const k = ((p[0] - x0) * dx + (p[1] - y0) * dy) / L2; return [k, Math.hypot(x0 + k * dx - p[0], y0 + k * dy - p[1])]; };
      const [ka, da] = proj(a), [kb, db] = proj(b);
      if (da < ctx.cell * 0.1 && db < ctx.cell * 0.1 && ka >= -0.01 && kb <= 1.01 && kb >= -0.01 && ka <= 1.01) { hit = i; ta = Math.min(ka, kb); tb = Math.max(ka, kb); }
    }
    if (hit < 0) throw new Error(`${where}: the gap ${JSON.stringify([ga, gb])} is not on one run of the path`);
    cuts[hit].push([ta, tb]);
  }

  // ---- posts along every interval, evenly, at most `spacing` apart; rails between two posts of an interval
  const posts: Post[] = [];
  const railPairs: [Post, Post][] = [];
  const postAt = (x: number, f: number): Post => {
    const old = posts.find(p => Math.abs(p.x - x) <= 1 && Math.abs(p.f - f) <= 1);
    if (old) return old;
    const p = { x, f, h: ph - (h2(x, f, salt) < 0.35 ? 1 : 0) };
    posts.push(p);
    return p;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const open: [number, number][] = [];
    let from = 0;
    for (const [a, b] of [...cuts[i]].sort((p, q) => p[0] - q[0])) { if (a > from) open.push([from, a]); from = Math.max(from, b); }
    if (from < 1) open.push([from, 1]);
    for (const [a, b] of open) {
      // a run seen end on (north-south) is foreshortened: its posts would stand on each other, so they go further apart
      const steep = Math.abs(y1 - y0) / Math.max(1, len);
      const n = Math.max(1, Math.ceil(len * (b - a) / (spacing * (1 + 0.8 * steep))));
      let prev: Post | null = null;
      for (let k = 0; k <= n; k++) {
        const s = a + (b - a) * k / n;
        const p = postAt(Math.round(x0 + (x1 - x0) * s), Math.round(y0 + (y1 - y0) * s));
        if (prev && prev !== p) railPairs.push([prev, p]);
        prev = p;
      }
    }
  }

  // ---- what the fence lays, with the height of each px over its foot (for its shadow)
  const mine = new Mask(W, H);
  const tall: [number, number, number][] = [];
  const put = (x: number, y: number, i: number, hh: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    layer.set(x, y, t(i));
    ctx.setKind(x, y, name);
    mine.set(x, y);
    tall.push([x, y, hh]);
  };
  // rails first (farther first), then the posts over them
  const rail = (p: Post, q: Post, r: number) => {
    const ax = p.x, ay = p.f - 1 - r, bx = q.x, by = q.f - 1 - r;
    const dx = bx - ax, dy = by - ay, steps = Math.max(Math.abs(dx), Math.abs(dy));
    const flat = Math.abs(dy) <= Math.abs(dx);
    for (let k = 0; k <= steps; k++) {
      const x = Math.round(ax + dx * k / steps), y = Math.round(ay + dy * k / steps);
      const grain = h2(x, y, salt + 3) < 0.12;
      const tones = thick === 1 ? [grain ? 2 : 3] : thick === 2 ? [grain ? 2 : 3, 1] : [grain ? 3 : 4, 2, 1];
      // seen end on a rail is a thin line, its lit side only: the posts, wider, read between them
      if (flat) tones.forEach((c, j) => put(x, y + j, c, r + 1 - j));
      else put(x - 1, y, tones[0], r);
    }
  };
  for (const [p, q] of [...railPairs].sort((a, b) => Math.min(a[0].f, a[1].f) - Math.min(b[0].f, b[1].f))) for (const r of rails) rail(p, q, r);
  for (const p of [...posts].sort((a, b) => a.f - b.f)) {
    const xl = p.x - Math.floor(pw / 2);
    for (let j = 0; j < p.h; j++) {
      const y = p.f - 1 - j;
      for (let i = 0; i < pw; i++) {
        const x = xl + i, topRow = j === p.h - 1, foot = j === 0;
        if (topRow && pw > 2 && (i === 0 || i === pw - 1)) { put(x, y, i === 0 ? 3 : 1, j); continue; }
        let c = i === 0 ? 3 : i === pw - 1 ? 1 : 2;
        if (topRow) c = 4;
        else if (j === p.h - 2) c = i === pw - 1 ? 1 : 4;
        else if (foot) c = 0;
        else if (c === 2 && h2(x, y, salt + 5) < 0.15) c = 1;
        put(x, y, c, j);
      }
    }
  }

  // ---- the shadow on the ground, down and to the right
  const shadow = st.shadow ?? 1;
  if (shadow > 0) {
    const sm = new Mask(W, H);
    for (const [x, y, hh] of tall) {
      if (hh <= 0) continue;
      const X = Math.trunc(x + LEAN[0] * hh), Y = Math.trunc(y + hh + LEAN[1] * hh);
      for (let k = 0; k < shadow; k++) sm.set(X, Y + k);
    }
    const on = st.on ? new Set(st.on) : null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!sm.has(x, y) || mine.has(x, y) || (on && !on.has(ctx.kindAt(x, y)))) continue;
      g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
    }
  }

  // ---- tufts of grass at the foot of some posts
  if (st.tufts) {
    const s = (i: number) => ctx.tone(st.tufts!, i);
    for (const p of posts) {
      if (h2(p.x, p.f, salt + 7) < 0.4) continue;
      const side = h2(p.x, p.f, salt + 8) < 0.5 ? -1 : 1, x = p.x + side * (Math.floor(pw / 2) + 1);
      layer.set(x, p.f - 1, s(4)); layer.set(x, p.f - 2, s(3));
      if (h2(p.x, p.f, salt + 9) < 0.5) layer.set(x + side, p.f - 1, s(3));
    }
  }
  if (st.id) ctx.masks.set(st.id, mine);
}
