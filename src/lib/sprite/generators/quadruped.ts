import type { Frame } from '../../types';
import { cloneFrame } from '../transforms';

/**
 * The walk of a body on four legs: no skeleton, only the legs. They are the
 * columns hanging under the belly, found on the silhouette (or said by the
 * caller), and each one is moved whole: swung forward or back as a shear (the
 * hip stays, the foot travels) or lifted a pixel (the top row goes into the
 * belly, the sole comes up). The legs go in diagonal pairs, as in a trot: the
 * near front with the far hind, the far front with the near hind.
 */

/** One leg: its columns (outline included) from the belly row to the sole. */
export interface Leg {
  startC: number;
  endC: number;
  /** Profile only: the leg on the far side of the body (drawn darker, behind the near one). */
  far?: boolean;
  /** Profile only: the front leg (the side the body faces) or the hind one. */
  front?: boolean;
}

export interface LegPlan {
  /** First row of the legs (the one under the belly). */
  row: number;
  /** Last painted row (the soles). */
  bottom: number;
  legs: Leg[];
  /** Pieces under the belly that are not moved (a tail hanging between the hind legs). */
  still: Leg[];
}

/** What the caller says when the guess is wrong: the row the legs start at and the columns of each. */
export interface LegsDeclared {
  row?: number;
  columns?: [number, number][];
}

export type QuadrupedView = 'side' | 'down' | 'up';

/** The color that rims the silhouette: the most common one on a pixel that touches the outside. */
export function outlineIndex(frame: Frame): number {
  const H = frame.length, W = frame[0]?.length ?? 0;
  const count = new Map<number, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = frame[y][x];
    if (!v) continue;
    const edge = [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]]
      .some(([r, c]) => r < 0 || c < 0 || r >= H || c >= W || !frame[r][c]);
    if (edge) count.set(v, (count.get(v) ?? 0) + 1);
  }
  let best = 0, most = -1;
  for (const [v, n] of count) if (n > most) { most = n; best = v; }
  return best;
}

/** The runs of row y that are body, not outline nor air: [from, to] each. */
function pieces(frame: Frame, y: number, ink: number, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  let a = -1;
  for (let x = from; x <= to + 1; x++) {
    const v = x <= to ? frame[y][x] : 0;
    const body = v !== 0 && v !== ink;
    if (body && a < 0) a = x;
    if (!body && a >= 0) { out.push([a, x - 1]); a = -1; }
  }
  return out;
}

/**
 * Finds the legs: going up from the soles, the band of rows the outline and
 * the air cut in as many pieces as the lowest one. The band ends at the first
 * row that has fewer (the belly, where the legs join the body).
 */
export function findLegs(frame: Frame, view: QuadrupedView, declared: LegsDeclared = {}, shade?: (index: number) => number): LegPlan {
  const H = frame.length, W = frame[0]?.length ?? 0;
  let top = -1, bottom = -1, left = W, right = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (frame[y][x]) {
    if (top < 0) top = y;
    bottom = y; left = Math.min(left, x); right = Math.max(right, x);
  }
  if (top < 0) throw new Error('the base pose is empty');
  const ink = outlineIndex(frame);
  const say = 'give legs={"row": <first row under the belly>, "columns": [[from, to], …]} (each leg with its outline)';

  // the soles are often a row of outline alone: start from the lowest row that has body in it
  let low = bottom;
  while (low > top && !pieces(frame, low, ink, left, right).length) low--;
  let row = declared.row;
  if (row === undefined) {
    const n = pieces(frame, low, ink, left, right).length;
    if (n < 2) throw new Error(`no legs under the body: its lowest rows are one piece, not two or more legs apart. ${say}`);
    row = low;
    while (row - 1 > top && pieces(frame, row - 1, ink, left, right).length === n) row--;
  }
  if (row < top || row > bottom) throw new Error(`legs row ${row} is outside the figure (rows ${top} to ${bottom})`);
  let found: [number, number][];
  if (declared.columns?.length) {
    found = declared.columns.map(([a, b]) => [Math.min(a, b) + 1, Math.max(a, b) - 1]);
  } else {
    // the lowest row says how many legs; each row above widens the leg it overlaps (a leg can lean)
    found = pieces(frame, Math.max(low, row), ink, left, right);
    for (let y = Math.max(low, row) - 1; y >= row; y--) {
      for (const [a, b] of pieces(frame, y, ink, left, right)) {
        const leg = found.find(([c, d]) => a <= d && b >= c);
        if (leg) { leg[0] = Math.min(leg[0], a); leg[1] = Math.max(leg[1], b); }
      }
    }
  }
  const legRow = row;
  if (found.length < 2) throw new Error(`found ${found.length} leg under row ${row}, and a walk needs two at least. ${say}`);
  // each piece takes the outline around it, shared with the next leg if they touch
  const blocks: Leg[] = found.map(([a, b]) => ({ startC: Math.max(0, a - 1), endC: Math.min(W - 1, b + 1) }));

  let legs = blocks, still: Leg[] = [];
  if (view !== 'side' && blocks.length % 2 === 1 && blocks.length > 1 && !declared.columns?.length) {
    // seen from the front or the back, an odd piece in the middle is the tail hanging between the legs
    const mid = (blocks.length - 1) / 2;
    still = [blocks[mid]];
    legs = blocks.filter((_, i) => i !== mid);
  }
  if (view === 'side') {
    // profile facing right: the front legs are the ones past the middle of the legs
    const mid = (blocks[0].startC + blocks[blocks.length - 1].endC) / 2;
    for (const l of legs) l.front = (l.startC + l.endC) / 2 > mid;
    for (const front of [true, false]) {
      const half = legs.filter(l => !!l.front === front);
      if (half.length !== 2) continue;
      // two legs on one end: the one drawn darker is behind; with no difference, the one inside
      const tone = (l: Leg) => meanShade(frame, l, legRow, bottom, ink, shade);
      const [a, b] = half;
      const darker = shade && Math.abs(tone(a) - tone(b)) > 0.04 ? (tone(a) < tone(b) ? a : b)
        : (front ? (a.startC < b.startC ? a : b) : (a.startC > b.startC ? a : b));
      darker.far = true;
    }
  }
  return { row: legRow, bottom, legs, still };
}

function meanShade(frame: Frame, leg: Leg, row: number, bottom: number, ink: number, shade?: (index: number) => number): number {
  if (!shade) return 0;
  let sum = 0, n = 0;
  for (let y = row; y <= bottom; y++) for (let x = leg.startC; x <= leg.endC; x++) {
    const v = frame[y][x];
    if (v && v !== ink) { sum += shade(v); n++; }
  }
  return n ? sum / n : 0;
}

/**
 * How a leg is moved in one frame: dx at the sole, lifted or not. A near leg
 * swings as a shear (the hip stays, the foot travels); a far one, seen only
 * where it comes out from behind, slides whole under its top row.
 */
interface Move { dx: number; lift: boolean; slide?: boolean }

/** Clears every leg and draws it again moved: the far legs first, the near ones over them. */
function pose(base: Frame, plan: LegPlan, move: (leg: Leg) => Move): Frame {
  const out = cloneFrame(base);
  const W = base[0].length;
  const cut = (leg: Leg) => {
    const rows: number[][] = [];
    for (let y = plan.row; y <= plan.bottom; y++) rows.push(base[y].slice(leg.startC, leg.endC + 1));
    return rows;
  };
  for (const leg of plan.legs) {
    for (let y = plan.row; y <= plan.bottom; y++) for (let x = leg.startC; x <= leg.endC; x++) out[y][x] = 0;
  }
  // what the legs did not cover stays (a tail between them): drawn back before the legs go over it
  for (const s of plan.still) {
    for (let y = plan.row; y <= plan.bottom; y++) for (let x = s.startC; x <= s.endC; x++) if (base[y][x]) out[y][x] = base[y][x];
  }
  const order = [...plan.legs].sort((a, b) => Number(!!b.far) - Number(!!a.far));
  const h = plan.bottom - plan.row + 1;
  for (const leg of order) {
    const { dx, lift, slide } = move(leg);
    let rows = cut(leg);
    // lifted: the top row goes into the belly and the sole comes up a pixel
    if (lift && h > 2) rows = [...rows.slice(1), rows[0].map(() => 0)];
    rows.forEach((line, i) => {
      // the hip stays, the foot travels: the shear grows down the leg (0 at the top, dx at the sole)
      const t = slide ? (i > 0 ? 1 : 0) : h > 1 ? i / (h - 1) : 1;
      const off = Math.sign(dx) * Math.round(Math.abs(dx) * t);
      line.forEach((v, j) => {
        const x = leg.startC + j + off;
        if (v && x >= 0 && x < W) out[plan.row + i][x] = v;
      });
    });
  }
  return out;
}

/** How far a foot travels, by the length of the leg: 2 px on the 5-row legs of a 24 px cat, 1 on short ones. */
export function strideOf(plan: LegPlan): number {
  return Math.max(1, Math.round((plan.bottom - plan.row + 1) * 0.4));
}

/**
 * Four frames, facing right in profile or seen from the front or the back.
 * In profile the near legs open and close like scissors and the far ones,
 * drawn between them, show only when they open past the near ones: frame 0
 * opens the near pair (the near front reaching forward, the near hind
 * pushing back) with the far pair under the body; frame 2 opens the far pair
 * past the near one, which closes. Frames 1 and 3 pass, with the legs
 * straight and one diagonal lifted: the near hind and the far front, then the
 * near front and the far hind. From the front or the back the legs do not
 * travel sideways: one diagonal lifts (every other leg, left to right), then
 * the other.
 */
export function generateWalkQuadruped(base: Frame, view: QuadrupedView, plan: LegPlan): Frame[] {
  const s = strideOf(plan);
  if (view === 'side') {
    // out is away from the middle of the body: forward for a front leg, back for a hind one
    const out = (l: Leg) => (l.front ? 1 : -1);
    // a far leg has to travel past its near partner to be seen: its stride adds the distance between them
    const reach = (l: Leg) => {
      const near = plan.legs.find(m => !m.far && m.front === l.front && m !== l);
      return near ? s + Math.abs((near.startC + near.endC) / 2 - (l.startC + l.endC) / 2) : s;
    };
    const diagonal = (l: Leg) => (l.front ? !l.far : !!l.far);
    return [
      pose(base, plan, l => ({ dx: l.far ? 0 : out(l) * s, lift: false })),
      pose(base, plan, l => ({ dx: 0, lift: !diagonal(l) })),
      pose(base, plan, l => ({ dx: l.far ? out(l) * Math.round(reach(l)) : -out(l) * s, lift: false, slide: l.far })),
      pose(base, plan, l => ({ dx: 0, lift: diagonal(l) })),
    ];
  }
  // from the front or the back, left to right: the diagonals are every other leg (inner left with outer right)
  const index = new Map(plan.legs.map((l, i) => [l, i]));
  const first = (l: Leg) => index.get(l)! % 2 === 1;
  return [
    pose(base, plan, l => ({ dx: 0, lift: first(l) })),
    pose(base, plan, () => ({ dx: 0, lift: false })),
    pose(base, plan, l => ({ dx: 0, lift: !first(l) })),
    pose(base, plan, () => ({ dx: 0, lift: false })),
  ];
}
