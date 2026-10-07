// Typography: a pixel font as a text drawing.
//
// A font is one glyph sheet — a single-frame text drawing (`from_ascii`) whose
// canvas is a grid of fixed cells, one glyph per cell — plus four header keys
// that `ascii.ts` carries and this file understands:
//
//   font: cell=8x10 baseline=8 line=11 space=3 track=1
//   glyphs: ABCDEFGHIJKLMNOP      one line per row of cells, one character per
//   glyphs: QRSTUVWXYZ            cell, left to right; a space skips the cell
//   advance: i=2 l=3              per-glyph advance, when the ink is not the
//   kern: AV=-1 To=-1             measure; kerning pairs, optional and small
//
// Why a sheet and not a drawing per glyph: the pixels have to live in a plain
// text drawing so the editor can open them and the retouch machinery works
// (`generated_by:` + `<drawing>.retoque.txt`), and a sheet puts the whole
// alphabet on one canvas, which is how you actually judge and fix a font — a
// hundred one-frame files would not.
//
// **The drawing is the metric.** The advance of a glyph is the rightmost
// painted column of its cell plus one, plus `track`: draw a letter wider and it
// takes more room, no table to keep in sync. The left side is whatever the cell
// has, so a bearing is drawn, not declared. `advance:` overrides the few glyphs
// where the ink is not the measure (a space, a glyph that leans out).
//
// The font is designed at **one** size and scaled by whole numbers. There is no
// hinting, no antialiasing and no per-size variant: that is vector thinking and
// it is what makes a pixel font look wrong in a game.
//
// No Node imports here (`fontfile.ts` does the disk work).

import type { Frame, SpriteAsset } from '../lib/types';
import type { AsciiLayout, FontKey } from './ascii';
import { composite, dims } from './assetModel';
import { blankImage, setPixel, type Rgba } from './png';
import { hexToRgba, type RgbaTuple } from './render';

/** The numbers of a font, all in font pixels. */
export interface FontMetrics {
  /** Cell of the sheet grid: every glyph gets exactly this box. */
  cellW: number;
  cellH: number;
  /** Rows of the cell above the baseline (the ascent). */
  baseline: number;
  /** Distance from one baseline to the next. */
  line: number;
  /** Advance of a space. */
  space: number;
  /** Pixels added between two glyphs (letterspacing). */
  track: number;
  /** Cells per row and rows of cells on the sheet. */
  cols: number;
  rows: number;
}

/** One glyph: where it is on the sheet, how much ink it has and how wide it is. */
export interface FontGlyph {
  char: string;
  code: number;
  /** Cell on the sheet. */
  col: number;
  row: number;
  /** Ink box inside the cell; `empty` when the cell has no ink at all. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  empty: boolean;
  /** How far the pen moves after drawing it. */
  advance: number;
  /** True when `advance:` set it instead of the ink. */
  declared: boolean;
}

export interface PixelFont {
  id: string;
  name: string;
  metrics: FontMetrics;
  glyphs: Map<string, FontGlyph>;
  /** Pair ("AV") → pixels to add to the advance, always negative in practice. */
  kern: Map<string, number>;
  /** The composited sheet (base layer + retouch layer, if there was one). */
  sheet: Frame;
  palette: Record<number, string>;
  /** Cells no `glyphs:` row claimed, as "row,col". */
  freeCells: Set<string>;
}

function fail(where: string, msg: string): never {
  throw new Error(`${where}: ${msg}`);
}

function keyValues(where: string, key: FontKey, value: string): [string, string][] {
  const out: [string, string][] = [];
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const eq = word.indexOf('=');
    if (eq < 1) fail(where, `${key}: expected key=value, got "${word}"`);
    out.push([word.slice(0, eq), word.slice(eq + 1)]);
  }
  return out;
}

function num(where: string, key: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) fail(where, `font: ${key} must be a whole number of pixels, got "${value}"`);
  return n;
}

/**
 * The four font headers of a drawing, read into numbers, rows and tables. The
 * sheet size is not known here: `buildFont` checks the grid against it.
 */
export function parseFontHeaders(lines: [FontKey, string][], where: string) {
  let cell: [number, number] | undefined;
  const got: Record<string, number> = {};
  const rows: string[] = [];
  const advances = new Map<string, number>();
  const kern = new Map<string, number>();
  let hadFont = false;

  for (const [key, value] of lines) {
    if (key === 'glyphs') { rows.push(value.replace(/\s+$/, '')); continue; }
    if (key === 'font') {
      if (hadFont) fail(where, 'font: given twice');
      hadFont = true;
      for (const [k, v] of keyValues(where, key, value)) {
        if (k === 'cell') {
          const m = /^(\d+)x(\d+)$/.exec(v);
          if (!m) fail(where, `font: cell must be "WxH", got "${v}"`);
          cell = [Number(m[1]), Number(m[2])];
        } else if (['baseline', 'line', 'space', 'track'].includes(k)) {
          got[k] = num(where, k, v);
        } else {
          fail(where, `font: unknown option "${k}" (cell, baseline, line, space, track)`);
        }
      }
      continue;
    }
    for (const [k, v] of keyValues(where, key, value)) {
      const n = Number(v);
      if (!Number.isInteger(n)) fail(where, `${key}: "${k}" must be a whole number of pixels, got "${v}"`);
      if (key === 'advance') {
        const ch = k === 'space' ? ' ' : k;
        if ([...ch].length !== 1) fail(where, `advance: "${k}" is not one character (use "space" for the space)`);
        if (n < 0) fail(where, `advance: "${k}" cannot be negative`);
        advances.set(ch, n);
      } else {
        if ([...k].length !== 2) fail(where, `kern: "${k}" is not a pair of characters`);
        kern.set(k, n);
      }
    }
  }

  if (!cell) fail(where, 'font: cell=WxH is required (the sheet is a grid of glyph cells)');
  if (rows.length === 0) fail(where, 'a font needs at least one "glyphs:" row naming the characters of each row of cells');
  const baseline = got.baseline ?? cell[1];
  if (baseline < 1 || baseline > cell[1]) fail(where, `font: baseline ${baseline} is outside the cell (1..${cell[1]})`);
  const track = got.track ?? 1;
  if (track < 0) fail(where, 'font: track cannot be negative');
  return {
    cell,
    baseline,
    line: got.line ?? cell[1],
    space: got.space ?? Math.max(2, Math.round(cell[0] / 2)),
    track,
    rows,
    advances,
    kern,
  };
}

/** The ink box of a cell, or `undefined` when it is empty. */
function inkBox(sheet: Frame, x0: number, y0: number, w: number, h: number) {
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!sheet[y0 + y]?.[x0 + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? undefined : { left, top, right, bottom };
}

/**
 * The font a glyph-sheet drawing describes. `asset` is the drawing as opened
 * (every layer: a retouch layer counts as ink), `layout` the headers
 * `fromAscii` returned.
 */
export function buildFont(asset: SpriteAsset, layout: AsciiLayout, where = asset.id): PixelFont {
  if (!layout.font?.length) {
    fail(where, 'this drawing is not a font: it needs a "font: cell=WxH …" header and "glyphs:" rows');
  }
  const h = parseFontHeaders(layout.font, where);
  const { width, height } = dims(asset);
  const [cellW, cellH] = h.cell;
  if (width % cellW !== 0 || height % cellH !== 0) {
    fail(where, `the sheet is ${width}x${height}, which is not a whole number of ${cellW}x${cellH} cells`);
  }
  const cols = width / cellW;
  const rows = height / cellH;
  if (h.rows.length > rows) {
    fail(where, `there are ${h.rows.length} "glyphs:" rows but the sheet only holds ${rows} rows of cells`);
  }

  const sheet = composite(asset, 0);
  const glyphs = new Map<string, FontGlyph>();
  const freeCells = new Set<string>();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) freeCells.add(`${r},${c}`);

  h.rows.forEach((text, r) => {
    const chars = [...text];
    if (chars.length > cols) {
      fail(where, `glyphs row ${r + 1} names ${chars.length} characters but a row holds ${cols} cells`);
    }
    chars.forEach((char, c) => {
      if (char === ' ') return;
      if (glyphs.has(char)) fail(where, `"${char}" is in the sheet twice (row ${r + 1}, cell ${c + 1})`);
      freeCells.delete(`${r},${c}`);
      const box = inkBox(sheet, c * cellW, r * cellH, cellW, cellH);
      const declared = h.advances.has(char);
      const advance = declared ? h.advances.get(char)! : box ? box.right + 1 + h.track : h.space;
      glyphs.set(char, {
        char,
        code: char.codePointAt(0)!,
        col: c,
        row: r,
        left: box?.left ?? 0,
        top: box?.top ?? 0,
        right: box?.right ?? -1,
        bottom: box?.bottom ?? -1,
        empty: !box,
        advance,
        declared,
      });
    });
  });

  // The space is always there, with no ink, even when no row names it.
  if (!glyphs.has(' ')) {
    glyphs.set(' ', {
      char: ' ', code: 32, col: -1, row: -1, left: 0, top: 0, right: -1, bottom: -1,
      empty: true, advance: h.advances.get(' ') ?? h.space, declared: h.advances.has(' '),
    });
  }

  for (const char of h.advances.keys()) {
    if (!glyphs.has(char)) fail(where, `advance: "${char}" is not a glyph of this font`);
  }
  for (const pair of h.kern.keys()) {
    for (const char of [...pair]) if (!glyphs.has(char)) fail(where, `kern: "${pair}" uses "${char}", which is not a glyph of this font`);
  }

  return {
    id: asset.id,
    name: asset.name ?? asset.id,
    metrics: { cellW, cellH, baseline: h.baseline, line: h.line, space: h.space, track: h.track, cols, rows },
    glyphs,
    kern: h.kern,
    sheet,
    palette: asset.palette,
    freeCells,
  };
}

// ── Setting text ────────────────────────────────────────────────────────

export interface PlacedGlyph {
  glyph: FontGlyph;
  /** Pen position: x of the cell's column 0, y of the cell's row 0. */
  x: number;
  y: number;
  /** Kerning applied before this glyph. */
  kern: number;
}

export interface TextLayout {
  lines: PlacedGlyph[][];
  /** Advance width of the widest line, and the whole block's height. */
  width: number;
  height: number;
  /** Characters of the text this font has no glyph for, in order, without repeats. */
  missing: string[];
}

/** Where every glyph of `text` lands, in font pixels. Newlines start a line. */
export function layoutText(font: PixelFont, text: string): TextLayout {
  const { line, cellH } = font.metrics;
  const lines: PlacedGlyph[][] = [];
  const missing: string[] = [];
  let width = 0;
  text.split('\n').forEach((raw, li) => {
    const placed: PlacedGlyph[] = [];
    let pen = 0;
    let prev = '';
    for (const char of [...raw]) {
      const glyph = font.glyphs.get(char);
      if (!glyph) {
        if (!missing.includes(char)) missing.push(char);
        prev = '';
        continue;
      }
      const kern = prev ? font.kern.get(prev + char) ?? 0 : 0;
      pen += kern;
      placed.push({ glyph, x: pen, y: li * line, kern });
      pen += glyph.advance;
      prev = char;
    }
    // The pen stops after the last glyph's advance; the trailing track is not width.
    const last = placed[placed.length - 1];
    const end = last ? last.x + (last.glyph.empty ? last.glyph.advance : last.glyph.right + 1) : 0;
    width = Math.max(width, end);
    lines.push(placed);
  });
  const count = lines.length;
  return { lines, width, height: (count - 1) * line + cellH, missing };
}

export interface RenderTextOptions {
  /** Whole-number scale; the font has one design size and this is the only knob. */
  scale?: number;
  /** Background hex, or none for transparency. */
  background?: string;
  /** Ink hex: every painted pixel becomes this color (default: the sheet's own colors). */
  color?: string;
  /** Pixels of margin around the text, in font pixels. */
  margin?: number;
  /** Paint the baseline and the line box, to see where the text sits. */
  guides?: boolean;
}

/** `text` drawn with the font, at a whole-number scale. */
export function renderText(font: PixelFont, text: string, opts: RenderTextOptions = {}): Rgba {
  const scale = Math.max(1, Math.round(opts.scale ?? 1));
  if (!Number.isInteger(opts.scale ?? 1)) {
    throw new Error(`scale must be a whole number (a pixel font is scaled by 1, 2, 3…, not by ${opts.scale})`);
  }
  const margin = opts.margin ?? 2;
  const laid = layoutText(font, text);
  const { cellW, cellH, baseline, line } = font.metrics;
  const w = (laid.width + margin * 2) * scale;
  const h = (laid.height + margin * 2) * scale;
  const img = blankImage(w, h, opts.background ? hexToRgba(opts.background) : [0, 0, 0, 0]);
  const ink = opts.color ? hexToRgba(opts.color) : undefined;
  const cache = new Map<number, RgbaTuple>();

  const put = (px: number, py: number, rgba: RgbaTuple) => {
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) setPixel(img, px * scale + dx, py * scale + dy, rgba);
  };

  if (opts.guides) {
    const guide = hexToRgba('#ff00aa80');
    for (let li = 0; li < laid.lines.length; li++) {
      const base = li * line + baseline - 1 + margin;
      for (let x = 0; x < laid.width + margin * 2; x++) put(x, base, guide);
    }
  }

  laid.lines.forEach((placed, li) => {
    for (const { glyph, x } of placed) {
      if (glyph.empty) continue;
      for (let y = 0; y < cellH; y++) {
        for (let cx = 0; cx < cellW; cx++) {
          const v = font.sheet[glyph.row * cellH + y]?.[glyph.col * cellW + cx] ?? 0;
          if (!v) continue;
          let rgba = ink;
          if (!rgba) {
            rgba = cache.get(v);
            if (!rgba) { rgba = hexToRgba(font.palette[v] ?? '#ff00ff'); cache.set(v, rgba); }
          }
          put(x + cx + margin, li * line + y + margin, rgba);
        }
      }
    }
  });
  return img;
}

export interface SampleOptions extends RenderTextOptions {
  /** One block per scale, stacked: the proof that the font only needs whole numbers. */
  scales?: number[];
}

/**
 * The same phrase at every scale asked for, one under the other on one image.
 * This is what a person looks at: 1x says what the font is, 2x and 3x say
 * whether it survives the screen the game actually runs at.
 */
export function renderSample(font: PixelFont, text: string, opts: SampleOptions = {}): Rgba {
  const scales = (opts.scales?.length ? opts.scales : [opts.scale ?? 1]).map(s => {
    if (!Number.isInteger(s) || s < 1) throw new Error(`scale must be a whole number of 1 or more, got ${s}`);
    return s;
  });
  const blocks = scales.map(scale => renderText(font, text, { ...opts, scale, margin: 0, background: undefined }));
  const pad = 4 * Math.max(...scales);
  const width = Math.max(...blocks.map(b => b.width)) + pad * 2;
  const height = blocks.reduce((n, b) => n + b.height, 0) + pad * (blocks.length + 1);
  const img = blankImage(width, height, opts.background ? hexToRgba(opts.background) : [0, 0, 0, 0]);
  let y = pad;
  for (const block of blocks) {
    for (let by = 0; by < block.height; by++) {
      for (let bx = 0; bx < block.width; bx++) {
        const i = (by * block.width + bx) * 4;
        if (block.data[i + 3] === 0) continue;
        setPixel(img, pad + bx, y + by, [block.data[i], block.data[i + 1], block.data[i + 2], block.data[i + 3]]);
      }
    }
    y += block.height + pad;
  }
  return img;
}

// ── Looking at it without eyes ──────────────────────────────────────────

export interface FontCheck {
  /** What is wrong, one line each, ready to print. */
  problems: string[];
  /** Worth knowing, not wrong. */
  notes: string[];
}

/**
 * A list of glyphs for a note, cut short. A note that names every glyph of the
 * font says nothing more than its own count — and a derived font (the shadow of
 * a sheet, where every letter overshoots the baseline by the offset) makes all
 * three of these notes name all of them.
 */
function glyphList(glyphs: FontGlyph[], limit = 16): string {
  const chars = glyphs.map(g => (g.char === ' ' ? '␠' : g.char));
  if (chars.length <= limit) return chars.join(' ');
  return `${chars.slice(0, limit).join(' ')} … (${chars.length} en total)`;
}

/** Everything a sheet can be wrong about on its own, with no phrase involved. */
export function checkSheet(font: PixelFont): FontCheck {
  const problems: string[] = [];
  const notes: string[] = [];
  const { cellW, cellH, baseline } = font.metrics;

  const inked = [...font.freeCells].filter(key => {
    const [r, c] = key.split(',').map(Number);
    return !!inkBox(font.sheet, c * cellW, r * cellH, cellW, cellH);
  });
  if (inked.length) {
    problems.push(`${inked.length} cell(s) have ink and no character in a "glyphs:" row: ${inked
      .map(k => { const [r, c] = k.split(',').map(Number); return `row ${r + 1} cell ${c + 1}`; }).join(', ')}`);
  }

  const empty = [...font.glyphs.values()].filter(g => g.empty && g.char !== ' ' && !g.declared);
  if (empty.length) {
    problems.push(`${empty.length} glyph(s) are named but their cell is empty: ${empty.map(g => g.char).join(' ')}`);
  }

  const full = [...font.glyphs.values()].filter(g => !g.empty && g.right === cellW - 1);
  if (full.length) {
    notes.push(`fill the cell to its last column, so only "track" separates them: ${glyphList(full)} (widen cell= if that is tight)`);
  }
  const below = [...font.glyphs.values()].filter(g => !g.empty && g.bottom >= baseline);
  if (below.length) notes.push(`descend below the baseline: ${glyphList(below)}`);
  const above = [...font.glyphs.values()].filter(g => !g.empty && g.top === 0);
  if (above.length) notes.push(`touch the top of the cell, so a line above would meet them: ${glyphList(above)}`);
  return { problems, notes };
}

export interface PhraseCheck extends FontCheck {
  text: string;
  width: number;
  height: number;
  /** Rows of the rendered block that have ink, as [first, last], or null when there is none. */
  inkRows: [number, number] | null;
  missing: string[];
  /** Pairs of neighbours with no empty column between them. */
  touching: string[];
}

/** Lays the phrase out and says what an eye would catch. */
export function checkPhrase(font: PixelFont, text: string): PhraseCheck {
  const laid = layoutText(font, text);
  const { cellW, cellH } = font.metrics;
  const problems: string[] = [];
  const notes: string[] = [];
  if (laid.missing.length) {
    problems.push(`the font has no glyph for ${laid.missing.length} character(s) of the phrase: ${laid.missing.map(c => `"${c}"`).join(' ')}`);
  }

  // Ink rows of the whole block, and neighbours that touch, measured on the
  // real layout: this is the only check that sees the font as text, not as cells.
  let first = Infinity, last = -1;
  const touching: string[] = [];
  laid.lines.forEach(placed => {
    const cells = placed.filter(p => !p.glyph.empty);
    for (const { glyph } of cells) {
      first = Math.min(first, glyph.top);
      last = Math.max(last, glyph.bottom);
    }
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1], b = cells[i];
      const gap = (b.x + b.glyph.left) - (a.x + a.glyph.right) - 1;
      if (gap > 0) continue;
      // Same column or overlapping: look row by row for ink that actually meets.
      let meet = false;
      for (let y = 0; y < cellH && !meet; y++) {
        const ra = font.sheet[a.glyph.row * cellH + y];
        const rb = font.sheet[b.glyph.row * cellH + y];
        if (!ra || !rb) continue;
        for (let xa = 0; xa < cellW && !meet; xa++) {
          if (!ra[a.glyph.col * cellW + xa]) continue;
          for (let xb = 0; xb < cellW; xb++) {
            if (!rb[b.glyph.col * cellW + xb]) continue;
            if (a.x + xa >= b.x + xb - 1) { meet = true; break; }
          }
        }
      }
      if (meet) {
        const pair = `${a.glyph.char}${b.glyph.char}`;
        if (!touching.includes(pair)) touching.push(pair);
      }
    }
  });
  if (touching.length) {
    problems.push(`${touching.length} pair(s) of letters touch with no pixel between them: ${touching.map(p => `"${p}"`).join(' ')}`);
  }
  const sheet = checkSheet(font);
  return {
    text,
    width: laid.width,
    height: laid.height,
    inkRows: last < 0 ? null : [first, last],
    missing: laid.missing,
    touching,
    problems: [...sheet.problems, ...problems],
    notes: [...sheet.notes, ...notes],
  };
}

/** The glyph table: one line per glyph, for a font nobody has looked at yet. */
export function glyphTable(font: PixelFont): string {
  const out = ['glifo  cod  celda  tinta        avance'];
  for (const g of font.glyphs.values()) {
    const cell = g.col < 0 ? '  —  ' : `${String(g.row + 1).padStart(2)},${String(g.col + 1).padStart(2)}`;
    const ink = g.empty ? 'vacía' : `x ${g.left}..${g.right}  y ${g.top}..${g.bottom}`;
    out.push(`${(g.char === ' ' ? '␠' : g.char).padEnd(6)} ${String(g.code).padStart(4)}  ${cell}  ${ink.padEnd(12)} ${String(g.advance).padStart(3)}${g.declared ? ' (declarado)' : ''}`);
  }
  return out.join('\n');
}

/** The whole report `font_contact` prints: the font, the phrase and what to look at. */
export function fontReport(font: PixelFont, check: PhraseCheck, scales: number[]): string {
  const m = font.metrics;
  const lines = [
    `${font.id} · celda ${m.cellW}x${m.cellH} · ${font.glyphs.size} glifos · base ${m.baseline} · línea ${m.line} · espacio ${m.space} · track ${m.track}`,
    `frase: «${check.text.split('\n').join(' ⏎ ')}» a ${scales.map(s => `${s}x`).join(', ')}`,
    `  ancho ${check.width} px · caja ${check.height} px · tinta en las filas ${check.inkRows ? `${check.inkRows[0]}..${check.inkRows[1]}` : '—'} de ${m.cellH}`,
    `  faltan: ${check.missing.length ? check.missing.map(c => `"${c}"`).join(' ') : 'ninguno'}`,
    `  se tocan: ${check.touching.length ? check.touching.map(c => `"${c}"`).join(' ') : 'ninguno'}`,
  ];
  for (const p of check.problems) lines.push(`✗ ${p}`);
  for (const n of check.notes) lines.push(`· ${n}`);
  if (!check.problems.length) lines.push('✓ sin problemas');
  return lines.join('\n');
}

// ── Out to an engine ────────────────────────────────────────────────────

/**
 * The font as an AngelCode BMFont (the text flavour) plus the sheet as its one
 * page. Godot 4 reads it both ways: `FontFile.load_bitmap_font()` at runtime
 * and the `font_data_bmfont` importer for a file dropped in a project. Set
 * `fixed_size_scale_mode = TextServer.FIXED_SIZE_SCALE_INTEGER_ONLY` (or
 * `scaling_mode=1` in the `.import`) so the engine only ever scales it by whole
 * numbers.
 */
export function bmfont(font: PixelFont, pageFile: string): string {
  const m = font.metrics;
  const out: string[] = [];
  out.push(`info face="${font.name.replace(/"/g, "'")}" size=${m.cellH} bold=0 italic=0 charset="" unicode=1 ` +
    `stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=0,0 outline=0`);
  out.push(`common lineHeight=${m.line} base=${m.baseline} scaleW=${m.cols * m.cellW} scaleH=${m.rows * m.cellH} pages=1 packed=0 ` +
    `alphaChnl=0 redChnl=0 greenChnl=0 blueChnl=0`);
  out.push(`page id=0 file="${pageFile}"`);
  const glyphs = [...font.glyphs.values()].sort((a, b) => a.code - b.code);
  out.push(`chars count=${glyphs.length}`);
  for (const g of glyphs) {
    const x = g.empty ? 0 : g.col * m.cellW + g.left;
    const y = g.empty ? 0 : g.row * m.cellH + g.top;
    const w = g.empty ? 0 : g.right - g.left + 1;
    const h = g.empty ? 0 : g.bottom - g.top + 1;
    out.push(`char id=${g.code} x=${x} y=${y} width=${w} height=${h} xoffset=${g.empty ? 0 : g.left} ` +
      `yoffset=${g.empty ? 0 : g.top} xadvance=${g.advance} page=0 chnl=15`);
  }
  const pairs = [...font.kern.entries()];
  out.push(`kernings count=${pairs.length}`);
  for (const [pair, amount] of pairs) {
    const [a, b] = [...pair];
    out.push(`kerning first=${a.codePointAt(0)} second=${b.codePointAt(0)} amount=${amount}`);
  }
  return out.join('\n') + '\n';
}

/** The sheet as a 1:1 RGBA image: the BMFont page. */
export function sheetImage(font: PixelFont, ink?: string): Rgba {
  const m = font.metrics;
  const img = blankImage(m.cols * m.cellW, m.rows * m.cellH);
  const cache = new Map<number, RgbaTuple>();
  const forced = ink ? hexToRgba(ink) : undefined;
  for (let y = 0; y < m.rows * m.cellH; y++) {
    for (let x = 0; x < m.cols * m.cellW; x++) {
      const v = font.sheet[y]?.[x] ?? 0;
      if (!v) continue;
      let rgba = forced;
      if (!rgba) {
        rgba = cache.get(v);
        if (!rgba) { rgba = hexToRgba(font.palette[v] ?? '#ff00ff'); cache.set(v, rgba); }
      }
      setPixel(img, x, y, rgba);
    }
  }
  return img;
}
