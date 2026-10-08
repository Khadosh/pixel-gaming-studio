// @vitest-environment node
// The place step: a recipe inside another one, laid at `at` (mapplace.ts).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderRecipe } from './mapfile';
import { moveStep } from './mapplace';
import type { MapRecipe, MapStep } from './maprecipe';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-place-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const STONE = ['túnica oscura', 'piedra sombra', 'piedra', 'niebla', 'túnica sombra', 'piedra clara', 'pergamino', 'túnica luz'];
const WATER = ['celeste oscuro', 'celeste', 'celeste luz', 'ojo'];
const MORE = ['madera clara', 'madera', 'madera sombra', 'flor sombra', 'flor', 'flor clara', 'oro claro', 'oro'];
const NAMES = [...new Set([...GRASS, ...STONE, ...WATER, ...MORE])];
const COLORS = Object.fromEntries(NAMES.map((n, i) => [n, `#${(40 + i * 5).toString(16).padStart(2, '0')}${(90 + i * 3).toString(16)}a0`]));

const SUB_MATERIALS = {
  losas: { ramp: STONE },
  estanque: { ramp: ['hoja sombra', ...WATER], texture: 'water' as const },
};

/** The steps of a small walled court in its own cells: a paved box, a pond, a shadow, two flowers. */
function courtSteps(du = 0, dv = 0): MapStep[] {
  const steps: MapStep[] = [
    { step: 'courses', material: 'losas', box: [0.5, 0.5, 5.5, 3.5], row: 9, cracks: 2, wear: { lanes: [[3, 1, 12, 0.2]], spots: { amount: 0.1, r: [8, 5], at: [[2, 2]] } } },
    { step: 'water', id: 'estanque', material: 'estanque', shape: { blobs: [[3, 4.6, 1.6, 0.6, 0.1, 77, 0.05]] }, waves: 200 },
    { step: 'umbra', on: ['grass'], ovals: [[6, 2, 4, 9, 501]] },
    { step: 'scatter', what: 'flowers', on: ['grass'], near: [], at: [[1, 4.5], [5.4, 4.6]], colors: [['flor clara', 'flor'], ['oro claro', 'oro']] },
  ];
  return steps.map(s => moveStep(s, du, dv));
}

/** A 14 × 10 map of grass with the steps given (and a grove at the end). */
function mother(steps: MapStep[], extra: Partial<MapRecipe> = {}): MapRecipe {
  return {
    game: { width: 14, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(14)) },
    margin: [1, 1], colors: COLORS,
    materials: { grass: { ramp: GRASS, texture: 'patches', shade_min: 1 } },
    steps: [{ step: 'area', material: 'grass', shape: 'all' }, ...steps, { step: 'grove', id: 'arboleda', trees: [[1.5, 8.9, 'round', 2.4]] }],
    ...extra,
  };
}

function write(name: string, json: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(json));
  return path;
}

const court = (extra: object = {}) => write('court.json', { size: [6, 5], materials: SUB_MATERIALS, steps: courtSteps(), ...extra });

describe('the place step', () => {
  it('paints exactly what the same steps written inline at that place paint', () => {
    court();
    const inline = renderRecipe(write('inline.json', { ...mother(courtSteps(4, 3)), materials: { grass: { ramp: GRASS, texture: 'patches', shade_min: 1 }, ...SUB_MATERIALS } }));
    const placed = renderRecipe(write('placed.json', mother([{ step: 'place', recipe: 'court.json', at: [4, 3] }])));
    for (const name of Object.keys(inline.map.layers)) expect(placed.map.layers[name].px).toEqual(inline.map.layers[name].px);
    expect(placed.map.kind).toEqual(inline.map.kind);
    // and the place really painted: its stone and its water are on the ground
    expect(placed.map.layers.ground.px).toContain('piedra clara');
    expect(placed.map.layers.ground.px).toContain('celeste');
  });

  it('moving it is changing `at`: the same picture, two cells to the right', () => {
    court();
    const a = renderRecipe(write('a.json', mother([{ step: 'place', recipe: 'court.json', at: [3, 3] }]))).map;
    const b = renderRecipe(write('b.json', mother([{ step: 'place', recipe: 'court.json', at: [5, 3] }]))).map;
    const stone = (m: typeof a, x: number, y: number) => m.kind[y * m.width + x];
    let paved = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x + 32 < a.width; x++) {
      if (stone(a, x, y) !== 'losas') continue;
      paved++;
      expect(stone(b, x + 32, y)).toBe('losas');
      expect(stone(b, x, y) === 'losas').toBe(x >= 32 + 16 * 4 && stone(a, x - 32, y) === 'losas');
    }
    expect(paved).toBeGreaterThan(5 * 16 * 2 * 16);
  });

  it('reserves its rectangle: the fixed places of a scatter of the mother inside it are skipped', () => {
    court();
    const flowers = (outside?: string[]): MapStep => ({ step: 'scatter', what: 'flowers', on: ['grass'], near: [], at: [[2, 2], [10, 2]], colors: [['flor clara', 'flor']], ...(outside ? { outside } : {}) });
    // the mask is there from the first step: the flowers before the place already keep out of it
    const masked = renderRecipe(write('n.json', mother([flowers(['patio']), { step: 'place', recipe: 'court.json', at: [6, 1], reserve: 'patio' }])));
    const open = renderRecipe(write('o.json', mother([flowers(), { step: 'place', recipe: 'court.json', at: [6, 1], reserve: 'patio' }])));
    const count = (m: typeof masked) => m.map.layers.ground.px.filter(c => c === 'flor clara').length;
    expect(count(masked)).toBeLessThan(count(open));
    expect(masked.recipe.masks).toEqual({ patio: [[6, 1, 6, 5]] });
  });

  it('a grove with "into" adds its trees to that grove of the mother, and a tree with its salt keeps its shape anywhere in the list', () => {
    const tree: [number, number, 'pine', number] = [3, 2.9, 'pine', 2.2];
    court({ steps: [...courtSteps(), { step: 'grove', into: 'arboleda', trees: [[...tree, 2300 + 13]] }] });
    const placed = renderRecipe(write('p.json', mother([{ step: 'place', recipe: 'court.json', at: [4, 3] }])));
    const g = placed.recipe.steps.find(s => s.step === 'grove')!;
    expect(g.step === 'grove' && g.trees).toEqual([[1.5, 8.9, 'round', 2.4], [7, 5.9, 'pine', 2.2, 2313]]);
    // the same tree second in a list, without its salt, is the same tree
    const second = renderRecipe(write('s.json', { ...mother(courtSteps(4, 3)), materials: { grass: { ramp: GRASS, texture: 'patches', shade_min: 1 }, ...SUB_MATERIALS },
      steps: [...mother(courtSteps(4, 3)).steps.slice(0, -1), { step: 'grove', id: 'arboleda', trees: [[1.5, 8.9, 'round', 2.4], [7, 5.9, 'pine', 2.2]] }] }));
    expect(placed.map.layers.copas.px).toEqual(second.map.layers.copas.px);
    expect(placed.map.layers.copas.px.filter(c => c !== null).length).toBeGreaterThan(0);
  });

  it('refuses what it cannot lay, and says why', () => {
    court({ steps: [{ step: 'motes', on: ['grass'], over: ['pasto'], tries: 5, clear: [2, 2], colors: ['oro'], layer: 'motas' }] });
    expect(() => renderRecipe(write('x.json', mother([{ step: 'place', recipe: 'court.json', at: [1, 1] }])))).toThrow(/a motes step cannot be laid by a place/);
    court({ materials: { grass: { ramp: ['hoja'] } } });
    expect(() => renderRecipe(write('y.json', mother([{ step: 'place', recipe: 'court.json', at: [1, 1] }])))).toThrow(/material "grass" is also in the mother recipe/);
    court({ steps: [{ step: 'grove', into: 'nadie', trees: [[1, 1]] }] });
    expect(() => renderRecipe(write('z.json', mother([{ step: 'place', recipe: 'court.json', at: [1, 1] }])))).toThrow(/grove "nadie"/);
    court({ size: undefined });
    expect(() => renderRecipe(write('w.json', mother([{ step: 'place', recipe: 'court.json', at: [1, 1], reserve: 'r' }])))).toThrow(/has no size/);
  });

  it('a place inside a place lands at the sum of the two', () => {
    court();
    write('outer.json', { size: [8, 6], steps: [{ step: 'place', recipe: 'court.json', at: [1, 1] }] });
    const nested = renderRecipe(write('q.json', mother([{ step: 'place', recipe: 'outer.json', at: [3, 2] }])));
    const direct = renderRecipe(write('d.json', mother([{ step: 'place', recipe: 'court.json', at: [4, 3] }])));
    expect(nested.map.layers.ground.px).toEqual(direct.map.layers.ground.px);
    write('loop.json', { steps: [{ step: 'place', recipe: 'loop.json', at: [1, 1] }] });
    expect(() => renderRecipe(write('l.json', mother([{ step: 'place', recipe: 'loop.json', at: [0, 0] }])))).toThrow(/lays itself/);
  });
});
