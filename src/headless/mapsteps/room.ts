// A room seen from above: straight walls, what stands on the floor and the sun
// that comes in through the windows. Port of The Unwritten Dao's tea house
// script (scripts/suelo_casa_te.py), generalized:
// - wall: a straight wall in a rect of px. Seen face on (the back wall) its
//   profile is bands from the top (beam, plaster lit and in shade, rail,
//   wainscot of boards), with lattice windows and lacquered columns; seen from
//   above (the side and front walls) its profile is the beam across. Doors cut
//   it and get a stone sill; it casts a shadow on the floor along it.
//   With `layer` it goes on that layer (a beam or a lintel over people) and the
//   floor under it keeps its own kind.
// - furnish: reed mats under the tables, short shadows at the foot of things
//   (under a sun or a lamp, thrown by it like every other shadow).
// - glow: a pool of light on the floor around a lamp, full in its core and
//   fading out in bitten rings; on a layer of its own for a light the game
//   switches on and off.
// - sun: the light of the windows of a wall, sheared onto the floor with the
//   shadow of the lattice, on a layer of its own.

import { fbm, type Pt } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { FurnishStep, GlowStep, SunStep, WallStep } from './schema';
import { castLow, decorFoot, sunOn } from './sun';
import { stampedAt } from './settle';

interface Windows { rects: [number, number, number, number][]; bottom: number; every: number }
const WINDOWS = new WeakMap<Ctx, Map<string, Windows>>();

type Band = { c: string; split?: [number, string]; boards?: [number, string, string] };

function bands(profile: WallStep['profile']): Band[] {
  const out: Band[] = [];
  for (const e of profile) {
    if (typeof e === 'string') out.push({ c: e });
    else for (let i = 0; i < (e.h ?? 1); i++) out.push({ c: e.c, split: e.split, boards: e.boards });
  }
  return out;
}

export function runWall(ctx: Ctx, st: WallStep, idx: number): void {
  // with `layer` the wall goes over people (a beam, a lintel seen from above) and the floor keeps its kind
  const g = st.layer ? ctx.layer(st.layer) : ctx.ground, floor = ctx.ground, kind = st.material ?? 'wall';
  const setKind = (x: number, y: number, k: string) => { if (!st.layer) ctx.setKind(x, y, k); };
  const [rx, ry, rw, rh] = st.rect;
  const x0 = ctx.ox + rx, y0 = ctx.oy + ry, x1 = x0 + rw, y1 = y0 + rh;
  const from = st.from ?? 't', prof = bands(st.profile);
  const across = from === 't' || from === 'b';
  const gaps = (st.doors ?? []).map(u => [ctx.ox + u * ctx.cell, ctx.ox + (u + 1) * ctx.cell] as Pt);
  const inDoor = (x: number) => gaps.some(([a, b]) => x >= a && x < b);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (across && inDoor(x)) continue;
    const t = from === 't' ? y - y0 : from === 'b' ? y1 - 1 - y : from === 'l' ? x - x0 : x1 - 1 - x;
    const band = prof[Math.min(t, prof.length - 1)];
    const along = across ? x - x0 : y - y0, length = across ? rw : rh;
    let c = band.c;
    if (band.split && along >= length * band.split[0]) c = band.split[1];
    if (band.boards) {
      const p = along % band.boards[0];
      if (p === 0) c = band.boards[1];
      else if (p === 1) c = band.boards[2];
    }
    g.set(x, y, c);
    setKind(x, y, kind);
  }
  // lattice windows: frame, inner frame lit up-left, bars, paper lit from behind, the sill
  const lt = st.lattice ?? {};
  const every = lt.every ?? 4;
  const rects: Windows['rects'] = [];
  for (const [wx0, wy0, ww, wh] of st.windows ?? []) {
    const wx = ctx.ox + wx0, wy = ctx.oy + wy0;
    rects.push([wx, wy, ww, wh]);
    const [innerLit, inner] = lt.inner ?? ['madera clara', 'madera'];
    const [paper, fleck] = lt.paper ?? ['túnica luz', 'pergamino'];
    for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) {
      const edge = x === wx || x === wx + ww - 1 || y === wy || y === wy + wh - 1;
      const inn = x === wx + 1 || x === wx + ww - 2 || y === wy + 1 || y === wy + wh - 2;
      let c: string;
      if (edge) c = lt.frame ?? 'madera sombra';
      else if (inn) c = x === wx + 1 || y === wy + 1 ? innerLit : inner;
      else if ((x - wx) % every === 1 || (y - wy) % every === 1) c = lt.bars ?? 'madera sombra';
      else c = (x + y) % 7 ? paper : fleck;
      g.set(x, y, c);
    }
    const [sillLit, sill] = lt.sill ?? ['madera clara', 'madera sombra'];
    for (let x = wx - 1; x < wx + ww + 1; x++) { g.set(x, wy + wh, sillLit); g.set(x, wy + wh + 1, sill); }
  }
  let reg = WINDOWS.get(ctx);
  if (!reg) WINDOWS.set(ctx, (reg = new Map()));
  reg.set(st.id ?? `wall${idx}`, { rects, bottom: y1, every });
  // columns standing in front of the wall, from `top` to its foot
  if (st.columns) {
    const cl = st.columns, top = y0 + (cl.top ?? 2);
    for (const cx of cl.x) {
      const px = x0 + cx;
      for (let y = top; y < y1 - 1; y++) cl.colors.forEach((c, k) => g.set(px + k, y, c));
      cl.colors.forEach((_, k) => { g.set(px + k, y1 - 1, cl.foot ?? 'túnica noche'); g.set(px + k, top, cl.cap ?? 'oro'); });
    }
  }
  // a stone sill in each door, the day outside on a layer
  if (st.threshold && across) {
    const th = st.threshold, jr = th.jamb_rows ?? 9, light = th.light ? ctx.layer(th.light) : null;
    for (const [a, b] of gaps) {
      th.rows.forEach((rc, t) => {
        const y = y0 + t;
        for (let x = a; x < b; x++) {
          const jamb = (x === a || x === b - 1) && t < jr;
          const c = jamb ? th.jamb ?? 'túnica noche' : rc;
          g.set(x, y, c);
          setKind(x, y, kind);
          if (light && t < jr && !jamb) light.set(x, y, ctx.lighten(c));
        }
      });
    }
  }
  // its shadow on the floor along it
  if (st.shadow) {
    const sh = st.shadow, on = new Set(sh.on), [base, noise] = sh.depth;
    const scale = sh.scale ?? 7, salt = sh.salt ?? 715;
    const horiz = sh.toward === 't' || sh.toward === 'b';
    const [a, b] = horiz ? [x0, x1] : [y0, y1];
    for (let p = a; p < b; p++) {
      const depth = base + (noise ? Math.trunc(noise * fbm(p / scale, 1.0, salt, 2)) : 0);
      for (let k = 1; k <= depth; k++) {
        const [x, y] = sh.toward === 't' ? [p, y0 - k] : sh.toward === 'b' ? [p, y1 - 1 + k] : sh.toward === 'l' ? [x0 - k, p] : [x1 - 1 + k, p];
        if (on.has(ctx.kindAt(x, y))) floor.set(x, y, ctx.shade(floor.get(x, y), ctx.kindAt(x, y)));
      }
    }
  }
}

export function runFurnish(ctx: Ctx, st: FurnishStep): void {
  const g = ctx.ground, on = new Set(st.on);
  const inside = (x: number, y: number) => on.has(ctx.kindAt(x, y));
  const decor = ctx.game.decor ?? [];
  if (st.what === 'rug') {
    const under = st.under ?? ['mesa'], [ou, ov] = st.offset ?? [1.0, 0.55], [rx, ry] = st.size ?? [27, 13];
    const r = st.corner ?? 4;
    const [[inLit, inShade], [outLit, outShade]] = st.border ?? [['piel', 'piel sombra'], ['bermellón', 'madera sombra']];
    const weave = st.weave ?? [['arena', 'oro claro'], ['oro', 'arena']];
    const [dot, dotEvery] = st.dot ?? ['oro', 6];
    for (const piece of decor) {
      if (!under.some(p => piece.sprite.startsWith(p))) continue;
      const [cx, cy] = ctx.P(piece.at[0] + ou, piece.at[1] + ov);
      for (let y = Math.trunc(cy - ry); y < Math.trunc(cy + ry) + 1; y++) {
        for (let x = Math.trunc(cx - rx); x < Math.trunc(cx + rx) + 1; x++) {
          const dx = Math.abs(x + 0.5 - cx) - (rx - r), dy = Math.abs(y + 0.5 - cy) - (ry - r);
          if (dx > 0 && dy > 0 && dx * dx + dy * dy > r * r) continue;
          // (a stamp laid before it on the floor stays on top: the rug goes under it)
          if (!inside(x, y) || (x >= 0 && y >= 0 && x < ctx.W && y < ctx.H && stampedAt(ctx, 'ground', y * ctx.W + x))) continue;
          const edge = Math.abs(x + 0.5 - cx) > rx - 2.5 || Math.abs(y + 0.5 - cy) > ry - 2.5;
          let c: string;
          if (edge) {
            const lit = x < cx && y < cy;
            c = lit ? inLit : inShade;
            if (Math.abs(y + 0.5 - cy) > ry - 1 || Math.abs(x + 0.5 - cx) > rx - 1) c = lit ? outLit : outShade;
          } else {
            const k = (Math.floor(x / 2) + Math.floor(y / 3)) % 2;
            c = weave[Math.floor(y / 3) % 2 === 0 ? 0 : 1][k];
            if ((x + y) % dotEvery === 0) c = dot;
          }
          g.set(x, y, c);
        }
      }
    }
    return;
  }
  const skip = st.skip ?? [];
  if (ctx.sun) {
    // the sun (or the lamp): a pool at the foot of each piece thrown from its height, into the one mask
    sunOn(ctx, st.on);
    for (const piece of decor) {
      if (piece.when || skip.some(p => piece.sprite.startsWith(p))) continue;
      const [w, h] = piece.size ?? [1, 1], [px, py, salt] = decorFoot(ctx, piece);
      castLow(ctx, px, py, w, h, salt);
    }
    return;
  }
  // short shadows at the foot of things, down-right, stacking
  const [rows, inL, pastR, lean] = st.shape ?? [4, 3, 2, 1.2];
  for (const piece of decor) {
    if (piece.when || skip.some(p => piece.sprite.startsWith(p))) continue;
    const w = (piece.size ?? [1, 1])[0];
    const cx = ctx.P(piece.at[0] + 0.5 + (w % 2 === 0 ? 0.5 : 0), 0)[0], foot = ctx.P(0, piece.at[1] + 1)[1];
    const half = (w * ctx.cell) / 2.0;
    for (let k = 0; k < rows; k++) {
      const yy = Math.trunc(foot + k - 1);
      for (let x = Math.trunc(cx - half + inL + k); x < Math.trunc(cx + half + pastR + k * lean); x++) {
        if (inside(x, yy)) g.set(x, yy, ctx.shade(g.get(x, yy), ctx.kindAt(x, yy)));
      }
    }
  }
}

export function runSun(ctx: Ctx, st: SunStep): void {
  const win = WINDOWS.get(ctx)?.get(st.wall);
  if (!win) throw new Error(`map: sun: no wall "${st.wall}" before it`);
  const g = ctx.ground, layer = ctx.layer(st.layer ?? 'sun'), on = new Set(st.on);
  const shift = st.shift ?? 14, stretch = st.stretch ?? 1.8, lean = st.lean ?? 0.9, steps = st.steps ?? 2;
  const top = win.bottom + (st.drop ?? 3), every = win.every;
  for (const [wx, , ww, wh] of win.rects) {
    for (let y = top; y < top + Math.trunc(wh * stretch); y++) {
      const k = (y - top) / stretch;
      for (let x = wx; x < wx + ww; x++) {
        const X = Math.trunc(x + shift + k * lean);
        const gy = Math.trunc(k), gx = x - wx;
        if (gx === 0 || gx === ww - 1 || gx % every === 1 || (gy % every === 1 && gy > 0)) continue;
        if (!on.has(ctx.kindAt(X, y))) continue;
        let c = g.get(X, y);
        for (let i = 0; i < steps && c !== null; i++) c = ctx.lighten(c);
        layer.set(X, y, c);
      }
    }
  }
}

const LATER = new WeakMap<Ctx, (() => void)[]>();

/** What a step left for when the ground is done (a glow on a layer copies the ground with every shadow laid). */
export function finishRoom(ctx: Ctx): void {
  for (const f of LATER.get(ctx) ?? []) f();
  LATER.delete(ctx);
}

/**
 * A pool of light around (at) on the floor: `tones` steps of the recipe's lighten inside the core, one fewer for each
 * ring out to the edge; each ring's border bitten inward by smooth noise (never a ruled circle, never a px past the
 * edge). On `layer`, the lit colors go there and the ground stays as it was: the layer is painted when the ground is
 * done (every shadow laid), so what it shows is the floor the game shows under it, lit.
 */
export function runGlow(ctx: Ctx, st: GlowStep): void {
  if (st.layer) {
    ctx.layer(st.layer);   // made now: the layers stack in the order the steps name them
    let later = LATER.get(ctx);
    if (!later) LATER.set(ctx, (later = []));
    later.push(() => paintGlow(ctx, st));
    return;
  }
  paintGlow(ctx, st);
}

function paintGlow(ctx: Ctx, st: GlowStep): void {
  const g = ctx.ground, out = st.layer ? ctx.layer(st.layer) : g;
  const [cx, cy] = ctx.P(st.at[0] + 0.5, st.at[1] + 0.5);
  const [r0, r1] = st.r, tones = st.tones ?? 2, fray = st.fray ?? 0.5, salt = st.salt ?? 911;
  const on = st.on ? new Set(st.on) : null;
  const span = Math.max(1e-6, r1 - r0), bite = Math.min(6, Math.max(1.5, span / tones));
  for (let y = Math.floor(cy - r1) - 1; y <= Math.ceil(cy + r1) + 1; y++) for (let x = Math.floor(cx - r1) - 1; x <= Math.ceil(cx + r1) + 1; x++) {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) continue;
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r1) continue;
    const k = ctx.kindAt(x, y);
    if (on && !on.has(k)) continue;
    // bitten inward only: the noise can push a px out of its ring, never past the edge
    const dd = d + fray * bite * 2 * fbm(x / 4, y / 4, salt, 2);
    const n = dd <= r0 ? tones : Math.ceil(tones * (r1 - dd) / span);
    if (n <= 0) continue;
    let c = g.get(x, y);
    if (c === null) continue;
    for (let i = 0; i < n; i++) c = ctx.lighten(c);
    out.set(x, y, c);
  }
}
