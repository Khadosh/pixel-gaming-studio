// The broken rock of a face seen from the south (the cut of a gorge, the face of a bluff): jittered seeds in staggered
// rows, the nearest one (distances squashed in height: blocks taller than wide) names the block of a px. Shared by
// `cataract` (the faces beside the water) and `bluff` (the face of a rock under a terrace).

import { h2 } from '../mapnoise';

export interface RockBlock { id: number; sx: number; w: number; gap: number }

/** The block of a px: `colw` px a column, `strata` px a course, give or take. */
export function rockBlocks(colw: number, strata: number): (x: number, y: number, s: number) => RockBlock {
  const SX = colw * 1.6, SY = strata * 1.6;
  return (x, y, s) => {
    const gy0 = Math.floor(y / SY);
    let best = 1e9, second = 1e9, id = 0, bx = 0;
    for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) {
      const off = (gy & 1) ? SX / 2 : 0, gx0 = Math.floor((x - off) / SX);
      for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
        const sx = off + (gx + 0.5 + 0.8 * (h2(gx, gy, s + 21) - 0.5)) * SX, sy = (gy + 0.5 + 0.7 * (h2(gx, gy, s + 22) - 0.5)) * SY;
        const dd = Math.hypot(x + 0.5 - sx, (y + 0.5 - sy) * (SX / SY));
        if (dd < best) { second = best; best = dd; id = gx * 7919 + gy * 104729; bx = sx; } else if (dd < second) second = dd;
      }
    }
    return { id, sx: bx, w: SX, gap: second - best };
  };
}

/** How many px down from the top of its block a px is (up to 6), and the block above it (-1 if none within 6). */
export function blockAbove(rockAt: (x: number, y: number, s: number) => RockBlock, x: number, y: number, id: number, s: number): [number, number] {
  for (let j = 1; j <= 6; j++) { const o = rockAt(x, y - j, s).id; if (o !== id) return [j - 1, o]; }
  return [6, -1];
}
