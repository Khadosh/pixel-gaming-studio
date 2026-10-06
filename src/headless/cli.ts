// Command-line front for the headless tools.
//
//   pgs <command> '<json args>'
//   pgs <command> key=value key=value …   (values parse as JSON when they can)
//   pgs help [command]
//
// Results go to stdout as JSON (or plain text for ascii renders); errors to
// stderr with exit code 1.

import { commands, findCommand, runCommand } from './commands';

function parseKeyValues(parts: string[]): Record<string, unknown> {
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

function describe(name?: string): string {
  if (name) {
    const cmd = findCommand(name);
    if (!cmd) return `unknown command "${name}"`;
    const shape = cmd.schema.shape as Record<string, { description?: string; isOptional?: () => boolean }>;
    const lines = Object.entries(shape).map(([k, v]) => {
      const opt = typeof v.isOptional === 'function' && v.isOptional() ? '?' : '';
      return `  ${k}${opt}${v.description ? '  — ' + v.description : ''}`;
    });
    return `${cmd.name}: ${cmd.description}\n${lines.join('\n')}`;
  }
  return [
    'pgs <command> \'<json>\'   |   pgs <command> key=value …   |   pgs help <command>',
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
  let args: unknown;
  if (rest.length === 1 && rest[0].trim().startsWith('{')) {
    args = JSON.parse(rest[0]);
  } else {
    args = parseKeyValues(rest);
  }
  try {
    const result = await runCommand(name, args);
    if (result.text !== undefined) console.log(result.text);
    else console.log(JSON.stringify(result.data, null, 1));
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
