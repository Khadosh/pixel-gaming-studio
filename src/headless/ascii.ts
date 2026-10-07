// Assets as text: a small, documented format for drawing pixel art by hand in
// any editor and keeping it under version control. `fromAscii` builds an asset
// from it; `toAscii` writes any single-layer asset back, so text → asset → text
// is exact.
//
// Format (blank lines and lines starting with "#" are ignored everywhere):
//
//   id: farol                      header, "key: value" (all optional; id
//   name: Farol de piedra          defaults to the file name, size is inferred
//   category: prop                 from the drawing when missing)
//   size: 16x32                    or width: / height:
//   description: one line          repeat the key to add more lines
//   fit: ../paleta.pss.json        every hex must be in this asset's palette
//   generated_by: map_export       what made it: a command and the arguments to
//     recipe=../a.json layer=front  make it again. Absent = drawn by hand.
//   retouch_of: camino.txt         this drawing is the retouch layer of that one
//                                  (every glyph but "." goes over it, and "!"
//                                  takes the pixel underneath out)
//   anchor: 5,11                   the pixel that sits on the ground: whoever
//                                  places the drawing somewhere puts THIS pixel
//                                  there, not the top-left corner. Without it a
//                                  lantern floats or is buried.
//   font: cell=8x10 baseline=8     this drawing is a glyph sheet: see font.ts.
//   glyphs: ABCDEFGH               The four font keys are carried through as
//   advance: space=3 i=2           written (repeatable, leading spaces kept);
//   kern: AV=-1                    only `font.ts` understands them.
//   anim: idle fps=6 loop=true     animation options, in order (fps=, durations=
//                                  700,500, loop=true|false, label=)
//   k = #15120f tinta              legend: glyph = hex [color name]; the order
//   p = #c2bdb5 piedra             is the palette order. "." is transparent,
//                                  and "!" is reserved (see ERASE_GLYPH).
//
//   == idle 0, attack 1            a frame: the slots it fills ("<anim> <pos>",
//   ..kk..                         pos optional = next free), "==" alone for a
//   .kppk.                         frame outside every animation. Then its rows.
//
// Frames are numbered in the order they appear.
//
// No Node imports here: the web editor opens and saves these files too.
// `fromAscii` also returns the text's layout (the glyph of each color, which
// animations had an "anim:" line, the "fit:" header) and `toAscii` honors it,
// so a drawing read and written back is the same text.

import type { Frame, GeneratedBy, SpriteAsset } from '../lib/types';
import { blankFrame, createAsset, dims, frameCount, normalizeHex, onPalette, setAnimation } from './assetModel';

function basename(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;
}

/** `rel` against the folder of `from` (posix-style, like path.resolve without the cwd). */
export function resolveBeside(from: string, rel: string): string {
  if (rel.startsWith('/')) return rel;
  const parts = from.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' && parts.length > 0 && parts[parts.length - 1] !== '..' && parts[parts.length - 1] !== '') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/') || '.';
}

const CATEGORIES = ['character', 'terrain', 'prop', 'nature', 'ui'] as const;
type Category = (typeof CATEGORIES)[number];

/** Glyphs handed out by toAscii, by palette index (index 0 is "."). */
export const ASCII_GLYPHS = '.123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The third thing a retouch layer can say. `.` is "leave what was underneath"
 * and a color glyph is "paint this"; `!` is **"take this pixel out"**, so what
 * the editor shows is what the drawing ends up being and a pixel the recipe
 * painted can be rubbed out without touching the recipe's own file.
 *
 * `!` and not `-` (which `== -` already uses for a frame in no animation) nor
 * `~`/`_` (which read as ink in a grid): it is never handed out as a color
 * glyph, it is one thin stroke so the drawing still reads, and it says an order.
 * It is rejected in the legend, like `#` and `=`.
 *
 * Only a drawing that declares `retouch_of:` may use it: everywhere else it
 * would be a pixel with no color, and the error says which header is missing.
 */
export const ERASE_GLYPH = '!';

/**
 * What `ERASE_GLYPH` is in a frame: not a palette index, so nothing mistakes it
 * for a color. Whoever lays the overlay over a drawing (`makeVariant`, the
 * editor) turns it into a hole; it never reaches a drawing of its own.
 */
export const ERASE = -1;

const HEX = /^(#?[0-9a-fA-F]{3}|#?[0-9a-fA-F]{6}|#?[0-9a-fA-F]{8}|transparent)$/;

export interface AsciiAnimOptions {
  fps?: number;
  durations?: number[];
  loop?: boolean;
  label?: string;
}

/**
 * Header keys a glyph sheet adds (`font.ts` parses them; the text format only
 * carries them). Repeatable, and their value is kept raw so a `glyphs:` row can
 * start with the spaces that skip cells.
 */
export const FONT_KEYS = ['font', 'glyphs', 'advance', 'kern'] as const;
export type FontKey = (typeof FONT_KEYS)[number];

/** How a text drawing was written, beyond what the asset holds. */
export interface AsciiLayout {
  /** Glyph of each palette index, as the legend had it. */
  glyphs: Record<number, string>;
  /** Animations that had their own "anim:" line (the rest only appear in "==" lines). */
  declared: string[];
  /** The "fit:" header as written. */
  fit?: string;
  /** The "retouch_of:" header as written: this drawing is a retouch layer of that one. */
  retouchOf?: string;
  /** The "anchor:" header: [x, y] px of the pixel of the drawing that sits where it is placed. */
  anchor?: [number, number];
  /** The font headers (`font:`, `glyphs:`, `advance:`, `kern:`) in the order they were written. */
  font?: [FontKey, string][];
  /**
   * The `id:`, `name:` and `category:` headers exactly as written, each absent
   * when the text had none. The asset cannot say: `fromAscii` fills those three
   * from the file name when they are missing, so only the layout knows which
   * ones the text really declared. Carried for whoever rebuilds a file from
   * scratch instead of from the asset it opened — the editor, writing a retouch
   * layer.
   */
  header?: { id?: string; name?: string; category?: string };
  /** How many "#" comment lines the text had (toAscii does not write them back). */
  comments: number;
}

export interface ParsedAscii {
  asset: SpriteAsset;
  /** Path of the "fit" header resolved against the source file, if any. */
  fit?: string;
  /** Path of the "retouch_of" header resolved against the source file, if any. */
  retouchOf?: string;
  /** The "anchor:" header: [x, y] px of the pixel that sits where the drawing is placed. */
  anchor?: [number, number];
  layout: AsciiLayout;
}

export interface FromAsciiOptions {
  /** Where the text came from: names errors and resolves a relative "fit:". */
  sourcePath?: string;
  /** Id to use when the header has none. */
  defaultId?: string;
}

class AsciiError extends Error {}

function fail(where: string, msg: string): never {
  throw new AsciiError(`${where}: ${msg}`);
}

function parseAnimOptions(where: string, words: string[]): AsciiAnimOptions {
  const opts: AsciiAnimOptions = {};
  for (const w of words) {
    const eq = w.indexOf('=');
    if (eq < 0) fail(where, `expected key=value in anim options, got "${w}"`);
    const key = w.slice(0, eq), value = w.slice(eq + 1);
    switch (key) {
      case 'fps': {
        const n = Number(value);
        if (!(n > 0)) fail(where, `fps must be a positive number, got "${value}"`);
        opts.fps = n;
        break;
      }
      case 'durations': {
        const list = value.split(',').map(Number);
        if (list.some(n => !(n > 0))) fail(where, `durations must be positive ms separated by commas, got "${value}"`);
        opts.durations = list;
        break;
      }
      case 'loop':
        if (value !== 'true' && value !== 'false') fail(where, `loop must be true or false, got "${value}"`);
        opts.loop = value === 'true';
        break;
      case 'label':
        opts.label = value;
        break;
      default:
        fail(where, `unknown anim option "${key}" (fps, durations, loop, label)`);
    }
  }
  return opts;
}

const NAME = /^[a-z][a-z0-9_]*$/;

/** `map_export recipe=../a.json layer=ground` → `{ by, args }`, keys in order. */
export function parseGeneratedBy(where: string, value: string): GeneratedBy {
  const [by, ...words] = value.split(/\s+/).filter(Boolean);
  if (!by) fail(where, 'generated_by needs the command that made the drawing');
  if (!NAME.test(by)) fail(where, `generated_by "${by}" is not a command name (lowercase letters, digits and _)`);
  const args: Record<string, string> = {};
  for (const w of words) {
    const eq = w.indexOf('=');
    if (eq < 1) fail(where, `generated_by: expected key=value, got "${w}"`);
    const key = w.slice(0, eq), v = w.slice(eq + 1);
    if (!NAME.test(key)) fail(where, `generated_by: "${key}" is not an argument name`);
    if (!v) fail(where, `generated_by: "${key}" has no value`);
    if (key in args) fail(where, `generated_by: "${key}" given twice`);
    args[key] = v;
  }
  return { by, args };
}

/** The `generated_by:` value of a `GeneratedBy`, the inverse of `parseGeneratedBy`. */
export function formatGeneratedBy(g: GeneratedBy): string {
  const words = [g.by];
  for (const [k, v] of Object.entries(g.args)) {
    if (/\s/.test(v)) throw new Error(`generated_by: the value of "${k}" has spaces ("${v}"); the text format cannot hold it`);
    words.push(`${k}=${v}`);
  }
  return words.join(' ');
}

/** Two provenances are the same when the command and every argument match. */
export function sameGeneratedBy(a?: GeneratedBy, b?: GeneratedBy): boolean {
  if (!a || !b) return false;
  return formatGeneratedBy(a) === formatGeneratedBy(b);
}

/**
 * The `generated_by:` of a text drawing without parsing its pixels: for a
 * command that wants to know what it is about to overwrite.
 */
export function peekGeneratedBy(text: string): GeneratedBy | undefined {
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('==')) return undefined;
    const m = /^generated_by:\s*(.*)$/.exec(line);
    if (m) return parseGeneratedBy('generated_by', m[1]);
  }
  return undefined;
}

interface RawFrame {
  line: number;
  slots: { anim: string; pos?: number }[];
  rows: { line: number; text: string }[];
}

/** Parses the text format into an asset (single layer, palette in legend order). */
export function fromAscii(text: string, opts: FromAsciiOptions = {}): ParsedAscii {
  const src = opts.sourcePath ? basename(opts.sourcePath) : 'ascii';
  const header: Record<string, string> = {};
  const descriptions: string[] = [];
  const animOrder: string[] = [];
  const animOpts = new Map<string, AsciiAnimOptions>();
  const legend = new Map<string, string>();
  const names = new Map<string, string>();
  const frames: RawFrame[] = [];
  const fontLines: [FontKey, string][] = [];
  let comments = 0;
  let generatedBy: GeneratedBy | undefined;

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    const n = i + 1;
    const where = `${src}:${n}`;
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) return;
    if (line.trimStart().startsWith('#')) { comments++; return; }

    if (line.startsWith('==')) {
      const rest = line.slice(2).trim();
      const slots = rest === '' || rest === '-' ? [] : rest.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        if (parts.length > 2 || !parts[0]) fail(where, `frame slot must be "<anim> [pos]", got "${s.trim()}"`);
        if (parts.length === 1) return { anim: parts[0] };
        const pos = Number(parts[1]);
        if (!Number.isInteger(pos) || pos < 0) fail(where, `frame position must be a whole number, got "${parts[1]}"`);
        return { anim: parts[0], pos };
      });
      frames.push({ line: n, slots, rows: [] });
      return;
    }

    if (frames.length > 0) {
      frames[frames.length - 1].rows.push({ line: n, text: line.trim() });
      return;
    }

    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) {
      const [, key, value] = kv;
      if (key === 'description') { descriptions.push(value); return; }
      if ((FONT_KEYS as readonly string[]).includes(key)) {
        // Raw value: a "glyphs:" row needs the leading spaces that skip cells.
        fontLines.push([key as FontKey, line.trim().slice(key.length + 1).replace(/^ /, '')]);
        return;
      }
      if (key === 'generated_by') {
        if (generatedBy) fail(where, 'header "generated_by" given twice');
        generatedBy = parseGeneratedBy(where, value);
        return;
      }
      if (key === 'anim') {
        const [name, ...words] = value.split(/\s+/).filter(Boolean);
        if (!name) fail(where, 'anim needs a name');
        if (animOpts.has(name)) fail(where, `anim "${name}" declared twice`);
        animOrder.push(name);
        animOpts.set(name, parseAnimOptions(where, words));
        return;
      }
      if (!['id', 'name', 'category', 'size', 'width', 'height', 'fit', 'generated_by', 'retouch_of', 'anchor'].includes(key)) {
        fail(where, `unknown header key "${key}" (id, name, category, size, width, height, description, fit, generated_by, retouch_of, anchor, anim, ${FONT_KEYS.join(', ')})`);
      }
      if (key in header) fail(where, `header "${key}" given twice`);
      header[key] = value.trim();
      return;
    }

    const leg = /^(\S)\s*=\s*(\S+)(?:\s+(.*))?$/.exec(line.trim());
    if (leg) {
      const [, glyph, hex, name] = leg;
      if (!HEX.test(hex)) fail(where, `legend "${glyph}": "${hex}" is not a hex color`);
      if (glyph === '.') {
        if (normalizeHex(hex) !== 'transparent') fail(where, '"." is always transparent');
        return;
      }
      if (glyph === '#' || glyph === '=') fail(where, `"${glyph}" cannot be a glyph`);
      if (glyph === ERASE_GLYPH) fail(where, `"${ERASE_GLYPH}" cannot be a color: it takes a pixel out`);
      if (legend.has(glyph)) fail(where, `glyph "${glyph}" defined twice`);
      const norm = normalizeHex(hex);
      if (norm === 'transparent') fail(where, `only "." is transparent ("${glyph}")`);
      legend.set(glyph, norm);
      if (name) names.set(glyph, name.trim());
      return;
    }
    fail(where, `cannot read this line before the first "==" frame: "${line.trim()}"`);
  });

  if (frames.length === 0) fail(src, 'no frames: start each one with a "==" line');
  const declared = [...animOrder];

  // Size: declared or inferred from the first frame.
  let width: number | undefined;
  let height: number | undefined;
  if (header.size) {
    const m = /^(\d+)(?:\s*x\s*(\d+))?$/.exec(header.size);
    if (!m) fail(src, `size must be "W" or "WxH", got "${header.size}"`);
    width = Number(m[1]);
    height = Number(m[2] ?? m[1]);
  }
  if (header.width) width = Number(header.width);
  if (header.height) height = Number(header.height);
  if (width !== undefined && !(width > 0 && Number.isInteger(width))) fail(src, `bad width "${width}"`);
  if (height !== undefined && !(height > 0 && Number.isInteger(height))) fail(src, `bad height "${height}"`);
  const first = frames[0];
  if (first.rows.length === 0) fail(`${src}:${first.line}`, 'frame has no rows');
  width ??= first.rows[0].text.length;
  height ??= first.rows.length;

  // Pixels.
  const glyphIndex = new Map<string, number>();
  [...legend.keys()].forEach((g, i) => glyphIndex.set(g, i + 1));
  const grids: Frame[] = frames.map((f, fi) => {
    const where = `${src}:${f.line} (frame ${fi})`;
    if (f.rows.length !== height) fail(where, `has ${f.rows.length} rows, expected ${height}`);
    const grid = blankFrame(width!, height!);
    f.rows.forEach((row, y) => {
      if (row.text.length !== width) {
        fail(`${src}:${row.line} (frame ${fi}, row ${y})`, `is ${row.text.length} wide, expected ${width}`);
      }
      for (let x = 0; x < width!; x++) {
        const ch = row.text[x];
        if (ch === '.') continue;
        if (ch === ERASE_GLYPH) {
          if (!header.retouch_of) {
            fail(`${src}:${row.line} (frame ${fi}, row ${y}, col ${x})`,
              `"${ERASE_GLYPH}" takes the pixel underneath out, which only means something in a drawing laid over another: add a "retouch_of:" header naming the drawing this one retouches`);
          }
          grid[y][x] = ERASE;
          continue;
        }
        const idx = glyphIndex.get(ch);
        if (idx === undefined) fail(`${src}:${row.line} (frame ${fi}, row ${y}, col ${x})`, `glyph "${ch}" is not in the legend`);
        grid[y][x] = idx;
      }
    });
    return grid;
  });

  // Animations: order of "anim:" lines first, then by first appearance.
  const slotsByAnim = new Map<string, Map<number, number>>();
  frames.forEach((f, fi) => {
    for (const s of f.slots) {
      if (!slotsByAnim.has(s.anim)) slotsByAnim.set(s.anim, new Map());
      const m = slotsByAnim.get(s.anim)!;
      const pos = s.pos ?? (m.size === 0 ? 0 : Math.max(...m.keys()) + 1);
      if (m.has(pos)) fail(`${src}:${f.line}`, `${s.anim} ${pos} is already frame ${m.get(pos)}`);
      m.set(pos, fi);
      if (!animOpts.has(s.anim)) { animOpts.set(s.anim, {}); animOrder.push(s.anim); }
    }
  });

  const id = header.id || opts.defaultId || (opts.sourcePath ? basename(opts.sourcePath).replace(/\.[^.]+$/, '') : 'ascii');
  const category = (header.category || 'prop') as Category;
  if (!CATEGORIES.includes(category)) fail(src, `category must be one of ${CATEGORIES.join(', ')}`);
  const asset = createAsset({
    id,
    name: header.name || id,
    width,
    height,
    category,
    palette: [...legend.values()],
    frames: grids.length,
    description: descriptions.join('\n'),
  });
  [...legend.keys()].forEach((g, i) => { if (names.has(g)) asset.colorNames[i + 1] = names.get(g)!; });
  if (generatedBy) asset.generatedBy = generatedBy;
  asset.layers![0].frames = grids;

  for (const name of animOrder) {
    const m = slotsByAnim.get(name);
    if (!m) fail(src, `anim "${name}" has no frames (add "== ${name} 0" before a frame)`);
    const positions = [...m.keys()].sort((a, b) => a - b);
    positions.forEach((p, i) => { if (p !== i) fail(src, `anim "${name}" is missing position ${i}`); });
    const o = animOpts.get(name)!;
    if (o.durations && o.durations.length !== positions.length) {
      fail(src, `anim "${name}" has ${positions.length} frames but ${o.durations.length} durations`);
    }
    setAnimation(asset, { name, frameIndices: positions.map(p => m.get(p)!), ...o });
  }

  const beside = (rel: string) => (opts.sourcePath ? resolveBeside(opts.sourcePath, rel) : rel);
  const fit = header.fit ? beside(header.fit) : undefined;
  const retouchOf = header.retouch_of ? beside(header.retouch_of) : undefined;
  let anchor: [number, number] | undefined;
  if (header.anchor !== undefined) {
    const m = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(header.anchor);
    if (!m) fail(src, `anchor must be "x,y" in px of the drawing, got "${header.anchor}"`);
    anchor = [Number(m[1]), Number(m[2])];
    if (anchor[0] < 0 || anchor[0] >= width || anchor[1] < 0 || anchor[1] >= height) {
      fail(src, `anchor ${anchor.join(',')} is outside the drawing (${width}x${height})`);
    }
  }
  const glyphs: Record<number, string> = {};
  [...legend.keys()].forEach((g, i) => { glyphs[i + 1] = g; });
  const written: { id?: string; name?: string; category?: string } = {};
  if (header.id) written.id = header.id;
  if (header.name) written.name = header.name;
  if (header.category) written.category = header.category;
  return {
    asset, fit, retouchOf, anchor,
    layout: {
      glyphs, declared, fit: header.fit, retouchOf: header.retouch_of, anchor,
      font: fontLines.length ? fontLines : undefined,
      header: Object.keys(written).length ? written : undefined,
      comments,
    },
  };
}

/** Throws naming every glyph whose hex is not in the given palette (translucent palette colors pass). */
export function checkFit(asset: SpriteAsset, palette: string[], label: string, glyphs?: Map<number, string>): void {
  const allowed = new Set(palette.map(normalizeHex));
  const bad = Object.entries(asset.palette)
    .filter(([, hex]) => !onPalette(allowed, hex))
    .map(([k, hex]) => `"${glyphs?.get(Number(k)) ?? ASCII_GLYPHS[Number(k)] ?? k}" = ${hex}`);
  if (bad.length) throw new Error(`not in the palette of ${label}: ${bad.join(', ')}`);
}

/** Glyph of each legend entry, in palette order, as fromAscii read it. */
export function legendGlyphs(text: string): Map<number, string> {
  const out = new Map<number, string>();
  let inFrames = false;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('==')) inFrames = true;
    if (inFrames || !line || line.startsWith('#') || /^[a-z_]+:/.test(line)) continue;
    const m = /^(\S)\s*=\s*\S+/.exec(line);
    if (m && m[1] !== '.') out.set(out.size + 1, m[1]);
  }
  return out;
}

export interface ToAsciiOptions {
  /**
   * Hex colors of a reference palette: a color found there gets the glyph of
   * its index in it, so every file drawn on the same palette shares glyphs.
   */
  glyphPalette?: Record<number, string>;
  /**
   * The layout fromAscii returned: glyphs, "anim:" lines and "fit:" come back
   * as they were. Colors added since get free glyphs; it wins over glyphPalette.
   */
  layout?: AsciiLayout;
}

function headerValue(v: string): string {
  return v.replace(/\s*\n\s*/g, ' ').trim();
}

/** Writes an asset in the text format. Multi-layer assets are flattened (see `flattened`). */
export function toAscii(asset: SpriteAsset, opts: ToAsciiOptions = {}): { text: string; flattened: boolean } {
  const { width, height } = dims(asset);
  const indices = Object.keys(asset.palette).map(Number).sort((a, b) => a - b);

  // Glyph per palette index: from the reference palette when it has the color, else by index.
  const glyphOf = new Map<number, string>();
  const used = new Set<string>(['.']);
  if (opts.layout) {
    for (const i of indices) {
      const g = opts.layout.glyphs[i];
      if (g && g !== '.' && g !== '#' && g !== '=' && g !== ERASE_GLYPH && !/\s/.test(g) && !used.has(g)) { glyphOf.set(i, g); used.add(g); }
    }
  }
  if (opts.glyphPalette) {
    const ref = new Map<string, number>();
    for (const [k, hex] of Object.entries(opts.glyphPalette)) ref.set(normalizeHex(hex), Number(k));
    for (const i of indices) {
      if (glyphOf.has(i)) continue;
      const r = ref.get(normalizeHex(asset.palette[i]));
      const g = r !== undefined ? ASCII_GLYPHS[r] : undefined;
      if (g && !used.has(g)) { glyphOf.set(i, g); used.add(g); }
    }
  }
  const pool = [...ASCII_GLYPHS.slice(1), ...'$%&*+-/:;<>?@^_~|'].filter(g => !used.has(g));
  for (const i of indices) {
    if (glyphOf.has(i)) continue;
    const preferred = ASCII_GLYPHS[i];
    const g = preferred && !used.has(preferred) ? preferred : pool.find(p => !used.has(p));
    if (!g) throw new Error(`too many colors for text (${indices.length})`);
    glyphOf.set(i, g); used.add(g);
  }

  const out: string[] = [];
  out.push(`id: ${asset.id}`);
  out.push(`name: ${headerValue(asset.name ?? asset.id)}`);
  out.push(`category: ${asset.category ?? 'prop'}`);
  out.push(`size: ${width}x${height}`);
  for (const d of (asset.description ?? '').split('\n')) if (asset.description) out.push(`description: ${d}`);
  if (opts.layout?.fit) out.push(`fit: ${opts.layout.fit}`);
  if (asset.generatedBy) out.push(`generated_by: ${formatGeneratedBy(asset.generatedBy)}`);
  if (opts.layout?.retouchOf) out.push(`retouch_of: ${opts.layout.retouchOf}`);
  if (opts.layout?.anchor) out.push(`anchor: ${opts.layout.anchor.join(',')}`);
  for (const [key, value] of opts.layout?.font ?? []) out.push(`${key}: ${value}`);
  // With a layout, an animation without options keeps its "anim:" line only if
  // it had one or if leaving it out would change the order fromAscii reads back
  // (declared ones first, then the rest by first appearance in the frames).
  const anims = asset.animations;
  let withLine = anims.length;
  if (opts.layout) {
    const declared = new Set(opts.layout.declared);
    const bare = (a: SpriteAsset['animations'][number]) => !declared.has(a.name) && a.frameIndices.length > 0 &&
      a.fps === undefined && !a.durations && a.loop === undefined && (a.label === undefined || a.label === a.name.toUpperCase());
    const first = (a: SpriteAsset['animations'][number]) => Math.min(...a.frameIndices);
    while (withLine > 0 && bare(anims[withLine - 1]) &&
      (withLine === anims.length || first(anims[withLine - 1]) <= first(anims[withLine]))) withLine--;
  }
  for (const a of anims.slice(0, withLine)) {
    const words = [a.name];
    if (a.fps !== undefined) words.push(`fps=${a.fps}`);
    if (a.durations) words.push(`durations=${a.durations.join(',')}`);
    if (a.loop !== undefined) words.push(`loop=${a.loop}`);
    if (a.label !== undefined && a.label !== a.name.toUpperCase()) {
      if (/\s/.test(a.label)) throw new Error(`animation label "${a.label}" has spaces; the text format cannot hold it`);
      words.push(`label=${a.label}`);
    }
    out.push(`anim: ${words.join(' ')}`);
  }
  out.push('');
  for (const i of indices) {
    const name = asset.colorNames?.[i];
    const shown = name && name !== `color ${i}` ? ` ${headerValue(name)}` : '';
    out.push(`${glyphOf.get(i)} = ${normalizeHex(asset.palette[i])}${shown}`);
  }

  // Slots per frame, in animation order.
  const slots = new Map<number, string[]>();
  for (const a of asset.animations) {
    a.frameIndices.forEach((f, pos) => {
      if (!slots.has(f)) slots.set(f, []);
      slots.get(f)!.push(`${a.name} ${pos}`);
    });
  }

  const layers = (asset.layers ?? []).filter(l => l.frames.length > 0);
  const flattened = layers.length > 1;
  for (let f = 0; f < frameCount(asset); f++) {
    out.push('');
    out.push(`== ${(slots.get(f) ?? []).join(', ')}`.trimEnd());
    const grid = blankFrame(width, height);
    for (const layer of layers) {
      const src = layer.frames[f];
      if (!src) continue;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (src[y]?.[x]) grid[y][x] = src[y][x];
    }
    for (const row of grid) {
      out.push(row.map(v => {
        if (v === ERASE) return ERASE_GLYPH;
        if (!v) return '.';
        const g = glyphOf.get(v);
        if (!g) throw new Error(`frame ${f} uses index ${v}, which is not in the palette`);
        return g;
      }).join(''));
    }
  }
  return { text: out.join('\n') + '\n', flattened };
}

