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
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
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
    grid: z.number().int().positive().optional().describe('the pixel unit; everything is a multiple of it'),
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
    contract: z.string().optional().describe('animation contract id (see contract.ts)'),
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
    if (v.contract) lines.push(row('contrato', v.contract));
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

  return out.join('\n');
}
