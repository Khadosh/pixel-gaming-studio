// Headless sound: recipes (JSON) → WAV, and a control sheet to check them
// without ears. See recipe.ts for the format.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { writeGuarded } from '../guard';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { recipeSchema, type Recipe } from './recipe';
import { renderRecipe } from './synth';
import { encodeWav, readWav, decodeWav, type Wav } from './wav';
import { analyzeWav, statsTable, waveformSheet, type SoundStats } from './analyze';

export { recipeSchema, renderRecipe, encodeWav, decodeWav, readWav, analyzeWav, statsTable, waveformSheet };
export type { Recipe, SoundStats, Wav };

export function parseRecipe(raw: unknown, where = 'recipe'): Recipe {
  const parsed = recipeSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${where}: ${issues}`);
  }
  return parsed.data;
}

export function loadRecipe(path: string): Recipe {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
  return parseRecipe(raw, path);
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

export function writeSound(recipePath: string, out: string) {
  const recipe = loadRecipe(recipePath);
  const name = recipe.id ?? basename(recipePath, extname(recipePath));
  const res = soundToWav(recipe, name);
  mkdirSync(dirname(out), { recursive: true });
  writeGuarded(out, res.wav);
  return { out: resolve(out), limited: res.limited, ...res.stats };
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
  writeGuarded(out, res.wav);
  return { out: resolve(out), limited: res.limited, bars: res.bars, notes: res.notes, ...res.stats };
}
