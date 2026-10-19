// Headless sound: recipes (JSON) → WAV, and a control sheet to check them
// without ears. See recipe.ts for the format.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { recipeSchema, type Recipe } from './recipe';
import { renderRecipe } from './synth';
import { encodeWav, readWav, decodeWav, type Wav } from './wav';
import { analyzeWav, statsTable, waveformSheet, type SoundStats } from './analyze';
import { resolveNotes, type SoundWorld } from './notes';

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
  const notes = resolveNotes(raw, world, where);
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
  return { recipe: parseRecipe(ready, where), inherited, warnings };
}

/** Renders a recipe to WAV bytes and its stats. */
export function soundToWav(recipe: Recipe, name = recipe.id ?? 'sound'): { wav: Buffer; stats: SoundStats; limited: boolean } {
  const r = renderRecipe(recipe);
  const wav = encodeWav(r.rate, r.samples, r.loop);
  return { wav, stats: analyzeWav(name, decodeWav(wav)), limited: r.limited };
}

/** Every .json under a directory (sorted), or the file itself. */
export function recipeFiles(path: string): string[] {
  if (!existsSync(path)) throw new Error(`no such file or directory: ${path}`);
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).filter(f => f.endsWith('.json')).sort().map(f => join(path, f));
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
  writeFileSync(out, res.wav);
  return { out: resolve(out), limited: res.limited, ...res.stats, inherited, style: warnings };
}

// ── Music: scores (.partitura) → WAV ─────────────────────────────────────

import { loadScore, parseScore, renderScore, type Score } from './music';
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

export function writeMusic(scorePath: string, out: string) {
  const score = loadScore(scorePath);
  const res = musicToWav(score, basename(scorePath, extname(scorePath)));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, res.wav);
  return { out: resolve(out), limited: res.limited, bars: res.bars, notes: res.notes, ...res.stats };
}
