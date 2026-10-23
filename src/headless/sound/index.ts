// Headless sound: recipes (JSON) → WAV, and a control sheet to check them
// without ears. See recipe.ts for the format.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { writeGuarded } from '../guard';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { recipeSchema, type Recipe } from './recipe';
import { renderRecipe } from './synth';
import { encodeWav, readWav, decodeWav, type Wav } from './wav';
import { analyzeWav, statsTable, waveformSheet, type SoundStats } from './analyze';
import { resolveLengths, resolveNotes, type SoundWorld } from './notes';

export { recipeSchema, renderRecipe, encodeWav, decodeWav, readWav, analyzeWav, statsTable, waveformSheet };
export type { Recipe, SoundStats, Wav, SoundWorld };

export function parseRecipe(raw: unknown, where = 'recipe'): Recipe {
  const parsed = recipeSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${where}: ${issues}`);
  }
  return parsed.data;
}

export function loadRecipe(path: string, world?: SoundWorld): Recipe {
  return prepareRecipe(readRaw(path), world, path).recipe;
}

function readRaw(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
}

/** A recipe ready to render, and what it took from the world to get there. */
export interface PreparedRecipe {
  recipe: Recipe;
  /** What came from the world, in words: `muestreo 22050 Hz`, `afinación 432 Hz`, `escala mayor_pentatonica`. */
  inherited: string[];
  /** Notes outside the scale, and a scale that is not one: said, never stopped on. */
  warnings: string[];
}

/**
 * Raw recipe → recipe, taking from the world (`sound` of the nearest
 * pgs.json, passed in by the command) what the recipe does not say: the rate,
 * and for its notes the tuning and the scale. What the recipe says wins.
 */
export function prepareRecipe(raw: unknown, world: SoundWorld = {}, where = 'recipe'): PreparedRecipe {
  const inherited: string[] = [];
  const warnings: string[] = [];
  const lengths = resolveLengths(raw, world, where);
  if (lengths.named.length) inherited.push(`largos ${lengths.named.map(n => `${n} ${world.lengths![n]}s`).join(', ')}`);
  const notes = resolveNotes(lengths.raw, world, where);
  const r = notes.raw as Record<string, unknown> | null;
  let ready: unknown = notes.raw;
  if (r && typeof r === 'object' && r.rate === undefined && world.rate !== undefined) {
    if (world.rate !== 22050 && world.rate !== 44100) {
      throw new Error(`${where}: the world says sound.rate ${world.rate}, and a sound is written at 22050 or 44100 Hz; say rate in the recipe`);
    }
    ready = { ...r, rate: world.rate };
    inherited.push(`muestreo ${world.rate} Hz`);
  }
  if (notes.notes.length) {
    if (notes.tuningFrom === 'world') inherited.push(`afinación ${notes.tuning} Hz`);
    const own = r && typeof r === 'object' && typeof r.scale === 'string';
    if (notes.scale && !own) inherited.push(`escala ${notes.scale.tonic === 'do' ? '' : `${notes.scale.tonic} `}${notes.scale.name}`);
    if (notes.scaleError) warnings.push(notes.scaleError);
    if (notes.offScale.length && notes.scale) warnings.push(`notas fuera de la escala ${notes.scale.name}${notes.scale.tonic === 'do' ? '' : ` de ${notes.scale.tonic}`}: ${notes.offScale.join(', ')}`);
  }
  const material = r && typeof r === 'object' && typeof r.material === 'string' ? r.material : undefined;
  if (material !== undefined && world.materials?.length && !world.materials.includes(material)) {
    warnings.push(`material «${material}» no es de este mundo (${world.materials.join(', ')})`);
  }
  return { recipe: parseRecipe(ready, where), inherited, warnings };
}

/** Renders a recipe to WAV bytes and its stats. */
export function soundToWav(recipe: Recipe, name = recipe.id ?? 'sound'): { wav: Buffer; stats: SoundStats; limited: boolean } {
  const r = renderRecipe(recipe);
  const wav = encodeWav(r.rate, r.samples, r.loop);
  return { wav, stats: analyzeWav(name, decodeWav(wav)), limited: r.limited };
}

/** Every .json under a directory (sorted; with glob, the names that match: "sonido_*"), or the file itself. */
export function recipeFiles(path: string, glob?: string): string[] {
  if (!existsSync(path)) throw new Error(`no such file or directory: ${path}`);
  if (!statSync(path).isDirectory()) return [path];
  const pattern = glob ? globRegex(glob.endsWith('.json') ? glob : `${glob}.json`) : undefined;
  const files = readdirSync(path).filter(f => f.endsWith('.json') && (!pattern || pattern.test(f))).sort().map(f => join(path, f));
  if (glob && !files.length) throw new Error(`no recipe in ${path} matches "${glob}"`);
  return files;
}

/** "sonido_*" as a regex over a whole file name ("*" any run, "?" one character). */
function globRegex(glob: string): RegExp {
  return new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
}

/** The id a recipe file declares, if it is a JSON object with one. */
export function recipeId(file: string): string | undefined {
  try {
    const r = JSON.parse(readFileSync(file, 'utf8')) as { id?: unknown };
    return typeof r?.id === 'string' && r.id ? r.id : undefined;
  } catch { return undefined; }
}

/** Every .wav under a directory (sorted), or the files themselves. */
export function wavFiles(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`no such file or directory: ${p}`);
    if (statSync(p).isDirectory()) out.push(...readdirSync(p).filter(f => f.toLowerCase().endsWith('.wav')).sort().map(f => join(p, f)));
    else out.push(p);
  }
  return out;
}

export function writeSound(recipePath: string, out: string, world?: SoundWorld) {
  const { recipe, inherited, warnings } = prepareRecipe(readRaw(recipePath), world, recipePath);
  const name = recipe.id ?? basename(recipePath, extname(recipePath));
  const res = soundToWav(recipe, name);
  mkdirSync(dirname(out), { recursive: true });
  writeGuarded(out, res.wav);
  return { out: resolve(out), limited: res.limited, ...res.stats, inherited, style: warnings };
}

/** The seed of take `i` (from 1) of a recipe with `variations`: the first is the recipe as written. */
export function takeSeed(seed: number | undefined, i: number): number {
  return (seed ?? 1) + (i - 1) * 7919;
}

/**
 * Like writeSound, but a recipe with `variations: N` writes N takes next to
 * `out` (`<out>_1.wav` … `<out>_N.wav`), each with its own seed: the same
 * sound, never the same bytes. Without variations, the one WAV at `out`.
 */
export function writeSounds(recipePath: string, out: string, world?: SoundWorld) {
  const { recipe, inherited, warnings } = prepareRecipe(readRaw(recipePath), world, recipePath);
  if (!recipe.variations) return [writeSound(recipePath, out, world)];
  const name = recipe.id ?? basename(recipePath, extname(recipePath));
  const stem = out.replace(/\.wav$/i, '');
  mkdirSync(dirname(out), { recursive: true });
  const rows = [];
  for (let i = 1; i <= recipe.variations; i++) {
    const take = `${stem}_${i}.wav`;
    const res = soundToWav({ ...recipe, seed: takeSeed(recipe.seed, i) }, `${name}_${i}`);
    writeGuarded(take, res.wav);
    rows.push({ out: resolve(take), limited: res.limited, ...res.stats, inherited, style: warnings });
  }
  return rows;
}

// ── Music: scores (.partitura) → WAV ─────────────────────────────────────

import { loadScore, parseScore, pitchName, renderScore, type Score } from './music';
import { parseScale } from './notes';
import { INSTRUMENTS } from './instruments';

export { loadScore, parseScore, renderScore, INSTRUMENTS };
export type { Score };

/** Renders a score to WAV bytes, its stats and what it holds. */
export function musicToWav(score: Score, name = score.id) {
  const r = renderScore(score);
  const wav = encodeWav(r.rate, r.samples, r.loop);
  return { wav, stats: analyzeWav(name, decodeWav(wav)), limited: r.limited, bars: r.bars, notes: r.notes };
}

/** Every .partitura under a directory (sorted), or the file itself. */
export function scoreFiles(path: string): string[] {
  if (!existsSync(path)) throw new Error(`no such file or directory: ${path}`);
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).filter(f => f.endsWith('.partitura')).sort().map(f => join(path, f));
}

/**
 * What a score takes from `sound` of the nearest pgs.json when it does not
 * say it: the rate (`frecuencia:`) and the tuning (`afinación:`), and the
 * notes outside the world's scale, warned about as `sound` does (#36). The
 * score keeps whatever it wrote.
 */
export function musicWorld(score: Score, world: SoundWorld = {}): { score: Score; inherited: string[]; warnings: string[] } {
  const inherited: string[] = [];
  const warnings: string[] = [];
  const out = { ...score };
  if (world.rate !== undefined && !score.declared.includes('rate')) {
    if (world.rate !== 22050 && world.rate !== 44100) throw new Error(`the world says sound.rate ${world.rate}, and a score is written at 22050 or 44100 Hz; say frecuencia: in the score`);
    out.rate = world.rate;
    inherited.push(`muestreo ${world.rate} Hz`);
  }
  if (world.tuning !== undefined && !score.declared.includes('tuning')) {
    out.tuning = world.tuning;
    inherited.push(`afinación ${world.tuning} Hz`);
  }
  if (world.scale) {
    const { scale, error } = parseScale(world.scale);
    if (error) warnings.push(error);
    if (scale) {
      inherited.push(`escala ${scale.tonic === 'do' ? '' : `${scale.tonic} `}${scale.name}`);
      const off = new Set<string>();
      for (const v of score.voices) {
        for (const n of v.notes) for (const p of n.pitches) if (p !== null && !scale.classes.has((((p + 9) % 12) + 12) % 12)) off.add(pitchName(p));
      }
      if (off.size) warnings.push(`notas fuera de la escala ${scale.name}${scale.tonic === 'do' ? '' : ` de ${scale.tonic}`}: ${[...off].join(', ')}`);
    }
  }
  return { score: out, inherited, warnings };
}

export function writeMusic(scorePath: string, out: string, world?: SoundWorld) {
  const { score, inherited, warnings } = musicWorld(loadScore(scorePath), world);
  const res = musicToWav(score, basename(scorePath, extname(scorePath)));
  mkdirSync(dirname(out), { recursive: true });
  writeGuarded(out, res.wav);
  return { out: resolve(out), limited: res.limited, bars: res.bars, notes: res.notes, ...res.stats, inherited, style: warnings };
}
