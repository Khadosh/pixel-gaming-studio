// Reading images whatever the format the AI answers in: PNG through pngjs,
// JPEG through jpeg-js (the edit model answers JPEG even when asked for PNG).

import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import type { Rgba } from './png';

export function isPngBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

export function isJpegBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** PNG or JPEG bytes as RGBA8. Anything else fails with its first bytes. */
export function decodeImage(bytes: Uint8Array): Rgba {
  if (isPngBytes(bytes)) {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (isJpegBytes(bytes)) {
    const img = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  }
  throw new Error(`not a PNG or a JPEG (starts with ${Buffer.from(bytes.slice(0, 4)).toString('hex')})`);
}

/** A PNG or a JPEG from disk. */
export function readImage(path: string): Rgba {
  return decodeImage(readFileSync(path));
}
