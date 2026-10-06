// @vitest-environment node
// Typography: a glyph sheet is a text drawing, the drawing is the metric, and
// what a recipe composes keeps the hand pass that lands beside it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { fromAscii, toAscii } from './ascii';
import { buildFont, bmfont, checkPhrase, layoutText, renderText } from './font';
import { loadFont } from './fontfile';
import { readPng } from './png';

const EXAMPLES = join(__dirname, '../../examples/tipografia');
const SHEET = join(EXAMPLES, 'nube.txt');
const BASE = join(EXAMPLES, 'nube_base.txt');

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pss-fuente-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A tiny font written by hand, to check the format without the example in the way. */
const TINY = [
  'id: mini',
  'name: mini',
  'category: ui',
  'size: 12x6',
  'font: cell=4x6 baseline=5 line=7 space=2 track=1',
  'glyphs: Il.',
  '',
  'k = #000000 tinta',
  '',
  '==',
  '............',
  'kkk.k.......',
  '.k..k.......',
  '.k..k.......',
  '.k..k.......',
  'kkk.k...k...',
].join('\n') + '\n';

function tiny() {
  const parsed = fromAscii(TINY, { sourcePath: 'mini.txt' });
  return buildFont(parsed.asset, parsed.layout, 'mini.txt');
}

describe('a font is a text drawing', () => {
  it('reads the four font headers and lays out the cells', () => {
    const font = tiny();
    expect(font.metrics).toMatchObject({ cellW: 4, cellH: 6, baseline: 5, line: 7, space: 2, track: 1, cols: 3, rows: 1 });
    // "I", "l", "." plus the space, which is always there.
    expect([...font.glyphs.keys()].sort()).toEqual([' ', '.', 'I', 'l']);
    expect(font.glyphs.get('I')).toMatchObject({ col: 0, row: 0, left: 0, right: 2, top: 1, bottom: 5 });
  });

  it('takes the advance from the ink, so widening a glyph widens the text', () => {
    const font = tiny();
    expect(font.glyphs.get('I')!.advance).toBe(4);   // ink 0..2, plus track
    expect(font.glyphs.get('l')!.advance).toBe(2);   // one column of ink
    expect(font.glyphs.get(' ')!.advance).toBe(2);   // no ink: the declared space
    expect(layoutText(font, 'Il').width).toBe(5);
  });

  it('round-trips the font headers through the text format', () => {
    const parsed = fromAscii(TINY, { sourcePath: 'mini.txt' });
    expect(toAscii(parsed.asset, { layout: parsed.layout }).text).toBe(TINY);
  });

  it('names the file and the problem when the sheet is not a whole number of cells', () => {
    const bad = TINY.replace('cell=4x6', 'cell=5x6');
    const parsed = fromAscii(bad, { sourcePath: 'mini.txt' });
    expect(() => buildFont(parsed.asset, parsed.layout, 'mini.txt')).toThrow(/12x6.*5x6/);
  });

  it('refuses a drawing that is not a font', () => {
    const parsed = fromAscii(TINY.replace(/^font:.*\n/m, '').replace(/^glyphs:.*\n/m, ''), { sourcePath: 'mini.txt' });
    expect(() => buildFont(parsed.asset, parsed.layout, 'mini.txt')).toThrow(/not a font/);
  });

  it('an advance override that names no glyph is an error, not a surprise', () => {
    const parsed = fromAscii(TINY.replace('glyphs: Il.', 'glyphs: Il.\nadvance: Z=3'), { sourcePath: 'mini.txt' });
    expect(() => buildFont(parsed.asset, parsed.layout, 'mini.txt')).toThrow(/"Z" is not a glyph/);
  });
});

describe('setting text', () => {
  it('only scales by whole numbers', () => {
    const font = tiny();
    const one = renderText(font, 'Il', { margin: 0 });
    const three = renderText(font, 'Il', { scale: 3, margin: 0 });
    expect([three.width, three.height]).toEqual([one.width * 3, one.height * 3]);
    expect(() => renderText(font, 'Il', { scale: 1.5 })).toThrow(/whole number/);
  });

  it('a newline starts a line, one line height below', () => {
    const font = tiny();
    const laid = layoutText(font, 'I\nI');
    expect(laid.lines).toHaveLength(2);
    expect(laid.lines[1][0].y).toBe(font.metrics.line);
    expect(laid.height).toBe(font.metrics.line + font.metrics.cellH);
  });

  it('kerning moves the second glyph of the pair and nothing else', () => {
    const parsed = fromAscii(TINY.replace('glyphs: Il.', 'glyphs: Il.\nkern: Il=-1'), { sourcePath: 'mini.txt' });
    const font = buildFont(parsed.asset, parsed.layout, 'mini.txt');
    expect(layoutText(font, 'Il').width).toBe(4);
    expect(layoutText(font, 'lI').width).toBe(5);
  });
});

describe('the control sheet', () => {
  it('says which characters of the phrase the font has no glyph for', () => {
    const check = checkPhrase(tiny(), 'Illa');
    expect(check.missing).toEqual(['a']);
    expect(check.problems.join(' ')).toMatch(/no glyph for 1 character/);
  });

  it('catches two letters that touch with no pixel between them', () => {
    // "track=0" takes the one column that kept them apart.
    const parsed = fromAscii(TINY.replace('track=1', 'track=0'), { sourcePath: 'mini.txt' });
    const check = checkPhrase(buildFont(parsed.asset, parsed.layout, 'mini.txt'), 'Il');
    expect(check.touching).toEqual(['Il']);
    expect(check.problems.join(' ')).toMatch(/touch with no pixel/);
  });

  it('catches ink in a cell no glyphs row claims', () => {
    const parsed = fromAscii(TINY.replace('glyphs: Il.', 'glyphs: Il'), { sourcePath: 'mini.txt' });
    const check = checkPhrase(buildFont(parsed.asset, parsed.layout, 'mini.txt'), 'Il');
    expect(check.problems.join(' ')).toMatch(/no character in a "glyphs:" row/);
  });

  it('font_contact is a looking command: it answers the report and the image', async () => {
    const res = await runCommand('font_contact', { path: SHEET, scale: [1, 2], out: join(dir, 'm.png') });
    expect(res.png).toBeTruthy();
    expect(res.text).toMatch(/faltan: ninguno/);
    expect(res.text).toMatch(/se tocan: ninguno/);
    expect(existsSync(join(dir, 'm.png'))).toBe(true);
  });
});

describe('the example font', () => {
  it('has every glyph Spanish needs and sets the sample phrase with no problems', async () => {
    const { font } = loadFont(SHEET);
    for (const ch of 'áéíóúüñÁÉÍÓÚÜÑ¿¡«»—') expect(font.glyphs.has(ch)).toBe(true);
    for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') expect(font.glyphs.has(ch)).toBe(true);
    const res = await runCommand('font_contact', { path: SHEET });
    expect((res.data as { problems: string[] }).problems).toEqual([]);
  });

  it('is proportional: an "i" does not take the room of an "M"', () => {
    const { font } = loadFont(SHEET);
    expect(font.glyphs.get('i')!.advance).toBeLessThan(font.glyphs.get('M')!.advance);
  });

  it('is the one the recipe writes: font_compose rebuilds it byte for byte', async () => {
    const out = join(dir, 'nube.txt');
    for (const f of ['nube_base.txt', 'nube.compose.json']) copyFileSync(join(EXAMPLES, f), join(dir, f));
    await runCommand('font_compose', { spec: join(dir, 'nube.compose.json'), out });
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(SHEET, 'utf8'));
  });
});

describe('what a recipe writes and a hand changes', () => {
  async function compose() {
    for (const f of ['nube_base.txt', 'nube.compose.json', 'nube.retoque.txt']) copyFileSync(join(EXAMPLES, f), join(dir, f));
    return runCommand('font_compose', { spec: join(dir, 'nube.compose.json'), out: join(dir, 'nube.txt') });
  }

  it('carries generated_by, so nobody wonders who owns the file', async () => {
    await compose();
    const text = readFileSync(join(dir, 'nube.txt'), 'utf8');
    expect(text).toMatch(/^generated_by: font_compose spec=nube\.compose\.json base=nube_base\.txt$/m);
  });

  it('will not overwrite a sheet drawn by hand', async () => {
    copyFileSync(join(EXAMPLES, 'nube.compose.json'), join(dir, 'nube.compose.json'));
    copyFileSync(join(EXAMPLES, 'nube_base.txt'), join(dir, 'nube_base.txt'));
    writeFileSync(join(dir, 'a_mano.txt'), readFileSync(BASE, 'utf8'));
    await expect(runCommand('font_compose', { spec: join(dir, 'nube.compose.json'), out: join(dir, 'a_mano.txt') }))
      .rejects.toThrow(/drawn by hand/);
    await runCommand('font_compose', { spec: join(dir, 'nube.compose.json'), out: join(dir, 'a_mano.txt'), force: true });
  });

  it('keeps the retouch when the recipe runs again', async () => {
    await compose();
    const con = loadFont(join(dir, 'nube.txt'));
    const sin = loadFont(join(dir, 'nube.txt'), false);
    expect(con.retouch!.painted).toBeGreaterThan(0);
    // The hand widened the accent of the capital I; the generated sheet alone does not have it.
    const ancho = (f: typeof con) => f.font.glyphs.get('Í')!;
    expect(ancho(con).top).toBe(0);
    const pixels = (f: typeof con) => f.font.sheet.flat().filter(Boolean).length;
    expect(pixels(con)).toBe(pixels(sin) + con.retouch!.painted);
  });
});

describe('out to an engine', () => {
  it('writes a BMFont whose page and chars match the sheet', async () => {
    const out = join(dir, 'nube.fnt');
    const res = await runCommand('font', { path: SHEET, out, godot_import: true });
    const fnt = readFileSync(out, 'utf8');
    const { font } = loadFont(SHEET);
    expect(fnt).toMatch(/^common lineHeight=12 base=9 scaleW=128 scaleH=88 pages=1/m);
    expect(fnt).toMatch(/^page id=0 file="nube\.png"$/m);
    expect(fnt).toMatch(new RegExp(`^chars count=${font.glyphs.size}$`, 'm'));
    // The ñ: its rect on the page, its advance, and a page that is really there.
    const n = font.glyphs.get('ñ')!;
    expect(fnt).toMatch(new RegExp(`^char id=241 x=${n.col * 8 + n.left} y=${n.row * 11 + n.top} .*xadvance=${n.advance} `, 'm'));
    const page = readPng(join(dir, 'nube.png'));
    expect([page.width, page.height]).toEqual([128, 88]);
    expect((res.data as { glyphs: number }).glyphs).toBe(font.glyphs.size);
    // The .import Godot wants, with the only option that matters for a pixel font.
    expect(readFileSync(`${out}.import`, 'utf8')).toMatch(/scaling_mode=1/);
  });

  it('a glyph with no ink is still a char, so a space is a space', () => {
    const fnt = bmfont(tiny(), 'mini.png');
    expect(fnt).toMatch(/^char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=2 /m);
  });
});
