// pixelize method=trace: a reference already in pixel art, traced without washing it out.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankImage, writePng, type Rgba } from './png';
import { evenEdges, fileTeeth, foldColors, median5, trace, traceBackground } from './trace';
import { runCommand } from './commands';

const BG: [number, number, number] = [214, 220, 226];
const INK: [number, number, number] = [40, 22, 30];
const SKIN: [number, number, number] = [236, 176, 140];

function put(img: Rgba, x: number, y: number, c: [number, number, number]) {
  const p = (y * img.width + x) * 4;
  img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
}
const mix = (a: number[], b: number[]) => a.map((v, i) => Math.round((v + b[i]) / 2)) as [number, number, number];

/** 60 x 60 at 6 px per cell, like an AI render: a skin square with an ink outline
 * one cell wide, over a flat background, every edge blurred by a 2 px blend. */
function reference(): Rgba {
  const img = blankImage(60, 60);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const cx = Math.floor(x / 6), cy = Math.floor(y / 6);
    const inSquare = cx >= 2 && cx <= 7 && cy >= 2 && cy <= 7;
    const rim = inSquare && (cx === 2 || cx === 7 || cy === 2 || cy === 7);
    put(img, x, y, !inSquare ? BG : rim ? INK : SKIN);
  }
  // the blur: the two pixels at each side of every edge become the mix
  const copy = new Uint8Array(img.data);
  for (let y = 1; y < 59; y++) for (let x = 1; x < 59; x++) {
    const at = (xx: number, yy: number) => [...copy.slice((yy * 60 + xx) * 4, (yy * 60 + xx) * 4 + 3)];
    const here = at(x, y), right = at(x + 1, y), down = at(x, y + 1);
    if (here.join() !== right.join()) put(img, x, y, mix(here, right));
    else if (here.join() !== down.join()) put(img, x, y, mix(here, down));
  }
  return img;
}

describe('trace', () => {
  it('keeps the colors of the reference: no cell is an average of an edge', () => {
    const cells = trace(reference(), { size: 10, maxColors: 4 });
    const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    expect(new Set(cells.values())).toEqual(new Set([hex(INK), hex(SKIN)]));
    // the background is out, the outline whole, the skin inside
    expect(cells.has(0)).toBe(false);
    expect(cells.get(2 * 10 + 2)).toBe(hex(INK));
    expect(cells.get(7 * 10 + 5)).toBe(hex(INK));
    expect(cells.get(4 * 10 + 4)).toBe(hex(SKIN));
    expect(cells.size).toBe(36);
  });

  it('cuts even cells like numpy, halves to the even neighbour', () => {
    expect(evenEdges(5, 2)).toEqual([0, 2, 5]);
    expect(evenEdges(7, 2)).toEqual([0, 4, 7]);
    expect(evenEdges(9, 3)).toEqual([0, 3, 6, 9]);
  });

  it('sharpens with a 5 x 5 median that repeats the border', () => {
    const img = blankImage(5, 1);
    [10, 20, 30, 40, 50].forEach((v, x) => put(img, x, 0, [v, v, v]));
    // x = 0 sees 10 10 10 20 30 per row: the median is 10
    expect([...median5(img)].filter((_, i) => i % 3 === 0)).toEqual([10, 20, 30, 40, 50]);
  });

  it('folds near colors into the most used, never averaging', () => {
    const cells = new Map<number, [number, number, number]>([
      [0, [100, 100, 100]], [1, [100, 100, 100]], [2, [102, 100, 100]], [3, [10, 200, 30]],
    ]);
    const out = foldColors(cells, 2, 8);
    expect(out.get(2)).toEqual([100, 100, 100]);
    expect(out.get(3)).toEqual([10, 200, 30]);
  });

  it('files a tooth off a straight edge, keeps a one-cell line', () => {
    const A: [number, number, number] = [0, 0, 0], B: [number, number, number] = [255, 255, 255];
    const grid = (rows: string[]) => new Map(rows.flatMap((r, y) => [...r].map((ch, x) => [y * 3 + x, ch === 'a' ? A : B] as const)));
    expect(fileTeeth(grid(['aaa', 'aba', 'bbb']), 3).get(4)).toEqual(A);
    expect(fileTeeth(grid(['aba', 'aba', 'aba']), 3).get(4)).toEqual(B);
  });

  it('takes the background out, and its tinted rim takes the outline', () => {
    const bg: [number, number, number] = [140, 240, 180];
    const cells = new Map<number, [number, number, number]>();
    for (let p = 0; p < 25; p++) cells.set(p, bg);
    for (const x of [2, 3, 4]) for (const y of [2, 3, 4]) cells.set(y * 5 + x, INK);
    cells.set(2 * 5 + 2, [80, 140, 100]); // a cell straddling the edge, tinted green
    const kept = traceBackground(cells, 5);
    expect(kept.size).toBe(9);
    expect([...kept.values()].every((c) => c === INK)).toBe(true);
  });

  it('pixelize method=trace writes the asset, colors dark to light, and stamps the method', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-trace-'));
    try {
      writePng(join(dir, 'ref.png'), reference());
      const out = join(dir, 'ref.pss.json');
      await runCommand('pixelize', { png: join(dir, 'ref.png'), out, size: 10, method: 'trace', max_colors: 4 });
      const a = JSON.parse(readFileSync(out, 'utf8'));
      expect(Object.values(a.palette)).toEqual(['#28161e', '#ecb08c']);
      expect(a.generatedBy.args.method).toBe('trace');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
