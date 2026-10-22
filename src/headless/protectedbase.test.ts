// A drawing made by hand that declares `base: protected` (issue #32, the cat of
// el-patio): what is painted over it goes to its .retoque.txt, survives the base
// being redrawn, and no command writes over the file unless forced.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import { fromAscii, toAscii } from './ascii';
import { runCommand } from './commands';
import { guardWrite, isProtectedBase } from './guard';
import { readRecipe } from './mapfile';
import { peekProtectedBase, retouchAside } from './protectedbase';
import { checkOverwrite, madeBy } from './retouch';
import { composite } from './assetModel';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-base-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A 4x3 cat, drawn by hand, declared a base. */
const BASE = [
  'id: gato', 'name: Gato', 'category: character', 'size: 4x3',
  'base: protected',
  'description: drawn by hand; the retouch goes apart', '',
  'o = #2c2849 sombra', 'W = #ece9f2 blanco', '',
  '== idle 0', 'oWWo', 'WWWW', 'o..o', '',
].join('\n');

/** What the editor writes when a collar is painted on it and one pixel rubbed out. */
const RETOUCH = [
  'id: gato_retoque', 'name: Retoque de Gato', 'category: character', 'size: 4x3',
  'retouch_of: gato.txt', '',
  'r = #c0392b rojo', '',
  '==', '....', 'rr..', '...!', '',
].join('\n');

function write(name: string, text: string): string {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
}

/** The pixels of frame 0 as the game would get them, by hex. */
function seen(asset: SpriteAsset): string[][] {
  const grid = composite(asset, 0);
  return grid.map(row => row.map(v => (v ? asset.palette[v] : '.')));
}

describe('the header', () => {
  it('reads "base: protected" into the layout and writes it back', () => {
    const { layout, asset } = fromAscii(BASE, { sourcePath: 'gato.txt' });
    expect(layout.base).toBe('protected');
    // A property of the file, not of the asset: what is derived from a base is not a base.
    expect(JSON.stringify(asset)).not.toContain('protected');
    expect(toAscii(asset, { layout }).text).toContain('\nbase: protected\n');
  });

  it('takes only "protected", and never on a retouch layer', () => {
    expect(() => fromAscii(BASE.replace('base: protected', 'base: yes'), { sourcePath: 'g.txt' }))
      .toThrow(/g\.txt:5: base can only be "protected"/);
    expect(() => fromAscii(RETOUCH.replace('retouch_of: gato.txt', 'retouch_of: gato.txt\nbase: protected'), { sourcePath: 'r.txt' }))
      .toThrow(/a retouch layer \("retouch_of:"\) cannot be a base/);
  });

  it('is peeked from the header only, and a JSON or a PNG never is one', () => {
    expect(peekProtectedBase(BASE)).toBe(true);
    expect(peekProtectedBase(BASE.replace('base: protected\n', ''))).toBe(false);
    expect(peekProtectedBase('{ "id": "gato", "base": "protected" }')).toBe(false);
    // Past the first frame it is pixels, not a header.
    expect(peekProtectedBase(BASE.replace('base: protected\n', '') + '\nbase: protected\n')).toBe(false);
  });

  it('is one rule for the engine and the editor: a recipe made it, or it is a base', () => {
    expect(retouchAside({})).toBeUndefined();
    expect(retouchAside({ generatedBy: { by: 'map_export', args: {} } })).toBe('generated');
    expect(retouchAside({ base: 'protected' })).toBe('base');
  });
});

describe('nothing writes over a protected base', () => {
  it('to_ascii refuses, and writes with force=true', async () => {
    const txt = write('gato.txt', BASE);
    const other = join(dir, 'otro.pss.json');
    await runCommand('from_ascii', { text: BASE.replace('base: protected\n', '').replace('oWWo\nWWWW', 'oooo\noooo'), out: other });
    await expect(runCommand('to_ascii', { path: other, out: txt }))
      .rejects.toThrow(/gato\.txt declares "base: protected": it is not written over .*force=true/);
    expect(readFileSync(txt, 'utf8')).toBe(BASE);
    await runCommand('to_ascii', { path: other, out: txt, force: true });
    expect(readFileSync(txt, 'utf8')).not.toBe(BASE);
  });

  it('the guard looks at the destination, whoever writes: new, a PNG', async () => {
    const txt = write('gato.txt', BASE);
    await expect(runCommand('new', { path: txt, width: 16 })).rejects.toThrow(/declares "base: protected"/);
    const asset = join(dir, 'x.pss.json');
    await runCommand('new', { path: asset, width: 4 });
    await expect(runCommand('render', { path: asset, out: txt })).rejects.toThrow(/declares "base: protected"/);
    expect(() => guardWrite(txt)).toThrow(/declares "base: protected"/);
    expect(() => guardWrite(txt, true)).not.toThrow();
    expect(readFileSync(txt, 'utf8')).toBe(BASE);
    // A drawing without the header is still fair game for to_ascii, as always.
    const loose = write('suelto.txt', BASE.replace('base: protected\n', ''));
    expect(isProtectedBase(loose)).toBe(false);
    expect(isProtectedBase(join(dir, 'nada.txt'))).toBe(false);
  });

  it('checkOverwrite says so even to the command whose generated_by it carries', () => {
    const by = madeBy('map_export', { recipe: 'r.json', layer: 'ground' });
    const txt = write('suelo.txt', BASE.replace('base: protected', 'base: protected\ngenerated_by: map_export recipe=r.json layer=ground'));
    const check = checkOverwrite(txt, by);
    expect(check.ok).toBe(false);
    expect(check.why).toMatch(/declares "base: protected"/);
  });

  it('map_export stops before writing anything, even with its own generated_by', async () => {
    const FIX = join(__dirname, 'fixtures/mapas');
    for (const f of ['ladera.json', 'visuals.json', 'paleta.pss.json']) copyFileSync(join(FIX, f), join(dir, f));
    cpSync(join(FIX, 'objetos'), join(dir, 'objetos'), { recursive: true });   // the objects its stamps draw
    const recipe = readRecipe(join(FIX, 'ladera.receta.json'));
    const path = join(dir, 'r.json');
    writeFileSync(path, JSON.stringify({ ...recipe, export: { ...recipe.export, png: 'out', txt: 'txt', src: 'src', ground: undefined } }));
    await runCommand('map_export', { recipe: path });
    const drawing = join(dir, 'txt', 'ladera.txt');
    const declared = readFileSync(drawing, 'utf8').replace(/^(generated_by:.*)$/m, '$1\nbase: protected');
    writeFileSync(drawing, declared);
    await expect(runCommand('map_export', { recipe: path })).rejects.toThrow(/ladera\.txt declares "base: protected"/);
    expect(readFileSync(drawing, 'utf8')).toBe(declared);
    await runCommand('map_export', { recipe: path, force: true });
    expect(readFileSync(drawing, 'utf8')).not.toContain('base: protected');
  });
});

describe('the retouch of a base survives the base changing', () => {
  it('from_ascii lays the .retoque.txt over the base on a layer of its own', async () => {
    const txt = write('gato.txt', BASE);
    write('gato.retoque.txt', RETOUCH);
    const out = join(dir, 'gato.pss.json');
    const res = await runCommand('from_ascii', { txt, out });
    expect((res.data as { retouch: string }).retouch).toMatch(/^gato\.retoque\.txt: 2 px pintados, 1 borrados · \d+% del dibujo lo decide la capa$/);
    const asset = JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset;
    expect(asset.layers!.map(l => l.name)).toEqual(['Base', 'retoque']);
    expect(seen(asset)).toEqual([
      ['#2c2849', '#ece9f2', '#ece9f2', '#2c2849'],
      ['#c0392b', '#c0392b', '#ece9f2', '#ece9f2'],
      ['#2c2849', '.', '.', '.'],
    ]);
    // The files on disk are untouched.
    expect(readFileSync(txt, 'utf8')).toBe(BASE);
    expect(readFileSync(join(dir, 'gato.retoque.txt'), 'utf8')).toBe(RETOUCH);
  });

  it('redrawing the base keeps the collar, on the new base', async () => {
    const txt = write('gato.txt', BASE);
    write('gato.retoque.txt', RETOUCH);
    // The base is redrawn by hand (the head goes all dark): the retouch is not touched.
    writeFileSync(txt, BASE.replace('oWWo\nWWWW', 'oooo\nWWWW'));
    const out = join(dir, 'gato.pss.json');
    await runCommand('from_ascii', { txt, out });
    const asset = JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset;
    expect(seen(asset)[0]).toEqual(['#2c2849', '#2c2849', '#2c2849', '#2c2849']);
    expect(seen(asset)[1].slice(0, 2)).toEqual(['#c0392b', '#c0392b']);
    expect(seen(asset)[2][3]).toBe('.');
  });

  it('retouch=false leaves it out, and a drawing that is not a base never takes one', async () => {
    const txt = write('gato.txt', BASE);
    write('gato.retoque.txt', RETOUCH);
    const out = join(dir, 'a.pss.json');
    await runCommand('from_ascii', { txt, out, retouch: false });
    expect((JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset).layers!.length).toBe(1);
    writeFileSync(txt, BASE.replace('base: protected\n', ''));
    await runCommand('from_ascii', { txt, out });
    expect((JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset).layers!.length).toBe(1);
    expect(existsSync(join(dir, 'gato.retoque.txt'))).toBe(true);
  });
});
