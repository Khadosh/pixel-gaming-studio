// A wall seen from above as one object: the parapet step. A path of runs (east-
// west or north-south) is the middle line of the wall; its top is one band of
// the same width in every run, in rubble (rounded stones packed with dark
// joints), so a corner is the same stones turning and never two drawings
// meeting. The runs that go east-west show their face under the top (the wall
// faces south: in a compound, the north wall toward the inside and the south
// wall toward the outside), in the same rubble one step darker and darker to
// its foot; the north-south runs show only their top and a fine shadow on the
// side away from the light. The lit edge of the top is toward the light and
// north, the dark joint on the other side; the stones round the edges (a joint
// that reaches the edge bites it), the outer corners are cut, the faces end in
// a corner stone in relief. Gaps open the wall and each side of a gap (and each
// end of an open path) ends in a pillar: wider, higher, its own capstone with
// light and shadow, its face in quoins. Grass eats the foot of the faces and
// the edges of the north-south runs; moss hangs from the top and creeps into
// some joints. Two parapets meet without a seam: the second one never paints
// over the top of the first, and the two tops count as one for their edges.

import { Mask, h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { ParapetStep } from './parapetschema';

/**
 * Rubble: rounded stones of different sizes packed in a staggered grid (a power diagram: each stone grows by its
 * own weight), one px of joint between two stones and a pocket of joint where three meet, so the stones read round
 * and never laid in courses. Returns the id of the stone at a px (≥ 0) or -1 for a joint. `squash` > 1 makes the
 * stones wider than tall (a face). Deterministic by `salt`, the same for every px of the picture: two bands painted
 * with the same field are the same stones where they meet.
 */
export function rubbleField(salt: number, size: [number, number] = [3, 6], squash = 1): (x: number, y: number) => number {
  const [lo, hi] = size;
  const sp = (lo + hi) / 2 + 1, spx = sp * squash;
  const cache = new Map<number, number>();
  return (x, y) => {
    const key = (y + 4096) * 16384 + (x + 4096);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const j0 = Math.floor(y / sp);
    let d1 = Infinity, d2 = Infinity, k1 = -1, w1 = 0;
    for (let j = j0 - 2; j <= j0 + 2; j++) {
      const odd = ((j % 2) + 2) % 2;
      const i0 = Math.floor(x / spx - odd * 0.5);
      for (let i = i0 - 2; i <= i0 + 2; i++) {
        const sx = (i + odd * 0.5 + 0.2 + 0.6 * h2(i, j, salt)) * spx;
        const sy = (j + 0.2 + 0.6 * h2(i, j, salt + 1)) * sp;
        const w = h2(i, j, salt + 2) * (hi - lo) * 0.5;
        const d = Math.hypot((x + 0.5 - sx) / squash, y + 0.5 - sy) - w;
        if (d < d1) { d2 = d1; d1 = d; k1 = (i + 2048) * 4099 + (j + 2048); w1 = w; }
        else if (d < d2) d2 = d;
      }
    }
    // the joint between two stones, and the pocket where a stone's round ends before the next one
    const out = d2 - d1 < 1.05 || d1 + w1 > sp * 0.5 + w1 * 1.1 + 0.35 ? -1 : k1;
    cache.set(key, out);
    return out;
  };
}

/**
 * The ramp index of a px of rubble: the joint, or the stone's own tone (one of `bodies`, by stone) with its edge
 * toward the light lit and the other in shadow (`lit` and `dark` map a body to its edge tones).
 */
export function rubbleTone(field: (x: number, y: number) => number, x: number, y: number, lx: number, salt: number,
  joint: number, bodies: number[], lit: (b: number) => number, dark: (b: number) => number): number {
  const k = field(x, y);
  if (k < 0) return joint;
  const b = bodies[Math.floor(h2(k, 3, salt) * bodies.length)];
  const l = field(x + lx, y) !== k || field(x, y - 1) !== k;
  const d = field(x - lx, y) !== k || field(x, y + 1) !== k;
  if (d && !l) return dark(b);
  if (l && !d) return lit(b);
  return b;
}

type Box = [number, number, number, number]; // x0, y0, x1, y1 inclusive

/** What every parapet painted so far laid, its tops and its faces: a later one meets an earlier one without a seam
 *  (it never paints over them, and they count as wall for its edges). */
const laid = new WeakMap<Ctx, Mask>();

export function runParapet(ctx: Ctx, st: ParapetStep): void {
  const { W, H, cell } = ctx, g = ctx.ground, name = st.material;
  const t = (i: number) => ctx.tone(name, i);
  const salt = st.salt ?? 1401;
  const lx = st.light === 'northeast' ? 1 : -1; // the side of the light, in x
  const topPx = Math.max(2, Math.round(st.top * cell)), half = Math.floor(topPx / 2);
  const facePx = Math.round(st.face * cell);
  const bulge = st.pillar?.bulge ?? 2, rise = st.pillar?.rise ?? 3;
  const plen = st.pillar?.length ?? topPx + 2 * bulge;
  const size = st.stones ?? [3, 6];
  const P = (p: [number, number]): [number, number] => [Math.round(ctx.ox + p[0] * cell), Math.round(ctx.oy + p[1] * cell)];
  const where = `map: parapet${st.id ? ` "${st.id}"` : ''}`;

  // ---- the runs, their bands and the gaps
  const pts = st.path.map(P);
  const runs: { a: [number, number]; b: [number, number]; across: boolean }[] = [];
  const n = st.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (a[0] !== b[0] && a[1] !== b[1]) throw new Error(`${where}: the run ${i} (${st.path[i]} → ${st.path[(i + 1) % pts.length]}) is neither east-west nor north-south`);
    if (a[0] === b[0] && a[1] === b[1]) continue;
    runs.push({ a, b, across: a[1] === b[1] });
  }
  const bandOf = (r: typeof runs[number]): Box => r.across
    ? [Math.min(r.a[0], r.b[0]) - half, r.a[1] - half, Math.max(r.a[0], r.b[0]) - half + topPx - 1, r.a[1] - half + topPx - 1]
    : [r.a[0] - half, Math.min(r.a[1], r.b[1]) - half, r.a[0] - half + topPx - 1, Math.max(r.a[1], r.b[1]) - half + topPx - 1];

  const shared = laid.get(ctx) ?? new Mask(W, H);
  laid.set(ctx, shared);
  const raw = new Mask(W, H);
  for (const r of runs) {
    const [x0, y0, x1, y1] = bandOf(r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) raw.set(x, y);
  }

  // gaps: the wall is open between the two points; each side gets a pillar
  const pillars: { box: Box; run: typeof runs[number]; south: boolean }[] = [];
  const gapCut = new Mask(W, H);
  // a pillar runs `plen` px from `at` away from the opening (away < 0: toward lower x / y); the side of the opening
  // is free, so a pillar whose opening is south of it (a north-south run) shows its face, the other only its rise
  const pillarAt = (r: typeof runs[number], at: number, away: number) => {
    const [x0, y0, x1, y1] = bandOf(r);
    const pa = away < 0 ? at - plen : at, pb = pa + plen - 1;
    if (r.across) pillars.push({ box: [pa, y0 - bulge, pb, y1 + bulge], run: r, south: true });
    else pillars.push({ box: [x0 - bulge, pa, x1 + bulge, pb], run: r, south: away < 0 });
  };
  for (const [ga, gb] of st.gaps ?? []) {
    const a = P(ga), b = P(gb);
    const r = runs.find(q => q.across
      ? a[1] === q.a[1] && b[1] === q.a[1] && Math.min(a[0], b[0]) >= Math.min(q.a[0], q.b[0]) && Math.max(a[0], b[0]) <= Math.max(q.a[0], q.b[0])
      : a[0] === q.a[0] && b[0] === q.a[0] && Math.min(a[1], b[1]) >= Math.min(q.a[1], q.b[1]) && Math.max(a[1], b[1]) <= Math.max(q.a[1], q.b[1]));
    if (!r) throw new Error(`${where}: the gap ${JSON.stringify([ga, gb])} is not on one run of the path`);
    const [lo, hi] = r.across ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const [x0, y0, x1, y1] = bandOf(r);
    const m = bulge + rise + 2;
    if (r.across) { for (let y = y0 - m; y <= y1 + facePx + m; y++) for (let x = lo; x < hi; x++) gapCut.set(x, y); }
    else { for (let y = lo; y < hi; y++) for (let x = x0 - m; x <= x1 + m; x++) gapCut.set(x, y); }
    pillarAt(r, lo, -1);
    pillarAt(r, hi, 1);
  }
  if (!st.closed && (st.ends ?? 'pillar') === 'pillar' && runs.length) {
    const first = runs[0], last = runs[runs.length - 1];
    const endAt = (r: typeof runs[number], p: [number, number], other: [number, number]) => {
      const i = r.across ? 0 : 1, dir = Math.sign(p[i] - other[i]);
      // the band runs half the top past the vertex: the pillar covers that end
      const tip = dir > 0 ? p[i] - half + topPx : p[i] - half;
      pillarAt(r, tip, dir > 0 ? -1 : 1);
    };
    endAt(first, first.a, first.b);
    endAt(last, last.b, last.a);
  }
  for (let i = 0; i < raw.data.length; i++) if (gapCut.data[i]) raw.data[i] = 0;

  // what counts as wall for the edges: this top and every parapet top before it
  const solidRaw = (x: number, y: number) => raw.has(x, y) || shared.has(x, y);
  // the outer corners cut round: 2 px where the top turns, never the vertex of a box
  const top = raw.clone();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!raw.has(x, y) || shared.has(x, y)) continue;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      if (solidRaw(x + dx, y) || solidRaw(x, y + dy) || solidRaw(x + dx, y + dy)) continue;
      top.set(x, y, false); top.set(x - dx, y, false); top.set(x, y - dy, false);
    }
  }
  for (let i = 0; i < top.data.length; i++) if (shared.data[i]) top.data[i] = 0;

  // ---- the face under the east-west runs
  const face = new Mask(W, H);
  for (const r of runs) {
    if (!r.across || facePx <= 0) continue;
    const [x0, , x1, y1] = bandOf(r);
    for (let x = x0; x <= x1; x++) for (let y = y1 + 1; y <= y1 + facePx; y++) {
      if (gapCut.has(x, y) || raw.has(x, y) || shared.has(x, y)) continue;
      face.set(x, y);
    }
  }
  // each column of a face from its top to its foot (a column can cross two faces: the north and the south runs)
  const segs: [number, number, number][] = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (!face.has(x, y) || face.has(x, y - 1)) continue;
    let b = y;
    while (face.has(x, b + 1)) b++;
    segs.push([x, y, b]);
  }
  const solid = (x: number, y: number) => top.has(x, y) || shared.has(x, y);
  // the stones bite the edges: where a joint reaches the edge of the top on the north and on the side of the light
  // (and the south where no face hangs) the edge goes in there, so the edge is stone after stone and never a ruled
  // line; the side away from the light is ragged by its sliver instead, so every run loses the same
  const field = rubbleField(salt, size, 1);
  const edgeOut = (x: number, y: number) => !solid(x, y) && !face.has(x, y);
  const bite: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!top.has(x, y)) continue;
    if (!edgeOut(x + lx, y) && !edgeOut(x, y - 1) && !edgeOut(x, y + 1)) continue;
    if (field(x, y) < 0) bite.push([x, y]);
  }
  for (const [x, y] of bite) top.set(x, y, false);

  // ---- paint: the shadow beside the runs, away from the light (on the ground, or on a face it falls on)
  const sx = -lx, shadowW = st.shadow ?? 1;
  const shaded = new Set<number>();
  const darkerFace = new Set<number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // (not into a bite of the edge nor a cut corner: those are still inside the band)
    if (!top.has(x, y) || solid(x + sx, y) || raw.has(x + sx, y) || face.has(x, y + 1) && !face.has(x + sx, y)) continue;
    // first the side of the wall (its sliver in shadow), 1 or 2 px by turns in stretches of 4 to 9 px (never a ruled
    // line), then its shadow on the ground, up to `shadow` px by stretches
    const sliver = 1 + (Math.floor(y / 6.5 + 0.35 * n1(y / 5.0, salt + 5 + x)) & 1);
    const w = sliver + (shadowW <= 0 ? 0 : shadowW - (h2(Math.floor(y / 5), x, salt + 13) < 0.45 ? 1 : 0));
    for (let i = 1; i <= w; i++) {
      const X = x + sx * i;
      if (solid(X, y)) break;
      if (face.has(X, y)) { darkerFace.add(y * W + X); continue; }
      if (X < 0 || X >= W || shaded.has(y * W + X)) continue;
      shaded.add(y * W + X);
      if (i <= sliver) { g.set(X, y, t(2)); ctx.setKind(X, y, name); }
      else g.set(X, y, ctx.shade(g.get(X, y), ctx.kindAt(X, y)));
    }
  }

  // ---- the face: a dark line under the top, rubble one step darker than the top, darker to its foot; its ends
  // in relief (a corner stone lit toward the light, in shadow on the other side), dark where it meets a top
  const ffield = rubbleField(salt + 7, [size[0] + 1, size[1] + 2], 1.35);
  const freeSide = (x: number, y: number) => !face.has(x, y) && !solid(x, y);
  for (const [x, fy0, fy1] of segs) for (let y = fy0; y <= fy1; y++) {
    const r = y - fy0, F = fy1 - fy0 + 1;
    let c: number;
    // how far to a free end of the face (a corner stone) and to a top it meets
    let endD = 99, endSide = 0, topD = 99;
    for (let d = 1; d <= 4; d++) {
      if (endD === 99 && freeSide(x - d, y)) { endD = d - 1; endSide = -1; }
      if (endD === 99 && freeSide(x + d, y)) { endD = d - 1; endSide = 1; }
      if (topD === 99 && (solid(x - d, y) || solid(x + d, y))) topD = d - 1;
    }
    if (r === 0) c = 2;
    else if (endD <= 2) {
      // the corner stone: quoins four rows tall, their inner joint at three px from the end
      const q = Math.floor((r - 1 + (endSide > 0 ? 2 : 0)) / 4), qr = (r - 1 + (endSide > 0 ? 2 : 0)) % 4;
      const lit = endSide === lx;
      if (qr === 3 && endD > 0) c = 2;
      else if (endD === 0) c = lit ? 5 : 2;
      else c = q % 2 ? 4 : 3;
      if (endD === 2 && q % 2 === 0) c = 2;
    } else if (topD === 0) c = 2;
    else {
      c = rubbleTone(ffield, x, y, lx, salt + 8, 2, [4, 4, 4, 3], b => b + 1, b => b - 1);
      if (r >= F * 0.7 && c > 2) c -= 1;
    }
    if (r > 0 && r === F - 1) c = 2;
    if (darkerFace.has(y * W + x) && c > 2) c -= 1;
    g.set(x, y, t(c));
    ctx.setKind(x, y, name);
  }

  // ---- the top: rubble one step lighter, its lit edge toward the light and north, the dark joint on the other
  // side; moss in some joints
  const [mossDark, mossLit] = st.moss?.colors ? [st.moss.colors[1], st.moss.colors[0]] : (ctx.mat(name).moss ?? ['hoja sombra', 'hoja']);
  const jointMoss = st.moss ? (st.moss.joints ?? 0.12) : 0;
  const outside = (x: number, y: number) => !solid(x, y) && !face.has(x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!top.has(x, y)) continue;
    const k = field(x, y);
    let c = rubbleTone(field, x, y, lx, salt, 3, [6, 6, 5, 6, 4], b => (b >= 5 ? 7 : 6), b => (b >= 5 ? 4 : 3));
    const litEdge = outside(x + lx, y) || outside(x, y - 1);
    const darkEdge = outside(x - lx, y) || outside(x, y + 1);
    if (darkEdge) c = 3;
    else if (litEdge) c = k < 0 ? 4 : 7;
    let col = t(c);
    if (k < 0 && !darkEdge && jointMoss && h2(x, y, salt + 17) < jointMoss) col = h2(x, y, salt + 18) < 0.3 ? mossLit : mossDark;
    g.set(x, y, col);
    ctx.setKind(x, y, name);
  }

  // ---- the pillars: a capstone higher than the wall, its face in quoins down to the foot
  const cfield = rubbleField(salt + 3, [size[0] + 2, size[1] + 3], 1);
  const pillarSegs: [number, number, number][] = [];
  for (const p of pillars) {
    const [x0, y0, x1, y1] = p.box;
    const cy0 = y0 - rise, cy1 = y1 - rise;
    const bottom = p.south ? y1 + facePx : y1;
    // face: under the cap
    for (let x = x0; x <= x1; x++) {
      for (let y = cy1 + 1; y <= bottom; y++) {
        const r = y - cy1 - 1, F = bottom - cy1;
        const q = Math.floor((r - 1) / 4), qr = (r - 1) % 4;
        const split = x0 + (q % 2 ? Math.floor((x1 - x0) / 3) : Math.floor(2 * (x1 - x0) / 3));
        let c: number;
        if (r === 0) c = 2;
        else if ((lx < 0 ? x === x0 : x === x1)) c = 5;
        else if ((lx < 0 ? x === x1 : x === x0)) c = 2;
        else if (qr === 3 || x === split) c = 2;
        else c = r >= F * 0.62 ? 3 : 4;
        if (r > 0 && r === F - 1) c = 2;
        // the bottom corners round into the grass
        if (y === bottom && (x === x0 || x === x1)) continue;
        g.set(x, y, t(c));
        ctx.setKind(x, y, name);
        face.set(x, y);
      }
      pillarSegs.push([x, cy1 + 1, bottom]);
    }
    // the cap: one stone, its corners cut, lit toward the light and on top, in shadow on the other sides
    for (let y = cy0; y <= cy1; y++) for (let x = x0; x <= x1; x++) {
      const ex = x === x0 || x === x1, ey = y === cy0 || y === cy1;
      if (ex && ey) continue;
      const litSide = lx < 0 ? x === x0 || (x === x0 + 1 && ey) : x === x1 || (x === x1 - 1 && ey);
      const darkSide = lx < 0 ? x === x1 : x === x0;
      // the same stones as the top of the wall, bigger, framed: lit on top and toward the light, in shadow below
      const k = cfield(x, y);
      let c = rubbleTone(cfield, x, y, lx, salt + 19, 4, [6, 6, 5], b => (b >= 5 ? 7 : 6), () => 4);
      if (y === cy1 || darkSide) c = 3;
      else if (y === cy1 - 1) c = k < 0 ? 3 : 4;
      else if (y === cy0 || litSide) c = k < 0 ? 5 : 7;
      g.set(x, y, t(c));
      ctx.setKind(x, y, name);
      top.set(x, y);
    }
  }

  // ---- grass at the foot of every face (a wavy edge rising over it), tufts eating the edges of the runs
  if (st.sink) {
    const sea = st.sink.material, s = (i: number) => ctx.tone(sea, i), salt2 = st.sink.salt ?? 1403, rough = st.sink.rough ?? 2;
    // the wall faces, and the pillars where they come lower
    const feet = [...segs.filter(([x, , b]) => !pillarSegs.some(([px, , pb]) => px === x && pb >= b - 1 && pb <= b + bulge + 1)), ...pillarSegs];
    const on = st.sink.on ? new Set(st.sink.on) : null;
    for (const [x, ft, fy] of feet) {
      // on a paved floor no grass: only the dark line of the foot on it
      if (on && !on.has(ctx.kindAt(x, fy + 1))) { g.set(x, fy + 1, ctx.shade(g.get(x, fy + 1), ctx.kindAt(x, fy + 1))); continue; }
      const up = fy - 2 + Math.trunc(2.5 * (1 + n1(x / 7.0, salt2))) - Math.trunc(h2(Math.floor(x / 2), 0, salt2 + 1) * (rough + 1));
      for (let y = Math.max(up, ft + 2); y <= fy + 2; y++) {
        if (solid(x, y) && !face.has(x, y)) continue;
        g.set(x, y, y === up ? s(3) : y < up + 3 ? s(4) : s(3));
        ctx.setKind(x, y, sea);
      }
    }
    const odds = st.sink.tufts ?? 0.3;
    for (const r of runs) {
      if (r.across || !odds) continue;
      const [x0, y0, x1, y1] = bandOf(r);
      for (let y = y0 + 3; y <= y1 - 3; y += 3) {
        for (const [edge, out] of [[x0, -1], [x1, 1]] as const) {
          if (h2(y, edge, salt + 23) >= odds) continue;
          // the outermost px of the top at this row, and the tuft over it
          let e = edge;
          while (!top.has(e, y) && Math.abs(e - edge) < 3) e -= out;
          if (!top.has(e, y) || shared.has(e, y) && !raw.has(e, y)) continue;
          const tall = 1 + Math.trunc(h2(y, edge, salt + 24) * 3);
          for (let k = 0; k < tall; k++) {
            if (!top.has(e, y - k)) continue;
            g.set(e, y - k, k === tall - 1 ? s(4) : s(3));
          }
          if (h2(y, edge, salt + 25) < 0.5 && top.has(e - out, y)) g.set(e - out, y, s(4));
        }
      }
    }
  }

  // ---- moss hanging from the top down the faces
  if (st.moss) {
    const [sk0, sk1] = st.moss.skip ? [ctx.ox + st.moss.skip[0] * cell, ctx.ox + st.moss.skip[1] * cell] : [Infinity, -Infinity];
    const cols = segs.filter(([x]) => !(x >= sk0 && x <= sk1) && !pillarSegs.some(([px]) => Math.abs(px - x) <= 1));
    const count = st.moss.count ?? Math.round(cols.length / 12), ms = st.moss.salt ?? salt + 17;
    for (let k = 0; k < count && cols.length; k++) {
      const [x, y0] = cols[Math.trunc(h2(k, 1, ms) * cols.length)];
      const len = 1 + Math.trunc(h2(k, 2, ms) * 4);
      for (let j = 0; j < len; j++) {
        if (!face.has(x, y0 + j)) break;
        g.set(x, y0 + j, j === 0 ? mossLit : mossDark);
        if (j < 2 && face.has(x + 1, y0 + j)) g.set(x + 1, y0 + j, mossDark);
      }
    }
  }

  for (let i = 0; i < top.data.length; i++) if (top.data[i] || face.data[i]) shared.data[i] = 1;
  if (st.id) ctx.masks.set(st.id, top);
}
