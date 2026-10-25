// The guard of a protected base (protectedbase.ts), on the side that writes.
//
// It looks at the **destination**, not at who is writing: every command that
// puts a file on disk passes through here (saveAsset, writePng, the text
// drawings, the WAVs, the JSON), so a `base: protected` drawing cannot be
// overwritten by `to_ascii` today nor by a command nobody has written yet.

import { closeSync, existsSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { peekProtectedBase, protectedBaseWhy } from './protectedbase';
import { noteDrawn } from './lastdrawn';

/** The header of a drawing is at the top; nothing past this is read. */
const HEAD_BYTES = 64 * 1024;

function head(path: string): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Is the file at `path` a text drawing that declares `base: protected`? */
export function isProtectedBase(path: string): boolean {
  try {
    return existsSync(path) && peekProtectedBase(head(path));
  } catch {
    return false; // a folder, a file that cannot be read: not a drawing that can say so
  }
}

/** Throws when `path` is a protected base and `force` is not set. */
export function guardWrite(path: string, force = false): void {
  if (!force && isProtectedBase(path)) throw new Error(protectedBaseWhy(basename(path)));
}

/** `writeFileSync` behind the guard, creating the folder. */
export function writeGuarded(path: string, data: string | Uint8Array, force = false): void {
  guardWrite(path, force);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  noteDrawn(path);
}
