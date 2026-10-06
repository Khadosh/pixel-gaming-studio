// Typography for the web: the same glyph sheet, out as a font a browser loads.
//
// `font.ts` writes BMFont, which is what Godot reads and what no browser does.
// A page needs a real font file behind `@font-face`, so this builds a
// **TrueType** (`.ttf`) out of the very same `PixelFont`: same glyphs, same
// metrics and — the part that would be a bug if it drifted — the same advances,
// taken from `FontGlyph.advance` and never recomputed here.
//
// **A pixel is a square.** Every painted pixel of the drawing becomes an exact
// square in the outline (merged into one rectangle per horizontal run, which
// the non-zero winding rule unions for free), aligned to the grid. One drawing
// pixel is `UNITS_PER_PIXEL` font units and the em square is `em` drawing
// pixels wide, so at body `em`, `2·em`, `3·em`… every edge of every contour
// lands on a whole device pixel and the coverage of a pixel is 0 or 1. That is
// where the crispness comes from: not from a CSS property, from the geometry.
// `-webkit-font-smoothing: none` in the sample CSS is a belt, not the braces.
//
// Why TrueType and not WOFF2: a `.ttf` behind `@font-face` works in every
// browser that matters, it needs no compressor (so this file stays pure and the
// project takes no new dependency), and it is the one of the three whose bytes
// we can both write and read back to check — see `fontweb.test.ts`, which
// parses the file it just wrote and compares it glyph by glyph against the
// drawing and against the BMFont.
//
// No Node imports here (`fontfile.ts` does the disk work).

import type { FontGlyph, PixelFont } from './font';

/** Font units per drawing pixel. A power of two: the scaling math stays exact. */
export const UNITS_PER_PIXEL = 64;

/** 2026-01-01, fixed on purpose: the same sheet has to export the same bytes. */
const EPOCH_2026 = 3850070400;

export interface WebFontOptions {
  /**
   * Drawing pixels in the em square — the design body. At `font-size: <em>px`
   * one drawing pixel is one CSS pixel. Default: the cell width (8 for Nube 8,
   * which is where the 8 in the name comes from).
   */
  em?: number;
  /** CSS family name. Default: the name of the sheet. */
  family?: string;
}

export interface WebFont {
  /** The font file. */
  ttf: Uint8Array;
  family: string;
  postScriptName: string;
  /** Drawing pixels in the em square. */
  em: number;
  unitsPerEm: number;
  /** The bodies at which a drawing pixel is a whole number of screen pixels. */
  sizes: number[];
  /** Glyphs of the font, `.notdef` apart. */
  glyphs: number;
  kernings: number;
  /** Rectangles in the outlines: what the squares of the drawing cost. */
  contours: number;
  /** Advance per character, in drawing pixels: the BMFont `xadvance`, verbatim. */
  advances: Record<string, number>;
  /** Line box: ascent, descent and gap, in drawing pixels. */
  ascent: number;
  descent: number;
  lineGap: number;
}

function fail(where: string, msg: string): never {
  throw new Error(`${where}: ${msg}`);
}

/** A big-endian byte stream, which is all a font file is. */
class Bytes {
  private b: number[] = [];
  u8(v: number) { this.b.push(v & 0xff); return this; }
  u16(v: number) { this.b.push((v >>> 8) & 0xff, v & 0xff); return this; }
  i16(v: number) { return this.u16(v < 0 ? v + 0x10000 : v); }
  u32(v: number) { this.b.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); return this; }
  tag(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; }
  raw(arr: ArrayLike<number>) { for (let i = 0; i < arr.length; i++) this.b.push(arr[i] & 0xff); return this; }
  /** A `name` string: UTF-16BE, which is the only encoding worth writing. */
  utf16(s: string) { for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i)); return this; }
  get length() { return this.b.length; }
  done(): Uint8Array { return Uint8Array.from(this.b); }
}

/** The sum of a table read as big-endian uint32s, zero-padded. */
export function tableChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = ((data[i] ?? 0) << 24) | ((data[i + 1] ?? 0) << 16) | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0);
    sum = (sum + v) >>> 0;
  }
  return sum >>> 0;
}

/** A square of the outline, in font units, y up from the baseline. */
interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * The ink of a glyph as rectangles: one per horizontal run of painted pixels.
 * They touch, and that is fine — the non-zero winding rule unions contours that
 * turn the same way, so the squares of neighbouring pixels melt into one shape
 * with no seam and no hole to orient.
 */
function glyphRects(font: PixelFont, g: FontGlyph): Rect[] {
  const { cellW, cellH, baseline } = font.metrics;
  if (g.empty || g.col < 0) return [];
  const u = UNITS_PER_PIXEL;
  const rects: Rect[] = [];
  for (let r = 0; r < cellH; r++) {
    const row = font.sheet[g.row * cellH + r];
    let run = -1;
    for (let c = 0; c <= cellW; c++) {
      const on = c < cellW && !!row?.[g.col * cellW + c];
      if (on && run < 0) run = c;
      if (!on && run >= 0) {
        rects.push({ x0: run * u, x1: c * u, y0: (baseline - r - 1) * u, y1: (baseline - r) * u });
        run = -1;
      }
    }
  }
  return rects;
}

/** A hollow box, so a character the font does not have shows up instead of vanishing. */
function notdefRects(font: PixelFont): Rect[] {
  const u = UNITS_PER_PIXEL;
  const { cellW, baseline } = font.metrics;
  const right = Math.max(3, cellW - 1);
  const top = Math.max(3, baseline);
  return [
    { x0: 1 * u, x1: right * u, y0: 0, y1: 1 * u },
    { x0: 1 * u, x1: right * u, y0: (top - 1) * u, y1: top * u },
    { x0: 1 * u, x1: 2 * u, y0: 1 * u, y1: (top - 1) * u },
    { x0: (right - 1) * u, x1: right * u, y0: 1 * u, y1: (top - 1) * u },
  ];
}

/**
 * One `glyf` entry: a simple glyph of straight-line contours. A glyph with no
 * ink gets no entry at all (zero length), which is how a space is written.
 */
function glyfEntry(rects: Rect[]): Uint8Array {
  if (!rects.length) return new Uint8Array(0);
  const xs: number[] = [];
  const ys: number[] = [];
  const ends: number[] = [];
  for (const r of rects) {
    // Clockwise with y up (the TrueType convention for an outer contour).
    xs.push(r.x0, r.x0, r.x1, r.x1);
    ys.push(r.y0, r.y1, r.y1, r.y0);
    ends.push(xs.length - 1);
  }
  const b = new Bytes();
  b.i16(rects.length);
  b.i16(Math.min(...xs)); b.i16(Math.min(...ys)); b.i16(Math.max(...xs)); b.i16(Math.max(...ys));
  for (const e of ends) b.u16(e);
  b.u16(0); // no instructions: there is nothing to hint in a square
  for (let i = 0; i < xs.length; i++) b.u8(0x01); // every point on the curve
  let prev = 0;
  for (const x of xs) { b.i16(x - prev); prev = x; }
  prev = 0;
  for (const y of ys) { b.i16(y - prev); prev = y; }
  const out = b.done();
  // Pad to 4: the offsets of `loca` stay tidy and a reader never straddles a word.
  const pad = (4 - (out.length % 4)) % 4;
  if (!pad) return out;
  const padded = new Uint8Array(out.length + pad);
  padded.set(out);
  return padded;
}

/** A `cmap` with one format 4 subtable, reached from both platforms browsers look at. */
function cmapTable(codes: number[], idOf: Map<number, number>, where: string): Uint8Array {
  for (const code of codes) {
    if (code > 0xffff) {
      fail(where, `U+${code.toString(16).toUpperCase()} is outside the Basic Multilingual Plane and a format 4 cmap cannot hold it`);
    }
  }
  // Segments: a run of consecutive codes whose glyph ids are consecutive too.
  const segs: { start: number; end: number; delta: number }[] = [];
  for (const code of codes) {
    const id = idOf.get(code)!;
    const last = segs[segs.length - 1];
    if (last && code === last.end + 1 && ((id - code + 0x10000) % 0x10000) === last.delta) {
      last.end = code;
      continue;
    }
    segs.push({ start: code, end: code, delta: (id - code + 0x10000) % 0x10000 });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });

  const segCount = segs.length;
  const sel = Math.floor(Math.log2(segCount));
  const sub = new Bytes();
  sub.u16(4);
  sub.u16(16 + segCount * 8); // length
  sub.u16(0); // language
  sub.u16(segCount * 2);
  sub.u16(2 * 2 ** sel);
  sub.u16(sel);
  sub.u16(segCount * 2 - 2 * 2 ** sel);
  for (const s of segs) sub.u16(s.end);
  sub.u16(0); // reservedPad
  for (const s of segs) sub.u16(s.start);
  for (const s of segs) sub.u16(s.delta);
  for (let i = 0; i < segCount; i++) sub.u16(0); // idRangeOffset: the delta is enough
  const subtable = sub.done();

  const b = new Bytes();
  b.u16(0);
  b.u16(2); // two encoding records, one subtable
  const offset = 4 + 2 * 8;
  b.u16(0); b.u16(3); b.u32(offset); // Unicode, BMP
  b.u16(3); b.u16(1); b.u32(offset); // Windows, BMP: the one every sanitiser wants
  b.raw(subtable);
  return b.done();
}

function nameTable(records: [number, string][]): Uint8Array {
  const strings = new Bytes();
  const offsets: [number, number, number][] = []; // id, offset, byte length
  for (const [id, value] of records) {
    const start = strings.length;
    strings.utf16(value);
    offsets.push([id, start, strings.length - start]);
  }
  const b = new Bytes();
  b.u16(0); // format
  b.u16(records.length);
  b.u16(6 + records.length * 12); // stringOffset
  for (const [id, offset, len] of offsets) {
    b.u16(3); b.u16(1); b.u16(0x409); // Windows, BMP, en-US
    b.u16(id); b.u16(len); b.u16(offset);
  }
  b.raw(strings.done());
  return b.done();
}

/** The legacy `kern`, format 0: the only kerning a font with no GPOS can carry. */
function kernTable(pairs: [number, number, number][]): Uint8Array {
  const sorted = [...pairs].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const sel = Math.floor(Math.log2(sorted.length));
  const b = new Bytes();
  b.u16(0); // version
  b.u16(1); // one subtable
  b.u16(0); // subtable version
  b.u16(14 + sorted.length * 6);
  b.u16(0x0001); // horizontal, kerning values
  b.u16(sorted.length);
  b.u16(6 * 2 ** sel);
  b.u16(sel);
  b.u16(sorted.length * 6 - 6 * 2 ** sel);
  for (const [a, c, amount] of sorted) { b.u16(a); b.u16(c); b.i16(amount); }
  return b.done();
}

function sanitizePostScript(name: string): string {
  const clean = [...name].filter(c => /[A-Za-z0-9]/.test(c)).join('');
  return `${clean || 'PixelFont'}-Regular`.slice(0, 63);
}

/** The file: a table directory, the tables, and the checksum of the whole thing. */
function assemble(tables: [string, Uint8Array][]): Uint8Array {
  const sorted = [...tables].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const n = sorted.length;
  const sel = Math.floor(Math.log2(n));
  const dir = new Bytes();
  dir.u32(0x00010000); // sfnt version: TrueType outlines
  dir.u16(n);
  dir.u16(16 * 2 ** sel);
  dir.u16(sel);
  dir.u16(n * 16 - 16 * 2 ** sel);

  let offset = 12 + n * 16;
  const placed: { tag: string; offset: number; data: Uint8Array }[] = [];
  for (const [tag, data] of sorted) {
    placed.push({ tag, offset, data });
    dir.tag(tag);
    dir.u32(tableChecksum(data));
    dir.u32(offset);
    dir.u32(data.length);
    offset += data.length + ((4 - (data.length % 4)) % 4);
  }
  const file = new Uint8Array(offset);
  file.set(dir.done(), 0);
  for (const p of placed) file.set(p.data, p.offset);

  // head.checkSumAdjustment is the one field that depends on the whole file.
  const head = placed.find(p => p.tag === 'head')!;
  const adjust = (0xb1b0afba - tableChecksum(file)) >>> 0;
  const at = head.offset + 8;
  file[at] = (adjust >>> 24) & 0xff;
  file[at + 1] = (adjust >>> 16) & 0xff;
  file[at + 2] = (adjust >>> 8) & 0xff;
  file[at + 3] = adjust & 0xff;
  return file;
}

/**
 * The glyph sheet as a TrueType font. Every glyph of the font, `.notdef` first
 * as a hollow box, then one per character in code order; the advances are the
 * ones `buildFont` measured off the drawing, scaled to font units and nothing
 * else.
 */
export function webFont(font: PixelFont, opts: WebFontOptions = {}, where = font.id): WebFont {
  const m = font.metrics;
  const u = UNITS_PER_PIXEL;
  const em = opts.em ?? m.cellW;
  if (!Number.isInteger(em) || em < 1) fail(where, `em must be a whole number of drawing pixels, got ${opts.em}`);
  const unitsPerEm = em * u;
  if (unitsPerEm > 16384) fail(where, `em=${em} needs ${unitsPerEm} units per em, more than the 16384 a TrueType head can hold`);
  const family = opts.family ?? font.name;
  const postScriptName = sanitizePostScript(family);

  const ordered = [...font.glyphs.values()].sort((a, b) => a.code - b.code);
  const entries: { advance: number; rects: Rect[] }[] = [{ advance: 0, rects: notdefRects(font) }];
  entries[0].advance = Math.round(Math.max(...entries[0].rects.map(r => r.x1)) / u) + m.track;
  const idOf = new Map<number, number>();
  const advances: Record<string, number> = {};
  for (const g of ordered) {
    idOf.set(g.code, entries.length);
    entries.push({ advance: g.advance, rects: glyphRects(font, g) });
    advances[g.char] = g.advance;
  }

  const glyf = new Bytes();
  const offsets: number[] = [];
  let contours = 0;
  const boxes: { xMin: number; yMin: number; xMax: number; yMax: number; lsb: number; width: number }[] = [];
  for (const e of entries) {
    offsets.push(glyf.length);
    const data = glyfEntry(e.rects);
    glyf.raw(data);
    contours += e.rects.length;
    if (e.rects.length) {
      const xMin = Math.min(...e.rects.map(r => r.x0));
      const xMax = Math.max(...e.rects.map(r => r.x1));
      boxes.push({
        xMin, xMax,
        yMin: Math.min(...e.rects.map(r => r.y0)),
        yMax: Math.max(...e.rects.map(r => r.y1)),
        lsb: xMin,
        width: xMax - xMin,
      });
    } else {
      boxes.push({ xMin: 0, yMin: 0, xMax: 0, yMax: 0, lsb: 0, width: 0 });
    }
  }
  offsets.push(glyf.length);
  const glyfData = glyf.done();

  const numGlyphs = entries.length;
  // **The content box is the line of the drawing.** A browser's inline box is
  // ascent + descent tall and the half-leading of `line-height: <line>px` is
  // what is left over, split in two. With the descent at the ink (2 rows for
  // Nube) the box would be 11 and the half-leading half a pixel: the whole
  // drawing would land on a fractional baseline, which is a blurred row of
  // pixels and nothing a CSS property can fix. Putting the line's spare row in
  // the descent instead leaves the half-leading at zero, so the baseline is a
  // whole pixel at every whole body. The browser control caught this.
  const ascent = m.baseline;
  const descent = Math.max(m.line - m.baseline, m.cellH - m.baseline);
  const lineGap = Math.max(0, m.line - ascent - descent);

  const loca = new Bytes();
  for (const o of offsets) loca.u32(o);

  const hmtx = new Bytes();
  entries.forEach((e, i) => { hmtx.u16(e.advance * u); hmtx.i16(boxes[i].lsb); });

  const inked = boxes.filter((_, i) => offsets[i + 1] > offsets[i]);
  const headB = new Bytes();
  headB.u32(0x00010000); // version
  headB.u32(0x00010000); // fontRevision 1.0
  headB.u32(0); // checkSumAdjustment, filled in by assemble()
  headB.u32(0x5f0f3cf5); // magic
  headB.u16(0x0003); // baseline at y=0, left sidebearing at x=0
  headB.u16(unitsPerEm);
  headB.u32(0); headB.u32(EPOCH_2026); // created
  headB.u32(0); headB.u32(EPOCH_2026); // modified
  headB.i16(inked.length ? Math.min(...inked.map(b => b.xMin)) : 0);
  headB.i16(inked.length ? Math.min(...inked.map(b => b.yMin)) : 0);
  headB.i16(inked.length ? Math.max(...inked.map(b => b.xMax)) : 0);
  headB.i16(inked.length ? Math.max(...inked.map(b => b.yMax)) : 0);
  headB.u16(0); // macStyle
  headB.u16(em); // lowestRecPPEM: below the design body it is not this font any more
  headB.i16(2); // fontDirectionHint
  headB.i16(1); // indexToLocFormat: long offsets
  headB.i16(0); // glyphDataFormat

  const hhea = new Bytes();
  hhea.u32(0x00010000);
  hhea.i16(ascent * u);
  hhea.i16(-descent * u);
  hhea.i16(lineGap * u);
  hhea.u16(Math.max(...entries.map(e => e.advance)) * u);
  hhea.i16(inked.length ? Math.min(...inked.map(b => b.lsb)) : 0);
  const rsb = entries
    .map((e, i) => (offsets[i + 1] > offsets[i] ? e.advance * u - boxes[i].xMax : null))
    .filter((v): v is number => v !== null);
  hhea.i16(rsb.length ? Math.min(...rsb) : 0);
  hhea.i16(inked.length ? Math.max(...inked.map(b => b.xMax)) : 0);
  hhea.i16(1); hhea.i16(0); hhea.i16(0); // caret: upright
  hhea.i16(0); hhea.i16(0); hhea.i16(0); hhea.i16(0); // reserved
  hhea.i16(0); // metricDataFormat
  hhea.u16(numGlyphs);

  const maxp = new Bytes();
  maxp.u32(0x00010000);
  maxp.u16(numGlyphs);
  maxp.u16(Math.max(0, ...entries.map(e => e.rects.length * 4)));
  maxp.u16(Math.max(0, ...entries.map(e => e.rects.length)));
  maxp.u16(0); maxp.u16(0); // no composites
  maxp.u16(2); // maxZones
  maxp.u16(0); maxp.u16(0); maxp.u16(0); maxp.u16(0); maxp.u16(0); maxp.u16(0); // no programs
  maxp.u16(0); maxp.u16(0); // no components

  const capGlyph = font.glyphs.get('H') ?? font.glyphs.get('A');
  const xGlyph = font.glyphs.get('x') ?? font.glyphs.get('o');
  const codes = [...idOf.keys()].sort((a, b) => a - b);
  const os2 = new Bytes();
  os2.u16(4); // version
  os2.i16(Math.round(entries.reduce((n, e) => n + e.advance * u, 0) / numGlyphs));
  os2.u16(400); os2.u16(5); os2.u16(0); // weight, width, fsType: installable
  os2.i16(unitsPerEm >> 1); os2.i16(unitsPerEm >> 1); os2.i16(0); os2.i16(unitsPerEm >> 3); // subscript
  os2.i16(unitsPerEm >> 1); os2.i16(unitsPerEm >> 1); os2.i16(0); os2.i16(unitsPerEm >> 1); // superscript
  os2.i16(u); os2.i16(Math.round(ascent * u / 3)); // strikeout: one pixel thick
  os2.i16(0); // sFamilyClass
  os2.raw([2, 0, 5, 9, 0, 0, 0, 0, 0, 0]); // panose: a monospaced-ish sans
  os2.u32(0x80000003); os2.u32(0); os2.u32(0); os2.u32(0); // Basic Latin, Latin-1, punctuation
  os2.tag('PGS ');
  os2.u16(0x0040); // fsSelection: REGULAR
  os2.u16(codes[0] ?? 0);
  os2.u16(codes[codes.length - 1] ?? 0);
  os2.i16(ascent * u); os2.i16(-descent * u); os2.i16(lineGap * u);
  os2.u16(ascent * u); os2.u16(descent * u);
  os2.u32(1); os2.u32(0); // Latin 1 code page
  os2.i16(xGlyph && !xGlyph.empty ? (m.baseline - xGlyph.top) * u : 0);
  os2.i16(capGlyph && !capGlyph.empty ? (m.baseline - capGlyph.top) * u : 0);
  os2.u16(0); os2.u16(32); os2.u16(1); // default char, break char, maxContext

  const post = new Bytes();
  post.u32(0x00030000); // version 3.0: no glyph names
  post.u32(0); // italicAngle
  post.i16(-descent * u); post.i16(u); // underline: one pixel, under the baseline
  post.u32(0); // isFixedPitch: proportional, the drawing is the metric
  post.u32(0); post.u32(0); post.u32(0); post.u32(0);

  const name = nameTable([
    [1, family],
    [2, 'Regular'],
    [3, `${family} 1.0; Pixel Gaming Studio`],
    [4, family],
    [5, 'Version 1.0'],
    [6, postScriptName],
  ]);

  const tables: [string, Uint8Array][] = [
    ['OS/2', os2.done()],
    ['cmap', cmapTable(codes, idOf, where)],
    ['glyf', glyfData],
    ['head', headB.done()],
    ['hhea', hhea.done()],
    ['hmtx', hmtx.done()],
    ['loca', loca.done()],
    ['maxp', maxp.done()],
    ['name', name],
    ['post', post.done()],
  ];
  const kerns: [number, number, number][] = [];
  for (const [pair, amount] of font.kern) {
    const [a, b] = [...pair];
    kerns.push([idOf.get(a.codePointAt(0)!)!, idOf.get(b.codePointAt(0)!)!, amount * u]);
  }
  if (kerns.length) tables.push(['kern', kernTable(kerns)]);

  return {
    ttf: assemble(tables),
    family,
    postScriptName,
    em,
    unitsPerEm,
    sizes: [em, em * 2, em * 3],
    glyphs: font.glyphs.size,
    kernings: font.kern.size,
    contours,
    advances,
    ascent,
    descent,
    lineGap,
  };
}

/**
 * The `@font-face` and the one rule that makes a pixel font behave: a whole
 * multiple of the design body, the line of the drawing, and no smoothing. The
 * crispness is in the outline; these properties only stop a browser from
 * deciding otherwise.
 */
export function fontFaceCss(web: WebFont, url: string): string {
  const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
  const fam = q(web.family);
  const slug = web.family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'pixel';
  const line = web.ascent + web.descent + web.lineGap;
  const out = [
    `/* ${web.family} — hecha con Pixel Gaming Studio (pgs font_web). El dibujo es la métrica. */`,
    '@font-face {',
    `  font-family: ${fam};`,
    `  src: url(${q(url)}) format('truetype');`,
    '  font-weight: 400;',
    '  font-style: normal;',
    '  font-display: block;',
    '}',
    '',
    `/* El cuerpo de diseño: a ${web.em}px un píxel del dibujo es un píxel de pantalla. */`,
    `.${slug} {`,
    `  font-family: ${fam}, monospace;`,
    `  font-size: ${web.em}px;`,
    `  line-height: ${line}px;`,
    '  -webkit-font-smoothing: none;',
    '  font-smooth: never;',
    '  text-rendering: geometricPrecision;',
    '  font-kerning: none;',
    '  font-variant-ligatures: none;',
    '}',
  ];
  for (const s of [2, 3]) {
    out.push(`.${slug}-${s}x { font-size: ${web.em * s}px; line-height: ${line * s}px; }`);
  }
  out.push('');
  out.push(`/* Sólo múltiplos de ${web.em}: a ${web.em + 1}px el píxel deja de ser un cuadrado entero. */`);
  return out.join('\n') + '\n';
}
