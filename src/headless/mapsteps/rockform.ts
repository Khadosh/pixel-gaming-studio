// Relief («una pelota de roca», 10 October): a rock as a height field shaded from the light of the recipe.
//
// Joaquín: the rocks of PGS were a ball of two tones. A painted rock is a few planes: a plane of light on top, a
// face toward the sun, faces to the sides in the middle tone, the faces away in shadow with a deeper core under the
// crest, one px of rim light on the edge that meets the sun, cracks in the deepest tone, and a foot that sits in the
// ground. This file builds that body over a silhouette that is already drawn (the silhouette never changes: only
// the colors inside it do) and leaves the outline as it was, so `settle` takes the ink out of its foot as before.
//
// The height field. Over the silhouette normalized to the unit disk (u, v), a dome whose crest stands up and back
// (above the middle: the fall toward the top edge is short and steep, toward the foot long and gentle). The facets
// are tangent planes of that dome — one flat plane cut across the crest and `facets − 1` around it — and the height
// of a px is the lowest of them: the convex body they wrap, with straight ridges where two planes meet. A little
// noise on each plane breaks the ridges by a px. Each px takes the slope of its plane, bent a quarter toward the
// slope of the dome under it so a big face is not one flat tone. Cracks are walks down from near the crest, sunk
// into the field.
//
// The shading. The normal of each px against the light: the sun's `dir` (or a lamp's `source`, by `leanAt` at the
// foot of the rock), raised 50° over the ground. Bands on the ramp of the material: light on the top plane and the
// faces toward the sun, the middle tone on the sides, shadow on the faces away, the core a tone deeper where the
// face looks away and a ray toward the light runs into the crest. A one px rim of the lightest tone inside the
// outline on the side of the light. Cracks in the deepest tone of the body, the wall across them one tone up.
// Dithering only where two bands meet inside one face of a big rock (a long transition), never on a ridge.
import { fbm, h2, type Pt } from '../mapnoise';
import type { Ctx } from '../mappaint';
import { leanAt } from './sun';
import type { Relief } from './rockformschema';

export type { Relief } from './rockformschema';

/** The way to the light on the ground, a unit vector (px): against the sun's `dir`, toward a lamp; [0, 0] right overhead. */
export function lightToward(ctx: Ctx, x: number, foot: number): Pt {
  let lx: number, ly: number;
  if (ctx.sun) { const [a, b] = leanAt(ctx, x, foot, 0); lx = -a; ly = -b; } else { lx = -ctx.dir[0]; ly = -ctx.dir[1]; }
  const n = Math.hypot(lx, ly);
  return n < 1e-6 ? [0, 0] : [lx / n, ly / n];
}

/** The body tones of a stone material: [deep, shadow, mid, speck, light, high] (ramp 2 … 7) and its moss. */
export interface RockTones { line: string; dark: string; shadow: string; mid: string; speck: string; light: string; high: string; moss: string[] }

export interface RockFormOpts {
  cx: number; cy: number; rx: number; ry: number;
  seed: number; relief: Relief; tones: RockTones; moss: boolean;
  /** the way to the light (unit, px) */
  light: Pt;
}

/** What the relief decided for each px (for the tests and for whoever lays something over it). */
export type RockRole = 'outline' | 'rim' | 'crack' | 'core' | 'body';
export interface RockForm {
  /** px key → facet (0 the top plane), height (px), shade s = n·L, and the role it was painted in */
  px: Map<number, { facet: number; h: number; s: number; role: RockRole }>;
}

const ELEV = (35 * Math.PI) / 180;

/**
 * n·L of a surface whose height rises `gx` px per px going east and `gy` going south, under the light toward
 * `light` (unit, px on the ground) raised 35° (straight overhead when [0, 0]). A flat ground gives `litBy(0, 0, light)`.
 * The rule of the relief, for whoever shades a height field of its own (the top of a crag, a drift of snow).
 */
export function litBy(gx: number, gy: number, [lx, ly]: Pt): number {
  const flat = lx === 0 && ly === 0;
  const L: [number, number, number] = flat ? [0, 0, 1] : [lx * Math.cos(ELEV), ly * Math.cos(ELEV), Math.sin(ELEV)];
  return (-gx * L[0] - gy * L[1] + L[2]) / Math.hypot(gx, gy, 1);
}
/** the front of a rock seen in 3/4 is foreshortened: its fall toward the foot reads steeper than the field says */
const FRONT = 1.3;
/** how much a px bends from the slope of its plane toward the dome under it */
const BEND = 0.1;
/** the bands of n·L: light from LIGHT (a flat top is 0.57), the middle tone from MID, shadow under it */
const LIGHT = 0.45, MID = 0.22;
/** one tone up on the body bands (the cool `speck` is not a band) */
const UP: Record<number, number> = { 2: 3, 3: 4, 4: 6, 6: 6 };

/**
 * Paint a rock body with relief over its silhouette: `pts` is key → [u, v] normalized to the edge (what `stone`
 * builds). The outline is painted as `stone` paints it; everything inside by the height field.
 */
export function paintRockForm(ctx: Ctx, name: string, pts: Map<number, Pt>, o: RockFormOpts): RockForm {
  const W = ctx.W, g = ctx.ground, t = o.tones;
  const seed = o.relief.seed ?? o.seed, R = Math.min(o.rx, o.ry);
  const has = (x: number, y: number) => pts.has(y * W + x);
  const hpx = (o.relief.height ?? 1) * R * 1.1;
  // the dome: its crest up and back, a short steep fall to the top edge and a long one to the foot
  const u0 = (h2(seed, 1, 7701) - 0.5) * 0.3, v0 = -0.26 - h2(seed, 2, 7701) * 0.12;
  const a = 1.08 + Math.abs(u0), bUp = 1 + v0 + 0.12, bDown = 1 - v0 + 0.12;
  const dome = (u: number, v: number) => {
    const b = v < v0 ? bUp : bDown;
    return Math.sqrt(Math.max(0.02, 1 - ((u - u0) / a) ** 2 - ((v - v0) / b) ** 2));
  };
  /** slope of the dome, px of height per px across */
  const slope = (u: number, v: number): Pt => {
    const b = v < v0 ? bUp : bDown, d = Math.max(0.3, dome(u, v));
    return [(hpx * -(u - u0)) / (a * a * d) / o.rx, ((v > v0 ? FRONT : 1) * hpx * -(v - v0)) / (b * b * d) / o.ry];
  };
  // the facets: tangent planes of the dome; the top one flat and cut a little under the crest
  const area = pts.size;
  const want = o.relief.facets ?? 5;
  const n = Math.max(1, Math.min(want, 1 + Math.floor(area / 16)));
  type Plane = { x: number; y: number; z: number; gx: number; gy: number };
  const planes: Plane[] = [];
  const tilt = 0.12 * hpx / R;
  planes.push({ x: o.cx + u0 * o.rx, y: o.cy + v0 * o.ry, z: hpx * 0.97, gx: (h2(seed, 3, 7701) - 0.5) * tilt, gy: (h2(seed, 4, 7701) - 0.5) * tilt });
  // one side always looks away from the light (the far side is in shadow whatever the salt says)
  const [lx0, ly0] = o.light;
  const sides = n - 1, th0 = (lx0 || ly0 ? Math.atan2(-ly0, -lx0) : Math.PI / 2) + (h2(seed, 5, 7701) - 0.5) * 0.6;
  for (let k = 0; k < sides; k++) {
    const th = th0 + (2 * Math.PI * k) / sides + (h2(seed, 10 + k, 7701) - 0.5) * (Math.PI / sides) * 0.8;
    const rho = 0.45 + 0.25 * h2(seed, 20 + k, 7701);
    const pu = u0 + rho * a * Math.cos(th) * 0.85, pv = v0 + rho * (Math.sin(th) < 0 ? bUp : bDown) * Math.sin(th) * 0.85;
    let [gx, gy] = slope(pu, pv);
    const turn = (h2(seed, 30 + k, 7701) - 0.5) * 1.1, sc = 0.75 + 0.6 * h2(seed, 40 + k, 7701);
    [gx, gy] = [(gx * Math.cos(turn) - gy * Math.sin(turn)) * sc, (gx * Math.sin(turn) + gy * Math.cos(turn)) * sc];
    planes.push({ x: o.cx + pu * o.rx, y: o.cy + pv * o.ry, z: hpx * dome(pu, pv), gx, gy });
  }
  const jit = hpx * 0.08;
  const form: RockForm = { px: new Map() };
  const facetOf = new Map<number, number>(), hOf = new Map<number, number>();
  for (const key of pts.keys()) {
    const x = key % W, y = Math.floor(key / W), X = x + 0.5, Y = y + 0.5;
    let best = 0, bh = Infinity;
    planes.forEach((p, k) => {
      const z = p.z + p.gx * (X - p.x) + p.gy * (Y - p.y) + jit * (fbm(x / 4, y / 4, seed + 50 + k, 2) - 0.5) * 2;
      if (z < bh) { bh = z; best = k; }
    });
    facetOf.set(key, best); hOf.set(key, bh);
  }
  // cracks: from the top edge down into the body, sunk into the field (the rock split along a plane)
  const crack = new Set<number>();
  const nCracks = R < 4 ? 0 : Math.min(o.relief.cracks ?? (R >= 6 ? 1 : 0), 3);
  const outline = (x: number, y: number) => !has(x + 1, y) || !has(x - 1, y) || !has(x, y + 1) || !has(x, y - 1);
  for (let c = 0; c < nCracks; c++) {
    const su = u0 + (h2(seed, 60 + c, 7701) - 0.5) * 1.0;
    let x = Math.round(o.cx + su * o.rx), y = Math.floor(o.cy - o.ry) - 2;
    while (y < o.cy && !has(x, y)) y++;
    y++;
    const len = Math.round(o.ry * (0.5 + 0.5 * h2(seed, 80 + c, 7701)));
    const drift = su < u0 ? -1 : 1;
    for (let k = 0; k < len; k++) {
      if (!has(x, y) || outline(x, y)) break;
      crack.add(y * W + x);
      const r = h2(k, c, seed + 7790);
      y += 1;
      x += r < 0.12 ? -drift : r > 0.66 ? drift : 0;
    }
  }
  for (const key of crack) hOf.set(key, hOf.get(key)! - hpx * 0.35);
  // the light, raised over the ground
  const [lx, ly] = o.light, flat = lx === 0 && ly === 0;
  const L: [number, number, number] = flat ? [0, 0, 1] : [lx * Math.cos(ELEV), ly * Math.cos(ELEV), Math.sin(ELEV)];
  // distance from the edge (4-steps), for the core: never on the edge, where the light bounces back
  const depth = new Map<number, number>();
  let ring = [...pts.keys()].filter(k => outline(k % W, Math.floor(k / W)));
  for (const k of ring) depth.set(k, 0);
  for (let d = 1; ring.length; d++) {
    const next: number[] = [];
    for (const k of ring) for (const m of [k + 1, k - 1, k + W, k - W]) if (pts.has(m) && !depth.has(m)) { depth.set(m, d); next.push(m); }
    ring = next;
  }
  const shadeOf = (key: number): number => {
    const [u, v] = pts.get(key)!, p = planes[facetOf.get(key)!];
    const [dgx, dgy] = slope(u, v);
    const gx = (1 - BEND) * p.gx + BEND * dgx, gy = (1 - BEND) * p.gy + BEND * dgy;
    const nn = Math.hypot(gx, gy, 1);
    return (-gx * L[0] - gy * L[1] + L[2]) / nn;
  };
  const against = (key: number): boolean => {
    const [u, v] = pts.get(key)!, p = planes[facetOf.get(key)!], [dgx, dgy] = slope(u, v);
    const gx = (1 - BEND) * p.gx + BEND * dgx, gy = (1 - BEND) * p.gy + BEND * dgy;
    return -gx * lx - gy * ly < -0.15;
  };
  const sOf = new Map<number, number>();
  for (const key of pts.keys()) sOf.set(key, shadeOf(key));
  // the core: a face turned from the light, off the edge, just under a crest — a few px toward the light there is
  // a side face that is not turned away and stands as high or higher (the ridge the light comes over; not the lip
  // of the top plane, where a dark line reads as a mouth). Farther from the
  // ridge the light bounces back and the face keeps its shadow tone; a px alone is not a core
  const turned = new Set([...pts.keys()].filter(against));
  const reach = R >= 14 ? 2 : 1;
  const underCrest = (key: number): boolean => {
    if (flat) return false;
    const x0 = key % W + 0.5, y0 = Math.floor(key / W) + 0.5, h0 = hOf.get(key)!, f0 = facetOf.get(key)!;
    for (let d = 1; d <= reach + 1; d++) {
      const X = Math.floor(x0 + lx * d), Y = Math.floor(y0 + ly * d), m = Y * W + X;
      if (!pts.has(m) || outline(X, Y)) return false;
      if (facetOf.get(m) !== f0 && facetOf.get(m) !== 0 && !turned.has(m) && hOf.get(m)! >= h0 - 0.3) return true;
    }
    return false;
  };
  let coreSet = new Set<number>();
  for (const key of turned) {
    if (!crack.has(key) && sOf.get(key)! < MID && (depth.get(key) ?? 0) >= 2 && underCrest(key)) coreSet.add(key);
  }
  for (let pass = 0; pass < 2; pass++) {
    coreSet = new Set([...coreSet].filter(k => [k + 1, k - 1, k + W, k - W].some(m => coreSet.has(m))));
  }
  const band = (s: number): number => (s >= LIGHT ? 6 : s >= MID ? 4 : 3);
  const toneOf = [t.line, t.line, t.dark, t.shadow, t.mid, t.speck, t.light, t.high];
  const big = R >= 9;
  const sx = lx > 0.3 ? 1 : lx < -0.3 ? -1 : 0, sy = ly > 0.3 ? 1 : ly < -0.3 ? -1 : 0;
  const lum = new Map<number, number>();
  for (const [key, [dx, dy]] of pts) {
    const x = key % W, y = Math.floor(key / W);
    const s = sOf.get(key)!, facet = facetOf.get(key)!, h = hOf.get(key)!;
    let role: RockRole;
    let b: number;
    if (outline(x, y)) {
      // the outline as stone() draws it: lighter on its lit top-left
      role = 'outline';
      g.set(x, y, dy > -0.2 || dx > 0.3 ? t.line : t.dark);
      ctx.setKind(x, y, name);
      form.px.set(key, { facet, h, s, role });
      continue;
    }
    if (crack.has(key)) { role = 'crack'; b = 2; } else {
      role = 'body';
      b = band(s);
      if (coreSet.has(key)) { role = 'core'; b = 2; }
      // the rim: one px inside the outline where the edge meets the light
      const toward = (sx !== 0 && !has(x + 2 * sx, y) && outline(x + sx, y)) || (sy !== 0 && !has(x, y + 2 * sy) && outline(x, y + sy));
      const meets = (dx * lx + dy * ly) / (Math.hypot(dx, dy) || 1) > 0.25;
      if (toward && meets && !flat && s > MID) { role = 'rim'; b = 7; }
    }
    lum.set(key, b);
    form.px.set(key, { facet, h, s, role });
  }
  // a long transition inside one face of a big rock: where two bands meet inside the face (not on a ridge), every
  // other px of the darker side of the line takes the lighter tone — a stitch one px wide, and only where the line
  // runs long (a few px of it are a ridge's wobble, not a transition)
  if (big) {
    const stitch = new Map<number, number[]>();
    for (const [key, e] of form.px) {
      if (e.role !== 'body') continue;
      const b = lum.get(key)!;
      const up = [key + 1, key - 1, key + W, key - W].find(m => {
        const f = form.px.get(m);
        return f && f.role === 'body' && f.facet === e.facet && lum.get(m)! > b;
      });
      if (up === undefined) continue;
      const id = e.facet * 8 + b;
      stitch.set(id, [...(stitch.get(id) ?? []), key]);
    }
    for (const line of stitch.values()) {
      if (line.length < Math.max(6, R)) continue;
      for (const key of line) {
        if ((key % W + Math.floor(key / W)) % 2) continue;
        const above = [key + 1, key - 1, key + W, key - W].map(m => lum.get(m) ?? 0).filter(v => v > lum.get(key)!);
        lum.set(key, Math.min(...above));
      }
    }
  }
  // a ridge between two faces of one tone: the px on the face turned farther from the light one tone down
  if (R >= 6) {
    const seam: number[] = [];
    for (const [key, b] of lum) {
      const e = form.px.get(key)!;
      if (e.role !== 'body') continue;
      for (const m of [key + 1, key - 1, key + W, key - W]) {
        const f = form.px.get(m);
        if (f && f.role === 'body' && f.facet !== e.facet && lum.get(m) === b && f.s > e.s) { seam.push(key); break; }
      }
    }
    for (const key of seam) { const b = lum.get(key)!; lum.set(key, b === 6 ? 4 : Math.max(3, b - 1)); }
  }
  // the wall across a crack that faces the light: one tone up
  for (const key of crack) {
    const x = key % W, y = Math.floor(key / W), m = y * W + x - sx;
    const e = form.px.get(m);
    if (sx !== 0 && e && e.role === 'body' && !crack.has(m)) lum.set(m, UP[lum.get(m)!]);
  }
  for (const [key, b] of lum) {
    const x = key % W, y = Math.floor(key / W), v = pts.get(key)![1], role = form.px.get(key)!.role;
    let c = toneOf[b];
    if (o.moss && role !== 'crack' && role !== 'core' && b >= 4 && v < -0.9 + 0.95 * fbm(x / 4, y / 2.5, o.seed + 2, 2)) {
      c = b === 7 ? t.moss[3] : b >= 5 ? t.moss[2] : t.moss[1];
    }
    g.set(x, y, c);
    ctx.setKind(x, y, name);
  }
  return form;
}
