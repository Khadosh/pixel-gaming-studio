// @vitest-environment node
// Round trip of every real drawing of The Unwritten Dao (copied to fixtures/dibujos):
// text → asset → text must be the same text, glyphs and all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fromAscii, toAscii, resolveBeside, peekGeneratedBy, sameGeneratedBy } from './ascii';
import { DRAWINGS_DIR as FIXTURES, drawingFixtures } from './fixtures/drawings';

describe('ascii round trip on the real drawings', () => {
  const files = drawingFixtures();

  it('has the drawings', () => {
    expect(files.length).toBeGreaterThanOrEqual(79);
  });

  it.each(files.map(f => [f.slice(FIXTURES.length + 1), f]))('%s comes back exactly', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    const { asset, layout } = fromAscii(text, { sourcePath: file });
    expect(toAscii(asset, { layout }).text).toBe(text);
  });
});

describe('ascii layout', () => {
  it('keeps glyphs, declared anims and fit; new colors get free glyphs', () => {
    const text = [
      'id: x', 'name: X', 'category: prop', 'size: 2x1', 'fit: ../paleta.pss.json', 'anim: b fps=2', '',
      'k = #000000 tinta', 'z = #ff0000', '',
      '== a 0', 'kz', '', '== b 0', 'zk', '',
    ].join('\n');
    const { asset, layout, fit } = fromAscii(text, { sourcePath: '/juego/dibujos/x.txt' });
    expect(fit).toBe('/juego/paleta.pss.json');
    expect(layout).toEqual({ glyphs: { 1: 'k', 2: 'z' }, declared: ['b'], fit: '../paleta.pss.json', comments: 0 });
    // fromAscii orders declared first: b then a. Written back, a gets no line but the order holds.
    expect(asset.animations.map(a => a.name)).toEqual(['b', 'a']);
    expect(toAscii(asset, { layout }).text).toBe(text);
    asset.palette[3] = '#00ff00';
    asset.layers![0].frames[0][0][0] = 3;
    const out = toAscii(asset, { layout }).text;
    expect(out).toContain('3 = #00ff00');
    expect(out).toContain('== a 0\n3z');
  });

  it('writes an anim line for an undeclared animation when the order needs it', () => {
    const { asset, layout } = fromAscii('k = #000\n== a 0\nk\n== b 0\nk\n');
    asset.animations.reverse(); // b first now, but a appears first in the frames
    const back = fromAscii(toAscii(asset, { layout }).text).asset;
    expect(back.animations.map(a => a.name)).toEqual(['b', 'a']);
  });

  it('counts comments', () => {
    expect(fromAscii('# hola\nk = #000\n==\n# chau\nk\n').layout.comments).toBe(2);
  });

  it('resolves fit beside the source without node:path', () => {
    expect(resolveBeside('/a/b/c.txt', '../d.json')).toBe('/a/d.json');
    expect(resolveBeside('a/c.txt', './d.json')).toBe('a/d.json');
    expect(resolveBeside('/a/c.txt', '/abs.json')).toBe('/abs.json');
  });
});

describe('generated_by', () => {
  const drawing = (...header: string[]) => [
    'id: x', 'name: X', 'category: prop', 'size: 2x1', ...header, '',
    'k = #000000 tinta', '',
    '== idle 0', 'kk', '',
  ].join('\n');

  it('reads the command and its arguments in order, and writes them back exactly', () => {
    const text = drawing('generated_by: map_export recipe=../recetas/x.json layer=ground');
    const { asset, layout } = fromAscii(text, { sourcePath: '/juego/dibujos/x.txt' });
    expect(asset.generatedBy).toEqual({ by: 'map_export', args: { recipe: '../recetas/x.json', layer: 'ground' } });
    expect(toAscii(asset, { layout }).text).toBe(text);
  });

  it('is absent on a hand-made drawing', () => {
    expect(fromAscii(drawing()).asset.generatedBy).toBeUndefined();
    expect(toAscii(fromAscii(drawing()).asset).text).not.toContain('generated_by');
  });

  it('takes a command with no arguments', () => {
    const { asset } = fromAscii(drawing('generated_by: figure'));
    expect(asset.generatedBy).toEqual({ by: 'figure', args: {} });
  });

  it('survives to_ascii without the layout (a fresh asset)', () => {
    const { asset } = fromAscii(drawing('generated_by: variant base=caras/mei.pss.json'));
    const back = fromAscii(toAscii(asset).text).asset;
    expect(back.generatedBy).toEqual(asset.generatedBy);
  });

  it('names the line when it cannot be read', () => {
    expect(() => fromAscii(drawing('generated_by:'), { sourcePath: 'x.txt' }))
      .toThrow(/x\.txt:5: generated_by needs the command/);
    expect(() => fromAscii(drawing('generated_by: map_export ground'), { sourcePath: 'x.txt' }))
      .toThrow(/expected key=value, got "ground"/);
    expect(() => fromAscii(drawing('generated_by: map_export layer='), { sourcePath: 'x.txt' }))
      .toThrow(/"layer" has no value/);
    expect(() => fromAscii(drawing('generated_by: Map_Export'), { sourcePath: 'x.txt' }))
      .toThrow(/is not a command name/);
    expect(() => fromAscii(drawing('generated_by: a', 'generated_by: b'), { sourcePath: 'x.txt' }))
      .toThrow(/given twice/);
  });

  it('refuses a value with spaces when writing', () => {
    const { asset } = fromAscii(drawing());
    asset.generatedBy = { by: 'map_export', args: { recipe: 'con espacio.json' } };
    expect(() => toAscii(asset)).toThrow(/has spaces/);
  });

  it('peeks at the header without parsing the pixels', () => {
    expect(peekGeneratedBy(drawing('generated_by: map_export layer=front')))
      .toEqual({ by: 'map_export', args: { layer: 'front' } });
    expect(peekGeneratedBy(drawing())).toBeUndefined();
    // A "generated_by" after the first frame is pixels, not a header.
    expect(peekGeneratedBy('k = #000\n==\nk\ngenerated_by: nope\n')).toBeUndefined();
  });

  it('compares two provenances by command and arguments', () => {
    const a = { by: 'map_export', args: { recipe: 'x.json', layer: 'ground' } };
    expect(sameGeneratedBy(a, { by: 'map_export', args: { recipe: 'x.json', layer: 'ground' } })).toBe(true);
    expect(sameGeneratedBy(a, { by: 'map_export', args: { recipe: 'y.json', layer: 'ground' } })).toBe(false);
    expect(sameGeneratedBy(a, { by: 'variant', args: { recipe: 'x.json', layer: 'ground' } })).toBe(false);
    expect(sameGeneratedBy(a, undefined)).toBe(false);
  });
});

describe('retouch_of', () => {
  it('resolves beside the source and comes back exactly', () => {
    const text = [
      'id: camino_retoque', 'name: Retoque de camino', 'category: terrain', 'size: 2x1',
      'retouch_of: camino.txt', '',
      'k = #000000 tinta', '',
      '== idle 0', '.k', '',
    ].join('\n');
    const { retouchOf, asset, layout } = fromAscii(text, { sourcePath: '/juego/dibujos/suelos/camino_retoque.txt' });
    expect(retouchOf).toBe('/juego/dibujos/suelos/camino.txt');
    expect(layout.retouchOf).toBe('camino.txt');
    expect(toAscii(asset, { layout }).text).toBe(text);
  });
});
