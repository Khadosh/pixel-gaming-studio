// A market stall seen from above in three quarters: a counter of boards along
// its front with goods on it, posts at its corners and an awning of cloth over
// it. The awning stands higher at the back than at the front, so it slopes
// toward whoever looks at it; it sags between the posts, its corners lift, a
// strip of cloth hangs along its front (the valance, in shadow, its foot
// scalloped) and widths of cloth sewn side by side show their seams down the
// slope. Under the hem a band of shade falls on the counter and the goods, and
// the awning throws its shadow on the ground to the south-east.
// The light comes from the north-west, as everywhere: the ridge of the awning
// is lit, its west edge too, its east edge in shade; posts lit on the west.

import { Mask, h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { StallStep } from './buildingschema';

type Goods = NonNullable<StallStep['goods']>[number];

/** Default ramps [dark, body, light] of each kind of goods. */
const GOODS: Record<Goods['kind'], string[][]> = {
  fruit: [['bermellón', 'bermellón claro', 'fuego'], ['bronce', 'oro', 'oro claro'], ['hoja', 'bambú', 'bambú claro']],
  cloth: [['celeste oscuro', 'celeste', 'celeste luz'], ['bermellón', 'bermellón claro', 'fuego'], ['túnica sombra', 'pergamino', 'túnica luz'], ['bronce', 'oro', 'oro claro']],
  pottery: [['tierra sombra', 'madera clara', 'arena'], ['basalto sombra', 'basalto claro', 'basalto luz'], ['tierra sombra', 'tierra', 'arena']],
  herbs: [['hoja sombra', 'hoja', 'hoja clara'], ['prado sombra', 'prado', 'prado claro']],
  baskets: [['madera sombra', 'madera clara', 'arena']],
};

/** A px the stall owns on the ground: its ramp and the tone in it, so a shade is a tone down in its own ramp. */
interface Own { ramp: string[]; i: number; kind: string; up: boolean }

export function runStall(ctx: Ctx, st: StallStep): void {
  const { W, H } = ctx, g = ctx.ground;
  const salt = st.salt ?? 2301;
  const clothLayer = ctx.layer(st.layer ?? 'ground');
  const C = ctx.mat(st.cloth).ramp, Wd = ctx.mat(st.wood).ramp;
  if (C.length < 6) throw new Error(`map: stall${st.id ? ` "${st.id}"` : ''}: the cloth "${st.cloth}" needs a ramp of 6 tones [ink, deep, shadow, body, light, lit]`);
  const ink = C[0];
  const [u, v, w, h] = st.rect;
  const [fx0, fy0] = ctx.P(u, v), [fx1, fy1] = ctx.P(u + w, v + h);
  const x0 = Math.round(fx0), x1 = Math.round(fx1) - 1, yB = Math.round(fy0), yF = Math.round(fy1) - 1;
  const pw = st.post ?? 3;
  const [hf, hb] = st.height ?? [34, 38];
  const eaves = st.eaves ?? 3, over = st.overhang ?? 2, sag = st.sag ?? 3, upturn = st.upturn ?? 4;
  const valance = st.valance ?? 4, panels = st.panels ?? 3, under = st.under ?? 3;

  // ---- what the stall puts on the ground, px by px, before it is laid: a shade is a tone down in each px's ramp
  const own = new Map<number, Own>();
  // what stands at the back (the back posts, the shelf and its goods) goes up with the awning, on its layer: whoever
  // walks behind the stall is behind them too, not over them
  let up = false;
  const put = (x: number, y: number, ramp: string[], i: number, kind = st.wood) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    own.set(y * W + x, { ramp, i: Math.max(0, Math.min(ramp.length - 1, i)), kind, up });
  };
  const INK = [ink];

  // a post: lit on the west, in shade on the east, its foot dark, ink at its sides
  const post = (px: number, foot: number, top: number) => {
    for (let y = top; y <= foot; y++) {
      put(px - 1, y, INK, 0);
      for (let k = 0; k < pw; k++) put(px + k, y, Wd, y >= foot - 1 ? 1 : k === 0 ? 3 : k === pw - 1 ? 1 : 2);
      put(px + pw, y, INK, 0);
    }
  };
  const postsX = [x0, x1 - pw + 1];

  // the cloth, seen from above: its back edge (the ridge) and its hem, column by column
  const cx0 = x0 - eaves, cx1 = x1 + eaves, xm = (cx0 + cx1) / 2, hw = Math.max(1, (cx1 - cx0) / 2);
  const ridge = (x: number) => {
    const s = (x - xm) / hw;
    return Math.round(yB - hb + (sag / 2) * (1 - s * s) - upturn * 0.5 * Math.max(0, (Math.abs(s) - 0.8) / 0.2) ** 2);
  };
  const hem = (x: number) => {
    const s = (x - xm) / hw;
    return Math.round(yF - hf + over + sag * (1 - s * s) - upturn * Math.max(0, (Math.abs(s) - 0.72) / 0.28) ** 2);
  };

  // ---- the back posts (hidden under the awning but where the corners lift)
  up = st.layer !== undefined;
  if ((st.posts ?? 4) === 4) for (const px of postsX) post(px, yB, ridge(px) + 2);
  up = false;

  // ---- the counter: its top of boards seen from above, its face of planks toward the south
  const depth = st.counter?.depth ?? 8, rise = st.counter?.rise ?? 9, inset = st.counter?.inset ?? 1;
  const kx0 = x0 + inset, kx1 = x1 - inset;
  const faceTop = yF - rise + 1, topTop = faceTop - depth;
  const kinds = st.goods ?? [];
  const lay = (from: number, to: number, base: number, salt2: number, gap: number) => {
    let x = from + Math.floor(h2(u * 7, v * 7, salt2) * 2), n = 0;
    while (x <= to - 5) {
      const kind = kinds[n % kinds.length];
      const ramps = kind.colors ?? GOODS[kind.kind];
      const ramp = ramps[Math.floor(h2(n, x, salt2 + 1) * ramps.length) % ramps.length];
      const wdt = drawGoods(kind.kind, x, base, ramp, n, salt2, put, Math.min(10, to - x));
      x += wdt + gap + (h2(x, n, salt2 + 2) < 0.4 ? 1 : 0);
      n++;
    }
  };

  // ---- the shelf at the back, under the awning: a board with more goods on it, in the shade of the cloth
  if ((st.shelf ?? true) && kinds.length) {
    const ys = Math.min(yB - 2, topTop - 4), sx0 = kx0 + pw, sx1 = kx1 - pw;
    const before = new Set(own.keys());
    up = st.layer !== undefined;
    lay(sx0 + 1, sx1, ys - 1, salt + 11, 0);
    for (let x = sx0; x <= sx1; x++) { put(x, ys, Wd, 3); put(x, ys + 1, Wd, 1); put(x, ys + 2, INK, 0); }
    up = false;
    for (const [i, o] of own) if (!before.has(i) && o.ramp !== INK) o.i = Math.max(0, o.i - 1);
  }
  for (let y = topTop - 1; y <= yF; y++) for (let x = kx0 - 1; x <= kx1 + 1; x++) {
    const side = x === kx0 - 1 || x === kx1 + 1;
    if (y === topTop - 1 || side) { put(x, y, INK, 0); continue; }
    if (y >= faceTop) {
      const r = y - faceTop;
      const joint = (x - kx0) % 6 === 5 && h2(x, 3, salt) < 0.8;
      put(x, y, Wd, y === yF ? 0 : r === 0 ? 3 : joint ? 1 : x === kx1 ? 1 : 2);
      continue;
    }
    // the top: boards east-west, the back one lit, a joint every three rows, the front lip lit
    const r = y - topTop;
    const lip = y === faceTop - 1;
    put(x, y, Wd, lip ? 4 : r === 0 ? 4 : r % 3 === 2 ? 2 : x === kx1 ? 2 : 3);
  }

  // ---- the goods on the counter, left to right, standing on the middle of its top
  if (kinds.length) lay(kx0 + 1, kx1, topTop + Math.floor(depth / 2) + 1, salt, 1);

  // ---- the front posts, in front of the counter's ends, up to the hem
  for (const px of postsX) post(px, yF + 1, hem(px) + valance);

  // ---- the band of shade under the hem: a tone down on what the stall put there
  for (let x = cx0; x <= cx1; x++) {
    const y0 = hem(x) + valance + 1;
    for (let y = y0; y < y0 + under; y++) {
      const o = own.get(y * W + x);
      if (o && o.ramp !== INK) o.i = Math.max(0, o.i - (y < y0 + Math.ceil(under / 2) ? 2 : 1));
    }
  }

  // ---- the shadow of the awning on the ground: its footprint (between the posts, the overhang and the eaves) off
  // to the south-east, two tones down inside and one at its frayed edge, never on the stall
  const [sdx, sdy] = st.shadow?.offset ?? [10, 5];
  const on = st.shadow?.on ? new Set(st.shadow.on) : null;
  const gx0 = cx0 + sdx, gx1 = cx1 + sdx, gy0 = yB + sdy, gy1 = yF + Math.round(over / 2) + sdy;
  for (let y = gy0 - 1; y <= gy1 + 1; y++) for (let x = gx0 - 1; x <= gx1 + 1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H || own.has(y * W + x)) continue;
    if (on && !on.has(ctx.kindAt(x, y))) continue;
    const edge = Math.min(x - gx0, gx1 - x, y - gy0, gy1 - y);
    if (edge < 0 && h2(x, y, salt + 9) < 0.6) continue;
    const deep = edge >= 2 ? 2 : 1;
    if (deep === 1 && h2(x, y, salt + 8) < 0.25) continue;
    for (let k = 0; k < deep; k++) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }

  // ---- under the awning, between the hem and the counter: the ground in deep shade
  for (let x = x0; x <= x1; x++) for (let y = hem(x) + valance + 1; y < topTop; y++) {
    if (x < 0 || y < 0 || x >= W || y >= H || own.has(y * W + x)) continue;
    if (on && !on.has(ctx.kindAt(x, y))) continue;
    for (let k = 0; k < 2; k++) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }

  // ---- the foot of the counter: a dark line of contact on the ground, wider to the east
  for (let x = kx0 - 1; x <= kx1 + 3; x++) for (let y = yF + 1; y <= yF + 2; y++) {
    if (x < 0 || y < 0 || x >= W || y >= H || own.has(y * W + x)) continue;
    if (on && !on.has(ctx.kindAt(x, y))) continue;
    const n = y === yF + 1 && x <= kx1 + 1 ? 2 : 1;
    for (let k = 0; k < n; k++) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }

  // ---- lay what the stall owns on the ground
  const ownMask: number[] = [];
  for (const [i, o] of own) {
    const x = i % W, y = (i - x) / W;
    if (o.up) { clothLayer.set(x, y, o.ramp[o.i]); ownMask.push(i); continue; }
    g.set(x, y, o.ramp[o.i]);
    ctx.setKind(x, y, o.kind);
    ownMask.push(i);
  }

  // ---- the awning, on its layer
  const cloth: number[] = [];
  const cset = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    clothLayer.set(x, y, c);
    cloth.push(y * W + x);
  };
  // the cloth, row by row: wider at the hem than at the ridge (`flare`, a cloth seen from above opens toward whoever
  // looks), each px mapped back to its column of the plain cloth (u across, 0 west to 1 east)
  const flare = st.flare ?? 3, peak = st.peak ?? 4;
  const rC = ridge(Math.round(xm)), hC = hem(Math.round(xm)) + valance + 1;
  const inside = new Map<number, string>();
  for (let y = rC - upturn - 2; y <= hC + upturn + 2; y++) {
    const t = Math.max(0, Math.min(1, (y - rC) / Math.max(1, hC - rC)));
    const L = cx0 - flare * t, R = cx1 + flare * t;
    for (let x = Math.floor(L); x <= Math.ceil(R); x++) {
      if (x < L - 0.01 || x > R + 0.01) continue;
      const uu = (x - L) / Math.max(1, R - L), xc = Math.round(cx0 + uu * (cx1 - cx0));
      const t0 = ridge(xc), t1 = hem(xc);
      const scallop = (x - cx0 + 60) % 6 < 3 ? 1 : 0;
      if (y < t0 || y > t1 + valance + scallop) continue;
      const west = x <= Math.ceil(L), east = x >= Math.floor(R);
      const col = (X: number) => Math.floor(Math.max(0, Math.min(0.999999, (X - L) / Math.max(1, R - L))) * panels);
      const seamAt = (X: number) => panels > 1 && X < Math.floor(R) && col(X + 1) !== col(X);
      const seam = seamAt(x), lip = seamAt(x + 1);
      const r = y - t0;
      let i: number;
      if (y > t1) i = y === t1 + 1 ? 3 : west ? 3 : east ? 1 : 2;            // the valance, in shadow
      else if (r === 0) i = 5;                                              // the ridge, lit
      else if (r === 1) i = 4;
      else if (y === t1) i = 4;                                             // the hem rolls over the front bar
      else if (west) i = 4;
      else if (east) i = 2;
      else if (seam) i = 2;
      else if (lip) i = 4;
      else {
        // the light on the upper slope, under the ridge; the body below
        i = r <= 3 ? 4 : 3;
      }
      inside.set(y * W + x, C[i]);
    }
  }
  // the cloth pulled at its front corners sags between them: a crease runs from each front post up toward the
  // middle of the ridge, in shadow, its lip lit on the west
  if (st.folds ?? true) {
    for (const px of postsX) {
      const ax = px + (pw - 1) / 2, ay = hem(px) - 1, bx = xm + (px < xm ? -0.22 : 0.22) * hw, by = ridge(Math.round(bx)) + 3;
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
      for (let k = Math.round(n * 0.18); k <= Math.round(n * 0.8); k++) {
        const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n), i = y * W + x;
        if (!inside.has(i) || inside.get(i) === C[5]) continue;
        inside.set(i, C[2]);
        if (inside.has(i - 1) && inside.get(i - 1) !== C[2]) inside.set(i - 1, C[4]);
      }
    }
  }
  for (const [i, c] of inside) cset(i % W, Math.floor(i / W), c);
  // the ink around it, where it stands against what is behind
  for (const i of inside.keys()) {
    const x = i % W, y = Math.floor(i / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const j = (y + dy) * W + x + dx;
      if (!inside.has(j)) cset(x + dx, y + dy, ink);
    }
  }
  // the posts stand out of the cloth: the back ones over the ridge, the front ones over the corners of the hem, a
  // knob of ink on top
  const tip = (px: number, top: number, bottom: number) => {
    cset(px, top - 1, ink); cset(px + pw - 1, top - 1, ink);
    for (let y = top; y <= bottom; y++) {
      cset(px - 1, y, ink);
      for (let k = 0; k < pw; k++) cset(px + k, y, Wd[y === top ? 4 : k === 0 ? 3 : k === pw - 1 ? 1 : 2]);
      cset(px + pw, y, ink);
    }
  };
  if ((st.posts ?? 4) === 4) for (const px of postsX) tip(px, ridge(px) - peak, ridge(px) + 1);
  for (const px of postsX) {
    tip(px, hem(px) - peak + 2, hem(px) + valance + 1);
  }

  if (st.id) {
    ctx.masks.set(st.id, maskOf(ctx, ownMask));
    ctx.masks.set(`${st.id} awning`, maskOf(ctx, cloth));
  }
}

function maskOf(ctx: Ctx, idx: number[]): Mask {
  const m = new Mask(ctx.W, ctx.H);
  for (const i of idx) m.set(i % ctx.W, Math.floor(i / ctx.W));
  return m;
}

/**
 * One item of goods standing at (x, base) (its foot), at most `room` px wide; returns its width. Its ramp is
 * [dark, body, light]; the light comes from the north-west.
 */
function drawGoods(kind: Goods['kind'], x: number, base: number, ramp: string[], n: number, salt: number,
  put: (x: number, y: number, ramp: string[], i: number, kind?: string) => void, room: number): number {
  const R = ramp;
  const INK = ['túnica noche'];
  const draw = (rows: string[]) => {
    const hgt = rows.length;
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      const y = base - hgt + 1 + j, X = x + i;
      if (ch === 'o') put(X, y, INK, 0);
      else if (ch === 'd') put(X, y, R, 0);
      else if (ch === 'b') put(X, y, R, 1);
      else if (ch === 'l') put(X, y, R, 2);
    }));
    return Math.max(...rows.map(r => r.length));
  };
  const hs = h2(x, n, salt + 7);
  switch (kind) {
    case 'fruit': {
      // a basket heaped with round fruit: the fruit in its ramp, the basket in wood
      const W5 = ['madera sombra', 'madera', 'madera clara'];
      const rows = hs < 0.5
        ? ['..lbl.l..', '.lbdlblb.', 'lbdlbdlbd', 'bdbdbdbdb', 'oWwWwWwWo', 'oWwWwWwWo', '.oWwWwWo.']
        : ['..l.lb.', '.lblbdl', 'lbdbdlb', 'bdbdbdb', 'oWwWwWo', '.oWwWo.'];
      const w = Math.min(room, rows[0].length);
      rows.forEach((row, j) => [...row].slice(0, w).forEach((ch, i) => {
        const y = base - rows.length + 1 + j, X = x + i;
        if (ch === 'W') put(X, y, W5, 2); else if (ch === 'w') put(X, y, W5, 1);
        else if (ch === 'o') put(X, y, INK, 0);
        else if (ch === 'd') put(X, y, R, 0); else if (ch === 'b') put(X, y, R, 1); else if (ch === 'l') put(X, y, R, 2);
      }));
      return w;
    }
    case 'cloth':
      // folded bolts, two or three high, each a lit top, a body and a dark fold
      return draw(['lllllbd', 'bbbbbbd', 'dddddoo', '.llllbd', '.bbbbbd', '.ddddoo', 'lllllbd', 'bbbbbbd', 'dddddoo'].slice(hs < 0.5 ? 3 : 0));
    case 'pottery':
      // a jar (a rim, a neck, a round body lit on its shoulder) or a low bowl
      return draw(hs < 0.6 ? ['..lbd..', '..obo..', '.lbbbd.', 'lbbbbdd', 'lbbbbdd', 'lbbbddd', '.bbddd.', '..ddd..'] : ['lllllbd', 'lbbbbdd', '.bbbdd.', '..ddd..']);
    case 'herbs':
      return draw(hs < 0.5 ? ['.l..l..', 'lbl.bl.', 'bblbbld', '.bbdbd.', '..bdd..'] : ['l..l...', 'bl.bl.l', 'bdlbdlb', '.bbdbd.', '..ddd..']);
    case 'baskets':
      return draw(hs < 0.5 ? ['lllllld', 'dbbbbbd', 'bdbdbdb', 'dbdbdbd', '.ddddd.'] : ['llllld', 'dbbbbd', 'bdbdbd', '.dddd.']);
  }
}
