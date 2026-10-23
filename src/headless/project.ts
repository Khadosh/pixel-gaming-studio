// What a project is, and how things are drawn in it.
//
// PGS knows how to draw *one* thing. Until now it did not know how things are
// drawn **here**: the palette, the light, the sizes and the contract lived in
// the arguments of each call and in the memory of whoever made them. Two assets
// of the same game came out different depending on who asked for them.
//
// A project is a folder with a `pgs.json` in it, and the disk is the truth.
//
// The style it holds has two halves, and both are needed:
//
//   - **Measured** — numbers and lists a lint can check. Answers "does this
//     break the style?".
//   - **Said** — a few lines of prose. Answers "how would I make a new one?".
//
// An agent with only numbers makes things that pass the lint and do not fit.
// An agent with only prose makes pretty things outside the palette.
//
// See `docs/diseno/crear_mundo.md`.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ProportionMap } from './proportions';

/** The file that makes a folder a project. */
export const PROJECT_FILE = 'pgs.json';

const size = z.tuple([z.number().int().positive(), z.number().int().positive()]);

/** 0..1 of a side: every number of a proportion map is one of these. */
const fraction = z.number().min(0).max(1);
const band = z.union([fraction, z.tuple([fraction, fraction])]);

/**
 * The proportion map (`proportions.ts`): where the lines of a body of this
 * project fall. Declared once here instead of patched per drawing, which is
 * what `anatomy` was: a correction for a guess that came out wrong on *that*
 * character.
 */
const proportionBase = {
  says: z.string().optional().describe('the build in prose: short and wide, long-limbed, a big head'),
  tolerance: fraction.optional()
    .describe('how far off a drawing may be, as a fraction of the side; never less than 1 px (default 0.04)'),
  rows: z.record(z.string(), fraction).optional()
    .describe('the lines down the body, 0 at the crown and 1 at the soles: menton, hombro, faja, ruedo, botas'),
  widths: z.record(z.string(), fraction).optional()
    .describe('the same scale across. A name that is also a row is measured at that row'),
  face: z.object({
    rows: z.record(z.string(), fraction).optional().describe('down the head box, 0 at its top: pelo, ojos, boca'),
    widths: z.record(z.string(), fraction).optional().describe('across the head box'),
  }).optional().describe('the features, inside the head, so a face survives a head that grows'),
  anatomy: z.object({
    neck: z.string().optional(), waist: z.string().optional(),
    knee: z.string().optional(), ankle: z.string().optional(),
    torso: z.string().optional().describe('the name of the WIDTH that is the shoulder'),
  }).optional().describe('which named line plays which part, so the engine can read a map it did not write'),
  ratios: z.record(z.string(), band).optional()
    .describe('the counts a lint makes: head_of_height, head_of_shoulder (the game\'s rule: never over 1)'),
  facing: z.array(z.string()).optional()
    .describe('the views where a width means what it says (default "", down, up): a profile is narrower on purpose'),
  poses: z.array(z.string()).optional()
    .describe('the animations the map describes, by role with the view taken off (default: idle). A map is the body standing'),
};

export const proportionsSchema = z.object({
  ...proportionBase,
  variants: z.record(z.string(), z.object(proportionBase)).optional()
    .describe('a map of its own for a size with a name: a 16x32 chibi is not a small adult'),
});

export const projectSchema = z.object({
  name: z.string().min(1).describe('the project, in words'),
  says: z.string().optional().describe('the style in prose: what a new asset should feel like'),

  visual: z.object({
    palette: z.string().optional().describe('path to the palette asset, the one source of color'),
    roles: z.record(z.string(), z.string()).optional().describe('what each color is for, by name'),
    grid: z.number().int().positive().optional()
      .describe('the unit a tile\'s side is a multiple of: 1 is the pixel (anything), 16 the cell of a map'),
    stroke: z.number().int().positive().optional()
      .describe('px of a line. A 1 px stroke at 16 px flickers and disappears against the background'),
    margin: z.number().int().nonnegative().optional()
      .describe('px of air on every side. Next to others, the one that touches the edge looks bigger'),
    sizes: z.record(z.string(), size).optional().describe('canvas sizes with a name, so nobody invents one'),
    light: z.object({
      from: z.string().optional(),
      strength: z.string().optional(),
    }).optional(),
    outline: z.object({ use: z.boolean(), color: z.string().optional() }).optional(),
    dither: z.object({ use: z.boolean() }).optional(),
    contract: z.union([z.string(), z.record(z.string(), z.string().nullable())]).optional()
      .describe('animation contract (built-in name or JSON path), or one per class: { "<size name or asset id>": contract | null }'),
    proportions: proportionsSchema.optional()
      .describe('where the lines of a body fall, so every character is born from one map'),
  }).optional(),

  type: z.object({
    font: z.string().optional().describe('path to the glyph sheet'),
    steps: z.array(z.number().int().positive()).optional()
      .describe('the only bodies allowed; a pixel font is sharp at its design size and its whole multiples'),
  }).optional(),

  sound: z.object({
    says: z.string().optional(),
    scale: z.string().optional(),
    tuning: z.number().positive().optional(),
    rate: z.number().int().positive().optional(),
    materials: z.array(z.string()).optional(),
    lengths: z.record(z.string(), z.number().positive()).optional(),
  }).optional(),
});

export type ProjectStyle = z.infer<typeof projectSchema>;

export interface Project {
  /** Absolute path of the `pgs.json`. */
  file: string;
  /** The folder that holds it: every relative path in the style is resolved against this. */
  dir: string;
  style: ProjectStyle;
}

/**
 * The nearest project walking **up** from `from` (a file or a folder), or
 * undefined. Up and not down on purpose: a command run deep inside a project
 * belongs to it, and a folder of projects is not itself one.
 */
export function findProject(from: string): string | undefined {
  const start = resolve(from);
  let dir = isDirectory(start) ? start : dirname(start);
  const root = parse(dir).root;
  for (;;) {
    const candidate = join(dir, PROJECT_FILE);
    if (existsSync(candidate)) return candidate;
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
}

/** A path that does not exist is treated as a file, so we look next to it. */
function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Reads and validates a `pgs.json`. Throws with the field that is wrong. */
export function loadProject(file: string): Project {
  const raw = readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  const result = projectSchema.safeParse(parsed);
  if (!result.success) {
    const where = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`${file} is not a project: ${where}`);
  }
  return { file, dir: dirname(file), style: result.data };
}

/** The nearest project above `near`, read and validated, or undefined. */
export function nearestProject(near: string): Project | undefined {
  const file = findProject(near);
  return file ? loadProject(file) : undefined;
}

/**
 * The `pgs.json` as a command names it in its answer: relative to where it
 * runs (`./pgs.json` right here), absolute when that would be a ladder of `..`.
 */
export function shownProjectPath(file: string, cwd = process.cwd()): string {
  const rel = relative(cwd, file).split('\\').join('/');
  if (rel.split('/').filter((s) => s === '..').length > 3) return file;
  return rel.startsWith('..') ? rel : `./${rel}`;
}

/**
 * The one line a command that inherits prints: what it took and from where.
 * The style inherits so nobody repeats it, and it says so, because a style
 * that works by magic is the thing `pgs.json` was written to end.
 */
export function inheritedLine(file: string, what: string[]): string {
  return `heredado de ${shownProjectPath(file)}: ${what.join(', ')}`;
}

/**
 * Where the light comes **from**, in words (`visual.light.from`), as the map
 * recipes' `light`: the direction the shadows **fall**, the opposite one. So
 * `upper_left` is `[1, 1]`, the default of every recipe. Spanish and English.
 */
const LIGHT_FROM: Record<string, [number, number]> = {
  upper_left: [1, 1], top_left: [1, 1], arriba_izquierda: [1, 1],
  upper_right: [-1, 1], top_right: [-1, 1], arriba_derecha: [-1, 1],
  lower_left: [1, -1], bottom_left: [1, -1], abajo_izquierda: [1, -1],
  lower_right: [-1, -1], bottom_right: [-1, -1], abajo_derecha: [-1, -1],
  top: [0, 1], upper: [0, 1], above: [0, 1], arriba: [0, 1],
  bottom: [0, -1], lower: [0, -1], below: [0, -1], abajo: [0, -1],
  left: [1, 0], izquierda: [1, 0],
  right: [-1, 0], derecha: [-1, 0],
};

/** The world's light as a recipe's `light`, or why it cannot be one. */
export function worldLight(style: ProjectStyle): { dir?: [number, number]; from?: string; error?: string } {
  const from = style.visual?.light?.from;
  if (!from) return {};
  const dir = LIGHT_FROM[from.trim().toLowerCase().replace(/[\s-]+/g, '_')];
  if (!dir) return { from, error: `visual.light.from «${from}» no es una dirección (upper_left, upper_right, lower_left, lower_right, top, bottom, left, right, o en castellano: arriba_izquierda…)` };
  return { dir, from };
}

/**
 * A mirror turns the light round with the drawing: lit from the left, a figure
 * mirrored is lit from the right (el patio, Gato 6: "una mentira chica"). The
 * engine cannot shade it again for you, so it says so when the world's light
 * comes from a side, naming what was mirrored. Nothing when the light is
 * straight above or below, or the world says none.
 */
export function mirrorLightWarning(path: string, mirrored: string[]): string | undefined {
  if (!mirrored.length) return undefined;
  const project = nearestProject(path);
  if (!project) return undefined;
  const w = worldLight(project.style);
  if (!w.dir || w.dir[0] === 0) return undefined;
  return `${mirrored.join(', ')}: mirrored, so the light of ${shownProjectPath(project.file)} (${w.from}) now comes from the other side; if the lit edges matter, write the frames that change as "== <frame> < <the one it mirrors>" with "flip: h" and the rows to fix`;
}

/** A path written in the style, resolved against the project folder. */
export function projectPath(project: Project, p: string): string {
  return isAbsolute(p) ? p : resolve(project.dir, p);
}

/** The project's proportion map, if it declares one. */
export function projectProportions(style: ProjectStyle): ProportionMap | undefined {
  return style.visual?.proportions as ProportionMap | undefined;
}

/**
 * The variant a canvas of this size picks by itself: the name in `visual.sizes`
 * whose dimensions it matches, when the map has a variant by that name. So a
 * project that already calls 16x32 "chibi" gets the chibi map for free, and
 * nobody passes the name around.
 */
export function variantForSize(style: ProjectStyle, width: number, height: number): string | undefined {
  const map = projectProportions(style);
  if (!map?.variants) return undefined;
  for (const [name, [w, h]] of Object.entries(style.visual?.sizes ?? {})) {
    if (w === width && h === height && map.variants[name]) return name;
  }
  return undefined;
}

/** The name `visual.sizes` gives a canvas of this size, if any. */
export function sizeName(style: ProjectStyle, width: number, height: number): string | undefined {
  for (const [name, [w, h]] of Object.entries(style.visual?.sizes ?? {})) if (w === width && h === height) return name;
  return undefined;
}

/**
 * The contract of the world for one asset, as written (a built-in name or a
 * path relative to the project). One `visual.contract` for every character
 * was fine for a world with one kind of character; el patio has a cat that
 * walks, critters that peek out of a hole and a row of icons, and an inherited
 * contract made all of them fail but the cat (#36). So the field may also be a
 * map of classes: the key is an asset id or a name of `visual.sizes` (the
 * canvas picks it, as it picks the proportion variant), the id first; `null`
 * is "no contract". `class` is the key that matched; `none` says why there is
 * no contract: declared null, or the asset falls in no class.
 */
export function contractFor(style: ProjectStyle, id: string, width: number, height: number):
  { spec?: string; class?: string; none?: 'null' | 'unclassed' } {
  const c = style.visual?.contract;
  if (c === undefined) return {};
  if (typeof c === 'string') return { spec: c };
  const size = sizeName(style, width, height);
  const key = id in c ? id : size !== undefined && size in c ? size : undefined;
  if (key === undefined) return { none: 'unclassed' };
  const spec = c[key];
  return spec === null ? { class: key, none: 'null' } : { spec, class: key };
}

/**
 * What each field of a `pgs.json` is read by: the foot of `pgs project`, so
 * whoever writes one knows which line does something and which is for reading
 * (the F0 of el patio: the design promised inheritance and no command said
 * what it took). Keep it in step with the table in docs/diseno/crear_mundo.md.
 */
export const FIELD_READERS: [string, string][] = [
  ['visual.palette', 'lint (sin palette), from_ascii (sin fit: avisa)'],
  ['visual.grid', 'lint: el lado de un tile'],
  ['visual.sizes', 'lint (un sprite de otro tamaño avisa), el contrato por clase, la variante de proporciones'],
  ['visual.contract', 'lint (sin contract)'],
  ['visual.proportions', 'lint, animate, figure'],
  ['visual.light.from', 'map_render, map_export, map_compare, map_lint (receta sin light)'],
  ['type.font', 'font, font_web, font_contact (sin path)'],
  ['type.steps', 'font_contact (las escalas de la fuente del mundo)'],
  ['sound.rate', 'sound, music'],
  ['sound.tuning', 'sound y music, sus notas'],
  ['sound.scale', 'sound y music: una nota fuera avisa'],
  ['sound.lengths', 'sound: "duration": "short"'],
  ['sound.materials', 'sound: "material" fuera de la lista avisa'],
  ['(sólo para leer)', 'says, roles, stroke, margin, light.strength, outline, dither: ningún comando los toma'],
];

function row(label: string, value: string): string {
  return `  ${label.padEnd(10)} ${value}`;
}

function fractions(r: Record<string, number> | undefined): string {
  return Object.entries(r ?? {}).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');
}

/** The proportion map as something to read, which is half of why it exists. */
export function proportionsBrief(map: ProportionMap): string[] {
  const lines: string[] = [];
  if (map.says) lines.push(...map.says.trim().split('\n').map((l) => `  ${l.trim()}`));
  if (map.rows) lines.push(row('filas', fractions(map.rows)));
  if (map.widths) lines.push(row('anchos', fractions(map.widths)));
  if (map.face?.rows) lines.push(row('facciones', fractions(map.face.rows)));
  if (map.ratios) {
    lines.push(row('cuentas', Object.entries(map.ratios)
      .map(([k, v]) => `${k} ${typeof v === 'number' ? v.toFixed(2) : `${v[0].toFixed(2)}–${v[1].toFixed(2)}`}`)
      .join(' · ')));
  }
  if (map.facing) lines.push(row('de frente', map.facing.map((v) => v || '(sin vista)').join(', ')));
  if (map.variants) lines.push(row('variantes', Object.keys(map.variants).join(', ')));
  return lines;
}

/**
 * The style as something to read: the prose first, then what a lint can check.
 * This is the first thing an agent sees when it enters a project.
 */
export function projectBrief(project: Project): string {
  const s = project.style;
  const out: string[] = [`${s.name} — ${project.dir}`];
  if (s.says) out.push('', ...s.says.trim().split('\n').map((l) => `  ${l.trim()}`));

  const v = s.visual;
  if (v) {
    const lines: string[] = [];
    if (v.palette) lines.push(row('paleta', v.palette));
    if (v.roles) lines.push(row('papeles', Object.entries(v.roles).map(([k, c]) => `${k}=${c}`).join(' · ')));
    if (v.grid !== undefined) lines.push(row('grilla', `${v.grid} px`));
    if (v.stroke !== undefined) lines.push(row('trazo', `${v.stroke} px`));
    if (v.margin !== undefined) lines.push(row('margen', `${v.margin} px`));
    if (v.sizes) lines.push(row('tamaños', Object.entries(v.sizes).map(([k, [w, h]]) => `${k} ${w}x${h}`).join(' · ')));
    if (v.light) lines.push(row('luz', [v.light.from, v.light.strength].filter(Boolean).join(', ')));
    if (v.outline) lines.push(row('contorno', v.outline.use ? (v.outline.color ?? 'sí') : 'no'));
    if (v.dither) lines.push(row('trama', v.dither.use ? 'sí' : 'no'));
    if (v.contract) {
      lines.push(row('contrato', typeof v.contract === 'string' ? v.contract
        : Object.entries(v.contract).map(([k, c]) => `${k}=${c ?? 'ninguno'}`).join(' · ')));
    }
    if (lines.length) out.push('', 'Visual', ...lines);
    const p = projectProportions(s);
    if (p) out.push('', 'Proporciones', ...proportionsBrief(p));
  }

  if (s.type) {
    const lines: string[] = [];
    if (s.type.font) lines.push(row('fuente', s.type.font));
    if (s.type.steps) lines.push(row('cuerpos', `${s.type.steps.join(', ')} px — y ningún otro`));
    if (lines.length) out.push('', 'Letra', ...lines);
  }

  const d = s.sound;
  if (d) {
    const lines: string[] = [];
    if (d.says) lines.push(...d.says.trim().split('\n').map((l) => `  ${l.trim()}`));
    if (d.scale) lines.push(row('escala', d.scale));
    if (d.tuning !== undefined) lines.push(row('afinación', `${d.tuning} Hz`));
    if (d.rate !== undefined) lines.push(row('muestreo', `${d.rate} Hz`));
    if (d.materials) lines.push(row('materiales', d.materials.join(', ')));
    if (d.lengths) lines.push(row('duraciones', Object.entries(d.lengths).map(([k, n]) => `${k} ${n}s`).join(' · ')));
    if (lines.length) out.push('', 'Sonido', ...lines);
  }

  out.push('', 'Quién lee cada campo', ...FIELD_READERS.map(([f, who]) => `  ${f.padEnd(19)} ${who}`));
  return out.join('\n');
}
