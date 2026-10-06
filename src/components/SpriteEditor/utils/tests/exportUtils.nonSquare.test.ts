import { describe, it, expect } from 'vitest';
import { SpriteAsset } from '@/lib/types';
import {
  GIF_MAX_SIDE,
  GIF_SCALE,
  PIXEL_SCALE,
  gifDimensions,
  pngCellSize,
  scaleFrameToGifIndices,
} from '../exportUtils';

function asset(size: number, width?: number, height?: number): SpriteAsset {
  const a: SpriteAsset = {
    id: 'a',
    name: 'A',
    description: '',
    category: 'prop',
    size,
    palette: { 0: 'transparent', 1: '#ffffff' },
    colorNames: { 0: 'Transparent', 1: 'White' },
    layers: [],
    animations: [],
  };
  if (width !== undefined) a.width = width;
  if (height !== undefined) a.height = height;
  return a;
}

describe('pngCellSize', () => {
  it('keeps the square cell of a square asset', () => {
    for (const s of [16, 32, 64, 128]) {
      expect(pngCellSize(asset(s))).toEqual({ cellW: s * PIXEL_SCALE, cellH: s * PIXEL_SCALE });
    }
  });

  it('gives a non-square asset a cell of its own shape', () => {
    expect(pngCellSize(asset(512, 512, 320))).toEqual({
      cellW: 512 * PIXEL_SCALE,
      cellH: 320 * PIXEL_SCALE,
    });
    expect(pngCellSize(asset(448, 448, 224))).toEqual({
      cellW: 448 * PIXEL_SCALE,
      cellH: 224 * PIXEL_SCALE,
    });
  });
});

describe('gifDimensions', () => {
  it('leaves every square canvas the editor offers at 10x', () => {
    for (const s of [16, 32, 64, 128]) {
      expect(gifDimensions(asset(s))).toEqual({
        scale: GIF_SCALE,
        width: s * GIF_SCALE,
        height: s * GIF_SCALE,
      });
    }
  });

  it('caps a large canvas so the longest side stays inside the budget', () => {
    const big = gifDimensions(asset(512, 512, 320));
    expect(big).toEqual({ scale: 2, width: 1024, height: 640 });
    expect(Math.max(big.width, big.height)).toBeLessThanOrEqual(GIF_MAX_SIDE);

    const map = gifDimensions(asset(448, 448, 224));
    expect(map).toEqual({ scale: 2, width: 896, height: 448 });
    expect(Math.max(map.width, map.height)).toBeLessThanOrEqual(GIF_MAX_SIDE);
  });

  it('never drops below 1x, however large the canvas', () => {
    const huge = gifDimensions(asset(4000, 4000, 100));
    expect(huge.scale).toBe(1);
    expect(huge).toEqual({ scale: 1, width: 4000, height: 100 });
  });
});

describe('scaleFrameToGifIndices', () => {
  const colorMap = new Map<number, number>([[0, 0], [1, 1], [2, 2]]);

  it('uses the width as the row stride on a non-square frame', () => {
    // 4 wide, 2 tall: the bug used the square side as the stride, which
    // skewed every row to the right.
    const frame = [
      [1, 0, 0, 2],
      [0, 1, 2, 0],
    ];
    const out = scaleFrameToGifIndices(frame, 4, 2, 1, colorMap);
    expect(out.length).toBe(8);
    expect(Array.from(out)).toEqual([1, 0, 0, 2, 0, 1, 2, 0]);
  });

  it('blows a non-square frame up by the scale on both axes', () => {
    const frame = [
      [1, 2],
      [0, 0],
      [2, 1],
    ];
    const out = scaleFrameToGifIndices(frame, 2, 3, 2, colorMap);
    expect(out.length).toBe(2 * 2 * 3 * 2); // (2*2) wide x (3*2) tall
    const stride = 4;
    const at = (x: number, y: number) => out[y * stride + x];
    expect([at(0, 0), at(1, 0), at(2, 0), at(3, 0)]).toEqual([1, 1, 2, 2]);
    expect([at(0, 1), at(1, 1), at(2, 1), at(3, 1)]).toEqual([1, 1, 2, 2]);
    expect([at(0, 2), at(1, 2), at(2, 2), at(3, 2)]).toEqual([0, 0, 0, 0]);
    expect([at(0, 4), at(1, 4), at(2, 4), at(3, 4)]).toEqual([2, 2, 1, 1]);
  });

  it('matches the old square scaling byte for byte', () => {
    const frame = [
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
    ];
    const scale = 3;
    const size = 3 * scale;
    const expected = new Uint8Array(size * size);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = colorMap.get(frame[r][c])!;
        for (let sr = 0; sr < scale; sr++) {
          for (let sc = 0; sc < scale; sc++) {
            expected[(r * scale + sr) * size + (c * scale + sc)] = idx;
          }
        }
      }
    }
    expect(Array.from(scaleFrameToGifIndices(frame, 3, 3, scale, colorMap)))
      .toEqual(Array.from(expected));
  });

  it('tolerates a short row instead of throwing', () => {
    const frame = [[1, 1]];
    expect(() => scaleFrameToGifIndices(frame, 4, 2, 1, colorMap)).not.toThrow();
    const out = scaleFrameToGifIndices(frame, 4, 2, 1, colorMap);
    expect(Array.from(out)).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
  });
});
