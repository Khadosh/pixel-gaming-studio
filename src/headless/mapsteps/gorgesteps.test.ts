// @vitest-environment node
// The gorge: running water falling down a cleft seen from above. Water between two walls of rock, the one facing away
// from the light darker; the lip lit; more foam toward the foot and a heap of foam at it; snow on the rims; the flow
// layer only over the water; the same salt, the same pixels; a place moves it.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const WATER = ['agua de hielo honda', 'agua de hielo', 'agua de hielo luz', 'nube', 'ojo'];
const ROCK = ['basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla sombra', 'niebla'];
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: ['nieve honda', 'nieve sombra', 'nieve', 'túnica luz'] },
  agua: { ramp: WATER },
  roca: { ramp: ROCK },
};
const game: MapGame = { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)), decor: [] };
const SNOW: MapStepOf<'area'> = { step: 'area', material: 'nieve', shape: 'all' };
// the lip at px (96, 32), 80 px down: the foot at px 112
const CLEFT: MapStepOf<'gorge'> = { step: 'gorge', material: 'agua', rock: 'roca', at: [6, 2], length: 80, width: [6, 10], walls: 8,
  snow: ['túnica luz', 'nieve sombra'], flow: 'cascada', salt: 1601 };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number, layer = 'ground') => m.layers[layer]?.px[y * m.width + x] ?? null;
const row = (m: PaintedMap, y: number, set: string[]) => [...Array(m.width).keys()].filter(x => set.includes(at(m, x, y) ?? ''));

describe('map gorge', () => {
  const m = paintMap(recipe([SNOW, CLEFT]), game);

  it('water down the middle, wider below; rock walls on both sides; the snow beyond them stays', () => {
    const w40 = row(m, 40, WATER), w100 = row(m, 100, WATER);
    expect(w40.length).toBeGreaterThanOrEqual(10);
    expect(w100.length).toBeGreaterThan(w40.length);
    const rock = row(m, 60, ROCK);
    expect(rock.filter(x => x < w40[0]).length).toBeGreaterThanOrEqual(3);
    expect(rock.filter(x => x > w40[w40.length - 1]).length).toBeGreaterThanOrEqual(3);
    expect(at(m, 96, 20)).toBe('nieve');                     // above the lip, the terrace
    expect(at(m, 40, 60)).toBe('nieve');                     // far beside it, the terrace
    expect(m.kind[60 * m.width + 96]).toBe('agua');
  });

  it('the wall facing away from the light is darker than the lit one', () => {
    let west = 0, east = 0, nw = 0, ne = 0;
    for (let y = 40; y < 100; y++) for (const x of row(m, y, ROCK)) {
      const i = ROCK.indexOf(at(m, x, y)!);
      if (x < 96) { west += i; nw++; } else { east += i; ne++; }
    }
    expect(west / nw).toBeLessThan(east / ne - 0.8);
  });

  it('the lip lit; more foam toward the foot than near the lip; a heap of foam at the foot; snow on the rims', () => {
    expect(row(m, 32, WATER).every(x => at(m, x, 32) === 'ojo')).toBe(true);
    const foam = (y0: number, y1: number) => { let n = 0, all = 0; for (let y = y0; y < y1; y++) for (const x of row(m, y, WATER)) { all++; if (at(m, x, y) === 'nube' || at(m, x, y) === 'ojo') n++; } return n / all; };
    expect(foam(85, 105)).toBeGreaterThan(foam(36, 56) + 0.15);
    expect(row(m, 111, ['nube', 'ojo']).length).toBeGreaterThan(10);
    let snow = 0; for (let y = 36; y < 100; y++) snow += row(m, y, ['túnica luz', 'nieve sombra']).length;
    expect(snow).toBeGreaterThan(60);
  });

  it('the flow layer only over the water; without it the ground is the same; deterministic; a place moves it', () => {
    let n = 0;
    m.layers.cascada!.px.forEach((c, i) => { if (c !== null) { n++; expect(WATER).toContain(at(m, i % m.width, Math.floor(i / m.width))); } });
    expect(n).toBeGreaterThan(20);
    expect(paintMap(recipe([SNOW, { ...CLEFT, flow: undefined }]), game).layers.ground.px).toEqual(m.layers.ground.px);
    expect(paintMap(recipe([SNOW, CLEFT]), game).layers.ground.px).toEqual(m.layers.ground.px);
    expect((moveStep(CLEFT, 2, 1) as MapStepOf<'gorge'>).at).toEqual([8, 3]);
  });
});
