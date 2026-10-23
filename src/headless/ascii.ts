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
//   base: protected                drawn by hand and retouched by someone else:
//                                  what is painted over it goes to its
//                                  .retoque.txt and no command writes over it
//                                  (see protectedbase.ts)
//   anchor: 5,11                   the pixel that sits on the ground: whoever
//                                  places the drawing somewhere puts THIS pixel
//                                  there, not the top-left corner. Without it a
//                                  lantern floats or is buried.
//   footprint: ##/#o               the cells of the map it takes, rows top to
//                                  bottom split by "/": "#" takes the cell and
//                                  blocks the way, "o" takes it and lets you
//                                  walk (under a banner), "." is not its own.
//                                  The bottom-left cell is the one the anchor
//                                  stands on. Default: the anchor's cell, "#".
//   tags: farol, mercado           free words to ask for it without its name
//                                  (a recipe asks for "faroles", not "farol_3")
//   font: cell=8x10 baseline=8     this drawing is a glyph sheet: see font.ts.
//   glyphs: ABCDEFGH               The four font keys are carried through as
//   advance: space=3 i=2           written (repeatable, leading spaces kept);
//   kern: AV=-1                    only `font.ts` understands them.
//   anim: idle fps=6 loop=true     animation options, in order (fps=, durations=
//                                  700,500, loop=true|false, label=)
//   k = #15120f tinta              legend: glyph = hex [color name]; the order
//   p = #c2bdb5 piedra             is the palette order. "." is transparent,
//   n = noche                      and "!" is reserved (see ERASE_GLYPH). A
//                                  name alone is the color of that name in the
//                                  palette (paletteNames: fit, or the world's).
//
//   == idle 0, attack 1            a frame: the slots it fills ("<anim> <pos>",
//   ..kk..                         pos optional = next free), "==" alone for a
//   .kppk.                         frame outside every animation. Then its rows.
//
//   == *_right                     only in a retouch: one frame that holds for
//                                  many of the drawing underneath — "*" every
//                                  frame, "*_right" every frame of every anim
//                                  whose name matches (see framescope.ts). Not
//                                  counted among the frames; laid first, so a
//                                  frame of its own paints over it.
//
//   == blink 1 < blink 0           a frame that comes from another one above
//   half: left                     (by slot, "< blink" for its first frame, or
//   shift: 1,0                     "< 3", the frame number): only what changes.
//   flip: h                        "flip: h|v" mirrors it, then "shift: dx,dy"
//   9: ..kk                        moves it, then "N: <row>" replaces row N.
//
//   == idle_down 0                 "half: left", first thing in any frame: its
//   half: left                     rows are the left half (the middle column
//   ..kk                           too when the width is odd) and the right one
//                                  is their mirror. A row has no spaces; the
//                                  lines of a frame that do are these.
//
//   anim: walk_left mirror_of=walk_right
//                                  a whole animation that is another one
//                                  flipped left to right: no frames of its own,
//                                  its frames go after the ones written, and it
//                                  takes the other's options unless given.
//                                  (Khadosh/pixel-gaming-studio#27, framederive.ts)
//
// Frames are numbered in the order they appear. Every problem of the rows
// (length, count, glyph) is said at once, not the first one only.
//
// No Node imports here: the web editor opens and saves these files too.
// `fromAscii` also returns the text's layout (the glyph of each color, which
// animations had an "anim:" line, the "fit:" header) and `toAscii` honors it,
// so a drawing read and written back is the same text.

import type { Frame, GeneratedBy, SpriteAsset } from '../lib/types';
import { blankFrame, createAsset, dims, frameCount, normalizeHex, onPalette, setAnimation } from './assetModel';
import { PROTECTED_BASE } from './protectedbase';
import { isScope } from './framescope';
import { derivedBase, halfWidth, mirrorHalf, sameFrame, sameRow, symmetricRow, flipFrame, type FrameDerivation } from './framederive';

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
  /** The "footprint:" header as rows of cells, top to bottom ("#" blocks, "o" walkable, "." not its own). */
  footprint?: string[];
  /** The "tags:" header: free words a recipe asks for the object by. */
  tags?: string[];
  /**
   * The "base:" header (only `protected`): a hand-made drawing whose retouch
   * goes to a layer apart and that no command writes over (protectedbase.ts).
   * A property of the file, so it lives here and not in the asset.
   */
  base?: typeof PROTECTED_BASE;
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
  /**
   * The frames that came from another (`== blink 1 < blink 0`), by frame
   * index: `toAscii` writes them the same way again, listing the rows that
   * differ from where they come from — measured on the pixels, so a frame
   * touched in the editor keeps the form and says what changed (framederive.ts).
   */
  derived?: Record<number, FrameDerivation>;
  /** Frames written by their left half (`half: left`): written so again while they stay symmetric. */
  half?: number[];
  /** Animations that were another one mirrored (`mirror_of=`): animation → the one it mirrors. */
  mirrors?: Record<string, string>;
}

export interface ParsedAscii {
  asset: SpriteAsset;
  /** Path of the "fit" header resolved against the source file, if any. */
  fit?: string;
  /** Path of the "retouch_of" header resolved against the source file, if any. */
  retouchOf?: string;
  /** The "anchor:" header: [x, y] px of the pixel that sits where the drawing is placed. */
  anchor?: [number, number];
  /** The "footprint:" header as rows of cells, top to bottom; its bottom-left cell is the anchor's. */
  footprint?: string[];
  /** The "tags:" header. */
  tags?: string[];
  layout: AsciiLayout;
  /**
   * The frames of a retouch that hold for many frames of the drawing underneath
   * (`== *`, `== *_right`), in the order written, with the same palette indices
   * as the asset. They are not in the asset's frames: whoever lays the retouch
   * finds which frames each one names (`framesOfScope`).
   */
  scoped: ScopedFrame[];
  /** A name written after a hex that is not that color's name in the palette (only with paletteNames). */
  warnings?: string[];
}

/** A retouch frame that names the frames it holds for instead of being one. */
export interface ScopedFrame {
  /** `*` or a pattern over animation names, `*_right`. */
  pattern: string;
  grid: Frame;
}

export interface FromAsciiOptions {
  /** Where the text came from: names errors and resolves a relative "fit:". */
  sourcePath?: string;
  /** Id to use when the header has none. */
  defaultId?: string;
  /**
   * The palette a legend may name its colors from (`o = noche`): color name →
   * hex. Called at most once, with the "fit:" header resolved (if any), and
   * only when a legend entry needs it. Whoever has files at hand passes it (the
   * from_ascii command: fit=, "fit:" or the world's palette); without it a name
   * is not a color. Given, it also checks the names written after a hex.
   */
  paletteNames?: (fit?: string) => { names: Record<string, string>; label: string } | undefined;
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
        fail(where, `unknown anim option "${key}" (fps, durations, loop, label, mirror_of)`);
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
  /** Set on a retouch frame that holds for many (`== *_right`). */
  scope?: string;
  slots: { anim: string; pos?: number }[];
  rows: { line: number; text: string }[];
  /** `== x 1 < x 0`: the frame it comes from, as written and as read. */
  from?: { text: string; anim?: string; pos?: number; index?: number };
  /** `half: left`: its rows are the left half, the right one is their mirror. */
  half?: boolean;
  flip?: 'h' | 'v';
  shift?: [number, number];
  /** The numbered rows of a frame that comes from another ("N: …"). */
  edits: { line: number; y: number; text: string }[];
}

/** What a line inside a frame can be besides a row: rows have no spaces, these do. */
const FRAME_LINES = '"N: <row>", "flip: h|v" and "shift: dx,dy" in a frame that comes from another ("== walk 1 < walk 0"), and "half: left" first thing in any frame';

/** At most this many problems of rows are listed at once; the rest are counted. */
const MAX_PROBLEMS = 30;

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
  const mirrorOf = new Map<string, { of: string; line: number }>();
  let comments = 0;
  let generatedBy: GeneratedBy | undefined;
  const beside = (rel: string) => (opts.sourcePath ? resolveBeside(opts.sourcePath, rel) : rel);
  let palette: { names: Record<string, string>; label: string } | undefined | null = null;
  const paletteNames = () => {
    if (palette === null) palette = opts.paletteNames?.(header.fit ? beside(header.fit) : undefined);
    return palette;
  };
  const hexNamed = new Map<string, [string, string]>();

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    const n = i + 1;
    const where = `${src}:${n}`;
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) return;
    if (line.trimStart().startsWith('#')) { comments++; return; }

    if (line.startsWith('==')) {
      const whole = line.slice(2).trim();
      const lt = whole.indexOf('<');
      const rest = lt < 0 ? whole : whole.slice(0, lt).trim();
      if (isScope(rest)) {
        if (lt >= 0) fail(where, `"== ${rest}" holds for many frames and cannot come from another ("<")`);
        if (!header.retouch_of) {
          fail(where, `"== ${rest}" holds for many frames of the drawing underneath, which only means something in a retouch: add a "retouch_of:" header`);
        }
        if (/[\s,]/.test(rest)) fail(where, `a frame that holds for many names them with one pattern ("== *", "== *_right"), got "${rest}"`);
        frames.push({ line: n, scope: rest, slots: [], rows: [], edits: [] });
        return;
      }
      const slots = rest === '' || rest === '-' ? [] : rest.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        if (parts.length > 2 || !parts[0]) fail(where, `frame slot must be "<anim> [pos]", got "${s.trim()}"`);
        if (parts.length === 1) return { anim: parts[0] };
        const pos = Number(parts[1]);
        if (!Number.isInteger(pos) || pos < 0) fail(where, `frame position must be a whole number, got "${parts[1]}"`);
        return { anim: parts[0], pos };
      });
      let from: RawFrame['from'];
      if (lt >= 0) {
        // `< walk 0`, `< walk` (its first frame) or `< 3` (the fourth frame written).
        const ref = whole.slice(lt + 1).trim();
        const parts = ref.split(/\s+/);
        if (!ref || parts.length > 2) fail(where, `"<" names the frame this one comes from: "< <anim> [pos]" or "< <frame number>", got "< ${ref}"`);
        if (parts.length === 1 && /^\d+$/.test(parts[0])) from = { text: ref, index: Number(parts[0]) };
        else {
          const pos = parts.length === 2 ? Number(parts[1]) : 0;
          if (!Number.isInteger(pos) || pos < 0) fail(where, `frame position must be a whole number, got "${parts[1]}"`);
          from = { text: ref, anim: parts[0], pos };
        }
      }
      frames.push({ line: n, slots, rows: [], edits: [], ...(from ? { from } : {}) });
      return;
    }

    if (frames.length > 0) {
      const f = frames[frames.length - 1];
      const t = line.trim();
      // A row has no spaces; a line with one says how the frame is written.
      if (!/\s/.test(t)) {
        if (f.from) fail(where, `a frame that comes from another ("< ${f.from.text}") lists only the rows that change, each with its number: "N: ${t}"`);
        f.rows.push({ line: n, text: t });
        return;
      }
      const row = /^(\d+):\s+(\S+)$/.exec(t);
      const kv = /^([a-z]+):\s*(.*)$/.exec(t);
      if (row) {
        if (!f.from) fail(where, `a numbered row ("${row[1]}: …") only goes in a frame that comes from another ("== walk 1 < walk 0"); here write the rows in order, without numbers`);
        f.edits.push({ line: n, y: Number(row[1]), text: row[2] });
        return;
      }
      if (kv && kv[1] === 'half') {
        if (kv[2] !== 'left') fail(where, `half can only be "left" (the rows are the left half, the right one is their mirror), got "${kv[2]}"`);
        if (f.half) fail(where, '"half: left" given twice in this frame');
        if (f.rows.length || f.edits.length || f.flip || f.shift) fail(where, '"half: left" goes first in the frame, before its rows');
        f.half = true;
        return;
      }
      if (kv && kv[1] === 'flip') {
        if (!f.from) fail(where, `"flip:" only goes in a frame that comes from another ("== walk_left 0 < walk_right 0"): it mirrors that one`);
        if (kv[2] !== 'h' && kv[2] !== 'v') fail(where, `flip is "h" (left to right) or "v" (upside down), got "${kv[2]}"`);
        if (f.flip) fail(where, '"flip:" given twice in this frame');
        f.flip = kv[2];
        return;
      }
      if (kv && kv[1] === 'shift') {
        if (!f.from) fail(where, `"shift:" only goes in a frame that comes from another ("== hide 1 < hide 0"): it moves that one`);
        const m = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(kv[2]);
        if (!m) fail(where, `shift is "dx,dy" in whole pixels (x to the right, y down), got "${kv[2]}"`);
        if (f.shift) fail(where, '"shift:" given twice in this frame');
        f.shift = [Number(m[1]), Number(m[2])];
        return;
      }
      fail(where, `cannot read "${t}" in a frame: a row has no spaces, and the lines with one are ${FRAME_LINES}`);
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
        const mirror = words.filter(w => w.startsWith('mirror_of='));
        if (mirror.length > 1) fail(where, `anim "${name}": mirror_of given twice`);
        if (mirror.length) {
          const of = mirror[0].slice('mirror_of='.length);
          if (!of) fail(where, `anim "${name}": mirror_of names the animation it is the mirror of (mirror_of=walk_right)`);
          if (of === name) fail(where, `anim "${name}" cannot be the mirror of itself`);
          mirrorOf.set(name, { of, line: n });
        }
        animOrder.push(name);
        animOpts.set(name, parseAnimOptions(where, words.filter(w => !w.startsWith('mirror_of='))));
        return;
      }
      if (!['id', 'name', 'category', 'size', 'width', 'height', 'fit', 'generated_by', 'retouch_of', 'anchor', 'footprint', 'tags', 'base'].includes(key)) {
        fail(where, `unknown header key "${key}" (id, name, category, size, width, height, description, fit, generated_by, retouch_of, anchor, footprint, tags, base, anim, ${FONT_KEYS.join(', ')})`);
      }
      if (key === 'base' && value.trim() !== PROTECTED_BASE) {
        fail(where, `base can only be "${PROTECTED_BASE}" (this drawing is a base: its retouch goes apart and nothing writes over it), got "${value.trim()}"`);
      }
      if (key in header) fail(where, `header "${key}" given twice`);
      header[key] = value.trim();
      return;
    }

    const leg = /^(\S)\s*=\s*(\S+)(?:\s+(.*))?$/.exec(line.trim());
    if (leg) {
      const [, glyph, word, label] = leg;
      let hex = word, name = label;
      if (!HEX.test(word)) {
        // A color by its name in the palette (Bichos 2, #33): the hex is the palette's.
        const pal = paletteNames();
        if (!pal) fail(where, `legend "${glyph}": "${word}" is not a hex color, and a color name needs a palette to look it up in (fit: in the header, or visual.palette in pgs.json)`);
        const found = pal.names[word] ?? Object.entries(pal.names).find(([n]) => n.toLowerCase() === word.toLowerCase())?.[1];
        if (!found) {
          const some = Object.keys(pal.names);
          fail(where, `legend "${glyph}": "${word}" is neither a hex color nor a color of ${pal.label} (${some.slice(0, 12).join(', ')}${some.length > 12 ? `, … ${some.length - 12} more` : ''})`);
        }
        hex = found;
        name = label ?? word;
      } else if (label) hexNamed.set(glyph, [normalizeHex(word), label.trim()]);
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
  // The size comes from the first frame written whole: a half or a frame that
  // comes from another does not say how wide the drawing is.
  const first = frames.find(f => !f.from && !f.half);
  if (width === undefined || height === undefined) {
    if (!first) fail(src, 'every frame is written by halves or comes from another, so the drawing does not say its size: add "size: WxH" to the header');
    if (first.rows.length === 0) fail(`${src}:${first.line}`, 'frame has no rows');
  }
  width ??= first!.rows[0].text.length;
  height ??= first!.rows.length;
  const W = width, H = height;

  // Slots before pixels: a frame that comes from "< walk 2" has to know which
  // frame that is. Frames are numbered among those of the drawing (not the
  // ones that hold for many).
  const ownIndex = new Map<RawFrame, number>();
  frames.filter(f => !f.scope).forEach((f, i) => ownIndex.set(f, i));
  const slotsByAnim = new Map<string, Map<number, number>>();
  for (const f of frames) {
    if (f.scope) continue;
    for (const s of f.slots) {
      if (!slotsByAnim.has(s.anim)) slotsByAnim.set(s.anim, new Map());
      const m = slotsByAnim.get(s.anim)!;
      const pos = s.pos ?? (m.size === 0 ? 0 : Math.max(...m.keys()) + 1);
      if (m.has(pos)) fail(`${src}:${f.line}`, `${s.anim} ${pos} is already frame ${m.get(pos)}`);
      m.set(pos, ownIndex.get(f)!);
      if (!animOpts.has(s.anim)) { animOpts.set(s.anim, {}); animOrder.push(s.anim); }
    }
  }

  // Pixels. The problems of rows (lengths, counts, glyphs) are gathered and
  // said all at once: with the same row copied into six frames, stopping at the
  // first one meant running it six times (Gato 3, #27).
  const glyphIndex = new Map<string, number>();
  [...legend.keys()].forEach((g, i) => glyphIndex.set(g, i + 1));
  const problems: string[] = [];
  const readRow = (text: string, line: number, fi: number, y: number, half: boolean): number[] | undefined => {
    const wide = half ? halfWidth(W) : W;
    if (text.length !== wide) {
      problems.push(`${src}:${line} (frame ${fi}, row ${y}): is ${text.length} wide, expected ${wide}${half ? ` (the left half of ${W}: "half: left")` : text.length === halfWidth(W) && W > 1 ? ' (a left half? say "half: left" first thing in the frame)' : ''}`);
      return undefined;
    }
    const out = new Array<number>(wide).fill(0);
    let ok = true;
    for (let x = 0; x < wide; x++) {
      const ch = text[x];
      if (ch === '.') continue;
      if (ch === ERASE_GLYPH) {
        if (!header.retouch_of) {
          fail(`${src}:${line} (frame ${fi}, row ${y}, col ${x})`,
            `"${ERASE_GLYPH}" takes the pixel underneath out, which only means something in a drawing laid over another: add a "retouch_of:" header naming the drawing this one retouches`);
        }
        out[x] = ERASE;
        continue;
      }
      const idx = glyphIndex.get(ch);
      if (idx === undefined) { problems.push(`${src}:${line} (frame ${fi}, row ${y}, col ${x}): glyph "${ch}" is not in the legend`); ok = false; continue; }
      out[x] = idx;
    }
    if (!ok) return undefined;
    return half ? mirrorHalf(out, W) : out;
  };

  const ownGrids: Frame[] = [];
  const scoped: ScopedFrame[] = [];
  const derived: Record<number, FrameDerivation> = {};
  const halves: number[] = [];
  frames.forEach((f, fi) => {
    const where = `${src}:${f.line} (frame ${fi})`;
    const me = ownIndex.get(f);
    let grid: Frame;
    if (f.from) {
      const ref = f.from;
      const from = ref.index !== undefined ? ref.index : slotsByAnim.get(ref.anim!)?.get(ref.pos!);
      if (from === undefined) {
        const anim = slotsByAnim.get(ref.anim!);
        fail(where, anim
          ? `comes from "${ref.text}", and ${ref.anim} has frames ${[...anim.keys()].sort((a, b) => a - b).join(', ')}`
          : `comes from "${ref.text}", and there is no animation "${ref.anim}" (${[...slotsByAnim.keys()].join(', ') || 'none yet'})`);
      }
      if (from >= me!) {
        fail(where, from === me
          ? `comes from "${ref.text}", which is this same frame`
          : `comes from "${ref.text}" (frame ${from}), which is written after it: a frame only comes from one above`);
      }
      grid = derivedBase(ownGrids[from], f);
      const seen = new Set<number>();
      for (const e of f.edits) {
        if (e.y >= H) { problems.push(`${src}:${e.line} (frame ${fi}): row ${e.y} is past the bottom (rows 0 to ${H - 1})`); continue; }
        if (seen.has(e.y)) { problems.push(`${src}:${e.line} (frame ${fi}): row ${e.y} given twice`); continue; }
        seen.add(e.y);
        const row = readRow(e.text, e.line, fi, e.y, !!f.half);
        if (row) grid[e.y] = row;
      }
      derived[me!] = { ref: ref.text, from, ...(f.flip ? { flip: f.flip } : {}), ...(f.shift ? { shift: f.shift } : {}), rows: f.edits.map(e => e.y) };
    } else {
      grid = blankFrame(W, H);
      if (f.rows.length !== H) problems.push(`${where}: has ${f.rows.length} rows, expected ${H}`);
      f.rows.slice(0, H).forEach((r, y) => {
        const row = readRow(r.text, r.line, fi, y, !!f.half);
        if (row) grid[y] = row;
      });
    }
    if (f.half && me !== undefined) halves.push(me);
    if (f.scope) scoped.push({ pattern: f.scope, grid });
    else ownGrids.push(grid);
  });
  if (problems.length === 1) throw new AsciiError(problems[0]);
  if (problems.length) {
    const shown = problems.slice(0, MAX_PROBLEMS);
    if (problems.length > MAX_PROBLEMS) shown.push(`… and ${problems.length - MAX_PROBLEMS} more`);
    throw new AsciiError(`${problems.length} problems in the rows of ${src}:\n${shown.join('\n')}`);
  }

  // An animation that is another one mirrored gets frames of its own, after the
  // ones written: the mirror of each frame of the other, in its order.
  const mirrors: Record<string, string> = {};
  const mirrorFrames = new Map<string, number[]>();
  for (const name of animOrder) {
    const m = mirrorOf.get(name);
    if (!m) continue;
    const where = `${src}:${m.line}`;
    if (slotsByAnim.has(name)) fail(where, `anim "${name}" is the mirror of ${m.of} and also has frames of its own ("== ${name} …"): one or the other (a frame of it that changes is a frame "< ${m.of} N" with "flip: h")`);
    if (mirrorOf.has(m.of)) fail(where, `anim "${name}" is the mirror of ${m.of}, which is itself a mirror (of ${mirrorOf.get(m.of)!.of}): name the animation that has the frames`);
    const src_ = slotsByAnim.get(m.of);
    if (!src_) fail(where, `anim "${name}" is the mirror of "${m.of}", and there is no such animation (${[...slotsByAnim.keys()].join(', ') || 'none'})`);
    const positions = [...src_.keys()].sort((a, b) => a - b);
    mirrorFrames.set(name, positions.map(p => {
      ownGrids.push(flipFrame(ownGrids[src_.get(p)!], 'h'));
      return ownGrids.length - 1;
    }));
    mirrors[name] = m.of;
  }

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
    frames: ownGrids.length,
    description: descriptions.join('\n'),
  });
  [...legend.keys()].forEach((g, i) => { if (names.has(g)) asset.colorNames[i + 1] = names.get(g)!; });
  if (generatedBy) asset.generatedBy = generatedBy;
  asset.layers![0].frames = ownGrids;

  for (const name of animOrder) {
    const mf = mirrorFrames.get(name);
    if (mf) {
      // The options of the one it mirrors, unless its own line says others.
      const o = { ...animOpts.get(mirrors[name])!, ...animOpts.get(name)! };
      if (o.durations && o.durations.length !== mf.length) {
        fail(src, `anim "${name}" has ${mf.length} frames (the ones of ${mirrors[name]}) but ${o.durations.length} durations`);
      }
      setAnimation(asset, { name, frameIndices: mf, ...o });
      continue;
    }
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

  const fit = header.fit ? beside(header.fit) : undefined;
  // A name after a hex is a label, free to be a role ("pelaje" for four tones),
  // but the name of ANOTHER color of the palette is a mistake and is said
  // (Bichos 2: "#1c1930 azul_claro" passed silently, #33). Compared without
  // the alpha: "#f4efe340 túnica luz" is that color, translucent.
  const warnings: string[] = [];
  const pal = hexNamed.size && opts.paletteNames ? paletteNames() : undefined;
  if (pal) {
    const rgb = (h: string) => normalizeHex(h).slice(0, 7);
    for (const [glyph, [h, n]] of hexNamed) {
      const named = pal.names[n];
      if (named !== undefined && rgb(named) !== rgb(h)) warnings.push(`legend "${glyph}": "${n}" is ${rgb(named)} in ${pal.label}, not ${h}`);
    }
  }
  const retouchOf = header.retouch_of ? beside(header.retouch_of) : undefined;
  if (header.base && header.retouch_of) {
    fail(src, `a retouch layer ("retouch_of:") cannot be a base ("base: ${PROTECTED_BASE}"): the base is the drawing it retouches`);
  }
  const base = header.base ? PROTECTED_BASE : undefined;
  let anchor: [number, number] | undefined;
  if (header.anchor !== undefined) {
    const m = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(header.anchor);
    if (!m) fail(src, `anchor must be "x,y" in px of the drawing, got "${header.anchor}"`);
    anchor = [Number(m[1]), Number(m[2])];
    if (anchor[0] < 0 || anchor[0] >= width || anchor[1] < 0 || anchor[1] >= height) {
      fail(src, `anchor ${anchor.join(',')} is outside the drawing (${width}x${height})`);
    }
  }
  let footprint: string[] | undefined;
  if (header.footprint !== undefined) {
    footprint = header.footprint.split('/').map(r => r.trim());
    if (footprint.some(r => !/^[#o.]+$/.test(r))) {
      fail(src, `footprint is rows of cells split by "/", each "#" (blocks), "o" (walkable) or "." (not its own), got "${header.footprint}"`);
    }
    if (new Set(footprint.map(r => r.length)).size > 1) fail(src, `footprint rows must be the same width, got "${header.footprint}"`);
    if (footprint.every(r => /^\.+$/.test(r))) fail(src, `footprint takes no cell ("${header.footprint}"): give at least one "#" or "o"`);
  }
  let tags: string[] | undefined;
  if (header.tags !== undefined) {
    tags = header.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (!tags.length) fail(src, 'tags is a list of words split by ","; this one is empty');
  }
  const glyphs: Record<number, string> = {};
  [...legend.keys()].forEach((g, i) => { glyphs[i + 1] = g; });
  const written: { id?: string; name?: string; category?: string } = {};
  if (header.id) written.id = header.id;
  if (header.name) written.name = header.name;
  if (header.category) written.category = header.category;
  return {
    asset, fit, retouchOf, anchor, scoped,
    ...(footprint ? { footprint } : {}), ...(tags ? { tags } : {}),
    ...(warnings.length ? { warnings } : {}),
    layout: {
      glyphs, declared, fit: header.fit, retouchOf: header.retouch_of, anchor,
      ...(footprint ? { footprint } : {}), ...(tags ? { tags } : {}),
      ...(base ? { base } : {}),
      font: fontLines.length ? fontLines : undefined,
      header: Object.keys(written).length ? written : undefined,
      comments,
      ...(Object.keys(derived).length ? { derived } : {}),
      ...(halves.length ? { half: halves } : {}),
      ...(Object.keys(mirrors).length ? { mirrors } : {}),
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
  /**
   * Frames of a retouch that hold for many (`== *_right`), written before the
   * asset's own frames, with the asset's palette indices. Needs
   * `layout.retouchOf`: only a retouch can say it.
   */
  scoped?: ScopedFrame[];
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
  if (opts.layout?.base) out.push(`base: ${opts.layout.base}`);
  if (opts.layout?.anchor) out.push(`anchor: ${opts.layout.anchor.join(',')}`);
  if (opts.layout?.footprint) out.push(`footprint: ${opts.layout.footprint.join('/')}`);
  if (opts.layout?.tags) out.push(`tags: ${opts.layout.tags.join(', ')}`);
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
  const plan = framePlan(asset, opts.layout);
  for (const a of anims.slice(0, withLine)) {
    const words = [a.name];
    // A mirror says only what it does not take from the one it mirrors.
    const of = plan.mirrorOf.get(a.name);
    const src = of ? anims.find(b => b.name === of) : undefined;
    const differs = (k: 'fps' | 'loop') => a[k] !== undefined && a[k] !== src?.[k];
    if (of) words.push(`mirror_of=${of}`);
    if (differs('fps')) words.push(`fps=${a.fps}`);
    if (a.durations && (!src || a.durations.join(',') !== src.durations?.join(','))) words.push(`durations=${a.durations.join(',')}`);
    if (differs('loop')) words.push(`loop=${a.loop}`);
    if (a.label !== undefined && a.label !== a.name.toUpperCase() && a.label !== src?.label) {
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

  const rowText = (row: number[], which: string) => row.map(v => {
    if (v === ERASE) return ERASE_GLYPH;
    if (!v) return '.';
    const g = glyphOf.get(v);
    if (!g) throw new Error(`${which} uses index ${v}, which is not in the palette`);
    return g;
  }).join('');
  const rowsOf = (grid: Frame, which: string) => { for (const row of grid) out.push(rowText(row, which)); };

  if (opts.scoped?.length && !opts.layout?.retouchOf) {
    throw new Error('only a retouch ("retouch_of:") has frames that hold for many');
  }
  for (const s of opts.scoped ?? []) {
    out.push('');
    out.push(`== ${s.pattern}`);
    rowsOf(s.grid, `"== ${s.pattern}"`);
  }

  const { grids, flattened } = plan;
  const half = new Set(opts.layout?.half ?? []);
  const halfOf = (row: number[]) => row.slice(0, halfWidth(width));
  // The number a frame gets when the text is read back: its place among the ones written.
  const written = new Map<number, number>();
  for (let f = 0; f < grids.length; f++) if (!plan.omitted.has(f)) written.set(f, written.size);
  for (let f = 0; f < grids.length; f++) {
    if (plan.omitted.has(f)) continue;
    const which = `frame ${f}`;
    const head = `== ${(slots.get(f) ?? []).join(', ')}`.trimEnd();
    out.push('');
    const d = plan.derived.get(f);
    if (d) {
      const base = derivedBase(grids[d.from], d);
      const listed = d.rows.filter((y, i) => y < height && d.rows.indexOf(y) === i);
      for (let y = 0; y < height; y++) if (!listed.includes(y) && !sameRow(base[y], grids[f][y])) listed.push(y);
      const byHalf = half.has(f) && listed.every(y => symmetricRow(grids[f][y]));
      out.push(`${head} < ${refText(asset, d, written)}`);
      if (byHalf) out.push('half: left');
      if (d.flip) out.push(`flip: ${d.flip}`);
      if (d.shift) out.push(`shift: ${d.shift.join(',')}`);
      for (const y of listed) out.push(`${y}: ${rowText(byHalf ? halfOf(grids[f][y]) : grids[f][y], which)}`);
      continue;
    }
    out.push(head);
    if (half.has(f) && grids[f].every(symmetricRow)) {
      out.push('half: left');
      for (const row of grids[f]) out.push(rowText(halfOf(row), which));
    } else rowsOf(grids[f], which);
  }
  return { text: out.join('\n') + '\n', flattened };
}

/** How the frames of an asset get written: whole, from another, or not at all (a mirror). */
interface FramePlan {
  grids: Frame[];
  flattened: boolean;
  /** Frames left out: they are an animation written as `mirror_of=`. */
  omitted: Set<number>;
  /** Animation → the one it mirrors, for the ones written as `mirror_of=`. */
  mirrorOf: Map<string, string>;
  derived: Map<number, FrameDerivation>;
}

/**
 * What the layout said about derived frames and mirrors, checked against the
 * asset as it is now (the editor may have touched any frame). A mirror stays
 * one only if its frames are still the last ones, in order, of that animation
 * alone, and still the mirror of the other's; one that drifted is written as
 * frames that come from the other mirrored, with the rows that changed. A
 * derivation stays as long as it still points to a frame above that is
 * written: its rows are measured on the pixels when written. Whatever the
 * plan, the pixels read back are the asset's.
 */
function framePlan(asset: SpriteAsset, layout?: AsciiLayout): FramePlan {
  const { width, height } = dims(asset);
  const layers = (asset.layers ?? []).filter(l => l.frames.length > 0);
  const grids: Frame[] = [];
  for (let f = 0; f < frameCount(asset); f++) {
    const grid = blankFrame(width, height);
    for (const layer of layers) {
      const src = layer.frames[f];
      if (!src) continue;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (src[y]?.[x]) grid[y][x] = src[y][x];
    }
    grids.push(grid);
  }
  const plan: FramePlan = { grids, flattened: layers.length > 1, omitted: new Set(), mirrorOf: new Map(), derived: new Map() };
  const uses = new Map<number, number>();
  for (const a of asset.animations) for (const f of a.frameIndices) uses.set(f, (uses.get(f) ?? 0) + 1);

  const mirrors = Object.entries(layout?.mirrors ?? {})
    .map(([name, of]) => ({ a: asset.animations.find(x => x.name === name), src: asset.animations.find(x => x.name === of) }))
    .filter(m => m.a && m.src && m.a.frameIndices.length === m.src.frameIndices.length && !layout!.mirrors![m.src.name])
    .sort((p, q) => asset.animations.indexOf(p.a!) - asset.animations.indexOf(q.a!));
  const tail = mirrors.flatMap(m => m.a!.frameIndices);
  const first = grids.length - tail.length;
  const inPlace = tail.every((f, i) => f === first + i && uses.get(f) === 1) &&
    mirrors.every(m => m.src!.frameIndices.every(f => f < first));
  if (inPlace) {
    for (const { a, src } of mirrors) {
      const same = a!.frameIndices.every((f, i) => sameFrame(grids[f], flipFrame(grids[src!.frameIndices[i]], 'h')));
      if (same) {
        plan.mirrorOf.set(a!.name, src!.name);
        for (const f of a!.frameIndices) plan.omitted.add(f);
      } else {
        a!.frameIndices.forEach((f, i) => plan.derived.set(f, { ref: `${src!.name} ${i}`, from: src!.frameIndices[i], flip: 'h', rows: [] }));
      }
    }
  }
  for (const [k, d] of Object.entries(layout?.derived ?? {})) {
    const f = Number(k);
    if (f < grids.length && d.from < f && !plan.omitted.has(f) && !plan.omitted.has(d.from) && !plan.derived.has(f)) plan.derived.set(f, d);
  }
  return plan;
}

/** The "<" of a derived frame: as it was written if it still names that frame, else its first slot, else its number. */
function refText(asset: SpriteAsset, d: FrameDerivation, written: Map<number, number>): string {
  const parts = d.ref.trim().split(/\s+/);
  if (parts.length === 1 && /^\d+$/.test(parts[0])) {
    if (written.get(d.from) === Number(parts[0])) return d.ref;
  } else {
    const pos = parts.length === 2 ? Number(parts[1]) : 0;
    if (asset.animations.find(a => a.name === parts[0])?.frameIndices[pos] === d.from) return d.ref;
  }
  for (const a of asset.animations) {
    const pos = a.frameIndices.indexOf(d.from);
    if (pos >= 0) return `${a.name} ${pos}`;
  }
  return String(written.get(d.from));
}

