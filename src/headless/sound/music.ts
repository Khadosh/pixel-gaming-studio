// Scores as text (.partitura) → music WAV, with the instruments of
// instruments.ts (or a game's own, as JSON) played by the synth.
//
//   # a comment
//   titulo: Secta de día
//   tempo: 66            quarter notes per minute
//   compas: 4/4          the bar the `|` checks are made against
//   semilla: 7
//   loop: si             the tails of the last notes ring over the start
//   largo: 24            bars (default: the longest voice, rounded up to a bar)
//   normalizar: -3       peak in dBFS (default -3)
//   humano: tiempo=0.012 fuerza=1.5   seeded looseness (seconds, dB)
//   sala: 0.22 largo=2.4              a little room (wet mix, seconds to -60 dB)
//   cola: 4              seconds after the end (one-shots; default the longest ring)
//
//   instrumento cit = citara gain=-2 ring=5
//   voz tema = cit octava=0 gain=0
//   mf | A3 q E4 h. | D4 e E4 G4 q E4 h | [ D4 q C4 ]x2 A3 h |
//
// A note is a pitch (A3, C#4, Bb2) or a chord (A3+E4), r is a rest and x a
// hit of an unpitched instrument. The duration follows the note (w h q e s,
// a dot adds half, or a number of quarter notes) and carries over to the
// next notes until another is written. pp p mp mf f ff set the dynamics,
// >A3 accents a note, ~G4 is a grace note just before the next one, [ … ]xN
// repeats, | checks that a bar closes there (an error names the line).

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename, extname } from 'node:path';
import { seededRandom } from '../ops';
import { dbToGain, mixSeed, renderLayersAt } from './synth';
import { INSTRUMENTS, instrumentSchema, type Instrument } from './instruments';
import type { LayerSpec } from './recipe';

export interface ScoreNote {
  /** Start in quarter notes from the start of the piece. */
  beat: number;
  beats: number;
  /** Semitones from A4 (null = an unpitched hit). */
  pitches: (number | null)[];
  db: number;
  grace: boolean;
  line: number;
}

export interface ScoreVoice {
  name: string;
  instrument: string;
  octave: number;
  gain_db: number;
  notes: ScoreNote[];
  /** Length in quarter notes. */
  beats: number;
}

export interface ScoreInstrument {
  name: string;
  ref: string;
  spec: Instrument;
  gain_db: number;
  ring: number;
  octave: number;
}

export interface Score {
  id: string;
  title: string;
  tempo: number;
  meter: [number, number];
  seed: number;
  loop: boolean;
  bars?: number;
  normalize: number;
  humanize: { time: number; gain: number };
  room?: { mix: number; decay: number };
  tail?: number;
  rate: 22050 | 44100;
  /** Hz of A4 (`afinación:`; default 440, else the world's). */
  tuning: number;
  /** The header keys the score wrote itself: what the world must not override. */
  declared: string[];
  instruments: Record<string, ScoreInstrument>;
  voices: ScoreVoice[];
}

const DYNAMICS: Record<string, number> = { ppp: -18, pp: -13, p: -8, mp: -4, mf: 0, f: 3, ff: 6 };
const LETTERS: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
const DURATIONS: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
const YES = new Set(['si', 'sí', 'yes', 'true', '1']);

const KEYS: Record<string, string> = {
  id: 'id', titulo: 'title', título: 'title', title: 'title', tempo: 'tempo', compas: 'meter', compás: 'meter',
  meter: 'meter', semilla: 'seed', seed: 'seed', loop: 'loop', largo: 'bars', bars: 'bars',
  normalizar: 'normalize', normalize: 'normalize', humano: 'humanize', humanize: 'humanize',
  sala: 'room', room: 'room', cola: 'tail', tail: 'tail', frecuencia: 'rate', rate: 'rate',
  afinacion: 'tuning', afinación: 'tuning', tuning: 'tuning',
  descripcion: 'description', descripción: 'description', description: 'description',
};

/** Semitones from A4 of a pitch name (A4 = 0, C4 = -9), or null if it is not one. */
export function parsePitch(name: string): number | null {
  const m = /^([A-Ga-g])(#|b|s)?(-?\d)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === '#' || m[2] === 's' ? 1 : m[2] === 'b' ? -1 : 0;
  return LETTERS[m[1].toUpperCase()] + acc + 12 * (Number(m[3]) - 4);
}

export const pitchHz = (semi: number): number => 440 * Math.pow(2, semi / 12);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** The name of a pitch in semitones from A4 (0 → "A4", -9 → "C4"): the inverse of parsePitch, with sharps. */
export function pitchName(semi: number): string {
  const midi = 69 + semi;
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function parseDuration(tok: string): number | null {
  if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
  const m = /^([whqes])(\.*)$/.exec(tok);
  if (!m) return null;
  let d = DURATIONS[m[1]];
  let add = d;
  for (let i = 0; i < m[2].length; i++) { add /= 2; d += add; }
  return d;
}

function options(parts: string[], where: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq <= 0) throw new Error(`${where}: «${p}» no es clave=valor`);
    out[p.slice(0, eq)] = p.slice(eq + 1);
  }
  return out;
}

function num(v: string | undefined, where: string, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${where}: «${v}» no es un número`);
  return n;
}

/** An instrument by name: a built-in, or a JSON file next to the score (or in instrumentos/). */
export function resolveInstrument(ref: string, dir: string, where: string): Instrument {
  if (INSTRUMENTS[ref] && !ref.endsWith('.json')) return INSTRUMENTS[ref];
  const candidates = ref.endsWith('.json')
    ? [resolve(dir, ref)]
    : [resolve(dir, 'instrumentos', `${ref}.json`), resolve(dir, '..', 'instrumentos', `${ref}.json`), resolve(dir, `${ref}.json`)];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(c, 'utf8')); } catch (err) { throw new Error(`${c}: ${(err as Error).message}`); }
    const parsed = instrumentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${c}: ${parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
    }
    return parsed.data;
  }
  throw new Error(`${where}: no conozco el instrumento «${ref}» (los de fábrica: ${Object.keys(INSTRUMENTS).join(', ')}; o un .json en instrumentos/)`);
}

interface Tok { text: string; line: number }

/** Parses a .partitura. `file` names errors and anchors instrument files. */
export function parseScore(text: string, file = 'partitura'): Score {
  const dir = dirname(resolve(file));
  const score: Score = {
    id: basename(file, extname(file)), title: '', tempo: 66, meter: [4, 4], seed: 1, loop: false,
    normalize: -3, humanize: { time: 0, gain: 0 }, rate: 22050, tuning: 440, declared: [], instruments: {}, voices: [],
  };
  const voiceTokens: { voice: ScoreVoice; toks: Tok[]; line: number }[] = [];
  let current: { voice: ScoreVoice; toks: Tok[]; line: number } | null = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const ln = i + 1;
    const where = `${file}:${ln}`;
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const inst = /^instrumento\s+(\S+)\s*=\s*(\S+)(.*)$/i.exec(line);
    if (inst) {
      current = null;
      const o = options(inst[3].trim().split(/\s+/).filter(Boolean), where);
      const spec = resolveInstrument(inst[2], dir, where);
      score.instruments[inst[1]] = {
        name: inst[1], ref: inst[2], spec,
        gain_db: num(o.gain, where, 0) + (spec.gain_db ?? 0),
        ring: num(o.ring, where, spec.ring ?? 3),
        octave: num(o.octava ?? o.octave, where, 0),
      };
      if (o.strum ?? o.rasgueo) score.instruments[inst[1]].spec = { ...spec, strum: num(o.strum ?? o.rasgueo, where, 0) };
      return;
    }
    const voz = /^(?:voz|voice)\s+(\S+)\s*=\s*(\S+)(.*)$/i.exec(line);
    if (voz) {
      if (!score.instruments[voz[2]]) {
        // A voice may name a built-in directly.
        const spec = resolveInstrument(voz[2], dir, where);
        score.instruments[voz[2]] = { name: voz[2], ref: voz[2], spec, gain_db: spec.gain_db ?? 0, ring: spec.ring ?? 3, octave: 0 };
      }
      if (score.voices.some(v => v.name === voz[1])) throw new Error(`${where}: la voz «${voz[1]}» ya existe`);
      const o = options(voz[3].trim().split(/\s+/).filter(Boolean), where);
      const voice: ScoreVoice = {
        name: voz[1], instrument: voz[2], octave: num(o.octava ?? o.octave, where, 0),
        gain_db: num(o.gain, where, 0), notes: [], beats: 0,
      };
      score.voices.push(voice);
      current = { voice, toks: [], line: ln };
      voiceTokens.push(current);
      return;
    }
    const head = /^([A-Za-zÁÉÍÓÚáéíóú]+)\s*:\s*(.*)$/.exec(line);
    if (head && KEYS[head[1].toLowerCase()] && !current) {
      const key = KEYS[head[1].toLowerCase()];
      const val = head[2].trim();
      const parts = val.split(/\s+/);
      if (!score.declared.includes(key)) score.declared.push(key);
      switch (key) {
        case 'id': score.id = val; break;
        case 'title': score.title = val; break;
        case 'description': break;
        case 'tempo': score.tempo = num(parts[0], where, 66); if (score.tempo <= 0) throw new Error(`${where}: tempo > 0`); break;
        case 'meter': {
          const m = /^(\d+)\/(\d+)$/.exec(parts[0]);
          if (!m) throw new Error(`${where}: el compás se escribe 4/4, 3/4, 6/8`);
          score.meter = [Number(m[1]), Number(m[2])];
          break;
        }
        case 'seed': score.seed = Math.round(num(parts[0], where, 1)); break;
        case 'loop': score.loop = YES.has(parts[0].toLowerCase()); break;
        case 'bars': score.bars = num(parts[0], where, 0); break;
        case 'normalize': score.normalize = Math.min(0, num(parts[0], where, -3)); break;
        case 'humanize': {
          const o = options(parts, where);
          score.humanize = { time: num(o.tiempo ?? o.time, where, 0.01), gain: num(o.fuerza ?? o.gain, where, 1) };
          break;
        }
        case 'room': {
          const o = options(parts.slice(1), where);
          score.room = { mix: num(parts[0], where, 0.2), decay: num(o.largo ?? o.decay, where, 2) };
          break;
        }
        case 'tail': score.tail = num(parts[0], where, 0); break;
        case 'tuning': score.tuning = num(parts[0], where, 440); if (score.tuning <= 0) throw new Error(`${where}: afinación > 0 (Hz del La 4)`); break;
        case 'rate': {
          const r = num(parts[0], where, 22050);
          if (r !== 22050 && r !== 44100) throw new Error(`${where}: frecuencia 22050 o 44100`);
          score.rate = r;
          break;
        }
      }
      return;
    }
    if (!current) throw new Error(`${where}: no entiendo «${line}» (¿falta «voz <nombre> = <instrumento>» antes de las notas?)`);
    for (const t of line.split(/\s+/).filter(Boolean)) (current as { toks: Tok[] }).toks.push({ text: t, line: ln });
  });
  if (score.voices.length === 0) throw new Error(`${file}: no hay ninguna voz`);
  const barBeats = (score.meter[0] * 4) / score.meter[1];
  for (const vt of voiceTokens) readVoice(vt.voice, expandRepeats(vt.toks, file), barBeats, file);
  return score;
}

function expandRepeats(toks: Tok[], file: string): Tok[] {
  const stack: Tok[][] = [[]];
  const opens: Tok[] = [];
  for (const t of toks) {
    if (t.text === '[') { stack.push([]); opens.push(t); continue; }
    const close = /^\](?:x(\d+))?$/.exec(t.text);
    if (close) {
      if (stack.length === 1) throw new Error(`${file}:${t.line}: «]» sin «[»`);
      const body = stack.pop()!;
      opens.pop();
      const times = close[1] ? Number(close[1]) : 2;
      for (let k = 0; k < times; k++) stack[stack.length - 1].push(...body);
      continue;
    }
    stack[stack.length - 1].push(t);
  }
  if (stack.length > 1) throw new Error(`${file}:${opens[opens.length - 1].line}: «[» sin cerrar`);
  return stack[0];
}

function readVoice(voice: ScoreVoice, toks: Tok[], barBeats: number, file: string): void {
  let beat = 0;
  let dur = 1;
  let db = 0;
  let pending: { pitches: (number | null)[]; accent: boolean; grace: boolean; line: number } | null = null;
  const flush = () => {
    if (!pending) return;
    if (pending.grace) {
      voice.notes.push({ beat, beats: 0, pitches: pending.pitches, db: db - 5, grace: true, line: pending.line });
    } else {
      if (pending.pitches.length > 0) {
        voice.notes.push({ beat, beats: dur, pitches: pending.pitches, db: db + (pending.accent ? 4 : 0), grace: false, line: pending.line });
      }
      beat += dur;
    }
    pending = null;
  };
  for (const t of toks) {
    const where = `${file}:${t.line}`;
    const d = parseDuration(t.text);
    if (d !== null) {
      if (!pending || pending.grace) throw new Error(`${where}: la duración «${t.text}» no sigue a ninguna nota`);
      if (d <= 0) throw new Error(`${where}: duración 0`);
      dur = d;
      flush();
      continue;
    }
    flush();
    if (t.text === '|') {
      const off = beat % barBeats;
      if (Math.abs(off) > 1e-6 && Math.abs(off - barBeats) > 1e-6) {
        throw new Error(`${where}: el compás no cierra (van ${+(off.toFixed(3))} de ${barBeats} tiempos en la voz ${voice.name})`);
      }
      continue;
    }
    if (DYNAMICS[t.text] !== undefined) { db = DYNAMICS[t.text]; continue; }
    let text = t.text;
    let accent = false, grace = false;
    if (text.startsWith('>')) { accent = true; text = text.slice(1); }
    if (text.startsWith('~')) { grace = true; text = text.slice(1); }
    if (text === 'r' || text === '-') { pending = { pitches: [], accent: false, grace: false, line: t.line }; continue; }
    const pitches: (number | null)[] = [];
    for (const part of text.split('+')) {
      if (part === 'x') { pitches.push(null); continue; }
      const p = parsePitch(part);
      if (p === null) throw new Error(`${where}: no entiendo «${t.text}» (una nota es A3, C#4, Bb2, un acorde A3+E4, r un silencio, x un golpe)`);
      pitches.push(p);
    }
    pending = { pitches, accent, grace, line: t.line };
  }
  if (pending && (pending as { grace: boolean }).grace) throw new Error(`${file}: la voz ${voice.name} termina en una nota de adorno`);
  flush();
  voice.beats = beat;
}

// ── Rendering ────────────────────────────────────────────────────────────

/** A small mono room: Freeverb's combs and allpasses, tuned by its decay. */
function room(x: Float32Array, rate: number, mix: number, decay: number): void {
  const scale = rate / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => Math.max(1, Math.round(d * scale)));
  const alls = [556, 441, 341, 225].map(d => Math.max(1, Math.round(d * scale)));
  const damp = 0.3;
  const wet = new Float32Array(x.length);
  for (const d of combs) {
    const fb = Math.pow(10, (-3 * d) / (decay * rate));
    const buf = new Float32Array(d);
    let idx = 0, store = 0;
    for (let i = 0; i < x.length; i++) {
      const out = buf[idx];
      store = out * (1 - damp) + store * damp;
      buf[idx] = x[i] * 0.015 + store * fb;
      idx = idx + 1 === d ? 0 : idx + 1;
      wet[i] += out;
    }
  }
  for (const d of alls) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < x.length; i++) {
      const b = buf[idx];
      const out = -wet[i] + b;
      buf[idx] = wet[i] + b * 0.5;
      idx = idx + 1 === d ? 0 : idx + 1;
      wet[i] = out;
    }
  }
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - mix * 0.5) + wet[i] * mix * 3;
}

export interface RenderedMusic {
  rate: number;
  samples: Float32Array;
  loop?: { start: number; end: number };
  limited: boolean;
  seconds: number;
  bars: number;
  notes: number;
}

/** Applies an instrument's `ring` to its string sources (how long a note sounds). */
function withRing(layers: LayerSpec[], ring: number): LayerSpec[] {
  return layers.map(l => {
    if (l.layers) return { ...l, layers: withRing(l.layers, ring) };
    if (l.source?.type === 'string') return { ...l, source: { ...l.source, ring: Math.min(l.source.ring ?? ring, ring) } };
    return l;
  });
}

export function renderScore(score: Score): RenderedMusic {
  const rate = score.rate;
  const spb = 60 / score.tempo;
  const barBeats = (score.meter[0] * 4) / score.meter[1];
  const longest = Math.max(...score.voices.map(v => v.beats));
  const bars = score.bars && score.bars > 0 ? score.bars : Math.max(1, Math.ceil(longest / barBeats - 1e-9));
  const seconds = bars * barBeats * spb;
  const n = Math.max(1, Math.round(seconds * rate));
  const maxRing = Math.max(...Object.values(score.instruments).map(i => i.ring));
  const roomTail = score.room ? score.room.decay : 0;
  const tail = score.loop ? maxRing + roomTail + 0.2 : (score.tail ?? maxRing + roomTail * 0.5);
  const total = n + Math.round(tail * rate);
  // A margin before the start for grace notes and early hands (a loop wraps it to the end).
  const pre = Math.round(0.25 * rate);
  const mix = new Float32Array(pre + total);
  let count = 0;
  const cache = new Map<string, LayerSpec[]>();
  score.voices.forEach((voice, vi) => {
    const inst = score.instruments[voice.instrument];
    let layers = cache.get(inst.name);
    if (!layers) { layers = withRing(inst.spec.layers, inst.ring); cache.set(inst.name, layers); }
    const base = inst.spec.base ?? 440;
    const pitched = inst.spec.pitched !== false;
    const strum = inst.spec.strum ?? 0;
    const rng = seededRandom(mixSeed(score.seed, `voz:${voice.name}`));
    const jitter = () => (rng() + rng() - 1) ; // −1..1, peaked at 0
    const len = Math.round(inst.ring * rate);
    voice.notes.forEach((note, ni) => {
      let t = note.beat * spb + jitter() * score.humanize.time;
      if (note.grace) t -= Math.min(0.09, 0.25 * spb);
      // The first beat of a bar sits a little heavier: phrasing, not a metronome.
      const downbeat = !note.grace && Math.abs(note.beat % barBeats) < 1e-6 ? 1 : 0;
      const sorted = [...note.pitches].sort((a, b) => (a ?? 0) - (b ?? 0));
      sorted.forEach((p, k) => {
        const semi = p === null ? null : p + 12 * (voice.octave + inst.octave);
        const ratio = semi === null ? 1 : (pitchHz(semi) * (score.tuning / 440)) / base;
        const pitch = pitched || semi !== null ? ratio : 1;
        const g = dbToGain(inst.gain_db + voice.gain_db + note.db + downbeat + jitter() * score.humanize.gain - (k > 0 ? 1 : 0));
        const at = pre + Math.round((t + k * strum) * rate);
        const y = renderLayersAt(layers!, len, rate, mixSeed(score.seed, `${vi}:${ni}:${k}`), pitch);
        // A note opens in a millisecond and a half and closes over its last quarter: no edges.
        const open = Math.max(1, Math.round(0.0015 * rate));
        const close = Math.max(1, Math.round(len * 0.25));
        for (let j = 0; j < len; j++) {
          let e = 1;
          if (j < open) e = j / open;
          if (j > len - close) e *= 0.5 + 0.5 * Math.cos((Math.PI * (j - (len - close))) / close);
          const o = at + j;
          if (o >= 0 && o < mix.length) mix[o] += y[j] * e * g;
        }
        count++;
      });
    });
  });
  if (score.room && score.room.mix > 0) room(mix, rate, score.room.mix, score.room.decay);
  // DC blocker, as in the recipes.
  const r = 1 - (2 * Math.PI * 12) / rate;
  let px = 0, py = 0;
  for (let j = 0; j < mix.length; j++) { const y = mix[j] - px + r * py; px = mix[j]; py = y; mix[j] = y; }
  let samples: Float32Array;
  if (score.loop) {
    // Everything that rings past the end (and the early margin) folds onto
    // the start: the piece is periodic, so the last sample leads into the
    // first exactly as it would into the next round.
    samples = new Float32Array(n);
    for (let j = 0; j < mix.length; j++) {
      const k = (((j - pre) % n) + n) % n;
      samples[k] += mix[j];
    }
  } else {
    samples = mix.slice(pre, pre + total);
    const fin = Math.min(samples.length, Math.round(0.002 * rate));
    const fout = Math.min(samples.length, Math.round(0.4 * rate));
    const ease = (k: number) => (1 - Math.cos(Math.PI * k)) / 2;
    for (let j = 0; j < fin; j++) samples[j] *= ease(j / fin);
    for (let j = 0; j < fout; j++) samples[samples.length - 1 - j] *= ease(j / fout);
  }
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  let gain = peak > 0 ? dbToGain(score.normalize) / peak : 1;
  let limited = false;
  if (peak * gain > dbToGain(-0.5)) { gain = dbToGain(-1) / peak; limited = true; }
  for (let j = 0; j < samples.length; j++) samples[j] *= gain;
  return {
    rate, samples, limited, seconds: samples.length / rate, bars, notes: count,
    loop: score.loop ? { start: 0, end: n - 1 } : undefined,
  };
}

export function loadScore(path: string): Score {
  if (!existsSync(path)) throw new Error(`no existe ${path}`);
  return parseScore(readFileSync(path, 'utf8'), path);
}
