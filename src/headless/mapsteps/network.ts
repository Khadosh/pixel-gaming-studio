// A net of trodden earth: the roads of a village and the squares between its
// houses, painted as one piece. The roads (Catmull-Rom ribbons whose half width
// breathes), organic blobs added and blobs cut out (islands of grass people walk
// around) go into one mask in order, cleaned once; courts that will be paved
// later count as earth too. Near the center line of a road the earth is trodden
// (darker, with broken ruts and dark grains); away from them it is dry dust. The
// bank shadow lies on the side of the light, the grass across gets a lit lip and
// tufts creep in from the border. Port of the village script of The Unwritten
// Dao (scripts/suelo_aldea.py).

import { Mask, catmull, clean, distanceIn, fbm, h2, n1, organic, ribbon, type Pt } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { NetworkStep } from './schema';

type Blob = number[];

function blobInto(ctx: Ctx, mask: Mask, b: Blob, value: boolean): void {
  const [u, v, rx, ry] = b;
  const [cx, cy] = ctx.P(u, v);
  for (const [x, y] of organic(ctx.W, ctx.H, cx, cy, rx * ctx.cell, ry * ctx.cell, b[5] ?? Math.trunc(u * 10 + v), b[4] ?? 0.14, b[6] ?? 0.05)) {
    mask.set(x, y, value);
  }
}

/** An oval whose radius breathes with the angle (a trodden clearing). */
function ovalInto(ctx: Ctx, mask: Mask, o: number[]): void {
  const [u, v, rx, ry, wob, salt] = o, lobes = o[6] ?? 1.7;
  const [cx, cy] = ctx.P(u, v);
  for (let y = 0; y < ctx.H; y++) for (let x = 0; x < ctx.W; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
    if (dx * dx + dy * dy < (1 + wob * n1(a * lobes, salt)) ** 2) mask.set(x, y);
  }
}

/** Two continuous ruts along each trodden road, one each side of its center line. */
function wheelRuts(ctx: Ctx, o: NonNullable<NetworkStep['wheel_ruts']>, centers: Pt[][], mask: Mask, dist: Int32Array, tone: (i: number) => string): void {
  const { W } = ctx, g = ctx.ground;
  const [off0, wob, per, salt] = o.offset, [gap, gSalt, gOdds] = o.gaps ?? [14, 887, 0.9], min = o.min ?? 3;
  const [tRut, tBelow, tAbove] = o.tones ?? [-1, 0, 1];
  // key → side, in the order the ruts were first laid (a later sample of the same px keeps its place)
  const ruts = new Map<string, number>();
  for (const curve of centers) {
    for (let i = 2; i < curve.length - 2; i++) {
      const [x0, y0] = curve[i - 2], [x1, y1] = curve[i + 2];
      const dx = x1 - x0, dy = y1 - y0, ln = Math.hypot(dx, dy) || 1.0;
      const nx = -dy / ln, ny = dx / ln, [cx, cy] = curve[i];
      for (const side of [-1, 1]) {
        const off = side * (off0 + wob * n1(i / per, salt + side));
        const X = Math.trunc(cx + nx * off), Y = Math.trunc(cy + ny * off);
        if (h2(Math.floor(i / gap), side, gSalt) < gOdds) ruts.set(`${X},${Y}`, side);
      }
    }
  }
  const deep = (x: number, y: number) => mask.has(x, y) && dist[y * W + x] >= min;
  for (const key of ruts.keys()) {
    const [x, y] = key.split(',').map(Number);
    if (!deep(x, y)) continue;
    g.set(x, y, tone(tRut));
    if (deep(x, y + 1) && !ruts.has(`${x},${y + 1}`)) g.set(x, y + 1, tone(tBelow));
    if (deep(x, y - 1) && !ruts.has(`${x},${y - 1}`)) g.set(x, y - 1, tone(tAbove));
  }
}

export function runNetwork(ctx: Ctx, st: NetworkStep, _seed: number, idx: number): void {
  const { W, H } = ctx, g = ctx.ground;
  const id = st.id ?? `network${idx}`;
  const mask = new Mask(W, H);
  const centers: Pt[][] = [];
  const [b0, b1, b2] = st.breath ?? [30, 9, 0.6];
  const min = st.min ?? 4.2;
  for (const part of st.parts) {
    if ('road' in part) {
      const curve = catmull(part.road.map(([u, v]) => ctx.P(u, v)));
      const [w0, w1] = part.width, salt = part.salt;
      ribbon(mask, curve, (i) => Math.max(min, w0 + w1 * n1(i / b0, salt) + b2 * n1(i / b1, salt + 1)));
      if (part.ruts !== false) centers.push(curve);
    } else if ('blob' in part) blobInto(ctx, mask, part.blob, true);
    else if ('oval' in part) ovalInto(ctx, mask, part.oval);
    else blobInto(ctx, mask, part.cut, false);
  }
  if (st.inside) {
    const [inId, px] = st.inside, inMask = ctx.masks.get(inId), inDist = ctx.dists.get(inId);
    if (!inMask || !inDist) throw new Error(`map: network: no mask with a distance "${inId}" before it`);
    for (let i = 0; i < W * H; i++) if (mask.data[i] && (!inMask.data[i] || inDist[i] < px)) mask.data[i] = 0;
  }
  clean(mask);
  // courts: each cleaned on its own, then counted as earth
  const court = new Mask(W, H);
  for (const b of st.also ?? []) {
    const m = new Mask(W, H);
    blobInto(ctx, m, b, true);
    clean(m);
    for (let i = 0; i < W * H; i++) if (m.data[i]) { court.data[i] = 1; mask.data[i] = 1; }
  }
  const dist = distanceIn(mask);
  // distance to the center line of the trodden roads
  const span = st.span ?? 9;
  const dcen = new Float64Array(W * H).fill(99);
  for (const curve of centers) {
    for (let i = 0; i < curve.length; i += 2) {
      const [cx, cy] = curve[i];
      for (let y = Math.trunc(cy - span); y < Math.trunc(cy + (span + 1)); y++) for (let x = Math.trunc(cx - span); x < Math.trunc(cx + (span + 1)); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d < dcen[y * W + x]) dcen[y * W + x] = d;
      }
    }
  }
  ctx.masks.set(id, mask);
  ctx.dists.set(id, dist);
  ctx.centers.set(id, centers.flat());
  ctx.pathMaterial.set(id, st.material);
  const name = st.material, b = ctx.base(name), t = (i: number) => ctx.tone(name, i);
  const [sx, sy] = ctx.dir;
  const [reach, wob, tScale, tSalt] = st.trod ?? [5.8, 2.2, 7, 226];
  const [mSalt, mX, mY] = st.mottle ?? [221, 5.5, 4.5];
  const [tLo, tHi] = st.trod_levels ?? [0.42, 0.70];
  const [lLo, lHi] = st.loose_levels ?? [0.30, 0.46];
  const [r0, r1, rSalt, rX, rY, rAbove] = st.ruts ?? [3.0, 4.2, 225, 6, 2, 0.42];
  const [gSalt, gTrod, gLoose, gLight = gTrod] = st.grains ?? [223, 0.035, 0.016];
  const [gtTrod, gtLoose, gtLight] = st.grain_tones ?? [-1, 0, 2];
  const [bank1, bank2] = st.bank ?? [-1, -1];
  const [lt0, lt1] = st.loose_tones ?? [2, 1];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    ctx.setKind(x, y, name);
    const d = dist[y * W + x];
    let kOut: number | null = null;
    for (let k = 1; k < 4; k++) if (!mask.has(x - k * sx, y - k * sy)) { kOut = k; break; }
    let ti: number;
    if (d === 1 || (kOut !== null && kOut <= 2)) {
      if (d === 1) ti = kOut === 1 ? b - 2 : b;
      else ti = b + (kOut === 1 ? bank1 : bank2);
      if (st.grains_all) {
        if (h2(x, y, gSalt) < gLoose) ti = b + gtLoose;
        else if (h2(x + 1, y + 1, gSalt) < gLight && ti !== b) ti = b + gtLight;
      }
    } else {
      const r = dcen[y * W + x];
      const v = fbm(x / mX, y / mY, mSalt, 3);
      const trod = r + wob * (fbm(x / tScale, y / tScale, tSalt, 2) - 0.5) < reach;
      if (trod) {
        ti = v < tLo ? b : v > tHi ? b + 2 : b + 1;
        if (r0 <= r && r < r1 && fbm(x / rX, y / rY, rSalt, 2) > rAbove) {
          if (st.ruts_on === 'light') { if (ti === b + 2) ti = b + 1; } else if (ti !== b + 2) ti = ti === b ? b - 1 : b;
        }
      } else ti = v > lHi ? b + lt0 : v > lLo ? b + lt1 : b;
      if (h2(x, y, gSalt) < (trod ? gTrod : gLoose)) ti = b + (trod ? gtTrod : gtLoose);
      else if (h2(x + 1, y + 1, gSalt) < gLight && ti !== b) ti = b + gtLight;
    }
    g.set(x, y, t(ti));
  }
  if (st.wheel_ruts) wheelRuts(ctx, st.wheel_ruts, centers, mask, dist, (i) => t(b + i));
  if (st.lip !== false) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = ctx.kindAt(x, y);
      if (!k || mask.has(x, y) || ctx.mat(k).texture !== 'patches') continue;
      if ((y > 0 && mask.has(x, y - sy)) || (x > 0 && mask.has(x - sx, y))) g.set(x, y, typeof st.lip === 'string' ? st.lip : ctx.tone(k, ctx.mat(k).ramp.length - 2));
    }
  }
  if (st.tufts) {
    const { count, salt } = st.tufts;
    const grass = ctx.byTexture('patches');
    const [tip, stem] = st.tufts.colors ?? (grass ? [ctx.tone(grass, ctx.base(grass)), ctx.tone(grass, ctx.base(grass) - 1)] : [t(b - 1), t(b - 2)]);
    const ok = (x: number, y: number) => mask.has(x, y) && dist[y * W + x] >= 2 && !court.has(x, y);
    for (let k = 0; k < count; k++) {
      const x = Math.trunc(h2(k, 1, salt) * W), y = Math.trunc(h2(k, 2, salt) * H);
      if (!mask.has(x, y) || court.has(x, y)) continue;
      const d = dist[y * W + x];
      if (d < 2 || d > 3) continue;
      const shape = h2(k, 4, salt) < 0.5 ? ['h.h', '.l.'] : ['h..', 'lh.', '.l.'];
      let fits = true;
      for (let j = 0; j < shape.length && fits; j++) for (let i = 0; i < 3; i++) if (!ok(x + i, y + j)) { fits = false; break; }
      if (!fits) continue;
      shape.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.set(x + i, y + j, ch === 'h' ? tip : stem); }));
    }
  }
}
