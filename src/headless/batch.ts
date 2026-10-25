// A recipe of commands, run as one transaction.
//
// `bin/pgs` is tsx without a build step, so every call pays about a fifth of a
// second to start. That is the cheap part of the problem. The expensive part is
// that "a recipe" — the dozen or two calls that make one map, one character,
// one card — does not exist as a unit anywhere: each call validates itself,
// writes its files and leaves. Nobody looks at the set before the first file is
// written, so a typo in step nine leaves a half-built recipe on disk and the
// agent has to work out which half.
//
// `batch` is that unit. It takes the list of steps (inline, or a JSON file that
// can live in the repo next to the art it makes), **checks every one of them
// against its schema before running any**, and only then starts writing. A step
// that does not check out stops the whole thing with every problem named at
// once and nothing written at all.
//
// The steps are plain data on purpose: a list of `{ "command": …, …args }` is a
// recipe a person can read, keep in git and re-run, which is what the Python
// scripts that build characters and cards are today.

import type { z } from 'zod';
import type { CommandResult } from './commands';
import { eachCombinations, eachLabel, fillStep, unusedNames, type EachVars } from './batcheach';

/** A step as it is written: the command plus its arguments, flat. */
export interface BatchStepInput {
  command: string;
  args: Record<string, unknown>;
  /** Set when the step is one of the many an `each` step stands for. */
  each?: { step: number; vars: EachVars };
}

/** A step that passed its schema: ready to run, nothing written yet. */
export interface PlannedStep {
  index: number;
  command: string;
  /** The step of the recipe it came out of and its values, when that was an `each`. */
  each?: { step: number; vars: EachVars };
  /** The arguments as the schema parsed them. */
  args: unknown;
  run: (args: never) => CommandResult | Promise<CommandResult>;
}

/** What one step did, for the report. */
export interface BatchStepReport {
  index: number;
  command: string;
  /** `giro=90`: the values of the `each` it came out of. */
  vars?: string;
  /** false when it threw; absent steps (after a stop) are not reported. */
  ok: boolean;
  /** One line saying what it did (the one MCP gives a command with no text of its own). */
  line?: string;
  error?: string;
}

/** A command as the registry holds it, as much of it as batch needs. */
export interface BatchCommand {
  name: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (args: never) => CommandResult | Promise<CommandResult>;
}

/** Commands a batch may not contain, to keep it one flat list. */
export const BATCH_FORBIDDEN = new Set(['batch']);

/**
 * The steps of a batch out of what was handed in: the array itself, or an
 * object with `steps` (so the file can carry a comment or a title beside them).
 */
export function batchSteps(raw: unknown, where: string): BatchStepInput[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { steps?: unknown }).steps)
      ? (raw as { steps: unknown[] }).steps
      : null;
  if (!list) throw new Error(`${where}: expected a list of steps, or an object with "steps"`);
  if (!list.length) throw new Error(`${where}: the list of steps is empty`);
  const steps: BatchStepInput[] = [];
  const problems: string[] = [];
  list.forEach((raw, i) => {
    const step = stepOf(raw, `${where}: step ${i + 1}`);
    if (!('each' in step.args)) { steps.push(step); return; }
    try {
      steps.push(...expandEach(step, i + 1, `${where}: step ${i + 1}`));
    } catch (err) {
      problems.push((err as Error).message);
    }
  });
  if (problems.length) {
    throw new Error(`${problems.length} step(s) with "each" do not expand, so nothing was written:\n  ${problems.join('\n  ')}`);
  }
  return steps;
}

/**
 * The steps an `each` step stands for (batcheach.ts), in the order of nested
 * loops. A name no argument uses, or two of them writing the same `out`, is a
 * placeholder forgotten somewhere, and stops it here.
 */
export function expandEach(step: BatchStepInput, number: number, where: string): BatchStepInput[] {
  const { each, ...args } = step.args;
  const combos = eachCombinations(each, where);
  const unused = unusedNames(args, Object.keys(combos[0]));
  if (unused.length) {
    throw new Error(`${where}: ${unused.map(n => `{${n}}`).join(', ')} of "each" is in no argument, so every step would be the same`);
  }
  const out = combos.map(vars => ({
    command: step.command,
    args: fillStep(args, vars, `${where} (${eachLabel(vars)})`),
    each: { step: number, vars },
  }));
  const seen = new Map<string, string>();
  for (const s of out) {
    if (typeof s.args.out !== 'string') continue;
    const before = seen.get(s.args.out);
    if (before !== undefined) {
      throw new Error(`${where}: (${before}) and (${eachLabel(s.each.vars)}) both write out=${s.args.out}: a name of "each" is missing from it`);
    }
    seen.set(s.args.out, eachLabel(s.each.vars));
  }
  return out;
}

/** `{ command: "from_ascii", txt: …, out: … }` split into the command and its arguments. */
export function stepOf(raw: unknown, where: string): BatchStepInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${where}: a step is an object { "command": "<name>", …arguments }`);
  }
  const { command, ...args } = raw as { command?: unknown } & Record<string, unknown>;
  if (typeof command !== 'string' || !command) {
    throw new Error(`${where}: a step needs "command" with the name of the command to run`);
  }
  return { command, args };
}

/**
 * Checks every step against its command's schema and gives back the steps
 * ready to run. Nothing is run and nothing is written: a batch that does not
 * plan does not start. Every problem is named, not only the first, because the
 * point of planning is to answer the whole list in one go.
 */
export function planBatch(steps: BatchStepInput[], find: (name: string) => BatchCommand | undefined): PlannedStep[] {
  const planned: PlannedStep[] = [];
  const problems: string[] = [];
  steps.forEach((step, i) => {
    const at = step.each ? `step ${i + 1} (step ${step.each.step} of the recipe, ${eachLabel(step.each.vars)})` : `step ${i + 1}`;
    if (BATCH_FORBIDDEN.has(step.command)) {
      problems.push(`${at}: "${step.command}" cannot be a step of a batch`);
      return;
    }
    const cmd = find(step.command);
    if (!cmd) {
      problems.push(`${at}: unknown command "${step.command}"`);
      return;
    }
    const parsed = cmd.schema.safeParse(step.args);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(x => `${x.path.join('.') || '(root)'}: ${x.message}`).join('; ');
      problems.push(`${at} ${step.command}: ${issues}`);
      return;
    }
    planned.push({ index: i + 1, command: step.command, each: step.each, args: parsed.data, run: cmd.run });
  });
  if (problems.length) {
    throw new Error(
      `${problems.length} of ${steps.length} step(s) do not check out, so nothing was written:\n  ${problems.join('\n  ')}`,
    );
  }
  return planned;
}

export interface BatchResult {
  /** How many steps were planned (the whole batch). */
  total: number;
  /** How many actually ran without throwing. */
  done: number;
  /** How many threw. */
  failed: number;
  /** Planned but never reached, because an earlier one stopped the batch. */
  skipped: number;
  /** Set when `timeout` ran out: the seconds it had. */
  timedOut?: number;
  steps: BatchStepReport[];
}

export interface RunBatchOptions {
  /** Say what one step did, in one line (`oneLine` of brief.ts). */
  line: (command: string, result: CommandResult) => string;
  /** Run every step and report every failure instead of stopping at the first. */
  keepGoing?: boolean;
  /**
   * Seconds the whole batch may take. Checked before each step, so a step that
   * started is finished and its files are whole; a step still awaiting when it
   * runs out (a model on the network) is cut there and said. A step busy on the
   * CPU cannot be interrupted from inside: the kill from outside is what stops
   * it, and since #51 `bin/pgs` is one process, that kill takes all of it.
   */
  timeout?: number;
}

/** A step left waiting when the timeout ran out. */
const CUT = Symbol('cut');

/** Runs a planned batch in this process, in order. */
export async function runBatch(planned: PlannedStep[], opts: RunBatchOptions): Promise<BatchResult> {
  const steps: BatchStepReport[] = [];
  const deadline = opts.timeout ? Date.now() + opts.timeout * 1000 : Infinity;
  let stopped = false;
  let timedOut = false;
  for (const step of planned) {
    if (stopped) break;
    if (Date.now() >= deadline) { timedOut = true; break; }
    const vars = step.each ? eachLabel(step.each.vars) : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const running = Promise.resolve().then(() => step.run(step.args as never));
      const result = deadline === Infinity ? await running : await Promise.race([
        running,
        new Promise<typeof CUT>(done => { timer = setTimeout(() => done(CUT), Math.max(0, deadline - Date.now())); }),
      ]);
      if (result === CUT) {
        running.catch(() => {});
        steps.push({ index: step.index, command: step.command, vars, ok: false, error: `cut by the timeout of ${opts.timeout} s while it ran: it may have written part of its files` });
        timedOut = true;
        break;
      }
      steps.push({ index: step.index, command: step.command, vars, ok: true, line: opts.line(step.command, result) });
    } catch (err) {
      steps.push({ index: step.index, command: step.command, vars, ok: false, error: (err as Error).message });
      if (!opts.keepGoing) stopped = true;
    } finally {
      clearTimeout(timer);
    }
  }
  const failed = steps.filter(s => !s.ok).length;
  return {
    total: planned.length, done: steps.length - failed, failed, skipped: planned.length - steps.length, steps,
    ...(timedOut ? { timedOut: opts.timeout } : {}),
  };
}

/** What a timeout left: which steps wrote their files and which never started. */
export function timeoutLine(r: BatchResult): string {
  const written = r.steps.filter(s => s.ok).map(s => s.index);
  const cut = r.steps.find(s => !s.ok && s.error?.startsWith('cut by the timeout'));
  const next = r.steps.length ? r.steps[r.steps.length - 1].index + 1 : 1;
  const parts = [`timeout of ${r.timedOut} s ran out`];
  parts.push(written.length ? `written: ${ranges(written)}` : 'nothing written');
  if (cut) parts.push(`cut mid-way: ${cut.index}`);
  if (r.skipped) parts.push(`never started: ${next}${r.skipped > 1 ? `–${next + r.skipped - 1}` : ''}`);
  return parts.join('; ');
}

/** [1, 2, 3, 5] → "1–3, 5". */
function ranges(xs: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    out.push(i === j ? `${xs[i]}` : `${xs[i]}–${xs[j]}`);
    i = j;
  }
  return out.join(', ');
}

/** The report: a line per step, then what the batch as a whole did. */
export function batchReport(r: BatchResult, dryRun = false): string {
  if (dryRun) {
    return [
      ...r.steps.map(s => `${String(s.index).padStart(3)} · ${s.command}${s.vars ? `  ${s.vars}` : ''}`),
      '',
      `${r.total} step(s) check out; nothing was written (dry_run)`,
    ].join('\n');
  }
  const lines = r.steps.map(s => `${String(s.index).padStart(3)} ${s.ok ? '✓' : '✗'} ${s.ok ? s.line : `${s.command}${s.vars ? ` (${s.vars})` : ''}: ${s.error}`}`);
  const tail = [`${r.done}/${r.total} step(s) done`];
  if (r.failed) tail.push(`${r.failed} failed`);
  if (r.skipped) tail.push(`${r.skipped} never ran`);
  const end = [tail.join(', ')];
  if (r.timedOut !== undefined) end.push(timeoutLine(r));
  return [...lines, '', ...end].join('\n');
}
