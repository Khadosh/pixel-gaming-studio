// PNG in and out for Node, on top of pngjs. RGBA8 only.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { guardWrite } from './guard';
import { noteDrawn } from './lastdrawn';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

export interface Rgba {
  width: number;
  height: number;
  /** RGBA8, row-major, length = width * height * 4 */
  data: Uint8Array;
}

export function blankImage(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 0]): Rgba {
  const data = new Uint8Array(width * height * 4);
  if (fill.some(v => v !== 0)) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { width, height, data };
}

export function readPng(path: string): Rgba {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function encodePng(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}

export function writePng(path: string, img: Rgba): void {
  guardWrite(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(img));
  noteDrawn(path);
}

export function getPixel(img: Rgba, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

export function setPixel(img: Rgba, x: number, y: number, rgba: [number, number, number, number]): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = rgba[0];
  img.data[i + 1] = rgba[1];
  img.data[i + 2] = rgba[2];
  img.data[i + 3] = rgba[3];
}

/** Copies src onto dst at (x, y). Pixels with alpha 0 are skipped. */
export function blit(dst: Rgba, src: Rgba, x: number, y: number): void {
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      const p = getPixel(src, sx, sy);
      if (p[3] === 0) continue;
      setPixel(dst, x + sx, y + sy, p);
    }
  }
}

export type BlendMode = 'over' | 'add';

/**
 * Composites src onto dst at (x, y) honoring alpha. 'over' is the usual
 * source-over (a shadow at 40 % darkens the grass under it instead of
 * replacing it with a gray); 'add' sums the color weighted by its alpha, the
 * way a light is drawn in a game (a halo brightens what is under it).
 */
export function blitBlend(dst: Rgba, src: Rgba, x: number, y: number, mode: BlendMode = 'over'): void {
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      const dx = x + sx, dy = y + sy;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      const p = getPixel(src, sx, sy);
      if (p[3] === 0) continue;
      const q = getPixel(dst, dx, dy);
      const a = p[3] / 255;
      if (mode === 'add') {
        const add = (i: number) => Math.min(255, Math.round(q[i] + p[i] * a));
        setPixel(dst, dx, dy, [add(0), add(1), add(2), Math.max(q[3], p[3])]);
        continue;
      }
      const qa = q[3] / 255;
      const outA = a + qa * (1 - a);
      const mix = (i: number) => outA === 0 ? 0 : Math.round((p[i] * a + q[i] * qa * (1 - a)) / outA);
      setPixel(dst, dx, dy, [mix(0), mix(1), mix(2), Math.round(outA * 255)]);
    }
  }
}
