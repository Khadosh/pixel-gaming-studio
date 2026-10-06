// The disk side of typography: open a glyph sheet, write a BMFont for an
// engine, and compose one sheet out of another.
//
// `font.ts` is the pure half (parse, measure, set text, check, BMFont text);
// this one reads and writes files, applies the retouch layer of a generated
// sheet, and refuses to overwrite a drawing someone else owns.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import type { Frame, GeneratedBy, SpriteAsset } from '../lib/types';
import { blankFrame, colorIndex, createAsset, dims } from './asset';
import { fromAscii, toAscii, type AsciiLayout, type FontKey } from './ascii';
import { bmfont, buildFont, parseFontHeaders, sheetImage, type PixelFont } from './font';
import { fontFaceCss, webFont, type WebFont, type WebFontOptions } from './fontweb';
import { encodePng } from './png';
import { applyRetouch, checkOverwrite, type AppliedRetouch } from './retouch';

export interface LoadedFont {
  font: PixelFont;
  asset: SpriteAsset;
  layout: AsciiLayout;
  path: string;
  /** The retouch layer that was laid on top, when there was one. */
  retouch?: AppliedRetouch;
}

/**
 * The font a drawing describes, with its retouch layer on top: a sheet a
 * recipe wrote keeps the hand pass in `<drawing>.retoque.txt` and the font has
 * to be the two of them together, or the retouch would only show in the editor.
 */
export function loadFont(path: string, retouch = true): LoadedFont {
  const text = readFileSync(path, 'utf8');
  const parsed = fromAscii(text, { sourcePath: path });
  let asset = parsed.asset;
  let applied: AppliedRetouch | undefined;
  if (retouch) {
    const r = applyRetouch(asset, path);
    asset = r.asset;
    applied = r.retouch;
  }
  return { font: buildFont(asset, parsed.layout, basename(path)), asset, layout: parsed.layout, path, retouch: applied };
}

export interface WrittenFont {
  fnt: string;
  png: string;
  import?: string;
  glyphs: number;
  kernings: number;
}

/**
 * What Godot's BMFont importer writes beside a `.fnt`, with the one option that
 * matters for a pixel font: `scaling_mode=1` is "integer only", so the engine
 * draws the font at 1x, 2x, 3x and never at 1.45x. Godot keeps `[params]` when
 * it reimports, and fills in the uid and the path on its own.
 */
const GODOT_IMPORT = `[remap]

importer="font_data_bmfont"
type="FontFile"

[deps]

source_file="res://FNT"

[params]

fallbacks=[]
compress=true
scaling_mode=1
`;

/** The font as a BMFont `.fnt` next to its page PNG, both ready for an engine. */
export function writeBmFont(font: PixelFont, out: string, ink?: string, godotImport = false): WrittenFont {
  const fnt = out.toLowerCase().endsWith('.fnt') ? out : `${out}.fnt`;
  const png = fnt.replace(/\.fnt$/i, '.png');
  mkdirSync(dirname(resolve(fnt)), { recursive: true });
  // The page is named relative to the .fnt: both files travel together.
  writeFileSync(fnt, bmfont(font, basename(png)));
  writeFileSync(png, encodePng(sheetImage(font, ink)));
  let imported: string | undefined;
  if (godotImport) {
    imported = `${fnt}.import`;
    writeFileSync(imported, GODOT_IMPORT.replace('FNT', basename(fnt)));
  }
  return { fnt: resolve(fnt), png: resolve(png), import: imported ? resolve(imported) : undefined, glyphs: font.glyphs.size, kernings: font.kern.size };
}

export interface WrittenWebFont extends WebFont {
  ttf_path: string;
  css_path?: string;
  /** The `@font-face` snippet, whether or not it was written to a file. */
  css: string;
  bytes: number;
}

/**
 * The font as a `.ttf` a browser loads with `@font-face`, and the CSS that uses
 * it. The stylesheet names the font file as a sibling, because that is how the
 * two travel: copy both into a site and the page has the font.
 */
export function writeWebFont(font: PixelFont, out: string, opts: WebFontOptions & { css?: string } = {}): WrittenWebFont {
  const ttfPath = /\.(ttf|otf)$/i.test(out) ? out : `${out}.ttf`;
  const web = webFont(font, opts, basename(ttfPath));
  const cssPath = opts.css;
  const url = cssPath ? relative(dirname(resolve(cssPath)), resolve(ttfPath)) || basename(ttfPath) : basename(ttfPath);
  const css = fontFaceCss(web, url.split(sep).join('/'));
  mkdirSync(dirname(resolve(ttfPath)), { recursive: true });
  writeFileSync(ttfPath, web.ttf);
  if (cssPath) {
    mkdirSync(dirname(resolve(cssPath)), { recursive: true });
    writeFileSync(cssPath, css);
  }
  return {
    ...web,
    ttf_path: resolve(ttfPath),
    css_path: cssPath ? resolve(cssPath) : undefined,
    css,
    bytes: web.ttf.length,
  };
}

// ── Composing a sheet out of another ────────────────────────────────────

export interface ComposeGlyph {
  /** The character this cell will hold. */
  char: string;
  /** Copy this glyph of the base sheet. */
  over?: string;
  /** Then stamp the ink of this glyph of the base sheet on top. */
  mark?: string;
  /** Cell row the mark's ink starts at (its top). */
  row?: number;
  /** Nudge the mark sideways, after aligning it. */
  dx?: number;
  /** How the mark sits over the base: centred on its ink (default) or at its left edge. */
  align?: 'center' | 'left';
  /** Instead of `over`: this glyph turned 180° in place (its ink box stays put). */
  turn?: string;
  /** Instead of `over`: this glyph mirrored left to right in place. */
  flip?: string;
  /** Cell rows [from, to] to wipe before stamping the mark (the dot of an "i"). */
  clear?: [number, number];
  /** Rows to move the whole result down (negative: up). */
  dy?: number;
  /** Advance, when the ink is not the measure. */
  advance?: number;
}

export interface ComposeSpec {
  /** The hand-drawn sheet this one is built from, relative to the spec. */
  base: string;
  id?: string;
  name?: string;
  description?: string;
  glyphs: ComposeGlyph[];
}

export function parseComposeSpec(value: unknown, where: string): ComposeSpec {
  const o = value as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error(`${where}: the spec must be an object`);
  if (typeof o.base !== 'string') throw new Error(`${where}: "base" must name the hand-drawn sheet this one is built from`);
  if (!Array.isArray(o.glyphs) || o.glyphs.length === 0) throw new Error(`${where}: "glyphs" must list at least one glyph to compose`);
  for (const g of o.glyphs as ComposeGlyph[]) {
    if (typeof g.char !== 'string' || [...g.char].length !== 1) throw new Error(`${where}: every glyph needs a one-character "char"`);
    const sources = [g.over, g.turn, g.flip].filter(v => v !== undefined);
    if (sources.length !== 1) throw new Error(`${where}: "${g.char}" needs exactly one of over, turn or flip`);
    if (g.mark !== undefined && g.row === undefined) throw new Error(`${where}: "${g.char}" has a mark but no row to put it on`);
    if (g.clear !== undefined && (!Array.isArray(g.clear) || g.clear.length !== 2)) {
      throw new Error(`${where}: the "clear" of "${g.char}" must be [from, to] cell rows`);
    }
  }
  return o as unknown as ComposeSpec;
}

/** The ink of one cell as a frame of its own, cropped to nothing but the cell. */
function cellOf(font: PixelFont, char: string, where: string): Frame {
  const g = font.glyphs.get(char);
  if (!g) throw new Error(`${where}: the base sheet has no glyph "${char}"`);
  const { cellW, cellH } = font.metrics;
  const out = blankFrame(cellW, cellH);
  if (g.col < 0) return out;
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) out[y][x] = font.sheet[g.row * cellH + y]?.[g.col * cellW + x] ?? 0;
  }
  return out;
}

function inkBounds(cell: Frame) {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  cell.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }));
  return right < 0 ? null : { left, top, right, bottom };
}

function shiftCell(cell: Frame, dy: number): Frame {
  if (!dy) return cell;
  const out = blankFrame(cell[0].length, cell.length);
  cell.forEach((row, y) => { const ty = y + dy; if (ty >= 0 && ty < out.length) out[ty] = [...row]; });
  return out;
}

export interface ComposeResult {
  text: string;
  glyphs: number;
  /** Cells the new rows added. */
  rows: number;
  generatedBy: GeneratedBy;
}

/**
 * A new glyph sheet: every row of the base, then the composed glyphs in rows of
 * their own. Accents and the inverted punctuation of Spanish are derived from
 * the letters that are already drawn, which is the only way they stay
 * consistent — and when one of them needs the hand anyway, the retouch lands
 * beside this file and survives running the recipe again.
 */
export function composeSheet(base: LoadedFont, spec: ComposeSpec, generatedBy: GeneratedBy, where: string): ComposeResult {
  const font = base.font;
  const { cellW, cellH, cols } = font.metrics;
  const headers = parseFontHeaders(base.layout.font!, where);
  const newRows: string[] = [];
  for (let i = 0; i < spec.glyphs.length; i += cols) {
    newRows.push(spec.glyphs.slice(i, i + cols).map(g => g.char).join(''));
  }

  const width = cols * cellW;
  const height = (font.metrics.rows + newRows.length) * cellH;
  const palette = Object.keys(font.palette).map(Number).sort((a, b) => a - b).map(i => font.palette[i]);
  const out = createAsset({
    id: spec.id ?? font.id,
    name: spec.name ?? font.name,
    width, height,
    category: 'ui',
    palette,
    frames: 1,
    description: spec.description ?? '',
  });
  out.colorNames = { ...base.asset.colorNames };
  const grid = out.layers![0].frames[0];
  for (let y = 0; y < font.metrics.rows * cellH; y++) {
    for (let x = 0; x < width; x++) grid[y][x] = font.sheet[y]?.[x] ?? 0;
  }

  const advances = new Map<string, number>(headers.advances);
  spec.glyphs.forEach((g, i) => {
    const row = font.metrics.rows + Math.floor(i / cols);
    const col = i % cols;
    let cell = cellOf(font, (g.over ?? g.turn ?? g.flip)!, where);
    if (g.turn !== undefined || g.flip !== undefined) {
      // In place: the ink box keeps its corner, so a turned "?" does not walk
      // to the far side of the cell and earn a four-pixel bearing.
      const b = inkBounds(cell);
      if (!b) throw new Error(`${where}: "${g.turn ?? g.flip}" has no ink to turn`);
      const out2 = blankFrame(cellW, cellH);
      for (let y = b.top; y <= b.bottom; y++) {
        for (let x = b.left; x <= b.right; x++) {
          const ty = g.turn !== undefined ? b.top + b.bottom - y : y;
          out2[ty][b.left + b.right - x] = cell[y][x];
        }
      }
      cell = out2;
    }
    if (g.clear) {
      const [from, to] = g.clear;
      for (let y = from; y <= to; y++) if (cell[y]) cell[y] = cell[y].map(() => 0);
    }
    if (g.mark !== undefined) {
      const mark = cellOf(font, g.mark, where);
      const mb = inkBounds(mark);
      const bb = inkBounds(cell);
      if (!mb) throw new Error(`${where}: the mark "${g.mark}" has no ink`);
      const dy = g.row! - mb.top;
      let dx = g.dx ?? 0;
      if (bb && (g.align ?? 'center') === 'center') {
        dx += Math.round((bb.left + bb.right) / 2) - Math.round((mb.left + mb.right) / 2);
      } else if (bb) {
        dx += bb.left - mb.left;
      }
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const v = mark[y][x];
          if (!v) continue;
          const ty = y + dy, tx = x + dx;
          if (ty < 0 || ty >= cellH || tx < 0 || tx >= cellW) {
            throw new Error(`${where}: the mark of "${g.char}" falls outside the ${cellW}x${cellH} cell (row=${g.row}, dx=${g.dx ?? 0})`);
          }
          cell[ty][tx] = v;
        }
      }
    }
    cell = shiftCell(cell, g.dy ?? 0);
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) grid[row * cellH + y][col * cellW + x] = colorIndex(out, font.palette[cell[y][x]] ?? 'transparent');
    }
    if (g.advance !== undefined) advances.set(g.char, g.advance);
  });

  out.generatedBy = generatedBy;
  const fontLines: [FontKey, string][] = [];
  for (const [key, value] of base.layout.font!) {
    if (key === 'glyphs' || key === 'advance') continue;
    fontLines.push([key, value]);
  }
  for (const r of [...headers.rows, ...newRows]) fontLines.push(['glyphs', r]);
  const adv = [...advances.entries()].map(([ch, n]) => `${ch === ' ' ? 'space' : ch}=${n}`);
  if (adv.length) fontLines.push(['advance', adv.join(' ')]);

  const { text } = toAscii(out, {
    layout: { glyphs: base.layout.glyphs, declared: [], font: fontLines, comments: 0 },
  });
  return { text, glyphs: spec.glyphs.length, rows: newRows.length, generatedBy };
}

/** `composeSheet` plus the two checks around writing it: the overwrite guard and the file. */
export function writeComposed(specPath: string, out: string, force: boolean) {
  const spec = parseComposeSpec(JSON.parse(readFileSync(specPath, 'utf8')), basename(specPath));
  const basePath = resolve(dirname(specPath), spec.base);
  const base = loadFont(basePath);
  const rel = (p: string) => relative(dirname(resolve(out)), resolve(p)) || basename(p);
  const generatedBy: GeneratedBy = { by: 'font_compose', args: { spec: rel(specPath), base: rel(basePath) } };
  const check = checkOverwrite(out, generatedBy);
  if (!check.ok && !force) throw new Error(check.why!);
  const composed = composeSheet(base, spec, generatedBy, basename(specPath));
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, composed.text);
  const written = loadFont(out);
  const d = dims(written.asset);
  return {
    out: resolve(out),
    base: resolve(basePath),
    composed: composed.glyphs,
    rows: composed.rows,
    glyphs: written.font.glyphs.size,
    size: `${d.width}x${d.height}`,
    retouch: written.retouch ?? null,
    forced: !check.ok,
  };
}
