// @vitest-environment node
// What the pavilion of the disciples brought (unwritten-dao docs/diseno/pabellon.md): garden beds (a frame of
// boards, dark earth in furrows, rows of plants, the front board's face, the shadow to the south-east), a double
// door with its seam, and a stoop of stone steps down from the plinth.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'];
const MATS: MapRecipe['materials'] = {
  suelo: { ramp: ['prado hondo', 'prado sombra', 'prado'], base: 2 },
  tierra: { ramp: ['túnica noche', 'madera sombra', 'tierra sombra', 'tierra'] },
  tablas: { ramp: ['túnica noche', 'madera sombra', 'madera', 'madera clara', 'arena'] },
  teja: { ramp: ['tinta', 'tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz'] },
  piedra: { ramp: STONE },
  revoque: { ramp: ['piedra sombra', 'piedra', 'túnica sombra', 'pergamino'] },
  vigas: { ramp: ['tinta', 'madera sombra', 'madera', 'bermellón', 'madera clara'] },
  puerta: { ramp: ['tinta', 'madera sombra', 'madera', 'madera clara', 'arena'] },
};
const game: MapGame = { width: 16, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(16)), decor: [] };
const GROUND: MapStepOf<'area'> = { step: 'area', material: 'suelo', shape: 'all' };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground?.px[y * m.width + x] ?? null;
const col = (m: PaintedMap, x: number, y: number) => at(m, x, y) as string | null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];

describe('map beds', () => {
  const BEDS: MapStepOf<'beds'> = {
    step: 'beds', id: 'huerto', soil: 'tierra', frame: 'tablas', beds: [[2, 2, 3, 2], [6, 2, 3, 2, 1]],
    plants: [{ shape: 'leafy' }, { shape: 'flower', bloom: ['flor sombra', 'flor', 'flor clara'] }], rise: 3,
  };
  const m = paintMap(recipe([GROUND, BEDS]), game);
  const ref = paintMap(recipe([GROUND, { ...BEDS, beds: [] as unknown as MapStepOf<'beds'>['beds'] }].slice(0, 1)), game);

  it('a frame of boards around dark earth: the north board lit on top, the front board a face with an inked foot', () => {
    // bed 0: x 32..79, y 32..63
    expect(kind(m, 40, 32)).toBe('tablas');
    expect([col(m, 40, 33), col(m, 40, 34)]).toEqual([MATS.tablas.ramp[4], MATS.tablas.ramp[3]]); // lit top of the north board
    expect(col(m, 50, 63)).toBe(MATS.tablas.ramp[0]);                                              // the foot of the front face
    expect(kind(m, 50, 61)).toBe('tablas');
    // inside: earth, its furrows dark, with plants on it
    let soil = 0, plants = 0;
    for (let y = 36; y < 56; y++) for (let x = 36; x < 76; x++) {
      const c = col(m, x, y);
      if (MATS.tierra.ramp.includes(c!)) soil++; else if (c && c.startsWith('prado')) plants++;
    }
    expect(soil).toBeGreaterThan(80);
    expect(plants).toBeGreaterThan(150);
  });

  it('each bed grows its own kind: flowers in the second, never in the first', () => {
    const count = (x0: number, x1: number) => { let n = 0; for (let y = 32; y < 64; y++) for (let x = x0; x < x1; x++) if (col(m, x, y) === 'flor') n++; return n; };
    expect(count(32, 80)).toBe(0);
    expect(count(96, 144)).toBeGreaterThan(10);
  });

  it('its shadow falls on the ground to the south-east, never on a bed', () => {
    expect(at(m, 81, 64)).not.toBe(ref.layers.ground!.px[64 * m.width + 81]);
    expect(at(m, 20, 20)).toBe(ref.layers.ground!.px[20 * m.width + 20]);
  });

  it('the same salt, the same pixels; and a place moves each bed by its corner', () => {
    expect(paintMap(recipe([GROUND, BEDS]), game).layers.ground!.px).toEqual(m.layers.ground!.px);
    expect((moveStep(BEDS, 1, 2) as MapStepOf<'beds'>).beds).toEqual([[3, 4, 3, 2], [7, 4, 3, 2, 1]]);
  });
});

describe('map building: a double door and a stoop', () => {
  const HOUSE: MapStepOf<'building'> = {
    step: 'building', id: 'casa', rect: [2, 1, 10, 6], wall: 36, material: 'revoque', frame: 'vigas', stone: 'piedra', plinth: 10,
    doors: [[4, 5.5]], door: 'puerta', stoop: { at: [3.75, 5.75], treads: 3, tread: 6, cheek: 5 },
  };
  const m = paintMap(recipe([GROUND, HOUSE]), game);
  const F = 7 * 16; // the foot of the front

  it('a door 24 px wide is two leaves: a dark seam in the middle, a lit stile at the west of a leaf, the jambs of the frame, in its own wood', () => {
    const y = F - 20, a = 32 + 64, mid = a + 12;
    expect(kind(m, a + 5, y)).toBe('puerta');
    expect(col(m, mid, y)).toBe(MATS.puerta.ramp[0]);
    expect(col(m, mid + 1, y)).toBe(MATS.puerta.ramp[3]);   // the stile of the east leaf, lit (the west one is behind the jamb)
    expect(kind(m, a, y)).toBe('vigas');                     // the jambs are posts of the frame
  });

  it('a stoop: three treads down from the top of the plinth to the ground in front, each with a lit nose and a dark riser', () => {
    const x = 32 + 72; // the middle of the door
    const noses: number[] = [], risers: number[] = [];
    for (let y = F - 10; y < F + 12; y++) {
      if (col(m, x, y) === STONE[7]) noses.push(y);
      if (col(m, x, y) === STONE[1]) risers.push(y);
    }
    expect(noses.length).toBe(3);
    expect(risers.length).toBe(3);
    expect(noses[0]).toBeLessThan(F);                  // the first one on the plinth
    expect(noses[2]).toBeGreaterThanOrEqual(F + 4);    // the last one out on the ground
    // the cheek blocks stand at both sides, a little wider than the treads
    expect(kind(m, 32 + 60 - 4, F)).toBe('piedra');
    expect(kind(m, 32 + 92 + 3, F)).toBe('piedra');
  });

  it('without a stoop nothing is painted in front of the wall', () => {
    const bare = paintMap(recipe([GROUND, { ...HOUSE, stoop: undefined }]), game);
    expect(kind(bare, 32 + 72, F + 4)).toBe('suelo');
  });
});
