import { describe, it, expect } from 'vitest';
import { fitsInside } from '../AssetLibrary';

describe('fitsInside (asset library import gating)', () => {
  it('keeps the old rule: 16x16 into 32x32 yes, 16x16 into 16x16 no', () => {
    expect(fitsInside({ width: 16, height: 16 }, { width: 32, height: 32 })).toBe(true);
    expect(fitsInside({ width: 16, height: 16 }, { width: 16, height: 16 })).toBe(false);
  });

  it('lets a 16x16 prop into a non-square map canvas', () => {
    expect(fitsInside({ width: 16, height: 16 }, { width: 448, height: 224 })).toBe(true);
    expect(fitsInside({ width: 16, height: 16 }, { width: 512, height: 320 })).toBe(true);
  });

  it('refuses a source that sticks out of the canvas on either axis', () => {
    expect(fitsInside({ width: 64, height: 16 }, { width: 32, height: 320 })).toBe(false);
    expect(fitsInside({ width: 16, height: 400 }, { width: 512, height: 320 })).toBe(false);
    expect(fitsInside({ width: 512, height: 320 }, { width: 512, height: 320 })).toBe(false);
  });

  it('accepts a source smaller on one axis and equal on the other', () => {
    expect(fitsInside({ width: 512, height: 100 }, { width: 512, height: 320 })).toBe(true);
    expect(fitsInside({ width: 100, height: 320 }, { width: 512, height: 320 })).toBe(true);
  });
});
