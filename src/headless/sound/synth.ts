// Renders a recipe (recipe.ts) to mono float samples in [-1, 1].
//
// Everything random comes from a seeded generator derived from the recipe
// seed and the layer's position, so adding a layer does not change the
// others, and the same recipe always renders the same samples.

import { seededRandom } from '../ops';
import type { Curve, LayerSpec, Recipe } from './recipe';

export interface Rendered {
  rate: number;
  samples: Float32Array;
  /** Loop point (start, end inclusive) when the recipe loops. */
  loop?: { start: number; end: number };
  /** True when the safety limiter had to pull the level down. */
  limited: boolean;
}

type Rng = () => number;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => (g <= 0 ? -Infinity : 20 * Math.log10(g));

/** A stable 32-bit hash of the seed and a layer path, for per-layer generators. */
function mixSeed(seed: number, path: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < path.length; i++) {
    h = Math.imul(h ^ path.charCodeAt(i), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

function curveAt(c: Curve | undefined, t: number, fallback: number): number {
  if (c === undefined) return fallback;
  if (typeof c === 'number') return c;
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const [t0, v0] = c[i - 1];
      const [t1, v1] = c[i];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return c[c.length - 1][1];
}

// ── LFOs ─────────────────────────────────────────────────────────────────

type LfoSpec = NonNullable<LayerSpec['lfo']>[number];

/** Returns lfo(t) in [-1, 1]. The random shape is a smooth seeded wander. */
function makeLfo(spec: LfoSpec, rng: Rng): (t: number) => number {
  const phase = spec.phase ?? 0;
  switch (spec.shape ?? 'sine') {
    case 'triangle':
      return t => { const p = (spec.rate * t + phase) % 1; return 1 - 4 * Math.abs(p - 0.5); };
    case 'square':
      return t => ((spec.rate * t + phase) % 1 < 0.5 ? 1 : -1);
    case 'random': {
      const points: number[] = [];
      const at = (i: number) => { while (points.length <= i) points.push(rng() * 2 - 1); return points[i]; };
      return t => {
        const x = spec.rate * t + phase;
        const i = Math.floor(x);
        const f = x - i;
        const s = (1 - Math.cos(Math.PI * f)) / 2;
        return at(i) * (1 - s) + at(i + 1) * s;
      };
    }
    default:
      return t => Math.sin(2 * Math.PI * (spec.rate * t + phase));
  }
}

function lfosFor(layer: LayerSpec, target: LfoSpec['target'], rng: Rng) {
  return (layer.lfo ?? []).filter(l => l.target === target).map(l => ({ spec: l, fn: makeLfo(l, rng) }));
}

// ── Sources ──────────────────────────────────────────────────────────────

function noiseGen(color: 'white' | 'pink' | 'brown', rng: Rng): () => number {
  if (color === 'pink') {
    // Paul Kellet's economy pink filter.
    let b0 = 0, b1 = 0, b2 = 0;
    return () => {
      const w = rng() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      return (b0 + b1 + b2 + w * 0.1848) * 0.2;
    };
  }
  if (color === 'brown') {
    let b = 0;
    return () => {
      b = (b + 0.02 * (rng() * 2 - 1)) / 1.02;
      return b * 3.5;
    };
  }
  return () => rng() * 2 - 1;
}

function renderSource(layer: LayerSpec, n: number, rate: number, rng: Rng, pitch: number): Float32Array {
  const src = layer.source!;
  const out = new Float32Array(n);
  const freqLfos = lfosFor(layer, 'freq', rng);
  const freqAt = (i: number) => {
    const t = i / rate;
    let f = curveAt(src.freq, t, 440) * pitch;
    for (const l of freqLfos) f *= Math.pow(2, (l.spec.depth * l.fn(t)) / 12);
    return f;
  };
  switch (src.type) {
    case 'sine': case 'triangle': case 'square': case 'saw': {
      let phase = 0;
      const duty = src.duty ?? 0.5;
      // Quantized to `steps` levels (mid-rise, so the wave keeps its symmetry
      // around 0 and a triangle still has no even harmonics).
      const steps = src.type === 'square' ? 0 : (src.steps ?? 0);
      for (let i = 0; i < n; i++) {
        const p = phase;
        let v: number;
        if (src.type === 'sine') v = Math.sin(2 * Math.PI * p);
        else if (src.type === 'triangle') v = 1 - 4 * Math.abs(p - 0.5);
        else if (src.type === 'square') v = p < duty ? 1 : -1;
        else v = 2 * p - 1;
        if (steps) v = ((Math.min(steps - 1, Math.floor(((v + 1) / 2) * steps)) + 0.5) / steps) * 2 - 1;
        out[i] = v;
        phase += freqAt(i) / rate;
        phase -= Math.floor(phase);
      }
      return out;
    }
    case 'noise': {
      const gen = noiseGen(src.color ?? 'white', rng);
      for (let i = 0; i < n; i++) out[i] = gen();
      return out;
    }
    case 'chip_noise': {
      // The noise channel of a NES: a 15-bit shift register that starts at 1
      // and shifts at `freq` Hz, its new top bit the XOR of bits 0 and 1 (or 0
      // and 6 in the short mode); the output is ±1 by bit 0. Deterministic:
      // every note starts the same, as on the chip.
      let reg = 1;
      let phase = 0;
      const tap = src.short ? 6 : 1;
      for (let i = 0; i < n; i++) {
        out[i] = reg & 1 ? -1 : 1;
        phase += freqAt(i) / rate;
        const shifts = Math.floor(phase);
        phase -= shifts;
        for (let k = 0; k < shifts; k++) {
          const fb = (reg ^ (reg >> tap)) & 1;
          reg = (reg >> 1) | (fb << 14);
        }
      }
      return out;
    }
    case 'pluck': {
      // Karplus-Strong: a burst of noise in a delay line the length of one
      // period, averaged with its neighbour on every pass.
      const f = Math.max(20, freqAt(0));
      const period = Math.max(2, Math.round(rate / f));
      const line = new Float32Array(period);
      for (let i = 0; i < period; i++) line[i] = rng() * 2 - 1;
      const decay = src.decay ?? 0.996;
      const damping = src.damping ?? 0.5;
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const next = (idx + 1) % period;
        out[i] = line[idx];
        line[idx] = decay * ((1 - damping) * line[idx] + damping * line[next]);
        idx = next;
      }
      return out;
    }
    case 'string': {
      // A better plucked string (Karplus-Strong extended, Jaffe & Smith):
      // the loop is tuned exactly with an allpass for the fraction of a
      // sample (the plain pluck rounds the period: E5 came out a quarter
      // tone sharp), the loss per pass comes from how long the note rings
      // (so a high note lasts as long as a low one), and the excitation is
      // a noise burst softened by the pick and combed by where it plucks
      // (the harmonics that have a node there are missing, as on a real
      // string).
      const f = Math.max(20, freqAt(0));
      const s = 0.5 * (src.damping ?? 0.6);
      const total = rate / f;
      const whole = Math.max(2, Math.floor(total - s - 0.1));
      const frac = total - s - whole;
      const c = (1 - frac) / (1 + frac);
      const ring = src.ring ?? 3;
      // The averaging filter also takes from the fundamental on every pass;
      // the loss gives that back so the note itself rings `ring` seconds
      // (capped under 1: the loop never grows at DC).
      const w0 = (2 * Math.PI * f) / rate;
      const lpGain = Math.sqrt(1 - 2 * s * (1 - s) * (1 - Math.cos(w0)));
      const g = Math.min(0.9999, Math.pow(10, -3 / (ring * f)) / lpGain);
      const exLen = Math.max(2, Math.round(total));
      const ex = new Float32Array(exLen);
      const bright = src.bright ?? 0.6;
      const soft = 0.05 + 0.9 * (1 - bright);
      let lpn = 0;
      for (let i = 0; i < exLen; i++) {
        lpn += (1 - soft) * ((rng() * 2 - 1) - lpn);
        ex[i] = lpn;
      }
      const pickAt = Math.round((src.pick ?? 0.13) * exLen);
      if (pickAt > 0) for (let i = exLen - 1; i >= pickAt; i--) ex[i] -= ex[i - pickAt];
      let mean = 0;
      for (const v of ex) mean += v / exLen;
      let peakEx = 0;
      for (let i = 0; i < exLen; i++) { ex[i] -= mean; peakEx = Math.max(peakEx, Math.abs(ex[i])); }
      if (peakEx > 0) for (let i = 0; i < exLen; i++) ex[i] /= peakEx;
      const line = new Float32Array(whole);
      let idx = 0, prevU = 0, prevLp = 0, prevAp = 0;
      for (let i = 0; i < n; i++) {
        const u = line[idx];
        const lp = (1 - s) * u + s * prevU;
        prevU = u;
        const ap = c * lp + prevLp - c * prevAp;
        prevLp = lp;
        prevAp = ap;
        const y = (i < exLen ? ex[i] : 0) + g * ap;
        line[idx] = y;
        idx = idx + 1 === whole ? 0 : idx + 1;
        out[i] = y;
      }
      return out;
    }
    case 'bell': {
      // Modal: a few inharmonic partials, each dying at its own pace (the
      // high ones first), each split in two close modes that beat slowly,
      // the wobble of a bowl. Every mode starts at zero phase: no click.
      const f = Math.max(20, freqAt(0));
      const parts = src.partials ?? [[1, 1, 9], [2.71, 0.5, 6], [5.15, 0.28, 3.5], [8.43, 0.12, 2], [12.1, 0.05, 1.2]];
      const beat = src.beat ?? 0;
      const nyq = rate * 0.45;
      for (const [ratio, amp, t60] of parts) {
        const fr = f * ratio;
        if (fr >= nyq || amp <= 0) continue;
        const k = 6.907755 / t60;
        const pairs = beat > 0 ? [fr - beat / 2, fr + beat / 2] : [fr];
        const a = amp / pairs.length;
        for (const fm of pairs) {
          const w = (2 * Math.PI * fm) / rate;
          const decayStep = Math.exp(-k / rate);
          let env = a;
          // Recurrence for sin(w i): s[i] = 2cos(w) s[i-1] - s[i-2].
          const c2 = 2 * Math.cos(w);
          let s1 = 0, s2 = -Math.sin(w);
          for (let i = 0; i < n; i++) {
            const sv = c2 * s1 - s2;
            s2 = s1; s1 = sv;
            out[i] += env * s2;
            env *= decayStep;
            if (env < 1e-6) break;
          }
        }
      }
      return out;
    }
    case 'crackle': {
      // Short bursts at random moments (Poisson), each a little noise that
      // dies fast, with its own random level: embers, twigs, a hearth.
      const gen = noiseGen(src.color ?? 'white', rng);
      const p = (src.density ?? 20) / rate;
      const burst = src.burst ?? 0.004;
      let left = 0, len = 1, amp = 0;
      for (let i = 0; i < n; i++) {
        if (left <= 0 && rng() < p) {
          len = Math.max(1, Math.round(burst * rate * (0.5 + rng())));
          left = len;
          amp = 0.25 + 0.75 * rng() * rng();
        }
        if (left > 0) {
          // A burst rises over its first fifth (no digital edge) and dies fast.
          const k = 1 - left / len;
          const rise = Math.min(1, k / 0.2);
          out[i] = gen() * amp * rise * Math.exp(-5 * k);
          left--;
        } else {
          gen();
        }
      }
      return out;
    }
  }
}

// ── Filters ──────────────────────────────────────────────────────────────

type FilterSpec = NonNullable<LayerSpec['filters']>[number];

function applyFilter(x: Float32Array, spec: FilterSpec, rate: number, pitch: number,
  cutoffLfos: { spec: LfoSpec; fn: (t: number) => number }[]): void {
  const nyq = rate * 0.45;
  const follow = spec.track === false ? 1 : pitch;
  const fcAt = (i: number) => {
    const t = i / rate;
    let f = curveAt(spec.freq, t, 1000) * follow;
    for (const l of cutoffLfos) f *= Math.pow(2, l.spec.depth * l.fn(t));
    return Math.min(nyq, Math.max(10, f));
  };
  if ((spec.poles ?? 2) === 1 && spec.type !== 'bandpass' && spec.type !== 'peak') {
    let y = 0, a = 0;
    for (let i = 0; i < x.length; i++) {
      if (i % 16 === 0) a = 1 - Math.exp((-2 * Math.PI * fcAt(i)) / rate);
      y += a * (x[i] - y);
      x[i] = spec.type === 'lowpass' ? y : x[i] - y;
    }
    return;
  }
  // RBJ cookbook biquad, coefficients refreshed every 16 samples.
  const q = spec.q ?? 0.707;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 16 === 0) {
      const w = (2 * Math.PI * fcAt(i)) / rate;
      const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      if (spec.type === 'peak') {
        // RBJ peaking EQ: a boost (or cut) around freq, flat elsewhere.
        const A = Math.pow(10, (spec.gain_db ?? 6) / 40);
        const p0 = 1 + alpha / A;
        b0 = (1 + alpha * A) / p0; b1 = (-2 * cos) / p0; b2 = (1 - alpha * A) / p0;
        a1 = (-2 * cos) / p0; a2 = (1 - alpha / A) / p0;
      } else {
        if (spec.type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
        else if (spec.type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
        else { b0 = alpha; b1 = 0; b2 = -alpha; }
        b0 /= a0; b1 /= a0; b2 /= a0;
        a1 = (-2 * cos) / a0; a2 = (1 - alpha) / a0;
      }
    }
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
}

// ── Envelope and echo ────────────────────────────────────────────────────

type EnvSpec = NonNullable<LayerSpec['envelope']>;

function applyEnvelope(x: Float32Array, body: number, env: EnvSpec, rate: number): void {
  const a = (env.attack ?? 0.005) * rate;
  const d = (env.decay ?? 0) * rate;
  const s = env.sustain ?? 1;
  const r = (env.release ?? 0.01) * rate;
  const h = env.hold !== undefined ? env.hold * rate : Math.max(0, body - a - d - r);
  const k = env.curve ?? 2;
  for (let i = 0; i < x.length; i++) {
    let g: number;
    if (i < a) g = i / a;
    else if (i < a + d) g = s + (1 - s) * Math.pow(1 - (i - a) / d, k);
    else if (i < a + d + h) g = s;
    else if (i < a + d + h + r) g = s * Math.pow(1 - (i - a - d - h) / r, k);
    else g = 0;
    x[i] *= g;
  }
}

function echoTail(layer: LayerSpec): number {
  if (!layer.echo) return 0;
  const fb = layer.echo.feedback ?? 0.3;
  let repeats = 1;
  while (repeats < 12 && Math.pow(fb, repeats) > 0.02) repeats++;
  return Math.min(3, layer.echo.delay * repeats);
}

function applyEcho(x: Float32Array, spec: NonNullable<LayerSpec['echo']>, rate: number): void {
  const d = Math.max(1, Math.round(spec.delay * rate));
  const fb = spec.feedback ?? 0.3;
  const mix = spec.mix ?? 0.3;
  const wet = new Float32Array(x.length);
  for (let i = d; i < x.length; i++) wet[i] = x[i - d] + fb * wet[i - d];
  for (let i = 0; i < x.length; i++) x[i] += mix * wet[i];
}

function envelopeLength(env: EnvSpec | undefined): number | undefined {
  if (!env || env.hold === undefined) {
    if (!env) return undefined;
    // Without a hold, a percussive envelope lasts attack + decay + release.
    if ((env.sustain ?? 1) === 0) return (env.attack ?? 0.005) + (env.decay ?? 0) + (env.release ?? 0.01);
    return undefined;
  }
  return (env.attack ?? 0.005) + (env.decay ?? 0) + env.hold + (env.release ?? 0.01);
}

// ── Layers ───────────────────────────────────────────────────────────────

/** One voice of a layer: its source or sub-mix, shaped and filtered. */
function renderVoice(layer: LayerSpec, n: number, body: number, rate: number, seed: number, path: string,
  rng: Rng, pitch: number): Float32Array {
  let x: Float32Array;
  if (layer.source) {
    x = renderSource(layer, n, rate, rng, pitch);
  } else {
    x = new Float32Array(n);
    (layer.layers ?? []).forEach((sub, i) => {
      const y = renderLayer(sub, n, rate, seed, `${path}.${i}`, pitch);
      for (let j = 0; j < n; j++) x[j] += y[j];
    });
  }
  const cutoffLfos = lfosFor(layer, 'cutoff', rng);
  for (const f of layer.filters ?? []) applyFilter(x, f, rate, pitch, cutoffLfos);
  if (layer.envelope) applyEnvelope(x, body, layer.envelope, rate);
  else if (body < n) {
    // The dry sound stops where the echo tail begins, with a short fade.
    const fade = Math.min(body, Math.round(0.005 * rate));
    for (let i = 0; i < fade; i++) x[body - fade + i] *= 1 - (i + 1) / fade;
    for (let i = body; i < n; i++) x[i] = 0;
  }
  for (const l of lfosFor(layer, 'gain', rng)) {
    const depth = Math.min(1, Math.max(0, l.spec.depth));
    for (let i = 0; i < n; i++) x[i] *= 1 - depth * (1 - (l.fn(i / rate) + 1) / 2);
  }
  if (layer.echo) applyEcho(x, layer.echo, rate);
  return x;
}

function eventTimes(ev: NonNullable<LayerSpec['events']>, total: number, rng: Rng): number[] {
  if (ev.times) return ev.times.filter(t => t < total);
  const every = ev.every ?? 1;
  const [lo, hi] = typeof every === 'number' ? [every, every] : every;
  const gap = () => lo + (hi - lo) * rng();
  const out: number[] = [];
  let t = ev.start ?? gap() * rng();
  while (t < total && out.length < 10000) { out.push(t); t += gap(); }
  return out;
}

function renderLayer(layer: LayerSpec, n: number, rate: number, seed: number, path: string, pitch: number): Float32Array {
  const rng = seededRandom(layer.seed ?? mixSeed(seed, path));
  const out = new Float32Array(n);
  const gain = dbToGain(layer.gain_db ?? 0);
  if (layer.events) {
    const len = layer.length ?? envelopeLength(layer.envelope) ?? 1;
    const body = Math.max(1, Math.round(len * rate));
    const vn = body + Math.round(echoTail(layer) * rate);
    for (const t of eventTimes(layer.events, n / rate, rng)) {
      const [p0, p1] = layer.events.pitch ?? [1, 1];
      const [g0, g1] = layer.events.gain_db ?? [0, 0];
      const p = pitch * (p0 + (p1 - p0) * rng());
      const g = gain * dbToGain(g0 + (g1 - g0) * rng());
      const voice = renderVoice(layer, vn, body, rate, mixSeed(seed, `${path}@${t}`), path, rng, p);
      const at = Math.round(t * rate);
      for (let j = 0; j < vn && at + j < n; j++) out[at + j] += voice[j] * g;
    }
    return out;
  }
  const at = Math.min(n, Math.round((layer.start ?? 0) * rate));
  // With a length, the voice is that long plus its echo; without one, it
  // fills the rest of the sound and the echo rings over it.
  const len = layer.length !== undefined
    ? Math.min(n - at, Math.round((layer.length + echoTail(layer)) * rate))
    : n - at;
  if (len <= 0) return out;
  const body = layer.length !== undefined ? Math.min(len, Math.round(layer.length * rate)) : len;
  const voice = renderVoice(layer, len, body, rate, seed, path, rng, pitch);
  for (let j = 0; j < len; j++) out[at + j] = voice[j] * gain;
  return out;
}

/**
 * One note of an instrument: its layers mixed into `n` samples, at `pitch`
 * times the frequencies written in them (filters follow unless track:
 * false). `seed` makes each note its own (a new pluck, a new strike).
 */
export function renderLayersAt(layers: LayerSpec[], n: number, rate: number, seed: number, pitch: number): Float32Array {
  const out = new Float32Array(n);
  layers.forEach((layer, i) => {
    const y = renderLayer(layer, n, rate, seed, String(i), pitch);
    for (let j = 0; j < n; j++) out[j] += y[j];
  });
  return out;
}

export { mixSeed };

// ── The whole recipe ─────────────────────────────────────────────────────

export function renderRecipe(recipe: Recipe): Rendered {
  const rate = recipe.rate ?? 22050;
  const seed = recipe.seed ?? 1;
  const n = Math.max(1, Math.round(recipe.duration * rate));
  const fade = recipe.loop ? Math.min(Math.round((recipe.crossfade ?? Math.min(1, recipe.duration / 4)) * rate), n) : 0;
  const total = n + fade;
  const mix = new Float32Array(total);
  recipe.layers.forEach((layer, i) => {
    const y = renderLayer(layer, total, rate, seed, String(i), 1);
    for (let j = 0; j < total; j++) mix[j] += y[j];
  });
  // DC blocker (one-pole high-pass near 12 Hz): brown noise and lopsided
  // envelopes leave an offset that would thump at the start and the seam.
  const r = 1 - (2 * Math.PI * 12) / rate;
  let px = 0, py = 0;
  for (let j = 0; j < total; j++) {
    const y = mix[j] - px + r * py;
    px = mix[j];
    py = y;
    mix[j] = y;
  }
  let samples: Float32Array;
  if (recipe.loop) {
    // The extra `fade` samples rendered after the end are laid over the
    // start with an equal-power crossfade: the last sample now leads into
    // the first exactly as it led into the extra ones.
    samples = mix.slice(0, n);
    for (let j = 0; j < fade; j++) {
      const k = (j + 0.5) / fade;
      samples[j] = mix[j] * Math.sin((Math.PI / 2) * k) + mix[n + j] * Math.cos((Math.PI / 2) * k);
    }
  } else {
    samples = mix;
    // A one-shot starts and ends at zero: no click when it is cut.
    const fin = Math.min(n, Math.round(0.002 * rate));
    const fout = Math.min(n, Math.round(0.01 * rate));
    const ease = (k: number) => (1 - Math.cos(Math.PI * k)) / 2;
    for (let j = 0; j < fin; j++) samples[j] *= ease(j / fin);
    for (let j = 0; j < fout; j++) samples[n - 1 - j] *= ease(j / fout);
  }
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  let gain = recipe.normalize !== undefined
    ? (peak > 0 ? dbToGain(recipe.normalize) / peak : 1)
    : dbToGain(recipe.gain_db ?? 0);
  let limited = false;
  // Never clip: anything that would pass -0.5 dBFS is pulled down to -1 dBFS.
  if (peak * gain > dbToGain(-0.5)) {
    gain = dbToGain(-1) / peak;
    limited = true;
  }
  for (let j = 0; j < samples.length; j++) samples[j] *= gain;
  return { rate, samples, loop: recipe.loop ? { start: 0, end: n - 1 } : undefined, limited };
}
