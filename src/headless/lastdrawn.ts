// The last drawing the engine put on disk (Khadosh/estudio#358): every PNG that
// goes through writePng or writeGuarded leaves its absolute path in one small
// file, so whoever wants to show "what PGS is drawing right now" (the studio's
// PGS machine shows it on its screen) reads that file instead of walking art
// folders. It changes on every step of a batch, not only at the end.
//
// Where: PGS_LAST_DRAWN if set ("0" turns it off), else ~/.pgs/last_drawn.json.
// Under vitest it is off unless PGS_LAST_DRAWN says where (tests don't touch
// the user's home). Never throws: a drawing must not fail because of this.

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export function lastDrawnPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const set = env.PGS_LAST_DRAWN;
  if (set === '0') return null;
  if (set) return set;
  if (env.VITEST) return null;
  return join(homedir(), '.pgs', 'last_drawn.json');
}

/** Records `png` as the last drawing: { png (absolute), t (ms), cwd }. */
export function noteDrawn(png: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!png.toLowerCase().endsWith('.png')) return;
  try {
    const file = lastDrawnPath(env);
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    // Written aside and renamed: a reader never sees half a file.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ png: resolve(png), t: Date.now(), cwd: process.cwd() }) + '\n');
    renameSync(tmp, file);
  } catch {
    // nothing: the drawing is already on disk
  }
}
