// Words on a voxel face (`VoxelPaint.text`): set with a pixel font into the
// colors the render reads.
//
// The model says what a tape or a label reads and in what color; this lays
// the letters out with the font (the built-in small letter unless the text
// names another), over the face's own drawing if it has one and over its
// `background` if it gives one, and hands back a paint that is plain pixels
// the size of the face's frame. A text that does not fit the face, or that
// uses a character the font has not got, is refused saying so: a name cut off
// on a machine is worse than an error.
//
// Pure: the fonts come from the caller (`fontfile.ts` reads them from disk).

import { layoutText, type PixelFont } from './font';
import type { VoxelPaint, VoxelText } from './voxel';

/** A paint with its text set: `pixels` the size of `frame`, at [0, 0], no `text` nor `background`. */
export function setPaintText(
  p: VoxelPaint,
  frame: [number, number],
  fontOf: (path?: string) => PixelFont,
  where: string,
): VoxelPaint {
  if (p.text === undefined && p.background === undefined) return p;
  const texts: VoxelText[] = p.text === undefined ? [] : Array.isArray(p.text) ? p.text : [p.text];
  if (!texts.length) throw new Error(`${where}: background is the paper under a text; give text too`);
  if (p.draw !== undefined) throw new Error(`${where}: text goes over rows or pixels (read the drawing first)`);
  if (p.shadeRows !== undefined || p.shadePixels !== undefined || p.shadeDraw !== undefined) {
    throw new Error(`${where}: text does not go with a drawing in shadow (shadeRows, shadePixels, shadeDraw): its colors take shade`);
  }
  const [W, H] = frame;
  const grid: (string | null)[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => p.background ?? null));

  // The face's own drawing, where its `at` puts it.
  const drawing = p.rows
    ? p.rows.map((row, r) => [...row].map((g, c) => {
      if (g === '.' || g === ' ') return null;
      const color = p.glyphs?.[g];
      if (!color) throw new Error(`${where}: glyph "${g}" (row ${r}, column ${c}) is not in glyphs`);
      return color;
    }))
    : p.pixels;
  if (drawing) {
    const [ax, ay] = p.at ?? [0, 0];
    drawing.forEach((row, r) => row.forEach((c, col) => {
      if (!c) return;
      if (ay + r >= H || ax + col >= W) throw new Error(`${where}: the drawing does not fit the face (${W}x${H})`);
      grid[ay + r][ax + col] = c;
    }));
  }

  texts.forEach((t, i) => {
    const name = texts.length > 1 ? `${where}: text ${i}` : `${where}: text`;
    if (typeof t?.value !== 'string' || !t.value) throw new Error(`${name}: value is what it says, a non-empty string`);
    if (typeof t.color !== 'string' || !t.color) throw new Error(`${name}: color is a palette name or a hex`);
    if (t.align !== undefined && !['left', 'center', 'right'].includes(t.align)) throw new Error(`${name}: align is left, center or right`);
    const font = fontOf(t.font);
    if (t.value.includes('\n')) throw new Error(`${name}: one line per text (give a list of texts for more)`);
    const laid = layoutText(font, t.value);
    if (laid.missing.length) {
      throw new Error(`${name}: "${t.value}" uses ${laid.missing.map(c => `"${c}"`).join(', ')}, which ${t.font ? `the font ${t.font.split(/[\\/]/).pop()}` : 'the small letter (capitals, digits and . , : ; ! ? \' - / + ( ))'} has not got`);
    }
    const [mx, my] = t.at ?? [0, 0];
    if (!Number.isInteger(mx) || !Number.isInteger(my) || mx < 0 || my < 0) throw new Error(`${name}: at is two whole units, [column, row]`);
    const x0 = t.align === 'center' ? Math.floor((W - laid.width) / 2) + mx : t.align === 'right' ? W - laid.width - mx : mx;
    const { cellW, cellH } = font.metrics;
    const tall = cellH + (t.wobble ? 1 : 0);
    if (x0 < 0 || x0 + laid.width > W || my + tall > H) {
      throw new Error(`${name}: "${t.value}" is ${laid.width}x${tall} and from column ${x0}, row ${my} it does not fit the face (${W}x${H})`);
    }
    laid.lines[0].forEach(({ glyph, x }, k) => {
      if (glyph.empty) return;
      const dy = t.wobble && k % 2 ? 1 : 0;
      for (let y = 0; y < cellH; y++) {
        for (let cx = 0; cx < cellW; cx++) {
          if (font.sheet[glyph.row * cellH + y]?.[glyph.col * cellW + cx]) grid[my + y + dy][x0 + x + cx] = t.color;
        }
      }
    });
  });

  const out: VoxelPaint = { ...p, pixels: grid, at: [0, 0] };
  delete out.text; delete out.background; delete out.rows; delete out.glyphs;
  return out;
}
