// The flank of a narrow raised area seen from above (the top of a wall, a
// parapet): the area is the top; the flank is its side face, a few px on the
// side away from the light, in the dark tones of the wall's own material, with
// a joint across it where a stone of the top ends (so the face answers the
// stones above) and its outermost px darker (the foot). The px of the top that
// meets the face is the darkest joint; `rim` lights the px of the top on the
// other side, toward the light. The face never paints over the area's own
// material or the flank's (another wall: the face stops where it meets one).
//
// `join` makes it one wall with the ashlars it meets at its ends (the walls of
// a compound, seen from above with the east-west runs from the front): the top
// runs on over the cap of the ashlar to where its face starts, the side face
// comes down to there and stops, the face goes on under the corner with its
// end in relief, the end of the ashlar never shows past the top, and the outer
// corner of the top is cut round. Never the vertex of a box.

import { h2, type Mask } from '../mapnoise';
import type { AshlarRec, Ctx, Layer } from '../mappaint';

export interface FlankOpts {
  side?: 'east' | 'west';
  width?: number;
  material?: string;
  rim?: boolean;
  every?: number;
  ragged?: boolean;
  salt?: number;
  join?: string[];
}

/** What a join leaves for the flank: px of an ashlar it paints over (the cap of the wall it meets), px it leaves
 *  alone (the round corner). */
export interface FlankJoin { over: Set<number>; skip: Set<number>; lip: number[] }


/**
 * Joins the top `mask` of a wall (an area with a flank, before its texture) to the ashlars `ids` it meets at its
 * ends: the top grows to the outer edge of each (or is cut there), the ends of the ashlars past it go back to what
 * was under them, their faces are laid again under the corner, and the outer corners are cut round.
 */
export function joinWalls(ctx: Ctx, mask: Mask, ids: string[], opts: FlankOpts): FlankJoin {
  const { W } = ctx;
  const over = new Set<number>(), skip = new Set<number>(), lip: number[] = [];
  const b = mask.bounds();
  if (!b || !ids.length) return { over, skip, lip };
  const [lx0, ly0, lx1, ly1] = b;
  const dx = opts.side === 'west' ? -1 : 1;
  const width = Math.max(1, Math.round(opts.width ?? 3));
  const fx0 = dx > 0 ? lx1 + 1 : lx0 - width, fx1 = dx > 0 ? lx1 + width : lx0 - 1;
  const F0 = Math.min(lx0, fx0), F1 = Math.max(lx1, fx1);
  const recs = ids.map(id => {
    const r = ctx.ashlars.get(id);
    if (!r) throw new Error(`map: flank.join: no ashlar "${id}" painted before this area (have: ${[...ctx.ashlars.keys()].join(', ') || 'none'})`);
    if (r.x1 - 1 < lx0 || r.x0 > lx1) throw new Error(`map: flank.join: the ashlar "${id}" (x ${r.x0}..${r.x1 - 1} px) does not meet this wall (x ${lx0}..${lx1} px)`);
    return r;
  });
  const restore = (end: AshlarRec[], x: number, y: number) => { for (const r of end) r.restore(x, y); };
  const cut = (end: AshlarRec[], x: number, y: number) => { mask.set(x, y, false); restore(end, x, y); };
  const mid = (ly0 + ly1) / 2;
  for (const south of [false, true]) {
    const end = recs.filter(r => (r.y0 + r.y1) / 2 > mid === south);
    if (!end.length) continue;
    // the ashlars of one end go on past the corner (an inner corner, a T) or stop under it (an outer corner)
    const goesWest = end.some(r => r.x0 < F0 - 2), goesEast = end.some(r => r.x1 - 1 > F1 + 2);
    const goesFlank = dx > 0 ? goesEast : goesWest, goesLit = dx > 0 ? goesWest : goesEast;
    const top0 = Math.min(...end.map(r => r.y0)), y1 = Math.max(...end.map(r => r.y1));
    // the cap of the wall that goes on beside the corner (a ragged top stands lower here and there)
    const litOut = dx > 0 ? F0 - 1 : F1 + 1, flankOut = dx > 0 ? F1 + 1 : F0 - 1;
    const beside = end.some(r => litOut >= r.x0 && litOut < r.x1) ? litOut : end.some(r => flankOut >= r.x0 && flankOut < r.x1) ? flankOut : null;
    const capAt = beside === null ? top0 : Math.min(...end.filter(r => beside >= r.x0 && beside < r.x1).map(r => r.top(beside)));
    const y0 = south ? top0 : Math.max(top0, Math.min(top0 + 2, capAt));
    // the end of an ashlar past the corner where the wall does not go on: back to what was under it
    for (const r of end) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      if ((x < F0 && !goesWest) || (x > F1 && !goesEast)) r.restore(x, y);
    }
    if (south) {
      // the top runs on over the cap to where the face starts (its lip in line with the cap of the wall that goes
      // on beside it); the side face comes down to there
      const fy = Math.max(top0 + 1, Math.min(top0 + 3, capAt + 1));
      for (let x = lx0; x <= lx1; x++) {
        for (let y = ly1 + 1; y < fy; y++) mask.set(x, y);
        for (let y = fy; y <= ly1; y++) mask.set(x, y, false);
        // its last row is the lit lip of the wall over the face, like the cap of the ashlar beside it
        lip.push((fy - 1) * W + x);
      }
      for (let x = fx0; x <= fx1; x++) for (let y = Math.min(y0, ly1 + 1); y < fy; y++) {
        if (goesFlank) over.add(y * W + x);
        else restore(end, x, y);
      }
      // the face goes on under the corner, its end in relief where the wall turns
      for (const r of end) {
        const a = Math.max(F0, r.x0), z = Math.min(F1, r.x1 - 1);
        for (let x = a; x <= z; x++) {
          const tag = x === a && !goesWest ? (dx > 0 ? 'lit' : 'dark') : x === z && !goesEast ? (dx > 0 ? 'dark' : 'lit') : undefined;
          for (let y = fy; y < r.y1; y++) r.paint(x, y, fy - 1, tag);
        }
      }
    } else {
      // the top starts at the outer edge of the wall it comes out of, flush with its cap beside the corner
      for (let x = lx0; x <= lx1; x++) {
        for (let y = y0; y < ly0; y++) mask.set(x, y);
        for (let y = ly0; y < y0; y++) mask.set(x, y, false);
        for (let y = top0; y < y0; y++) restore(end, x, y);
      }
      if (!goesFlank) for (let x = fx0; x <= fx1; x++) for (let y = top0; y < y1; y++) restore(end, x, y);
      // round corners: 2 px off the outer one (where the wall it comes out of does not go on), 1 px off the other
      const litX = dx > 0 ? lx0 : lx1, flankX = dx > 0 ? lx1 : lx0, outX = dx > 0 ? fx1 : fx0;
      if (!goesLit) { cut(end, litX, y0); cut(end, litX + dx, y0); cut(end, litX, y0 + 1); for (const [x, y] of [[litX, y0], [litX + dx, y0], [litX, y0 + 1]]) skip.add(y * W + x); }
      else cut(end, litX, y0);
      if (!goesFlank) for (const [x, y] of [[outX, y0], [outX - dx, y0], [outX, y0 + 1]]) skip.add(y * W + x);
      else cut(end, flankX, y0);
    }
  }
  return { over, skip, lip };
}

/**
 * Paints the flank of the area `name` on `mask`. Only what the texture really laid counts as the top (a stone
 * left out at the border leaves grass, and the face follows the stones). `owner` (the stone of each px, from the
 * flagstones) puts a joint across the face where the stone at the edge changes; without it, or between two
 * joints farther than 2·every apart, one every `every` px.
 */
export function paintFlank(ctx: Ctx, layer: Layer, mask: Mask, name: string, opts: FlankOpts, owner?: Int32Array, join?: FlankJoin): void {
  const { W, H } = ctx;
  const dx = opts.side === 'west' ? -1 : 1;
  const width = Math.max(1, Math.round(opts.width ?? 3));
  const mat = opts.material ?? name;
  const ramp = ctx.mat(mat).ramp, n = ramp.length;
  const every = Math.max(3, Math.round(opts.every ?? 5));
  const top = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask.has(x, y) && ctx.kindAt(x, y) === name;
  // the face tones from the lip (just under the top) to the foot: the dark half of the ramp, down to its darkest
  // (the face is in shadow: its lip must not match the stones of the top, or it reads as more top)
  const lip = Math.max(0, Math.ceil(n / 2) - 1);
  const toneAt = (k: number) => ramp[Math.max(0, Math.round(lip * (1 - k / Math.max(1, width - 1))))];
  const darker = (c: string) => ramp[Math.max(0, ramp.indexOf(c) - 1)];
  const over = join?.over, skip = join?.skip;
  const blocked = (x: number, y: number) => {
    if (over?.has(y * W + x)) return false;
    const k = ctx.kindAt(x, y);
    return k === name || k === mat;
  };

  // the edge px of the top in each row (the last px of a run toward the flank), and the stone it belongs to
  const edges: { x: number; y: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (top(x, y) && !top(x + dx, y)) edges.push({ x, y });
  const stoneAt = (x: number, y: number) => (owner ? owner[y * W + x] : -1);
  // a joint row: the stone at the edge (two px in, past the joint of the top) is not the one below
  const jointRows = new Set<number>();
  if (owner) {
    for (const { x, y } of edges) {
      const a = stoneAt(x - dx, y), b = top(x, y + 1) ? stoneAt(x - dx, y + 1) : a;
      if (a >= 0 && b >= 0 && a !== b) jointRows.add(y);
    }
  }
  const rowsOf = [...new Set(edges.map(e => e.y))].sort((a, b) => a - b);
  // fill the long stretches with no joint, and drop joints closer than 3 px
  let last = -1e9;
  for (const y of rowsOf) {
    if (jointRows.has(y)) { if (y - last < 3) jointRows.delete(y); else last = y; }
    else if (y - last >= 2 * every || (!owner && y - last >= every)) { jointRows.add(y); last = y; }
  }

  // ragged (default): each stone of the face is `width` or one px less, and on the lit side each stone of the top
  // stands out 1 px or not, never three stones running the same: an old stone wall, not a ruled band
  const ragged = opts.ragged !== false;
  const salt = opts.salt ?? 0;
  const pick = (() => {
    const memo = new Map<string, boolean>();
    return (side: number, seg: number): boolean => {
      const key = `${side}:${seg}`, got = memo.get(key);
      if (got !== undefined) return got;
      const a = seg > 1 ? pick(side, seg - 1) : null, b = seg > 1 ? pick(side, seg - 2) : null;
      const v = a !== null && a === b ? !a : h2(seg, side * 7 + 3, salt + 917) < 0.5;
      memo.set(key, v);
      return v;
    };
  })();
  // the segment of each edge row: it changes after each joint row (the walls of one area count apart, by x)
  let seg = 0, prevY = -2;
  const segOf = new Map<number, number>();
  for (const { x, y } of [...edges].sort((p, q) => p.y - q.y || p.x - q.x)) {
    if (y !== prevY && y > prevY + 1) seg++;
    segOf.set(y * W + x, seg);
    if (jointRows.has(y)) seg++;
    prevY = y;
  }
  for (const { x, y } of edges) {
    const w = ragged && width > 1 && pick(0, segOf.get(y * W + x)!) ? width - 1 : width;
    // the face, from the lip out to the foot
    for (let k = 0; k < w; k++) {
      const fx = x + dx * (k + 1);
      if (fx < 0 || fx >= W || blocked(fx, y)) break;
      if (skip?.has(y * W + fx)) continue;
      let c = k === w - 1 && w > 1 ? ramp[0] : toneAt(Math.min(k, width - 2));
      if (jointRows.has(y) && k < w - 1) c = darker(c);
      layer.set(fx, y, c);
      ctx.setKind(fx, y, mat);
    }
    // the joint between top and face: the darkest of the wall
    layer.set(x, y, ramp[0]);
  }
  // the lit side: the rim (1 px of the lightest tone), cut at each joint of the top; a stone that stands out
  // gets 1 px more of it, outside
  const lit: { x: number; y: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (top(x, y) && !top(x - dx, y) && top(x + dx, y)) lit.push({ x, y });
  const litJoint = new Set<number>();
  let lastJ = -1e9;
  for (const { x, y } of lit) {
    const a = stoneAt(x, y), b = top(x, y + 1) ? stoneAt(x, y + 1) : a;
    const j = owner ? a >= 0 && b >= 0 && a !== b : y - lastJ >= every;
    if (j && y - lastJ >= 3) { litJoint.add(y * W + x); lastJ = y; }
  }
  const light = ramp[n - 1];
  let lseg = 0, lprev = -2;
  for (const { x, y } of lit) {
    if (y > lprev + 1) lseg++;
    lprev = y;
    const joint = litJoint.has(y * W + x);
    const out = ragged && pick(1, lseg);
    if (joint) { lseg++; continue; }
    if (opts.rim) layer.set(x, y, light);
    const ox = x - dx;
    if (out && ox >= 0 && ox < W && !blocked(ox, y) && !mask.has(ox, y) && !skip?.has(y * W + ox)) { layer.set(ox, y, opts.rim ? light : toneAt(0)); ctx.setKind(ox, y, mat); }
  }
  // the lip of a top that runs over the cap of a wall it joins: lit, cut where two stones of the top meet
  for (const i of join?.lip ?? []) {
    const x = i % W, y = (i - x) / W;
    if (!top(x, y) || !top(x + dx, y)) continue;
    const a = stoneAt(x, y), r = top(x + 1, y) ? stoneAt(x + 1, y) : a;
    if (owner && a !== r) continue;
    layer.set(x, y, light);
  }
}
