// @vitest-environment node
// Writing fewer columns (Khadosh/pixel-gaming-studio#27, from el patio: Gato 3
// and 6, Bichos 3 and 4): a frame that comes from another one and lists only
// the rows that change, a frame written by its left half, a whole animation
// that is another one mirrored, and every problem of the rows said at once.
// The compact text has to give the same pixels as the text written whole, and
// come back the same from toAscii, also after the editor touched it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ERASE, fromAscii, toAscii } from './ascii';
import { createAsset, loadAsset, saveAsset, setAnimation } from './asset';
import { runCommand } from './commands';
import { flipFrame } from './framederive';

type W = { warnings?: string[]; frames?: number[] };

const HEAD = ['id: buho', 'name: buho', 'category: prop', 'size: 7x4'];
const LEGEND = ['', 'k = #000000 tinta', 'o = #ffcc00 ojo'];
const text = (...lines: string[]) => [...lines, ''].join('\n');
const frames = (t: string) => fromAscii(t).asset.layers![0].frames;
const anim = (t: string, name: string) => fromAscii(t).asset.animations.find(a => a.name === name)!;

/** An owl that blinks and walks, written whole: what every compact form must give. */
const WHOLE = text(...HEAD, ...LEGEND,
  '', '== idle 0', 'k..k..k', 'kok.kok', 'kkkkkkk', 'k.....k',
  '', '== idle 1', 'k..k..k', 'kkk.kkk', 'kkkkkkk', 'k.....k',
  '', '== walk_right 0', 'kk.....', '.kko...', '..kkk..', '...k...',
  '', '== walk_right 1', '.kk....', '..kko..', '...kkk.', '....k..',
);

describe('a frame that comes from another', () => {
  const blink = text(...HEAD, ...LEGEND,
    '', '== idle 0', 'k..k..k', 'kok.kok', 'kkkkkkk', 'k.....k',
    '', '== idle 1 < idle 0', '1: kkk.kkk',
  );

  it('copies the other one and lays only the numbered rows', () => {
    expect(frames(blink)).toEqual(frames(WHOLE).slice(0, 2));
  });

  it('names it by slot, by animation alone (its first frame) or by frame number', () => {
    for (const ref of ['idle 0', 'idle', '0']) {
      expect(frames(blink.replace('< idle 0', `< ${ref}`))).toEqual(frames(blink));
    }
  });

  it('can be shifted and mirrored first: flip, then shift, then its rows', () => {
    const walk = text(...HEAD, ...LEGEND,
      '', '== walk_right 0', 'kk.....', '.kko...', '..kkk..', '...k...',
      '', '== walk_right 1 < walk_right 0', 'shift: 1,0',
      '', '== walk_left 0 < walk_right 0', 'flip: h', 'shift: 0,1', '0: ooooooo',
    );
    const [a, b, c] = frames(walk);
    expect(b).toEqual(frames(WHOLE)[3]);
    const flipped = flipFrame(a, 'h');
    expect(c[0]).toEqual(new Array(7).fill(2));
    expect(c.slice(1)).toEqual(flipped.slice(0, 3));
  });

  it('refuses what cannot be: a frame below, itself, an animation that is not there', () => {
    const below = text(...HEAD, ...LEGEND, '', '== a 0 < b 0', '0: kkkkkkk', '', '== b 0', 'k......', 'k......', 'k......', 'k......');
    expect(() => fromAscii(below)).toThrow(/written after it: a frame only comes from one above/);
    expect(() => fromAscii(blink.replace('< idle 0', '< idle 1'))).toThrow(/this same frame/);
    expect(() => fromAscii(blink.replace('< idle 0', '< parpadeo 0'))).toThrow(/no animation "parpadeo" \(idle\)/);
    expect(() => fromAscii(blink.replace('< idle 0', '< idle 4'))).toThrow(/idle has frames 0, 1/);
  });

  it('takes numbered rows only, and numbered rows only there', () => {
    expect(() => fromAscii(blink.replace('1: kkk.kkk', 'kkk.kkk'))).toThrow(/only the rows that change, each with its number: "N: kkk.kkk"/);
    const plain = text(...HEAD, ...LEGEND, '', '== idle 0', '1: kkk.kkk');
    expect(() => fromAscii(plain)).toThrow(/a numbered row \("1: …"\) only goes in a frame that comes from another/);
    expect(() => fromAscii(blink.replace('1: kkk.kkk', '9: kkk.kkk'))).toThrow(/row 9 is past the bottom \(rows 0 to 3\)/);
    expect(() => fromAscii(blink.replace('1: kkk.kkk', '1: kkk.kkk\n1: kkkkkkk'))).toThrow(/row 1 given twice/);
    expect(() => fromAscii(blink.replace('1: kkk.kkk', 'shift: 1'))).toThrow(/shift is "dx,dy"/);
    expect(() => fromAscii(blink.replace('1: kkk.kkk', 'flip: x'))).toThrow(/flip is "h"/);
    expect(() => fromAscii(blink.replace('1: kkk.kkk', 'mirror: x'))).toThrow(/cannot read "mirror: x" in a frame/);
  });

  it('in a retouch, carries the erase of the frame it comes from', () => {
    const over = text('retouch_of: buho.txt', 'size: 3x1', '', 'k = #000000', '', '== idle 0', 'k!.', '', '== idle 1 < idle 0', '0: ..k');
    const [a, b] = fromAscii(over).asset.layers![0].frames;
    expect(a[0]).toEqual([1, ERASE, 0]);
    expect(b[0]).toEqual([0, 0, 1]);
    const over2 = over.replace('0: ..k', 'shift: 1,0');
    expect(fromAscii(over2).asset.layers![0].frames[1][0]).toEqual([0, 1, ERASE]);
  });
});

describe('a frame written by its left half', () => {
  it('mirrors it, the middle column once when the width is odd', () => {
    const half = text(...HEAD, ...LEGEND,
      '', '== idle 0', 'half: left', 'k..k', 'kok.', 'kkkk', 'k...',
      '', '== idle 1 < idle 0', 'half: left', '1: kkk.',
    );
    expect(frames(half)).toEqual(frames(WHOLE).slice(0, 2));
  });

  it('even widths have no middle column', () => {
    const even = text('size: 4x1', '', 'k = #000000', 'o = #ffcc00', '', '== a 0', 'half: left', 'ko');
    expect(frames(even)[0][0]).toEqual([1, 2, 2, 1]);
  });

  it('needs the size when no frame is written whole, and says how wide the half is', () => {
    const noSize = text('', 'k = #000000', '', '== a 0', 'half: left', 'kk');
    expect(() => fromAscii(noSize)).toThrow(/add "size: WxH"/);
    const wrong = text(...HEAD, ...LEGEND, '', '== idle 0', 'half: left', 'k..k', 'kok', 'kkkk', 'k...');
    expect(() => fromAscii(wrong)).toThrow(/is 3 wide, expected 4 \(the left half of 7: "half: left"\)/);
    const forgot = text(...HEAD, ...LEGEND, '', '== idle 0', 'k..k..k', 'kok.kok', 'kkkkkkk', 'k.....k', '', '== idle 1 < idle 0', '1: kkk.');
    expect(() => fromAscii(forgot)).toThrow(/a left half\? say "half: left" first thing in the frame/);
    const late = text(...HEAD, ...LEGEND, '', '== idle 0', 'k..k', 'half: left');
    expect(() => fromAscii(late)).toThrow(/goes first in the frame/);
  });
});

describe('an animation that is another one mirrored', () => {
  const walk = text(...HEAD, 'anim: walk_right fps=8 loop=true', 'anim: walk_left mirror_of=walk_right', ...LEGEND,
    '', '== walk_right 0', 'kk.....', '.kko...', '..kkk..', '...k...',
    '', '== walk_right 1 < walk_right 0', 'shift: 1,0',
  );

  it('is one line: its frames are the other one\'s flipped, after the ones written, with its options', () => {
    const { asset } = fromAscii(walk);
    const f = asset.layers![0].frames;
    expect(f).toHaveLength(4);
    expect(anim(walk, 'walk_left')).toMatchObject({ frameIndices: [2, 3], fps: 8, loop: true });
    expect(f[2]).toEqual(flipFrame(f[0], 'h'));
    expect(f[3]).toEqual(flipFrame(f[1], 'h'));
    // Its own line wins over what it takes.
    expect(anim(walk.replace('mirror_of=walk_right', 'mirror_of=walk_right fps=4'), 'walk_left').fps).toBe(4);
  });

  it('refuses frames of its own, a source that is not there and a mirror of a mirror', () => {
    expect(() => fromAscii(walk + text('', '== walk_left 0', 'k......', 'k......', 'k......', 'k......')))
      .toThrow(/is the mirror of walk_right and also has frames of its own/);
    expect(() => fromAscii(walk.replace('mirror_of=walk_right', 'mirror_of=run_right'))).toThrow(/there is no such animation \(walk_right\)/);
    const twice = walk.replace('anim: walk_left mirror_of=walk_right', 'anim: walk_left mirror_of=walk_right\nanim: walk_back mirror_of=walk_left');
    expect(() => fromAscii(twice)).toThrow(/which is itself a mirror \(of walk_right\)/);
    expect(() => fromAscii(walk.replace('mirror_of=walk_right', 'mirror_of=walk_left'))).toThrow(/mirror of itself/);
  });
});

describe('the problems of the rows, all at once', () => {
  it('lists every row of the wrong length, and the unknown glyphs, in one error', () => {
    const bad = text(...HEAD, ...LEGEND,
      '', '== a 0', 'k..k..k', 'kok.ko', 'kkkkkkk', 'k.....k',
      '', '== a 1', 'k..k..k', 'kok.kokk', 'kkkkzkk', 'k.....k',
      '', '== a 2', 'k..k..k', 'kok.kok', 'kkkkkkk',
    );
    let msg = '';
    try { fromAscii(bad, { sourcePath: '/x/buho.txt' }); } catch (e) { msg = (e as Error).message; }
    expect(msg.split('\n')).toEqual([
      '4 problems in the rows of buho.txt:',
      'buho.txt:11 (frame 0, row 1): is 6 wide, expected 7',
      'buho.txt:17 (frame 1, row 1): is 8 wide, expected 7',
      'buho.txt:18 (frame 1, row 2, col 4): glyph "z" is not in the legend',
      'buho.txt:21 (frame 2): has 3 rows, expected 4',
    ]);
  });

  it('says one problem the way it always did', () => {
    const one = text(...HEAD, ...LEGEND, '', '== a 0', 'k..k..k', 'kok.ko', 'kkkkkkk', 'k.....k');
    expect(() => fromAscii(one, { sourcePath: 'buho.txt' })).toThrow(/^buho\.txt:11 \(frame 0, row 1\): is 6 wide, expected 7$/);
  });
});

describe('written back', () => {
  const COMPACT = text(...HEAD,
    'anim: idle fps=4', 'anim: walk_right fps=8', 'anim: walk_left mirror_of=walk_right', ...LEGEND,
    '', '== idle 0', 'half: left', 'k..k', 'kok.', 'kkkk', 'k...',
    '', '== idle 1 < idle 0', 'half: left', '1: kkk.',
    '', '== walk_right 0', 'kk.....', '.kko...', '..kkk..', '...k...',
    '', '== walk_right 1 < walk_right 0', 'shift: 1,0',
  );

  it('comes back exactly, and gives the pixels of the drawing written whole', () => {
    const { asset, layout } = fromAscii(COMPACT);
    expect(toAscii(asset, { layout }).text).toBe(COMPACT);
    expect(asset.layers![0].frames.slice(0, 4)).toEqual(frames(WHOLE));
    // Without the layout it is the plain format, every frame whole.
    expect(toAscii(asset).text).not.toMatch(/half:|<|mirror_of/);
    expect(fromAscii(toAscii(asset).text).asset.layers![0].frames).toEqual(asset.layers![0].frames);
  });

  it('after the editor touched a derived frame, lists the row it changed too', () => {
    const { asset, layout } = fromAscii(COMPACT);
    asset.layers![0].frames[3][3][0] = 2; // walk_right 1, row 3
    const out = toAscii(asset, { layout }).text;
    expect(out).toContain('== walk_right 1 < walk_right 0\nshift: 1,0\n3: o...k..\n');
    expect(fromAscii(out).asset.layers![0].frames).toEqual(asset.layers![0].frames);
  });

  it('a half that stopped being symmetric is written whole', () => {
    const { asset, layout } = fromAscii(COMPACT);
    asset.layers![0].frames[0][3][1] = 2;
    const out = toAscii(asset, { layout }).text;
    expect(out).toContain('== idle 0\nk..k..k\nkok.kok\nkkkkkkk\nko....k\n');
    expect(fromAscii(out).asset.layers![0].frames).toEqual(asset.layers![0].frames);
  });

  it('a mirror the editor retouched becomes frames that come from the other one flipped, with the rows fixed', () => {
    const { asset, layout } = fromAscii(COMPACT);
    asset.layers![0].frames[4][1][4] = 2; // walk_left 0: the light on the other edge
    const out = toAscii(asset, { layout }).text;
    expect(out).not.toContain('mirror_of');
    expect(out).toContain('== walk_left 0 < walk_right 0\nflip: h\n1: ...ook.\n');
    expect(out).toContain('== walk_left 1 < walk_right 1\nflip: h\n');
    const back = fromAscii(out).asset;
    expect(back.layers![0].frames).toEqual(asset.layers![0].frames);
    expect(back.animations.find(a => a.name === 'walk_left')).toMatchObject({ frameIndices: [4, 5], fps: 8 });
  });
});

describe('the commands', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-espejo-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const world = (from: string) => writeFileSync(join(dir, 'pgs.json'), JSON.stringify({ name: 'm', visual: { light: { from } } }));
  const drawing = text('size: 3x1', 'anim: walk_right fps=8', 'anim: walk_left mirror_of=walk_right', '', 'k = #000000', '', '== walk_right 0', 'kk.');

  it('from_ascii says a mirror turns a light from the side round, and not one from above', async () => {
    writeFileSync(join(dir, 'gato.txt'), drawing);
    world('lower_right');
    const side = await runCommand('from_ascii', { txt: join(dir, 'gato.txt'), out: join(dir, 'gato.pss.json') });
    expect((side.data as W).warnings!.join('\n')).toMatch(/walk_left \(walk_right\): mirrored, so the light of .*pgs\.json \(lower_right\) now comes from the other side/);
    world('top');
    const top = await runCommand('from_ascii', { txt: join(dir, 'gato.txt'), out: join(dir, 'gato.pss.json') });
    expect((top.data as W).warnings).toBeUndefined();
  });

  it('anim mirror_of= is the 14 steps of el patio in one: frames flipped on every layer, the options of the other', async () => {
    const p = join(dir, 'gato.pss.json');
    const asset = createAsset({ id: 'gato', width: 3, height: 1, palette: ['#000000', '#ffffff'], frames: 2 });
    asset.layers![0].frames = [[[1, 1, 0]], [[0, 1, 1]]];
    asset.layers!.push({ id: 'ropa', name: 'ropa', isVisible: true, isLocked: false, opacity: 1, frames: [[[2, 0, 0]], [[0, 0, 0]]] });
    setAnimation(asset, { name: 'walk_right', frameIndices: [0, 1], fps: 8, loop: true });
    saveAsset(p, asset);
    world('left');
    const r = await runCommand('anim', { path: p, name: 'walk_left', mirror_of: 'walk_right' });
    expect((r.data as W).frames).toEqual([2, 3]);
    expect((r.data as W).warnings![0]).toMatch(/walk_left \(walk_right\): mirrored/);
    const back = loadAsset(p);
    expect(back.layers![0].frames.slice(2)).toEqual([[[0, 1, 1]], [[1, 1, 0]]]);
    expect(back.layers![1].frames[2]).toEqual([[0, 0, 2]]);
    expect(back.animations.find(a => a.name === 'walk_left')).toMatchObject({ frameIndices: [2, 3], fps: 8, loop: true });
    await expect(runCommand('anim', { path: p, name: 'x', mirror_of: 'run' })).rejects.toThrow(/no animation "run" to mirror/);
    await expect(runCommand('anim', { path: p, name: 'x', mirror_of: 'walk_right', frames: [0] })).rejects.toThrow(/frames or mirror_of, not both/);
  });
});
