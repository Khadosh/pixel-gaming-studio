// Text drawings through the real editor store: open, (maybe) touch, save.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawingFixtures, DRAWINGS_DIR } from '@/headless/fixtures/drawings';
import { createSpriteEditorStore } from '@/components/SpriteEditor/store/useSpriteEditorStore';
import type { SpriteAsset } from './types';
import { addRetouchLayer, openTextDrawing, saveTextDrawing, toHexColor } from './textDrawing';

function editorFor(asset: SpriteAsset, onSave: (a: SpriteAsset) => unknown = () => {}) {
  return createSpriteEditorStore({
    initialAsset: asset,
    onSave: onSave as never,
    onOpenChange: () => {},
    previewPanelRef: { current: null },
    fromTextFile: true,
  });
}

const GUARDIAN = `${DRAWINGS_DIR}/bestias/guardian_de_piedra_pelea.txt`;

describe('text drawings in the editor', () => {
  const files = drawingFixtures();

  it.each(files.map(f => [f.slice(DRAWINGS_DIR.length + 1), f]))('%s opens and saves back unchanged', (_n, file) => {
    const text = readFileSync(file, 'utf8');
    const { asset, session } = openTextDrawing(text, file);
    const store = editorFor(asset);
    const saved = saveTextDrawing(store.getState().editedAsset, session);
    expect(saved.warnings).toEqual([]);
    expect(saved.text).toBe(text);
  });

  it('loads size, palette, frames and animations of the guardian', () => {
    const { asset } = openTextDrawing(readFileSync(GUARDIAN, 'utf8'), 'guardian_de_piedra_pelea.txt');
    const ed = editorFor(asset).getState().editedAsset;
    expect(ed.size).toBe(32);
    expect(ed.palette[1]).toBe('#15120f');
    expect(ed.colorNames[1]).toBe('tinta');
    expect(ed.animations.map(a => a.name)).toEqual(['idle', 'attack', 'technique', 'hurt', 'die']);
    expect(ed.animations[0].durations).toEqual([700, 250, 700, 250]);
    expect(ed.animations[1].loop).toBe(false);
  });

  it('a retouched pixel changes exactly that character', () => {
    const text = readFileSync(GUARDIAN, 'utf8');
    const { asset, session } = openTextDrawing(text, 'g.txt');
    const store = editorFor(asset);
    store.getState().setEditedAsset(prev => {
      const layers = prev.layers!.map(l => ({ ...l, frames: l.frames.map(f => f.map(r => [...r])) }));
      layers[0].frames[2][0][0] = 3; // "s" piedra, top-left of the third frame
      return { ...prev, layers };
    });
    const out = saveTextDrawing(store.getState().editedAsset, session).text;
    const a = text.split('\n'), b = out.split('\n');
    const diff = a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
    expect(a.length).toBe(b.length);
    expect(diff).toEqual([['................................', 's...............................']]);
  });

  it('a new color in the editor gets a glyph and survives', () => {
    const { asset, session } = openTextDrawing('k = #000000\n== idle 0\nk.\n..\n', 'p.txt');
    const store = editorFor(asset);
    store.getState().addColor();
    const ed = store.getState().editedAsset;
    const key = Math.max(...Object.keys(ed.palette).map(Number));
    ed.layers![0].frames[0][1][1] = key;
    const out = saveTextDrawing(ed, session).text;
    const back = openTextDrawing(out, 'p.txt').asset;
    expect(back.palette[key]).toBe('#888888');
    expect(back.layers![0].frames[0][1][1]).toBe(key);
  });

  it('keeps a palette of two colors (no theory palette injected)', () => {
    const { asset } = openTextDrawing(readFileSync(`${DRAWINGS_DIR}/fx/sombra_chica.txt`, 'utf8'), 's.txt');
    const pal = editorFor(asset).getState().editedAsset.palette;
    expect(Object.values(pal)).toEqual(['transparent', '#15120f80', '#15120f48']);
  });

  it('a non-square drawing opens at its real shape and the editor keeps it', () => {
    const text = 'size: 2x1\nk = #000000\n== \nkk\n';
    const { asset, session } = openTextDrawing(text, 'w.txt');
    expect([asset.width, asset.height]).toEqual([2, 1]);
    expect(asset.layers![0].frames[0]).toEqual([[1, 1]]);
    // The store pads every layer to the four canonical frames: on the asset's
    // own canvas, not on a square one.
    const ed = editorFor(asset).getState().editedAsset;
    expect(ed.layers!.every(l => l.frames.every(f => f.length === 1 && f[0].length === 2))).toBe(true);
    const saved = saveTextDrawing(ed, session);
    expect(saved.warnings).toEqual([]);
    expect(saved.kind).toBe('drawing');
    expect(saved.text).toContain('size: 2x1');
    expect(saved.text.trimEnd().endsWith('\nkk')).toBe(true);
  });

  it('warns about pixels painted past the canvas', () => {
    const { asset, session } = openTextDrawing('size: 2x1\nk = #000000\n== \nkk\n', 'w.txt');
    asset.layers![0].frames[0] = [[1, 1], [1, 0]]; // a row the canvas does not have
    const saved = saveTextDrawing(asset, session);
    expect(saved.warnings).toEqual(['1 píxeles pintados fuera del lienzo de 2x1 no se guardan.']);
    expect(saved.text.trimEnd().endsWith('\nkk')).toBe(true);
  });

  it('warns about what the text cannot keep', () => {
    const { asset, session } = openTextDrawing('# nota\nk = #000000\n==\nk.\n..\n', 'c.txt');
    const base = asset.layers![0];
    asset.layers = [
      { ...base, opacity: 0.5 },
      { ...base, id: 'l2', name: 'Arriba', frames: [[[0, 1], [0, 0]]] },
      { ...base, id: 'l3', name: 'Oculta', isVisible: false, frames: [[[0, 0], [1, 0]]] },
    ];
    asset.animations = [{ name: 'idle', label: 'Quieto lento', frameIndices: [0] }];
    const saved = saveTextDrawing(asset, session);
    expect(saved.warnings).toEqual([
      'La capa «Oculta» está oculta: no se guarda.',
      'Las 2 capas visibles se aplanan en una: el texto guarda una sola capa.',
      'La capa «Base» tiene opacidad 50%: se guarda opaca (el texto sólo guarda alfa en los colores de la paleta).',
      'La etiqueta «Quieto lento» de idle tiene espacios: el texto no la guarda.',
      'El archivo tenía 1 línea(s) de comentario (#): no se vuelven a escribir.',
    ]);
    expect(saved.text).toContain('== idle 0\nkk\n..\n');
  });

  it('converts rgba() editor colors to hex with alpha', () => {
    expect(toHexColor('rgba(0,0,0,0.5)')).toBe('#00000080');
    expect(toHexColor('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(toHexColor('#ABCDEF')).toBe('#abcdef');
  });

  it('handleSave keeps the changes marked when the save is cancelled', async () => {
    const { asset } = openTextDrawing('k = #000\n==\nk\n', 'x.txt');
    let answer = false;
    const onSave = vi.fn(async () => answer);
    const store = editorFor(asset, onSave);
    store.setState({ isDirty: true });
    store.getState().handleSave();
    await Promise.resolve(); await Promise.resolve();
    expect(store.getState().isDirty).toBe(true);
    answer = true;
    store.getState().handleSave();
    await Promise.resolve(); await Promise.resolve();
    expect(store.getState().isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A drawing that came from a recipe: the editor saves the layer on top
// ---------------------------------------------------------------------------

describe('retouching what a recipe generated', () => {
  // A 4x2 "map" with a generated_by header, as map_export writes it.
  const GENERATED = [
    'id: camino', 'name: Suelo del camino', 'category: terrain', 'size: 4x2',
    'generated_by: map_export recipe=../recetas/camino.json layer=ground', '',
    'k = #15120f tinta', 'p = #c2bdb5 piedra', '',
    '==', 'kkpp', 'ppkk', '',
  ].join('\n');

  it('remembers what generated it and the base it opened', () => {
    const { asset, session } = openTextDrawing(GENERATED, 'camino.txt');
    expect(asset.generatedBy).toEqual({ by: 'map_export', args: { recipe: '../recetas/camino.json', layer: 'ground' } });
    expect(session.generatedBy).toEqual(asset.generatedBy);
    expect(session.retouchName).toBe('camino.retoque.txt');
    expect(session.base![0]).toEqual([[1, 1, 2, 2], [2, 2, 1, 1]]);
  });

  it('saves the retouch layer, not the mix, and names the file beside the drawing', () => {
    const { asset, session } = openTextDrawing(GENERATED, 'camino.txt');
    const store = editorFor(asset);
    // Paint one pixel over the generated ground, the way a hand would.
    store.getState().setEditedAsset(a => {
      const layers = a.layers!.map(l => ({ ...l, frames: l.frames.map(f => f.map(row => [...row])) }));
      layers[0].frames[0][0][0] = 2;
      return { ...a, layers };
    });
    const saved = saveTextDrawing(store.getState().editedAsset, session);
    expect(saved.kind).toBe('retouch');
    expect(saved.fileName).toBe('camino.retoque.txt');
    expect(saved.warnings).toEqual([]);
    // The overlay holds that one pixel and nothing else, and says what it is of.
    expect(saved.text).toContain('retouch_of: camino.txt');
    // The retouch is hand work, so it does not claim a command made it.
    expect(saved.text).not.toContain('generated_by:');
    const frame = saved.text.slice(saved.text.indexOf('==')).trim().split('\n').slice(1);
    expect(frame).toEqual(['p...', '....']);
  });

  it('keeps the glyph of the drawing it retouches', () => {
    const { asset, session } = openTextDrawing(GENERATED, 'camino.txt');
    asset.layers![0].frames[0][1][0] = 1; // tinta over a piedra pixel: glyph "k" in the base
    const saved = saveTextDrawing(asset, session);
    expect(saved.text).toContain('k = #15120f tinta');
    expect(saved.text.slice(saved.text.indexOf('==')).trim().split('\n').slice(1)).toEqual(['....', 'k...']);
  });

  it('writes a rubbed-out pixel as an erase, instead of dropping it with a warning', () => {
    const { asset, session } = openTextDrawing(GENERATED, 'camino.txt');
    asset.layers![0].frames[0][0][0] = 0; // erased a generated pixel
    const saved = saveTextDrawing(asset, session);
    // Nothing is lost any more, so there is nothing to warn about.
    expect(saved.warnings).toEqual([]);
    expect(saved.text.slice(saved.text.indexOf('==')).trim().split('\n').slice(1)).toEqual(['!...', '....']);
    expect(saved.coverage).toMatchObject({ painted: 0, erased: 1, divergent: 1, ink: 8 });
    // One pixel in eight is under the limit: no traffic light yet.
    expect(saved.divergence).toBeUndefined();
  });

  it('paints and erases in the same layer, and the two round-trip through the editor', () => {
    const first = openTextDrawing(GENERATED, 'camino.txt');
    first.asset.layers![0].frames[0][0][0] = 0;  // rubbed out
    first.asset.layers![0].frames[0][1][0] = 1;  // repainted: piedra → tinta
    const saved = saveTextDrawing(first.asset, first.session);
    expect(saved.text.slice(saved.text.indexOf('==')).trim().split('\n').slice(1)).toEqual(['!...', 'k...']);
    expect(saved.coverage).toMatchObject({ painted: 1, erased: 1 });

    // Opened again, the erase is a hole in the base and the paint is the layer.
    const reopened = addRetouchLayer(openTextDrawing(GENERATED, 'camino.txt'), saved.text, saved.fileName);
    expect(reopened.asset.layers![0].frames[0]).toEqual([[0, 1, 2, 2], [2, 2, 1, 1]]);
    expect(reopened.asset.layers![1].frames[0]).toEqual([[0, 0, 0, 0], [1, 0, 0, 0]]);
    // And saving again writes the very same layer: the erase survives the round trip.
    expect(saveTextDrawing(reopened.asset, reopened.session).text).toBe(saved.text);
  });

  it('warns when the layer decides more of the drawing than the recipe does', () => {
    const { asset, session } = openTextDrawing(GENERATED, 'camino.txt');
    // Every pixel by hand: half rubbed out, half repainted. The recipe no
    // longer generates this drawing at all.
    asset.layers![0].frames[0][0] = [0, 0, 1, 1];
    asset.layers![0].frames[0][1] = [1, 1, 0, 0];
    const saved = saveTextDrawing(asset, session);
    expect(saved.coverage).toMatchObject({ painted: 4, erased: 4, divergent: 8, ink: 8 });
    expect(saved.warnings).toEqual([]);           // nothing is lost: it is not that kind of warning
    expect(saved.divergence).toMatch(/100% del dibujo/);
    expect(saved.divergence).toMatch(/Subí las correcciones a la receta en \.\.\/recetas\/camino\.json/);
  });

  it('warns about an empty retouch instead of writing a file that says nothing', () => {
    const { asset, session } = openTextDrawing(GENERATED, 'camino.txt');
    const saved = saveTextDrawing(asset, session);
    expect(saved.warnings).toEqual(['El retoque no tiene ningún píxel: se guarda vacío.']);
  });

  it('opens a retouch back over its drawing, so a second pass adds to the first', () => {
    const first = openTextDrawing(GENERATED, 'camino.txt');
    first.asset.layers![0].frames[0][0][0] = 2;
    const retouch = saveTextDrawing(first.asset, first.session);

    const reopened = addRetouchLayer(openTextDrawing(GENERATED, 'camino.txt'), retouch.text, retouch.fileName);
    expect(reopened.asset.layers!.map(l => l.name)).toEqual(['Base', 'retoque']);
    // The base is the recipe's, untouched; the retouch sits above it.
    expect(reopened.asset.layers![0].frames[0]).toEqual([[1, 1, 2, 2], [2, 2, 1, 1]]);
    expect(reopened.asset.layers![1].frames[0]).toEqual([[2, 0, 0, 0], [0, 0, 0, 0]]);

    // A second touch keeps the first one.
    reopened.asset.layers![1].frames[0][1][0] = 1;
    const again = saveTextDrawing(reopened.asset, reopened.session);
    expect(again.kind).toBe('retouch');
    expect(again.text.slice(again.text.indexOf('==')).trim().split('\n').slice(1)).toEqual(['p...', 'k...']);
  });

  it('refuses a retouch of another size or without a retouch_of header', () => {
    const opened = openTextDrawing(GENERATED, 'camino.txt');
    expect(() => addRetouchLayer(opened, 'k = #000\n==\nk\n', 'x.txt')).toThrow(/retouch_of/);
    expect(() => addRetouchLayer(opened, 'retouch_of: camino.txt\nk = #000\n==\nk\n', 'x.txt'))
      .toThrow(/1x1 y el dibujo de 4x2/);
  });

  it('a hand-made drawing still saves over itself', () => {
    const { asset, session } = openTextDrawing('k = #000000\n==\nk\n', 'mano.txt');
    const saved = saveTextDrawing(asset, session);
    expect(saved.kind).toBe('drawing');
    expect(saved.fileName).toBe('mano.txt');
  });

  // The notes of a retouch are where the *why* of a pixel done by hand is
  // written: the one thing the recipe cannot reconstruct. The editor used to
  // rebuild the overlay from scratch and write `description: ''`.
  describe('the headers of the retouch it opened', () => {
    const RETOUCH = [
      'id: camino_a_mano', 'name: El camino, a mano', 'category: ui', 'size: 4x2',
      'description: El primer pixel es a mano: la receta lo pone dos columnas a la izquierda.',
      'description: dx mueve el paso, no lo ensancha, asi que este no es un parametro.',
      'retouch_of: camino.txt', '',
      'p = #c2bdb5 piedra', '',
      '==', 'p...', '....', '',
    ].join('\n');

    it('go back out as they were written', () => {
      const opened = addRetouchLayer(openTextDrawing(GENERATED, 'camino.txt'), RETOUCH, 'camino.retoque.txt');
      expect(opened.session.retouchHeaders).toEqual({
        id: 'camino_a_mano',
        name: 'El camino, a mano',
        category: 'ui',
        description: 'El primer pixel es a mano: la receta lo pone dos columnas a la izquierda.\n'
          + 'dx mueve el paso, no lo ensancha, asi que este no es un parametro.',
        retouchOf: 'camino.txt',
      });
      // Nothing touched: the file comes back byte for byte, notes included.
      expect(saveTextDrawing(opened.asset, opened.session).text).toBe(RETOUCH);
    });

    it('survive a second pass that changes the pixels', () => {
      const opened = addRetouchLayer(openTextDrawing(GENERATED, 'camino.txt'), RETOUCH, 'camino.retoque.txt');
      opened.asset.layers![1].frames[0][1][0] = 1;   // one more pixel by hand
      const again = saveTextDrawing(opened.asset, opened.session);
      expect(again.text).toContain('description: El primer pixel es a mano: la receta lo pone dos columnas a la izquierda.');
      expect(again.text).toContain('description: dx mueve el paso, no lo ensancha, asi que este no es un parametro.');
      expect(again.text).toContain('id: camino_a_mano');
      expect(again.text).toContain('name: El camino, a mano');
      expect(again.text).toContain('category: ui');
      expect(again.text.slice(again.text.indexOf('==')).trim().split('\n').slice(1)).toEqual(['p...', 'k...']);
    });

    it('fall back to the drawing when there is no retouch file yet', () => {
      const { asset, session } = openTextDrawing(GENERATED, 'camino.txt');
      asset.layers![0].frames[0][0][0] = 2;
      const saved = saveTextDrawing(asset, session);
      expect(saved.text).toContain('id: camino_retoque');
      expect(saved.text).toContain('name: Retoque de Suelo del camino');
      expect(saved.text).toContain('category: terrain');
      expect(saved.text).not.toContain('description:');
      expect(saved.text).not.toContain('generated_by:');
    });

    it('keep the two files of the Nube 8 example byte for byte', () => {
      const dir = `${process.cwd()}/examples/tipografia`;
      const drawing = readFileSync(`${dir}/nube.txt`, 'utf8');
      const retouch = readFileSync(`${dir}/nube.retoque.txt`, 'utf8');
      const opened = addRetouchLayer(openTextDrawing(drawing, 'nube.txt'), retouch, 'nube.retoque.txt');
      const store = editorFor(opened.asset);
      const saved = saveTextDrawing(store.getState().editedAsset, opened.session);
      expect(saved.kind).toBe('retouch');
      expect(saved.fileName).toBe('nube.retoque.txt');
      expect(saved.text).toBe(retouch);
    });
  });
});

// Issue #32: a drawing made by hand that someone else paints over (a collar on
// the cat of el-patio). The same rule as the engine (`retouchAside`): GUARDAR
// writes the layer beside it and never the base.
describe('retouching a hand-made base declared "base: protected"', () => {
  const BASE = [
    'id: gato', 'name: Gato', 'category: character', 'size: 4x3',
    'base: protected', 'anchor: 2,2', '',
    'o = #2c2849 sombra', 'W = #ece9f2 blanco', '',
    '== idle 0', 'oWWo', 'WWWW', 'o..o', '',
  ].join('\n');

  /** A brush stroke through the real editor store, the way the hand does it. */
  function paint(asset: SpriteAsset, at: [number, number][], color: string) {
    const store = editorFor(asset);
    store.getState().setEditedAsset(a => {
      const palette = { ...a.palette };
      let i = Number(Object.keys(palette).find(k => palette[Number(k)] === color));
      if (!i) { i = Math.max(...Object.keys(palette).map(Number)) + 1; palette[i] = color; }
      const layers = a.layers!.map(l => ({ ...l, frames: l.frames.map(f => f.map(row => [...row])) }));
      for (const [x, y] of at) layers[0].frames[0][y][x] = i;
      return { ...a, palette, layers };
    });
    return store.getState().editedAsset;
  }

  it('opens as a base: no recipe, but the retouch goes aside', () => {
    const { session } = openTextDrawing(BASE, 'gato.txt');
    expect(session.aside).toBe('base');
    expect(session.generatedBy).toBeUndefined();
    expect(session.retouchName).toBe('gato.retoque.txt');
  });

  it('GUARDAR writes the collar to gato.retoque.txt, in a new color, and not the drawing', () => {
    const { asset, session } = openTextDrawing(BASE, 'gato.txt');
    const saved = saveTextDrawing(paint(asset, [[0, 1], [1, 1]], '#c0392b'), session);
    expect(saved.kind).toBe('retouch');
    expect(saved.fileName).toBe('gato.retoque.txt');
    expect(saved.text).toContain('retouch_of: gato.txt');
    expect(saved.text).not.toContain('base:');
    expect(saved.text).toMatch(/^\S = #c0392b$/m);
    const frame = saved.text.slice(saved.text.indexOf('==')).trim().split('\n').slice(1);
    expect(frame.map(r => r.replace(/[^.]/g, 'x'))).toEqual(['....', 'xx..', '....']);
  });

  it('no traffic light about a recipe: a base has none to move the corrections to', () => {
    const { asset, session } = openTextDrawing(BASE, 'gato.txt');
    const every: [number, number][] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) every.push([x, y]);
    const saved = saveTextDrawing(paint(asset, every, '#c0392b'), session);
    expect(saved.coverage!.share).toBeGreaterThan(0.2);
    expect(saved.divergence).toBeUndefined();
  });

  it('the retouch opens back over a redrawn base, and saving again writes the same layer', () => {
    const first = openTextDrawing(BASE, 'gato.txt');
    first.asset.layers![0].frames[0][2][3] = 0; // rubbed out a paw
    const retouch = saveTextDrawing(paint(first.asset, [[0, 1]], '#c0392b'), first.session);
    // Somebody redraws the base: the head goes all dark.
    const redrawn = BASE.replace('oWWo\nWWWW', 'oooo\nWWWW');
    const reopened = addRetouchLayer(openTextDrawing(redrawn, 'gato.txt'), retouch.text, retouch.fileName);
    expect(reopened.asset.layers!.map(l => l.name)).toEqual(['Base', 'retoque']);
    expect(reopened.asset.layers![0].frames[0]).toEqual([[1, 1, 1, 1], [2, 2, 2, 2], [1, 0, 0, 0]]);
    expect(reopened.asset.layers![1].frames[0][1][0]).toBeGreaterThan(2);
    expect(saveTextDrawing(reopened.asset, reopened.session).text).toBe(retouch.text);
  });
});
