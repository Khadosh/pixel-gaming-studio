// Variants of a map recipe: the states of one place (a door open and closed,
// day and night, before and after an event) written as the changes over the
// recipe, by step id, instead of a copy of the whole recipe that has to be
// derived again every time the base changes (the patio, the second game made
// with PGS, did that with ten lines of Python: el-patio DIARIO.md, Mapa 15).
//
// Pure. `renderRecipe` applies it before anything else is read, so map_render,
// map_export, map_lint and every other map_* inherit it.

import { ZodError } from 'zod';
import { recipeSchema, type MapRecipe, type MapStep } from './maprecipe';

const idOf = (st: MapStep): string | undefined => ('id' in st && typeof st.id === 'string' ? st.id : undefined);

/** The names of the variants of a recipe, in the order they are written. */
export function variantNames(recipe: MapRecipe): string[] {
  return Object.keys(recipe.variants ?? {});
}

/**
 * The recipe of one variant: the base with its steps removed, changed and added
 * by id, its materials, colors and light changed, and its export renamed
 * (`export.id + "_" + name` unless the variant says otherwise; `export.ids`,
 * the whole ids of the base's files, are not inherited so a state never writes
 * over the base). A step id that is not there stops it with the ids that are:
 * a typo must not quietly give the base.
 */
export function applyVariant(recipe: MapRecipe, name: string | undefined): MapRecipe {
  if (name === undefined || name === '') return recipe;
  const v = recipe.variants?.[name];
  const where = `map: variant "${name}"`;
  if (!v) {
    const have = variantNames(recipe);
    throw new Error(`${where}: not in the recipe (${have.length ? `variants: ${have.join(', ')}` : 'it has no variants'})`);
  }
  let steps = [...recipe.steps];
  const has = (id: string) => steps.some(st => idOf(st) === id);
  const missing = (id: string, what: string) =>
    new Error(`${where}: ${what} "${id}": no step has that id (ids: ${steps.map(idOf).filter(Boolean).join(', ') || 'none'})`);

  for (const id of v.remove ?? []) {
    if (!has(id)) throw missing(id, 'remove');
    steps = steps.filter(st => idOf(st) !== id);
  }
  for (const [id, fields] of Object.entries(v.set ?? {})) {
    if (!has(id)) throw missing(id, (v.remove ?? []).includes(id) ? 'set (it is also in remove)' : 'set');
    if ('id' in fields && fields.id !== id) throw new Error(`${where}: set "${id}": a step keeps its id (remove it and add another)`);
    steps = steps.map(st => (idOf(st) === id ? ({ ...st, ...fields } as MapStep) : st));
  }
  // two steps added after the same one keep the order they are written in
  const lastAfter = new Map<string, MapStep>();
  for (const [i, entry] of (v.add ?? []).entries()) {
    const { after, before, ...step } = entry as { after?: unknown; before?: unknown } & Record<string, unknown>;
    const label = `add ${i}${typeof step.id === 'string' ? ` ("${step.id}")` : ''}`;
    if (after !== undefined && before !== undefined) throw new Error(`${where}: ${label}: after or before, not both`);
    if (typeof step.id === 'string' && has(step.id)) throw new Error(`${where}: ${label}: the recipe already has a step "${step.id}" (set changes it)`);
    const anchor = (after ?? before) as string | undefined;
    if (anchor !== undefined && typeof anchor !== 'string') throw new Error(`${where}: ${label}: after/before is a step id`);
    if (anchor !== undefined && !has(anchor)) throw missing(anchor, `${label}: ${after !== undefined ? 'after' : 'before'}`);
    const st = step as unknown as MapStep;
    if (anchor === undefined) steps.push(st);
    else if (before !== undefined) steps.splice(steps.findIndex(s => idOf(s) === anchor), 0, st);
    else {
      const prev = lastAfter.get(anchor);
      const at = prev ? steps.indexOf(prev) : steps.findIndex(s => idOf(s) === anchor);
      steps.splice(at + 1, 0, st);
      lastAfter.set(anchor, st);
    }
  }

  const { ids: _ids, ...inherited } = recipe.export ?? { id: 'mapa' };
  const exp = { ...inherited, id: `${recipe.export?.id ?? 'mapa'}_${name}`, ...(v.export ?? {}) };
  const { variants: _variants, ...base } = recipe;
  const merged = {
    ...base,
    steps,
    materials: Object.fromEntries(Object.entries({ ...recipe.materials, ...(v.materials ?? {}) }).filter(([, m]) => m !== null)),
    ...(v.colors ? { colors: { ...(recipe.colors ?? {}), ...v.colors } } : {}),
    ...(v.shade ? { shade: { ...(recipe.shade ?? {}), ...v.shade } } : {}),
    ...(v.lighten ? { lighten: { ...(recipe.lighten ?? {}), ...v.lighten } } : {}),
    ...(v.light !== undefined ? { light: v.light } : {}),
    ...(v.seed !== undefined ? { seed: v.seed } : {}),
    export: exp,
  };
  try {
    return recipeSchema.parse(merged);
  } catch (err) {
    if (!(err instanceof ZodError)) throw err;
    const issues = err.issues.map(x => `${x.path.join('.') || '(recipe)'}: ${x.message}`).join('; ');
    throw new Error(`${where}: the recipe it gives is not valid: ${issues}`);
  }
}

/** Whether exporting this variant writes the game map's ground: only when the variant declares its own (the base's is the base's). */
export function variantWritesGround(recipe: MapRecipe, name: string | undefined): boolean {
  if (!name) return true;
  return !!recipe.variants?.[name]?.export && 'ground' in (recipe.variants[name].export ?? {});
}
