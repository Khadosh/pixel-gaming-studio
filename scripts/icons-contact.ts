/**
 * `npm run icons:hoja`: la hoja de contacto de los iconos, con PGS.
 *
 * Los pasa por `from_ascii` a assets y los pone a todos juntos con `contact`,
 * sobre el fondo de la app (los papeles semitransparentes se compositan sobre
 * él, que es como se ven en pantalla). Es la hoja que mira quien va a arreglar
 * el arte: todos los iconos en una imagen, con el nombre debajo de cada uno.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCommand } from '../src/headless/commands.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWINGS = join(ROOT, 'art/iconos');
const OUT = join(ROOT, 'art/iconos/hoja_de_contacto.png');

async function run(name: string, args: Record<string, unknown>) {
  const command = findCommand(name);
  if (!command) throw new Error(`no existe el comando ${name}`);
  return command.run(command.schema.parse(args) as never);
}

const ids = readdirSync(DRAWINGS).filter(f => f.endsWith('.txt')).map(f => f.replace(/\.txt$/, '')).sort();
const dir = mkdtempSync(join(tmpdir(), 'pgs-iconos-'));
try {
  for (const id of ids) {
    await run('from_ascii', { txt: join(DRAWINGS, `${id}.txt`), out: join(dir, `${id}.pss.json`) });
  }
  await run('contact', {
    paths: ids.map(id => join(dir, `${id}.pss.json`)),
    scale: 6, background: '#131318', grid: 0, columns: 9, out: OUT,
  });
  console.log(`${ids.length} iconos → ${OUT.replace(ROOT + '/', '')}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
