// @vitest-environment node
// The chains of the bridges of the Campana Alta (unwritten-dao, 11 oct): a rope whose sag is a vector droops off to the
// side (a chain along a north-south bridge), and `chain` draws it in links of two tones; bells hang from it.
import { describe, it, expect } from 'vitest';
import { paintMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const MATS: MapRecipe['materials'] = { suelo: { ramp: ['nieve sombra', 'nieve', 'túnica luz'], base: 1 } };
const game: MapGame = { width: 10, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(10)), decor: [] };
const GROUND: MapStepOf<'area'> = { step: 'area', material: 'suelo', shape: 'all' };
const lit = (st: MapStepOf<'rope'>) => {
  const m = paintMap({ game, materials: MATS, steps: [GROUND, st] }, game), pts: [number, number, string][] = [];
  m.layers.front.px.forEach((c, i) => { if (c !== null) pts.push([i % m.width, Math.floor(i / m.width), c]); });
  return pts;
};

describe('map rope: chains', () => {
  it('a sag that is a vector droops to the side: a north-south rope bows out west by about its x', () => {
    const pts = lit({ step: 'rope', from: [5, 1], to: [5, 7], sag: [-6, 2] });
    const xs = pts.map(p => p[0]);
    expect(Math.min(...xs)).toBe(80 - 6);                       // the middle, 6 px west of the posts
    expect(Math.max(...xs)).toBe(80);                           // the ends stay on the posts
    // one piece from end to end (each px touches the next one)
    const has = new Set(pts.map(([x, y]) => `${x},${y}`));
    expect(has.has('80,16') && has.has('80,112')).toBe(true);
    const seen = new Set(['80,16']), todo: [number, number][] = [[80, 16]];
    while (todo.length) {
      const [x, y] = todo.pop()!;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = `${x + dx},${y + dy}`;
        if (has.has(k) && !seen.has(k)) { seen.add(k); todo.push([x + dx, y + dy]); }
      }
    }
    expect(seen.size).toBe(has.size);
    // a plain number is the sag down the screen, as always: straight down stays on its column
    expect(new Set(lit({ step: 'rope', from: [5, 1], to: [5, 7], sag: 5 }).map(p => p[0]))).toEqual(new Set([80]));
  });

  it('chain: links in two tones, a flat link with a px of its far side beside it; without it, the one color', () => {
    const st: MapStepOf<'rope'> = { step: 'rope', from: [1, 2], to: [8, 2], sag: 4, chain: { colors: ['basalto sombra', 'basalto luz'], link: 4 } };
    const pts = lit(st);
    const colors = new Set(pts.map(p => p[2]));
    expect(colors).toEqual(new Set(['basalto sombra', 'basalto luz']));
    const dark = pts.filter(p => p[2] === 'basalto sombra').length, light = pts.length - dark;
    expect(light).toBeGreaterThan(pts.length / 5);
    expect(dark).toBeGreaterThan(light);
    // more px than columns: the far sides of the flat links hang under them
    expect(pts.length).toBeGreaterThan(7 * 16 + 1);
    expect(new Set(lit({ ...st, chain: undefined }).map(p => p[2]))).toEqual(new Set(['madera sombra']));
  });

  it('bells hang from a chain at their place along it', () => {
    const bell = { at: 0.5, rows: ['.o.', 'ooo', 'ooo', '.c.'], glyphs: { o: 'oro', c: 'bronce' }, offset: [-1, 1] as [number, number] };
    const pts = lit({ step: 'rope', from: [5, 1], to: [5, 7], sag: [-6, 2], chain: {}, hang: [bell] });
    const gold = pts.filter(p => p[2] === 'oro');
    expect(gold.length).toBe(7);
    expect(Math.min(...gold.map(p => p[0]))).toBeLessThan(80 - 4);   // at the middle of the swag, off the deck
  });
});
