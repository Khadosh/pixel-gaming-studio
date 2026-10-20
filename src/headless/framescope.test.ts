// A retouch painted once that holds for many frames (issue #43, the cat of
// el-patio): a collar painted on the right side of the cat is on every frame of
// that side — standing and walking — so it does not blink when the cat walks.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import { fromAscii, toAscii } from './ascii';
import { runCommand } from './commands';
import { composite } from './assetModel';
import { framesAcross, framesOfScope, matchesScope, viewGroups, viewOf } from './framescope';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-vista-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A 4x3 cat with a right side (standing, two walking frames) and a left side. */
const CAT = (extraWalk = false) => [
  'id: gato', 'category: character', 'size: 4x3', 'base: protected', '',
  'o = #2c2849 sombra', 'W = #ece9f2 blanco', '',
  '== idle_right 0', 'oWWo', 'WWWW', 'o..o', '',
  '== walk_right 0', 'oWWo', 'WWWW', '.oo.', '',
  '== walk_right 1', 'oWWo', 'WWWW', 'o..o', '',
  ...(extraWalk ? ['== walk_right 2', 'oWWo', 'WWWW', '.o.o', ''] : []),
  '== idle_left 0', 'oWWo', 'WWWW', 'o..o', '',
].join('\n');

/** The collar, painted once for the whole right side. */
const COLLAR = [
  'id: gato_retoque', 'category: character', 'size: 4x3', 'retouch_of: gato.txt', '',
  'r = #c0392b rojo', '',
  '== *_right', '....', 'rr..', '....', '',
].join('\n');

function write(name: string, text: string): string {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
}

function row1(asset: SpriteAsset, f: number): string[] {
  return composite(asset, f)[1].map(v => (v ? asset.palette[v] : '.'));
}

async function build(): Promise<SpriteAsset> {
  const out = join(dir, 'gato.pss.json');
  await runCommand('from_ascii', { txt: join(dir, 'gato.txt'), out });
  return JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset;
}

const RED = '#c0392b';
const WHITE = '#ece9f2';

describe('scopes', () => {
  it('match animation names with "*" and find their frames in the drawing', () => {
    const { asset } = fromAscii(CAT());
    expect(matchesScope('*_right', 'walk_right')).toBe(true);
    expect(matchesScope('*_right', 'idle_left')).toBe(false);
    expect(matchesScope('walk_*', 'walk_right')).toBe(true);
    expect(framesOfScope(asset, '*_right')).toEqual([0, 1, 2]);
    expect(framesOfScope(asset, '*')).toEqual([0, 1, 2, 3]);
    expect(framesOfScope(asset, '*_up')).toEqual([]);
  });

  it('know the views, and give a view no scope of its own when its pattern catches a diagonal', () => {
    expect(viewOf('walk_down_right')).toBe('down_right');
    expect(viewOf('walk_right')).toBe('right');
    expect(viewOf('attack')).toBeUndefined();
    const { asset } = fromAscii(CAT());
    expect(viewGroups(asset)).toEqual([{ view: 'right', pattern: '*_right', frames: [0, 1, 2] }]);
    expect(framesAcross(asset, 1, 'view')).toEqual([0, 1, 2]);
    expect(framesAcross(asset, 3, 'view')).toEqual([3]); // the left side has one frame: nothing to spread to
    expect(framesAcross(asset, 1, 'frame')).toEqual([1]);
    expect(framesAcross(asset, 1, 'all')).toEqual([0, 1, 2, 3]);
    const diag = fromAscii(CAT().replace('== walk_right 1', '== walk_down_right 0')).asset;
    expect(viewGroups(diag).find(g => g.view === 'right')).toBeUndefined();
  });

  it('only mean something in a retouch', () => {
    expect(() => fromAscii(CAT().replace('== idle_left 0', '== *_left'))).toThrow(/only means something in a retouch/);
    expect(() => fromAscii(COLLAR.replace('== *_right', '== *_right, idle_left 0'))).toThrow(/one pattern/);
  });

  it('are not frames of the retouch, and come back out as written', () => {
    const parsed = fromAscii(COLLAR, { sourcePath: 'gato.retoque.txt' });
    expect(parsed.asset.layers![0].frames).toHaveLength(0);
    expect(parsed.scoped.map(s => s.pattern)).toEqual(['*_right']);
    const { text } = toAscii(parsed.asset, { layout: parsed.layout, scoped: parsed.scoped });
    expect(text).toContain('\n== *_right\n....\nrr..\n....\n');
    expect(fromAscii(text, { sourcePath: 'gato.retoque.txt' }).scoped).toEqual(parsed.scoped);
  });
});

describe('a collar painted once for a side of the cat', () => {
  it('is on every frame of that side, standing and walking, and not on the other side', async () => {
    write('gato.txt', CAT());
    write('gato.retoque.txt', COLLAR);
    const asset = await build();
    for (const f of [0, 1, 2]) expect(row1(asset, f)).toEqual([RED, RED, WHITE, WHITE]);
    expect(row1(asset, 3)).toEqual([WHITE, WHITE, WHITE, WHITE]);
  });

  it('lands on a walking frame the base grows after it was painted', async () => {
    write('gato.txt', CAT(true));
    write('gato.retoque.txt', COLLAR);
    const asset = await build();
    expect(row1(asset, 3)).toEqual([RED, RED, WHITE, WHITE]); // walk_right 2, new
    expect(row1(asset, 4)).toEqual([WHITE, WHITE, WHITE, WHITE]); // idle_left
  });

  it('lets a frame of its own paint over it, and takes pixels out on every frame it names', async () => {
    write('gato.txt', CAT());
    write('gato.retoque.txt', [
      COLLAR.replace('== *_right\n....\nrr..\n....', '== *_right\n....\nrr..\n...!'),
      '== idle_right 0', '....', '..rr', '....', '',
    ].join('\n'));
    const asset = await build();
    expect(row1(asset, 0)).toEqual([RED, RED, RED, RED]);
    expect(row1(asset, 1)).toEqual([RED, RED, WHITE, WHITE]);
    for (const f of [0, 1, 2]) expect(composite(asset, f)[2][3]).toBe(0);
    expect(composite(asset, 3)[2][3]).not.toBe(0);
  });

  it('says no, naming the animations, when its scope names no frame of the drawing', async () => {
    write('gato.txt', CAT());
    write('gato.retoque.txt', COLLAR.replace('*_right', '*_up'));
    await expect(build()).rejects.toThrow(/"== \*_up" names no frame of the drawing \(its animations: idle_right, walk_right, idle_left\)/);
  });
});
