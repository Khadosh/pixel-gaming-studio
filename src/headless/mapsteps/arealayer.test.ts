// @vitest-environment node
// An area with a `layer` paints its texture in that layer, whatever the texture.
// Only tiles, canopy and rubble used to: flat, patches, mottled, slabs,
// flagstones, paving and planks wrote on the ground and left the layer empty
// (Khadosh/pixel-gaming-studio#49, found in the isometric recipe of Khadosh/estudio#238).
import { describe, it, expect } from 'vitest';
import { paintMap } from '../mappaint';
import { recipeSchema } from '../maprecipe';

const RAMP = ['#101018', '#1c1830', '#3a3050', '#5a6a90', '#7080a8', '#8ea0c8', '#b0c0e0', '#e0e8f8'];
const TEXTURES = ['flat', 'patches', 'mottled', 'slabs', 'flagstones', 'paving', 'planks', 'tiles', 'canopy', 'rubble'] as const;

/** A 6×4 map: the ground is one flat color and the area, on top of it, goes to the layer `frente`. */
function painted(texture: string, extra: Record<string, unknown> = {}) {
  const recipe = recipeSchema.parse({
    game: { width: 6, height: 4, grid: Array.from({ length: 4 }, () => '......') },
    light: [1, 1],
    materials: { suelo: { ramp: ['#204020'], texture: 'flat' }, cosa: { ramp: RAMP, texture } },
    steps: [
      { step: 'area', id: 'suelo', material: 'suelo', shape: 'all' },
      { step: 'area', id: 'cosa', material: 'cosa', shape: { rect: [1, 1, 3, 2] }, layer: 'frente', ...extra },
    ],
  });
  return paintMap(recipe, recipe.game as never, {});
}

describe('an area with a layer', () => {
  for (const texture of TEXTURES) {
    it(`paints ${texture} in its layer and leaves the ground as it was`, () => {
      const m = painted(texture);
      expect(m.layers.frente.used().length).toBeGreaterThan(0);
      expect(m.layers.ground.used()).toEqual(['#204020']);
    });
  }

  it('a raised built area (face) shades its face in the layer it painted', () => {
    const m = painted('planks', { face: 4 });
    expect(m.layers.frente.used().length).toBeGreaterThan(1);
    expect(m.layers.ground.used()).toEqual(['#204020']);
  });

  it('with no layer it still paints the ground', () => {
    const recipe = recipeSchema.parse({
      game: { width: 2, height: 2, grid: ['..', '..'] },
      materials: { cosa: { ramp: RAMP, texture: 'flat', base: 3 } },
      steps: [{ step: 'area', id: 'cosa', material: 'cosa', shape: 'all' }],
    });
    const m = paintMap(recipe, recipe.game as never, {});
    expect(m.layers.ground.used()).toEqual([RAMP[3]]);
  });
});
