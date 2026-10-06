import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FrameThumb } from '../Timeline/FrameThumb';
import { THUMB_SIZE } from '../../types';

interface Rect { x: number; y: number; w: number; h: number; color: string }

let rects: Rect[] = [];
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

/**
 * jsdom has no 2d context, so we record what the thumb paints. Without this
 * the component would bail out at `getContext` and never draw anything.
 */
beforeEach(() => {
  rects = [];
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return null;
    const ctx = {
      fillStyle: '',
      clearRect: () => {},
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ x, y, w, h, color: ctx.fillStyle });
      },
    };
    return ctx as unknown as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

const palette = { 0: 'transparent', 1: '#ff0000', 2: '#00ff00' };

/** Only the sprite pixels: the checkerboard is painted in 8px blocks. */
function spriteRects() {
  return rects.filter(r => r.color === '#ff0000' || r.color === '#00ff00');
}

describe('FrameThumb', () => {
  it('renders a frame that is wider than it is tall without throwing', () => {
    // 8 wide, 4 tall. The old thumb looped `size x size` and read frame[r][c]
    // unguarded, so rows 4..7 blew up and took the whole timeline with them.
    const frame = [
      [1, 0, 0, 0, 0, 0, 0, 2],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0, 1],
    ];

    expect(() =>
      render(
        <FrameThumb
          frame={frame}
          palette={palette}
          width={8}
          height={4}
          isActive
          label="0"
          onClick={() => {}}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(spriteRects()).toHaveLength(4);
  });

  it('scales a non-square frame by the longest side and letterboxes it', () => {
    const frame = [
      [1, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    render(
      <FrameThumb
        frame={frame}
        palette={palette}
        width={8}
        height={4}
        isActive={false}
        label="0"
        onClick={() => {}}
      />,
    );

    const scale = THUMB_SIZE / 8;
    const painted = spriteRects();
    expect(painted).toHaveLength(1);
    // Full width, so no horizontal offset; half the height, so centred.
    expect(painted[0]).toEqual({
      x: 0,
      y: (THUMB_SIZE - 4 * scale) / 2,
      w: scale,
      h: scale,
      color: '#ff0000',
    });
    // The drawing stays inside the 64px box.
    expect(painted[0].y + painted[0].h).toBeLessThanOrEqual(THUMB_SIZE);
  });

  it('draws a square frame exactly where it used to', () => {
    const size = 4;
    const frame = [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 2],
    ];
    render(
      <FrameThumb
        frame={frame}
        palette={palette}
        width={size}
        height={size}
        isActive={false}
        label="0"
        onClick={() => {}}
      />,
    );

    const scale = THUMB_SIZE / size;
    expect(spriteRects()).toEqual([
      { x: 1 * scale, y: 1 * scale, w: scale, h: scale, color: '#ff0000' },
      { x: 3 * scale, y: 3 * scale, w: scale, h: scale, color: '#00ff00' },
    ]);
  });

  it('fires onClick when the thumb is pressed', () => {
    const onClick = vi.fn();
    render(
      <FrameThumb
        frame={[[1]]}
        palette={palette}
        width={1}
        height={1}
        isActive={false}
        label="0"
        onClick={onClick}
      />,
    );
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
