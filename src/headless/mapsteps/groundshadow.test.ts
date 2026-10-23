// @vitest-environment node
// The shadows of the light step fall on the ground (#46, el-patio DIARIO_PASADA_2 P2-8): the crown's `casts` cut the
// trunk of the tree in two when the trunk was laid before the light step, so the order of the steps was the only way
// out. A stamp that stands does not take them, before or after.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';

const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const BARK = ['corteza honda', 'corteza', 'corteza clara'];
const MATS: MapRecipe['materials'] = { pasto: { ramp: GRASS, base: 2, texture: 'flat' }, tronco: { ramp: BARK, base: 1, texture: 'flat' } };
const game: MapGame = { width: 10, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(10)), decor: [] };
// a trunk four px wide and 24 tall, x 58..61, y 57..80, in colors of a material the recipe paints (so a shadow would shade them)
const trunk = (stands: boolean): MapStep => ({ step: 'scatter', id: 'tronco', what: 'stamp', at: [[3.625, 3.5625]], rows: Array(24).fill('TTTT'), glyphs: { T: 'corteza' }, ...(stands ? { stands: true } : {}) } as unknown as MapStep);
const bark: MapStep = { step: 'area', material: 'tronco', shape: { rect: [9, 7, 1, 1] } } as unknown as MapStep;
// the crown's shadow, an oval right over the trunk
const light: MapStep = { step: 'light', casts: [[3.75, 4.5, 20, 12, 5]] } as unknown as MapStep;
const paint = (steps: MapStep[]): PaintedMap => paintMap({ game, materials: MATS, light: [1, 1], steps: [{ step: 'area', material: 'pasto', shape: 'all' }, bark, ...steps] }, game);
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];

describe('the light step casts on the ground, not on what stands', () => {
  it('a trunk that stands keeps its colors under the crown shadow, laid before the light or after', () => {
    const before = paint([trunk(true), light]), after = paint([light, trunk(true)]);
    for (let y = 57; y <= 80; y++) for (let x = 58; x <= 61; x++) expect(at(before, x, y)).toBe('corteza');
    expect(before.layers.ground.px).toEqual(after.layers.ground.px);
    // and the grass around it does take the shadow
    expect(at(before, 50, 72)).toBe('prado sombra');
  });

  it('a stamp that does not stand lies on the ground and takes it, as always', () => {
    const flat = paint([trunk(false), light]);
    expect(at(flat, 59, 72)).toBe('corteza honda');
  });
});
