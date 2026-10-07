// @vitest-environment node
// A derived font: the same drawing one operation later, with the advance
// recalculated out of the ink and the counterforms counted before and after.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { fromAscii } from './ascii';
import { buildFont, checkPhrase, layoutText } from './font';
import { loadFont } from './fontfile';
import { counterCensus, halfBrightness } from './fontvariant';

const EXAMPLES = join(__dirname, '../../examples/tipografia');
const SHEET = join(EXAMPLES, 'nube.txt');

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-variante-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/**
 * A font of three glyphs with everything a variant has to get right: a letter
 * with a counterform two pixels wide (`o`), one with gaps a single pixel wide
 * (`m`, which is the one a smear kills), and a glyph drawn against column 0 so
 * the outline has to find room on its left.
 */
const TINY = [
  'id: mini',
  'name: mini',
  'category: ui',
  'size: 18x7',
  'font: cell=6x7 baseline=6 line=8 space=3 track=1',
  'glyphs: oml',
  'advance: l=4',
  '',
  'k = #ffffff tinta',
  '',
  '==',
  '..................',
  '.kk...k.k.k..k....',
  'k..k..k.k.k..k....',
  'k..k..k.k.k..k....',
  'k..k..k.k.k..k....',
  '.kk...k.k.k..k....',
  '..................',
].join('\n') + '\n';

function write(name: string, text: string) {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

function fontOf(path: string) {
  return loadFont(path).font;
}

async function variant(kind: string, extra: Record<string, unknown> = {}, text = TINY) {
  const path = write('mini.txt', text);
  const out = join(dir, `mini.${kind}.txt`);
  const res = await runCommand('font_variant', { path, out, kind, ...extra });
  return { out, data: res.data as Record<string, never>, text: res.text as string };
}

describe('a variant is one more step of the same machine', () => {
  it('grows the cell, the baseline and the line so nothing is clipped', async () => {
    const { out } = await variant('outline');
    const font = fontOf(out);
    // A pixel on every side; the leading (line - cell) is the one the base had.
    expect(font.metrics).toMatchObject({ cellW: 8, cellH: 9, baseline: 7, line: 10 });
    expect(font.glyphs.size).toBe(4);
  });

  it('recalculates the advance out of the ink, declared ones included', async () => {
    const base = buildFont(fromAscii(TINY, { sourcePath: 'mini.txt' }).asset,
      fromAscii(TINY, { sourcePath: 'mini.txt' }).layout, 'mini.txt');
    expect(base.glyphs.get('o')!.advance).toBe(5);
    expect(base.glyphs.get('l')!.advance).toBe(4);   // declared
    expect(base.glyphs.get(' ')!.advance).toBe(3);   // no ink

    const bold = fontOf((await variant('bold')).out);
    // Nobody declared this: the letter is one pixel fatter and the metric followed.
    expect(bold.glyphs.get('o')!.advance).toBe(6);
    // A declared advance of a glyph with ink grows the same amount, so a digit
    // that was lined up with its siblings stays lined up.
    expect(bold.glyphs.get('l')!.advance).toBe(5);
    // The space has no ink, so nothing grew it.
    expect(bold.glyphs.get(' ')!.advance).toBe(3);

    const outline = fontOf((await variant('outline')).out);
    expect(outline.glyphs.get('o')!.advance).toBe(7);
    expect(outline.glyphs.get('l')!.advance).toBe(6);
  });

  it('keeps the gap between neighbours: a contour never glues two letters', async () => {
    for (const kind of ['outline', 'shadow', 'bold']) {
      const font = fontOf((await variant(kind)).out);
      expect(checkPhrase(font, 'oomm ll').touching).toEqual([]);
    }
  });

  it('closes no counterform with a contour and kills the 1 px gaps with a smear', async () => {
    const outline = await variant('outline');
    expect(outline.data.closed).toEqual([]);
    // The smear eats a gap of one pixel: "m" goes solid, "o" only narrows.
    const bold = await variant('bold');
    expect(bold.data.closed).toEqual(['m']);
    expect(bold.data.tightened).toEqual(['o']);
    expect(bold.text).toContain('se cerraron: m');
  });

  it('says what it is in generated_by, and refuses to overwrite what it did not make', async () => {
    const { out } = await variant('bold');
    const text = readFileSync(out, 'utf8');
    expect(text).toContain('generated_by: font_variant path=mini.txt kind=bold dx=1 dy=0');

    // The same command and arguments again: fair game, that is the recipe running.
    const path = join(dir, 'mini.txt');
    await expect(runCommand('font_variant', { path, out, kind: 'bold' })).resolves.toBeTruthy();
    // Another operation on the same file is another recipe: it stops.
    await expect(runCommand('font_variant', { path, out, kind: 'outline' }))
      .rejects.toThrow(/was made by "font_variant path=mini.txt kind=bold/);
    // A drawing with no header was drawn by hand.
    await expect(runCommand('font_variant', { path, out: path, kind: 'bold' }))
      .rejects.toThrow(/drawn by hand/);
    await expect(runCommand('font_variant', { path, out, kind: 'outline', force: true })).resolves.toBeTruthy();
  });

  it('takes the retouch beside it, counts what it decides and says what it reopened', async () => {
    const { out, data } = await variant('bold');
    expect(data.closed).toEqual(['m']);
    expect(data.retouch).toBeNull();

    // The hand pass: the smeared "m" goes back to a single weight, with "!".
    const sheet = readFileSync(out, 'utf8');
    const width = /size: (\d+)x(\d+)/.exec(sheet)!;
    const w = Number(width[1]), h = Number(width[2]);
    const rows = Array.from({ length: h }, () => Array<string>(w).fill('.'));
    const bold = fontOf(out);
    const m = bold.glyphs.get('m')!;
    const { cellW, cellH } = bold.metrics;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        // Erase every column the smear added: 1, 3 and 5 of the solid block.
        if (bold.sheet[m.row * cellH + y]?.[m.col * cellW + x] && x % 2 === 1) {
          rows[m.row * cellH + y][m.col * cellW + x] = '!';
        }
      }
    }
    writeFileSync(join(dir, 'mini.bold.retoque.txt'), [
      'id: mini_retoque', 'name: mini retoque', 'category: ui', `size: ${w}x${h}`,
      'retouch_of: mini.bold.txt', '', 'k = #ffffff tinta', '', '==',
      ...rows.map(r => r.join('')),
    ].join('\n') + '\n');

    const again = await runCommand('font_variant', { path: join(dir, 'mini.txt'), out, kind: 'bold' });
    const data2 = again.data as Record<string, never>;
    // The recipe wrote the base again and the hand pass is still on top of it.
    expect((data2.retouch as unknown as { erased: number }).erased).toBeGreaterThan(0);
    expect(data2.closed).toEqual(['m']);
    expect(data2.closed_after_retouch).toEqual([]);
    expect(again.text).toContain('con el retoque encima siguen cerrados: ninguno');
    // And the metric followed the hand too: the "m" is narrow again.
    expect(counterCensus(loadFont(out).font).get('m')!.regions).toBe(2);
  });

  it('gives the shadow a color of its own, half the ink by default', async () => {
    expect(halfBrightness('#ffffff')).toBe('#808080');
    const { out, data } = await variant('shadow');
    expect(data.color).toBe('#808080');
    const text = readFileSync(out, 'utf8');
    expect(text).toContain('#808080 sombra');
    // The letter is untouched: a shadow adds ink behind it, it does not move it.
    const base = fontOf(join(dir, 'mini.txt'));
    const shadow = fontOf(out);
    expect(shadow.glyphs.get('o')!.top).toBe(base.glyphs.get('o')!.top);
    expect(shadow.glyphs.get('o')!.left).toBe(base.glyphs.get('o')!.left);
    const named = await runCommand('font_variant', {
      path: join(dir, 'mini.txt'), out: join(dir, 'azul.txt'), kind: 'shadow', color: '#334455',
    });
    expect((named.data as { color: string }).color).toBe('#334455');
  });

  it('is a font on its own terms: it reads back and sets text', async () => {
    for (const kind of ['outline', 'shadow', 'bold']) {
      const { out } = await variant(kind);
      expect(existsSync(out)).toBe(true);
      const font = fontOf(out);
      const laid = layoutText(font, 'mol');
      expect(laid.missing).toEqual([]);
      expect(laid.width).toBeGreaterThan(0);
    }
  });

  it('stops before writing a copy of the base', async () => {
    await expect(variant('bold', { dx: 0, dy: 0 })).rejects.toThrow(/would be a copy of the base sheet/);
  });
});

describe('the example font, derived', () => {
  it('keeps every glyph and every pair apart at the real body', async () => {
    const out = join(dir, 'nube.negrita.txt');
    const res = await runCommand('font_variant', { path: SHEET, out, kind: 'bold' });
    const data = res.data as Record<string, never>;
    expect(data.sheet_glyphs).toBe(111);
    expect(data.advance_grew).toBe(1);
    // The one thing a derived font must never do.
    const check = checkPhrase(fontOf(out), 'El niño miró la estela y preguntó: ¿Quién? «Nadie» ¡1234567890!');
    expect(check.touching).toEqual([]);
    expect(check.missing).toEqual([]);
  });

  it('answers which glyphs the smear closed, and the contour closes almost none', async () => {
    const bold = await runCommand('font_variant', { path: SHEET, out: join(dir, 'b.txt'), kind: 'bold' });
    // The letters whose strokes sit one pixel apart: this is the list the hand
    // pass of the example is built on.
    expect((bold.data as { closed: string[] }).closed).toEqual(['W', 'm', 'r', 'w', 'x', '4', '"', '«', '»', '¨', '*', '&', '#', '…']);
    const outline = await runCommand('font_variant', { path: SHEET, out: join(dir, 'o.txt'), kind: 'outline' });
    expect((outline.data as { closed: string[] }).closed).toEqual(['#']);
  });
});
