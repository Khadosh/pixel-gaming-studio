// @vitest-environment node
// The sea of cloud under an island (round eight of the island of the sect of
// The Unwritten Dao): below a wavering line the picture is almost white cloud
// with a few small gaps of sky, heaped with cumulus; the line climbs at the
// sides; and no loose mass up top, where the horizon is.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';

const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
const OPEN = new Set(SKY.slice(0, 3));
type Step = MapRecipe['steps'][number];

function game(): MapGame {
  return { width: 12, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(12)), decor: [] };
}
function paint(extra: object): PaintedMap {
  const r: MapRecipe = {
    game: game(), margin: [5, 5], light: [1, 1],
    materials: { sky: { ramp: SKY } },
    steps: [{ step: 'cloudscape', material: 'sky', haze: [200, 4001, -1], ...extra } as Step],
  };
  return paintMap(r, game());
}
const openShare = (m: PaintedMap, y0: number, y1: number, x0 = 0, x1 = m.width) => {
  let n = 0, open = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (OPEN.has(m.layers.ground.px[y * m.width + x]!)) open++; }
  return open / n;
};

describe('cloudscape sea', () => {
  it('below the line the picture is cloud with a few gaps; above it, the plain sky', () => {
    const m = paint({ sea: { top: 160, count: 0 } }), H = m.height;
    expect(openShare(m, 0, 140)).toBe(1);
    const low = openShare(m, 180, H);
    expect(low).toBeGreaterThan(0.01);      // the gaps
    expect(low).toBeLessThan(0.08);         // only a few
    // without holes, no sky below the line at all
    expect(openShare(paint({ sea: { top: 160, count: 0, holes: 0 } }), 180, H)).toBe(0);
  });

  it('rise lifts the line at the sides and not in the middle', () => {
    const flat = paint({ sea: { top: 200, count: 0, holes: 0 } }), up = paint({ sea: { top: 200, count: 0, holes: 0, rise: 120 } });
    const W = flat.width, mid = Math.trunc(W / 2);
    expect(openShare(up, 120, 180, 0, 10)).toBeLessThan(openShare(flat, 120, 180, 0, 10) - 0.5);
    expect(openShare(up, 0, 180, mid - 5, mid + 5)).toBe(openShare(flat, 0, 180, mid - 5, mid + 5));
  });

  it('its masses heap the top edge, drawn back to front with the others, and drift with them', () => {
    const bare = paint({ sea: { top: 200, count: 0, holes: 0 } });
    const heaped = paint({ sea: { top: 200, count: 40, holes: 0 }, soft: { bright: 0.18, smooth: 5 } });
    // cloud now rises above the line
    expect(openShare(heaped, 170, 200)).toBeLessThan(openShare(bare, 170, 200) - 0.2);
    const drifting = paint({ sea: { top: 200, count: 40 }, drift: { layer: 'nubes', px: 3 } });
    expect(drifting.layers.nubes.px.filter(Boolean).length).toBeGreaterThan(1000);
  }, 30000);   // three seas of 40 cumulus: ~1 s alone, past vitest's 5 s with the machine loaded (PGS#35)

  it('masses.top keeps every loose mass below it; without it nothing changes', () => {
    const all = paint({ masses: { count: 60, size: [5, 16] } });
    const cut = paint({ masses: { count: 60, size: [5, 16], top: 120 } });
    expect(openShare(all, 0, 80)).toBeLessThan(1);
    expect(openShare(cut, 0, 80)).toBe(1);            // a mass reaches at most 2 radii above its centre
    const again = paint({ masses: { count: 60, size: [5, 16], top: -1000 } });
    expect(again.layers.ground.px).toEqual(all.layers.ground.px);
  });

  // the longest straight run (px along it) of the top edge of the sea: its outline traced pixel by pixel
  // (Moore), cut where it runs on the edge of the picture, and a run is straight while every pixel of it
  // stays within 1 px of the chord between its ends
  const longestStraight = (m: PaintedMap) => {
    const W = m.width, H = m.height;
    const sea = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !OPEN.has(m.layers.ground.px[y * W + x]!);
    let sx = 0, sy = 0;
    find: for (sy = 0; sy < H; sy++) for (sx = 0; sx < W; sx++) if (sea(sx, sy)) break find;
    const D = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
    const path: [number, number][] = [[sx, sy]];
    let cx = sx, cy = sy, back = 0;                     // the backtrack: the west of the first pixel is not sea
    for (let step = 0; step < 4 * (W + H) * 4; step++) {
      let k = 0;
      for (; k < 8; k++) { const d = D[(back + k) % 8]; if (sea(cx + d[0], cy + d[1])) break; }
      if (k === 8) break;
      const dir = (back + k) % 8;
      cx += D[dir][0]; cy += D[dir][1];
      back = (dir + 5) % 8;                             // start next turn from the neighbour after the one we came from
      if (cx === sx && cy === sy) break;
      path.push([cx, cy]);
    }
    const onRim = ([x, y]: [number, number]) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
    let best = 0;
    for (let a = 0; a < path.length; a++) {
      if (onRim(path[a])) continue;
      for (let b = a + 2; b < path.length && !onRim(path[b]); b++) {
        const [ax, ay] = path[a], [bx, by] = path[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
        let ok = true;
        for (let i = a + 1; i < b && ok; i++) ok = Math.abs((path[i][0] - ax) * dy - (path[i][1] - ay) * dx) / len <= 1;
        if (!ok) break;
        let arc = 0;
        for (let i = a; i < b; i++) arc += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
        best = Math.max(best, arc);
      }
    }
    return best;
  };

  it('lobes break the steep sides into cloud tops: no straight run of the edge longer than two cells', () => {
    const sea = { top: 260, rise: 220, count: 0, holes: 0 };
    const bare = paint({ sea }), lobed = paint({ sea: { ...sea, lobes: [20, 56] } });
    expect(longestStraight(bare)).toBeGreaterThan(32);       // the parabola on its own: a diagonal cut
    expect(longestStraight(lobed)).toBeLessThanOrEqual(32);
    // a cumulus on each lobe (crest) keeps the edge round, and shades it like the other clouds
    const crested = paint({ sea: { ...sea, lobes: [20, 56], crest: 0.7 }, soft: { bright: 0.18, smooth: 5 } });
    expect(longestStraight(crested)).toBeLessThanOrEqual(32);
    expect(crested.layers.ground.px).not.toEqual(lobed.layers.ground.px);
    // without lobes, the sea is the same as always
    expect(paint({ sea: { ...sea, lobes: undefined } }).layers.ground.px).toEqual(bare.layers.ground.px);
  });
});
