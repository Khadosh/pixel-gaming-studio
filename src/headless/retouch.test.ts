// @vitest-environment node
// The bridge between a recipe and a hand: `generated_by:` says what made a
// drawing, and the retouch beside it survives running the recipe again.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import { createAsset, saveAsset } from './asset';
import { applyDrawOps } from './ops';
import { readRecipe } from './mapfile';
import { runCommand } from './commands';
import { formatGeneratedBy, fromAscii, peekGeneratedBy } from './ascii';
import { blankImage, readPng, writePng } from './png';
import { checkOverwrite, isRetouchPath, madeBy, relTo, retouchPathOf } from './retouch';

const FIX = join(__dirname, 'fixtures/mapas');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pss-retoque-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** The ladera recipe, exporting its PNGs to out/, drawings to txt/ and assets to src/. */
function ladera(): string {
  for (const f of ['ladera.json', 'visuals.json', 'paleta.pss.json']) copyFileSync(join(FIX, f), join(dir, f));
  const recipe = readRecipe(join(FIX, 'ladera.receta.json'));
  const path = join(dir, 'r.json');
  writeFileSync(path, JSON.stringify({
    ...recipe,
    export: { ...recipe.export, png: 'out', txt: 'txt', src: 'src', ground: undefined },
  }));
  return path;
}

const drawing = () => join(dir, 'txt', 'ladera.txt');
const groundAsset = () => JSON.parse(readFileSync(join(dir, 'src', 'ladera.pss.json'), 'utf8'));

/** The glyph and hex of the first color of the exported drawing's legend. */
function firstColor(text: string): { glyph: string; hex: string } {
  const m = /^(\S) = (#[0-9a-f]{6})/m.exec(text)!;
  return { glyph: m[1], hex: m[2] };
}

describe('generated_by on what a recipe writes', () => {
  it('names the recipe and the layer, relative to the drawing', async () => {
    await runCommand('map_export', { recipe: ladera() });
    const by = peekGeneratedBy(readFileSync(drawing(), 'utf8'));
    expect(by).toEqual({ by: 'map_export', args: { recipe: '../r.json', layer: 'ground' } });
    // Every layer of the recipe, not only the ground.
    const mechones = peekGeneratedBy(readFileSync(join(dir, 'txt', 'ladera_mechones.txt'), 'utf8'));
    expect(mechones!.args.layer).toBe('mechones');
    // And it reaches the .pss.json the game reads, as data.
    expect(groundAsset().generatedBy).toEqual(by);
  });

  it('runs again over its own drawings without complaining', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const first = readFileSync(drawing(), 'utf8');
    await runCommand('map_export', { recipe });
    expect(readFileSync(drawing(), 'utf8')).toBe(first);
  });

  it('refuses to write over a drawing that does not say what made it', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const handMade = readFileSync(drawing(), 'utf8').replace(/^generated_by:.*\n/m, '');
    writeFileSync(drawing(), handMade);
    await expect(runCommand('map_export', { recipe })).rejects.toThrow(/drawn by hand/);
    // Nothing was written: the drawing is still the hand-made one.
    expect(readFileSync(drawing(), 'utf8')).toBe(handMade);
    // And the other layers were not written either (the check runs first).
    const other = readFileSync(join(dir, 'txt', 'ladera_mechones.txt'), 'utf8');
    expect(peekGeneratedBy(other)).toBeTruthy();
    await runCommand('map_export', { recipe, force: true });
    expect(peekGeneratedBy(readFileSync(drawing(), 'utf8'))).toBeTruthy();
  });

  it('refuses to write over a drawing another recipe owns', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    writeFileSync(drawing(), readFileSync(drawing(), 'utf8').replace('recipe=../r.json', 'recipe=../otra.json'));
    await expect(runCommand('map_export', { recipe })).rejects.toThrow(/was made by "map_export recipe=\.\.\/otra\.json layer=ground"/);
  });

  it('checkOverwrite says yes to a file that is not there and to its own output', () => {
    const by = { by: 'map_export', args: { recipe: '../r.json', layer: 'ground' } };
    const missing = join(dir, 'nope.txt');
    expect(checkOverwrite(missing, by)).toEqual({ path: missing, ok: true });
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'id: a\ngenerated_by: map_export recipe=../r.json layer=ground\nk = #000\n==\nk\n');
    expect(checkOverwrite(f, by).ok).toBe(true);
    expect(checkOverwrite(f, { by: 'variant', args: {} }).ok).toBe(false);
  });

  it('knows a retouch file by its name', () => {
    expect(retouchPathOf('suelos/camino.txt')).toBe('suelos/camino.retoque.txt');
    expect(isRetouchPath('suelos/camino.retoque.txt')).toBe(true);
    expect(isRetouchPath('suelos/camino.txt')).toBe(false);
  });
});

describe('the retouch survives running the recipe again', () => {
  /** Writes a retouch of the exported ladera that paints 3 px of `glyph` at row 5. */
  function writeRetouch(text: string, glyph: string, hex: string): { x: number; y: number } {
    const size = /^size: (\d+)x(\d+)/m.exec(text)!;
    const [w, h] = [Number(size[1]), Number(size[2])];
    const rows = Array.from({ length: h }, (_, r) =>
      Array.from({ length: w }, (_, c) => (r === 5 && c >= 7 && c < 10 ? glyph : '.')).join(''));
    writeFileSync(retouchPathOf(drawing()), [
      'id: ladera_retoque', 'name: Retoque de la ladera', 'category: terrain', `size: ${w}x${h}`,
      'retouch_of: ladera.txt', '',
      `${glyph} = ${hex} retoque`, '',
      '==', ...rows, '',
    ].join('\n'));
    return { x: 7, y: 5 };
  }

  it('lays the retouch on its own layer, leaves the drawing alone and puts it in the PNG', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const generated = readFileSync(drawing(), 'utf8');
    const { glyph, hex } = firstColor(generated);
    const { x, y } = writeRetouch(generated, glyph, hex);

    const again = await runCommand('map_export', { recipe });
    expect(again.text).toContain('ladera.retoque.txt: 3 px pintados · <1% del dibujo lo decide la capa');

    // 1. the drawing is byte for byte the recipe's output: the recipe is still the source
    expect(readFileSync(drawing(), 'utf8')).toBe(generated);

    // 2. the asset the game reads has the base untouched and the retouch above it
    const asset = groundAsset();
    expect(asset.layers.map((l: { name: string }) => l.name)).toEqual(['Base', 'retoque']);
    const base = fromAscii(generated).asset.layers![0].frames[0];
    expect(asset.layers[0].frames[0]).toEqual(base);
    const over = asset.layers[1].frames[0];
    expect(over[y].slice(x, x + 3).every((v: number) => v !== 0)).toBe(true);
    expect(over[y][x - 1]).toBe(0);

    // 3. and the PNG carries it
    const png = readPng(join(dir, 'out', 'ladera.png'));
    const at = (px: number, py: number) => {
      const i = (py * png.width + px) * 4;
      return '#' + [0, 1, 2].map(k => png.data[i + k].toString(16).padStart(2, '0')).join('');
    };
    expect(at(x, y)).toBe(hex);
  });

  it('keeps the retouch after the recipe changes the base', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const generated = readFileSync(drawing(), 'utf8');
    const { glyph, hex } = firstColor(generated);
    const { x, y } = writeRetouch(generated, glyph, hex);
    // A different seed repaints every layer: the retouch is laid over the new base.
    const r = JSON.parse(readFileSync(recipe, 'utf8'));
    writeFileSync(recipe, JSON.stringify({ ...r, seed: (r.seed ?? 0) + 7 }));
    await runCommand('map_export', { recipe, force: true });
    const repainted = readFileSync(drawing(), 'utf8');
    expect(repainted).not.toBe(generated);
    const asset = groundAsset();
    expect(asset.layers[1].name).toBe('retoque');
    expect(asset.layers[1].frames[0][y].slice(x, x + 3).every((v: number) => v !== 0)).toBe(true);
  });

  it('retouch=false ignores the file', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const generated = readFileSync(drawing(), 'utf8');
    const { glyph, hex } = firstColor(generated);
    writeRetouch(generated, glyph, hex);
    await runCommand('map_export', { recipe, retouch: false });
    expect(groundAsset().layers.length).toBe(1);
    expect(existsSync(retouchPathOf(drawing()))).toBe(true);
  });

  /** A retouch that takes `n` pixels out of the first row of the drawing that has any. */
  function writeErase(text: string, n: number): { y: number; xs: number[] } {
    const size = /^size: (\d+)x(\d+)/m.exec(text)!;
    const [w, h] = [Number(size[1]), Number(size[2])];
    const grid = fromAscii(text).asset.layers![0].frames[0];
    const y = grid.findIndex(row => row.filter(Boolean).length >= n);
    const xs = grid[y].flatMap((v, x) => (v ? [x] : [])).slice(0, n);
    const rows = Array.from({ length: h }, (_, r) =>
      Array.from({ length: w }, (_, c) => (r === y && xs.includes(c) ? '!' : '.')).join(''));
    writeFileSync(retouchPathOf(drawing()), [
      'id: ladera_retoque', 'name: Retoque de la ladera', 'category: terrain', `size: ${w}x${h}`,
      'retouch_of: ladera.txt', '', '', '==', ...rows, '',
    ].join('\n'));
    return { y, xs };
  }

  it('takes a pixel out: the layer wins over the recipe, and the drawing is still the recipe\'s', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const generated = readFileSync(drawing(), 'utf8');
    const { y, xs } = writeErase(generated, 3);

    const again = await runCommand('map_export', { recipe });
    expect(again.text).toContain('ladera.retoque.txt: 0 px pintados, 3 borrados');

    // 1. the drawing on disk did not change: the recipe is still the source
    expect(readFileSync(drawing(), 'utf8')).toBe(generated);

    // 2. the asset the game reads has the hole, because a layer cannot paint one
    const asset = groundAsset();
    expect(asset.layers.map((l: { name: string }) => l.name)).toEqual(['Base', 'retoque']);
    for (const x of xs) expect(asset.layers[0].frames[0][y][x]).toBe(0);
    expect(asset.layers[1].frames[0][y].every((v: number) => v === 0)).toBe(true);

    // 3. and the PNG has nothing there either
    const png = readPng(join(dir, 'out', 'ladera.png'));
    for (const x of xs) expect(png.data[(y * png.width + x) * 4 + 3]).toBe(0);
  });

  it('the erase survives running the recipe again, over a base it repainted', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const { y, xs } = writeErase(readFileSync(drawing(), 'utf8'), 2);
    // Two more runs, the second over a base painted from another seed.
    await runCommand('map_export', { recipe });
    const r = JSON.parse(readFileSync(recipe, 'utf8'));
    writeFileSync(recipe, JSON.stringify({ ...r, seed: (r.seed ?? 0) + 7 }));
    await runCommand('map_export', { recipe, force: true });
    const asset = groundAsset();
    for (const x of xs) expect(asset.layers[0].frames[0][y][x]).toBe(0);
    // And the retouch file was never written to: it is the hand's, not the command's.
    expect(readFileSync(retouchPathOf(drawing()), 'utf8')).toContain('retouch_of: ladera.txt');
  });

  it('warns when the layer decides more of the drawing than the recipe, and writes it anyway', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    const generated = readFileSync(drawing(), 'utf8');
    // Rub out every pixel of the drawing: 100% of it is the hand's now.
    const size = /^size: (\d+)x(\d+)/m.exec(generated)!;
    const grid = fromAscii(generated).asset.layers![0].frames[0];
    writeFileSync(retouchPathOf(drawing()), [
      'id: ladera_retoque', 'name: Retoque de la ladera', 'category: terrain', `size: ${size[1]}x${size[2]}`,
      'retouch_of: ladera.txt', '', '', '==',
      ...grid.map(row => row.map(v => (v ? '!' : '.')).join('')), '',
    ].join('\n'));

    const res = await runCommand('map_export', { recipe });
    expect(res.text).toContain('100% del dibujo lo decide la capa');
    expect(res.text).toContain('la capa de retoque decide el 100% del dibujo');
    expect(res.text).toContain('Subí las correcciones a la receta en ../r.json');
    // It is a warning and nothing else: the export ran and the files are there.
    expect(groundAsset().layers[0].frames[0].flat().every((v: number) => v === 0)).toBe(true);
    const applied = (res.data as { files: { layer: string; retouch?: { share: number; warning?: string } }[] }).files[0];
    expect(applied.retouch!.share).toBe(1);
    expect(applied.retouch!.warning).toBeTruthy();
  });

  it('does not warn for the handful of pixels a retouch is meant to be', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    writeErase(readFileSync(drawing(), 'utf8'), 3);
    const res = await runCommand('map_export', { recipe });
    expect(res.text).not.toContain('⚠');
    const applied = (res.data as { files: { retouch?: { warning?: string; share: number } }[] }).files[0];
    expect(applied.retouch!.warning).toBeUndefined();
    expect(applied.retouch!.share).toBeLessThan(0.2);
  });

  it('a retouch with no retouch_of header is an error, not a drawing', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    writeFileSync(retouchPathOf(drawing()), 'id: x\nsize: 2x1\nk = #000000\n==\n.k\n');
    await expect(runCommand('map_export', { recipe })).rejects.toThrow(/retouch_of/);
  });
});

describe('madeBy, the header of anything a command wrote', () => {
  it('writes a path relative to the file that carries it', () => {
    expect(relTo('/a/b/out/x.pss.json', '/a/b/recetas/r.json')).toBe('../recetas/r.json');
    expect(relTo('/a/x.pss.json', '/a/x.pss.json')).toBe('x.pss.json');
    // Far apart, the climb says nothing: the path as it was given is readable.
    expect(relTo('/a/b/c/d/e/f/g/x.pss.json', 'art/pss/src/y.pss.json')).toBe('art/pss/src/y.pss.json');
  });

  it('leaves out what the format cannot hold instead of failing to write', () => {
    const by = madeBy('variant', { path: 'caras/mei.pss.json', overlay: 'con espacio/x.txt', name: undefined, layer: '' });
    expect(by).toEqual({ by: 'variant', args: { path: 'caras/mei.pss.json' } });
    // A number is a value like any other, and 0 is not nothing.
    expect(madeBy('variant', { frame: 0, loop: false }).args).toEqual({ frame: '0', loop: 'false' });
    // The command name is always there, which is the part that carries the rule.
    expect(formatGeneratedBy(by)).toBe('variant path=caras/mei.pss.json');
    expect(formatGeneratedBy(madeBy('figure'))).toBe('figure');
  });
});

describe('every command that draws stamps it', () => {
  /** A one-frame red asset to derive things from. */
  function base(name = 'b.pss.json'): string {
    const path = join(dir, name);
    const a = createAsset({ id: basename(name, '.pss.json'), width: 8, palette: ['#ff0000', '#00ff00'] });
    applyDrawOps(a, 0, [{ op: 'rect', x: 1, y: 1, w: 5, h: 5, color: 1, fill: true }]);
    saveAsset(path, a);
    return path;
  }

  /** The PNG of a flat 8x4 grid, for the import commands. */
  function sheetPng(): string {
    const png = join(dir, 'sheet.png');
    const img = blankImage(8, 2, [10, 20, 30, 255]);
    writePng(png, img);
    return png;
  }

  const stampOf = (path: string) => (JSON.parse(readFileSync(path, 'utf8')) as SpriteAsset).generatedBy;

  it('variant says the base and the overlay it was painted from', async () => {
    const path = base();
    const overlay = join(dir, 'over.txt');
    writeFileSync(overlay, 'id: o\nsize: 8x8\n\ng = #00ff00\n\n==\n........\n.g......\n........\n........\n........\n........\n........\n........\n');
    const out = join(dir, 'sub', 'v.pss.json');
    await runCommand('variant', { path, out, overlay });
    expect(stampOf(out)).toEqual({ by: 'variant', args: { path: '../b.pss.json', overlay: '../over.txt' } });
  });

  it('figure says its recipe and its view', async () => {
    const recipe = join(dir, 'f.json');
    writeFileSync(recipe, JSON.stringify({
      id: 'f', skin: ['#f2c9a0', '#ef914f', '#b8613a'],
      hair: { style: 'topknot', tones: ['#4e484a', '#3b3643', '#2c2a33'] },
      top: { tones: ['#f4efe3', '#e6dcc6', '#bfb8a8'] },
      pants: ['#8d8a86', '#5f5c5a', '#3b3643'],
      shoes: ['#4a4650', '#2c2a33', '#2c2a33'],
      glow: '#c9a34c', anims: ['idle'],
    }));
    const out = join(dir, 'f.pss.json');
    await runCommand('figure', { recipe, out, view: 'back' });
    expect(stampOf(out)).toEqual({ by: 'figure', args: { recipe: 'f.json', view: 'back' } });
  });

  it('export_sheet stamps the JSON, because a PNG has nowhere to carry it', async () => {
    const path = base();
    const out = join(dir, 'art', 'b.png');
    await runCommand('export_sheet', { path, out, scale: 2 });
    const meta = JSON.parse(readFileSync(join(dir, 'art', 'b.json'), 'utf8'));
    expect(meta.meta.generated_by).toBe('export_sheet path=../b.pss.json scale=2');
  });

  it('the imports and the quantizers stamp theirs too', async () => {
    const png = sheetPng();
    const cut = join(dir, 'cut.pss.json');
    await runCommand('import_sheet', { png, out: cut, frame_width: 2, frame_height: 2 });
    expect(stampOf(cut)).toEqual({ by: 'import_sheet', args: { png: 'sheet.png', frame_width: '2', frame_height: '2' } });

    const pix = join(dir, 'pix.pss.json');
    await runCommand('pixelize', { png, out: pix, size: 4 });
    expect(stampOf(pix)!.by).toBe('pixelize');

    const ill = join(dir, 'ill.pss.json');
    await runCommand('illustrate', { png, out: ill, width: 4, height: 4 });
    expect(stampOf(ill)).toEqual({ by: 'illustrate', args: { png: 'sheet.png', width: '4', height: '4' } });
  });

  it('cutout stamps the piece and the picture with the hole, and terrain each of its pieces', async () => {
    const path = base('scene.pss.json');
    const piece = join(dir, 'piece.pss.json'), hole = join(dir, 'hole.pss.json');
    await runCommand('cutout', { path, out: piece, base_out: hole, rect: [0, 0, 0.5, 0.5] });
    expect(stampOf(piece)).toEqual({ by: 'cutout', args: { path: 'scene.pss.json' } });
    expect(stampOf(hole)).toEqual({ by: 'cutout', args: { path: 'scene.pss.json', hole: 'true' } });

    const recipe = join(dir, 'suelo.json');
    writeFileSync(recipe, JSON.stringify({
      seed: 1, cell: 8, grid: ['gg', 'gw'],
      materials: {
        g: { tones: ['#56864c', '#6fa05a'], layer: 1 },
        w: { tones: ['#3d6a8f', '#6f9fc4'], layer: 0 },
      },
      pieces: [{ id: 'brillos', materials: 'w', color: '#dbeeff', density: 0.3 }],
    }));
    const out = join(dir, 'suelo.pss.json');
    await runCommand('terrain', { recipe, out });
    expect(stampOf(out)).toEqual({ by: 'terrain', args: { recipe: 'suelo.json' } });
    expect(stampOf(join(dir, 'suelo_brillos.pss.json')))
      .toEqual({ by: 'terrain', args: { recipe: 'suelo.json', piece: 'brillos' } });
  });

  it('import_sheet with into does not claim an asset built elsewhere', async () => {
    const png = sheetPng();
    // A cut appended to a hand-drawn asset leaves it hand-drawn: the second
    // call did not make the asset, so it does not speak for it either way.
    const hand = join(dir, 'hand2.pss.json');
    saveAsset(hand, createAsset({ id: 'hand2', width: 2, palette: ['#ff0000'] }));
    const onto = join(dir, 'onto.pss.json');
    await runCommand('import_sheet', { png, out: onto, into: hand, frame_width: 2, frame_height: 2 });
    expect(stampOf(onto)).toBeUndefined();
    // And appended to one a command made, it keeps what that command said.
    const first = join(dir, 'one.pss.json');
    await runCommand('import_sheet', { png, out: first, frame_width: 2, frame_height: 2 });
    const joined = join(dir, 'two.pss.json');
    await runCommand('import_sheet', { png, out: joined, into: first, frame_width: 2, frame_height: 2 });
    expect(stampOf(joined)).toEqual(stampOf(first));
  });

  it('what only changes an asset leaves the header alone: a hand drawing stays one', async () => {
    const path = base('hand.pss.json');
    expect(stampOf(path)).toBeUndefined();
    await runCommand('draw', { path, frame: 0, ops: [{ op: 'pixel', x: 7, y: 7, color: 2 }] });
    await runCommand('despeckle', { path });
    await runCommand('resize', { path, width: 16, height: 16 });
    await runCommand('palette', { path, add: ['#0000ff'] });
    expect(stampOf(path)).toBeUndefined();
  });

  it('from_ascii and to_ascii carry what the drawing says, no more and no less', async () => {
    // A hand-drawn text stays hand-drawn through the round trip.
    const txt = join(dir, 'hand.txt');
    writeFileSync(txt, 'id: h\nsize: 2x1\n\nk = #000000\n\n==\n.k\n');
    const out = join(dir, 'h.pss.json');
    await runCommand('from_ascii', { txt, out });
    expect(stampOf(out)).toBeUndefined();
    const back = await runCommand('to_ascii', { path: out });
    expect(back.text).not.toContain('generated_by');

    // And one a command made says so, until it is promoted to the hand.
    const made = base('made.pss.json');
    const v = join(dir, 'v.pss.json');
    writeFileSync(join(dir, 'o.txt'), 'id: o\nsize: 8x8\n\ng = #00ff00\n\n==\n........\n.g......\n........\n........\n........\n........\n........\n........\n');
    await runCommand('variant', { path: made, out: v, overlay: join(dir, 'o.txt') });
    const carried = await runCommand('to_ascii', { path: v });
    expect(carried.text).toContain('generated_by: variant path=made.pss.json overlay=o.txt');
    const promoted = await runCommand('to_ascii', { path: v, generated_by: false });
    expect(promoted.text).not.toContain('generated_by');
  });
});
