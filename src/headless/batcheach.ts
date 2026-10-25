// A step of a batch that stands for many: `each`.
//
// Most of the steps of the game recipes are the same step written again with
// another name, another turn or another look: 1,080 of the 1,096 steps of the
// studio's people are one voxel call per person, pose and direction, and 220 of
// its furniture are four turns of 86 pieces. Nobody wrote them: a Python script
// did, so the recipe in git was a dump nobody reads and every merge clashed on
// it (Khadosh/pixel-gaming-studio#54).
//
// `each` says the loop in the recipe instead:
//
//   { "command": "voxel", "each": { "giro": [0, 90, 180, 270] },
//     "model": "art/voxel/silla.voxel.json", "rotate": "{giro}",
//     "out": "art/src/silla_{giro}.pss.json" }
//
// is four steps, one per value, and with more than one name the product of
// them all, the first name outermost (the order of nested loops). A value can
// be an object, whose fields are `{name.field}`: that is how two things go
// together (the model a direction is drawn from and the name it gets) without
// a product between them.
//
// The rules of a placeholder:
// - It is replaced in every string of the arguments, however deep.
// - A string that is only the placeholder takes the value as it is: `"{giro}"`
//   is the number 90, not "90", so the schema sees what it would have seen.
// - A string that is only the placeholder and whose value is `null` takes the
//   argument **out** (or the item out of a list): a direction that is not
//   turned has no `rotate` at all, instead of a `rotate: 0` that might not mean
//   the same to every command.
// - A `{word}` that is not a name of `each` is left alone: `"*_{view}"` is what
//   `stamp` itself reads.
// - A `{name.field}` the value does not have, or an object put in the middle of
//   a string, stops the batch naming the step and the values: a recipe that
//   does not expand does not plan.
//
// The expanded steps are what the plan checks, so a typo in one value is named
// with that value. Two of them that would write the same `out` are refused too:
// it is the forgotten placeholder, and the second would overwrite the first.

/** One combination of the values of `each`, by name. */
export type EachVars = Record<string, unknown>;

/** Past this many steps out of one, it is a mistake, not a recipe. */
export const EACH_MAX = 10000;

const PLACEHOLDER = /\{([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?\}/g;
const ALONE = /^\{([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?\}$/;

/** Marks an argument (or a list item) a `null` value takes out. */
const DROP = Symbol('drop');

/** Every combination of the lists of `each`, the first name outermost. */
export function eachCombinations(each: unknown, where: string): EachVars[] {
  if (!each || typeof each !== 'object' || Array.isArray(each)) {
    throw new Error(`${where}: "each" is an object of names and their values, { "giro": [0, 90, 180, 270] }`);
  }
  const names = Object.keys(each);
  if (!names.length) throw new Error(`${where}: "each" has no names`);
  let combos: EachVars[] = [{}];
  for (const name of names) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`${where}: "${name}" cannot be a name of "each" (letters, digits and _, not first a digit)`);
    }
    const values = (each as Record<string, unknown>)[name];
    if (!Array.isArray(values) || !values.length) {
      throw new Error(`${where}: each.${name} must be a list with at least one value`);
    }
    values.forEach((v, i) => {
      if (Array.isArray(v)) throw new Error(`${where}: each.${name}[${i}] is a list; a value is a number, a string, a boolean, null or an object`);
    });
    if (combos.length * values.length > EACH_MAX) {
      throw new Error(`${where}: "each" makes more than ${EACH_MAX} steps`);
    }
    combos = combos.flatMap(c => values.map(v => ({ ...c, [name]: v })));
  }
  return combos;
}

/** `giro=90 dir=xpyp`: the combination as a label, for errors and the report. */
export function eachLabel(vars: EachVars): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}=${v && typeof v === 'object' ? labelOfObject(v as Record<string, unknown>) : String(v)}`)
    .join(' ');
}

function labelOfObject(o: Record<string, unknown>): string {
  return `{${Object.entries(o).map(([k, v]) => `${k}:${v && typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(',')}}`;
}

function lookup(vars: EachVars, name: string, field: string | undefined, where: string): { found: boolean; value?: unknown } {
  if (!(name in vars)) return { found: false };
  const v = vars[name];
  if (field === undefined) return { found: true, value: v };
  if (!v || typeof v !== 'object') {
    throw new Error(`${where}: {${name}.${field}} but ${name} is ${JSON.stringify(v)}, not an object`);
  }
  if (!(field in (v as object))) {
    throw new Error(`${where}: {${name}.${field}} but ${name} has no "${field}" (it has ${Object.keys(v as object).join(', ') || 'nothing'})`);
  }
  return { found: true, value: (v as Record<string, unknown>)[field] };
}

function substitute(value: unknown, vars: EachVars, where: string): unknown {
  if (typeof value === 'string') {
    const alone = ALONE.exec(value);
    if (alone) {
      const hit = lookup(vars, alone[1], alone[2], where);
      if (hit.found) return hit.value === null ? DROP : hit.value;
      return value;
    }
    return value.replace(PLACEHOLDER, (whole, name: string, field: string | undefined) => {
      const hit = lookup(vars, name, field, where);
      if (!hit.found) return whole;
      if (hit.value === null || typeof hit.value === 'object') {
        throw new Error(`${where}: ${whole} is ${JSON.stringify(hit.value)}, which cannot go in the middle of "${value}"`);
      }
      return String(hit.value);
    });
  }
  if (Array.isArray(value)) {
    return value.map(v => substitute(v, vars, where)).filter(v => v !== DROP);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const s = substitute(v, vars, where);
      if (s !== DROP) out[k] = s;
    }
    return out;
  }
  return value;
}

/** The arguments of a step with the values of one combination put in. */
export function fillStep(args: Record<string, unknown>, vars: EachVars, where: string): Record<string, unknown> {
  return substitute(args, vars, where) as Record<string, unknown>;
}

/** Names of `each` that no argument of the step uses: almost always a typo in the step. */
export function unusedNames(args: Record<string, unknown>, names: string[]): string[] {
  const used = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(PLACEHOLDER)) used.add(m[1]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(args);
  return names.filter(n => !used.has(n));
}
