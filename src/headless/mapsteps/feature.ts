// Single carved things on the ground, each a drawing with its rules:
// - dais: a round stone platform with a south face, a lit lip, a carved ring,
//   the eight trigrams (Fu Xi order: ☰ up, ☷ down, ☲ left, ☵ right) around a
//   carved center, and its shadow down-right (the shaded pixels change
//   material, so what comes after knows they are in shadow);
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

function dais(ctx: Ctx, st: FeatureStep, salt: number): void {
  const { W, H } = ctx, g = ctx.ground, s = stoneRoles(ctx, st.material);
  const [pcx, pcy] = ctx.P(st.at[0], st.at[1]);
  const [prx, pry] = st.size ?? [22, 17];
  const FACE = st.face ?? 3;
  const disc = new Map<number, 'top' | 'face'>();
  const key = (x: number, y: number) => y * W + x;
  const inDisc = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && disc.has(key(x, y));
  for (let y = Math.trunc(pcy - pry) - 2; y < Math.trunc(pcy + pry + FACE) + 3; y++) {
    for (let x = Math.trunc(pcx - prx) - 2; x < Math.trunc(pcx + prx) + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x + 0.5 - pcx) / prx, dy = (y + 0.5 - pcy) / pry;
      if (dx * dx + dy * dy <= 1.0) disc.set(key(x, y), 'top');
      else {
        // the face: the disc lowered FACE px
        const dy2 = (y + 0.5 - FACE - pcy) / pry;
        if (dx * dx + dy2 * dy2 <= 1.0 && dy > 0) disc.set(key(x, y), 'face');
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
      const r = Math.hypot(dx, dy);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => !inDisc(x + i, y + j));
      if (edge) c = dx + dy > 0.2 ? s.dark : s.shadow;
      else if (r > 0.9) c = dx + dy < -0.3 ? s.high : dx + dy < 0.4 ? s.light : s.mid;   // the lip
      else if (r > 0.83) c = s.shadow;                                                   // the carved ring
      else {
        const v = fbm(x / 5.0, y / 4.0, salt, 2);
        c = v > 0.55 ? s.light : v > 0.47 && dx + dy < 0 ? s.high : v > 0.38 ? s.light : s.speck;
      }
    }
    g.set(x, y, c);
    ctx.setKind(x, y, st.material);
  }
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
        if (inDisc(x, y) && disc.get(key(x, y)) === 'top') g.set(x, y, s.shadow);
      }
    });
  }
  // the center: a carved circle with its dot
  for (let x = Math.trunc(pcx) - 4; x < Math.trunc(pcx) + 5; x++) {
    for (let y = Math.trunc(pcy) - 4; y < Math.trunc(pcy) + 5; y++) {
      const r = Math.hypot((x + 0.5 - pcx) / 1.15, (y + 0.5 - pcy) / 0.9);
      if (r >= 3.0 && r < 4.0) g.set(x, y, s.shadow);
      else if (r < 3.0) g.set(x, y, x < pcx ? s.high : s.light);
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
