// Notes in a sound recipe, and what a sound takes from the world.
//
// A recipe speaks in Hz, which is what a synthesizer wants and what nobody
// thinks in: the world says «mayor pentatónica, 440» and the agent used to
// work the frequencies out by hand (el patio, S1). So a `freq` can be a note
// (`"G5"`, `"C#4"`, `"Bb3"`) and is turned into Hz here, before the schema,
// with the tuning of the recipe, else of the world, else 440. When the world
// declares a scale, a note outside it is said: it warns, it does not stop —
// the same as every rule of style.
//
// Pure: `pgs.json` is read by the command, which passes what it found.

import { parsePitch } from './music';

/** What a sound takes from `sound` of the nearest pgs.json, when the recipe does not say it. */
export interface SoundWorld {
  rate?: number;
  tuning?: number;
  scale?: string;
  /** Lengths with a name, in seconds: `"duration": "short"`. */
  lengths?: Record<string, number>;
  /** What the sounds of the world are made of: a recipe's `material` outside it is warned about. */
  materials?: string[];
}

/**
 * Turns every length with a name (`duration`, and `start` / `length` of a
 * layer at any depth) into seconds with `sound.lengths` of the world. The
 * world wrote «short 0.08, medium 0.3, long 1.2» and the recipes used to copy
 * the number by eye (el patio, S1). A name the world does not have stops it,
 * naming the ones it has. `named` is what it resolved, once each.
 */
export function resolveLengths(raw: unknown, world: SoundWorld = {}, where = 'recipe'): { raw: unknown; named: string[] } {
  const named: string[] = [];
  const seconds = (v: unknown, at: string): unknown => {
    if (typeof v !== 'string') return v;
    const name = v.trim();
    const s = world.lengths?.[name];
    if (s === undefined) {
      const have = Object.entries(world.lengths ?? {}).map(([k, n]) => `${k} ${n}s`).join(', ');
      throw new Error(`${where}: ${at}: «${v}» no es un número de segundos${have ? ` ni un largo del mundo (${have})` : ', y el mundo no declara sound.lengths'}`);
    }
    if (!named.includes(name)) named.push(name);
    return s;
  };
  const walk = (layers: unknown, at: string): unknown => {
    if (!Array.isArray(layers)) return layers;
    return layers.map((l, i) => {
      if (!l || typeof l !== 'object') return l;
      const layer = { ...(l as Record<string, unknown>) };
      const here = `${at}[${i}]`;
      if (layer.start !== undefined) layer.start = seconds(layer.start, `${here}.start`);
      if (layer.length !== undefined) layer.length = seconds(layer.length, `${here}.length`);
      if (layer.layers) layer.layers = walk(layer.layers, `${here}.layers`);
      return layer;
    });
  };
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return { raw, named };
  const out: Record<string, unknown> = { ...r, layers: walk(r.layers, 'layers') };
  if (r.duration !== undefined) out.duration = seconds(r.duration, 'duration');
  return { raw: out, named };
}

/** Steps above the tonic, by name (castellano and English). */
export const SCALES: Record<string, number[]> = {
  mayor: [0, 2, 4, 5, 7, 9, 11], major: [0, 2, 4, 5, 7, 9, 11],
  menor: [0, 2, 3, 5, 7, 8, 10], minor: [0, 2, 3, 5, 7, 8, 10],
  mayor_pentatonica: [0, 2, 4, 7, 9], major_pentatonic: [0, 2, 4, 7, 9],
  menor_pentatonica: [0, 3, 5, 7, 10], minor_pentatonic: [0, 3, 5, 7, 10],
  cromatica: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Pitch class from C of a tonic: letters or solfège, with # or b. */
const TONICS: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
  do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11,
};

export interface Scale { name: string; tonic: string; classes: Set<number> }

/**
 * `"mayor_pentatonica"` (on C), or `"la menor"` / `"A minor_pentatonic"`: an
 * optional tonic, then the name. Undefined with the reason when it is not one.
 */
export function parseScale(spec: string): { scale?: Scale; error?: string } {
  const words = spec.trim().toLowerCase().replace(/[áéíóú]/g, (c) => 'aeiou'['áéíóú'.indexOf(c)]).split(/\s+/);
  const name = words.pop()!.replace(/-/g, '_');
  const steps = SCALES[name];
  if (!steps) return { error: `escala «${spec}» desconocida (${Object.keys(SCALES).filter((_, i) => i % 2 === 0).join(', ')})` };
  let tonic = 0, tonicName = 'do';
  if (words.length) {
    const m = /^(do|re|mi|fa|sol|la|si|[a-g])(#|b)?$/.exec(words.join(''));
    if (!m) return { error: `escala «${spec}»: «${words.join(' ')}» no es una tónica (do, re… o C, D…, con # o b)` };
    tonic = (TONICS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    tonicName = words.join('');
  }
  return { scale: { name, tonic: tonicName, classes: new Set(steps.map((st) => (st + tonic) % 12)) } };
}

export interface ResolvedNotes {
  /** The raw recipe with every note turned into Hz. */
  raw: unknown;
  /** The notes it read, in order, once each. */
  notes: string[];
  /** The ones outside the scale of the world. */
  offScale: string[];
  /** The tuning it used (recipe, world or 440) and where from. */
  tuning: number;
  tuningFrom: 'recipe' | 'world' | 'default';
  scale?: Scale;
  scaleError?: string;
}

/**
 * Turns every note of a raw recipe (`source.freq`, a string or the values of
 * its `[t, value]` points, at any depth of `layers`) into Hz. A string that is
 * not a note stops it, naming where.
 */
export function resolveNotes(raw: unknown, world: SoundWorld = {}, where = 'recipe'): ResolvedNotes {
  const r = raw as { tuning?: unknown; scale?: unknown; layers?: unknown } | null;
  const own = r && typeof r === 'object' && typeof r.tuning === 'number' ? r.tuning : undefined;
  const tuning = own ?? world.tuning ?? 440;
  const tuningFrom: ResolvedNotes['tuningFrom'] = own !== undefined ? 'recipe' : world.tuning !== undefined ? 'world' : 'default';
  const scaleSpec = r && typeof r === 'object' && typeof r.scale === 'string' ? r.scale : world.scale;
  const parsed = scaleSpec ? parseScale(scaleSpec) : {};
  const notes: string[] = [];
  const offScale: string[] = [];
  const hz = (note: string, at: string): number => {
    const semi = parsePitch(note.trim());
    if (semi === null) throw new Error(`${where}: ${at}: «${note}» no es una nota (A4, C#5, Bb3) ni un número de Hz`);
    if (!notes.includes(note)) {
      notes.push(note);
      if (parsed.scale && !parsed.scale.classes.has(((semi + 9) % 12 + 12) % 12)) offScale.push(note);
    }
    return tuning * Math.pow(2, semi / 12);
  };
  const walk = (layers: unknown, at: string): unknown => {
    if (!Array.isArray(layers)) return layers;
    return layers.map((l, i) => {
      if (!l || typeof l !== 'object') return l;
      const layer = { ...(l as Record<string, unknown>) };
      const here = `${at}[${i}]`;
      const src = layer.source as Record<string, unknown> | undefined;
      if (src && typeof src === 'object') {
        const f = src.freq;
        if (typeof f === 'string') layer.source = { ...src, freq: hz(f, `${here}.source.freq`) };
        else if (Array.isArray(f) && f.some((pt) => Array.isArray(pt) && typeof pt[1] === 'string')) {
          layer.source = { ...src, freq: f.map((pt, k) => (Array.isArray(pt) && typeof pt[1] === 'string' ? [pt[0], hz(pt[1], `${here}.source.freq[${k}]`)] : pt)) };
        }
      }
      if (layer.layers) layer.layers = walk(layer.layers, `${here}.layers`);
      return layer;
    });
  };
  const out = r && typeof r === 'object' ? { ...(r as Record<string, unknown>), layers: walk(r.layers, 'layers') } : raw;
  return { raw: out, notes, offScale, tuning, tuningFrom, scale: parsed.scale, scaleError: parsed.error };
}
