// Voxels to isometric pixel art (the studio's desk, 19 Oct 2026): what makes it
// read as drawn and not as a shrunk render — one tone per face, 2:1 steps, a
// one-pixel contour and a line where one thing stands in front of another.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cropImages, deriveModel, onCanvas, placeModels, rotateModel, renderVoxel, renderVoxelLayers, turnModel, voxelCanvas, voxelToScreen, type VoxelChange, type VoxelModel, type VoxelSource } from './voxel';
import { blankImage, readPng, type Rgba } from './png';
import { runCommand } from './commands';
import type { SpriteAsset } from '../lib/types';

const WOOD = { top: 'T', left: 'L', right: 'R' };
const cube = (n: number): VoxelModel => ({ id: 'cubo', materials: { wood: WOOD }, boxes: [{ at: [0, 0, 0], size: [n, n, n], material: 'wood' }], outline: 'k' });

function count(px: (string | undefined)[][], c: string): number {
  return px.flat().filter(v => v === c).length;
}

describe('a box in 2:1 isometric', () => {
  it('is a 32 px diamond for a cube of 16, with its three faces in their tones', () => {
    const img = renderVoxel(cube(16));
    expect(img.width).toBe(32 + 2);
    expect(img.height).toBe(16 + 16 + 2);
    // The top is a diamond of 16x16 units: 16*16*2 / 2 px = 256 px, give or take the rim.
    expect(Math.abs(count(img.pixels, 'T') - 256)).toBeLessThan(24);
    // The two sides are mirror images: as many left as right.
    expect(count(img.pixels, 'L')).toBe(count(img.pixels, 'R'));
    // Left face on the left half, right face on the right half.
    const mid = img.width / 2;
    img.pixels.forEach(row => row.forEach((c, col) => {
      if (c === 'L') expect(col).toBeLessThan(mid);
      if (c === 'R') expect(col).toBeGreaterThanOrEqual(mid);
    }));
  });

  it('steps its edges two to one: along the top edge, two columns per row', () => {
    const img = renderVoxel({ ...cube(16), outline: false });
    // First row of each column that has the top face, on the right half of the diamond.
    const firstTop = (col: number) => img.pixels.findIndex(r => r[col] === 'T');
    const rows = Array.from({ length: 13 }, (_, k) => firstTop(img.width / 2 + 1 + k));
    const steps = rows.slice(1).map((r, k) => r - rows[k]);
    expect(steps.every(s => s === 0 || s === 1)).toBe(true);
    expect(steps.reduce((a, b) => a + b, 0)).toBe(6); // 12 columns, 6 rows down
  });

  it('draws a one pixel contour around the silhouette and nothing outside it', () => {
    const img = renderVoxel(cube(8));
    img.pixels.forEach((row, r) => row.forEach((c, col) => {
      if (c !== 'k') return;
      const touches = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => img.hits[r + dr]?.[col + dc]);
      expect(touches).toBe(true);
    }));
    expect(img.pixels[0].every(c => c === undefined || c === 'k')).toBe(true);
  });

  it('draws a line where one box stands in front of another, and the rim where a top meets a side', () => {
    const model: VoxelModel = {
      id: 'dos', outline: 'k',
      materials: { wood: { ...WOOD, edge: 'E' }, back: { top: 't', left: 'l', right: 'r' } },
      boxes: [{ at: [0, 0, 0], size: [4, 4, 12], material: 'back' }, { at: [6, 6, 0], size: [4, 4, 3], material: 'wood' }],
    };
    const img = renderVoxel(model);
    expect(count(img.pixels, 'E')).toBeGreaterThan(0);
    // Some contour pixel sits on the far box, against the near one.
    const inner = img.pixels.some((row, r) => row.some((c, col) => c === 'k' && img.hits[r][col]?.box === 0));
    expect(inner).toBe(true);
  });

  it('says no to a material it does not know and to boxes off the grid', () => {
    expect(() => renderVoxel({ id: 'x', materials: {}, boxes: [{ at: [0, 0, 0], size: [1, 1, 1], material: 'oro', id: 'pata' }] }))
      .toThrow(/box "pata": material "oro"/);
    expect(() => renderVoxel({ id: 'x', materials: { wood: WOOD }, boxes: [{ at: [0, 0, 0], size: [1.5, 1, 1], material: 'wood' }] }))
      .toThrow(/whole units/);
  });
});

describe('the voxel command', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-voxel-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes an asset made of palette names, says what made it, and takes the palette from pgs.json', async () => {
    writeFileSync(join(dir, 'paleta.pss.json'), JSON.stringify({
      id: 'paleta', name: 'p', category: 'ui', size: 4,
      palette: { 1: '#111111', 2: '#cc9966', 3: '#996633', 4: '#663300' },
      colorNames: { 1: 'tinta', 2: 'madera_luz', 3: 'madera', 4: 'madera_sombra' },
      layers: [{ id: 'l', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames: [[[0, 0, 0, 0]]] }], animations: [],
    }));
    writeFileSync(join(dir, 'pgs.json'), JSON.stringify({ name: 'w', says: 'x', visual: { palette: 'paleta.pss.json' } }));
    const model = { id: 'caja', materials: { madera: { top: 'madera_luz', left: 'madera', right: 'madera_sombra' } }, boxes: [{ at: [0, 0, 0], size: [8, 8, 8], material: 'madera' }] };
    writeFileSync(join(dir, 'caja.voxel.json'), JSON.stringify(model));
    const out = join(dir, 'caja.pss.json');
    const res = await runCommand('voxel', { model: join(dir, 'caja.voxel.json'), out, txt: join(dir, 'caja.txt') });
    expect(res.text).toMatch(/heredado de .*pgs\.json: paleta paleta\.pss\.json/);
    const asset = JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset;
    expect(Object.values(asset.palette).sort()).toEqual(['#111111', '#663300', '#996633', '#cc9966']);
    expect(asset.generatedBy?.by).toBe('voxel');
    expect(readFileSync(join(dir, 'caja.txt'), 'utf8')).toMatch(/^generated_by: voxel model=caja\.voxel\.json$/m);
    writeFileSync(join(dir, 'caja.voxel.json'), JSON.stringify({ ...model, materials: { madera: { ...model.materials.madera, top: 'oro' } } }));
    await expect(runCommand('voxel', { model: join(dir, 'caja.voxel.json'), out })).rejects.toThrow(/color "oro" is not a name in paleta\.pss\.json/);
  });
});

describe('a room', () => {
  const FLOOR = { top: 'F', left: 'Fl', right: 'Fr', shade: 'S', tile: { size: [8, 8] as [number, number], alt: 'A', joint: 'J', shadeJoint: 'SJ' } };
  const WALL = { top: 'W', left: 'Wl', right: 'Wr' };
  const room = (extra: VoxelModel['boxes'] = [], shadows = true): VoxelModel => ({
    id: 'cuarto', outline: shadows ? 'k' : false, shadows,
    materials: { floor: FLOOR, wall: WALL, glass: { top: 'G', left: 'G', right: 'G', clear: true } },
    boxes: [
      { at: [0, 0, 0], size: [40, 40, 1], material: 'floor' },
      { at: [0, 0, 1], size: [2, 40, 20], material: 'wall', id: 'izq' },
      { at: [2, 38, 1], size: [38, 2, 3], material: 'wall', id: 'frente', layer: 'frente' },
      ...extra,
    ],
  });

  it('tiles a floor: joints every tile and every other tile in its own tone', () => {
    const img = renderVoxel(room([], false));
    for (const c of ['F', 'A', 'J']) expect(count(img.pixels, c)).toBeGreaterThan(20);
    // A joint pixel sits where the world point is on a tile border.
    img.hits.forEach((row, r) => row.forEach((h, c) => {
      if (img.pixels[r][c] !== 'J') return;
      const [x, y] = h!.point;
      expect((x % 8) < 1 || (y % 8) < 1).toBe(true);
    }));
  });

  it('lets a wall darken the floor at its foot, on the side away from the light, and keeps the joints under it', () => {
    const img = renderVoxel(room());
    const shaded = img.hits.flat().filter(h => h?.box === 0 && h.face === 'top' && h.shadow);
    expect(shaded.length).toBeGreaterThan(50);
    // Light from the upper left: the wall at x=0 shades the floor next to it, never far from it.
    // (The front wall shades a strip in front of it too: the light comes from its side.)
    for (const h of shaded) if (h!.point[1] < 30) expect(h!.point[0]).toBeLessThan(2 + 20 * 0.5 / 0.7 + 1);
    expect(count(img.pixels, 'S')).toBeGreaterThan(0);
    expect(count(img.pixels, 'SJ')).toBeGreaterThan(0);
  });

  it('lets the light through glass: a window throws a patch of sun on the floor', () => {
    const solid = room([{ at: [0, 12, 8], size: [2, 12, 8], material: 'wall' }]);
    const windowed: VoxelModel = { ...solid, boxes: solid.boxes.map(b => (b.id === 'izq' ? b : b)) };
    // Cut a window in the wall: the wall in three pieces and glass in the hole.
    windowed.boxes = [
      solid.boxes[0],
      { at: [0, 0, 1], size: [2, 12, 20], material: 'wall' },
      { at: [0, 12, 1], size: [2, 12, 7], material: 'wall' },
      { at: [0, 12, 16], size: [2, 12, 5], material: 'wall' },
      { at: [0, 24, 1], size: [2, 16, 20], material: 'wall' },
      { at: [0, 12, 8], size: [1, 12, 8], material: 'glass' },
      solid.boxes[2],
    ];
    const lit = (m: VoxelModel) => renderVoxel(m).hits.flat().filter(h => h?.box === 0 && !h.shadow).length;
    expect(lit(windowed)).toBeGreaterThan(lit(solid));
  });

  it('splits in layers on one canvas that stack back into the whole', () => {
    const m = room();
    const { whole, layers } = renderVoxelLayers(m);
    expect(Object.keys(layers)).toEqual(['fondo', 'frente']);
    for (const l of Object.values(layers)) {
      expect([l.width, l.height]).toEqual([whole.width, whole.height]);
      expect(l.origin).toEqual(whole.origin);
    }
    // Back, then front on top: every pixel of the whole.
    let differ = 0;
    whole.pixels.forEach((row, r) => row.forEach((c, col) => {
      const stacked = layers.frente.pixels[r][col] ?? layers.fondo.pixels[r][col];
      if (stacked !== c) differ++;
    }));
    expect(differ).toBe(0);
    // The front never draws what the whole does not have: where the cut wall
    // meets the wall it is built against there is no contour line.
    layers.frente.pixels.forEach((row, r) => row.forEach((c, col) => {
      if (c !== undefined) expect(c).toBe(whole.pixels[r][col]);
    }));
    // The back layer has floor where the front wall stands: something can stand between.
    const underFront = layers.frente.pixels.flat().filter(Boolean).length;
    expect(underFront).toBeGreaterThan(0);
  });

  it('gives the line a layer draws on what stands behind it to that layer, so it goes with it', () => {
    const m = room([{ at: [10, 10, 1], size: [4, 4, 12], material: 'wall', layer: 'gente' }]);
    const { whole, layers } = renderVoxelLayers(m);
    let carried = 0;
    layers.gente.pixels.forEach((row, r) => row.forEach((c, col) => {
      if (c !== 'k' || !whole.hits[r][col]) return;
      // An outline on the floor or the wall behind: the person's, not theirs.
      expect(m.boxes[whole.hits[r][col]!.box].layer).toBeUndefined();
      expect(layers.fondo.pixels[r][col]).not.toBe('k');
      carried++;
    }));
    expect(carried).toBeGreaterThan(10);
  });

  it('places a world point on the canvas: the corner of the floor where the projection says', () => {
    const { whole } = renderVoxelLayers(room([], false));
    for (const p of [[20, 20, 1], [10, 30, 1], [30, 8, 1]] as [number, number, number][]) {
      const [px, py] = voxelToScreen(whole.origin, p);
      const h = whole.hits[Math.floor(py)]?.[Math.floor(px)];
      expect(h?.box).toBe(0);
      expect(Math.hypot(h!.point[0] - p[0], h!.point[1] - p[1])).toBeLessThan(1.5);
    }
  });

  it('mirrors the sides when the light comes from the upper right', () => {
    const left = renderVoxel({ ...cube(8), light: 'upper_left' });
    const right = renderVoxel({ ...cube(8), light: 'upper_right' });
    expect(count(right.pixels, 'L')).toBe(count(left.pixels, 'R'));
    const mid = right.width / 2;
    right.pixels.forEach(row => row.forEach((c, col) => { if (c === 'R') expect(col).toBeLessThan(mid); }));
  });
});

describe('the voxel command, with a hand pass', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-voxel-mano-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('lays <txt>.retoque.txt on the asset and the PNG, keeps the drawing as the model makes it, and survives running again', async () => {
    const model = { id: 'caja', outline: '#000000', materials: { m: { top: '#cccccc', left: '#999999', right: '#666666' } }, boxes: [{ at: [0, 0, 0], size: [4, 4, 4], material: 'm' }] };
    writeFileSync(join(dir, 'caja.voxel.json'), JSON.stringify(model));
    const args = { model: join(dir, 'caja.voxel.json'), out: join(dir, 'caja.pss.json'), txt: join(dir, 'caja.txt') };
    await runCommand('voxel', args);
    const drawn = readFileSync(join(dir, 'caja.txt'), 'utf8');
    const made = JSON.parse(readFileSync(join(dir, 'caja.pss.json'), 'utf8')) as SpriteAsset;
    const width = made.width ?? made.size, height = made.height ?? made.size;
    // One red pixel by hand, in the middle.
    const rows = Array.from({ length: height! }, (_, r) => Array.from({ length: width! }, (_, c) => (r === 4 && c === 4 ? 'r' : '.')).join(''));
    writeFileSync(join(dir, 'caja.retoque.txt'), [`size: ${width}x${height}`, 'retouch_of: caja.txt', '', 'r = #ff0000 rojo', '', '==', ...rows, ''].join('\n'));
    for (let vez = 0; vez < 2; vez++) {
      const res = await runCommand('voxel', args);
      expect(res.text).toMatch(/caja\.retoque\.txt: 1 px pintados/);
      const asset = JSON.parse(readFileSync(join(dir, 'caja.pss.json'), 'utf8')) as SpriteAsset;
      expect(Object.values(asset.palette)).toContain('#ff0000');
      expect(readFileSync(join(dir, 'caja.txt'), 'utf8')).toBe(drawn);
    }
    const sinMano = await runCommand('voxel', { ...args, retouch: false });
    expect(sinMano.text).not.toMatch(/retoque/);
  });
});

describe('the voxel command, for a room', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-cuarto-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes each layer and the place file, and takes the light from pgs.json', async () => {
    writeFileSync(join(dir, 'pgs.json'), JSON.stringify({ name: 'w', says: 'x', visual: { light: { from: 'upper_right' } } }));
    const model = {
      id: 'cuarto', outline: '#000000', materials: { m: { top: '#cccccc', left: '#999999', right: '#666666' } },
      boxes: [{ at: [0, 0, 0], size: [16, 16, 1], material: 'm' }, { at: [0, 15, 1], size: [16, 1, 3], material: 'm', layer: 'frente' }],
    };
    writeFileSync(join(dir, 'cuarto.voxel.json'), JSON.stringify(model));
    const res = await runCommand('voxel', { model: join(dir, 'cuarto.voxel.json'), out: join(dir, 'cuarto.pss.json'), png: join(dir, 'cuarto.png'), layers: true });
    expect(res.text).toMatch(/capas: fondo, frente/);
    expect(res.text).toMatch(/heredado de .*pgs\.json: luz upper_right/);
    const lugar = JSON.parse(readFileSync(join(dir, 'cuarto.lugar.json'), 'utf8'));
    expect(lugar.layers).toEqual(['fondo', 'frente']);
    expect(lugar.light).toBe('upper_right');
    for (const f of ['cuarto.fondo.pss.json', 'cuarto.frente.pss.json', 'cuarto.fondo.png', 'cuarto.frente.png']) {
      expect(() => readFileSync(join(dir, f))).not.toThrow();
    }
    // One layer: no files apart, but the place file, to stand it on a tile.
    writeFileSync(join(dir, 'mueble.voxel.json'), JSON.stringify({ ...model, id: 'mueble', boxes: [model.boxes[0]] }));
    await runCommand('voxel', { model: join(dir, 'mueble.voxel.json'), out: join(dir, 'mueble.pss.json'), layers: true });
    const solo = JSON.parse(readFileSync(join(dir, 'mueble.lugar.json'), 'utf8'));
    expect(solo.layers).toEqual(['fondo']);
    expect(() => readFileSync(join(dir, 'mueble.fondo.pss.json'))).toThrow();
  });
});

describe('a model inside another one', () => {
  const desk: VoxelModel = { id: 'mesa', materials: { wood: WOOD }, boxes: [{ at: [0, 0, 0], size: [8, 4, 6], material: 'wood', id: 'tapa' }] };
  const room: VoxelModel = {
    id: 'cuarto', outline: false, shadows: true,
    materials: { floor: { top: 'F', left: 'Fl', right: 'Fr', shade: 'S' } },
    boxes: [{ at: [0, 0, 0], size: [30, 30, 1], material: 'floor' }],
    place: [{ model: 'mesa.json', at: [10, 10, 1] }],
  };
  const load = (path: string) => { if (path !== 'mesa.json') throw new Error(`no ${path}`); return desk; };

  it('lays its boxes where it is placed, named after it', () => {
    const m = placeModels(room, load);
    expect(m.place).toBeUndefined();
    expect(m.boxes[1]).toMatchObject({ at: [10, 10, 1], size: [8, 4, 6], id: 'mesa/tapa' });
    expect(m.materials.wood).toEqual(WOOD);
  });

  it('casts its shadow on the floor of the room, which a desk on its own cannot', () => {
    const shaded = (m: VoxelModel) => renderVoxel(m).hits.flat().filter(h => h?.box === 0 && h.face === 'top' && h.shadow).length;
    expect(shaded({ ...room, place: [] })).toBe(0);
    expect(shaded(placeModels(room, load))).toBeGreaterThan(10);
  });

  it('says no to a material that means two things, and to a model that places itself', () => {
    const clash = { ...room, materials: { ...room.materials, wood: { top: 'x', left: 'y', right: 'z' } } };
    expect(() => placeModels(clash, load)).toThrow(/material "wood" is not the same/);
    const loop: VoxelModel = { ...desk, place: [{ model: 'mesa.json', at: [0, 0, 0] }] };
    expect(() => placeModels(loop, () => loop, ['mesa.json'])).toThrow(/places itself/);
  });

  it('comes loose: the room without it, the piece alone and whole, and its shadow apart in the room\'s shadow tones', () => {
    const person: VoxelModel = { id: 'gente', materials: { skin: { top: 'P', left: 'P', right: 'P' } }, boxes: [{ at: [0, 0, 0], size: [3, 3, 12], material: 'skin' }] };
    const lit: VoxelModel = { ...room, outline: 'k', place: [{ model: 'mesa.json', at: [10, 10, 1], layer: 'mesa', loose: true }, { model: 'gente.json', at: [10, 5, 1], layer: 'gente' }] };
    const both = (path: string) => (path === 'gente.json' ? person : load(path));
    const m = placeModels(lit, both);
    expect(m.boxes[1]).toMatchObject({ layer: 'mesa', loose: true });
    const { whole, layers, loose } = renderVoxelLayers(m);
    expect(loose).toEqual(['mesa']);
    expect(Object.keys(layers)).toEqual(['fondo', 'mesa', 'mesa_sombra', 'gente']);
    // The back has no desk, no shadow and no contour of it: as if it were not there.
    const bare = renderVoxelLayers(placeModels({ ...lit, place: [lit.place![1]] }, both)).layers.fondo;
    expect(layers.fondo.pixels).toEqual(bare.pixels);
    // The piece is whole, with its own contour (nothing in this room shades it).
    const alone = renderVoxel({ ...desk, outline: 'k' });
    for (const c of ['T', 'L', 'R']) expect(count(layers.mesa.pixels, c)).toBe(count(alone.pixels, c));
    // Its shadow is the floor in shadow where the whole has it, and nothing else.
    const shade = layers.mesa_sombra.pixels;
    expect(count(shade, 'S')).toBeGreaterThan(10);
    shade.forEach((row, r) => row.forEach((c, col) => { if (c !== undefined) expect(['S', 'SJ']).toContain(c); }));
    shade.forEach((row, r) => row.forEach((c, col) => {
      if (c === undefined || layers.mesa.pixels[r][col] !== undefined) return;
      expect(whole.pixels[r][col]).toBe(c);
    }));
    // A person standing behind it is still cut where it stands in front.
    const behind = renderVoxelLayers(placeModels({ ...lit, place: [lit.place![1]] }, both)).layers.gente;
    expect(count(layers.gente.pixels, 'P')).toBeLessThan(count(behind.pixels, 'P'));
    // Stacked where it was placed, it is the whole wherever no shadow falls on the person.
    let differ = 0;
    whole.pixels.forEach((row, r) => row.forEach((c, col) => {
      const stacked = layers.gente.pixels[r][col] ?? layers.mesa.pixels[r][col] ?? layers.mesa_sombra.pixels[r][col] ?? layers.fondo.pixels[r][col];
      if (stacked !== c) differ++;
    }));
    expect(differ).toBeLessThan(whole.width * 0.5);
  });

  it('says no to a loose piece without a layer of its own, or half loose', () => {
    expect(() => renderVoxelLayers(placeModels({ ...room, place: [{ model: 'mesa.json', at: [10, 10, 1], loose: true }] }, load))).toThrow(/loose piece needs a layer/);
    const half = placeModels({ ...room, place: [{ model: 'mesa.json', at: [10, 10, 1], layer: 'm', loose: true }, { model: 'mesa.json', at: [1, 1, 1], layer: 'm' }] }, load);
    expect(() => renderVoxelLayers(half)).toThrow(/some boxes are loose/);
  });

  it('turns by quarter turns: what faced the left faces the right, in the same corner, and four turns are none', () => {
    // A desk with a drawer on its left (+y) face.
    const drawer: VoxelModel = { id: 'mesa', materials: { wood: WOOD }, boxes: [
      { at: [0, 0, 0], size: [8, 4, 6], material: 'wood', id: 'tapa' },
      { at: [2, 4, 1], size: [3, 1, 2], material: 'wood', id: 'cajon' },
    ] };
    const r90 = rotateModel(drawer, 90);
    expect(r90.boxes[0]).toMatchObject({ at: [0, 0, 0], size: [4, 8, 6] });
    // The drawer stuck out at +y; now it sticks out at +x.
    expect(r90.boxes[1]).toMatchObject({ at: [4, 3, 1], size: [1, 3, 2] });
    expect(rotateModel(rotateModel(drawer, 180), 180).boxes).toEqual(drawer.boxes);
    expect(rotateModel(r90, 270).boxes).toEqual(drawer.boxes);
    // Half a turn: the drawer at the back, the desk moved up to keep the corner.
    expect(rotateModel(drawer, 180).boxes.map(b => b.at)).toEqual([[0, 1, 0], [3, 0, 1]]);
    expect(() => rotateModel(drawer, 45)).toThrow(/quarter turns/);
    // Placed turned, it keeps its at, and the light stays where it was: the
    // long side is now the left one, lit as a left side.
    const m = placeModels({ ...room, place: [{ model: 'mesa.json', at: [10, 10, 1], rotate: 90 }] }, load);
    expect(m.boxes[1]).toMatchObject({ at: [10, 10, 1], size: [4, 8, 6] });
    const straight = renderVoxel({ ...desk, outline: false });
    const turned = renderVoxel({ ...rotateModel(desk, 90), outline: false });
    expect(count(turned.pixels, 'L')).toBe(count(straight.pixels, 'R'));
    expect(count(turned.pixels, 'R')).toBe(count(straight.pixels, 'L'));
  });

  it('is read beside the model that places it, by the command', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-place-'));
    try {
      const sub = join(dir, 'muebles');
      mkdirSync(sub);
      writeFileSync(join(sub, 'mesa.voxel.json'), JSON.stringify({ ...desk, materials: { wood: { top: '#aa7744', left: '#885522', right: '#663311' } } }));
      writeFileSync(join(dir, 'cuarto.voxel.json'), JSON.stringify({
        id: 'cuarto', outline: '#000000', materials: { floor: { top: '#cccccc', left: '#999999', right: '#666666' } },
        boxes: [{ at: [0, 0, 0], size: [30, 30, 1], material: 'floor' }], place: [{ model: 'muebles/mesa.voxel.json', at: [10, 10, 1] }],
      }));
      const res = await runCommand('voxel', { model: join(dir, 'cuarto.voxel.json'), out: join(dir, 'cuarto.pss.json') });
      expect(res.text).toMatch(/2 cajas/);
      const asset = JSON.parse(readFileSync(join(dir, 'cuarto.pss.json'), 'utf8')) as SpriteAsset;
      expect(Object.values(asset.palette)).toContain('#aa7744');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('an old model draws as it always did', () => {
  it('gives the same pixels, origin and layers as before negatives, pivots, turns and canvases (a hash taken with the code of 20 Oct, entry 107)', () => {
    const desk: VoxelModel = { id: 'mesa', materials: { wood: { top: 'T', left: 'L', right: 'R', edge: 'E' } }, boxes: [{ at: [0, 0, 0], size: [8, 4, 6], material: 'wood', id: 'tapa' }, { at: [2, 4, 1], size: [3, 1, 2], material: 'wood', id: 'cajon' }] };
    const room: VoxelModel = {
      id: 'cuarto', outline: 'k', shadows: true,
      materials: { floor: { top: 'F', left: 'Fl', right: 'Fr', shade: 'S', tile: { size: [8, 8], alt: 'A', joint: 'J', shadeJoint: 'SJ' } }, wall: { top: 'W', left: 'Wl', right: 'Wr' }, glass: { top: 'G', left: 'G', right: 'G', clear: true } },
      boxes: [
        { at: [0, 0, 0], size: [40, 40, 1], material: 'floor' },
        { at: [0, 0, 1], size: [2, 12, 20], material: 'wall' }, { at: [0, 12, 1], size: [2, 12, 7], material: 'wall' },
        { at: [0, 12, 16], size: [2, 12, 5], material: 'wall' }, { at: [0, 24, 1], size: [2, 16, 20], material: 'wall' },
        { at: [0, 12, 8], size: [1, 12, 8], material: 'glass' },
        { at: [2, 38, 1], size: [38, 2, 3], material: 'wall', layer: 'frente' },
        { at: [20, 6, 1], size: [3, 3, 12], material: 'wall', layer: 'gente' },
      ],
      place: [{ model: 'mesa', at: [10, 10, 1], layer: 'mesa', loose: true, rotate: 90 }, { model: 'mesa', at: [25, 20, 1], rotate: 180 }],
    };
    const m = placeModels(room, () => desk);
    const { whole, layers } = renderVoxelLayers(m);
    const one = renderVoxel({ ...m, light: 'upper_right' });
    const key = JSON.stringify({ w: whole.pixels, o: whole.origin, l: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.pixels])), r: one.pixels, ro: one.origin });
    expect(createHash('sha256').update(key).digest('hex')).toBe('30cf08ffb9bd80bf8b22598150db176906f1cb6de8a7b0149f0654daae0cb60f');
  });
});

describe('a model around its foot (negatives, pivot, a turn of the whole)', () => {
  // A figure looking +y: legs and body around (0, 0), a nose sticking out at +y.
  const SKIN = { top: 'P', left: 'Pl', right: 'Pr' };
  const figure: VoxelModel = {
    id: 'figura', outline: 'k', materials: { skin: SKIN, nose: { top: 'N', left: 'N', right: 'N' } },
    boxes: [
      { at: [-3, -2, 0], size: [6, 4, 10], material: 'skin', id: 'cuerpo' },
      { at: [-1, 2, 6], size: [2, 2, 2], material: 'nose', id: 'nariz' },
    ],
  };
  const shifted = (m: VoxelModel, d: [number, number, number]): VoxelModel => ({ ...m, boxes: m.boxes.map(b => ({ ...b, at: [b.at[0] + d[0], b.at[1] + d[1], b.at[2] + d[2]] })) });

  it('draws boxes at negative coordinates as the same picture, with origin where world (0, 0, 0) lands', () => {
    const neg = renderVoxel(figure);
    // Moved so that x + y moves by an even number (the 2:1 lattice repeats
    // every two units of x + y), it is the same picture.
    const pos = renderVoxel(shifted(figure, [3, 5, 0]));
    expect(neg.pixels).toEqual(pos.pixels);
    // The (0, 0, 0) of the negative one is the (3, 5, 0) of the other.
    expect(neg.origin).toEqual(voxelToScreen(pos.origin, [3, 5, 0]));
    // Below the floor too: the picture is the same, the origin goes down.
    const low = renderVoxel(shifted(figure, [0, 0, -5]));
    expect(low.pixels).toEqual(neg.pixels);
    expect(low.origin).toEqual([neg.origin[0], neg.origin[1] - 5]);
    // The hits say the real world point.
    const xs = neg.hits.flat().filter(Boolean).map(h => h!.point[0]);
    expect(Math.min(...xs)).toBeLessThan(0);
  });

  it('keeps the joints of a floor that starts at a negative x', () => {
    const FLOOR = { top: 'F', left: 'Fl', right: 'Fr', tile: { size: [4, 4] as [number, number], alt: 'A', joint: 'J' } };
    const floor: VoxelModel = { id: 'piso', outline: false, materials: { floor: FLOOR }, boxes: [{ at: [0, 0, 0], size: [16, 16, 1], material: 'floor' }] };
    // Moved by an even number of whole tiles, it is the same floor.
    expect(renderVoxel(shifted(floor, [-8, -8, 0])).pixels).toEqual(renderVoxel(floor).pixels);
  });

  it('turns the whole model about its foot: the foot stays at the origin and the nose comes round to +x, -y, -x', () => {
    const noses: [number, number][] = [];
    for (const deg of [0, 90, 180, 270]) {
      const t = turnModel(figure, deg);
      const body = t.boxes[0];
      // The body still stands around (0, 0).
      expect(body.at[0] + body.size[0] / 2).toBe(0);
      expect(body.at[1] + body.size[1] / 2).toBe(0);
      const n = t.boxes[1];
      noses.push([Math.sign(n.at[0] + n.size[0] / 2), Math.sign(n.at[1] + n.size[1] / 2)]);
      // Drawn, the floor under the foot is the pixel the origin says.
      const img = renderVoxel(t);
      const [fx, fy] = voxelToScreen(img.origin, [0, 0, 0]);
      expect([fx, fy]).toEqual(img.origin);
      // The body is as wide on each side of the origin's column, and the
      // origin falls on it, two or three pixels above its lowest one.
      const cols = img.hits.flatMap(row => row.flatMap((h, x) => (h?.box === 0 ? [x] : [])));
      expect(fx - Math.min(...cols)).toBe(Math.max(...cols) + 1 - fx);
      expect(img.hits[fy][fx]?.box).toBe(0);
      const rows = img.hits.flatMap((row, y) => (row.some(h => h?.box === 0) ? [y] : []));
      expect(Math.max(...rows) - fy).toBeGreaterThanOrEqual(1);
      expect(Math.max(...rows) - fy).toBeLessThanOrEqual(3);
    }
    expect(noses).toEqual([[0, 1], [1, 0], [0, -1], [-1, 0]]);
    expect(turnModel(turnModel(figure, 90), 270).boxes).toEqual(figure.boxes);
    // The model's own rotate is what the render draws.
    expect(renderVoxel({ ...figure, rotate: 90 }).pixels).toEqual(renderVoxel(turnModel(figure, 90)).pixels);
    expect(() => turnModel(figure, 45)).toThrow(/quarter turns/);
  });

  it('turns about a pivot: a figure kept at (24, 24, 0) turns as the one around (0, 0)', () => {
    const far = { ...shifted(figure, [24, 24, 0]), pivot: [24, 24, 0] as [number, number, number] };
    for (const deg of [90, 180, 270]) {
      expect(turnModel(far, deg).boxes).toEqual(shifted(turnModel(figure, deg), [24, 24, 0]).boxes);
    }
  });

  it('is placed in a room with its (0, 0, 0) at at, and turned there by its own rotate', () => {
    const room: VoxelModel = { id: 'cuarto', outline: false, materials: { floor: { top: 'F', left: 'Fl', right: 'Fr' } }, boxes: [{ at: [0, 0, 0], size: [20, 20, 1], material: 'floor' }], place: [{ model: 'f', at: [10, 10, 1] }] };
    const m = placeModels(room, () => ({ ...figure, rotate: 90 }));
    expect(m.boxes[1]).toMatchObject({ at: [8, 7, 1], size: [4, 6, 10] });
  });
});

describe('the frames of an animation on one canvas', () => {
  const frame = (h: number, x: number): VoxelModel => ({ id: `f${h}`, outline: 'k', materials: { wood: WOOD }, boxes: [{ at: [x, -2, 0], size: [4, 4, h], material: 'wood' }] });

  it('lays every frame on the smallest canvas they all fit, (0, 0, 0) on the same pixel, the picture untouched', () => {
    const images = [frame(6, -2), frame(14, 3), frame(8, -7)].map(renderVoxel);
    const c = voxelCanvas(images);
    expect(c.width).toBeGreaterThanOrEqual(Math.max(...images.map(i => i.width)));
    images.forEach(im => {
      const on = onCanvas(im, c);
      expect([on.width, on.height, on.origin]).toEqual([c.width, c.height, c.origin]);
      const dx = c.origin[0] - im.origin[0], dy = c.origin[1] - im.origin[1];
      im.pixels.forEach((row, y) => row.forEach((v, x) => expect(on.pixels[y + dy][x + dx]).toBe(v)));
      expect(on.pixels.flat().filter(Boolean).length).toBe(im.pixels.flat().filter(Boolean).length);
    });
    // Nothing to spare: some frame touches each edge.
    const laid = images.map(im => onCanvas(im, c));
    expect(laid.some(l => l.pixels[0].some(Boolean))).toBe(true);
    expect(laid.some(l => l.pixels[c.height - 1].some(Boolean))).toBe(true);
    expect(laid.some(l => l.pixels.some(r => r[0]))).toBe(true);
    expect(laid.some(l => l.pixels.some(r => r[c.width - 1]))).toBe(true);
  });
});

describe('the voxel command: frames, only, rotate and the pivot', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-voxel-anim-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const MAT = { m: { top: '#cccccc', left: '#999999', right: '#666666' }, n: { top: '#ff0000', left: '#ff0000', right: '#ff0000' } };
  const write = (name: string, model: object) => { writeFileSync(join(dir, name), JSON.stringify(model)); return join(dir, name); };

  it('writes the frames of an animation as one asset on one canvas, a strip and a lugar.json that says so', async () => {
    const paths = [6, 12, 9].map((h, i) => write(`f${i}.voxel.json`, { id: `f${i}`, outline: '#000000', materials: MAT, boxes: [{ at: [-2 - i, -2, 0], size: [4, 4, h], material: 'm' }] }));
    const res = await runCommand('voxel', { frames: paths, out: join(dir, 'anda.pss.json'), png: join(dir, 'anda.png'), layers: true, fps: 6 });
    expect(res.text).toMatch(/3 cuadros de \d+x\d+ px \(mismo lienzo/);
    const asset = JSON.parse(readFileSync(join(dir, 'anda.pss.json'), 'utf8')) as SpriteAsset;
    expect(asset.layers![0].frames).toHaveLength(3);
    expect(asset.animations).toEqual([expect.objectContaining({ name: 'anda', frameIndices: [0, 1, 2], fps: 6 })]);
    const lugar = JSON.parse(readFileSync(join(dir, 'anda.lugar.json'), 'utf8'));
    expect(lugar).toMatchObject({ frames: 3, fps: 6, width: asset.width ?? asset.size, height: asset.height ?? asset.size });
    const strip = readPng(join(dir, 'anda.png'));
    expect([strip.width, strip.height]).toEqual([lugar.width * 3, lugar.height]);
    // Each frame is its model drawn alone, laid with its (0, 0, 0) on the canvas's.
    for (let i = 0; i < 3; i++) {
      await runCommand('voxel', { model: paths[i], out: join(dir, `solo${i}.pss.json`), layers: true });
      const solo = JSON.parse(readFileSync(join(dir, `solo${i}.pss.json`), 'utf8')) as SpriteAsset;
      const so = JSON.parse(readFileSync(join(dir, `solo${i}.lugar.json`), 'utf8'));
      const dx = lugar.origin[0] - so.origin[0], dy = lugar.origin[1] - so.origin[1];
      const hex = (a: SpriteAsset, v: number) => (v ? a.palette[v] : undefined);
      solo.layers![0].frames[0].forEach((row, y) => row.forEach((v, x) => expect(hex(asset, asset.layers![0].frames[i][y + dy][x + dx])).toBe(hex(solo, v))));
    }
    await expect(runCommand('voxel', { frames: paths, out: join(dir, 'x.pss.json'), txt: join(dir, 'x.txt') })).rejects.toThrow(/txt is the text drawing of one whole model/);
    await expect(runCommand('voxel', { out: join(dir, 'x.pss.json') })).rejects.toThrow(/give "model".*or "frames"/);
  });

  it('with only, writes that layer alone and the lugar.json, and not the whole nor the rest', async () => {
    const room = write('cuarto.voxel.json', {
      id: 'cuarto', outline: '#000000', shadows: true, materials: MAT,
      boxes: [{ at: [0, 0, 0], size: [20, 20, 1], material: 'm' }, { at: [0, 19, 1], size: [20, 1, 3], material: 'm', layer: 'frente' }, { at: [8, 8, 1], size: [3, 3, 10], material: 'n', layer: 'gente' }],
    });
    await runCommand('voxel', { model: room, out: join(dir, 'todo.pss.json'), png: join(dir, 'todo.png'), layers: true });
    const res = await runCommand('voxel', { model: room, out: join(dir, 'pose.pss.json'), png: join(dir, 'pose.png'), only: 'gente' });
    expect(res.text).toMatch(/capas: gente/);
    expect(existsSync(join(dir, 'pose.gente.pss.json'))).toBe(true);
    for (const f of ['pose.pss.json', 'pose.png', 'pose.fondo.pss.json', 'pose.frente.pss.json', 'pose.fondo.png']) expect(existsSync(join(dir, f))).toBe(false);
    // The same layer as when every layer is written.
    expect(readPng(join(dir, 'pose.gente.png'))).toEqual(readPng(join(dir, 'todo.gente.png')));
    const lugar = JSON.parse(readFileSync(join(dir, 'pose.lugar.json'), 'utf8'));
    expect(lugar.layers).toEqual(['gente']);
    expect(lugar.origin).toEqual(JSON.parse(readFileSync(join(dir, 'todo.lugar.json'), 'utf8')).origin);
    await expect(runCommand('voxel', { model: room, out: join(dir, 'pose.pss.json'), only: 'techo' })).rejects.toThrow(/only techo: the model has no such layer \(it has fondo, frente, gente\)/);
  });

  it('turns the whole model with rotate and says in lugar.json the pixel of its pivot', async () => {
    const fig = { id: 'fig', outline: '#000000', pivot: [24, 24, 0], materials: MAT, boxes: [{ at: [21, 22, 0], size: [6, 4, 10], material: 'm' }, { at: [23, 26, 6], size: [2, 2, 2], material: 'n' }] };
    const path = write('fig.voxel.json', fig);
    const turned = write('fig90.voxel.json', { ...fig, boxes: turnModel(fig as unknown as VoxelModel, 90).boxes, pivot: [24, 24, 0] });
    await runCommand('voxel', { model: path, out: join(dir, 'a.pss.json'), png: join(dir, 'a.png'), layers: true, rotate: 90 });
    await runCommand('voxel', { model: turned, out: join(dir, 'b.pss.json'), png: join(dir, 'b.png'), layers: true });
    expect(readPng(join(dir, 'a.png'))).toEqual(readPng(join(dir, 'b.png')));
    const lugar = JSON.parse(readFileSync(join(dir, 'a.lugar.json'), 'utf8'));
    expect(lugar.pivot).toEqual(voxelToScreen(lugar.origin, [24, 24, 0]));
    const asset = JSON.parse(readFileSync(join(dir, 'a.pss.json'), 'utf8')) as SpriteAsset;
    expect(asset.generatedBy?.args.rotate).toBe('90');
  });
});

describe('a drawing on the face of a box (paint)', () => {
  // A poster 4 wide and 3 tall, with its four corners marked, on a box 6 x 6 x 6.
  const poster = { rows: ['A..B', '....', 'C..D'], glyphs: { A: 'a', B: 'b', C: 'c', D: 'd' }, at: [1, 1] as [number, number] };
  const boxWith = (paint: VoxelModel['boxes'][number]['paint'], size: [number, number, number] = [6, 6, 6]): VoxelModel => ({
    id: 'p', outline: 'k', materials: { w: { top: 'T', left: 'L', right: 'R' } }, boxes: [{ at: [0, 0, 0], size, material: 'w', paint }],
  });
  /** Screen pixel of each color: [col, row] of its first pixel. */
  const where = (px: (string | undefined)[][], c: string): [number, number] => {
    for (let r = 0; r < px.length; r++) { const col = px[r].indexOf(c); if (col >= 0) return [col, r]; }
    throw new Error(`no ${c}`);
  };

  it('paints the left face (+y) one unit per pixel, read as drawn: left to right, top to bottom', () => {
    const img = renderVoxel(boxWith({ left: poster }));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(k => where(img.pixels, k));
    // The face runs down-right: B is 3 units right of A (3 px right, 1.5 down), C is 2 units under A.
    expect(b[0] - a[0]).toBe(3);
    expect(c[0]).toBe(a[0]);
    expect(c[1] - a[1]).toBe(2);
    expect(d[0]).toBe(b[0]);
    expect(d[1] - b[1]).toBe(2);
    expect(a[0]).toBeLessThan(img.width / 2);
    // Only the four marks: the rest of the face is the material, and the other faces untouched.
    for (const k of ['a', 'b', 'c', 'd']) expect(count(img.pixels, k)).toBe(1);
    expect(count(img.pixels, 'T')).toBe(count(renderVoxel(boxWith(undefined)).pixels, 'T'));
  });

  it('paints the right face (+x) as seen from outside, and the top with its row 0 at the far edge', () => {
    const right = renderVoxel(boxWith({ right: poster }));
    const [a, b, c] = ['a', 'b', 'c'].map(k => where(right.pixels, k));
    expect(a[0]).toBeGreaterThanOrEqual(right.width / 2);
    expect(b[0] - a[0]).toBe(3);
    expect(c[1] - a[1]).toBe(2);
    const top = renderVoxel(boxWith({ top: { rows: ['......', '.A..B.', '......', '......', '.C..D.', '......'], glyphs: { A: 'a', B: 'b', C: 'c', D: 'd' } } }));
    const [ta, tb, tc, td] = ['a', 'b', 'c', 'd'].map(k => where(top.pixels, k));
    // A near the far corner (the top of the diamond), B along +x (down-right), C along +y (down-left), D nearest.
    expect(ta[1]).toBeLessThan(tb[1]);
    expect(tb[0]).toBeGreaterThan(ta[0]);
    expect(tc[0]).toBeLessThan(ta[0]);
    expect(td[1]).toBeGreaterThan(Math.max(tb[1], tc[1]));
  });

  it('takes the light of its face: as drawn on the lit side, its shade on the side in shadow, as drawn there too when it glows', () => {
    const shade = { a: 'a2', b: 'b2', c: 'c2', d: 'd2' };
    const lit = renderVoxel(boxWith({ left: { ...poster, shade } }));
    expect(count(lit.pixels, 'a')).toBe(1);
    expect(count(lit.pixels, 'a2')).toBe(0);
    const dark = renderVoxel(boxWith({ right: { ...poster, shade } }));
    expect(count(dark.pixels, 'a')).toBe(0);
    expect(count(dark.pixels, 'a2')).toBe(1);
    const glowing = renderVoxel(boxWith({ right: { ...poster, shade, glow: true } }));
    expect(count(glowing.pixels, 'a')).toBe(1);
    // With the light from the upper right the sides swap: now the left one is in shadow.
    const swapped = renderVoxel({ ...boxWith({ left: { ...poster, shade } }), light: 'upper_right' });
    expect(count(swapped.pixels, 'a2')).toBe(1);
  });

  it('turns with its box: a poster on +y, turned 90, is the same poster on +x', () => {
    for (const turn of [(m: VoxelModel) => rotateModel(m, 90), (m: VoxelModel) => turnModel(m, 90)]) {
      const turned = renderVoxel(turn(boxWith({ left: poster }, [6, 4, 6])));
      const onRight = renderVoxel(boxWith({ right: poster }, [4, 6, 6]));
      expect(turned.pixels).toEqual(onRight.pixels);
    }
    // 180 puts it on the back (-y), out of sight; 360 brings it back as it was.
    const back = renderVoxel(rotateModel(boxWith({ left: poster }), 180));
    expect(back.pixels.flat().some(c => c === 'a')).toBe(false);
    const round = rotateModel(rotateModel(boxWith({ left: poster }), 180), 180);
    expect(renderVoxel(round).pixels).toEqual(renderVoxel(boxWith({ left: poster })).pixels);
    // A drawing on -x shows on the left once turned 90.
    expect(renderVoxel(rotateModel(boxWith({ '-x': poster }), 90)).pixels).toEqual(renderVoxel(boxWith({ left: poster })).pixels);
  });

  it('shows every pixel of a drawing on a top, which 2:1 alone would show one in two of', () => {
    const N = 8;
    const pixels = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => `${r},${c}`));
    const img = renderVoxel({ ...boxWith({ top: { pixels } }, [N, N, 1]), outline: false });
    const seen = new Set(img.pixels.flat().filter(c => c?.includes(',')));
    // All but half a column at the near-left edge (the units whose pixel would come from outside the box).
    expect([...pixels.flat()].filter(c => !seen.has(c))).toEqual(['1,0', '3,0', '5,0', '7,0']);
    expect(count(img.pixels, 'T')).toBe(0);
  });

  it('turns a drawing on the top with its box', () => {
    const top = { rows: ['AB', 'C.'], glyphs: { A: 'a', B: 'b', C: 'c' }, at: [1, 2] as [number, number] };
    const turned = renderVoxel(rotateModel(boxWith({ top }, [6, 4, 2]), 90));
    // By hand: (x, y) goes to (y, 5 - x), so A (1, 2) lands at (2, 4), B (2, 2) at (2, 3), C (1, 3) at (3, 4).
    const byHand = renderVoxel(boxWith({ top: { rows: ['....', '....', '....', '..B.', '..AC', '....'], glyphs: { A: 'a', B: 'b', C: 'c' } } }, [4, 6, 2]));
    expect(turned.pixels).toEqual(byHand.pixels);
  });

  it('keeps the rim and the contour where it draws nothing, and the drawing over the rim where it does', () => {
    const plain: VoxelModel = { id: 'r', outline: 'k', materials: { w: { top: 'T', left: 'L', right: 'R', edge: 'E' } }, boxes: [{ at: [0, 0, 0], size: [6, 6, 6], material: 'w' }] };
    const empty = renderVoxel({ ...plain, boxes: [{ ...plain.boxes[0], paint: { top: { rows: ['......'] } } }] });
    expect(empty.pixels).toEqual(renderVoxel(plain).pixels);
    const full = renderVoxel({ ...plain, boxes: [{ ...plain.boxes[0], paint: { top: { rows: Array(6).fill('xxxxxx'), glyphs: { x: 'X' } } } }] });
    expect(count(full.pixels, 'E')).toBe(0);
    expect(count(full.pixels, 'T')).toBe(0);
    expect(count(full.pixels, 'k')).toBe(count(renderVoxel(plain).pixels, 'k'));
  });

  it('says no to a drawing that does not fit its face, a glyph it does not know and a face it does not have', () => {
    expect(() => renderVoxel(boxWith({ left: { ...poster, at: [3, 1] } }))).toThrow(/paint \+y: the drawing \(4x3 at 3,1\) does not fit the face \(6x6 units\)/);
    expect(() => renderVoxel(boxWith({ left: { rows: ['Z'], glyphs: {} } }))).toThrow(/glyph "Z"/);
    expect(() => renderVoxel(boxWith({ front: poster } as never))).toThrow(/paint face "front"/);
    expect(() => renderVoxel(boxWith({ left: poster, '+y': poster }))).toThrow(/twice/);
    expect(() => renderVoxel(boxWith({ left: { draw: 'cartel.txt' } }))).toThrow(/the voxel command reads/);
  });

  it('leaves a model without paint as it was (the hash of entry 107 holds above, and an empty paint changes nothing)', () => {
    const m = boxWith(undefined);
    expect(renderVoxel({ ...m, boxes: [{ ...m.boxes[0], paint: {} }] }).pixels).toEqual(renderVoxel(m).pixels);
    expect(renderVoxelLayers(turnModel({ ...m, boxes: [{ ...m.boxes[0], paint: {} }] }, 90)).whole.pixels).toEqual(renderVoxelLayers(turnModel(m, 90)).whole.pixels);
  });
});

describe('the voxel command, with a drawing on a face', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-voxel-paint-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads a text drawing beside the model that names it, keeps its color names, and shades it one step down its ramp on the side in shadow', async () => {
    writeFileSync(join(dir, 'paleta.pss.json'), JSON.stringify({
      id: 'paleta', name: 'p', category: 'ui', size: 4,
      palette: { 1: '#111111', 2: '#cc9966', 3: '#996633', 4: '#663300', 5: '#e04040', 6: '#902020', 7: '#3060c0', 8: '#183060' },
      colorNames: { 1: 'tinta', 2: 'madera_luz', 3: 'madera', 4: 'madera_sombra', 5: 'rojo', 6: 'rojo_hondo', 7: 'azul', 8: 'azul_hondo' },
      layers: [{ id: 'l', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames: [[[0, 0, 0, 0]]] }], animations: [],
    }));
    writeFileSync(join(dir, 'pgs.json'), JSON.stringify({ name: 'w', says: 'x', visual: { palette: 'paleta.pss.json' } }));
    const sub = join(dir, 'muebles');
    mkdirSync(sub);
    writeFileSync(join(sub, 'cartel.txt'), 'id: cartel\nr = #e04040 rojo\nb = #3060c0 azul\n==\nrb\nbr\n');
    const cartel = {
      id: 'cartel', materials: { madera: { top: 'madera_luz', left: 'madera', right: 'madera_sombra' } },
      boxes: [{ at: [0, 0, 0], size: [4, 4, 4], material: 'madera', paint: { left: { draw: 'cartel.txt', at: [1, 1] } } }],
    };
    writeFileSync(join(sub, 'cartel.voxel.json'), JSON.stringify(cartel));
    // Placed in a room one folder up: the drawing is still read beside the cartel.
    writeFileSync(join(dir, 'cuarto.voxel.json'), JSON.stringify({ id: 'cuarto', materials: {}, boxes: [], place: [{ model: 'muebles/cartel.voxel.json', at: [0, 0, 0] }] }));
    const names = (out: string) => {
      const asset = JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset;
      return Object.values(asset.colorNames);
    };
    await runCommand('voxel', { model: join(dir, 'cuarto.voxel.json'), out: join(dir, 'a.pss.json') });
    expect(names(join(dir, 'a.pss.json'))).toEqual(expect.arrayContaining(['rojo', 'azul']));
    expect(names(join(dir, 'a.pss.json'))).not.toContain('rojo_hondo');
    // Turned 90 it is on the side in shadow: each color one step down its own ramp.
    await runCommand('voxel', { model: join(dir, 'cuarto.voxel.json'), out: join(dir, 'b.pss.json'), rotate: 90 });
    expect(names(join(dir, 'b.pss.json'))).toEqual(expect.arrayContaining(['rojo_hondo', 'azul_hondo']));
    expect(names(join(dir, 'b.pss.json'))).not.toContain('rojo');
    // Glowing, it keeps its colors there.
    writeFileSync(join(sub, 'cartel.voxel.json'), JSON.stringify({ ...cartel, boxes: [{ ...cartel.boxes[0], paint: { left: { draw: 'cartel.txt', at: [1, 1], glow: true } } }] }));
    await runCommand('voxel', { model: join(dir, 'cuarto.voxel.json'), out: join(dir, 'c.pss.json'), rotate: 90 });
    expect(names(join(dir, 'c.pss.json'))).toEqual(expect.arrayContaining(['rojo', 'azul']));
    // A drawing that is not there says which.
    writeFileSync(join(sub, 'cartel.voxel.json'), JSON.stringify({ ...cartel, boxes: [{ ...cartel.boxes[0], paint: { left: { draw: 'no.txt' } } }] }));
    await expect(runCommand('voxel', { model: join(dir, 'cuarto.voxel.json'), out: join(dir, 'd.pss.json') })).rejects.toThrow(/paint left .*no\.txt/);
  });
});

describe('the voxel command: crop (each layer cut to what it paints)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-voxel-crop-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const MAT = { m: { top: '#cccccc', left: '#999999', right: '#666666' }, n: { top: '#ff0000', left: '#ff0000', right: '#ff0000' } };
  const write = (name: string, model: object) => { writeFileSync(join(dir, name), JSON.stringify(model)); return join(dir, name); };
  const room = () => write('cuarto.voxel.json', {
    id: 'cuarto', outline: '#000000', shadows: true, materials: MAT,
    boxes: [{ at: [0, 0, 0], size: [20, 20, 1], material: 'm' }, { at: [0, 19, 1], size: [20, 1, 3], material: 'm', layer: 'frente' }, { at: [8, 8, 1], size: [3, 3, 10], material: 'n', layer: 'gente' }],
  });
  /** The cut image laid back at `at` on a canvas of the whole size. */
  const uncut = (img: Rgba, at: [number, number], w: number, h: number): Rgba => {
    const out = blankImage(w, h);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      for (let k = 0; k < 4; k++) out.data[((y + at[1]) * w + x + at[0]) * 4 + k] = img.data[(y * img.width + x) * 4 + k];
    }
    return out;
  };

  it('is off by default: every layer on the whole canvas and no crop in lugar.json', async () => {
    await runCommand('voxel', { model: room(), out: join(dir, 'todo.pss.json'), png: join(dir, 'todo.png'), layers: true });
    const lugar = JSON.parse(readFileSync(join(dir, 'todo.lugar.json'), 'utf8'));
    expect(lugar.crop).toBeUndefined();
    expect(readPng(join(dir, 'todo.gente.png')).width).toBe(lugar.width);
  });

  it('cuts each layer to its box, and laid back at crop.at it is the uncut layer, pixel by pixel', async () => {
    const model = room();
    await runCommand('voxel', { model, out: join(dir, 'todo.pss.json'), png: join(dir, 'todo.png'), layers: true });
    const res = await runCommand('voxel', { model, out: join(dir, 'cut.pss.json'), png: join(dir, 'cut.png'), layers: true, crop: true });
    expect(res.text).toMatch(/recortadas/);
    const lugar = JSON.parse(readFileSync(join(dir, 'cut.lugar.json'), 'utf8'));
    const full = JSON.parse(readFileSync(join(dir, 'todo.lugar.json'), 'utf8'));
    // The canvas and its origin are the uncut ones: only the files are cut.
    expect([lugar.width, lugar.height, lugar.origin]).toEqual([full.width, full.height, full.origin]);
    expect(Object.keys(lugar.crop).sort()).toEqual(['fondo', 'frente', 'gente']);
    for (const name of ['fondo', 'frente', 'gente']) {
      const c = lugar.crop[name];
      const png = readPng(join(dir, `cut.${name}.png`));
      expect([png.width, png.height]).toEqual([c.width, c.height]);
      expect(uncut(png, c.at, lugar.width, lugar.height)).toEqual(readPng(join(dir, `todo.${name}.png`)));
      const asset = JSON.parse(readFileSync(join(dir, `cut.${name}.pss.json`), 'utf8')) as SpriteAsset;
      expect([asset.width, asset.height]).toEqual([c.width, c.height]);
      expect(asset.layers![0].frames[0]).toHaveLength(c.height);
    }
    // The person is much smaller than the room; the whole is not cut.
    expect(lugar.crop.gente.width * lugar.crop.gente.height).toBeLessThan(lugar.width * lugar.height / 4);
    expect(readPng(join(dir, 'cut.png'))).toEqual(readPng(join(dir, 'todo.png')));
    const gente = JSON.parse(readFileSync(join(dir, 'cut.gente.pss.json'), 'utf8')) as SpriteAsset;
    expect(gente.generatedBy?.args.crop).toBe('true');
  });

  it('cuts the frames of an animation to one box, so the strip keeps one width per frame', async () => {
    const paths = [6, 12, 9].map((h, i) => write(`f${i}.voxel.json`, { id: `f${i}`, outline: '#000000', materials: MAT, boxes: [{ at: [0, 0, 0], size: [30, 30, 1], material: 'm' }, { at: [10 + i, 10, 1], size: [3, 3, h], material: 'n', layer: 'gente' }] }));
    await runCommand('voxel', { frames: paths, out: join(dir, 'anda.pss.json'), png: join(dir, 'anda.png'), layers: true });
    await runCommand('voxel', { frames: paths, out: join(dir, 'cut.pss.json'), png: join(dir, 'cut.png'), only: 'gente', crop: true });
    const lugar = JSON.parse(readFileSync(join(dir, 'cut.lugar.json'), 'utf8'));
    const c = lugar.crop.gente;
    const strip = readPng(join(dir, 'cut.gente.png'));
    expect([strip.width, strip.height]).toEqual([c.width * 3, c.height]);
    const whole = readPng(join(dir, 'anda.gente.png'));
    for (let i = 0; i < 3; i++) {
      const one = blankImage(c.width, c.height);
      for (let y = 0; y < c.height; y++) one.data.set(strip.data.subarray((y * strip.width + i * c.width) * 4, (y * strip.width + (i + 1) * c.width) * 4), y * c.width * 4);
      const frame = blankImage(lugar.width, lugar.height);
      for (let y = 0; y < lugar.height; y++) frame.data.set(whole.data.subarray((y * whole.width + i * lugar.width) * 4, (y * whole.width + (i + 1) * lugar.width) * 4), y * lugar.width * 4);
      expect(uncut(one, c.at, lugar.width, lugar.height)).toEqual(frame);
    }
  });

  it('needs layers or only, and an empty layer is one empty pixel', async () => {
    await expect(runCommand('voxel', { model: room(), out: join(dir, 'x.pss.json'), crop: true })).rejects.toThrow(/crop cuts the layer files; it needs layers=true or only/);
    const empty = { width: 3, height: 2, origin: [1, 1] as [number, number], pixels: [[undefined, undefined, undefined], [undefined, undefined, undefined]], hits: [[undefined, undefined, undefined], [undefined, undefined, undefined]] };
    const cut = cropImages([empty]);
    expect(cut.at).toEqual([0, 0]);
    expect([cut.images[0].width, cut.images[0].height]).toEqual([1, 1]);
    const one = { ...empty, pixels: [[undefined, undefined, undefined], [undefined, 'a', undefined]] };
    const c2 = cropImages([one]);
    expect(c2.at).toEqual([1, 1]);
    expect(c2.images[0]).toMatchObject({ width: 1, height: 1, origin: [0, 0], pixels: [['a']] });
  });
});

describe('a model derived from another (base + changes)', () => {
  // A little figure around its foot: legs, torso, arms and a head, by group.
  const SKIN = { top: 'S', left: 's', right: 'z' }, CLOTH = { top: 'C', left: 'c', right: 'x' };
  const standing: VoxelModel = {
    id: 'parada', outline: 'k', materials: { skin: SKIN, cloth: CLOTH },
    boxes: [
      { id: 'pierna_i', group: 'piernas', at: [-3, -1, 0], size: [2, 2, 8], material: 'cloth' },
      { id: 'pierna_d', group: 'piernas', at: [1, -1, 0], size: [2, 2, 8], material: 'cloth' },
      { id: 'torso', at: [-3, -2, 8], size: [6, 4, 7], material: 'cloth' },
      { id: 'brazo_i', group: 'brazos', at: [-5, -1, 8], size: [2, 2, 7], material: 'skin' },
      { id: 'brazo_d', group: 'brazos', at: [3, -1, 8], size: [2, 2, 7], material: 'skin' },
      { id: 'cabeza', at: [-3, -3, 15], size: [6, 6, 6], material: 'skin' },
      { id: 'nariz', group: 'cara', at: [0, 3, 17], size: [1, 1, 1], material: 'skin' },
    ],
  };
  const load = (models: Record<string, VoxelSource>) => (path: string) => {
    if (!models[path]) throw new Error(`no ${path}`);
    return structuredClone(models[path]);
  };
  const ids = (m: VoxelModel) => m.boxes.map(b => b.id);

  it('leaves a model without base as it is (the same object: an old recipe draws as it did)', () => {
    expect(deriveModel(standing, load({}))).toBe(standing);
    expect(() => deriveModel({ ...standing, changes: [{ remove: 'torso' }] }, load({}))).toThrow(/changes need a base/);
  });

  it('is its base where it says nothing: materials joined by name, its boxes after, its own id, outline and rotate', () => {
    const m = deriveModel({ id: 'b', base: 'p', rotate: 90, materials: { cloth: { top: 'Q', left: 'q', right: 'w' } }, boxes: [{ id: 'gorro', at: [-3, -3, 21], size: [6, 6, 1], material: 'cloth' }] }, load({ p: standing }));
    expect(m.id).toBe('b');
    expect(m.outline).toBe('k');
    expect(m.rotate).toBe(90);
    expect(m.materials).toEqual({ skin: SKIN, cloth: { top: 'Q', left: 'q', right: 'w' } });
    expect(ids(m)).toEqual([...ids(standing), 'gorro']);
    expect(m.base).toBeUndefined();
    expect(m.changes).toBeUndefined();
  });

  it('replaces a group in its place (the new boxes take the group), removes, adds and moves', () => {
    const m = deriveModel({
      id: 'paso', base: 'p', materials: {},
      changes: [
        { move: ['torso', 'brazos', 'cabeza', 'cara'], by: [0, 0, 1] },
        { replace: 'piernas', with: [{ id: 'adelante', at: [-3, 0, 0], size: [2, 2, 9], material: 'cloth' }, { id: 'atras', at: [1, -2, 1], size: [2, 2, 8], material: 'cloth' }] },
        { remove: 'brazo_d' },
        { add: [{ id: 'carpeta', at: [-2, 2, 10], size: [4, 1, 4], material: 'cloth' }] },
      ],
    }, load({ p: standing }));
    expect(ids(m)).toEqual(['adelante', 'atras', 'torso', 'brazo_i', 'cabeza', 'nariz', 'carpeta']);
    expect(m.boxes.slice(0, 2).map(b => b.group)).toEqual(['piernas', 'piernas']);
    expect(m.boxes.find(b => b.id === 'torso')!.at).toEqual([-3, -2, 9]);
    expect(m.boxes.find(b => b.id === 'nariz')!.at).toEqual([0, 3, 18]);
    expect(m.boxes.find(b => b.id === 'carpeta')!.group).toBeUndefined();
    // The base is not touched.
    expect(standing.boxes[2].at).toEqual([-3, -2, 8]);
  });

  it('names boxes with * and refuses a name that names nothing, a change that says two things or none', () => {
    expect(ids(deriveModel({ id: 'x', base: 'p', materials: {}, changes: [{ remove: 'brazo_*' }] }, load({ p: standing })))).not.toContain('brazo_i');
    expect(() => deriveModel({ id: 'x', base: 'p', materials: {}, changes: [{ remove: 'brazos_x' }] }, load({ p: standing }))).toThrow(/change 1: remove "brazos_x" names no box/);
    expect(() => deriveModel({ id: 'x', base: 'p', materials: {}, changes: [{ remove: 'torso', move: 'cabeza', by: [0, 0, 1] }] }, load({ p: standing }))).toThrow(/say one of remove, replace, add, move or turn \(it says remove, move\)/);
    expect(() => deriveModel({ id: 'x', base: 'p', materials: {}, changes: [{}] }, load({ p: standing }))).toThrow(/it says none/);
    expect(() => deriveModel({ id: 'x', base: 'p', materials: {}, changes: [{ move: 'torso', by: [0, 0.5, 0] }] }, load({ p: standing }))).toThrow(/three whole units/);
    expect(() => deriveModel({ id: 'x', base: 'p', materials: {}, changes: [{ replace: 'torso' }] }, load({ p: standing }))).toThrow(/replace needs with/);
  });

  it('nests: a base with a base of its own, and refuses bases that go round in a circle', () => {
    const walk: VoxelSource = { id: 'camina', base: 'p', materials: {}, changes: [{ move: 'piernas', by: [0, 1, 0] }] };
    const carry = deriveModel({ id: 'lleva', base: 'w', materials: {}, changes: [{ remove: 'brazos' }] }, load({ p: standing, w: walk }));
    expect(ids(carry)).toEqual(['pierna_i', 'pierna_d', 'torso', 'cabeza', 'nariz']);
    expect(carry.boxes[0].at).toEqual([-3, 0, 0]);
    const a: VoxelSource = { id: 'a', base: 'b', materials: {} }, b: VoxelSource = { id: 'b', base: 'a', materials: {} };
    expect(() => deriveModel(a, load({ a, b }))).toThrow(/goes round in a circle \(b → a → b\)/);
  });

  it('turns a group about a line: the head about the vertical, an arm forward about its shoulder, four turns are none', () => {
    const turn = (axis: 'x' | 'y' | 'z', degrees: number, sel: string, about?: [number, number, number]) =>
      deriveModel({ id: 't', base: 'p', materials: {}, changes: [{ turn: sel, axis, degrees, about }] }, load({ p: standing }));
    // About z: the nose that looked to +y looks to +x, as turnModel turns the whole figure.
    const head = turn('z', 90, 'cabeza', [0, 0, 0]).boxes;
    expect(head.find(b => b.id === 'cabeza')!.at).toEqual(turnModel({ ...standing, rotate: 90 }).boxes[5].at);
    expect(turn('z', 90, '*').boxes).toEqual(turnModel({ ...standing, rotate: 90 }).boxes);
    // About x, through the shoulder: the arm that hung comes forward.
    const arm = turn('x', 90, 'brazo_i', [0, 0, 15]).boxes.find(b => b.id === 'brazo_i')!;
    expect(arm).toMatchObject({ at: [-5, 0, 14], size: [2, 7, 2] });
    // About y: it goes out to the side, +x.
    const out = turn('y', 90, 'brazo_d', [5, 0, 15]).boxes.find(b => b.id === 'brazo_d')!;
    expect(out).toMatchObject({ at: [5, -1, 13], size: [7, 2, 2] });
    // Four quarter turns are none.
    const m4 = deriveModel({ id: 't', base: 'p', materials: {}, changes: [1, 2, 3, 4].map(() => ({ turn: 'brazos', axis: 'x' as const, degrees: 90, about: [0, 1, 15] as [number, number, number] })) }, load({ p: standing }));
    expect(m4.boxes).toEqual(standing.boxes);
    expect(() => turn('z', 45, 'cabeza')).toThrow(/turn needs degrees, 90, 180 or 270/);
  });

  it('turns a painted face with its box about z, and refuses to turn it about a horizontal line', () => {
    const painted: VoxelModel = { ...standing, boxes: [...standing.boxes, { id: 'cara', group: 'cara', at: [-3, 3, 15], size: [6, 1, 6], material: 'skin', paint: { left: { rows: ['k..k'], glyphs: { k: 'k' }, at: [1, 2] } } }] };
    const m = deriveModel({ id: 't', base: 'p', materials: {}, changes: [{ turn: ['cabeza', 'cara'], degrees: 90 }] }, load({ p: painted }));
    const face = m.boxes.find(b => b.id === 'cara')!;
    expect(Object.keys(face.paint!)).toEqual(['+x']);
    expect(face.at).toEqual([3, -3, 15]);
    expect(() => deriveModel({ id: 't', base: 'p', materials: {}, changes: [{ turn: 'cara', axis: 'x', degrees: 90 }] }, load({ p: painted }))).toThrow(/a box with paint turns only about z/);
  });

  it('draws a pose made of changes as the same pose written whole, pixel for pixel', () => {
    const changes: VoxelChange[] = [
      { move: ['torso', 'brazos', 'cabeza', 'cara'], by: [0, 0, 1] },
      { replace: 'piernas', with: [{ id: 'a', at: [-3, 1, 0], size: [2, 2, 9], material: 'cloth' }, { id: 'b', at: [1, -3, 2], size: [2, 2, 7], material: 'cloth' }] },
      { turn: 'brazo_d', axis: 'x', degrees: 90, about: [0, 0, 16] },
      { turn: 'cabeza', degrees: 90, about: [0, 0, 0] },
    ];
    const derived = deriveModel({ id: 'paso', base: 'p', materials: {}, rotate: 270, changes }, load({ p: standing }));
    const whole: VoxelModel = {
      id: 'paso', outline: 'k', materials: standing.materials, rotate: 270,
      boxes: [
        { at: [-3, 1, 0], size: [2, 2, 9], material: 'cloth' }, { at: [1, -3, 2], size: [2, 2, 7], material: 'cloth' },
        { at: [-3, -2, 9], size: [6, 4, 7], material: 'cloth' },
        { at: [-5, -1, 9], size: [2, 2, 7], material: 'skin' }, { at: [3, 0, 15], size: [2, 7, 2], material: 'skin' },
        { at: [-3, -3, 16], size: [6, 6, 6], material: 'skin' }, { at: [0, 3, 18], size: [1, 1, 1], material: 'skin' },
      ],
    };
    const a = renderVoxel(derived), b = renderVoxel(whole);
    expect(a.pixels).toEqual(b.pixels);
    expect(a.origin).toEqual(b.origin);
  });
});

describe('the voxel command, with a base', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-voxel-base-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const pal = () => writeFileSync(join(dir, 'paleta.pss.json'), JSON.stringify({
    id: 'paleta', name: 'p', category: 'ui', size: 4,
    palette: { 1: '#111111', 2: '#cc9966', 3: '#996633', 4: '#663300', 5: '#e04040' },
    colorNames: { 1: 'tinta', 2: 'madera_luz', 3: 'madera', 4: 'madera_sombra', 5: 'rojo' },
    layers: [{ id: 'l', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames: [[[0, 0, 0, 0]]] }], animations: [],
  }));

  it('reads the base beside the model, and what the base names (its palette, its drawings, what it places) beside the base', async () => {
    pal();
    const sub = join(dir, 'base');
    mkdirSync(sub);
    mkdirSync(join(dir, 'poses'));
    writeFileSync(join(sub, 'ojo.txt'), 'id: ojo\nr = #e04040 rojo\n==\nr\n');
    writeFileSync(join(sub, 'pata.voxel.json'), JSON.stringify({ id: 'pata', materials: { madera: { top: 'madera_luz', left: 'madera', right: 'madera_sombra' } }, boxes: [{ id: 'p', at: [0, 0, 0], size: [2, 2, 3], material: 'madera' }] }));
    writeFileSync(join(sub, 'parado.voxel.json'), JSON.stringify({
      id: 'parado', palette: '../paleta.pss.json', outline: 'tinta',
      materials: { madera: { top: 'madera_luz', left: 'madera', right: 'madera_sombra' } },
      boxes: [{ id: 'cuerpo', at: [0, 0, 3], size: [4, 4, 4], material: 'madera', paint: { left: { draw: 'ojo.txt', at: [1, 1] } } }],
      place: [{ model: 'pata.voxel.json', at: [0, 0, 0], id: 'pata_i' }, { model: 'pata.voxel.json', at: [2, 2, 0], id: 'pata_d' }],
    }));
    writeFileSync(join(dir, 'poses', 'salta.voxel.json'), JSON.stringify({ id: 'salta', base: '../base/parado.voxel.json', changes: [{ move: 'cuerpo', by: [0, 0, 2] }] }));
    const res = await runCommand('voxel', { model: join(dir, 'poses', 'salta.voxel.json'), out: join(dir, 'salta.pss.json'), png: join(dir, 'salta.png') });
    expect(res.text).toMatch(/^voxel salta:/);
    const asset = JSON.parse(readFileSync(join(dir, 'salta.pss.json'), 'utf8')) as SpriteAsset;
    expect(Object.values(asset.colorNames)).toEqual(expect.arrayContaining(['rojo', 'madera', 'tinta']));
    // The same as the pose written whole, beside the base.
    writeFileSync(join(sub, 'salta_entera.voxel.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(sub, 'parado.voxel.json'), 'utf8')), id: 'salta', boxes: [{ id: 'cuerpo', at: [0, 0, 5], size: [4, 4, 4], material: 'madera', paint: { left: { draw: 'ojo.txt', at: [1, 1] } } }] }));
    await runCommand('voxel', { model: join(sub, 'salta_entera.voxel.json'), out: join(dir, 'entera.pss.json'), png: join(dir, 'entera.png') });
    expect(readFileSync(join(dir, 'salta.png')).equals(readFileSync(join(dir, 'entera.png')))).toBe(true);
    // A base that is not there says which.
    writeFileSync(join(dir, 'poses', 'mal.voxel.json'), JSON.stringify({ id: 'mal', base: 'nada.voxel.json', changes: [] }));
    await expect(runCommand('voxel', { model: join(dir, 'poses', 'mal.voxel.json'), out: join(dir, 'mal.pss.json') })).rejects.toThrow(/base .*nada\.voxel\.json/);
  });

  it('writes the same files as before for a model without base (an old recipe gives the same bytes)', async () => {
    pal();
    const model: VoxelModel & { palette: string } = { id: 'mesa', palette: 'paleta.pss.json', outline: 'tinta', shadows: true, materials: { madera: { top: 'madera_luz', left: 'madera', right: 'madera_sombra' } }, boxes: [{ at: [0, 0, 0], size: [8, 4, 6], material: 'madera', id: 'tapa', layer: 'mesa' }, { at: [-2, 4, 0], size: [3, 2, 2], material: 'madera' }] };
    writeFileSync(join(dir, 'mesa.voxel.json'), JSON.stringify(model));
    await runCommand('voxel', { model: join(dir, 'mesa.voxel.json'), out: join(dir, 'mesa.pss.json'), png: join(dir, 'mesa.png'), layers: true });
    // The same model, in memory, drawn without the command: the written layers are its layers.
    const { layers } = renderVoxelLayers(model);
    const asset = JSON.parse(readFileSync(join(dir, 'mesa.mesa.pss.json'), 'utf8')) as SpriteAsset;
    const hex: Record<string, string> = { madera_luz: '#cc9966', madera: '#996633', madera_sombra: '#663300', tinta: '#111111' };
    asset.layers![0].frames[0].forEach((row, y) => row.forEach((v, x) => expect(v ? asset.palette[v].toLowerCase() : undefined).toBe(layers.mesa.pixels[y][x] ? hex[layers.mesa.pixels[y][x]!] : undefined)));
    // And with a base that changes nothing, the same bytes.
    writeFileSync(join(dir, 'igual.voxel.json'), JSON.stringify({ id: 'mesa', base: 'mesa.voxel.json', changes: [] }));
    await runCommand('voxel', { model: join(dir, 'igual.voxel.json'), out: join(dir, 'igual.pss.json'), png: join(dir, 'igual.png'), layers: true });
    for (const f of ['.png', '.mesa.png', '.fondo.png', '.lugar.json']) {
      expect(readFileSync(join(dir, `igual${f}`)).equals(readFileSync(join(dir, `mesa${f}`)))).toBe(true);
    }
  });
});
