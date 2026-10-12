// @vitest-environment node
// The icefall: a waterfall frozen on a face of rock. A curtain of round columns of ice side by side, narrow at the
// lip and wider at its foot, lit on the side of the light, ink on the other, icicles under each column, a heap at its
// foot; the same salt, the same pixels; on a layer of its own it leaves the ground alone.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const ICE = ['basalto hondo', 'celeste oscuro', 'celeste', 'cielo claro', 'celeste luz', 'ojo'];
const MATS: MapRecipe['materials'] = {
  roca: { ramp: ['basalto hondo', 'basalto sombra', 'basalto', 'basalto claro'] },
  hielo: { ramp: ICE },
};
const game: MapGame = { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)), decor: [] };
const ROCK: MapStepOf<'area'> = { step: 'area', material: 'roca', shape: 'all' };
// the head at the middle of the map (px 96, 32), 96 px down: the foot at px 128
const FALL: MapStepOf<'icefall'> = { step: 'icefall', material: 'hielo', at: [6, 2], length: 96, width: [5, 12], icicles: 6, salt: 1471 };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number, layer = 'ground') => m.layers[layer]?.px[y * m.width + x] ?? null;
const iceRow = (m: PaintedMap, y: number, layer = 'ground') => [...Array(m.width).keys()].filter(x => ICE.includes(at(m, x, y, layer) ?? ''));

describe('map icefall', () => {
  const m = paintMap(recipe([ROCK, FALL]), game);

  it('a curtain narrow at its lip and wider at its foot', () => {
    const top = iceRow(m, 34), bottom = iceRow(m, 124);
    expect(top.length).toBeGreaterThanOrEqual(9);
    expect(top.length).toBeLessThanOrEqual(14);
    expect(bottom.length).toBeGreaterThanOrEqual(22);
    expect(bottom.length).toBeLessThanOrEqual(28);
    expect(at(m, 96, 20)).toBe('basalto');                       // above the lip, the rock
  });

  it('in columns: across a row the tones break into runs, with dark gutters between them', () => {
    const y = 90, xs = iceRow(m, y);
    let runs = 1;
    for (let i = 1; i < xs.length; i++) if (at(m, xs[i], y) !== at(m, xs[i - 1], y)) runs++;
    expect(runs).toBeGreaterThanOrEqual(6);
  });

  it('lit on the side of the light, ink on the shaded edge', () => {
    const light = (xs: number[], y: number) => xs.filter(x => ['celeste luz', 'ojo'].includes(at(m, x, y)!)).length;
    let west = 0, east = 0;
    for (let y = 40; y < 120; y += 4) {
      const xs = iceRow(m, y), mid = Math.floor(xs.length / 2);
      west += light(xs.slice(0, mid), y);
      east += light(xs.slice(mid), y);
      expect(at(m, xs[xs.length - 1], y)).toBe('basalto hondo');
    }
    expect(west).toBeGreaterThan(east * 2);
    const flipped = paintMap(recipe([ROCK, { ...FALL, light: 'east' }]), game);
    expect(at(flipped, iceRow(flipped, 80)[0], 80)).toBe('basalto hondo');
  });

  it('icicles hang under the foot, each column its own length; a heap at the foot covers them', () => {
    const below = (mm: PaintedMap) => [1, 2, 3, 4, 5].map(d => iceRow(mm, 128 + d).length);
    const hang = below(m);
    expect(hang[0]).toBeGreaterThan(0);
    expect(hang[4]).toBeLessThan(hang[0]);                        // fewer and thinner going down: tips
    const none = paintMap(recipe([ROCK, { ...FALL, icicles: 0 }]), game);
    expect(below(none)).toEqual([0, 0, 0, 0, 0]);
    const heap = paintMap(recipe([ROCK, { ...FALL, icicles: 0, foot: [16, 6] }]), game);
    expect(iceRow(heap, 127).length).toBeGreaterThan(iceRow(m, 124).length + 4);   // wider than the curtain
    expect(iceRow(heap, 131).length).toBeGreaterThan(10);                             // and below its foot
  });

  it('the same salt paints the same px; on a layer the ground keeps its rock; a place moves its head', () => {
    const again = paintMap(recipe([ROCK, FALL]), game);
    expect(again.layers.ground.px).toEqual(m.layers.ground.px);
    const lifted = paintMap(recipe([ROCK, { ...FALL, layer: 'copas' }]), game);
    expect(at(lifted, 96, 80)).toBe('basalto');
    expect(ICE).toContain(at(lifted, 96, 80, 'copas'));
    expect((moveStep(FALL, 2, 1) as MapStepOf<'icefall'>).at).toEqual([8, 3]);
  });
});
