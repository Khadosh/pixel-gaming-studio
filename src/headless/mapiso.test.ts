// @vitest-environment node
// A top-down recipe stood up in 2:1 isometric (map_render projection=iso, mapiso.ts), from the patio of the second
// game (Khadosh/estudio#238, Khadosh/el-patio#12). Each test breaks if its part is projected as a picture instead
// of stood up: that was the trial of #235, where the wall and the trunk lay down and the grass smeared.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isoMap, isoOf, isoParts } from './mapiso';
import { paintMap, type Layer } from './mappaint';
import { recipeSchema, type MapRecipe } from './maprecipe';
import { runCommand } from './commands';

const COLORS = {
  noche: '#101018', sombra: '#283048', piso: '#5a6a90', claro: '#8ea0c8', junta: '#3a3050', raya: '#f0c060',
  cara: '#7a5030', cara_osc: '#4a3020', tope: '#a07040', tope_claro: '#c09060', tinta: '#000000', hoja: '#2f6a40',
  p0: '#102010', p1: '#204020', p2: '#306030', p3: '#40a040',
};

function recipe(width: number, height: number, materials: object, steps: object[], iso?: object): MapRecipe {
  return recipeSchema.parse({
    game: { width, height, grid: Array.from({ length: height }, () => '.'.repeat(width)) },
    colors: COLORS, light: [1, 1], materials, steps, ...(iso ? { iso } : {}),
  });
}
const paint = (r: MapRecipe) => isoMap(r, r.game as never, COLORS);
const where = (L: Layer, c: string) => {
  const out: [number, number][] = [];
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.get(x, y) === c) out.push([x, y]);
  return out;
};

describe('map_iso: the projection', () => {
  it('moves one px across and half a px down per px along x, the same up per px along y, and z straight up', () => {
    expect(isoOf(16, 0)).toEqual([16, 8]);
    expect(isoOf(0, 16)).toEqual([-16, 8]);
    expect(isoOf(16, 16, 10)).toEqual([0, 6]);
  });

  it('says what each step is: ground, a face, a top, a group or a stamp that stands', () => {
    const r = recipe(4, 4, { a: { ramp: ['piso'] } }, [
      { step: 'area', id: 'suelo', material: 'a', shape: 'all' },
      { step: 'area', id: 'frente', material: 'a', shape: { rect: [0, 0, 4, 1] } },
      { step: 'area', id: 'tope', material: 'a', shape: { rect: [0, 2, 1, 1] } },
      { step: 'area', id: 'copa', material: 'a', shape: { rect: [2, 2, 1, 1] } },
      { step: 'scatter', id: 'flor_a', what: 'stamp', at: [[1, 1]], rows: ['m'], glyphs: { m: 'raya' } },
      { step: 'scatter', id: 'alfombra', what: 'stamp', at: [[1, 3]], rows: ['m'], glyphs: { m: 'raya' } },
    ], { stand: [{ steps: ['frente'], foot: 1 }], raise: [{ steps: ['tope'], h: 4 }], group: [{ steps: ['copa'], at: [2.5, 3] }], flat: ['alfombra'] });
    expect(isoParts(r).map(p => p.kind)).toEqual(['ground', 'stand', 'raise', 'group', 'sprite', 'ground']);
  });
});

describe('map_iso: the ground lies on the floor', () => {
  it('lays a line of one px across the world as a 2:1 line of one px per column: no gaps, never two thick', () => {
    const r = recipe(6, 3, { a: { ramp: ['piso'] }, b: { ramp: ['raya'] } }, [
      { step: 'area', material: 'a', shape: 'all' },
      { step: 'area', material: 'b', shape: { rect: [0, 1, 6, 1 / 16] } },
    ]);
    const { ground } = paint(r);
    const line = where(ground, 'raya');
    const perColumn = new Map<number, number>();
    for (const [x] of line) perColumn.set(x, (perColumn.get(x) ?? 0) + 1);
    // 96 px along x: 96 columns of the picture, one px in each
    expect(perColumn.size).toBe(96);
    expect([...perColumn.values()].every(n => n === 1)).toBe(true);
    // and it climbs one row every two columns
    const ys = [...line].sort((p, q) => p[0] - q[0]).map(p => p[1]);
    expect(ys[ys.length - 1] - ys[0]).toBe(47);
  });

  it('draws the grain of a grass again on the picture: a blade of one px stays one px wide', () => {
    const r = recipe(10, 10, {
      pasto: { ramp: ['p0', 'p1', 'p2', 'p3'], texture: 'patches', base: 1, patches: { shade: [70, 9, -1], bright: null, grain: { odds: [0.08, 0], tall: 0, tip: 0 } } },
    }, [{ step: 'area', material: 'pasto', shape: 'all' }]);
    const top = paintMap(r, r.game as never, COLORS).layers.ground;
    const side = (L: Layer, c: string) => { let n = 0; for (const [x, y] of where(L, c)) if (L.get(x + 1, y) === c) n++; return n; };
    const blades = where(top, 'p2').length;
    expect(blades).toBeGreaterThan(200);
    expect(side(top, 'p2')).toBe(0);   // the grain's rule, top-down
    const { ground } = paint(r);
    expect(where(ground, 'p2').length).toBeGreaterThan(200);
    // projected as a picture each blade would come out two px wide (the smear of #235)
    expect(side(ground, 'p2')).toBeLessThan(where(ground, 'p2').length * 0.05);
  });
});

describe('map_iso: what stands, stands', () => {
  const wall = () => recipe(4, 4, { a: { ramp: ['piso'] }, f: { ramp: ['cara'] } }, [
    { step: 'area', material: 'a', shape: 'all' },
    { step: 'area', id: 'frente', material: 'f', shape: { rect: [0, 0, 4, 1] } },
  ], { stand: [{ steps: ['frente'], foot: 1 }] });

  it('stands a face on its foot line: each column goes straight up as high as it was drawn', () => {
    const { picture, origin } = paint(wall());
    const face = where(picture, 'cara');
    expect(face.length).toBe(64 * 16);
    const cols = new Map<number, number[]>();
    for (const [x, y] of face) cols.set(x, [...(cols.get(x) ?? []), y]);
    for (const [x, ys] of cols) {
      expect(ys.length).toBe(16);
      expect(Math.max(...ys) - Math.min(...ys)).toBe(15);
      // its foot is on the line v = 1 of the floor
      const wx = x - origin[0] + 16 - 0.5;
      expect(Math.max(...ys)).toBe(Math.floor(isoOf(wx + 0.5, 16, 0.5)[1]) + origin[1]);
    }
  });

  it('keeps a stamp as drawn (not sheared) and stands it on its foot', () => {
    const r = recipe(4, 4, { a: { ramp: ['piso'] } }, [
      { step: 'area', material: 'a', shape: 'all' },
      { step: 'scatter', id: 'poste', what: 'stamp', at: [[2, 2]], rows: ['mmm', 'm.m', 'mmm', '.m.'], glyphs: { m: 'tinta' } },
    ]);
    const { picture, origin } = paint(r);
    const ink = where(picture, 'tinta');
    const x0 = Math.min(...ink.map(p => p[0])), y0 = Math.min(...ink.map(p => p[1]));
    const rows = Array.from({ length: 4 }, (_, j) => Array.from({ length: 3 }, (_, i) => (picture.get(x0 + i, y0 + j) === 'tinta' ? 'm' : '.')).join(''));
    expect(rows).toEqual(['mmm', 'm.m', 'mmm', '.m.']);
    // its foot (the bottom of the drawing) where the foot of the world lands
    const top = paintMap(r, r.game as never, COLORS).layers.ground;
    const drawn = where(top, 'tinta'), bottom = Math.max(...drawn.map(p => p[1]));
    const ax = drawn.find(p => p[1] === bottom)![0] + 0.5;
    expect(y0 + 4).toBe(Math.round(isoOf(ax, bottom + 1)[1]) + origin[1]);
  });

  it('moves a group whole: the crown keeps its place over the trunk', () => {
    const r = recipe(6, 6, { a: { ramp: ['piso'] }, c: { ramp: ['hoja'] }, t: { ramp: ['cara'] } }, [
      { step: 'area', material: 'a', shape: 'all' },
      { step: 'scatter', id: 'copa', what: 'stamp', at: [[2, 1]], rows: Array(32).fill('m'.repeat(32)), glyphs: { m: 'hoja' }, layer: 'frente' },
      { step: 'area', id: 'tronco', material: 't', shape: { rect: [2.75, 3, 0.5, 1] } },
    ], { group: [{ steps: ['copa', 'tronco'], at: [3, 4] }] });
    const top = paintMap(r, r.game as never, COLORS);
    const { picture } = paint(r);
    const corner = (L: Layer, c: string) => { const p = where(L, c); return [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1]))]; };
    const allTop = { ...top.layers.ground, get: (x: number, y: number) => top.layers.frente.get(x, y) ?? top.layers.ground.get(x, y) } as Layer;
    const [cx, cy] = corner(allTop, 'hoja'), [tx, ty] = corner(top.layers.ground, 'cara');
    const [ix, iy] = corner(picture, 'hoja'), [jx, jy] = corner(picture, 'cara');
    expect([ix - jx, iy - jy]).toEqual([cx - tx, cy - ty]);
    expect(where(picture, 'hoja').length).toBe(32 * 32);
    // who hides behind it: the crown, the floor it spreads over (as wide as drawn, a quarter of that past the foot);
    // the trunk, the floor of its foot
    const iso = paint(r), box = (c: string) => { const [x, y] = where(iso.picture, c)[0], j = y * iso.picture.w + x; return [iso.hides.x[j], iso.hides.y[j]]; };
    expect(box('hoja')).toEqual([64, 72]);
    expect(box('cara')).toEqual([52, 64]);
  });

  it('lays the top of a raised thing h px up, and shows the side the top-down view never drew, a tone down', () => {
    const r = recipe(4, 4, {
      a: { ramp: ['piso'] }, t: { ramp: ['tope'] }, f: { ramp: ['cara_osc', 'cara'], base: 1 },
    }, [
      { step: 'area', material: 'a', shape: 'all' },
      { step: 'area', id: 'tope', material: 't', shape: { rect: [0, 0, 2, 1.5] } },
      { step: 'area', id: 'cara', material: 'f', shape: { rect: [0, 1.5, 2, 0.5] } },
    ], { stand: [{ steps: ['cara'], foot: 2 }], raise: [{ steps: ['tope'], h: 8, side: ['cara'] }] });
    const { picture } = paint(r);
    expect(where(picture, 'tope').length).toBeGreaterThan(0);
    // the south face as drawn, and the east side one tone down its ramp, 8 px high along the 24 px it is deep
    expect(where(picture, 'cara').length).toBe(32 * 8);
    expect(where(picture, 'cara_osc').length).toBe(24 * 8);
    // without saying its side, nothing is lost: the top's edge two tones down (here the ramp ends: the same tone)
    const bare = recipe(4, 4, { a: { ramp: ['piso'] }, t: { ramp: ['noche', 'sombra', 'tope'] } }, [
      { step: 'area', material: 'a', shape: 'all' },
      { step: 'area', id: 'tope', material: 't', shape: { rect: [0, 0, 2, 2] }, base: 2 },
    ], { raise: [{ steps: ['tope'], h: 8 }] });
    expect(where(paint(bare).picture, 'noche').length).toBe(32 * 8);
  });

  it('hides what is behind by the depth of its foot, whatever was painted later', () => {
    const r = recipe(6, 6, { a: { ramp: ['piso'] }, f: { ramp: ['cara'] } }, [
      { step: 'area', material: 'a', shape: 'all' },
      { step: 'area', id: 'frente', material: 'f', shape: { rect: [0, 1, 6, 2] } },
      { step: 'scatter', id: 'detras', what: 'stamp', at: [[3, 1.5]], rows: Array(8).fill('mmmm'), glyphs: { m: 'tinta' } },
      { step: 'scatter', id: 'delante', what: 'stamp', at: [[3, 5]], rows: Array(8).fill('mmmm'), glyphs: { m: 'raya' } },
    ], { stand: [{ steps: ['frente'], foot: 3 }] });
    const { picture } = paint(r);
    // a stamp 8 px high standing 16 px behind a wall 32 px high: laid after the wall, and still hidden by it
    expect(where(picture, 'tinta').length).toBe(0);
    expect(where(picture, 'raya').length).toBe(32);
    expect(where(picture, 'cara').length).toBe(96 * 32);
  });
});

describe('map_iso: who hides a figure that walks', () => {
  it('gives each px of what stands the far corner of its floor box, and none to the ground', () => {
    const r = recipe(6, 6, { a: { ramp: ['piso'] }, f: { ramp: ['cara'] } }, [
      { step: 'area', material: 'a', shape: 'all' },
      { step: 'area', id: 'frente', material: 'f', shape: { rect: [0, 1, 4, 1] } },
      { step: 'scatter', id: 'poste', what: 'stamp', at: [[5, 4]], rows: ['mm', 'mm', 'mm'], glyphs: { m: 'tinta' } },
    ], { stand: [{ steps: ['frente'], foot: 2 }] });
    const iso = paint(r);
    const at = (c: string) => { const [x, y] = where(iso.picture, c)[0]; const j = y * iso.picture.w + x; return [iso.hides.x[j], iso.hides.y[j]]; };
    expect(at('cara')).toEqual([64, 32]);     // the wall: to x 64, on the line y 32
    expect(at('tinta')).toEqual([82, 67]);   // the post: its foot at (80..82, 67)
    expect(at('piso')).toEqual([-1, -1]);
    // a figure at (30, 20) is behind the wall (x < 64, y < 32); at (30, 40) in front of it
    const behind = (fx: number, fy: number, [x, y]: number[]) => fx < x && fy < y;
    expect(behind(30, 20, at('cara'))).toBe(true);
    expect(behind(30, 40, at('cara'))).toBe(false);
    expect(behind(70, 20, at('cara'))).toBe(false);
    expect(iso.zones).toEqual([{ kind: 'stand', rect: [0, 16, 64, 32], foot: 32 }]);
  });
});

describe('paintMap owners', () => {
  it('gives a px to the step that set it last, even to the color it had', () => {
    const r = recipe(2, 2, { a: { ramp: ['piso'] }, b: { ramp: ['piso'] } }, [
      { step: 'area', id: 'uno', material: 'a', shape: 'all' },
      { step: 'area', id: 'dos', material: 'b', shape: { rect: [0, 0, 1, 1] } },
    ]);
    const own = paintMap(r, r.game as never, COLORS, { owners: true }).owners!.ground;
    expect(own[0]).toBe(1);
    expect(own[31 * 32 + 31]).toBe(0);
  });
});

describe('map_render projection=iso', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-iso-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes the isometric picture and says its size and its parts', async () => {
    const path = join(dir, 'r.receta.json');
    writeFileSync(path, JSON.stringify({
      game: { width: 4, height: 4, grid: ['....', '....', '....', '....'] }, colors: COLORS,
      materials: { a: { ramp: ['piso'] }, f: { ramp: ['cara'] } },
      steps: [{ step: 'area', material: 'a', shape: 'all' }, { step: 'area', id: 'frente', material: 'f', shape: { rect: [0, 0, 4, 1] } }],
      iso: { stand: [{ steps: ['frente'], foot: 1 }] },
    }));
    const res = await runCommand('map_render', { recipe: path, out: join(dir, 'iso.png'), projection: 'iso' });
    expect(existsSync(join(dir, 'iso.png'))).toBe(true);
    expect(res.text).toMatch(/iso \d+x\d+, px: stand 1024/);
    await expect(runCommand('map_render', { recipe: path, out: join(dir, 'x.png'), projection: 'iso', layers: ['frente'] })).rejects.toThrow(/all \(the picture\) or only ground/);
  });

  it('map_export projection=iso writes the picture, who hides and where it lands, for each state', async () => {
    const path = join(dir, 'r.receta.json');
    writeFileSync(path, JSON.stringify({
      game: { width: 4, height: 4, grid: ['....', '....', '....', '....'] }, colors: COLORS,
      materials: { a: { ramp: ['piso'] }, f: { ramp: ['cara'] }, g: { ramp: ['raya'] } },
      steps: [{ step: 'area', material: 'a', shape: 'all' }, { step: 'area', id: 'frente', material: 'f', shape: { rect: [0, 0, 4, 1] } }],
      iso: { stand: [{ steps: ['frente'], foot: 1 }] },
      export: { id: 'casa', png: 'png' },
      variants: { pintada: { set: { frente: { material: 'g' } } } },
    }));
    const res = await runCommand('map_export', { recipe: path, projection: 'iso', variant: '*' });
    for (const f of ['casa_iso.png', 'casa_iso_tapa.png', 'casa_iso.json', 'casa_pintada_iso.png']) expect(existsSync(join(dir, 'png', f)), f).toBe(true);
    const meta = JSON.parse(readFileSync(join(dir, 'png', 'casa_iso.json'), 'utf8'));
    expect(meta.origin).toEqual([64, 8]);   // the wall's top corner, 16 px up from the line y = 16
    expect(meta.zones[0]).toMatchObject({ kind: 'stand', foot: 16 });
    expect(res.text).toMatch(/pintada: casa_pintada_iso\.png/);
  });
});
