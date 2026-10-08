// The flank of a narrow raised area seen from above (the top of a wall, a
// parapet): the area is the top; the flank is its side face, a few px on the
// side away from the light, in the dark tones of the wall's own material, with
// a joint across it where a stone of the top ends (so the face answers the
// stones above) and its outermost px darker (the foot). The px of the top that
// meets the face is the darkest joint; `rim` lights the px of the top on the
// other side, toward the light. The face never paints over the area's own
// material or the flank's (another wall: the face stops where it meets one).

import { h2, type Mask } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';

export interface FlankOpts {
  side?: 'east' | 'west';
  width?: number;
  material?: string;
  rim?: boolean;
  every?: number;
  ragged?: boolean;
  salt?: number;
}

/**
 * Paints the flank of the area `name` on `mask`. Only what the texture really laid counts as the top (a stone
 * left out at the border leaves grass, and the face follows the stones). `owner` (the stone of each px, from the
 * flagstones) puts a joint across the face where the stone at the edge changes; without it, or between two
 * joints farther than 2·every apart, one every `every` px.
 */
export function paintFlank(ctx: Ctx, layer: Layer, mask: Mask, name: string, opts: FlankOpts, owner?: Int32Array): void {
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
  const blocked = (x: number, y: number) => { const k = ctx.kindAt(x, y); return k === name || k === mat; };

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
    if (out && ox >= 0 && ox < W && !blocked(ox, y) && !mask.has(ox, y)) { layer.set(ox, y, opts.rim ? light : toneAt(0)); ctx.setKind(ox, y, mat); }
  }
}
