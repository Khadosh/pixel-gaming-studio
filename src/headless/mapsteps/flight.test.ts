// @vitest-environment node
// The flight that climbs cut into a crest of rock (flight climb, worn.rock):
// steps seen from the front, each up and to the right of the last, rock on both
// sides, no flank.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';
import { curveSlabs, spine, type Slab } from './flight';

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

// The stair of the brink (flight edge): born on a cell of the brow, short
// flights by the face with a landing and a break between them, rock at both
// sides, steps seen from the front, lost in cloud or rock; never over the grass.
describe('flight edge, the stair of the brink', () => {
  const SKY = ['celeste oscuro', 'celeste', 'niebla sombra', 'niebla', 'túnica luz'];
  const edge = (more: object = {}, worn: object = {}) => ({
    step: 'flight', material: 'stone', style: 'edge', from: [6, 8], half: 9, every: 6,
    worn: { jitter: 0, moss: 0, ...worn }, edge: { rock: 'rock', legs: [[4, 0], [4, 20]], ...more },
  }) as MapRecipe['steps'][number];
  const paint = (step: MapRecipe['steps'][number]) => {
    const r = recipe([grass, step]);
    r.materials.sky = { ramp: SKY };
    return paintMap(r, game());
  };
  const count = (m: PaintedMap, y: number, x0: number, x1: number, c: string) => {
    let n = 0;
    for (let x = x0; x < x1; x++) if (at(m, x, y) === c) n++;
    return n;
  };
  // origin (64, 32): from [6, 8] is (160, 160); the threshold 151..169 × 155..165, then steps of 6 px
  const m = paint(edge());

  it('climbs north from the threshold on the brow: each step a lit nose over its riser, 6 px higher than the last', () => {
    for (let k = 0; k < 4; k++) {
      const T = 149 - 6 * k;
      expect(count(m, T + 3, 151, 169, 'niebla'), `nose ${k}`).toBeGreaterThanOrEqual(12);
      expect(count(m, T + 4, 151, 169, 'piedra sombra'), `riser ${k}`).toBeGreaterThanOrEqual(12);
      expect(count(m, T + 1, 151, 169, 'piedra clara') + count(m, T + 1, 151, 169, 'niebla sombra') + count(m, T + 1, 151, 169, 'piedra'), `tread ${k}`).toBeGreaterThanOrEqual(14);
    }
  });

  it('breaks at a landing as wide as both flights, and the next one starts `shift` px east, rock behind the landing', () => {
    // the landing (121..131, its nose at 128) runs from the first flight to the second
    expect(count(m, 128, 151, 189, 'niebla'), 'the nose of the landing').toBeGreaterThanOrEqual(30);
    // the first step of the second flight (115..121): its nose only over 171..189, rock where the first flight was
    expect(count(m, 118, 171, 189, 'niebla')).toBeGreaterThanOrEqual(12);
    expect(count(m, 118, 151, 169, 'niebla')).toBe(0);
    for (let x = 152; x < 166; x++) expect(ROCK.includes(at(m, x, 118)!) || MOSS.includes(at(m, x, 118)!), `rock behind ${x}`).toBe(true);
  });

  it('rock at both sides, and nothing of it west of the threshold: the grass of the island stays as it was', () => {
    for (const y of [140, 125, 110]) {
      const [l, r] = y > 131 ? [151, 169] : y > 121 ? [151, 189] : [171, 189];
      expect(ROCK.includes(at(m, l - 2, y)!), `west cheek ${y}`).toBe(true);
      expect(ROCK.includes(at(m, r + 2, y)!), `east cheek ${y}`).toBe(true);
    }
    for (let y = 121; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (kindAt(m, x, y) === 'stone') expect(x >= 144 && x < 198, `px of the stair at ${x},${y}`).toBe(true);   // the cheeks: 4 and 5 px, give or take 3
    }
    expect(kindAt(m, 140, 140)).toBe('grass');
    expect(kindAt(m, 160, 175)).toBe('grass');   // south of the threshold, the brow: no face hangs under it
  });

  it('not a ruled box: the cheeks change width block by block, worn treads differ in length, the landing is laid in flagstones', () => {
    const westEdge = new Set<number>();
    for (let y = 133; y < 165; y++) { let x = 120; while (kindAt(m, x, y) !== 'stone') x++; westEdge.add(x); }
    expect(westEdge.size).toBeGreaterThanOrEqual(3);
    const worn = paint(edge({}, { jitter: 0.9 }));
    const lengths = new Set<number>();
    for (let k = 0; k < 4; k++) lengths.add(count(worn, 149 - 6 * k + 3, 140, 200, 'niebla') + count(worn, 149 - 6 * k + 3, 140, 200, 'piedra clara'));
    expect(lengths.size).toBeGreaterThanOrEqual(2);
    // a course of joints across the landing (121..128), not the nose and riser of a step
    let course = 0;
    for (let y = 123; y < 127; y++) if (count(m, y, 153, 187, 'túnica oscura') >= 20) course++;
    expect(course).toBeGreaterThanOrEqual(1);
  });

  it('the rock casts its shadow on the treads at the side of the light', () => {
    // light from the west: the first px of a tread by the west cheek is two tones down from the middle of it
    const T = 149, y = T + 1;
    expect(['piedra clara', 'niebla sombra', 'piedra']).toContain(at(m, 160, y));
    expect(['piedra sombra', 'túnica oscura', 'túnica noche']).toContain(at(m, 151, y));
  });

  it('every px is of the flight material, so a brink that skips it leaves it whole', () => {
    expect(m.kind.filter(k => k === 'rock' || k === 'sky').length).toBe(0);
    expect(m.kind.filter(k => k === 'stone').length).toBeGreaterThan(1200);
  });

  it('is lost in rock at its far end, or with `into` in a checker of mist over its last steps and the rock, never a mass of cloud', () => {
    // the last step of the second flight is at 97..103: above it, the rock goes on
    for (let y = 92; y < 97; y++) expect(ROCK.includes(at(m, 180, y)!), `rock ${y}`).toBe(true);
    const c = paint(edge({ into: 'sky' }));
    let mist = 0, solid = 0;
    for (let y = 60; y < 110; y++) for (let x = 160; x < 200; x++) {
      if (['túnica luz', 'celeste'].includes(at(c, x, y)!)) mist++;
      // a checker: no two mist px of the lightest tone side by side
      if (at(c, x, y) === 'túnica luz' && at(c, x + 1, y) === 'túnica luz') solid++;
    }
    expect(mist).toBeGreaterThan(40);
    expect(solid).toBe(0);
    // nothing of it past the end of the rock (no cloud above), and the first flight untouched by it
    for (let y = 0; y < 72; y++) for (let x = 0; x < c.width; x++) expect(kindAt(c, x, y), `${x},${y}`).not.toBe('stone');
    for (let y = 131; y < 165; y++) for (let x = 144; x < 173; x++) expect(at(c, x, y), `${x},${y}`).toBe(at(m, x, y));
  });

  it('face: under what juts out past the brow (east of the first flight) a face of rock falls; not under the threshold', () => {
    const f = paint(edge({ face: 20 }));
    expect(ROCK.includes(at(f, 182, 136)!)).toBe(true);   // under the landing, east of the first flight
    expect(kindAt(m, 182, 136)).toBe('grass');
    expect(kindAt(f, 160, 170)).toBe('grass');
  });

  it('down: from the threshold on the brow it goes south, each step lower than the last', () => {
    const d = paint(edge({ dir: 'down', legs: [[4, 0]] }) as MapRecipe['steps'][number]);
    // from [6, 8]: the threshold 155..165, then steps at 165, 171, 177, 183
    for (let k = 0; k < 4; k++) {
      const T = 165 + 6 * k;
      expect(count(d, T + 3, 151, 169, 'niebla'), `nose ${k}`).toBeGreaterThanOrEqual(12);
      expect(count(d, T + 4, 151, 169, 'piedra sombra'), `riser ${k}`).toBeGreaterThanOrEqual(12);
    }
    expect(kindAt(d, 160, 140)).toBe('grass');
  });

  // curved: from [6, 8] (160, 160) north, then north-east, then north again, by a line through these cells
  const curve = { path: [[6.05, 7.2], [6.8, 5.6], [8.0, 4.2], [8.6, 2.8]] };
  const cv = paint(edge({ ...curve, legs: undefined }));
  const TREAD = ['piedra', 'piedra clara', 'niebla', 'niebla sombra', 'piedra sombra'];
  const treadSpan = (mm: PaintedMap, y: number) => {
    const xs: number[] = [];
    for (let x = 0; x < mm.width; x++) if (TREAD.includes(at(mm, x, y)!)) xs.push(x);
    return xs.length ? [xs[0], xs[xs.length - 1]] : null;
  };

  it('path: the stair follows a smooth line through the points, not legs of rectangles', () => {
    // the middle of the treads row by row lies on the line: 160 at the threshold, ~173 at [6.8, 5.6], ~192 at [8, 4.2]
    for (const [y, x] of [[156, 160], [122, 173], [99, 192]]) {
      const sp = treadSpan(cv, y)!;
      expect(Math.abs((sp[0] + sp[1]) / 2 - x), `middle at ${y}`).toBeLessThanOrEqual(4);
    }
    // and it drifts a px or two each few rows, never a jump of a whole shift as a break between legs
    let prev = -1, jump = 0;
    for (let y = 150; y > 85; y--) {
      const sp = treadSpan(cv, y);
      if (!sp) continue;
      const mid = (sp[0] + sp[1]) / 2;
      if (prev >= 0) jump = Math.max(jump, Math.abs(mid - prev));
      prev = mid;
    }
    expect(jump).toBeLessThanOrEqual(5);
  });

  it('path: the treads turn with it, their noses slanting where it goes north-east, level on the legs', () => {
    const slant = (mm: PaintedMap, x0: number, x1: number, y0: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (at(mm, x, y) === 'niebla' && at(mm, x + 1, y + 1) === 'niebla' && at(mm, x + 1, y) !== 'niebla') n++;
      return n;
    };
    expect(slant(cv, 165, 200, 98, 128)).toBeGreaterThanOrEqual(8);
    expect(slant(m, 150, 190, 98, 150)).toBeLessThanOrEqual(2);
  });

  it('path: rock at both sides all along the curve, every px of the flight material, and none on the grass south of the threshold', () => {
    for (const y of [150, 122, 105]) {
      const [l, r] = treadSpan(cv, y)!;
      const rockish = (x: number) => ROCK.includes(at(cv, x, y)!) || MOSS.includes(at(cv, x, y)!);
      const near = (x0: number, dx: number) => [1, 2, 3, 4, 5, 6].some(i => rockish(x0 + dx * i));
      expect(near(l, -1), `west cheek ${y}`).toBe(true);
      expect(near(r, 1), `east cheek ${y}`).toBe(true);
    }
    expect(cv.kind.filter(k => k === 'rock' || k === 'sky').length).toBe(0);
    expect(kindAt(cv, 160, 176)).toBe('grass');
    expect(kindAt(cv, 140, 120)).toBe('grass');
  });

  it('path: neither legs nor path is an error', () => {
    expect(() => paint(edge({ legs: undefined }))).toThrow(/legs.*path/);
  });

  it('curveSlabs: a landing where the line turns hard, at the bend; none on a straight line', () => {
    const slabsOf = (pts: [number, number][], turn = 30) => {
      const out: Slab[] = [];
      const sp = spine(pts, 5, 30);
      curveSlabs(sp, out, { rest: 10, every: 6, half: 9, turn, height: () => 6, wob: () => 0 });
      return out;
    };
    const straight = slabsOf([[100, 200], [100, 100]]);
    expect(straight.filter(s => s.rest).length).toBe(1);   // the threshold only
    expect(straight.length).toBe(1 + Math.floor((105 - 10) / 6));
    // north 50 px, then a bend to the north-east: one landing, about where it bends (s ~ 55)
    const bent = slabsOf([[100, 200], [100, 150], [140, 120], [180, 100]]);
    const rests = bent.filter(s => s.rest && s.k > 0);
    expect(rests.length).toBe(1);
    expect(Math.abs((rests[0].sA! + rests[0].sB!) / 2 - 55)).toBeLessThanOrEqual(12);
    expect(rests[0].R - rests[0].L).toBe(20);   // a px wider at each side than a tread
    // a lower `turn` lays landings on gentler bends too; a higher one none
    expect(slabsOf([[100, 200], [100, 150], [140, 120], [180, 100]], 170).filter(s => s.rest && s.k > 0).length).toBe(0);
  });
});
