// @vitest-environment node
// `pgs diff` (Khadosh/pixel-gaming-studio#52): the count, folder against
// folder, and the sheet that shows where.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diffPaths, diffSheet, lineDiff, matchesPath, pixelDiff, type TreeDiff } from './diff';
import { blankImage, readPng, setPixel, writePng, type Rgba } from './png';
import { runCommand } from './commands';
import { PNG } from 'pngjs';

let dirs: string[] = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'pgs52-')); dirs.push(d); return d; };

function figure(): Rgba {
  const img = blankImage(40, 30);
  for (let y = 5; y < 25; y++) for (let x = 10; x < 30; x++) setPixel(img, x, y, [120, 60, 160, 255]);
  return img;
}
const copy = (img: Rgba): Rgba => ({ ...img, data: new Uint8Array(img.data) });

describe('pixelDiff', () => {
  it('counts color and alpha apart and boxes what changed', () => {
    const a = figure(), b = copy(a);
    setPixel(b, 10, 5, [121, 60, 160, 255]); // one color, seen in both
    setPixel(b, 3, 2, [0, 0, 0, 255]); // appeared
    setPixel(b, 29, 24, [120, 60, 160, 128]); // another opacity
    const d = pixelDiff(a, b);
    expect(d).toMatchObject({ differ: 3, alpha: 2, box: { x: 3, y: 2, w: 27, h: 23 } });
  });

  it('two transparent pixels are equal whatever RGB they carry', () => {
    const a = figure(), b = copy(a);
    b.data[3] = 0; b.data[0] = 255; // pixel 0,0: transparent in both, other RGB
    expect(pixelDiff(a, b).differ).toBe(0);
  });

  // estudio#115: PIL's getbbox called «equal» two pictures 7,439 px apart,
  // because it looks at alpha only. A color change under the same alpha counts.
  it('a recolor that leaves the alpha alone still counts', () => {
    const a = figure(), b = copy(a);
    for (let y = 5; y < 25; y++) for (let x = 10; x < 30; x++) setPixel(b, x, y, [119, 60, 160, 255]);
    expect(pixelDiff(a, b)).toMatchObject({ differ: 400, alpha: 0 });
  });
});

describe('lineDiff and matchesPath', () => {
  it('lines removed and added as multisets', () => {
    expect(lineDiff('a\nb\nb\nc', 'b\na\nc\nd')).toEqual({ removed: 1, added: 1 });
  });
  it('a piece of the path, or the whole path with * and ?', () => {
    expect(matchesPath('art/gente/ana.png', 'gente')).toBe(true);
    expect(matchesPath('art/gente/ana.png', 'art/*.png')).toBe(true);
    expect(matchesPath('art/gente/ana.png', '*.txt')).toBe(false);
  });
});

describe('diffPaths and the command', () => {
  function pair() {
    const root = tmp(), a = join(root, 'a'), b = join(root, 'b');
    mkdirSync(join(a, 'sub'), { recursive: true }); mkdirSync(join(b, 'sub'), { recursive: true });
    const img = figure();
    writePng(join(a, 'igual.png'), img); writePng(join(b, 'igual.png'), img);
    const moved = copy(img);
    for (let x = 12; x < 19; x++) setPixel(moved, x, 24, [0, 0, 0, 0]); // 7 px off the hem
    writePng(join(a, 'sub', 'traba.png'), img); writePng(join(b, 'sub', 'traba.png'), moved);
    writePng(join(a, 'alto.png'), img); writePng(join(b, 'alto.png'), blankImage(40, 31));
    writeFileSync(join(a, 'dibujo.txt'), 'id: x\n.#\n##\n'); writeFileSync(join(b, 'dibujo.txt'), 'id: x\n.#\n#.\n');
    writeFileSync(join(a, 'solo.txt'), 'x'); writeFileSync(join(b, 'nuevo.txt'), 'y');
    mkdirSync(join(a, '.git')); writeFileSync(join(a, '.git', 'HEAD'), 'x');
    return { root, a, b };
  }

  it('says each file that changed and how, and nothing about the equal ones', () => {
    const { a, b } = pair();
    const t = diffPaths(a, b);
    expect(t).toMatchObject({ files: 6, same: 1, onlyA: ['solo.txt'], onlyB: ['nuevo.txt'] });
    expect(t.changed.map(c => [c.path, c.kind])).toEqual([['alto.png', 'size'], ['dibujo.txt', 'text'], ['sub/traba.png', 'pixels']]);
    const traba = t.changed.find(c => c.kind === 'pixels')!;
    expect(traba.kind === 'pixels' && traba.diff).toMatchObject({ differ: 7, alpha: 7, box: { x: 12, y: 24, w: 7, h: 1 } });
    expect(diffPaths(a, b, ['sub']).changed).toHaveLength(1);
  });

  it('a PNG with other bytes and the same pixels is equal, and said', () => {
    const root = tmp();
    const img = figure();
    writePng(join(root, 'a.png'), img);
    // The same pixels through another encoder: pngjs with another filter.
    const p = new PNG({ width: img.width, height: img.height, filterType: 0 }); p.data = Buffer.from(img.data);
    writeFileSync(join(root, 'b.png'), PNG.sync.write(p, { filterType: 0 }));
    const t = diffPaths(join(root, 'a.png'), join(root, 'b.png'));
    expect(t).toMatchObject({ same: 1, changed: [], samePixels: ['a.png'] });
  });

  it('the command answers the count and draws the sheet', async () => {
    const { root, a, b } = pair();
    const out = join(root, 'lamina.png');
    const r = await runCommand('diff', { a, b, out });
    expect(r.text).toContain('6 files: 1 equal, 3 differ, 1 only in a, 1 only in b');
    expect(r.text).toContain('sub/traba.png: 7 px differ (0.58 %), 7 in alpha · in 12,24 7x1 of 40x30');
    expect(r.text).toContain('alto.png: size 40x30 → 40x31');
    expect(r.text).toContain('dibujo.txt: −1 +1 lines');
    const sheet = readPng(out);
    // Seven pixels of a 40x30 drawing, whole and blown up 5 times (160 / 30).
    let magenta = 0;
    for (let i = 0; i < sheet.data.length; i += 4) if (sheet.data[i] === 255 && sheet.data[i + 1] === 0 && sheet.data[i + 2] === 255) magenta++;
    expect(magenta).toBe(7 * 25);
    expect(r.png).toBeDefined();
  });

  it('a big picture is cut to what changed, a sprite is shown whole', () => {
    const big = blankImage(600, 400, [90, 80, 70, 255]), moved = copy(big);
    for (let x = 300; x < 303; x++) setPixel(moved, x, 200, [0, 0, 0, 255]);
    const t: TreeDiff = { files: 1, same: 0, samePixels: [], onlyA: [], onlyB: [], changed: [{ path: 'sala.png', kind: 'pixels', diff: pixelDiff(big, moved) }] };
    const sheet = diffSheet(t, (_, side) => (side === 'a' ? big : moved))!;
    // 3 + 2·6 columns by 1 + 2·6 rows, blown up 8 times: not 600x400.
    expect(sheet.image.height).toBeLessThan(160);
    const small = figure(), b = copy(small);
    setPixel(b, 20, 10, [0, 0, 0, 255]);
    const t2: TreeDiff = { ...t, changed: [{ path: 'x.png', kind: 'pixels', diff: pixelDiff(small, b) }] };
    const s2 = diffSheet(t2, (_, side) => (side === 'a' ? small : b))!;
    // 30 rows whole at 5x.
    expect(s2.image.height).toBeGreaterThanOrEqual(150);
  });

  it('two equal folders: no sheet, no picture', async () => {
    const root = tmp(), a = join(root, 'a'), b = join(root, 'b');
    mkdirSync(a); mkdirSync(b);
    writePng(join(a, 'x.png'), figure()); copyFileSync(join(a, 'x.png'), join(b, 'x.png'));
    const r = await runCommand('diff', { a, b, out: join(root, 'l.png') });
    expect(r.text).toContain('1 files: 1 equal, 0 differ');
    expect(r.png).toBeUndefined();
  });
});
