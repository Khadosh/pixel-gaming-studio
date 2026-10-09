// @vitest-environment node
// A building seen from above in three quarters, as steps: the roof (tiles as a
// pattern, eaves with their shadow on the wall and never above), the chimney
// (higher than the roof, the fire on its own layer), the fence (a run down the
// slope really goes down; gaps are open), the building (its side in shade, its
// shadow on the ground to the south-east); the outline of a roof and of a
// courtyard never runs straight; the same salt, the same pixels; and the forge
// of the reference as a whole recipe, pixel for pixel.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import { outputLayer, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';

const FIX = join(__dirname, '../fixtures/mapas');
const TEJA = ['tinta', 'tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz'];
const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'];
const MATS: MapRecipe['materials'] = {
  suelo: { ramp: ['prado hondo', 'prado sombra', 'prado'], base: 2 },
  teja: { ramp: TEJA },
  piedra: { ramp: STONE },
  revoque: { ramp: ['piedra sombra', 'piedra', 'túnica sombra', 'pergamino'] },
  vigas: { ramp: ['tinta', 'madera sombra', 'madera', 'madera clara', 'arena'] },
};
const game: MapGame = { width: 16, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(16)), decor: [] };
const GROUND: MapStepOf<'area'> = { step: 'area', material: 'suelo', shape: 'all' };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number, layer = 'ground') => m.layers[layer]?.px[y * m.width + x] ?? null;
const kindMask = (m: PaintedMap, kinds: string[]) => m.kind.map(k => kinds.includes(k));

/** The longest run of the border of a mask against `outside` along a row or a column, px. */
function longestStraight(m: PaintedMap, inside: boolean[], outside: (i: number) => boolean): number {
  const W = m.width, H = m.height;
  let best = 0;
  // a border px faces out on one side; a run is consecutive border px facing the same side along the border
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    const along = dy !== 0;
    for (let a = 0; a < (along ? H : W); a++) {
      let run = 0;
      for (let b = 0; b < (along ? W : H); b++) {
        const x = along ? b : a, y = along ? a : b, X = x + dx, Y = y + dy;
        const edge = inside[y * W + x] && X >= 0 && Y >= 0 && X < W && Y < H && outside(Y * W + X);
        run = edge ? run + 1 : 0;
        best = Math.max(best, run);
      }
    }
  }
  return best;
}

describe('map roof', () => {
  // a roof over a box of 8 × 3 cells: px 32..159 across, its ridge at 48, its eaves at 96 (they hang 3 px under)
  const ROOF: MapStepOf<'roof'> = { step: 'roof', id: 'techo', material: 'teja', rect: [2, 3, 8, 3], upturn: 4, salt: 1701 };
  const m = paintMap(recipe([GROUND, ROOF]), game);
  const tiles = kindMask(m, ['teja']);

  it('tiles as a pattern: the columns repeat every tile across the slope, the channel between them dark', () => {
    // in the middle of the slope, the darkest tones fall on one column in every `tile[0]` (5 by default) far more
    // than on any other
    // (a roof with no flare: its columns do not fan out, so the phase is the same on every row)
    const flat = paintMap(recipe([GROUND, { ...ROOF, flare: 0, upturn: 0 }]), game);
    const byPhase = [0, 0, 0, 0, 0];
    for (let y = 60; y < 88; y++) for (let x = 60; x < 140; x++) if (at(flat, x, y) === 'tinta') byPhase[x % 5]++;
    const sorted = [...byPhase].sort((a, b) => b - a);
    expect(sorted[0]).toBeGreaterThan(2 * sorted[1]);
    // and it is tiles, not a flat fill: four tones at least in that band
    const tones = new Set<string>();
    for (let y = 60; y < 88; y++) for (let x = 60; x < 140; x++) tones.add(at(m, x, y)!);
    expect(tones.size).toBeGreaterThanOrEqual(4);
  });

  it('the eaves stand out of the rect on every side and throw a band of shadow under them, never above the roof', () => {
    // wider than the rect (32..159)
    const xs = tiles.flatMap((t, i) => (t ? [i % m.width] : []));
    expect(Math.min(...xs)).toBeLessThan(30);
    expect(Math.max(...xs)).toBeGreaterThan(161);
    // in the middle, the first px under the roof is the ground two tones down; the band reaches 3 px
    const x = 96;
    let foot = 0;
    for (let y = 95; y < 110; y++) if (tiles[y * m.width + x]) foot = y;
    expect(at(m, x, foot + 1)).toBe('prado hondo');
    expect(at(m, x, foot + 3)).toBe('prado sombra');
    expect(at(m, x, foot + 5)).toBe('prado');
    // above the roof the ground is untouched (only its line of ink)
    for (let xx = 40; xx < 150; xx++) expect(at(m, xx, 44)).toBe('prado');
  });

  it('a ridge across the top and the corners of the eaves turned up: the line of the eaves is a curve', () => {
    const bottom = (x: number) => { let b = -1; for (let y = 0; y < m.height; y++) if (tiles[y * m.width + x]) b = y; return b; };
    // the corners stand higher than the middle
    expect(bottom(96) - bottom(30)).toBeGreaterThanOrEqual(3);
    // the ridge: a lit row near the top of the roof
    const top = (x: number) => { for (let y = 0; y < m.height; y++) if (tiles[y * m.width + x] && at(m, x, y) !== 'tinta') return y; return -1; };
    expect(TEJA.indexOf(at(m, 96, top(96))!)).toBeGreaterThanOrEqual(4);
  });

  it('no straight border longer than two cells around the roof', () => {
    expect(longestStraight(m, tiles, i => m.kind[i] === 'suelo')).toBeLessThanOrEqual(32);
  });

  it('a north-south ridge: the west slope lit, the east one in shade; a gable with its bargeboards at the south', () => {
    const v = paintMap(recipe([GROUND, { step: 'roof', material: 'teja', rect: [4, 3, 4, 4], ridge: 'v', gable: 14 }]), game);
    const mean = (x0: number, x1: number) => {
      let s = 0, n = 0;
      for (let y = 60; y < 90; y++) for (let x = x0; x < x1; x++) { const i = TEJA.indexOf(at(v, x, y)!); if (i >= 0) { s += i; n++; } }
      return s / n;
    };
    expect(mean(68, 90)).toBeGreaterThan(mean(102, 124) + 0.4);
    // the gable: the bargeboards in bermellón, the triangle of plaster under them
    const band = new Set<string>();
    for (let y = 95; y < 112; y++) for (let x = 64; x < 128; x++) band.add(at(v, x, y)!);
    expect(band.has('bermellón')).toBe(true);
    expect(band.has('pergamino')).toBe(true);
  });

  it('the same salt, the same pixels; another salt, other tiles', () => {
    const again = paintMap(recipe([GROUND, ROOF]), game);
    expect(again.layers.ground.px).toEqual(m.layers.ground.px);
    const other = paintMap(recipe([GROUND, { ...ROOF, salt: 99 }]), game);
    let differ = 0;
    for (let i = 0; i < m.layers.ground.px.length; i++) if (other.layers.ground.px[i] !== m.layers.ground.px[i]) differ++;
    expect(differ).toBeGreaterThan(200);
  });

  it('a place moves it by its rect', () => {
    expect((moveStep(ROOF, 3, 2) as MapStepOf<'roof'>).rect).toEqual([5, 5, 8, 3]);
  });
});

describe('map building and chimney', () => {
  const HOUSE: MapStepOf<'building'> = {
    step: 'building', id: 'casa', rect: [2, 2, 9, 5], wall: 34, material: 'revoque', frame: 'vigas', stone: 'piedra',
    open: [{ at: [5, 8], board: true }], windows: [[10, 8, 12, 10]], shadow: { offset: [8, 3] },
    roof: { material: 'teja', upturn: 5 },
  };
  const OVEN: MapStepOf<'chimney'> = {
    step: 'chimney', id: 'horno', material: 'piedra', at: [4, 7], base: [40, 46], stack: [20, 38], shift: -8,
    mouth: { size: [20, 18] }, fire: { layer: 'fuego' }, smoke: { layer: 'humo' }, shadow: { on: ['casa roof', 'suelo'] },
  };
  const m = paintMap(recipe([GROUND, HOUSE, OVEN]), game);
  const roof = kindMask(m, ['teja']);
  const stone = kindMask(m, ['piedra']);
  const topOf = (mask: boolean[]) => mask.findIndex(Boolean) / m.width | 0;
  const topAt = (mask: boolean[], x: number) => { for (let y = 0; y < m.height; y++) if (mask[y * m.width + x]) return y; return 999; };

  it('the chimney stands higher than the roof, and its fire is on its own layer', () => {
    // over the ridge (not its horns): the middle of the roof
    expect(topOf(stone)).toBeLessThan(topAt(roof, 120) - 10);
    // the fire: in the mouth, on the fire layer; the ground there is the dark inside of the oven, never fire
    const fire = m.layers.fuego.px.filter(c => c === 'fuego luz' || c === 'fuego').length;
    expect(fire).toBeGreaterThan(60);
    expect(m.layers.ground.px.filter(c => c === 'fuego luz' || c === 'fuego').length).toBe(0);
    // the smoke rises over the flue, on its own layer
    const smokeRows = m.layers.humo.px.map((c, i) => (c ? Math.floor(i / m.width) : 999));
    expect(Math.min(...smokeRows)).toBeLessThan(topOf(stone));
  });

  it('the chimney throws its shadow on the roof east of it', () => {
    const plain = paintMap(recipe([GROUND, HOUSE]), game);
    let darker = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const i = y * m.width + x;
      if (!roof[i] || stone[i]) continue;
      const a = TEJA.indexOf(m.layers.ground.px[i]!), b = TEJA.indexOf(plain.layers.ground.px[i]!);
      if (a >= 0 && b >= 0 && a < b) darker++;
    }
    expect(darker).toBeGreaterThan(40);
  });

  it('the east side of the walls in shade, and the shadow of the building on the ground to the south-east only', () => {
    const plain = paintMap(recipe([GROUND]), game);
    const shaded = (x0: number, x1: number, y0: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * m.width + x;
        if (m.kind[i] === 'suelo' && m.layers.ground.px[i] !== plain.layers.ground.px[i]) n++;
      }
      return n;
    };
    // east of the building (past its side) and under its foot: shadow; west of it and above it: none
    expect(shaded(182, 192, 60, 100)).toBeGreaterThan(150);
    expect(shaded(60, 120, 112, 115)).toBeGreaterThan(80);
    expect(shaded(16, 26, 40, 110)).toBe(0);
    // the side: plaster in its two darkest tones, the corner post
    let side = 0;
    for (let y = 90; y < 105; y++) for (let x = 178; x < 182; x++) if (['piedra sombra', 'piedra', 'madera sombra', 'tinta'].includes(at(m, x, y)!)) side++;
    expect(side).toBeGreaterThan(40);
  });

  it('chimney and building move with a place', () => {
    expect((moveStep(OVEN, 1, 1) as MapStepOf<'chimney'>).at).toEqual([5, 8]);
    expect((moveStep(HOUSE, 1, 1) as MapStepOf<'building'>).rect).toEqual([3, 3, 9, 5]);
  });
});

describe('map fence', () => {
  const FENCE: MapStepOf<'fence'> = {
    step: 'fence', id: 'cerca', material: 'vigas', path: [[2, 2], [4, 7], [9, 7]], gaps: [[[6, 7], [7, 7]]], salt: 1901,
  };
  const m = paintMap(recipe([GROUND, FENCE]), game);
  const wood = kindMask(m, ['vigas']);

  it('a run down the slope goes down: its posts each at their height, the rails leaning between them', () => {
    // the lowest wood px of each column along the diagonal run (x 32..64) goes down with x
    const lowest = (x: number) => { let b = -1; for (let y = 0; y < m.height; y++) if (wood[y * m.width + x]) b = y; return b; };
    expect(lowest(62) - lowest(34)).toBeGreaterThan(50);
    // and a rail px between two posts stands at a height that changes along the run
    const rails: number[] = [];
    for (let x = 36; x < 60; x++) { for (let y = 0; y < m.height; y++) if (wood[y * m.width + x]) { rails.push(y); break; } }
    expect(Math.max(...rails) - Math.min(...rails)).toBeGreaterThan(20);
  });

  it('the gap is open, a post stands at each side of it, and each end of the path ends in a post', () => {
    for (let x = 100; x < 108; x++) for (let y = 95; y < 115; y++) expect(wood[y * m.width + x]).toBe(false);
    const postAt = (x: number, y: number) => { let n = 0; for (let k = 2; k < 10; k++) if (wood[(y - k) * m.width + x]) n++; return n >= 7; };
    expect(postAt(96, 112)).toBe(true);
    expect(postAt(112, 112)).toBe(true);
    expect(postAt(144, 112)).toBe(true);
    expect(postAt(32, 32)).toBe(true);
  });

  it('posts with a lit cap and their shadow on the ground, down and to the right', () => {
    const tones = new Set<string>();
    for (let y = 98; y < 104; y++) for (let x = 140; x < 148; x++) if (wood[y * m.width + x]) tones.add(at(m, x, y)!);
    expect(tones.has('arena')).toBe(true);
    let shadow = 0;
    for (let y = 108; y < 118; y++) for (let x = 120; x < 156; x++) if (m.kind[y * m.width + x] === 'suelo' && at(m, x, y) !== 'prado') shadow++;
    expect(shadow).toBeGreaterThan(20);
  });

  it('the same salt, the same pixels', () => {
    expect(paintMap(recipe([GROUND, FENCE]), game).layers.ground.px).toEqual(m.layers.ground.px);
    expect((moveStep(FENCE, 1, 0) as MapStepOf<'fence'>).path[0]).toEqual([3, 2]);
  });
});

describe('map recipe: the forge', () => {
  const file = join(FIX, 'forja.receta.json');
  const r = renderRecipe(file);

  it('paints the forge of the reference: every layer the same as its picture, pixel for pixel, and passes the lint', async () => {
    for (const [layer, png] of [['ground', 'forja_receta.png'], ['fuego', 'forja_receta_fuego.png'], ['humo', 'forja_receta_humo.png'], ['copas', 'forja_receta_copas.png'], ['mechones', 'forja_receta_mechones.png']]) {
      const ref = readPng(join(FIX, png)), l = outputLayer(r, layer);
      expect([l.w, l.h]).toEqual([ref.width, ref.height]);
      let differ = 0;
      for (let i = 0; i < l.w * l.h; i++) {
        const c = l.px[i], a = ref.data[i * 4 + 3];
        const hex = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
        if ((c === null) !== (a === 0) || (c !== null && r.colors[c] !== hex)) differ++;
      }
      expect(differ, layer).toBe(0);
    }
    const lint = await runCommand('map_lint', { recipe: file });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  });

  it('three heights: the chimney over the main roof, the main roof over the roof of the annex', () => {
    const m = r.map;
    // the top of each in the middle of it (the ridge, not its horns)
    const top = (kind: string, xs: number[]) => {
      const tops = xs.map(x => { for (let y = 0; y < m.height; y++) if (m.kind[y * m.width + x] === kind) return y; return 999; });
      return [...tops].sort((a, b) => a - b)[Math.floor(tops.length / 2)];
    };
    const range = (a: number, b: number) => [...Array(b - a).keys()].map(i => a + i);
    const chimney = top('piedra de la forja', range(70, 80)), main = top('teja', range(120, 170)), annex = top('teja', range(20, 30));
    expect(chimney).toBeLessThan(main - 6);
    expect(main).toBeLessThan(annex - 8);
  });

  it('no straight border longer than two cells around the roofs nor around the courtyard', () => {
    const m = r.map;
    const out = (i: number) => m.kind[i] === 'pasto';
    expect(longestStraight(m, kindMask(m, ['teja']), out)).toBeLessThanOrEqual(32);
    expect(longestStraight(m, kindMask(m, ['lajas']), out)).toBeLessThanOrEqual(32);
  });
});
