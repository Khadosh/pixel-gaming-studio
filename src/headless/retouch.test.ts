// @vitest-environment node
// The bridge between a recipe and a hand: `generated_by:` says what made a
// drawing, and the retouch beside it survives running the recipe again.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecipe } from './mapfile';
import { runCommand } from './commands';
import { fromAscii, peekGeneratedBy } from './ascii';
import { readPng } from './png';
import { checkOverwrite, isRetouchPath, retouchPathOf } from './retouch';

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
    expect(again.text).toContain('ladera.retoque.txt (');

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

  it('a retouch with no retouch_of header is an error, not a drawing', async () => {
    const recipe = ladera();
    await runCommand('map_export', { recipe });
    writeFileSync(retouchPathOf(drawing()), 'id: x\nsize: 2x1\nk = #000000\n==\n.k\n');
    await expect(runCommand('map_export', { recipe })).rejects.toThrow(/retouch_of/);
  });
});
