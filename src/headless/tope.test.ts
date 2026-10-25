// A limit that really stops PGS (Khadosh/pixel-gaming-studio#51): `bin/pgs` is
// one process, so a timeout from outside kills the whole of it, and `batch
// timeout=` stops a recipe between steps and says which ones wrote.

import { describe, expect, it } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBatch, batchReport, timeoutLine, type PlannedStep } from './batch';
import { runCommand } from './commands';

const step = (index: number, run: () => unknown): PlannedStep => ({
  index, command: `paso${index}`, args: {}, run: run as PlannedStep['run'],
});
const busy = (ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { /* the CPU, as a drawing */ } return {}; };
const line = (c: string) => `${c} hecho`;

describe('batch timeout=', () => {
  it('stops between steps: a step that started finishes whole, the rest never start, and it says which', async () => {
    const r = await runBatch([step(1, () => ({})), step(2, () => busy(150)), step(3, () => ({})), step(4, () => ({}))], { line, timeout: 0.05 });
    expect(r.timedOut).toBe(0.05);
    expect(r.steps.map(s => s.ok)).toEqual([true, true]);
    expect(r.skipped).toBe(2);
    expect(timeoutLine(r)).toBe('timeout of 0.05 s ran out; written: 1–2; never started: 3–4');
    expect(batchReport(r)).toContain('2/4 step(s) done, 2 never ran');
  });

  it('cuts a step left waiting (the network) instead of waiting for it', async () => {
    const t0 = Date.now();
    const r = await runBatch([step(1, () => ({})), step(2, () => new Promise(done => setTimeout(done, 5000))), step(3, () => ({}))], { line, timeout: 0.05 });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.steps[1]).toMatchObject({ ok: false, index: 2 });
    expect(timeoutLine(r)).toBe('timeout of 0.05 s ran out; written: 1; cut mid-way: 2; never started: 3');
  });

  it('with time to spare it changes nothing, and the command fails when it runs out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-tope-'));
    const steps = [1, 2, 3].map(n => ({ command: 'new', width: 16, path: join(dir, `a${n}.pss.json`) }));
    const plain = await runCommand('batch', { steps });
    const roomy = await runCommand('batch', { steps, timeout: 60 });
    expect(roomy.text).toBe(plain.text);
    // a timeout so small it has run out before the first step: nothing written, and said
    const late = steps.map(s => ({ ...s, path: s.path.replace('a', 'b') }));
    await expect(runCommand('batch', { steps: late, timeout: 1e-9 })).rejects.toThrow(/timeout of 1e-9 s ran out; nothing written; never started: 1–3/);
    expect(late.some(s => existsSync(s.path))).toBe(false);
  });
});

/** The pids whose command line carries `marker` (pgrep, never pkill). */
function alive(marker: string): number[] {
  try {
    return execFileSync('pgrep', ['-f', marker], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number);
  } catch {
    return []; // pgrep exits 1 when there is none
  }
}

describe('bin/pgs is one process', () => {
  it('killed by an alarm, as an agent does it, leaves no node behind', async () => {
    const marker = `tope-51-${process.pid}-${Date.now()}`;
    const cwd = mkdtempSync(join(tmpdir(), 'pgs-tope-'));
    // `batch -` waits for lines while its stdin is open: a run that would not end on its own
    const child = spawn('perl', ['-e', 'alarm 4; exec @ARGV', join(process.cwd(), 'bin/pgs'), 'batch', '-', marker], { cwd, stdio: ['pipe', 'pipe', 'inherit'] });
    try {
      // the answer to a first line says it is up and reading
      await new Promise<void>((done, fail) => {
        child.stdout.once('data', () => done());
        child.once('exit', code => fail(new Error(`bin/pgs left before answering (${code})`)));
        child.stdin.write('["help"]\n');
      });
      expect(alive(marker)).toEqual([child.pid]);
      const signal = await new Promise<NodeJS.Signals | null>(done => child.once('exit', (_code, sig) => done(sig)));
      expect(signal).toBe('SIGALRM');
      // what tsx's CLI left was a second node, still drawing, with its stdin open
      await new Promise(done => setTimeout(done, 200));
      expect(alive(marker)).toEqual([]);
    } finally {
      for (const pid of alive(marker)) process.kill(pid, 'SIGKILL');
      child.stdin.destroy();
    }
  }, 20000);
});
