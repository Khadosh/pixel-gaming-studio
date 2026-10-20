// Voxels to isometric pixel art (the studio's desk, 19 Oct 2026): what makes it
// read as drawn and not as a shrunk render — one tone per face, 2:1 steps, a
// one-pixel contour and a line where one thing stands in front of another.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVoxel, renderVoxelLayers, voxelToScreen, type VoxelModel } from './voxel';
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
  });
});
