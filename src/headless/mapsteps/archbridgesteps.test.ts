// @vitest-environment node
// The archbridge: a stone bridge that crosses a stream from west to east, seen from the front. Its deck of flagstones
// between two parapets, its south face in courses, and in the face an arch: the water painted before still shows
// through it, darker under the curve; a ring of voussoirs around it; the same salt, the same pixels.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const STONE = ['tinta', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla'];
const WATER = ['agua de hielo honda', 'agua de hielo', 'agua de hielo luz', 'nube', 'ojo'];
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: ['nieve sombra', 'nieve', 'túnica luz'] },
  agua: { ramp: WATER },
  losas: { ramp: STONE },
};
const game: MapGame = { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)), decor: [] };
const SNOW: MapStepOf<'area'> = { step: 'area', material: 'nieve', shape: 'all' };
// a stream down the middle, px 88..104
const STREAM: MapStepOf<'area'> = { step: 'area', material: 'agua', shape: { rect: [5.5, 0, 1, 12] } };
// the deck from px 64 to 128 across, rows 64..79; the face 16 px under it (80..95); the arch at the middle, 7 px half
const BRIDGE: MapStepOf<'archbridge'> = { step: 'archbridge', material: 'losas', x: [4, 8], y: [4, 5], face: 16, arches: [{ u: 6, half: 7 }], salt: 1581 };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];

describe('map archbridge', () => {
  const m = paintMap(recipe([SNOW, STREAM, BRIDGE]), game);

  it('the deck covers the stream, in stone', () => {
    for (let y = 64; y < 80; y++) expect(STONE).toContain(at(m, 96, y));
    expect(STONE).toContain(at(m, 70, 70));
    expect(at(m, 60, 70)).toBe('nieve');                         // past its west end, the snow
  });

  it('the south face in stone beside the arch; through the arch, the water, darker under the curve', () => {
    expect(STONE).toContain(at(m, 70, 90));
    expect(STONE).toContain(at(m, 120, 90));
    expect(WATER).toContain(at(m, 96, 94));                     // the foot of the arch: the water as it was
    expect(at(m, 96, 94)).toBe(paintMap(recipe([SNOW, STREAM]), game).layers.ground.px[94 * m.width + 96]);
    const vault = [...Array(6).keys()].map(d => at(m, 96, 81 + d)).filter(c => WATER.includes(c ?? ''));
    expect(vault.some(c => c === 'agua de hielo honda')).toBe(true);
  });

  it('a ring of voussoirs around the arch, lit on the west', () => {
    const ring = [86, 87, 88].map(x => at(m, x, 92));
    expect(ring.some(c => c === 'basalto luz' || c === 'niebla')).toBe(true);
  });

  it('deterministic, and laid by a place it moves', () => {
    expect(paintMap(recipe([SNOW, STREAM, BRIDGE]), game).layers.ground.px).toEqual(m.layers.ground.px);
    const moved = moveStep(BRIDGE, 2, 1) as MapStepOf<'archbridge'>;
    expect(moved.x).toEqual([6, 10]);
    expect(moved.y).toEqual([5, 6]);
    expect(moved.arches).toEqual([{ u: 8, half: 7 }]);
  });
});
