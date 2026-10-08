// @vitest-environment node
// The foot of a ring seen in perspective, lost in mist (`veil`), and the falls
// with a face behind them (`notch`): the sect of The Unwritten Dao looked like a
// flying platform, its faces ending on a dark edge over the clouds, and a fall
// off its west side poured out of a lawn with no rock behind it.
import { describe, it, expect } from 'vitest';
import { paintMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];
const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
const GRASS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro', 'pasto'];
type Step = MapRecipe['steps'][number];

function game(w = 16, h = 12): MapGame { return { width: w, height: h, grid: Array.from({ length: h }, () => '#'.repeat(w)), decor: [] }; }
function recipe(steps: MapRecipe['steps']): MapRecipe {
  return {
    game: game(), margin: [5, 5], light: [1, 1],
    materials: {
      grass: { ramp: GRASS, base: 2 },
      rock: { ramp: STONE, moss: MOSS },
      sky: { ramp: SKY },
      water: { ramp: ['celeste oscuro', 'celeste', 'celeste luz', 'nube media', 'nube'] },
    },
    steps,
  };
}
// an island whose west side runs straight down from row 3 to row 9
const LIP: [number, number][] = [[2, 1], [8, 0.6], [14, 1.2], [15.4, 6], [14.8, 11], [8, 11.2], [2, 11], [0.6, 9], [0.5, 6], [0.6, 3]];
const DROP = 48;
const island = (brink: object = {}): Step[] => [
  { step: 'area', material: 'sky', shape: 'all' } as Step,
  { step: 'area', material: 'grass', shape: 'all' } as Step,
  { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'sky', lip: LIP, drop: [DROP, 0, 0], bushes: [0, 0], drape: [0, 0], view: [0.35, 0.85], ...brink } as Step,
];
const P = (u: number, v: number) => [80 + u * 16, 80 + v * 16];
const paint = (brink: object) => paintMap(recipe(island(brink)), game());
type Painted = ReturnType<typeof paint>;
const kind = (m: Painted, x: number, y: number) => m.kind[y * m.width + x];
const px = (m: Painted, x: number, y: number) => m.layers.ground.px[y * m.width + x] ?? '';
/** The rock of a column, top to bottom, from under the lip at x. */
function column(m: Painted, x: number): string[] {
  let y = m.height - 1;
  while (y > 0 && kind(m, x, y) !== 'grass') y--;
  const out: string[] = [];
  for (y++; y < m.height && kind(m, x, y) === 'rock'; y++) out.push(px(m, x, y));
  return out;
}
const CLOUD = new Set(SKY.slice(3));

describe('brink veil: the foot of the faces lost in mist', () => {
  const bare = paint({});
  const veiled = paint({ veil: [14, 0] });

  it('without veil the lower part of a south face is dark rock; with it, cloud and almost no ink', () => {
    const [x] = P(8, 0);
    let inkA = 0, inkB = 0, cloudB = 0, cloudUpper = 0;
    for (let dx = -30; dx <= 30; dx++) {
      const a = column(bare, x + dx), b = column(veiled, x + dx);
      inkA += a.slice(-12).filter(c => c === STONE[0]).length;
      inkB += b.slice(-12).filter(c => c === STONE[0]).length;
      cloudB += b.slice(-12).filter(c => CLOUD.has(c)).length;
      cloudUpper += b.slice(0, Math.floor(b.length / 2)).filter(c => CLOUD.has(c)).length;
    }
    expect(inkA).toBeGreaterThan(40);
    expect(inkB).toBeLessThan(inkA / 2);
    expect(cloudB).toBeGreaterThan(150);
    expect(cloudUpper).toBe(0);   // the face above the mist is still rock
  });

  it('the mist thickens going down: more cloud in its lower px than in its upper ones', () => {
    const [x] = P(8, 0);
    let upper = 0, lower = 0;
    for (let dx = -30; dx <= 30; dx++) {
      const b = column(veiled, x + dx);
      if (b.length < 30) continue;
      upper += b.slice(-14, -10).filter(c => CLOUD.has(c)).length;
      lower += b.slice(-4).filter(c => CLOUD.has(c)).length;
    }
    expect(lower).toBeGreaterThan(upper * 1.5);
  });

  it('a side face is veiled too: the foot of the west side melts into cloud instead of ink', () => {
    let cloud = 0, ink = 0;
    for (let y = 0; y < veiled.height; y++) for (let x = 0; x < P(0.4, 0)[0]; x++) {
      if (kind(veiled, x, y) !== 'rock') continue;
      if (CLOUD.has(px(veiled, x, y))) cloud++;
      if (px(veiled, x, y) === STONE[0]) ink++;
    }
    expect(cloud).toBeGreaterThan(80);
    let inkBare = 0;
    for (let y = 0; y < bare.height; y++) for (let x = 0; x < P(0.4, 0)[0]; x++) if (kind(bare, x, y) === 'rock' && px(bare, x, y) === STONE[0]) inkBare++;
    expect(ink).toBeLessThan(inkBare / 2);
  });

  it('shelves: ledges of grass lower down the face, above the mist', () => {
    const s = paint({ veil: [14, 0], shelves: [1, 20] });
    const [x] = P(8, 0);
    let grassy = 0;
    for (let dx = -40; dx <= 40; dx++) {
      const a = column(veiled, x + dx), b = column(s, x + dx);
      if (b.length < 30) continue;
      const half = Math.floor(b.length / 2);
      if (b.slice(half).some(c => GRASS.includes(c)) && !a.slice(half).some(c => GRASS.includes(c))) grassy++;
    }
    expect(grassy).toBeGreaterThan(20);
  });
});

describe('brink notch: a face seen from the front behind each fall', () => {
  const fall = { water: 'water', spring: 4, falls: [[0.2, 4, 6, 50]] };
  const without = paint(fall), notched = paint({ ...fall, notch: [5, 8] });
  const waterRow = (m: Painted, y: number) => {
    const xs: number[] = [];
    for (let x = 0; x < P(1, 0)[0]; x++) if (kind(m, x, y) === 'water') xs.push(x);
    return xs;
  };

  it('off a side, the water falls in front of rock: rock on both sides of it, all the way down', () => {
    const [, y0] = P(0, 6);
    const flanked = (m: Painted) => {
      let both = 0, rows = 0;
      for (let y = y0 + 6; y < y0 + 36; y += 2) {
        const w = waterRow(m, y);
        if (!w.length) continue;
        rows++;
        if (kind(m, w[0] - 2, y) === 'rock' && kind(m, w[w.length - 1] + 2, y) === 'rock') both++;
      }
      return [both, rows];
    };
    const [both, rows] = flanked(notched), [bothBefore] = flanked(without);
    expect(rows).toBeGreaterThan(10);
    expect(both).toBeGreaterThanOrEqual(rows - 1);
    expect(both).toBeGreaterThan(bothBefore);
  });

  it('the shelf it pours from is grass, jutting out of the edge', () => {
    const [, y0] = P(0, 6);
    let shelf = 0;
    for (let y = y0 - 10; y < y0; y++) for (let x = 0; x < P(0.5, 0)[0]; x++) {
      if (kind(notched, x, y) === 'grass' && kind(without, x, y) !== 'grass') shelf++;
    }
    expect(shelf).toBeGreaterThan(20);
  });

  // the sect: the shelf of the west fall read as a loose piece of mountain: a black hole under it where the
  // water came out, no rock holding it up (a curtain of grass hid it), and a slit of sky where it met the lip
  const shelfFall = { water: 'water', spring: 4, pour: [0.2, 12], drape: [1, 26], falls: [[0.2, 4, 6, 50]] };
  const shelved = paint({ ...shelfFall, notch: [5, 8] });
  /** The first row of water in the column, and the row of the lip of the shelf above it (the last grass). */
  const head = (m: Painted, x: number): [number, number] => {
    let y = 0;
    while (y < m.height && kind(m, x, y) !== 'water') y++;
    let lip = y;
    while (lip > 0 && kind(m, x, lip - 1) !== 'grass') lip--;
    return [y, lip];
  };
  const waterCols = (m: Painted) => {
    const [, y0] = P(0, 6), xs = waterRow(m, y0 + 20);
    return xs.slice(1, -1);
  };

  it('off a shelf the water leaves a groove in the rock, not a black hole', () => {
    const black = (m: Painted) => {
      let n = 0;
      for (const x of waterCols(m)) {
        const [y, lip] = head(m, x);
        for (let j = lip; j < y; j++) if (px(m, x, j) === STONE[0]) n++;
      }
      return n;
    };
    expect(waterCols(shelved).length).toBeGreaterThan(4);
    expect(black(shelved)).toBe(0);
  });

  it('the shelf stands on rock: under its lip, beside the water, the face shows (no curtain of grass hiding it)', () => {
    const [, y0] = P(0, 6), xs = waterRow(shelved, y0 + 20);
    let rock = 0, all = 0;
    for (let x = xs[0] - 5; x < xs[0] - 1; x++) {
      const [, lip] = head(shelved, x);
      let y = lip;
      while (y < shelved.height && kind(shelved, x, y) === 'grass') y++;
      for (let j = y + 6; j < y + 26; j++) { all++; if (kind(shelved, x, j) === 'rock' && !GRASS.includes(px(shelved, x, j))) rock++; }
    }
    expect(all).toBeGreaterThan(40);
    expect(rock).toBeGreaterThan(all * 0.9);
  });

  // (a west lip that runs up and east above the fall, as the sect's does: the corner where the shelf meets it)
  const SLANT: [number, number][] = [[2, 1], [8, 0.6], [14, 1.2], [15.4, 6], [14.8, 11], [8, 11.2], [2, 11], [0.6, 9], [0.4, 7], [1.4, 5.2], [2.4, 3]];
  const slanted = paint({ ...shelfFall, lip: SLANT, falls: [[1.0, 4, 6.6, 50]], notch: [5, 8] });

  it('no slit of sky between the shelf and the lip of the island beside it', () => {
    const y0 = Math.round(P(0, 6.6)[1]);
    let slits = 0;
    for (let y = y0 - 16; y < y0 + 4; y++) {
      // walking east from the first grass of the row: sky and then grass again is a slit
      let x = 0;
      while (x < P(3, 0)[0] && kind(slanted, x, y) !== 'grass') x++;
      for (let seen = false; x < P(3, 0)[0]; x++) {
        if (kind(slanted, x, y) === 'sky') seen = true;
        else if (seen && kind(slanted, x, y) === 'grass') { slits++; break; }
      }
    }
    expect(slits).toBe(0);
  });

  it('the top of the shelf runs in lumps, not along a ruler', () => {
    // the top edge over the water: a plank (even a sloping one) only ever goes one way; cushions of grass go up and down
    const [, y0] = P(0, 6), xs = waterRow(shelved, y0 + 20), tops: number[] = [];
    for (let x = xs[0] - 2; x <= xs[xs.length - 1] + 2; x++) {
      let y = y0 - 24;
      while (y < y0 + 4 && kind(shelved, x, y) !== 'grass') y++;
      tops.push(y);
    }
    let turns = 0, dir = 0;
    for (let k = 1; k < tops.length; k++) {
      const d = Math.sign(tops[k] - tops[k - 1]);
      if (d && dir && d !== dir) turns++;
      if (d) dir = d;
    }
    expect(tops.length).toBeGreaterThan(10);
    expect(turns).toBeGreaterThanOrEqual(2);
  });

  it('on a south lip the lip bites into the island over the fall', () => {
    const s = { water: 'water', spring: 4, falls: [[8, 5]] };
    const a = paint(s), b = paint({ ...s, notch: [5, 8] });
    const [x] = P(8, 0);
    const lip = (m: Painted) => { let y = m.height - 1; while (y > 0 && kind(m, x + 7, y) !== 'grass') y--; return y; };
    expect(lip(b)).toBeLessThan(lip(a) - 4);
  });
});
