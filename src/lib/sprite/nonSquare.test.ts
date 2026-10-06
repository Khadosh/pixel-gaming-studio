import { describe, it, expect } from 'vitest';
import {
  flipVertical,
  rotate90,
  rotateFrameFree,
  shiftArea,
  shiftDown,
  shiftFrame,
  shiftRight,
  squash,
  stretchBody,
} from './transforms';
import { analyzeBodySegments } from './anatomy';
import { resolveMembers } from './anatomyResolver';
import type { Frame } from '../types';

// A canvas is not always square: a 448x224 or 512x320 map drawing is a real
// case. Every primitive here used to read `frame.length` (the HEIGHT) and use
// that same number as the column bound, so everything past column `height` was
// dropped. These tests pin the width/height split down.

/** `height` rows of `width` zeros. */
function blank(width: number, height: number): Frame {
  return Array.from({ length: height }, () => Array<number>(width).fill(0));
}

function dimsOf(frame: Frame) {
  return { height: frame.length, width: frame[0]?.length ?? 0 };
}

describe('transforms on non-square frames', () => {
  it('shiftFrame keeps the canvas shape and moves pixels past column=height', () => {
    // 3 rows x 6 columns: every column from 3 on used to be unreachable.
    const frame = blank(6, 3);
    frame[0][4] = 7;

    const out = shiftFrame(frame, 1, 1);

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[1][5]).toBe(7);
    expect(out[0][4]).toBe(0);
  });

  it('flipVertical flips the whole width, not just the first `height` columns', () => {
    const frame = blank(6, 3);
    frame[0][5] = 1; // top-right corner, column 5 > height 3
    frame[2][0] = 2;

    const out = flipVertical(frame);

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[2][5]).toBe(1);
    expect(out[0][0]).toBe(2);
    expect(out[0][5]).toBe(0);
  });

  it('rotate90 returns a frame with the dimensions SWAPPED', () => {
    const frame: Frame = [
      [1, 2, 3],
      [4, 5, 6],
    ]; // height 2, width 3

    const out = rotate90(frame);

    // h x w becomes w x h
    expect(dimsOf(out)).toEqual({ height: 3, width: 2 });
    expect(out).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
  });

  it('rotate90 four times gives back the original non-square frame', () => {
    const frame: Frame = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ];

    expect(rotate90(rotate90(rotate90(rotate90(frame))))).toEqual(frame);
  });

  it('rotateFrameFree rotates 180 degrees over the whole width', () => {
    const frame = blank(6, 3);
    frame[0][0] = 9;
    frame[2][5] = 4;

    const out = rotateFrameFree(frame, 180, { r: 1, c: 2.5 });

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[2][5]).toBe(9);
    expect(out[0][0]).toBe(4);
  });

  it('shiftDown keeps the full width', () => {
    const frame = blank(6, 3);
    frame[0][5] = 3;

    const out = shiftDown(frame, 1);

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[1][5]).toBe(3);
    expect(out[0][5]).toBe(0);
  });

  it('shiftRight clips against the width, not the height', () => {
    const frame = blank(6, 3);
    frame[1][0] = 5;

    const out = shiftRight(frame, 4);

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[1][4]).toBe(5);
    expect(out[1][0]).toBe(0);
  });

  it('squash removes rows without cropping the width', () => {
    const frame: Frame = [
      [1, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2],
      [3, 3, 3, 3, 3, 3],
    ];

    const out = squash(frame, [1]);

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[0]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(out[1]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(out[2]).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('stretchBody allocates the real canvas shape', () => {
    const frame = blank(6, 3);
    frame[2][5] = 8;

    const out = stretchBody(frame, 1);

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[2][5]).toBe(8);
  });

  it('shiftArea moves an area that lives past column=height', () => {
    const frame = blank(6, 3);
    frame[1][4] = 6;

    const out = shiftArea(frame, { startR: 1, endR: 1, startC: 4, endC: 4 }, 0, 1);

    expect(dimsOf(out)).toEqual({ height: 3, width: 6 });
    expect(out[1][5]).toBe(6);
    expect(out[1][4]).toBe(0);
  });
});

describe('rotate90 on square frames (unchanged)', () => {
  /** What rotate90 did before non-square support: a size x size buffer. */
  function legacyRotate90(frame: Frame): Frame {
    const size = frame.length;
    const next = Array.from({ length: size }, () => Array<number>(size).fill(0));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        next[c][size - 1 - r] = frame[r][c];
      }
    }
    return next;
  }

  it('matches the legacy square implementation pixel for pixel', () => {
    for (const size of [1, 2, 3, 8, 16]) {
      const frame = blank(size, size);
      let n = 1;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          frame[r][c] = (r + c) % 3 === 0 ? 0 : n++;
        }
      }
      expect(rotate90(frame)).toEqual(legacyRotate90(frame));
      expect(dimsOf(rotate90(frame))).toEqual({ height: size, width: size });
    }
  });
});

describe('anatomy on non-square frames', () => {
  // 8 rows x 16 columns. The widest torso row reaches column 13, well past the
  // old column bound of `frame.length` = 8.
  function wideFigure(): Frame {
    const frame = blank(16, 8);
    const fill = (r: number, from: number, to: number) => {
      for (let c = from; c <= to; c++) frame[r][c] = 1;
    };
    fill(1, 6, 9);
    fill(2, 6, 9);
    fill(3, 6, 9);
    fill(4, 2, 13); // arms out: the widest row of the torso scan
    fill(5, 6, 9);
    fill(6, 6, 9);
    fill(7, 6, 9);
    return frame;
  }

  it('analyzeBodySegments scans the full width for the torso', () => {
    const segments = analyzeBodySegments(wideFigure());

    expect(segments.torsoLeft).toBe(2);
    expect(segments.torsoRight).toBe(13);
    expect(segments.torsoCenterCol).toBe(7);
    expect(segments.pivots.rightShoulder.c).toBe(13);
    // Rows still come from the height.
    expect(segments.leftLegArea.endR).toBe(7);
  });

  it('analyzeBodySegments falls back on width/height, not on one size', () => {
    const segments = analyzeBodySegments(blank(16, 8));

    expect(segments.torsoRight).toBe(15);
    expect(segments.torsoCenterCol).toBe(8);
    expect(segments.leftLegArea.endR).toBe(7);
    expect(segments.rightLegArea.endC).toBe(15);
  });

  it('resolveMembers infers head pixels across the full width', () => {
    const members = resolveMembers(wideFigure());

    // Rows 1..3, columns 6..9: 12 pixels. The old column bound (8) saw only 6.
    expect(members.head.pixels.length).toBe(12);
    expect(members.head.bounds.endC).toBe(9);
  });
});
