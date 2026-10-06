// @vitest-environment node
// The web export: the same drawing, out as a font a browser loads.
//
// These tests read the file back — table by table, glyph by glyph — instead of
// comparing it to a blob of expected bytes, because "the bytes are the ones I
// expected" says nothing about whether a browser draws the drawing. The part a
// unit test cannot do (a real browser rasterizing it) is the control in
// `examples/tipografia/web.html`, and what that control caught lives here as
// `the content box is the line of the drawing`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { fromAscii } from './ascii';
import { bmfont, buildFont, type PixelFont } from './font';
import { loadFont } from './fontfile';
import { fontFaceCss, tableChecksum, webFont, UNITS_PER_PIXEL } from './fontweb';

const EXAMPLES = join(__dirname, '../../examples/tipografia');
const SHEET = join(EXAMPLES, 'nube.txt');

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-web-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const TINY = [
  'id: mini',
  'name: Mini 4',
  'category: ui',
  'size: 12x6',
  'font: cell=4x6 baseline=5 line=7 space=2 track=1',
  'glyphs: Il.',
  'kern: Il=-1',
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

function tiny(): PixelFont {
  const parsed = fromAscii(TINY, { sourcePath: 'mini.txt' });
  return buildFont(parsed.asset, parsed.layout, 'mini.txt');
}

// ── A small reader, so the test opens the file instead of trusting it ──────

interface Glyf { contours: { x: number; y: number }[][]; xMin: number; yMin: number; xMax: number; yMax: number }

function readTtf(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(dv.getUint32(0)).toBe(0x00010000);
  const numTables = dv.getUint16(4);
  const tables = new Map<string, { offset: number; length: number; checksum: number }>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    tables.set(tag, { checksum: dv.getUint32(o + 4), offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) });
  }
  const at = (tag: string) => {
    const t = tables.get(tag);
    if (!t) throw new Error(`the font has no "${tag}" table`);
    return t;
  };

  const head = at('head');
  const unitsPerEm = dv.getUint16(head.offset + 18);
  const indexToLocFormat = dv.getInt16(head.offset + 50);
  const hhea = at('hhea');
  const numberOfHMetrics = dv.getUint16(hhea.offset + 34);
  const metrics = {
    ascent: dv.getInt16(hhea.offset + 4),
    descent: dv.getInt16(hhea.offset + 6),
    lineGap: dv.getInt16(hhea.offset + 8),
  };
  const numGlyphs = dv.getUint16(at('maxp').offset + 4);

  const loca: number[] = [];
  const l = at('loca');
  for (let i = 0; i <= numGlyphs; i++) {
    loca.push(indexToLocFormat ? dv.getUint32(l.offset + i * 4) : dv.getUint16(l.offset + i * 2) * 2);
  }

  const hmtx = at('hmtx');
  const advance = (gid: number) => dv.getUint16(hmtx.offset + Math.min(gid, numberOfHMetrics - 1) * 4);

  const glyfStart = at('glyf').offset;
  const glyph = (gid: number): Glyf | null => {
    if (loca[gid + 1] <= loca[gid]) return null;
    let o = glyfStart + loca[gid];
    const nc = dv.getInt16(o);
    const box = { xMin: dv.getInt16(o + 2), yMin: dv.getInt16(o + 4), xMax: dv.getInt16(o + 6), yMax: dv.getInt16(o + 8) };
    o += 10;
    const ends: number[] = [];
    for (let i = 0; i < nc; i++) { ends.push(dv.getUint16(o)); o += 2; }
    const instructions = dv.getUint16(o); o += 2;
    expect(instructions).toBe(0);
    const n = ends[ends.length - 1] + 1;
    const flags: number[] = [];
    for (let i = 0; i < n; i++) { flags.push(dv.getUint8(o)); o += 1; }
    expect(flags.every(f => f === 0x01)).toBe(true); // every point on the curve: straight lines only
    const xs: number[] = []; let x = 0;
    for (let i = 0; i < n; i++) { x += dv.getInt16(o); o += 2; xs.push(x); }
    const ys: number[] = []; let y = 0;
    for (let i = 0; i < n; i++) { y += dv.getInt16(o); o += 2; ys.push(y); }
    const contours: { x: number; y: number }[][] = [];
    let from = 0;
    for (const end of ends) {
      contours.push(xs.slice(from, end + 1).map((cx, i) => ({ x: cx, y: ys[from + i] })));
      from = end + 1;
    }
    return { contours, ...box };
  };

  // cmap: the format 4 subtable the Windows record points at.
  const cmap = at('cmap');
  const records = dv.getUint16(cmap.offset + 2);
  let sub = -1;
  const platforms: [number, number][] = [];
  for (let i = 0; i < records; i++) {
    const o = cmap.offset + 4 + i * 8;
    platforms.push([dv.getUint16(o), dv.getUint16(o + 2)]);
    if (dv.getUint16(o) === 3 && dv.getUint16(o + 2) === 1) sub = cmap.offset + dv.getUint32(o + 4);
  }
  expect(sub).toBeGreaterThan(0);
  expect(dv.getUint16(sub)).toBe(4);
  const segCount = dv.getUint16(sub + 6) / 2;
  const ends = Array.from({ length: segCount }, (_, i) => dv.getUint16(sub + 14 + i * 2));
  const starts = Array.from({ length: segCount }, (_, i) => dv.getUint16(sub + 16 + segCount * 2 + i * 2));
  const deltas = Array.from({ length: segCount }, (_, i) => dv.getUint16(sub + 16 + segCount * 4 + i * 2));
  const gidOf = (code: number): number => {
    for (let i = 0; i < segCount; i++) {
      if (code >= starts[i] && code <= ends[i]) return (code + deltas[i]) % 0x10000;
    }
    return 0;
  };

  const names = new Map<number, string>();
  const name = at('name');
  const count = dv.getUint16(name.offset + 2);
  const strings = name.offset + dv.getUint16(name.offset + 4);
  for (let i = 0; i < count; i++) {
    const o = name.offset + 6 + i * 12;
    const id = dv.getUint16(o + 6);
    const len = dv.getUint16(o + 8);
    const off = dv.getUint16(o + 10);
    let s = '';
    for (let j = 0; j < len; j += 2) s += String.fromCharCode(dv.getUint16(strings + off + j));
    names.set(id, s);
  }

  return { buf, dv, tables, unitsPerEm, metrics, numGlyphs, loca, advance, glyph, gidOf, names, platforms };
}

/** The outline back to a bitmap of the cell, to compare with the drawing. */
function rasterize(g: Glyf, cellW: number, cellH: number, baseline: number): number[][] {
  const u = UNITS_PER_PIXEL;
  const out = Array.from({ length: cellH }, () => new Array(cellW).fill(0));
  for (const contour of g.contours) {
    const xs = contour.map(p => p.x), ys = contour.map(p => p.y);
    const x0 = Math.min(...xs) / u, x1 = Math.max(...xs) / u;
    const y0 = Math.min(...ys) / u, y1 = Math.max(...ys) / u;
    for (let yy = y0; yy < y1; yy++) {
      const r = baseline - 1 - yy;
      for (let xx = x0; xx < x1; xx++) if (out[r]) out[r][xx] = 1;
    }
  }
  return out;
}

describe('a glyph sheet as a font for the browser', () => {
  it('writes a TrueType whose every table checksum, and the file\'s own, add up', () => {
    const web = webFont(tiny());
    const ttf = readTtf(web.ttf);
    for (const [tag, t] of ttf.tables) {
      const data = web.ttf.slice(t.offset, t.offset + t.length);
      // The directory's checksum for `head` is the one the table has with
      // checkSumAdjustment still at zero, which is what the spec asks for.
      if (tag === 'head') data.fill(0, 8, 12);
      expect(tableChecksum(data), `checksum of ${tag}`).toBe(t.checksum);
    }
    // head.checkSumAdjustment is what makes the whole file sum to the magic number.
    expect(tableChecksum(web.ttf)).toBe(0xb1b0afba);
    expect([...ttf.tables.keys()].sort()).toEqual(
      ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'kern', 'loca', 'maxp', 'name', 'post'],
    );
    // The two cmap records a browser looks for.
    expect(ttf.platforms).toEqual([[0, 3], [3, 1]]);
  });

  it('is the same bytes every time, so the exported file belongs in git', () => {
    const font = tiny();
    expect(Buffer.from(webFont(font).ttf).equals(Buffer.from(webFont(font).ttf))).toBe(true);
  });

  it('puts the design body in the em: at font-size em, one drawing pixel is one px', () => {
    const web = webFont(tiny());
    expect(web.em).toBe(4);                               // the cell is 4 wide
    expect(web.unitsPerEm).toBe(4 * UNITS_PER_PIXEL);
    expect(web.sizes).toEqual([4, 8, 12]);
    expect(readTtf(web.ttf).unitsPerEm).toBe(web.unitsPerEm);
    expect(webFont(tiny(), { em: 6 }).unitsPerEm).toBe(6 * UNITS_PER_PIXEL);
  });

  it('the content box is the line of the drawing, so the baseline lands on a whole pixel', () => {
    // The browser control caught this: with the descent at the ink the inline
    // box is 11 px for a 12 px line, the half-leading is half a pixel, and the
    // whole drawing is set one device pixel off at 2x and two at 3x.
    const font = loadFont(SHEET).font;
    const web = webFont(font);
    expect(web.ascent).toBe(font.metrics.baseline);
    expect(web.ascent + web.descent + web.lineGap).toBe(font.metrics.line);
    expect((font.metrics.line - (web.ascent + web.descent)) % 2).toBe(0);
    const ttf = readTtf(web.ttf);
    expect(ttf.metrics.ascent).toBe(web.ascent * UNITS_PER_PIXEL);
    expect(ttf.metrics.descent).toBe(-web.descent * UNITS_PER_PIXEL);
    // The CSS says the same line, and a whole multiple of it per scale.
    const css = fontFaceCss(web, 'nube.ttf');
    expect(css).toContain(`font-size: ${web.em}px;`);
    expect(css).toContain(`line-height: ${font.metrics.line}px;`);
    expect(css).toContain(`font-size: ${web.em * 2}px; line-height: ${font.metrics.line * 2}px;`);
    expect(css).toContain(`font-size: ${web.em * 3}px; line-height: ${font.metrics.line * 3}px;`);
  });

  it('never descends past what the font says it does', () => {
    const font = loadFont(SHEET).font;
    const web = webFont(font);
    const deepest = Math.max(...[...font.glyphs.values()].filter(g => !g.empty).map(g => g.bottom + 1 - font.metrics.baseline));
    expect(web.descent).toBeGreaterThanOrEqual(deepest);
  });

  it('carries the very same advances as the BMFont, glyph by glyph', () => {
    const font = loadFont(SHEET).font;
    const web = webFont(font);
    const ttf = readTtf(web.ttf);
    // The BMFont is the other export of the same source of truth: if these two
    // ever drift, the font a web page sets and the one a game sets are not the
    // same font any more.
    const xadvance = new Map<number, number>();
    for (const line of bmfont(font, 'nube.png').split('\n')) {
      const m = /^char id=(\d+).*? xadvance=(-?\d+)/.exec(line);
      if (m) xadvance.set(Number(m[1]), Number(m[2]));
    }
    expect(xadvance.size).toBe(font.glyphs.size);
    for (const [code, adv] of xadvance) {
      const gid = ttf.gidOf(code);
      expect(gid, `no glyph for U+${code.toString(16)}`).toBeGreaterThan(0);
      expect(ttf.advance(gid) / UNITS_PER_PIXEL, `advance of U+${code.toString(16)}`).toBe(adv);
      expect(web.advances[String.fromCodePoint(code)]).toBe(adv);
    }
  });

  it('draws every pixel as an exact square, and the squares are the drawing', () => {
    const font = loadFont(SHEET).font;
    const web = webFont(font);
    const ttf = readTtf(web.ttf);
    const { cellW, cellH, baseline } = font.metrics;
    let checked = 0;
    for (const g of font.glyphs.values()) {
      const gid = ttf.gidOf(g.code);
      const out = ttf.glyph(gid);
      if (g.empty) { expect(out, `"${g.char}" has ink and should not`).toBeNull(); continue; }
      expect(out, `"${g.char}" has no outline`).not.toBeNull();
      for (const contour of out!.contours) {
        // Four corners, axis-aligned, on whole drawing pixels: a square, not a curve.
        expect(contour.length).toBe(4);
        for (const p of contour) {
          expect(Math.abs(p.x % UNITS_PER_PIXEL), `"${g.char}" x off the grid`).toBe(0);
          expect(Math.abs(p.y % UNITS_PER_PIXEL), `"${g.char}" y off the grid`).toBe(0);
        }
        expect(new Set(contour.map(p => p.x)).size).toBe(2);
        expect(new Set(contour.map(p => p.y)).size).toBe(2);
      }
      const drawn = rasterize(out!, cellW, cellH, baseline);
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const ink = font.sheet[g.row * cellH + y]?.[g.col * cellW + x] ? 1 : 0;
          expect(drawn[y][x], `"${g.char}" at ${x},${y}`).toBe(ink);
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    expect(web.contours).toBeGreaterThan(0);
  });

  it('gives a character the font does not have a visible box instead of nothing', () => {
    const web = webFont(tiny());
    const ttf = readTtf(web.ttf);
    expect(ttf.gidOf('Z'.codePointAt(0)!)).toBe(0);
    const notdef = ttf.glyph(0);
    expect(notdef!.contours.length).toBe(4);   // four bars: a hollow box, no hole to orient
    expect(ttf.advance(0)).toBeGreaterThan(0);
  });

  it('names the family the way the CSS asks for it', () => {
    const web = webFont(tiny());
    const ttf = readTtf(web.ttf);
    expect(web.family).toBe('Mini 4');
    expect(ttf.names.get(1)).toBe('Mini 4');
    expect(ttf.names.get(2)).toBe('Regular');
    expect(ttf.names.get(6)).toBe('Mini4-Regular');
    expect(webFont(tiny(), { family: 'Otra' }).family).toBe('Otra');
    expect(fontFaceCss(web, 'mini.ttf')).toContain("font-family: 'Mini 4';");
    expect(fontFaceCss(web, 'mini.ttf')).toContain("src: url('mini.ttf') format('truetype')");
  });

  it('carries the kerning pairs of the sheet, and no kern table when there are none', () => {
    const web = webFont(tiny());
    expect(web.kernings).toBe(1);
    const ttf = readTtf(web.ttf);
    const kern = ttf.tables.get('kern')!;
    expect(ttf.dv.getUint16(kern.offset + 10)).toBe(1); // one pair
    expect(ttf.dv.getUint16(kern.offset + 18)).toBe(ttf.gidOf('I'.codePointAt(0)!));
    expect(ttf.dv.getUint16(kern.offset + 20)).toBe(ttf.gidOf('l'.codePointAt(0)!));
    expect(ttf.dv.getInt16(kern.offset + 22)).toBe(-UNITS_PER_PIXEL);
    const noKern = webFont(buildFont(
      fromAscii(TINY.replace('kern: Il=-1\n', ''), { sourcePath: 'm.txt' }).asset,
      fromAscii(TINY.replace('kern: Il=-1\n', ''), { sourcePath: 'm.txt' }).layout, 'm.txt',
    ));
    expect(noKern.kernings).toBe(0);
    expect(readTtf(noKern.ttf).tables.has('kern')).toBe(false);
  });

  it('says so instead of writing a font a browser would refuse', () => {
    expect(() => webFont(tiny(), { em: 0 })).toThrow(/whole number/);
    expect(() => webFont(tiny(), { em: 300 })).toThrow(/16384/);
  });
});

describe('font_web', () => {
  it('writes the font and the @font-face that loads it', async () => {
    const ttf = join(dir, 'nube.ttf');
    const css = join(dir, 'css', 'nube.css');
    const res = await runCommand('font_web', { path: SHEET, out: ttf, css });
    const data = res.data as Record<string, unknown>;
    expect(data.glyphs).toBe(111);
    expect(data.em).toBe(8);
    expect(data.sizes).toEqual([8, 16, 24]);
    expect(data.ttf_path).toBe(ttf);
    expect(readFileSync(ttf).length).toBe(data.bytes);
    // The stylesheet names the font file where it really is from there.
    expect(readFileSync(css, 'utf8')).toContain("url('../nube.ttf')");
    expect(res.text).toContain('cuerpos 8, 16, 24 px');
    expect(res.data).not.toHaveProperty('ttf');   // the bytes are a file, not an answer
  });

  it('adds .ttf when the name has no extension, and takes the retouch layer', async () => {
    const res = await runCommand('font_web', { path: SHEET, out: join(dir, 'nube') });
    const data = res.data as Record<string, { painted?: number } | null>;
    expect(readFileSync(join(dir, 'nube.ttf')).length).toBeGreaterThan(0);
    expect((data.retouch as { painted: number }).painted).toBe(1);
  });

  it('the font committed beside the example is the one this code writes', async () => {
    const out = join(dir, 'nube.ttf');
    await runCommand('font_web', { path: SHEET, out, css: join(dir, 'nube.css') });
    expect(readFileSync(out).equals(readFileSync(join(EXAMPLES, 'nube.ttf')))).toBe(true);
    expect(readFileSync(join(dir, 'nube.css'), 'utf8')).toBe(readFileSync(join(EXAMPLES, 'nube.css'), 'utf8'));
  });
});
