// A prop in three quarters (Khadosh/pixel-gaming-studio#12): the voxel model
// seen as a top-down game draws its props — one pixel a unit across, one up,
// half a pixel per unit of depth — so a lantern, a barrel or a fence is a
// recipe of boxes and not pixels set by hand, and it goes to a map's library
// with its foot as the anchor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVoxel, renderVoxelLayers, turnModel, voxelToScreen, type VoxelModel } from './voxel';
import { runCommand } from './commands';
import { fromAscii } from './ascii';
import { renderRecipe } from './mapfile';
import type { MapRecipe } from './maprecipe';

const WOOD = { top: 'T', left: 'L', right: 'R' };
const box = (w: number, d: number, h: number): VoxelModel => ({
  id: 'caja', projection: 'front', outline: 'k', materials: { wood: WOOD }, boxes: [{ at: [0, 0, 0], size: [w, d, h], material: 'wood' }],
});
const count = (px: (string | undefined)[][], c: string) => px.flat().filter(v => v === c).length;

describe('a box in three quarters', () => {
  it('is as wide as it is in units, its front one pixel a unit and its top half its depth, and shows no side', () => {
    const img = renderVoxel({ ...box(8, 6, 5), outline: false });
    expect(img.width).toBe(8);
    expect(img.height).toBe(5 + 3);
    expect(count(img.pixels, 'T')).toBe(8 * 3);
    expect(count(img.pixels, 'L')).toBe(8 * 5);
    expect(count(img.pixels, 'R')).toBe(0);
    // The top above, the front below it, every column the same.
    const top = img.pixels.findIndex(r => r.includes('T'));
    for (let col = 0; col < 8; col++) {
      expect(img.pixels.map(r => r[col]).slice(top, top + 8).join('')).toBe('TTTLLLLL');
    }
  });

  it('puts a world point where the projection says: x across, half of y down, z up', () => {
    const img = renderVoxel(box(8, 6, 5));
    // The near-bottom-left corner of the box is the bottom-left of its front.
    const [x, y] = voxelToScreen(img.origin, [0, 6, 0], 'front');
    expect(img.pixels[y - 1][x]).toBe('L');
    expect(img.pixels[y][x]).toBe('k');
    expect(voxelToScreen([10, 20], [4, 6, 2], 'front')).toEqual([14, 21]);
    // The default is still 2:1.
    expect(voxelToScreen([10, 20], [4, 6, 2])).toEqual([8, 23]);
  });

  it('draws one box in front of another one pixel a unit, and the near one covers the far one', () => {
    const model: VoxelModel = {
      id: 'dos', projection: 'front', outline: false, materials: { far: { top: 'A', left: 'B', right: 'C' }, near: WOOD },
      boxes: [{ at: [0, 0, 0], size: [4, 2, 8], material: 'far' }, { at: [0, 6, 0], size: [4, 2, 4], material: 'near' }],
    };
    const img = renderVoxel(model);
    const col = img.pixels.map(r => r[2]).join('');
    // The tall one behind: its top (two deep, one row), its front down to
    // where the low one in front stands, the low one's top and front.
    expect(col.replace(/undefined/g, '')).toBe('ABBBBBBTLLLL');
  });

  it('shades a barrel round, lit from the left, and the other way with the light at the upper right', () => {
    const barrel = (light?: 'upper_right'): VoxelModel => ({
      id: 'barril', projection: 'front', outline: false, light,
      materials: { d: { top: 'T', left: 'L', right: 'R', ramp: ['1', '2', '3', '4'] } },
      boxes: [{ at: [0, 0, 0], size: [10, 10, 12], material: 'd', shape: 'cylinder' }],
    });
    const tone = (c?: string) => (c && /[1-4]/.test(c) ? Number(c) : NaN);
    const mid = (img: ReturnType<typeof renderVoxel>) => img.pixels[img.height - 4];
    const left = mid(renderVoxel(barrel()));
    const lit = left.map(tone).filter(n => !isNaN(n));
    expect(lit[0]).toBeLessThan(lit[lit.length - 1]);
    const right = mid(renderVoxel(barrel('upper_right'))).map(tone).filter(n => !isNaN(n));
    expect(right[0]).toBeGreaterThan(right[right.length - 1]);
    // Round: no 'R' face tone, the bands of its ramp only.
    expect(count(renderVoxel(barrel()).pixels, 'R')).toBe(0);
  });

  it('turns in quarters, and says no to an eighth', () => {
    const fence: VoxelModel = { ...box(16, 2, 6), boxes: [{ at: [0, 0, 0], size: [16, 2, 6], material: 'wood' }] };
    const turned = renderVoxel(turnModel(fence, 90));
    // Along the depth now: two units wide, its sixteen of depth eight pixels of top.
    expect(turned.width).toBe(2 + 2);
    expect(count(turned.pixels, 'T')).toBe(2 * 8);
    expect(() => renderVoxel({ ...fence, rotate: 45 })).toThrow(/front turns in quarters/);
    expect(() => renderVoxel({ ...fence, projection: 'side' as 'front' })).toThrow(/projection is iso or front/);
  });

  it('splits in layers on one canvas that stack back into the whole, as in 2:1', () => {
    const model: VoxelModel = {
      ...box(6, 6, 2),
      boxes: [{ at: [0, 0, 0], size: [6, 6, 2], material: 'wood' }, { at: [2, 2, 2], size: [2, 2, 10], material: 'wood', layer: 'poste' }],
    };
    const { whole, layers } = renderVoxelLayers(model);
    expect(Object.keys(layers)).toEqual(['fondo', 'poste']);
    whole.pixels.forEach((row, y) => row.forEach((c, x) => expect(layers.poste.pixels[y][x] ?? layers.fondo.pixels[y][x]).toBe(c)));
  });
});

describe('the voxel command, for a prop in three quarters', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-voxel-frente-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const lantern = {
    id: 'farol', name: 'Farol', projection: 'front', outline: '#1c1626', pivot: [3, 3, 0], footprint: '#', tags: ['farol', 'luz'],
    materials: { hierro: { top: '#5a5868', left: '#3c3a4a', right: '#2a2836' }, vidrio: { top: '#ffe9a0', left: '#f6c75a', right: '#d99a3a' } },
    boxes: [
      { id: 'pie', at: [0, 0, 0], size: [6, 6, 2], material: 'hierro' },
      { id: 'poste', at: [2, 2, 2], size: [2, 2, 12], material: 'hierro' },
      { id: 'vidrio', at: [1, 1, 14], size: [4, 4, 4], material: 'vidrio' },
      { id: 'techo', at: [0, 0, 18], size: [6, 6, 1], material: 'hierro' },
    ],
  };

  it('writes the text drawing of a map object: its foot as the anchor, the footprint and the tags', async () => {
    writeFileSync(join(dir, 'farol.voxel.json'), JSON.stringify(lantern));
    const res = await runCommand('voxel', { model: join(dir, 'farol.voxel.json'), out: join(dir, 'farol.pss.json'), txt: join(dir, 'farol.txt') });
    expect(res.text).toMatch(/voxel farol: 8x24 px/);
    const text = readFileSync(join(dir, 'farol.txt'), 'utf8');
    const parsed = fromAscii(text);
    // The pivot (3, 3, 0) lands at x = 3, y = 3 / 2 below the origin: on the foot.
    const [ax, ay] = parsed.anchor!;
    expect(ax).toBe(4);
    const foot = parsed.asset.layers![0].frames[0][ay][ax];
    expect(['#5a5868', '#3c3a4a']).toContain(parsed.asset.palette[foot]);
    expect(ay).toBeGreaterThan(parsed.asset.height! - 6);
    expect(parsed.footprint).toEqual(['#']);
    expect(parsed.tags).toEqual(['farol', 'luz']);
    expect(parsed.asset.generatedBy?.by).toBe('voxel');
    // A model in 2:1 writes no anchor: its place is lugar.json.
    writeFileSync(join(dir, 'iso.voxel.json'), JSON.stringify({ ...lantern, projection: undefined, footprint: undefined, tags: undefined }));
    await runCommand('voxel', { model: join(dir, 'iso.voxel.json'), out: join(dir, 'iso.pss.json'), txt: join(dir, 'iso.txt') });
    expect(readFileSync(join(dir, 'iso.txt'), 'utf8')).not.toMatch(/^anchor:/m);
  });

  it('draws a 2:1 model in three quarters untouched, through another with it as base, and lugar.json says so', async () => {
    const { projection: _p, ...iso } = lantern;
    void _p;
    writeFileSync(join(dir, 'farol.voxel.json'), JSON.stringify(iso));
    writeFileSync(join(dir, 'farol_frente.voxel.json'), JSON.stringify({ id: 'farol', base: 'farol.voxel.json', projection: 'front', materials: {} }));
    await runCommand('voxel', { model: join(dir, 'farol_frente.voxel.json'), out: join(dir, 'farol.pss.json'), txt: join(dir, 'farol.txt'), layers: true });
    expect(readFileSync(join(dir, 'farol.txt'), 'utf8')).toMatch(/^anchor: /m);
    const place = JSON.parse(readFileSync(join(dir, 'farol.lugar.json'), 'utf8'));
    expect(place.projection).toBe('front');
    expect(place.screen).toMatch(/y \/ 2 - z/);
    expect(place.pivot).toEqual(voxelToScreen(place.origin, [3, 3, 0], 'front'));
  });

  it('without an id takes it from the name of its file: the txt, the asset and the answer (Khadosh/estudio#225)', async () => {
    const { id: _i, name: _n, ...nameless } = lantern;
    void _i; void _n;
    writeFileSync(join(dir, 'barril.json'), JSON.stringify(nameless));
    const res = await runCommand('voxel', { model: join(dir, 'barril.json'), out: join(dir, 'x.pss.json'), txt: join(dir, 'x.txt'), layers: true });
    expect(res.text).toMatch(/^voxel barril: /);
    const parsed = fromAscii(readFileSync(join(dir, 'x.txt'), 'utf8'));
    expect(parsed.asset.id).toBe('barril');
    expect(parsed.anchor).toBeDefined();
    expect(JSON.parse(readFileSync(join(dir, 'x.pss.json'), 'utf8')).id).toBe('barril');
    expect(JSON.parse(readFileSync(join(dir, 'x.lugar.json'), 'utf8')).id).toBe('barril');
    // A base without an id still gives its own to the model made from it.
    writeFileSync(join(dir, 'barril_roto.voxel.json'), JSON.stringify({ base: 'barril.json', materials: {} }));
    const derived = await runCommand('voxel', { model: join(dir, 'barril_roto.voxel.json'), out: join(dir, 'r.pss.json') });
    expect(derived.text).toMatch(/^voxel barril_roto: /);
  });

  it('goes to the library of a map as it comes out, asked by its tag, with its foot on the cell', async () => {
    mkdirSync(join(dir, 'objetos'));
    writeFileSync(join(dir, 'farol.voxel.json'), JSON.stringify(lantern));
    await runCommand('voxel', { model: join(dir, 'farol.voxel.json'), out: join(dir, 'farol.pss.json'), txt: join(dir, 'objetos', 'farol.txt') });
    const ramp = ['#203020', '#304030', '#405040'];
    const colors = Object.fromEntries([
      ...ramp.map((c, i) => [`pasto${i}`, c]),
      ...['#1c1626', '#5a5868', '#3c3a4a', '#2a2836', '#ffe9a0', '#f6c75a', '#d99a3a'].map((c, i) => [`c${i}`, c]),
    ]);
    const recipe: MapRecipe = {
      game: { width: 6, height: 6, grid: Array.from({ length: 6 }, () => '......') }, margin: [1, 1], light: [1, 1],
      materials: { grass: { ramp: ramp.map((_, i) => `pasto${i}`), texture: 'patches' } },
      steps: [
        { step: 'area', material: 'grass', shape: 'all' },
        { step: 'scatter', what: 'stamp', pick: ['luz'], at: [[3, 3]] } as MapRecipe['steps'][number],
      ],
      colors,
    };
    writeFileSync(join(dir, 'r.json'), JSON.stringify(recipe));
    const { map } = renderRecipe(join(dir, 'r.json'), { stderr: false });
    const [o] = map.objects ?? [];
    expect(o.name).toBe('farol');
    // The anchor pixel of the drawing, on the foot's front, is where the object stands.
    expect(map.layers.ground.get(o.at[0], o.at[1])).toBe('c2');
    // and the glass of the lamp is up above it
    const glass = Array.from({ length: 24 }, (_, k) => map.layers.ground.get(o.at[0], o.at[1] - k));
    expect(glass).toContain('c5');
  });
});
