// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { batchSteps, planBatch, stepOf } from './batch';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-batch-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const at = (name: string) => join(dir, name);

/** A step that makes a small red asset. */
function newStep(name: string) {
  return { command: 'new', path: at(name), width: 8, palette: ['#ff0000'] };
}

describe('batch: reading the steps', () => {
  it('takes the array, or an object with steps', () => {
    const one = [{ command: 'info', path: 'a.pss.json' }];
    expect(batchSteps(one, 'x')).toEqual([{ command: 'info', args: { path: 'a.pss.json' } }]);
    expect(batchSteps({ steps: one }, 'x')).toEqual([{ command: 'info', args: { path: 'a.pss.json' } }]);
  });

  it('says where the problem is when a step is not a step', () => {
    expect(() => batchSteps([{ path: 'a' }], 'recipe.json'))
      .toThrow(/recipe\.json: step 1: a step needs "command"/);
    expect(() => batchSteps(['new'], 'recipe.json')).toThrow(/step 1: a step is an object/);
    expect(() => batchSteps([], 'recipe.json')).toThrow(/the list of steps is empty/);
    expect(() => batchSteps({ pasos: [] }, 'recipe.json')).toThrow(/expected a list of steps/);
  });

  it('splits the command off the arguments, flat', () => {
    expect(stepOf({ command: 'draw', path: 'a', frame: 0 }, 'x'))
      .toEqual({ command: 'draw', args: { path: 'a', frame: 0 } });
  });
});

describe('batch: the plan', () => {
  it('names every problem at once, not only the first', () => {
    const steps = batchSteps([
      newStep('a.pss.json'),
      { command: 'map_pat', recipe: 'x.json' },
      { command: 'variant' },
      { command: 'draw', path: at('a.pss.json'), frame: 'primero' },
    ], 'x');
    let message = '';
    try { planBatch(steps, () => undefined); } catch (err) { message = (err as Error).message; }
    // Every step is unknown to that lookup, so the plan answers four problems.
    expect(message).toMatch(/4 of 4 step\(s\) do not check out/);
    expect(message).toContain('nothing was written');
  });

  it('refuses a batch inside a batch', async () => {
    await expect(runCommand('batch', { steps: [{ command: 'batch', steps: [] }] }))
      .rejects.toThrow(/"batch" cannot be a step of a batch/);
  });

  it('writes nothing when one step does not check out', async () => {
    await expect(runCommand('batch', {
      steps: [newStep('a.pss.json'), { command: 'new', path: at('b.pss.json') }],
    })).rejects.toThrow(/1 of 2 step\(s\) do not check out[\s\S]*step 2 new: width/);
    // The point: step 1 was fine and still did not run.
    expect(existsSync(at('a.pss.json'))).toBe(false);
    expect(existsSync(at('b.pss.json'))).toBe(false);
  });

  it('names the step number and the command of a bad argument', async () => {
    await expect(runCommand('batch', {
      steps: [newStep('a.pss.json'), { command: 'resize', path: at('a.pss.json'), width: -3 }],
    })).rejects.toThrow(/step 2 resize:/);
  });

  it('names an unknown command with its step number', async () => {
    await expect(runCommand('batch', { steps: [{ command: 'map_pat', recipe: 'x' }] }))
      .rejects.toThrow(/step 1: unknown command "map_pat"/);
  });

  it('dry_run checks everything and writes nothing', async () => {
    const r = await runCommand('batch', { steps: [newStep('a.pss.json')], dry_run: true });
    expect((r.data as { dry_run: boolean }).dry_run).toBe(true);
    expect(r.text).toMatch(/1 step\(s\) check out; nothing was written/);
    expect(existsSync(at('a.pss.json'))).toBe(false);
  });
});

describe('batch: the run', () => {
  it('runs the steps in order in one process, each seeing the last one', async () => {
    const r = await runCommand('batch', {
      steps: [
        newStep('a.pss.json'),
        { command: 'draw', path: at('a.pss.json'), frame: 0, ops: [{ op: 'rect', x: 1, y: 1, w: 4, h: 4, color: 1, fill: true }] },
        { command: 'export_sheet', path: at('a.pss.json'), out: at('a.png') },
      ],
    });
    const data = r.data as { total: number; done: number; failed: number; skipped: number };
    expect(data).toMatchObject({ total: 3, done: 3, failed: 0, skipped: 0 });
    expect(existsSync(at('a.png'))).toBe(true);
    expect(existsSync(at('a.json'))).toBe(true);
  });

  it('answers one line per step, and a line is one line', async () => {
    // `draw` reports the ascii of the frame it changed: many lines inside one
    // value, which would break a report that is a line per step.
    const r = await runCommand('batch', {
      steps: [
        newStep('a.pss.json'),
        { command: 'draw', path: at('a.pss.json'), frame: 0, ops: [{ op: 'pixel', x: 1, y: 1, color: 1 }] },
      ],
    });
    const lines = r.text!.split('\n');
    expect(lines[0]).toMatch(/^\s+1 ✓ ok new:/);
    expect(lines[1]).toMatch(/^\s+2 ✓ ok draw:/);
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe('2/2 step(s) done');
    expect(lines).toHaveLength(4);
  });

  it('a step that throws stops the whole batch, and the report says what never ran', async () => {
    let message = '';
    try {
      await runCommand('batch', {
        steps: [
          newStep('a.pss.json'),
          { command: 'export_sheet', path: at('missing.pss.json'), out: at('x.png') },
          newStep('b.pss.json'),
        ],
      });
    } catch (err) { message = (err as Error).message; }
    expect(message).toMatch(/1 of 3 step\(s\) failed/);
    expect(message).toMatch(/1 ✓ ok new:/);
    expect(message).toMatch(/2 ✗ export_sheet: .*missing\.pss\.json/);
    expect(message).toMatch(/1\/3 step\(s\) done, 1 failed, 1 never ran/);
    expect(existsSync(at('a.pss.json'))).toBe(true);
    expect(existsSync(at('b.pss.json'))).toBe(false);
  });

  it('keep_going runs them all and reports every failure', async () => {
    let message = '';
    try {
      await runCommand('batch', {
        keep_going: true,
        steps: [
          { command: 'export_sheet', path: at('one.pss.json'), out: at('x.png') },
          newStep('a.pss.json'),
          { command: 'export_sheet', path: at('two.pss.json'), out: at('y.png') },
        ],
      });
    } catch (err) { message = (err as Error).message; }
    expect(message).toMatch(/2 of 3 step\(s\) failed/);
    expect(message).toMatch(/one\.pss\.json/);
    expect(message).toMatch(/two\.pss\.json/);
    expect(message).toMatch(/1\/3 step\(s\) done, 2 failed/);
    expect(message).not.toMatch(/never ran/);
    expect(existsSync(at('a.pss.json'))).toBe(true);
  });
});

describe('batch: a recipe on disk', () => {
  it('runs a JSON file of steps, so the recipe lives in the repo', async () => {
    const recipe = at('receta.json');
    writeFileSync(recipe, JSON.stringify({
      steps: [
        newStep('a.pss.json'),
        { command: 'to_ascii', path: at('a.pss.json'), out: at('a.txt') },
      ],
    }));
    const r = await runCommand('batch', { recipe });
    expect((r.data as { done: number }).done).toBe(2);
    expect(readFileSync(at('a.txt'), 'utf8')).toContain('size: 8x8');
  });

  it('takes steps or a recipe, not both and not neither', async () => {
    await expect(runCommand('batch', {})).rejects.toThrow(/needs steps or recipe/);
    await expect(runCommand('batch', { steps: [newStep('a.pss.json')], recipe: 'x.json' }))
      .rejects.toThrow(/not both/);
  });

  it('names the file when a step of it is wrong', async () => {
    const recipe = at('mala.json');
    writeFileSync(recipe, JSON.stringify([{ command: 'new', path: at('a.pss.json') }]));
    await expect(runCommand('batch', { recipe })).rejects.toThrow(/step 1 new: width/);
  });
});
