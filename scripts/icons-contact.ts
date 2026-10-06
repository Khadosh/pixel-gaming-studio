/**
 * `npm run icons:hoja`: las hojas de contacto de los iconos, con PGS.
 *
 * Los pasa por `from_ascii` a assets y los pone a todos juntos con `contact`,
 * sobre el fondo de la app (los papeles semitransparentes se compositan sobre
 * él, que es como se ven en pantalla).
 *
 * Salen **dos** hojas, porque una sola engaña:
 *
 * - `hoja_de_contacto.png` a 6×, con el nombre debajo de cada uno: para ver qué
 *   quiso dibujar cada icono y retocarlo.
 * - `hoja_1x.png` a 1×, los 63 a 16 px pegados: **la condición real**. A 6×
 *   `sparkles` parece un dibujo; a 16 px es una mancha. Un icono se aprueba
 *   mirando esta hoja, no la otra.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCommand } from '../src/headless/commands.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWINGS = join(ROOT, 'art/iconos');
const BIG = join(ROOT, 'art/iconos/hoja_de_contacto.png');
const REAL = join(ROOT, 'art/iconos/hoja_1x.png');

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
  const paths = ids.map(id => join(dir, `${id}.pss.json`));
  await run('contact', { paths, scale: 6, background: '#131318', grid: 0, columns: 9, out: BIG });
  await run('contact', { paths, scale: 1, background: '#131318', grid: 0, columns: 9, out: REAL });
  console.log(`${ids.length} iconos → ${BIG.replace(ROOT + '/', '')} (6×) y ${REAL.replace(ROOT + '/', '')} (1×)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
