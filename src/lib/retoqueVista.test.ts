// The cat of el-patio in the editor (issues #43 and #37): a collar painted once
// goes to the whole side of the cat, is written once, and yesterday's retouch
// survives a save made without opening it.
import { describe, it, expect } from 'vitest';
import type { Frame, SpriteAsset } from './types';
import { addRetouchLayer, openTextDrawing, saveTextDrawing } from './textDrawing';
import { onlyFrameChanged, spreadEdit } from './paintAcross';
import { fromAscii } from '@/headless/ascii';
import { makeVariant } from '@/headless/variant';
import { composite } from '@/headless/assetModel';

const CAT = [
  'id: gato', 'category: character', 'size: 4x3', 'base: protected', '',
  'o = #2c2849 sombra', 'W = #ece9f2 blanco', '',
  '== idle_right 0', 'oWWo', 'WWWW', 'o..o', '',
  '== walk_right 0', 'oWWo', 'WWWW', '.oo.', '',
  '== walk_right 1', 'oWWo', 'WWWW', 'o..o', '',
  '== idle_left 0', 'oWWo', 'WWWW', 'o..o', '',
].join('\n');

const RED = '#c0392b';
const BLUE = '#2e86de';

/** The editor asset with `color` added to the palette, and its index. */
function withColor(asset: SpriteAsset, hex: string): [SpriteAsset, number] {
  const k = Math.max(...Object.keys(asset.palette).map(Number)) + 1;
  return [{ ...asset, palette: { ...asset.palette, [k]: hex }, colorNames: { ...asset.colorNames, [k]: 'nuevo' } }, k];
}

/** A stroke on one frame of layer 0, the way the canvas hands it over. */
function stroke(asset: SpriteAsset, frame: number, cells: [number, number][], v: number): { next: SpriteAsset; before: Frame; after: Frame } {
  const before = asset.layers![0].frames[frame];
  const after = before.map(row => [...row]);
  for (const [r, c] of cells) after[r][c] = v;
  const frames = [...asset.layers![0].frames];
  frames[frame] = after;
  return { next: { ...asset, layers: [{ ...asset.layers![0], frames }, ...asset.layers!.slice(1)] }, before, after };
}

/** What the game sees: the drawing with the saved retouch laid over it, by hex. */
function seen(retouch: string, f: number): string[][] {
  const base = fromAscii(CAT).asset;
  const { asset } = makeVariant(base, { id: 'gato', layer: 'retoque', overlay: retouch });
  return composite(asset, f).map(row => row.map(v => (v ? asset.palette[v] : '.')));
}

describe('painting across a view', () => {
  it('copies what the stroke changed to every frame of that side, and nothing else', () => {
    const { asset } = openTextDrawing(CAT, 'gato.txt');
    const [painted, red] = withColor(asset, RED);
    const { next, before, after } = stroke(painted, 1, [[1, 0], [1, 1]], red);
    const out = spreadEdit(next, 0, 1, before, after, 'view');
    for (const f of [0, 1, 2]) expect(out.layers![0].frames[f][1].slice(0, 2)).toEqual([red, red]);
    expect(out.layers![0].frames[3][1][0]).not.toBe(red);
    // The legs that move are not copied from the frame painted on.
    expect(out.layers![0].frames[0][2]).toEqual(asset.layers![0].frames[0][2]);
    // 'frame' leaves the others alone.
    expect(spreadEdit(next, 0, 1, before, after, 'frame')).toBe(next);
  });

  it('is only for a change confined to the frame being edited', () => {
    const { asset } = openTextDrawing(CAT, 'gato.txt');
    const { next } = stroke(asset, 1, [[0, 0]], 2);
    expect(onlyFrameChanged(asset, next, 0, 1)).toBe(true);
    expect(onlyFrameChanged(asset, next, 0, 0)).toBe(false);
    const grown = { ...next, layers: [{ ...next.layers![0], frames: [...next.layers![0].frames, next.layers![0].frames[0]] }] };
    expect(onlyFrameChanged(asset, grown, 0, 1)).toBe(false);
  });
});

describe('saving a collar painted on a whole side', () => {
  it('writes it once for the side, and the game sees it on every frame of it', () => {
    const { asset, session } = openTextDrawing(CAT, 'gato.txt');
    const [painted, red] = withColor(asset, RED);
    const { next, before, after } = stroke(painted, 0, [[1, 0], [1, 1]], red);
    const saved = saveTextDrawing(spreadEdit(next, 0, 0, before, after, 'view'), session);
    expect(saved.kind).toBe('retouch');
    expect(saved.text).toMatch(/\n== \*_right\n\.{4}\n(\S)\1\.\.\n\.{4}\n/);
    expect(saved.text.match(/^==/gm)).toHaveLength(1);
    for (const f of [0, 1, 2]) expect(seen(saved.text, f)[1].slice(0, 2)).toEqual([RED, RED]);
    expect(seen(saved.text, 3)[1][0]).not.toBe(RED);
    expect(saved.coverage!.painted).toBe(6);
  });

  it('keeps per frame what differs between frames, and opens back as it was painted', () => {
    const { asset, session } = openTextDrawing(CAT, 'gato.txt');
    const [painted, red] = withColor(asset, RED);
    const all = spreadEdit(...(() => { const s = stroke(painted, 0, [[1, 0]], red); return [s.next, 0, 0, s.before, s.after, 'all'] as const; })());
    const one = stroke(all, 2, [[0, 1]], red).next;
    const saved = saveTextDrawing(one, session);
    expect(saved.text).toMatch(/\n== \*\n\.{4}\n\S\.{3}\n/);
    const reopened = addRetouchLayer(openTextDrawing(CAT, 'gato.txt'), saved.text, 'gato.retoque.txt');
    const top = reopened.asset.layers!.at(-1)!.frames;
    for (const f of [0, 1, 2, 3]) expect(reopened.asset.palette[top[f][1][0]]).toBe(RED);
    expect(reopened.asset.palette[top[2][0][1]]).toBe(RED);
    expect(top[1][0][1]).toBe(0);
    expect(saveTextDrawing(reopened.asset, reopened.session).text).toBe(saved.text);
  });
});

describe('yesterday\'s retouch, when only the drawing was opened (#37)', () => {
  const YESTERDAY = [
    'id: gato_retoque', 'category: character', 'size: 4x3', 'retouch_of: gato.txt',
    'description: el collar de ayer', '',
    'r = #c0392b rojo', '',
    '== *_right', '....', 'rr..', '....', '',
  ].join('\n');

  it('survives a save made over it: what was painted today goes on top', () => {
    const { asset, session } = openTextDrawing(CAT, 'gato.txt');
    const [painted, blue] = withColor(asset, BLUE);
    // Today: a blue spot on the left side, and one blue pixel where the collar was.
    const today = stroke(stroke(painted, 3, [[0, 1]], blue).next, 0, [[1, 1]], blue).next;
    const saved = saveTextDrawing(today, session, { name: 'gato.retoque.txt', text: YESTERDAY });
    expect(seen(saved.text, 1)[1].slice(0, 2)).toEqual([RED, RED]); // the collar, on the side
    expect(seen(saved.text, 0)[1].slice(0, 2)).toEqual([RED, BLUE]); // today wins where both painted
    expect(seen(saved.text, 3)[0][1]).toBe(BLUE);
    expect(saved.text).toContain('description: el collar de ayer');
  });

  it('without it, the save starts from scratch: the case that lost the collar', () => {
    const { asset, session } = openTextDrawing(CAT, 'gato.txt');
    const [painted, blue] = withColor(asset, BLUE);
    const saved = saveTextDrawing(stroke(painted, 3, [[0, 1]], blue).next, session);
    expect(seen(saved.text, 1)[1][0]).not.toBe(RED);
  });
});
