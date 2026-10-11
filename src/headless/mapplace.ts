// A recipe inside another one: the `place` step. A place (a temple compound, a
// garden, a pier) is drawn once as a sub-recipe in its own cells, its origin at
// (0, 0), and laid on a map at `at`. Moving it is changing `at`, nothing else.
//
// Before painting, every place is inlined: each step of the sub-recipe moved to
// `at` (every coordinate in cells of the steps that can be laid; a step that is
// not one of them stops the recipe), in the place of the `place` step, so the
// painter sees the same steps it would see written inline — same order, same
// masks (`on`, `avoid`, `within` resolve as inline) — and paints with the
// palette of the mother. The sub-recipe's materials and colors join the
// mother's (the same name twice must say the same thing). A grove of the
// sub-recipe with `into` adds its trees to that grove of the mother instead of
// being one of its own. `reserve` registers the rectangle of the sub-recipe
// (its `size`) as a mask of the mother, there from the first step.

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { materialSchema, recipeSchema, stepSchema, type MapRecipe, type MapStep } from './maprecipe';

const at = (base: string, p: string) => (isAbsolute(p) ? p : resolve(dirname(base), p));

/** A sub-recipe: a recipe without a game of its own (it paints on the mother's). */
export const subRecipeSchema = z.object({
  materials: z.record(z.string(), materialSchema).optional(),
  colors: z.record(z.string(), z.string()).optional(),
  size: z.tuple([z.number(), z.number()]).optional(),
  steps: z.array(stepSchema),
});
export type SubRecipe = z.infer<typeof subRecipeSchema>;

// What moves in each step that can be laid by a place: a path of keys ("[]" = each item of a list) and what it
// holds. u / v: one coordinate; uv: a point (its first two numbers); u2 / v2: a [from, to] pair; box: [u0, v0, u1,
// v1]; rect: [u, v, w, h]; shape: a shape of an area or water; pts: a list of points.
type Kind = 'u' | 'v' | 'uv' | 'pts' | 'u2' | 'v2' | 'box' | 'shape';
const MOVES: Partial<Record<MapStep['step'], [string, Kind][]>> = {
  area: [['shape', 'shape'], ['wear', 'uv'], ['holes[]', 'u']],
  water: [['shape', 'shape']],
  path: [['points[]', 'uv'], ['clearings[]', 'uv'], ['branches[].points[]', 'uv'], ['widen[].at', 'v'], ['stairs.to', 'v']],
  scatter: [['at[]', 'uv'], ['around', 'uv']],
  courses: [['box', 'box'], ['wear.lanes[]', 'uv'], ['wear.rings[]', 'uv'], ['wear.spots.at[]', 'uv']],
  parapet: [['path', 'pts'], ['gaps[]', 'pts'], ['moss.skip', 'u2']],
  roof: [['rect', 'uv']],
  chimney: [['at', 'uv']],
  smoke: [['at', 'uv']],
  fence: [['path', 'pts'], ['gaps[]', 'pts']],
  building: [['rect', 'uv']],
  beds: [['beds[]', 'uv']],
  stall: [['rect', 'uv']],
  rope: [['from', 'uv'], ['to', 'uv']],
  ashlar: [['x', 'u2'], ['y', 'v2'], ['sink.x', 'u2'], ['moss.x', 'u2'], ['moss.skip', 'u2']],
  stairway: [['x', 'u2'], ['from', 'v'], ['to', 'v'], ['middle', 'u'], ['worn.rock.from', 'v'], ['worn.hold', 'v']],
  runner: [['x', 'u2'], ['y', 'v2'], ['middle', 'u']],
  umbra: [['ovals[]', 'uv'], ['bands[].rows', 'v2'], ['bands[].x', 'u2']],
  rocks: [['at[]', 'uv']],
  crag: [['masses[]', 'uv'], ['cleft', 'uv'], ['mouth.at', 'uv']],
  wetstones: [['stones[].at', 'uv']],
  drifts: [['at[]', 'uv']],
  grove: [['trees[]', 'uv'], ['keep[]', 'uv'], ['behind[]', 'uv'], ['clear[]', 'uv'], ['zones[].box', 'box']],
  feature: [['at', 'uv']],
  settle: [],
};

// a moved coordinate is snapped to a millionth: 12.7 + 7 is the 19.7 a recipe would have written inline
const snap = (x: number) => Math.round(x * 1e6) / 1e6;

function move(value: unknown, kind: Kind, du: number, dv: number, where: string): unknown {
  const nums = (n: number) => {
    if (!Array.isArray(value) || value.length < n || value.slice(0, n).some(x => typeof x !== 'number')) throw new Error(`map: place: ${where} is not ${n} numbers`);
    return value as number[];
  };
  switch (kind) {
    case 'u': return snap((value as number) + du);
    case 'v': return snap((value as number) + dv);
    case 'uv': { const a = nums(2); return [snap(a[0] + du), snap(a[1] + dv), ...a.slice(2)]; }
    case 'pts': return (value as unknown[]).map((p, i) => move(p, 'uv', du, dv, `${where}[${i}]`));
    case 'u2': { const a = nums(2); return [snap(a[0] + du), snap(a[1] + du)]; }
    case 'v2': { const a = nums(2); return [snap(a[0] + dv), snap(a[1] + dv)]; }
    case 'box': { const a = nums(4); return [snap(a[0] + du), snap(a[1] + dv), snap(a[2] + du), snap(a[3] + dv)]; }
    case 'shape': {
      const s = value as Record<string, unknown>;
      if (s && typeof s === 'object' && 'blobs' in s) return { ...s, blobs: (s.blobs as unknown[]).map((b, i) => move(b, 'uv', du, dv, `${where}.blobs[${i}]`)) };
      if (s && typeof s === 'object' && 'rect' in s) { const r = s.rect as number[]; return { ...s, rect: [snap(r[0] + du), snap(r[1] + dv), r[2], r[3]] }; }
      if (s && typeof s === 'object' && 'curve' in s) return { ...s, curve: (s.curve as unknown[]).map((p, i) => move(p, 'uv', du, dv, `${where}.curve[${i}]`)) };
      throw new Error(`map: place: ${where}: only blobs, rect and curve shapes can be laid by a place (all, cells, between, outside and poke are the mother's)`);
    }
  }
}

/** Walks a path of keys and moves what is at its end (absent keys are left alone). */
function moveAt(obj: unknown, keys: string[], kind: Kind, du: number, dv: number, where: string): unknown {
  if (obj === undefined || obj === null) return obj;
  if (!keys.length) return move(obj, kind, du, dv, where);
  const [k, ...rest] = keys;
  if (k.endsWith('[]')) {
    const name = k.slice(0, -2), list = (obj as Record<string, unknown>)[name];
    if (list === undefined) return obj;
    return { ...(obj as object), [name]: (list as unknown[]).map((x, i) => moveAt(x, rest, kind, du, dv, `${where}.${name}[${i}]`)) };
  }
  const o = obj as Record<string, unknown>;
  if (o[k] === undefined) return obj;
  return { ...o, [k]: moveAt(o[k], rest, kind, du, dv, `${where}.${k}`) };
}

/** One step of a sub-recipe, moved by (du, dv) cells. */
export function moveStep(st: MapStep, du: number, dv: number, where: string = st.step): MapStep {
  const moves = MOVES[st.step];
  if (!moves) throw new Error(`map: place: a ${st.step} step cannot be laid by a place yet (can: ${Object.keys(MOVES).join(', ')}); add what moves in it to MOVES in mapplace.ts`);
  let out: unknown = st;
  for (const [path, kind] of moves) out = moveAt(out, path.split('.'), kind, du, dv, where);
  return out as MapStep;
}

function joinNamed<T>(into: Record<string, T>, from: Record<string, T> | undefined, what: string, file: string): void {
  for (const [name, v] of Object.entries(from ?? {})) {
    if (name in into && JSON.stringify(into[name]) !== JSON.stringify(v)) throw new Error(`map: place: ${file}: the ${what} "${name}" is also in the mother recipe, with something else`);
    into[name] = v;
  }
}

/**
 * Every `place` step of a recipe inlined (and those of its sub-recipes, recursively): the recipe the painter sees.
 * A recipe with no place comes back as it is.
 */
export function expandPlaces(recipe: MapRecipe, recipePath: string, chain: string[] = []): MapRecipe {
  if (!recipe.steps.some(st => st.step === 'place')) return recipe;
  const materials = { ...recipe.materials }, colors = { ...(recipe.colors ?? {}) };
  const masks: Record<string, [number, number, number, number][]> = { ...(recipe.masks ?? {}) };
  const joins: { into: string; trees: NonNullable<Extract<MapStep, { step: 'grove' }>['trees']>; file: string }[] = [];
  const steps: MapStep[] = [];
  for (const st of recipe.steps) {
    if (st.step !== 'place') { steps.push(st); continue; }
    const file = at(recipePath, st.recipe);
    if (chain.includes(file)) throw new Error(`map: place: ${st.recipe} lays itself (${[...chain, file].join(' → ')})`);
    const sub = subRecipeSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    // its own places first, in its own cells
    const inner = expandPlaces({ ...recipeSchema.parse({ game: { width: 1, height: 1, grid: ['.'] }, materials: sub.materials ?? {}, colors: sub.colors, steps: sub.steps }) }, file, [...chain, recipePath]);
    joinNamed(materials, inner.materials, 'material', st.recipe);
    joinNamed(colors, inner.colors, 'color', st.recipe);
    for (const [id, rects] of Object.entries(inner.masks ?? {})) (masks[id] ??= []).push(...rects.map(([u, v, w, h]): [number, number, number, number] => [snap(u + st.at[0]), snap(v + st.at[1]), w, h]));
    if (st.reserve) {
      if (!sub.size) throw new Error(`map: place: ${st.recipe} has no size: "reserve" needs the rectangle of the sub-recipe`);
      (masks[st.reserve] ??= []).push([st.at[0], st.at[1], sub.size[0], sub.size[1]]);
    }
    const [du, dv] = st.at;
    inner.steps.forEach((s0, i) => {
      const s = moveStep(s0, du, dv, `${st.recipe} step ${i} (${s0.step}${'id' in s0 && s0.id ? ` "${s0.id}"` : ''})`);
      if (s.step === 'grove' && s.into) {
        const extra = Object.keys(s).filter(k => !['step', 'into', 'trees', 'id'].includes(k));
        if (extra.length) throw new Error(`map: place: ${st.recipe}: a grove with "into" only brings trees (has ${extra.join(', ')})`);
        joins.push({ into: s.into, trees: s.trees ?? [], file: st.recipe });
        return;
      }
      // a stamp drawn from a file: the file is the sub-recipe's, not the mother's
      // a scatter of the place stays in its rectangle (tufts, flowers, dew are tried over the whole mother)
      const kept = s.step === 'scatter' && st.reserve && !s.at && !s.within ? { ...s, within: [st.reserve] } : s;
      if (kept.step === 'scatter' && kept.draw) steps.push({ ...kept, draw: at(file, kept.draw) });
      else steps.push(kept);
    });
  }
  for (const j of joins) {
    const i = steps.findIndex(s => s.step === 'grove' && s.id === j.into);
    if (i < 0) throw new Error(`map: place: ${j.file}: its trees go "into" the grove "${j.into}", and the mother recipe has none with that id`);
    const g = steps[i] as Extract<MapStep, { step: 'grove' }>;
    steps[i] = { ...g, trees: [...(g.trees ?? []), ...j.trees] };
  }
  const out: MapRecipe = { ...recipe, materials, steps };
  if (Object.keys(colors).length) out.colors = colors;
  if (Object.keys(masks).length) out.masks = masks;
  return out;
}
