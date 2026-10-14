// A cataract: a waterfall in a gorge of rock seen from above in 3/4 (the Campana Alta of The Unwritten Dao, #353:
// «¿con pinos en el agua? A esto me refería yo con los pasos de agua»). One description, top to bottom:
//   the lip: a curve bowing toward the viewer, the calm water behind it, a glint where it bends over, the sheet broken
//     in strands for a few px (the dark wet rock shows between them) before it closes;
//   the sheet: narrowing or opening as it falls, its edges wandering, in bands of two tones with streaks that lengthen
//     as it drops, whiter toward the edges (spray past them) and toward the foot;
//   the faces: the cut of the gorge on each side, columns of rock (lit on their west facet, the face toward the light
//     lighter), cornices of snow every few px with icicles under them, wet and dark against the water, snow on the rim;
//   the basin (`pool`): calm water wider than the sheet in a rim of stones, ripples around where it lands, a ring of
//     foam, the current toward the next lip, which leaves from its far rim (the rest between two drops);
//   the mist: pale specks rising over the foot of every drop, thinning upward and outward, over the faces too.
// On a flow layer the light streaks of the sheets run down; on a foam layer the foam, the spray and the mist churn (#356).

import { h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { CataractStep } from './cataractschema';
import { foamPainter } from './foam';
import { blockAbove, rockBlocks } from './rockblocks';

interface Drop { lx: number; ly: number; fx: number; fy: number; w0: number; w1: number; face: number; lip: number;
  pool: [number, number] | null; pcy: number; i: number; outlet: [number, number] | null; still: boolean; fade: number }

const smooth = (k: number) => k * k * (3 - 2 * k);

export function runCataract(ctx: Ctx, st: CataractStep): void {
  const g = ctx.ground, salt = st.salt ?? 1621;
  const t = (i: number) => ctx.tone(st.material, i);
  const r = (i: number) => ctx.tone(st.rock, i);
  const flow = st.flow ? ctx.layer(st.flow) : null;
  const fp = foamPainter(ctx, st.foam, st.material, salt);
  const sun = st.light === 'east' ? -1 : 1;
  const colw = st.columns ?? 5, strata = st.strata ?? 11, mist = st.mist ?? 0.5, shade = st.shade ?? 0;
  const put = (x: number, y: number, c: string, kind: string | null) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
    g.set(x, y, c);
    if (kind) ctx.setKind(x, y, kind);
  };
  // the drops laid out: each lip on the far rim of the basin above (or at its foot)
  const drops: Drop[] = [];
  let [lx, ly] = ctx.P(st.at[0], st.at[1]);
  ly = Math.round(ly);
  st.drops.forEach((d, i) => {
    const fx = lx + (d.shift ?? 0), fy = ly + d.length;
    const pool = d.pool ?? null;
    const pcy = pool ? fy + Math.round(pool[1] * 0.45) : fy;
    drops.push({ lx, ly, fx, fy, w0: d.width[0], w1: d.width[1], face: d.face ?? 14, lip: d.lip ?? 3, pool, pcy, i, outlet: d.outlet ?? null, still: d.still ?? false, fade: d.pool ? 0 : d.fade ?? 0 });
    lx = fx;
    ly = pool ? Math.round(pcy + pool[1] * 0.85) : fy + 2;
  });
  // the edges of a sheet at a row: [west, east] px
  const edges = (d: Drop, y: number): [number, number, number] => {
    const k = Math.max(0, Math.min(1, (y - d.ly) / (d.fy - d.ly)));
    const mid = d.lx + (d.fx - d.lx) * smooth(k);
    const hw = d.w0 + (d.w1 - d.w0) * smooth(k) + (y - d.ly < 3 ? 1 : 0);
    const s = salt + 7 * d.i;
    return [mid - hw - 2 * n1(y / 9, s + 1), mid + hw + 2 * n1(y / 9, s + 2), k];
  };
  // the rock of the faces: blocks taller than wide (mapsteps/rockblocks.ts)
  const rockAt = rockBlocks(colw, strata);
  const above = (x: number, y: number, id: number, s: number): [number, number] => blockAbove(rockAt, x, y, id, s);
  // 1. the faces of the gorge, both sides of every drop
  for (const d of drops) {
    const s = salt + 7 * d.i;
    // the faces go on beside the basin, down to its far rim: the basin lies in the gorge, not on the snow
    const end = d.pool ? Math.ceil(d.pcy + d.pool[1] + 4) : d.fy + 2;
    for (let y = d.ly - 2; y < end; y++) {
      const [xl, xr, k] = edges(d, y);
      for (const side of [-1, 1]) {
        // the outer edge wanders and steps by courses: blocks of rock, not a ruler
        const course = Math.floor((y - d.ly + 40) / strata);
        const fw = d.face * (0.8 + 0.35 * n1(y / 14, s + 3 + side)) + 4 * (h2(course, side + 2, s + 4) - 0.5);
        const lit = side * sun > 0;                       // the east face looks west: toward a west light
        for (let dd = 0; dd <= fw + 1; dd++) {
          const x = side < 0 ? Math.floor(xl) - dd : Math.ceil(xr) + dd;
          if (dd > fw && h2(x, y, s + 5) < 0.5) continue; // the outer rim, ragged
          if (y < d.ly) { put(x, y, st.snow ? st.snow[lit ? 0 : 1] : r(5), st.rock); continue; }   // the rim at the head
          // the face: broken rock, blocks of uneven size taller than wide (no courses, no columns in a row): each lit on
          // its west side and its top, a dark line under it, crevices between two; some capped with snow, icicles
          // hanging from the cap over the block under it; the face toward the light lighter
          const b = rockAt(x, y, s);
          const [up, upId] = above(x, y, b.id, s);
          let i = lit ? 4 : 3;
          const hc = h2(b.id, 0, s + 31);
          if (hc < 0.25) i -= 1; else if (hc > 0.8) i += 1;
          const rel = (x + 0.5 - b.sx) * sun / (b.w * 0.5);   // across the block: < 0 toward the light
          if (rel < -0.3) i += 1; else if (rel > 0.4) i -= 1;  // a prism: its facet toward the light lit, the other dark
          if (up < 2) i += 1;                                  // the top of the block
          // the depth by value: the light comes from above, so the face goes darker the lower it is in the drop and
          // the nearer the sheet (deep in the cut), lighter toward the rim
          const near = dd / Math.max(1, fw);
          // (three planes from the lit rim back to the dark bottom: the black kept for the crevices and the hollow)
          if (k > 0.75) i -= 2; else if (k > 0.4) i -= 1;
          if (near < 0.33) i -= 1; else if (near > 0.66) i += 1;
          i = Math.max(1, i);
          if (d.i === 0 && y - d.ly < shade) i = Math.min(i, y - d.ly < shade * 0.6 ? 0 : 1);   // the shadow of the bridge, a sharp edge
          if (h2(x, y, s + 27) < 0.08) i += h2(x, y, s + 28) < 0.5 ? 1 : -1;   // the grain of the stone
          let c = r(Math.max(0, Math.min(5, i)));
          if (rockAt(x, y + 1, s).id !== b.id) c = r(lit ? 1 : 0);   // the shadow under a block
          else if (b.gap < 1.2 && rel > 0) c = r(lit ? 1 : 0); // the crevice on the dark side of a block
          if (st.snow && dd > 1) {
            const snowy = (id: number) => h2(id, 1, s + 35) < 0.38;
            const thick = 1 + Math.floor(h2(b.id, 2, s + 36) * 2);
            if (snowy(b.id) && up < thick) c = st.snow[up === 0 ? 0 : 1];
            else if (snowy(b.id) && up < thick + 2) c = r(up === thick ? 0 : Math.max(0, Math.min(5, i - 2)));   // the shadow the cornice throws
            else if (upId >= 0 && snowy(upId) && up < 1 + Math.floor(h2(x, upId, s + 37) * 5) && h2(x, upId, s + 39) < 0.45) c = up === 0 ? t(4) : t(2);
          }
          // the hollow behind the water: the face goes dark and wet against it, deeper the lower
          if (dd < 1 || (dd < 2 + 2.5 * k && !lit)) c = r(0);
          else if (dd < 2 + 1.5 * k) c = r(1);
          else if (dd < 4 && h2(x, Math.floor(y / 3), s + 41) < 0.12) c = t(1);   // a wet streak
          // the rim of the gorge: a cornice of snow a few px wide, wavy, with the shadow it throws on the face under it
          // (in stretches: elsewhere the rock edge itself, a dark line, the snow of the terrace beyond it)
          const capped = h2(Math.floor((y + 40) / 9), side + 5, s + 8) < 0.55;
          const cap = capped ? 2.5 + 1.5 * n1(y / 7, s + 6 + side) : 0;
          if (capped && dd > fw - cap) c = st.snow ? st.snow[dd > fw - cap + 1 || lit ? 0 : 1] : r(5);
          else if (dd > fw - cap - 1.2) c = r(lit ? 1 : 0);
          put(x, y, c, st.rock);
        }
      }
    }
  }
  // 2. the basins: calm water wider than the sheet, a rim of stones, the gap where the next lip leaves
  drops.forEach((d, n) => {
    if (!d.pool) return;
    const [rx, ry] = d.pool, s = salt + 7 * d.i, next = drops[n + 1];
    const cx = d.fx, cy = d.pcy;
    const rad = (a: number) => 1 + 0.16 * Math.sin(3 * a + s) + 0.1 * Math.sin(5 * a + 2 * s) + 0.07 * Math.sin(2 * a + 3 * s) + 0.05 * Math.sin(7 * a + s);
    // where the water leaves the basin: the next lip, or the outlet to a stream
    const gx = next ? next.lx : d.outlet ? d.fx + d.outlet[0] : 0, gap = next ? next.w0 + 1 : d.outlet ? d.outlet[1] : -99;
    const gy = next ? next.ly : Infinity;
    for (let y = Math.floor(cy - ry - 5); y <= Math.ceil(cy + ry + 5); y++) for (let x = Math.floor(cx - rx - 5); x <= Math.ceil(cx + rx + 5); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy / ry, dx / rx), k = rad(a);
      // flat against the foot of the cliff it falls from (north), round on the far side: a basin, not a saucer
      const ryy = dy < 0 ? ry * 0.5 : ry;
      const q = Math.hypot(dx / rx, dy / ryy) / k, qo = Math.hypot(dx / (rx + 6), dy / (ryy + (dy > 0 ? 9 : 5))) / k;
      if (q <= 1 || (dy > 0 && Math.abs(x + 0.5 - gx) <= gap && y < gy)) {
        // the water: lighter along the edge, ripples around the landing, the current toward the next lip
        // deep under the cliff it falls from (north), lighter on the shallows of the far rim (south)
        let c = dy < ry * 0.3 || Math.abs(dx) > rx * 0.78 ? (q > 0.35 || h2(x, y, s + 54) < 0.6 ? t(0) : t(1)) : dy > ry * 0.62 || (dy > 0 && q > 0.86) ? t(2) : t(1);
        const rr = Math.hypot((x + 0.5 - d.fx) / (d.w1 + 3), (y + 0.5 - d.fy) / ((d.w1 + 3) * 0.45));
        if (rr > 1 && (rr * 2.4 + 0.6 * h2(x, 0, s + 51)) % 1 < 0.16 && h2(x, y, s + 53) < 0.75) c = t(2);
        if (q > 0.45 && q < 0.8 && h2(x, y, s + 55) < 0.05) c = t(0);
        if (next && dy > 0 && Math.abs(x + 0.5 - next.lx) < next.w0 && (y + Math.floor(h2(x, 1, s + 57) * 6)) % 7 < 2) c = t(2);
        put(x, y, c, st.material);
      } else if (gap > 0 && dy > 0 && Math.abs(x + 0.5 - gx) <= gap + 3 && qo <= 1.05) {
        // the notch the water leaves by: a block of rock each side of it, lit on top
        const yy = y - Math.round(cy + ry * 0.6);
        put(x, y, yy < 1 ? r(5) : yy < 3 ? r(4) : r(1), st.rock);
      } else if (qo <= 1 && dy > -ryy * 0.35) {
        // the rim: stones by turns of the curve, lit on top, wet inside, in shade on the outside; snow on the near rim
        // stones by turns of the curve: the inside wet and dark, their top lit, the outside in shade; snow on some
        const stone = Math.floor((a + Math.PI) * (rx + ry) / 9), sq = h2(stone, 0, s + 59);
        const edge = Math.floor((a + Math.PI) * (rx + ry) / 9 + 0.35) !== stone;   // the joint between two stones
        let i = sq < 0.5 ? 4 : 3;
        if (q < 1.08) i = dy < ry * 0.3 ? 0 : 2;              // the wet edge: dark at the back, lit at the front
        else if (q < 1.16 && dy < ry * 0.3) i = 1;
        else if (dy > ry * 0.3 && i === 3 && qo < 0.8) i = 4;  // the near shore catches the light
        else if (qo > 0.9) i = dy < 0 ? 1 : 0;                // the outside of the rim: on the near side the step down
        else if (edge) i = 1;
        let c = r(i);
        if (st.snow && qo > 0.74 && qo <= 0.9 && sq > 0.72 && !edge) c = st.snow[dy < 0 ? 1 : 0];
        put(x, y, c, st.rock);
      }
    }
  });
  // 3. the sheets: the calm water behind the lip, the lip, the strands, the fall
  for (const d of drops) {
    const s = salt + 7 * d.i;
    for (let y = d.ly; y < d.fy; y++) {
      const [xl, xr] = edges(d, y), mid = (xl + xr) / 2, half = (xr - xl) / 2;
      for (let x = Math.floor(xl); x <= Math.ceil(xr); x++) {
        const px = x + 0.5, dx = (px - mid) / half;
        if (Math.abs(dx) > 1) continue;
        const yl = d.ly + d.lip * (1 - dx * dx), dy = y - Math.round(yl);
        if (d.still) {
          // a stream that runs on: long streaks of the shallow tone on the mid one, darker against its banks
          const v = h2(x, Math.floor((y + 17 * h2(x, 3, s + 64)) / (8 + Math.trunc(h2(x, 4, s + 65) * 10))), s + 66);
          put(x, y, Math.abs(dx) > 0.8 ? t(0) : v < 0.18 ? t(2) : v < 0.22 ? t(3) : t(1), st.material);
          if (flow && Math.abs(dx) < 0.7 && h2(x, Math.floor(y / 4), s + 49) < 0.2) flow.set(x, y, t(2));
          continue;
        }
        if (dy < 0) { put(x, y, dy === -1 ? t(2) : t(1), st.material); continue; }
        if (dy === 0) { put(x, y, t(4), st.material); continue; }
        if (dy === 1) { put(x, y, t(3), st.material); continue; }
        // where it bends over, the sheet is thinner and in its own shade before it whitens in the fall
        if (dy < 6 && Math.abs(dx) > 0.82) { put(x, y, r(0), st.rock); continue; }
        if (dy < 5) { put(x, y, (x + dy) % 3 === 0 ? t(2) : t(1), st.material); continue; }
        const kk = (y - yl) / Math.max(1, d.fy - yl);
        // the break: for a few px under the lip the sheet is strands, the dark rock between them
        if (dy < 2 + h2(x, d.i, s + 42) * 6 && h2(x, d.i, s + 43) < 0.22) { put(x, y, r(0), st.rock); continue; }
        // the sheet tears as it falls: a few narrow rifts open down it, the dark wet rock behind, their lips white
        const rift = Math.floor((x + 0.8 * n1(y / 17, s + 58)) / 2), rg0 = 0.12 + 0.45 * h2(rift, d.i, s + 61), rg1 = rg0 + 0.18 + 0.4 * h2(rift, d.i, s + 62);
        if (half >= 8 && Math.abs(dx) < 0.75 && h2(rift, d.i, s + 60) < 0.22 && kk > rg0 && kk < rg1) {
          const xr0 = Math.floor((x + 0.8 * n1(y / 17, s + 58)) % 2);
          put(x, y, kk < rg0 + 0.03 || kk > rg1 - 0.03 ? t(3) : xr0 === 0 ? r(0) : r(1), st.rock);
          continue;
        }
        const band = Math.floor((x + 1.5 * n1(y / 19, s + 44)) / 2);
        // bright where it leaves the lip, bluer and dimmer as it falls into the shade, then the foam
        const dim = kk > 0.3 && kk < 0.78;
        let c = h2(band, d.i, s + 45) < (kk < 0.25 ? 0.35 : dim ? 0.8 : 0.6) ? t(1) : t(2);
        const run = 3 + Math.trunc(h2(x, 1, s + 46) * 5) + Math.trunc(kk * 10);
        const v = h2(x, Math.floor((y + 13 * h2(x, 0, s + 46)) / run), s + 47);
        const e = Math.abs(dx) ** 3, pl = (0.08 + 0.4 * e) * (kk < 0.25 ? 1.8 : dim ? 0.6 : 1) + 0.12 * kk;
        if (v < pl * 0.25) c = t(4);
        else if (v < pl) c = t(3);
        else if (v > (dim ? 0.74 : 0.86) && Math.abs(dx) < 0.6) c = t(0);
        if (Math.abs(dx) > 0.9) c = h2(x, Math.floor(y / 2), s + 52) < 0.6 ? t(3) : t(2);
        if (kk > 0.72 && h2(x, y, s + 48) < (kk - 0.72) * 2.4) c = t(3);
        if (d.i === 0 && y - d.ly < shade * 0.6 && c !== t(0)) c = ctx.tone(st.material, Math.max(0, ['', t(1), t(2), t(3), t(4)].indexOf(c) - 1));
        put(x, y, c, st.material);
        if (flow && Math.abs(dx) < 0.85 && dy > 3 && h2(x, Math.floor(y / 3), s + 49) < 0.35) flow.set(x, y, (y % 3) === 0 ? t(4) : t(3));
      }
      if (d.still) continue;
      // spray past the edges, more toward the foot
      const kk = (y - d.ly) / Math.max(1, d.fy - d.ly);
      for (const [x, side] of [[Math.floor(xl) - 1, -1], [Math.ceil(xr) + 1, 1]] as const) {
        for (let o = 0; o < 2; o++) if (h2(x + side * o, y, s + 50 + o) < (0.15 + 0.5 * kk) * Math.min(1, (d.w0 + d.w1) / 20) / (1 + o)) fp.spray(x + side * o, y, t(3));
      }
    }
  }
  // 3b. a sheet with no floor under it (`fade`): past its foot it goes on falling, opening and breaking in threads of
  // spray that thin out until only the mist is left (#354: the fall of the plaza into the sea of clouds)
  for (const d of drops) {
    if (!d.fade || d.still) continue;
    const s = salt + 7 * d.i, [xl0, xr0] = edges(d, d.fy - 1), mid0 = (xl0 + xr0) / 2, half0 = (xr0 - xl0) / 2;
    for (let y = d.fy; y < d.fy + d.fade; y++) {
      const k = (y - d.fy) / d.fade, half = half0 + 6 * k + 1.5 * n1(y / 7, s + 81);
      for (let x = Math.floor(mid0 - half); x <= Math.ceil(mid0 + half); x++) {
        const dx = (x + 0.5 - mid0) / half;
        if (Math.abs(dx) > 1) continue;
        // threads: each column of px breaks in runs; fewer and shorter the lower, the edges first
        const run = 2 + Math.trunc(h2(x, 5, s + 82) * 6) * (1 - k);
        const v = h2(x, Math.floor((y + 11 * h2(x, 6, s + 83)) / Math.max(1, run)), s + 84);
        if (v > (1 - k) ** 1.5 * (1 - 0.5 * Math.abs(dx) ** 2)) continue;
        const c = v < 0.2 * (1 - k) ? t(1) : v < 0.45 ? t(2) : t(3);
        put(x, y, c, st.material);
        if (flow && Math.abs(dx) < 0.8 && h2(x, Math.floor(y / 3), s + 85) < 0.3) flow.set(x, y, (y % 3) === 0 ? t(4) : t(3));
      }
    }
  }
  // 4. where each sheet lands: the ring of foam on its basin, or a heap of foam; then the mist rising
  for (const d of drops) {
    if (d.still) continue;
    const s = salt + 7 * d.i;
    const big = Math.min(1, d.w1 / 12), fy = d.fy + Math.round(d.fade * 0.6), halo = 1 + (d.pool ? 0.35 : 0.7) * big, rxf = d.w1 + (d.pool ? 3 : Math.min(8, 2 + d.w1 * 0.5)), ryf = d.pool ? Math.max(3, Math.round(d.pool[1] * 0.3)) : 5;
    // (with no floor under it, no heap of foam: the water goes on into its mist)
    if (!d.fade) for (let y = Math.floor(fy - ryf * halo - 1); y <= Math.ceil(fy + ryf * halo + 1); y++) for (let x = Math.floor(d.fx - rxf * halo - 1); x <= Math.ceil(d.fx + rxf * halo + 1); x++) {
      const qx = (x + 0.5 - d.fx) / rxf, qy = (y + 0.5 - fy) / ryf;
      const q = Math.hypot(qx, qy) + 0.25 * (h2(x, y, s + 70) - 0.5);
      if (q > halo) continue;
      if (q > 1) { if (h2(x, y, s + 71) < 0.55 * (halo - q) / 0.7) fp.spray(x, y, t(3)); continue; }
      fp.foam(x, y, qy < -0.1 && h2(x, y, s + 72) < 0.55 ? t(4) : t(3), st.material);
    }
    if (mist <= 0) continue;
    // (over a basin it stays over the landing; with no basin under it, it spreads down and out: the water dissolves in spray;
    // with no floor at all, a column of mist that goes on down with the threads, not a cloud that sits on the foot)
    const mrx = d.w1 + d.face * (d.pool ? 0.6 : d.fade ? 0.35 : 0.8), up = 16 + d.w1, down = d.pool ? 3 : d.fade ? d.fade * 0.6 : 6 + d.w1 * 0.5;
    for (let y = Math.floor(fy - up); y <= Math.ceil(fy + down); y++) for (let x = Math.floor(d.fx - mrx); x <= Math.ceil(d.fx + mrx); x++) {
      const qy = (y + 0.5 - fy) / (y < fy ? up : down), q = Math.hypot((x + 0.5 - d.fx) / mrx, qy);
      if (q >= 1) continue;
      const p = mist * Math.min(1, d.w1 / 12) * (1 - q) ** 0.8 * 1.5 * (Math.abs(x + 0.5 - d.fx) < d.w1 && y < fy ? 0.35 : 1);   // a thin fall raises less; over the sheet it thins
      if (h2(x, y, s + 75) < p && (p > 0.35 || (x + y) % 2 === 0)) fp.spray(x, y, h2(x, y, s + 76) < 0.35 ? t(4) : t(3));
    }
  }
  fp.flush();
}
