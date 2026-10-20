// Voxels to isometric pixel art (the studio's desk, 19 Oct 2026): what makes it
// read as drawn and not as a shrunk render — one tone per face, 2:1 steps, a
// one-pixel contour and a line where one thing stands in front of another.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { placeModels, rotateModel, renderVoxel, renderVoxelLayers, voxelToScreen, type VoxelModel } from './voxel';
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
