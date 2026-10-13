// @vitest-environment node
// The ice pass of The Unwritten Dao (#350): a mountain stream cut into the snow (`water.cut`), shore ice over its edges
// (`water.rim`), and steps cut across a trodden channel where it climbs (`trail.steps`).
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

type Steps = MapRecipe['steps'];
const SNOW = ['nieve noche', 'nieve honda', 'nieve sombra', 'nieve', 'túnica luz'];
const ROCK = ['basalto hondo', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'niebla sombra', 'basalto luz', 'niebla'];
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: SNOW }, pisada: { ramp: SNOW }, lajas: { ramp: ['basalto sombra', 'basalto', 'basalto claro'] },
  agua: { ramp: ['celeste oscuro', 'celeste', 'celeste luz', 'ojo', 'nube'] }, orilla: { ramp: ROCK },
};
function game(): MapGame { return { width: 12, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(12)) }; }
function recipe(steps: Steps): MapRecipe { return { game: game(), margin: [2, 1], shade: {}, materials: MATS, steps, light: [1, 1] }; }
const SNOWFIELD = { step: 'snowfield', material: 'nieve' } as const;
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground?.px[y * m.width + x] ?? null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const P = (m: PaintedMap, u: number, v: number): [number, number] => [m.origin[0] + Math.round(u * 16), m.origin[1] + Math.round(v * 16)];
/** px of a kind down a column (or along a row) from a point, until another kind. */
const run = (m: PaintedMap, x: number, y: number, dx: number, dy: number, k: string) => {
  let n = 0;
  while (kind(m, x + dx * (n + 1), y + dy * (n + 1)) === k) n++;
  return n;
};

const across: MapStepOf<'water'> = { step: 'water', id: 'rio', material: 'agua', shape: { curve: [[-1, 5], [13, 5]], width: [8, 0] }, seed: 3 };
const down: MapStepOf<'water'> = { step: 'water', id: 'rio', material: 'agua', shape: { curve: [[6, -1], [6, 11]], width: [8, 0] }, seed: 3 };
const CUT = { material: 'orilla', px: [4, 10] as [number, number], snow: ['túnica luz', 'nieve sombra'] as [string, string], ragged: 0 };

describe('the bed of a stream cut into the snow', () => {
  it('without cut nor rim the water is as before: the snow beside it untouched', () => {
    const m = paintMap(recipe([SNOWFIELD, across]), game());
    const [x, y] = P(m, 6, 5);
    expect(kind(m, x, y - 10)).toBe('nieve');
    expect(kind(m, x, y + 10)).toBe('nieve');
  });

  it('cut: a wall of rock on each side, wide where it looks south (the bank above the water), a dark line at the water', () => {
    const m = paintMap(recipe([SNOWFIELD, { ...across, cut: CUT }]), game());
    const [x, y] = P(m, 6, 5);
    let top = y; while (kind(m, x, top - 1) === 'agua') top--;
    let bot = y; while (kind(m, x, bot + 1) === 'agua') bot++;
    const north = run(m, x, top, 0, -1, 'orilla'), south = run(m, x, bot, 0, 1, 'orilla');
    expect(north).toBeGreaterThanOrEqual(8);
    expect(south).toBeLessThanOrEqual(2);
    expect(at(m, x, top - 1)).toBe('basalto hondo');
    expect(at(m, x, top - north)).toBe('túnica luz');   // the lip of snow on top of the wall, lit
    expect(kind(m, x, top - north - 2)).toBe('nieve');
  });

  it('cut: along a stream running south the wall that looks toward the light is lighter than the one in shade', () => {
    const m = paintMap(recipe([SNOWFIELD, { ...down, cut: { ...CUT, px: [6, 10] } }]), game());
    const [x0, y] = P(m, 6, 5);
    let l = x0; while (kind(m, l - 1, y) === 'agua') l--;
    let r = x0; while (kind(m, r + 1, y) === 'agua') r++;
    const ramp = ROCK, tone = (c: string | null) => ramp.lastIndexOf(c ?? '');
    let west = 0, east = 0;
    for (let yy = y - 6; yy <= y + 6; yy++) for (let k = 2; k <= 4; k++) { west += tone(at(m, l - k, yy)); east += tone(at(m, r + k, yy)); }
    // light from the north-west: the east wall faces west, toward it
    expect(east).toBeGreaterThan(west);
    expect(run(m, l, y, -1, 0, 'orilla')).toBeGreaterThanOrEqual(4);
  });

  it('rim: plates of shore ice inside the edges of the water, open water in the middle, a lit edge toward it', () => {
    const m = paintMap(recipe([SNOWFIELD, { ...down, rim: { px: [2, 4], colors: ['ojo', 'celeste luz', 'celeste oscuro'] } }]), game());
    const [x0, y] = P(m, 6, 5);
    let l = x0; while (kind(m, l - 1, y) === 'agua') l--;
    const row = Array.from({ length: x0 - l + 1 }, (_, k) => at(m, l + k, y));
    expect(row[0] === 'celeste luz' || row[0] === 'ojo').toBe(true);
    expect(row.slice(1, 5)).toContain('ojo');
    expect(['celeste oscuro', 'celeste', 'celeste luz']).toContain(at(m, x0, y));
    expect(kind(m, l, y)).toBe('agua');
  });
});

describe('steps cut across a trodden channel', () => {
  const curve = { points: [[6, -1], [6, 11]] as [number, number][], width: [7] as [number] };
  it('each step: a lit nose, the riser, a dark foot, across the channel, with its own kind', () => {
    const steps = { at: [5], colors: ['túnica luz', 'basalto claro', 'basalto sombra'] as [string, string, string], kind: 'escalon' };
    const m = paintMap(recipe([SNOWFIELD, { step: 'trail', material: 'pisada', style: 'trodden', on: ['nieve'], curves: [curve], salt: 9, prints: 0, steps }]), game());
    const [x, y] = P(m, 6, 5);
    const col = [0, 1, 2, 3, 4].map(j => at(m, x, y - 1 + j));
    expect(col).toContain('túnica luz');
    expect(col).toContain('basalto claro');
    expect(col).toContain('basalto sombra');
    expect(kind(m, x, y + 1)).toBe('escalon');
    expect(kind(m, x, y - 8)).toBe('pisada');
  });

  it('over: the steps cut slabs laid before the trail too', () => {
    const steps = { at: [5], colors: ['túnica luz', 'basalto claro', 'basalto sombra'] as [string, string, string], over: ['lajas'] };
    const m = paintMap(recipe([SNOWFIELD, { step: 'area', material: 'lajas', on: ['nieve'], shape: { curve: curve.points, width: [4, 0] } },
      { step: 'trail', material: 'pisada', style: 'trodden', on: ['nieve'], curves: [curve], salt: 9, prints: 0, steps }]), game());
    const [x, y] = P(m, 6, 5);
    const col = [0, 1, 2, 3, 4].map(j => at(m, x, y - 1 + j));
    expect(col).toContain('basalto claro');
  });
});
