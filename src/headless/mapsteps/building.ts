// A building seen from above in three quarters, as steps of a recipe: the roof
// (tiles as a pattern, the ridge, eaves that stand out and throw a band of
// shadow on the wall), the chimney (a stone stack higher than the roof, the oven
// mouth with its fire on a layer, the smoke on another) and the building (a
// plinth of stone, the front wall of plaster and timber, its east side in
// shade, open bays where the inside shows, and its shadow on the ground to the
// south-east, with its roof on top).
//
// The light comes from the north-west, as everywhere in the game: the west
// slope of a north-south ridge is lit, the east one in shade; the west hip of a
// hipped roof lit, the east one in shade; the east side of everything in shade.
// The surfaces of the building are shaded inside their own ramp (a shadow on
// the roof is a tile one tone down), the ground they fall on by the recipe rule.

import { Mask, fbm, h2, n1 } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';
import { rubbleField, rubbleTone } from './parapet';
import { castStanding, shade as sunShade, sunOn, sunTakes } from './sun';
import type { BuildingStep, ChimneyStep, RoofShape, RoofStep, SmokeShape, SmokeStep } from './buildingschema';
import { registerFooted } from './settle';
import { lightToward } from './rockform';
import { thatchOver } from './thatch';

/** How far a side face recedes: px up per px across (the east side of a building, of a chimney). */
const SKEW = 0.5;

/** One px n steps darker: inside the ramp of its own material when it has one, else by the recipe rule. */
export function darkenPx(ctx: Ctx, layer: Layer, x: number, y: number, n: number): void {
  let c = layer.get(x, y);
  if (c === null || n <= 0) return;
  const k = ctx.kindAt(x, y), ramp = k ? ctx.recipe.materials[k]?.ramp : undefined;
  for (let i = 0; i < n; i++) {
    const j: number = ramp ? ramp.indexOf(c) : -1;
    if (j > 0) c = ramp![j - 1];
    else if (j === 0) break;
    else c = ctx.shade(c, k) ?? c;
  }
  layer.set(x, y, c);
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/**
 * Coursed stone: blocks in rows `course` px high, each `block` px long give or take two, the joints of one row off
 * those of the next. Returns the id of the block at a px (≥ 0) or -1 for a joint (the last row of a course and the
 * last px of a block). Deterministic by `salt`.
 */
export function coursedField(salt: number, course = 5, block = 8): (x: number, y: number) => number {
  return (x, y) => {
    const j = Math.floor(y / course);
    if (mod(y, course) === course - 1) return -1;
    const off = Math.floor(h2(j, 0, salt) * block);
    const k0 = Math.floor((x + off) / block);
    // the edge of block k stands a px or two off the even grid
    const edge = (k: number) => k * block - off + Math.round((h2(k, j, salt + 1) - 0.5) * 3);
    let k = k0 + 1;
    while (edge(k) > x) k--;
    while (edge(k + 1) <= x) k++;
    if (x === edge(k + 1) - 1) return -1;
    return (k + 4096) * 8191 + j + 4096;
  };
}

/**
 * Paints a roof over the box x0..x1 (exclusive) × y0..y1 (y0 the top of the ridge, y1 the line of the eaves: the
 * eaves hang under it), on `layer`, and returns the mask of its px. Every px it lays is of the kind of its material.
 */
export function paintRoof(ctx: Ctx, s: RoofShape, x0: number, y0: number, x1: number, y1: number): Mask {
  const { W, H } = ctx, name = s.material;
  const ramp = ctx.mat(name).ramp, n = ramp.length;
  if (n < 6) throw new Error(`map: roof: the material "${name}" needs a ramp of 6 tones at least [ink, deep, shadow, body, light, lit] (has ${n})`);
  const LIT = 5, GLINT = n > 6 ? 6 : 5;
  const T = (i: number) => ramp[Math.max(0, Math.min(n - 1, i))];
  const layer = ctx.layer(s.layer ?? 'ground'), g = ctx.ground;
  const salt = s.salt ?? 1701;
  // (thatch) straw on the same shape: no horns, crest nor hooks; a thicker roll for the ridge
  const thatch = s.thatch ? (s.thatch === true ? {} : s.thatch) : null;
  const E = s.eaves ?? 3, cap = s.cap ?? (thatch ? 4 : 3), curl = thatch ? 0 : s.curl ?? 3, up = s.upturn ?? 0;
  const [tw, th] = s.tile ?? [5, 4];
  const mask = new Mask(W, H);
  const put = (x: number, y: number, i: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    layer.set(x, y, T(i));
    ctx.setKind(x, y, name);
    mask.set(x, y);
  };
  // the ridge, the hips and the horns in their own ramp (`trim`: a green roof with grey ridges), the same tones
  const trim = s.trim ? ctx.mat(s.trim).ramp : ramp, tn = trim.length;
  const putR = (x: number, y: number, i: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    layer.set(x, y, trim[Math.max(0, Math.min(tn - 1, i))]);
    ctx.setKind(x, y, name);
    mask.set(x, y);
  };
  const sweep = s.sweep ?? 0, hipW = Math.max(1, Math.floor((s.hipcap ?? 3) / 2));
  // a tile one or two tones off by tile (old ones darker, a few new ones lighter): the roof is never flat
  /** A line of ink around the roof where it stands against what is behind it (its top and its ends), never under
   *  it (there the eaves throw their shadow): the roof is a thing in front of the grass, not a patch on it. */
  const outline = () => {
    if (s.outline === false) return;
    const ink: [number, number][] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (mask.has(x, y) || mask.has(x, y - 1)) continue;
      if (mask.has(x, y + 1) || mask.has(x - 1, y) || mask.has(x + 1, y)) ink.push([x, y]);
    }
    for (const [x, y] of ink) put(x, y, 0);
  };
  // a column of tiles one tone off now and then (old ones darker, a few new ones lighter): the roof is never flat
  const vary = (a: number, b: number) => { const v = h2(a, b, salt + 1); return v < 0.12 ? -1 : v > 0.94 ? 1 : 0; };
  /**
   * The tone of a px of tiles: `t` px down the slope from the ridge, `a` px across it, `f` how far down (0 at the
   * ridge, 1 at the eaves), shifted by `shift` (a face toward the light or away from it). The columns of tiles are
   * what reads (a round lit edge, the body, its shaded side, a dark channel); the courses only notch them, each
   * column at its own phase, so the roof is ribs running down and never a grid.
   */
  const tileTone = (t: number, a: number, f: number, shift: number) => {
    const col = Math.floor(a / tw), i = mod(a, tw);
    const ph = Math.floor(h2(col, 0, salt) * th);
    const course = Math.floor((t + ph) / th), r = mod(t + ph, th);
    let c: number;
    // contrast enough that the columns count from afar: a dark channel, a lit round edge
    if (i === tw - 1) c = 0;                               // the channel between two columns
    else if (i === 0) c = r === th - 1 ? 3 : LIT;          // the round edge toward the light
    else if (i === 1 && tw > 3) c = 4;                     // the light rolling off it
    else if (i === tw - 2 && tw > 2) c = 2;                // its shaded side
    else c = 3;
    if (r === th - 1 && i > 0 && i < tw - 1) c -= 1;       // the end of a tile laps over the next one: a notch
    if (r === 0 && i === 0 && h2(col, course, salt + 3) < 0.4) c = GLINT;
    if (c >= 2) c += vary(col, course >> 1);
    if (f < 0.22 && c > 1) c -= 1;                         // under the ridge, in its shadow
    else if (f > 0.7 && c >= 2 && c < LIT && i === 0) c += 1;
    if (c >= 2) c += shift;
    return Math.max(0, Math.min(n - 1, c));
  };

  if ((s.ridge ?? 'h') === 'h') {
    const Yb = y1 + E, Hh = Yb - y0;
    const flare = s.flare ?? Math.round(Hh / 9);
    const X0 = x0 - E, X1 = x1 + E - 1; // inclusive, at the bottom
    // the corners of the eaves stand out and up in a point; the line of the eaves sags between them (a curve, never
    // a ruled line), the most near the ends
    const yc = Yb - up, reach = up * 2 + 3, maxOut = Math.round(up * 0.7);
    const out = (y: number) => { const q = Math.max(0, 1 - Math.abs(yc - y) / reach); return Math.round(maxOut * q * q); };
    // (sweep) the sides and the hips curve: narrow longer, then flaring out at the foot (a concave roof)
    const side0 = (y: number) => Math.round(flare * (1 - ((y - y0) / Math.max(1, Hh - 1)) ** (1 + sweep)));
    const left = (y: number) => X0 + side0(y) - out(y);
    const right = (y: number) => X1 - side0(y) + out(y);
    const XL = X0 - maxOut, XR = X1 + maxOut, xm = (XL + XR) / 2;
    // (tips) only the outer part of each half of the eaves rises, the middle runs flat: the corners of a temple
    const tips = s.tips;
    const lift = (x: number) => {
      const q = Math.min(1, Math.abs(x - xm) / ((XR - XL) / 2));
      if (tips !== undefined) return Math.round(up * Math.max(0, (q - (1 - tips)) / tips) ** 1.6);
      return Math.round(up * ((0.35 + 0.65 * sweep) * q * q + 0.65 * (1 - sweep) * q ** 8));
    };
    const bottom = (x: number) => Yb - lift(x);
    const ys = y0 + cap;
    const hip = s.hip ?? 0;
    const RL = left(y0) + hip, RR = right(y0) - hip;
    // the hip lines, from the ends of the ridge to the corners of the eaves
    const hf = (y: number) => Math.max(0, (y - y0) / Math.max(1, Yb - 1 - y0)) ** (1 + sweep);
    const hl = (y: number) => RL + (left(Yb - 1) - RL) * hf(y);
    // (back) the top of a hip face: from the end of the ridge down to the back corner of the eaves, `back` px lower,
    // and the corner turns up and out in a point like the front ones
    const back = s.back ?? 0;
    const backTop = (x: number) => {
      const g = x < RL ? (RL - x) / Math.max(1, RL - left(y0)) : x > RR ? (x - RR) / Math.max(1, right(y0) - RR) : 0;
      if (g <= 0) return y0;
      return y0 + Math.round(back * Math.min(1, g) ** 0.8 - up * 0.45 * Math.min(1, g) ** 5);
    };
    const hr = (y: number) => RR + (right(Yb - 1) - RR) * hf(y);
    for (let y = y0; y < Yb; y++) {
      for (let x = left(y); x <= right(y); x++) {
        const b = bottom(x);
        if (y >= b) continue;
        const inRidge = y < ys && (!hip || (x >= RL && x <= RR));
        if (inRidge) continue; // painted below
        if (hip && back && y < backTop(x)) continue; // (back) the back eaves of a hip face stand lower than the ridge
        // which face
        let face: 'S' | 'W' | 'E' = 'S';
        if (hip) { if (x < hl(y) - 0.5) face = 'W'; else if (x > hr(y) + 0.5) face = 'E'; }
        if (hip && y < ys && face === 'S') continue;
        // (hipcap) the roll down each hip, centred on the hip line and over both faces, in the trim: lit on its side
        // toward the light, in shade on the far one
        if (hip && s.hipcap) {
          const dl = x - hl(y), dr = x - hr(y);
          const d = Math.abs(dl) <= hipW + 0.5 ? dl : Math.abs(dr) <= hipW + 0.5 ? dr : null;
          if (d !== null) {
            const k = Math.max(0, Math.min(2 * hipW, Math.round(d) + hipW)), nW = 2 * hipW + 1;
            putR(x, y, k === 0 ? 4 : k === 1 ? GLINT : k === nW - 1 ? 2 : k === nW - 2 ? 4 : LIT);
            continue;
          }
        }
        if (face === 'S') {
          // courses bend up with the corners of the eaves
          const tt = Math.floor((y - ys) * (Yb - ys) / Math.max(1, b - ys));
          // the columns fan out a little toward the eaves, which are wider than the ridge
          // (by the flare alone: the corners that turn up and out do not bend the columns, or they kink where the
          // upturn starts)
          const wTop = X1 - X0 - 2 * side0(y0), wRow = Math.max(1, X1 - X0 - 2 * side0(y));
          const a = Math.floor((x - xm) * wTop / wRow) + 4096 * tw;
          const i = mod(a, tw);
          if (y >= b - 2) {
            // the row of tile ends along the eaves: round ends, the channel stops short (the edge is never ruled)
            if (y === b - 2) put(x, y, i === tw - 1 ? 1 : i === 0 || i === 1 ? GLINT : i === tw - 2 ? 3 : LIT); // the cold glint of the tile ends
            else if (i !== tw - 1 || thatch) put(x, y, i === 0 || i === tw - 2 ? 1 : 2); // (straw is never notched)
            continue;
          }
          put(x, y, tileTone(Math.max(0, tt), a, (y - y0) / Math.max(1, Yb - y0), 0));
        } else {
          // a hip: the courses run from the hip line out to the eaves
          const t = face === 'W' ? Math.round(hl(y) - x) : Math.round(x - hr(y));
          const edge = face === 'W' ? x - left(y) : right(y) - x;
          const across = y - y0;
          if (!s.hipcap && Math.abs(t) <= 1) { putR(x, y, t === 0 ? (face === 'W' ? LIT : 4) : 3); continue; } // the ridge of the hip
          if (edge === 0 && mod(across, tw) === tw - 1 && !thatch) continue;
          if (y >= b - 2) { put(x, y, mod(across + x, tw) === tw - 1 ? 1 : 2); continue; }
          // (sweep) the columns of a hip face run down along its hip, as the ones of the front run down the front
          put(x, y, edge === 0 ? 1 : sweep > 0 ? tileTone(across, t + 4096 * tw, (y - y0) / Math.max(1, Yb - y0), face === 'W' ? 1 : -1)
            : tileTone(t - 2, across, 0.5, face === 'W' ? 1 : -1));
        }
      }
    }
    // the ridge: a roll of tiles lit on top, its front in the half light, a joint every 4 px (bitten into its top),
    // its shadow line on the slope under it
    const r0 = hip ? RL : left(y0), r1 = hip ? RR : right(y0);
    for (let y = y0; y < ys; y++) for (let x = r0; x <= r1; x++) {
      const r = y - y0, j = mod(x - r0, 4);
      if (r === 0 && j === 3) continue;
      let c = r === 0 ? GLINT : r === 1 ? LIT : r === 2 ? 4 : r === cap - 1 ? 0 : 2;
      if (j === 3 && r > 0 && r < cap - 1) c = 1;
      else if (r === 1 && j === 0) c = LIT;
      putR(x, y, c);
    }
    // the ends of the ridge rise in a horn that sweeps out and up: lit on its inner side, dark on its outer one,
    // thinning to a tip that bends out
    /** A hooked horn from (xe, yb) up `len` px (a fish tail): it rises bulging out to `dir`, then its top curls back in
     *  and down; thick at its foot, thin at its tip; the west edge of each stroke lit, the east dark. */
    const hookHorn = (xe: number, yb: number, dir: -1 | 1, len: number, thick: number) => {
      const reach = Math.max(2, Math.round(len * 0.32));
      const stroke = (x: number, y: number, wide: number) => {
        for (let j = 0; j < wide; j++) {
          const xx = x - Math.floor(wide / 2) + j;
          putR(xx, y, j === 0 ? LIT : j === wide - 1 ? 1 : j === 1 && wide > 3 ? 4 : 3);
        }
      };
      let last = [xe, yb];
      for (let k = 0; k < len; k++) {
        const f = k / Math.max(1, len - 1);
        const x = xe + dir * Math.round(reach * Math.sin(Math.PI * Math.min(1, f * 1.15))), y = yb - k;
        stroke(x, y, Math.max(2, (f < 0.4 ? 6 : f < 0.75 ? 5 : 4) - thick));
        last = [x, y];
      }
      // the curl: in toward the roof and down
      const [lx, ly] = last;
      putR(lx - dir, ly - 1, LIT); putR(lx - 2 * dir, ly - 1, 4); putR(lx - 3 * dir, ly, 3); putR(lx - 3 * dir, ly + 1, 1);
    };
    // (tiphook) the front corners of the eaves, where each hip comes down, end in a hook that rises and curls back
    // (a thin curl that goes on from the roll of the hip: out and up, its top turning back in; lit on its upper
    // side, dark on its lower one; a pair of numbers gives each corner its own, 0 none: the corner a wing hides)
    const tipH = thatch ? [0, 0] : typeof s.tiphook === 'number' ? [s.tiphook, s.tiphook] : s.tiphook ?? [0, 0];
    if (hip) for (const dir of [-1, 1] as const) {
      const L = tipH[dir < 0 ? 0 : 1];
      if (!L) continue;
      const xe = dir < 0 ? left(yc) + 2 : right(yc) - 2, ye = yc;
      // a quadratic from the corner out and up, then the curl back in over the roof
      const P1 = [xe + dir * L * 0.75, ye - L * 0.25], P2 = [xe + dir * L * 0.55, ye - L];
      const n = L * 3;
      let prev: [number, number] | null = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
        const x = Math.round(a * xe + b * P1[0] + c * P2[0]), y = Math.round(a * ye + b * P1[1] + c * P2[1]);
        if (prev && prev[0] === x && prev[1] === y) continue;
        prev = [x, y];
        putR(x, y, t < 0.5 ? LIT : GLINT);                  // the lit stroke
        putR(x + dir, y + 1, 2);                             // its shaded underside, away from the roof
        if (t < 0.4) putR(x - dir, y, 3);                   // thicker at its foot
      }
      const [lx, ly] = [Math.round(P2[0]), Math.round(P2[1])];
      putR(lx - dir, ly - 1, GLINT); putR(lx - 2 * dir, ly - 1, LIT); putR(lx - 2 * dir, ly, 2);
    }
    if (curl > 0 && s.hook) for (const [xe, dir] of [[r0, -1], [r1, 1]] as const) hookHorn(xe, ys - 1, dir, curl + cap, 0);
    else if (curl > 0) for (const [xe, dir] of [[r0, -1], [r1, 1]] as const) {
      const len = curl + cap;
      for (let k = 0; k < len; k++) {
        const f = k / Math.max(1, len - 1);
        const y = ys - 1 - k, x = xe + dir * Math.round(f * f * (2 + curl * 0.4));
        const wide = f < 0.35 ? 4 : f < 0.7 ? 3 : 2;
        for (let j = 0; j < wide; j++) putR(x + dir * (j - 1), y, j === 0 ? LIT : j === wide - 1 ? 1 : j === 1 ? 4 : 3);
        if (k === len - 1) { putR(x, y - 1, LIT); putR(x + dir, y - 1, 4); putR(x + 2 * dir, y, 1); }
      }
    }
    // a crest on the middle of the ridge: a pearl on a lotus base, lit on its west side
    const crest = thatch ? 0 : s.crest ?? 0;
    const orn = s.ornament;
    if (crest > 0 && orn) {
      // a crest of scrolls: a mound of curls on the middle of the ridge, `crest` px high and `width` wide, the tiles
      // dark with a lit rim and gold beads in the curls, a round medallion on the ridge at its foot
      const xc = Math.round((r0 + r1) / 2), hw = Math.max(3, Math.round(orn.width / 2));
      const [gD, gB, gL] = orn.colors ?? ['bronce', 'oro', 'oro claro'];
      const heart = orn.heart ?? 'bermellón';
      const putC = (x: number, y: number, c: string) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        layer.set(x, y, c); ctx.setKind(x, y, name); mask.set(x, y);
      };
      const tall = (dx: number) => {
        const q = Math.abs(dx) / hw;
        if (q > 1) return 0;
        // a peak in the middle, falling off in scallops: a curl every 6 px
        return Math.max(1, Math.round(crest * (1 - q ** 1.4) + (q > 0.2 ? 1.6 * Math.cos(dx * Math.PI / 3) - 0.6 : 0)));
      };
      for (let dx = -hw; dx <= hw; dx++) {
        const t = tall(dx);
        for (let k = 0; k < t; k++) {
          const x = xc + dx, y = y0 - 1 - k;
          const top = k === t - 1, inner = k > 0 && k < t - 2;
          let c = top ? (dx <= 0 ? LIT : 4) : (dx < 0 ? 2 : 1);
          if (inner && mod(dx + 2 * k, 6) === 0) c = 4; // the lit turn of a curl
          put(x, y, c);
          if (inner && mod(dx + 2 * k + 3, 7) === 0 && Math.abs(dx) > 2) putC(x, y, mod(dx, 2) ? gB : gL);
        }
      }
      // the medallion: a ring of gold, lit up-left, a red heart with a gold bead
      const R = Math.max(2.5, Math.min(6, crest * 0.42)), my = y0 + 1 - Math.round(R * 0.5);
      for (let y = Math.floor(my - R - 1); y <= my + R + 1; y++) for (let x = Math.floor(xc - R - 1); x <= xc + R + 1; x++) {
        const ex = x + 0.5 - (xc + 0.5), ey = y + 0.5 - (my + 0.5), dd = Math.hypot(ex, ey);
        if (dd > R + 0.5) continue;
        if (dd > R - 0.5) { putC(x, y, gD); continue; }
        if (dd > R - 1.6) { putC(x, y, ex + ey < 0 ? gL : gB); continue; }
        putC(x, y, dd < 1 ? gL : heart);
      }
    }
    else if (crest > 0) {
      const xc = Math.round((r0 + r1) / 2);
      for (let k = 0; k < crest; k++) {
        const y = y0 - 1 - k, f = k / Math.max(1, crest - 1);
        const hw = f < 0.3 ? 3 : f < 0.6 ? 1 : 2 - Math.round((f - 0.6) * 4);
        for (let dx = -hw; dx <= hw; dx++) putR(xc + dx, y, dx === -hw ? LIT : dx === hw ? 1 : k === crest - 1 ? 4 : 3);
      }
    }
    if (thatch) {
      // the ridge roll: its rows from the top, between the ends of the ridge (the hips start past them)
      const ridgeAt = (x: number, y: number): [number, number] | null => (y < ys && x >= r0 && x <= r1 ? [y - y0, cap] : null);
      thatchOver(ctx, layer, mask, ramp, name, hip ? { S: 1, W: 1, E: 1 } : { S: 1, W: 3, E: 3 }, ridgeAt, 'h',
        lightToward(ctx, Math.round((x0 + x1) / 2), Yb), thatch, salt);
    }
    if (s.moss) mossOn(ctx, layer, mask, ramp, s.moss, salt + 61);
    outline();
    // the band of shadow the eaves throw on what is under them
    const sh = s.shadow ?? 3;
    for (let x = XL - 1; x <= XR + 1; x++) {
      let b = bottom(x);
      while (b > y0 && !mask.has(x, b - 1) && !mask.has(x, b - 2)) b--;
      if (b <= y0) continue;
      for (let k = 0; k < sh; k++) {
        const y = (mask.has(x, b - 1) ? b : b - 1) + k;
        if (mask.has(x, y) || g.get(x, y) === null) continue;
        // on the ground (where the eaves hang past the wall) the shadow is the sun's: one tone, never twice
        if (sunTakes(ctx, ctx.kindAt(x, y))) { sunShade(ctx, x, y); continue; }
        darkenPx(ctx, g, x, y, k === 0 ? 2 : 1);
      }
    }
    return mask;
  }

  // ---- a north-south ridge: two slopes, the west one lit and the east one in shade, a gable at the south end
  // lean: a single slope, its ridge against the side it leans from (a shed against a wall)
  const G = s.lean ? 0 : s.gable ?? 0;
  const X0 = x0 - E, X1 = x1 + E - 1;
  const xc = s.lean === 'west' ? X1 : s.lean === 'east' ? X0 : (X0 + X1) / 2;
  const half = s.lean ? X1 - X0 : (X1 - X0) / 2;
  const top = (x: number) => y0 + Math.round(2 * Math.abs(x - xc) / half);
  const Yb = G ? y1 : y1 + E;
  const vline = (x: number) => (G ? y1 - G * (1 - Math.abs(x - xc) / half) : Yb);
  const cw = Math.max(2, cap - 1);
  const rc0 = s.lean === 'west' ? X1 - cw : s.lean === 'east' ? X0 : Math.round(xc - cw / 2), rc1 = rc0 + cw;
  for (let x = X0; x <= X1; x++) {
    const yb = Math.round(vline(x));
    for (let y = top(x); y < yb; y++) {
      if (x >= rc0 && x <= rc1) {
        // the ridge down the middle: lit west edge, dark east edge, a joint every 6 px
        const j = mod(y - y0, 6), c = x === rc0 ? 4 : x === rc1 ? 1 : 3;
        putR(x, y, j === 5 ? 2 : c);
        continue;
      }
      const west = x < rc0;
      const t = west ? rc0 - 1 - x : x - rc1 - 1;
      // the columns of tiles run down from the ridge and out, leaning down as they go (a pitch seen from the south)
      // (a shed's single slope falls nearly level: its columns lean only a little)
      const edge = west ? x - X0 : X1 - x, a = y - y0 - Math.round(t * (s.lean ? 0.15 : 0.5));
      if (edge === 0) { if (mod(a, tw) !== tw - 1 || thatch) put(x, y, 1); continue; } // tile ends along the eaves
      if (edge === 1) { put(x, y, mod(a, tw) === tw - 1 ? 1 : west ? LIT : 3); continue; }
      put(x, y, tileTone(t, a, Math.min(1, t / Math.max(1, half - cw)), s.lean ? 0 : west ? 1 : -1));
    }
  }
  // the north end of the ridge rises in a hook
  for (let k = 0; k < curl; k++) { putR(rc0 + 1, y0 - 1 - k, k === curl - 1 ? LIT : 1); putR(rc0 + 2, y0 - 1 - k, 3); }
  if (thatch) {
    // the slopes run down to the west and east edges (one of them, for a shed), the south and north ends rounded over
    const sides = s.lean === 'east' ? { E: 1, S: 3, N: 3 } : s.lean === 'west' ? { W: 1, S: 3, N: 3 } : { W: 1, E: 1, S: 3, N: 3 };
    const ridgeAt = (x: number): [number, number] | null => (x >= rc0 && x <= rc1 ? [x - rc0, rc1 - rc0 + 1] : null);
    thatchOver(ctx, layer, mask, ramp, name, sides, ridgeAt, 'v', lightToward(ctx, Math.round((X0 + X1) / 2), Yb), thatch, salt);
  }
  if (G) {
    const pd = s.pediment ?? {};
    const [fillShade, fill] = pd.fill ?? ['túnica sombra', 'pergamino'];
    const [bDark, bBody, bLit] = pd.barge ?? ['madera sombra', 'bermellón', 'bermellón claro'];
    const strut = pd.strut ?? 'madera sombra';
    const tie = y1 - Math.max(2, Math.round(G * 0.35));
    // the triangle of wall, darker under its bargeboards
    for (let x = x0; x < x1; x++) {
      const yv = Math.round(vline(x));
      for (let y = yv; y < y1; y++) {
        let c = y - yv < 3 ? fillShade : fill;
        if (Math.abs(x - xc) < 1 || y === tie) c = strut;
        layer.set(x, y, c);
        mask.set(x, y);
      }
    }
    // the bargeboards along the two slopes, their ends turning up
    for (let x = X0 - (up ? 2 : 0); x <= X1 + (up ? 2 : 0); x++) {
      const xx = Math.max(X0, Math.min(X1, x)), over = x < X0 ? X0 - x : x > X1 ? x - X1 : 0;
      const yv = Math.round(vline(xx)) - over;
      [bLit, bBody, bDark].forEach((c, k) => { layer.set(x, yv - 1 + k, c); mask.set(x, yv - 1 + k); });
    }
    // a finial over the apex
    layer.set(Math.round(xc), Math.round(vline(xc)) - 2, bLit);
    layer.set(Math.round(xc), Math.round(vline(xc)) - 3, bDark);
  }
  if (s.moss) mossOn(ctx, layer, mask, ramp, s.moss, salt + 61);
  outline();
  return mask;
}

/** (moss) Moss on an old roof: patches of soft noise over the tiles, likelier toward the eaves and in the channels; a
 *  px keeps its place in the light (its tile tone picks the moss tone), so the ribs still read under the green. */
function mossOn(ctx: Ctx, layer: Layer, mask: Mask, ramp: string[], m: NonNullable<RoofShape['moss']>, salt0: number): void {
  const [deep, body, lit] = m.colors ?? ['hoja sombra', 'prado hondo', 'prado sombra'];
  const salt = m.salt ?? salt0;
  let top = Infinity, bot = -Infinity;
  for (let y = 0; y < ctx.H; y++) for (let x = 0; x < ctx.W; x++) if (mask.has(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); }
  if (bot <= top) return;
  // the threshold that leaves `odds` of the tiles under moss: the score of every px, sorted
  const px: [number, number, number][] = [];
  for (let y = top; y <= bot; y++) for (let x = 0; x < ctx.W; x++) {
    if (!mask.has(x, y)) continue;
    const i = ramp.indexOf(layer.get(x, y) ?? '');
    if (i <= 0) continue;                                  // the ink stays ink
    const f = (y - top) / (bot - top);
    const score = fbm(x / 6, y / 3.5, salt, 3) + 0.35 * f + (i <= 1 ? 0.12 : 0) + 0.08 * (h2(x, y, salt + 1) - 0.5);
    px.push([x, y, score]);
  }
  if (!px.length) return;
  const sorted = px.map(p => p[2]).sort((a, b) => b - a);
  const cut = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * m.odds))];
  for (const [x, y, sc] of px) {
    if (sc < cut) continue;
    const i = ramp.indexOf(layer.get(x, y) ?? '');
    layer.set(x, y, i >= 4 ? lit : i >= 3 ? body : deep);
  }
}

export function runRoof(ctx: Ctx, st: RoofStep): void {
  const [u, v, w, h] = st.rect;
  const [x0, y0] = ctx.P(u, v), [x1, y1] = ctx.P(u + w, v + h);
  const m = paintRoof(ctx, st, Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1));
  if (st.id) ctx.masks.set(st.id, m);
}

// ------------------------------------------------------------------ chimney

export function runChimney(ctx: Ctx, st: ChimneyStep): void {
  const { W, H } = ctx, name = st.material, g = ctx.ground;
  const baseL = ctx.layer(st.layer ?? 'ground');
  const t = (i: number) => ctx.tone(name, i);
  const salt = st.salt ?? 1801;
  const [fx, fy] = ctx.P(st.at[0], st.at[1]);
  const cx = Math.round(fx), F = Math.round(fy);
  const [bw, bh] = st.base;
  const bx0 = cx - Math.floor(bw / 2), bx1 = bx0 + bw - 1, by0 = F - bh;
  const sh = st.shoulder ?? 4, side = st.side ?? 3;
  const [sw, shH] = st.stack ?? [0, 0];
  const sx0 = cx + (st.shift ?? 0) - Math.floor(sw / 2), sx1 = sx0 + sw - 1;
  const sy1 = by0 - sh - 1, sy0 = sy1 - shH + 1; // the flue: rows sy0..sy1
  const capF = st.cap ?? 3;
  // (stack_layer) the upper part on a layer of its own: rows over `split` px from the foot (default the body's top)
  const stackL = st.stack_layer ? ctx.layer(st.stack_layer) : baseL, splitY = F - (st.split ?? bh);
  const layerAt = (y: number) => (y < splitY ? stackL : baseL);
  const mine = new Mask(W, H);
  const put = (x: number, y: number, i: number) => { layerAt(y).set(x, y, t(i)); ctx.setKind(x, y, name); mine.set(x, y); };
  const size = st.stones ?? [3, 6];
  const field = (st.masonry ?? 'coursed') === 'rubble' ? rubbleField(salt, size, 1.3) : coursedField(salt, st.course ?? 5, size[1] + 2);
  const front = (x: number, y: number, shadeTop: number) => {
    let c = rubbleTone(field, x, y, -1, salt + 2, 2, [3, 3, 4, 3, 3, 4], b => b + 2, b => b - 1);
    if (y < shadeTop + 1 && c > 2) c -= 1;
    return c;
  };

  // ---- the shadow it throws to the east, first: on what is under it
  const spx = st.shadow?.px ?? 5;
  const onIds = st.shadow?.on;
  const shadowL = st.shadow?.layer ? ctx.layer(st.shadow.layer) : null;
  const takes = (x: number, y: number) => {
    if (mine.has(x, y)) return false;
    if (!onIds) return true;
    return onIds.some(id => ctx.masks.get(id)?.has(x, y) || ctx.kindAt(x, y) === id);
  };
  const shadowCols: [number, number, number][] = []; // x from, y top, y bottom
  if (sw) shadowCols.push([sx1 + side + 1, sy0 + 2, by0 - 1]);
  shadowCols.push([bx1 + side + 1, by0 + 2, F - 1]);

  // ---- the body: rubble, its top a lit slope up to the flue
  for (let y = by0; y < F; y++) for (let x = bx0; x <= bx1; x++) put(x, y, front(x, y, by0));
  // the corner stones of its west edge stand out a px every other course: no edge of the chimney runs ruled
  const ch = st.course ?? 5;
  const quoins = (x: number, ya: number, yb: number) => {
    for (let y = ya; y <= yb; y++) if (mod(Math.floor(y / ch), 2) === 1 && mod(y, ch) !== ch - 1) put(x, y, mod(y, ch) === 0 ? 6 : 5);
  };
  quoins(bx0 - 1, by0, F - 1);
  // its east side, receding
  for (let i = 1; i <= side; i++) {
    const x = bx1 + i, lift = Math.round(i * SKEW);
    for (let y = by0 - lift; y < F - lift; y++) put(x, y, i === side ? 1 : rubbleTone(field, x, y, -1, salt + 4, 1, [3, 3, 2], b => b, b => b - 1));
  }
  // the shoulder: from the top of the body in to the flue, lit (it faces up)
  for (let r = 0; r < sh; r++) {
    const y = by0 - 1 - r, k = (r + 1) / (sh + 1);
    const a = Math.round(bx0 + (sw ? (sx0 - bx0) * k : 0)), b = Math.round(bx1 + side + (sw ? (sx1 + side - bx1 - side) * k : 0));
    for (let x = a; x <= b; x++) {
      const edge = x === a || x === b;
      put(x, y, x > b - side ? 3 : r === 0 && !edge ? 6 : edge ? 4 : (field(x, y) < 0 ? 3 : 5));
    }
  }
  // ---- the flue
  if (sw) {
    for (let y = sy0; y <= sy1; y++) {
      for (let x = sx0; x <= sx1; x++) put(x, y, front(x, y, sy0));
      for (let i = 1; i <= side; i++) put(sx1 + i, y - Math.round(i * SKEW), i === side && mod(Math.floor(y / ch), 2) === 1 ? 1 : 2);
    }
    quoins(sx0 - 1, sy0, sy1);
    // and the far edge of its side, in shade, one course in two a px further
    for (let y = sy0; y <= sy1; y++) if (mod(Math.floor(y / ch), 2) === 0 && mod(y, ch) !== ch - 1) put(sx1 + side + 1, y - Math.round((side + 1) * SKEW), 1);
  }
  // ---- the cap: its top lit around a dark opening, its front one course of stone, a joint under it
  const top = sw ? sy0 : by0 - sh;
  const cx0 = (sw ? sx0 : bx0) - 1, cx1 = (sw ? sx1 : bx1) + 1 + side;
  // the fire: one layer, or one per frame (`fire.frames`: <layer>_1 … <layer>_n, the game shows them in turn)
  const fireName = st.fire?.layer ?? 'fuego', frames = st.fire?.frames ?? 1;
  const fireLs = frames > 1 ? Array.from({ length: frames }, (_, i) => ctx.layer(`${fireName}_${i + 1}`)) : [ctx.layer(fireName)];
  const fireSet = (x: number, y: number, c: string) => { for (const l of fireLs) l.set(x, y, c); };
  const fireC = st.fire?.colors ?? ['bermellón', 'fuego', 'fuego luz'];
  for (let r = 0; r < capF + 2; r++) {
    const y = top - capF - 2 + r;
    for (let x = cx0; x <= cx1; x++) {
      const end = x === cx0 || x === cx1;
      if (r < 2) {
        // the top surface, seen from above: a lit rim around the opening of the flue
        const hole = !end && x > cx0 + 1 && x < cx1 - 1;
        if (r === 0 && end) continue;
        put(x, y, hole ? (r === 0 ? 0 : 1) : 7);
        if (hole && r === 1 && Math.abs(x - (cx0 + cx1) / 2) < 1.5) fireSet(x, y, fireC[1]);
      } else {
        const c = r === capF + 1 ? 2 : x > cx1 - side ? 3 : x === cx0 ? 6 : 5;
        put(x, y, c);
      }
    }
  }
  // ---- the oven mouth: an arch of voussoirs, the inside dark, the fire on its layer
  if (st.mouth) {
    const [mw, mh] = st.mouth.size, ring = st.mouth.ring ?? 2;
    const back = st.fire?.back ?? (frames > 1 ? ['madera sombra', 'bermellón'] : null);
    const sill = 2, mb = F - 1 - sill; // the last row of the opening
    const r = mw / 2, ccx = cx, ccy = mb - mh + r + 1;
    const inOpen = (x: number, y: number) => Math.abs(x + 0.5 - ccx) < r && y <= mb && (y >= ccy || Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy) < r);
    const inRing = (x: number, y: number) => !inOpen(x, y) && y <= mb && Math.abs(x + 0.5 - ccx) < r + ring && (y >= ccy || Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy) < r + ring);
    const ys0 = Math.floor(ccy - r - ring - 1);
    for (let y = ys0; y <= F - 1; y++) for (let x = Math.floor(ccx - r - ring - 1); x <= Math.ceil(ccx + r + ring + 1); x++) {
      if (y > mb) {
        // the hearth stone in front: lit lip, then its face
        if (Math.abs(x + 0.5 - ccx) < r + ring) put(x, y, y === mb + 1 ? 6 : 4);
        continue;
      }
      if (inOpen(x, y)) {
        const deep = (y - (ccy - r)) / (mb - (ccy - r) + 1);
        // the inside: dark stone, or the back of the oven lit by the fire (`fire.back`): never black behind a flame
        if (back) { layerAt(y).set(x, y, deep < 0.5 || (deep < 0.62 && (x + y) % 2) ? back[0] : back[1]); ctx.setKind(x, y, name); mine.set(x, y); } else put(x, y, deep < 0.45 ? 0 : 1);
        continue;
      }
      if (!inRing(x, y)) continue;
      // voussoirs: stones by angle, a joint between two; lit toward the light, in shade on the other side
      const ang = y >= ccy ? (x < ccx ? Math.PI : 0) : Math.atan2(ccy - y - 0.5, x + 0.5 - ccx);
      const bin = Math.floor(ang / (Math.PI / Math.max(5, Math.round(r * 0.9))) + 0.5);
      const prev = Math.floor((y >= ccy ? ang : Math.atan2(ccy - y - 0.5, x + 1.5 - ccx)) / (Math.PI / Math.max(5, Math.round(r * 0.9))) + 0.5);
      const joint = y < ccy && prev !== bin;
      const outer = Math.hypot(x + 0.5 - ccx, Math.min(0, y + 0.5 - ccy)) >= r + ring - 1;
      const lit = x + 0.5 < ccx;
      put(x, y, joint ? 2 : outer ? (lit ? 6 : 4) : (lit ? 7 : 5));
      if (y >= ccy && (y - Math.floor(ccy)) % 4 === 3) put(x, y, 2);
    }
    // the fire: a bed of embers, flames licking up, brighter in the middle
    const [edge, flame, core] = fireC, heart = fireC[3] ?? core;
    if (frames === 1) {
      for (let x = Math.ceil(ccx - r); x < ccx + r; x++) {
        const k = 1 - Math.abs(x + 0.5 - ccx) / r;
        const hgt = Math.max(1, Math.round((mh - 2) * (0.35 + 0.55 * k) + 2.2 * n1(x / 1.7, salt + 9)));
        for (let j = 0; j < hgt; j++) {
          const y = mb - j;
          if (!inOpen(x, y)) continue;
          const f = j / hgt;
          fireLs[0].set(x, y, j === 0 ? (h2(x, 0, salt + 11) < 0.5 ? core : flame) : f > 0.75 ? edge : f > 0.4 || k < 0.35 ? flame : core);
        }
      }
    } else {
      // frames: the same bed, tongues that rise and change and let go of their tips, a light heart that beats
      const tongues = [-0.5, -0.05, 0.42].map((u, j) => ({
        at: ccx + r * (u + 0.12 * n1(j * 2.3, salt + 13)), off: h2(j, 7, salt + 14) + j * 0.37, amp: (mh - 2) * (0.4 + 0.14 * h2(j, 9, salt + 15)),
      }));
      fireLs.forEach((fl, fi) => {
        const ph = fi / frames, beat = Math.sin(2 * Math.PI * ph);
        const tips: [number, number][] = [];
        for (let x = Math.ceil(ccx - r); x < ccx + r; x++) {
          const k = 1 - Math.abs(x + 0.5 - ccx) / r;
          let hgt = (mh - 2) * (0.16 + 0.3 * k) + 1.4 * n1(x / 1.6 + fi * 1.9, salt + 9);
          for (const tg of tongues) {
            const t = (ph + tg.off) % 1, bump = Math.exp(-(((x + 0.5 - tg.at) / 1.8) ** 2));
            if (bump < 0.12) continue;
            hgt += tg.amp * (0.35 + 0.65 * t) * bump;
            // late in its rise a tongue lets go of its tip: a px or two over a gap, higher every frame
            if (t > 0.62 && bump > 0.7) tips.push([x, Math.round(hgt + 1 + 3 * (t - 0.62))]);
          }
          const H = Math.max(2, Math.round(hgt));
          for (let j = 0; j < H; j++) {
            const y = mb - j;
            if (!inOpen(x, y)) continue;
            const f = j / H, heat = (1 - f) * (0.5 + 0.5 * k) + 0.07 * beat;
            const c = j === 0 ? (h2(x, fi, salt + 11) < 0.35 ? flame : heart)
              : j === H - 1 || f > 0.82 ? edge
              : heat > 0.74 ? heart : heat > 0.5 ? core : flame;
            fl.set(x, y, c);
          }
        }
        for (const [x, j] of tips) for (let d = 0; d < 2; d++) if (inOpen(x, mb - j - d)) fl.set(x, mb - j - d, d === 0 ? flame : edge);
      });
    }
    // its light on the ground in front
    const glow = st.fire?.glow ?? 0;
    for (let y = F; y < F + glow; y++) for (let x = Math.floor(ccx - r - glow); x <= ccx + r + glow; x++) {
      const d = Math.hypot((x + 0.5 - ccx) / (r + glow * 0.8), (y - F + 0.5) / glow);
      const c = g.get(x, y);
      if (d >= 1 || c === null || mine.has(x, y) || (d > 0.7 && (x + y) % 2)) continue;
      const lit = ctx.lighten(c);
      if (lit !== c) fireSet(x, y, lit);
    }
  }
  // ---- the shadow beside it, on the roof and the ground (after: never on itself)
  for (const [xs, ya, yb] of shadowCols) for (let y = ya; y <= yb; y++) for (let k = 0; k < spx; k++) {
    const x = xs + k, yy = y - Math.round((xs - (sw ? sx1 : bx1)) * SKEW) + Math.round(k * 0.4);
    if (!takes(x, yy) || (k === spx - 1 && h2(x, yy, salt + 5) < 0.5)) continue;
    // with the sun, what falls on the ground is the sun's (one tone, never twice); on a roof it stays the chimney's
    const onMask = !!onIds?.some(id => ctx.masks.get(id)?.has(x, yy));
    if (ctx.sun && !onMask) continue;
    // (shadow.layer) on a roof drawn on another layer, darken that layer: under the roof nobody would see it
    darkenPx(ctx, onMask && shadowL ? shadowL : g, x, yy, 1);
  }
  if (ctx.sun) {
    sunOn(ctx, onIds?.filter(id => !ctx.masks.has(id)));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mine.has(x, y)) castStanding(ctx, x, y, Math.max(1, F - y));
  }
  // ---- the smoke: a column of puffs, wide at its foot, opening and thinning up into the air until it is gone;
  // each puff lit on its upper-left rim and shaded at its foot, the high ones lighter and with holes in them
  if (st.smoke) paintSmoke(ctx, st.smoke, (cx0 + cx1) / 2, top - capF - 3, salt);
  if (st.id) ctx.masks.set(st.id, mine);
}

/**
 * A column of smoke from (ox, oy) px: `puffs` puffs, wide at its foot, opening and thinning up into the air until it
 * is gone; each puff lit on its upper-left rim and shaded at its foot, the high ones lighter and with holes in them.
 * The smoke of a chimney and the `smoke` step (an incense burner, a campfire).
 */
export function paintSmoke(ctx: Ctx, sm: SmokeShape, ox: number, oy: number, salt: number): void {
  const sl = ctx.layer(sm.layer ?? 'humo');
  const [sShade, sBody, sLight] = sm.colors ?? ['niebla sombra', 'niebla', 'nube'];
  const sFaint = sm.colors?.[3] ?? sLight;
  const count = sm.puffs ?? 5, [dx, dy] = sm.drift ?? [14, 34], [r0, r1] = sm.size ?? [2.5, 8];
  const fade = sm.fade ?? 0.6;
  // what is left of a puff as it thins out: wisps, not a grid (clumps of noise, a little grain at their edge)
  const keep = (x: number, y: number, k: number) => 0.8 * fbm(x / 3.2, y / 2.6, salt + 25, 2) + 0.2 * h2(x, y, salt + 26) < k;
  for (let k = count - 1; k >= 0; k--) {
    const f = count === 1 ? 0 : k / (count - 1);
    const pcx = ox + dx * f * f + 2.5 * n1(k * 1.7, salt + 21), pcy = oy - dy * f;
    const rad = r0 + (r1 - r0) * f;
    // how much of it is left: whole up to where the fade starts, then less and less
    const thin = f <= 1 - fade ? 1 : Math.max(0, 1 - (f - (1 - fade)) / fade) * 0.85 + 0.12 * (1 - f);
    for (let y = Math.floor(pcy - rad - 2); y <= pcy + rad + 2; y++) for (let x = Math.floor(pcx - rad - 2); x <= pcx + rad + 2; x++) {
      const ex = x + 0.5 - pcx, ey = y + 0.5 - pcy;
      const d = Math.hypot(ex, ey) - rad * (1 + 0.14 * n1(Math.atan2(ey, ex) * 2 + k * 3, salt + 23));
      if (d > 0) continue;
      // its rim goes first, then holes open inside it
      if (thin < 1 && !keep(x, y, d > -1.5 ? thin * 0.7 : thin)) continue;
      if (sl.get(x, y) && thin < 1) continue; // a thin puff does not cover the thicker one under it
      const lx = ex / rad, ly = ey / rad;
      const c = d > -1.2 && lx + ly < -0.2 ? sLight : lx + ly > 0.6 ? sShade : sBody;
      sl.set(x, y, f > 1 - fade * 0.5 ? (c === sShade ? sBody : c === sBody ? sLight : sFaint) : c);
    }
  }
}

export function runSmoke(ctx: Ctx, st: SmokeStep): void {
  const [ox, oy] = ctx.P(st.at[0], st.at[1]);
  paintSmoke(ctx, st, Math.round(ox), Math.round(oy), st.salt ?? 1851);
}

// ------------------------------------------------------------------ building

export function runBuilding(ctx: Ctx, st: BuildingStep): void {
  const { W, H } = ctx, g = ctx.ground;
  const salt = st.salt ?? 1601;
  const [u, v, w, h] = st.rect;
  const X0 = Math.round(ctx.ox + u * ctx.cell), X1 = Math.round(ctx.ox + (u + w) * ctx.cell) - 1;
  const Y0 = Math.round(ctx.oy + v * ctx.cell), F = Math.round(ctx.oy + (v + h) * ctx.cell); // F: the row under the foot
  const WT = F - st.wall;
  const side = st.side ?? 6;
  const plaster = st.material, frame = st.frame;
  const P = (i: number) => ctx.tone(plaster, i), Fr = (i: number) => ctx.tone(frame, i);
  const stoneName = st.stone, plinth = stoneName ? st.plinth ?? 4 : 0;
  const mine = new Mask(W, H);
  const put = (x: number, y: number, c: string, kind: string) => { g.set(x, y, c); ctx.setKind(x, y, kind); mine.set(x, y); };
  const cellX = (c: number) => X0 + Math.round(c * ctx.cell);
  const opens = (st.open ?? []).map(o => ({ ...o, x0: cellX(o.at[0]), x1: cellX(o.at[1]) - 1 }));
  const doors = (st.doors ?? []).map(([a, b]) => [cellX(a), cellX(b) - 1] as const);
  const inOpen = (x: number) => opens.find(o => x >= o.x0 && x <= o.x1);
  const sfield = rubbleField(salt + 3, [3, 5], 1.4);
  if (ctx.sun) sunOn(ctx, st.shadow?.on);

  // ---- the front wall: plaster between posts, a beam on top, a sill over the plinth, the plinth of stone
  const bays = st.bays ?? 24;
  const posts = new Set<number>();
  for (let x = X0; x <= X1 - 2; x += bays) posts.add(x);
  posts.add(X1 - 2);
  for (const o of opens) { posts.add(o.x0); posts.add(o.x1 - 2); }
  for (const [a, b] of doors) { posts.add(a - 1); posts.add(b - 1); }
  // the paper behind the bars of a lattice (windows, door panels), in the shadow of the lintel at the top
  const Pn = (i: number) => (st.panes ? ctx.tone(st.panes, i) : P(i + 2));
  const postAt = (x: number) => [...posts].find(p => x >= p && x <= p + 2);
  for (let y = WT; y < F; y++) for (let x = X0; x <= X1; x++) {
    const o = inOpen(x);
    const r = y - WT, fromFoot = F - 1 - y;
    // painted below; an opening with a floor stands on the plinth, which runs on under it
    if (o && y >= WT + 2 && !(o.floor && plinth && fromFoot < plinth)) continue;
    if (plinth && fromFoot < plinth) {
      const sn = stoneName!;
      const c = fromFoot === plinth - 1 ? 6 : rubbleTone(sfield, x, y, -1, salt + 4, 2, [4, 4, 5, 3], b => b + 1, b => b - 1);
      put(x, y, ctx.tone(sn, c), sn);
      continue;
    }
    const p = postAt(x);
    if (p !== undefined) { put(x, y, Fr(x === p ? 3 : x === p + 1 ? 2 : 1), frame); continue; }
    if (r < 2) { put(x, y, Fr(r === 0 ? 2 : 1), frame); continue; }
    if (plinth && fromFoot === plinth) { put(x, y, Fr(1), frame); continue; }
    if (st.rail && (r === st.rail || r === st.rail + 1)) { put(x, y, Fr(r === st.rail ? 3 : 1), frame); continue; }
    const d = doors.find(([a, b]) => x >= a && x <= b);
    if (d) {
      // a door of planks under its lintel; a wide one (10 px or more) is two leaves meeting in the middle, each with a
      // lit stile toward the light, a sunk panel and a ring by the seam
      const [a, b] = d, wd = b - a + 1, Dn = st.door ?? frame, D = (i: number) => ctx.tone(Dn, i);
      const bot = F - 1 - plinth;
      if (r < 4) { put(x, y, Fr(0), frame); continue; }
      if (wd < 10) { const k = mod(x - a, 4); put(x, y, D(k === 3 ? 0 : k === 0 ? 3 : 2), Dn); continue; }
      const mid = a + Math.floor(wd / 2), left = x < mid - 1, i = left ? x - a : x - mid - 1, lw = left ? mid - 1 - a : b - mid;
      let c = 2;
      if (x === mid || x === mid - 1) c = x === mid ? 0 : 1;           // the seam
      else if (i === 0) c = 3;                                         // the stile, lit
      else if (i === lw - 1) c = 1;                                    // its shaded edge
      else if (y === WT + 5 || y === bot) c = 1;                       // the rails
      else if (st.door_lattice && r >= st.door_lattice[0] && r < st.door_lattice[0] + st.door_lattice[1] && i >= 2 && i <= lw - 3) {
        // the upper panels are lattice: bars of the door's wood over paper, like the windows
        const li = i - 2, lr = r - st.door_lattice[0], edge = lr === 0 || lr === st.door_lattice[1] - 1;
        c = -1;
        put(x, y, edge || li % 3 === 0 || lr % 3 === 0 ? D(1) : Pn(lr < 3 ? 0 : 1), Dn);
      }
      else if (r > 6 && y < bot - 1 && i >= 2 && i <= lw - 3) {
        c = (y === WT + 7 || i === 2) ? 1 : (mod(x - a, 3) === 2 ? 1 : 2);  // the sunk panel
      }
      if (c < 0) continue;
      const ringY = WT + Math.round((F - WT) * 0.55);
      if (y === ringY && (x === mid - 3 || x === mid + 2)) c = 4;
      put(x, y, D(c), Dn);
      continue;
    }
    // plaster: a few flecks, dirtier toward the foot
    const hsh = h2(x, y, salt + 7);
    let c = hsh < 0.035 ? 3 : hsh < 0.07 ? 1 : 2;
    if (fromFoot < plinth + 3 && h2(x, y, salt + 8) < 0.5) c = 1;
    put(x, y, P(c), plaster);
  }
  // ---- lattice windows
  for (const [wx, wy, ww, wh] of st.windows ?? []) {
    const x0 = X0 + wx, y0 = WT + wy;
    for (let y = y0; y < y0 + wh; y++) for (let x = x0; x < x0 + ww; x++) {
      const edge = x === x0 || x === x0 + ww - 1 || y === y0 || y === y0 + wh - 1;
      const bar = (x - x0) % 3 === 0 || (y - y0) % 3 === 0;
      put(x, y, edge ? Fr(0) : bar ? Fr(1) : (y - y0 < 3 ? Pn(0) : Pn(1)), frame);
    }
    for (let x = x0 - 1; x <= x0 + ww; x++) { put(x, y0 + wh, Fr(3), frame); put(x, y0 + wh + 1, Fr(1), frame); }
  }
  // ---- open bays: the inside shows: the back wall in shadow, a shelf with things on it, a board, a bench
  // the front of an opening on a layer (`open.layer`): drawn first on the ground as always (so the eaves shade it), then
  // moved to its layer once the roof is on, the ground left with what is behind it
  const lifts: { layer: string; px: Map<number, string> }[] = [];
  const fronts = (layer: string) => {
    const f = { layer, px: new Map<number, string>() };
    lifts.push(f);
    return {
      put: (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < W && y < H) { f.px.set(y * W + x, c); mine.set(x, y); } },
    };
  };
  for (const o of opens) {
    // with a floor (an open pavilion) the bay stands on the plinth: the back wall, then the floor, down to its top
    const fl = o.floor ?? 0, bottom = fl && plinth ? F - plinth : F;
    const top = WT + 2, floor = fl ? bottom - fl : F - 4;
    const shelf = o.shelf ?? 9, goods = o.goods ?? ['oro', 'bronce', 'piedra clara', 'madera clara'];
    const Fl = (i: number) => ctx.tone(stoneName ?? frame, stoneName ? i : Math.min(4, Math.round(i * 4 / 7)));
    const nc = o.columns ?? 0;
    const colX = Array.from({ length: nc }, (_, k) => Math.round(o.x0 + (o.x1 - o.x0) * (k + 1) / (nc + 1)) - 1);
    const lifted = o.layer && fl ? fronts(o.layer) : null;
    for (let y = top; y < bottom; y++) for (let x = o.x0; x <= o.x1; x++) {
      const post = x <= o.x0 + 2 || x >= o.x1 - 2;
      // with the front on a layer, the ground under a post or a column is what is behind it (the floor, the back wall)
      if (post && !lifted) { const p = x <= o.x0 + 2 ? o.x0 : o.x1 - 2; put(x, y, Fr(x === p ? 3 : x === p + 1 ? 2 : 1), frame); continue; }
      if (fl && y >= floor) {
        // the floor: flags in courses, staggered joints, in the shade of the roof at the back (a dark line where the
        // back wall stands on it) and lit toward the front edge, whose nose catches the light
        const d = y - floor, back = d < Math.max(2, Math.round(fl * 0.3));
        // courses get deeper toward the front (nearer: bigger), joints a tone down, never a wall of bricks
        const cd = d < fl * 0.45 ? Math.floor(d / 4) : 2 + Math.floor((d - Math.ceil(fl * 0.45)) / 6);
        const cEnd = d < fl * 0.45 ? mod(d, 4) === 3 : mod(d - Math.ceil(fl * 0.45), 6) === 5;
        const jx = mod(x - o.x0 + cd * 7 + Math.floor(h2(cd, 1, salt + 22) * 5), 13);
        let c = d === 0 ? 2 : y === bottom - 1 ? 7 : back ? 4 : d >= fl - 4 ? 6 : 5;
        if (d > 0 && y < bottom - 1 && (cEnd || jx === 12)) c = Math.max(2, c - 1);
        else if (c >= 5 && h2(x, y, salt + 23) < 0.06) c -= 1;
        put(x, y, Fl(c), stoneName ?? frame);
        continue;
      }
      if (y >= floor) { put(x, y, Fr(y === floor ? 0 : h2(x, y, salt + 9) < 0.3 ? 2 : 1), frame); continue; }
      // the back wall, in the shadow of the roof: boards, darker under the lintel
      const depth = y - top, k = mod(x - o.x0, 5);
      put(x, y, Fr(depth < 3 || k === 4 ? 0 : h2(x, Math.floor(y / 3), salt + 10) < 0.2 ? 2 : 1), frame);
    }
    if (o.board) {
      const by0 = top + 3, by1 = top + Math.max(6, shelf - 2);
      const bx0 = o.x0 + 6, bx1 = o.x1 - 6;
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const edge = y === by0 || y === by1 || x === bx0 || x === bx1;
        const stroke = !edge && mod(x - bx0, 5) !== 0 && h2(Math.floor((x - bx0) / 5), y, salt + 12) < 0.45;
        put(x, y, edge ? Fr(1) : stroke ? Fr(0) : P(3), frame);
      }
    }
    if (shelf > 0) {
      const sy = top + shelf;
      for (let x = o.x0 + 3; x <= o.x1 - 3; x++) { put(x, sy, Fr(3), frame); put(x, sy + 1, Fr(1), frame); }
      // things on it: bars, pots, tools, one by one
      for (let x = o.x0 + 4; x <= o.x1 - 6;) {
        const k = Math.floor(h2(x, sy, salt + 13) * goods.length), gw = 2 + Math.floor(h2(x, sy, salt + 14) * 2), gh = 2 + Math.floor(h2(x, sy, salt + 15) * 3);
        if (h2(x, sy, salt + 16) < 0.75) for (let j = 1; j <= gh; j++) for (let i = 0; i < gw; i++) {
          put(x + i, sy - j, i === gw - 1 ? ctx.shade(goods[k], '') ?? goods[k] : goods[k], frame);
        }
        x += gw + 1 + Math.floor(h2(x, sy, salt + 17) * 2);
      }
    }
    // free-standing columns inside the bay, from the floor to the lintel: a lit edge, the body, a shaded side
    if (lifted) {
      // the front on its layer: the two posts, the columns and the lintel over the opening
      for (let y = top; y < bottom; y++) for (const p of [o.x0, o.x1 - 2, ...colX]) for (let i = 0; i < 3; i++) lifted.put(p + i, y, Fr(i === 0 ? 3 : i === 1 ? 2 : 1));
      for (let x = o.x0; x <= o.x1; x++) for (let y = WT; y < top; y++) {
        lifted.put(x, y, g.get(x, y) ?? Fr(1));
        put(x, y, Fr(0), frame);   // behind the lintel: the back wall in the shade of the roof
      }
    } else for (const cx of colX) {
      for (let y = top; y < bottom; y++) for (let i = 0; i < 3; i++) put(cx + i, y, Fr(i === 0 ? 3 : i === 1 ? 2 : 1), frame);
    }
    if ((o.bench ?? true) && !fl) {
      const by = F - 7;
      for (let x = o.x0 + 4; x <= o.x1 - 4; x++) { put(x, by, Fr(4), frame); put(x, by + 1, Fr(2), frame); put(x, by + 2, Fr(1), frame); }
      for (const lx of [o.x0 + 5, o.x1 - 6]) for (let y = by + 3; y < F; y++) put(lx, y, Fr(1), frame);
    }
  }
  // ---- the east side, in shade, receding: plaster in shadow, the corner post, the plinth darker
  for (let i = 1; i <= side; i++) {
    const x = X1 + i, lift = Math.round(i * SKEW);
    for (let y = WT - lift - 2; y < F - lift; y++) {
      const fromFoot = F - lift - 1 - y;
      if (plinth && fromFoot < plinth) { put(x, y, ctx.tone(stoneName!, fromFoot === plinth - 1 ? 3 : 2), stoneName!); continue; }
      if (i === side) { put(x, y, Fr(0), frame); continue; }
      if (i === 1) { put(x, y, Fr(1), frame); continue; } // the corner post, its shaded face
      put(x, y, P(h2(x, y, salt + 18) < 0.1 ? 1 : 0), plaster);
    }
  }
  // ---- the stoop: steps of stone down from the top of the plinth, each one nearer and wider than the one above,
  // a cheek block at each side
  if (st.stoop) {
    const so = st.stoop, sn = so.material ?? stoneName;
    if (!sn) throw new Error('map: building: a stoop needs its stone (stoop.material or the stone of the plinth)');
    const S = (i: number) => ctx.tone(sn, i);
    const n = so.treads ?? 3, td = so.tread ?? 6, rs = Math.min(so.riser ?? 2, td - 2), sp = so.spread ?? 1, ch = so.cheek ?? 5;
    const a = cellX(so.at[0]), b = cellX(so.at[1]) - 1;
    const Y0 = F - plinth, Yend = Y0 + n * td - 1;
    for (let k = 0; k < n; k++) {
      const top = Y0 + k * td, bot = top + td - 1, xa = a - sp * k, xb = b + sp * k;
      // the joints of the blocks of a tread, staggered from one tread to the next
      const off = Math.floor(h2(k, 3, salt + 21) * 9);
      for (let y = top; y <= bot; y++) for (let x = xa; x <= xb; x++) {
        const fromBot = bot - y;
        let c: number;
        if (fromBot < rs) c = fromBot === 0 ? 1 : 2;                       // the riser, its dark foot
        else if (fromBot === rs) c = x === xa ? 6 : 7;                     // the nose, lit
        else c = mod(x + off, 9) === 8 ? 3 : y === top && k > 0 ? 4 : 5;   // the tread, a joint between two blocks
        if (x === xb && fromBot >= rs) c = Math.min(c, 3);                 // its east end, in shade
        put(x, y, S(c), sn);
      }
    }
    if (ch > 0) for (const side of [-1, 1]) {
      const xa = side < 0 ? a - sp * (n - 1) - ch : b + sp * (n - 1) + 1;
      for (let y = Y0 - 2; y <= Yend; y++) for (let x = xa - 1; x <= xa + ch; x++) {
        const outer = x === xa - 1 || x === xa + ch;
        // its top steps down toward the south: lit cap, then the face; ink around it
        const capTop = Y0 - 2 + Math.round((y - Y0) / td) * 0;
        let c = outer ? 0 : y === capTop ? 7 : y === capTop + 1 ? 6 : x === xa + ch - 1 ? 2 : x === xa ? 5 : 4;
        if (!outer && y === Yend) c = 1;
        if (!outer && y > capTop + 1 && mod(y - Y0, 5) === 4) c = 3;   // a course joint
        put(x, y, S(c), sn);
      }
    }
  }
  // its walls on the ground, a thing with a foot for a later settle (registering paints nothing)
  const walls: [number, number][] = [];
  const wb = mine.bounds();
  if (wb) for (let y = wb[1]; y <= wb[3]; y++) for (let x = wb[0]; x <= wb[2]; x++) if (mine.has(x, y)) walls.push([x, y]);
  registerFooted(ctx, 'building', 'building', walls, { id: st.id, ink: [] });
  // ---- the roof over all of it (what the ground is under a lifted front before it, to see what the eaves shade)
  const before = new Map<number, string | null>();
  for (const f of lifts) for (const i of f.px.keys()) before.set(i, g.get(i % W, Math.floor(i / W)));
  let roofMask: Mask | null = null;
  if (st.roof) {
    roofMask = paintRoof(ctx, st.roof, X0, Y0, X1 + side + 1, WT);
    for (let i = 0; i < roofMask.data.length; i++) if (roofMask.data[i]) mine.data[i] = 1;
    if (st.id) ctx.masks.set(`${st.id} roof`, roofMask);
  }
  // ---- the fronts lifted to their layer: the color the ground took (the eaves' shadow on their tops) goes up with
  // them; the ground keeps what is behind (painted under them before)
  for (const f of lifts) {
    const L = ctx.layer(f.layer);
    for (const [i, c] of f.px) {
      const x = i % W, y = Math.floor(i / W);
      L.set(x, y, c);
      if (g.get(x, y) !== before.get(i)) darkenPx(ctx, L, x, y, 1);   // under the eaves, in their shadow
    }
  }
  // ---- its shadow on the ground: with the sun, every px of it thrown from its height over the front foot (the side,
  // receding, from its own foot); without one, the whole silhouette slid `offset` px to the south-east
  if (ctx.sun) {
    sunOn(ctx, st.shadow?.on);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mine.has(x, y)) continue;
      const foot = x > X1 ? F - Math.round(Math.min(x - X1, side) * SKEW) : F;
      castStanding(ctx, x, y, y < foot ? foot - y : 1);   // under the foot (a stoop): a px high, its contact
    }
    if (st.id) ctx.masks.set(st.id, mine);
    return;
  }
  const [dx, dy] = st.shadow?.offset ?? [8, 3];
  const on = st.shadow?.on ? new Set(st.shadow.on) : null;
  const done = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mine.has(x, y)) continue;
    for (let k = 1; k <= Math.max(Math.abs(dx), Math.abs(dy)); k++) {
      const X = x + Math.round(dx * k / Math.max(Math.abs(dx), Math.abs(dy))), Y = y + Math.round(dy * k / Math.max(Math.abs(dx), Math.abs(dy)));
      if (mine.has(X, Y) || done.has(X, Y) || X < 0 || Y < 0 || X >= W || Y >= H) continue;
      if (on && !on.has(ctx.kindAt(X, Y))) continue;
      done.set(X, Y);
    }
  }
  // the edge of the shadow frays by a px here and there, so it never runs ruled
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!done.has(x, y)) continue;
    const rim = !done.has(x + 1, y) && !mine.has(x + 1, y) || !done.has(x, y + 1) && !mine.has(x, y + 1);
    if (rim && h2(x, y, salt + 19) < 0.3) continue;
    g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }
  if (st.id) ctx.masks.set(st.id, mine);
}
