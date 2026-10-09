// Single carved things on the ground, each a drawing with its rules:
// - dais: a round stone platform with a south face, a lit lip, a carved ring,
//   the eight trigrams (Fu Xi order: ☰ up, ☷ down, ☲ left, ☵ right) around a
//   carved center, and its shadow down-right (the shaded pixels change
//   material, so what comes after knows they are in shadow); as a bagua it can
//   be an octagon, take its own eight trigrams (any order, from the north
//   clockwise, each carved with a lit lip below) and a yin-yang at the center;
// - slab: an old stone with cut corners, its lit edge, a crack and moss on the
//   lit corner;
// - roots: roots that leave the foot of a trunk and sink into the earth (the
//   grass they cross becomes earth), with a shadow below.
// Port of the sect script of The Unwritten Dao (scripts/suelo_secta.py).

import { Mask, catmull, fbm, n1, pyRound, radians, type Pt } from '../mapnoise';
import { stoneRoles, type Ctx } from '../mappaint';
import { ash, frost, stoneRing } from './grove';
import type { FeatureStep } from './schema';
import { shade as sunShade, sunOn } from './sun';

const SALT = { dais: 471, slab: 481, roots: 500, ring: 251, frost: 262, ash: 271 };

export function runFeature(ctx: Ctx, st: FeatureStep, seed: number): void {
  const salt = st.seed === undefined ? seed + SALT[st.what] : seed;
  if (st.what === 'dais') return dais(ctx, st, salt);
  if (st.what === 'slab') return slab(ctx, st, salt);
  if (st.what === 'ring') return stoneRing(ctx, st, salt);
  if (st.what === 'frost') return frost(ctx, st, salt);
  if (st.what === 'ash') return ash(ctx, st, salt);
  return roots(ctx, st, salt);
}

const TRIGRAMS: [number, number[]][] = [[0, [1, 1, 1]], [45, [0, 1, 1]], [90, [0, 1, 0]], [135, [0, 0, 1]],
  [180, [0, 0, 0]], [225, [1, 0, 0]], [270, [1, 0, 1]], [315, [1, 1, 0]]];

/** A bagua trigram: three bars, `lines` from top to bottom ('1' solid, '0' broken); the bottom one goes towards
 * the center. Returns the pixel offsets of each bar from the middle of the trigram, at direction k (0 north, 1
 * north-east, … clockwise): north and south are horizontal bars of 8 px, east and west vertical bars of 6 px (the
 * disc is seen in perspective: what runs north-south shrinks), the diagonals stairs of 8 px at 2:1. A broken bar
 * loses its middle two pixels (3+2+3, 2+2+2). Bars are one pixel of gap apart. */
export function trigramPixels(k: number, lines: string): Pt[][] {
  const out = k === 0 || k === 7 || k === 1 ? -1 : k === 2 ? 1 : k === 6 ? -1 : 1;
  const bars: Pt[][] = [];
  for (let i = 0; i < 3; i++) {
    const solid = lines[2 - i] === '1', off = 2 * (i - 1) * out || 0;
    const px: Pt[] = [];
    if (k === 0 || k === 4) {
      for (let x = -4; x < 4; x++) if (solid || (x !== -1 && x !== 0)) px.push([x, off]);
    } else if (k === 2 || k === 6) {
      for (let y = -3; y < 3; y++) if (solid || (y !== -1 && y !== 0)) px.push([off, y]);
    } else {
      // a 2:1 stair, the next bar one over and two up (or down): parallel, and no pixel of one touches the other
      // (the east ones one pixel further east: the stair is 8 wide, so its middle falls between pixels)
      const east = k === 1 || k === 3, down = k === 1 || k === 5 ? 1 : -1, ox = (i - 1) * (east ? 1 : -1) + (east ? 1 : 0);
      for (let x = -4; x < 4; x++) if (solid || (x !== -1 && x !== 0)) px.push([x + ox, down * (Math.floor((x + 4) / 2) - 2) + off]);
    }
    bars.push(px);
  }
  return bars;
}

function dais(ctx: Ctx, st: FeatureStep, salt: number): void {
  const { W, H } = ctx, g = ctx.ground, s = stoneRoles(ctx, st.material);
  const [pcx, pcy] = ctx.P(st.at[0], st.at[1]);
  const [prx, pry] = st.size ?? [22, 17];
  const FACE = st.face ?? 3;
  // the radius of a point (1 on the rim): an ellipse, or an octagon with its corners on it and a side facing each
  // of the eight directions
  const COS8 = Math.cos(Math.PI / 8), D = Math.SQRT1_2;
  const rad = st.octagon
    ? (dx: number, dy: number) => Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy) * D, Math.abs(dx - dy) * D) / COS8
    : (dx: number, dy: number) => Math.hypot(dx, dy);
  const disc = new Map<number, 'top' | 'face'>();
  const key = (x: number, y: number) => y * W + x;
  const inDisc = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && disc.has(key(x, y));
  for (let y = Math.trunc(pcy - pry) - 2; y < Math.trunc(pcy + pry + FACE) + 3; y++) {
    for (let x = Math.trunc(pcx - prx) - 2; x < Math.trunc(pcx + prx) + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x + 0.5 - pcx) / prx, dy = (y + 0.5 - pcy) / pry;
      if (rad(dx, dy) <= 1.0) disc.set(key(x, y), 'top');
      else {
        // the face: the disc lowered FACE px
        const dy2 = (y + 0.5 - FACE - pcy) / pry;
        if (rad(dx, dy2) <= 1.0 && dy > 0) disc.set(key(x, y), 'face');
      }
    }
  }
  for (const [k, part] of disc) {
    const x = k % W, y = Math.floor(k / W);
    let c: string;
    if (part === 'face') {
      const below = !inDisc(x, y + 1);
      c = below || !inDisc(x - 1, y) || !inDisc(x + 1, y) ? s.line : inDisc(x, y - 1) && disc.get(key(x, y - 1)) === 'top' ? s.shadow : s.dark;
    } else {
      const dx = (x + 0.5 - pcx) / prx, dy = (y + 0.5 - pcy) / pry;
      const r = rad(dx, dy);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => !inDisc(x + i, y + j));
      if (edge) c = dx + dy > 0.2 ? s.dark : s.shadow;
      else if (r > 0.9) c = dx + dy < -0.3 ? s.high : dx + dy < 0.4 ? s.light : s.mid;   // the lip
      else if (r > 0.83) c = s.shadow;                                                   // the carved ring
      else {
        const v = fbm(x / 5.0, y / 4.0, salt, 2);
        // a bagua is dressed stone: calmer, so its carving reads
        if (st.trigrams) c = v > 0.66 && dx + dy < -0.2 ? s.high : s.light;
        else c = v > 0.55 ? s.light : v > 0.47 && dx + dy < 0 ? s.high : v > 0.38 ? s.light : s.speck;
      }
    }
    g.set(x, y, c);
    ctx.setKind(x, y, st.material);
  }
  const onTop = (x: number, y: number) => inDisc(x, y) && disc.get(key(x, y)) === 'top';
  if (st.trigrams) {
    // the bagua: each trigram a groove one tone under the stone with its lit lip below (and to the right of the
    // upright bars), its middle bar at `trigramAt` of the radius
    const at = st.trigramAt ?? 0.6;
    st.trigrams.forEach((lines, k) => {
      const a = radians(45 * k), mx = Math.round(pcx + Math.sin(a) * at * prx - 0.5), my = Math.round(pcy - Math.cos(a) * at * pry - 0.5);
      const pts = trigramPixels(k, lines).flat().map(([x, y]) => [mx + x, my + y] as Pt);
      const bar = new Set(pts.map(([x, y]) => key(x, y)));
      for (const [x, y] of pts) {
        const lips: Pt[] = k === 2 || k === 6 ? [[x, y + 1], [x + 1, y]] : [[x, y + 1]];
        for (const [lx, ly] of lips) if (!bar.has(key(lx, ly)) && onTop(lx, ly)) g.set(lx, ly, s.high);
      }
      for (const [x, y] of pts) if (onTop(x, y)) g.set(x, y, s.shadow);
    });
  } else {
    // the trigrams: three tangent strokes each, the bottom one towards the center
    for (const [ang, lines] of TRIGRAMS) {
      const a = radians(ang);
      const ux = Math.sin(a), uy = -Math.cos(a), tx = Math.cos(a), ty = Math.sin(a);
      lines.forEach((solid, i) => {
        const rad = 0.40 + 0.16 * i;
        for (let k = -6; k < 7; k++) {
          const t = k / 2.0;
          if (!solid && Math.abs(t) < 0.9) continue;
          const x = Math.trunc(pyRound(pcx + ux * rad * prx + tx * t * 1.15 - 0.5));
          const y = Math.trunc(pyRound(pcy + uy * rad * pry + ty * t * 0.9 - 0.5));
          if (onTop(x, y)) g.set(x, y, s.shadow);
        }
      });
    }
  }
  if (st.taiji) taiji(ctx, s, pcx, pcy, 7 * prx / 40, 7 * pry / 40);
  else {
    // the center: a carved circle with its dot
    for (let x = Math.trunc(pcx) - 4; x < Math.trunc(pcx) + 5; x++) {
      for (let y = Math.trunc(pcy) - 4; y < Math.trunc(pcy) + 5; y++) {
        const r = Math.hypot((x + 0.5 - pcx) / 1.15, (y + 0.5 - pcy) / 0.9);
        if (r >= 3.0 && r < 4.0) g.set(x, y, s.shadow);
        else if (r < 3.0) g.set(x, y, x < pcx ? s.high : s.light);
      }
    }
  }
  // its shadow down-right, on what it lands on
  const onto = st.shadow ?? {};
  for (const k of disc.keys()) {
    const x = k % W, y = Math.floor(k / W);
    for (let d = 1; d < 4; d++) {
      const X = x + d, Y = y + d;
      if (inDisc(X, Y) || X >= W || Y >= H) continue;
      const was = ctx.kindAt(X, Y), to = onto[was];
      if (to === undefined) continue;
      if (ctx.sun) { sunOn(ctx, [to]); sunShade(ctx, X, Y); } else g.set(X, Y, ctx.shade(g.get(X, Y), was));
      ctx.setKind(X, Y, to);
    }
  }
}

/** The yin-yang carved at the center of a bagua: the lit half (the west, towards the light) and the half in shadow
 * curling into each other, each with the dot of the other, inside a carved ring. */
function taiji(ctx: Ctx, s: ReturnType<typeof stoneRoles>, cx: number, cy: number, rx: number, ry: number): void {
  const g = ctx.ground, inside = new Set<string>();
  const X = (x: number) => (x + 0.5 - cx) / rx, Y = (y: number) => (y + 0.5 - cy) / ry;
  for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++)
    for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) if (Math.hypot(X(x), Y(y)) <= 1) inside.add(`${x},${y}`);
  for (const p of inside) {
    const [x, y] = p.split(',').map(Number), u = X(x), v = Y(y);
    const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => !inside.has(`${x + i},${y + j}`));
    // shadow: the east half, plus the head of the north lobe, minus the head of the south one
    const dark = Math.hypot(u, v + 0.5) < 0.5 || (u > 0 && !(Math.hypot(u, v - 0.5) < 0.5));
    g.set(x, y, rim ? s.dark : dark ? s.shadow : s.high);
  }
  // the two dots, one pixel each at least: lit in the shadow's head, shadow in the light's
  g.set(Math.floor(cx), Math.floor(cy - ry / 2), s.high);
  g.set(Math.floor(cx), Math.floor(cy + ry / 2), s.shadow);
}

function slab(ctx: Ctx, st: FeatureStep, salt: number): void {
  const { W, H } = ctx, g = ctx.ground, s = stoneRoles(ctx, st.material);
  const moss = ctx.mat(st.material).moss ?? [s.shadow, s.mid, s.light];
  const [lx, ly] = ctx.P(st.at[0], st.at[1]);
  const [hx, hy] = st.size ?? [7, 5.5], [kx, ky] = st.corner ?? [6, 4.5];
  const mask = new Mask(W, H);
  for (let y = Math.trunc(ly - hy) - 2; y < Math.trunc(ly + hy) + 3; y++) for (let x = Math.trunc(lx - hx) - 2; x < Math.trunc(lx + hx) + 3; x++) {
    const dx = Math.abs(x + 0.5 - lx), dy = Math.abs(y + 0.5 - ly);
    if (dx <= hx && dy <= hy && !(dx > kx && dy > ky)) mask.set(x, y);
  }
  if (st.id) ctx.masks.set(st.id, mask);
  const out = (x: number, y: number) => !mask.has(x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    let c: string;
    if (out(x, y + 1) || out(x + 1, y)) c = s.line;
    else if (out(x, y + 2) || out(x + 2, y)) c = s.shadow;
    else if (out(x - 1, y) || out(x, y - 1)) c = s.high;
    else c = fbm(x / 4.0, y / 3.0, salt, 2) > 0.5 ? s.light : s.speck;
    g.set(x, y, c);
    ctx.setKind(x, y, st.material);
  }
  // a crack, and moss on the lit corner
  for (let k = 0; k < 7; k++) {
    const X = Math.trunc(lx - 2 + k * 0.6), Y = Math.trunc(ly - 4 + k);
    if (mask.has(X, Y)) g.set(X, Y, s.dark);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask.has(x, y) && (x - lx) + (y - ly) < -8.5 && g.get(x, y) !== s.line) g.set(x, y, (x + y) % 3 ? moss[1] : moss[2]);
  }
}

function roots(ctx: Ctx, st: FeatureStep, salt: number): void {
  const { W, H } = ctx, g = ctx.ground, earth = st.material;
  const [lit, dark] = st.wood ?? ['madera', 'madera sombra'];
  const [px, py] = ctx.P(st.at[0], st.at[1]);
  const avoid = st.avoid ? ctx.masks.get(st.avoid) : undefined;
  const grass = ctx.byTexture('patches');
  const b = ctx.base(earth), top = ctx.mat(earth).ramp.length - 1;
  const curves: Pt[][] = (st.roots ?? []).map(([ang, ln], k) => {
    const a = radians(ang);
    const pts: Pt[] = [[px + Math.cos(a) * 3, py + 1 + Math.sin(a) * 1.5]];
    for (let s = 1; s < 5; s++) {
      const r = ln * s / 4.0;
      pts.push([px + Math.cos(a) * r + 2 * n1(s, salt + k), py + 1 + Math.sin(a) * r * 0.55 + n1(s, salt + 10 + k)]);
    }
    return catmull(pts);
  });
  for (const curve of curves) {
    const n = curve.length;
    curve.forEach(([cx, cy], i) => {
      const w = 1.3 * (1 - i / n) + 0.5;
      for (let x = Math.trunc(cx - w); x < Math.trunc(cx + w) + 1; x++) {
        for (let y = Math.trunc(cy - w * 0.6); y < Math.trunc(cy + w * 0.6) + 1; y++) {
          if (x < 0 || y < 0 || x >= W || y >= H || avoid?.has(x, y)) continue;
          g.set(x, y, y + 0.5 - cy < -w * 0.2 ? lit : dark);
          if (grass && ctx.kindAt(x, y) === grass) ctx.setKind(x, y, earth);
        }
      }
      // the shadow of the root, below, on the lighter earth
      const X = Math.trunc(cx), Y = Math.trunc(cy + w * 0.6) + 1;
      const c = g.get(X, Y), i2 = c ? ctx.mat(earth).ramp.indexOf(c) : -1;
      if (Y >= 0 && Y < H && !avoid?.has(X, Y) && i2 >= b && i2 <= top) g.set(X, Y, ctx.tone(earth, b - 1));
    });
  }
}
