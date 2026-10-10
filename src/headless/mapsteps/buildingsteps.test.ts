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
const range0 = (n: number) => [...Array(n).keys()];

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

  it('moss on an old roof: about `odds` of the tiles, more toward the eaves than under the ridge; none without it', () => {
    const MOSS = ['hoja sombra', 'prado hondo', 'prado sombra'];
    const mossy = paintMap(recipe([GROUND, { ...ROOF, moss: { odds: 0.15 } }]), game);
    let n = 0, all = 0, upper = 0, lower = 0;
    for (let y = 40; y < 100; y++) for (let x = 20; x < 172; x++) {
      if (mossy.kind[y * mossy.width + x] !== 'teja') continue;
      all++;
      if (MOSS.includes(at(mossy, x, y)!)) { n++; if (y < 72) upper++; else lower++; }
    }
    expect(n / all).toBeGreaterThan(0.08);
    expect(n / all).toBeLessThan(0.22);
    expect(lower).toBeGreaterThan(upper);
    // the ribs still read under it: a lit rib turns lit moss, a channel deep moss
    const tones = new Set<string>();
    for (let y = 40; y < 100; y++) for (let x = 20; x < 172; x++) {
      if (mossy.kind[y * mossy.width + x] === 'teja' && MOSS.includes(at(mossy, x, y)!)) tones.add(at(mossy, x, y)!);
    }
    expect(tones.size).toBe(3);
    // and a roof without moss has none
    for (let y = 40; y < 100; y++) for (let x = 20; x < 172; x++) {
      if (m.kind[y * m.width + x] === 'teja') expect(MOSS.includes(at(m, x, y)!)).toBe(false);
    }
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

  it('a shed: one slope only, falling west, its ridge along the east edge, as dark as the roof it leans on', () => {
    const v = paintMap(recipe([GROUND, { step: 'roof', material: 'teja', rect: [4, 3, 4, 3], ridge: 'v', lean: 'west', curl: 0 }]), game);
    const tiles = kindMask(v, ['teja']);
    const xs = tiles.flatMap((t, i) => (t ? [i % v.width] : []));
    const east = Math.max(...xs);
    // the ridge: its dark edge on the east side; a slope of tiles across all the rest, no east slope
    const col = (x: number) => [...Array(30).keys()].map(k => at(v, x, 60 + k));
    expect(col(east - 1).filter(c => c === 'tinta').length).toBeGreaterThan(20);
    const tones = new Set(col(80));
    expect(tones.size).toBeGreaterThanOrEqual(3);
    expect(Math.min(...xs)).toBeLessThan(64);
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

  it('a fire in frames: one layer per frame, each a different drawing, and never a dark px inside the mouth', () => {
    const FRAMES: MapStepOf<'chimney'> = { ...OVEN, fire: { layer: 'fuego', frames: 4, colors: ['bermellón', 'fuego', 'fuego luz', 'túnica luz'] } };
    const f = paintMap(recipe([GROUND, HOUSE, FRAMES]), game);
    expect(f.layers.fuego).toBeUndefined();
    const layers = [1, 2, 3, 4].map(i => f.layers[`fuego_${i}`]);
    for (const l of layers) expect(l).toBeDefined();
    // the inside of the mouth: where the oven of one frame is dark stone
    const mouth: number[] = [];
    for (let y = 80; y < 112; y++) for (let x = 48; x < 82; x++) {
      const i = y * m.width + x;
      if (stone[i] && ['tinta', 'túnica noche'].includes(m.layers.ground.px[i]!)) mouth.push(i);
    }
    expect(mouth.length).toBeGreaterThan(150);
    const keys = new Set<string>();
    for (const l of layers) {
      // flames that fill most of it, with a white heart; behind them the back of the oven, lit: no black
      const fire = mouth.filter(i => l.px[i] !== null);
      expect(fire.length).toBeGreaterThan(mouth.length * 0.4);
      expect(fire.some(i => l.px[i] === 'túnica luz')).toBe(true);
      for (const i of mouth) expect(['tinta', 'túnica noche']).not.toContain(l.px[i] ?? f.layers.ground.px[i]);
      keys.add(mouth.map(i => l.px[i] ?? '.').join());
    }
    expect(keys.size).toBe(4);
  });

  it('the smoke: wide at its foot, it thins out and gets lighter as it rises, until it is gone', () => {
    // room over the chimney for all of it
    const tall: MapGame = { width: 16, height: 16, grid: Array.from({ length: 16 }, () => '.'.repeat(16)), decor: [] };
    const sm = paintMap({ game: tall, materials: MATS, steps: [GROUND, { ...OVEN, at: [4, 11], smoke: { layer: 'humo', puffs: 8, drift: [14, 44], size: [4.5, 12] } }] }, tall);
    expect(sm.layers.humo.px.slice(0, sm.width * 4).every(c => c === null)).toBe(true);
    const rows = new Map<number, string[]>();
    sm.layers.humo.px.forEach((c, i) => { if (c) { const y = Math.floor(i / sm.width); rows.set(y, [...(rows.get(y) ?? []), c]); } });
    const ys = [...rows.keys()].sort((a, b) => a - b), third = Math.floor(ys.length / 3);
    const top = ys.slice(0, third).flatMap(y => rows.get(y)!), foot = ys.slice(-third).flatMap(y => rows.get(y)!);
    expect(top.length).toBeLessThan(foot.length * 0.7);
    const dark = (cs: string[]) => cs.filter(c => c === 'niebla sombra' || c === 'niebla').length / cs.length;
    expect(dark(top)).toBeLessThan(dark(foot));
    // its last rows are only a few px: it does not end in a puff
    expect(rows.get(ys[0])!.length).toBeLessThan(5);
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

  it('a run north-south: posts closer than across, and between each two of them the two rails make whole wood (no grass through the joint)', () => {
    const POSTS = { material: 'vigas', post: [4, 10] as [number, number], rails: [3, 7], spacing: 17, salt: 1903 };
    const ns = paintMap(recipe([GROUND, { step: 'fence', path: [[12, 1], [12, 10]], ...POSTS }]), game);
    const ew = paintMap(recipe([GROUND, { step: 'fence', path: [[1, 10], [10, 10]], ...POSTS }]), game);
    // a cap: ink, then four px lit, a px out of the post on each side
    const caps = (pm: PaintedMap, xs: number[], ys: number[]) => {
      const out: [number, number][] = [];
      for (const y of ys) for (const x of xs) if (at(pm, x, y) === 'tinta' && [1, 2, 3, 4].every(k => at(pm, x + k, y) === 'arena')) out.push([x + 2, y]);
      return out;
    };
    const range = (a: number, b: number) => [...Array(b - a).keys()].map(i => a + i);
    const nsCaps = caps(ns, range(180, 200), range(0, ns.height)).map(([, y]) => y), ewCaps = caps(ew, range(0, ew.width), range(140, 160)).map(([x]) => x);
    const apart = (v: number[]) => (v[v.length - 1] - v[0]) / (v.length - 1);
    expect(nsCaps.length).toBeGreaterThan(5);
    expect(ewCaps.length).toBeGreaterThan(5);
    expect(apart(nsCaps)).toBeLessThan(apart(ewCaps));
    // between two posts, under the foot of one and over the cap of the next: each rail is two px (its edge and its
    // top), so the four columns of the post are wood all the way: no grass between the rails
    const nsWood = kindMask(ns, ['vigas']), nsX = caps(ns, range(180, 200), range(0, ns.height))[0][0];
    let between = 0;
    for (let k = 0; k + 1 < nsCaps.length; k++) {
      for (let y = nsCaps[k] + 11; y < nsCaps[k + 1] - 1; y++) {
        const w = (x: number) => nsWood[y * ns.width + x];
        if (w(nsX) && w(nsX + 1) && w(nsX + 2) && w(nsX + 3)) between++;
      }
    }
    expect(between).toBeGreaterThan(nsCaps.length);
  });

  it('a run east-west: two bars of 2 px between the posts, lit on top, a line of ink under them', () => {
    const ew = paintMap(recipe([GROUND, { step: 'fence', material: 'vigas', path: [[1, 10], [10, 10]], post: [4, 10], rails: [3, 7], spacing: 17 }]), game);
    // halfway between the first two posts (x 16 and ~33): from the top, light, shade, ink; twice
    const kind = kindMask(ew, ['vigas']);
    const col = range0(ew.height).filter(y => kind[y * ew.width + 25]).map(y => at(ew, 25, y) === 'arena' ? 'madera clara' : at(ew, 25, y));
    expect(col).toEqual(['madera clara', 'madera sombra', 'tinta', 'madera clara', 'madera sombra', 'tinta']);
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
    for (const [layer, png] of [['ground', 'forja_receta.png'], ...[1, 2, 3, 4].map(i => [`fuego_${i}`, `forja_receta_fuego_${i}.png`]), ['humo', 'forja_receta_humo.png'], ['copas', 'forja_receta_copas.png'], ['mechones', 'forja_receta_mechones.png']]) {
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
    const chimney = top('piedra de la forja', range(82, 92)), main = top('teja', range(120, 170)), annex = top('teja', range(20, 30));
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

describe('map temple: what the temple of the sect added to the building', () => {
  const tall: MapGame = { width: 16, height: 14, grid: Array.from({ length: 14 }, () => '.'.repeat(16)), decor: [] };
  const mats: MapRecipe['materials'] = {
    ...MATS,
    madera: { ramp: ['túnica noche', 'madera sombra', 'madera sombra', 'madera'] },
    papel: { ramp: ['túnica sombra', 'pergamino'] },
    puerta: { ramp: ['tinta', 'madera', 'madera clara', 'arena', 'oro claro'] },
  };
  // a ridge at y 48 (cell 3), 9 cells across: px 32..175
  const ROOF: MapStepOf<'roof'> = {
    step: 'roof', id: 'techo', material: 'teja', rect: [2, 3, 9, 3], hip: 18, flare: 14, upturn: 16, cap: 6,
    curl: 9, hook: true, crest: 12, ornament: { width: 40 }, salt: 1751,
  };
  const m = paintMap({ game: tall, materials: mats, steps: [GROUND, ROOF] }, tall);

  it('a crest of scrolls on the middle of the ridge, with gold in it and a medallion with a red heart', () => {
    const over = (cs: string[]) => { let n = 0; for (let y = 0; y < 50; y++) for (let x = 0; x < m.width; x++) if (cs.includes(at(m, x, y)!)) n++; return n; };
    expect(over(['oro', 'oro claro', 'bronce'])).toBeGreaterThan(12);
    expect(over(['bermellón'])).toBeGreaterThan(4);
    // the crest rises over the ridge in the middle, not at the ends
    const top = (x: number) => { for (let y = 0; y < m.height; y++) if (m.kind[y * m.width + x] === 'teja') return y; return 999; };
    expect(top(104)).toBeLessThan(top(70) - 6);
  });

  it('hooked horns: each end rises bulging out, and its tip curls back in over the ridge', () => {
    // the west horn: px of the roof over the ridge, west of the crest
    const horn: [number, number][] = [];
    for (let y = 0; y < 47; y++) for (let x = 0; x < 80; x++) if (m.kind[y * m.width + x] === 'teja') horn.push([x, y]);
    const ys = horn.map(p => p[1]), topY = Math.min(...ys);
    const westmost = Math.min(...horn.map(p => p[0]));
    const tipX = Math.min(...horn.filter(p => p[1] <= topY + 1).map(p => p[0]));
    expect(47 - topY).toBeGreaterThanOrEqual(9);
    expect(tipX - westmost).toBeGreaterThanOrEqual(2); // the tip is in from the belly of the horn
  });

  it('a wide flare and turned-up corners do not kink the columns of tiles: a channel moves a px at most from row to row', () => {
    const flat = paintMap({ game: tall, materials: mats, steps: [GROUND, { ...ROOF, crest: 0, ornament: undefined, hook: false }] }, tall);
    let jumps = 0, rows = 0;
    for (let y = 58; y < 86; y++) {
      const here = [], next = [];
      for (let x = 70; x < 140; x++) { if (at(flat, x, y) === 'tinta') here.push(x); if (at(flat, x, y + 1) === 'tinta') next.push(x); }
      if (!here.length || !next.length) continue;
      rows++;
      for (const x of here) if (!next.some(n => Math.abs(n - x) <= 1)) jumps++;
    }
    expect(rows).toBeGreaterThan(10);
    expect(jumps / rows).toBeLessThan(1);
  });

  it('a wall of wood keeps its lattice light (panes), and the upper panels of the double door are lattice too', () => {
    const HALL: MapStepOf<'building'> = {
      step: 'building', id: 'templo', rect: [2, 2, 9, 7], wall: 56, material: 'madera', frame: 'vigas', stone: 'piedra',
      plinth: 14, panes: 'papel', windows: [[7, 12, 34, 18]], doors: [[3.5, 5.5]], door: 'puerta', door_lattice: [21, 11],
    };
    const b = paintMap({ game: tall, materials: mats, steps: [GROUND, HALL] }, tall);
    const WT = 9 * 16 - 56;
    const count = (x0: number, x1: number, y0: number, y1: number, cs: string[]) => {
      let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (cs.includes(at(b, x, y)!)) n++; return n;
    };
    // the window: paper, not the wood of the wall
    expect(count(32 + 8, 32 + 40, WT + 13, WT + 29, ['pergamino', 'túnica sombra'])).toBeGreaterThan(100);
    // the door (px 88..119): paper in the lattice rows, none under them
    expect(count(88, 120, WT + 22, WT + 31, ['pergamino', 'túnica sombra'])).toBeGreaterThan(30);
    expect(count(88, 120, WT + 34, WT + 40, ['pergamino', 'túnica sombra'])).toBe(0);
  });

  it('the smoke step: a column of smoke on its own layer from a point, rising from it; a place moves it', () => {
    const SMOKE: MapStepOf<'smoke'> = { step: 'smoke', at: [6, 11], layer: 'humo', puffs: 8, drift: [7, 36], size: [1, 4.2] };
    const s = paintMap({ game: tall, materials: mats, steps: [GROUND, SMOKE] }, tall);
    const px = s.layers.humo.px.flatMap((c, i) => (c ? [[i % s.width, Math.floor(i / s.width)]] : []));
    expect(px.length).toBeGreaterThan(20);
    expect(Math.max(...px.map(p => p[1]))).toBeLessThanOrEqual(11 * 16 + 3);   // nothing under its mouth
    expect(Math.min(...px.map(p => p[1]))).toBeLessThan(11 * 16 - 25);        // it rises
    expect((moveStep(SMOKE, 2, 3) as MapStepOf<'smoke'>).at).toEqual([8, 14]);
  });
});

describe('map pavilion: what the alchemy pavilion of the sect added to the building', () => {
  const tall: MapGame = { width: 16, height: 14, grid: Array.from({ length: 14 }, () => '.'.repeat(16)), decor: [] };
  const mats: MapRecipe['materials'] = {
    ...MATS,
    verde: { ramp: ['tinta', 'copa sombra', 'vida sombra', 'monte sombra', 'monte', 'lejos', 'lejos luz'] },
    gris: { ramp: ['tinta', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla', 'nube'] },
  };
  // a ridge at y 48 (cell 3), 9 cells across: px 32..175, the eaves at 96
  const ROOF: MapStepOf<'roof'> = { step: 'roof', id: 'techo', material: 'verde', rect: [2, 3, 9, 3], hip: 34, flare: 12, upturn: 20, salt: 1741 };
  const paint = (r: Partial<MapStepOf<'roof'>>) => paintMap({ game: tall, materials: mats, steps: [GROUND, { ...ROOF, ...r }] }, tall);
  const lowest = (m: PaintedMap, x: number) => { let b = -1; for (let y = 0; y < m.height; y++) if (m.kind[y * m.width + x] === 'verde') b = y; return b; };
  const highest = (m: PaintedMap, x: number) => { for (let y = 0; y < m.height; y++) if (m.kind[y * m.width + x] === 'verde') return y; return 999; };

  it('a trim: the ridge and a roll down each hip (hipcap px wide) in another ramp; without it, as before', () => {
    const m = paint({ trim: 'gris', hipcap: 5 });
    const grey = ['basalto luz', 'niebla', 'nube'];
    let n = 0; for (let y = 50; y < 96; y++) for (let x = 0; x < m.width; x++) if (grey.includes(at(m, x, y)!)) n++;
    expect(n).toBeGreaterThan(60);
    const plain = paint({});
    let g = 0; for (let i = 0; i < plain.width * plain.height; i++) if (grey.includes(plain.layers.ground.px[i]!)) g++;
    expect(g).toBe(0);
  });

  it('a sweep: the line of the eaves curves up from the middle, not only at the corners', () => {
    const flat = paint({}), swept = paint({ sweep: 1 });
    const mid = 104, q = 60; // the middle and a point halfway to the west corner
    expect(lowest(flat, mid) - lowest(flat, q)).toBeLessThanOrEqual(2);
    expect(lowest(swept, mid) - lowest(swept, q)).toBeGreaterThanOrEqual(3);
  });

  it('tips: the middle of the eaves runs flat and only the outer share rises to the corner', () => {
    const tipped = paint({ tips: 0.2 }), flat = paint({});
    const mid = 104, q = 60; // the middle and a point halfway to the west corner
    expect(lowest(tipped, mid)).toBe(lowest(tipped, q));                       // flat out to halfway
    expect(lowest(tipped, mid) - lowest(tipped, 20)).toBeGreaterThanOrEqual(10); // the corner up
    expect(lowest(flat, mid) - lowest(flat, q)).toBeGreaterThanOrEqual(1);       // without it, it curves from the middle
  });

  it('tiphook: a curl rises over each front corner of the eaves; [west, east] with a 0 leaves that corner bare', () => {
    const plain = paint({ hipcap: 5, trim: 'gris' }), both = paint({ hipcap: 5, trim: 'gris', tiphook: 9 }), west = paint({ hipcap: 5, trim: 'gris', tiphook: [9, 0] });
    const cnt = (m: PaintedMap, x0: number, x1: number) => { let n = 0; for (let y = 60; y < 96; y++) for (let x = x0; x < x1; x++) if (m.kind[y * m.width + x] === 'verde') n++; return n; };
    const W0 = 0, W1 = 40, E0 = 168, E1 = 208;
    expect(cnt(both, W0, W1) - cnt(plain, W0, W1)).toBeGreaterThanOrEqual(10);
    expect(cnt(both, E0, E1) - cnt(plain, E0, E1)).toBeGreaterThanOrEqual(10);
    expect(cnt(west, W0, W1)).toBe(cnt(both, W0, W1));
    expect(cnt(west, E0, E1)).toBe(cnt(plain, E0, E1));
    // it rises out and over the corner of the eaves
    expect(highest(plain, 15)).toBe(999);                    // nothing out there without it
    expect(highest(both, 15)).toBeLessThan(highest(plain, 20)); // the curl stands over the corner
  });

  it('back: the top of each hip face falls from the end of the ridge to its back corner; the middle stays up', () => {
    const box = paint({}), pyr = paint({ back: 16, sweep: 0.8 });
    expect(highest(pyr, 104)).toBe(highest(box, 104));
    expect(highest(pyr, 40) - highest(box, 40)).toBeGreaterThanOrEqual(6);
  });

  it('an open bay with a floor: the plinth runs on under it, the floor is stone lit at its front edge, columns stand in it', () => {
    const PAV: MapStepOf<'building'> = {
      step: 'building', id: 'pabellón', rect: [2, 2, 9, 7], wall: 52, material: 'revoque', frame: 'vigas', stone: 'piedra', plinth: 12,
      open: [{ at: [0.1, 8.9], shelf: 0, bench: false, floor: 18, columns: 2 }],
    };
    const b = paintMap({ game: tall, materials: mats, steps: [GROUND, PAV] }, tall);
    const F = 9 * 16, mid = 104;
    for (let y = F - 12; y < F; y++) expect(b.kind[y * b.width + mid]).toBe('piedra');      // the plinth under the bay
    expect(b.kind[(F - 20) * b.width + mid]).toBe('piedra');                                // the floor
    expect(at(b, mid, F - 13)).toBe('pergamino');                                           // its lit front edge
    expect(b.kind[(F - 40) * b.width + mid]).toBe('vigas');                                 // the back wall over it
    // two columns of the frame cross the floor between the corner posts of the bay
    let cols = 0; for (let x = 40; x < 170; x++) if (b.kind[(F - 20) * b.width + x] === 'vigas' && b.kind[(F - 20) * b.width + x - 1] !== 'vigas') cols++;
    expect(cols).toBe(2);
  });
});
