// Writing fewer columns in a text drawing (Khadosh/pixel-gaming-studio#27):
// a frame that comes from another one (`== blink 1 < blink 0`, then only the
// rows that change), a frame written by its left half (`half: left`) and a
// whole animation that is another one mirrored (`anim: walk_left
// mirror_of=walk_right`). `ascii.ts` reads and writes them; this file is the
// arithmetic both directions share, so what `toAscii` writes back is exactly
// what `fromAscii` will rebuild. Pure, no Node: the web editor saves through
// it too.

import type { Frame } from '../lib/types';

/** How a frame comes from an earlier one: mirrored, then shifted, then these rows. */
export interface FrameDerivation {
  /** The reference as it was written after "<" ("blink 0", "3"), for writing it back the same. */
  ref: string;
  /** Index (in the asset) of the frame it comes from; always an earlier one. */
  from: number;
  flip?: 'h' | 'v';
  shift?: [number, number];
  /** Rows the text listed ("N: …"), in the order written. */
  rows: number[];
}

/** Width of the half of a row that `half: left` writes: the middle column is the left half's. */
export function halfWidth(width: number): number {
  return Math.ceil(width / 2);
}

/** A row written by its left half, completed by its mirror. */
export function mirrorHalf(half: number[], width: number): number[] {
  const row = new Array<number>(width).fill(0);
  half.forEach((v, x) => { row[x] = v; row[width - 1 - x] = v; });
  return row;
}

/** Whether a row reads the same from either end (so `half: left` can hold it). */
export function symmetricRow(row: number[]): boolean {
  for (let x = 0, w = row.length; x < w / 2; x++) if (row[x] !== row[w - 1 - x]) return false;
  return true;
}

export function flipFrame(grid: Frame, flip: 'h' | 'v'): Frame {
  return flip === 'h' ? grid.map(row => [...row].reverse()) : [...grid].reverse().map(row => [...row]);
}

/** Moves the picture by (dx, dy); what leaves the canvas is lost, what it uncovers is clear. */
export function shiftFrame(grid: Frame, dx: number, dy: number): Frame {
  const h = grid.length, w = grid[0]?.length ?? 0;
  const out: Frame = Array.from({ length: h }, () => new Array<number>(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x + dx, ny = y + dy;
      if (grid[y][x] && nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny][nx] = grid[y][x];
    }
  }
  return out;
}

/** The frame a derivation starts from, before its own rows: the reference mirrored and shifted. */
export function derivedBase(ref: Frame, d: Pick<FrameDerivation, 'flip' | 'shift'>): Frame {
  let out = ref.map(row => [...row]);
  if (d.flip) out = flipFrame(out, d.flip);
  if (d.shift) out = shiftFrame(out, d.shift[0], d.shift[1]);
  return out;
}

export function sameRow(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function sameFrame(a: Frame, b: Frame): boolean {
  return a.length === b.length && a.every((row, y) => sameRow(row, b[y]));
}
