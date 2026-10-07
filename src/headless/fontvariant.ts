// A derived font: the same drawing, one operation later.
//
// `font_compose` already derives glyphs from glyphs — a mark stamped over a
// letter, a `?` turned 180° into a `¿` — so the accents of Spanish are not
// drawn twenty times. A **variant** is one more step of the same machine, only
// it runs over the whole sheet instead of over sixteen cells:
//
//   outline   dilate the ink and subtract it: the letter comes out hollow
//   shadow    a copy of the ink offset underneath, in a color of its own
//   bold      the smear: the ink unioned with itself moved one pixel over
//
// **The advance is recalculated for free**, and that is the whole reason this
// is cheap: the advance of a glyph is its last painted column plus one plus
// `track` (see `font.ts`), so a fatter letter takes more room and the metric
// follows with no table to keep in sync. It also means **the gap between two
// letters is preserved**: every operation that grows the ink to the right grows
// the advance by the same amount, and the left bearing is drawn, not declared.
// A contour that glues two letters together would be worse than no contour, and
// this is why it cannot happen.
//
// What is *not* free is the counterform. At a cell of 8 the bowl of an `a` is
// two pixels wide; a smear of one leaves one, and in the places where it was
// one it leaves none — the letter closes. That is not a defect to hide: this
// file **measures the enclosed background of every glyph before and after** and
// says which ones lost it, because a result that looks fine and is not is worse
// than a result with a list of six letters to go and fix by hand. The fix lives
// in `<sheet>.retoque.txt` like every other hand pass and survives running the
// variant again.
//
// The cell grows to fit: a hollow letter needs a pixel on every side, a shadow
// needs one down and one to the right. `baseline` and `line` follow, so the
// leading of the variant is the leading of the original and nothing is clipped.
//
// Pure: no Node imports here (`fontfile.ts` does the disk work).

import type { Frame, SpriteAsset } from '../lib/types';
import type { AsciiLayout, FontKey } from './ascii';
import { blankFrame, colorIndex, createAsset, normalizeHex } from './assetModel';
import { parseFontHeaders, type PixelFont } from './font';

export const VARIANT_KINDS = ['outline', 'shadow', 'bold'] as const;
export type VariantKind = (typeof VARIANT_KINDS)[number];

/** What each one is called in the report, which is in Spanish. */
export const VARIANT_WORD: Record<VariantKind, string> = {
  outline: 'contorno',
  shadow: 'sombra',
  bold: 'negrita',
};

/** How each one is made, in one line: it goes in the drawing's `description:`. */
const VARIANT_HOW: Record<VariantKind, string> = {
  outline: 'dilatar la tinta y restarla, la letra queda hueca',
  shadow: 'una copia de la tinta corrida por debajo, en un color propio',
  bold: 'emborronado: la tinta unida consigo misma corrida un pixel',
};

export interface FontVariantOptions {
  kind: VariantKind;
  /** Shadow offset / smear, in drawing pixels. Default 1 for both kinds. */
  dx?: number;
  /** Shadow offset down. Default 1 for a shadow, 0 for the smear. */
  dy?: number;
  /** The shadow's hex. Default: the sheet's own ink at half brightness. */
  color?: string;
  id?: string;
  name?: string;
  description?: string;
}

/**
 * What one glyph's enclosed background did.
 *
 * Counted as **regions and area, before and after**, and not by following the
 * old region's own pixels, because an outline moves the counterform instead of
 * keeping it: the bowl of an `o` two pixels wide gets filled by the dilation
 * and the gap where the stroke used to be becomes the new counterform. The
 * letter still reads as an `o`; what would not read is an `o` with **no**
 * enclosed background left, and that is what `closed` means.
 */
export interface CounterReport {
  char: string;
  /** Enclosed background regions, before the operation and after. */
  regions: number;
  regions_after: number;
  /** Enclosed background pixels, before and after. */
  before: number;
  after: number;
  /** The smallest counterform left, in pixels: 1 is the edge of legible. */
  narrowest: number;
}

export interface FontVariantReport {
  kind: VariantKind;
  word: string;
  dx: number;
  dy: number;
  /** The shadow's color, only for a shadow. */
  color?: string;
  /** `8x11` → `10x13`. */
  base_cell: string;
  cell: string;
  baseline: number;
  line: number;
  glyphs: number;
  /** How much the advance of an inked glyph grew, which nobody had to declare. */
  advance_grew: number;
  /** Ink pixels on the whole sheet, before and after. */
  ink_before: number;
  ink_after: number;
  /** Glyphs that lost a counterform entirely: these are the ones to look at. */
  closed: string[];
  /** Glyphs whose counterform got smaller but is still open. */
  tightened: string[];
  /** Glyphs left with a counterform of a single pixel: open, and at the edge. */
  narrow: string[];
  /** One line per glyph that had an enclosed background at all. */
  counters: CounterReport[];
}

export interface FontVariantSheet {
  /** The derived sheet, with no `generated_by:` yet: the caller stamps it. */
  asset: SpriteAsset;
  /** The four font headers of the new sheet, in the order to write them. */
  fontLines: [FontKey, string][];
  report: FontVariantReport;
}

/** Geometry of the operation: how the cell grows and where the original lands. */
interface Geom {
  w: number;
  h: number;
  offX: number;
  offY: number;
  baseline: number;
  line: number;
  advanceGrew: number;
}

function geometryOf(kind: VariantKind, cellW: number, cellH: number, baseline: number, line: number, dx: number, dy: number): Geom {
  if (kind === 'outline') {
    // A pixel on every side: the dilation of a glyph that touches the cell edge
    // has to land somewhere, and clipping it would eat the left stroke of every
    // letter drawn against column 0.
    return { w: cellW + 2, h: cellH + 2, offX: 1, offY: 1, baseline: baseline + 1, line: line + 2, advanceGrew: 2 };
  }
  // The copy can go in any direction: when it goes up or left the original
  // moves over to make room, so nothing is ever clipped.
  const offX = Math.max(0, -dx);
  const offY = Math.max(0, -dy);
  return {
    w: cellW + Math.abs(dx),
    h: cellH + Math.abs(dy),
    offX,
    offY,
    baseline: baseline + offY,
    line: line + Math.abs(dy),
    advanceGrew: Math.abs(dx),
  };
}

/** The ink of one cell of the sheet as a frame of its own. */
function cellAt(sheet: Frame, row: number, col: number, cellW: number, cellH: number): Frame {
  const out = blankFrame(cellW, cellH);
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) out[y][x] = sheet[row * cellH + y]?.[col * cellW + x] ?? 0;
  }
  return out;
}

/**
 * The counterforms of a glyph: the whites **inside** it.
 *
 * Not just the enclosed ones. The gaps of an `m`, the aperture of a `c`, the
 * channels of an `E` are open at one end and they are what makes those letters
 * readable — the first version of this counted only enclosed background and
 * said the bold of Nube 8 was fine while `miró` was setting as `■iró`, because
 * an `m` whose two gaps have filled in is a solid block and has no hole to
 * lose. So: the transparent pixels of the glyph's own ink box, 4-connected
 * inside that box, and a region counts as a counterform when it is **boxed in
 * along one axis** — ink on its left and its right, or ink above and below.
 * That takes the counters, open or closed, and leaves out the notch of a
 * corner and the two sides of a slash, which are outside air and not whites of
 * the letter at all.
 */
function counterRegions(cell: Frame): Array<Array<[number, number]>> {
  const h = cell.length;
  const w = cell[0]?.length ?? 0;
  let top = h, left = w, bottom = -1, right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cell[y][x]) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return [];

  const seen = Array.from({ length: h }, () => Array<boolean>(w).fill(false));
  const regions: Array<Array<[number, number]>> = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (cell[y][x] || seen[y][x]) continue;
      const region: Array<[number, number]> = [];
      const todo: Array<[number, number]> = [[y, x]];
      seen[y][x] = true;
      let onTop = false, onBottom = false, onLeft = false, onRight = false;
      while (todo.length) {
        const [cy, cx] = todo.pop()!;
        region.push([cy, cx]);
        if (cy === top) onTop = true;
        if (cy === bottom) onBottom = true;
        if (cx === left) onLeft = true;
        if (cx === right) onRight = true;
        const around: Array<[number, number]> = [[cy - 1, cx], [cy + 1, cx], [cy, cx - 1], [cy, cx + 1]];
        for (const [ny, nx] of around) {
          if (ny < top || ny > bottom || nx < left || nx > right) continue;
          if (seen[ny][nx] || cell[ny][nx]) continue;
          seen[ny][nx] = true;
          todo.push([ny, nx]);
        }
      }
      if ((!onLeft && !onRight) || (!onTop && !onBottom)) regions.push(region);
    }
  }
  return regions;
}

/** The operation itself, on one cell. `src` is untouched. */
function transformCell(src: Frame, g: Geom, kind: VariantKind, dx: number, dy: number, shadow: number, where: string): Frame {
  const out = blankFrame(g.w, g.h);
  const H = src.length;
  const W = src[0]?.length ?? 0;
  const put = (y: number, x: number, v: number) => {
    if (y < 0 || y >= g.h || x < 0 || x >= g.w) {
      throw new Error(`${where}: the ${kind} of a glyph falls outside the ${g.w}x${g.h} cell (dx=${dx}, dy=${dy})`);
    }
    out[y][x] = v;
  };

  if (kind === 'outline') {
    // Dilate 3x3 (so a diagonal stroke gets a closed ring, not a dotted one),
    // keeping the color of the pixel that grew, then subtract the original.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = src[y][x];
        if (!v) continue;
        for (let ay = -1; ay <= 1; ay++) {
          for (let ax = -1; ax <= 1; ax++) {
            const ty = y + g.offY + ay, tx = x + g.offX + ax;
            if (ty < 0 || ty >= g.h || tx < 0 || tx >= g.w) {
              throw new Error(`${where}: the outline of a glyph falls outside the ${g.w}x${g.h} cell`);
            }
            if (!out[ty][tx]) out[ty][tx] = v;
          }
        }
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (src[y][x]) out[y + g.offY][x + g.offX] = 0;
    }
    return out;
  }

  // The copy goes down first and the original over it, so where the two meet
  // the letter wins: a shadow is behind the letter, not on it.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = src[y][x];
      if (!v) continue;
      put(y + g.offY + dy, x + g.offX + dx, kind === 'shadow' ? shadow : v);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = src[y][x];
      if (v) put(y + g.offY, x + g.offX, v);
    }
  }
  return out;
}

/** How many counterforms each glyph of a sheet has, and how big the smallest is. */
export interface Census {
  regions: number;
  area: number;
  narrowest: number;
}

/**
 * The counterforms of every glyph of a sheet, as it stands. Taken on a sheet
 * that is already on disk (base plus its retouch), this is what says whether
 * the hand pass really reopened what the operation closed — the one thing a
 * report of the operation alone cannot know.
 */
export function counterCensus(font: PixelFont): Map<string, Census> {
  const { cellW, cellH } = font.metrics;
  const out = new Map<string, Census>();
  for (const glyph of font.glyphs.values()) {
    if (glyph.col < 0 || glyph.empty) continue;
    const regions = counterRegions(cellAt(font.sheet, glyph.row, glyph.col, cellW, cellH));
    out.set(glyph.char, {
      regions: regions.length,
      area: regions.reduce((n, r) => n + r.length, 0),
      narrowest: regions.length ? Math.min(...regions.map(r => r.length)) : 0,
    });
  }
  return out;
}

/** `#ffffff` → `#808080`: an ink is its own shadow, dimmer. */
export function halfBrightness(hex: string): string {
  const h = normalizeHex(hex);
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(h);
  if (!m) return '#808080';
  const n = parseInt(m[1], 16);
  const dim = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => Math.round(c / 2));
  return '#' + dim.map(c => c.toString(16).padStart(2, '0')).join('') + (m[2] ?? '');
}

/** The color the sheet is mostly drawn in: its ink. */
function mainInk(font: PixelFont): string {
  const count = new Map<number, number>();
  for (const row of font.sheet) for (const v of row) if (v) count.set(v, (count.get(v) ?? 0) + 1);
  let best = 0, most = -1;
  for (const [index, n] of count) if (n > most) { most = n; best = index; }
  return font.palette[best] ?? '#ffffff';
}

/** The effective arguments: what the defaults come out to, so a caller can print them. */
export function variantSettings(font: PixelFont, opts: FontVariantOptions) {
  const kind = opts.kind;
  const dx = opts.dx ?? (kind === 'outline' ? 0 : 1);
  const dy = opts.dy ?? (kind === 'shadow' ? 1 : 0);
  const color = kind === 'shadow' ? normalizeHex(opts.color ?? halfBrightness(mainInk(font))) : undefined;
  return { kind, dx, dy, color };
}

/**
 * The derived sheet: every cell of the base through one operation, the font
 * headers rebuilt for the new cell, and the report of what the counterforms
 * did. Writes nothing and touches neither the base asset nor its layout.
 */
export function fontVariant(
  base: { font: PixelFont; asset: SpriteAsset; layout: AsciiLayout },
  opts: FontVariantOptions,
  where: string,
): FontVariantSheet {
  const font = base.font;
  const headers = parseFontHeaders(base.layout.font!, where);
  const { kind, dx, dy, color } = variantSettings(font, opts);
  if (kind !== 'outline' && dx === 0 && dy === 0) {
    throw new Error(`${where}: a ${kind} with dx=0 and dy=0 would be a copy of the base sheet`);
  }
  const { cellW, cellH, cols, rows, baseline, line, space, track } = font.metrics;
  const g = geometryOf(kind, cellW, cellH, baseline, line, dx, dy);

  const palette = Object.keys(font.palette).map(Number).sort((a, b) => a - b).map(i => font.palette[i]);
  const closed: string[] = [];
  const tightened: string[] = [];
  const counters: CounterReport[] = [];
  const how = `Variante ${VARIANT_WORD[kind]} de ${font.id}: ${VARIANT_HOW[kind]}.`;

  const out = createAsset({
    id: opts.id ?? `${font.id}_${kind}`,
    name: opts.name ?? `${font.name} ${VARIANT_WORD[kind]}`,
    width: cols * g.w,
    height: rows * g.h,
    category: base.asset.category ?? 'ui',
    palette,
    frames: 1,
    description: opts.description ?? how,
  });
  out.colorNames = { ...base.asset.colorNames };
  // Same hex, same index: the legend of the base sheet survives into the variant.
  const index = new Map<number, number>();
  for (const i of Object.keys(font.palette).map(Number)) index.set(i, colorIndex(out, font.palette[i]));
  const had = new Set(index.values());
  const shadowIndex = color ? colorIndex(out, color) : 0;
  // A shadow the base sheet does not already have is a color of its own, and
  // the legend is where a person reads what it is for.
  if (color && !had.has(shadowIndex)) out.colorNames[shadowIndex] = 'sombra';

  const grid = out.layers![0].frames[0];
  const byCell = new Map<string, string>();
  for (const glyph of font.glyphs.values()) if (glyph.col >= 0) byCell.set(`${glyph.row},${glyph.col}`, glyph.char);

  let inkBefore = 0;
  let inkAfter = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const src = cellAt(font.sheet, r, c, cellW, cellH);
      const cell = transformCell(src, g, kind, dx, dy, shadowIndex, where);
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          const v = cell[y][x];
          if (!v) continue;
          grid[r * g.h + y][c * g.w + x] = index.get(v) ?? v;
          inkAfter++;
        }
      }
      for (const row of src) for (const v of row) if (v) inkBefore++;

      // What the operation did to the enclosed background of this glyph: a
      // counterform gone is a letter that stopped reading, a counterform
      // narrower is a letter to look at.
      const char = byCell.get(`${r},${c}`);
      if (!char) continue;
      const was = counterRegions(src);
      if (!was.length) continue;
      const now = counterRegions(cell);
      const before = was.reduce((n, region) => n + region.length, 0);
      const after = now.reduce((n, region) => n + region.length, 0);
      const narrowest = now.length ? Math.min(...now.map(region => region.length)) : 0;
      counters.push({ char, regions: was.length, regions_after: now.length, before, after, narrowest });
      if (now.length < was.length) closed.push(char);
      else if (after < before) tightened.push(char);
    }
  }

  // The headers of the new sheet. The advance of a glyph with ink grew by what
  // the ink grew to the right — nobody declared it, the drawing did — and a
  // glyph with no ink (the space) keeps the number it had.
  const fontLines: [FontKey, string][] = [
    ['font', `cell=${g.w}x${g.h} baseline=${g.baseline} line=${g.line} space=${space} track=${track}`],
  ];
  for (const row of headers.rows) fontLines.push(['glyphs', row]);
  const advances = [...headers.advances.entries()].map(([ch, n]) => {
    const glyph = font.glyphs.get(ch);
    const grown = glyph && !glyph.empty ? n + g.advanceGrew : n;
    return `${ch === ' ' ? 'space' : ch}=${grown}`;
  });
  if (advances.length) fontLines.push(['advance', advances.join(' ')]);
  for (const [key, value] of base.layout.font!) if (key === 'kern') fontLines.push([key, value]);

  if (closed.length) {
    out.description = `${out.description}\nPerdieron contraforma y van a mano en el retoque: ${closed.join(' ')}.`;
  }

  return {
    asset: out,
    fontLines,
    report: {
      kind,
      word: VARIANT_WORD[kind],
      dx,
      dy,
      ...(color ? { color } : {}),
      base_cell: `${cellW}x${cellH}`,
      cell: `${g.w}x${g.h}`,
      baseline: g.baseline,
      line: g.line,
      glyphs: font.glyphs.size,
      advance_grew: g.advanceGrew,
      ink_before: inkBefore,
      ink_after: inkAfter,
      closed,
      tightened,
      narrow: counters.filter(c => c.narrowest === 1).map(c => c.char),
      counters,
    },
  };
}

/** The report `font_variant` prints: what it made and what it cost. */
export function variantReport(r: FontVariantReport, id: string): string {
  const lines = [
    `${id} · ${r.word} de celda ${r.base_cell} → ${r.cell} · base ${r.baseline} · línea ${r.line} · ${r.glyphs} glifos`,
    `  ${r.kind === 'outline' ? 'dilatar y restar' : `copia en ${r.dx >= 0 ? '+' : ''}${r.dx},${r.dy >= 0 ? '+' : ''}${r.dy}`}` +
      `${r.color ? ` en ${r.color}` : ''} · tinta ${r.ink_before} → ${r.ink_after} px`,
    `  el avance de cada glifo con tinta creció ${r.advance_grew} px solo, porque el avance sale de la tinta`,
  ];
  if (r.kind === 'shadow') {
    // A shadow never touches the letter: what takes a counterform is the copy
    // behind it, in another color. So this count is about contrast, not shape.
    lines.push('  la letra no se toca: lo que entra en la contraforma es la sombra, que cuenta como tinta en esta medida');
  }
  lines.push(`  se cerraron: ${r.closed.length ? r.closed.join(' ') : 'ninguno'}`);
  lines.push(`  se angostaron: ${r.tightened.length ? r.tightened.join(' ') : 'ninguno'}`);
  lines.push(`  quedaron en 1 px de contraforma: ${r.narrow.length ? r.narrow.join(' ') : 'ninguno'}`);
  if (r.closed.length) {
    lines.push(r.kind === 'shadow'
      ? `✗ ${r.closed.length} glifo(s) tienen la contraforma tomada por la sombra: se leen mientras la sombra no sea ` +
        `del color de la tinta, y en un export monocromo (font_web no tiene colores) no se leen`
      : `✗ ${r.closed.length} glifo(s) perdieron la contraforma: a este cuerpo el truco no alcanza y van a mano ` +
        `en el retoque de al lado (se regenera sin perderlo)`);
  }
  return lines.join('\n');
}
