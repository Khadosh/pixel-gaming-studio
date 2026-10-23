/**
 * `npm run mcp:catalog`: lo que le cuesta a una sesión de agente cargar el MCP.
 *
 * Arranca `bin/pgs-mcp` de verdad, por stdio, como lo arranca un cliente, le
 * pide `tools/list` (todas las páginas) y mide la lista **serializada en JSON**,
 * que es lo que el cliente mete en el contexto del agente. No arma el catálogo
 * a mano: si el servidor publica algo distinto de lo que creemos, esto lo ve.
 *
 * Dice los bytes totales (y tokens aproximados, bytes/4), las 15 herramientas
 * más caras y de dónde viene el peso: descripciones de herramienta,
 * descripciones de campo (todo `description` dentro del `inputSchema`),
 * nombres y estructura (el resto del JSON).
 *
 *   npx tsx scripts/mcp-catalog.ts            (tabla)
 *   npx tsx scripts/mcp-catalog.ts --json     (los números, para comparar)
 *   npx tsx scripts/mcp-catalog.ts --maps     (el catálogo con los pasos de escena, `bin/pgs-mcp --maps`;
 *                                             dice aparte lo que pesan ellos, contra SCENE_STEPS_BUDGET)
 *   PGS_MCP=/otra/ruta/pgs-mcp npx tsx scripts/mcp-catalog.ts
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CATALOG_BUDGET, MAPS_CATALOG_BUDGET, SCENE_STEPS_BUDGET, sceneStepBytes } from '../src/headless/mcpcatalog.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = process.env.PGS_MCP ?? resolve(ROOT, 'bin/pgs-mcp');
const MAPS = process.argv.includes('--maps');
const BUDGET = MAPS ? MAPS_CATALOG_BUDGET : CATALOG_BUDGET;

interface Tool { name: string; description?: string; inputSchema?: unknown }

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');

/** Bytes de todo `description` dentro de un schema, con la clave y las comillas. */
function fieldDescriptionBytes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((s: number, n) => s + fieldDescriptionBytes(n), 0);
  if (!node || typeof node !== 'object') return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'description' && typeof v === 'string') sum += bytes(k) + 1 + bytes(v) + 1;
    else sum += fieldDescriptionBytes(v);
  }
  return sum;
}

async function main() {
  const client = new Client({ name: 'mcp-catalog', version: '0' });
  const transport = new StdioClientTransport({ command: SERVER, args: MAPS ? ['--maps'] : [], stderr: 'ignore' });
  await client.connect(transport);
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    tools.push(...(page.tools as Tool[]));
    cursor = page.nextCursor;
  } while (cursor);
  const instructions = client.getInstructions() ?? '';
  await client.close();

  const total = bytes(tools);
  const toolDesc = tools.reduce((s, t) => s + (t.description ? bytes('description') + 1 + bytes(t.description) + 1 : 0), 0);
  const fieldDesc = tools.reduce((s, t) => s + fieldDescriptionBytes(t.inputSchema), 0);
  const names = tools.reduce((s, t) => s + bytes('name') + 1 + bytes(t.name) + 1, 0);
  const structure = total - toolDesc - fieldDesc - names;
  const per = tools
    .map(t => ({ name: t.name, bytes: bytes(t), description: (t.description ?? '').length, fields: fieldDescriptionBytes(t.inputSchema) }))
    .sort((a, b) => b.bytes - a.bytes);

  const instr = Buffer.byteLength(instructions, 'utf8');
  const scene = sceneStepBytes(tools);
  const report = {
    server: SERVER, tools: tools.length, bytes: total, tokens: Math.round(total / 4),
    instructions: instr, withInstructions: total + instr, budget: BUDGET, maps: MAPS, sceneSteps: scene, sceneStepsBudget: SCENE_STEPS_BUDGET,
    parts: { toolDescriptions: toolDesc, fieldDescriptions: fieldDesc, names, structure },
    top: per.slice(0, 15),
  };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const pct = (n: number) => `${(100 * n / total).toFixed(1)} %`;
  console.log(`${tools.length} herramientas · ${total} bytes · ~${report.tokens} tokens (bytes/4)`);
  console.log(`instrucciones del servidor: ${instr} bytes (se pagan una vez)`);
  console.log(`total por sesión: ${total + instr} bytes de ${BUDGET} de presupuesto${MAPS ? ' (modo mapas)' : ''} (${(100 * (total + instr) / BUDGET).toFixed(0)} %)`);
  if (MAPS) {
    const base = total + instr - scene;
    console.log(`  pasos de escena: ${scene} de ${SCENE_STEPS_BUDGET} (${(100 * scene / SCENE_STEPS_BUDGET).toFixed(0)} %) · el resto: ${base} de ${CATALOG_BUDGET}`);
  }
  console.log('');
  console.log(`descripciones de herramienta  ${String(toolDesc).padStart(7)}  ${pct(toolDesc)}`);
  console.log(`descripciones de campo        ${String(fieldDesc).padStart(7)}  ${pct(fieldDesc)}`);
  console.log(`nombres                       ${String(names).padStart(7)}  ${pct(names)}`);
  console.log(`estructura del schema         ${String(structure).padStart(7)}  ${pct(structure)}`);
  console.log('');
  console.log('las 15 más caras (bytes · caracteres de descripción · bytes de descripciones de campo)');
  for (const t of report.top) {
    console.log(`  ${t.name.padEnd(24)} ${String(t.bytes).padStart(6)}  ${String(t.description).padStart(4)}  ${String(t.fields).padStart(5)}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
