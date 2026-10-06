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

/** The file that makes a folder a project. */
export const PROJECT_FILE = 'pgs.json';

const size = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export const projectSchema = z.object({
  name: z.string().min(1).describe('the project, in words'),
  says: z.string().optional().describe('the style in prose: what a new asset should feel like'),

  visual: z.object({
    palette: z.string().optional().describe('path to the palette asset, the one source of color'),
    roles: z.record(z.string(), z.string()).optional().describe('what each color is for, by name'),
    grid: z.number().int().positive().optional().describe('the pixel unit; everything is a multiple of it'),
    sizes: z.record(z.string(), size).optional().describe('canvas sizes with a name, so nobody invents one'),
    light: z.object({
      from: z.string().optional(),
      strength: z.string().optional(),
    }).optional(),
    outline: z.object({ use: z.boolean(), color: z.string().optional() }).optional(),
    dither: z.object({ use: z.boolean() }).optional(),
    contract: z.string().optional().describe('animation contract id (see contract.ts)'),
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

function row(label: string, value: string): string {
  return `  ${label.padEnd(10)} ${value}`;
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
    if (v.sizes) lines.push(row('tamaños', Object.entries(v.sizes).map(([k, [w, h]]) => `${k} ${w}x${h}`).join(' · ')));
    if (v.light) lines.push(row('luz', [v.light.from, v.light.strength].filter(Boolean).join(', ')));
    if (v.outline) lines.push(row('contorno', v.outline.use ? (v.outline.color ?? 'sí') : 'no'));
    if (v.dither) lines.push(row('trama', v.dither.use ? 'sí' : 'no'));
    if (v.contract) lines.push(row('contrato', v.contract));
    if (lines.length) out.push('', 'Visual', ...lines);
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
