// A drawing made by hand that says it is a base: `base: protected`.
//
// The retouch layer (`<drawing>.retoque.txt`, see retouch.ts) used to protect
// only what a recipe generated, because the one thing that sent the editor's
// GUARDAR to the layer was the drawing carrying `generated_by:`. A drawing made
// by hand that someone else retouches — a cat a six-year-old paints a collar on
// — had no way to say so, and `to_ascii` wrote over it without a word.
//
// So the header says it, and says it **about the file**, not about who made
// it: `generated_by:` absent still means "drawn by hand". Two things follow,
// the same in the engine and in the editor:
//
//   1. what is painted over it goes to the retouch layer beside it, never into
//      the drawing (`retouchAside`): the base can change and the layer is laid
//      on the new one;
//   2. no command writes over the file (`guard.ts` looks at the **destination**
//      before writing, whatever command is writing), unless told `force`.
//
// It lives in the file and not in the asset on purpose, like `anchor:` and
// `retouch_of:`: what is derived from a base (a variant, an export) is not a
// base, so a `.pss.json` built from it does not carry the header on.
//
// No Node imports: the web editor uses it too.

import type { GeneratedBy } from '../lib/types';

/** The one value `base:` takes. */
export const PROTECTED_BASE = 'protected';

/**
 * Does this text drawing declare `base: protected`? Only the header is read
 * (everything before the first `==`), so it is cheap on any file — a
 * `.pss.json`, a PNG — and says no to what is not a drawing.
 */
export function peekProtectedBase(text: string): boolean {
  const head = text.trimStart();
  if (!head || head[0] === '{' || head[0] === '[') return false;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('==')) return false;
    const m = /^base:\s*(\S*)\s*$/.exec(line);
    if (m) return m[1] === PROTECTED_BASE;
  }
  return false;
}

/** Why a drawing takes its retouch as a layer apart: a recipe made it, or it is a declared base. */
export type AsideReason = 'generated' | 'base';

/**
 * The rule, one place for the engine and the editor: does the hand work over
 * this drawing go to `<drawing>.retoque.txt` instead of into the drawing?
 */
export function retouchAside(d: { generatedBy?: GeneratedBy; base?: string }): AsideReason | undefined {
  if (d.base === PROTECTED_BASE) return 'base';
  if (d.generatedBy) return 'generated';
  return undefined;
}

/** The refusal, in one line ready to print. */
export function protectedBaseWhy(name: string): string {
  return `${name} declares "base: ${PROTECTED_BASE}": it is not written over (what is painted on it goes to its .retoque.txt; to_ascii, map_export, font_compose and font_variant take force=true to overwrite it anyway)`;
}
