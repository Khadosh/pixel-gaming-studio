// Zones, layers and painted lights: what turns a flat AI backdrop into a
// fixable, layered, lit stage.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { generateImage } from './ai';
import { createAsset, getFrame, loadAsset, saveAsset } from './asset';
import { decodeImage } from './image';
import { encodePng, writePng, type Rgba } from './png';
import { applyAnswer, editZone, zoneCoverage } from './zones';
import { cutPiece, estimateDepth, layerMap, paintedLights, splitLayers } from './backdrop';
import { runCommand } from './commands';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-bd-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function solid(w: number, h: number, rgb: [number, number, number]): Rgba {
  const img: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let i = 0; i < w * h; i++) img.data.set([...rgb, 255], i * 4);
  return img;
}

function jpegOf(img: Rgba): Uint8Array {
  return new Uint8Array(jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, 95).data);
}

describe('images and zones', () => {
  it('reads a JPEG, and generate hands back a PNG when the model answers JPEG', async () => {
    const red = jpegOf(solid(8, 6, [220, 20, 20]));
    const img = decodeImage(red);
    expect([img.width, img.height]).toEqual([8, 6]);
    expect(img.data[0]).toBeGreaterThan(200);
    const fake = (async (url: string) => url.startsWith('https://fal.run/')
      ? new Response(JSON.stringify({ images: [{ url: 'https://img.test/e.jpg' }] }), { status: 200 })
      : new Response(red, { status: 200 })) as unknown as typeof fetch;
    const out = await generateImage({ prompt: 'fix it', imageUrl: 'data:image/png;base64,AA', raw: true }, 'k', fake);
    expect(out.bytes[0]).toBe(0x89);
    expect(decodeImage(out.bytes).width).toBe(8);
    expect(() => decodeImage(new Uint8Array([1, 2, 3, 4]))).toThrow(/PNG or a JPEG/);
  });

  it('a zone is a rect, a polygon or a mask image, in fractions', () => {
    const rect = zoneCoverage({ rect: [0, 0, 0.5, 1] }, 10, 4);
    expect(rect[0]).toBe(1);
    expect(rect[9]).toBe(0);
    const tri = zoneCoverage({ polygon: [[0, 0], [1, 0], [0, 1]] }, 10, 10);
    expect(tri[0]).toBe(1);
    expect(tri[99]).toBe(0);
    const mask = solid(2, 1, [0, 0, 0]);
    mask.data.set([255, 255, 255, 255], 4);
    const m = zoneCoverage({ mask }, 10, 2);
    expect([m[0], m[9]]).toEqual([0, 1]);
    expect(zoneCoverage({ rect: [0, 0, 0.5, 1], invert: true }, 10, 4)[0]).toBe(0);
  });

  it('edit_zone sends the zone with context and blends the answer back only inside it', async () => {
    const base = solid(100, 60, [10, 10, 60]);
    let sent: { prompt: string; image_size: { width: number; height: number } } | null = null;
    const fake = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://fal.run/')) {
        sent = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ images: [{ url: 'https://img.test/a.jpg' }] }), { status: 200 });
      }
      return new Response(jpegOf(solid(300, 200, [200, 120, 40])), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await editZone(base, { rect: [0.4, 0, 0.6, 0.5] }, 'close the opening with rock', 'k', fake, { feather: 0, match: false });
    expect(sent!.prompt).toContain('close the opening with rock');
    expect(sent!.prompt).toContain('only');
    expect(Math.min(sent!.image_size.width, sent!.image_size.height)).toBe(1024);
    expect(out.box.x).toBeLessThan(40);
    const at = (x: number, y: number) => Array.from(out.image.data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 3));
    expect(at(50, 10)[0]).toBeGreaterThan(150);
    expect(at(10, 10)).toEqual([10, 10, 60]);
    expect(at(50, 50)).toEqual([10, 10, 60]);
  });

  it('the answer is regraded to the picture outside the zone, and a saved answer blends again without the model', () => {
    // The base: a dark left half and a light right half. The answer keeps
    // that, 40 lighter all over (the drift), with a mid gray in the zone.
    const base = solid(40, 20, [30, 30, 30]);
    for (let y = 0; y < 20; y++) for (let x = 20; x < 40; x++) base.data.set([130, 130, 130, 255], (y * 40 + x) * 4);
    const answer = solid(40, 20, [70, 70, 70]);
    for (let y = 0; y < 20; y++) for (let x = 20; x < 40; x++) answer.data.set([170, 170, 170, 255], (y * 40 + x) * 4);
    for (let y = 5; y < 15; y++) for (let x = 15; x < 25; x++) answer.data.set([120, 120, 120, 255], (y * 40 + x) * 4);
    const zone = { rect: [0.375, 0.25, 0.625, 0.75] };
    const out = applyAnswer(base, zone, answer, { feather: 0, context: 4 });
    const at = (x: number, y: number) => out.image.data[(y * 40 + x) * 4];
    expect(at(20, 10)).toBe(80);
    expect(at(2, 2)).toBe(30);
    expect(applyAnswer(base, zone, answer, { feather: 0, context: 4, match: false }).image.data[(10 * 40 + 20) * 4]).toBe(120);
  });

  it('changed= brings back only what the model added: the sky it re-touched stays the base', () => {
    // A sky (light blue); the answer is the same sky a little off all over
    // and a dark peak in the middle of the zone.
    const base = solid(40, 20, [200, 220, 240]);
    const answer = solid(40, 20, [206, 224, 238]);
    for (let y = 6; y < 14; y++) for (let x = 16; x < 24; x++) answer.data.set([60, 70, 90, 255], (y * 40 + x) * 4);
    const zone = { rect: [0.25, 0, 0.75, 1] };
    const opts = { feather: 0, context: 4, match: false };
    const out = applyAnswer(base, zone, answer, { ...opts, changed: 0.05 });
    const at = (img: Rgba, x: number, y: number) => Array.from(img.data.slice((y * 40 + x) * 4, (y * 40 + x) * 4 + 3));
    expect(at(out.image, 20, 10)).toEqual([60, 70, 90]);
    expect(at(out.image, 12, 2)).toEqual([200, 220, 240]);
    expect(at(out.image, 2, 2)).toEqual([200, 220, 240]);
    // Without it the whole zone takes the answer's sky.
    expect(at(applyAnswer(base, zone, answer, opts).image, 12, 2)).toEqual([206, 224, 238]);
    // haze= sends the peak into the distance: half of the sky shows through.
    expect(at(applyAnswer(base, zone, answer, { ...opts, changed: 0.05, haze: 0.5 }).image, 20, 10)).toEqual([130, 145, 165]);
  });

  it('local= takes off the broad drift the model adds to a sky and keeps the small new thing', () => {
    // The answer is the sky lighter and lighter to the right (a gradient no
    // single grade undoes) and a small dark peak.
    const base = solid(80, 20, [150, 170, 190]);
    const answer = solid(80, 20, [0, 0, 0]);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 80; x++) answer.data.set([150 + x / 2, 170 + x / 2, 190 + x / 2, 255], (y * 80 + x) * 4);
    for (let y = 8; y < 12; y++) for (let x = 40; x < 43; x++) answer.data.set([40, 50, 60, 255], (y * 80 + x) * 4);
    const zone = { rect: [0, 0, 1, 1] };
    const opts = { feather: 0, context: 4, match: false, changed: 0.05 };
    const at = (img: Rgba, x: number, y: number) => Array.from(img.data.slice((y * 80 + x) * 4, (y * 80 + x) * 4 + 3));
    expect(at(applyAnswer(base, zone, answer, opts).image, 75, 2)).not.toEqual([150, 170, 190]);
    const out = applyAnswer(base, zone, answer, { ...opts, local: 12 }).image;
    expect(at(out, 75, 2)).toEqual([150, 170, 190]);
    expect(at(out, 10, 15)).toEqual([150, 170, 190]);
    expect(at(out, 41, 10)[0]).toBeLessThan(100);
  });

  it('illustrate base= redraws only the cells inside the zone', async () => {
    const before = join(dir, 'a.png'), after = join(dir, 'b.png');
    writePng(before, solid(64, 64, [20, 20, 20]));
    const fixed = solid(64, 64, [20, 20, 20]);
    for (let i = 0; i < 64 * 64; i++) fixed.data.set([230, 230, 230, 255], i * 4);
    writePng(after, fixed);
    const pal = join(dir, 'pal.pss.json');
    const p = createAsset({ id: 'pal', width: 1, palette: ['#141414', '#e6e6e6'] });
    saveAsset(pal, p);
    const common = { width: 16, height: 8, fit: pal, quantize: 'palette' };
    await runCommand('illustrate', { png: before, out: join(dir, 'old.pss.json'), ...common });
    await runCommand('illustrate', { png: after, out: join(dir, 'new.pss.json'), base: join(dir, 'old.pss.json'), rect: [0, 0, 0.5, 1], ...common });
    const a = loadAsset(join(dir, 'new.pss.json'));
    const f = getFrame(a, 0, 0);
    expect(a.palette[f[4][2]].toLowerCase()).toBe('#e6e6e6');
    expect(a.palette[f[4][13]].toLowerCase()).toBe('#141414');
  });
});

describe('layers and lights', () => {
  it('splits by depth: far is opaque, near only has its cells, and layers are painted on under nearer ones', () => {
    const a = createAsset({ id: 't', width: 12, height: 9, palette: ['#000000', '#444444', '#888888', '#cccccc'] });
    const f = getFrame(a, 0, 0);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) f[y][x] = 1 + Math.floor(y / 3);
    const depth: Rgba = solid(12, 9, [0, 0, 0]);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) { const v = Math.round(y / 8 * 255); depth.data.set([v, v, v, 255], (y * 12 + x) * 4); }
    const map = layerMap(depth, 12, 9, { cuts: [0.3, 0.7], smooth: 0 });
    expect(map[0][0]).toBe(0);
    expect(map[8][0]).toBe(2);
    const [far, mid, near] = splitLayers(a, map, 2);
    expect(getFrame(far, 0, 0).flat().every(v => v > 0)).toBe(true);
    expect(getFrame(near, 0, 0)[0][0]).toBe(0);
    expect(getFrame(near, 0, 0)[8][5]).toBe(f[8][5]);
    // Under the near rows, the mid layer is painted on (up to 2 cells from it), then transparent.
    const midF = getFrame(mid, 0, 0);
    const firstNear = map.findIndex(r => r[0] === 2);
    expect(midF[firstNear][0]).toBeGreaterThan(0);
    expect(midF[0][0]).toBe(0);
  });

  it('depth asks fal and reads whatever image it answers', async () => {
    const fake = (async (url: string) => url.startsWith('https://fal.run/')
      ? new Response(JSON.stringify({ image: { url: 'https://img.test/d.png' } }), { status: 200 })
      : new Response(encodePng(solid(4, 4, [128, 128, 128])), { status: 200 })) as unknown as typeof fetch;
    const d = await estimateDepth(encodePng(solid(4, 4, [1, 2, 3])), 'k', fake);
    expect(d.width).toBe(4);
  });

  it('finds the painted lights: two torches in the dark, with center, color and a glow wider than the flame', () => {
    const a = createAsset({ id: 'c', width: 80, height: 40, palette: ['#120e14', '#3a2a22', '#7a4a2a', '#ffd27a', '#ff8a3d'] });
    const f = getFrame(a, 0, 0);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) f[y][x] = 1;
    for (const [cx, cy] of [[15, 12], [60, 14]]) {
      for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < 8) f[y][x] = 2;
        if (d < 4) f[y][x] = 3;
        if (d < 1.6) f[y][x] = 4;
      }
    }
    // A flame tip cut off by a dark pixel row is still the same torch.
    f[9][15] = 4;
    const found = paintedLights(a, { colors: ['#ffd27a'], minCells: 1 });
    expect(found.lights.length).toBe(2);
    const [l, r] = found.lights;
    expect(l.px).toEqual([15, 12]);
    expect(r.at[0]).toBeCloseTo(60 / 80, 2);
    expect(l.color).toBe('#ffd27a');
    expect(l.radius).toBeGreaterThan(2);
    expect(l.radius).toBeLessThan(12);
    // Auto mode (bright and vivid) finds them too, and the JSON lands on disk.
    expect(paintedLights(a).lights.length).toBe(2);
    const path = join(dir, 'c.pss.json'), out = join(dir, 'c.luces.json');
    saveAsset(path, a);
    return runCommand('lights', { path, out }).then(() => {
      expect(JSON.parse(readFileSync(out, 'utf8')).lights.length).toBe(2);
    });
  });
});

describe('cutout', () => {
  it('cuts the clouds of the sky, leaves the mountain, and paints the hole with the sky of the row', async () => {
    // Sky (1) with a cloud (2) at the top and a mountain (3) at the bottom.
    const a = createAsset({ id: 'sky', width: 10, height: 6, palette: ['#e6e6e6', '#888888', '#203040'] });
    const f = getFrame(a, 0, 0);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) f[y][x] = y >= 4 ? 3 : 1;
    for (let x = 3; x < 6; x++) f[1][x] = 2;
    f[4][4] = 2; // the same grey on the mountain: outside the zone, it stays
    const cov = zoneCoverage({ rect: [0, 0, 1, 0.5] }, 10, 6);
    const { piece, base, cells } = cutPiece(a, cov, { colors: ['#888888'] });
    expect(cells).toBe(3);
    const pf = getFrame(piece, 0, 0), bf = getFrame(base, 0, 0);
    expect(pf[1][4]).toBe(2);
    expect(pf[1][0]).toBe(0);
    expect(pf[4][4]).toBe(0);
    expect(bf[1][4]).toBe(1);
    expect(bf[4][4]).toBe(2);
    // By lightness and grown one pixel: the cloud takes its rim along.
    const grown = cutPiece(a, cov, { maxLightness: 0.7, grow: 1 });
    expect(grown.cells).toBe(3 + 2 + 3 + 3);
    // Through the command, chained: the base is written too.
    const src = join(dir, 'sky.pss.json');
    saveAsset(src, a);
    await runCommand('cutout', { path: src, out: join(dir, 'nubes.pss.json'), base_out: join(dir, 'quieto.pss.json'), rect: [0, 0, 1, 0.5], colors: ['#888888'] });
    expect(getFrame(loadAsset(join(dir, 'quieto.pss.json')), 0, 0)[1][3]).toBe(1);
    expect(loadAsset(join(dir, 'nubes.pss.json')).id).toBe('nubes');
  });
});
