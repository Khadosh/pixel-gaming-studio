// What the MCP server publishes in `tools/list`, and what it leaves for `pgs_doc`.
//
// Every agent session that loads the server pays for the whole catalog before
// it does anything: name, description and input schema of every tool. On
// 9 October 2026 that was 406 KB (~100k tokens) for 146 tools, most of it
// field descriptions and JSON Schema noise. This module is the diet, and
// `mcpcatalog.test.ts` is the scale (the budget, measured on the real server
// over stdio):
//
//   - The tool description is one sentence (`Command.description`, ≤ 200
//     characters); the long text is `Command.details`, which `pgs_doc` and
//     `pgs help <command>` show and the catalog does not.
//   - A field keeps its description only at the top level and only when it is
//     short (≤ FIELD_DESCRIPTION_MAX). The long ones, and every nested one,
//     are still in the zod schema — that is where `pgs_doc` reads them — but
//     the catalog does not carry them: a map step has a hundred tuning knobs
//     whose prose every session paid for and almost none used.
//   - What many tools share (`preview`, the `recipe` and `index` of a map step)
//     is said once, in INSTRUCTIONS, not in every tool.
//   - The JSON Schema zod writes is compacted without changing what it accepts:
//     no `$schema`, no ±2^53 bounds on every integer, a tuple of one type is an
//     array of that type with its length, a union of plain types is a type list.
//   - And one rewrite that is not about size: a tuple of mixed types is written
//     in the 2020-12 form, `prefixItems`, never draft 7's `items: [ … ]`. The
//     API a Claude session sends the catalog to validates it as 2020-12, where
//     `items` must be one schema, and drops the whole tool when it is a list:
//     26 map steps were invisible to every agent that way (PGS#34).
//
// Validation does not change: `tools/call` still checks the arguments against
// the zod schema of the command, exactly as before. This only decides what is
// shown. Pure on purpose (no stdio): the test and `pgs_doc` read it.

import { z } from 'zod';
import type { Command } from './commands';
import { LOOKING } from './brief';
import { TOOL_PREFIX } from './mcpnames';
import { sceneLine } from './mapsteps/scenes';

/**
 * Bytes of `tools/list` (the tools serialized as JSON) plus the instructions,
 * as a client receives them, for the catalog every session gets: without the
 * scene map steps (`--maps` adds them back, MAP_CORE). 406 KB before the diet
 * (9 October 2026, 146 tools), 197 KB after it, 242 KB with the map steps'
 * field descriptions back (#18); 89 KB once the 85 scene steps left it
 * (23 October 2026, Khadosh/pixel-gaming-studio#19, decided in #1), and this is
 * that plus 10 % of air. A command that needs more than the air is a command
 * to think about, not a number to raise.
 */
export const CATALOG_BUDGET = 98_000;

/**
 * The scene map steps on their own, what `--maps` adds on top of the base
 * catalog: each tool's JSON and its comma. 153 KB on 23 October 2026 (85
 * steps), plus 5 % of air: they are examples of the places of the first game
 * (scenes.ts), and a new map step belongs to MAP_CORE or to the transplant of
 * a family before it belongs here (Khadosh/estudio#219).
 */
export const SCENE_STEPS_BUDGET = 161_000;

/**
 * Maps mode, both parts. Not a number of its own: when it was (242 KB, full to
 * the byte), a command that fit the base with room to spare still failed here,
 * because maps mode lists everything (Khadosh/estudio#219).
 */
export const MAPS_CATALOG_BUDGET = CATALOG_BUDGET + SCENE_STEPS_BUDGET;

/**
 * The map tools every session sees: reading a game map, the generic steps a
 * scene is composed from, and painting, exporting and checking it. Every other
 * `map_*` is a **scene step** (grove, wall, cloudscape…), bound to the names
 * and values of the first game: it stays registered — `tools/call`, `pgs_doc`
 * and `pgs_batch` reach it — but `tools/list` only shows it in maps mode
 * (`bin/pgs-mcp --maps`, `PGS_MCP_MAPS=1`). A new `map_*` is a scene step until
 * it is added here, which is the cheap default for every session.
 */
export const MAP_CORE: ReadonlySet<string> = new Set([
  'map_from_game', 'map_material', 'map_area', 'map_path', 'map_water', 'map_light', 'map_scatter', 'map_settle', 'map_remove', 'map_transplant',
  'map_render', 'map_export', 'map_compare', 'map_lint',
]);

/** Whether a command is a scene map step, out of the base catalog. */
export function isSceneStep(name: string): boolean {
  return name.startsWith('map_') && !MAP_CORE.has(name);
}

/** Bytes the scene steps take in a `tools/list` answer: each tool's JSON and its comma (SCENE_STEPS_BUDGET). */
export function sceneStepBytes(tools: readonly { name: string }[]): number {
  return tools
    .filter(t => t.name.startsWith(`${TOOL_PREFIX}_`) && isSceneStep(t.name.slice(TOOL_PREFIX.length + 1)))
    .reduce((sum, t) => sum + new TextEncoder().encode(JSON.stringify(t)).length + 1, 0);
}

/** Whether the server was asked for the scene steps too: `--maps` or `PGS_MCP_MAPS=1`. */
export function mapsMode(argv: readonly string[], env: Record<string, string | undefined>): boolean {
  return argv.includes('--maps') || env.PGS_MCP_MAPS === '1';
}

/**
 * Tools allowed a description over TOOL_DESCRIPTION_MAX, each with its reason.
 * Empty on purpose: the long text goes to `Command.details`.
 */
export const DESCRIPTION_EXCEPTIONS: Record<string, string> = {};

/** A field description longer than this is left to `pgs_doc`. */
export const FIELD_DESCRIPTION_MAX = 80;

/** A tool description longer than this fails `mcpcatalog.test.ts`, unless it is in its exceptions. */
export const TOOL_DESCRIPTION_MAX = 200;

/**
 * Field descriptions that INSTRUCTIONS gives once instead of every tool. Only
 * dropped when the text is exactly this one: an `index` that means something
 * else keeps its own.
 */
const SHARED_FIELDS: Record<string, string> = {
  recipe: 'the recipe JSON',
  index: 'position (default: last); a step with the same id is replaced there, or moved there',
};

/** Said once per session, in the server's `instructions`, instead of in 130 tools. */
const BASE_INSTRUCTIONS = [
  'Pixel Gaming Studio: one tool per command of bin/pgs, the asset engine of a game (sprites, text drawings, maps, fonts, sound).',
  'Tools that write answer one line; pass preview: true to also get the image. pgs_inspect gives the whole detail of an asset.',
  'Fields with no description here, and every nested option, are documented by pgs_doc { command }; map recipes in docs/map_recipes.md.',
  'Map step tools (map_<step>) take recipe (the recipe JSON path) and index (position, default last; a step with the same id is replaced, or moved there).',
];

/** The line that says the scene steps exist when the catalog leaves them out. */
const SCENE_LINE = (n: number) =>
  `${n} scene map steps (map_grove, map_wall, map_cloudscape…) are not listed: pgs_doc { command } documents them ("escenas": the places they come from) and pgs_batch runs them; bin/pgs-mcp --maps lists them.`;

/** The server's instructions; `scene` is how many scene steps the catalog leaves out (0 in maps mode). */
export function instructions(scene = 0): string {
  return [...BASE_INSTRUCTIONS, ...(scene > 0 ? [SCENE_LINE(scene)] : [])].join('\n');
}

/** The instructions of the full catalog (maps mode). */
export const INSTRUCTIONS = instructions();

type Json = Record<string, unknown>;

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function isPlainType(n: unknown): n is { type: string } {
  return !!n && typeof n === 'object' && Object.keys(n).length === 1 && typeof (n as Json).type === 'string';
}

/** An array branch that only says "N to M items of this one schema". */
function arrayRange(n: unknown): { items: string; min: number; max: number } | undefined {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return undefined;
  const o = n as Json;
  if (o.type !== 'array' || typeof o.minItems !== 'number' || typeof o.maxItems !== 'number') return undefined;
  if (Object.keys(o).some(k => !['type', 'items', 'minItems', 'maxItems'].includes(k))) return undefined;
  if (!o.items || Array.isArray(o.items)) return undefined;
  return { items: JSON.stringify(o.items), min: o.minItems, max: o.maxItems };
}

/**
 * The same JSON Schema with less noise. It accepts exactly what the input
 * accepted, read as JSON Schema 2020-12 (what the API checks it against):
 * draft 7's tuples are rewritten to `prefixItems`, everything else is an
 * identity of both drafts.
 */
export function compactSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(compactSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (k === '$schema') continue;
    if (k === 'minimum' && v === -MAX_SAFE) continue;
    if (k === 'maximum' && v === MAX_SAFE) continue;
    // Keys of a JSON object are always strings.
    if (k === 'propertyNames' && isPlainType(v) && v.type === 'string') continue;
    // `properties` maps field names to schemas: compact the schemas, never treat a field name as a keyword.
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v as Json).map(([name, s]) => [name, compactSchema(s)]));
      continue;
    }
    out[k] = compactSchema(v);
  }
  // [number, number] → array of number, two of them.
  if (Array.isArray(out.items) && out.items.length > 0 && out.minItems === out.items.length && out.maxItems === out.items.length) {
    const first = JSON.stringify(out.items[0]);
    if (out.items.every(i => JSON.stringify(i) === first)) {
      out.items = out.items[0];
      delete out.additionalItems;
    }
  }
  // [number, string] → prefixItems: the API takes `items` as one schema, never a list.
  if (Array.isArray(out.items)) {
    const rest = out.additionalItems;
    out.prefixItems = out.items;
    delete out.items;
    delete out.additionalItems;
    // With maxItems at the tuple's length nothing can follow it: `items: false` would say it twice.
    if (rest !== undefined && rest !== true && out.maxItems !== (out.prefixItems as unknown[]).length) out.items = rest;
  }
  if (Array.isArray(out.anyOf)) {
    // { anyOf: [{type: string}, {type: integer}] } → { type: [string, integer] }
    if (out.anyOf.every(isPlainType) && out.type === undefined) {
      const types = (out.anyOf as { type: string }[]).map(b => b.type);
      if (new Set(types).size === types.length) {
        delete out.anyOf;
        out.type = types;
      }
    } else if (out.anyOf.length > 1 && out.type === undefined) {
      // 4, 5, 6 or 7 numbers → array of number, 4 to 7 of them (when the lengths leave no gap).
      const ranges = out.anyOf.map(arrayRange);
      if (ranges.every(Boolean) && new Set(ranges.map(r => r!.items)).size === 1) {
        const sorted = [...ranges].sort((a, b) => a!.min - b!.min);
        const contiguous = sorted.every((r, i) => i === 0 || r!.min <= sorted[i - 1]!.max + 1);
        if (contiguous) {
          delete out.anyOf;
          out.type = 'array';
          out.items = JSON.parse(sorted[0]!.items);
          out.minItems = sorted[0]!.min;
          out.maxItems = Math.max(...sorted.map(r => r!.max));
        }
      }
    }
  }
  return out;
}

/** The input schema of a command as JSON Schema, every description kept (what `pgs_doc` reads). */
export function fullSchema(cmd: Command): Json {
  const shape = LOOKING.has(cmd.name)
    ? cmd.schema.shape
    : { ...cmd.schema.shape, preview: z.boolean().optional().describe('also return the image (default false)') };
  return compactSchema(z.toJSONSchema(z.object(shape), { target: 'draft-7', io: 'input' })) as Json;
}

export function withoutDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutDescriptions);
  if (!node || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v as Json).map(([name, s]) => [name, withoutDescriptions(s)]));
    } else if (k !== 'description' || typeof v !== 'string') {
      out[k] = withoutDescriptions(v);
    }
  }
  return out;
}

/** Whether a top-level field keeps its description in the catalog. */
export function publishesFieldDescription(field: string, description: string | undefined): boolean {
  if (!description) return false;
  if (field === 'preview') return false;
  if (SHARED_FIELDS[field] === description) return false;
  return description.length <= FIELD_DESCRIPTION_MAX;
}

/** The input schema the catalog shows: the whole structure, short top-level descriptions only. */
export function publishedSchema(cmd: Command): Json {
  const full = fullSchema(cmd);
  const properties: Json = {};
  for (const [field, schema] of Object.entries((full.properties ?? {}) as Record<string, Json>)) {
    const bare = withoutDescriptions(schema) as Json;
    const d = schema.description as string | undefined;
    properties[field] = publishesFieldDescription(field, d) ? { ...bare, description: d } : bare;
  }
  return { ...full, properties };
}

export interface PublishedTool {
  name: string;
  description: string;
  inputSchema: Json;
}

/** The commands `tools/list` shows: all of them in maps mode, else all but the scene steps. */
export function listedCommands<C extends Command>(cmds: readonly C[], maps: boolean): C[] {
  return maps ? [...cmds] : cmds.filter(c => !isSceneStep(c.name));
}

/** The whole `tools/list` answer, in registry order. */
export function publishedTools(cmds: readonly Command[]): PublishedTool[] {
  return cmds.map(cmd => ({
    name: `${TOOL_PREFIX}_${cmd.name}`,
    description: cmd.description,
    inputSchema: publishedSchema(cmd),
  }));
}

/** One line per field: `  path?  type  — description`. */
function typeWords(s: Json): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return s.enum.map(v => JSON.stringify(v)).join(' | ');
  if (Array.isArray(s.anyOf)) return (s.anyOf as Json[]).map(typeWords).join(' | ');
  if (Array.isArray(s.oneOf)) return (s.oneOf as Json[]).map(typeWords).join(' | ');
  const t = Array.isArray(s.type) ? (s.type as string[]).join(' | ') : (s.type as string | undefined) ?? 'any';
  if (t === 'array') {
    const items = Array.isArray(s.items) ? `[${(s.items as Json[]).map(typeWords).join(', ')}]` : s.items ? `${typeWords(s.items as Json)}[]` : 'array';
    if (Array.isArray(s.items)) return items;
    const min = s.minItems as number | undefined;
    const max = s.maxItems as number | undefined;
    if (min !== undefined && min === max) return `${items.slice(0, -2)}×${min}`;
    if (min !== undefined || max !== undefined) return `${items} (${min ?? 0}..${max ?? '∞'})`;
    return items;
  }
  if (t === 'object' && !s.properties && s.additionalProperties && typeof s.additionalProperties === 'object') {
    return `{ name: ${typeWords(s.additionalProperties as Json)} }`;
  }
  return t;
}

function fieldLines(schema: Json, indent: string, out: string[]) {
  const props = (schema.properties ?? {}) as Record<string, Json>;
  const required = new Set((schema.required ?? []) as string[]);
  for (const [name, s] of Object.entries(props)) {
    const d = s.description ? `  — ${s.description}` : '';
    out.push(`${indent}${name}${required.has(name) ? '' : '?'}  ${typeWords(s)}${d}`);
    for (const nested of nestedObjects(s)) fieldLines(nested, `${indent}    `, out);
  }
}

/** The object schemas inside a field (itself, its array items, the branches of a union). */
function nestedObjects(s: Json): Json[] {
  if (s.properties) return [s];
  const found: Json[] = [];
  if (s.items && !Array.isArray(s.items)) found.push(...nestedObjects(s.items as Json));
  if (Array.isArray(s.items)) for (const i of s.items as Json[]) found.push(...nestedObjects(i));
  for (const k of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(s[k])) for (const b of s[k] as Json[]) found.push(...nestedObjects(b));
  }
  if (s.additionalProperties && typeof s.additionalProperties === 'object') found.push(...nestedObjects(s.additionalProperties as Json));
  return found;
}

/** Everything about one command: what the catalog leaves out. */
export function commandDoc(cmd: Command): string {
  const lines = [`${cmd.name}: ${cmd.description}`];
  const scene = sceneLine(cmd.name);
  if (scene) lines.push(scene);
  if (cmd.details) lines.push('', cmd.details);
  lines.push('');
  fieldLines(fullSchema(cmd), '  ', lines);
  return lines.join('\n');
}
