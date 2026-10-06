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

/** A step as it is written: the command plus its arguments, flat. */
export interface BatchStepInput {
  command: string;
  args: Record<string, unknown>;
}

/** A step that passed its schema: ready to run, nothing written yet. */
export interface PlannedStep {
  index: number;
  command: string;
  /** The arguments as the schema parsed them. */
  args: unknown;
  run: (args: never) => CommandResult | Promise<CommandResult>;
}

/** What one step did, for the report. */
export interface BatchStepReport {
  index: number;
  command: string;
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
  return list.map((raw, i) => stepOf(raw, `${where}: step ${i + 1}`));
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
    const at = `step ${i + 1}`;
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
    planned.push({ index: i + 1, command: step.command, args: parsed.data, run: cmd.run });
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
  steps: BatchStepReport[];
}

export interface RunBatchOptions {
  /** Say what one step did, in one line (`oneLine` of brief.ts). */
  line: (command: string, result: CommandResult) => string;
  /** Run every step and report every failure instead of stopping at the first. */
  keepGoing?: boolean;
}

/** Runs a planned batch in this process, in order. */
export async function runBatch(planned: PlannedStep[], opts: RunBatchOptions): Promise<BatchResult> {
  const steps: BatchStepReport[] = [];
  let stopped = false;
  for (const step of planned) {
    if (stopped) break;
    try {
      const result = await step.run(step.args as never);
      steps.push({ index: step.index, command: step.command, ok: true, line: opts.line(step.command, result) });
    } catch (err) {
      steps.push({ index: step.index, command: step.command, ok: false, error: (err as Error).message });
      if (!opts.keepGoing) stopped = true;
    }
  }
  const failed = steps.filter(s => !s.ok).length;
  return { total: planned.length, done: steps.length - failed, failed, skipped: planned.length - steps.length, steps };
}

/** The report: a line per step, then what the batch as a whole did. */
export function batchReport(r: BatchResult, dryRun = false): string {
  if (dryRun) {
    return [
      ...r.steps.map(s => `${String(s.index).padStart(3)} · ${s.command}`),
      '',
      `${r.total} step(s) check out; nothing was written (dry_run)`,
    ].join('\n');
  }
  const lines = r.steps.map(s => `${String(s.index).padStart(3)} ${s.ok ? '✓' : '✗'} ${s.ok ? s.line : `${s.command}: ${s.error}`}`);
  const tail = [`${r.done}/${r.total} step(s) done`];
  if (r.failed) tail.push(`${r.failed} failed`);
  if (r.skipped) tail.push(`${r.skipped} never ran`);
  return [...lines, '', tail.join(', ')].join('\n');
}
