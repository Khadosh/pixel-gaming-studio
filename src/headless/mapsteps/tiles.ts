// Tiles: a grid of tiles over the area — a patio, a kitchen, a bathroom, a
// sidewalk, a wall of bricks with `stagger`. Each tile is one tone drawn from
// the palette (the ramp of its material), with the joint on its right and
// bottom, a lit edge on the sides that face the light, a shaded one on the
// sides away from it when the light comes from below (`shade`) and, now and then, a
// worn tile: a chipped corner or a crack. The grid is anchored to a cell of the
// map (`at`), not to the area, so several areas laid over the same floor (a
// fan of light from a door, a rug) keep their joints in line and give the same
// tile the same tone.

import { h2, type Mask } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';
import type { TilesOpts } from './schema';

/** The tile a pixel falls in and where in it: column i, row j, and its offset inside (tx, ty). */
export function tileAt(x: number, y: number, ax: number, ay: number, w: number, h: number, stagger: number): [number, number, number, number] {
  const j = Math.floor((y - ay) / h), ty = y - ay - j * h;
  const sx = x - ax - Math.round(stagger * w * j);
  const i = Math.floor(sx / w), tx = sx - i * w;
  return [i, j, tx, ty];
}

/** The px of a crack across a tile body of bw × bh: a walk from one edge to the other, a px at a time. */
function crack(i: number, j: number, bw: number, bh: number, s: number): Set<number> {
  const out = new Set<number>();
  const across = h2(i, j, s) < 0.5; // from the top edge down, or from the left edge across
  let x = across ? 1 + Math.trunc(h2(i, j, s + 1) * Math.max(1, bw - 2)) : 0;
  let y = across ? 0 : 1 + Math.trunc(h2(i, j, s + 1) * Math.max(1, bh - 2));
  const lean = h2(i, j, s + 2) < 0.5 ? -1 : 1;
  const len = Math.round((across ? bh : bw) * (0.5 + 0.3 * h2(i, j, s + 3)));
  for (let k = 0; k < len; k++) {
    if (x < 0 || y < 0 || x >= bw || y >= bh) break;
    out.add(y * bw + x);
    // on across the tile with a step sideways about every other px, always to the same side: a slant that
    // wanders. Straight on it reads as a dash, a step every px as a staircase
    const side = h2(k, i * 31 + j, s + 4) < 0.55;
    if (across) { y++; if (side) x += lean; } else { x++; if (side) y += lean; }
  }
  return out;
}

export function textureTiles(ctx: Ctx, mask: Mask, name: string, o: TilesOpts = {}, layer: Layer = ctx.ground): void {
  const b = mask.bounds();
  if (!b) return;
  const ramp = ctx.mat(name).ramp, base = ctx.base(name);
  const at = (k: number) => ramp[Math.max(0, Math.min(ramp.length - 1, k))];
  const up = (c: string) => { const k = ramp.indexOf(c); return k >= 0 ? at(k + 1) : ctx.lighten(c); };
  const down = (c: string) => { const k = ramp.indexOf(c); return k >= 0 ? at(k - 1) : (ctx.shade(c, name) ?? c); };
  const [w, h] = (o.size ?? [12, 12]).map(v => Math.max(2, Math.round(v)));
  const jw = Math.min(o.joint ?? 1, w - 1, h - 1);
  const [ax, ay] = o.at ? ctx.P(o.at[0], o.at[1]).map(Math.round) : [b[0], b[1]];
  const stagger = o.stagger ?? 0;
  const tones = o.tones ?? [at(base), at(base), at(base + 1), at(base - 1)];
  const lip = o.lip ?? 1, wear = o.wear ?? 0, s = o.salt ?? 911;
  const jointC = o.colors?.joint ?? at(base - 2);
  // the lit sides face the light: shadows fall along ctx.dir, so the light comes from the other way
  const [dx, dy] = ctx.dir;
  // with the light from above the lit edge alone reads as a piece and the joint below it as its shadow; lit from
  // below, that one edge reads as a tile sunk into the floor (the eye takes light from above) unless the side away
  // from the light is shaded too. Moving the joint would not help: every body touches a joint on its four sides
  const shade = o.shade ?? (dy < 0 ? lip : 0);
  const bw = w - jw, bh = h - jw;
  const cracks = new Map<string, Set<number>>();
  for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) {
    if (!mask.has(x, y)) continue;
    const [i, j, tx, ty] = tileAt(x, y, ax, ay, w, h, stagger);
    let c: string;
    if (tx >= bw || ty >= bh) c = jointC;
    else {
      const tone = tones[Math.trunc(h2(i, j, s) * tones.length)];
      c = tone;
      const lit = lip > 0 && ((dy > 0 && ty < lip) || (dy < 0 && ty >= bh - lip) || (dx > 0 && tx < lip) || (dx < 0 && tx >= bw - lip));
      if (lit) c = up(tone);
      else if (shade > 0 && ((dy > 0 && ty >= bh - shade) || (dy < 0 && ty < shade) || (dx > 0 && tx >= bw - shade) || (dx < 0 && tx < shade))) c = down(tone);
      if (wear > 0 && h2(i, j, s + 2) < wear) {
        if (h2(i, j, s + 3) < 0.5) {
          // a chipped corner: a little triangle of the joint color
          const corner = Math.trunc(h2(i, j, s + 4) * 4), k = 2 + Math.trunc(h2(i, j, s + 5) * 2);
          const cx = corner & 1 ? bw - 1 - tx : tx, cy = corner & 2 ? bh - 1 - ty : ty;
          if (cx + cy < k) c = jointC;
        } else {
          const key = `${i},${j}`;
          let set = cracks.get(key);
          if (!set) { set = crack(i, j, bw, bh, s + 6); cracks.set(key, set); }
          if (set.has(ty * bw + tx)) c = o.colors?.crack ?? down(tone);
        }
      }
    }
    layer.set(x, y, c);
    ctx.setKind(x, y, name);
  }
}
