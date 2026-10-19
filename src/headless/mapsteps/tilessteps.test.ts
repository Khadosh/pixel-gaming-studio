// @vitest-environment node
// The tiles texture: a grid of tiles with its joint, one tone per tile from the
// palette, a lit edge and the wear. Born from the patio of the second game made
// with PGS, which had to dress the planks of a tea house up as tiles (el-patio
// DIARIO.md, Mapa 3).
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { recipeSchema, type MapRecipe } from '../maprecipe';
import { tileAt } from './tiles';

const RAMP = ['noche', 'junta', 'oscuro', 'medio', 'claro', 'brillo'];
type Tiles = NonNullable<Extract<MapRecipe['steps'][number], { step: 'area' }>['tiles']>;

/** A 6×4 map (16 px cells), all of it tiles, the light from the upper left. */
function tiled(tiles: Tiles, extra: MapRecipe['steps'] = [], light: MapRecipe['light'] = [1, 1]): PaintedMap {
  const recipe = recipeSchema.parse({
    game: { width: 6, height: 4, grid: Array.from({ length: 4 }, () => '......') },
    light,
    materials: { piso: { ramp: RAMP, texture: 'tiles' } },
    steps: [{ step: 'area', id: 'piso', material: 'piso', shape: 'all', tiles }, ...extra],
  });
  return paintMap(recipe, recipe.game as never, {});
}
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];

describe('tiles texture', () => {
  it('lays a grid: the joint on the right and bottom of every tile, a body of one tone inside', () => {
    const m = tiled({ size: [8, 6], lip: 0, tones: ['medio', 'claro'] });
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const joint = x % 8 === 7 || y % 6 === 5;
      if (joint) expect(at(m, x, y)).toBe('junta');  // two under the base (medio)
      else {
        expect(['medio', 'claro']).toContain(at(m, x, y));
        // the whole body of a tile is the tone of its top-left px
        expect(at(m, x, y)).toBe(at(m, x - (x % 8), y - (y % 6)));
      }
    }
    // and the tones do vary from tile to tile
    const tones = new Set<string | null>();
    for (let j = 0; j < 10; j++) for (let i = 0; i < 12; i++) tones.add(at(m, i * 8, j * 6));
    expect(tones).toEqual(new Set(['medio', 'claro']));
  });

  it('draws every color from the ramp when it is not told otherwise (within the palette)', () => {
    const m = tiled({ wear: 0.5 });
    for (const c of m.layers.ground.used()) expect(RAMP).toContain(c);
    expect(m.layers.ground.used().length).toBeGreaterThanOrEqual(4);
  });

  it('lights the edges that face the light, and lip 0 takes it off', () => {
    const lit = tiled({ size: [8, 8], tones: ['medio'] });
    expect(at(lit, 8, 3)).toBe('claro');   // left column of a tile
    expect(at(lit, 11, 0)).toBe('claro');  // top row
    expect(at(lit, 11, 3)).toBe('medio');  // the body
    expect(at(lit, 14, 3)).toBe('medio');  // the side away from the light is not lit
    // a light from the lower right lights the other two sides
    const other = tiled({ size: [8, 8], tones: ['medio'] }, [], [-1, -1]);
    expect(at(other, 14, 3)).toBe('claro');
    expect(at(other, 11, 6)).toBe('claro');
    expect(at(other, 8, 3)).toBe('medio');
    const flat = tiled({ size: [8, 8], tones: ['medio'], lip: 0 });
    expect(at(flat, 8, 3)).toBe('medio');
  });

  it('anchors the grid to a cell: two areas with the same `at` share the joints and the tone of each tile', () => {
    const steps: MapRecipe['steps'] = [
      { step: 'area', id: 'luz', material: 'piso', shape: { rect: [1.3, 1.2, 2, 1.5] }, tiles: { size: [12, 11], at: [0, 0], lip: 0 } },
    ];
    const both = tiled({ size: [12, 11], at: [0, 0], lip: 0 }, steps);
    const alone = tiled({ size: [12, 11], at: [0, 0], lip: 0 });
    // the second area repaints its rect with the very same pixels: same grid, same tile tones
    expect(both.layers.ground.px).toEqual(alone.layers.ground.px);
    // without `at` the grid starts at the corner of the area, off the floor's grid
    const loose = tiled({ size: [12, 11], at: [0, 0], lip: 0 }, [{ ...steps[0], tiles: { size: [12, 11], lip: 0 } } as MapRecipe['steps'][number]]);
    expect(loose.layers.ground.px).not.toEqual(alone.layers.ground.px);
  });

  it('staggers the rows into a running bond of bricks', () => {
    const m = tiled({ size: [8, 4], stagger: 0.5, lip: 0, tones: ['medio'] });
    expect(at(m, 7, 1)).toBe('junta');   // row 0: joints at 7, 15…
    expect(at(m, 3, 1)).toBe('medio');
    expect(at(m, 3, 5)).toBe('junta');   // row 1 shifted half a brick: joints at 3, 11…
    expect(at(m, 11, 5)).toBe('junta');
    expect(at(m, 7, 5)).toBe('medio');
    expect(tileAt(11, 5, 0, 0, 8, 4, 0.5)).toEqual([0, 1, 7, 1]);
  });

  it('wears some tiles: a chipped corner in the joint color or a crack a tone down; none without wear, the same every time', () => {
    const clean = tiled({ size: [12, 12], lip: 0, tones: ['medio'] });
    const worn = tiled({ size: [12, 12], lip: 0, tones: ['medio'], wear: 1 });
    const body = (m: PaintedMap, c: string) => {
      let n = 0;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (x % 12 < 11 && y % 12 < 11 && at(m, x, y) === c) n++;
      return n;
    };
    expect(body(clean, 'junta') + body(clean, 'oscuro')).toBe(0);
    const chips = body(worn, 'junta'), cracks = body(worn, 'oscuro');
    expect(chips).toBeGreaterThan(0);
    expect(cracks).toBeGreaterThan(0);
    // a crack crosses at least half a tile, a chip is a corner: neither is a lone speck
    expect(cracks / (8 * 6)).toBeGreaterThan(2);
    expect(tiled({ size: [12, 12], lip: 0, tones: ['medio'], wear: 1 }).layers.ground.px).toEqual(worn.layers.ground.px);
  });

  it('is a texture a material can name and an option map_area validates', () => {
    expect(() => recipeSchema.parse({ game: 'x.json', materials: { a: { ramp: ['x'], texture: 'tiles' } }, steps: [] })).not.toThrow();
    expect(() => recipeSchema.parse({
      game: 'x.json', materials: {}, steps: [{ step: 'area', material: 'a', shape: 'all', tiles: { stagger: 2 } }],
    })).toThrow();
  });
});
