// A grove planted by recipe: round broadleaves, pines and a few plums, drawn
// by one hand. Each tree has its trunk on the ground (barked, outlined, flared
// at the foot) and its crown on a front layer (in front of people): lumps with
// a one pixel dark outline, lit from the upper left, the lump in front cutting
// a line of shadow into the one behind. Trees are drawn back to front by the
// row of their foot, so the crown in front covers the one behind, and a later
// light step casts their shadows (ctx.trees). Places come given (`trees`) or
// are drawn by density and salt inside a mask (`zones`: the band of forest
// inside the lip of an island).

import { distanceIn, h2, n1 } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';
import type { GroveStep, TreeKind } from './plantschema';
import { castOval, castStanding } from './sun';
import { registerFooted } from './settle';

/** A tree as planted: the foot of its trunk (px), its height and crown width (px). */
export interface Planted {
  x: number; y: number; h: number; w: number; kind: TreeKind; salt: number; spill?: boolean;
  /** the factor of `tall` (or of `ranks`) it was sized by (a zone tree): over 1 taller, under 1 shorter */
  tall?: number;
  /** where a broadleaf's crown starts, as a fraction of its height from the foot (default 0.3; a pine, 0.16) */
  low?: number;
  /** a crag: which way its trunk leans, -1 (left) to 1 (right), 0 upright (default drawn from its salt) */
  tilt?: number;
}

type Ink = [string, string, string, string, string];   // outline, shadow, mid, light, glint

const DEFAULT_KINDS: Record<TreeKind, number> = { round: 0.7, pine: 0.27, plum: 0.03, bush: 0, ginkgo: 0, willow: 0, crag: 0 };
// the order the odds are summed in: bush last, so a draw past every other kind is a bush, as it always was
const KIND_ORDER: TreeKind[] = ['round', 'pine', 'plum', 'ginkgo', 'willow', 'crag', 'bush'];

function pickKind(w: Partial<Record<TreeKind, number>> | undefined, r: number): TreeKind {
  const k = { ...DEFAULT_KINDS, ...(w ?? {}) };
  let a = r * KIND_ORDER.reduce((s, n) => s + k[n], 0);
  for (const n of KIND_ORDER) if ((a -= k[n]) < 0) return n;
  return 'bush';
}

/** The crown width a tree of this kind and height gets (px). */
export function crownWidth(kind: TreeKind, h: number, salt: number): number {
  const v = h2(salt, 11, 2311);
  if (kind === 'bush') return Math.round(h * (1.3 + 0.3 * v));
  if (kind === 'pine') return Math.round((h - Math.round(h * 0.16)) * (0.7 + 0.12 * v));
  if (kind === 'ginkgo') return Math.round((h - Math.round(h * 0.3)) * (0.66 + 0.1 * v));
  if (kind === 'willow') return Math.round((h - Math.round(h * 0.3) + 2) * (1.05 + 0.12 * v));
  if (kind === 'crag') return Math.round(h * (0.92 + 0.16 * v));
  return Math.round((h - Math.round(h * 0.3) + 2) * (1.0 + 0.14 * v));
}

/** A crown drawn on a scratch: color and owner (index of the lump) of each px. */
class Scratch {
  readonly c = new Map<number, string>();
  readonly o = new Map<number, number>();
  key(x: number, y: number): number { return (y + 4096) * 8192 + (x + 4096); }
  has(x: number, y: number): boolean { return this.c.has(this.key(x, y)); }
  owner(x: number, y: number): number { return this.o.get(this.key(x, y)) ?? -1; }
  set(x: number, y: number, c: string, o: number): void { const k = this.key(x, y); this.c.set(k, c); this.o.set(k, o); }
  paint(x: number, y: number, c: string): void { this.c.set(this.key(x, y), c); }
  *each(): Generator<[number, number, string]> {
    for (const [k, c] of this.c) yield [(k % 8192) - 4096, Math.floor(k / 8192) - 4096, c];
  }
}

/** Lumps [cx, cy, r] (px) drawn back to front, each lit from the upper left, with leafy dabs. */
function lumps(s: Scratch, list: [number, number, number][], ink: Ink, salt: number, dark = 0): void {
  const [, shadow, mid, light, glint] = ink;
  list.forEach(([cx, cy, r], k) => {
    const ph = h2(k, 5, salt) * 6.28;
    for (let y = Math.floor(cy - r * 1.1) - 1; y <= Math.ceil(cy + r * 1.1) + 1; y++) {
      for (let x = Math.floor(cx - r * 1.1) - 1; x <= Math.ceil(cx + r * 1.1) + 1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
        const rr = r * (1 + 0.09 * Math.sin(a * 5 + ph) + 0.05 * n1(a * 2, salt + k));
        if (dx * dx + dy * dy > rr * rr) continue;
        const nx = dx / r, ny = dy / r, l = -(0.5 * nx + 0.9 * ny);
        const dab = h2(Math.floor(x / 2) + k * 7, Math.floor(y / 2), salt + 3);
        let c: string;
        if (l > 0.4) {
          c = light;
          if (l > 0.66 && dab < 0.6) c = glint;
          else if (dab < 0.1) c = mid;
        } else if (l > -0.12 + dark) {
          c = mid;
          if (dab < 0.13) c = shadow;
          else if (dab > 0.9 && l > 0.1) c = light;
        } else c = dab < 0.12 ? mid : shadow;
        s.set(x, y, c, k);
      }
    }
  });
}

/** The lump in front cuts a line of shadow into the one behind; the outer border is the outline. */
function finish(s: Scratch, ink: Ink, below: boolean): void {
  const [outline, shadow] = ink;
  // a pinhole between lumps is not a hole in the crown
  const holes: [number, number, string, number][] = [];
  for (const [x, y, c] of s.each()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const X = x + dx, Y = y + dy;
    if (s.has(X, Y)) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => s.has(X + a, Y + b)).length;
    if (n >= 3) holes.push([X, Y, shadow, s.owner(x, y)]);
  }
  for (const [x, y, c, o] of holes) s.set(x, y, c, o);
  const out: [number, number, string][] = [];
  for (const [x, y] of s.each()) {
    if (!s.has(x + 1, y) || !s.has(x - 1, y) || !s.has(x, y + 1) || !s.has(x, y - 1)) { out.push([x, y, outline]); continue; }
    const me = s.owner(x, y);
    // a pine's tiers hang over the one below (the later is above); a round crown's lower lumps stand in front
    if (below) {
      // under the drooping tips of the tier above: a band of shadow, darkest right under them
      if (s.owner(x, y - 1) > me) out.push([x, y, h2(x, y, 2361) < 0.8 ? outline : shadow]);
      else if (s.owner(x, y - 2) > me) out.push([x, y, shadow]);
      continue;
    }
    if (s.owner(x, y + 1) > me) out.push([x, y, h2(x, y, 2363) < 0.4 ? outline : shadow]);   // the crevice over a lump in front
    else if (s.owner(x + 1, y) > me || s.owner(x - 1, y) > me) out.push([x, y, shadow]);
    else if (s.owner(x, y + 2) > me && h2(x, y, 2362) < 0.5) out.push([x, y, shadow]);
  }
  for (const [x, y, c] of out) s.paint(x, y, c);
}

/** The shape every tree but a bush shares: where its trunk forks and which way it leans and opens. */
interface Frame { side: number; lean: number; belly: number; top: number; ch: number; tw: number }

function frame(t: Planted): Frame {
  const { y: fy, h, w, kind, salt } = t;
  if (kind === 'crag') {
    // a crag shows little trunk under its lowest pad; on the ground it goes from the foot to there, along its line
    const { at, side } = cragLine(t), belly = fy - Math.round(h * 0.14);
    return { side, lean: at((fy - belly) / (CRAG_RISE * h))[0] - t.x, belly, top: fy - h + 1, ch: Math.round(h * 0.7), tw: h >= 46 ? 4 : 3 };
  }
  const belly = fy - Math.round(h * (kind === 'pine' ? 0.16 : t.low ?? 0.3)), top = fy - h + 1;
  // the big branch opens to one side or the other, and the trunk leans a little, by the salt of the tree
  const side = h2(salt, 30, 2391) < 0.5 ? -1 : 1;
  // a ginkgo stands straight; a willow leans well over to one side
  const lean = kind === 'ginkgo' ? 0
    : kind === 'willow' ? side * (0.1 + 0.06 * h2(salt, 31, 2391)) * w
    : (h2(salt, 31, 2391) - 0.5) * (kind === 'pine' ? 0.08 : 0.15) * w;
  return { side, lean, belly, top, ch: belly - top, tw: h >= 46 ? 4 : 3 };
}

/** A limb from a to b (px), as thick as w0 at a and w1 at b: discs along it. */
function limb(s: Scratch, a: [number, number], b: [number, number], w0: number, w1: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(len * 2));
  for (let i = 0; i <= n; i++) {
    const f = i / n, cx = a[0] + (b[0] - a[0]) * f, cy = a[1] + (b[1] - a[1]) * f, r = (w0 + (w1 - w0) * f) / 2;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r + 0.25) s.set(x, y, 'bark', 0);
    }
  }
}

/** The limbs barked: lit where they face up or left, dark where they face down or right, in scales,
 *  outlined (not from `floor` down, where the trunk goes on down the ground). */
function barkLimbs(s: Scratch, bark: [string, string, string, string], floor: number): void {
  const [bl, bm, bd, line] = bark, px: [number, number, string][] = [];
  for (const [x, y] of s.each()) {
    let c = bm;
    if (!s.has(x, y - 1) || !s.has(x - 1, y)) c = bl;
    else if (!s.has(x, y + 1) || !s.has(x + 1, y)) c = bd;
    else if (h2(x, Math.floor(y / 2), 2351) < 0.2) c = bd;
    px.push([x, y, c]);
  }
  const ring: [number, number][] = [];
  for (const [x, y] of s.each()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!s.has(x + dx, y + dy) && y + dy < floor) ring.push([x + dx, y + dy]);
  }
  for (const [x, y, c] of px) s.paint(x, y, c);
  for (const [x, y] of ring) s.set(x, y, line, -1);
}

/** A lump of a canopy: where it is, how big, and the middle of the whole crown it belongs to (for the light). */
type Clump = [number, number, number];

/** A mass of leaves at the end of a branch: one body of clumps (one in the middle and a ring of six on
 *  its border, which makes the scalloped edge). */
function mass(cx: number, cy: number, R: number, salt: number, i: number, sy = 0.9): Clump[] {
  const j = (k: number) => (h2(salt, 40 + i * 31 + k, 2393) - 0.5);
  const out: Clump[] = [[cx + j(0) * 0.2 * R, cy + j(1) * 0.2 * R, 0.5 * R]];
  const a1 = j(2) * 6.28;
  for (let k = 0; k < 6; k++) {
    const a = a1 + k * 1.047 + j(3 + k) * 0.35, rr = (0.56 + 0.12 * j(10 + k)) * R;
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy, (0.42 + 0.08 * j(17 + k)) * R]);
  }
  return out;
}

/** A canopy of clumps drawn back to front (by their row: the lower clump stands in front), each lit
 *  from the upper left mixed with the light of the whole crown, so the clumps show but the crown keeps
 *  one lit side and one in shade; the lit side stippled one tone lighter, px by px. */
function canopy(s: Scratch, list: Clump[], ink: Ink, salt: number, dark = 0, fall = 0): void {
  const [, shadow, mid, light, glint] = ink;
  let mx = 0, my = 0;
  for (const [x, y] of list) { mx += x; my += y; }
  mx /= list.length; my /= list.length;
  let mr = 1;
  for (const [x, y, r] of list) mr = Math.max(mr, Math.hypot(x - mx, (y - my) * 1.1) + r);
  // `fall`: the light comes from above, so the crown darkens from its middle down to its lower border
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y, r] of list) { y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); }
  const ym = (y0 + y1) / 2 - 0.1 * (y1 - y0), half = Math.max(1, y1 - ym);
  const order = list.map((c, k) => [c, k] as [Clump, number]).sort((p, q) => p[0][1] - q[0][1] || p[1] - q[1]);
  order.forEach(([[cx, cy, r]], k) => {
    const ph = h2(k, 5, salt) * 6.28;
    for (let y = Math.floor(cy - r * 1.2) - 1; y <= Math.ceil(cy + r * 1.2) + 1; y++) {
      for (let x = Math.floor(cx - r * 1.2) - 1; x <= Math.ceil(cx + r * 1.2) + 1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
        const rr = r * (1 + 0.12 * Math.sin(a * 5 + ph));
        if (dx * dx + dy * dy > rr * rr) continue;
        const own = -(0.5 * dx + 0.9 * dy) / r, all = -(0.55 * (x + 0.5 - mx) + 0.85 * (y + 0.5 - my)) / mr;
        const l = 0.75 * own + 0.5 * all - fall * Math.max(0, (y + 0.5 - ym) / half), dot = h2(x, y, salt + 5);
        let c: string;
        if (l > 0.5) c = dot < 0.16 ? glint : light;                       // the lit side, stippled
        else if (l > 0.12 + dark / 2) c = dot < 0.07 ? light : mid;
        else if (l > -0.3 + dark) c = dot < 0.12 ? shadow : mid;
        else c = shadow;
        s.set(x, y, c, k);
      }
    }
  });
}

/** How a tree's crown takes the light: `dark` more of it on the side away from the light (the sun's `contrast`),
 *  `fall` darker from its middle down (a light from above), `under` px of shade along its lower border. */
interface Shade { dark: number; fall: number; under: number; snow?: [number, string, string, string] }
const FLAT: Shade = { dark: 0, fall: 0, under: 0 };

/** The lower border of a crown in shade: each leaf px with the outline (or the air) within `under` px below it, in
 *  the lower half of the crown. */
function underside(crown: Scratch, ink: Ink, under: number): void {
  if (under <= 0) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of crown.each()) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const mid = (y0 + y1) / 2, [outline, shadow] = ink, out: [number, number][] = [];
  for (const [x, y, c] of crown.each()) {
    if (c === outline || c === shadow || y < mid) continue;
    for (let k = 1; k <= under; k++) {
      const b = crown.c.get(crown.key(x, y + k));
      if (b === undefined || b === outline) { out.push([x, y]); break; }
    }
  }
  for (const [x, y] of out) crown.paint(x, y, shadow);
}

/** A broadleaf (or a plum): the trunk forks into two or three branches, each one ends in a big full
 *  mass of leaves and the masses lean on each other into one round, uneven crown; the air stays in one
 *  or two gaps under it where the fork and a branch show. */
function roundTree(t: Planted, ink: Ink, bark: [string, string, string, string], sh: Shade = FLAT): { limbs: Scratch; crown: Scratch } {
  const limbs = new Scratch(), crown = new Scratch(), { x: fx, w, salt } = t;
  const { side, lean, belly, top, ch, tw } = frame(t);
  const [, shadow] = ink;
  const three = h2(salt, 32, 2391) < 0.6;
  const fork: [number, number] = [fx + lean, belly - 0.1 * ch];
  // sized to stay inside the crown a tree of this width always had: what a crown covers is checked against `keep`.
  // Three round masses (low to one side, higher to the other, one on top) or two tall ones side by side.
  const sy = three ? 0.9 : 1.3, R1 = 0.28 * w, R2 = (three ? 0.27 : 0.28) * w, R3 = 0.27 * w;
  const c1: [number, number] = [fx + lean + side * 0.17 * w, belly - (three ? 0.85 : 1.1) * R1];
  const c2: [number, number] = three ? [fx + lean - side * 0.18 * w, belly - 0.55 * ch] : [fx + lean - side * 0.18 * w, top + 1.1 * R2 * sy];
  const c3: [number, number] = [fx + lean + side * 0.04 * w, top + 1.02 * R3];
  limb(limbs, [fx + lean, belly], fork, tw, tw - 0.5);
  limb(limbs, fork, [c1[0] - side * 0.1 * R1, c1[1]], tw - 0.5, 1.5);
  limb(limbs, fork, [c2[0] + side * 0.1 * R2, c2[1]], tw - 1, 1.2);
  if (three) limb(limbs, [fork[0], fork[1] - 0.2 * ch], [c3[0], c3[1] + 0.2 * R3], 2, 1);
  barkLimbs(limbs, bark, belly);
  canopy(crown, [
    ...(three ? mass(c3[0], c3[1], R3, salt, 3) : []),
    ...mass(c2[0], c2[1], R2, salt, 2, sy),
    ...mass(c1[0], c1[1], R1, salt, 1, sy),
  ], ink, salt, sh.dark, sh.fall);
  finish(crown, ink, false);
  // the shaded border: a tone darker inside the outline down and to the right
  const rim: [number, number][] = [];
  for (const [x, y, c] of crown.each()) {
    if (c === ink[0]) continue;
    if (crown.c.get(crown.key(x + 1, y)) === ink[0] || crown.c.get(crown.key(x, y + 1)) === ink[0] || !crown.has(x + 1, y) || !crown.has(x, y + 1)) rim.push([x, y]);
  }
  for (const [x, y] of rim) if (crown.c.get(crown.key(x, y + 1)) === ink[0] || crown.c.get(crown.key(x + 1, y)) === ink[0]) {
    if (crown.c.get(crown.key(x, y - 1)) !== ink[0] && crown.c.get(crown.key(x - 1, y)) !== ink[0]) crown.paint(x, y, shadow);
  }
  underside(crown, ink, sh.under);
  return { limbs, crown };
}

/** A bush: no trunk, two lumps behind and one or two in front, sitting on the ground at its foot. */
function bushCrown(t: Planted, ink: Ink, dark = 0): Scratch {
  const s = new Scratch(), { x: fx, y: fy, h, w, salt } = t;
  const R = w / 3.3, j = (i: number) => (h2(salt, i, 2371) - 0.5) * 0.6 * R;
  const back = fy - h + R, front = fy - R + 0.5;
  const list: [number, number, number][] = [
    [fx - 0.55 * R + j(1), back + Math.abs(j(2)) * 0.4, 0.9 * R],
    [fx + 0.6 * R + j(3), back + 0.2 * R + Math.abs(j(4)) * 0.4, 0.85 * R],
  ];
  if (h2(salt, 5, 2372) < 0.5) list.push([fx - 0.9 * R + j(6) * 0.5, front, 0.8 * R], [fx + 0.7 * R + j(7) * 0.5, front + 0.1 * R, 0.85 * R]);
  else list.push([fx + j(8) * 0.5, front, 1.0 * R]);
  lumps(s, list, ink, salt, dark);
  finish(s, ink, false);
  return s;
}

/** A pine: a thin trunk up to the tip and, hanging from it, three or four tiers of drooping needles,
 *  each a skirt that peaks at the trunk and droops to its tips, longer to one side (alternating tier by
 *  tier), with air under each one where the trunk and the branch it hangs from show. */
function pineTree(t: Planted, ink: Ink, bark: [string, string, string, string], sh: Shade = FLAT): { limbs: Scratch; crown: Scratch } {
  const dark = sh.dark;
  const limbs = new Scratch(), crown = new Scratch(), { x: fx, y: fy, h, w, salt } = t;
  const [, shadow, mid, light, glint] = ink;
  const { side, lean, belly, top, ch, tw } = frame(t);
  const n = h >= 44 ? 4 : 3, step = ch / n;
  const tx = (y: number) => fx + lean * Math.min(1, (fy - y) / (fy - top));
  limb(limbs, [tx(belly), belly], [tx(top + 2), top + 2], tw - 1, 1);
  // the bottom tier first: each tier above hangs its tips over the one below
  const tiers: [number, number, number, number, number][] = [];   // trunk x, top y at the trunk, bottom y at the trunk, left reach, right reach
  for (let i = n - 1; i >= 0; i--) {
    const y0 = i === 0 ? top - 1 : top + step * (i - 0.42), y1 = top + step * (i + 0.74);
    const hw = (w / 2) * (i === 0 ? 0.5 : 0.42 + 0.78 * (i + 1) / n), c = tx(y1);
    const s = side * (i % 2 === 0 ? 1 : -1), a = i === 0 ? 0 : 0.07 + 0.09 * h2(salt, 50 + i, 2394);
    const left = hw * (1 - s * a), right = hw * (1 + s * a);
    tiers.push([c, y0, y1, left, right]);
    // the branch it hangs from, under the long side, showing under its belly
    if (i > 0) limb(limbs, [c, y1 + 0.5], [c + s * (s > 0 ? right : left) * 0.7, y1 + 1.6], 2, 1);
  }
  barkLimbs(limbs, bark, belly);
  // `fall`: the lower tiers in more shade than the upper ones (from the middle of the crown down)
  const pTop = top - 1, pBot = tiers.length ? tiers[0][2] + 3.4 : fy, pMid = (pTop + pBot) / 2 - 0.1 * (pBot - pTop), pHalf = Math.max(1, pBot - pMid);
  tiers.forEach(([c, y0, y1, left, right], k) => {
    const ph = h2(salt, 20 + k, 2342) * 6.28, hgt = y1 - y0;
    for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1) + 5; y++) {
      for (let x = Math.floor(c - left) - 1; x <= Math.ceil(c + right) + 1; x++) {
        const dx = x + 0.5 - c, reach = dx < 0 ? left : right, ax = Math.abs(dx) / reach;
        if (ax > 1) continue;
        const tip = 1.7 * Math.abs(Math.sin(dx * 0.8 + ph)) * (0.4 + 0.6 * ax);   // jagged tips, deeper out at the ends
        const yTop = y0 + hgt * (k === tiers.length - 1 ? 1.0 : 0.8) * ax + 0.5 * Math.abs(Math.sin(dx * 0.9 + ph));   // it peaks at the trunk (the tip: an arrow)
        const notch = k === tiers.length - 1 ? 0 : 2.2 * Math.max(0, 1 - ax * 4.5);     // under it, by the trunk, a notch where the trunk shows
        const yBot = y1 + 3.4 * ax * ax + tip - notch;                             // and droops out to the tips
        if (y + 0.5 < yTop || y + 0.5 > yBot) continue;
        const nx = dx / Math.max(left, right) + sh.fall * Math.max(0, (y + 0.5 - pMid) / pHalf), dab = h2(Math.floor(x / 2) + k * 5, y, salt + 7), dot = h2(x, y, salt + 9);
        let c2: string;
        if (y + 0.5 < yTop + 1.2 && nx < 0.25) c2 = dot < 0.25 ? glint : light;      // the lit rim, stippled
        else if (nx < -0.35) c2 = dot < 0.14 ? glint : dab > 0.85 ? mid : light;
        else if (nx < 0.15 - dark) c2 = dot < 0.08 ? light : dab > 0.72 ? shadow : mid;
        else c2 = dab < 0.1 ? mid : shadow;
        // `snow`: it lies on top of each tier, deepest at the peak, thinning out to the tips (that stay green)
        if (sh.snow) {
          const [deep, lit, half, shaded] = sh.snow;
          const lie = deep * (1 - 0.65 * ax) + 0.6 * (h2(Math.floor(x / 2), k, salt + 11) - 0.5);
          if (y + 0.5 < yTop + lie && ax < 0.92) c2 = nx < -0.15 ? (dot < 0.2 ? half : lit) : nx < 0.35 ? half : shaded;
        }
        crown.set(x, y, c2, k);
      }
    }
  });
  finish(crown, ink, true);
  underside(crown, ink, sh.under);
  return { limbs, crown };
}

/** A ginkgo: a straight pale trunk that goes on up inside the crown, branches climbing out of it, and a crown
 *  that opens upward like the leaf of the tree, a fan: narrow where it starts, wide and domed at the top. It is
 *  built of small clusters, each lit on its own, so the crown reads as many little fans of leaves and not as one
 *  ball; along the sloping sides of the fan some clusters hang a little below it. */
function ginkgoTree(t: Planted, ink: Ink, bark: [string, string, string, string], sh: Shade = FLAT): { limbs: Scratch; crown: Scratch } {
  const limbs = new Scratch(), crown = new Scratch(), { x: fx, w, salt } = t;
  const { belly, top, ch, tw } = frame(t);
  const j = (k: number) => h2(salt, 60 + k, 2395) - 0.5;
  // the trunk on up into the crown, and the branches that climb out of it toward the sides of the fan
  limb(limbs, [fx, belly], [fx, top + 0.3 * ch], tw - 0.5, 1.2);
  for (const s of [-1, 1]) {
    limb(limbs, [fx, belly - 0.12 * ch], [fx + s * (0.2 + 0.04 * j(s)) * w, belly - 0.55 * ch], 2, 1);
    limb(limbs, [fx, belly - 0.42 * ch], [fx + s * (0.3 + 0.04 * j(2 + s)) * w, top + 0.25 * ch], 1.6, 1);
  }
  barkLimbs(limbs, bark, belly);
  // the fan: its half width f of the way up the crown (0 where it starts, 1 at its top); it widens up to 0.72 and the
  // rest is the dome, a little uneven to one side
  const tilt = j(9) * 0.1 * w;
  // a fan flaring as it rises (its sides curve out) up to 0.72, then a low dome with a shallow notch in its
  // middle, like the leaf
  const half = (f: number) => (w / 2) * (f < 0.72 ? 0.2 + 0.8 * Math.pow(f / 0.72, 1.6) : Math.sqrt(Math.max(0, 1 - ((f - 0.72) / 0.28) ** 2)));
  const r = Math.max(3, 0.12 * w), list: Clump[] = [];
  for (let row = 0, y = top + 0.75 * r; y < belly - 0.3 * r; row++, y += 1.1 * r) {
    const f = (belly - y) / ch, hw = half(f) - 0.6 * r, mx = fx + tilt * f;
    if (hw < -0.3 * r) continue;
    const n = Math.max(1, Math.round((2 * Math.max(0, hw)) / (1.5 * r)) + 1), step = n > 1 ? (2 * hw) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const k = row * 17 + i, x = mx - Math.max(0, hw) + i * step + (n > 1 ? j(20 + k) * 0.4 * r : 0);
      // low in the fan an inner cluster or two is missing: the branches show through
      if (f < 0.45 && n > 2 && i > 0 && i < n - 1 && h2(salt, 200 + k, 2395) < 0.4) continue;
      // the notch: the clusters of the top row stand a little lower in the middle
      const notch = f > 0.9 ? 0.5 * r * Math.max(0, 1 - Math.abs(x - mx) / (0.25 * w)) : 0;
      list.push([x, y + notch + j(40 + k) * 0.4 * r, r * (0.9 + 0.25 * (j(60 + k) + 0.5))]);
    }
  }
  // small clusters hanging under the sloping sides of the fan
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const f = 0.2 + 0.16 * i + 0.05 * j(80 + i + s);
    if (h2(salt, 100 + i + s * 7, 2395) < 0.25) continue;
    list.push([fx + tilt * f + s * (half(f) + 0.1 * r), belly - f * ch + r * (0.8 + 0.4 * (j(90 + i + s) + 0.5)), r * 0.75]);
  }
  // gold glows: the crown darkens less from its middle down than a green one
  canopy(crown, list, ink, salt, sh.dark, 0.5 * sh.fall);
  finish(crown, ink, false);
  underside(crown, ink, sh.under);
  return { limbs, crown };
}

/** A willow: a short trunk leaning to one side forks into boughs under a low rounded dome, and from the dome
 *  the crown falls in four to six curtains almost to the ground: one mass at the top, they part lower down
 *  (a crease of shadow where two meet, then air between them where the trunk shows), the outer ones bowing
 *  out before they hang, streaked down their length like strings of leaves, their feet frayed into hanging
 *  tips of uneven length. */
function willowTree(t: Planted, ink: Ink, bark: [string, string, string, string], sh: Shade = FLAT): { limbs: Scratch; crown: Scratch } {
  const limbs = new Scratch(), crown = new Scratch(), { x: fx, y: fy, h, w, salt } = t;
  const [, shadow, mid, light, glint] = ink;
  const { side, lean, belly, top, ch, tw } = frame(t);
  const j = (k: number) => h2(salt, 70 + k, 2396) - 0.5;
  const cx = fx + 1.25 * lean, hw = w / 2;
  // the dome: an arch over the whole width, a little lumpy, its foot `rim` px under the top
  const rim = 0.42 * ch, ph = j(0) * 6.28;
  const domeTop = (x: number) => {
    const a = Math.min(1, Math.abs(x + 0.5 - cx) / hw);
    return top + rim * (1 - Math.sqrt(1 - a * a)) + 1.8 * Math.abs(Math.sin((x - cx) * 0.4 + ph)) * (0.4 + a);
  };
  // the boughs: out of the fork, up into the dome
  const fork: [number, number] = [fx + lean, belly];
  limb(limbs, fork, [cx - side * 0.05 * w, top + 0.4 * ch], tw - 0.5, 1.5);
  limb(limbs, fork, [cx - 0.28 * w, top + 0.45 * ch], tw - 1, 1.2);
  limb(limbs, fork, [cx + 0.28 * w, top + 0.45 * ch], tw - 1, 1.2);
  barkLimbs(limbs, bark, belly);
  const n = 4 + Math.floor(h2(salt, 69, 2396) * 3), cw = w / n;
  // where each curtain begins and ends across the dome (its seams wander a little)
  const seams = Array.from({ length: n + 1 }, (_, i) => cx - hw + i * cw + (i > 0 && i < n ? j(30 + i) * 0.3 * cw : 0));
  for (let i = 0; i < n; i++) {
    const a = seams[i], b = seams[i + 1], xc = (a + b) / 2, half = (b - a) / 2, rel = (xc - cx) / hw;
    // its foot: near the ground, the middle ones a little shorter (they hang in front of the trunk)
    const y1 = fy - 2 - (j(20 + i) + 0.5) * 0.12 * h - (Math.abs(rel) < 0.35 ? 0.08 * h : 0);
    const split = top + rim + 0.12 * ch + (j(40 + i) + 0.5) * 0.12 * ch;   // where it parts from the next one
    const bow = rel * 0.08 * w;
    for (let x = Math.floor(a) - 1; x <= Math.ceil(b) + 1; x++) {
      const q0 = (x + 0.5 - xc) / half;
      if (Math.abs(q0) > 1) continue;
      // the foot frays into tips: columns two px wide, each ending at its own length
      const tip = (h2(Math.floor(x / 2), i, salt + 2397) - 0.4) * 8 - 3 * q0 * q0;
      for (let y = Math.floor(domeTop(x)); y <= Math.ceil(y1 + tip); y++) {
        const p = Math.max(0, (y - split) / Math.max(1, y1 - split));
        // below the split it narrows: air opens between two curtains
        if (p > 0 && Math.abs(q0) > 1 - 0.32 * Math.min(1, p * 2.5)) continue;
        const X = Math.round(x + bow * Math.sqrt(p) + 0.8 * Math.sin(p * 3 + i) * Math.min(1, 3 * p));
        const nx = (X + 0.5 - cx) / hw, ny = (y - top) / Math.max(1, fy - top);
        const l = -0.55 * nx - 0.9 * (ny - 0.45) - 0.3 * q0 - sh.fall * 0.4 * Math.max(0, ny - 0.45);
        // strings of leaves: dashes down each column
        const st = h2(X, Math.floor((y + 7 * h2(X, 3, salt)) / 3), salt + 2398);
        let c: string;
        if (y < domeTop(x) + 1.5 && nx < 0.3) c = st < 0.3 ? glint : light;           // the lit rim of the dome
        else if (l > 0.2 + sh.dark / 2) c = st < 0.1 ? glint : st > 0.75 ? mid : light;
        else if (l > -0.45 + sh.dark) c = st < 0.15 ? light : st > 0.82 ? shadow : mid;
        else c = st < 0.2 ? mid : shadow;
        // one mass on top (the same owner, no seam), curtains of their own below
        crown.set(X, y, c, y < split ? n + 1 : i);
      }
    }
  }
  finish(crown, ink, false);
  underside(crown, ink, sh.under);
  return { limbs, crown };
}

/** How high a crag's trunk climbs, as a fraction of its height: its top pad sits on the apex. */
const CRAG_RISE = 0.8;

/** The line of a crag's trunk from its foot (f = 0) up to its apex (f = 1): it leans out by its tilt and bends
 *  twice on the way, first back against the lean and then toward it again (an S), as a pine grown on a ledge does. */
function cragLine(t: Planted): { at: (f: number) => [number, number]; side: number } {
  const { x: fx, y: fy, h, w, salt } = t;
  const tilt = t.tilt ?? (h2(salt, 33, 2397) - 0.5) * 1.6;
  const side = tilt > 0.12 ? 1 : tilt < -0.12 ? -1 : h2(salt, 30, 2391) < 0.5 ? -1 : 1;
  const L = tilt * 0.3 * w, K = (0.05 + 0.04 * h2(salt, 34, 2397)) * w * side;
  // and a shorter kink on top of the S: the trunk goes up in crooked stretches, not one smooth curve
  const K2 = 0.035 * w, ph = h2(salt, 35, 2397) * 6.28;
  return { side, at: (f) => [fx + L * Math.sin((f * Math.PI) / 2) - K * Math.sin(f * Math.PI * 1.6) + K2 * Math.sin(f * Math.PI * 3.4 + ph) * f, fy - f * CRAG_RISE * h] };
}

/** A crag, the mountain pine of a ledge: a dark twisted trunk leaning out over the drop, and from it a few branches
 *  that end in flat pads of needles, far apart, alternating sides (the lowest and longest toward the lean, reaching
 *  out over the void), a wider domed one on the apex. Each pad is a few flattened lumps side by side (a scalloped
 *  top, a flat underside with needle tips), the snow lying on its top and the dark green under it, darkest at its
 *  lower border; the air shows between the pads where the trunk and the branches do. */
function cragTree(t: Planted, ink: Ink, bark: [string, string, string, string], sh: Shade = FLAT): { limbs: Scratch; crown: Scratch } {
  const limbs = new Scratch(), crown = new Scratch(), { y: fy, h, w, salt } = t;
  const [, shadow, mid, light, glint] = ink;
  const { at, side } = cragLine(t), { belly, tw } = frame(t);
  const j = (k: number) => h2(salt, 80 + k, 2398) - 0.5;
  // the trunk, from where it leaves the ground up to the apex, thinning as it goes
  const fb = (fy - belly) / (CRAG_RISE * h), N = 10;
  for (let i = 0; i < N; i++) {
    const f0 = fb + ((1 - fb) * i) / N, f1 = fb + ((1 - fb) * (i + 1)) / N;
    limb(limbs, at(f0), at(f1), tw - ((tw - 1.4) * i) / N, tw - ((tw - 1.4) * (i + 1)) / N);
  }
  // the pads, lowest first: the lowest toward the lean, then the other side, alternating up the trunk
  const n = h >= 50 ? 7 : h >= 34 ? 6 : 4, pads: [number, number, number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const f = 0.22 + (0.9 - 0.22) * (n > 2 ? i / (n - 2) : 0) + j(i) * 0.05, s = i % 2 === 0 ? side : -side;
    const low = 1 - i / Math.max(1, n - 1), [bx, by] = at(f);
    const pw = w * (0.22 + 0.28 * low * low + 0.08 * j(10 + i)), ph = Math.max(5, Math.round(pw / 2.1));
    const reach = w * (0.16 + 0.15 * low) * (s === side ? 1.25 : 0.85);
    const cx = bx + s * reach, cy = by - 0.55 * ph + j(20 + i) * 1.5;   // the branch rises to its pad
    limb(limbs, [bx, by], [cx - s * 0.1 * pw, cy + 0.3 * ph], low > 0.6 && tw >= 4 ? 3 : 2.2, 1);
    pads.push([cx, cy, pw / 2, ph]);
    // on a big crag some pads carry a smaller one at their outer end, a little higher: an uneven silhouette
    if (h >= 34 && i < n - 2 && h2(salt, 60 + i, 2398) < 0.6) {
      const sw = pw * (0.45 + 0.15 * j(40 + i)), sp = Math.max(4, Math.round(sw / 2.1));
      pads.push([cx + s * (0.22 + 0.08 * j(50 + i)) * pw, cy - 0.65 * ph, sw / 2, sp]);
    }
  }
  const [ax, ay] = at(1), tw2 = w * (0.36 + 0.06 * j(30)), th = Math.max(5, Math.round(tw2 / 2.0));
  pads.push([ax + side * 0.04 * w, ay - 0.1 * th, tw2 / 2, th]);
  barkLimbs(limbs, bark, belly);
  pads.forEach(([cx, cy, half, ph], k) => {
    // the lumps of the pad side by side, the middle ones a little higher
    const m = Math.max(2, Math.round((2 * half) / 6.5)), list: [number, number, number, number][] = [];
    for (let q = 0; q < m; q++) {
      // uneven lumps: some fat and high, some low and thin, so the pad is no oval
      const u = -1 + (2 * q) / (m - 1), r = h2(salt, 100 + k * 9 + q, 2399);
      const rx = half * (1.7 / m) * (0.85 + 0.4 * r), ry = ph * (0.38 + 0.36 * r) * (1 - 0.2 * u * u);
      list.push([cx + u * (half - rx * 0.8), cy - 0.18 * ph * (1 - u * u) + (h2(salt, 140 + k * 9 + q, 2399) - 0.5) * 0.4 * ph, rx, ry]);
    }
    const flat = cy + 0.32 * ph, ph0 = h2(salt, 160 + k, 2399) * 6.28, cells: [number, number, number][] = [];
    const top = new Map<number, number>(), bot = new Map<number, number>();
    for (let y = Math.floor(cy - ph * 1.3); y <= Math.ceil(flat) + 2; y++) for (let x = Math.floor(cx - half) - 2; x <= Math.ceil(cx + half) + 2; x++) {
      const u = Math.min(1, Math.abs(x + 0.5 - cx) / half);
      // the underside: flat, frayed into needle tips, deeper toward the ends
      if (y + 0.5 > flat + 1.6 * Math.abs(Math.sin(x * 0.9 + ph0)) * (0.3 + 0.7 * u)) continue;
      let li = -1;
      list.forEach(([lx, ly, rx, ry], q) => { if (((x + 0.5 - lx) / rx) ** 2 + ((y + 0.5 - ly) / ry) ** 2 <= 1) li = li < 0 ? q : li; });
      if (li < 0) continue;
      cells.push([x, y, li]);
      top.set(x, Math.min(top.get(x) ?? y, y));
      bot.set(x, Math.max(bot.get(x) ?? y, y));
    }
    // the fringe of needles: short uneven teeth down from the lower border (longer out at the ends) and a few tips
    // sticking out sideways at the ends, so the pad is no smooth cushion
    const fringe: [number, number, number][] = [];
    for (const [x, b] of bot) {
      const u = Math.min(1, Math.abs(x + 0.5 - cx) / half), r = h2(x, k, salt + 17);
      const len = (r < 0.3 ? 0 : r < 0.7 ? 1 : 2) + (u > 0.6 && h2(x, k, salt + 18) < 0.5 ? 1 : 0);
      for (let d = 1; d <= len; d++) fringe.push([x, b + d, -1]);
    }
    const rows = new Map<number, [number, number]>();
    for (const [x, y] of cells) { const r = rows.get(y); rows.set(y, r ? [Math.min(r[0], x), Math.max(r[1], x)] : [x, x]); }
    for (const [y, [x0, x1]] of rows) {
      if (y < top.get(x0)! + 1 || h2(y, k, salt + 19) < 0.45) continue;
      const len = 1 + (h2(y, k, salt + 20) < 0.4 ? 1 : 0);
      for (let d = 1; d <= len; d++) fringe.push([x0 - d, y, -1]);
      if (h2(y, k, salt + 21) < 0.6) for (let d = 1; d <= len; d++) fringe.push([x1 + d, y, -1]);
    }
    // the light from above: the snow on top, lit on the left of each lump; under it the green, darker down to the lower border
    const deep = sh.snow ? Math.min(1.3 * sh.snow[0], 0.6 * ph + 0.5) : 0;
    for (const [x, y] of fringe) crown.set(x, y, h2(x, y, salt + 22) < 0.5 ? shadow : mid, k);
    for (const [x, y, li] of cells) {
      const [lx, , rx] = list[li], u = (x + 0.5 - cx) / half, nx = 0.55 * u + 0.6 * ((x + 0.5 - lx) / rx);
      const d = y - top.get(x)!, depth = bot.get(x)! - top.get(x)! + 1, dot = h2(x, y, salt + 9);
      let c: string;
      // thick on top of each lump, thinner where two meet and out at the ends
      const [lx2, , rx2] = list[li], mid2 = 1 - Math.min(1, Math.abs(x + 0.5 - lx2) / rx2);
      const lie = sh.snow ? deep * (0.25 + 0.75 * Math.sqrt(mid2)) * (1 - 0.25 * Math.abs(u)) * (0.8 + 0.4 * h2(li, k, salt + 12)) + 0.7 * (h2(Math.floor(x / 2), k, salt + 11) - 0.5) : 0;
      if (sh.snow && d < lie && Math.abs(u) < 0.96) {
        const [, lit, half2, shaded] = sh.snow;
        c = nx < -0.1 ? (dot < 0.15 ? half2 : lit) : nx < 0.5 ? (d >= lie - 1 && dot < 0.5 ? shaded : half2) : shaded;
      } else {
        const v = (d - lie) / Math.max(1, depth - lie) + sh.fall * 0.15 * (k < pads.length - 1 ? 1 : 0);
        if (!sh.snow && d < 1.2) c = nx < 0.3 ? (dot < 0.25 ? glint : light) : mid;
        // tufts of needles: lighter dabs of 2 px on the lit side, darker ones toward the shade
        else if (v < 0.35) {
          // short strokes of needles, two greens mixed in points
          const tuft = h2(x, Math.floor((y + (x % 3)) / 2), salt + 13);
          c = nx < -0.2 ? (tuft < 0.4 ? light : mid) : nx < 0.45 - sh.dark ? (tuft < 0.18 ? light : tuft > 0.85 ? shadow : mid) : (tuft < 0.35 ? mid : shadow);
        }
        else if (v < 0.62) c = h2(x, Math.floor((y + (x % 3)) / 2), salt + 14) < 0.35 ? mid : shadow;
        else if (v < 0.85 && h2(x, Math.floor((y + (x % 2)) / 2), salt + 15) < 0.2) c = mid;
        else c = shadow;
      }
      crown.set(x, y, c, k);
    }
  });
  finish(crown, ink, true);
  underside(crown, ink, sh.under);
  return { limbs, crown };
}

/** A crag's shadow on the ground: small and light, a blot half as wide as its crown by the foot of the trunk, on the
 *  side away from the sun, one tone down (not the sun's mask: the pads far apart let the light through). */
function cragShadow(ctx: Ctx, t: Planted): void {
  const sun = ctx.sun!, g = ctx.ground, n = Math.hypot(sun.lean[0], sun.lean[1]) || 1;
  const on = sun.on ? new Set(sun.on) : null, rx = 0.25 * t.w, ry = 0.1 * t.w + 1.5;
  const cx = t.x + (sun.lean[0] / n) * 0.5 * rx, cy = t.y + (sun.lean[1] / n) * 0.4 * ry;
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) continue;
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
    if (dx * dx + dy * dy > (1 + 0.15 * Math.sin(a * 5 + t.salt) + 0.1 * n1(a * 2, t.salt)) ** 2) continue;
    const k = ctx.kindAt(x, y);
    if (!k || (on && !on.has(k))) continue;
    g.set(x, y, ctx.shade(g.get(x, y), k));
  }
}

/** The limbs and the crown of a tree (not a bush), as they go on the front layer. */
function treeArt(t: Planted, ink: Ink, bark: [string, string, string, string], sh: Shade = FLAT): { limbs: Scratch; crown: Scratch } {
  if (t.kind === 'ginkgo') return ginkgoTree(t, ink, bark, sh);
  if (t.kind === 'willow') return willowTree(t, ink, bark, sh);
  if (t.kind === 'crag') return cragTree(t, ink, bark, sh);
  return t.kind === 'pine' ? pineTree(t, ink, bark, sh) : roundTree(t, ink, bark, sh);
}

function trunk(g: Layer, t: Planted, bark: [string, string, string, string]): [number, number][] {
  const [bl, bm, bd, line] = bark, { x: fx, y: fy } = t;
  const { lean, belly, tw } = frame(t), px: [number, number][] = [];
  // from the foot up to the fork it leans; at the foot it widens into roots
  const x0 = (y: number) => Math.round(fx + lean * (fy - y) / (fy - belly) - tw / 2);
  for (let y = belly - 1; y <= fy; y++) {
    // where it steps sideways the row takes in the row above too: no notch in the bark
    const flare = y === fy ? 2 : y >= fy - 2 ? 1 : 0;
    const a = Math.min(x0(y), x0(y - 1)) - flare, b = Math.max(x0(y), x0(y - 1)) + tw - 1 + flare;
    for (let x = a; x <= b; x++) {
      let c = x === a ? bl : x === b ? bd : bm;
      if (y <= belly) c = bd;                                           // in the shade of the crown
      else if (c === bm && h2(x, Math.floor(y / 2), 2351) < 0.2) c = bd; // the bark in scales
      g.set(x, y, c);
      px.push([x, y]);
    }
    g.set(a - 1, y, line);
    g.set(b + 1, y, line);
    px.push([a - 1, y], [b + 1, y]);
  }
  return px;
}

/** The px a tree hides from above: its crown and the round shadow at its foot (0.6 × the crown wide). A bush hides nothing. */
export function crownCover(t: Planted): [number, number][] {
  if (t.kind === 'bush') return [];
  const { limbs, crown } = treeArt(t, ['a', 'b', 'c', 'd', 'e'], ['f', 'g', 'h', 'i']);
  const out: [number, number][] = [];
  for (const [x, y] of limbs.each()) out.push([x, y]);
  for (const [x, y] of crown.each()) out.push([x, y]);
  // a crag's shadow is a small blot by its foot (cragShadow), not the pool of a full crown
  const crag = t.kind === 'crag', rx = (crag ? 0.3 : 0.6) * t.w, ry = (crag ? 0.12 : 0.32) * t.w + 1, cx = t.x + 0.1 * t.w, cy = t.y - 1;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) out.push([x, y]);
  }
  return out;
}

function plant(ctx: Ctx, st: GroveStep): Planted[] {
  const { W, H, cell } = ctx, salt = st.salt ?? 2300;
  // cells no crown (nor its shadow) covers: where someone stands or something is (the occupied cells of the game) and `keep`
  const kept: [number, number, number, number][] = [
    ...(ctx.game.occupied ?? []).map(([u, v]): [number, number, number, number] => [u, v, 1, 1]),
    ...(st.keep ?? []).map(([u, v, w, h]): [number, number, number, number] => [u, v, w ?? 1, h ?? 1]),
  ].map(([u, v, w, h]) => { const [x0, y0] = ctx.P(u, v); return [x0 + 1, y0 + 1, x0 + w * cell - 1, y0 + h * cell - 1]; });
  // boxes of standing things (a sprite drawn under the crowns): only a tree behind them, its foot above the bottom, may not cover them
  const behind = (st.behind ?? []).map(([u, v, w, h]): [number, number, number, number, number] => {
    const [x0, y0] = ctx.P(u, v);
    return [x0 + 1, y0 + 1, x0 + w * cell - 1, y0 + h * cell - 1, y0 + h * cell];
  });
  const hides = (t: Planted): boolean => {
    if (t.kind === 'bush') return false;
    const boxes = [...kept, ...behind.filter((b) => t.y < b[4]).map(([x0, y0, x1, y1]): [number, number, number, number] => [x0, y0, x1, y1])];
    if (!boxes.length) return false;
    const reach = t.h + t.w;
    const near = boxes.filter(([x0, y0, x1, y1]) => x1 > t.x - reach && x0 < t.x + reach && y1 > t.y - reach && y0 < t.y + reach);
    if (!near.length) return false;
    return crownCover(t).some(([x, y]) => near.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1));
  };
  const [s0, s1] = st.size ?? [2, 4];
  const out: Planted[] = [];
  if (st.into) throw new Error(`map: grove: "into": "${st.into}" belongs to a sub-recipe laid by a place step (its trees join that grove of the mother)`);
  const make = (x: number, y: number, kind: TreeKind, hc: number, k: number, own?: number, plain = false, tilt?: number): Planted => {
    const h = kind === 'bush' ? Math.max(6, Math.round(hc * cell)) : Math.max(20, Math.round(hc * cell)), ts = own ?? salt + k * 13;
    const w = crownWidth(kind, h, ts), tl = kind === 'crag' && tilt !== undefined ? { tilt } : {};
    if (plain || kind === 'bush' || !st.crowns) return { x, y, h, w, kind, salt: ts, ...tl };
    const t: Planted = { x, y, h, w: Math.round(w * (st.crowns.spread ?? 1)), kind, salt: ts, ...tl };
    if (st.crowns.low !== undefined && kind !== 'pine') t.low = st.crowns.low;
    return t;
  };
  (st.trees ?? []).forEach((tr, i) => {
    const [u, v] = tr, [x, y] = ctx.P(u, v);
    const kind = tr[2] ?? pickKind(st.kinds, h2(i, 4, salt));
    const hc = tr[3] ?? s0 + (s1 - s0) * h2(i, 3, salt);
    const t = make(Math.round(x), Math.round(y), kind, hc, i, tr[4], false, tr[5]);
    if (hides(t)) throw new Error(`map: grove: the crown of tree ${i} [${tr.join(', ')}] (or its shadow) covers an occupied or kept cell, or something it stands behind`);
    out.push(t);
  });
  const on = st.on ? new Set(st.on) : null;
  const occupied = new Set((ctx.game.occupied ?? []).map(([u, v]) => `${u},${v}`));
  const clear = st.clear ?? [];
  const avoid = (st.avoid ?? []).map(id => {
    const m = ctx.masks.get(id);
    if (!m) throw new Error(`map: grove: no mask "${id}" before it`);
    return m;
  });
  // does the taller crown reach a px of an `avoid` mask the crown of its own size does not?
  const grows = (tall: Planted, own: Planted): boolean => {
    if (!avoid.length) return false;
    const had = new Set(crownCover(own).map(([x, y]) => y * W + x));
    return crownCover(tall).some(([x, y]) => !had.has(y * W + x) && avoid.some(m => m.has(x, y)));
  };
  const dists = new Map<string, Int32Array>();
  // the trees of a zone draw their shape from their own try, not from how many were planted before them
  const byCount = ctx.recipe.scatter_draws === 'stream';
  (st.zones ?? []).forEach((z, zi) => {
    const m = ctx.masks.get(z.within);
    if (!m) throw new Error(`map: grove: no mask "${z.within}" before it`);
    if (!dists.has(z.within)) {
      const edged = m.clone();                    // the edge of the picture is a border too
      for (let x = 0; x < W; x++) { edged.set(x, 0, false); edged.set(x, H - 1, false); }
      for (let y = 0; y < H; y++) { edged.set(0, y, false); edged.set(W - 1, y, false); }
      dists.set(z.within, distanceIn(edged));
    }
    const dist = dists.get(z.within)!;
    const [b0, b1] = z.band ?? [2, 40], zs = z.salt ?? 2400 + zi, sp = z.spacing ?? 14;
    const [z0, z1] = z.size ?? [s0, s1];
    let placed = 0;
    // the group each tree of this zone belongs to (groups: a tree keeps `gap` off the trees of the other groups)
    const group = new Map<Planted, number>();
    const [g0, g1, gap] = z.groups ?? [1, 1, 0];
    // a foot at (x, y) drawn with draw k: the tree, or null when it may not stand there
    const tryAt = (x: number, y: number, k: number, g: number): Planted | null => {
      if (x < 0 || y < 0 || x >= W || y >= H) return null;
      const d = dist[y * W + x];
      if (d < b0 || d > b1) return null;
      const u = Math.floor((x - ctx.ox) / cell), v = Math.floor((y - ctx.oy) / cell);
      if (z.box && (u < z.box[0] || v < z.box[1] || u >= z.box[2] || v >= z.box[3])) return null;
      for (let dy = -6; dy <= 0; dy += 2) for (let dx = -3; dx <= 3; dx += 3) {
        const kd = ctx.kindAt(x + dx, y + dy);
        if (!kd || (on && !on.has(kd))) return null;
      }
      const inGrid = u >= 0 && v >= 0 && u < ctx.game.width && v < ctx.game.height;
      if (inGrid && !z.walkable && ctx.walk[v * ctx.game.width + u] === 1) return null;
      if (occupied.has(`${u},${v}`)) return null;
      const cu = (x - ctx.ox) / cell, cv = (y - ctx.oy) / cell;
      if (clear.some(c => Math.hypot(cu - (c[0] + 0.5), cv - (c[1] + 0.5)) < (c[2] ?? 1.5))) return null;
      for (const am of avoid) for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) if (am.has(x + dx, y + dy)) return null;
      const kind = pickKind(z.kinds ?? st.kinds, h2(k, 4, zs));
      // a tree does not make room for the bushes (adding bushes never moves a tree); a bush keeps off everything
      if (out.some(p => (kind === 'bush' || p.kind !== 'bush') && Math.hypot(p.x - x, p.y - y) < sp)) return null;
      // groups: open grass between them (only the trees of this zone's other groups and the trees not of this zone count)
      if (gap > 0 && out.some(p => p.kind !== 'bush' && group.get(p) !== g && Math.hypot(p.x - x, p.y - y) < gap)) return null;
      // out: the foot moves this far out of the mask (down its distance), a bush spilling over the lip; never over a north lip
      let fx = x, fy = y;
      if (z.out) {
        const gx = dist[y * W + Math.min(W - 1, x + 2)] - dist[y * W + Math.max(0, x - 2)];
        const gy = dist[Math.min(H - 1, y + 2) * W + x] - dist[Math.max(0, y - 2) * W + x];
        const gl = Math.hypot(gx, gy);
        if (gl > 0 && -gy / gl > -0.35) { fx = Math.round(x - (gx / gl) * z.out); fy = Math.round(y - (gy / gl) * z.out); }
      }
      // the salt of its shape: a draw of its own try (so a bush that no longer fits by a path does not re-draw the
      // shape of every bush after it, as the count of those planted before did: `scatter_draws: "stream"`)
      const hc = z0 + (z1 - z0) * h2(k, 3, zs), ts = byCount ? 1000 + zi * 500 + placed : Math.trunc(h2(k, 13, zs) * 0x1000000);
      // tall: some trees of the zone this much taller (a draw of its own: the other draws, and so the feet, do not
      // change); one that would then cover what is kept stays at its size, so the trunks never move because of it
      // (nor one whose taller crown would reach a mask of `avoid` its own size did not: a path, a place)
      const f = kind === 'bush' || z.ranks ? 1 : tallFactor(z.tall, h2(k, 12, zs));
      let t: Planted | null = f !== 1 ? make(fx, fy, kind, hc * f, ts) : null;
      if (t && (hides(t) || grows(t, make(fx, fy, kind, hc, ts)))) t = null;
      if (t) t.tall = f;
      if (!t) {
        t = make(fx, fy, kind, hc, ts);
        // a zone tree whose larger crown (`crowns`) would cover what is kept stays, with the crown it always had: the
        // trees of a zone (and the trunks a game blocks) do not move because the crowns grew
        if (hides(t) && st.crowns) t = make(fx, fy, kind, hc, ts, undefined, true);
        if (hides(t)) return null;
      }
      if (fx !== x || fy !== y) t.spill = true;
      drawn.set(t, hc);
      return t;
    };
    const drawn = new Map<Planted, number>();      // the height in cells each tree of the zone was drawn with
    const plantOne = (t: Planted, g: number) => { out.push(t); group.set(t, g); placed++; };
    // ranks: the trees of a group sized by where they stand once the group is whole: back to front (by the row of the
    // foot) `group[0]`, `group[1]`…, and one near a mask of `avoid` (a path, a place) at most `near[1]`. Only the
    // crowns change: the feet were all drawn before, so no later foot moves; one that would then cover what is kept
    // or reach a mask of `avoid` its own crown did not keeps its size
    const nearAvoid = (t: Planted, r: number): boolean => {
      for (let dy = -r; dy <= r; dy += 3) for (let dx = -r; dx <= r; dx += 3) {
        if (dx * dx + dy * dy > r * r) continue;
        if (avoid.some(m => m.has(t.x + dx, t.y + dy))) return true;
      }
      return false;
    };
    const rank = (mine: Planted[]) => {
      if (!z.ranks) return;
      const ranked = mine.filter(t => t.kind !== 'bush').sort((a, b) => a.y - b.y || a.x - b.x);
      const fs = z.ranks.group, [nc, nf] = z.ranks.near ?? [0, 0];
      ranked.forEach((t, r) => {
        let f = fs[Math.min(r, fs.length - 1)];
        if (nc > 0 && f > nf && nearAvoid(t, Math.round(nc * cell))) f = nf;
        if (f === 1) return;
        const hc = drawn.get(t)!, s = make(t.x, t.y, t.kind, hc * f, t.salt);
        if (hides(s) || (f > 1 && grows(s, t))) return;
        s.tall = f;
        if (t.spill) s.spill = true;
        out[out.indexOf(t)] = s;
        group.set(s, group.get(t)!);
      });
    };
    for (let k = 0; k < z.count * 60 && placed < z.count; k++) {
      const x = Math.trunc(h2(k, 1, zs) * W), y = Math.trunc(h2(k, 2, zs) * H);
      const t = tryAt(x, y, k, k);
      if (!t) continue;
      plantOne(t, k);
      if (!z.groups) { rank([t]); continue; }
      // the rest of the group, around the first: `spacing` to 1.7 × `spacing` from a tree already in it
      const want = g0 + Math.trunc(h2(k, 6, zs) * (g1 - g0 + 1)) - 1;
      const mine = [t];
      for (let j = 0, got = 0; j < 24 && got < want && placed < z.count; j++) {
        const from = mine[Math.trunc(h2(k * 31 + j, 7, zs) * mine.length)];
        const a = h2(k * 31 + j, 8, zs) * Math.PI * 2, r = sp * (1 + 0.7 * h2(k * 31 + j, 9, zs));
        const c = tryAt(Math.round(from.x + Math.cos(a) * r), Math.round(from.y + Math.sin(a) * r * 0.75), 100000 + k * 31 + j, k);
        if (!c) continue;
        plantOne(c, k);
        mine.push(c);
        got++;
      }
      rank(mine);
    }
  });
  return out;
}

/** The factor of `tall` a draw r in [0, 1) falls in: the odds in order, the rest 1. */
export function tallFactor(tall: [number, number][] | undefined, r: number): number {
  let acc = 0;
  for (const [odds, factor] of tall ?? []) {
    acc += odds;
    if (r < acc) return factor;
  }
  return 1;
}

export function runGrove(ctx: Ctx, st: GroveStep): Planted[] {
  const crown = ctx.layer(st.layer ?? 'copas'), g = ctx.ground;
  const leaves: Ink = st.leaves ?? ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'bambú claro'];
  const needles: Ink = st.needles ?? ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'bambú claro'];
  const blossom: Ink = st.blossom ?? ['túnica noche', 'flor sombra', 'flor', 'flor clara', 'túnica luz'];
  const bark = st.bark ?? ['madera clara', 'madera', 'madera sombra', 'túnica noche'];
  const bush: Ink = st.bush ?? leaves;
  const ginkgo: Ink = st.ginkgo ?? ['túnica noche', 'bronce', 'oro', 'oro claro', 'fuego luz'];
  const willow: Ink = st.willow ?? ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'niebla sombra'];
  const paleBark = st.pale_bark ?? ['piedra clara', 'piedra', 'piedra sombra', bark[3]];
  const inkOf = (k: TreeKind): Ink => k === 'pine' || k === 'crag' ? needles : k === 'plum' ? blossom : k === 'ginkgo' ? ginkgo : k === 'willow' ? willow : leaves;
  // a crag's bark is darker than a broadleaf's: its lit side one step down, the rest dark
  const barkOf = (k: TreeKind): [string, string, string, string] => k === 'ginkgo' ? paleBark : k === 'crag' ? [bark[1], bark[2], bark[2], bark[3]] : bark;
  const trees = plant(ctx, st).sort((a, b) => a.y - b.y || a.x - b.x);
  // with `crowns`, a tree's pool is as wide as its crown as drawn (a pine's tiers reach past its width, a broadleaf's
  // masses fall short of it); without, as wide as its width, as always
  const drawn = new Map<Planted, number>();
  // with the sun, its `contrast`: more of each crown on the side away from the light, in shade
  const dark = ctx.sun?.contrast ?? 0;
  const sh: Shade = { dark, fall: st.crowns?.fall ?? 0, under: st.crowns?.under ?? 0, snow: st.snow };
  for (const t of trees) {
    if (t.kind === 'bush') {
      // low: on the ground, behind people; nothing scattered later lands on it
      for (const [x, y, c] of bushCrown(t, bush, dark).each()) { g.set(x, y, c); ctx.setKind(x, y, ''); }
      continue;
    }
    const bark = trunk(g, t, barkOf(t.kind));
    for (const [x, y] of bark) {
      ctx.setKind(x, y, '');   // nothing scattered later lands on the bark
      if (ctx.sun && st.shadows !== false) castStanding(ctx, x, y, t.y - y);
    }
    registerFooted(ctx, 'grove', 'trunk', bark, { id: st.id, ink: [barkOf(t.kind)[3]] });
    const art = treeArt(t, inkOf(t.kind), barkOf(t.kind), sh);
    for (const [x, y, c] of art.limbs.each()) crown.set(x, y, c);   // the branches, under the leaves
    for (const [x, y, c] of art.crown.each()) crown.set(x, y, c);
    if (st.crowns) {
      let x0 = Infinity, x1 = -Infinity;
      for (const [x] of art.crown.each()) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      if (x1 >= x0) drawn.set(t, x1 - x0 + 1);
    }
  }
  if (st.drape) {
    // green hanging from the lip of a cliff under a crown that leans over it
    const [faces, longest] = st.drape, face = new Set(faces), [outline, shadow, mid, light] = leaves;
    for (const t of trees) {
      if (t.kind === 'bush' && !t.spill) continue;   // a bush hangs green only where it spills over the lip
      const half = Math.round(t.w / 2);
      for (let x = t.x - half; x <= t.x + half; x++) {
        let lip = -1;
        for (let y = t.y - 4; y <= t.y + 20; y++) if (face.has(ctx.kindAt(x, y)) && !face.has(ctx.kindAt(x, y - 1))) { lip = y; break; }
        if (lip < 0) continue;
        const sn = Math.sin(Math.PI * (x - (t.x - half) + 0.5) / (2 * half + 1));
        const len = Math.round(longest * sn ** 0.8 * (0.45 + 0.55 * h2(x, 1, t.salt + 2381)) + 1.5 * (h2(x, 2, t.salt + 2381) - 0.5));
        for (let j = 0; j <= len; j++) {
          const y = lip + j;
          if (!face.has(ctx.kindAt(x, y))) break;
          g.set(x, y, j === len ? outline : j === 0 ? light : j < len * 0.45 ? mid : shadow);
        }
      }
    }
  }
  if (ctx.sun && st.shadows !== false) for (const t of trees) {
    // the sun: the crown seen from above, swept from where the leaves start to the top (a bush, from the ground)
    const [kx, ky] = ctx.sun.crown;
    if (t.kind === 'bush') castOval(ctx, t.x, t.y - 0.25 * t.w, 0.5 * t.w, 0.25 * t.w + 1, 0, t.h, t.salt);
    else {
      const w = drawn.get(t) ?? t.w;
      // a willow's curtains come down almost to the ground: its shadow is swept from there
      const willow = t.kind === 'willow';
      if (t.kind === 'crag') { cragShadow(ctx, t); continue; }
      castOval(ctx, willow ? t.x + 1.25 * frame(t).lean : t.x, t.y - 0.35 * ky * w, kx * w, ky * w + 1, willow ? 3 : t.y - frame(t).belly, t.h, t.salt);
    }
  }
  if (st.shadows !== false) for (const t of trees) ctx.trees.push({ x: t.x, y: t.y, w: t.w, low: t.kind === 'bush' });
  return trees;
}
