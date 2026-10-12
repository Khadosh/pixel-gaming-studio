// @vitest-environment node
// The causeway: a stone bridge from south to north over water, seen from above. Piers stick out of both sides of the
// deck into the water at even steps (stone, ink around, a south face under the top); between them the dark of the
// arch, by the deck, reaching farther on the side away from the light; the deck and the banks are left alone.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const STONE = ['basalto hondo', 'basalto sombra', 'basalto claro', 'niebla', 'nube'];
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: ['nieve sombra', 'nieve'] }, agua: { ramp: ['celeste', 'celeste', 'celeste', 'celeste'] }, losas: { ramp: STONE },
};
const game: MapGame = { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)), decor: [] };
const steps: MapRecipe['steps'] = [
  { step: 'area', material: 'nieve', shape: 'all' },
  { step: 'area', material: 'agua', shape: { rect: [0, 2, 12, 8] } },
  { step: 'area', material: 'losas', shape: { rect: [5, 0, 2, 12] } },
];
const CW: MapStepOf<'causeway'> = { step: 'causeway', material: 'losas', x: [5, 7], y: [2, 10], on: ['agua'], every: 22, pier: [8, 9], rise: 3,
  arch: [4, 8], shade: ['monte sombra', 'celeste oscuro'] };
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];

describe('map causeway', () => {
  const before = paintMap({ game, materials: MATS, steps }, game);
  const m = paintMap({ game, materials: MATS, steps: [...steps, CW] }, game);

  it('piers of stone stick out of both sides of the deck into the water, and only there', () => {
    const stone = (x: number, y: number) => STONE.includes(at(m, x, y) ?? '') && m.kind[y * m.width + x] === 'losas';
    let west = 0, east = 0;
    for (let y = 32; y < 160; y++) { if (stone(78, y)) west++; if (stone(113, y)) east++; }
    expect(west).toBeGreaterThan(10);
    expect(east).toBeGreaterThan(10);
    // the deck and the snow banks as they were
    for (let y = 0; y < 192; y += 3) for (const x of [82, 100, 30]) {
      if (y < 32 || y >= 160 || (x >= 80 && x < 112)) expect(at(m, x, y)).toBe(at(before, x, y));
    }
  });

  it('the dark of the arches by the deck, reaching farther on the east', () => {
    const dark = (x: number, y: number) => ['monte sombra', 'celeste oscuro'].includes(at(m, x, y) ?? '');
    const reach = (side: -1 | 1) => { let best = 0; for (let y = 32; y < 160; y++) { let i = 1; while (dark(side < 0 ? 80 - i : 111 + i, y)) i++; best = Math.max(best, i - 1); } return best; };
    expect(reach(-1)).toBeGreaterThanOrEqual(3);
    expect(reach(1)).toBeGreaterThan(reach(-1));
  });

  it('the same pixels from the same step', () => {
    const again = paintMap({ game, materials: MATS, steps: [...steps, CW] }, game);
    expect(again.layers.ground.px).toEqual(m.layers.ground.px);
  });
});
