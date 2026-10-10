// @vitest-environment node
// Map recipes: the painter (mappaint.ts), the disk side (mapfile.ts) and the map_* commands.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fbm, h2, n1 } from './mapnoise';
import { paintMap } from './mappaint';
import { readRecipe, renderRecipe, writeJsonKeys } from './mapfile';
import type { MapGame, MapRecipe } from './maprecipe';
import { readPng } from './png';
import { runCommand } from './commands';
import { fromAscii } from './ascii';

const FIX = join(__dirname, 'fixtures/mapas');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-map-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const EARTH = ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'arena'];
const WATER = ['hoja sombra', 'celeste oscuro', 'celeste', 'celeste luz', 'ojo'];

/** A 12×8 map: walls on the left column, a tall tree at (8, 4), the rest walkable. */
function smallGame(): MapGame {
  const grid = Array.from({ length: 8 }, (_, v) => (v < 8 ? '#' : '.') + '.'.repeat(11));
  return { width: 12, height: 8, grid, decor: [{ sprite: 'pino', at: [8, 4], size: [2, 3] }] };
}

function smallRecipe(steps: MapRecipe['steps']): MapRecipe {
  return {
    game: smallGame(), margin: [1, 1], light: [1, 1],
    materials: {
      grass: { ramp: GRASS, texture: 'patches', shade_min: 1 },
      earth: { ramp: EARTH, texture: 'mottled', shade_max: 2 },
      water: { ramp: WATER, texture: 'water' },
    },
    steps,
  };
}

describe('map noise', () => {
  it('is the same noise as the drawing scripts (suelo_ladera.py)', () => {
    expect(h2(0, 0, 0)).toBe(0);
    expect(h2(3, -7, 9)).toBeCloseTo(0.31057214736938477, 12);
    expect(h2(-12, 5, 131)).toBeCloseTo(0.6468431949615479, 12);
    expect(h2(123456, 654321, 41)).toBeCloseTo(0.4684278964996338, 12);
    expect(fbm(1.3, 2.7, 9)).toBeCloseTo(0.44684417654711034, 12);
    expect(fbm(-4.2, 0.5, 3)).toBeCloseTo(0.3593423726184278, 12);
    expect(n1(2.5, 71)).toBeCloseTo(0.2967798411846161, 12);
  });
});

describe('map recipe: the ladera', () => {
  it('paints the same ground the ladera script painted (≥ 99.5 % of the pixels) and passes the style lint', async () => {
    const r = renderRecipe(join(FIX, 'ladera.receta.json'));
    const ref = readPng(join(FIX, 'ladera_script.png'));
    const g = r.map.layers.ground;
    expect([g.w, g.h]).toEqual([ref.width, ref.height]);
    let same = 0;
    for (let i = 0; i < g.w * g.h; i++) {
      const hex = r.colors[g.px[i]!];
      const ref6 = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
      if (hex === ref6) same++;
    }
    expect(same / (g.w * g.h)).toBeGreaterThan(0.995);
    expect(Object.keys(r.map.layers).sort()).toEqual(['copas', 'ground', 'mechones', 'rocio']);
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'ladera.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  });

  it('is deterministic, and the seed changes it', () => {
    const recipe = readRecipe(join(FIX, 'ladera.receta.json'));
    const a = renderRecipe(join(FIX, 'ladera.receta.json')).map.layers.ground.px;
    const b = renderRecipe(join(FIX, 'ladera.receta.json')).map.layers.ground.px;
    expect(a).toEqual(b);
    const seeded = join(dir, 'seeded.json');
    for (const f of ['ladera.json', 'visuals.json', 'paleta.pss.json']) copyFileSync(join(FIX, f), join(dir, f));
    writeFileSync(seeded, JSON.stringify({ ...recipe, seed: 7 }));
    const c = renderRecipe(seeded).map.layers.ground.px;
    expect(c.filter((v, i) => v !== a[i]).length).toBeGreaterThan(a.length * 0.2);
  });
});

describe('map painter', () => {
  it('a path is a ribbon of earth with a dark bank on the side of the light and a lit lip on the far grass', () => {
    const m = paintMap(smallRecipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'path', id: 'p', material: 'earth', points: [[6, -1], [6, 4], [6, 9]], width: [6, 0], tufts: 0 },
    ]), smallGame());
    const g = m.layers.ground, [ox, oy] = m.origin;
    const cx = ox + 6 * 16, cy = oy + 4 * 16;
    expect(m.kind[cy * m.width + cx]).toBe('earth');
    expect(EARTH).toContain(g.get(cx, cy));
    // walking right from the center: the last earth px is followed by the lit lip of the grass
    let x = cx;
    while (m.kind[cy * m.width + x + 1] === 'earth') x++;
    expect(g.get(x + 1, cy)).toBe('bambú claro');
    // walking left: the border on the light side is the bank shadow (the two darkest earths)
    x = cx;
    while (m.kind[cy * m.width + x - 1] === 'earth') x--;
    expect(['madera sombra', 'tierra sombra']).toContain(g.get(x + 1, cy));
  });

  it('a soft path is trodden, not drawn: no bank, grass tips over a ragged border, a verge of worn grass', () => {
    const steps = (soft: boolean): MapRecipe['steps'] => [
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'path', id: 'p', material: 'earth', points: [[6, -1], [6, 4], [6, 9]], width: [6, 0], tufts: 0, ruts: [0, 0], ...(soft ? { soft: {} } : {}) },
    ];
    const drawn = paintMap(smallRecipe(steps(false)), smallGame()), trodden = paintMap(smallRecipe(steps(true)), smallGame());
    const count = (m: typeof drawn, f: (c: string | null, i: number) => boolean) => {
      let n = 0;
      for (let i = 0; i < m.width * m.height; i++) if (f(m.layers.ground.get(i % m.width, Math.floor(i / m.width)), i)) n++;
      return n;
    };
    // the drawn one has its bank of the darkest earths; the trodden one none
    expect(count(drawn, c => c === 'madera sombra')).toBeGreaterThan(20);
    expect(count(trodden, c => c === 'madera sombra' || c === 'tierra sombra')).toBe(0);
    // the border wanders: the earth of each row is not the same width all the way down
    const [ox, oy] = trodden.origin;
    const widths = new Set<number>();
    for (let y = oy; y < oy + 8 * 16; y++) {
      let n = 0;
      for (let x = ox; x < ox + 12 * 16; x++) if (trodden.kind[y * trodden.width + x] === 'earth') n++;
      widths.add(n);
    }
    expect(widths.size).toBeGreaterThan(3);
    // dark grass tips over the earth: a grass px with earth beside it, two steps down the grass ramp
    const near = (m: typeof drawn, i: number) => [1, -1, m.width, -m.width].some(d => m.kind[i + d] === 'earth');
    expect(count(trodden, (c, i) => c === 'hoja sombra' && near(trodden, i))).toBeGreaterThan(10);
    // the verge: more of the lightest grass beside the path than on the drawn one
    const light = (m: typeof drawn) => count(m, (c, i) => c === 'pasto' && m.kind[i] === 'grass');
    expect(light(trodden)).toBeGreaterThan(light(drawn) + 40);
  });

  it('a branch with fade breaks up into the grass toward its free end', () => {
    const m = paintMap(smallRecipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'path', id: 'p', material: 'earth', points: [[0, 4], [3, 4]], width: [5, 0], tufts: 0, soft: { worn: 0 },
        branches: [{ points: [[3, 4], [11, 4]], width: [5, 0], breath: 20, fade: [0, 64] }] },
    ]), smallGame());
    const [ox, oy] = m.origin;
    const earth = (u0: number, u1: number) => {
      let n = 0;
      for (let y = oy + 2 * 16; y < oy + 6 * 16; y++) for (let x = ox + u0 * 16; x < ox + u1 * 16; x++) if (m.kind[y * m.width + x] === 'earth') n++;
      return n;
    };
    expect(earth(4, 6)).toBeGreaterThan(250);
    expect(earth(9, 11)).toBeLessThan(earth(4, 6) * 0.4);
  });

  it('light casts the shadow of a tall decor down-right of its foot, one step down the ramp', () => {
    const steps: MapRecipe['steps'] = [{ step: 'area', material: 'grass', shape: 'all' }];
    const lit = paintMap(smallRecipe(steps), smallGame());
    const shaded = paintMap(smallRecipe([...steps, { step: 'light' }]), smallGame());
    const [ox, oy] = lit.origin;
    let darker = 0, lighter = 0;
    for (let y = oy + 4 * 16; y < oy + 6 * 16; y++) for (let x = ox + 9 * 16; x < ox + 11 * 16; x++) {
      const a = GRASS.indexOf(lit.layers.ground.get(x, y)!), b = GRASS.indexOf(shaded.layers.ground.get(x, y)!);
      if (b < a) darker++; else if (b > a) lighter++;
    }
    expect(darker).toBeGreaterThan(100);
    expect(lighter).toBe(0);
  });

  it('water has foam on the low shore, shallow at the border and glints on their own layer', () => {
    const m = paintMap(smallRecipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'water', material: 'water', shape: { blobs: [[6, 4, 3.5, 2.5, 0.1]] }, glints: 'brillos', waves: 0 },
    ]), smallGame());
    const g = m.layers.ground, [ox, oy] = m.origin;
    const cx = ox + 6 * 16;
    let y = oy + 4 * 16;
    while (m.kind[(y + 1) * m.width + cx] === 'water') y++;
    expect(g.get(cx, y)).toBe('celeste luz');
    expect(m.layers.brillos.used().length).toBeGreaterThan(0);
    for (let i = 0; i < m.width * m.height; i++) if (m.layers.brillos.px[i]) expect(m.kind[i]).toBe('water');
  });

  it('scatter with walkable: false never lands on a walkable cell; a stamp lands where it is told', () => {
    const m = paintMap(smallRecipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'scatter', what: 'tufts', layer: 'puntas', walkable: false, count: 4000, near: ['earth'] },
      { step: 'scatter', what: 'stamp', at: [[3, 3]], rows: ['ab', 'ba'], glyphs: { a: 'arena', b: 'tierra' } },
    ]), smallGame());
    const tips = m.layers.puntas, [ox, oy] = m.origin;
    let some = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (!tips.get(x, y)) continue;
      some++;
      // the foot of a tuft (3 px under its tips at most, 3 px to a side) is on a wall or in the margin
      const nearWall = x - ox < 16 + 4 || x - ox >= 12 * 16 - 4 || y - oy < 0 || y - oy >= 8 * 16 - 3;
      expect(nearWall).toBe(true);
    }
    expect(some).toBeGreaterThan(0);
    expect(m.layers.ground.get(ox + 48, oy + 48)).toBe('arena');
    expect(m.layers.ground.get(ox + 49, oy + 48)).toBe('tierra');
  });

  it('a flipped stamp is the same drawing mirrored inside its box, at the same place', () => {
    const at = (flip: boolean) => paintMap(smallRecipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'scatter', what: 'stamp', at: [[3, 3]], rows: ['ab.', 'a'], glyphs: { a: 'arena', b: 'tierra' }, flip },
    ]), smallGame());
    const plain = at(false), flipped = at(true), [ox, oy] = plain.origin, x = ox + 48, y = oy + 48;
    expect([plain.layers.ground.get(x, y), plain.layers.ground.get(x + 1, y)]).toEqual(['arena', 'tierra']);
    // the box is three wide (the widest row): the pole (a) goes to the third column, in both rows
    expect([flipped.layers.ground.get(x + 2, y), flipped.layers.ground.get(x + 1, y)]).toEqual(['arena', 'tierra']);
    expect(flipped.layers.ground.get(x + 2, y + 1)).toBe('arena');
    expect(flipped.layers.ground.get(x, y)).not.toBe('arena');
  });

  it('the forest edge goes around the outside of the map, and crowns poke in on another layer', () => {
    const recipe = smallRecipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', id: 'f', material: 'forest', shape: { outside: { sides: 'lr' } } },
      { step: 'area', material: 'forest', shape: { poke: 'f' }, layer: 'front' },
    ]);
    recipe.materials.forest = { ramp: GRASS.slice(0, 6), texture: 'canopy' };
    const m = paintMap(recipe, smallGame());
    expect(m.kind[8 * m.width + 2]).toBe('forest');
    expect(m.kind[8 * m.width + m.width - 3]).toBe('forest');
    expect(m.kind[(m.origin[1] + 30) * m.width + m.origin[0] + 90]).toBe('grass');
    expect(m.layers.front.used().length).toBeGreaterThan(1);
  });

  it('cells of the game grid become an organic shape (grid_mask), slabs and a raised area with its face', () => {
    const recipe = smallRecipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', material: 'stone', shape: { cells: '#' } },
      { step: 'area', material: 'stone', shape: { blobs: [[8, 3, 1.5, 1.2]] }, face: 8 },
      { step: 'area', material: 'patio', shape: { rect: [3, 5, 3, 2] } },
    ]);
    recipe.materials.stone = { ramp: ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'], texture: 'grain', base: 4 };
    recipe.materials.patio = { ramp: ['túnica oscura', 'piedra sombra', 'piedra', 'piedra clara'], texture: 'slabs' };
    const m = paintMap(recipe, smallGame());
    const [ox, oy] = m.origin;
    expect(m.kind[(oy + 3 * 16 + 8) * m.width + ox + 8]).toBe('stone');           // the wall column
    expect(m.kind[(oy + 3 * 16 + 8) * m.width + ox + 3 * 16]).toBe('grass');
    // the raised blob: its foot row is the darkest line, the top lighter
    const col = ox + 8 * 16;
    let y = oy + 3 * 16;
    while (m.kind[(y + 1) * m.width + col] === 'stone') y++;
    expect(['túnica noche', 'tinta']).toContain(m.layers.ground.get(col, y));
    const tones = new Set<string>();
    for (let yy = oy + 5 * 16; yy < oy + 7 * 16; yy++) for (let x = ox + 3 * 16; x < ox + 6 * 16; x++) tones.add(m.layers.ground.get(x, yy)!);
    expect(tones.size).toBeGreaterThanOrEqual(3);
  });

  it('a rect court can fray its sides and cut its corners, so no side runs straight', () => {
    const steps = (shape: Record<string, unknown>): MapRecipe['steps'] => [
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', id: 'patio', material: 'earth', shape: shape as never },
    ];
    const run = (shape: Record<string, unknown>) => {
      const m = paintMap(smallRecipe(steps(shape)), smallGame());
      const [ox, oy] = m.origin;
      // The longest run of rows whose left border sits on the same column.
      let best = 0, run = 0, prev = -99;
      for (let y = oy + 2 * 16; y < oy + 6 * 16; y++) {
        let x = ox + 1 * 16;
        while (x < ox + 9 * 16 && m.kind[y * m.width + x] !== 'earth') x++;
        run = x === prev ? run + 1 : 1;
        prev = x;
        best = Math.max(best, run);
      }
      return { m, best };
    };
    const ruler = run({ rect: [2, 2, 6, 4] });
    expect(ruler.best).toBeGreaterThan(32);                            // a ruler: the whole side
    const hand = run({ rect: [2, 2, 6, 4], wobble: 2, period: 11, salt: 7, corners: 9 });
    expect(hand.best).toBeLessThanOrEqual(32);                         // laid by hands: it frays
    const [ox, oy] = hand.m.origin;
    expect(hand.m.kind[(oy + 2 * 16) * hand.m.width + ox + 2 * 16]).toBe('grass');   // the corner, cut
    expect(hand.m.kind[(oy + 4 * 16) * hand.m.width + ox + 5 * 16]).toBe('earth');   // the middle, paved
  });
});

describe('map objects: a stamp drawn in a file of its own', () => {
  const OBJECT: Record<string, string> = { 'bermellón': '#a83a29', 'bermellón claro': '#d14b34', madera: '#8a5a3c' };
  const PALETTE = { ...Object.fromEntries(GRASS.map((c, i) => [c, `#0${i}3020`])), ...OBJECT };
  const ROWS = ['ab.', '.cc'];
  const GLYPHS = { a: 'bermellón', b: 'bermellón claro', c: 'madera' };
  const drawing = (legend: string[]) => ['id: farol', 'name: Farol de poste', 'category: prop', 'size: 3x2', '', ...legend, '', '==', ...ROWS, ''].join('\n');
  const LEGEND = ['a = #a83a29 bermellón', 'b = #d14b34 bermellón claro', 'c = #8a5a3c madera'];

  /** A recipe whose only stamp is the one given, written beside `farol.txt`. */
  function write(stamp: Partial<MapRecipe['steps'][number]>, legend = LEGEND): string {
    writeFileSync(join(dir, 'farol.txt'), drawing(legend));
    const recipe: MapRecipe = {
      ...smallRecipe([
        { step: 'area', material: 'grass', shape: 'all' },
        { step: 'scatter', what: 'stamp', at: [[4, 3]], ...stamp } as MapRecipe['steps'][number],
      ]),
      colors: PALETTE,
    };
    const path = join(dir, 'r.json');
    writeFileSync(path, JSON.stringify(recipe));
    return path;
  }

  it('paints exactly what the same drawing inline painted, so the object can leave the recipe without changing the map', () => {
    const inline = renderRecipe(write({ rows: ROWS, glyphs: GLYPHS })).map.layers.ground.px;
    const fromFile = renderRecipe(write({ draw: 'farol.txt' })).map.layers.ground.px;
    expect(fromFile).toEqual(inline);
    // and it really stamped something: the three colors of the object are on the ground
    expect(Object.values(OBJECT).length).toBe(3);
    for (const name of Object.keys(OBJECT)) expect(fromFile).toContain(name);
  });

  it('refuses a drawing with a color that is not in the palette of the recipe, naming the colors and the file', () => {
    const path = write({ draw: 'farol.txt' }, [...LEGEND.slice(0, 2), 'c = #ff00aa fucsia']);
    expect(() => renderRecipe(path)).toThrow(/farol\.txt uses colors with no name in the palette of the recipe: #ff00aa \("c"\)/);
  });

  it('refuses a stamp that says both draw and rows', () => {
    expect(() => renderRecipe(write({ draw: 'farol.txt', rows: ROWS, glyphs: GLYPHS }))).toThrow(/draw \("farol\.txt"\) and rows\/glyphs/);
  });

  it('the anchor is the pixel that sits where the stamp is put, so the place in the recipe is a place on the ground', () => {
    // the same object and the same cell: with "anchor: 2,1" (its bottom-right
    // pixel) the drawing moves up-left by those px and lands on the cell.
    const plain = renderRecipe(write({ draw: 'farol.txt' })).map.layers.ground;
    const anchored = renderRecipe(write({ draw: 'farol.txt' }, ['anchor: 2,1', ...LEGEND])).map.layers.ground;
    const [ox, oy] = [1 * 16, 1 * 16];  // the margin of smallRecipe
    const x = ox + 4 * 16, y = oy + 3 * 16;
    expect(plain.get(x, y)).toBe('bermellón');            // the top-left px of the drawing
    expect(anchored.get(x, y)).toBe('madera');            // its bottom-right px, two to the right and one down
    expect(anchored.get(x - 2, y - 1)).toBe('bermellón');
  });

  it('the object is a normal drawing: it keeps its name and opens like any other', () => {
    write({ draw: 'farol.txt' });
    const asset = fromAscii(readFileSync(join(dir, 'farol.txt'), 'utf8')).asset;
    expect(asset.name).toBe('Farol de poste');
    expect(Object.values(asset.colorNames)).toContain('bermellón claro');
  });
});

describe('map commands', () => {
  it('build a recipe step by step, render it, export it and lint it', async () => {
    for (const f of ['ladera.json', 'visuals.json', 'paleta.pss.json']) copyFileSync(join(FIX, f), join(dir, f));
    const recipe = join(dir, 'r.json');
    const start = await runCommand('map_from_game', {
      game: join(dir, 'ladera.json'), visuals: join(dir, 'visuals.json'), palette: join(dir, 'paleta.pss.json'), out: recipe, margin: [2, 1],
    });
    expect(start.text).toContain('13x15 cells');
    expect(start.text).toContain('######');
    const r0 = readRecipe(recipe);
    expect(r0.game).toBe('ladera.json');
    await runCommand('map_material', { recipe, name: 'pasto', ramp: GRASS, texture: 'patches', shade_min: 1 });
    await runCommand('map_material', { recipe, name: 'tierra', ramp: EARTH, texture: 'mottled', shade_max: 2 });
    await runCommand('map_area', { recipe, material: 'pasto', shape: 'all' });
    await runCommand('map_path', { recipe, id: 'camino', material: 'tierra', points: [[6.5, -1], [6, 7], [6.5, 16]] });
    const moved = await runCommand('map_path', { recipe, id: 'camino', material: 'tierra', points: [[6.5, -1], [5, 7], [6.5, 16]] });
    expect(moved.data).toMatchObject({ index: 1, steps: 2 });
    await runCommand('map_light', { recipe });
    await runCommand('map_scatter', { recipe, what: 'tufts', layer: 'mechones' });
    const out = join(dir, 'ver.png');
    const shown = await runCommand('map_render', { recipe, out, scale: 2 });
    expect(shown.data).toMatchObject({ size: [17 * 16, 17 * 16], layers: ['ground', 'mechones'] });
    expect(readPng(out).width).toBe(17 * 32);
    const ex = await runCommand('map_export', { recipe, dir: join(dir, 'out'), txt: join(dir, 'txt') });
    expect(ex.text).toContain('ground: ladera.png');
    expect(existsSync(join(dir, 'out', 'ladera_mechones.png'))).toBe(true);
    const drawn = fromAscii(readFileSync(join(dir, 'txt', 'ladera.txt'), 'utf8'));
    expect(Object.values(drawn.asset.colorNames)).toContain('bambú');
    const lint = await runCommand('map_lint', { recipe });
    expect(lint.text).toMatch(/[✓✗] ground/);
  });

  it('exports what the game reads (PNG + sheet JSON, text drawing, .pss.json from that text) and writes the ground keys of the map', async () => {
    for (const f of ['ladera.json', 'visuals.json', 'paleta.pss.json']) copyFileSync(join(FIX, f), join(dir, f));
    const recipe = readRecipe(join(FIX, 'ladera.receta.json'));
    const vivo = [{ mov: 'mece', capa: 'suelos/ladera_mechones', amplitud: 1 }];
    writeFileSync(join(dir, 'r.json'), JSON.stringify({
      ...recipe,
      export: { ...recipe.export, names: { ground: 'Suelo de la ladera' }, png: 'out', txt: 'txt', src: 'src',
        ground: { painting: 'suelos/ladera', vivo } },
    }));
    const before = readFileSync(join(dir, 'ladera.json'), 'utf8');
    const ex = await runCommand('map_export', { recipe: join(dir, 'r.json') });
    expect(ex.text).toContain('ground: ladera.png + ladera.txt + ladera.pss.json');
    expect(ex.text).toContain('ladera.json: vivo');  // painting and margen were already there
    const meta = JSON.parse(readFileSync(join(dir, 'out', 'ladera_rocio.json'), 'utf8'));
    expect(meta.meta.image).toBe('ladera_rocio.png');
    const drawn = fromAscii(readFileSync(join(dir, 'txt', 'ladera.txt'), 'utf8')).asset;
    expect(drawn.name).toBe('Suelo de la ladera');
    expect(JSON.parse(readFileSync(join(dir, 'src', 'ladera.pss.json'), 'utf8')).palette).toEqual(drawn.palette);
    // the PNG is the recipe's ground, pixel for pixel
    const r = renderRecipe(join(dir, 'r.json')), g = r.map.layers.ground, png = readPng(join(dir, 'out', 'ladera.png'));
    for (const i of [0, 777, 40000, g.w * g.h - 1]) {
      const hex = '#' + [0, 1, 2].map(k => png.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
      expect(hex).toBe(r.colors[g.px[i]!]);
    }
    // the map: only the ground keys changed, the rest of the text is the same
    const after = readFileSync(join(dir, 'ladera.json'), 'utf8');
    const map = JSON.parse(after);
    expect(map.ground.vivo).toEqual(vivo);
    expect(map.ground.margen).toEqual([9, 1]);
    expect(after.slice(0, after.indexOf('"ground"'))).toBe(before.slice(0, before.indexOf('"ground"')));
    const again = await runCommand('map_export', { recipe: join(dir, 'r.json') });
    expect(again.text).toContain('ladera.json: nothing changed');
    expect(readFileSync(join(dir, 'ladera.json'), 'utf8')).toBe(after);
  });

  it('writeJsonKeys replaces a changed value in place, adds a new key last and leaves the rest of the text alone', () => {
    const f = join(dir, 'm.json');
    const text = '{\n  "a": 1.0,\n  "ground": {\n    "painting": "x",\n    "margen": [\n      9,\n      1\n    ],\n    "pie": 1.0\n  },\n  "z": [1.5]\n}\n';
    writeFileSync(f, text);
    expect(writeJsonKeys(f, ['ground'], { margen: [9, 1], painting: 'y', copas: [{ capa: 'c' }] })).toEqual(['painting', 'copas']);
    const out = readFileSync(f, 'utf8');
    expect(out).toContain('"a": 1.0');
    expect(out).toContain('"pie": 1.0');
    expect(out).toContain('"painting": "y"');
    expect(JSON.parse(out).ground.copas).toEqual([{ capa: 'c' }]);
    expect(out).toContain('    "copas": [\n      {\n        "capa": "c"\n      }\n    ]\n  },');
    expect(writeJsonKeys(f, [], { a: 1 })).toEqual([]);
  });

  it('map_compare puts the reference, the recipe and the differences in magenta side by side', async () => {
    const ref = join(FIX, 'ladera_script.png');
    const res = await runCommand('map_compare', { recipe: join(FIX, 'ladera.receta.json'), ref, out: join(dir, 'cmp.png') });
    const [row] = (res.data as { layers: { differ: number; share: number }[] }).layers;
    expect(row.differ).toBeGreaterThan(0);
    expect(row.share).toBeLessThan(0.005);
    const img = readPng(join(dir, 'cmp.png')), w = readPng(ref).width;
    expect(img.width).toBe(w * 3 + 16);
    let magenta = 0;
    for (let y = 0; y < img.height; y++) for (let x = 2 * (w + 8); x < img.width; x++) {
      const k = (y * img.width + x) * 4;
      if (img.data[k] === 255 && img.data[k + 1] === 0 && img.data[k + 2] === 255) magenta++;
    }
    expect(magenta).toBe(row.differ);
    const same = await runCommand('map_compare', { a: ref, b: ref, out: join(dir, 'same.png') });
    expect(same.text).toBe('png: 0 px differ (0.00 %)');
  });

  it('refuses a step that is not one', async () => {
    const recipe = join(dir, 'r.json');
    writeFileSync(recipe, JSON.stringify(smallRecipe([])));
    await expect(runCommand('map_area', { recipe, material: 'grass' })).rejects.toThrow();
    await expect(runCommand('map_scatter', { recipe, what: 'rocks' })).rejects.toThrow();
  });
});

describe('map_lint of a recipe with a sun', () => {
  // the old light a recipe with a sun still declares went only to stderr, which the MCP never shows
  const FL = ['túnica noche', 'hoja sombra', 'vida sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro'];
  const grid = ['############', '#..........#', '#..........#', '#..........#', '#..........#', '#..........#', '#..........#', '############'];
  const write = (light: MapRecipe['light']) => {
    copyFileSync(join(FIX, 'paleta.pss.json'), join(dir, 'paleta.pss.json'));
    const recipe: MapRecipe = {
      game: { width: 12, height: 8, grid, decor: [] }, palette: 'paleta.pss.json', margin: [2, 1], light,
      materials: { musgo: { ramp: FL, texture: 'patches', base: 2 }, matorral: { ramp: ['túnica noche'] } },
      steps: [
        { step: 'thicket', id: 'b', material: 'musgo', dark: 'matorral' },
        { step: 'shade', thicket: 'b', on: ['musgo'], reach: [4, 5, 7, 331] },
      ],
    };
    const path = join(dir, 'sol.json');
    writeFileSync(path, JSON.stringify(recipe));
    return path;
  };

  it('says in its answer which steps declare the old light (shade.reach); without a sun, nothing', async () => {
    const sun = await runCommand('map_lint', { recipe: write({ dir: [1, 1], length: 0.3 }) });
    expect(sun.text).toMatch(/^⚠ map sol\.json: step 1 \(shade\): reach is the old light/m);
    expect(sun.text).toMatch(/[✓✗] ground/);
    const old = await runCommand('map_lint', { recipe: write([1, 1]) });
    expect(old.text).not.toContain('⚠');
    expect(old.text).not.toContain('old light');
  });
});
