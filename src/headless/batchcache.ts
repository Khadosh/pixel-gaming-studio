// A store of what steps drew, shared between copies of a project: `batch stale=true cache=<folder>`
// (Khadosh/estudio#446).
//
// The fingerprints of `batch stale` (batchstale.ts) say, for every step, the
// hash of each file it read and of each file it wrote. A game that keeps its
// drawings out of git rebuilds them in every copy (every clone, every worktree
// of an agent): the studio's 1,792 steps are some 45 minutes. But the same step,
// with the same command and arguments, reading the same bytes, writes the same
// bytes: what one copy drew, another can take.
//
// So the cache keeps, for each step key, the prints of the last times it ran
// (newest first, a few) and, by hash, the files they wrote. Before a step that
// is out of date runs, the cache is asked for a print of its key whose reads,
// probes and listed folders are what the disk has now; if there is one, and
// every file it wrote is in the store with its hash, they are copied in place
// and the print is the step's, as if it had run. After the batch, what each
// step that ran wrote goes in.
//
// What it does not take: a step that writes a file another step of the batch
// writes too (a `new` and the `draw` on it). The print of the first holds the
// file as the last left it; put back, the second would paint on it again.
//
// Many copies share one folder at once: every file goes in through a temporary
// name and a rename, so a reader sees a whole file or none. Two writers of the
// same key may lose one of their prints: that is a miss later, not a wrong file.
// A file is checked against its hash when it is taken; one that does not match
// is removed and the step runs. A file taken is touched, so a game can prune
// what nobody took in a while by its date (the engine does not prune).

import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hashFile, type Fingerprints, type StepPrint } from './batchstale';
import type { PlannedStep } from './batch';

/** Prints kept per step: the last few ways it was drawn (a change, and back). */
export const PRINTS_PER_STEP = 4;

function writeWhole(file: string, data: Buffer | string): void {
  fs.mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function sameInputs(a: StepPrint, b: StepPrint): boolean {
  return JSON.stringify([a.reads, a.probes, a.dirs]) === JSON.stringify([b.reads, b.probes, b.dirs]);
}

export class DrawingCache {
  readonly dir: string;
  /** Steps taken from the cache in this batch. */
  taken = 0;
  /** Files put in the store after the batch. */
  stored = 0;

  constructor(dir: string) {
    this.dir = resolve(dir);
  }

  private printsFile(key: string): string {
    return join(this.dir, 'steps', key.slice(0, 2), `${key}.json`);
  }

  private blob(hash: string): string {
    return join(this.dir, 'files', hash.slice(0, 2), hash);
  }

  private prints(key: string): StepPrint[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.printsFile(key), 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  /**
   * The steps of a batch the cache may serve: what they write, nobody else in
   * the batch writes, and it is all inside the project.
   */
  servable(planned: PlannedStep[], book: Fingerprints): Set<number> {
    const writers = new Map<string, number>();
    const writes = new Map<number, string[]>();
    for (const s of planned) {
      // a step with no fingerprint here (a copy with none) writes what it wrote where the cache saw it,
      // not every file its arguments name: a pose names the base it reads, like every pose from it
      const seen = book.print(s) ? undefined : this.prints(book.keyOf(s))[0];
      const w = seen ? Object.keys(seen.writes) : book.mayWrite(s);
      writes.set(s.index, w);
      for (const f of w) writers.set(f, (writers.get(f) ?? 0) + 1);
    }
    const ok = new Set<number>();
    for (const s of planned) {
      const w = writes.get(s.index)!;
      if (w.length && w.every(f => writers.get(f) === 1 && !f.startsWith('/') && !f.startsWith('..'))) ok.add(s.index);
    }
    return ok;
  }

  /**
   * Puts in place what the step drew the last time it read what the disk has
   * now, and makes that print the step's. False if there is none (or a file of
   * it is gone or broken): the step runs.
   */
  take(step: PlannedStep, book: Fingerprints): boolean {
    const key = book.keyOf(step);
    for (const p of this.prints(key)) {
      if (!Object.keys(p.writes).length || !book.inputsMatch(p)) continue;
      const files: [string, Buffer][] = [];
      let whole = true;
      for (const [rel, h] of Object.entries(p.writes)) {
        const b = this.blob(h);
        let data: Buffer;
        try {
          data = fs.readFileSync(b);
        } catch {
          whole = false;
          break;
        }
        if (hashFile(b) !== h) {
          fs.rmSync(b, { force: true });
          whole = false;
          break;
        }
        files.push([book.abs(rel), data]);
      }
      if (!whole) continue;
      for (const [abs, data] of files) writeWhole(abs, data);
      const now = new Date();
      for (const h of Object.values(p.writes)) {
        try { fs.utimesSync(this.blob(h), now, now); } catch { /* pruned meanwhile: it was copied */ }
      }
      book.adopt(step, p);
      this.taken++;
      return true;
    }
    return false;
  }

  /** Stores what the steps that ran in this batch wrote, as the book has it after its last save. */
  storeDrawn(planned: PlannedStep[], book: Fingerprints): void {
    // judged again on what they wrote now: before, a step never run stood for every file it names
    const ok = this.servable(planned, book);
    const keys = new Set(planned.filter(s => ok.has(s.index)).map(s => book.keyOf(s)));
    for (const [key, print] of book.drawn()) if (keys.has(key)) this.store(key, print, book);
  }

  /**
   * A step up to date, not run: if the cache does not have it as it is, it
   * goes in. So a copy whose drawings are all there (one that has them in git,
   * or drew them) fills the cache with nothing drawn.
   */
  keep(step: PlannedStep, book: Fingerprints): void {
    const key = book.keyOf(step);
    const print = book.print(step);
    if (!print) return;
    const top = this.prints(key)[0];
    if (top && sameInputs(top, print) && JSON.stringify(top.writes) === JSON.stringify(print.writes)) return;
    this.store(key, print, book);
  }

  /** Puts a print and the files it wrote in the store; nothing if a file is not what the print says. */
  private store(key: string, print: StepPrint, book: Fingerprints): void {
    if (!Object.keys(print.writes).length) return;
    const files: [string, Buffer][] = [];
    for (const [rel, h] of Object.entries(print.writes)) {
      const b = this.blob(h);
      if (fs.existsSync(b) && hashFile(b) === h) continue;
      const abs = book.abs(rel);
      let data: Buffer;
      try {
        data = fs.readFileSync(abs);
      } catch {
        return;
      }
      if (hashFile(abs) !== h) return;
      files.push([b, data]);
    }
    for (const [b, data] of files) writeWhole(b, data);
    this.stored += files.length;
    const kept = [print, ...this.prints(key).filter(p => !sameInputs(p, print))].slice(0, PRINTS_PER_STEP);
    writeWhole(this.printsFile(key), JSON.stringify(kept));
  }
}
