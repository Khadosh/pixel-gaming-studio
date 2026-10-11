// @vitest-environment node
// umbra.along.stands (11 October, the island of the game, #279): the lanterns, banners and the stone lion of the
// gate stand in light grass because a stamp has no material for `of` to hug. Its lowest px count as an edge: the
// band pools at its foot, never up its sides (a halo), and never over the thing itself.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';

const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const MATS: MapRecipe['materials'] = { pasto: { ramp: GRASS, base: 2, texture: 'flat' } };
const game: MapGame = { width: 10, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(10)), decor: [] };
// a post two px wide and 24 tall: x 58..59, y 57..80 (its foot is row 80)
const post: MapStep = { step: 'scatter', id: 'poste', what: 'stamp', at: [[3.625, 3.5625]], rows: Array(24).fill('PP'), glyphs: { P: 'piedra clara' }, stands: true } as unknown as MapStep;
const umbra = (along: object[]): MapStep => ({ step: 'umbra', on: ['pasto'], along } as unknown as MapStep);
const paint = (extra: MapStep[], light?: MapRecipe['light']): PaintedMap =>
  paintMap({ game, materials: MATS, steps: [{ step: 'area', material: 'pasto', shape: 'all' }, post, ...extra], ...(light ? { light } : {}) }, game);
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];

describe('umbra.along with stands: a pool at the foot of what stands', () => {
  it('darkens the grass around the foot and leaves the sides of the post and the post itself alone', () => {
    const before = paint([]), after = paint([umbra([{ of: [], px: [3, 3], salt: 7, stands: 2 }])]);
    for (const [x, y] of [[57, 80], [60, 80], [58, 81], [59, 83], [56, 79]]) expect(at(after, x, y)).toBe('prado sombra');
    // up the sides (more than px[1] above the foot rows) and far away: as before
    for (const [x, y] of [[57, 60], [60, 70], [57, 73], [70, 80]]) expect(at(after, x, y)).toBe(at(before, x, y));
    for (let y = 57; y <= 80; y++) for (const x of [58, 59]) expect(at(after, x, y)).toBe('piedra clara');
  });

  it('without stands a stamp is not an edge: nothing changes', () => {
    const before = paint([]), after = paint([umbra([{ of: [], px: [3, 3], salt: 7 }])]);
    for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) expect(at(after, x, y)).toBe(at(before, x, y));
  });

  it('under the sun the pool and the shadow of the post never go twice over', () => {
    const SUN: MapRecipe['light'] = { dir: [0.5, 1], length: 0.25, tone: 1, on: ['pasto'] };
    const after = paint([umbra([{ of: [], px: [4, 4], salt: 7, stands: 2 }])], SUN);
    expect(at(after, 56, 80)).toBe('prado sombra');
    for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) expect(at(after, x, y)).not.toBe('prado hondo');
  });
});
