// @vitest-environment node
// `pgs batch -`: one process, a command per line, an answer per line (#129 of The Unwritten Dao).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseLine, runLines } from './batchlines';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-lines-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

async function* lines(xs: string[]): AsyncIterable<string> { for (const x of xs) yield x; }

describe('the line mode of batch', () => {
  it('reads the argv of bin/pgs as JSON, a step of a batch, or plain words; skips blanks and comments', () => {
    expect(parseLine('["draw", "path=a.pss.json", "frame=0", "ops=[{\\"op\\":\\"clear\\"}]"]'))
      .toEqual({ name: 'draw', args: { path: 'a.pss.json', frame: 0, ops: [{ op: 'clear' }] } });
    expect(parseLine('["info", "{\\"path\\": \\"a b.pss.json\\"}"]')).toEqual({ name: 'info', args: { path: 'a b.pss.json' } });
    expect(parseLine('{"command": "info", "path": "a.pss.json"}')).toEqual({ name: 'info', args: { path: 'a.pss.json' } });
    expect(parseLine('  info path=a.pss.json  ')).toEqual({ name: 'info', args: { path: 'a.pss.json' } });
    expect(parseLine('')).toBeNull();
    expect(parseLine('# a comment')).toBeNull();
  });

  it('answers each line with what bin/pgs prints, and a failure does not stop the next ones', async () => {
    const a = join(dir, 'a.pss.json'), out: string[] = [];
    const failed = await runLines(lines([
      JSON.stringify(['new', `path=${a}`, 'width=4', 'palette=["#ff0000"]']),
      '# the frame as text after a pixel',
      JSON.stringify(['draw', `path=${a}`, 'frame=0', 'ops=[{"op":"pixel","x":1,"y":2,"color":1}]']),
      `info path=${join(dir, 'missing.pss.json')}`,
      JSON.stringify({ command: 'ascii', path: a, frame: 0 }),
      '["batch", "steps=[]"]',
    ]), s => out.push(s));
    expect(out.every(l => l.endsWith('\n') && !l.slice(0, -1).includes('\n'))).toBe(true);
    const answers = out.map(l => JSON.parse(l) as { ok: boolean; out?: string; error?: string });
    expect(answers.map(x => x.ok)).toEqual([true, true, false, true, false]);
    expect(failed).toBe(2);
    expect(JSON.parse(answers[0].out!).width).toBe(4);
    expect(answers[2].error).toMatch(/^pgs info: .*ENOENT/);
    expect(answers[3].out!.split('\n').slice(1, 5)).toEqual(['....', '....', '.1..', '....']);
  });

  it('bin/pgs batch - run from another folder answers a line before it reads the next one', async () => {
    // the real condition: a script keeps the process open and asks the next thing after reading the answer
    const child = spawn(join(process.cwd(), 'bin/pgs'), ['batch', '-'], { cwd: dir, stdio: ['pipe', 'pipe', 'inherit'] });
    const answers = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const ask = async (argv: string[]) => {
      child.stdin.write(JSON.stringify(argv) + '\n');
      const r = await answers.next();
      return JSON.parse(r.value as string) as { ok: boolean; out: string };
    };
    expect((await ask(['new', 'path=b.pss.json', 'width=3', 'palette=["#00ff00"]'])).ok).toBe(true);
    const before = await ask(['ascii', 'path=b.pss.json', 'frame=0']);
    expect(before.out).toContain('...');
    expect((await ask(['draw', 'path=b.pss.json', 'frame=0', 'ops=[{"op":"pixel","x":0,"y":0,"color":1}]'])).ok).toBe(true);
    expect((await ask(['ascii', 'path=b.pss.json', 'frame=0'])).out.split('\n')[1]).toBe('1..');
    child.stdin.end();
    const code = await new Promise<number | null>(res => child.on('close', res));
    expect(code).toBe(0);
  }, 30000);
});
