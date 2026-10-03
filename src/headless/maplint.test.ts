// map_lint: the style rules of a painted map ground, checked on the PNG.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Rgba } from './png';
import { writePng } from './png';
import { fringes, mapLint, materialGrid } from './maplint';
import { runCommand } from './commands';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pss-maplint-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const GRASS = '#6fa05a', GRASS_LIGHT = '#8fb66a', EARTH = '#9c7048', EARTH_LIGHT = '#c48a5a', STONE = '#5f5c5a';
const MATERIALS = { grass: [GRASS, GRASS_LIGHT], earth: [EARTH, EARTH_LIGHT], stone: [STONE] };
const PALETTE = [GRASS, GRASS_LIGHT, EARTH, EARTH_LIGHT, STONE, '#f4d0d8'];

function image(w: number, h: number, paint: (x: number, y: number) => string, alpha = 255): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = paint(x, y), i = (y * w + x) * 4;
      data[i] = parseInt(c.slice(1, 3), 16); data[i + 1] = parseInt(c.slice(3, 5), 16);
      data[i + 2] = parseInt(c.slice(5, 7), 16); data[i + 3] = alpha;
    }
  }
  return { width: w, height: h, data };
}

const setPx = (img: Rgba, x: number, y: number, c: string, a = 255) => {
  const i = (y * img.width + x) * 4;
  img.data.set([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), a], i);
};

/** 4×4 cells of grass with a path that meanders one pixel at a time, and a little variety. */
function goodGround(): Rgba {
  const img = image(64, 64, (x, y) => (Math.abs(x - (30 + Math.round(4 * Math.sin(y / 5)))) < 6 ? EARTH : GRASS));
  for (let k = 0; k < 40; k++) {
    const x = (k * 37) % 64, y = (k * 53) % 64;
    const i = (y * 64 + x) * 4;
    setPx(img, x, y, img.data[i] === 0x9c ? EARTH_LIGHT : GRASS_LIGHT);
  }
  return img;
}

describe('map_lint', () => {
  it('a path that meanders passes every rule', () => {
    expect(mapLint(goodGround(), { palette: PALETTE, materials: MATERIALS }).problems).toEqual([]);
  });

  it('rejects soft alpha, holes, colors off the palette and a straight tile-edge path', () => {
    const img = goodGround();
    setPx(img, 3, 3, GRASS, 128);
    setPx(img, 5, 5, GRASS, 0);
    setPx(img, 7, 7, '#ff00ff');
    const p = mapLint(img, { palette: PALETTE, materials: MATERIALS }).problems.join('\n');
    expect(p).toMatch(/semi-transparent/);
    expect(p).toMatch(/transparent pixels inside/);
    expect(p).toMatch(/#ff00ff/);
    const tiles = image(64, 64, x => (x >= 16 && x < 32 ? EARTH : GRASS));
    const straight = mapLint(tiles, { materials: MATERIALS });
    expect(straight.problems.join()).toMatch(/straight vertical border/);
    expect(straight.straight[0]).toEqual([15, 0, 'vertical']);
    // architecture (an interior, a terrace) may be straight; the other rules stay
    expect(mapLint(tiles, { materials: MATERIALS, architecture: true }).problems.join()).not.toMatch(/straight/);
  });

  it('an accent takes its neighbour material and does not cut a straight border', () => {
    const img = image(64, 64, (x, y) => (y >= 20 ? EARTH : GRASS));
    setPx(img, 30, 20, '#f4d0d8');
    expect(materialGrid(img, { x: 0, y: 0, w: 64, h: 64 }, MATERIALS)[20][30]).toBe(1);
    expect(mapLint(img, { materials: MATERIALS }).problems.join()).toMatch(/straight horizontal border/);
  });

  it('rejects a dithered border and takes a one-pixel diagonal as a line', () => {
    const img = goodGround();
    for (let y = 1; y < 63; y += 2) {
      const c = 30 + Math.round(4 * Math.sin(y / 5));
      setPx(img, c - 8, y, EARTH);
      setPx(img, c + 3, y, GRASS);
    }
    expect(mapLint(img, { materials: MATERIALS }).problems.join()).toMatch(/blurred/);
    const line = goodGround();
    for (let k = 0; k < 12; k++) setPx(line, 4 + k, 40 + k, STONE);
    expect(fringes(materialGrid(line, { x: 0, y: 0, w: 64, h: 64 }, MATERIALS))[1]).toBeLessThanOrEqual(2);
  });

  it('rejects the repeated tile, checks only the area, and a layer only for alpha and palette', () => {
    const tiled = image(64, 64, (x, y) => (x % 16 === 3 && y % 16 === 5 ? GRASS_LIGHT : GRASS));
    expect(mapLint(tiled, { materials: MATERIALS }).problems.join()).toMatch(/identical/);
    // outside the area anything goes (the margin of a map): a straight border there is fine
    const framed = image(96, 64, x => (x < 32 ? STONE : GRASS));
    const inner = goodGround();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4, j = (y * 96 + x + 32) * 4;
      framed.data.set(inner.data.subarray(i, i + 4), j);
    }
    expect(mapLint(framed, { materials: MATERIALS, area: { x: 32, y: 0, w: 64, h: 64 } }).problems).toEqual([]);
    const layer = image(8, 8, () => GRASS, 0);
    setPx(layer, 2, 2, '#ff00ff');
    const p = mapLint(layer, { palette: PALETTE, materials: MATERIALS, ground: false }).problems;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/#ff00ff/);
  });

  it('the command reads a PNG, an area and the materials from a JSON file', async () => {
    const png = join(dir, 'suelo.png');
    writePng(png, image(64, 64, x => (x >= 16 && x < 32 ? EARTH : GRASS)));
    const mats = join(dir, 'materiales.json');
    (await import('node:fs')).writeFileSync(mats, JSON.stringify(MATERIALS));
    const res = await runCommand('map_lint', { png, materials: mats, area: [0, 0, 64, 64] });
    expect(res.text).toMatch(/^✗ suelo\.png/);
    expect(res.text).toMatch(/straight vertical border/);
    const ok = await runCommand('map_lint', { png, materials: mats, architecture: true });
    expect(ok.text).toMatch(/^✓ suelo\.png/);
  });
});
