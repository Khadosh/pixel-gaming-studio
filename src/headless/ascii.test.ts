// @vitest-environment node
// Round trip of every real drawing of The Unwritten Dao (copied to fixtures/dibujos):
// text → asset → text must be the same text, glyphs and all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ERASE, ERASE_GLYPH, fromAscii, toAscii, resolveBeside, peekGeneratedBy, sameGeneratedBy } from './ascii';
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
    expect(layout).toEqual({
      glyphs: { 1: 'k', 2: 'z' }, declared: ['b'], fit: '../paleta.pss.json', comments: 0,
      // The three the asset cannot say were declared: fromAscii invents them from the file name.
      header: { id: 'x', name: 'X', category: 'prop' },
    });
    // fromAscii orders declared first: b then a. Written back, a gets no line but the order holds.
    expect(asset.animations.map(a => a.name)).toEqual(['b', 'a']);
    expect(toAscii(asset, { layout }).text).toBe(text);
    asset.palette[3] = '#00ff00';
    asset.layers![0].frames[0][0][0] = 3;
    const out = toAscii(asset, { layout }).text;
    expect(out).toContain('3 = #00ff00');
    expect(out).toContain('== a 0\n3z');
  });

  it('says nothing about id, name and category when the text declared none', () => {
    const { asset, layout } = fromAscii('k = #000\n==\nk\n', { sourcePath: '/a/farol.txt' });
    expect(asset.id).toBe('farol');          // invented from the file name
    expect(layout.header).toBeUndefined();   // and the layout does not claim it was written
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

describe('anchor', () => {
  const drawing = (header: string) => [
    'id: farol', 'name: Farol', 'category: prop', 'size: 3x2',
    header, '',
    'k = #000000 tinta', '',
    '== idle 0', '.k.', 'kkk', '',
  ].join('\n');

  it('says which pixel sits on the ground and comes back exactly', () => {
    const text = drawing('anchor: 1,1');
    const { anchor, asset, layout } = fromAscii(text, { sourcePath: '/juego/objetos/farol.txt' });
    expect(anchor).toEqual([1, 1]);
    expect(layout.anchor).toEqual([1, 1]);
    expect(toAscii(asset, { layout }).text).toBe(text);
  });

  it('is optional', () => {
    expect(fromAscii(drawing('description: sin ancla')).anchor).toBeUndefined();
  });

  it('refuses one that is not two whole numbers, or that falls outside the drawing', () => {
    expect(() => fromAscii(drawing('anchor: abajo'))).toThrow(/anchor must be "x,y" in px/);
    expect(() => fromAscii(drawing('anchor: 1'))).toThrow(/anchor must be "x,y" in px/);
    expect(() => fromAscii(drawing('anchor: 3,1'))).toThrow(/anchor 3,1 is outside the drawing \(3x2\)/);
    expect(() => fromAscii(drawing('anchor: 1,-1'))).toThrow(/outside the drawing/);
  });
});

describe('footprint and tags: what a library object says beyond its pixels', () => {
  const drawing = (...header: string[]) => [
    'id: puesto', 'name: Puesto', 'category: prop', 'size: 3x2',
    ...header, '',
    'k = #000000 tinta', '',
    '== idle 0', '.k.', 'kkk', '',
  ].join('\n');

  it('reads the cells it takes and its words, and writes them back exactly', () => {
    const text = drawing('anchor: 1,1', 'footprint: ##/#o', 'tags: puesto, mercado');
    const { footprint, tags, asset, layout } = fromAscii(text);
    expect(footprint).toEqual(['##', '#o']);
    expect(tags).toEqual(['puesto', 'mercado']);
    expect(toAscii(asset, { layout }).text).toBe(text);
  });

  it('both are optional', () => {
    const { footprint, tags } = fromAscii(drawing('anchor: 1,1'));
    expect(footprint).toBeUndefined();
    expect(tags).toBeUndefined();
  });

  it('refuses a footprint with other cells, rows of different widths or no cell of its own', () => {
    expect(() => fromAscii(drawing('footprint: #x'))).toThrow(/footprint is rows of cells split by "\/"/);
    expect(() => fromAscii(drawing('footprint: ##/#'))).toThrow(/footprint rows must be the same width/);
    expect(() => fromAscii(drawing('footprint: ../..'))).toThrow(/footprint takes no cell/);
  });

  it('refuses empty tags', () => {
    expect(() => fromAscii(drawing('tags: , ,'))).toThrow(/tags is a list of words/);
  });
});

describe('the erase glyph', () => {
  const RETOUCH = [
    'id: camino_retoque', 'name: Retoque de camino', 'category: terrain', 'size: 3x2',
    'retouch_of: camino.txt', '',
    'k = #000000 tinta', '',
    '==', '!k.', '.!!', '',
  ].join('\n');

  it('reads as "take this pixel out", not as a color, and comes back exactly', () => {
    const { asset, layout } = fromAscii(RETOUCH, { sourcePath: 'camino.retoque.txt' });
    expect(asset.layers![0].frames[0]).toEqual([[ERASE, 1, 0], [0, ERASE, ERASE]]);
    // Not a palette entry: the only color is the one in the legend.
    expect(Object.values(asset.palette)).toEqual(['#000000']);
    expect(toAscii(asset, { layout }).text).toBe(RETOUCH);
  });

  it('round-trips a retouch that only erases, with no color at all', () => {
    const text = [
      'id: solo_borra', 'name: solo_borra', 'category: prop', 'size: 2x1',
      'retouch_of: camino.txt', '', '', '==', '!.', '',
    ].join('\n');
    const { asset, layout } = fromAscii(text, { sourcePath: 'x.retoque.txt' });
    expect(asset.layers![0].frames[0]).toEqual([[ERASE, 0]]);
    expect(toAscii(asset, { layout }).text).toBe(text);
  });

  it('only means something where a drawing is laid over another, and says which header is missing', () => {
    expect(() => fromAscii(RETOUCH.replace(/^retouch_of:.*\n/m, ''), { sourcePath: 'camino.retoque.txt' }))
      .toThrow(/"!" takes the pixel underneath out.*"retouch_of:"/s);
  });

  it('cannot be a color: a legend line that claims it is an error', () => {
    expect(() => fromAscii(RETOUCH.replace('k = #000000 tinta', '! = #000000 tinta'), { sourcePath: 'r.txt' }))
      .toThrow(/"!" cannot be a color/);
  });

  it('is never handed out as a color glyph, not even once the letters run out', () => {
    // 78 colors is every glyph toAscii has to give: the alphabet and the
    // punctuation it falls back on. "!" is not one of them any more.
    const { asset } = fromAscii('size: 1x1\n\nk = #000000\n\n==\nk\n', { sourcePath: 'x.txt' });
    for (let i = 2; i <= 78; i++) asset.palette[i] = `#${i.toString(16).padStart(6, '0')}`;
    const text = toAscii(asset).text;
    expect(text.split('\n').filter(l => / = #/.test(l))).toHaveLength(78);
    expect(text).not.toContain(`${ERASE_GLYPH} = `);
    asset.palette[79] = '#abcdef';
    expect(() => toAscii(asset)).toThrow(/too many colors/);
  });
});
