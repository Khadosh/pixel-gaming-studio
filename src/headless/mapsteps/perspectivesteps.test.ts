// @vitest-environment node
// The ring of a brink seen in perspective (`view`): the sect of The Unwritten Dao
// looked, on its west side, like a black wall standing beside the grass. With
// `view` every lip hangs its own face, as wide as it looks south: the south all
// its drop, the west and east a fraction (leaning out, under the grass of the
// lip, with its shadow), the north only the lip.
import { describe, it, expect } from 'vitest';
import { paintMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];
const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
type Step = MapRecipe['steps'][number];

function game(w = 16, h = 12): MapGame { return { width: w, height: h, grid: Array.from({ length: h }, () => '#'.repeat(w)), decor: [] }; }
function recipe(steps: MapRecipe['steps']): MapRecipe {
  return {
    game: game(), margin: [5, 5], light: [1, 1],
    materials: {
      grass: { ramp: ['hoja sombra', 'hoja', 'bambú', 'bambú claro', 'pasto'], base: 2 },
      rock: { ramp: STONE, moss: MOSS },
      sky: { ramp: SKY },
    },
    steps,
  };
}
// an island whose west side runs straight down from row 3 to row 9 (as the sect's does)
const LIP: [number, number][] = [[2, 1], [8, 0.6], [14, 1.2], [15.4, 6], [14.8, 11], [8, 11.2], [2, 11], [0.6, 9], [0.5, 6], [0.6, 3]];
const DROP = 40;
const island = (brink: object = {}): Step[] => [
  { step: 'area', material: 'sky', shape: 'all' } as Step,
  { step: 'area', material: 'grass', shape: 'all' } as Step,
  { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'sky', lip: LIP, drop: [DROP, 0, 0], bushes: [0, 0], drape: [0, 0], ...brink } as Step,
];
const P = (u: number, v: number) => [80 + u * 16, 80 + v * 16];

describe('the ring of a brink seen in perspective (view)', () => {
  const m = paintMap(recipe(island({ view: [0.35, 1] })), game());
  const kind = (x: number, y: number) => m.kind[y * m.width + x];
  const px = (x: number, y: number) => m.layers.ground.px[y * m.width + x];

  it('a west lip shows a face a fraction as wide as the south one is tall; the north only its lip', () => {
    // the south: down from the lip in the middle column
    const [xs] = P(8, 0);
    let ys = m.height - 1;
    while (ys > 0 && kind(xs, ys) !== 'grass') ys--;
    let south = 0;
    for (let y = ys + 1; y < m.height && kind(xs, y) === 'rock'; y++) south++;
    // the west: out from the lip on the row in the middle of the straight side
    const [, yw] = P(0, 6);
    let xw = 0;
    while (xw < m.width && kind(xw, yw) !== 'grass') xw++;
    let west = 0;
    for (let x = xw - 1; x >= 0 && kind(x, yw) === 'rock'; x--) west++;
    // the north: rock over the lip in the middle column
    let yn = 0;
    while (yn < m.height && kind(xs, yn) !== 'grass') yn++;
    let north = 0;
    for (let y = yn - 1; y >= 0 && kind(xs, y) === 'rock'; y--) north++;
    expect(south).toBeGreaterThanOrEqual(DROP - 8);   // (the last px under the banks of cloud)
    expect(west).toBeGreaterThan(0.25 * DROP);
    expect(west).toBeLessThan(0.5 * DROP);
    expect(north).toBeGreaterThanOrEqual(1);
    expect(north).toBeLessThanOrEqual(2);
  });

  it('the face is under the grass: the first px out of a west lip is the shadow of the lip', () => {
    let shaded = 0, rows = 0;
    for (let v = 4; v <= 8; v += 0.5) {
      const [, y] = P(0, v);
      let x = 0;
      while (x < m.width && kind(x, y) !== 'grass') x++;
      rows++;
      if (px(x - 1, y) === STONE[1]) shaded++;
    }
    expect(shaded).toBeGreaterThanOrEqual(rows - 1);
  });

  it('the mountain widens going down: its foot reaches out past the side of the top', () => {
    let topWest = m.width, rockWest = m.width;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (kind(x, y) === 'grass') topWest = Math.min(topWest, x);
      if (kind(x, y) === 'rock') rockWest = Math.min(rockWest, x);
    }
    expect(topWest - rockWest).toBeGreaterThan(0.3 * DROP);
  });

  it('a side ends sooner and no billows float by it: only under the south faces', () => {
    const b = paintMap(recipe(island({ view: [0.35, 0.6], billows: [16, 10, 0] })), game());
    const clouds = new Set(SKY.slice(3));
    const [, below] = P(0, 9);
    let beside = 0, under = 0;
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width / 3; x++) {
      if (!clouds.has(b.layers.ground.px[y * b.width + x] ?? '')) continue;
      if (y < below) beside++; else under++;
    }
    expect(beside).toBe(0);
    expect(under).toBeGreaterThan(50);
  });

  it('with view, side is not used; without it the ring is the old one', () => {
    const a = paintMap(recipe(island({ view: [0.35, 1] })), game());
    const s = paintMap(recipe(island({ view: [0.35, 1], side: [7, 4, 14] })), game());
    expect(s.layers.ground.px).toEqual(a.layers.ground.px);
    const old = paintMap(recipe(island({ side: [7, 4, 14] })), game());
    expect(old.layers.ground.px).not.toEqual(a.layers.ground.px);
  });
});
