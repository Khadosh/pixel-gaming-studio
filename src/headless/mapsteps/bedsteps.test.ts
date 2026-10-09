// @vitest-environment node
// What the pavilion of the disciples brought (unwritten-dao docs/diseno/pabellon.md): garden beds (a frame of
// boards, dark earth in furrows, rows of plants, the front board's face, the shadow to the south-east), a double
// door with its seam, and a stoop of stone steps down from the plinth; and from Joaquín walking it: a scatter of a
// place stays in its rectangle, and a steep run of fence keeps its rails whole.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { expandPlaces, moveStep } from '../mapplace';
import { seenEndOn } from './fence';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

describe('map beds that overflow', () => {
  // bed A: x 32..79, y 32..55; bed B right under it: y 56..79
  const BASE: MapStepOf<'beds'> = {
    step: 'beds', id: 'huerto', soil: 'tierra', frame: 'tablas', beds: [[2, 2, 3, 1.5], [2, 3.5, 3, 1.5]],
    plants: [{ shape: 'leafy', size: 2, spacing: 10, colors: ['copa honda', 'copa sombra', 'hoja'] }], rows: 7, rise: 3,
  };
  const tight = paintMap(recipe([GROUND, BASE]), game);
  const over = paintMap(recipe([GROUND, { ...BASE, overflow: 4 }]), game);
  const green = (m: PaintedMap, x0: number, x1: number, y0: number, y1: number) => {
    let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (['copa honda', 'copa sombra', 'hoja'].includes(col(m, x, y)!)) n++; return n;
  };

  it('the plants rise over the back board and spill past the side ones', () => {
    expect(green(over, 32, 80, 20, 33)).toBeGreaterThan(green(tight, 32, 80, 20, 33) + 30); // leaves over its back board
    expect(green(over, 24, 32, 32, 56) + green(over, 80, 88, 32, 56)).toBeGreaterThan(green(tight, 24, 32, 32, 56) + green(tight, 80, 88, 32, 56));
  });

  it('the plants of the nearer bed cover the front board of the farther one', () => {
    const boards = (m: PaintedMap) => { let n = 0; for (let y = 50; y < 56; y++) for (let x = 32; x < 80; x++) if (kind(m, x, y) === 'tablas') n++; return n; };
    expect(boards(over)).toBeLessThan(boards(tight));
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

describe('a scatter of a place stays in its rectangle (the pavilion: tufts of the forge over its roof)', () => {
  it('within: nothing lands outside the masks', () => {
    const r: MapRecipe = { ...recipe([GROUND, { step: 'scatter', what: 'tufts', layer: 'puntas', count: 4000, on: ['suelo'], odds: null, within: ['caja'] }]), masks: { caja: [[2, 2, 4, 3]] } };
    const m = paintMap(r, game);
    const l = m.layers.puntas!;
    let inside = 0, outside = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (l.px[y * m.width + x] === null) continue;
      if (x >= 32 && x < 96 && y >= 32 && y < 80) inside++; else outside++;
    }
    expect(inside).toBeGreaterThan(20);
    expect(outside).toBe(0);
  });

  it('a place puts its reserve as `within` on every scatter of it with no fixed places', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-place-'));
    writeFileSync(join(dir, 'lugar.json'), JSON.stringify({ size: [3, 2], steps: [
      { step: 'scatter', what: 'tufts', layer: 'puntas', on: ['suelo'] },
      { step: 'scatter', what: 'flowers', at: [[1, 1]] },
    ] }));
    const mother = join(dir, 'madre.json');
    const out = expandPlaces(recipe([GROUND, { step: 'place', recipe: 'lugar.json', at: [5, 5], reserve: 'lugar' }]), mother);
    const sc = out.steps.filter(s => s.step === 'scatter') as MapStepOf<'scatter'>[];
    expect(sc[0].within).toEqual(['lugar']);
    expect(sc[1].within).toBeUndefined();
  });
});

describe('fence: a steep diagonal still shows its rails as bars', () => {
  it('only a run that really goes north-south is seen end on', () => {
    expect(seenEndOn(16, 48)).toBe(false);   // three down for one across: bars, leaning
    expect(seenEndOn(10, 20)).toBe(false);
    expect(seenEndOn(4, 48)).toBe(true);     // north-south: edges
    expect(seenEndOn(0, 30)).toBe(true);
  });

  it('a steep run: every row between its posts has wood', () => {
    const m = paintMap(recipe([GROUND, { step: 'fence', material: 'tablas', path: [[3, 1], [2, 4]], post: [4, 10], rails: [3, 7], spacing: 17, salt: 1903 }]), game);
    let gaps = 0;
    for (let y = 20; y < 60; y++) {
      let wood = 0;
      for (let x = 28; x < 56; x++) if (kind(m, x, y) === 'tablas') wood++;
      if (wood === 0) gaps++;
    }
    expect(gaps).toBe(0);
  });
});
