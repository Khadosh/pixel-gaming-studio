// A bluff: a rock with a flat top seen from above in 3/4, the peña a pavilion stands on (the Campana Alta of The
// Unwritten Dao, #355: «la sensación de riscos en cada casa de los laterales»). One description:
//   the top: a polygon, painted with its material if `fill` says so (the snow under the paving of a terrace), a line
//     of shade where it meets what lies beyond it (it stands apart from the rock behind);
//   the face: under the south rim, broken rock in blocks taller than wide (mapsteps/rockblocks.ts, the rock of the
//     faces of a cataract), each lit on its west facet and its top with a line of shadow under it; lit near the rim and
//     darker as it goes down (the light comes from above: three planes), the west end of the face lit where it turns
//     toward the light and the east end in shade; it pulls in as it goes down (`taper`: a pillar, not a wall), its foot
//     ragged by blocks;
//   the rim: a cornice of snow along it, wavy, its shadow on the face under it and icicles hanging from it; snow on
//     some blocks of the face, with their own icicles;
//   the foot: lost in the mist (`foot`), or ending on what is under it with a row of shadow.

import { fbm, h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { BluffStep } from './bluffschema';
import { blockAbove, rockBlocks } from './rockblocks';


function inside(px: number, py: number, poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function runBluff(ctx: Ctx, st: BluffStep): void {
  const g = ctx.ground, s = st.salt ?? 1641;
  const r = (i: number) => ctx.tone(st.material, i);
  const rockTones = ctx.mat(st.material).ramp;
  const sun = st.light === 'east' ? -1 : 1;
  const colw = st.columns ?? 6, strata = st.strata ?? 14, taper = (st.taper ?? 2) / 10, cornice = st.cornice ?? 3;
  const rockAt = rockBlocks(colw, strata), tiers = st.tiers ?? 1;
  const poly = st.top.map(([u, v]) => ctx.P(u, v)) as [number, number][];
  const isIn = (x: number, y: number) => inside(x + 0.5, y + 0.5, poly);
  const paint = (x: number, y: number, c: string, kind: string | null) => {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
    g.set(x, y, c);
    if (kind) ctx.setKind(x, y, kind);
  };
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const X0 = Math.floor(Math.min(...xs)), X1 = Math.ceil(Math.max(...xs)), Y0 = Math.floor(Math.min(...ys)), Y1 = Math.ceil(Math.max(...ys));
  // the face under the rim at a column, px
  const faceAt = (x: number): number => {
    if (typeof st.face === 'number') return st.face;
    const u = (x + 0.5 - ctx.ox) / ctx.cell, f = st.face;
    if (u <= f[0].u) return f[0].px;
    for (let i = 1; i < f.length; i++) if (u <= f[i].u) { const k = (u - f[i - 1].u) / (f[i].u - f[i - 1].u); return f[i - 1].px + (f[i].px - f[i - 1].px) * k; }
    return f[f.length - 1].px;
  };
  // 2. the face, column by column under the south rim
  let xmin = Infinity, xmax = -Infinity;
  const lip = new Map<number, number>();
  for (let x = X0; x <= X1; x++) {
    for (let y = Y1; y >= Y0; y--) if (isIn(x, y)) { lip.set(x, y); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); break; }
  }
  const face = (put: (x: number, y: number, c: string, kind: string | null) => void): void => {
    const cuts = (st.cuts ?? []).map(([a, b]) => [ctx.P(a, 0)[0], ctx.P(b, 0)[0]]);
    for (const [x, yl] of lip) {
      const D = faceAt(x);
      if (D <= 0) continue;
      // a cleft cut down the face (where a stair goes): nothing here; beside it, its walls
      if (cuts.some(([a, b]) => x + 0.5 >= a && x + 0.5 < b)) continue;
      const cleft = cuts.map(([a, b]) => (x + 0.5 < a && a - x - 0.5 < 5 ? -(a - x - 0.5) : x + 0.5 >= b && x + 0.5 - b < 5 ? x + 0.5 - b : 0)).find(v => v !== 0) ?? 0;
      const cap = Math.max(1, cornice + 1.5 * n1(x / 7, s + 2) + Math.floor(h2(x >> 2, 3, s + 83) * 3) - 1);   // ragged every few px: never a ruler
      const icicle = st.icicles && h2(x, 0, s + 80) < 0.4 ? 2 + Math.floor(h2(x, 1, s + 81) ** 2 * 9) : 0;
      for (let d = 0; d <= D + strata; d++) {
        const y = yl + 1 + d;
        if (isIn(x, y)) break;                               // a concave rim: the top again
        const course = Math.floor((d + (s % 7)) / strata);
        const pull = taper * d * (0.7 + 0.6 * h2(course, 3, s + 4));
        const inL = x - xmin - pull, inR = xmax - x - taper * d * (0.7 + 0.6 * h2(course, 4, s + 4));
        if (inL < 0 || inR < 0) continue;
        const b = rockAt(x, y, s);
        const limit = D * (0.86 + 0.28 * h2(b.id, 5, s + 6));
        if (d > limit) {
          if (!st.foot && d < limit + 1) { const was = g.get(x, y); if (was !== null) put(x, y, ctx.shade(was, ctx.kindAt(x, y)) ?? was, null); }
          continue;
        }
        const k = d / Math.max(1, D);
        const [up, upId] = blockAbove(rockAt, x, y, b.id, s);
        let i = 4;
        const hc = h2(b.id, 0, s + 31);
        if (hc < 0.25) i -= 1; else if (hc > 0.8) i += 1;
        const rel = (x + 0.5 - b.sx) * sun / (b.w * 0.5);    // across the block: < 0 toward the light
        if (rel < -0.3) i += 1; else if (rel > 0.4) i -= 1;
        if (up < 2) i += 1;
        // the light comes from above: lit near the rim, three planes down to the dark foot
        const kb = k + 0.18 * (h2(b.id, 7, s + 33) - 0.5);   // the planes change block by block, not along a row
        if (kb > 0.7) i -= 2; else if (kb > 0.38) i -= 1;
        // the tiers: each one set back under a ledge, lit again at its top
        // (the ledge steps by columns of rock, a few px up or down, and wanders a little: not a hoop around a barrel)
        const tierH = D / tiers, col = Math.floor((x + (s % 5)) / (colw * 1.6));
        const dd = d + 2.5 * n1(x / 5, s + 91) + Math.round(10 * (h2(col, Math.floor(d / Math.max(1, tierH)), s + 96) - 0.5));
        const tier = Math.max(0, Math.min(tiers - 1, Math.floor(dd / tierH))), inTier = dd - tier * tierH;
        if (tier > 0 && inTier < tierH * 0.3) i += 1;
        // the ends of the face turn away: the one toward the light lit, the other in shade
        const toLight = sun > 0 ? inL : inR, away = sun > 0 ? inR : inL;
        if (toLight < 5) i += 1;
        if (away < 6) i -= 1;
        if (h2(x, y, s + 27) < 0.08) i += h2(x, y, s + 28) < 0.5 ? 1 : -1;   // the grain
        i = Math.max(1, i);
        let c = r(Math.max(0, Math.min(6, i)));
        if (rockAt(x, y + 1, s).id !== b.id) c = r(k > 0.5 ? 0 : 1);       // the shadow under a block
        else if (b.gap < 1.2 && rel > 0) c = r(k > 0.4 ? 0 : k > 0.15 ? 1 : 2);   // the crevice on its dark side
        if (away < 1) c = r(0);                                            // the outline of the side in shade
        else if (toLight < 1) c = r(2);
        if (st.snow) {
          const snowy = (id: number) => h2(id, 1, s + 35) < 0.3 + 0.2 * (1 - k);
          const thick = 1 + Math.floor(h2(b.id, 2, s + 36) * 2);
          if (k < 0.8 && snowy(b.id) && up < thick && away >= 1) c = st.snow[up === 0 ? 0 : 1];
          else if (k < 0.8 && snowy(b.id) && up < thick + 1) c = r(Math.max(0, Math.min(5, i - 2)));
          else if (st.icicles && k < 0.8 && upId >= 0 && snowy(upId) && up < 1 + Math.floor(h2(x, upId, s + 37) * 4) && h2(x, upId, s + 39) < 0.4) c = st.icicles[up === 0 ? 0 : 1];
        }
        // the ledge of a tier: a lip of snow in stretches (or the lit edge of the rock), the shadow under it
        const ledge = tier > 0 && h2(col, tier, s + 97) < 0.6;
        if (ledge && inTier < 2) c = st.snow && h2(col, tier, s + 95) < 0.6 ? st.snow[inTier < 1 ? 0 : 1] : r(inTier < 1 ? 5 : 1);
        else if (ledge && inTier < 4) c = r(inTier < 3 ? 0 : 1);
        // the rim: the cornice of snow, its shadow under it, the icicles hanging from it
        if (st.snow && d < cap) c = st.snow[d < cap - 1.2 || h2(x, 2, s + 82) < 0.5 ? 0 : 1];
        else if (st.snow && d < cap + 2 && !(icicle && d < cap + icicle)) c = r(d < cap + 1 ? 0 : 1);
        else if (st.icicles && icicle && d < cap + icicle) c = st.icicles[d === Math.ceil(cap) || (x + d) % 3 === 0 ? 0 : 1];
        // the overhang throws its shade a few px down the face: the cornice stands out from it
        else if (st.snow && d < cap + 6) c = r(Math.max(0, Math.min(6, (rockTones.indexOf(c) < 0 ? 3 : rockTones.indexOf(c)) - (d < cap + 4 ? 2 : 1))));
        // the walls of a cleft: the one that looks west lit, the one that looks east in shade, the edge at the opening dark
        if (cleft !== 0) {
          const lookWest = cleft > 0;
          const ci = rockTones.indexOf(c);
          if (Math.abs(cleft) < 1.5) c = r(0);
          else if (ci >= 0) c = lookWest === sun > 0 ? r(Math.min(6, ci + 1)) : r(Math.max(0, ci - 2));
        }
        let kind: string | null = st.material;
        // the foot, lost in the mist
        if (st.foot && d > limit - st.foot.fade) {
          const p = (d - (limit - st.foot.fade)) / st.foot.fade, mm = ctx.mat(st.foot.mist).ramp;
          // wavy bands of mist over the rock, thicker and lighter down: crisp px, no dither
          const q = p + 0.22 * n1(x / 7 + d / 13, s + 92) + 0.12 * n1(x / 3, s + 93);
          if (q > 0.3) { c = mm[mm.length - 1 - (q < 0.6 ? 1 : 0)]; kind = st.foot.mist; }
        }
        put(x, y, c, kind);
      }
    }
  };
  // 1. the top: its material, and a line of shade where it meets what lies beyond it on the west and the east
  if (st.fill) {
    const m = ctx.mat(st.fill), n = m.ramp.length, b = ctx.base(st.fill);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      if (!isIn(x, y)) continue;
      const v = fbm(x / 9, y / 6, s + 1, 2);
      let i = b + (v > 0.68 ? 1 : v < 0.3 ? -1 : 0);
      if (st.dome) {
        // a rounded top: lit toward the light, a tone down on the far side and two at its rim there
        const u = ((x + 0.5 - (X0 + X1) / 2) / Math.max(1, (X1 - X0) / 2)) * sun, w = (y + 0.5 - (Y0 + Y1) / 2) / Math.max(1, (Y1 - Y0) / 2);
        const lit = -0.6 * u - 0.8 * w;
        i = b + (lit > 0.3 ? 1 : lit < -0.15 ? -1 : 0);
        if (lit < 0 && (!isIn(x + sun * 2, y) || !isIn(x, y + 2))) i = b - 2;
        if (v > 0.75 && lit > -0.2) i += 1;
      }
      paint(x, y, m.ramp[Math.max(0, Math.min(n - 1, i))], st.fill);
    }
  }
  for (let y = Y0 - 1; y <= Y1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
    if (isIn(x, y) || isIn(x, y - 1)) continue;          // the south rim is the face's
    if (isIn(x + 1, y) || isIn(x - 1, y)) paint(x, y, r(1), null);
  }
  // 2. the face
  face(paint);
}
