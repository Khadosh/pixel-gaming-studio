// @vitest-environment node
// The grove step: trees planted by recipe, drawn by one hand.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const SHADE = { 'hoja clara': 'hoja', bambú: 'hoja', 'bambú claro': 'hoja', pasto: 'hoja', hoja: 'hoja sombra' };
function game(rows?: string[]): MapGame { const g = rows ?? Array.from({ length: 8 }, () => '.'.repeat(12)); return { width: g[0].length, height: g.length, grid: g }; }
function recipe(steps: MapRecipe['steps'], g = game()): MapRecipe {
  return { game: g, margin: [2, 2], shade: SHADE, materials: { pasto: { ramp: GRASS, base: 4 } }, steps };
}
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const P = (u: number, v: number): [number, number] => [32 + u * 16, 32 + v * 16];
const FLOOR = { step: 'area', id: 'isla', material: 'pasto', shape: 'all' } as const;

describe('map recipe: grove', () => {
  it('a tree has its trunk on the ground and an outlined, lit crown in front; the one in front covers the one behind and the light casts them', () => {
    const one: MapStepOf<'grove'> = { step: 'grove', trees: [[3.5, 5.9, 'round', 3]] };
    const m = paintMap(recipe([FLOOR, one]), game());
    const [fx, fy] = P(3.5, 5.9).map(Math.round);
    const bark = ['madera clara', 'madera', 'madera sombra'];
    expect(bark).toContain(at(m, 'ground', fx, fy - 3));                // the trunk, on the ground
    expect(at(m, 'copas', fx, fy - 3)).toBeNull();                      // under the belly of the crown
    const crown = m.layers.copas.px.filter((c): c is string => c !== null);
    for (const c of ['túnica noche', 'hoja sombra', 'hoja', 'bambú']) expect(crown).toContain(c);
    // the outline: the topmost pixel of the crown in the trunk's column is the dark line
    let top = 0;
    while (at(m, 'copas', fx, top) === null) top++;
    expect(at(m, 'copas', fx, top)).toBe('túnica noche');
    // a pine standing in front (lower foot), overlapping: its pixels win where they meet
    const two: MapStepOf<'grove'> = { step: 'grove', trees: [[4.6, 6.9, 'pine', 3], [3.5, 5.9, 'round', 3]] };
    const front = paintMap(recipe([FLOOR, two]), game());
    const pineOnly = paintMap(recipe([FLOOR, { step: 'grove', trees: [[4.6, 6.9, 'pine', 3]] }]), game());
    let shared = 0;
    for (let i = 0; i < front.layers.copas.px.length; i++) {
      const p = pineOnly.layers.copas.px[i];
      if (p !== null && m.layers.copas.px[i] !== null) { shared++; expect(front.layers.copas.px[i]).toBe(p); }
    }
    expect(shared).toBeGreaterThan(10);
    // a later light step casts their shadows (and leaves the bark alone)
    const lit = paintMap(recipe([FLOOR, one, { step: 'light', faces: false, on: ['pasto'] }]), game());
    const dark = paintMap(recipe([FLOOR, one, { step: 'light', faces: false, on: ['pasto'], trees: false }]), game());
    let shaded = 0;
    for (let i = 0; i < lit.layers.ground.px.length; i++) if (lit.layers.ground.px[i] !== dark.layers.ground.px[i]) shaded++;
    expect(shaded).toBeGreaterThan(60);
    expect(at(lit, 'ground', fx, fy - 3)).toBe(at(m, 'ground', fx, fy - 3));
  });

  it('a zone plants by density and salt inside its band, never on a walkable cell nor too close, the same every time', () => {
    // a walkable room in the middle of the grid: the trees go around it
    const rows = Array.from({ length: 8 }, (_, v) => Array.from({ length: 12 }, (_, u) => (u >= 3 && u < 9 && v >= 2 && v < 6 ? '.' : '#')).join(''));
    const zone: MapStepOf<'grove'> = { step: 'grove', zones: [{ within: 'isla', band: [2, 200], count: 30, spacing: 14, salt: 77 }], clear: [[0, 0, 2]] };
    const a = paintMap(recipe([FLOOR, zone], game(rows)), game(rows));
    const b = paintMap(recipe([FLOOR, zone], game(rows)), game(rows));
    expect(a.layers.copas.px).toEqual(b.layers.copas.px);
    // the feet: the outline pixels left and right of the bark at its lowest row
    const feet: [number, number][] = [];
    for (let y = 1; y < a.height; y++) for (let x = 1; x < a.width - 1; x++) {
      const c = at(a, 'ground', x, y), below = at(a, 'ground', x, y + 1);
      if (c === 'madera clara' && at(a, 'ground', x - 1, y) === 'túnica noche' && !['madera clara', 'madera', 'madera sombra'].includes(below ?? '')) feet.push([x, y]);
    }
    expect(feet.length).toBeGreaterThan(8);
    for (const [x, y] of feet) {
      const u = Math.floor((x + 2 - 32) / 16), v = Math.floor((y - 32) / 16);
      const walk = u >= 0 && v >= 0 && u < 12 && v < 8 && rows[v][u] === '.';
      expect(walk, `foot at ${u},${v}`).toBe(false);
      expect(u >= -1 && u <= 1 && v >= -1 && v <= 1, `foot in the cleared spot ${u},${v}`).toBe(false);
    }
    for (const p of feet) for (const q of feet) if (p !== q) expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThanOrEqual(12);
  });
});
