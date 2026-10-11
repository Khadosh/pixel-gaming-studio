// @vitest-environment node
// The tries of a scatter draw from a hash of their step and their number, not from a stream every try before them
// consumed (pixel-gaming-studio, The Unwritten Dao #266): a path moved in one corner does not move a blade, a flower
// or a dew drop in the other.
import { describe, it, expect } from 'vitest';
import { paintMap, trialHash, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const EARTH = ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'arena'];
const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];

function game(): MapGame {
  return { width: 30, height: 18, grid: Array.from({ length: 18 }, () => '.'.repeat(30)), decor: [] };
}

/** A meadow with a path in its west corner (moved `dv` cells) and every scatter that seeds small things. */
function recipe(dv: number, extra: Partial<MapRecipe> = {}): MapRecipe {
  return {
    game: game(), margin: [2, 1], light: [1, 1], scatter_salt: 341,
    materials: {
      grass: { ramp: GRASS, texture: 'patches', base: 4 },
      earth: { ramp: EARTH, base: 2 },
      stone: { ramp: STONE, texture: 'grain' },
    },
    steps: [
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'path', id: 'p', material: 'earth', points: [[0, 4 + dv], [4, 4.5 + dv], [8, 4 + dv]], width: [6, 0], tufts: 0, ruts: [0, 0] },
      { step: 'scatter', what: 'tufts', layer: 'tips', odds: [0.85, 0.22], far_spacing: 12 },
      { step: 'scatter', what: 'flowers', count: 300, near: [] },
      { step: 'scatter', what: 'pebbles', more_in: 'p', count: 900, on: ['grass'], material: 'stone' },
      { step: 'scatter', what: 'leaves', count: 900, on: ['grass', 'earth'], at: [[6, 6, 60], [24, 10, 60]] },
      { step: 'scatter', what: 'dashes', count: 1500, on: ['earth', 'grass'] },
      { step: 'sprigs', layer: 'tips', on: ['grass'], over: GRASS, tries: 800, spacing: 6, shapes: [['h', 'l']] },
      { step: 'motes', layer: 'motes', on: ['grass'], over: GRASS, tries: 600, clear: [4, 3], colors: ['oro claro'] },
      { step: 'scatter', what: 'dew', layer: 'dew', over: ['pasto', 'bambú claro', 'hoja clara'], alone: false, reach: 40 },
    ],
    ...extra,
  };
}

/**
 * The px that differ in any layer more than `r` px away from where the kind of ground changed. Two cells: a tuft
 * that a tuft by the path kept out (spacing) may land now, and the one it would have kept out may not.
 */
function farChanges(a: PaintedMap, b: PaintedMap, r = 32): { far: number; changedKind: number } {
  const W = a.width, H = a.height;
  const near = new Uint8Array(W * H);
  let changedKind = 0;
  for (let i = 0; i < W * H; i++) {
    if (a.kind[i] === b.kind[i]) continue;
    changedKind++;
    const x = i % W, y = Math.floor(i / W);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H) near[Y * W + X] = 1;
    }
  }
  let far = 0;
  const names = new Set([...Object.keys(a.layers), ...Object.keys(b.layers)]);
  for (let i = 0; i < W * H; i++) {
    if (near[i]) continue;
    if ([...names].some(n => (a.layers[n]?.px[i] ?? null) !== (b.layers[n]?.px[i] ?? null))) far++;
  }
  return { far, changedKind };
}

describe('scatter: a local change stays local', () => {
  it('a path moved one cell changes nothing far from it; the old shared stream re-draws the whole map', () => {
    const a = paintMap(recipe(0), game()), b = paintMap(recipe(1), game());
    const { far, changedKind } = farChanges(a, b);
    expect(changedKind).toBeGreaterThan(500);
    expect(far).toBe(0);
    // with the stream of before (scatter_draws: "stream") the same move moves things all over the meadow
    const old = farChanges(paintMap(recipe(0, { scatter_draws: 'stream' }), game()), paintMap(recipe(1, { scatter_draws: 'stream' }), game()));
    expect(old.far).toBeGreaterThan(200);
  });

  it('a step added before another one does not re-draw it, and two scatters of the same kind draw differently', () => {
    const plain = paintMap(recipe(0), game());
    const r = recipe(0);
    r.steps.splice(2, 0, { step: 'scatter', what: 'dashes', id: 'hojas del sendero', count: 500, on: ['earth'] });
    const more = paintMap(r, game());
    expect(more.layers.dew.px).toEqual(plain.layers.dew.px);
    expect(more.layers.motes.px).toEqual(plain.layers.motes.px);
    // the scatter salt still changes everything, and draws are spread evenly
    const salted = paintMap(recipe(0, { scatter_salt: 7 }), game());
    expect(salted.layers.tips.px.filter((c, i) => c !== plain.layers.tips.px[i]).length).toBeGreaterThan(500);
    const bins = new Array(10).fill(0);
    for (let n = 0; n < 20000; n++) bins[Math.floor(trialHash(5, n, 1) * 10)]++;
    for (const c of bins) expect(Math.abs(c - 2000)).toBeLessThan(200);
  });
});
