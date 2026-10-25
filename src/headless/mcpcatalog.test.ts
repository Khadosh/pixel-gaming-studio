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
  CATALOG_BUDGET, CATALOG_HEADROOM, DESCRIPTION_EXCEPTIONS, FIELD_DESCRIPTION_MAX, MAPS_CATALOG_BUDGET, MAP_CORE, SCENE_STEPS_BUDGET,
  SHARED_FIELDS, TOOL_DESCRIPTION_MAX,
  compactSchema, fullSchema, headroomWarning, isSceneStep, listedCommands, mapsMode, publishedSchema, publishedTools, sceneStepBytes,
  withoutDescriptions,
} from './mcpcatalog';

interface Tool { name: string; description?: string; inputSchema: { properties?: Record<string, { description?: string }>; required?: string[] } }

/** initialize + tools/list (every page) + optional calls against bin/pgs-mcp, from `cwd`. */
async function talk(
  cwd: string,
  calls: { name: string; arguments: unknown }[] = [],
  start: { args?: readonly string[]; env?: Record<string, string> } = {},
) {
  const env: Record<string, string | undefined> = { ...process.env, PGS_MCP_MAPS: undefined, ...start.env };
  const child = spawn(join(process.cwd(), 'bin/pgs-mcp'), [...(start.args ?? [])], { cwd, env });
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
    const warn = headroomWarning('base catalog', total, CATALOG_BUDGET);
    if (warn) console.warn(warn);

    // Every command but the scene map steps (Khadosh/pixel-gaming-studio#19).
    expect(tools.map(t => t.name)).toEqual(commands.filter(c => !isSceneStep(c.name)).map(c => `pgs_${c.name}`));
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
    expect(answers[0].content[0].text).toMatch(/lit from behind/);    // a field description
    expect(answers[1].content[0].text).toMatch(/^new: /);

    // No draft-7 tuple anywhere: the API reads the schema as 2020-12, where `items` is one schema,
    // and leaves out the whole tool when it is a list (26 map steps were invisible, PGS#34).
    const tuples: string[] = [];
    const walk = (n: unknown, path: string): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray((n as { items?: unknown }).items) || 'additionalItems' in (n as object)) tuples.push(path);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    for (const t of tools) walk(t.inputSchema, t.name);
    expect(tuples, 'a tuple goes out as prefixItems (compactSchema)').toEqual([]);
  }, 30000);

  it('leaves the scene map steps out, says so once, and still runs them (Khadosh/pixel-gaming-studio#19)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pgs-catalog-'));
    const scene = commands.filter(c => isSceneStep(c.name));
    const { instructions, tools, answers } = await talk(dir, [
      { name: 'pgs_map_grove', arguments: {} },
      { name: 'pgs_batch', arguments: { dry_run: true, steps: [{ command: 'map_grove' }] } },
    ]);
    const names = new Set(tools.map(t => t.name));
    for (const core of MAP_CORE) expect(names.has(`pgs_${core}`), core).toBe(true);
    expect(tools.filter(t => isSceneStep(t.name.slice(4))).map(t => t.name)).toEqual([]);
    expect(instructions).toContain(`${scene.length} scene map steps`);
    expect(instructions).toMatch(/--maps/);
    // Not listed is not gone: the call reaches the command's own validation, directly and through batch.
    expect(answers[0].content[0].text).toMatch(/pgs_map_grove: .*recipe/);
    expect(answers[1].content[0].text).toMatch(/step 1 map_grove: recipe/);
  }, 30000);

  for (const [how, start] of [
    ['--maps', { args: ['--maps'] }],
    ['PGS_MCP_MAPS=1', { env: { PGS_MCP_MAPS: '1' } }],
  ] as const) {
    it(`maps mode (${how}) lists every command and fits its own budget`, async () => {
      dir = mkdtempSync(join(tmpdir(), 'pgs-catalog-'));
      const { instructions, tools } = await talk(dir, [], start);
      expect(tools.map(t => t.name)).toEqual(commands.map(c => `pgs_${c.name}`));
      expect(instructions).not.toMatch(/scene map steps/);
      // The scene steps pay against their own budget; the rest is the base catalog, measured above.
      const scene = sceneStepBytes(tools);
      expect(scene, `scene map steps ${scene} bytes, budget ${SCENE_STEPS_BUDGET}: a new step goes to MAP_CORE or a family (mcpcatalog.ts)`).toBeLessThanOrEqual(SCENE_STEPS_BUDGET);
      const warn = headroomWarning('scene steps', scene, SCENE_STEPS_BUDGET);
      if (warn) console.warn(warn);
      const total = bytes(tools) + bytes(instructions);
      expect(total, `maps catalog ${total} bytes, budget ${MAPS_CATALOG_BUDGET}`).toBeLessThanOrEqual(MAPS_CATALOG_BUDGET);
    }, 30000);
  }
});

describe('room under the budget (Khadosh/pixel-gaming-studio#58)', () => {
  it('warns under CATALOG_HEADROOM bytes left, and only then', () => {
    expect(headroomWarning('base catalog', CATALOG_BUDGET - CATALOG_HEADROOM, CATALOG_BUDGET)).toBeUndefined();
    const w = headroomWarning('base catalog', CATALOG_BUDGET - CATALOG_HEADROOM + 1, CATALOG_BUDGET);
    expect(w).toMatch(/^base catalog: 1999 bytes left of 98000/);
    expect(w).toMatch(/SHARED_FIELDS/);
    expect(headroomWarning('scene steps', SCENE_STEPS_BUDGET + 5, SCENE_STEPS_BUDGET)).toMatch(/-5 bytes left/);
  });
});

describe('the shared fields, said once (Khadosh/pixel-gaming-studio#58)', () => {
  it('every shared text is still the one the commands use, and leaves the catalog', () => {
    for (const maps of [false, true]) {
      const all = publishedTools(listedCommands(commands, maps));
      for (const [field, text] of Object.entries(SHARED_FIELDS)) {
        const using = listedCommands(commands, maps).filter(c => (fullSchema(c).properties as Record<string, { description?: string }>)[field]?.description === text);
        if (!maps && (field === 'recipe' || field === 'index')) continue; // the map steps' pair: most of them are scene steps
        expect(using.length, `${field}: no command says "${text}" any more; update SHARED_FIELDS`).toBeGreaterThan(0);
        for (const c of using) expect(all.find(t => t.name === `pgs_${c.name}`)!.inputSchema.properties, c.name).toHaveProperty([field]);
        for (const t of all) expect((t.inputSchema.properties as Record<string, { description?: string }>)[field]?.description, `${t.name}.${field}`).not.toBe(text);
      }
    }
  });

  it('a shared field never goes out with no description of its own unless it means what the instructions say', () => {
    const silent: string[] = [];
    for (const cmd of commands) {
      const full = fullSchema(cmd).properties as Record<string, { description?: string }>;
      const shown = publishedSchema(cmd).properties as Record<string, { description?: string }>;
      for (const field of Object.keys(SHARED_FIELDS)) {
        // The instructions give recipe and index for the map steps only.
        if ((field === 'recipe' || field === 'index') && !cmd.name.startsWith('map_')) continue;
        if (!full[field] || shown[field].description) continue;
        if (full[field].description !== SHARED_FIELDS[field]) silent.push(`${cmd.name}.${field}`);
      }
    }
    expect(silent, 'give it a short description (≤ FIELD_DESCRIPTION_MAX): with none, an agent reads the glossary into it').toEqual([]);
  });

  it('the instructions name every shared field', async () => {
    const { INSTRUCTIONS } = await import('./mcpcatalog');
    for (const field of Object.keys(SHARED_FIELDS)) expect(INSTRUCTIONS, field).toMatch(new RegExp(`\\b${field}\\b`));
  });
});

describe('which map tools are scene steps', () => {
  it('the core names real commands and every other map_ is a scene step', () => {
    const names = new Set(commands.map(c => c.name));
    for (const core of MAP_CORE) expect(names.has(core), core).toBe(true);
    expect(isSceneStep('map_grove')).toBe(true);
    expect(isSceneStep('map_area')).toBe(false);
    expect(isSceneStep('render')).toBe(false);
    expect(listedCommands(commands, true)).toHaveLength(commands.length);
    expect(listedCommands(commands, false).some(c => isSceneStep(c.name))).toBe(false);
  });

  it('maps mode is the flag or the variable at 1', () => {
    expect(mapsMode(['--maps'], {})).toBe(true);
    expect(mapsMode([], { PGS_MCP_MAPS: '1' })).toBe(true);
    expect(mapsMode([], { PGS_MCP_MAPS: '0' })).toBe(false);
    expect(mapsMode([], {})).toBe(false);
  });

  it('maps mode is the base budget plus the scene steps, and only the scene steps count as such (Khadosh/estudio#219)', () => {
    expect(MAPS_CATALOG_BUDGET).toBe(CATALOG_BUDGET + SCENE_STEPS_BUDGET);
    const grove = { name: 'pgs_map_grove', description: 'ñ' };
    expect(sceneStepBytes([grove, { name: 'pgs_map_area' }, { name: 'pgs_render' }, { name: 'pss_map_grove' }]))
      .toBe(Buffer.byteLength(JSON.stringify(grove), 'utf8') + 1);
  });
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
    expect(props.id.description).toBe('defaults to the file name without .pss.json');
    expect(props.path.description).toBeUndefined();      // in the instructions (SHARED_FIELDS)
    expect(props.preview.description).toBeUndefined();   // in the instructions
    const wall = publishedSchema(commands.find(c => c.name === 'map_wall')!).properties as Record<string, { description?: string }>;
    expect(wall.recipe.description).toBeUndefined();     // in the instructions
    expect(wall.index.description).toBeUndefined();
  });

  it('every top-level field of a map step says what it is in 80 characters, so the catalog carries it (#18)', () => {
    // the long why of each one is in docs/map_recipes.md; `index` and `recipe` are said once, in the instructions
    const unpublished: string[] = [];
    for (const cmd of commands.filter(c => c.name.startsWith('map_'))) {
      const full = fullSchema(cmd).properties as Record<string, { description?: string }>;
      const pub = publishedSchema(cmd).properties as Record<string, { description?: string }>;
      for (const [field, s] of Object.entries(full)) {
        if (s.description && !pub[field].description && !['index', 'recipe', 'preview'].includes(field)) {
          unpublished.push(`${cmd.name}.${field} (${s.description.length})`);
        }
      }
    }
    expect(unpublished, 'npx tsx scripts/long-fields.ts lists them').toEqual([]);
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

  it('a tuple of one type is an array of that type with its length; a mixed one is prefixItems', () => {
    const pair = { type: 'array', items: [{ type: 'number' }, { type: 'number' }], additionalItems: false, minItems: 2, maxItems: 2 };
    expect(compactSchema(pair)).toEqual({ type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 });
    const mixed = { type: 'array', items: [{ type: 'number' }, { type: 'string' }], additionalItems: false, minItems: 2, maxItems: 2 };
    expect(compactSchema(mixed)).toEqual({ type: 'array', prefixItems: [{ type: 'number' }, { type: 'string' }], minItems: 2, maxItems: 2 });
    // A tuple with a rest ([number, ...[n, n, n][]]): the rest is 2020-12's `items`.
    const triple = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
    const rest = { type: 'array', items: [{ type: 'number' }], additionalItems: triple, minItems: 1 };
    expect(compactSchema(rest)).toEqual({ type: 'array', prefixItems: [{ type: 'number' }], items: triple, minItems: 1 });
    // Open-ended with nothing allowed after it.
    const closed = { type: 'array', items: [{ type: 'number' }, { type: 'string' }], additionalItems: false, minItems: 1 };
    expect(compactSchema(closed)).toEqual({ type: 'array', prefixItems: [{ type: 'number' }, { type: 'string' }], items: false, minItems: 1 });
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
