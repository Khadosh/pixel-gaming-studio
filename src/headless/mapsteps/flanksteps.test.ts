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

// Two walls of a compound joined at a corner: a north-south wall seen from above (the top and its flank east)
// meets an east-west wall seen from the front (an ashlar). The top 16..27, the flank 28..30.
const ASH = (id: string, x: [number, number], y: [number, number], more: object = {}): MapStepOf<'ashlar'> =>
  ({ step: 'ashlar', id, material: 'muro', x, y, course: 5, ...more });
const isWall = (k: string) => k === 'muro' || k === 'tope';

describe('map area: flank.join (the corner of two walls)', () => {
  // the ashlar along the foot of the wall: x 8..31 (it goes on west, it ends just past the flank east), y 160..175
  const south = ASH('sur', [0.5, 2], [10, 11]);
  const wall = (join?: string[]): MapStepOf<'area'> => ({ ...TOP, shape: { rect: [1, 0.5, 0.75, 9.5] }, flank: { width: 3, material: 'muro', rim: true, ragged: false, join } });

  it('without it, the top stops on the cap of the ashlar and the end of the ashlar shows past the flank', () => {
    const m = paintMap(recipe([GRASS, south, wall()]), game);
    for (let x = 17; x < 27; x++) expect(kind(m, x, 160), `x ${x}`).toBe('muro');
    expect(kind(m, 31, 165)).toBe('muro');
  });

  it('the top runs on over the cap of the ashlar, lit at its lip in line with the cap beside it; the face goes on under the corner', () => {
    const m = paintMap(recipe([GRASS, south, wall(['sur'])]), game);
    // one top from far up down to the lip: no seam where the ashlar starts
    for (let x = 16; x < 28; x++) for (let y = 150; y <= 160; y++) expect(kind(m, x, y), `${x},${y}`).toBe('tope');
    // the lip is the light of the wall, the same as the cap of the ashlar west of the corner (no dark rim closing the top)
    expect(at(m, 15, 160)).toBe('piedra clara');
    let lit = 0;
    for (let x = 17; x < 27; x++) if (at(m, x, 160) === 'piedra clara') lit++;
    expect(lit).toBeGreaterThanOrEqual(7);
    // below the lip, the face of the ashlar right across the corner (under the top and under the flank)
    for (let x = 16; x < 31; x++) for (let y = 161; y < 175; y++) expect(kind(m, x, y), `${x},${y}`).toBe('muro');
  });

  it('the flank comes down to where the face starts and stops there; the end of the ashlar never shows past it', () => {
    const m = paintMap(recipe([GRASS, south, wall(['sur'])]), game);
    // the flank over the cap rows: the dark of its foot at x 30 down to the lip
    for (let y = 150; y <= 160; y++) expect(at(m, 30, y), `row ${y}`).toBe('túnica oscura');
    // the face's end, in shadow (the corner in relief), and nothing of the ashlar east of the flank
    for (let y = 161; y < 172; y++) expect(at(m, 30, y), `row ${y}`).toBe('túnica oscura');
    for (let y = 150; y < 176; y++) expect(kind(m, 31, y), `row ${y}`).toBe('pasto');
  });

  it('where the top comes out of a wall: it starts at the outer edge of that wall, and the outer corner is cut round', () => {
    const north = ASH('norte', [0.5, 2], [0, 1]);
    const m = paintMap(recipe([GRASS, north, { ...wall(['norte']), shape: { rect: [1, 0.5, 0.75, 9] } }]), game);
    // the top from the outer edge of the wall (row 0) on
    for (let x = 18; x < 27; x++) expect(kind(m, x, 0), `x ${x}`).toBe('tope');
    // the corner away from where the ashlar goes on (the flank side, east): the vertex and its two neighbours are
    // not wall; the flank right under them is
    expect(isWall(kind(m, 30, 0))).toBe(false);
    expect(isWall(kind(m, 29, 0))).toBe(false);
    expect(isWall(kind(m, 30, 1))).toBe(false);
    expect(kind(m, 30, 2)).toBe('muro');
    // the ashlar never shows east of the flank
    for (let y = 0; y < 16; y++) expect(kind(m, 31, y), `row ${y}`).toBe('pasto');
    // on the lit side the wall goes on (west): the top's corner is cut 1 px, the ashlar shows in it
    expect(kind(m, 16, 0)).not.toBe('tope');
    expect(kind(m, 17, 0)).toBe('tope');
  });

  it('a wall the ashlar does not go on past: both top corners round, nothing of the ashlar out on either side', () => {
    const north = ASH('norte', [0.9, 1.9], [0, 1]);
    const m = paintMap(recipe([GRASS, north, { ...wall(['norte']), shape: { rect: [1, 0.5, 0.75, 9] } }]), game);
    expect(isWall(kind(m, 16, 0))).toBe(false);
    expect(isWall(kind(m, 17, 0))).toBe(false);
    expect(isWall(kind(m, 16, 1))).toBe(false);
    expect(kind(m, 16, 2)).toBe('tope');
    for (let y = 0; y < 16; y++) { expect(kind(m, 14, y)).toBe('pasto'); expect(kind(m, 31, y)).toBe('pasto'); }
  });

  it('a join with an ashlar not painted before, or one that does not meet the wall, says so', () => {
    expect(() => paintMap(recipe([GRASS, wall(['sur'])]), game)).toThrow(/no ashlar "sur"/);
    expect(() => paintMap(recipe([GRASS, ASH('lejos', [4, 5], [10, 11]), wall(['lejos'])]), game)).toThrow(/does not meet/);
  });
});

describe('map ashlar: round', () => {
  it('its ends are not the vertex of a box: the top corners cut 2 and 1 px, the west end lit, the east one in shadow', () => {
    const m = paintMap(recipe([GRASS, ASH('pilar', [1, 3], [2, 3])]), game);
    const r = paintMap(recipe([GRASS, ASH('pilar', [1, 3], [2, 3], { round: true })]), game);
    // x 16..47, y 32..47: square without, round with
    expect(kind(m, 16, 32)).toBe('muro');
    expect(kind(m, 47, 32)).toBe('muro');
    for (const [x, y] of [[16, 32], [16, 33], [17, 32], [47, 32], [47, 33], [46, 32]]) expect(kind(r, x, y), `${x},${y}`).toBe('pasto');
    expect(kind(r, 16, 34)).toBe('muro');
    expect(kind(r, 18, 32)).toBe('muro');
    expect(at(r, 16, 35)).toBe('piedra clara');
    expect(at(r, 47, 35)).toBe('túnica oscura');
  });
});
