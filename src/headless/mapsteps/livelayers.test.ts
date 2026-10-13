// @vitest-environment node
// The live layers of a recipe (the flow of a fall, the glints of water: what the export hands the game to animate) are
// cut away where a later step painted over what laid them: a building in front of a fall, a bridge over a stream.
// Without a later step, or without a live layer in the export, the same px as before.
import { describe, it, expect } from 'vitest';
import { paintMap, liveLayers } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const WATER = ['agua de hielo honda', 'agua de hielo', 'agua de hielo luz', 'nube', 'ojo'];
const MATS: MapRecipe['materials'] = {
  muro: { ramp: ['basalto hondo', 'basalto sombra', 'basalto', 'basalto claro'] },
  agua: { ramp: WATER },
  revoque: { ramp: ['madera sombra', 'bermellón', 'bermellón', 'bermellón claro'] },
  vigas: { ramp: ['tinta', 'madera sombra', 'madera', 'madera clara'] },
};
const game: MapGame = { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)), decor: [] };
const WALL: MapStepOf<'area'> = { step: 'area', material: 'muro', shape: 'all' };
const FALL: MapStepOf<'spill'> = { step: 'spill', material: 'agua', at: [6, 1], length: 120, width: [14, 18], flow: 'cascada', salt: 1491 };
// a house in front of the lower half of the fall
const HOUSE: MapStepOf<'building'> = { step: 'building', rect: [4, 5, 4, 3], wall: 30, material: 'revoque', frame: 'vigas' };
const EXPORT: MapRecipe['export'] = { id: 'x', layers: { ground: '', cascada: '_cascada' },
  ground: { painting: 'suelos/x', vivo: [{ mov: 'fluye', capa: 'suelos/x_cascada' }] } };
const recipe = (steps: MapRecipe['steps'], ex = true): MapRecipe => ({ game, materials: MATS, steps, ...(ex ? { export: EXPORT } : {}) });
const flowAt = (m: ReturnType<typeof paintMap>, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m.layers.cascada?.px[y * m.width + x] != null) n++;
  return n;
};

describe('live layers cut where a later step painted', () => {
  it('the export names its live layers', () => {
    expect([...liveLayers(recipe([]))]).toEqual(['cascada']);
    expect(liveLayers(recipe([], false)).size).toBe(0);
  });

  it('a flow layer under a later building is cut away there; above the house it stays', () => {
    const open = paintMap(recipe([WALL, FALL]), game), hidden = paintMap(recipe([WALL, FALL, HOUSE]), game);
    // the house covers px 64..128 across and from its ridge (row 80) down to its foot (row 128)
    expect(flowAt(open, 70, 95, 120, 125)).toBeGreaterThan(20);
    let under = 0;
    for (let y = 95; y < 125; y++) for (let x = 70; x < 120; x++) {
      const k = y * hidden.width + x;
      if (hidden.layers.cascada.px[k] !== null && hidden.layers.ground.px[k] !== open.layers.ground.px[k]) under++;
    }
    expect(under).toBe(0);
    expect(flowAt(hidden, 70, 95, 120, 125)).toBeLessThan(flowAt(open, 70, 95, 120, 125) / 2);
    expect(flowAt(hidden, 70, 30, 120, 70)).toBe(flowAt(open, 70, 30, 120, 70));
  });

  it('without a later step, or without a live layer in the export, the px of before', () => {
    const a = paintMap(recipe([WALL, FALL]), game), b = paintMap(recipe([WALL, FALL], false), game);
    expect(a.layers.cascada.px).toEqual(b.layers.cascada.px);
    const c = paintMap(recipe([WALL, FALL, HOUSE], false), game);
    expect(flowAt(c, 70, 95, 120, 125)).toBe(flowAt(b, 70, 95, 120, 125));
  });

  it('a step that only re-tones (light, shadows) does not cut it', () => {
    const lit = paintMap(recipe([WALL, FALL, { step: 'shadows', on: ['muro', 'agua'] }]), game), plain = paintMap(recipe([WALL, FALL]), game);
    expect(lit.layers.cascada.px).toEqual(plain.layers.cascada.px);
  });
});
