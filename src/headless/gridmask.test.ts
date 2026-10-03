// grid_mask: the organic autotile (a grid of cells → a per-pixel shape that hides the grid).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Rgba } from './png';
import { gridMask } from './gridmask';
import { mapLint } from './maplint';
import { runCommand } from './commands';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pss-gridmask-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// A little maze: corridors one cell wide, a room, corners both ways.
const MAZE = [
  '#########',
  '#...#...#',
  '#.#.#.#.#',
  '#.#...#.#',
  '#.#####.#',
  '#.......#',
  '#########',
];

const WALL = '#2c2a33', FLOOR = '#8d8a86';

function toImage(rows: string[]): Rgba {
  const h = rows.length, w = rows[0].length;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x] === '#' ? WALL : FLOOR, i = (y * w + x) * 4;
    data.set([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255], i);
  }
  return { width: w, height: h, data };
}

describe('grid_mask', () => {
  it('hides the grid: no straight border, no lone pixel, corners cut round', () => {
    const m = gridMask({ grid: MAZE, seed: 3 });
    expect(m.width).toBe(9 * 16);
    expect(m.height).toBe(7 * 16);
    const img = toImage(m.rows);
    const lint = mapLint(img, { materials: { wall: [WALL], floor: [FLOOR] }, architecture: false });
    expect(lint.straight).toEqual([]);
    expect(lint.loose).toBe(0);
    // the very corner pixel of a floor cell between two walls goes to the wall: the corner is cut
    const cornerFloor = m.rows[1 * 16][1 * 16];      // top-left pixel of floor cell (1,1): two walls touch it
    expect(cornerFloor).toBe('#');
  });

  it('keeps the middle of every floor cell, so a corridor never closes', () => {
    const m = gridMask({ grid: MAZE, seed: 9, wobble: 6, keep: { '.': 4 } });
    for (let cy = 0; cy < MAZE.length; cy++) for (let cx = 0; cx < MAZE[0].length; cx++) {
      if (MAZE[cy][cx] !== '.') continue;
      for (let y = cy * 16 + 4; y < cy * 16 + 12; y++)
        for (let x = cx * 16 + 4; x < cx * 16 + 12; x++) expect(m.rows[y][x]).toBe('.');
    }
  });

  it('is deterministic by seed and changes with it', () => {
    expect(gridMask({ grid: MAZE, seed: 5 }).rows).toEqual(gridMask({ grid: MAZE, seed: 5 }).rows);
    expect(gridMask({ grid: MAZE, seed: 5 }).rows).not.toEqual(gridMask({ grid: MAZE, seed: 6 }).rows);
  });

  it('the command reads the grid from a file and writes the mask', async () => {
    const gridPath = join(dir, 'grid.json'), out = join(dir, 'mask.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(gridPath, JSON.stringify({ grid: MAZE }));
    const res = await runCommand('grid_mask', { grid: gridPath, out, keep: { '.': 3 } });
    expect(res.text).toMatch(/144x112/);
    const m = JSON.parse(readFileSync(out, 'utf8'));
    expect(m.rows.length).toBe(112);
    expect(() => gridMask({ grid: ['##', '#'] })).toThrow(/row 1/);
  });
});
