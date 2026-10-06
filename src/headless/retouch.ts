// The retouch layer: what a person paints over a drawing a recipe made.
//
// A drawing with a `generated_by:` header is the output of a command and that
// command will write over it again, so a retouch must not live inside it. It
// lives in its own file beside it — `<drawing>.retoque.txt`, a `retouch_of:`
// overlay in the from_ascii format — and is laid back on top on a layer of its
// own (what `variant` already does), so running the recipe again keeps it.
//
// **The layer wins over the recipe.** It can say three things, not two: leave
// what was there (`.`), paint this color, and take this pixel out (`!`). What
// the editor shows is what the drawing ends up being; the recipe stays the
// source of the base and can be run again, and the file it writes is never
// touched. What that costs is measured and said out loud — see `divergence.ts`.
//
// Three halves, then: finding and applying a retouch, saying how much of the
// drawing it is covering, and looking at what a command is about to overwrite so
// it can say "this was drawn by hand" instead of pisarlo callado.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import type { GeneratedBy, SpriteAsset } from '../lib/types';
import { formatGeneratedBy, fromAscii, peekGeneratedBy, sameGeneratedBy } from './ascii';
import { coverageLine, divergenceSource, divergenceWarning, type RetouchCoverage } from './divergence';
import { makeVariant } from './variant';

export const RETOUCH_SUFFIX = '.retoque.txt';

/**
 * A path as it goes into a `generated_by:`: relative to the file that carries
 * the header, so the two travel together (the drawing and its recipe, the
 * variant and its base).
 */
export function relTo(carrier: string, path: string): string {
  const rel = relative(dirname(resolve(carrier)), resolve(path)).split('\\').join('/');
  if (!rel) return basename(path);
  // When the two files are nowhere near each other — an export into a temp
  // folder — "../../../../../.." says nothing useful and they are not going to
  // travel together anyway: the path as it was given is at least readable.
  return rel.split('/').filter(s => s === '..').length > 4 ? path.split('\\').join('/') : rel;
}

/**
 * The `generated_by:` of something a command just wrote: the command and the
 * arguments to make it again.
 *
 * One line per command, on purpose — and the absence of the header is what says
 * "drawn by hand", so a command that only **changes** an asset (draw, palette,
 * despeckle, stamp) must not call this: it would claim the whole drawing. The
 * same goes for `from_ascii` and `to_ascii`, which carry whatever the drawing
 * they were handed already said.
 *
 * Arguments with no value are left out, and so is any value with a space in it:
 * the text format cannot hold one, and a file in a folder with a space in its
 * name is no reason to fail to write the drawing. What matters most is the
 * command name, which is always there.
 */
export function madeBy(by: string, args: Record<string, string | number | boolean | undefined> = {}): GeneratedBy {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null || v === '') continue;
    const s = String(v);
    if (/\s/.test(s)) continue;
    out[k] = s;
  }
  return { by, args: out };
}

/** `suelos/camino.txt` → `suelos/camino.retoque.txt`. */
export function retouchPathOf(drawing: string): string {
  return drawing.replace(/\.txt$/i, '') + RETOUCH_SUFFIX;
}

/** Is this the retouch of another drawing rather than a drawing of its own? */
export function isRetouchPath(path: string): boolean {
  return path.toLowerCase().endsWith(RETOUCH_SUFFIX);
}

/** The layer a retouch lands on. */
export const RETOUCH_LAYER = 'retoque';

export interface AppliedRetouch extends RetouchCoverage {
  /** The retouch file. */
  file: string;
  /**
   * The warning, when the layer decides more of the drawing than
   * `DIVERGENCE_LIMIT`: the corrections belong in the recipe. Never a refusal.
   */
  warning?: string;
}

/** `camino.retoque.txt: 147 px pintados, 12 borrados · 23% del dibujo lo decide la capa`. */
export function retouchLine(r: AppliedRetouch): string {
  return `${basename(r.file)}: ${coverageLine(r)}`;
}

export interface RetouchResult {
  asset: SpriteAsset;
  retouch?: AppliedRetouch;
}

/**
 * The retouch of `drawing` (if the file is there) laid over `asset` on its own
 * layer. The file on disk is never touched, so this can run again after the
 * recipe changes the base. Returns the asset as it was when there is none.
 *
 * The layer wins over the recipe: where it says `!` the pixel comes out, so
 * what the editor showed is what the drawing ends up being. What that costs is
 * measured on the way out (`share`, `warning`): past
 * `DIVERGENCE_LIMIT` the recipe no longer generates the drawing and the
 * corrections belong in it.
 */
export function applyRetouch(asset: SpriteAsset, drawing: string): RetouchResult {
  const file = retouchPathOf(drawing);
  if (!existsSync(file)) return { asset };
  const text = readFileSync(file, 'utf8');
  const { retouchOf } = fromAscii(text, { sourcePath: file });
  if (!retouchOf) {
    throw new Error(`${basename(file)}: a retouch needs a "retouch_of:" header naming the drawing it belongs to`);
  }
  const { asset: out, ...coverage } = makeVariant(asset, {
    id: asset.id,
    name: asset.name,
    layer: RETOUCH_LAYER,
    overlay: text,
    overlaySource: file,
  });
  out.generatedBy = asset.generatedBy;
  const warning = divergenceWarning(coverage, divergenceSource(asset.generatedBy?.args));
  return { asset: out, retouch: { file, ...coverage, ...(warning ? { warning } : {}) } };
}

export interface OverwriteCheck {
  path: string;
  /** Can this command write over the file without destroying someone's work? */
  ok: boolean;
  /** When it cannot: why, in one line, ready to print. */
  why?: string;
  /** What the file on disk says made it (absent when it says nothing). */
  had?: GeneratedBy;
}

/**
 * Looks at a text drawing before writing over it. A file that is not there, or
 * that says it was made by the very same command and arguments, is fair game.
 * A file with no `generated_by:` was drawn by hand, and one with a different
 * `generated_by:` belongs to another recipe: both say no, and the caller either
 * stops or is told to force it.
 */
export function checkOverwrite(path: string, by: GeneratedBy): OverwriteCheck {
  if (!existsSync(path)) return { path, ok: true };
  let had: GeneratedBy | undefined;
  try {
    had = peekGeneratedBy(readFileSync(path, 'utf8'));
  } catch (err) {
    return { path, ok: false, why: `${basename(path)} cannot be read to see what made it: ${(err as Error).message}` };
  }
  if (!had) {
    return {
      path,
      ok: false,
      why: `${basename(path)} does not say what made it, so it was drawn by hand: writing it would lose that drawing (force to overwrite it anyway)`,
    };
  }
  if (!sameGeneratedBy(had, by)) {
    return {
      path,
      ok: false,
      had,
      why: `${basename(path)} was made by "${formatGeneratedBy(had)}", not by "${formatGeneratedBy(by)}" (force to overwrite it anyway)`,
    };
  }
  return { path, ok: true, had };
}
