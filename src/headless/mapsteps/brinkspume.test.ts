// @vitest-environment node
// The foot of the falls of a ring in its billows (`spume`): in the sect of The
// Unwritten Dao a fall went into a cloud and came out clean under it, as if the
// cloud were a window floating in front of the water, and the cloud ended on a
// straight bottom cut with a ruler. In the reference the water comes apart in
// foam and mist where it meets the cloud, and the cloud has no straight edge.
import { describe, it, expect } from 'vitest';
import { Layer, paintMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';
import { bellyPut } from './brink';
import { cumulus, type Tones4 } from './sky';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];
const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
const GRASS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro', 'pasto'];
const CLOUD = new Set(SKY.slice(3));
type Step = MapRecipe['steps'][number];

function game(w = 16, h = 12): MapGame { return { width: w, height: h, grid: Array.from({ length: h }, () => '#'.repeat(w)), decor: [] }; }
const LIP: [number, number][] = [[2, 1], [8, 0.6], [14, 1.2], [15.4, 6], [14.8, 11], [8, 11.2], [2, 11], [0.6, 9], [0.5, 6], [0.6, 3]];
const P = (u: number, v: number) => [80 + u * 16, 80 + v * 16];
function paint(brink: object) {
  const recipe: MapRecipe = {
    game: game(), margin: [5, 5], light: [1, 1],
    materials: {
      grass: { ramp: GRASS, base: 2 },
      rock: { ramp: STONE, moss: MOSS },
      sky: { ramp: SKY },
      // (no cloud tone in the water: a px of cloud is never a light thread of it)
      water: { ramp: ['celeste oscuro', 'celeste', 'celeste luz', 'celeste luz', 'celeste luz'] },
    },
    steps: [
      { step: 'area', material: 'sky', shape: 'all' } as Step,
      { step: 'area', material: 'grass', shape: 'all' } as Step,
      { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'sky', lip: LIP, drop: [48, 0, 0], bushes: [0, 0], drape: [0, 0],
        view: [0.35, 0.85], veil: [14, 0], billows: [10, 16, 2], water: 'water', spring: 4, pour: [0.2, 10], ...brink } as Step,
    ],
  };
  return paintMap(recipe, game());
}
type Painted = ReturnType<typeof paint>;
const kind = (m: Painted, x: number, y: number) => m.kind[y * m.width + x];
const px = (m: Painted, x: number, y: number) => m.layers.ground.px[y * m.width + x] ?? '';
// a fall off the west side, long enough to go on past the billows under the side
const LONG = { falls: [[0.2, 4, 6, 160]] };
/** The columns of the water 20 px under its head, and the first row of cloud under the water in each one. */
function columns(m: Painted): [number, number][] {
  const [, y0] = P(0, 6), out: [number, number][] = [];
  for (let x = 60; x < 100; x++) {
    if (kind(m, x, y0 + 20) !== 'water') continue;
    let y = y0 + 20;
    while (y < m.height && !(CLOUD.has(px(m, x, y)) && kind(m, x, y) !== 'water')) y++;
    out.push([x, y]);
  }
  return out;
}

describe('brink spume: the foot of the falls comes apart in the clouds', () => {
  const old = paint(LONG), sp = paint({ ...LONG, spume: [16, 16] });

  it('without spume the water comes out clean under the cloud; with it, none goes on under it', () => {
    const under = (m: Painted) => {
      let n = 0;
      for (const [x, yc] of columns(m)) for (let y = yc + 2; y < m.height; y++) if (kind(m, x, y) === 'water') n++;
      return n;
    };
    expect(columns(old).length).toBeGreaterThan(4);
    expect(under(old)).toBeGreaterThan(20);
    expect(under(sp)).toBe(0);
  });

  it('over the cloud the water opens, lightens and turns to foam: cloud tones in it, wider than the water', () => {
    const foam = (m: Painted) => {
      let n = 0, wide = 0;
      const cols = columns(old), xs = cols.map(c => c[0]), meet = Math.min(...cols.map(c => c[1]));   // (the top of the cloud)
      for (let y = meet - 12; y < meet; y++) for (let x = xs[0] - 4; x <= xs[xs.length - 1] + 4; x++) {
        if (!CLOUD.has(px(m, x, y))) continue;
        n++;
        if (x < xs[0] || x > xs[xs.length - 1]) wide++;
      }
      return [n, wide];
    };
    const [a] = foam(old), [b, wide] = foam(sp);
    expect(b).toBeGreaterThan(a + 15);
    expect(wide).toBeGreaterThan(3);
  });

  it('a billow has no straight bottom: round lobes hanging under it, its belly rising toward the ends', () => {
    const W = 120, H = 80, tones: Tones4 = ['nube', 'nube media', 'nube panza', 'nube honda'];
    /** The lowest row of the mass in each column it covers. */
    const profile = (belly: boolean, seed: number) => {
      const g = new Layer(W, H), mask = new Uint8Array(W * H);
      cumulus(W, H, 60, 40, 16, seed, tones, belly ? bellyPut(60, 40, 16, seed, tones, mask, g) : (x, y, c) => g.set(x, y, c));
      const out: number[] = [];
      for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (g.get(x, y)) { out.push(y); break; }
      return out;
    };
    const lobes = (p: number[]) => {   // the lowest points of the lobes: a row lower than both neighbours (past a level stretch)
      let n = 0;
      for (let i = 1; i < p.length - 1; i++) {
        let j = i + 1;
        while (j < p.length - 1 && p[j] === p[i]) j++;
        if (p[i] > p[i - 1] && p[i] > p[j]) n++;
      }
      return n;
    };
    for (const seed of [5, 17, 29, 41]) {
      const a = profile(false, seed), b = profile(true, seed);
      const deep = Math.max(...b), ends = Math.min(b[0], b[b.length - 1]);
      // (the cut of a plain cumulus runs at one depth with a step or two: a ruler; the lobes go up and down)
      expect(Math.max(...b) - Math.min(...b)).toBeGreaterThan(Math.max(...a) - Math.min(...a));
      expect(lobes(b)).toBeGreaterThanOrEqual(2);
      expect(deep - ends).toBeGreaterThanOrEqual(5);
      expect(b.length).toBeGreaterThan(30);   // (still a mass of its size, not a sliver)
    }
  });

  it('spume needs billows: without them the step paints as before', () => {
    const a = paint({ ...LONG, billows: undefined }), b = paint({ ...LONG, billows: undefined, spume: [16, 16] });
    expect(b.layers.ground.px).toEqual(a.layers.ground.px);
  });
});
