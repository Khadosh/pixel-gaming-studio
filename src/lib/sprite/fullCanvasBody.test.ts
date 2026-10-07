import { describe, it, expect } from 'vitest';
import { cloneFrame, clearPixels, stretchPixels } from './transforms';
import { generateWalkTopDown } from './generators/walk';
import { generateAttackTopDown } from './generators/combat';
import type { Frame } from '../types';

// A 16x32 chibi in a long robe fills its canvas: the boots sit on the last
// row and the legs are the only four rows the robe does not cover. Two things
// broke there. `stretchPixels` shifted a member off the bottom and dropped
// whatever fell outside, so a walk cycle came out with no feet; and the lunge
// of an attack moved the body while the legs stayed, leaving a transparent row
// across the sprite that tore it in two.

/** `height` rows of `width` zeros. */
function blank(width: number, height: number): Frame {
  return Array.from({ length: height }, () => Array<number>(width).fill(0));
}

function pixelsOf(frame: Frame) {
  const out: { r: number; c: number }[] = [];
  frame.forEach((row, r) => row.forEach((v, c) => { if (v !== 0) out.push({ r, c }); }));
  return out;
}

describe('the anatomy engine on a sprite that fills its canvas', () => {
  it('leaves a leg standing on the last row where it is', () => {
    const frame = blank(4, 8);
    for (let r = 5; r < 8; r++) frame[r][1] = 3; // a leg, foot on the last row
    const leg = pixelsOf(frame);

    const out = stretchPixels(frame, clearPixels(cloneFrame(frame), leg), leg, 2);

    expect(pixelsOf(out)).toEqual(leg);
  });

  it('grows only as far as the floor allows', () => {
    const frame = blank(4, 8);
    frame[4][1] = 3;
    frame[5][1] = 3; // one row of room under it
    const leg = pixelsOf(frame);

    const out = stretchPixels(frame, clearPixels(cloneFrame(frame), leg), leg, 3);

    expect(pixelsOf(out)).toEqual([{ r: 6, c: 1 }, { r: 7, c: 1 }]);
  });

  it('still shifts upwards by the whole amount when there is room', () => {
    const frame = blank(4, 8);
    frame[5][1] = 3;
    frame[6][1] = 3;
    const leg = pixelsOf(frame);

    const out = stretchPixels(frame, clearPixels(cloneFrame(frame), leg), leg, -2);

    expect(pixelsOf(out)).toEqual([{ r: 3, c: 1 }, { r: 4, c: 1 }]);
  });

  it('keeps the feet of a top-down walk cycle on the floor', () => {
    // A 16x32 body: head, torso and two legs whose boots sit on row 31.
    const base = blank(16, 32);
    for (let r = 1; r < 15; r++) for (let c = 2; c < 14; c++) base[r][c] = 1;
    for (let r = 15; r < 27; r++) for (let c = 3; c < 13; c++) base[r][c] = 2;
    for (let r = 27; r < 32; r++) {
      for (let c = 4; c < 7; c++) base[r][c] = 3;
      for (let c = 9; c < 12; c++) base[r][c] = 3;
    }
    const anatomy = { neckRow: 14, waistRow: 26, kneeRow: 29, ankleRow: 31 };

    const frames = generateWalkTopDown(base, anatomy, 0);

    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f[31].some(v => v !== 0)).toBe(true);
    }
  });

  it('does not tear a lunging body away from its legs', () => {
    // The robe reaches row 26 and the legs stand from 27 down: shifting the
    // body two rows up used to leave a transparent row across the sprite.
    const base = blank(16, 32);
    for (let r = 1; r < 15; r++) for (let c = 2; c < 14; c++) base[r][c] = 1;
    for (let r = 15; r < 27; r++) for (let c = 3; c < 13; c++) base[r][c] = 2;
    for (let r = 27; r < 32; r++) {
      for (let c = 4; c < 7; c++) base[r][c] = 3;
      for (let c = 9; c < 12; c++) base[r][c] = 3;
    }
    const anatomy = { neckRow: 14, waistRow: 26, kneeRow: 29, ankleRow: 31 };

    for (const orientation of [0, 2]) {
      for (const f of generateAttackTopDown(base, anatomy, orientation)) {
        // No fully transparent row between the top of the body and the feet.
        const rows = f.map(row => row.some(v => v !== 0));
        const first = rows.indexOf(true);
        const last = rows.lastIndexOf(true);
        expect(rows.slice(first, last + 1).every(Boolean)).toBe(true);
      }
    }
  });
});
