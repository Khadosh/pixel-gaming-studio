// Paving: a court of loose paving stones. Seeds scattered around a center (kept
// apart, the rows squashed) give Voronoi stones; each stone has its tone, a lit
// lip up-left, its edge in shadow down-right and a few specks; where two stones
// almost tie the joint is moss or earth; the border of the court is in shadow
// (the earth steps on it, no hard outline). Port of the tea house court of The
// Unwritten Dao's village script (scripts/suelo_aldea.py).

import { fbm, h2, type Mask } from '../mapnoise';
import { stoneRoles, type Ctx, type Layer } from '../mappaint';
import type { PavingOpts } from './schema';

export function texturePaving(ctx: Ctx, mask: Mask, name: string, o: PavingOpts, layer: Layer = ctx.ground): void {
  const { W, H } = ctx, g = layer, s = stoneRoles(ctx, name);
  const [ccx, ccy] = ctx.P(o.at[0], o.at[1]);
  const n = o.count ?? 18, tries = o.tries ?? 400, salt = o.salt ?? 231;
  const [spx, spy] = o.spread ?? [34, 13];
  const [apart, squash] = o.apart ?? [9, 1.5];
  const own = o.squash ?? 1.4, joint = o.joint ?? 14;
  const [moss, earth] = o.joints ?? [s.moss[1], s.shadow];
  const seeds: [number, number][] = [];
  for (let k = 0; seeds.length < n && k < tries;) {
    const x = ccx - spx + h2(k, 1, salt) * (2 * spx), y = ccy - spy + h2(k, 2, salt) * (2 * spy);
    k++;
    if (seeds.every(([a, b]) => (x - a) ** 2 + ((y - b) * squash) ** 2 > apart ** 2)) seeds.push([x, y]);
  }
  const owner = new Map<number, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask.has(x, y)) continue;
    // the nearest seed and the second (ties: the lower index first)
    let d0 = Infinity, i0 = -1, d1 = Infinity;
    seeds.forEach(([a, b], i) => {
      const d = (x + 0.5 - a) ** 2 + ((y + 0.5 - b) * own) ** 2;
      if (d < d0) { d1 = d0; d0 = d; i0 = i; } else if (d < d1) d1 = d;
    });
    owner.set(y * W + x, seeds.length > 1 && d1 - d0 > joint ? i0 : -1);
  }
  const o_ = (x: number, y: number) => owner.get(y * W + x) ?? -2;
  const tones = [s.light, s.mid, s.speck];
  for (const [key, i] of owner) {
    const x = key % W, y = Math.floor(key / W);
    ctx.setKind(x, y, name);
    let c: string;
    if (i < 0) c = fbm(x / 3, y / 3, salt + 2, 2) > 0.5 ? moss : earth;
    else if (o_(x - 1, y) !== i || o_(x, y - 1) !== i) c = s.high;
    else if (o_(x + 1, y) !== i || o_(x, y + 1) !== i) c = s.shadow;
    else {
      c = tones[Math.trunc(h2(i, 3, salt + 4) * 3)];
      if (h2(x, y, salt + 6) < 0.05) c = s.mid;
    }
    g.set(x, y, c);
  }
  for (const [key, i] of owner) {
    const x = key % W, y = Math.floor(key / W);
    if (!mask.has(x + 1, y) || !mask.has(x, y + 1)) g.set(x, y, i >= 0 ? s.shadow : earth);
  }
}
