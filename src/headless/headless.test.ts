// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAsset, composite, dims, frameCount, loadAsset, saveAsset, setAnimation, removeFrame, colorIndex } from './asset';
import { blankImage, readPng, writePng, getPixel } from './png';
import { renderAscii, renderFrame, hexToRgba, rgbaToHex } from './render';
import { exportSheet, importSheet, importSheetImage } from './sheet';
import { applyDrawOps, generateFxAnimation, seededRandom, applyFx, floodFill, fitPalette, knockOutColor, despeckle } from './ops';
import { runCommand, commands } from './commands';
import { main as cliMain } from './cli';
import { importCharacter } from './character';
import { animateAsset } from './animate';
import { fromAscii, toAscii } from './ascii';
import { contactSheetMany, detachedPieces, fullestFrame, lintAsset } from './inspect';
import { contentMask, coverCrop, cropToContent, ditherPick, generateImage, illustrate, loadFalKey, pixelize, pngDataUri } from './ai';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('asset model', () => {
  it('creates a non-square canvas and keeps size as the larger side', () => {
    const a = createAsset({ id: 'x', width: 20, height: 28, palette: ['#ff0000'] });
    expect(dims(a)).toEqual({ width: 20, height: 28 });
    expect(a.size).toBe(28);
    expect(a.layers![0].frames[0].length).toBe(28);
    expect(a.layers![0].frames[0][0].length).toBe(20);
  });

  it('square canvases do not carry width/height', () => {
    const a = createAsset({ id: 'x', width: 16 });
    expect(a.width).toBeUndefined();
    expect(dims(a)).toEqual({ width: 16, height: 16 });
  });

  it('round-trips through disk', () => {
    const a = createAsset({ id: 'x', width: 8, palette: ['#123456'] });
    a.layers![0].frames[0][2][3] = 1;
    const p = join(dir, 'x.pss.json');
    saveAsset(p, a);
    const b = loadAsset(p);
    expect(b.layers![0].frames[0][2][3]).toBe(1);
    expect(b.palette[1]).toBe('#123456');
  });

  it('colorIndex reuses existing colors and appends new ones', () => {
    const a = createAsset({ id: 'x', width: 4, palette: ['#ff0000'] });
    expect(colorIndex(a, '#FF0000')).toBe(1);
    expect(colorIndex(a, '#00ff00')).toBe(2);
    expect(a.palette[2]).toBe('#00ff00');
    expect(colorIndex(a, 'transparent')).toBe(0);
    expect(() => colorIndex(a, 9)).toThrow();
  });

  it('a color that is not one never enters the palette', () => {
    const a = createAsset({ id: 'x', width: 4, palette: ['#ff0000'] });
    for (const bad of ['no-es-color', '#zzz', 'rojo', '#12345', '']) {
      expect(() => colorIndex(a, bad)).toThrow(/is not a color/);
    }
    expect(a.palette).toEqual({ 1: '#ff0000' });
    expect(() => createAsset({ id: 'y', width: 4, palette: ['#ff0000', 'verde'] })).toThrow(/"verde" is not a color/);
    expect(colorIndex(a, 'A0522D')).toBe(2);
    expect(colorIndex(a, '#fff')).toBe(3);
    expect(a.palette[3]).toBe('#ffffff');
  });

  it('removing a frame re-indexes animations', () => {
    const a = createAsset({ id: 'x', width: 4, frames: 4 });
    setAnimation(a, { name: 'walk', frameIndices: [0, 1, 2, 3], durations: [100, 100, 100, 100] });
    removeFrame(a, 1);
    expect(frameCount(a)).toBe(3);
    expect(a.animations[0].frameIndices).toEqual([0, 1, 2]);
    expect(a.animations[0].durations).toHaveLength(3);
  });

  it('refuses animations that point outside the frames', () => {
    const a = createAsset({ id: 'x', width: 4 });
    expect(() => setAnimation(a, { name: 'bad', frameIndices: [3] })).toThrow();
  });
});

describe('drawing', () => {
  it('draws lines, rects and fills with x = column, y = row', () => {
    const a = createAsset({ id: 'x', width: 5, height: 3, palette: ['#ffffff', '#000000'] });
    applyDrawOps(a, 0, [
      { op: 'line', x0: 0, y0: 0, x1: 4, y1: 0, color: 1 },
      { op: 'pixel', x: 2, y: 2, color: '#000000' },
    ]);
    expect(renderAscii(composite(a, 0))).toBe('11111\n.....\n..2..');
  });

  it('flood fill stops at other colors', () => {
    const a = createAsset({ id: 'x', width: 4, height: 2, palette: ['#ffffff', '#000000'] });
    const f = a.layers![0].frames[0];
    f[0][2] = 1; f[1][2] = 1;
    expect(floodFill(f, 0, 0, 2)).toBe(4);
    expect(renderAscii(f)).toBe('221.\n221.');
  });

  it('fx are deterministic with a seed and honor non-square canvases', () => {
    const a = createAsset({ id: 'x', width: 24, height: 12, palette: ['#fff', '#f80', '#800'] });
    const blank = () => a.layers![0].frames[0].map(r => [...r]);
    const one = applyFx(a, blank(), { shape: 'sparks', intensity: 1, color: 2, light: 1, dark: 3, seed: 42 });
    const two = applyFx(a, blank(), { shape: 'sparks', intensity: 1, color: 2, light: 1, dark: 3, seed: 42 });
    expect(one).toEqual(two);
    expect(one.length).toBe(12);
    expect(one[0].length).toBe(24);
    const rng = seededRandom(3);
    expect(rng()).toBe(seededRandom(3)());
  });

  it('bolt draws a connected jagged path from top to bottom, reproducibly', () => {
    const a = createAsset({ id: 'x', width: 16, height: 32, palette: ['#fff', '#88f', '#448'] });
    const blank = () => a.layers![0].frames[0].map(r => [...r]);
    const one = applyFx(a, blank(), { shape: 'bolt', intensity: 1, color: 2, light: 1, dark: 3, seed: 5 });
    const two = applyFx(a, blank(), { shape: 'bolt', intensity: 1, color: 2, light: 1, dark: 3, seed: 5 });
    expect(one).toEqual(two);
    // Every row between the ends has at least one painted pixel: no gaps.
    for (let r = 0; r < 32; r++) expect(one[r].some(v => v !== 0)).toBe(true);
    expect(one[0][8]).toBe(1);
    expect(one[31][8]).toBe(1);
  });

  it('fx_anim appends tagged frames whose intensity rises and falls', () => {
    const a = createAsset({ id: 'x', width: 16, palette: ['#fff', '#f80', '#800'] });
    const idx = generateFxAnimation(a, { name: 'technique', shape: 'circle', frames: 5, color: 2, light: 1, dark: 3 });
    expect(idx).toEqual([1, 2, 3, 4, 5]);
    const painted = idx.map(i => composite(a, i).flat().filter(v => v).length);
    const peak = painted.indexOf(Math.max(...painted));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(4);
    expect(a.animations[0]).toMatchObject({ name: 'technique', loop: false, fps: 12 });
  });
});

describe('despeckle', () => {
  it('removes lone pixels and fills lone holes but keeps lines and outlines', () => {
    const f = Array.from({ length: 8 }, () => Array<number>(8).fill(1));
    f[3][3] = 2; // lone pixel
    f[6][6] = 0; // lone hole
    for (let x = 0; x < 8; x++) f[1][x] = 3; // a line
    f[5][3] = 2; f[5][4] = 2; // a two-pixel dash
    const changed = despeckle(f);
    expect(changed).toBe(2);
    expect(f[3][3]).toBe(1);
    expect(f[6][6]).toBe(1);
    expect(f[1].every(v => v === 3)).toBe(true);
    expect(f[5][3]).toBe(2);
    despeckle(f, 2);
    expect(f[5][3]).toBe(1);
    expect(f[5][4]).toBe(1);
    expect(f[1].every(v => v === 3)).toBe(true);
  });

  it('is a command on every frame, with passes', async () => {
    const path = join(dir, 'd.pss.json');
    await runCommand('new', { path, width: 6, palette: ['#ff0000', '#00ff00'] });
    await runCommand('draw', { path, frame: 0, ops: [{ op: 'rect', x: 0, y: 0, w: 6, h: 6, color: 1, fill: true }, { op: 'pixel', x: 2, y: 2, color: 2 }] });
    const r = (await runCommand('despeckle', { path, passes: 2 })).data as { changed: number };
    expect(r.changed).toBe(1);
    expect(composite(loadAsset(path), 0)[2][2]).toBe(1);
  });
});

describe('sheets', () => {
  it('exports 1:1 with an Aseprite-style meta and imports back exactly', () => {
    const a = createAsset({ id: 'hero', width: 6, height: 4, palette: ['#ff0000', '#00ff0080'], frames: 3 });
    a.layers![0].frames[0][1][1] = 1;
    a.layers![0].frames[1][2][2] = 2;
    a.layers![0].frames[2][3][5] = 1;
    setAnimation(a, { name: 'idle', frameIndices: [0], fps: 1 });
    setAnimation(a, { name: 'walk', frameIndices: [1, 2], durations: [80, 120], loop: true });
    const { image, meta } = exportSheet(a, { imageName: 'hero.png' });
    expect(image.width).toBe(12);
    expect(image.height).toBe(8);
    expect(meta.meta.frameTags).toEqual([
      { name: 'idle', from: 0, to: 0, direction: 'forward', loop: true },
      { name: 'walk', from: 1, to: 2, direction: 'forward', loop: true },
    ]);
    expect(meta.frames[0].duration).toBe(1000);
    expect(meta.frames[1]).toMatchObject({ frame: { x: 0, y: 4, w: 6, h: 4 }, duration: 80 });
    expect(meta.frames[2]).toMatchObject({ frame: { x: 6, y: 4, w: 6, h: 4 }, duration: 120 });
    expect(getPixel(image, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(image, 2, 6)).toEqual([0, 255, 0, 128]);

    const png = join(dir, 'hero.png');
    writePng(png, image);
    const back = importSheet({ png, frameWidth: 6, frameHeight: 4, tags: [{ name: 'walk', frames: 'row:1' }] });
    expect(back.columns).toBe(2);
    expect(back.rows).toBe(2);
    expect(back.asset.palette[1]).toBe('#ff0000');
    expect(back.asset.palette[2]).toBe('#00ff0080');
    expect(composite(back.asset, 0)).toEqual(composite(a, 0));
    expect(composite(back.asset, 2)).toEqual(composite(a, 1));
    expect(back.asset.animations[0].frameIndices).toEqual([2, 3]);
  });

  it('supports margin, spacing and col: tags', () => {
    const img = { width: 2 + 3 * 2 + 2 * 1, height: 2 + 2 * 2 + 1, data: new Uint8Array((2 + 3 * 2 + 2 * 1) * (2 + 2 * 2 + 1) * 4) };
    // paint frame (col 1, row 1) at its top-left pixel
    const x = 1 + 1 * (2 + 1), y = 1 + 1 * (2 + 1);
    const i = (y * img.width + x) * 4;
    img.data[i] = 10; img.data[i + 1] = 20; img.data[i + 2] = 30; img.data[i + 3] = 255;
    const r = importSheetImage(img, { frameWidth: 2, frameHeight: 2, margin: 1, spacing: 1, tags: [{ name: 'c1', frames: 'col:1' }] });
    expect(r.columns).toBe(3);
    expect(r.rows).toBe(2);
    expect(r.asset.animations[0].frameIndices).toEqual([1, 4]);
    expect(composite(r.asset, 4)[0][0]).toBe(1);
    expect(r.asset.palette[1]).toBe('#0a141e');
  });

  it('appends a second sheet into an existing asset, merging the palette and offsetting tags', () => {
    const a = createAsset({ id: 'hero', width: 2, height: 2, palette: ['#ff0000'], frames: 2 });
    a.layers![0].frames[0][0][0] = 1;
    const img = { width: 4, height: 2, data: new Uint8Array(4 * 2 * 4) };
    const paint = (x: number, y: number, rgb: number[]) => { const i = (y * 4 + x) * 4; img.data.set([...rgb, 255], i); };
    paint(0, 0, [255, 0, 0]);   // same red as the asset
    paint(2, 1, [0, 0, 255]);   // new blue
    const r = importSheetImage(img, { into: a, frameWidth: 2, frameHeight: 2, tags: [{ name: 'walk', frames: 'row:0' }] });
    expect(r.asset).toBe(a);
    expect(frameCount(a)).toBe(4);
    expect(a.palette).toEqual({ 1: '#ff0000', 2: '#0000ff' });
    expect(a.layers![0].frames[2][0][0]).toBe(1);
    expect(a.layers![0].frames[3][1][0]).toBe(2);
    expect(a.animations[0].frameIndices).toEqual([2, 3]);
    expect(() => importSheetImage(img, { into: a, frameWidth: 4, frameHeight: 2 })).toThrow(/cannot append/);
  });

  it('strip layout refuses non-contiguous animations', () => {
    const a = createAsset({ id: 'x', width: 2, frames: 3 });
    setAnimation(a, { name: 'odd', frameIndices: [0, 2] });
    expect(() => exportSheet(a, { imageName: 'x.png', layout: 'strip' })).toThrow(/contiguous/);
  });
});

describe('characters', () => {
  it('imports a ninja_separate folder with the standard tags, skipping optional sheets', () => {
    const solid = (w: number, h: number, rgb: number[]) => {
      const img = { width: w, height: h, data: new Uint8Array(w * h * 4) };
      for (let i = 0; i < w * h; i++) img.data.set([...rgb, 255], i * 4);
      return img;
    };
    writePng(join(dir, 'Idle.png'), solid(8, 2, [10, 10, 10]));
    writePng(join(dir, 'Walk.png'), solid(8, 8, [20, 20, 20]));
    writePng(join(dir, 'Attack.png'), solid(8, 2, [30, 30, 30]));
    const { asset, sheets } = importCharacter({ dir, layout: 'ninja_separate', id: 'npc', frameSize: 2 });
    expect(sheets).toEqual(['Idle.png', 'Walk.png', 'Attack.png']);
    expect(frameCount(asset)).toBe(4 + 16 + 4);
    const names = asset.animations.map(a => a.name);
    for (const d of ['down', 'up', 'left', 'right']) {
      for (const p of ['idle', 'hurt', 'walk', 'attack']) expect(names).toContain(`${p}_${d}`);
    }
    expect(names).not.toContain('technique');
    expect(asset.animations.find(a => a.name === 'walk_left')!.frameIndices).toEqual([6, 10, 14, 18]);
    expect(asset.animations.find(a => a.name === 'attack_up')!.frameIndices).toEqual([21]);
    expect(Object.keys(asset.palette)).toHaveLength(3);
  });
});

describe('animate', () => {
  it('grows a walk cycle and an idle from one pose and tags them', () => {
    const a = createAsset({ id: 'x', width: 16, palette: ['#000', '#f00', '#0f0'] });
    // A crude humanoid: head rows 1-4, torso 5-10, legs 11-14.
    applyDrawOps(a, 0, [
      { op: 'rect', x: 6, y: 1, w: 4, h: 4, color: 2, fill: true },
      { op: 'rect', x: 5, y: 5, w: 6, h: 6, color: 3, fill: true },
      { op: 'rect', x: 3, y: 5, w: 2, h: 5, color: 1, fill: true },
      { op: 'rect', x: 11, y: 5, w: 2, h: 5, color: 1, fill: true },
      { op: 'rect', x: 5, y: 11, w: 2, h: 4, color: 1, fill: true },
      { op: 'rect', x: 9, y: 11, w: 2, h: 4, color: 1, fill: true },
    ]);
    const walk = animateAsset(a, { base: 0, anim: 'walk_down' });
    expect(walk.length).toBeGreaterThanOrEqual(4);
    const idle = animateAsset(a, { base: 0, anim: 'idle', anatomy: { neckRow: 4, waistRow: 10 } });
    expect(idle).toHaveLength(4);
    expect(a.animations.map(x => x.name)).toEqual(['walk_down', 'idle']);
    expect(a.animations[0].loop).toBe(true);
    const painted = (i: number) => composite(a, i).flat().filter(v => v).length;
    // Frames keep roughly the same amount of body: nothing vanished.
    for (const i of [...walk, ...idle]) expect(painted(i)).toBeGreaterThan(painted(0) * 0.6);
    expect(() => animateAsset(a, { base: 0, anim: 'fly' })).toThrow(/unknown animation/);
  });

  it('cast and hurt keep a chibi in one piece (no crown split off by a transparent row)', () => {
    // A chibi of the pack: the head takes most of the 16 px, the body three rows.
    const a = createAsset({ id: 'chibi', width: 16, palette: ['#15120f', '#3b3643', '#ef914f', '#e6dcc6'] });
    applyDrawOps(a, 0, [
      { op: 'rect', x: 3, y: 1, w: 10, h: 6, color: 2, fill: true },
      { op: 'rect', x: 3, y: 7, w: 10, h: 5, color: 3, fill: true },
      { op: 'rect', x: 4, y: 12, w: 8, h: 4, color: 4, fill: true },
      { op: 'rect', x: 2, y: 1, w: 1, h: 15, color: 1, fill: true },
      { op: 'rect', x: 13, y: 1, w: 1, h: 15, color: 1, fill: true },
    ]);
    for (const anim of ['cast', 'hurt_down', 'hurt_left']) {
      const idx = animateAsset(a, { base: 0, anim, glow: '#e6dcc6', anatomy: { neckRow: 6, waistRow: 12 } });
      for (const i of idx) {
        const f = composite(a, i);
        expect(detachedPieces(f), `${anim} frame ${i}`).toEqual([]);
        // No transparent row between two painted rows.
        const painted = f.map(row => row.some(v => v));
        const first = painted.indexOf(true), last = painted.lastIndexOf(true);
        expect(painted.slice(first, last + 1).every(Boolean), `${anim} frame ${i}`).toBe(true);
      }
    }
  });
});

describe('ai', () => {
  it('pixelizes a lime-green-backed image into a small asset and fits it to a palette', async () => {
    // 64x64: green background, a red square in the middle with a blue dot.
    const w = 64, img = { width: w, height: w, data: new Uint8Array(w * w * 4) };
    for (let i = 0; i < w * w; i++) img.data.set([0, 255, 0, 255], i * 4);
    for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) img.data.set([200, 30, 30, 255], (y * w + x) * 4);
    for (let y = 28; y < 36; y++) for (let x = 28; x < 36; x++) img.data.set([30, 30, 200, 255], (y * w + x) * 4);
    const crop = cropToContent(img);
    expect(crop.box.w).toBeGreaterThanOrEqual(32);
    expect(crop.box.w).toBeLessThan(40);
    const a = pixelize(img, { id: 'p', size: 16, maxColors: 4, crop: false });
    expect(a.palette[0]).toBeUndefined();
    const f = composite(a, 0);
    expect(f[0][0]).toBe(0);
    expect(f[8][8]).not.toBe(0);
    expect(f[5][5]).not.toBe(0);
    expect(f[5][5]).not.toBe(f[8][8]);
    // Cropped: the square fills the grid (only the margin stays empty).
    const c = composite(pixelize(img, { id: 'c', size: 16, maxColors: 4 }), 0);
    expect(c[3][3]).not.toBe(0);
    expect(c[12][12]).not.toBe(0);
    expect(c[8][8]).not.toBe(c[3][3]);
    const table = fitPalette(a, ['#ff0000', '#0000ff']);
    expect(table.every(t => ['#ff0000', '#0000ff'].includes(t.to))).toBe(true);
  });

  it('illustrate fills a rectangle edge to edge: cover crop around the focus, no background removed', () => {
    // 100x50: left half green sky (a flat "background" pixelize would drop), right half brown ground.
    const w = 100, h = 50, img = { width: w, height: h, data: new Uint8Array(w * h * 4) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set(x < 50 ? [0, 255, 0, 255] : [120, 80, 40, 255], (y * w + x) * 4);
    // Square target: the cover crop keeps 50x50; focus 0 takes the green side, 1 the brown one.
    expect(coverCrop(img, 1, 0).width).toBe(50);
    const left = illustrate(img, { id: 'l', width: 8, height: 8, maxColors: 4, focusX: 0 });
    const right = illustrate(img, { id: 'r', width: 8, height: 8, maxColors: 4, focusX: 1 });
    const fl = composite(left, 0), fr = composite(right, 0);
    expect(fl.every(row => row.every(i => i !== 0))).toBe(true);
    expect(left.palette[fl[0][0]]).toBe('#00ff00');
    expect(right.palette[fr[7][7]]).toBe('#785028');
    // Zoom 2 around the center of the brown half keeps only brown.
    const close = composite(illustrate(img, { id: 'z', width: 8, height: 8, maxColors: 4, focusX: 1, zoom: 2 }), 0);
    expect(coverCrop(img, 1, 1, 0.5, 2).width).toBe(25);
    expect(close.every(row => row.every(i => i === close[0][0]))).toBe(true);
    // Wide target over the whole picture: both halves survive, nothing transparent.
    const wide = illustrate(img, { id: 'w', width: 10, height: 5, maxColors: 4 });
    expect(wide.width).toBe(10);
    expect(wide.height).toBe(5);
    const fw = composite(wide, 0);
    expect(wide.palette[fw[2][0]]).toBe('#00ff00');
    expect(wide.palette[fw[2][9]]).toBe('#785028');
  });

  it('illustrate flattens a gradient background and draws a contour around the subject', () => {
    // 40x40: a sky that goes from light to slightly darker blue, a red square in the middle.
    const w = 40, img = { width: w, height: w, data: new Uint8Array(w * w * 4) };
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) img.data.set([150, 180, 230 - y, 255], (y * w + x) * 4);
    for (let y = 12; y < 28; y++) for (let x = 12; x < 28; x++) img.data.set([200, 30, 30, 255], (y * w + x) * 4);
    const a = illustrate(img, { id: 'f', width: 10, height: 10, maxColors: 6, background: 'flat', contour: '#15120f' });
    const f = composite(a, 0);
    const sky = new Set<number>();
    for (const [x, y] of [[0, 0], [9, 9], [0, 9], [5, 0], [1, 1]]) sky.add(f[y][x]);
    expect(sky.size).toBe(1);
    expect(a.palette[f[3][3]]).toBe('#15120f');
    expect(a.palette[f[5][5]]).not.toBe('#15120f');
    expect(a.palette[f[5][5]]).not.toBe(a.palette[f[0][0]]);
  });

  it('illustrate dithers a flat in-between tone into a checker of its two nearest colors, and never across far colors', () => {
    // A flat mid grey halfway between two greys of the palette, plus black and white far away.
    const w = 16, img = { width: w, height: w, data: new Uint8Array(w * w * 4) };
    for (let i = 0; i < w * w; i++) img.data.set([128, 128, 128, 255], i * 4);
    const palette = ['#707070', '#909090', '#000000', '#ffffff'];
    const flat = illustrate(img, { id: 'f', width: 8, height: 8, maxColors: 4, palette });
    const used = (a: ReturnType<typeof illustrate>) => new Set(composite(a, 0).flat().map(i => a.palette[i]));
    expect(used(flat).size).toBe(1);
    const mixed = illustrate(img, { id: 'd', width: 8, height: 8, maxColors: 4, palette, dither: 1 });
    expect([...used(mixed)].sort()).toEqual(['#707070', '#909090']);
    // Too far apart to mix (reach): stays one color.
    const far = illustrate(img, { id: 'n', width: 8, height: 8, maxColors: 4, palette: ['#000000', '#ffffff'], dither: 1 });
    expect(used(far).size).toBe(1);
    // ditherPick: exactly on a palette color never dithers.
    expect(ditherPick({ r: 0x70, g: 0x70, b: 0x70 }, [{ r: 0x70, g: 0x70, b: 0x70 }, { r: 0x90, g: 0x90, b: 0x90 }], 3, 1, 1)).toBe(0);
  });

  it('illustrate keeps a thin bright accent and quantizes straight onto a palette by hue', () => {
    // 40x40 dark stone with a 1 px glowing orange line every 4 columns (a cell of 4 px sees 1/4 orange)
    // and a night-blue band at the bottom.
    const w = 40, img = { width: w, height: w, data: new Uint8Array(w * w * 4) };
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const line = x % 4 === 0 && y < 30;
      img.data.set(y >= 30 ? [30, 58, 110, 255] : line ? [255, 138, 61, 255] : [42, 42, 46, 255], (y * w + x) * 4);
    }
    const plain = illustrate(img, { id: 'p', width: 10, height: 10, maxColors: 4, sample: 'mode' });
    const fp = composite(plain, 0);
    expect(plain.palette[fp[2][2]]).not.toBe('#ff8a3d');
    const lit = illustrate(img, { id: 'a', width: 10, height: 10, maxColors: 4, sample: 'mode', accent: 0.2 });
    expect(lit.palette[composite(lit, 0)[2][2]]).toBe('#ff8a3d');
    // Straight onto a palette: the night blue goes to the purple-grey, not to the dark green
    // (redmean picks the green), and only colors of the palette are used.
    const palette = ['#2c2a33', '#3b3643', '#345a52', '#ff8a3d'];
    const q = illustrate(img, { id: 'q', width: 10, height: 10, maxColors: 3, sample: 'mode', accent: 0.2, palette });
    const fq = composite(q, 0);
    expect(q.palette[fq[9][5]]).toBe('#3b3643');
    expect(Object.values(q.palette).every(h => palette.includes(String(h)))).toBe(true);
    expect(Object.keys(q.palette).length).toBeLessThanOrEqual(3);
  });

  it('the crop ignores specks far from the figure, unless asked to keep them', () => {
    // 64x64: a 44px red square and a 4x4 blue crumb in the bottom-left corner (under 1% of the square).
    const w = 64, img = { width: w, height: w, data: new Uint8Array(w * w * 4) };
    for (let i = 0; i < w * w; i++) img.data.set([0, 255, 0, 255], i * 4);
    for (let y = 10; y < 54; y++) for (let x = 10; x < 54; x++) img.data.set([200, 30, 30, 255], (y * w + x) * 4);
    for (let y = 60; y < 64; y++) for (let x = 0; x < 4; x++) img.data.set([30, 30, 200, 255], (y * w + x) * 4);
    const tight = cropToContent(img);
    expect(tight.box.w).toBeLessThan(52);
    const loose = cropToContent(img, 0.04, undefined, contentMask(img, undefined, 0));
    expect(loose.box.w).toBeGreaterThan(56);
    // The crumb does not survive into the pixels either.
    const a = composite(pixelize(img, { id: 's', size: 16, maxColors: 4, crop: false }), 0);
    expect(a[15][0]).toBe(0);
    const kept = composite(pixelize(img, { id: 'k', size: 16, maxColors: 4, crop: false, speckFraction: 0 }), 0);
    expect(kept[15][0]).not.toBe(0);
  });

  it('generate builds the technical prompt and downloads the first image, with an injected fetch', async () => {
    const calls: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.startsWith('https://fal.run/')) {
        const body = JSON.parse(String(init?.body));
        expect(body.prompt).toContain('LIME GREEN');
        expect(body.prompt).toContain('a monk');
        expect(init?.headers).toMatchObject({ Authorization: 'Key k' });
        expect(body.output_format).toBe('png');
        return new Response(JSON.stringify({ images: [{ url: 'https://img.test/1.png' }] }), { status: 200 });
      }
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await generateImage({ prompt: 'a monk' }, 'k', fake);
    expect(out.model).toBe('fal-ai/flux/schnell');
    expect(out.bytes.length).toBe(7);
    expect(calls).toEqual(['https://fal.run/fal-ai/flux/schnell', 'https://img.test/1.png']);
  });

  it('pngDataUri turns a local PNG or JPEG into a data URI for image-to-image and refuses anything else', () => {
    const uri = pngDataUri(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]));
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(uri.split(',')[1], 'base64')[4]).toBe(9);
    expect(pngDataUri(new Uint8Array([0xff, 0xd8, 0xff, 0])).startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(() => pngDataUri(new Uint8Array([0x47, 0x49, 0x46, 0]))).toThrow(/PNG/);
  });

  it('loadFalKey reads the env file without printing it', () => {
    const envFile = join(dir, '.env');
    writeFileSync(envFile, 'GEMINI_API_KEY=\nFAL_AI_KEY=abc:def\n');
    const prev = process.env.FAL_AI_KEY;
    delete process.env.FAL_AI_KEY;
    expect(loadFalKey(envFile)).toBe('abc:def');
    expect(() => loadFalKey(join(dir, 'nope'))).toThrow(/FAL_AI_KEY/);
    if (prev !== undefined) process.env.FAL_AI_KEY = prev;
  });
});

describe('render', () => {
  it('hex helpers cover short, long and alpha forms', () => {
    expect(hexToRgba('#f00')).toEqual([255, 0, 0, 255]);
    expect(hexToRgba('#00ff0080')).toEqual([0, 255, 0, 128]);
    expect(rgbaToHex([0, 255, 0, 128])).toBe('#00ff0080');
    expect(rgbaToHex([1, 2, 3, 255])).toBe('#010203');
  });

  it('scales frames by integer factors', () => {
    const a = createAsset({ id: 'x', width: 2, palette: ['#ffffff'] });
    a.layers![0].frames[0][0][0] = 1;
    const img = renderFrame(a, a.layers![0].frames[0], 3);
    expect(img.width).toBe(6);
    expect(getPixel(img, 2, 2)).toEqual([255, 255, 255, 255]);
    expect(getPixel(img, 3, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('palettes', () => {
  it('draw, fx and palette refuse a color that is not one, and leave the asset as it was', async () => {
    const path = join(dir, 'bad.pss.json');
    await runCommand('new', { path, width: 6, palette: ['#a0522d'] });
    const before = readFileSync(path, 'utf8');
    for (const c of ['no-es-color', '#zzz']) {
      await expect(runCommand('draw', { path, frame: 0, ops: [{ op: 'rect', x: 1, y: 1, w: 3, h: 3, color: c }] }))
        .rejects.toThrow(`ops.0.color: "${c}" is not a color`);
    }
    await expect(runCommand('draw', { path, frame: 0, ops: [{ op: 'replace', from: 1, to: 'pardo' }] })).rejects.toThrow(/is not a color/);
    await expect(runCommand('fx', { path, frame: 0, shape: 'burst', intensity: 0.5, color: 'verde' })).rejects.toThrow(/"verde" is not a color/);
    await expect(runCommand('palette', { path, add: ['nope'] })).rejects.toThrow(/"nope" is not a color/);
    await expect(runCommand('palette', { path, set: { 1: '#gg0000' } })).rejects.toThrow(/is not a color/);
    await expect(runCommand('palette', { path, map: { nope: '#ffffff' } })).rejects.toThrow(/"nope" is not a color/);
    await expect(runCommand('new', { path: join(dir, 'n.pss.json'), width: 2, palette: ['#zzz'] })).rejects.toThrow(/is not a color/);
    expect(readFileSync(path, 'utf8')).toBe(before);
    await runCommand('draw', { path, frame: 0, ops: [{ op: 'rect', x: 1, y: 1, w: 3, h: 3, color: '#a0522d' }, { op: 'pixel', x: 0, y: 0, color: 'b0b0b0' }] });
    expect(loadAsset(path).palette).toEqual({ 1: '#a0522d', 2: '#b0b0b0' });
  });

  it('batch catches a color that is not one before writing anything', async () => {
    const path = join(dir, 'bb.pss.json');
    await runCommand('new', { path, width: 4, palette: ['#a0522d'] });
    const before = readFileSync(path, 'utf8');
    await expect(runCommand('batch', { steps: [
      { command: 'draw', path, frame: 0, ops: [{ op: 'pixel', x: 0, y: 0, color: '#123456' }] },
      { command: 'draw', path, frame: 0, ops: [{ op: 'pixel', x: 1, y: 0, color: 'rojo' }] },
    ] })).rejects.toThrow(/step 2 draw: ops\.0\.color: "rojo" is not a color/);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('fits colors to the nearest of a target palette, honoring forced maps and alpha', () => {
    const a = createAsset({ id: 'x', width: 2, palette: ['#ff0000', '#00ff0080', '#123456'] });
    const table = fitPalette(a, ['#ee0000', '#00cc00', '#ffffff'], { '#123456': '#ffffff' });
    expect(a.palette).toEqual({ 1: '#ee0000', 2: '#00cc0080', 3: '#ffffff' });
    expect(table.find(t => t.index === 3)!.forced).toBe(true);
    expect(table.find(t => t.index === 1)!.distance).toBeGreaterThan(0);
  });

  it('palette map recolors by value and palette_show renders swatches', async () => {
    const path = join(dir, 'p.pss.json');
    await runCommand('new', { path, width: 2, palette: ['#ff0000', '#ff0000', '#00ff00'] });
    await runCommand('palette', { path, map: { '#ff0000': '#0000ff' } });
    expect(loadAsset(path).palette).toEqual({ 1: '#0000ff', 2: '#0000ff', 3: '#00ff00' });
    const shown = await runCommand('palette_show', { path, cell: 8 });
    expect(shown.png!.length).toBeGreaterThan(50);
    const target = join(dir, 't.pss.json');
    await runCommand('new', { path: target, width: 1, palette: ['#000080', '#008000'] });
    const fit = (await runCommand('palette_fit', { path, target })).data as { moved: number; asset: { palette: Record<number, string> } };
    expect(fit.moved).toBe(3);
    expect(fit.asset.palette).toEqual({ 1: '#000080', 2: '#000080', 3: '#008000' });
  });
});

describe('png_fit', () => {
  it('recolors every opaque pixel of a PNG to the target palette, keeping alpha and layout', async () => {
    const w = 4, img = { width: w, height: 1, data: new Uint8Array(w * 4) };
    img.data.set([250, 10, 10, 255], 0);
    img.data.set([10, 250, 10, 255], 4);
    img.data.set([10, 10, 250, 128], 8);
    img.data.set([0, 0, 0, 0], 12);
    const png = join(dir, 't.png');
    writePng(png, img);
    const out = join(dir, 't2.png');
    const r = (await runCommand('png_fit', { png, out, colors: ['#ff0000', '#0000ff'], map: { '#0afa0a': '#0000ff' } })).data as { colors: number; moved: number };
    expect(r.colors).toBe(3);
    expect(r.moved).toBe(3);
    const back = readPng(out);
    expect(getPixel(back, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(back, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(getPixel(back, 2, 0)).toEqual([0, 0, 255, 128]);
    expect(getPixel(back, 3, 0)).toEqual([0, 0, 0, 0]);
    // With regions, pixels outside are left alone.
    writePng(png, img);
    await runCommand('png_fit', { png, out, colors: ['#0000ff'], regions: [{ x: 0, y: 0, w: 1, h: 1 }] });
    const part = readPng(out);
    expect(getPixel(part, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(getPixel(part, 1, 0)).toEqual([10, 250, 10, 255]);
  });
});

describe('png_knockout', () => {
  it('removes the background color connected to the region edges but keeps islands', () => {
    // 6x6 green with a 2x2 red block in the middle that has one green pixel inside its ring.
    const w = 6, img = { width: w, height: w, data: new Uint8Array(w * w * 4) };
    for (let i = 0; i < w * w; i++) img.data.set([0, 255, 0, 255], i * 4);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) img.data.set([255, 0, 0, 255], (y * w + x) * 4);
    img.data.set([0, 255, 0, 255], (2 * w + 2) * 4); // green island inside the red
    const removed = knockOutColor(img, '#00ff00');
    expect(removed).toBe(20);
    expect(getPixel(img, 0, 0)[3]).toBe(0);
    expect(getPixel(img, 2, 2)).toEqual([0, 255, 0, 255]);
    expect(getPixel(img, 1, 1)).toEqual([255, 0, 0, 255]);
    // A region that does not touch the outer green leaves it alone.
    const again = { width: w, height: w, data: new Uint8Array(w * w * 4) };
    for (let i = 0; i < w * w; i++) again.data.set([0, 255, 0, 255], i * 4);
    expect(knockOutColor(again, '#00ff00', [{ x: 2, y: 2, w: 2, h: 2 }])).toBe(4);
    expect(getPixel(again, 0, 0)[3]).toBe(255);
    // Empty air on the region border still lets the flood reach the color inside.
    const air = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) };
    air.data.set([0, 255, 0, 255], (1 * 4 + 1) * 4);
    air.data.set([255, 0, 0, 255], (2 * 4 + 2) * 4);
    expect(knockOutColor(air, '#00ff00')).toBe(1);
    expect(getPixel(air, 2, 2)).toEqual([255, 0, 0, 255]);
  });
});

const LOBO = `# a tiny two-frame drawing
id: bicho
name: Bicho de prueba
category: character
description: first line
description: second line
anim: idle durations=300,200 loop=true
anim: attack fps=8 loop=false

k = #15120f tinta
m = #8d8a86
e = #ffd27a ojo

== idle 0, attack 1
.kk.
kmek
kmmk
.k.k

== idle
....
.kk.
kmek
kmmk

== attack 0
kk..
mek.
mmk.
k.k.
`;

describe('ascii format', () => {
  it('builds frames, palette in legend order, names and animations', () => {
    const { asset } = fromAscii(LOBO);
    expect(asset.id).toBe('bicho');
    expect(asset.category).toBe('character');
    expect(asset.description).toBe('first line\nsecond line');
    expect(dims(asset)).toEqual({ width: 4, height: 4 });
    expect(asset.palette).toEqual({ 1: '#15120f', 2: '#8d8a86', 3: '#ffd27a' });
    expect(asset.colorNames[1]).toBe('tinta');
    expect(asset.colorNames[2]).toBe('color 2');
    expect(frameCount(asset)).toBe(3);
    expect(asset.layers![0].frames[0][1]).toEqual([1, 2, 3, 1]);
    expect(asset.animations).toEqual([
      { name: 'idle', label: 'IDLE', frameIndices: [0, 1], durations: [300, 200], loop: true },
      { name: 'attack', label: 'ATTACK', frameIndices: [2, 0], fps: 8, loop: false },
    ]);
  });

  it('round-trips exactly: text → asset → text → asset', () => {
    const a = fromAscii(LOBO).asset;
    const text = toAscii(a).text;
    const b = fromAscii(text).asset;
    expect(b).toEqual(a);
    expect(toAscii(b).text).toBe(text);
  });

  it('round-trips an asset built by commands, non-square and with a frame outside any animation', async () => {
    const path = join(dir, 'r.pss.json');
    await runCommand('new', { path, width: 6, height: 3, palette: ['#ff0000', '#00ff0080'], frames: 2 });
    await runCommand('draw', { path, frame: 0, ops: [{ op: 'line', x0: 0, y0: 0, x1: 5, y1: 2, color: 1 }] });
    await runCommand('draw', { path, frame: 1, ops: [{ op: 'rect', x: 1, y: 0, w: 3, h: 3, color: 2, fill: true }] });
    await runCommand('anim', { path, name: 'pulse', frames: [1], fps: 3 });
    const txt = join(dir, 'r.txt');
    await runCommand('to_ascii', { path, out: txt });
    expect(readFileSync(txt, 'utf8')).toContain('size: 6x3');
    const back = join(dir, 'back.pss.json');
    await runCommand('from_ascii', { txt, out: back });
    expect(loadAsset(back)).toEqual(loadAsset(path));
  });

  it('infers the size from the drawing and the id from the file name', async () => {
    const txt = join(dir, 'piedra.txt');
    writeFileSync(txt, 'k = #000\n==\nkkk\nk.k\n');
    const res = await runCommand('from_ascii', { txt, out: join(dir, 'piedra.pss.json') });
    expect(res.data).toMatchObject({ id: 'piedra', width: 3, height: 2, frames: 1 });
    expect(res.png!.length).toBeGreaterThan(50);
  });

  it('into appends the drawing and its animations to an existing asset, shifted', async () => {
    const base = join(dir, 'base.pss.json');
    await runCommand('new', { path: base, width: 2, height: 2, palette: ['#000000'], frames: 2 });
    await runCommand('anim', { path: base, name: 'idle', frames: [0, 1], fps: 3 });
    const txt = join(dir, 'pose.txt');
    writeFileSync(txt, 'anim: sit fps=1\nk = #000000\nr = #ff0000\n== sit 0\nk.\n.r\n== sit 1\nr.\n.k\n');
    const out = join(dir, 'con_pose.pss.json');
    await runCommand('from_ascii', { txt, out, into: base });
    const a = loadAsset(out);
    expect(a.layers![0].frames.length).toBe(4);
    expect(a.animations.find(x => x.name === 'idle')!.frameIndices).toEqual([0, 1]);
    expect(a.animations.find(x => x.name === 'sit')).toMatchObject({ frameIndices: [2, 3], fps: 1 });
    expect(Object.values(a.palette).filter(h => h.toLowerCase().startsWith('#ff0000')).length).toBe(1);
    const sit1 = a.layers![0].frames[3];
    expect(a.palette[sit1[0][0]!].toLowerCase()).toMatch(/^#ff0000/);
    expect(sit1[0][1]).toBe(0);
    await expect(runCommand('from_ascii', { text: 'k = #000\n==\nkkk\n', out, into: base })).rejects.toThrow(/cannot append 3x1/);
  });

  it('fails clearly on rows of different length, unknown glyphs and size mismatches', () => {
    expect(() => fromAscii('k = #000\n==\nkk\nk\n')).toThrow(/:4 \(frame 0, row 1\): is 1 wide, expected 2/);
    expect(() => fromAscii('k = #000\n==\nkz\n')).toThrow(/glyph "z" is not in the legend/);
    expect(() => fromAscii('size: 3x2\nk = #000\n==\nkk\nkk\n')).toThrow(/is 2 wide, expected 3/);
    expect(() => fromAscii('size: 2x3\nk = #000\n==\nkk\nkk\n')).toThrow(/has 2 rows, expected 3/);
    expect(() => fromAscii('k = #000\n')).toThrow(/no frames/);
    expect(() => fromAscii('k = #000\nk = #fff\n==\nk\n')).toThrow(/defined twice/);
    expect(() => fromAscii('anim: idle fps=0\nk = #000\n== idle 0\nk\n')).toThrow(/fps/);
    expect(() => fromAscii('k = #000\n== idle 1\nk\n')).toThrow(/missing position 0/);
    expect(() => fromAscii('anim: idle durations=100,100\nk = #000\n== idle\nk\n')).toThrow(/1 frames but 2 durations/);
  });

  it('fit names the glyph and the hex that are off the palette', async () => {
    const pal = join(dir, 'pal.pss.json');
    await runCommand('new', { path: pal, width: 1, palette: ['#000000', '#ffffff'] });
    const txt = join(dir, 'x.txt');
    writeFileSync(txt, 'k = #000000\nr = #ff0000 rojo\n==\nkr\n');
    await expect(runCommand('from_ascii', { txt, out: join(dir, 'x.pss.json'), fit: pal })).rejects.toThrow(/"r" = #ff0000/);
    writeFileSync(txt, 'fit: pal.pss.json\nk = #000000\n==\nk.\n');
    await runCommand('from_ascii', { txt, out: join(dir, 'x.pss.json') });
    expect(existsSync(join(dir, 'x.pss.json'))).toBe(true);
  });

  it('fit and lint take a palette color at any opacity (#rrggbbaa), not a different color', async () => {
    const pal = join(dir, 'pal.pss.json');
    await runCommand('new', { path: pal, width: 1, palette: ['#cfd6d8', '#9fb0b3'] });
    const txt = join(dir, 'niebla.txt');
    writeFileSync(txt, 'n = #cfd6d860 niebla\ns = #9fb0b330\n==\nns\n');
    await runCommand('from_ascii', { txt, out: join(dir, 'niebla.pss.json'), fit: pal });
    const lint = await runCommand('lint', { paths: [join(dir, 'niebla.pss.json')], palette: pal });
    expect(JSON.stringify(lint.data)).not.toContain('off the palette');
    writeFileSync(txt, 'n = #cfd6d960\n==\nn\n');
    await expect(runCommand('from_ascii', { txt, out: join(dir, 'x.pss.json'), fit: pal })).rejects.toThrow(/#cfd6d960/);
  });

  it('glyphs_from gives a color the glyph of its index in the reference palette', async () => {
    const pal = join(dir, 'pal.pss.json');
    await runCommand('new', { path: pal, width: 1, palette: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#aaaaaa'] });
    const path = join(dir, 'a.pss.json');
    await runCommand('new', { path, width: 2, palette: ['#aaaaaa', '#333333'] });
    await runCommand('draw', { path, frame: 0, ops: [{ op: 'pixel', x: 0, y: 0, color: 1 }, { op: 'pixel', x: 1, y: 1, color: 2 }] });
    const res = await runCommand('to_ascii', { path, glyphs_from: pal });
    expect(res.text).toContain('a = #aaaaaa');
    expect(res.text).toContain('3 = #333333');
    expect(res.text).toContain('a.\n.3');
  });
});

describe('variant', () => {
  const CARA = 'k = #15120f\np = #ef914f\n==\nkkkk\nkpkp\npppp\n';

  it('lays an overlay on a new layer and leaves the base file and layer untouched', async () => {
    const base = join(dir, 'cara.pss.json');
    writeFileSync(join(dir, 'cara.txt'), CARA);
    await runCommand('from_ascii', { txt: join(dir, 'cara.txt'), out: base });
    const before = readFileSync(base, 'utf8');
    const overlay = join(dir, 'cara_dura.txt');
    writeFileSync(overlay, 'k = #15120f\nr = #a83a29\n==\n....\n.k.k\n.rr.\n');
    const res = await runCommand('variant', { path: base, out: join(dir, 'cara_dura.pss.json'), overlay });
    expect(readFileSync(base, 'utf8')).toBe(before);
    expect(res.data).toMatchObject({ painted: 4, changed: 4 });
    const v = loadAsset(join(dir, 'cara_dura.pss.json'));
    expect(v.id).toBe('cara_dura');
    expect(v.layers!.map(l => l.name)).toEqual(['Base', 'variante']);
    expect(v.layers![0]).toEqual(loadAsset(base).layers![0]);
    const out = composite(v, 0).map(row => row.map(i => (i ? v.palette[i] : '.')));
    expect(out[1]).toEqual(['#15120f', '#15120f', '#15120f', '#15120f']);
    expect(out[2]).toEqual(['#ef914f', '#a83a29', '#a83a29', '#ef914f']);
  });

  it('counts painted pixels that equal the base as not changed, and takes ops too', async () => {
    const base = join(dir, 'b.pss.json');
    writeFileSync(join(dir, 'b.txt'), CARA);
    await runCommand('from_ascii', { txt: join(dir, 'b.txt'), out: base });
    const res = await runCommand('variant', {
      path: base, out: join(dir, 'b_calida.pss.json'), overlay_text: 'k = #15120f\n==\nk...\n....\n....\n',
      ops: [{ op: 'pixel', x: 3, y: 2, color: '#c9a34c' }],
    });
    expect(res.data).toMatchObject({ painted: 2, changed: 1 });
  });

  it('refuses to overwrite the base, a wrong size and colors off the fit palette', async () => {
    const base = join(dir, 'c.pss.json');
    writeFileSync(join(dir, 'c.txt'), CARA);
    await runCommand('from_ascii', { txt: join(dir, 'c.txt'), out: base });
    await expect(runCommand('variant', { path: base, out: base, ops: [{ op: 'clear' }] })).rejects.toThrow(/different file/);
    await expect(runCommand('variant', { path: base, out: join(dir, 'x.pss.json'), overlay_text: 'k = #000\n==\nk\n' })).rejects.toThrow(/overlay is 1x1/);
    await expect(runCommand('variant', {
      path: base, out: join(dir, 'x.pss.json'), overlay_text: 'z = #00ff00\n==\nz...\n....\n....\n', fit: base,
    })).rejects.toThrow(/"z" = #00ff00/);
  });
});

describe('stamp', () => {
  // A borrowed body: one head on row 1 (idle_down and the first walk frame) and
  // one on row 0 (the second walk frame, the bob of the step).
  async function body(): Promise<string> {
    const path = join(dir, 'cuerpo.pss.json');
    await runCommand('new', { path, width: 4, frames: 3, palette: ['#15120f'] });
    for (const [frame, y] of [[0, 1], [1, 1], [2, 0]] as const) {
      await runCommand('draw', { path, frame, ops: [{ op: 'pixel', x: 0, y, color: 1 }] });
    }
    await runCommand('anim', { path, name: 'idle_down', frames: [0] });
    await runCommand('anim', { path, name: 'walk_down', frames: [1, 2] });
    return path;
  }

  const TOCADO = 'r = #a83a29\n== down 0\n..r.\n.r..\n....\n....\n== up 0\n.r..\n....\n....\n....\n';

  it('stamps every animation of the view, shifted with the head, and clips what leaves the canvas', async () => {
    const path = await body();
    const res = await runCommand('stamp', { path, text: TOCADO });
    // "up" is in the drawing but the body has no idle_up: nothing is stamped for it.
    expect(res.data).toMatchObject({ skipped: ['up'], frames: 3, pixels: 5 });
    expect((res.data as { views: unknown[] }).views[0]).toEqual({
      view: 'down', anims: ['idle_down', 'walk_down'], frames: 3, pixels: 5, shifts: [-1, 0, 0],
    });
    const a = loadAsset(path);
    const hex = (f: number, x: number, y: number) => (a.layers![0].frames[f][y][x] ? a.palette[a.layers![0].frames[f][y][x]] : '.');
    expect([hex(0, 2, 0), hex(0, 1, 1)]).toEqual(['#a83a29', '#a83a29']);
    // The head of frame 2 sits one row higher, so the stamp follows it up and
    // the pixel that would land above the canvas is dropped.
    expect([hex(2, 1, 0), hex(2, 2, 0), hex(2, 1, 1)]).toEqual(['#a83a29', '.', '.']);
    // Frames and animations are untouched: only pixels change.
    expect(frameCount(a)).toBe(3);
    expect(a.animations.map(x => x.name)).toEqual(['idle_down', 'walk_down']);
  });

  it('anims and anchor are patterns, and align=none never shifts', async () => {
    const path = await body();
    const res = await runCommand('stamp', { path, text: TOCADO, anims: 'walk_{view}', anchor: 'walk_{view}' });
    expect((res.data as { views: { anims: string[]; frames: number }[] }).views[0])
      .toMatchObject({ anims: ['walk_down'], frames: 2, shifts: [-1, 0] });
    expect(loadAsset(path).layers![0].frames[0][1][1]).toBe(0);

    const flat = await body();
    const res2 = await runCommand('stamp', { path: flat, text: TOCADO, align: 'none' });
    expect((res2.data as { views: { shifts: number[] }[] }).views[0].shifts).toEqual([0, 0, 0]);
    expect(loadAsset(flat).layers![0].frames[2][1][1]).toBeGreaterThan(0);
  });

  it('refuses another size, a drawing with no view and colors off the fit palette', async () => {
    const path = await body();
    await expect(runCommand('stamp', { path, text: 'r = #a83a29\n== down 0\nr\n' }))
      .rejects.toThrow(/the drawing is 1x1, the asset is 4x4/);
    await expect(runCommand('stamp', { path, text: 'r = #a83a29\n==\nr...\n....\n....\n....\n' }))
      .rejects.toThrow(/no "== <view>" animation/);
    await expect(runCommand('stamp', { path, text: 'z = #00ff00\n== down 0\nz...\n....\n....\n....\n', fit: path }))
      .rejects.toThrow(/"z" = #00ff00/);
  });
});

describe('face points', () => {
  // A head from a pack: hair, the shade of the forehead, skin and ink eyes;
  // facing the camera on frame 0, in profile on frame 1, blank on frame 2.
  const CARA = [
    'anim: idle_down fps=1', 'anim: walk_left fps=1',
    'h = #3b3643', 'f = #b8613a', 'p = #ef914f', 'k = #15120f',
    '== idle_down 0', '.hhhhh.', '.hhhhh.', '.fffff.', '.pkpkp.', '.ppppp.', '..ppp..',
    '== walk_left 0', '.hhhh..', '.hhhh..', '.ffff..', '.pkp...', '.ppp...', '..pp...',
    '==', '.......', '.......', '.......', '.......', '.......', '.......', '',
  ].join('\n');

  async function head(): Promise<string> {
    const path = join(dir, 'cara.pss.json');
    writeFileSync(join(dir, 'cara.txt'), CARA);
    await runCommand('from_ascii', { txt: join(dir, 'cara.txt'), out: path });
    return path;
  }

  const COLORS = { skin: ['#EF914F'], ink: ['#15120f'], hair: ['#3b3643'], forehead: ['#b8613a'] };

  it('finds the eyes, the hairline with its depth and the skin box, with the view of each frame', async () => {
    const res = await runCommand('face_points', { path: await head(), ...COLORS });
    const data = res.data as { width: number; height: number; frames: Record<string, unknown>[] };
    expect([data.width, data.height, data.frames.length]).toEqual([7, 6, 3]);
    expect(data.frames[0]).toEqual({
      frame: 0, view: 'down', anims: ['idle_down'],
      eyes: { row: 3, xs: [2, 4], pixels: [[2, 3], [4, 3]] },
      // Row 1 touches the forehead, row 0 has a row of hair in between.
      hairline: [[1, 0, 2], [2, 0, 2], [3, 0, 2], [4, 0, 2], [5, 0, 2], [1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 1, 1], [5, 1, 1]],
      skin: {
        box: [1, 3, 5, 5],
        pixels: [[1, 3], [3, 3], [5, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [3, 5], [4, 5]],
      },
    });
    // In profile there is one eye, and it is the view that says where it looks.
    expect(data.frames[1]).toMatchObject({ view: 'left', eyes: { row: 3, xs: [2] } });
    // A frame no animation claims has no view, and an empty one no face.
    expect(data.frames[2]).toMatchObject({ view: null, anims: [], eyes: null, hairline: [], skin: null });
    // The JSON is what a script reads; the table is asked for on purpose.
    expect(res.text).toBeUndefined();
    expect((await runCommand('face_points', { path: await head(), ...COLORS, table: true })).text).toContain('row 3 x 2,4');
  });

  it('each landmark needs its own colors, and anims picks which animations name a view', async () => {
    const path = await head();
    const bare = (await runCommand('face_points', { path, skin: COLORS.skin, ink: COLORS.ink })).data as { frames: { hairline: unknown[]; eyes: unknown }[] };
    expect(bare.frames[0].hairline).toEqual([]);
    expect(bare.frames[0].eyes).not.toBeNull();
    // A headband only asks for the hairline: no skin, no eyes and no box.
    const band = (await runCommand('face_points', { path, hair: COLORS.hair, forehead: COLORS.forehead })).data as { frames: { hairline: unknown[]; eyes: unknown; skin: unknown }[] };
    expect(band.frames[0].hairline.length).toBe(10);
    expect([band.frames[0].eyes, band.frames[0].skin]).toEqual([null, null]);
    const walk = (await runCommand('face_points', { path, ...COLORS, anims: 'walk_{view}' })).data as { frames: { view: string | null }[] };
    expect(walk.frames.map(f => f.view)).toEqual([null, 'left', null]);
  });
});

describe('contact and lint', () => {
  it('contact puts the reference next to each asset on a baseline, with a label', async () => {
    const ref = join(dir, 'ref.pss.json');
    await runCommand('new', { path: ref, width: 16, palette: ['#ff0000'] });
    await runCommand('draw', { path: ref, frame: 0, ops: [{ op: 'rect', x: 0, y: 0, w: 16, h: 16, color: 1, fill: true }] });
    const tall = join(dir, 'tall.pss.json');
    await runCommand('new', { path: tall, width: 16, height: 32, palette: ['#0000ff'] });
    await runCommand('draw', { path: tall, frame: 0, ops: [{ op: 'rect', x: 0, y: 0, w: 16, h: 32, color: 1, fill: true }] });
    const res = await runCommand('contact', { paths: [tall, ref], ref, scale: 1, grid: 16, background: '#000000', out: join(dir, 'c.png') });
    const img = readPng(join(dir, 'c.png'));
    expect(res.png!.length).toBeGreaterThan(50);
    // Both stand on the same baseline: the reference's bottom row and the tall one's share a y.
    const pad = 16;
    const baseline = pad + 32 - 1;
    expect(getPixel(img, pad + 2, baseline)).toEqual([255, 0, 0, 255]);
    expect(getPixel(img, pad + 16 + 16 + 2, baseline)).toEqual([0, 0, 255, 255]);
    expect(getPixel(img, pad + 2, baseline - 16)).not.toEqual([255, 0, 0, 255]); // above the reference: background, not red
    expect(getPixel(img, pad + 32 + 2, pad)).toEqual([0, 0, 255, 255]); // the tall one reaches the top
  });

  it('contact composites semi-transparent pixels over the background, or adds them with blend=add', async () => {
    const shadow = join(dir, 'shadow.pss.json');
    await runCommand('new', { path: shadow, width: 16, palette: ['#00000080'] });
    await runCommand('draw', { path: shadow, frame: 0, ops: [{ op: 'rect', x: 0, y: 0, w: 16, h: 16, color: 1, fill: true }] });
    await runCommand('contact', { paths: [shadow], scale: 1, grid: 0, background: '#c8c8c8', out: join(dir, 'over.png') });
    // Half-transparent black over light gray darkens it (100), not a flat copy of the color.
    const over = getPixel(readPng(join(dir, 'over.png')), 4 + 4, 4 + 4);
    expect(over[0]).toBeGreaterThan(95);
    expect(over[0]).toBeLessThan(105);
    expect(over[3]).toBe(255);
    const halo = join(dir, 'halo.pss.json');
    await runCommand('new', { path: halo, width: 16, palette: ['#ff800080'] });
    await runCommand('draw', { path: halo, frame: 0, ops: [{ op: 'rect', x: 0, y: 0, w: 16, h: 16, color: 1, fill: true }] });
    await runCommand('contact', { paths: [halo], scale: 1, grid: 0, background: '#202020', blend: 'add', out: join(dir, 'add.png') });
    const add = getPixel(readPng(join(dir, 'add.png')), 4 + 4, 4 + 4);
    expect(add[0]).toBe(0x20 + 128); // the light adds on top of the dark background
    expect(add[1]).toBe(0x20 + 64);
    expect(add[2]).toBe(0x20);
  });

  it('contact can show the fullest frame of each asset, for effects that grow from a dot', async () => {
    const txt = join(dir, 'chispa.txt');
    writeFileSync(txt, 'k = #ffffff\n== idle 0\n...\n.k.\n...\n== idle 1\n.k.\nkkk\n.k.\n== idle 2\n...\n...\n...\n');
    const spark = join(dir, 'chispa.pss.json');
    await runCommand('from_ascii', { txt, out: spark });
    expect(fullestFrame(loadAsset(spark))).toBe(1);
    await runCommand('contact', { paths: [spark], scale: 1, grid: 0, background: '#000000', frame: 'fullest', out: join(dir, 'full.png') });
    await runCommand('contact', { paths: [spark], scale: 1, grid: 0, background: '#000000', out: join(dir, 'first.png') });
    const pad = 4;
    // The arm of the cross (top middle) only exists in frame 1.
    expect(getPixel(readPng(join(dir, 'full.png')), pad + 1, pad)).toEqual([255, 255, 255, 255]);
    expect(getPixel(readPng(join(dir, 'first.png')), pad + 1, pad)).toEqual([0, 0, 0, 255]);
  });

  it('lint reports off-palette colors, sizes off the grid, lone pixels and seams, without touching the asset', () => {
    const a = createAsset({ id: 't', width: 8, height: 6, palette: ['#00ff00', '#ff00ff', '#000000'] });
    const f = a.layers![0].frames[0];
    for (const row of f) row.fill(1);
    f[2][3] = 2;               // a lone off-palette pixel
    for (let y = 0; y < 6; y++) f[y][7] = 3; // right edge unlike the left
    const before = JSON.stringify(a);
    const r = lintAsset(a, { palette: ['#00ff00', '#000000'], grid: 16, tile: true });
    expect(JSON.stringify(a)).toBe(before);
    expect(r.warnings.some(w => /#ff00ff is off the palette \(1 px\)/.test(w))).toBe(true);
    expect(r.warnings.some(w => /8x6 is not a multiple of 16/.test(w))).toBe(true);
    expect(r.warnings.some(w => /1 lone pixel \(x,y: 3,2\)/.test(w))).toBe(true);
    expect(r.warnings.some(w => /left\/right edges do not meet/.test(w))).toBe(true);
    expect(r.warnings.some(w => /top\/bottom/.test(w))).toBe(false);
  });

  it('lint asks a tile, not a sprite, for grid sides and no lone pixels; a sprite still answers for its colors (#271)', () => {
    // a 38 × 38 portrait: a head of skin with the light in its eye, one px of a color with no neighbour of its own
    const face = createAsset({ id: 'cara', width: 38, height: 38, category: 'character', palette: ['#f2c9a0', '#15120f', '#ffffff'] });
    const f = face.layers![0].frames[0];
    for (let y = 8; y < 30; y++) for (let x = 8; x < 30; x++) f[y][x] = 1;
    for (let y = 15; y < 18; y++) for (let x = 13; x < 16; x++) f[y][x] = 2;
    f[16][14] = 3;
    expect(lintAsset(face, { palette: ['#f2c9a0', '#15120f', '#ffffff'], grid: 16 }).warnings).toEqual([]);
    expect(lintAsset(face, { grid: 16, lone: true }).warnings).toEqual(['frame 0: 1 lone pixel (x,y: 14,16)']);
    expect(lintAsset(face, { palette: ['#f2c9a0', '#15120f'], grid: 16 }).warnings).toEqual(['color #ffffff is off the palette (1 px)']);
    // the same picture as terrain is a tile's business: its size and its speck
    const ground = { ...face, category: 'terrain' as const };
    expect(lintAsset(ground, { grid: 16 }).warnings).toEqual(['size 38x38 is not a multiple of 16', 'frame 0: 1 lone pixel (x,y: 14,16)']);
  });

  it('lint does not count lone pixels on a ground painted by map_export, but still on a plain tile (estudio#215)', () => {
    // a blade of grass on a meadow: one px of a color with no neighbour of its own
    const meadow = createAsset({ id: 'patio', width: 32, height: 16, category: 'terrain', palette: ['#4a7a3a', '#c8d86a'] });
    const f = meadow.layers![0].frames[0];
    for (const row of f) row.fill(1);
    f[5][9] = 2;
    expect(lintAsset(meadow, { grid: 16 }).warnings).toEqual(['frame 0: 1 lone pixel (x,y: 9,5)']);
    const painted = { ...meadow, generatedBy: { by: 'map_export', args: { recipe: 'patio.json', layer: 'ground' } } };
    expect(lintAsset(painted, { grid: 16 }).warnings).toEqual([]);
    expect(lintAsset(painted, { grid: 16, lone: true }).warnings).toEqual(['frame 0: 1 lone pixel (x,y: 9,5)']);
    // the rest of a tile's rules still hold on a painted map
    const odd = { ...painted, width: 30 };
    odd.layers = [{ ...meadow.layers![0], frames: [f.map(row => row.slice(0, 30))] }];
    expect(lintAsset(odd, { grid: 16 }).warnings).toEqual(['size 30x16 is not a multiple of 16']);
  });

  it('lint with pieces reports a crown split off the body, with the animation frame name', async () => {
    const path = join(dir, 'pj.pss.json');
    await runCommand('new', { path, width: 16, palette: ['#3b3643', '#ef914f'], frames: 2 });
    for (const frame of [0, 1]) {
      await runCommand('draw', { path, frame, ops: [{ op: 'rect', x: 4, y: 6, w: 8, h: 10, color: 2, fill: true }] });
    }
    // Frame 1: the crown one row above the head, a transparent row between.
    await runCommand('draw', { path, frame: 1, ops: [{ op: 'rect', x: 5, y: 2, w: 6, h: 3, color: 1, fill: true }] });
    await runCommand('anim', { path, name: 'idle', frames: [0, 1], fps: 3 });
    const a = loadAsset(path);
    expect(detachedPieces(composite(a, 0))).toEqual([]);
    expect(detachedPieces(composite(a, 1))).toEqual([{ size: 18, x: 5, y: 2 }]);
    // Small specks are the lone-pixel rule's business, not this one.
    expect(detachedPieces(composite(a, 1), 19)).toEqual([]);
    expect(lintAsset(a, {}).warnings.join()).not.toMatch(/detached/);
    const res = await runCommand('lint', { paths: [path], pieces_ids: ['pj'] });
    expect(res.text).toMatch(/frame 1 \(idle 1\): 1 detached piece \(18 px at 5,2\)/);
    // Touching on a diagonal is still one piece.
    await runCommand('draw', { path, frame: 1, ops: [{ op: 'pixel', x: 11, y: 5, color: 1 }] });
    expect(detachedPieces(composite(loadAsset(path), 1))).toEqual([]);
  });

  it('a clean tile lints clean, and lint runs as a command over several paths', async () => {
    const path = join(dir, 'tile.pss.json');
    await runCommand('new', { path, width: 16, palette: ['#336699'] });
    await runCommand('draw', { path, frame: 0, ops: [{ op: 'rect', x: 0, y: 0, w: 16, h: 16, color: 1, fill: true }] });
    const holed = join(dir, 'holed.pss.json');
    await runCommand('new', { path: holed, width: 16, palette: ['#336699'] });
    await runCommand('draw', { path: holed, frame: 0, ops: [{ op: 'rect', x: 0, y: 0, w: 15, h: 16, color: 1, fill: true }] });
    const res = await runCommand('lint', { paths: [path, holed], colors: ['#336699'], grid: 16, tiles: ['tile', 'holed'] });
    const data = res.data as { clean: number; reports: { warnings: string[] }[] };
    expect(data.clean).toBe(1);
    expect(data.reports[1].warnings.join()).toMatch(/transparent px on the left\/right edges/);
    expect(res.text).toContain('1/2 clean');
    expect(contactSheetMany([{ asset: loadAsset(path) }]).width).toBeGreaterThan(16);
  });
});

describe('commands', () => {
  it('every command has a unique name and a description', () => {
    const names = commands.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of commands) expect(c.description.length).toBeGreaterThan(10);
  });

  it('validates arguments and names the field', async () => {
    await expect(runCommand('new', { path: join(dir, 'x.pss.json') })).rejects.toThrow(/width/);
    await expect(runCommand('nope', {})).rejects.toThrow(/unknown command/);
  });

  it('chains new → fx_anim → export_sheet → import_sheet from the registry', async () => {
    const path = join(dir, 'golpe.pss.json');
    await runCommand('new', { path, width: 16, palette: ['#ffd27a', '#ff8a3d', '#a83a29'] });
    await runCommand('fx_anim', { path, name: 'technique', shape: 'burst', frames: 4, color: 2, light: 1, dark: 3 });
    const out = join(dir, 'golpe.png');
    const exported = (await runCommand('export_sheet', { path, out })).data as { frames: number; tags: string[] };
    expect(exported.frames).toBe(4);
    expect(exported.tags).toEqual(['technique 0-3']);
    expect(existsSync(join(dir, 'golpe.json'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(dir, 'golpe.json'), 'utf8'));
    expect(meta.meta.image).toBe('golpe.png');
    expect(readPng(out).width).toBe(64);
    const back = (await runCommand('import_sheet', { png: out, out: join(dir, 'back.pss.json'), frame_width: 16, frame_height: 16 })).data as { grid: { columns: number } };
    expect(back.grid.columns).toBe(4);
    const render = await runCommand('render', { path, scale: 2 });
    expect(render.png!.length).toBeGreaterThan(100);
  });

  it('the real binary starts under tsx (catches "@/" alias imports that only vitest resolves)', () => {
    const out = execFileSync(join(process.cwd(), 'bin/pgs'), ['help'], { encoding: 'utf8' });
    expect(out).toContain('animate');
    expect(out).toContain('pgs <command>');
    for (const name of ['from_ascii', 'to_ascii', 'contact', 'lint', 'variant', 'batch']) expect(out).toContain(name);
  });

  it('…and from another directory, which is where a game calls it from', () => {
    // tsx resolves the "@/" alias of tsconfig against the directory it was
    // started in, so an alias import anywhere in the graph works here and dies
    // in the game repo. `cwd: dir` is the whole point of this test.
    const out = execFileSync(join(process.cwd(), 'bin/pgs'), ['help'], { encoding: 'utf8', cwd: dir });
    expect(out).toContain('animate');
  });

  // The rename to Pixel Gaming Studio left `bin/pss` and `bin/pss-mcp` behind as
  // aliases, because a second repo on hold calls the binary by that name. Both
  // are run from another directory on purpose: the bug this family of tests
  // exists for only showed up outside the repo.
  it('the old name still works, from another directory, with the same output', () => {
    const fresh = { ...process.env, TMPDIR: dir };   // no stamp yet: the notice fires
    const aliased = spawnSync(join(process.cwd(), 'bin/pss'), ['help'], { encoding: 'utf8', cwd: dir, env: fresh });
    expect(aliased.status).toBe(0);
    expect(aliased.stderr).toContain('`pgs`');
    // The notice goes to stderr only: stdout is byte for byte what `pgs` answers.
    const direct = execFileSync(join(process.cwd(), 'bin/pgs'), ['help'], { encoding: 'utf8', cwd: dir });
    expect(aliased.stdout).toBe(direct);
    // And it says it once: the stamp is there now, so a second call is silent.
    const again = spawnSync(join(process.cwd(), 'bin/pss'), ['help'], { encoding: 'utf8', cwd: dir, env: fresh });
    expect(again.status).toBe(0);
    expect(again.stderr).toBe('');
    expect(again.stdout).toBe(direct);

    // A temp directory that does not exist is not a reason to fail, nor to leak
    // a shell error into stderr next to the notice (it did, the first time).
    const nowhere = { ...process.env, TMPDIR: join(dir, 'no', 'existe') };
    const stampless = spawnSync(join(process.cwd(), 'bin/pss'), ['help'], { encoding: 'utf8', cwd: dir, env: nowhere });
    expect(stampless.status).toBe(0);
    expect(stampless.stderr.trim().split('\n')).toHaveLength(1);
    expect(stampless.stdout).toBe(direct);
  }, 30000);   // four real tsx starts, and the whole suite is running beside it

  it('the CLI parses key=value and JSON forms', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = join(dir, 'c.pss.json');
    expect(await cliMain(['new', `path=${path}`, 'width=4', 'palette=["#fff"]'])).toBe(0);
    expect(await cliMain(['draw', JSON.stringify({ path, frame: 0, ops: [{ op: 'pixel', x: 1, y: 1, color: 1 }] })])).toBe(0);
    expect(loadAsset(path).layers![0].frames[0][1][1]).toBe(1);
    expect(await cliMain(['draw', `path=${path}`])).toBe(1);
  });
});

describe('mcp answers (brief.ts)', () => {
  it('a command that writes answers one line and no image unless preview', async () => {
    const { mcpContent, briefLine } = await import('./brief');
    const path = join(dir, 'a.pss.json');
    const made = await runCommand('new', { path, id: 'farol', width: 16, height: 32, palette: ['#000000', '#ffffff'] });
    const drawn = { ...made, png: Buffer.from([1, 2, 3]) };
    const quiet = mcpContent('from_ascii', drawn);
    expect(quiet.length).toBe(1);
    const text = (quiet[0] as { text: string }).text;
    expect(text.split('\n').length).toBe(1);
    expect(text.startsWith('ok from_ascii: farol 16x32 · 1 cuadros')).toBe(true);
    expect(text).not.toContain('#ffffff');
    expect(mcpContent('from_ascii', drawn, true).some(c => c.type === 'image')).toBe(true);
    expect(briefLine('png_fit', { data: { out: '/x.png', colors: 9, moved: 3, table: [1, 2, 3] } }))
      .toBe('ok png_fit: out=/x.png · colors=9 · moved=3');
  });

  it('a command that looks keeps its text and image, and inspect gives the detail', async () => {
    const { mcpContent } = await import('./brief');
    const path = join(dir, 'b.pss.json');
    await runCommand('new', { path, id: 'b', width: 8, height: 8, palette: ['#000000'] });
    const shown = mcpContent('render', await runCommand('render', { path }));
    expect(shown.some(c => c.type === 'image')).toBe(true);
    const detail = await runCommand('inspect', { path });
    expect((detail.data as { palette: unknown }).palette).toBeDefined();
  });

  it('looking at a map is looking: map_compare answers the pixels that differ and the picture', async () => {
    const { mcpContent, LOOKING } = await import('./brief');
    expect(LOOKING.has('map_render')).toBe(true);
    expect(LOOKING.has('map_lint')).toBe(true);
    const a = join(dir, 'ref.png'), b = join(dir, 'mine.png');
    const left = blankImage(4, 4, [0, 0, 0, 255]);
    const right = blankImage(4, 4, [0, 0, 0, 255]);
    right.data[0] = 255;
    writePng(a, left);
    writePng(b, right);
    const shown = mcpContent('map_compare', await runCommand('map_compare', { a, b, out: join(dir, 'diff.png') }));
    expect((shown[0] as { text: string }).text).toContain('1 px differ');
    expect(shown.some(c => c.type === 'image')).toBe(true);
  });
});

describe('figure', () => {
  const recipe = {
    id: 'peleador',
    skin: ['#f2c9a0', '#ef914f', '#b8613a'],
    hair: { style: 'topknot', tones: ['#4e484a', '#3b3643', '#2c2a33'], band: '#6f9fc4' },
    top: { tones: ['#f4efe3', '#e6dcc6', '#bfb8a8'], sleeves: 'long', trim: '#6f9fc4' },
    skirt: { tones: ['#f4efe3', '#e6dcc6', '#bfb8a8'], length: 0.4 },
    sash: '#3d6a8f',
    pants: ['#8d8a86', '#5f5c5a', '#3b3643'],
    shoes: ['#4a4650', '#2c2a33', '#2c2a33'],
    glow: '#c9a34c', glow_core: '#ffd27a',
  };

  it('draws the whole contract in one piece per frame, only with the recipe colors and ink', () => {
    const out = join(dir, 'p.pss.json');
    runCommand('figure', { recipe, out, view: 'front' });
    const a = loadAsset(out);
    expect(dims(a)).toEqual({ width: 48, height: 48 });
    expect(a.animations.map(x => x.name)).toEqual(['idle', 'walk', 'attack', 'technique', 'hurt', 'die']);
    const allowed = new Set(['#15120f', '#f2c9a0', '#ef914f', '#b8613a', '#4e484a', '#3b3643', '#2c2a33', '#6f9fc4',
      '#f4efe3', '#e6dcc6', '#bfb8a8', '#3d6a8f', '#8d8a86', '#5f5c5a', '#4a4650', '#c9a34c', '#ffd27a']);
    for (const hex of Object.values(a.palette)) expect(allowed.has(hex)).toBe(true);
    for (let f = 0; f < frameCount(a); f++) expect(detachedPieces(composite(a, f), 1)).toEqual([]);
    // soles on the ground row (46) with the ink under them, and a full body: about 30 px tall, not a head
    const first = composite(a, 0);
    const rows = first.map((r, y) => (r.some(v => v) ? y : -1)).filter(y => y >= 0);
    expect(rows[rows.length - 1]).toBe(47);
    expect(rows[rows.length - 1] - rows[0]).toBeGreaterThan(26);
  });

  it('answers where the joints fall when asked, to measure a posture', async () => {
    const out = join(dir, 'j.pss.json');
    const plain = (await runCommand('figure', { recipe, out, view: 'side' })).data as Record<string, unknown>;
    expect(plain.joints).toBeUndefined();
    const r = (await runCommand('figure', { recipe: { ...recipe, build: { stoop: 12 } }, out, view: 'side', joints: true }))
      .data as { joints: Record<string, [number, number]> };
    const { head, pelvis } = r.joints;
    expect(head[1]).toBeLessThan(pelvis[1]);
    expect(head[0]).toBeGreaterThan(pelvis[0]); // bent forward, toward where it faces
  });

  it('faces the other way from behind and strikes toward where it faces', () => {
    const front = join(dir, 'f.pss.json'), back = join(dir, 'b.pss.json');
    runCommand('figure', { recipe, out: front, view: 'front' });
    runCommand('figure', { recipe, out: back, view: 'back' });
    const reach = (path: string) => {
      const a = loadAsset(path);
      const strike = a.animations.find(x => x.name === 'attack')!.frameIndices[1];
      const cols = (f: number) => composite(a, f)[0].map((_, x) => composite(a, f).some(r => r[x]) ? x : -1).filter(x => x >= 0);
      const idle = cols(0), hit = cols(strike);
      return { left: idle[0] - hit[0], right: hit[hit.length - 1] - idle[idle.length - 1] };
    };
    const f = reach(front), b = reach(back);
    expect(f.left).toBeGreaterThan(2);   // the rival punches to the lower left
    expect(b.right).toBeGreaterThan(2);  // your side punches to the upper right
  });

  it('builds a chibi of about 3 heads with a hand-drawn head pasted on the head joint', () => {
    const head = {
      rows: ['..bb..', '.cccc.', 'cccccf', 'cccccf', '.cccf.', '..ff..'],
      legend: { b: '#6f9fc4', c: '#3b3643', f: '#ef914f' },
    };
    const chibi = { ...recipe, build: { heads: 3, height: 36 }, head_art: { back: head } };
    const real = join(dir, 'r.pss.json'), small = join(dir, 'c.pss.json');
    runCommand('figure', { recipe: { ...recipe, build: { heads: 3, height: 36 } }, out: real, view: 'back' });
    runCommand('figure', { recipe: chibi, out: small, view: 'back' });
    const plain = loadAsset(real), drawn = loadAsset(small);
    expect(drawn.animations.map(x => x.name)).toEqual(['idle', 'walk', 'attack', 'technique', 'hurt', 'die']);
    for (let f = 0; f < frameCount(drawn); f++) expect(detachedPieces(composite(drawn, f), 1)).toEqual([]);
    // the rig's head of a chibi is about a third of its height and wider than its waist
    const first = composite(plain, 0);
    const rows = first.map((r, y) => (r.some(v => v) ? y : -1)).filter(y => y >= 0);
    const tall = rows[rows.length - 1] - rows[0];
    expect(tall).toBeGreaterThan(30);
    const width = (y: number) => first[y].filter(v => v).length;
    expect(width(rows[0] + Math.round(tall / 6))).toBeGreaterThan(width(rows[0] + Math.round(tall * 0.62)));
    // the drawn head is there, with its own colors
    const hex = (a: ReturnType<typeof loadAsset>) => new Set(composite(a, 0).flat().filter(v => v).map(v => a.palette[v as number]));
    expect(hex(drawn).has('#6f9fc4')).toBe(true);
  });

  it('draws only the animations the recipe asks for, and sits cross-legged breathing', async () => {
    const out = join(dir, 'sit.pss.json'), stand = join(dir, 'stand.pss.json');
    const chibi = { ...recipe, build: { heads: 3, height: 36 } };
    runCommand('figure', { recipe: { ...chibi, anims: ['sit'] }, out, view: 'back' });
    runCommand('figure', { recipe: chibi, out: stand, view: 'back' });
    const a = loadAsset(out);
    expect(a.animations.map(x => x.name)).toEqual(['sit']);
    expect(frameCount(a)).toBe(2);
    for (let f = 0; f < 2; f++) expect(detachedPieces(composite(a, f), 1)).toEqual([]);
    const tall = (frame: ReturnType<typeof composite>) => {
      const rows = frame.map((r, y) => (r.some(v => v) ? y : -1)).filter(y => y >= 0);
      return { top: rows[0], bottom: rows[rows.length - 1] };
    };
    // seated: on the ground row, clearly shorter than standing
    const sitIn = tall(composite(a, 0)), sitOut = tall(composite(a, 1));
    const up = tall(composite(loadAsset(stand), 0));
    expect(sitOut.bottom).toBe(up.bottom);
    expect(up.bottom - up.top - (sitOut.bottom - sitOut.top)).toBeGreaterThan(4);
    // breathing in lifts the head
    expect(sitIn.top).toBeLessThan(sitOut.top);
    await expect(async () => runCommand('figure', { recipe: { ...chibi, anims: ['float'] }, out, view: 'back' })).rejects.toThrow(/no pose for 'float'/);
  });

  it('sits in lotus with the hands on the knees, and spread opens the knees', () => {
    const chibi = { ...recipe, build: { heads: 3, height: 40 }, heading: 90, view: 'front' as const };
    const sit = join(dir, 'lo_sit.pss.json'), lotus = join(dir, 'lo_lotus.pss.json'), wide = join(dir, 'lo_wide.pss.json');
    runCommand('figure', { recipe: { ...chibi, anims: ['sit'] }, out: sit });
    runCommand('figure', { recipe: { ...chibi, anims: ['lotus'] }, out: lotus });
    runCommand('figure', { recipe: { ...chibi, anims: ['lotus'], build: { ...chibi.build, spread: 1.4 } }, out: wide });
    const a = loadAsset(lotus);
    expect(a.animations.map(x => x.name)).toEqual(['lotus']);
    expect(frameCount(a)).toBe(1);
    expect(detachedPieces(composite(a, 0), 1)).toEqual([]);
    const span = (f: ReturnType<typeof composite>) => {
      const xs = f.flatMap(r => r.map((v, x) => (v ? x : -1)).filter(x => x >= 0));
      return Math.max(...xs) - Math.min(...xs);
    };
    // the hands leave the lap for the knees: the skin below the chin sits further out
    const handsOut = (f: ReturnType<typeof composite>, asset: ReturnType<typeof loadAsset>) => {
      const rows = f.map((r, y) => (r.some(v => v) ? y : -1)).filter(y => y >= 0);
      const below = rows[0] + Math.round((rows[rows.length - 1] - rows[0]) * 0.55);
      const mid = f[0].length / 2;
      const xs = f.slice(below).flatMap(r => r.map((v, x) => (v && recipe.skin.includes(asset.palette[v as number]) ? Math.abs(x - mid) : -1)).filter(d => d >= 0));
      return xs.reduce((t, d) => t + d, 0) / Math.max(1, xs.length);
    };
    const sat = loadAsset(sit);
    expect(handsOut(composite(a, 0), a)).toBeGreaterThan(handsOut(composite(sat, 1), sat) + 2);
    // spread: wider at the knees, same seat
    expect(span(composite(loadAsset(wide), 0))).toBeGreaterThan(span(composite(a, 0)));
  });

  it('hangs an apron in front of the body, seen more from the front than from behind', () => {
    const apron = { tones: ['#9c7048', '#7a5236', '#5a3a26'], from: 0.9, length: 0.75 };
    const cook = { ...recipe, build: { heads: 3, height: 36 }, apron };
    const front = join(dir, 'ap_f.pss.json'), back = join(dir, 'ap_b.pss.json');
    runCommand('figure', { recipe: cook, out: front, view: 'front' });
    runCommand('figure', { recipe: cook, out: back, view: 'back' });
    const count = (path: string) => {
      const a = loadAsset(path);
      const ids = new Set(Object.entries(a.palette).filter(([, h]) => apron.tones.includes(h)).map(([k]) => Number(k)));
      return composite(a, 0).flat().filter(v => v && ids.has(v as number)).length;
    };
    const f = loadAsset(front);
    for (let i = 0; i < frameCount(f); i++) expect(detachedPieces(composite(f, i), 1)).toEqual([]);
    expect(count(front)).toBeGreaterThan(20);
    expect(count(back)).toBeLessThan(count(front));
  });
});
