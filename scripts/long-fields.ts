/**
 * `npx tsx scripts/long-fields.ts [--all] [--json]`: los campos de nivel superior
 * cuya descripción pasa de FIELD_DESCRIPTION_MAX (80) y por eso el catálogo del
 * MCP no publica. Por comando, con el archivo de `src/headless/` donde está el
 * texto. Sin `--all`, sólo los comandos de mapa (`map_*`, sus pasos en
 * `maprecipe.ts` y `mapsteps/`), que desde #18 entran todos: la lista tiene que
 * salir vacía. Sale con 1 si queda alguno. Un campo del glosario (`SHARED_FIELDS`)
 * no cuenta: lo dicen las instrucciones del servidor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from '../src/headless/commands.ts';
import { FIELD_DESCRIPTION_MAX, SHARED_FIELDS, fullSchema } from '../src/headless/mcpcatalog.ts';


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEADLESS = join(ROOT, 'src/headless');
const all = process.argv.includes('--all');
const json = process.argv.includes('--json');

const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [join(dir, e.name)] : []);
const files = sources(HEADLESS).map(f => ({ f: relative(ROOT, f), text: readFileSync(f, 'utf8') }));
/** Where the text of a description is written (its first 40 characters, as they appear in a string literal). */
const whereIs = (d: string) => {
  const probe = d.slice(0, 40);
  const hit = files.filter(({ text }) => text.includes(probe) || text.includes(JSON.stringify(probe).slice(1, -1)));
  return hit.length ? hit.map(h => h.f).join(', ') : '?';
};

const out: { command: string; field: string; length: number; file: string; description: string }[] = [];
for (const cmd of commands) {
  const props = (fullSchema(cmd).properties ?? {}) as Record<string, { description?: string }>;
  for (const [field, s] of Object.entries(props)) {
    const d = s.description;
    if (!d || d.length <= FIELD_DESCRIPTION_MAX || field === 'preview') continue;
    if (SHARED_FIELDS[field] === d) continue;
    if (!all && !cmd.name.startsWith('map_')) continue;
    const file = whereIs(d);
    out.push({ command: cmd.name, field, length: d.length, file, description: d });
  }
}

if (json) console.log(JSON.stringify(out, null, 1));
else {
  let last = '';
  for (const o of out) {
    if (o.command !== last) console.log(`\n${o.command}`);
    last = o.command;
    console.log(`  ${o.field.padEnd(16)} ${String(o.length).padStart(4)}  ${o.file}`);
  }
  console.log(`\n${out.length} campos de más de ${FIELD_DESCRIPTION_MAX} caracteres${all ? '' : ' en los comandos map_*'} (${new Set(out.map(o => o.command)).size} comandos)`);
}
process.exit(out.length ? 1 : 0);
