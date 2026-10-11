// A grove: a walkable floor carved out of a thicket by the game grid, and what
// goes with it.
// - thicket: the wall cells of the game (and the margin) are thicket; where the
//   floor ends is the smoothed grid plus noise, so the border is a curve, not
//   the grid; round clearings can be added. The floor is painted with its
//   material (moss and leaf litter), darker where it touches the thicket.
// - outcrop: a rock mass leaning on the thicket, with a south face, streaks
//   and moss on its top, and big stones with moss piled on it.
// - undergrowth: inside the thicket, leaves by the border, dark depths and
//   fallen leaves.
// - canes: bamboo canes drawn one by one (three px wide in front, two behind,
//   one deep; nodes and joints; leaves like spears in two layers that sway out
//   of step), on a layer in front of people. A cane is born in a wall cell and
//   rises: it only covers cells behind its foot, so the order with the player is
//   always right; it never covers a cell where someone stands.
// - shade: the shadows the thicket (and a rock) cast down-light on the floor,
//   deeper at the foot, and soft ovals under the landmarks.
// - beams: light falling between the canes on a layer of its own (a patch the
//   game shows by day), cut in spots by the leaves above, with motes of dust.
// - feature ring / frost / ash and scatter dashes (the dry leaves of bamboo).
// Port of the bamboo forest script of The Unwritten Dao (scripts/suelo_bosque.py).

import { Mask, clean, distanceIn, fbm, h2, n1, pyRound } from '../mapnoise';
import { stone, stoneRoles, texturePatches, type Ctx, type Layer } from '../mappaint';
import type { MapStep } from '../maprecipe';
import type { BeamsStep, CanesStep, OutcropStep, ShadeStep, ThicketStep, UndergrowthStep } from './groveschema';
import type { FeatureStep } from './schema';
import { castMass, flushSun, shade as sunShade, sunOn } from './sun';

interface Thicket {
  /** Wall cell (thicket) of the map, margin included; cells in map coordinates. */
  isWall: (u: number, v: number) => boolean;
  floor: Mask;
  dfloor: Int32Array;
  dthick: Int32Array;
  dark: string;
}

const THICKETS = new WeakMap<Ctx, Map<string, Thicket>>();

function thicketOf(ctx: Ctx, id: string): Thicket {
  const t = THICKETS.get(ctx)?.get(id);
  if (!t) throw new Error(`map: no thicket "${id}" before this step`);
  return t;
}

const pymod = (a: number, b: number) => ((a % b) + b) % b;

// ------------------------------------------------------------------ thicket

export function runThicket(ctx: Ctx, st: ThicketStep, seed: number, idx: number): void {
  const { W, H, cell } = ctx, g = ctx.ground;
  const id = st.id ?? `thicket${idx}`;
  const [mx, my] = ctx.recipe.margin ?? [0, 0];
  const gw = ctx.game.width, gh = ctx.game.height;
  const open = st.open ?? [];
  const isWall = (u: number, v: number): boolean => {
    if (open.some(([ou, ov, w, h]) => u >= ou && u < ou + w && v >= ov && v < ov + h)) return false;
    if (u < 0 || v < 0 || u >= gw || v >= gh) return true;
    return ctx.game.grid[v][u] === '#';
  };
  const WC = Math.floor(W / cell), HC = Math.floor(H / cell);
  const openC = new Float64Array(WC * HC);
  for (let cy = 0; cy < HC; cy++) for (let cx = 0; cx < WC; cx++) openC[cy * WC + cx] = isWall(cx - mx, cy - my) ? 0 : 1;
  const gc = (a: number, b: number) => openC[Math.min(Math.max(b, 0), HC - 1) * WC + Math.min(Math.max(a, 0), WC - 1)];
  const field = (x: number, y: number) => {
    const u = (x + 0.5) / cell - 0.5, v = (y + 0.5) / cell - 0.5;
    const i = Math.floor(u), j = Math.floor(v);
    let fu = u - i, fv = v - j;
    fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv);
    return gc(i, j) * (1 - fu) * (1 - fv) + gc(i + 1, j) * fu * (1 - fv) + gc(i, j + 1) * (1 - fu) * fv + gc(i + 1, j + 1) * fu * fv;
  };
  const edge = st.edge ?? [[0.30, 11, 201, 3], [0.12, 4, 202, 2]];
  const floor = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = field(x, y);
    for (const [amt, px, salt, oct] of edge) v += amt * (fbm(x / px, y / px, salt, oct) - 0.5);
    if (v > 0.5) floor.set(x, y);
  }
  clean(floor, st.smooth ?? 3);
  for (const c of st.clearings ?? []) {
    const [u, v, r, squash, wob, salt] = c, lobes = c[6] ?? 2;
    const [fcx, fcy] = ctx.P(u, v);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot((x + 0.5 - fcx) / squash, y + 0.5 - fcy) < r + wob * n1(Math.atan2(y - fcy, x - fcx) * lobes, salt)) floor.set(x, y);
    }
  }
  const dfloor = distanceIn(floor);
  const thick = new Mask(W, H);
  for (let i = 0; i < W * H; i++) thick.data[i] = floor.data[i] ? 0 : 1;
  const dthick = distanceIn(thick);
  texturePatches(ctx, floor, st.material, seed);
  const ramp = ctx.mat(st.material).ramp, dark = ctx.tone(st.dark, 0);
  const damp = st.damp === undefined ? [3, 2] : st.damp;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (floor.data[i]) {
      if (damp && dfloor[i] <= damp[0] && ramp.indexOf(g.get(x, y) ?? '') > damp[1]) g.set(x, y, ramp[damp[1]]);
    } else {
      g.set(x, y, dark);
      ctx.setKind(x, y, st.dark);
    }
  }
  ctx.masks.set(id, floor);
  ctx.dists.set(id, dfloor);
  if (!THICKETS.has(ctx)) THICKETS.set(ctx, new Map());
  THICKETS.get(ctx)!.set(id, { isWall, floor, dfloor, dthick, dark: st.dark });
}

// ------------------------------------------------------------------ outcrop

export function runOutcrop(ctx: Ctx, st: OutcropStep, idx: number): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, s = stoneRoles(ctx, name);
  const rock = new Mask(W, H);
  const [wa, wl, wp, fa, fl, fs] = st.wobble ?? [0.1, 1.6, 3, 0.05, 7, 5];
  for (const m of st.masses) {
    const [u, v, rx, ry] = m, salt = m[4] ?? Math.trunc(u * 10);
    const [cx, cy] = ctx.P(u, v);
    for (let y = Math.trunc(cy - ry * 1.4); y < Math.trunc(cy + ry * 1.4); y++) for (let x = Math.trunc(cx - rx * 1.4); x < Math.trunc(cx + rx * 1.4); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
      if (dx * dx + dy * dy <= (1 + wa * n1(a * wl + wp, salt) + fa * n1(a * fl, fs)) ** 2) rock.set(x, y);
    }
  }
  if (st.floor) {
    const fl2 = thicketOf(ctx, st.floor[0]).floor, below = ctx.P(0, st.floor[1])[1];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rock.has(x, y) && fl2.has(x, y) && y > below) rock.set(x, y, false);
  }
  clean(rock);
  ctx.masks.set(st.id ?? `outcrop${idx}`, rock);
  const FACE = st.face ?? 9;
  const [vSalt, vOdds] = st.vein ?? [241, 0.18];
  const [tSalt, tAlong, tAcross, tHi, tLo] = st.top ?? [242, 9, 3, 0.6, 0.32];
  const [rSalt, rPx, rAbove] = st.rim ?? [243, 4, 0.42];
  const [rimLit, rimIn] = st.rim_colors ?? [s.moss[1], s.moss[0]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!rock.has(x, y)) continue;
    let below = 0;
    while (below < FACE && rock.has(x, y + below + 1)) below++;
    const out = !(rock.has(x - 1, y) && rock.has(x + 1, y) && rock.has(x, y - 1) && rock.has(x, y + 1));
    let c: string;
    ctx.setKind(x, y, name);
    if (below < FACE) {
      ctx.face[y * W + x] = 1;
      if (out || below === 0) c = s.line;
      else if (below <= 2) c = below === 1 ? s.line : s.dark;
      else if (below === FACE - 1) c = s.mid;
      else c = h2(x, 0, vSalt) < vOdds ? s.dark : s.shadow;
    } else {
      ctx.face[y * W + x] = 0;
      const litEdge = !rock.has(x - 1, y) || !rock.has(x, y - 1);
      if (out) c = litEdge ? s.dark : s.line;
      else {
        const v = fbm((x + y) * 0.7071 / tAlong, (y - x) * 0.7071 / tAcross, tSalt, 3);
        c = v > tHi ? s.mid : v > tLo ? s.shadow : s.dark;
        const rim = !rock.has(x - 3, y - 2) || !rock.has(x - 1, y - 4);
        if (rim && fbm(x / rPx, y / rPx, rSalt, 2) > rAbove) c = litEdge ? rimLit : rimIn;
      }
    }
    g.set(x, y, c);
  }
  // big stones piled on top, back to front, each on a dark seat
  const list = [...(st.boulders ?? [])].sort((p, q) => p[1] - q[1]);
  list.forEach(([u, v, rx, ry], k) => {
    const [cx, cy] = ctx.P(u, v);
    for (let y = Math.trunc(cy); y < Math.trunc(cy + ry * 1.2); y++) for (let x = Math.trunc(cx - rx * 0.6); x < Math.trunc(cx + rx * 1.3); x++) {
      if (x >= 0 && x < W && y >= 0 && y < H && ctx.kindAt(x, y) === name && !ctx.face[y * W + x] && Math.hypot((x - cx - rx * 0.3) / rx, (y - cy - ry * 0.6) / ry) < 0.9) g.set(x, y, s.dark);
    }
    for (const key of stone(ctx, name, cx, cy, rx, ry, (st.salt ?? 960) + k, true).keys()) ctx.face[key] = 0;
  });
}

// ------------------------------------------------------------------ undergrowth

export function runUndergrowth(ctx: Ctx, st: UndergrowthStep): void {
  const { W, H } = ctx, g = ctx.ground, t = thicketOf(ctx, st.thicket);
  const inside = (x: number, y: number) => ctx.kindAt(x, y) === t.dark;
  const [px, salt, near, above, above2] = st.mottle ?? [6, 281, 2, 0.5, 0.72];
  const [cNear, cDeep] = st.colors ?? ['hoja sombra', 'pelo oscuro'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const d = t.dthick[y * W + x], v = fbm(x / px, y / px, salt, 2);
    if (d <= near && v > above) g.set(x, y, cNear);
    else if (v > above2) g.set(x, y, cDeep);
  }
  const [tries, dSalt, odds] = st.dashes ?? [1600, 282, 0.6];
  const [d0, d1] = st.dash_colors ?? ['bronce', 'pelo oscuro'];
  for (let k = 0; k < tries; k++) {
    const x = Math.trunc(h2(k, 1, dSalt) * W), y = Math.trunc(h2(k, 2, dSalt) * H);
    if (!(x > 0 && x < W - 3 && y > 0 && y < H - 1) || !inside(x, y)) continue;
    const c = h2(k, 3, dSalt) < odds ? d0 : d1;
    g.set(x, y, c);
    g.set(x + 1, y, c);
    if (h2(k, 4, dSalt) < 0.5) g.set(x + 2, y + 1, c);
  }
}

// ------------------------------------------------------------------ canes

const CANES = [
  ['bambú claro', 'bambú', 'hoja', 'hoja clara', 'hoja sombra'],
  ['bambú', 'hoja', 'hoja sombra', 'bambú', 'vida sombra'],
  ['hoja', 'hoja sombra', 'vida sombra', 'hoja', 'túnica noche'],
  ['hoja sombra', 'vida sombra', 'túnica noche', 'hoja sombra', 'túnica noche'],
];
const LEAVES = [
  ['bambú claro', 'hoja clara', 'hoja'],
  ['hoja clara', 'bambú', 'hoja sombra'],
  ['bambú', 'hoja', 'vida sombra'],
  ['hoja', 'hoja sombra', 'túnica noche'],
];

export function runCanes(ctx: Ctx, st: CanesStep): void {
  const { W, H, cell, ox, oy } = ctx, g = ctx.ground, t = thicketOf(ctx, st.thicket);
  const [mx, my] = ctx.recipe.margin ?? [0, 0];
  const gw = ctx.game.width, gh = ctx.game.height;
  const canes = ctx.layer(st.layer ?? 'canes');
  const [la, lb] = st.leaves ?? ['leaves', 'leaves_b'];
  const leaves: Layer[] = [ctx.layer(la), ctx.layer(lb)];
  const ramps = st.ramps ?? CANES, leafRamps = st.leaf_ramps ?? LEAVES;
  const avoid = new Set(st.avoid ?? []);
  const pathMat = st.path === undefined ? null : ctx.pathMaterial.get(st.path);
  if (st.path !== undefined && !pathMat) throw new Error(`map: canes: no path "${st.path}" before it`);
  const [tallOdds, tallPx, tallSalt] = st.tall ?? [0.45, 9, 291];
  const [h0, h1, hDeep] = st.height ?? [30, 22, 10];
  const salts = { root: 301, row: 302, thin: 363, cane: 311, leaf: 321, wiggle: 292, ...st.salts };
  const [inMap, inMargin] = st.per_cell ?? [3, 2];
  const [footL, footR] = st.foot ?? ['túnica noche', 'tinta'];
  // the cells where someone stands
  const keep = new Set<string>();
  for (const [u, v] of st.clear ?? []) keep.add(`${u},${v}`);
  const skip = st.skip ?? [];
  for (const piece of ctx.game.decor ?? []) {
    if (skip.some(p => piece.sprite.startsWith(p))) continue;
    const [w, h] = piece.size ?? [1, 1];
    const x0 = piece.at[0] - Math.floor((w - 1) / 2);
    for (let i = 0; i < w + (w % 2 === 0 ? 1 : 0); i++) for (let j = 0; j < h; j++) keep.add(`${x0 + i},${piece.at[1] - h + 1 + j}`);
  }
  const floor = t.floor, isWall = t.isWall;
  const cellOf = (x: number, y: number): [number, number] => [Math.floor((x - ox) / cell), Math.floor((y - oy) / cell)];
  const cache = new Map<string, number>();
  const allowed = (x: number, y: number, rootRow: number): boolean => {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return false;
    const [cx, cy] = cellOf(x, y);
    if (cy >= rootRow && !isWall(cx, cy)) return false;   // in front of the foot: it would cover wrongly
    if (keep.has(`${cx},${cy}`)) return false;
    if (avoid.has(ctx.kindAt(x, y)) && cy < rootRow) return false;
    if (isWall(cx, cy)) return true;
    // a walkable cell behind the cane: only a little, but in some places the tall bamboo passes in front
    const key = `${cx},${cy},${Math.floor(x / 3)}`;
    if (!cache.has(key)) {
      const px = ox + cx * cell + 8, py = oy + cy * cell + 8;
      let onPath = false;
      if (pathMat) for (const i of [-5, 0, 5]) for (const j of [-4, 0, 4]) if (ctx.kindAt(px + i, py + j) === pathMat) onPath = true;
      const tall = h2(cx, cy, tallSalt) < tallOdds && !onPath;
      cache.set(key, (tall ? tallPx : 0) + Math.trunc(2 * fbm(x / 5.0, cy, salts.wiggle, 1)));
    }
    return y >= oy + (cy + 1) * cell - cache.get(key)!;
  };
  const roots: [number, number, number, number][] = [];
  for (let cy = -my; cy < gh + my; cy++) for (let cx = -mx; cx < gw + mx; cx++) {
    if (!isWall(cx, cy)) continue;
    const n = cx >= 0 && cx < gw ? inMap : inMargin;
    for (let k = 0; k < n; k++) {
      const rx = ox + cx * cell + Math.trunc((k + 0.15 + 0.7 * h2(cx * 3 + k, cy, salts.root)) * cell / n);
      const ry = oy + cy * cell + 5 + Math.trunc(10 * h2(cx, cy * 5 + k, salts.row));
      if (!(rx >= 0 && rx < W && ry >= 0 && ry < H) || avoid.has(ctx.kindAt(rx, ry))) continue;
      if (floor.has(rx, ry) && t.dfloor[ry * W + rx] > 2) continue;
      roots.push([ry, rx, cy, k]);
    }
  }
  roots.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  roots.forEach(([ry, rx, cy], idx) => {
    const d = floor.has(rx, ry) ? 0 : t.dthick[ry * W + rx];
    if (d > 14 && h2(rx, ry, salts.thin) < (d < 26 ? 0.35 : 0.55)) return;
    const inside = cellOf(rx, ry)[0] >= 0 && cellOf(rx, ry)[0] < gw && cy >= 0 && cy < gh;
    let depth = d <= 5 ? 0 : d <= 11 ? 1 : d <= 20 ? 2 : 3;
    if (!inside) depth = Math.max(depth, d < 18 ? 2 : 3);
    const ramp = ramps[depth];
    const width = depth === 0 ? 3 : depth === 1 ? 2 : 1;
    const lean = (h2(idx, 1, salts.cane) - 0.5) * 0.14;
    const height = Math.trunc(h0 + h1 * h2(idx, 2, salts.cane) + (depth >= 1 ? hDeep : 0));
    const node0 = Math.trunc(h2(idx, 3, salts.cane) * 6);
    const gap = 8 + Math.trunc(h2(idx, 4, salts.cane) * 4);
    let top = 0;
    let cols: [number, number][] = [];
    for (let i = 0; i < height; i++) {
      const y = ry - i, x = rx + Math.trunc(pyRound(lean * i));
      let ok = true;
      for (let j = 0; j < width; j++) if (!allowed(x + j, y, cy)) { ok = false; break; }
      if (!ok) break;
      top = i;
      cols.push([x, y]);
    }
    if (top < 4) return;
    if (top < height - 1) {
      // cut by what is behind it: it ends lower and out of step (else the tips make a line)
      const cut = Math.trunc(h2(idx, 5, salts.cane) * 10);
      cols = cols.slice(0, Math.max(4, cols.length - cut));
    }
    for (let j = -1; j < width + 2; j++) {
      if (rx + j >= 0 && rx + j < W && ry + 1 >= 0 && ry + 1 < H && !floor.has(rx + j, ry + 1)) g.set(rx + j, ry + 1, j >= 1 ? footR : footL);
    }
    cols.forEach(([x, y], i) => {
      const node = i > 2 && pymod(i - node0, gap) === 0;
      for (let j = 0; j < width; j++) {
        let c: string;
        if (width === 3) c = ramp[j];
        else if (width === 1) { canes.set(x + j, y, ramp[1]); continue; }
        else c = depth > 0 ? ramp[1 + j] : ramp[j];
        if (node) c = j < width - 1 ? ramp[3] : ramp[1];
        else if (i > 2 && pymod(i - node0, gap) === 1) c = ramp[4];
        canes.set(x + j, y, c);
      }
    });
    // the tip thins
    const [tx, ty] = cols[cols.length - 1];
    canes.set(tx + width - 1, ty, null);
    // the leaves: sprigs at the high nodes and a tuft at the tip
    const lramp = leafRamps[Math.min(depth, 3)];
    const layer = leaves[pymod(idx * 7 + cy, 2)];
    const sprays: [number, number][] = [];
    for (let i = 0; i < cols.length; i++) if (i > cols.length * 0.45 && pymod(i - node0, gap) === 0) sprays.push(cols[i]);
    sprays.push(cols[cols.length - 1]);
    sprays.forEach(([sx, sy], si) => {
      const last = si === sprays.length - 1;
      const nleaves = last ? 3 : 2;
      for (let li = 0; li < nleaves; li++) {
        const side = (li + si + idx) % 2 === 0 ? -1 : 1;
        const ln = 4 + Math.trunc(h2(idx * 13 + si, li, salts.leaf) * 4);
        const lift = li === 0 && last ? -1 : 0;
        const x0 = sx + (side > 0 ? width : -1);
        for (let kk = 0; kk < ln; kk++) {
          const X = x0 + side * kk;
          const Y = sy + lift * (2 - Math.floor(kk / 2)) + Math.trunc(kk * kk * 0.07 + kk * 0.3) + li;
          if (!allowed(X, Y, cy)) break;
          layer.set(X, Y, kk < Math.floor(ln / 2) ? lramp[0] : lramp[1]);
          if (kk > 0 && kk < ln - 1 && allowed(X, Y + 1, cy) && layer.get(X, Y + 1) === null) layer.set(X, Y + 1, lramp[2]);
        }
      }
    });
  });
}

// ------------------------------------------------------------------ shade

export function runShade(ctx: Ctx, st: ShadeStep): void {
  const { W, H } = ctx, g = ctx.ground, t = thicketOf(ctx, st.thicket);
  const [sx, sy] = ctx.dir;
  const casters = new Set(st.casters ?? []), on = new Set(st.on);
  const casts = (x: number, y: number) => !t.floor.has(x, y) || casters.has(ctx.kindAt(x, y));
  if (ctx.sun) {
    // the sun: the thicket (and what casts with it) is a mass `height` px high, its shadow slid along the sun; the
    // ovals of the landmarks are laid as they are drawn, with every other shadow (reach, slope and deep are the old light)
    sunOn(ctx, on);
    castMass(ctx, casts, st.height ?? 32, () => true);
    for (const [u, v, rx, ry, salt] of st.casts ?? []) {
      const [cx, cy] = ctx.P(u, v);
      for (let y = Math.trunc(cy - ry * 1.3) - 1; y < Math.trunc(cy + ry * 1.3) + 2; y++) for (let x = Math.trunc(cx - rx * 1.3) - 1; x < Math.trunc(cx + rx * 1.3) + 2; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
        if (dx * dx + dy * dy <= (1 + 0.08 * Math.sin(a * 6 + salt)) ** 2) sunShade(ctx, x, y);
      }
    }
    flushSun(ctx);
    return;
  }
  const [r0, r1, rPx, rSalt] = st.reach ?? [4, 5, 7, 331];
  const slope = st.slope ?? 0.8, deepK = st.deep ?? 2;
  const shadow = new Mask(W, H), deep = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (casts(x, y)) continue;
    const reach = r0 + Math.trunc(r1 * fbm(x / rPx, y / rPx, rSalt, 2));
    for (let k = 1; k <= reach; k++) {
      const X = x - k * sx, Y = y - Math.trunc(pyRound(k * slope)) * sy;
      if (X >= 0 && X < W && Y >= 0 && Y < H && casts(X, Y)) {
        shadow.set(x, y);
        if (k <= deepK) deep.set(x, y);
        break;
      }
    }
  }
  clean(shadow, 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!shadow.has(x, y) || !on.has(ctx.kindAt(x, y))) continue;
    let c = ctx.shade(g.get(x, y), ctx.kindAt(x, y));
    if (deep.has(x, y)) c = ctx.shade(c, ctx.kindAt(x, y));
    g.set(x, y, c);
  }
  for (const [u, v, rx, ry, salt] of st.casts ?? []) {
    const [cx, cy] = ctx.P(u, v);
    for (let y = Math.trunc(cy - ry * 1.3) - 1; y < Math.trunc(cy + ry * 1.3) + 2; y++) for (let x = Math.trunc(cx - rx * 1.3) - 1; x < Math.trunc(cx + rx * 1.3) + 2; x++) {
      if (!(x >= 0 && x < W && y >= 0 && y < H) || !on.has(ctx.kindAt(x, y))) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
      if (dx * dx + dy * dy <= (1 + 0.08 * Math.sin(a * 6 + salt)) ** 2) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
    }
  }
}

// ------------------------------------------------------------------ beams

export function runBeams(ctx: Ctx, st: BeamsStep): void {
  const { W, H } = ctx, g = ctx.ground, t = thicketOf(ctx, st.thicket);
  const sun = ctx.layer(st.layer ?? 'beams'), dust = ctx.layer(st.dust ?? 'dust');
  const [lx, ly] = st.dir ?? [0.78, 0.62];
  const [len, taper] = st.length ?? [34, 36];
  const [wPx, wAlong, wSalt] = st.wobble ?? [1.4, 6, 351];
  const [mX, mY, mSalt, mBelow] = st.mottle ?? [5, 4, 352, 0.36];
  const [coreW, coreL] = st.core ?? [0.45, 22];
  const [mOdds, mSaltD, mUp] = st.motes ?? [0.006, 353, 3];
  const [mc0, mc1] = st.mote_colors ?? ['oro claro', 'túnica luz'];
  const dustOn = st.dust_on ? new Set(st.dust_on) : null;
  st.beams.forEach(([u, v, wdt], si) => {
    const [cx, cy] = ctx.P(u, v);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const along = dx * lx + dy * ly, across = -dx * ly + dy * lx;
      if (Math.abs(along) > len) continue;
      const half = wdt / 2.0 * (1 - (along / taper) ** 2) + wPx * n1(along / wAlong, wSalt + si);
      if (Math.abs(across) > half) continue;
      if (!t.floor.has(x, y) || ctx.face[y * W + x]) continue;
      if (fbm(x / mX, y / mY, mSalt + si, 2) < mBelow) continue;
      const c = g.get(x, y) ?? '';
      const core = Math.abs(across) < half * coreW && Math.abs(along) < coreL;
      let c2 = ctx.lighten(c);
      if (core) c2 = ctx.lighten(c2);
      sun.set(x, y, c2);
      if (core && h2(x, y, mSaltD) < mOdds && (!dustOn || dustOn.has(ctx.kindAt(x, y)))) dust.set(x, y - mUp, h2(x, y, mSaltD + 1) < 0.6 ? mc0 : mc1);
    }
  });
  // no loose pixels in a patch: a lone point goes
  for (let y = 1; y < sun.h - 1; y++) for (let x = 1; x < sun.w - 1; x++) {
    if (sun.get(x, y) === null) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([i, j]) => sun.get(x + i, y + j) === null)) sun.set(x, y, null);
  }
}

// ------------------------------------------------------------------ features and dashes

/** A forgotten formation: flat stones in a ring eaten by moss, their small shadows, the groove that joins them. */
export function stoneRing(ctx: Ctx, st: FeatureStep, salt: number): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, s = stoneRoles(ctx, name);
  const [fcx, fcy] = ctx.P(st.at[0], st.at[1]);
  const [ox, oy] = st.offset ?? [0, 1];
  const [R, r] = st.size ?? [17, 11];
  const n = st.count ?? 7, phase = st.phase ?? 0.2;
  const [srx, srv, sry] = st.stone ?? [3.4, 1, 2.4];
  const [bx, by] = st.box ?? [5, 4];
  const on = st.on ?? [];
  const shaded = new Set(on);
  for (let k = 0; k < n; k++) {
    const ang = -Math.PI / 2 + k * 2 * Math.PI / n + phase;
    const sx = fcx + ox + Math.cos(ang) * R, sy = fcy + oy + Math.sin(ang) * r;
    const rx = srx + srv * h2(k, 1, salt), ry = sry;
    for (let y = Math.trunc(sy - by); y < Math.trunc(sy + by + 1); y++) for (let x = Math.trunc(sx - bx); x < Math.trunc(sx + bx + 1); x++) {
      const dx = (x + 0.5 - sx) / rx, dy = (y + 0.5 - sy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const edge = dx * dx + dy * dy > 0.55;
      let c = dy > 0.45 ? s.shadow : edge && dy < -0.2 ? s.light : s.mid;
      if (dy < 0.1 && fbm(x / 2.5, y / 2.5, salt + 1 + k, 2) > 0.62) c = s.moss[1];
      g.set(x, y, c);
      ctx.setKind(x, y, name);
    }
    // its small shadow, down to the right
    const Y = Math.trunc(sy + ry + 0.5);
    for (let x = Math.trunc(sx - 2); x < Math.trunc(sx + 6); x++) if (shaded.has(ctx.kindAt(x, Y))) g.set(x, Y, ctx.shade(g.get(x, Y), ctx.kindAt(x, Y)));
  }
  // the worn groove joining the stones: the ring can be guessed
  const [samples, above, color] = st.groove ?? [260, 0.45, 'hoja sombra'];
  for (let k = 0; k < samples; k++) {
    const ang = k * 2 * Math.PI / samples;
    const x = Math.trunc(fcx + ox + Math.cos(ang) * R), y = Math.trunc(fcy + oy + Math.sin(ang) * r);
    if (on.length && ctx.kindAt(x, y) === on[0] && fbm(ang * 2, 0.5, salt + 2, 2) > above) g.set(x, y, color);
  }
  void W; void H;
}

/** A broken band of frost around something, lighter inside. */
export function frost(ctx: Ctx, st: FeatureStep, salt: number): void {
  const g = ctx.ground, on = new Set(st.on ?? []);
  const [tx, ty] = ctx.P(st.at[0], st.at[1]);
  const [bx, by] = st.box ?? [12, 6];
  const squash = st.squash ?? 1.7, [r0, r1, rw] = st.band ?? [3.5, 6.5, 1.5], split = st.split ?? 5.2;
  const [inner, outer] = st.colors ?? ['niebla', 'niebla sombra'];
  for (let y = Math.trunc(ty - by); y < Math.trunc(ty + by); y++) for (let x = Math.trunc(tx - bx); x < Math.trunc(tx + bx + 1); x++) {
    const r = Math.hypot((x + 0.5 - tx) / squash, y + 0.5 - ty);
    if (r0 < r && r < r1 + rw * n1(Math.atan2(y - ty, x - tx) * 3, salt) && on.has(ctx.kindAt(x, y)) && fbm(x / 3.0, y / 2.0, salt + 1, 2) > 0.45) {
      g.set(x, y, r > split ? outer : inner);
    }
  }
}

/** The ash of a fire: an oval in two tones, only on its materials. */
export function ash(ctx: Ctx, st: FeatureStep, salt: number): void {
  const g = ctx.ground, on = new Set(st.on ?? []);
  const [fx, fy] = ctx.P(st.at[0], st.at[1]);
  const [bx, by] = st.box ?? [7, 4];
  const squash = st.squash ?? 1.8, r = (st.band ?? [0, 3.6, 0])[1];
  const [c0, c1] = st.colors ?? ['piedra sombra', 'túnica oscura'];
  for (let y = Math.trunc(fy - by); y < Math.trunc(fy + by); y++) for (let x = Math.trunc(fx - bx); x < Math.trunc(fx + bx + 1); x++) {
    if (Math.hypot((x + 0.5 - fx) / squash, y + 0.5 - fy) < r && on.has(ctx.kindAt(x, y))) g.set(x, y, h2(x, y, salt) < 0.5 ? c0 : c1);
  }
}

/** Dry leaves of bamboo: dashes of a few px, flat or sloping, more on the first material (a trail). */
export function scatterDashes(ctx: Ctx, st: Extract<MapStep, { step: 'scatter' }>, near: ((x: number, y: number) => boolean) | null): void {
  const { W, H } = ctx, g = ctx.ground;
  const on = st.on ?? [];
  const [oFirst, oFar, oNear] = st.odds ?? [0.55, 0.10, 0.22];
  const [cFirst, cOther] = st.colors ?? [['bronce', 'oro', 'oro claro'], ['bronce', 'oro']];
  const [l0, l1] = st.length ?? [2, 2];
  const avoid = st.avoid === undefined ? null : ctx.layer(st.avoid);
  for (let k = 0; k < (st.count ?? 2600); k++) {
    ctx.trial(k);
    const x = Math.trunc(ctx.rnd() * W), y = Math.trunc(ctx.rnd() * H);
    const kd = x >= 0 && x < W - 3 && y >= 0 && y < H - 1 ? ctx.kindAt(x, y) : '';
    const which = on.indexOf(kd);
    if (which < 0) continue;
    const p = which === 0 ? oFirst : near && near(x, y) ? oNear : oFar;
    if (ctx.rnd() > p) continue;
    const cols = which === 0 ? cFirst : cOther;
    const c = cols[Math.trunc(ctx.rnd() * cols.length)];
    const n = l0 + Math.trunc(ctx.rnd() * l1);
    const slope = ctx.rnd() < 0.5;
    for (let i = 0; i < n; i++) {
      const X = x + i, Y = y + (slope ? Math.floor(i / 2) : 0);
      if (ctx.kindAt(X, Y) === kd && (!avoid || avoid.get(X, Y) === null)) g.set(X, Y, c);
    }
  }
}
