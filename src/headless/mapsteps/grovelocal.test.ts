// @vitest-environment node
// The trees and bushes of a zone of a grove draw their shape from their own try, not from how many were planted
// before them (pixel-gaming-studio, The Unwritten Dao #290): a path moved in one corner does not re-draw the bushes
// of the other corner. (The trees of the list keep the salt of their index: the list is a drawing, and a place moved
// with `at` has to keep its trees.)
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const EARTH = ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'arena'];

function game(): MapGame {
  return { width: 24, height: 14, grid: Array.from({ length: 14 }, () => '.'.repeat(24)) };
}

const LIST: NonNullable<MapStepOf<'grove'>['trees']> = [
  [3.5, 11.5, 'bush', 0.8], [5, 12, 'round'], [9, 12.5, 'bush'], [13.5, 11.8, 'pine'], [17, 12.2, 'bush'], [20.5, 11.6, 'bush', 0.9],
];

/** A meadow with a path in its west corner (moved `dv` cells), a grove of trees and bushes all over it and a list. */
function recipe(dv: number, extra: Partial<MapRecipe> = {}): MapRecipe {
  const grove: MapStepOf<'grove'> = {
    step: 'grove', id: 'g', avoid: ['sendero'], on: ['pasto'], trees: LIST,
    zones: [
      // neither zone reaches its count: what ends a zone is room, not a number (see the test below)
      { within: 'prado', band: [2, 400], count: 400, spacing: 22, size: [1.6, 2.4], salt: 81 },
      { within: 'prado', band: [2, 400], count: 1200, spacing: 9, size: [0.6, 1], salt: 82, kinds: { bush: 1, round: 0, pine: 0, plum: 0 } },
    ],
  };
  return {
    game: game(), margin: [2, 1], light: [1, 1],
    materials: { pasto: { ramp: GRASS, base: 4 }, tierra: { ramp: EARTH, base: 2 } },
    steps: [
      { step: 'area', id: 'prado', material: 'pasto', shape: 'all' },
      { step: 'area', id: 'sendero', material: 'tierra', shape: { rect: [-2, 3 + dv, 7, 1.2] } },
      grove,
    ],
    ...extra,
  };
}

/**
 * The px that differ in any layer more than `r` px from where the ground changed (a crown or trunk is no ground).
 * Four cells: a tree standing two cells off the path may change, and its crown and shadow reach two more.
 */
function farChanges(a: PaintedMap, b: PaintedMap, r = 64): { far: number; changedKind: number } {
  const W = a.width, H = a.height, near = new Uint8Array(W * H);
  let changedKind = 0;
  for (let i = 0; i < W * H; i++) {
    if (a.kind[i] === b.kind[i] || !a.kind[i] || !b.kind[i]) continue;
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

describe('grove: a local change stays local', () => {
  it('a path moved one cell re-draws no bush nor tree far from it; by the count of before it re-draws them all', () => {
    const a = paintMap(recipe(0), game()), b = paintMap(recipe(1), game());
    expect(a.planted!.g.bush).toBeGreaterThan(150);
    expect(a.planted!.g.bush).toBeLessThan(1200);       // no zone reaches its count
    expect(a.planted!.g.round + a.planted!.g.pine).toBeGreaterThan(20);
    const { far, changedKind } = farChanges(a, b);
    expect(changedKind).toBeGreaterThan(500);
    expect(far).toBe(0);
    // with the draws of before (scatter_draws: "stream") a bush less by the path re-draws every bush after it
    const old = farChanges(paintMap(recipe(0, { scatter_draws: 'stream' }), game()), paintMap(recipe(1, { scatter_draws: 'stream' }), game()));
    expect(old.far).toBeGreaterThan(1000);
  });
});
