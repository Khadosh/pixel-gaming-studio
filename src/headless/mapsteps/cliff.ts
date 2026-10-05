// The cliff: the map ends at the lip of a plateau. Beyond it, far below, a
// sea of mist in streaks, banks of clouds, far peaks with pines on top rising
// from them and clouds hiding their feet; then the rock face falling from the
// lip (lit by the morning: it looks west), with cracks and lit edges, the grass
// hanging over the lip and a few loose stones on it. Port of the sect script of
// The Unwritten Dao (scripts/suelo_secta.py, step 2).

import { fbm, h2, n1 } from '../mapnoise';
import { paintClumps, stone, stoneRoles, type Clump, type Ctx } from '../mappaint';
import type { CliffStep } from './schema';

export function runCliff(ctx: Ctx, st: CliffStep, seed: number): void {
  const { W, H, ox } = ctx, g = ctx.ground;
  const sea = st.material, rock = st.face;
  const t = (i: number) => ctx.tone(sea, i);   // deep, mist, cloud shadow, cloud, cloud light
  const r = stoneRoles(ctx, rock);
  const [w1, w2] = st.wobble ?? [3.4, 1.6];
  const [f0, f1, f2] = st.width ?? [7, 4, 2.5];
  const inset = st.inset ?? -5;
  const edgeAt = (py: number) => ox + inset + w1 * n1(py / 26.0, seed + 1) + w2 * n1(py / 9.0, seed + 2);
  const faceW = (py: number) => f0 + f1 * fbm(py / 6.0, 0.5, seed + 3, 2) + f2 * n1(py / 17.0, seed + 4);
  const isSea = (x: number, y: number) => ctx.kindAt(x, y) === sea;
  for (let y = 0; y < H; y++) {
    const e = edgeAt(y);
    for (let x = 0; x < W; x++) if (x < e) ctx.setKind(x, y, sea);
  }
  // far below: the mist in streaks
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isSea(x, y)) g.set(x, y, fbm(x / 40.0, y / 9.0, seed + 11, 2) > 0.47 ? t(1) : t(2));
  }
  // the sea of clouds: wide banks of big puffs, with their cold shadow below
  const cloud = [t(4), t(4), t(3), t(2), t(2)];
  const clouds: Clump[] = [];
  const every = st.banks ?? 34;
  for (let bank = 0, by = -4; by < H + 20; bank++, by += every) {
    let x = -16.0 + h2(bank, 0, seed + 50) * 20;
    for (let k = 0; x < ox; k++) {
      const rr = 6 + h2(bank, k, seed + 51) * 10;
      const y = by + 9 * n1(x / 40.0, seed + 52 + bank) + (h2(bank, k, seed + 53) - 0.5) * 6;
      if (h2(bank, k, seed + 55) < 0.82) clouds.push([x, y, rr, cloud]);
      x += rr * (1.0 + h2(bank, k, seed + 54) * 1.1);
    }
  }
  clouds.sort((p, q) => p[1] - q[1]);
  const peakBoxes = (st.peaks ?? []).map(([u, v, hw, hh]) => { const [cx, top] = ctx.P(u, v); return [cx, top, hw, hh]; });
  // drifting clouds: far enough from the face and from every peak to move `px` each way
  const drifts = (cl: Clump): boolean => {
    if (!st.drift) return false;
    const [cx, cy, rr] = cl, reach = rr * 1.3 + 2 + st.drift.px;
    // with `peaks` the face goes above them too: a cloud may slide under it, never past the lip
    const room = (y: number) => (st.drift?.peaks ? edgeAt(y) - 2 : edgeAt(y) - faceW(y) - 2);
    for (let y = Math.trunc(cy - reach); y <= cy + reach; y++) if (cx + reach >= room(y)) return false;
    return !!st.drift.peaks || peakBoxes.every(([px, top, hw, hh]) => Math.abs(cx - px) >= reach + hw + 1 || cy + reach < top - 5 || cy - reach > top + hh);
  };
  const still = clouds.filter(cl => !drifts(cl)), moving = clouds.filter(drifts);
  for (const [key, c] of paintClumps(W, H, still, seed + 57)) if (ctx.kind[key] === sea) g.px[key] = c;
  if (st.drift) {
    const layer = ctx.layer(st.drift.layer);
    for (const [key, c] of paintClumps(W, H, moving, seed + 57)) if (ctx.kind[key] === sea) layer.px[key] = c;
  }
  // the far peaks: columns of rock with pines on top (on their own layer, over the drifting clouds)
  const pk = st.drift?.peaks ? ctx.layer(st.drift.peaks) : g;
  const [pineLit, pineDark] = st.pines ?? ['hoja', 'hoja sombra'];
  const peaks: [number, number, number, number][] = [];
  (st.peaks ?? []).forEach(([u, v, hw, hh], k) => {
    const [cx, top] = ctx.P(u, v);
    peaks.push([cx, top, hw, hh]);
    for (let y = Math.trunc(top); y < Math.min(H, Math.trunc(top + hh)); y++) {
      const f = (y - top) / hh;
      const half = hw * (0.62 + 0.38 * f) + 1.0 * n1(y / 5.0, seed + 20 + k);
      for (let x = Math.trunc(cx - half) - 1; x < Math.trunc(cx + half) + 2; x++) {
        if (x < 0 || x >= W || !isSea(x, y)) continue;
        const dx = (x + 0.5 - cx) / Math.max(half, 1);
        if (Math.abs(dx) > 1) continue;
        let c: string;
        if (Math.abs(dx) > 0.84) c = dx > 0 ? t(0) : t(2);
        else if (dx < -0.30) c = t(3);
        else if (dx < 0.30) c = t(2);
        else c = t(1);
        if (h2(x, Math.floor(y / 4), seed + 30 + k) < 0.07 && Math.abs(dx) < 0.84) c = t(1);
        pk.set(x, y, c);
      }
    }
    for (let i = -hw - 1; i < hw + 2; i++) for (let j = -4; j < 2; j++) {
      const x = Math.trunc(cx + i), y = Math.trunc(top + j);
      const rr = (i / (hw + 1)) ** 2 + ((j + 1.5) / 3.5) ** 2;
      if (rr < 0.9 + 0.3 * n1(i * 0.8, seed + 40 + k) && x >= 0 && x < W && y >= 0 && y < H && isSea(x, y)) {
        pk.set(x, y, j < -1 && i < 1 ? pineLit : j < 1 ? pineDark : t(0));
      }
    }
  });
  // clouds hiding the feet of the peaks
  const feet: Clump[] = [];
  peaks.forEach(([cx, top, hw, hh], k) => {
    for (let i = -1; i < 2; i++) feet.push([cx + i * hw * 0.9, top + hh - 4 + 2 * h2(k, i, seed + 59), 6 + hw * 0.4, cloud]);
  });
  feet.sort((p, q) => p[1] - q[1]);
  for (const [key, c] of paintClumps(W, H, feet, seed + 61)) if (ctx.kind[key] === sea) pk.px[key] = c;
  // the rock face, from the lip down-left: vertical cracks and lit edges
  const lip = st.lip ?? 'madera sombra';
  for (let y = 0; y < H; y++) {
    const e = edgeAt(y), fw = faceW(y);
    for (let x = Math.trunc(e - fw); x < Math.trunc(e) + 1; x++) {
      if (x < 0 || x >= W || !isSea(x, y)) continue;
      const d = e - x, f = d / fw;
      let c: string | null;
      if (d < 1.2) c = lip;
      else if (x <= e - fw + 1) c = t(0);                // where the rock sinks into the mist
      else {
        const crack = h2(Math.floor(x / 3), Math.floor(y / 5), seed + 81) < 0.3 && x % 3 === 0;
        c = f < 0.18 ? r.mid : f < 0.5 ? r.shadow : f < 0.8 ? r.dark : r.line;
        if (crack) c = ctx.shade(c, rock);
        else if (h2(Math.floor(x / 2), Math.floor(y / 3), seed + 82) < 0.10 && f < 0.7) c = f > 0.3 ? r.mid : r.light;
      }
      g.set(x, y, c);
      if (pk !== g) pk.set(x, y, c);
      ctx.setKind(x, y, rock);
    }
  }
  // the grass hangs over the lip in tufts
  const [grass0, grass1] = st.grass_colors ?? ['bambú', 'hoja'];
  for (let y = 0; y < H; y++) {
    const e = Math.trunc(edgeAt(y));
    if (h2(y, 1, seed + 91) < 0.35 && e >= 0 && e < W) {
      for (let k = 0; k < 1 + Math.trunc(h2(y, 2, seed + 91) * 2); k++) {
        g.set(e - k, y, k === 0 ? grass0 : grass1);
        if (pk !== g) pk.set(e - k, y, k === 0 ? grass0 : grass1);
      }
    }
  }
  // a few loose stones on the lip
  (st.stones ?? []).forEach((v, k) => {
    const y = ctx.P(0, v)[1];
    stone(ctx, rock, edgeAt(y) + 4, y, 5 + 2 * h2(k, 1, seed + 93), 3.6, seed + 95 + k, true);
  });
}
