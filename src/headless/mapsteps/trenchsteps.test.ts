// @vitest-environment node
// The trench: a channel cut down into the ground along a curve (unwritten-dao #379: the canals of the top of the wall of
// water and the seam of the ice caves read as ribbons laid flat on the snow). The face of the far bank across the cut,
// lit at its rim and darker toward the water; the water at the bottom; the lips; a bridge with its deck and its arch;
// a glowing bottom lights its faces; a channel that leaves a pool opens into it.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const WATER = ['agua de hielo honda', 'agua de hielo', 'agua de hielo luz', 'nube', 'ojo'];
const ROCK = ['tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla'];
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: ['nube media', 'nube media'] },
  agua: { ramp: WATER },
  roca: { ramp: ROCK },
  losas: { ramp: ['basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla'] },
};
const game: MapGame = { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)), decor: [] };
const SNOW: MapStepOf<'area'> = { step: 'area', material: 'nieve', shape: 'all' };
// an east-west cut across the middle (row 96 px), 8 px deep, and a north-south one in column 48 px
const EW: MapStepOf<'trench'> = { step: 'trench', material: 'agua', rock: 'roca', curve: [[2, 6, 7], [10, 6, 7]], depth: 8 };
const NS: MapStepOf<'trench'> = { step: 'trench', material: 'agua', rock: 'roca', curve: [[3, 1, 8], [3, 11, 8]], depth: 8, side: 3,
  bridges: [{ v: 6, thick: 8, reach: 4, material: 'losas' }] };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x] ?? null;

describe('map trench', () => {
  const m = paintMap(recipe([SNOW, EW]), game);
  const col = (x: number) => [...Array(m.height).keys()].map(y => at(m, x, y));

  it('across the cut: the lit lip, the face of the far bank darker toward the water, the water, the dark near lip', () => {
    const c = col(96);
    const first = c.findIndex(p => p !== 'nube media'), last = c.length - 1 - [...c].reverse().findIndex(p => p !== 'nube media');
    expect(first).toBeGreaterThan(80);
    expect(last).toBeLessThan(110);
    expect(c[first]).toBe('basalto luz');                                   // the lip of the far bank, lit
    const face = c.slice(first + 1, first + 9);
    expect(face.every(p => ROCK.includes(p!))).toBe(true);
    expect(ROCK.indexOf(face[0]!)).toBeGreaterThan(ROCK.indexOf(face[7]!)); // lit at the rim, darker below
    expect(WATER).toContain(c[first + 10]);                                // the water under it
    expect(c[last]).toBe('tinta');                                         // the near lip, a dark edge
  });

  it('deterministic', () => {
    expect(paintMap(recipe([SNOW, EW]), game).layers.ground.px).toEqual(m.layers.ground.px);
  });
});

describe('map trench: bridges, side walls, a glowing bottom, a pool', () => {
  const m = paintMap(recipe([SNOW, NS]), game);
  const row = (y: number) => [...Array(m.width).keys()].map(x => at(m, x, y));

  it('a north-south cut: the west wall in shade, the east wall lit, water between', () => {
    const r = row(40), xs = r.map((p, x) => (p !== 'nube media' ? x : -1)).filter(x => x >= 0);
    expect(xs.length).toBeGreaterThan(10);
    const walls = xs.filter(x => ROCK.includes(r[x]!));
    const west = walls.filter(x => x < 48), east = walls.filter(x => x > 48);
    expect(west.length).toBeGreaterThan(1);
    expect(east.length).toBeGreaterThan(1);
    expect(ROCK.indexOf(r[east[0]]!)).toBeGreaterThan(ROCK.indexOf(r[west[west.length - 1]]!));
    expect(r.some(p => WATER.includes(p!))).toBe(true);
  });

  it('a bridge: slabs across the cut and past its lips, under it the arch with the dark under its crown', () => {
    const deck = row(96);
    expect(deck.filter(p => ['basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla'].includes(p!)).length).toBeGreaterThan(20);
    const under = row(105);
    expect(under[48] === 'tinta' || WATER.includes(under[48]!)).toBe(true);
    expect(ROCK).toContain(under[40]);                                     // the spandrel beside the arch
  });

  it('a glowing bottom: bright in the middle, the faces lit from below', () => {
    const g = paintMap(recipe([SNOW, { ...EW, glow: true }]), game);
    expect(['nube', 'ojo']).toContain(at(g, 96, 98));                          // under the face, the bright seam
    const e = paintMap(recipe([SNOW, EW]), game);
    expect(['nube', 'ojo']).not.toContain(at(e, 96, 98));
    expect(ROCK.indexOf(at(g, 96, 96)!)).toBeGreaterThan(ROCK.indexOf(at(e, 96, 96)!));   // the foot of the face lit from below
  });

  it('a channel that leaves a pool opens into it: no face where the water already is', () => {
    const POOL: MapStepOf<'water'> = { step: 'water', material: 'agua', shape: { blobs: [[3, 2, 3, 2, 0]] } } as MapStepOf<'water'>;
    const p = paintMap(recipe([SNOW, POOL, { ...NS, curve: [[3, 2, 8], [3, 11, 8]] }]), game);
    for (let y = 40; y < 52; y++) expect(ROCK.slice(0, 5)).not.toContain(at(p, 48, y));
  });
});
