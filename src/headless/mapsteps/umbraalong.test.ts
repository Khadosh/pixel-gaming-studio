// @vitest-environment node
// umbra.along (11 October, the island of the game, #272): «junto a piedra y a lo construido la referencia es oscura
// en el 84 % y la nuestra en el 43 %». The grass at the foot of a wall or a stone floor goes a tone darker in a frayed
// band that hugs it on every side, whatever the sun; nothing else changes, and a place moves its box.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';
import { moveStep } from '../mapplace';

const STONE = ['tinta', 'túnica noche', 'piedra sombra', 'piedra', 'piedra clara'];
const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const MATS: MapRecipe['materials'] = { pasto: { ramp: GRASS, base: 2, texture: 'flat' }, piedra: { ramp: STONE, base: 3, texture: 'flat' } };
const game: MapGame = { width: 10, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(10)), decor: [] };
const BASE: MapStep[] = [
  { step: 'area', material: 'pasto', shape: 'all' },
  { step: 'area', material: 'piedra', shape: { rect: [4, 3, 2, 2] } },   // x 64..95, y 48..79
];
const paint = (extra: MapStep[], light?: MapRecipe['light']): PaintedMap =>
  paintMap({ game, materials: MATS, steps: [...BASE, ...extra], ...(light ? { light } : {}) }, game);
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
const changed = (a: PaintedMap, b: PaintedMap) => {
  const out: [number, number][] = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (at(a, x, y) !== at(b, x, y)) out.push([x, y]);
  return out;
};
const umbra = (along: object[]): MapStep => ({ step: 'umbra', on: ['pasto'], along } as unknown as MapStep);

describe('umbra.along: the grass at the foot of what is built', () => {
  it('darkens only grass within px[1] of the stone, on every side, and touches neither the stone nor far grass', () => {
    const before = paint([]), after = paint([umbra([{ of: ['piedra'], px: [2, 4], salt: 7 }])]);
    const ch = changed(before, after);
    expect(ch.length).toBeGreaterThan(0);
    for (const [x, y] of ch) {
      expect(after.kind[y * after.width + x]).toBe('pasto');
      const dx = x < 64 ? 64 - x : x > 95 ? x - 95 : 0, dy = y < 48 ? 48 - y : y > 79 ? y - 79 : 0;
      expect(dx + dy).toBeLessThanOrEqual(4);
      expect(at(after, x, y)).toBe('prado sombra');   // a step down from the base
    }
    // the first px out of each side is in it (min 2): north, south, west and east
    for (const [x, y] of [[80, 47], [80, 80], [63, 64], [96, 64]]) expect(at(after, x, y)).toBe('prado sombra');
    expect(at(after, 80, 40)).toBe(at(before, 80, 40));
  });

  it('with a min of 0 it breaks into stretches: some px next to the stone stay as they were', () => {
    const before = paint([]), after = paint([umbra([{ of: ['piedra'], px: [0, 3], period: 5, salt: 3 }])]);
    let kept = 0, dark = 0;
    for (let x = 64; x <= 95; x++) for (const y of [47, 80]) (at(after, x, y) === at(before, x, y) ? kept++ : dark++);
    expect(kept).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
  });

  it('a box keeps it inside, and a place moves the box with the place', () => {
    const after = paint([umbra([{ of: ['piedra'], px: [3, 3], salt: 7, box: [0, 0, 5, 8] }])]);
    expect(at(after, 63, 64)).toBe('prado sombra');
    expect(at(after, 96, 64)).toBe('prado');
    const st = moveStep(umbra([{ of: ['piedra'], px: [1, 2], salt: 1, box: [0, 0, 3, 2] }]), 2, 1) as unknown as { along: { box: number[] }[] };
    expect(st.along[0].box).toEqual([2, 1, 5, 3]);
  });

  it('with a sun it goes into the shadow of the sun: one tone, never twice over a shadow', () => {
    const SUN: MapRecipe['light'] = { dir: [0.5, 1], length: 0.25, tone: 1, on: ['pasto'] };
    const after = paint([umbra([{ of: ['piedra'], px: [3, 3], salt: 7 }])], SUN);
    expect(at(after, 63, 64)).toBe('prado sombra');
    expect(at(after, 80, 47)).toBe('prado sombra');
  });
});

describe('umbra.along under the sun: never twice over', () => {
  const SUN: MapRecipe['light'] = { dir: [0.5, 1], length: 0.25, tone: 1, on: ['pasto'] };
  it('a band px a shadow falls on later ends at the shadow tone, not one more', () => {
    // a tall stamp that stands throws its shadow south-east over the band of the stone
    const post: MapStep = { step: 'scatter', id: 'poste', what: 'stamp', at: [[3.625, 3.5625]], rows: Array(24).fill('PP'), glyphs: { P: 'piedra clara' }, kind: 'piedra', stands: true } as unknown as MapStep;
    const band = umbra([{ of: ['piedra'], px: [6, 6], salt: 7 }]);
    const shadowOnly = paint([post], SUN), bandOnly = paint([band], SUN), both = paint([band, post], SUN);
    let shared = 0;
    for (let y = 0; y < both.height; y++) for (let x = 0; x < both.width; x++) {
      const a = at(shadowOnly, x, y);
      if (a === 'prado sombra' && at(both, x, y) !== a) throw new Error(`twice at ${x},${y}: ${at(both, x, y)}`);
      if (a === 'prado sombra' && at(bandOnly, x, y) === 'prado sombra') shared++;
    }
    expect(shared).toBeGreaterThan(0);
  });
});
