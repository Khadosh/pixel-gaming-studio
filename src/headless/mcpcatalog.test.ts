// The scale of the MCP catalog: what every agent session pays before it does
// anything. Measured on the real server over stdio, started from another
// directory, with the same JSON a client puts in the agent's context — not on
// a catalog rebuilt here, which would agree with itself whatever the server did.
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commands } from './commands';
import {
  CATALOG_BUDGET, DESCRIPTION_EXCEPTIONS, FIELD_DESCRIPTION_MAX, TOOL_DESCRIPTION_MAX,
  compactSchema, fullSchema, publishedSchema, withoutDescriptions,
} from './mcpcatalog';

interface Tool { name: string; description?: string; inputSchema: { properties?: Record<string, { description?: string }>; required?: string[] } }

/** initialize + tools/list (every page) + optional calls against bin/pgs-mcp, from `cwd`. */
async function talk(cwd: string, calls: { name: string; arguments: unknown }[] = []) {
  const child = spawn(join(process.cwd(), 'bin/pgs-mcp'), { cwd });
  const pending = new Map<number, (v: Record<string, unknown>) => void>();
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { id?: number };
      if (msg.id !== undefined) pending.get(msg.id)?.(msg as Record<string, unknown>);
    }
  });
  let id = 0;
  const send = (method: string, params?: unknown) => {
    const mine = ++id;
    const answer = new Promise<Record<string, unknown>>(resolve => pending.set(mine, resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mine, method, params })}\n`);
    return answer;
  };
  try {
    const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'scale', version: '1' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      const page = (await send('tools/list', cursor ? { cursor } : {})).result as { tools: Tool[]; nextCursor?: string };
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    const answers = [];
    for (const c of calls) answers.push((await send('tools/call', c)).result as { isError?: boolean; content: { type: string; text?: string }[] });
    return { instructions: (init.result as { instructions?: string }).instructions ?? '', tools, answers };
  } finally {
    child.kill();
  }
}

const bytes = (v: unknown) => Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v), 'utf8');

describe('the MCP catalog, as a client gets it', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('fits the budget, one tool per command, every description one short sentence', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pgs-catalog-'));
    const { instructions, tools, answers } = await talk(dir, [
      { name: 'pgs_doc', arguments: { command: 'map_wall' } },
      { name: 'pss_doc', arguments: { command: 'pgs_new' } },
    ]);
    const total = bytes(tools) + bytes(instructions);
    expect(total, `catalog ${total} bytes, budget ${CATALOG_BUDGET}: see mcpcatalog.ts before raising it`).toBeLessThanOrEqual(CATALOG_BUDGET);

    expect(tools.map(t => t.name)).toEqual(commands.map(c => `pgs_${c.name}`));
    const tooLong = tools
      .filter(t => !DESCRIPTION_EXCEPTIONS[t.name.slice(4)])
      .filter(t => !t.description || t.description.length > TOOL_DESCRIPTION_MAX)
      .map(t => `${t.name} (${t.description?.length ?? 0})`);
    expect(tooLong, 'one sentence; the rest goes to details').toEqual([]);

    // Said once, not in every tool.
    expect(instructions).toMatch(/preview: true/);
    expect(instructions).toMatch(/pgs_doc/);
    expect(tools.some(t => /preview: true adds the image/.test(t.description ?? ''))).toBe(false);
    for (const t of tools) {
      for (const [field, s] of Object.entries(t.inputSchema.properties ?? {})) {
        if (s.description) expect(s.description.length, `${t.name}.${field}`).toBeLessThanOrEqual(FIELD_DESCRIPTION_MAX);
      }
    }
    // What the catalog leaves out is one call away, by the new name and the old.
    expect(answers[0].isError).not.toBe(true);
    expect(answers[0].content[0].text).toMatch(/lattice\?/);          // a nested option
    expect(answers[0].content[0].text).toMatch(/lit from behind/);    // the long description
    expect(answers[1].content[0].text).toMatch(/^new: /);
  }, 30000);
});

describe('what the catalog leaves out is only prose', () => {
  it('every command publishes the whole structure of its schema', () => {
    for (const cmd of commands) {
      expect(withoutDescriptions(publishedSchema(cmd)), cmd.name).toEqual(withoutDescriptions(fullSchema(cmd)));
    }
  });

  it('a field keeps a short description and loses a long one', () => {
    const pub = publishedSchema(commands.find(c => c.name === 'new')!);
    const props = pub.properties as Record<string, { description?: string }>;
    expect(props.path.description).toBe('asset JSON path (*.pss.json)');
    expect(props.preview.description).toBeUndefined();   // in the instructions
    const wall = publishedSchema(commands.find(c => c.name === 'map_wall')!).properties as Record<string, { description?: string }>;
    expect(wall.recipe.description).toBeUndefined();     // in the instructions
    expect(wall.index.description).toBeUndefined();
  });
});

describe('compactSchema accepts the same values', () => {
  const SAFE = Number.MAX_SAFE_INTEGER;

  it('drops $schema, the ±2^53 bounds of an integer and string property names', () => {
    expect(compactSchema({
      $schema: 'http://json-schema.org/draft-07/schema#', type: 'object',
      properties: { n: { type: 'integer', minimum: -SAFE, maximum: SAFE }, m: { type: 'integer', minimum: 0, maximum: SAFE } },
      additionalProperties: false,
    })).toEqual({
      type: 'object',
      properties: { n: { type: 'integer' }, m: { type: 'integer', minimum: 0 } },
      additionalProperties: false,
    });
    expect(compactSchema({ type: 'object', propertyNames: { type: 'string' }, additionalProperties: { type: 'number' } }))
      .toEqual({ type: 'object', additionalProperties: { type: 'number' } });
  });

  it('a tuple of one type is an array of that type with its length; a mixed one stays', () => {
    const pair = { type: 'array', items: [{ type: 'number' }, { type: 'number' }], additionalItems: false, minItems: 2, maxItems: 2 };
    expect(compactSchema(pair)).toEqual({ type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 });
    const mixed = { type: 'array', items: [{ type: 'number' }, { type: 'string' }], additionalItems: false, minItems: 2, maxItems: 2 };
    expect(compactSchema(mixed)).toEqual(mixed);
  });

  it('a union of plain types is a type list; of arrays, one range only when there is no gap', () => {
    expect(compactSchema({ anyOf: [{ type: 'string' }, { type: 'integer' }], description: 'color' }))
      .toEqual({ type: ['string', 'integer'], description: 'color' });
    const n = (k: number) => ({ type: 'array', items: Array(k).fill({ type: 'number' }), additionalItems: false, minItems: k, maxItems: k });
    expect(compactSchema({ anyOf: [n(4), n(5), n(6)] })).toEqual({ type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 6 });
    // 2 or 4 is not 2 to 4.
    expect(compactSchema({ anyOf: [n(2), n(4)] })).toEqual({ anyOf: [compactSchema(n(2)), compactSchema(n(4))] });
    // A const branch is not a plain type.
    const withConst = { anyOf: [{ type: 'string', const: 'all' }, { type: 'object' }] };
    expect(compactSchema(withConst)).toEqual(withConst);
  });

  it('never mistakes a field name for a keyword', () => {
    const s = { type: 'object', properties: { $schema: { type: 'string' }, minimum: { type: 'integer', minimum: -SAFE } } };
    expect(compactSchema(s)).toEqual({ type: 'object', properties: { $schema: { type: 'string' }, minimum: { type: 'integer' } } });
  });
});
