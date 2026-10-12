// @vitest-environment node
// crag.jag, crag.settle and umbra.ramp (11 October, The Unwritten Dao: the forge of Peng, «parece una casa con rocas
// arriba»): a risco a house is dug into is one rounded mass, not teeth; its face reads as one surface, not stripes of
// top and face; and the shadow of its brow darkens the basalt tiles of the roof without darkening every basalt of the
// map (the recipe's shade table).
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';

const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const ROCK = ['tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto claro', 'basalto luz', 'niebla sombra'];
const TILE = ['tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz'];
const MATS: MapRecipe['materials'] = {
  pasto: { ramp: GRASS, base: 2, texture: 'flat' }, roca: { ramp: ROCK }, teja: { ramp: TILE, base: 4, texture: 'flat' },
  laja: { ramp: TILE, base: 4, texture: 'flat' },
};
const game: MapGame = { width: 12, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(12)), decor: [] };
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
const crag = (extra: object): MapStep => ({ step: 'crag', material: 'roca', salt: 5811, snow_cap: -1,
  masses: [[6, 1, 60, 24, 54]], ...extra } as unknown as MapStep);
const paint = (steps: MapStep[], shade?: Record<string, string>) =>
  paintMap({ game, materials: MATS, steps: [{ step: 'area', material: 'pasto', shape: 'all' } as MapStep, ...steps], ...(shade ? { shade } : {}) }, game);
/** the top line of the rock: the first rock px of each column */
const topLine = (m: PaintedMap) => {
  const out: number[] = [];
  for (let x = 0; x < m.width; x++) {
    let y = 0;
    while (y < m.height && m.kind[y * m.width + x] !== 'roca') y++;
    if (y < m.height) out.push(y);
  }
  return out;
};
const wiggle = (ys: number[]) => ys.slice(1).reduce((s, y, i) => s + Math.abs(y - ys[i]), 0);

describe('crag.jag: how much its top line wanders', () => {
  it('as always without it, and a low jag gives a top line with far less zigzag', () => {
    const before = paint([crag({})]), same = paint([crag({ jag: 0.3 })]), smooth = paint([crag({ jag: 0.1 })]);
    expect(same.layers.ground.px).toEqual(before.layers.ground.px);
    expect(wiggle(topLine(smooth))).toBeLessThan(wiggle(topLine(before)) * 0.7);
  });
});

describe('crag.dome: a round top, not a peak', () => {
  it('as always without it; with it the crown is wide, not a peak', () => {
    const before = paint([crag({ jag: 0.1 })]), off = paint([crag({ jag: 0.1, dome: false })]), dome = paint([crag({ jag: 0.1, dome: true })]);
    expect(off.layers.ground.px).toEqual(before.layers.ground.px);
    // how wide its crown is: the columns whose top is within 4 px of the highest one (a peak: a few; a dome: many)
    const crown = (m: PaintedMap) => { const ys = topLine(m), top = Math.min(...ys); return ys.filter(y => y - top <= 4).length; };
    expect(crown(dome)).toBeGreaterThan(crown(before) * 1.5);
  });
});

describe('crag.settle: one surface, not stripes of top and face', () => {
  it('as always at 0, and with it a column never flips top/face/top in runs that short', () => {
    const before = paint([crag({ jag: 0.12 })]), zero = paint([crag({ jag: 0.12, settle: 0 })]);
    expect(zero.layers.ground.px).toEqual(before.layers.ground.px);
    const flips = (m: PaintedMap) => {
      let n = 0;
      for (let x = 0; x < m.width; x++) {
        const col: string[] = [];
        for (let y = 0; y < m.height; y++) col.push(at(m, x, y) ?? '');
        for (let y = 1; y < col.length - 1; y++) if (col[y] !== col[y - 1] && col[y] !== col[y + 1]) n++;
      }
      return n;
    };
    const settled = paint([crag({ jag: 0.12, settle: 3, relief: { facets: 3, cracks: 0 } })]);
    const raw = paint([crag({ jag: 0.12, relief: { facets: 3, cracks: 0 } })]);
    expect(flips(settled)).toBeLessThan(flips(raw));
    // the silhouette does not change: settle only says which px are top and which face
    expect(settled.kind).toEqual(raw.kind);
  });
});

describe('crag.columns: the lajas of its face as tall columns', () => {
  it('as always without it, and with it the face runs longer down each column than across', () => {
    const rel = { relief: { facets: 6, cracks: 2, height: 1.6 }, masses: [[6, 0.5, 70, 8, 110]] };
    const before = paint([crag({ jag: 0.12, ...rel })]), two = paint([crag({ jag: 0.12, ...rel, columns: 2 })]);
    expect(two.layers.ground.px).toEqual(before.layers.ground.px);
    const plain = paint([crag({ jag: 0.12 })]), plainNone = paint([crag({ jag: 0.12, columns: undefined })]);
    expect(plainNone.layers.ground.px).toEqual(plain.layers.ground.px);
    // the dark seams between lajas that run across (a seam px with another beside it): a tall laja has fewer
    const SEAM = new Set(['nieve noche', 'túnica noche']);
    const across = (m: PaintedMap) => {
      let n = 0;
      const seam = (x: number, y: number) => m.kind[y * m.width + x] === 'roca' && SEAM.has(at(m, x, y) ?? '');
      for (let y = 0; y < m.height; y++) for (let x = 1; x < m.width - 1; x++) {
        if (seam(x, y) && seam(x + 1, y) && seam(x - 1, y) && !seam(x, y + 1) && !seam(x, y - 1)) n++;
      }
      return n;
    };
    const tall = paint([crag({ jag: 0.12, ...rel, columns: 5 })]);
    expect(across(tall)).toBeLessThan(across(before) * 0.7);
    expect(tall.kind).toEqual(before.kind);
  });
});

describe('umbra.ramp: a step down inside the ramp of the px material', () => {
  const tiles: MapStep = { step: 'area', material: 'teja', shape: { rect: [0, 6, 12, 2] } } as MapStep;
  const flags: MapStep = { step: 'area', material: 'laja', shape: { rect: [0, 8, 12, 2] } } as MapStep;
  const rock: MapStep = { step: 'area', material: 'roca', shape: { rect: [0, 0, 12, 6] } } as MapStep;
  const brow = (ramp: boolean): MapStep => ({ step: 'umbra', on: ['teja'], deep: true, ...(ramp ? { ramp: true } : {}),
    along: [{ of: ['roca'], px: [3, 3], salt: 5 }] } as unknown as MapStep);
  const SHADE = { 'prado': 'prado sombra' };   // a shade table that knows no basalt (the one of the game)
  it('with a shade table that does not know the color, the table leaves the tiles alone and the ramp darkens them', () => {
    const plain = paint([rock, tiles, flags, brow(false)], SHADE), ramp = paint([rock, tiles, flags, brow(true)], SHADE);
    expect(at(plain, 40, 96)).toBe('basalto claro');           // the base of the tiles: the table does not know it
    expect(at(ramp, 40, 96)).toBe('basalto sombra');           // two steps down its ramp (deep)
    expect(at(ramp, 40, 100)).toBe('basalto claro');           // past the band, as it was
    expect(at(ramp, 40, 140)).toBe(at(plain, 40, 140));        // the same basalt in another material: untouched
  });
});
