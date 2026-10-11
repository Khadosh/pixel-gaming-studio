// Command-line front for the headless tools.
//
//   pgs <command> '<json args>'
//   pgs <command> key=value key=value …   (values parse as JSON when they can)
//   pgs help [command]
//   pgs batch -              a command per line on stdin, an answer per line (batchlines.ts)
//   pgs batch --lines <file> the same from a file
//
// Results go to stdout as JSON (or plain text for ascii renders); errors to
// stderr with exit code 1.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { commands, findCommand, runCommand } from './commands';
import { argsOf, printed, runLines } from './batchlines';

function describe(name?: string): string {
  if (name) {
    const cmd = findCommand(name);
    if (!cmd) return `unknown command "${name}"`;
    const shape = cmd.schema.shape as Record<string, { description?: string; isOptional?: () => boolean }>;
    const lines = Object.entries(shape).map(([k, v]) => {
      const opt = typeof v.isOptional === 'function' && v.isOptional() ? '?' : '';
      return `  ${k}${opt}${v.description ? '  — ' + v.description : ''}`;
    });
    const details = cmd.details ? `${cmd.details}\n` : '';
    return `${cmd.name}: ${cmd.description}\n${details}${lines.join('\n')}`;
  }
  return [
    'pgs <command> \'<json>\'   |   pgs <command> key=value …   |   pgs help <command>   |   pgs doc command=<name> (every field, nested too)',
    'pgs batch -   (or --lines <file>): one process, a command per line (["cmd", "k=v", …], {"command": …} or words), an answer per line {"ok", "out"|"error"}',
    '',
    ...commands.map(c => `  ${c.name.padEnd(14)} ${c.description}`),
  ].join('\n');
}

export async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === 'help' || name === '--help' || name === '-h') {
    console.log(describe(rest[0]));
    return 0;
  }
  if (name === 'batch' && (rest[0] === '-' || rest[0] === '--lines')) {
    // one process for many commands: a script keeps it open and asks one thing after another
    if (rest[0] === '--lines' && !rest[1]) { console.error('pgs batch --lines <file>'); return 1; }
    const input = rest[0] === '-' ? process.stdin : createReadStream(rest[1], 'utf8');
    const failed = await runLines(createInterface({ input, crlfDelay: Infinity }), s => process.stdout.write(s));
    return failed ? 1 : 0;
  }
  try {
    const result = await runCommand(name, argsOf(rest));
    console.log(printed(result));
    return 0;
  } catch (err) {
    console.error(`pgs ${name}: ${(err as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1])) {
  main(process.argv.slice(2)).then(code => {
    // An answer bigger than the pipe buffer (face_points over a character with
    // 64 frames) is still on its way out when the promise resolves: process.exit
    // would cut it at 64 KB. The callback of a last empty write runs once
    // everything queued before it reached the OS.
    process.stdout.write('', () => process.exit(code));
  });
}
