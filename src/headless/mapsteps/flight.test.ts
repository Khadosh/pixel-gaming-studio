// @vitest-environment node
// The flight that climbs cut into a crest of rock (flight climb, worn.rock):
// steps seen from the front, each up and to the right of the last, rock on both
// sides, no flank.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const ROCK = ['tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto medio', 'basalto luz', 'lejos luz'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];

function game(): MapGame {
  return { width: 12, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(12)), decor: [] };
}
function recipe(steps: MapRecipe['steps']): MapRecipe {
  return {
    game: game(), margin: [4, 2], light: [1, 1],
    materials: {
      grass: { ramp: GRASS, texture: 'patches', base: 4 },
      stone: { ramp: STONE, texture: 'flagstones', moss: MOSS },
      rock: { ramp: ROCK, moss: MOSS },
    },
    steps,
  };
}
const grass = { step: 'area', material: 'grass', shape: 'all' } as MapRecipe['steps'][number];
const climb = (worn: object, more: object = {}) => ({
  step: 'flight', material: 'stone', style: 'climb', from: [1, 8], length: 60, slope: 0.75, every: 6, half: 9, fade: [999, 12], worn, ...more,
}) as MapRecipe['steps'][number];
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
const kindAt = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];

describe('flight climb cut into the rock', () => {
  const m = paintMap(recipe([grass, climb({ jitter: 0, moss: 0, rock: { material: 'rock' } })]), game());
  const [ox, oy] = m.origin, start = ox + 16, yMid = oy + 8 * 16;

  it('steps seen from the front: a lit nose over the riser in shadow, each one up and to the right of the last', () => {
    let last = Infinity;
    for (let k = 0; k < 10; k++) {
      const x = start + 6 * k + 2;   // the west end of step k, where no other step lies over it
      // down the column: the first nose of the stair is this step's, the riser right under it
      let y = Math.round(yMid - 3 - 6 * k) - 2;
      while (at(m, x, y) !== 'niebla' && y < m.height - 1) y++;
      expect(at(m, x, y + 1), `riser ${k}`).toBe('piedra sombra');
      expect(at(m, x, y - 1), `tread ${k}`).toBe('piedra clara');
      expect(y, `step ${k} higher`).toBeLessThan(last);
      if (k > 0) expect(last - y, `rise ${k}`).toBe(6);
      last = y;
    }
  });

  it('rock on both sides and no flank: over the treads the cut rock, under them the face of the crest, then grass', () => {
    for (let k = 1; k < 9; k++) {
      const x = start + 6 * k + 3;
      let y = 0;
      while (kindAt(m, x, y) !== 'stone' && y < m.height - 1) y++;
      // the outline of the crest, its lit rim, then rock down to the first tread
      expect(at(m, x, y), `outline ${k}`).toBe('tinta');
      expect(at(m, x, y + 1), `rim ${k}`).toBe('lejos luz');
      const col: string[] = [];
      for (; kindAt(m, x, y) === 'stone' && y < m.height - 1; y++) col.push(at(m, x, y)!);
      const rock = (c: string) => ROCK.includes(c);
      const firstStair = col.findIndex(c => STONE.includes(c) && c !== 'tinta');
      expect(col.slice(0, firstStair).every(c => rock(c) || MOSS.includes(c)), `rock above ${k}`).toBe(true);
      const lastStair = col.length - 1 - [...col].reverse().findIndex(c => STONE.includes(c) && c !== 'tinta');
      const below = col.slice(lastStair + 1);
      expect(below.length, `face ${k}`).toBeGreaterThanOrEqual(5);
      expect(below.every(c => rock(c) || MOSS.includes(c)), `rock below ${k}`).toBe(true);
      // the grass under it, in its shadow
      expect(kindAt(m, x, y), `ground ${k}`).toBe('grass');
    }
  });

  it('everything it paints is of the flight material, so a brink that skips it leaves it whole', () => {
    const rockPx = m.kind.filter((k, i) => k === 'stone' && ROCK.includes(m.layers.ground.px[i]!)).length;
    expect(rockPx).toBeGreaterThan(300);
    expect(m.kind.filter(k => k === 'rock').length).toBe(0);
  });

  it('root: the face under its last steps goes down further, to be lost past the edge of an island', () => {
    const rooted = paintMap(recipe([grass, climb({ jitter: 0, moss: 0, rock: { material: 'rock', root: 30 } })]), game());
    const depth = (p: PaintedMap, x: number) => { let y = p.height - 1; while (kindAt(p, x, y) !== 'stone' && y > 0) y--; return y; };
    const end = start + 6 * 9 + 9;
    expect(depth(rooted, end) - depth(m, end)).toBeGreaterThan(10);
    expect(depth(rooted, start + 6)).toBe(depth(m, start + 6));
  });

});
