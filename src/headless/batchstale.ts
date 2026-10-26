// What of a recipe is out of date: `batch stale=true` (Khadosh/pixel-gaming-studio#53).
//
// A game rebuilds its art from recipes, and rebuilding everything takes minutes
// (the studio's 1,616 steps), so each game ended up writing a build system of
// its own around PGS: the studio's `art/huellas.json` with a Python script that
// guesses what a step reads (estudio#119), and a second one in its integrator
// (estudio#169). Guessing is what failed: furniture put in a room with `place`
// (estudio#250) and the base pose a pose is derived from (estudio#301) were
// read by the step and not by the guess, so a change to them rebuilt nothing.
// And a step with layers writes `<png>.<layer>.png`, not the `png` it names
// (estudio#80), so the guess of what it writes was wrong too.
//
// So the engine does not guess: while a step runs, every file it reads, every
// path it asks about and every folder it lists is noted, and so is every file
// it writes (`traceFs` below, on the `fs` functions themselves, so a command
// written tomorrow is covered with nobody remembering). What a step read is its
// fingerprint, kept in `pgs.huellas.json` beside the project's `pgs.json` (or
// `fingerprints=`): the hash of each file read, whether each path asked about
// existed, the names in each folder listed, and the hash of each file written.
//
// Next time, a step is **up to date**, and skipped, when it was run with the
// same command and arguments from the same folder, every file it read is the
// same, every path it asked about is still there or still not there, and every
// file it wrote is still what it wrote. Anything else and it runs, saying why.
// The check is done right before the step, so a step that reads what an earlier
// one rewrote sees the new bytes: and if the rewrite came out the same, it stays
// up to date (content, not dates).
//
// Two steps that write the same file (a `new` and the `draw` that paints on
// it) are one thing: if one runs, all of them run, from the first, or the
// second would paint over a canvas already painted.
//
// What does not count: the engine's own files (a new PGS does not make the art
// stale; run without `stale` to rebuild after an engine change) and the prose
// of `pgs.json` (`name`, `says`), which draws nothing.

import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findProject } from './project';
import { lastDrawnPath } from './lastdrawn';
import type { PlannedStep } from './batch';

/** The file the fingerprints go in, beside `pgs.json`. */
export const FINGERPRINTS_FILE = 'pgs.huellas.json';

/** Fields of `pgs.json` that draw nothing: a change to them makes nothing stale. */
const PROSE_FIELDS = ['name', 'says'];

/** What one step read and wrote the last time it ran. Paths relative to the fingerprints file. */
export interface StepPrint {
  command: string;
  /** Files read, by content hash. */
  reads: Record<string, string>;
  /** Paths asked about and not read: true if they were there. */
  probes: Record<string, boolean>;
  /** Folders listed, by a hash of their names. */
  dirs: Record<string, string>;
  /** Files written, by content hash. */
  writes: Record<string, string>;
}

export interface FingerprintBook {
  version: 1;
  steps: Record<string, StepPrint>;
}

/** What `traceFs` saw while a function ran: absolute paths. */
export interface FsTrace {
  reads: Set<string>;
  probes: Set<string>;
  dirs: Set<string>;
  writes: Set<string>;
}

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENGINE_SRC = join(ENGINE, 'src') + sep;

/** The engine's own files and its dependencies: never an input of a drawing. */
function isEngine(abs: string): boolean {
  return abs.startsWith(ENGINE_SRC) || abs.includes(`${sep}node_modules${sep}`);
}

function pathOf(p: unknown): string | null {
  if (typeof p === 'string') return resolve(p);
  if (p instanceof URL) return p.protocol === 'file:' ? fileURLToPath(p) : null;
  if (Buffer.isBuffer(p)) return resolve(p.toString());
  return null; // a file descriptor: already opened, by a path we saw
}

type FsFns = Record<string, (...args: unknown[]) => unknown>;

/**
 * Runs `fn` noting every file it reads, asks about, lists and writes through
 * `node:fs`. The functions are swapped on the module itself (and the named
 * imports synced to it), so every command is covered without being told. Only
 * one trace at a time: a batch runs its steps one after the other.
 */
let tracing = false;
export async function traceFs<T>(fn: () => T | Promise<T>): Promise<{ result: T; trace: FsTrace }> {
  if (tracing) throw new Error('traceFs: a trace is already running');
  const trace: FsTrace = { reads: new Set(), probes: new Set(), dirs: new Set(), writes: new Set() };
  const skip = lastDrawnPath();
  const note = (set: Set<string>, p: unknown) => {
    const abs = pathOf(p);
    if (!abs || isEngine(abs)) return;
    if (skip && abs.startsWith(skip)) return;
    set.add(abs);
  };
  const f = fs as unknown as FsFns;
  const saved: FsFns = {};
  const wrap = (name: string, before: (args: unknown[]) => void) => {
    const orig = f[name];
    if (typeof orig !== 'function') return;
    saved[name] = orig;
    f[name] = function (this: unknown, ...args: unknown[]) {
      before(args);
      return orig.apply(this, args);
    };
  };
  wrap('readFileSync', a => note(trace.reads, a[0]));
  wrap('existsSync', a => note(trace.probes, a[0]));
  wrap('statSync', a => note(trace.probes, a[0]));
  wrap('lstatSync', a => note(trace.probes, a[0]));
  wrap('readdirSync', a => note(trace.dirs, a[0]));
  wrap('openSync', a => {
    const flags = a[1];
    note(typeof flags === 'string' && /[wa+]/.test(flags) ? trace.writes : trace.reads, a[0]);
  });
  wrap('writeFileSync', a => note(trace.writes, a[0]));
  wrap('appendFileSync', a => note(trace.writes, a[0]));
  wrap('copyFileSync', a => { note(trace.reads, a[0]); note(trace.writes, a[1]); });
  wrap('renameSync', a => note(trace.writes, a[1]));
  tracing = true;
  syncBuiltinESMExports();
  try {
    const result = await fn();
    return { result, trace };
  } finally {
    Object.assign(f, saved);
    syncBuiltinESMExports();
    tracing = false;
  }
}

function sha(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/** The hash of a file as a drawing reads it: `pgs.json` without its prose. Null if it is not there. */
export function hashFile(abs: string): string | null {
  let data: Buffer;
  try {
    data = fs.readFileSync(abs);
  } catch {
    return null;
  }
  if (abs.endsWith(`${sep}pgs.json`) || abs === 'pgs.json') {
    try {
      const json = JSON.parse(data.toString('utf8'));
      if (json && typeof json === 'object') for (const k of PROSE_FIELDS) delete json[k];
      return sha(JSON.stringify(json));
    } catch {
      // not JSON: its bytes, like any file
    }
  }
  return sha(data);
}

function hashDir(abs: string): string | null {
  try {
    return sha(fs.readdirSync(abs).sort().join('\n'));
  } catch {
    return null;
  }
}

function exists(abs: string): boolean {
  return fs.existsSync(abs);
}

/** `{ "command": …, args }`, canonical: keys sorted at every depth. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/**
 * Where the fingerprints go when `fingerprints=` does not say: beside the
 * `pgs.json` above the folder the batch runs from. Null if there is none.
 */
export function defaultFingerprints(cwd = process.cwd()): string | null {
  const project = findProject(cwd);
  return project ? join(dirname(project), FINGERPRINTS_FILE) : null;
}

/** The fingerprints of a batch: what each step read and wrote, and the decisions on them. */
export class Fingerprints {
  readonly file: string;
  readonly root: string;
  private book: FingerprintBook;
  private hashes = new Map<string, string | null>();
  private ran = new Map<string, string>();
  private dirty = false;
  private savedAt = 0;

  constructor(file: string) {
    this.file = resolve(file);
    this.root = dirname(this.file);
    this.book = { version: 1, steps: {} };
    if (fs.existsSync(this.file)) {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch (e) {
        throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
      }
      const r = raw as Partial<FingerprintBook>;
      if (!r || typeof r !== 'object' || r.version !== 1 || !r.steps || typeof r.steps !== 'object') {
        throw new Error(`${file} is not a PGS fingerprints file (expected { "version": 1, "steps": {…} })`);
      }
      this.book = r as FingerprintBook;
    }
  }

  /** The path as the book keeps it: relative to the book, with `/`. */
  rel(abs: string): string {
    const r = relative(this.root, abs);
    return (r && !r.startsWith('..') && !isAbsolute(r) ? r : abs).split(sep).join('/');
  }

  abs(rel: string): string {
    return resolve(this.root, rel);
  }

  /**
   * The key of a step: its command, its arguments and the folder it runs from,
   * relative to the book ("." for the book's own folder), so a book committed
   * with the project holds in every copy of it (estudio#382: from the root,
   * `rel` gave the absolute path, and a clone in another folder found no step).
   */
  keyOf(step: PlannedStep): string {
    const cwd = resolve(process.cwd()) === this.root ? '.' : this.rel(process.cwd());
    return sha(JSON.stringify(canonical({ command: step.command, args: step.input, cwd })));
  }

  print(step: PlannedStep): StepPrint | undefined {
    return this.book.steps[this.keyOf(step)];
  }

  /** The hash of a file now, remembered until a step writes it. */
  private hash(abs: string): string | null {
    if (!this.hashes.has(abs)) this.hashes.set(abs, hashFile(abs));
    return this.hashes.get(abs) ?? null;
  }

  /** Why the step has to run, judged on the disk as it is now; null if it is up to date. */
  why(step: PlannedStep): string | null {
    const p = this.print(step);
    if (!p) return 'no fingerprint (new, or its arguments changed)';
    for (const [rel, h] of Object.entries(p.reads)) {
      const now = this.hash(this.abs(rel));
      if (now === null) return `${rel} is gone`;
      if (now !== h) return `${rel} changed`;
    }
    for (const [rel, was] of Object.entries(p.probes)) {
      if (exists(this.abs(rel)) !== was) return was ? `${rel} is gone` : `${rel} appeared`;
    }
    for (const [rel, h] of Object.entries(p.dirs)) {
      if (hashDir(this.abs(rel)) !== h) return `the files in ${rel} changed`;
    }
    for (const [rel, h] of Object.entries(p.writes)) {
      const now = this.hash(this.abs(rel));
      if (now === null) return `its ${rel} is missing`;
      if (now !== h) return `its ${rel} was changed since`;
    }
    return null;
  }

  /**
   * Which steps run before any does: those `why` gives a reason for, and with
   * them every step that writes a file one of them writes (one thing, run
   * whole). `reads` too (for `dry_run`, which cannot run them to see): a step
   * that reads what a running one writes may run, said as such.
   */
  plan(steps: PlannedStep[], reads = false): Map<number, string> {
    const reason = new Map<number, string>();
    for (const s of steps) {
      const w = this.why(s);
      if (w) reason.set(s.index, w);
    }
    const writes = new Map<number, string[]>();
    const readsOf = new Map<number, string[]>();
    for (const s of steps) {
      const p = this.print(s);
      // a step never run (or with new arguments) may write in place what it names:
      // the files of its arguments stand for what it writes, so the steps that
      // wrote them run before it (rerunning a writer for a step that only reads
      // costs time; painting on a canvas already painted costs the drawing)
      writes.set(s.index, p ? Object.keys(p.writes) : this.named(s));
      readsOf.set(s.index, p ? Object.keys(p.reads) : []);
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const s of steps) {
        if (reason.has(s.index)) continue;
        for (const t of steps) {
          if (!reason.has(t.index) || t === s) continue;
          const tw = writes.get(t.index)!;
          const shared = writes.get(s.index)!.find(f => tw.includes(f));
          if (shared) {
            reason.set(s.index, `writes ${shared} too, with step ${t.index}, which runs`);
            changed = true;
            break;
          }
          const read = reads && t.index < s.index ? readsOf.get(s.index)!.find(f => tw.includes(f)) : undefined;
          if (read) {
            reason.set(s.index, `may: reads ${read}, which step ${t.index} writes`);
            changed = true;
            break;
          }
        }
      }
    }
    return reason;
  }

  /**
   * The paths a step's arguments name, as the book keeps them: what it may
   * write. Its `path` when it also has an `out` is what it reads (export_sheet
   * path= out=), not what it changes in place (draw path=).
   */
  private named(step: PlannedStep): string[] {
    const out: string[] = [];
    for (const [k, v] of Object.entries(step.input)) {
      if (k === 'path' && typeof step.input.out === 'string') continue;
      for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string' && x) out.push(this.rel(resolve(x)));
    }
    return out;
  }

  /** Notes what a step that ran read and wrote. */
  record(step: PlannedStep, trace: FsTrace): void {
    const writes = new Set([...trace.writes].filter(a => a !== this.file));
    for (const a of writes) this.hashes.delete(a);
    const print: StepPrint = { command: step.command, reads: {}, probes: {}, dirs: {}, writes: {} };
    for (const a of [...trace.reads].sort()) {
      if (writes.has(a) || a === this.file) continue;
      const h = this.hash(a);
      if (h !== null) print.reads[this.rel(a)] = h;
      else print.probes[this.rel(a)] = false;
    }
    for (const a of [...trace.probes].sort()) {
      if (writes.has(a) || trace.reads.has(a) || a === this.file) continue;
      print.probes[this.rel(a)] = exists(a);
    }
    for (const a of [...trace.dirs].sort()) {
      const h = hashDir(a);
      if (h !== null) print.dirs[this.rel(a)] = h;
    }
    for (const a of [...writes].sort()) {
      const h = this.hash(a);
      if (h !== null) print.writes[this.rel(a)] = h;
    }
    const key = this.keyOf(step);
    // the step that wrote these files before, with other arguments, is this one now
    const mine = Object.keys(print.writes);
    for (const [k, p] of Object.entries(this.book.steps)) {
      if (k !== key && !this.ran.has(k) && Object.keys(p.writes).some(w => mine.includes(w))) delete this.book.steps[k];
    }
    this.book.steps[key] = print;
    this.ran.set(key, step.command);
    this.dirty = true;
    if (Date.now() - this.savedAt > 1000) this.save();
  }

  /** A step that failed has no fingerprint: next time it runs. */
  forget(step: PlannedStep): void {
    const key = this.keyOf(step);
    if (key in this.book.steps) {
      delete this.book.steps[key];
      this.dirty = true;
    }
  }

  /**
   * Writes the book. At the end of the batch (`final`), what every step that
   * ran wrote is hashed again as the batch left it: of two steps writing one
   * file, the first must not find it "changed since" by the second.
   */
  save(final = false): void {
    if (final) {
      this.hashes.clear();
      for (const key of this.ran.keys()) {
        const p = this.book.steps[key];
        if (!p) continue;
        for (const rel of Object.keys(p.writes)) {
          const h = this.hash(this.abs(rel));
          if (h !== null) p.writes[rel] = h;
          else delete p.writes[rel];
        }
      }
      this.dirty = true;
    }
    if (!this.dirty) return;
    const steps = Object.fromEntries(Object.keys(this.book.steps).sort().map(k => [k, this.book.steps[k]]));
    fs.mkdirSync(this.root, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, steps }, null, 1) + '\n');
    fs.renameSync(tmp, this.file);
    this.dirty = false;
    this.savedAt = Date.now();
  }
}

/**
 * Whether a step is one `only` asks for: a pattern matches a string argument
 * (or a string in a list argument) — whole if it has `*` or `?`, anywhere in it
 * if not — or a value of the `each` it came out of (`quien=ana`, or `ana`).
 */
export function matchesOnly(step: { input: Record<string, unknown>; each?: { vars: Record<string, unknown> } }, patterns: string[]): boolean {
  const texts: string[] = [];
  for (const v of Object.values(step.input)) {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') texts.push(x);
  }
  if (step.each) {
    for (const [k, v] of Object.entries(step.each.vars)) {
      if (v === null || typeof v !== 'object') texts.push(`${k}=${v}`, String(v));
    }
  }
  return patterns.some(p => {
    if (!/[*?]/.test(p)) return texts.some(t => t.includes(p));
    const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return texts.some(t => re.test(t));
  });
}
