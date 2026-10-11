// A thatched roof (`roof.thatch`): the shape is the one the roof step already
// laid (its eaves, its flare, its hips, its single slope); this repaints every
// px of it as straw. Bundles laid in courses parallel to the eaves, the straw
// combed down the slope (one-px strands, each a tone off now and then), the
// lower edge of every course hanging ragged over the one under it with a dark
// frayed shadow beneath, a thick edge of cut ends along the eaves, the ends of
// a gable rounded over (the courses bend down within a few px of the side), a
// ridge bound in a roll with ties, and the light of the recipe: a face toward
// the sun one tone up, a face away from it one tone down, read off the way each
// px of the roof faces (a rounded end turns from one to the other).

import { h2, type Mask, type Pt } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';

export interface ThatchOpts {
  /** px of a course down the slope (default 5) */
  course?: number;
  /** px the lower edge of a course hangs ragged over the next one, at most (default 2) */
  fray?: number;
  /** px between two ties of the ridge roll (default 10; 0 none) */
  ties?: number;
}

/** Which edges of the roof are eaves (the straw runs down to them), and how steep each one turns: 1 a whole slope
 *  (the front of an east-west ridge, the side of a north-south one), more a rounded end ROUND px wide (its courses k
 *  times as tight), absent none. */
export type EaveSides = Partial<Record<'S' | 'W' | 'E' | 'N', number>>;

/** px a rounded end of the roof (the verge of a gable, the ends of a shed) turns over in */
const ROUND = 4;

const DIRS: Record<'S' | 'W' | 'E' | 'N', Pt> = { S: [0, 1], W: [-1, 0], E: [1, 0], N: [0, -1] };

/**
 * Repaints the px of `mask` that are not the ridge as thatch, and the ridge (`ridge(x, y)` gives its row or column
 * index across the roll, 0 at its top or west edge, and its width; null outside) as a bound roll. `ramp` is the
 * roof's: [ink, deep, shadow, body, light, lit, (glint)].
 */
export function thatchOver(ctx: Ctx, layer: Layer, mask: Mask, ramp: string[], name: string, sides: EaveSides,
  ridge: (x: number, y: number) => [number, number] | null, ridgeAlong: 'h' | 'v', light: Pt, o: ThatchOpts, salt: number): void {
  const { W, H } = ctx, n = ramp.length;
  const C = Math.max(3, o.course ?? 5), F = Math.max(0, o.fray ?? 2), T = o.ties ?? 10;
  const tone = (i: number) => ramp[Math.max(1, Math.min(n - 1, i))];
  const put = (x: number, y: number, i: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    layer.set(x, y, tone(i)); ctx.setKind(x, y, name); mask.set(x, y);
  };
  /** one tone toward the light, one away from it, by the way a surface faces (unit, on the ground) */
  const lit = ([nx, ny]: Pt) => { const d = nx * light[0] + ny * light[1]; return d >= 0.3 ? 1 : d <= -0.3 ? -1 : 0; };
  const run = (x: number, y: number, dx: number, dy: number) => {
    let k = 0;
    while (mask.has(x + dx * (k + 1), y + dy * (k + 1))) k++;
    return k;
  };
  const px: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask.has(x, y)) px.push([x, y]);
  const tips: [number, number, number][] = [];
  for (const [x, y] of px) {
    const r = ridge(x, y);
    if (r) {
      // the ridge: a roll of straw bound with ties, lit on its top (or its side toward the light), its foot dark
      const [i, w] = r;
      const along = ridgeAlong === 'h' ? x : y;
      const s = ridgeAlong === 'h' ? 0 : lit(i === 0 ? DIRS.W : i === w - 1 ? DIRS.E : [0, 0]);
      let c = i === w - 1 ? 1 : ridgeAlong === 'h' ? (i === 0 ? 4 : i === w - 2 ? 2 : 3) : 3 + s;
      const tie = T > 0 ? ((along + (salt % T)) % T + T) % T : -1;
      if (i < w - 1 && tie === 0) c = 1;                  // a tie of rope round the roll
      else if (i < w - 1 && tie === 1) c = Math.min(c, 2); // the straw pinched under it
      put(x, y, c);
      continue;
    }
    // how far down to the eaves, the least over every edge that is an eave (a rounded end counts its px k times)
    const d: [keyof typeof DIRS, number][] = [];
    for (const [side, k] of Object.entries(sides) as [keyof typeof DIRS, number][]) {
      const [dx, dy] = DIRS[side], r = run(x, y, dx, dy);
      // a rounded end only reaches ROUND px in: past them the slope it closes is what counts
      if (k === 1 || r < ROUND) d.push([side, k * r]);
    }
    if (!d.length) continue;
    const dm = Math.min(...d.map(e => e[1]));
    // the way this px faces: the eave it runs down to, blended where two meet (a rounded corner turns, never kinks)
    let nx = 0, ny = 0;
    for (const [side, v] of d) { const w = Math.max(0, 1 - (v - dm) / 3); nx += DIRS[side][0] * w; ny += DIRS[side][1] * w; }
    const nn = Math.hypot(nx, ny) || 1;
    const face: Pt = [nx / nn, ny / nn];
    // the body of the face: the body tone square to the light, one up toward it, one down away from it; the front
    // (the slope that looks at the viewer) is the body of the roof and only ever lights up, as the tiles do
    const sh = lit(face);
    const b = 3 + (face[1] > 0.7 ? Math.max(0, sh) : sh);
    // the strands run down the slope: across it is x on a front, y on a side
    const side = Math.abs(face[0]) > Math.abs(face[1]);
    const a = side ? y : x;
    // a slope that falls east or west is seen across, not foreshortened like the front: its courses wider
    const Cf = side ? Math.round(C * 1.4) : C;
    // a course is a row of bundles BW px across, each one at its own phase per course: the lower edge of a bundle
    // hangs 0 … fray px over the course under it, so the edge steps a bundle at a time (ragged, never speckled)
    const BW = side ? 1 : 3;   // (across a side slope every row of straw hangs on its own: a fringe, not a seam)
    const bundle = (k: number) => Math.floor((a + Math.floor(h2(k, 0, salt + 4) * BW)) / BW);
    const hang = (k: number) => (k <= 0 ? 0 : Math.floor(h2(bundle(k), k, salt + 5) * (F + 1)));
    const edge = (k: number) => k * Cf - hang(k);
    let k = Math.floor(dm / Cf) + 1;
    while (k > 0 && dm < edge(k)) k--;
    while (dm >= edge(k + 1)) k++;
    const fromTop = edge(k + 1) - 1 - dm, fromBot = dm - edge(k);
    const id = bundle(k), j = ((a + Math.floor(h2(k, 0, salt + 4) * BW)) % BW + BW) % BW;
    const v = h2(id, k, salt);
    // a bundle a tone off now and then (old straw darker, a patch of new straw lighter)
    const off = v < 0.18 ? -1 : v > 0.88 ? 1 : 0;
    // inside a bundle the straw is combed: its side toward the light a tone up, the other a tone down
    // (a slope seen across has no comb: a bundle lit on one row and dark on the next reads as a log, a course of
    // them as brickwork; there each row of straw is a strand of its own, a tone off now and then)
    const sv = h2(a, k, salt + 7);
    const comb = side ? (sv < 0.25 ? -1 : sv > 0.8 ? 1 : 0)
      : j === 0 ? (light[0] <= 0 ? 1 : -1) : j === BW - 1 ? (light[0] <= 0 ? -1 : 1) : 0;
    let c: number;
    if (k === 0 && dm === 0) c = j === 1 ? 2 : 1;                       // the underside of the cut ends
    else if (k === 0 && dm <= 2) c = b + 1 + (comb > 0 && v > 0.3 ? 1 : 0); // the thick edge of cut ends along the eaves
    else if (fromTop === 0) c = 1;                                     // the shadow under the course above
    else if (fromTop === 1) c = (side ? sv > 0.5 : j === 1 && off >= 0) ? b : Math.max(2, b - 1); // frayed: the straw shows through
    else if (fromBot === 0) c = b + 1 + (comb < 0 ? -1 : 0);           // the tips of the bundle catch the light
    else c = b + off + (comb > 0 ? 1 : comb < 0 && fromBot > 1 ? -1 : 0);
    put(x, y, c);
    // the eaves are never ruled: a tip of straw hangs a px under some of them
    const tx = x + Math.round(face[0]), ty = y + Math.round(face[1]);
    if (dm === 0 && !mask.has(tx, ty) && h2(a, 3, salt + 11) < 0.3) tips.push([tx, ty, 1]);
  }
  for (const [x, y, c] of tips) put(x, y, c);
}
