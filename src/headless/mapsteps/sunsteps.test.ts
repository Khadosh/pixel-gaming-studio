// @vitest-environment node
// One light for the whole map (unwritten-dao docs/diseno/isla.md, vuelta 22): a recipe whose `light` is
// `{dir, length, tone}` has a sun, and every step that casts throws its shadow by the same rule — a point h px up
// lands length·h px from its foot along dir — into one mask laid once: a tree and a building fall the same way in
// the same proportion, two shadows over each other darken once, a place paints with the mother's sun, and a recipe
// without the sun paints what it always painted.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { paintMap, type PaintedMap } from '../mappaint';
import { expandPlaces } from '../mapplace';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'];
const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const MATS: MapRecipe['materials'] = {
  suelo: { ramp: GRASS, base: 2 },
  lajas: { ramp: STONE, texture: 'flagstones' },
  tierra: { ramp: ['túnica noche', 'madera sombra', 'tierra sombra', 'tierra'] },
  tablas: { ramp: ['túnica noche', 'madera sombra', 'madera', 'madera clara', 'arena'] },
  teja: { ramp: ['tinta', 'tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz'] },
  piedra: { ramp: STONE },
  revoque: { ramp: ['piedra sombra', 'piedra', 'túnica sombra', 'pergamino'] },
  vigas: { ramp: ['tinta', 'madera sombra', 'madera', 'madera clara', 'arena'] },
  toldo: { ramp: ['tinta', 'madera sombra', 'bermellón', 'bermellón claro', 'piel sombra', 'piel'] },
};
const game: MapGame = { width: 24, height: 16, grid: Array.from({ length: 16 }, () => '.'.repeat(24)), decor: [] };
const GROUND: MapStep = { step: 'area', material: 'suelo', shape: 'all' };

// a yard with one of everything that casts: a grove, a building with a chimney, a stall, a fence, beds, a stamp
// that stands, a hand-placed umbra and a light step
const YARD: MapStep[] = [
  GROUND,
  { step: 'area', id: 'patio', material: 'lajas', shape: { rect: [2, 8, 9, 3] } },
  { step: 'building', id: 'casa', rect: [2, 2, 8, 4], wall: 30, material: 'revoque', frame: 'vigas', stone: 'piedra',
    shadow: { offset: [8, 3], on: ['suelo', 'lajas'] }, roof: { material: 'teja', hip: 10, upturn: 6 } },
  { step: 'chimney', id: 'horno', at: [4, 4], material: 'piedra', base: [10, 14], stack: [6, 10],
    shadow: { px: 4, on: ['casa roof', 'suelo', 'lajas'] } },
  { step: 'stall', id: 'puesto', rect: [14, 9, 3, 1.5], cloth: 'toldo', wood: 'tablas', layer: 'techos',
    goods: [{ kind: 'pottery' }], shadow: { on: ['suelo'] } },
  { step: 'fence', id: 'cerca', material: 'vigas', path: [[12, 12], [20, 12]], shadow: 1, on: ['suelo'], salt: 1901 },
  { step: 'beds', id: 'huerto', soil: 'tierra', frame: 'tablas', beds: [[2, 12, 3, 2]], plants: [{ shape: 'leafy' }],
    rise: 3, shadow: { offset: [4, 3], on: ['suelo'] } },
  { step: 'scatter', what: 'stamp', at: [[11, 9]], rows: ['.AA.', 'AAAA', 'AAAA', 'AAAA', '.AA.'], glyphs: { A: 'madera' }, stands: true },
  { step: 'umbra', on: ['suelo'], ovals: [[21, 4, 6, 2, 701]] },
  { step: 'cast', on: ['suelo', 'lajas'] },
  { step: 'grove', id: 'arboleda', layer: 'copas', trees: [[14, 5, 'round', 3, 4013], [18, 6, 'pine', 3, 4026], [21, 9, 'bush', 0.8, 4039]] },
  { step: 'light', on: ['suelo', 'lajas'], crowns: [0.6, 0.32, 0.1, 0.8], casts: [[22, 14, 10, 4, 603]] },
];

const recipe = (steps: MapStep[], light?: MapRecipe['light']): MapRecipe => ({ game, materials: MATS, steps, ...(light ? { light } : {}) });
const hash = (m: PaintedMap) => {
  const h = createHash('sha256');
  for (const name of Object.keys(m.layers).sort()) h.update(name + ':' + m.layers[name].px.map(c => c ?? '.').join(','));
  h.update(m.kind.join(','));
  return h.digest('hex');
};
const ground = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
/** The px of the grass that a recipe darkened against the bare ground (not what it laid on it: a stamp keeps the kind). */
const shadowOf = (m: PaintedMap, bare: PaintedMap): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const i = y * m.width + x;
    if (m.kind[i] === 'suelo' && GRASS.includes(m.layers.ground.px[i] ?? '') && m.layers.ground.px[i] !== bare.layers.ground.px[i]) out.push([x, y]);
  }
  return out;
};
const down = (c: string | null, n: number) => { let i = GRASS.indexOf(c ?? ''); for (let k = 0; k < n; k++) i = Math.max(0, i - 1); return GRASS[i]; };

describe('the sun of a map', () => {
  it('without the sun, every step casts as it always did: the yard is the same px with no light and with [1, 1]', () => {
    // pinned before the sun existed (the yard painted by the code of 9 October)
    const PIN = '083b2c33698a82116349192f1273b209cfb329534caa70455f6e39fba311e174';
    expect(hash(paintMap(recipe(YARD), game))).toBe(PIN);
    expect(hash(paintMap(recipe(YARD, [1, 1]), game))).toBe(PIN);
  });

  it('a tree and a building throw their shadows the same way and in the same proportion of their height', () => {
    const bare = paintMap(recipe([GROUND]), game);
    const TREE: MapStep = { step: 'grove', id: 'g', layer: 'copas', trees: [[8, 8, 'round', 3, 4013]] };
    const HOUSE: MapStep = { step: 'building', id: 'casa', rect: [4, 3, 8, 4], wall: 30, material: 'revoque', frame: 'vigas',
      stone: 'piedra', shadow: { on: ['suelo'] }, roof: { material: 'teja', hip: 10, upturn: 6 } };
    const dir: [number, number] = [1, 0.6], n = Math.hypot(...dir), u: [number, number] = [dir[0] / n, dir[1] / n];
    const sun = (length: number): MapRecipe['light'] => ({ dir, length, tone: 1, fray: 0 });
    // how far down the light the shadow reaches from the foot, and where its middle is
    const reach = (px: [number, number][], foot: [number, number]) => Math.max(...px.map(([x, y]) => (x - foot[0]) * u[0] + (y - foot[1]) * u[1]));
    const mid = (px: [number, number][]) => [px.reduce((a, p) => a + p[0], 0) / px.length, px.reduce((a, p) => a + p[1], 0) / px.length];
    const measure = (step: MapStep, foot: [number, number], tall: number) => {
      const a = paintMap(recipe([GROUND, step], sun(0.3)), game), b = paintMap(recipe([GROUND, step], sun(0.8)), game);
      const sa = shadowOf(a, bare), sb = shadowOf(b, bare);
      const per = (reach(sb, foot) - reach(sa, foot)) / (0.5 * tall);     // the reach grows by Δlength · height
      const [ax, ay] = mid(sa), [bx, by] = mid(sb), m = Math.hypot(bx - ax, by - ay);
      return { per, cos: ((bx - ax) * u[0] + (by - ay) * u[1]) / m };
    };
    // the tree: 3 cells tall, its foot on the cell's bottom edge
    const tree = measure(TREE, [8 * 16, 8 * 16], 48);
    // the building: its foot is the row under the rect, its height up to the top of its roof
    const hb = paintMap(recipe([GROUND, HOUSE], sun(0.3)), game);
    const top = Math.min(...hb.kind.flatMap((k, i) => (k === 'teja' ? [Math.floor(i / hb.width)] : [])));
    const F = 7 * 16, house = measure(HOUSE, [12 * 16, F], F - top);
    for (const r of [tree, house]) {
      expect(r.per).toBeGreaterThan(0.85);
      expect(r.per).toBeLessThan(1.15);
      expect(r.cos).toBeGreaterThan(0.95);
    }
  });

  it('two shadows over each other darken once: every shaded px of the grass is `tone` steps down, never more', () => {
    const bare = paintMap(recipe([GROUND]), game);
    // two trees whose crowns overlap, and a hand-placed umbra over both
    const steps: MapStep[] = [GROUND,
      { step: 'grove', id: 'g', layer: 'copas', trees: [[8, 8, 'round', 3, 4013], [9.2, 8.3, 'round', 3, 4014]] },
      { step: 'umbra', on: ['suelo'], ovals: [[8.6, 8.2, 30, 10, 7]] }];
    const m = paintMap(recipe(steps, { dir: [1, 0.6], length: 0.4, tone: 2 }), game);
    const shaded = shadowOf(m, bare);
    expect(shaded.length).toBeGreaterThan(300);
    for (const [x, y] of shaded) expect(ground(m, x, y)).toBe(down(ground(bare, x, y), 2));
  });

  it('the whole yard under the sun: one tone everywhere, nothing cast on what casts', () => {
    const bare = paintMap(recipe([GROUND, YARD[1]]), game);
    const m = paintMap(recipe(YARD, { dir: [1, 0.6], length: 0.3, tone: 1 }), game);
    const shaded = shadowOf(m, bare);
    expect(shaded.length).toBeGreaterThan(1000);
    for (const [x, y] of shaded) expect(ground(m, x, y)).toBe(down(ground(bare, x, y), 1));
    // the counter of the stall, the boards of the beds and the stamp that stands keep their own colors
    const solo = (s: MapStep) => paintMap(recipe([GROUND, YARD[1], s]), game);
    for (const i of [4, 6, 7]) {
      const alone = solo(YARD[i]);
      for (let k = 0; k < alone.kind.length; k++) if (!['suelo', 'lajas', ''].includes(alone.kind[k]) && m.kind[k] === alone.kind[k]) {
        expect(m.layers.ground.px[k]).toBe(alone.layers.ground.px[k]);
      }
    }
  });

  it('a place paints with the light of the mother: the same px as written inline, whatever the place says', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-sun-'));
    const HOUSE = { step: 'building', id: 'casa', rect: [1, 1, 8, 4], wall: 30, material: 'revoque', frame: 'vigas',
      stone: 'piedra', shadow: { on: ['suelo'] }, roof: { material: 'teja', hip: 10, upturn: 6 } };
    // the place says nothing of the light (and if it did, the mother's would rule: a place has no light of its own)
    writeFileSync(join(dir, 'lugar.json'), JSON.stringify({ size: [10, 7], light: [-1, -1], steps: [HOUSE] }));
    const sun: MapRecipe['light'] = { dir: [1, 0.6], length: 0.5, tone: 2 };
    const placed = paintMap(expandPlaces(recipe([GROUND, { step: 'place', recipe: 'lugar.json', at: [3, 2] }], sun), join(dir, 'madre.json')), game);
    const inline = paintMap(recipe([GROUND, { ...HOUSE, rect: [4, 3, 8, 4] } as MapStep], sun), game);
    const old = paintMap(recipe([GROUND, { ...HOUSE, rect: [4, 3, 8, 4] } as MapStep]), game);
    expect(hash(placed)).toBe(hash(inline));
    expect(hash(placed)).not.toBe(hash(old));
  });

  it('the grass under a crown is in its shadow: around the foot of the trunk, on both sides', () => {
    const bare = paintMap(recipe([GROUND]), game);
    const m = paintMap(recipe([GROUND, { step: 'grove', id: 'g', layer: 'copas', trees: [[8, 8, 'round', 3, 4013]] }],
      { dir: [0.4, 1], length: 0.1, tone: 2 }), game);
    const fx = 8 * 16, fy = 8 * 16;
    for (const [x, y] of [[fx - 12, fy - 4], [fx + 12, fy - 4], [fx - 6, fy + 2], [fx + 8, fy + 3]]) {
      expect(ground(m, x, y)).toBe(down(ground(bare, x, y), 2));
    }
  });
});
