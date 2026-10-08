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

/** A tree as planted: the foot of its trunk (px), its height and crown width (px). */
export interface Planted { x: number; y: number; h: number; w: number; kind: TreeKind; salt: number; spill?: boolean }

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
  return Math.round((h - Math.round(h * 0.3) + 2) * (0.88 + 0.14 * v));
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
function lumps(s: Scratch, list: [number, number, number][], ink: Ink, salt: number): void {
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
        } else if (l > -0.12) {
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

function roundCrown(t: Planted, ink: Ink): Scratch {
  const s = new Scratch(), { x: fx, y: fy, h, w, salt } = t;
  const belly = fy - Math.round(h * 0.3), top = fy - h + 1;
  const R = w / 4.6, j = (i: number) => (h2(salt, i, 2333) - 0.5) * 0.5 * R;
  const ch = belly - top, gap = (ch - 2 * R) / 2;
  const rows = [top + 0.95 * R, top + R + gap, belly - 1.0 * R];
  // the top puff, two beside it, three in front at the belly: narrow above, widest low
  lumps(s, [
    [fx + j(1), rows[0], 0.95 * R],
    [fx - 1.0 * R + j(2), rows[1] + j(3) * 0.3, 1.0 * R],
    [fx + 1.05 * R + j(4), rows[1] + j(5) * 0.3, 1.0 * R],
    [fx - 1.45 * R + j(6) * 0.5, rows[2], 0.95 * R],
    [fx + 1.45 * R + j(7) * 0.5, rows[2] - 0.15 * R, 0.95 * R],
    [fx + j(8) * 0.4, rows[2] + 0.05 * R, 1.1 * R],
  ], ink, salt);
  finish(s, ink, false);
  return s;
}

/** A bush: no trunk, two lumps behind and one or two in front, sitting on the ground at its foot. */
function bushCrown(t: Planted, ink: Ink): Scratch {
  const s = new Scratch(), { x: fx, y: fy, h, w, salt } = t;
  const R = w / 3.3, j = (i: number) => (h2(salt, i, 2371) - 0.5) * 0.6 * R;
  const back = fy - h + R, front = fy - R + 0.5;
  const list: [number, number, number][] = [
    [fx - 0.55 * R + j(1), back + Math.abs(j(2)) * 0.4, 0.9 * R],
    [fx + 0.6 * R + j(3), back + 0.2 * R + Math.abs(j(4)) * 0.4, 0.85 * R],
  ];
  if (h2(salt, 5, 2372) < 0.5) list.push([fx - 0.9 * R + j(6) * 0.5, front, 0.8 * R], [fx + 0.7 * R + j(7) * 0.5, front + 0.1 * R, 0.85 * R]);
  else list.push([fx + j(8) * 0.5, front, 1.0 * R]);
  lumps(s, list, ink, salt);
  finish(s, ink, false);
  return s;
}

function pineCrown(t: Planted, ink: Ink): Scratch {
  const s = new Scratch(), { x: fx, y: fy, h, w, salt } = t;
  const [, shadow, mid, light, glint] = ink;
  const belly = fy - Math.round(h * 0.16), top = fy - h + 1, ch = belly - top;
  const n = h >= 44 ? 4 : 3, cx = fx + (h2(salt, 1, 2341) - 0.5);
  // the bottom tier first: each tier above hangs its tips over the one below
  for (let i = n - 1; i >= 0; i--) {
    const yb = top + ch * (i + 1) / n, ya = i === 0 ? top : top + ch * (i - 0.6) / n;
    const hw = (w / 2) * (0.42 + 0.58 * (i + 1) / n), ph = h2(salt, 20 + i, 2342) * 6.28;
    for (let y = Math.floor(ya); y <= Math.ceil(yb) + 2; y++) {
      const tt = Math.max(0, Math.min(1, (y + 0.5 - ya) / (yb - ya)));
      const half = hw * (0.12 + 0.88 * tt) * (1 + 0.08 * n1(y * 0.9, salt + i));
      for (let x = Math.floor(cx - hw) - 1; x <= Math.ceil(cx + hw) + 1; x++) {
        const dx = x + 0.5 - cx, ax = Math.abs(dx) / hw;
        if (Math.abs(dx) > half) continue;
        const tip = 1.2 * Math.abs(Math.sin(dx * 0.62 + ph));                       // jagged tips
        if (y + 0.5 > yb + 2.6 * ax * ax + tip) continue;                            // that droop out to the sides
        const nx = dx / Math.max(half, 1), dab = h2(Math.floor(x / 2) + i * 5, y, salt + 7);
        let c: string;
        if (nx < -0.45) c = nx < -0.72 && dab < 0.35 ? glint : dab > 0.85 ? mid : light;
        else if (nx < 0.05) c = dab < 0.12 ? light : dab > 0.7 ? shadow : mid;
        else c = dab < 0.12 ? mid : shadow;
        s.set(x, y, c, n - 1 - i);
      }
    }
  }
  finish(s, ink, true);
  return s;
}

function trunk(g: Layer, t: Planted, bark: [string, string, string, string]): [number, number][] {
  const [bl, bm, bd, line] = bark, { x: fx, y: fy, h, kind } = t;
  const belly = fy - Math.round(h * (kind === 'pine' ? 0.16 : 0.3));
  const tw = h >= 46 ? 4 : 3, x0 = Math.round(fx - tw / 2), px: [number, number][] = [];
  for (let y = belly - 3; y <= fy; y++) {
    const flare = y >= fy - 1 ? 1 : 0, a = x0 - flare, b = x0 + tw - 1 + flare;
    for (let x = a; x <= b; x++) {
      let c = x === a ? bl : x === b ? bd : bm;
      if (y <= belly + 1) c = bd;                                       // under the crown
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
  const ink: Ink = ['a', 'b', 'c', 'd', 'e'];
  const s = t.kind === 'pine' ? pineCrown(t, ink) : roundCrown(t, ink);
  const out: [number, number][] = [];
  for (const [x, y] of s.each()) out.push([x, y]);
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
  const hides = (t: Planted): boolean => {
    if (!kept.length || t.kind === 'bush') return false;
    const reach = t.h + t.w;
    const near = kept.filter(([x0, y0, x1, y1]) => x1 > t.x - reach && x0 < t.x + reach && y1 > t.y - reach && y0 < t.y + reach);
    if (!near.length) return false;
    return crownCover(t).some(([x, y]) => near.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1));
  };
  const [s0, s1] = st.size ?? [2, 4];
  const out: Planted[] = [];
  const make = (x: number, y: number, kind: TreeKind, hc: number, k: number): Planted => {
    const h = kind === 'bush' ? Math.max(6, Math.round(hc * cell)) : Math.max(20, Math.round(hc * cell)), ts = salt + k * 13;
    return { x, y, h, w: crownWidth(kind, h, ts), kind, salt: ts };
  };
  (st.trees ?? []).forEach((tr, i) => {
    const [u, v] = tr, [x, y] = ctx.P(u, v);
    const kind = tr[2] ?? pickKind(st.kinds, h2(i, 4, salt));
    const hc = tr[3] ?? s0 + (s1 - s0) * h2(i, 3, salt);
    const t = make(Math.round(x), Math.round(y), kind, hc, i);
    if (hides(t)) throw new Error(`map: grove: the crown of tree ${i} [${tr.join(', ')}] (or its shadow) covers an occupied or kept cell`);
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
    for (let k = 0; k < z.count * 60 && placed < z.count; k++) {
      const x = Math.trunc(h2(k, 1, zs) * W), y = Math.trunc(h2(k, 2, zs) * H);
      const d = dist[y * W + x];
      if (d < b0 || d > b1) continue;
      const u = Math.floor((x - ctx.ox) / cell), v = Math.floor((y - ctx.oy) / cell);
      if (z.box && (u < z.box[0] || v < z.box[1] || u >= z.box[2] || v >= z.box[3])) continue;
      let bad = false;
      for (let dy = -6; dy <= 0 && !bad; dy += 2) for (let dx = -3; dx <= 3; dx += 3) {
        const kd = ctx.kindAt(x + dx, y + dy);
        if (!kd || (on && !on.has(kd))) { bad = true; break; }
      }
      if (bad) continue;
      const inGrid = u >= 0 && v >= 0 && u < ctx.game.width && v < ctx.game.height;
      if (inGrid && !z.walkable && ctx.walk[v * ctx.game.width + u] === 1) continue;
      if (occupied.has(`${u},${v}`)) continue;
      const cu = (x - ctx.ox) / cell, cv = (y - ctx.oy) / cell;
      if (clear.some(c => Math.hypot(cu - (c[0] + 0.5), cv - (c[1] + 0.5)) < (c[2] ?? 1.5))) continue;
      let near = false;
      for (const am of avoid) for (let dy = -6; dy <= 6 && !near; dy += 2) for (let dx = -6; dx <= 6; dx += 2) if (am.has(x + dx, y + dy)) { near = true; break; }
      const kind = pickKind(z.kinds ?? st.kinds, h2(k, 4, zs));
      // a tree does not make room for the bushes (adding bushes never moves a tree); a bush keeps off everything
      if (near || out.some(p => (kind === 'bush' || p.kind !== 'bush') && Math.hypot(p.x - x, p.y - y) < sp)) continue;
      // out: the foot moves this far out of the mask (down its distance), a bush spilling over the lip; never over a north lip
      let fx = x, fy = y;
      if (z.out) {
        const gx = dist[y * W + Math.min(W - 1, x + 2)] - dist[y * W + Math.max(0, x - 2)];
        const gy = dist[Math.min(H - 1, y + 2) * W + x] - dist[Math.max(0, y - 2) * W + x];
        const gl = Math.hypot(gx, gy);
        if (gl > 0 && -gy / gl > -0.35) { fx = Math.round(x - (gx / gl) * z.out); fy = Math.round(y - (gy / gl) * z.out); }
      }
      const t = make(fx, fy, kind, z0 + (z1 - z0) * h2(k, 3, zs), 1000 + zi * 500 + placed);
      if (hides(t)) continue;
      if (fx !== x || fy !== y) t.spill = true;
      out.push(t);
      placed++;
    }
  });
  return out;
}

export function runGrove(ctx: Ctx, st: GroveStep): Planted[] {
  const crown = ctx.layer(st.layer ?? 'copas'), g = ctx.ground;
  const leaves: Ink = st.leaves ?? ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'bambú claro'];
  const needles: Ink = st.needles ?? ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'bambú claro'];
  const blossom: Ink = st.blossom ?? ['túnica noche', 'flor sombra', 'flor', 'flor clara', 'túnica luz'];
  const bark = st.bark ?? ['madera clara', 'madera', 'madera sombra', 'túnica noche'];
  const bush: Ink = st.bush ?? leaves;
  const trees = plant(ctx, st).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const t of trees) {
    if (t.kind === 'bush') {
      // low: on the ground, behind people; nothing scattered later lands on it
      for (const [x, y, c] of bushCrown(t, bush).each()) { g.set(x, y, c); ctx.setKind(x, y, ''); }
      continue;
    }
    for (const [x, y] of trunk(g, t, bark)) ctx.setKind(x, y, '');   // nothing scattered later lands on the bark
    const s = t.kind === 'pine' ? pineCrown(t, needles) : roundCrown(t, t.kind === 'plum' ? blossom : leaves);
    for (const [x, y, c] of s.each()) crown.set(x, y, c);
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
  if (st.shadows !== false) for (const t of trees) ctx.trees.push({ x: t.x, y: t.y, w: t.w, low: t.kind === 'bush' });
  return trees;
}
