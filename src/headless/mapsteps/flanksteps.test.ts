// @vitest-environment node
// The flank of an area: the top of a narrow wall seen from above gets a side
// face away from the light, a dark joint against it, a lit rim on the other
// side, and (ragged) stones that step in and out like an old wall.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const WALL = ['túnica oscura', 'piedra sombra', 'piedra', 'piedra clara'];
const MATS: MapRecipe['materials'] = {
  pasto: { ramp: ['prado hondo', 'prado', 'prado claro'] },
  muro: { ramp: WALL },
  tope: { ramp: ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'], texture: 'flagstones', moss: ['hoja sombra', 'prado hondo'] },
};
const game: MapGame = { width: 6, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(6)), decor: [] };
const GRASS: MapStepOf<'area'> = { step: 'area', material: 'pasto', shape: 'all' };
// the top: x 16..27 (0.75 cells from u = 1), y 8..183
const TOP: MapStepOf<'area'> = { step: 'area', id: 'lomo', material: 'tope', stones: [6, 5], shape: { rect: [1, 0.5, 0.75, 11] } };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
/** The px of the face in a row: how many px of the wall's material east of the top's last px (27). */
const faceWidth = (m: PaintedMap, y: number) => { let w = 0; while (kind(m, 28 + w, y) === 'muro') w++; return w; };

describe('map area: flank', () => {
  it('without it, a flagstone top is only its stones (the grass right after)', () => {
    const m = paintMap(recipe([GRASS, TOP]), game);
    for (let y = 20; y < 170; y++) expect(kind(m, 28, y)).toBe('pasto');
  });

  it('straight (ragged: false): a face of width px east, lip to foot down the dark half, the darkest joint against the top, a lit rim west', () => {
    const m = paintMap(recipe([GRASS, { ...TOP, flank: { width: 3, material: 'muro', rim: true, ragged: false } }]), game);
    let joints = 0;
    for (let y = 20; y < 170; y++) {
      expect(faceWidth(m, y), `row ${y}`).toBe(3);
      expect(at(m, 27, y)).toBe('túnica oscura'); // the joint between top and face
      expect(at(m, 30, y)).toBe('túnica oscura'); // the foot
      expect(['piedra sombra', 'túnica oscura']).toContain(at(m, 28, y));
      if (at(m, 28, y) === 'túnica oscura') joints++;
      expect(kind(m, 31, y)).toBe('pasto');
    }
    // a joint across the face where a stone of the top ends (stones 5 px tall): about one row in five, not all
    expect(joints).toBeGreaterThan(150 / 9);
    expect(joints).toBeLessThan(150 / 3);
    // the lit rim on the west edge, cut at the joints; never outside the top
    let rim = 0;
    for (let y = 20; y < 170; y++) { if (at(m, 16, y) === 'piedra clara') rim++; expect(kind(m, 15, y)).toBe('pasto'); }
    expect(rim).toBeGreaterThan(100);
  });

  it('ragged (the default): the face is 3 or 2 px and the top stands out 1 px west by stones, never a ruled band of 2 cells', () => {
    const m = paintMap(recipe([GRASS, { ...TOP, flank: { material: 'muro', rim: true } }]), game);
    const widths = new Set<number>();
    let run = 0, prev = -1, longest = 0, out = 0, orun = 0, oprev = false, olongest = 0;
    for (let y = 10; y < 180; y++) {
      const w = faceWidth(m, y);
      widths.add(w);
      run = w === prev ? run + 1 : 1; prev = w; longest = Math.max(longest, run);
      const o = kind(m, 15, y) === 'muro';
      if (o) { out++; expect(at(m, 15, y)).toBe('piedra clara'); }
      orun = o === oprev ? orun + 1 : 1; oprev = o; olongest = Math.max(olongest, orun);
      expect(kind(m, 14, y)).toBe('pasto');
    }
    expect([...widths].sort()).toEqual([2, 3]);
    expect(longest).toBeLessThanOrEqual(32);
    expect(olongest).toBeLessThanOrEqual(32);
    expect(out).toBeGreaterThan(20);
  });

  it('stops where it meets another wall of its material, and keeps the stones of the border', () => {
    const block: MapStepOf<'area'> = { step: 'area', material: 'muro', shape: { rect: [1.5, 5, 2, 1] } };
    const m = paintMap(recipe([GRASS, block, { ...TOP, flank: { material: 'muro', ragged: false } }]), game);
    // the block (x 24..55, y 80..95) under the top stays as the block east of it
    for (let y = 81; y < 95; y++) for (let x = 28; x < 31; x++) expect(at(m, x, y)).toBe('piedra');
    // no stone of the border left out: every px of the top is laid, on both edges
    for (let y = 20; y < 170; y++) { expect(kind(m, 16, y), `row ${y}`).toBe('tope'); }
  });
});
