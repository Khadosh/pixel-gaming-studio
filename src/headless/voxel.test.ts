// Voxels to isometric pixel art (the studio's desk, 19 Oct 2026): what makes it
// read as drawn and not as a shrunk render — one tone per face, 2:1 steps, a
// one-pixel contour and a line where one thing stands in front of another.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVoxel, type VoxelModel } from './voxel';
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
