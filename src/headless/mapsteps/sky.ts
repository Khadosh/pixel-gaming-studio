// The sky around an island seen from above, as the reference of the sect of The
// Unwritten Dao paints it (docs/referencia/isla_sin_edificios.webp of the game):
// not rows of one same cloud but masses of cumulus of very different sizes —
// a few big ones, many small — each one lumps on lumps lit from the upper left
// with a cold belly, thin wisps between them, and behind, ranges of peaks that
// grow paler and bluer the farther they are (aerial perspective), their feet
// lost in cloud. The cumulus painter is shared: a brink uses it for the clouds
// that swallow the foot of its face (`billows`).

import { fbm, h2, n1, type Mask } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { CloudscapePlane, CloudscapeStep } from './skyschema';


export type Tones4 = [string, string, string, string];
type Put = (x: number, y: number, c: string) => void;

/** How a mass of cumulus meets the sky (all optional: without them, as it was). */
export interface CumulusSoft {
  /** [near, far]: a band outside the body, its first px of the near tone (a few gaps), the second of the far one in a fine
   *  checker — the edge melts into the sky instead of a scalloped cut-out */
  rim?: [string, string];
  /** where the rim may go: only where the sky shows (never over another cloud or a peak) */
  free?: (x: number, y: number) => boolean;
  /** how many little lumps on the tops, × (1: as before; less: a smoother crest, fewer regular scallops) */
  lumps?: number;
  /** the outline wobbles this much more, slowly (0: as before): no row of equal bumps */
  ragged?: number;
  /** more of the mass in the light (0: as before; 0.2: mostly crest and mid, a thin cold belly) */
  bright?: number;
  /** passes of softening of the domes the light reads (2: as before; more: broad soft shading, no crumpled facets) */
  smooth?: number;
}

/**
 * One mass of cumulus centred at (cx, cy), about r px of radius: a row of big
 * lumps, little lumps on their tops, lumps along the belly; seen as a height
 * field (each lump a dome, the ones lower on the picture nearer), lit from the
 * upper left, darker going down, a crease where a lump sits in front of another.
 * tones: [crest, mid, belly, deep belly]. Returns the pixels it covered.
 */
export function cumulus(W: number, H: number, cx: number, cy: number, r: number, seed: number, tones: Tones4, put: Put, wispOdds = 0, edge: CumulusSoft = {}): number[] {
  const lumpsBy = edge.lumps ?? 1, ragged = edge.ragged ?? 0;
  const puffs: [number, number, number][] = [];
  const wh = r * (0.9 + 0.8 * h2(0, 1, seed));
  const n = 2 + Math.trunc(h2(0, 2, seed) * 3) + Math.trunc(r / 9);
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const bell = Math.sin(Math.PI * (0.12 + 0.76 * f));
    const pr = r * (0.38 + 0.52 * bell * (0.65 + 0.35 * h2(i, 3, seed)));
    puffs.push([cx + (f * 2 - 1) * Math.max(0, wh - pr * 0.55) + (h2(i, 4, seed) - 0.5) * r * 0.3,
      cy - pr * 0.3 + (h2(i, 5, seed) - 0.5) * r * 0.3, pr]);
  }
  // little lumps on the tops of the big ones: the cauliflower
  const big = puffs.length;
  for (let i = 0; i < big; i++) {
    const [px, py, pr] = puffs[i];
    const m = Math.trunc(pr / 3.5 * lumpsBy);
    for (let j = 0; j < m; j++) {
      const a = Math.PI * (1.1 + 0.8 * h2(i * 17 + j, 6, seed)), lr = pr * (0.22 + 0.2 * h2(i * 17 + j, 7, seed));
      puffs.push([px + Math.cos(a) * pr * 0.82, py + Math.sin(a) * pr * 0.82, lr]);
    }
  }
  // lumps along the belly, low and wide
  const nb = 1 + Math.trunc(wh / Math.max(3, r * 0.5));
  for (let i = 0; i <= nb; i++) {
    const f = i / nb, br = r * (0.3 + 0.18 * h2(i, 8, seed));
    puffs.push([cx + (f * 2 - 1) * (wh * 0.95), cy + r * 0.18 + (h2(i, 9, seed) - 0.5) * r * 0.15, br]);
  }
  const x0 = Math.floor(cx - wh - r) - 2, x1 = Math.ceil(cx + wh + r) + 2;
  const y0 = Math.floor(cy - 2 * r) - 2, y1 = Math.ceil(cy + r) + 2;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const hf = new Float32Array(bw * bh).fill(-1e9);
  for (let y = y0; y <= y1; y++) {
    const belly = cy + r * 0.4 + 1.3 * n1(0.5, seed + 7);
    for (let x = x0; x <= x1; x++) {
      if (y > belly + r * 0.3 * Math.abs(n1(x / Math.max(3, r * 0.4), seed + 17)) + 1.2 * n1(x / 3.0, seed + 8)) continue;
      let best = -1e9;
      for (const [px, py, pr] of puffs) {
        const dx = x + 0.5 - px, dy = y + 0.5 - py;
        const a = Math.atan2(dy, dx), rr = pr * (1 + 0.07 * n1(a * 3 + px, seed + 9)) + ragged * r * n1(x / Math.max(4, r * 0.7) + y / Math.max(6, r), seed + 19);
        const d2 = rr * rr - dx * dx - dy * dy;
        if (d2 <= 0) continue;
        const z = (py - cy) * 0.7 + Math.sqrt(d2);
        if (z > best) best = z;
      }
      if (best > -1e9) hf[(y - y0) * bw + (x - x0)] = best;
    }
  }
  const at = (x: number, y: number) => (x < x0 || x > x1 || y < y0 || y > y1) ? -1e9 : hf[(y - y0) * bw + (x - x0)];
  // the light reads the domes softened (two passes of a 3×3 box, the sky around a little below the lowest dome):
  // the big lumps and the belly show, not every crease between two little ones
  let lo = 1e9;
  for (const v of hf) if (v > -1e9 && v < lo) lo = v;
  let sm = Float32Array.from(hf, v => (v > -1e9 ? v : lo - 4));
  for (let pass = 0; pass < (edge.smooth ?? 2); pass++) {
    const nx = new Float32Array(sm.length);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      let tot = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        tot += ii >= 0 && jj >= 0 && ii < bw && jj < bh ? sm[jj * bw + ii] : lo - 4;
        n++;
      }
      nx[j * bw + i] = tot / n;
    }
    sm = nx;
  }
  const soft = (x: number, y: number) => (x < x0 || x > x1 || y < y0 || y > y1) ? lo - 4 : sm[(y - y0) * bw + (x - x0)];
  const L = [-0.5, -0.75, 0.45], ln = Math.hypot(L[0], L[1], L[2]);
  const out: number[] = [], painted: [number, string][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const h = at(x, y);
    if (h <= -1e9 || x < 0 || y < 0 || x >= W || y >= H) continue;
    const gx = (soft(x + 1, y) - soft(x - 1, y)) / 2, gy = (soft(x, y + 1) - soft(x, y - 1)) / 2;
    const nl = Math.hypot(gx, gy, 1);
    let l = (-gx * L[0] - gy * L[1] + L[2]) / (nl * ln);
    l -= Math.max(0, (y - cy) / r) * 0.55 * (1 - (edge.bright ?? 0));
    l += edge.bright ?? 0;
    for (let k = 1; k <= 3; k++) if (at(x, y + k) > h + 2.5 * k) { l -= 0.3; break; }   // the crease under a big lump in front
    const c = l > 0.66 ? tones[0] : l > 0.38 ? tones[1] : l > 0.1 ? tones[2] : tones[3];
    put(x, y, c);
    out.push(y * W + x);
    painted.push([y * W + x, c]);
  }
  // the soft edge, where the cloud is in shade: the belly melts into the sky (a band of the near tone, then a checker
  // of the far one); where it is lit only the checker, and against the crest nothing — a crisp top, a soft belly
  if (edge.rim) {
    const body = new Map(painted), [near, far] = edge.rim, free = edge.free ?? (() => true);
    const shade = (c: string) => (c === tones[2] || c === tones[3] ? 2 : c === tones[1] ? 1 : 0);
    for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || body.has(y * W + x)) continue;
      let d = 3, sh = -1;
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
        const X = x + a, Y = y + b, c = X >= 0 && Y >= 0 && X < W && Y < H ? body.get(Y * W + X) : undefined;
        if (c === undefined) continue;
        const dd = Math.max(Math.abs(a), Math.abs(b));
        if (dd < d) { d = dd; sh = shade(c); } else if (dd === d) sh = Math.max(sh, shade(c));
      }
      if (d > 2 || sh <= 0 || !free(x, y)) continue;
      if (d === 1 && sh === 2) put(x, y, h2(x, y, seed + 21) < 0.18 ? far : near);
      else if ((x + y) % 2 === 0 && h2(x, y, seed + 22) < 0.85) put(x, y, far);
    }
  }
  // thin wisps trailing from a side
  if (wispOdds > 0 && h2(0, 10, seed) < wispOdds) {
    const side = h2(0, 11, seed) < 0.5 ? -1 : 1, strands = 1 + Math.trunc(h2(0, 12, seed) * 2);
    for (let s = 0; s < strands; s++) {
      const yy = Math.trunc(cy + r * (0.05 + 0.3 * h2(s, 13, seed))) + s * 2;
      const len = r * (0.6 + 1.0 * h2(s, 14, seed));
      let x = side < 0 ? cx - wh * 0.8 : cx + wh * 0.8;
      for (let k = 0; k < len; k++, x += side) {
        const X = Math.trunc(x);
        if (at(X, yy) > -1e9 || X < 0 || X >= W || yy < 0 || yy >= H) continue;
        if (h2(X, yy, seed + 15) < 0.14 + 0.5 * (k / len)) continue;
        put(X, yy, k < len * 0.45 ? tones[1] : tones[2]);
        out.push(yy * W + X);
      }
    }
  }
  return out;
}

/** A thin streak of cloud one px tall, broken, fading at both ends. */
function wisp(W: number, H: number, x0: number, y: number, len: number, seed: number, tones: Tones4, put: Put): void {
  for (let k = 0; k < len; k++) {
    const x = Math.trunc(x0 + k), yy = y + (k > len * 0.4 && h2(k, 1, seed) < 0.12 ? 1 : 0);
    if (x < 0 || x >= W || yy < 0 || yy >= H) continue;
    const edge = Math.min(k, len - 1 - k) / len;
    if (h2(x, yy, seed) < 0.5 - edge * 2) continue;
    put(x, yy, edge > 0.18 ? tones[1] : tones[2]);
  }
}

/**
 * A streak of torn cloud lying between the masses: a few rows, the middle one
 * longest, the ends frayed; the inner rows of the mid tone, the outer of the
 * belly and the rim, so it reads as a thin veil, not a bar. Only where free.
 */
function streak(W: number, H: number, x0: number, y: number, len: number, rows: number, seed: number,
  tones: Tones4, rim: string, put: Put, free: (x: number, y: number) => boolean): void {
  const c = (rows - 1) / 2;
  for (let j = 0; j < rows; j++) {
    const f = rows === 1 ? 0 : Math.abs(j - c) / (c + 1), rl = len * Math.sqrt(1 - f * f) * (0.8 + 0.4 * h2(j, 2, seed));
    const sx = x0 + (len - rl) / 2 + (h2(j, 3, seed) - 0.5) * len * 0.25, yy = y + j - Math.trunc(c);
    for (let k = 0; k < rl; k++) {
      const x = Math.trunc(sx + k);
      if (x < 0 || x >= W || yy < 0 || yy >= H || !free(x, yy)) continue;
      const edge = Math.min(k, rl - 1 - k) / rl;
      if (h2(x, yy, seed) < 0.55 - edge * 3) continue;
      const inner = f < 0.34 && edge > 0.12;
      put(x, yy, inner ? (edge > 0.25 && f < 0.2 ? tones[1] : tones[2]) : f < 0.67 ? tones[2] : rim);
    }
  }
}

/** A karst peak: a column of rock wider at its foot, in blocks that step out (a ledge each, green on it if it has a cap), rounded on top, strata down it, lit on the left. */
export function pillar(W: number, H: number, cx: number, foot: number, hw: number, hh: number, seed: number,
  tones: Tones4, cap: [string, string, string] | undefined, put: Put): void {
  const top = foot - hh, cw = 3 + Math.trunc(h2(0, 1, seed) * 3), blk = 7 + Math.trunc(h2(0, 2, seed) * 6);
  const half = (y: number, s: number) => {
    const t = (foot - y) / hh, round = t > 0.88 ? Math.sqrt(Math.max(0, 1 - ((t - 0.88) / 0.12) ** 2)) : 1;
    const step = 1 + 0.22 * (h2(Math.floor((y - top) / blk), s, seed) - 0.5);
    return hw * (1 + 0.45 * (1 - t) ** 1.5) * round * step * (1 + 0.08 * n1(y / 4.0, seed + s));
  };
  const inside = (x: number, y: number) => y >= top && y < foot && x + 0.5 >= cx - half(y, 2) && x + 0.5 <= cx + half(y, 3);
  const capDepth = (x: number) => Math.max(2, hw * (0.7 + 1.3 * h2(Math.floor(x / 2), 4, seed) ** 1.5));
  for (let y = Math.floor(top); y < Math.ceil(foot); y++) {
    if (y < 0 || y >= H) continue;
    const L = half(y, 2), R = half(y, 3);
    for (let x = Math.floor(cx - L) - 1; x <= Math.ceil(cx + R) + 1; x++) {
      if (x < 0 || x >= W || !inside(x, y)) continue;
      const rel = (x + 0.5 - (cx - L)) / Math.max(1, L + R);
      const colA = Math.floor((x - cx + 64) / cw), colB = Math.floor((x + 1 - cx + 64) / cw);
      const crack = colA !== colB && h2(colA, Math.floor((y - top) / 9), seed + 5) < 0.75;
      let c = rel < 0.32 ? tones[0] : rel < 0.68 ? tones[1] : tones[2];
      if (crack) c = rel < 0.32 ? tones[1] : tones[3];
      if (!inside(x + 1, y)) c = tones[3];
      else if (!inside(x - 1, y) && rel < 0.32) c = tones[0];
      let j = 0;
      while (j < 4 && inside(x, y - j - 1)) j++;
      if (j < 4 && y - j > top + 1) {
        // a ledge: the block steps out under the one above; its top lit, or green
        if (cap && h2(x >> 1, Math.floor((y - top) / blk), seed + 6) < 0.8) c = j === 0 ? cap[0] : j === 1 ? cap[1] : j === 2 && h2(x, y, seed + 7) < 0.5 ? cap[2] : c;
        else if (j === 0) c = rel < 0.68 ? tones[0] : tones[1];
      }
      if (cap) {
        // the green on top hangs down the face in tongues, darker at their tips and on the right
        let k = 0;
        while (k < hh && inside(x, y - k - 1)) k++;
        const dep = capDepth(x);
        if (y - k <= top + 1 && k < dep) c = k >= dep - 1 ? cap[2] : rel < 0.4 && k < dep * 0.6 ? cap[0] : rel < 0.75 ? cap[1] : cap[2];
        // creepers down the face, in the light more than in the shade
        else if (h2(x, Math.floor((y - top) / 7), seed + 8) < (rel < 0.5 ? 0.14 : 0.05) && !crack) c = h2(x, y, seed + 9) < 0.5 ? cap[1] : cap[2];
      }
      put(x, y, c);
    }
  }
  if (cap) {
    // lumps of crown over the top edge
    const lumps = 2 + Math.trunc(hw / 4);
    for (let i = 0; i < lumps; i++) {
      const lx = cx + ((i + 0.5) / lumps * 2 - 1) * hw * 0.85, lr = hw * (0.38 + 0.25 * h2(i, 6, seed));
      const ly = top + lr * 0.5 - (1 - Math.abs(i + 0.5 - lumps / 2) / (lumps / 2)) * lr * 0.6;
      for (let y = Math.floor(ly - lr); y <= Math.ceil(ly + lr * 0.3); y++) for (let x = Math.floor(lx - lr); x <= Math.ceil(lx + lr); x++) {
        const dx = x + 0.5 - lx, dy = y + 0.5 - ly;
        if (dx * dx + dy * dy > lr * lr || x < 0 || y < 0 || x >= W || y >= H) continue;
        put(x, y, dx * dx + dy * dy > lr * lr * 0.7 && dx + dy > 0 ? cap[2] : dx + dy < -lr * 0.25 ? cap[0] : cap[1]);
      }
    }
  }
}

/** A far mountain: a summit and its shoulders, ribs running down from each top, lit on the left. */
export function peak(W: number, H: number, cx: number, foot: number, hw: number, hh: number, seed: number, tones: Tones4, put: Put): void {
  const tops: [number, number, number][] = [[cx, hh, hw]];
  const n = 1 + Math.trunc(h2(0, 1, seed) * 3);
  for (let i = 0; i < n; i++) {
    const side = h2(i, 2, seed) < 0.5 ? -1 : 1;
    tops.push([cx + side * hw * (0.45 + 0.5 * h2(i, 3, seed)), hh * (0.45 + 0.35 * h2(i, 4, seed)), hw * (0.5 + 0.4 * h2(i, 5, seed))]);
  }
  const x0 = Math.floor(cx - hw * 2.2), x1 = Math.ceil(cx + hw * 2.2);
  for (let y = Math.floor(foot - hh); y < Math.ceil(foot); y++) {
    if (y < 0 || y >= H) continue;
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= W) continue;
      let own = -1, ou = 0;
      for (let i = 0; i < tops.length; i++) {
        const [tx, th, tw] = tops[i], t = (foot - y) / th;
        if (t > 1) continue;
        const half = tw * (1 - t) ** 0.85 * (1 + 0.1 * n1(y / 3.0 + i * 7, seed + 6));
        const u = (x + 0.5 - tx) / Math.max(0.5, half);
        if (Math.abs(u) <= 1 && (own < 0 || th < tops[own][1])) { own = i; ou = u; }
      }
      if (own < 0) continue;
      const rib = Math.floor((ou + 1) * 3.5 + 0.6 * n1(y / 5.0, seed + 8 + own)), rib2 = Math.floor((ou + 1.08) * 3.5 + 0.6 * n1(y / 5.0, seed + 8 + own));
      let c = ou < -0.2 ? tones[0] : ou < 0.3 ? tones[1] : tones[2];
      if (rib !== rib2) c = ou < -0.2 ? tones[1] : tones[3];
      put(x, y, c);
    }
  }
}

function planePeaks(ctx: Ctx, p: CloudscapePlane, salt: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const [u, v, hw, hh] of p.at ?? []) { const [x, y] = ctx.P(u, v); out.push([x, y, hw, hh]); }
  const [w0, w1] = p.width ?? [5, 12], [hh0, hh1] = p.height ?? [30, 70];
  for (let k = 0; k < (p.count ?? 0); k++) {
    const hw = w0 + (w1 - w0) * h2(k, 3, salt) ** 1.5;
    out.push([h2(k, 1, salt) * ctx.W, 20 + h2(k, 2, salt) * (ctx.H + 40), hw, hh0 + (hh1 - hh0) * h2(k, 4, salt)]);
  }
  return out.sort((a, b) => a[1] - b[1]);
}

export function runCloudscape(ctx: Ctx, st: CloudscapeStep): void {
  if (!st.within) return paintSky(ctx, st, null);
  const mask = ctx.masks.get(st.within);
  if (!mask) throw new Error(`cloudscape: no mask "${st.within}" (a brink with that id goes before)`);
  // the whole sky again, kept only inside the mask: the same pixels the first one laid there
  const px = ctx.ground.px.slice(), kind = ctx.kind.slice();
  if (st.drift) ctx.layer(st.drift.layer).px.fill(null);
  paintSky(ctx, st, mask);
  for (let i = 0; i < px.length; i++) if (!mask.data[i]) { ctx.ground.px[i] = px[i]; ctx.kind[i] = kind[i]; }
}

function paintSky(ctx: Ctx, st: CloudscapeStep, mask: Mask | null): void {
  const { W, H } = ctx, g = ctx.ground, name = st.material, t = (i: number) => ctx.tone(name, i);
  const clouds: Tones4 = st.clouds ?? [t(6), t(5), t(4), t(3)];
  const ground: Put = (x, y, c) => { g.set(x, y, c); ctx.setKind(x, y, name); };
  const drifting = st.drift ? ctx.layer(st.drift.layer) : null, d = st.drift?.px ?? 0;
  // a cloud drifts only if, moved d px each way, it still falls on the sky past the island; else it stays
  // still on the ground, behind the island (which hides what of it falls on it): never a cloud cut straight
  const place = (paint: (put: Put) => void) => {
    if (!drifting) return paint(ground);
    const buf: [number, number, string][] = [];
    paint((x, y, c) => buf.push([x, y, c]));
    const free = !mask || buf.every(([x, y]) => {
      for (let k = -d; k <= d; k++) if (x + k < 0 || x + k >= W || !mask.data[y * W + x + k]) return false;
      return true;
    });
    for (const [x, y, c] of buf) free ? drifting.set(x, y, c) : ground(x, y, c);
  };
  // the sky: its mid tone, the deep one in wide soft patches
  const [hx, hs, deep] = st.haze ?? [200, 4001, 0.36];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ground(x, y, fbm(x / hx, y / hx, hs, 2) < deep ? t(0) : t(1));
  // what is open sky (the rim of a cloud and the streaks go only there)
  const skyTones = new Set([t(0), t(1), t(2)]);
  const free = (x: number, y: number) => (!drifting || drifting.get(x, y) === null) && skyTones.has(g.get(x, y) ?? '');
  const softness: CumulusSoft = st.soft ? { rim: [st.soft.rim?.[0] ?? t(2), st.soft.rim?.[1] ?? t(2)], free, lumps: st.soft.lumps, ragged: st.soft.ragged, bright: st.soft.bright, smooth: st.soft.smooth } : {};
  // the sea of cloud: a floor of almost white cloud below a wavering line, small gaps of sky in it; the peaks rise out of it
  type Mass = [number, number, number, number, number, number];     // x, y, radius, k, salt, odds of wisps
  const list: Mass[] = [];
  if (st.sea) {
    const sea = st.sea, ss = sea.salt ?? 4500, rise = sea.rise ?? 0, holes = sea.holes ?? 0.06;
    const line = (x: number) => sea.top - rise * ((x - W / 2) / (W / 2)) ** 2 + 10 * (fbm(x / 60, 0.5, ss, 2) - 0.5);
    const cells: [number, number, number][] = [];
    for (let x = 0; x < W; x++) for (let y = Math.max(0, Math.ceil(line(x))); y < H; y++) cells.push([x, y, fbm(x / 11, y / 6, ss + 2, 2)]);
    // the gaps are the low tail of a fine noise, as many as holes asks; the inner half of a gap is the mid sky
    const sorted = cells.map(c => c[2]).sort((a, b) => a - b);
    const q = (f: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : -1;
    const gapAt = holes > 0 ? q(holes) : -1, deepAt = holes > 0 ? q(holes * 0.4) : -1;
    for (const [x, y, hole] of cells) {
      const n = fbm(x / 34, y / 16, ss + 1, 3);
      if (hole < gapAt && y > line(x) + 4) ground(x, y, hole < deepAt ? t(1) : t(2));
      else ground(x, y, n > 0.56 ? clouds[0] : n > 0.38 ? clouds[1] : n > 0.3 ? clouds[2] : clouds[1]);
    }
    const [r0, r1] = sea.size ?? [10, 30], count = sea.count ?? Math.ceil(W / 8);
    for (let k = 0; k < count; k++) {
      const x = h2(k, 1, ss) * (W + 40) - 20, ly = line(Math.max(0, Math.min(W - 1, x)));
      list.push([x, ly + 4 + (H + 20 - ly) * h2(k, 2, ss) ** 1.3, r0 + (r1 - r0) * h2(k, 3, ss), k, ss, 0]);
    }
  }
  // the ranges, far to near, each one with the clouds at the feet of its peaks
  (st.planes ?? []).forEach((p, pi) => {
    const salt = p.salt ?? 4100 + pi;
    const peaks = planePeaks(ctx, p, salt);
    peaks.forEach(([x, y, hw, hh], k) => p.shape === 'peak'
      ? peak(W, H, x, y, hw, hh, salt * 31 + k, p.tones, ground)
      : pillar(W, H, x, y, hw, hh, salt * 31 + k, p.tones, p.cap, ground));
    const feet = p.feet ?? 1.4;
    if (feet > 0) peaks.forEach(([x, y, hw], k) => {
      for (let j = 0; j < 2; j++) {
        const r = Math.max(4, hw * feet * (0.75 + 0.5 * h2(k, 20 + j, salt)));
        cumulus(W, H, x + (j - 0.5) * hw * 1.3, y - 1, r, salt * 37 + k * 2 + j, clouds, ground, 0.5, softness);
      }
    });
  });
  // the haze of the horizon: a band of mist behind everything near, thick in its middle, frayed at both edges
  if (st.horizon) {
    const [hy0, hy1, hsalt] = st.horizon, mid = (hy0 + hy1) / 2, half = Math.max(1, (hy1 - hy0) / 2);
    const veil = [t(2), clouds[2], clouds[1]];
    for (let y = Math.max(0, Math.floor(hy0 - half * 0.4)); y < Math.min(H, Math.ceil(hy1 + half * 0.4)); y++) for (let x = 0; x < W; x++) {
      const m = mid + half * 0.4 * (fbm(x / 70, 0.5, hsalt ?? 4401, 2) - 0.5) * 2;
      const s0 = 1 - Math.abs(y - m) / half + 0.35 * (fbm(x / 23, y / 9, (hsalt ?? 4401) + 1, 2) - 0.5);
      if (s0 <= 0) continue;
      // solid levels; only a narrow seam between two of them is a fine checker
      const lv = Math.min(2.999, s0 * 3.2), fr = lv - Math.floor(lv);
      const lvl = Math.floor(lv) + (fr > 0.6 || (fr > 0.4 && (x + y) % 2 === 0) ? 1 : 0);
      if (lvl < 1) continue;
      ground(x, y, veil[Math.min(2, lvl - 1)]);
    }
  }
  // the masses: few big, many small, back to front (with those of the sea)
  if (st.masses) {
    const m = st.masses, [r0, r1] = m.size ?? [5, 34], skew = m.skew ?? 2.4, s = m.salt ?? 4200;
    for (let k = 0; k < m.count; k++) {
      const r = r0 * (r1 / r0) ** (h2(k, 3, s) ** skew);
      const x = h2(k, 1, s) * (W + 40) - 20, y = h2(k, 2, s) * (H + 30) - 10;
      if (m.top === undefined || y >= m.top) list.push([x, y, r, k, s, m.wisps ?? 0.6]);
    }
  }
  list.sort((a, b) => a[1] - b[1] || a[4] - b[4] || a[3] - b[3]);
  for (const [x, y, r, k, s, odds] of list) place(put => cumulus(W, H, x, y, r, s * 41 + k, clouds, put, odds, softness));
  if (st.wisps) {
    const [l0, l1] = st.wisps.length ?? [8, 30], s = st.wisps.salt ?? 4300;
    const [r0, r1] = st.wisps.rows ?? [1, 1];
    for (let k = 0; k < st.wisps.count; k++) {
      const rows = r0 + Math.trunc(h2(k, 4, s) * (r1 - r0 + 1));
      const x0 = h2(k, 1, s) * W - 10, y = Math.trunc(h2(k, 2, s) * H), len = l0 + (l1 - l0) * h2(k, 3, s);
      place(put => rows > 1 || st.soft
        ? streak(W, H, x0, y, len, rows, s + k, clouds, softness.rim?.[0] ?? t(2), put, free)
        : wisp(W, H, x0, y, len, s + k, clouds, put));
    }
  }
}
