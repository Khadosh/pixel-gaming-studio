// `pgs batch -`: many commands in one process, one answer per line.
//
// Every call of `bin/pgs` starts tsx from zero (about 0.7 s). A script that asks
// for a frame as text, decides, draws a patch and asks again pays that start on
// every question: `./arte.sh personajes` of The Unwritten Dao spent most of its
// time starting processes (#129). The `batch` command does not help there,
// because it plans every step before running any, and these scripts decide the
// next step from the answer to the last one.
//
// So the line mode keeps one process open: a command per line on stdin, its
// answer as one JSON line on stdout as soon as it is done, `{"ok": true, "out":
// <exactly what bin/pgs prints>}` or `{"ok": false, "error": <what it says on
// stderr>}`. A failure does not stop the others: the caller decides. A line is
// the argv of bin/pgs as a JSON array (`["draw", "path=a.pss.json", "ops=[…]"]`,
// what a script already hands to subprocess), a step of a batch
// (`{"command": "draw", "path": …}`), or plain words (`info path=a.pss.json`,
// no quoting: values with spaces go in one of the JSON forms). Empty lines and
// lines that start with `#` are skipped and get no answer.

import { runCommand, type CommandResult } from './commands';

/** key=value words into arguments (values parse as JSON when they can), as on the command line. */
export function parseKeyValues(parts: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) throw new Error(`expected key=value, got "${part}"`);
    const key = part.slice(0, eq);
    const raw = part.slice(eq + 1);
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

/** The arguments of a command line after its name: one JSON object, or key=value words. */
export function argsOf(rest: string[]): unknown {
  return rest.length === 1 && rest[0].trim().startsWith('{') ? JSON.parse(rest[0]) : parseKeyValues(rest);
}

/** What bin/pgs prints for a result (without the last newline). */
export function printed(result: CommandResult): string {
  return result.text !== undefined ? result.text : JSON.stringify(result.data, null, 1);
}

/** A line of the line mode as a command and its arguments; null for a blank line or a comment. */
export function parseLine(line: string): { name: string; args: unknown } | null {
  const s = line.trim();
  if (!s || s.startsWith('#')) return null;
  if (s.startsWith('[')) {
    const argv = JSON.parse(s) as unknown;
    if (!Array.isArray(argv) || !argv.length || argv.some(a => typeof a !== 'string')) {
      throw new Error('a line that starts with [ is the argv of bin/pgs: a list of strings, the command first');
    }
    const [name, ...rest] = argv as string[];
    return { name, args: argsOf(rest) };
  }
  if (s.startsWith('{')) {
    const { command, ...args } = JSON.parse(s) as { command?: unknown } & Record<string, unknown>;
    if (typeof command !== 'string' || !command) throw new Error('a line that starts with { needs "command"');
    return { name: command, args };
  }
  const [name, ...rest] = s.split(/\s+/);
  return { name, args: parseKeyValues(rest) };
}

/** Runs one line and gives back its answer line (without the newline), or null for a line with no answer. */
export async function answerLine(line: string): Promise<string | null> {
  let name = '?';
  try {
    const cmd = parseLine(line);
    if (!cmd) return null;
    name = cmd.name;
    if (name === 'batch') throw new Error('the line mode runs commands, not a batch');
    return JSON.stringify({ ok: true, out: printed(await runCommand(name, cmd.args)) });
  } catch (err) {
    return JSON.stringify({ ok: false, error: `pgs ${name}: ${(err as Error).message}` });
  }
}

/**
 * Reads lines until the input ends and writes an answer for each one as soon as it is done, in order.
 * Gives back how many failed.
 */
export async function runLines(lines: AsyncIterable<string>, write: (s: string) => void): Promise<number> {
  let failed = 0;
  for await (const line of lines) {
    const answer = await answerLine(line);
    if (answer === null) continue;
    if (answer.startsWith('{"ok":false')) failed++;
    write(answer + '\n');
  }
  return failed;
}
