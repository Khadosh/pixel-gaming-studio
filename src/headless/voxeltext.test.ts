// Words on a voxel face (estudio#117): the name of the game on the tape of its
// machine and under its poster, written with one small letter instead of an
// alphabet drawn by hand in each script that paints a sign.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { smallLetter } from './smallletter';
import { setPaintText } from './voxeltext';
import { renderVoxel, type VoxelModel, type VoxelPaint } from './voxel';
import { runCommand } from './commands';
import type { SpriteAsset } from '../lib/types';

const font = () => smallLetter();
const set = (p: VoxelPaint, frame: [number, number]) => setPaintText(p, frame, path => {
  if (path) throw new Error('no font on disk here');
  return font();
}, 'prueba');
/** The pixels as rows: "t" where the color is, "." elsewhere. */
const rows = (p: VoxelPaint, color = 't') => p.pixels!.map(r => r.map(c => (c === color ? 't' : c ? 'c' : '.')).join(''));

// The alphabet of foco.py in the studio (estudio#110), the letters it had
// before this one: they keep their shape.
const BY_HAND: Record<string, string[]> = {
  P: ['ttt', 't.t', 'ttt', 't..', 't..'],
  A: ['ttt', 't.t', 'ttt', 't.t', 't.t'],
  T: ['ttt', '.t.', '.t.', '.t.', '.t.'],
  I: ['t', 't', 't', 't', 't'],
  O: ['ttt', 't.t', 't.t', 't.t', 'ttt'],
  E: ['ttt', 't..', 'tt.', 't..', 'ttt'],
  L: ['t..', 't..', 't..', 't..', 'ttt'],
  ' ': ['', '', '', '', ''],
};

/** foco.py's a_mano, as it was: the reference the small letter has to give back. */
function byHand(word: string, w: number, h: number, wobble: boolean): string[] {
  const out = Array.from({ length: h }, () => Array.from({ length: w }, () => 'c'));
  const width = [...word].reduce((n, L) => n + BY_HAND[L][0].length + 1, 0) - 1;
  let x = wobble ? 2 : Math.floor((w - width) / 2);
  [...word].forEach((L, k) => {
    const dy = wobble ? 1 + (k % 2) : Math.floor((h - 5) / 2);
    BY_HAND[L].forEach((row, r) => [...row].forEach((ch, col) => { if (ch === 't') out[r + dy][x + col] = 't'; }));
    x += BY_HAND[L][0].length + 1;
  });
  return out.map(r => r.join(''));
}

describe('the small letter', () => {
  it('has every capital and every digit, each with ink, five high at most', () => {
    const f = font();
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      const g = f.glyphs.get(ch);
      expect(g, `"${ch}"`).toBeDefined();
      expect(g!.empty, `"${ch}" has no ink`).toBe(false);
      expect(g!.bottom - g!.top + 1, `"${ch}"`).toBeLessThanOrEqual(5);
    }
  });

  it('writes the whole alphabet and the digits on a face, every letter leaving ink', () => {
    const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const p = set({ text: { value: all, color: 't' } }, [200, 5]);
    // Each letter alone paints something, and the line is the sum of their advances.
    for (const ch of all) expect(rows(set({ text: { value: ch, color: 't' } }, [6, 5])).join('')).toContain('t');
    const advances = [...all].reduce((n, ch) => n + font().glyphs.get(ch)!.advance, 0);
    const last = Math.max(...rows(p).map(r => r.lastIndexOf('t')));
    expect(last + 1 + font().metrics.track).toBe(advances);
  });

  it('keeps the shape of the seven letters foco.py drew by hand', () => {
    for (const [ch, shape] of Object.entries(BY_HAND)) {
      if (ch === ' ') continue;
      expect(rows(set({ text: { value: ch, color: 't' } }, [shape[0].length, 5])), `"${ch}"`).toEqual(shape);
    }
  });

  it('tells the letters apart that a three-wide alphabet tends to merge: O and 0, S and 5, B and 8', () => {
    const shape = (ch: string) => rows(set({ text: { value: ch, color: 't' } }, [5, 5])).join('/');
    for (const [a, b] of [['O', '0'], ['S', '5'], ['B', '8'], ['G', '6'], ['M', 'N'], ['U', 'V']]) expect(shape(a), `${a} ${b}`).not.toBe(shape(b));
  });
});

describe('text on a voxel face', () => {
  it('gives back the tape and the poster of the studio pixel for pixel', () => {
    // The tape: PATIO on a 24 x 7 strip, by hand from column 2 and every other letter lower.
    const tape = set({ text: { value: 'PATIO', color: 't', at: [2, 1], wobble: true }, background: 'c' }, [24, 7]);
    expect(rows(tape)).toEqual(byHand('PATIO', 24, 7, true));
    // The title of the poster: EL PATIO centred on 26 x 9.
    const title = set({ text: { value: 'EL PATIO', color: 't', at: [0, 2], align: 'center' }, background: 'c' }, [26, 9]);
    expect(rows(title)).toEqual(byHand('EL PATIO', 26, 9, false));
  });

  it('goes over the face\'s drawing, where its at puts it, and leaves the face where neither paints', () => {
    const p = set({ rows: ['ff', 'ff'], glyphs: { f: 'foto' }, at: [1, 0], text: { value: 'I', color: 't', at: [0, 1], align: 'right' } }, [4, 6]);
    expect(p.pixels).toEqual([
      [null, 'foto', 'foto', null],
      [null, 'foto', 'foto', 't'],
      [null, null, null, 't'],
      [null, null, null, 't'],
      [null, null, null, 't'],
      [null, null, null, 't'],
    ]);
    expect(p.text).toBeUndefined();
    expect(p.rows).toBeUndefined();
  });

  it('refuses a name that does not fit the face, and a character the font has not got, naming them', () => {
    expect(() => set({ text: { value: 'TRIXIA', color: 't', at: [2, 1] } }, [12, 7])).toThrow(/"TRIXIA" is 19x5 and from column 2, row 1 it does not fit the face \(12x7\)/);
    expect(() => set({ text: { value: 'ÑANDÚ', color: 't' } }, [40, 7])).toThrow(/uses "Ñ", "Ú", which the small letter/);
    expect(() => set({ background: 'c' }, [4, 4])).toThrow(/give text too/);
  });

  it('is set by the command: the renderer alone refuses it rather than paint nothing', () => {
    const m: VoxelModel = { id: 'x', materials: { w: { top: 'T', left: 'L', right: 'R' } }, boxes: [{ at: [0, 0, 0], size: [8, 1, 7], material: 'w', paint: { left: { text: { value: 'A', color: 'k' } } } }] };
    expect(() => renderVoxel(m)).toThrow(/text is set into pixels by the voxel command/);
  });
});

describe('text through the voxel command', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-texto-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const draw = async (paint: VoxelPaint, name: string) => {
    const model = { id: 'cinta', materials: { cinta: { top: '#eeeeee', left: '#dddddd', right: '#999999' } },
      boxes: [{ at: [0, 0, 0], size: [24, 1, 7], material: 'cinta', paint: { left: paint } }], outline: '#000000' };
    writeFileSync(join(dir, `${name}.voxel.json`), JSON.stringify(model));
    await runCommand('voxel', { model: join(dir, `${name}.voxel.json`), out: join(dir, `${name}.pss.json`) });
    const a = JSON.parse(readFileSync(join(dir, `${name}.pss.json`), 'utf8')) as SpriteAsset;
    return JSON.stringify([a.palette, a.layers!.map(l => l.frames)]);
  };

  it('draws a tape with text exactly as the same tape with the letters given as rows', async () => {
    const glyphs = { c: '#dddddd', t: '#111111' };
    const text = await draw({ text: { value: 'PATIO', color: '#111111', at: [2, 1], wobble: true }, background: '#dddddd' }, 'texto');
    const hand = await draw({ rows: byHand('PATIO', 24, 7, true), glyphs }, 'mano');
    expect(text).toBe(hand);
  });

  it('reads a font of its own beside the model', async () => {
    writeFileSync(join(dir, 'raya.txt'), ['id: raya', 'name: raya', 'category: ui', 'size: 3x5', 'font: cell=3x5 baseline=5 line=6 space=1 track=1', 'glyphs: -', '', 'k = #000000 tinta', '', '==', '...', '...', 'kkk', '...', '...', ''].join('\n'));
    const own = await draw({ text: { value: '--', color: '#111111', font: 'raya.txt' } }, 'propia');
    const rowsOf = await draw({ rows: ['', '', 'ttt.ttt'], glyphs: { t: '#111111' } }, 'filas');
    expect(own).toBe(rowsOf);
    await expect(draw({ text: { value: 'A', color: '#111111', font: 'raya.txt' } }, 'falta')).rejects.toThrow(/uses "A", which the font raya\.txt has not got/);
  });
});
