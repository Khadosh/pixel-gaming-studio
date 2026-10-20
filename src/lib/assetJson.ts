// How an asset JSON (.pss.json) is written: the same JSON as
// `JSON.stringify(asset, null, 1)`, except that a list of plain numbers goes
// on one line. A frame is a list of rows, so each row of pixels is one line
// (`[0,0,3,3,0]`) instead of one number per line: a 370×270 layer goes from
// ~100,000 lines to 270. It is still JSON — whoever reads it with JSON.parse
// (the editor, every command, the game) gets the very same object — and the
// rest of the asset (palette, names, generated_by) reads as before.

/** Marks a list of numbers already written on one line, until the end. */
const MARK = '\u0000pgs-row:';
const MARKED = /"\\u0000pgs-row:([^"]*)"/g;

const isRow = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.length > 0 && v.every(n => typeof n === 'number' || n === null);

/** The text of an asset JSON as PGS writes it (no trailing newline). */
export function stringifyAsset(asset: unknown): string {
  const text = JSON.stringify(asset, (_key, value) => (isRow(value) ? MARK + JSON.stringify(value) : value), 1);
  return text.replace(MARKED, '$1');
}
