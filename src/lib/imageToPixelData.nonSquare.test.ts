import { describe, it, expect } from 'vitest';
import { imageToPixelData } from './imageToPixelData';

/** A fake ImageData: the function only reads `data`, `width` and `height`. */
function makeImage(
  width: number,
  height: number,
  color: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = color(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { data, width, height } as unknown as ImageData;
}

const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

describe('imageToPixelData on a non-square target', () => {
  it('returns a targetHeight x targetWidth grid', () => {
    const img = makeImage(16, 8, (_x, y) => (y < 4 ? RED : BLUE));
    const { frame } = imageToPixelData(img, {
      targetWidth: 8,
      targetHeight: 4,
      maxColors: 4,
      removeBackground: false,
    });

    expect(frame.length).toBe(4);
    for (const row of frame) expect(row.length).toBe(8);
  });

  it('samples each axis with its own cell size', () => {
    // 16x8 split top/bottom: with a 8x4 target the top two rows must be one
    // color and the bottom two the other.
    const img = makeImage(16, 8, (_x, y) => (y < 4 ? RED : BLUE));
    const { frame, palette } = imageToPixelData(img, {
      targetWidth: 8,
      targetHeight: 4,
      maxColors: 4,
      removeBackground: false,
    });

    const top = frame[0][0];
    const bottom = frame[3][0];
    expect(top).not.toBe(bottom);
    expect(frame[1].every(v => v === top)).toBe(true);
    expect(frame[2].every(v => v === bottom)).toBe(true);
    expect(palette[top]).toBe('#ff0000');
    expect(palette[bottom]).toBe('#0000ff');
  });

  it('reads the left/right split along the width', () => {
    const img = makeImage(16, 8, (x) => (x < 8 ? RED : BLUE));
    const { frame, palette } = imageToPixelData(img, {
      targetWidth: 8,
      targetHeight: 4,
      maxColors: 4,
      removeBackground: false,
    });

    for (const row of frame) {
      expect(row.slice(0, 4).every(v => palette[v] === '#ff0000')).toBe(true);
      expect(row.slice(4).every(v => palette[v] === '#0000ff')).toBe(true);
    }
  });

  it('returns a non-square empty frame when nothing is opaque', () => {
    const img = makeImage(16, 8, () => [0, 0, 0, 0]);
    const { frame, palette } = imageToPixelData(img, {
      targetWidth: 8,
      targetHeight: 4,
      removeBackground: false,
    });

    expect(frame.length).toBe(4);
    expect(frame.every(row => row.length === 8 && row.every(v => v === 0))).toBe(true);
    expect(palette).toEqual({ 0: 'transparent' });
  });

  it('still honors a lone targetSize (square callers unchanged)', () => {
    const img = makeImage(16, 8, (_x, y) => (y < 4 ? RED : BLUE));
    const { frame } = imageToPixelData(img, {
      targetSize: 8,
      maxColors: 4,
      removeBackground: false,
    });

    expect(frame.length).toBe(8);
    for (const row of frame) expect(row.length).toBe(8);
  });

  it('refuses a call with no target at all', () => {
    const img = makeImage(4, 4, () => RED);
    expect(() => imageToPixelData(img, {} as never)).toThrow(/targetSize/);
  });
});
