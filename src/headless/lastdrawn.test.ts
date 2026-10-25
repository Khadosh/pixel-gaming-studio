import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePng } from './png';
import { writeGuarded } from './guard';
import { lastDrawnPath, noteDrawn } from './lastdrawn';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'pgs-lastdrawn-'));
}

describe('the last drawing (estudio#358)', () => {
  it('writePng leaves the absolute path of the PNG it wrote', () => {
    const d = scratch();
    const note = join(d, 'nota', 'last.json');
    const prev = process.env.PGS_LAST_DRAWN;
    process.env.PGS_LAST_DRAWN = note;
    try {
      const png = join(d, 'out', 'cosa.png');
      writePng(png, { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) });
      const n = JSON.parse(readFileSync(note, 'utf8'));
      expect(n.png).toBe(png);
      expect(typeof n.t).toBe('number');
      // writeGuarded (the text drawings' PNGs) too, and the newest wins
      const otro = join(d, 'out', 'otro.png');
      writeGuarded(otro, new Uint8Array([0]));
      expect(JSON.parse(readFileSync(note, 'utf8')).png).toBe(otro);
      // what is not a PNG does not count
      writeGuarded(join(d, 'out', 'dibujo.pss.json'), '{}');
      expect(JSON.parse(readFileSync(note, 'utf8')).png).toBe(otro);
    } finally {
      if (prev === undefined) delete process.env.PGS_LAST_DRAWN;
      else process.env.PGS_LAST_DRAWN = prev;
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('goes to ~/.pgs by default, is off under vitest unless asked, and "0" turns it off', () => {
    expect(lastDrawnPath({ HOME: '/h' })).toMatch(/\.pgs\/last_drawn\.json$/);
    expect(lastDrawnPath({ VITEST: 'true' })).toBeNull();
    expect(lastDrawnPath({ VITEST: 'true', PGS_LAST_DRAWN: '/x.json' })).toBe('/x.json');
    expect(lastDrawnPath({ PGS_LAST_DRAWN: '0' })).toBeNull();
  });

  it('never throws, and leaves no half-written file', () => {
    const d = scratch();
    try {
      // a note path inside a file: cannot be written, the drawing goes on
      const blocker = join(d, 'blocker');
      writeFileSync(blocker, 'a file, not a folder');
      expect(() => noteDrawn(join(d, 'a.png'), { PGS_LAST_DRAWN: join(blocker, 'x.json') })).not.toThrow();
      const note = join(d, 'ok.json');
      noteDrawn(join(d, 'b.png'), { PGS_LAST_DRAWN: note });
      expect(existsSync(note)).toBe(true);
      expect(existsSync(`${note}.${process.pid}.tmp`)).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
