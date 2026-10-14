// @vitest-environment node
// The bluff: the peña a pavilion stands on, seen from above in 3/4 (unwritten-dao #355). Its top painted with its
// snow; under the south rim a face of broken rock, lighter near the rim than at the foot, the end toward the light lit;
// a cornice of snow along the rim with icicles under it; the face narrower at the foot than at the rim (taper); tiers
// with ledges; a cleft cut where a stair goes down it; the foot lost in mist; a rounded top lit toward the light;
// the same salt, the same pixels; a place moves it.
// Also what came with it: the archbridge's rails and piers and its flush ends, the stairway's ragged cut in the rock
// and the balustrade's one side rail.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import { stepSchema, type MapGame, type MapRecipe, type MapStepOf } from '../maprecipe';

const ROCK = ['basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla sombra', 'niebla'];
const SNOWR = ['nieve noche', 'nieve honda', 'nieve sombra', 'nieve', 'túnica luz'];
const MIST = ['celeste', 'cielo', 'cielo claro', 'nube honda', 'nube panza', 'nube media', 'nube'];
const MATS: MapRecipe['materials'] = {
  suelo: { ramp: ['pasto sombra', 'pasto', 'pasto claro'] },
  roca: { ramp: ROCK },
  nieve: { ramp: SNOWR, base: 3 },
  nubes: { ramp: MIST },
  piedra: { ramp: ['tinta', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla', 'nube media'] },
  agua: { ramp: ['agua de hielo honda', 'agua de hielo', 'agua de hielo luz'] },
  escalinata: { ramp: ['basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla sombra', 'niebla', 'nube media'] },
  tallada: { ramp: ['basalto hondo', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla sombra', 'niebla'] },
};
const game: MapGame = { width: 16, height: 16, grid: Array.from({ length: 16 }, () => '.'.repeat(16)), decor: [] };
const GROUND: MapStepOf<'area'> = { step: 'area', material: 'suelo', shape: 'all' };
// the top from px 64 to 192 across, rim at 96; the face 64 px under it (97..160)
const PENA: MapStepOf<'bluff'> = { step: 'bluff', material: 'roca', top: [[4, 3], [12, 3], [12, 6], [4, 6]], face: 64, fill: 'nieve',
  snow: ['túnica luz', 'nieve sombra'], icicles: ['celeste luz', 'cielo claro'], cornice: 3, taper: 2, tiers: 3, salt: 1641 };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x] ?? null;
const row = (m: PaintedMap, y: number, set: string[]) => [...Array(m.width).keys()].filter(x => set.includes(at(m, x, y) ?? ''));
const mean = (m: PaintedMap, y0: number, y1: number, x0 = 72, x1 = 184) => {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = ROCK.indexOf(at(m, x, y) ?? ''); if (i >= 0) { s += i; n++; } }
  return s / Math.max(1, n);
};

describe('map bluff', () => {
  const m = paintMap(recipe([GROUND, PENA]), game);

  it('the top is snow, the face under the rim is rock with blocks, the ground beyond untouched', () => {
    expect(SNOWR).toContain(at(m, 128, 70));
    let rock = 0; for (let y = 104; y < 150; y++) rock += row(m, y, ROCK).filter(x => x > 70 && x < 186).length;
    expect(rock).toBeGreaterThan(3000);
    expect(new Set(row(m, 120, ROCK).map(x => at(m, x, 120))).size).toBeGreaterThanOrEqual(3);
    expect(at(m, 20, 120)).toMatch(/pasto/);
    expect(m.kind[120 * m.width + 128]).toBe('roca');
  });

  it('lit near the rim, dark at the foot; the end toward the light lighter than the other', () => {
    expect(mean(m, 104, 120)).toBeGreaterThan(mean(m, 140, 156) + 0.6);
    expect(mean(m, 104, 150, 66, 80)).toBeGreaterThan(mean(m, 104, 150, 176, 190) + 0.5);
  });

  it('a cornice of snow along the rim, icicles under it; narrower at the foot (taper)', () => {
    expect(row(m, 97, ['túnica luz', 'nieve sombra']).filter(x => x > 64 && x < 192).length).toBeGreaterThan(100);
    let ice = 0; for (let y = 99; y < 112; y++) ice += row(m, y, ['celeste luz', 'cielo claro']).length;
    expect(ice).toBeGreaterThan(10);
    const span = (y: number) => { const xs = row(m, y, [...ROCK, 'túnica luz', 'nieve sombra', 'celeste luz', 'cielo claro']).filter(x => x > 50 && x < 206); return xs[xs.length - 1] - xs[0]; };
    expect(span(150)).toBeLessThan(span(104) - 12);
  });

  it('a cleft where a stair goes: no face there, its walls beside it', () => {
    const c = paintMap(recipe([GROUND, { ...PENA, cuts: [[7, 8]] }]), game);
    for (let y = 104; y < 150; y += 8) expect(at(c, 120, y)).toMatch(/pasto/);
    expect(at(c, 110, 120)).not.toBe(at(m, 110, 120));
  });

  it('the foot lost in mist; a rounded top lit toward the light', () => {
    const f = paintMap(recipe([GROUND, { ...PENA, foot: { mist: 'nubes', fade: 20 } }]), game);
    let mist = 0; for (let y = 140; y < 168; y++) mist += row(f, y, ['nube', 'nube media']).length;
    expect(mist).toBeGreaterThan(200);
    const d = paintMap(recipe([GROUND, { ...PENA, dome: true }]), game);
    const tone = (x: number, y: number) => SNOWR.indexOf(at(d, x, y) ?? '');
    let nw = 0, se = 0;
    for (let y = 52; y < 60; y++) for (let x = 70; x < 90; x++) nw += tone(x, y);
    for (let y = 84; y < 92; y++) for (let x = 166; x < 186; x++) se += tone(x, y);
    expect(nw).toBeGreaterThan(se + 40);
  });

  it('deterministic; a place moves its top and its face profile; the schema refuses a top of two points', () => {
    expect(paintMap(recipe([GROUND, PENA]), game).layers.ground.px).toEqual(m.layers.ground.px);
    const moved = moveStep({ ...PENA, face: [{ u: 4, px: 40 }, { u: 12, px: 60 }] }, 2, 1) as MapStepOf<'bluff'>;
    expect(moved.top[0]).toEqual([6, 4]);
    expect(moved.face).toEqual([{ u: 6, px: 40 }, { u: 14, px: 60 }]);
    expect((moveStep(PENA, 2, 1) as MapStepOf<'bluff'>).face).toBe(64);
    expect(stepSchema.safeParse({ ...PENA, top: [[0, 0], [1, 1]] }).success).toBe(false);
    expect(stepSchema.safeParse(PENA).success).toBe(true);
  });
});

describe('what came with the bluff', () => {
  const BRIDGE: MapStepOf<'archbridge'> = { step: 'archbridge', material: 'piedra', x: [4, 8], y: [4, 5], face: 16, arches: [{ u: 6, half: 7 }] };

  it('archbridge.rails: a balustrade along each edge, a pier at each end with a gold finial, the south ones down the face', () => {
    const bare = paintMap(recipe([GROUND, BRIDGE]), game);
    const r = paintMap(recipe([GROUND, { ...BRIDGE, rails: { height: 5, piers: 5 } }]), game);
    let gold = 0; r.layers.ground.px.forEach(c => { if (c === 'oro claro') gold++; });
    expect(gold).toBeGreaterThan(6);
    // the pier at the south-west corner stands over the deck and goes down the face to its foot (95)
    expect(at(r, 66, 66)).not.toBe(at(bare, 66, 66));
    for (const y of [84, 92]) expect(at(r, 66, y)).not.toBe(at(bare, 66, y));
    const north = paintMap(recipe([GROUND, { ...BRIDGE, rails: { edges: ['north'] } }]), game);
    expect(at(north, 66, 92)).toBe(at(bare, 66, 92));
  });

  it('archbridge.flush: no ink across the deck at that end', () => {
    const ink = (m: PaintedMap, x: number) => [...Array(16).keys()].filter(k => at(m, x, 64 + k) === 'tinta').length;
    expect(ink(paintMap(recipe([GROUND, BRIDGE]), game), 64)).toBeGreaterThan(10);
    expect(ink(paintMap(recipe([GROUND, { ...BRIDGE, flush: ['west'] }]), game), 64)).toBeLessThan(3);
  });

  it('stairway worn.rock.ragged: the cut breaks, wider here and there; balustrade down.sides: one rail alone', () => {
    const stair = (ragged: number): MapStepOf<'stairway'> => ({ step: 'stairway', material: 'escalinata', x: [7, 9], from: 4, to: 12, middle: 8,
      worn: { wall: 2, rock: { from: 4, material: 'tallada', wide: 1, ragged } } });
    const kinds = (m: PaintedMap) => { let n = 0; m.kind.forEach(k => { if (k === 'escalinata') n++; }); return n; };
    expect(kinds(paintMap(recipe([GROUND, stair(3)]), game))).toBeGreaterThan(kinds(paintMap(recipe([GROUND, stair(0)]), game)) + 20);
    const rail = (sides?: ('west' | 'east')[]) => paintMap(recipe([GROUND, { step: 'balustrade', material: 'piedra', down: { x: [3, 12], y: [2, 14], finials: 12, ...(sides ? { sides } : {}) } }]), game);
    const both = rail(), east = rail(['east']);
    // the west rail at px 48.., the east one at 192..
    expect(at(east, 49, 100)).toBe(at(paintMap(recipe([GROUND]), game), 49, 100));
    expect(at(both, 49, 100)).not.toBe(at(east, 49, 100));
    expect(at(east, 193, 100)).toBe(at(both, 193, 100));
    expect(at(east, 193, 100)).not.toMatch(/pasto/);
  });
});
