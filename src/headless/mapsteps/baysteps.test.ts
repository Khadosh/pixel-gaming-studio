// @vitest-environment node
// What came with the sixth round of the island of the sect of The Unwritten Dao:
// bays in the ring of a brink (no bushes on the lip there, no slit of sky between
// the face of the back of the bay and the lip of the shoulder in front), a ring of
// trees planted in groups with grass between them, and the count of what a grove planted.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';
import { plantedLines } from '../mapfile';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];
const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
type Step = MapRecipe['steps'][number];

function game(w = 16, h = 12): MapGame { return { width: w, height: h, grid: Array.from({ length: h }, () => '#'.repeat(w)), decor: [] }; }
function recipe(steps: MapRecipe['steps'], g = game()): MapRecipe {
  return {
    game: g, margin: [5, 5], light: [1, 1],
    materials: {
      grass: { ramp: ['hoja sombra', 'hoja', 'bambú', 'bambú claro', 'pasto'], base: 2 },
      rock: { ramp: STONE, moss: MOSS },
      sky: { ramp: SKY },
    },
    steps,
  };
}
// an island with a bay biting into its west side, rows 4 to 7
const BAY: [number, number][] = [[1, 1], [8, 0.6], [15, 1.2], [15.4, 6], [14.8, 11], [8, 10.6], [1, 11], [0.4, 9],
  [0.6, 8.2], [2.6, 7.4], [3.2, 5.6], [2.6, 3.9], [0.6, 3.2], [0.4, 2]];
const ROUND: [number, number][] = [[1, 1], [8, 0.6], [15, 1.2], [15.4, 6], [14.8, 11], [8, 10.6], [1, 11], [0.4, 6]];
const island = (lip: [number, number][], brink: object = {}): Step[] => [
  { step: 'area', material: 'sky', shape: 'all' } as Step,
  { step: 'area', material: 'grass', shape: 'all' } as Step,
  { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'sky', lip, side: [7, 4, 14], ...brink } as Step,
];

describe('a bay in the ring of a brink', () => {
  it('bare: no bushes lean over the lip inside its circle, the rest of the ring is the same', () => {
    const lush = paintMap(recipe(island(ROUND, { bushes: [9, 6] })), game());
    const bare = paintMap(recipe(island(ROUND, { bushes: [9, 6], bare: [[0.4, 6, 2.5]] })), game());
    let inside = 0, outside = 0;
    for (let i = 0; i < lush.layers.ground.px.length; i++) {
      if (lush.layers.ground.px[i] === bare.layers.ground.px[i]) continue;
      const x = i % lush.width, y = Math.floor(i / lush.width);
      const u = (x - 80) / 16, v = (y - 80) / 16;
      if (Math.hypot(u - 0.4, v - 6) < 2.5 + 0.8) inside++; else outside++;
    }
    expect(inside).toBeGreaterThan(20);
    expect(outside).toBe(0);
  });

  it('the face of the back of a bay goes on behind the lip of the shoulder: no slit of sky between a face and the top on a row', () => {
    const m = paintMap(recipe(island(BAY)), game());
    const kind = (x: number, y: number) => m.kind[y * m.width + x];
    let slits = 0, faces = 0;
    for (let y = 80 + 3 * 16; y < 80 + 9 * 16; y++) for (let x = 1; x < m.width / 2; x++) {   // the rows of the bay
      if (kind(x - 1, y) !== 'rock' || kind(x, y) !== 'sky') continue;
      faces++;
      let k = 0;
      while (k < 4 && kind(x + k, y) === 'sky') k++;
      if (k < 4 && kind(x + k, y) === 'grass') slits++;
    }
    expect(faces).toBeGreaterThan(0);
    expect(slits).toBe(0);
  });
});

describe('grove: groups and the count', () => {
  // a meadow walled all around (nothing walkable): the zone plants anywhere inside the island
  const zone = (groups?: [number, number, number]): Step => ({
    step: 'grove', id: 'bosque', zones: [{ within: 'b top', band: [2, 200], count: 40, spacing: 12, salt: 91, ...(groups ? { groups } : {}) }],
  } as Step);
  const planted = (m: PaintedMap) => { const t = m.planted!.bosque; return t.round + t.pine + t.plum; };

  it('groups keep open grass between them; a group gathers its trees around the first one; the same every time', () => {
    const lone = paintMap(recipe([...island(ROUND), zone([1, 1, 40])]), game());
    const clumps = paintMap(recipe([...island(ROUND), zone([3, 3, 40])]), game());
    const again = paintMap(recipe([...island(ROUND), zone([3, 3, 40])]), game());
    const even = paintMap(recipe([...island(ROUND), zone()]), game());
    expect(planted(lone)).toBeLessThan(planted(even));      // a gap wider than the spacing leaves room between them
    expect(planted(clumps)).toBeGreaterThan(planted(lone));  // the rest of each group stands inside that room
    expect(again.layers.copas.px).toEqual(clumps.layers.copas.px);
  });

  it('paintMap tells what each grove planted, and map_export prints it', () => {
    const m = paintMap(recipe([...island(ROUND), zone(), { step: 'grove', trees: [[4, 5, 'bush', 1], [8, 6, 'pine', 3]] } as Step]), game());
    expect(Object.keys(m.planted!)).toEqual(['bosque', 'grove4']);
    expect(m.planted!.grove4).toEqual({ round: 0, pine: 1, plum: 0, bush: 1, spill: 0 });
    expect(plantedLines(m)[1]).toBe('grove grove4: 1 trees (round 0, pine 1, plum 0), 1 bushes');
  });
});
