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

/** A tree as planted: the foot of its trunk (px), its height and crown width (px). */
export interface Planted {
  x: number; y: number; h: number; w: number; kind: TreeKind; salt: number; spill?: boolean;
  /** the factor of `tall` it grew by (a zone tree) */
  tall?: number;
  /** where a broadleaf's crown starts, as a fraction of its height from the foot (default 0.3; a pine, 0.16) */
  low?: number;
}

type Ink = [string, string, string, string, string];   // outline, shadow, mid, light, glint

const DEFAULT_KINDS = { round: 0.7, pine: 0.27, plum: 0.03, bush: 0 };

function pickKind(w: { round?: number; pine?: number; plum?: number; bush?: number } | undefined, r: number): TreeKind {
  const k = { ...DEFAULT_KINDS, ...(w ?? {}) };
  const total = k.round + k.pine + k.plum + k.bush;
  let a = r * total;
  if ((a -= k.round) < 0) return 'round';
  if ((a -= k.pine) < 0) return 'pine';
  if ((a -= k.plum) < 0) return 'plum';
  return 'bush';
}

/** The crown width a tree of this kind and height gets (px). */
export function crownWidth(kind: TreeKind, h: number, salt: number): number {
  const v = h2(salt, 11, 2311);
  if (kind === 'bush') return Math.round(h * (1.3 + 0.3 * v));
  if (kind === 'pine') return Math.round((h - Math.round(h * 0.16)) * (0.7 + 0.12 * v));
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
  const belly = fy - Math.round(h * (kind === 'pine' ? 0.16 : t.low ?? 0.3)), top = fy - h + 1;
  // the big branch opens to one side or the other, and the trunk leans a little, by the salt of the tree
  const side = h2(salt, 30, 2391) < 0.5 ? -1 : 1;
  const lean = (h2(salt, 31, 2391) - 0.5) * (kind === 'pine' ? 0.08 : 0.15) * w;
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

/** The limbs and the crown of a tree (not a bush), as they go on the front layer. */
function treeArt(t: Planted, ink: Ink, bark: [string, string, string, string], sh: Shade = FLAT): { limbs: Scratch; crown: Scratch } {
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
  const rx = 0.6 * t.w, ry = 0.32 * t.w + 1, cx = t.x + 0.1 * t.w, cy = t.y - 1;
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
  const make = (x: number, y: number, kind: TreeKind, hc: number, k: number, own?: number, plain = false): Planted => {
    const h = kind === 'bush' ? Math.max(6, Math.round(hc * cell)) : Math.max(20, Math.round(hc * cell)), ts = own ?? salt + k * 13;
    const w = crownWidth(kind, h, ts);
    if (plain || kind === 'bush' || !st.crowns) return { x, y, h, w, kind, salt: ts };
    const t: Planted = { x, y, h, w: Math.round(w * (st.crowns.spread ?? 1)), kind, salt: ts };
    if (st.crowns.low !== undefined && kind !== 'pine') t.low = st.crowns.low;
    return t;
  };
  (st.trees ?? []).forEach((tr, i) => {
    const [u, v] = tr, [x, y] = ctx.P(u, v);
    const kind = tr[2] ?? pickKind(st.kinds, h2(i, 4, salt));
    const hc = tr[3] ?? s0 + (s1 - s0) * h2(i, 3, salt);
    const t = make(Math.round(x), Math.round(y), kind, hc, i, tr[4]);
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
      const hc = z0 + (z1 - z0) * h2(k, 3, zs), ts = 1000 + zi * 500 + placed;
      // tall: some trees of the zone this much taller (a draw of its own: the other draws, and so the feet, do not
      // change); one that would then cover what is kept stays at its size, so the trunks never move because of it
      // (nor one whose taller crown would reach a mask of `avoid` its own size did not: a path, a place)
      const f = kind === 'bush' ? 1 : tallFactor(z.tall, h2(k, 12, zs));
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
      return t;
    };
    const plantOne = (t: Planted, g: number) => { out.push(t); group.set(t, g); placed++; };
    for (let k = 0; k < z.count * 60 && placed < z.count; k++) {
      const x = Math.trunc(h2(k, 1, zs) * W), y = Math.trunc(h2(k, 2, zs) * H);
      const t = tryAt(x, y, k, k);
      if (!t) continue;
      plantOne(t, k);
      if (!z.groups) continue;
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
    for (const [x, y] of trunk(g, t, bark)) {
      ctx.setKind(x, y, '');   // nothing scattered later lands on the bark
      if (ctx.sun && st.shadows !== false) castStanding(ctx, x, y, t.y - y);
    }
    const art = treeArt(t, t.kind === 'pine' ? needles : t.kind === 'plum' ? blossom : leaves, bark, sh);
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
      castOval(ctx, t.x, t.y - 0.35 * ky * w, kx * w, ky * w + 1, t.y - frame(t).belly, t.h, t.salt);
    }
  }
  if (st.shadows !== false) for (const t of trees) ctx.trees.push({ x: t.x, y: t.y, w: t.w, low: t.kind === 'bush' });
  return trees;
}
