// terrain: a map's whole ground painted from a grid of letters, with borders
// that meander instead of stepping cell by cell.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAsset, getFrame, loadAsset, saveAsset } from './asset';
import { paintTerrain, type TerrainRecipe } from './terrain';
import { runCommand } from './commands';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pss-terrain-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const GRASS = ['#56864c', '#6fa05a', '#8fb66a', '#a6c778'];
const recipe = (): TerrainRecipe => ({
  seed: 3,
  grid: ['gggggg', 'gdddgg', 'gdwwdg', 'gdwwdg', 'ggddgg', 'gggggg'],
  materials: {
    g: { tones: GRASS, base: 3, spread: 0.6, layer: 2, lip: ['#6fa05a'], fringe: { colors: ['#8fb66a'], chance: 0.3 },
      stamps: [{ rows: ['f'], colors: { f: '#f4d0d8' }, per_cell: 1, margin: 3 }] },
    d: { tones: ['#9c7048', '#c48a5a', '#d9b98a'], layer: 1, rim: ['#7a5236'] },
    w: { tones: ['#3d6a8f', '#6f9fc4'], depth: [1, 0], layer: 0, edge: ['#dbeeff'] },
  },
  pieces: [{ id: 'brillos', materials: 'w', color: '#dbeeff', density: 0.2 }],
  shadows: [{ at: [1, 1], r: [0.8, 0.5] }],
});

function hexAt(asset: ReturnType<typeof createAsset>, x: number, y: number): string {
  return asset.palette[getFrame(asset, 0, 0)[y][x]] ?? '';
}

describe('terrain', () => {
  it('paints the grid with borders that do not follow the cell edges', () => {
    const { asset, share } = paintTerrain(recipe(), { id: 't' });
    expect([asset.width ?? asset.size, asset.height ?? asset.size]).toEqual([96, 96]);
    expect(share.g + share.d + share.w).toBe(96 * 96);
    // A border column that changes from row to row: the line meanders.
    const frame = getFrame(asset, 0, 0);
    const water = new Set(['#3d6a8f', '#6f9fc4', '#dbeeff'].map(h => [...Object.entries(asset.palette)].find(([, v]) => v === h)?.[0]).filter(Boolean).map(Number));
    const firstWater = (y: number): number => frame[y].findIndex(i => water.has(i));
    const starts = new Set<number>();
    for (let y = 36; y < 60; y++) starts.add(firstWater(y));
    expect(starts.size).toBeGreaterThan(2);
    // Same recipe, same picture.
    expect(getFrame(paintTerrain(recipe(), { id: 't' }).asset, 0, 0)).toEqual(getFrame(asset, 0, 0));
  });

  it('banks, foam, flowers away from borders, shadows and pieces only on their material', () => {
    const { asset, pieces } = paintTerrain(recipe(), { id: 't' });
    const colors = new Set(getFrame(asset, 0, 0).flat().map(i => asset.palette[i]));
    for (const c of ['#7a5236', '#dbeeff', '#f4d0d8', '#56864c']) expect(colors.has(c)).toBe(true);
    // The rim of the mud sits right under grass.
    const frame = getFrame(asset, 0, 0);
    let rims = 0, rimsUnderGrass = 0;
    for (let y = 1; y < 96; y++) for (let x = 0; x < 96; x++) {
      if (asset.palette[frame[y][x]] !== '#7a5236') continue;
      rims++;
      if (GRASS.includes(hexAt(asset, x, y - 1)) || hexAt(asset, x, y - 1) === '#8fb66a') rimsUnderGrass++;
    }
    expect(rims).toBeGreaterThan(10);
    expect(rimsUnderGrass / rims).toBeGreaterThan(0.6);
    // Glints only over the pond (cells 2..3 → px 32..63, with the wobble).
    const p = pieces[0];
    expect(p.cells).toBeGreaterThan(5);
    const pf = getFrame(p.asset, 0, 0);
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      if (!pf[y][x]) continue;
      expect(x).toBeGreaterThan(20); expect(x).toBeLessThan(76);
      expect(y).toBeGreaterThan(20); expect(y).toBeLessThan(76);
    }
    expect(() => paintTerrain({ ...recipe(), grid: ['gx'] })).toThrow(/no material/);
  });

  it('the command writes the ground and its pieces, and refuses colors off the palette', async () => {
    const pal = createAsset({ id: 'madre', width: 1, palette: [...GRASS, '#9c7048', '#c48a5a', '#d9b98a', '#7a5236', '#3d6a8f', '#6f9fc4', '#dbeeff', '#f4d0d8'] });
    pal.colorNames[1] = 'hoja';
    saveAsset(join(dir, 'madre.pss.json'), pal);
    const out = join(dir, 'suelo.pss.json');
    const res = await runCommand('terrain', { recipe: recipe() as unknown as Record<string, unknown>, out, fit: join(dir, 'madre.pss.json') });
    expect(existsSync(join(dir, 'suelo_brillos.pss.json'))).toBe(true);
    expect((res.data as { size: number[] }).size).toEqual([96, 96]);
    expect(Object.values(loadAsset(out).colorNames)).toContain('hoja');
    const off = recipe();
    off.materials.d.rim = ['#ff00ff'];
    await expect(runCommand('terrain', { recipe: off as unknown as Record<string, unknown>, out, fit: join(dir, 'madre.pss.json') })).rejects.toThrow(/not in/);
  });
});
