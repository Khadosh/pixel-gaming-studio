// @vitest-environment node
// A light that brightens, with a shape (issue #25): the fan of a door and a polygon, besides the pool of a lamp.
// Measured as a person would, by how light the colors are (their hex), not by whether a px changed: a light that
// paints a darker or an equal color is not a light. The floor is a grid of tiles in two cold tones with dark joints
// and the light climbs a warm ramp: the door of a yard at night (el-patio, DIARIO.md, Mapa 4, 4 bis and 13).
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';

const COLD = ['noche', 'junta', 'violeta', 'azul', 'azul medio', 'azul claro'];
const WARM = ['tierra noche', 'tierra sombra', 'madera', 'tierra', 'tierra clara', 'naranja', 'ocre', 'amarillo', 'crema'];
const HEX: Record<string, string> = {
  noche: '#1c1930', junta: '#2c2849', violeta: '#463d69', azul: '#34466f', 'azul medio': '#4e6894', 'azul claro': '#7d97bf',
  'tierra noche': '#2f2632', 'tierra sombra': '#4a3a44', madera: '#5a3d36', tierra: '#6b5156', 'tierra clara': '#8f6f63',
  naranja: '#e08a4a', ocre: '#d9a24a', amarillo: '#f3c76a', crema: '#fff0c8',
  'pasto sombra': '#2b4a46', pasto: '#41665a', 'pasto claro': '#638a6c',
};
const lum = (c: string | null) => {
  const h = HEX[c ?? ''];
  if (!h) return -1;
  const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};

const game: MapGame = { width: 20, height: 11, grid: Array.from({ length: 11 }, () => '.'.repeat(20)) };
const TILES: MapStep = {
  step: 'area', id: 'baldosas', material: 'baldosa', shape: { rect: [0, 3, 20, 4] },
  planks: { board: [11, 12, 0], tones: ['azul', 'azul medio', 'azul medio'], fall: [0, 40, 0, 0, 9], grain: [9, 1.3, 2, -1], knots: 0,
    colors: { joint: 'junta', end: 'junta', nails: ['azul medio', 'azul medio'] } },
} as MapStep;
const recipe = (steps: MapStep[], extra: Partial<MapRecipe> = {}): MapRecipe => ({
  game, colors: HEX,
  materials: {
    pasto: { ramp: ['pasto sombra', 'pasto', 'pasto claro'], texture: 'flat' },
    baldosa: { ramp: COLD, texture: 'planks' },
    luz: { ramp: WARM, texture: 'flat' },
  },
  steps: [{ step: 'area', material: 'pasto', shape: 'all' }, TILES, ...steps], ...extra,
});
const px = (m: PaintedMap, x: number, y: number, layer = 'ground') => m.layers[layer]?.px[y * m.width + x] ?? null;
// the door: the middle of cell (9, 2.5) is px (152, 48); the light goes down
const DOOR: MapStep = { step: 'glow', id: 'puerta', at: [9, 2.5], fan: [0, 1, 90, 16], r: [6, 56], tones: 4, fray: 0, on: ['baldosa'], ramps: { baldosa: 'luz' } };
const bare = paintMap(recipe([]), game);
const lit = paintMap(recipe([DOOR]), game);

describe('glow with a fan: the light of a door', () => {
  it('every px it reaches is lighter than it was, and the light falls off away from the door', () => {
    let reached = 0;
    for (let y = 48; y < 112; y++) for (let x = 100; x < 204; x++) {
      const a = px(bare, x, y), b = px(lit, x, y);
      if (a === b) continue;
      reached++;
      expect(lum(b)).toBeGreaterThan(lum(a));
    }
    expect(reached).toBeGreaterThan(1500);
    // straight down the middle, column 151: the same px of the floor lit less and less (compare tiles of one tone)
    const gain = (y: number) => WARM.indexOf(px(lit, 151, y)!) - COLD.indexOf(px(bare, 151, y)!);
    expect(gain(54)).toBe(4);
    expect(gain(100)).toBeLessThan(gain(70));
    expect(gain(70)).toBeLessThanOrEqual(gain(54));
  });

  it('nothing past its sides, behind the opening or past r', () => {
    // 45° each side of straight down: at 40 px down the light is 8 + 40 px either side of the middle at most
    for (let y = 52; y < 112; y++) for (const x of [152 - (y - 48) - 14, 152 + (y - 48) + 14]) {
      if (x >= 0 && x < bare.width) expect(px(lit, x, y)).toBe(px(bare, x, y));
    }
    for (let y = 0; y < 48; y++) for (let x = 120; x < 184; x++) expect(px(lit, x, y)).toBe(px(bare, x, y));
    expect(px(lit, 152, 48 + 60)).toBe(px(bare, 152, 48 + 60));
  });

  it('as wide as the door at the opening: width moves the apex back', () => {
    const row = (m: PaintedMap) => [...Array(32).keys()].map(i => px(m, 136 + i, 50)).filter((c, i) => c !== px(bare, 136 + i, 50)).length;
    const narrow = paintMap(recipe([{ ...DOOR, fan: [0, 1, 90] } as MapStep]), game);
    expect(row(lit)).toBeGreaterThanOrEqual(16);
    expect(row(narrow)).toBeLessThan(row(lit));
  });

  it('turns with its direction: toward the right it lights the right and not below', () => {
    const right = paintMap(recipe([{ ...DOOR, fan: [1, 0, 60] } as MapStep]), game);
    expect(lum(px(right, 190, 52))).toBeGreaterThan(lum(px(bare, 190, 52)));
    expect(px(right, 152, 100)).toBe(px(bare, 152, 100));
  });

  it('edge: the sides fade in, so a px near a side is lit less than one in the middle at the same distance', () => {
    const soft = paintMap(recipe([{ ...DOOR, edge: 14 } as MapStep]), game);
    const gain = (m: PaintedMap, x: number, y: number) => WARM.indexOf(px(m, x, y)!) - COLD.indexOf(px(bare, x, y)!);
    // 30 px down the side is 38 px off the middle: 5 px inside it the soft one is lit less than the hard one, and
    // in the middle both the same
    expect(gain(soft, 152 + 33, 78)).toBeGreaterThan(0);
    expect(gain(soft, 152 + 33, 78)).toBeLessThan(gain(lit, 152 + 33, 78));
    expect(gain(soft, 152, 78)).toBe(gain(lit, 152, 78));
  });
});

describe('glow ramps: the tone of a lit px is its tone on its own ramp, plus the light, on the ramp of the light', () => {
  it('a cold tile climbs the warm ramp, its joints stay darker than its face', () => {
    let faces = 0, joints = 0;
    for (let y = 50; y < 62; y++) for (let x = 146; x < 158; x++) {
      const a = px(bare, x, y)!, b = px(lit, x, y)!;
      expect(WARM).toContain(b);
      expect(WARM.indexOf(b)).toBe(COLD.indexOf(a) + 4);
      if (a === 'junta') joints++; else faces++;
    }
    expect(joints).toBeGreaterThan(5);
    expect(faces).toBeGreaterThan(80);
  });

  it('even: the lighter tiles light as the base, so one ring is one color; the joints keep their mark', () => {
    const even = paintMap(recipe([{ ...DOOR, even: true } as MapStep]), game);
    const faces = new Set<string>(), joints = new Set<string>();
    for (let y = 50; y < 58; y++) for (let x = 146; x < 158; x++) (px(bare, x, y) === 'junta' ? joints : faces).add(px(even, x, y)!);
    expect([...faces]).toEqual(['amarillo']);   // azul (3) and azul medio (4) both light as the base (3) + 4
    for (const j of joints) expect(lum(j)).toBeLessThan(lum('amarillo'));
  });

  it('a material with no ramp of its own and no lighten table is left as it was (on decides what it reaches)', () => {
    const all = paintMap(recipe([{ ...DOOR, on: undefined } as MapStep]), game);
    for (let y = 0; y < bare.height; y++) for (let x = 0; x < bare.width; x++) {
      if (bare.kind[y * bare.width + x] === 'pasto') expect(px(all, x, y)).toBe(px(bare, x, y));
    }
    const grass = paintMap(recipe([{ ...DOOR, r: [6, 90], on: undefined, ramps: { baldosa: 'luz', pasto: 'pasto' } } as MapStep]), game);
    expect(lum(px(grass, 152, 120))).toBeGreaterThan(lum(px(bare, 152, 120)));
  });
});

describe('even per material and a light that falls off down a line (Khadosh/pixel-gaming-studio#45)', () => {
  // the door of el-patio: one glow over the tiles and on over the grass, where it used to take two
  const faces = (m: PaintedMap) => {
    const c = new Set<string>();
    for (let y = 50; y < 58; y++) for (let x = 146; x < 158; x++) if (px(bare, x, y) !== 'junta') c.add(px(m, x, y)!);
    return [...c];
  };
  it('even: a list lights even only the materials it names', () => {
    expect(faces(paintMap(recipe([{ ...DOOR, even: ['baldosa'] } as MapStep]), game))).toEqual(['amarillo']);
    const notTiles = faces(paintMap(recipe([{ ...DOOR, on: undefined, ramps: { baldosa: 'luz', pasto: 'pasto' }, even: ['pasto'] } as MapStep]), game));
    expect(notTiles.length).toBeGreaterThan(1);   // the tiles keep their two tones: even was for the grass
  });
  it('even names a material with no ramp in ramps: refused, not ignored (a typo would light nothing even)', () => {
    expect(() => paintMap(recipe([{ ...DOOR, even: ['baldoza'] } as MapStep]), game)).toThrow(/even names "baldoza".*ramps has "baldosa"/);
  });

  const ALONG: MapStep = { ...DOOR, r: [6, 50], along: true } as MapStep;
  const last = (m: PaintedMap, x: number) => { let l = -1; for (let y = 48; y < 112; y++) if (px(m, x, y) !== px(bare, x, y)) l = y; return l; };
  it('along: the light ends in a straight line across the fan, not in an arc from the door', () => {
    const round = paintMap(recipe([{ ...ALONG, along: undefined } as MapStep]), game), straight = paintMap(recipe([ALONG]), game);
    // 30 px off the middle the round one ends well before the middle does; the straight one at the same row
    expect(last(round, 182)).toBeLessThan(last(round, 152) - 4);
    expect(Math.abs(last(straight, 182) - last(straight, 152))).toBeLessThanOrEqual(1);
    expect(last(straight, 152)).toBe(last(round, 152));   // down the middle both measure the same
    // and across a row the light is the same: the same tile tone takes the same color
    const gain = (x: number, y: number) => WARM.indexOf(px(straight, x, y)!) - COLD.indexOf(px(bare, x, y)!);
    for (const [x, y] of [[144, 60], [160, 60], [140, 75], [182, 75], [130, 90], [182, 90]]) if (px(bare, x, y) !== 'junta' && px(bare, 152, y) !== 'junta') expect(gain(x, y)).toBe(gain(152, y));
  });
  it('along: one glow goes on from the tiles over the grass, as wide as the fan and dying out at a line', () => {
    const one = paintMap(recipe([{ ...ALONG, r: [6, 80], on: undefined, ramps: { baldosa: 'luz', pasto: 'pasto' }, even: ['baldosa'] } as MapStep]), game);
    // the grass below the tiles (px 112 on) is lit right under the door and 40 px to its side, at the same row
    for (const x of [152, 192]) expect(lum(px(one, x, 116))).toBeGreaterThan(lum(px(bare, x, 116)));
    expect(px(one, 152, 48 + 6 + 80 + 4)).toBe(px(bare, 152, 48 + 6 + 80 + 4));
  });
  it('along [dx, dy] on a polygon: the light falls off from at down that direction', () => {
    const POLY: MapStep = { step: 'glow', polygon: [[2, 3], [8, 3], [8, 7], [2, 7]], at: [5, 2.5], r: [0, 60], along: [0, 1], tones: 4, fray: 0, ramps: { baldosa: 'luz' }, on: ['baldosa'] };
    const m = paintMap(recipe([POLY]), game);
    const gain = (x: number, y: number) => WARM.indexOf(px(m, x, y)!) - COLD.indexOf(px(bare, x, y)!);
    const row = (y: number) => [40, 88, 120].filter(x => px(bare, x, y) !== 'junta').map(x => gain(x, y));
    expect(new Set(row(60)).size).toBe(1);
    expect(Math.max(...row(100))).toBeLessThan(Math.min(...row(60)));
  });
  it('along says what it cannot paint', () => {
    const run = (st: Partial<MapStep>) => () => paintMap(recipe([{ step: 'glow', ...st } as MapStep]), game);
    expect(run({ at: [5, 5], fan: [0, 1, 60], along: true })).toThrow(/there is no r/);
    expect(run({ at: [5, 5], r: [4, 20], along: [0, 1] })).toThrow(/needs sides/);
    expect(run({ at: [5, 5], r: [4, 20], polygon: [[0, 0], [4, 0], [4, 4]], along: true })).toThrow(/no fan/);
    expect(run({ at: [5, 5], r: [4, 20], fan: [0, 1, 60], along: [0, 0] })).toThrow(/direction/);
  });
});

describe('fray and edge per material (Khadosh/estudio#214)', () => {
  // the door of el-patio in one glow: the ring clean over the tiles (a bitten ring there reads as dirt) and bitten
  // over the grass (an even edge there reads as a rug), as its two glows had it before one could go on over both
  const ONE: MapStep = { ...DOOR, r: [6, 80], along: true, edge: 12, on: undefined, ramps: { baldosa: 'luz', pasto: 'pasto' }, even: ['baldosa'] } as MapStep;
  const tile = (y: number) => y >= 48 && y < 112;   // the rect of TILES, rows 3 to 6
  const differ = (a: PaintedMap, b: PaintedMap, on: (y: number) => boolean) => {
    let n = 0;
    for (let y = 0; y < a.height; y++) if (on(y)) for (let x = 0; x < a.width; x++) if (px(a, x, y) !== px(b, x, y)) n++;
    return n;
  };
  const grass = (y: number) => !tile(y);
  it('fray: each material is bitten as its own number, in the same glow', () => {
    const clean = paintMap(recipe([{ ...ONE, fray: 0.2 } as MapStep]), game), bitten = paintMap(recipe([{ ...ONE, fray: 0.7 } as MapStep]), game);
    const both = paintMap(recipe([{ ...ONE, fray: { baldosa: 0.2, pasto: 0.7 } } as MapStep]), game);
    expect(differ(clean, bitten, grass)).toBeGreaterThan(20);   // the two numbers do bite the grass differently
    expect(differ(both, clean, tile)).toBe(0);
    expect(differ(both, bitten, grass)).toBe(0);
  });
  it('fray: a material left out takes the default, 0.5; one number is the same light as before', () => {
    const half = paintMap(recipe([{ ...ONE, fray: 0.5 } as MapStep]), game);
    expect(differ(paintMap(recipe([{ ...ONE, fray: { baldosa: 0.2 } } as MapStep]), game), half, grass)).toBe(0);
    expect(differ(paintMap(recipe([{ ...ONE, fray: { baldosa: 0.5, pasto: 0.5 } } as MapStep]), game), half, () => true)).toBe(0);
  });
  it('edge: each material fades in from the sides over its own px', () => {
    // the light reaching far over the grass and the grass climbing the warm ramp too: a px with less than one tone of
    // light climbs one whatever the edge does, and on its own three tones the grass by the door is already its lightest
    const fan = { ...ONE, r: [40, 140], fray: 0, ramps: { baldosa: 'luz', pasto: 'luz' } } as MapStep;
    const soft = paintMap(recipe([{ ...fan, edge: 24 } as MapStep]), game), hard = paintMap(recipe([{ ...fan, edge: 4 } as MapStep]), game);
    const both = paintMap(recipe([{ ...fan, edge: { baldosa: 4, pasto: 24 } } as MapStep]), game);
    expect(differ(soft, hard, grass)).toBeGreaterThan(20);
    expect(differ(both, hard, tile)).toBe(0);
    expect(differ(both, soft, grass)).toBe(0);
  });
  it('a name that is not a material of the recipe is refused, not ignored', () => {
    expect(() => paintMap(recipe([{ ...ONE, fray: { baldosa: 0.2, pastos: 0.7 } } as MapStep]), game)).toThrow(/fray names "pastos", not a material/);
    expect(() => paintMap(recipe([{ ...ONE, edge: { baldoza: 4 } } as MapStep]), game)).toThrow(/edge names "baldoza"/);
  });
});

describe('glow with a polygon', () => {
  const POLY: MapStep = { step: 'glow', id: 'ventana', polygon: [[2, 3.5], [6, 3.5], [7, 6], [3, 6]], tones: 3, fray: 0, ramps: { baldosa: 'luz' }, on: ['baldosa'] };
  it('lights inside the polygon and nothing outside it', () => {
    const m = paintMap(recipe([POLY]), game);
    expect(lum(px(m, 72, 76))).toBeGreaterThan(lum(px(bare, 72, 76)));
    for (const [x, y] of [[20, 76], [120, 76], [72, 50], [72, 100]]) expect(px(m, x, y)).toBe(px(bare, x, y));
  });
  it('with edge, its middle is lit more than a px near its border', () => {
    const m = paintMap(recipe([{ ...POLY, edge: 12 } as MapStep]), game);
    const gain = (x: number, y: number) => WARM.indexOf(px(m, x, y)!) - COLD.indexOf(px(bare, x, y)!);
    expect(gain(72, 76)).toBe(3);
    expect(gain(72, 59)).toBeLessThan(3);
  });
});

describe('glow lives with the shadows', () => {
  const CAST: MapStep = { step: 'light', decor: false, trees: false, faces: false, casts: [[9.5, 4.5, 10, 6, 5]] };
  it('a shadow laid after the light still darkens it, and the shadowed px stays lighter than unlit floor in shadow', () => {
    const before = paintMap(recipe([DOOR, CAST]), game), dark = paintMap(recipe([CAST]), game);
    let shaded = 0;
    for (let y = 64; y < 84; y++) for (let x = 140; x < 164; x++) {
      if (px(dark, x, y) === px(bare, x, y)) continue;   // not under the cast
      shaded++;
      expect(lum(px(before, x, y))).toBeLessThan(lum(px(lit, x, y)));
      expect(lum(px(before, x, y))).toBeGreaterThan(lum(px(dark, x, y)));
    }
    expect(shaded).toBeGreaterThan(30);
  });
  it('on a layer it lights the finished ground: a shadow under it reads darker than the light around it', () => {
    const m = paintMap(recipe([{ ...DOOR, layer: 'luz' } as MapStep, CAST]), game);
    const dark = paintMap(recipe([CAST]), game);
    expect(px(m, 152, 74)).toBe(px(dark, 152, 74));   // the ground keeps its shadow
    let under = 0;
    for (let y = 64; y < 84; y++) for (let x = 140; x < 164; x++) {
      if (px(dark, x, y) === px(bare, x, y)) continue;
      under++;
      expect(lum(px(m, x, y, 'luz'))).toBeLessThan(lum(px(lit, x, y)));
    }
    expect(under).toBeGreaterThan(30);
  });
});

describe('glow says what it cannot paint', () => {
  const run = (st: Partial<MapStep>) => () => paintMap(recipe([{ step: 'glow', ...st } as MapStep]), game);
  it('a fan needs at and an aperture under 180°', () => {
    expect(run({ fan: [0, 1, 60], r: [4, 20] })).toThrow(/needs at/);
    expect(run({ at: [5, 5], fan: [0, 1, 180] })).toThrow(/aperture/);
    expect(run({ at: [5, 5], fan: [0, 0, 60] })).toThrow(/direction/);
  });
  it('a pool needs r, and r is [core, edge]', () => {
    expect(run({ at: [5, 5] })).toThrow(/needs r/);
    expect(run({ at: [5, 5], r: [20, 10] })).toThrow(/edge/);
  });
  it('fan or polygon, not both', () => {
    expect(run({ at: [5, 5], fan: [0, 1, 60], polygon: [[0, 0], [1, 0], [1, 1]] })).toThrow(/not both/);
  });
});

describe('map_glow reaches an agent', () => {
  it('its published schema has no tuple items (`items: [...]`), which the API refuses and drops the whole tool for', async () => {
    const { publishedTools } = await import('../mcpcatalog');
    const { commands } = await import('../commands');
    const tool = publishedTools(commands).find(t => t.name === 'pgs_map_glow');
    expect(tool).toBeDefined();
    const tuples: string[] = [];
    const walk = (n: unknown, path: string): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray((n as { items?: unknown }).items)) tuples.push(path);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    walk(tool!.inputSchema, 'pgs_map_glow');
    expect(tuples).toEqual([]);
  });
});
