// A wooden fence along a path, seen from above in three quarters: short posts
// with a lit cap, two rails between them, a shadow at their foot. How a rail
// reads depends on the way its run goes:
//   - east-west, a rail is a bar `rail` px thick across, lit on top, with a line
//     of ink under it, from post to post;
//   - on a slope (a diagonal), the same bar leans: each post stands at its own
//     height and the rail runs from one to the next;
//   - north-south, the run is seen end on: its posts stand closer (the ground
//     foreshortens), and each rail shows its edge, a line that runs almost
//     upright from post to post: the high rail on the lit (west) side of the
//     posts, the low one on the side in shade, so the two read as two.
// Every px knows how far south it stands, so a nearer post hides the rail that
// goes behind it and a rail hides the face of the post it leaves. Its shadow
// falls on the ground down and to the right the way a cast step throws the
// shadow of the decor: a px h high lands 0.55·h to the right and 0.22·h down
// from its foot.

import { Mask, h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { FenceStep } from './buildingschema';

interface Post { x: number; f: number; h: number }
const LEAN: [number, number] = [0.55, 0.22];
/** A run steeper than this (rise over run, px) is seen end on: its rails are edges, not bars. */
const END_ON = 4;

/**
 * Whether a run between two posts is seen end on (its rails as edges) or across (its rails as bars): only a run that
 * really goes north-south is seen end on; a steep diagonal still shows its rails as bars, leaning and whole between
 * the posts (as edges they were two thin stepped lines with the grass between them: Joaquín, the pavilion).
 */
export function seenEndOn(dx: number, df: number): boolean {
  return Math.abs(df) > 3 * Math.abs(dx);
}

export function runFence(ctx: Ctx, st: FenceStep): void {
  const { W, H } = ctx, name = st.material, g = ctx.ground;
  const layer = ctx.layer(st.layer ?? 'ground');
  const t = (i: number) => ctx.tone(name, i);
  const salt = st.salt ?? 1901;
  const spacing = st.spacing ?? 14, [pw, ph] = st.post ?? [3, 12], rails = [...(st.rails ?? [4, 9])].sort((a, b) => a - b), thick = st.rail ?? 2;
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
    // a run seen end on (north-south) is foreshortened: its posts stand closer on the picture than across, yet
    // far enough apart for the rails to show between them; a steep diagonal spreads them, so its rails lean
    // over a few px of ground and not only behind the posts
    const rise = Math.abs(y1 - y0) / Math.max(1, Math.abs(x1 - x0));
    const step = rise > END_ON ? Math.max(spacing * 0.85, ph + 5) : rise > 1 ? spacing * (1 + 0.3 * Math.min(1, rise - 1)) : spacing;
    for (const [a, b] of open) {
      const n = Math.max(1, Math.ceil(len * (b - a) / step - 0.15));
      let prev: Post | null = null;
      for (let k = 0; k <= n; k++) {
        const s = a + (b - a) * k / n;
        const p = postAt(Math.round(x0 + (x1 - x0) * s), Math.round(y0 + (y1 - y0) * s));
        if (prev && prev !== p) railPairs.push([prev, p]);
        prev = p;
      }
    }
  }

  // ---- what the fence lays: every px with how far south it stands (its foot) and its height over it (for its shadow)
  const mine = new Mask(W, H);
  const depth = new Float64Array(W * H).fill(-Infinity);
  const tall: [number, number, number][] = [];
  const put = (x: number, y: number, i: number, hh: number, d: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H || d < depth[y * W + x]) return;
    depth[y * W + x] = d;
    layer.set(x, y, t(i));
    ctx.setKind(x, y, name);
    mine.set(x, y);
    tall.push([x, y, hh]);
  };

  // rails: a bar that leans with its run, or the edge of a rail seen end on
  const half = Math.floor(pw / 2);
  const bar = (p: Post, q: Post, r: number) => {
    const [a, b] = p.x <= q.x ? [p, q] : [q, p];
    // from post to post: the posts hide its ends, or it hides the face of the post it leaves toward us
    const at = (x: number) => (a.f - 1 - r) + (b.f - a.f) * (x - a.x) / Math.max(1, b.x - a.x);
    const footAt = (x: number) => a.f + (b.f - a.f) * (x - a.x) / Math.max(1, b.x - a.x);
    for (let x = a.x; x <= b.x; x++) {
      // the rows the line of the rail crosses in this column, then its thickness under them
      const y0 = Math.round(Math.min(at(x - 0.5), at(x + 0.5))), y1 = Math.round(Math.max(at(x - 0.5), at(x + 0.5)));
      const top = y0, bottom = y1 + thick - 1;
      const d = footAt(x) - 0.01;
      for (let y = top; y <= bottom; y++) {
        const fromTop = y - top, fromBottom = bottom - y;
        const grain = h2(x, y, salt + 3) < 0.12;
        const c = fromTop === 0 ? (h2(x, r, salt + 4) < 0.18 ? 4 : 3) : fromBottom === 0 ? 1 : grain ? 1 : 2;
        put(x, y, c, r + 1 - fromTop, d);
      }
      // a line of ink under the bar, where it stands against the ground
      put(x, bottom + 1, 0, r - thick + 1, d - 0.5);
    }
  };
  const edge = (p: Post, q: Post, r: number, lit: boolean) => {
    const [a, b] = p.f <= q.f ? [p, q] : [q, p];
    // seen end on, a rail is its edge: a line from post to post along one side of them, the high one on the
    // lit (west) side, the low one on the side in shade, the ground between the two
    const off = lit ? -half : pw - 1 - half;
    const ya = a.f - 1 - r, yb = b.f - 1 - r;
    for (let y = ya; y <= yb; y++) {
      const k = (y - ya) / Math.max(1, yb - ya);
      const x = Math.round(a.x + (b.x - a.x) * k) + off;
      const d = a.f + (b.f - a.f) * k - 0.01;
      const c = lit ? (h2(x, y, salt + 6) < 0.2 ? 4 : 3) : (h2(x, y, salt + 6) < 0.25 ? 2 : 1);
      put(x, y, c, r, d);
      // a rail is two px thick: its edge and its top beside it, toward the other rail, so between two posts the
      // wood is whole and no grass shows through between the rails (on a post 4 px wide or more)
      const inward = lit ? x + 1 : x - 1;
      if (pw >= 4) put(inward, y, lit ? 2 : 1, r, d);
      put(lit ? x - 1 : x + 1, y, 0, r, d - 0.5);
    }
  };
  for (const [p, q] of railPairs) {
    const endOn = seenEndOn(q.x - p.x, q.f - p.f);
    rails.forEach((r, i) => endOn ? edge(p, q, r, i === rails.length - 1) : bar(p, q, r));
  }

  // the posts: a short post with a cap a px wider each side, lit on top, ink around it
  for (const p of [...posts].sort((a, b) => a.f - b.f)) {
    const xl = p.x - half, xr = xl + pw - 1, capTop = p.f - p.h;
    for (let j = 0; j < p.h; j++) {
      const y = p.f - 1 - j;
      for (let i = 0; i < pw; i++) {
        const x = xl + i, foot = j === 0;
        let c = i === 0 ? 3 : i === pw - 1 ? 1 : 2;
        if (foot) c = 0;
        else if (c === 2 && h2(x, y, salt + 5) < 0.15) c = 1;
        put(x, y, c, j, p.f);
      }
    }
    // the cap: two rows a px out on each side, its top lit, with ink above it and at its ends
    for (let x = xl - 2; x <= xr + 2; x++) {
      const end = x === xl - 2 || x === xr + 2;
      if (!end) put(x, capTop - 1, 0, p.h, p.f);
      put(x, capTop, end ? 0 : x >= xr ? 3 : 4, p.h - 1, p.f);
      put(x, capTop + 1, end ? 0 : x >= xr ? 1 : x <= xl ? 3 : 2, p.h - 2, p.f);
    }
    for (let x = xl - 1; x <= xr + 1; x++) if (x < xl || x > xr) put(x, capTop + 2, 0, p.h - 3, p.f);
    // ink down its sides, where it stands against the ground
    for (let y = capTop + 3; y < p.f; y++) { put(xl - 1, y, 0, p.f - 1 - y, p.f - 0.3); put(xr + 1, y, 0, p.f - 1 - y, p.f - 0.3); }
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
      if (mine.has(x, p.f - 1)) continue;
      layer.set(x, p.f - 1, s(4)); layer.set(x, p.f - 2, s(3));
      if (h2(p.x, p.f, salt + 9) < 0.5) layer.set(x + side, p.f - 1, s(3));
    }
  }
  if (st.id) ctx.masks.set(st.id, mine);
}
