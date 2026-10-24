// @vitest-environment node
// The chip voices (pulso12/25/50, triangular, ruido and the chip drums),
// measured on the WAV the way a listener would check them: the width of the
// pulse, the missing even harmonics of the triangle, a noise with no pitch,
// notes that last as long as they are written, and the same bytes twice.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScore } from './music';
import { musicToWav, parseRecipe, renderRecipe } from './index';
import { decodeWav } from './wav';

const RATE = 44100;

/** The samples of a score as they come out of the WAV. */
function wavOf(text: string): Float32Array {
  return decodeWav(musicToWav(parseScore(`frecuencia: ${RATE}\n${text}`)).wav).samples;
}

/** A single note held one second (tempo 60, a whole note is 4 s; we take the middle). */
const held = (inst: string, note: string) => wavOf(`tempo: 240\nvoz a = ${inst}\n${note} w |\n`);

/** Share of each period above the midpoint of its own low and high (a DC blocker tilts the levels). */
function dutyOf(x: Float32Array, from: number, to: number, period: number): number {
  let high = 0, total = 0;
  for (let s = from; s + period <= to; s += period) {
    let lo = Infinity, hi = -Infinity;
    for (let i = s; i < s + period; i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
    const mid = (lo + hi) / 2;
    for (let i = s; i < s + period; i++) { if (x[i] > mid) high++; total++; }
  }
  return high / total;
}

/** Amplitude at `hz` with a Hann window (Goertzel), over x[from, from + n). */
function amplitudeAt(x: Float32Array, from: number, n: number, hz: number): number {
  const w = (2 * Math.PI * hz) / RATE;
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) {
    const v = x[from + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    re += v * Math.cos(w * i);
    im -= v * Math.sin(w * i);
  }
  return Math.hypot(re, im) / n;
}

const db = (a: number, ref: number) => 20 * Math.log10(a / ref);

/** The strongest normalized autocorrelation between lags lo and hi: ~1 a pitch, ~0 none. */
function periodicity(x: Float32Array, from: number, n: number, lo: number, hi: number): number {
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[from + i];
  mean /= n;
  let e = 0;
  for (let i = 0; i < n; i++) e += (x[from + i] - mean) ** 2;
  let best = 0;
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (x[from + i] - mean) * (x[from + i + lag] - mean);
    best = Math.max(best, s / e);
  }
  return best;
}

describe('chip voices', () => {
  it('a pulse is as wide as its name: 12.5, 25 and 50 % of each period', () => {
    // A4 tuned to 441 Hz so a period is exactly 100 samples.
    for (const [inst, duty] of [['pulso12', 0.125], ['pulso25', 0.25], ['pulso50', 0.5]] as const) {
      const x = wavOf(`tempo: 240\nafinación: 441\nvoz a = ${inst}\nA4 w |\n`);
      // Within half a sample of the period (12.5 samples of 100 can only be 12 or 13).
      expect(Math.abs(dutyOf(x, RATE * 0.25, RATE * 0.75, 100) - duty), inst).toBeLessThanOrEqual(0.005 + 1e-9);
    }
  });

  it('the triangle has no even harmonics, and the odd ones fall as 1/n²', () => {
    const f = 220;
    const x = held('triangular', 'A3');
    const from = Math.round(RATE * 0.2), n = RATE / 2;
    const h1 = amplitudeAt(x, from, n, f);
    for (const k of [2, 4, 6, 8]) expect(db(amplitudeAt(x, from, n, k * f), h1), `armónico ${k}`).toBeLessThan(-45);
    // 1/9 is -19 dB; the 16 steps leave it there.
    expect(db(amplitudeAt(x, from, n, 3 * f), h1)).toBeGreaterThan(-21);
    expect(db(amplitudeAt(x, from, n, 3 * f), h1)).toBeLessThan(-17);
    // The same measure finds the even harmonics of a 25 % pulse: it is not blind to them.
    const p = held('pulso25', 'A3');
    expect(db(amplitudeAt(p, from, n, 2 * f), amplitudeAt(p, from, n, f))).toBeGreaterThan(-6);
  });

  it('the triangle is 16 steps', () => {
    const x = renderRecipe(parseRecipe({ duration: 0.1, rate: RATE, layers: [{ source: { type: 'triangle', freq: 110, steps: 16 } }] })).samples;
    // A stepped wave moves in jumps of a step and holds in between: a period of
    // 16 levels up and down is 30 jumps (the top and bottom are one level each).
    const jumps = (y: Float32Array) => {
      let peak = 0;
      for (const v of y) peak = Math.max(peak, Math.abs(v));
      let count = 0;
      for (let i = 1001; i < 1001 + 401 * 8; i++) if (Math.abs(y[i] - y[i - 1]) > peak * 0.06) count++;
      return count / 8; // 8 periods of 110 Hz
    };
    expect(jumps(x)).toBeGreaterThanOrEqual(29);
    expect(jumps(x)).toBeLessThanOrEqual(31);
    const smooth = renderRecipe(parseRecipe({ duration: 0.1, rate: RATE, layers: [{ source: { type: 'triangle', freq: 110 } }] })).samples;
    expect(jumps(smooth)).toBe(0);
  });

  it('the noise has no pitch; the short mode does, at clock / 93', () => {
    const x = held('ruido', 'A4');
    const from = Math.round(RATE * 0.2), n = 8192;
    // Lags past the hold of a single value (7 kHz clock ≈ 6 samples) up to 40 Hz.
    expect(periodicity(x, from, n, 20, 1100)).toBeLessThan(0.15);
    // The same measure on the short register: 93 steps at 9300 Hz is a 100 Hz tone (441 samples).
    const short = renderRecipe(parseRecipe({
      duration: 1, rate: RATE, layers: [{ source: { type: 'chip_noise', freq: 9300, short: true } }],
    })).samples;
    expect(periodicity(short, from, n, 20, 1100)).toBeGreaterThan(0.9);
    // And a held pulse, for scale.
    expect(periodicity(held('pulso50', 'A2'), from, n, 20, 1100)).toBeGreaterThan(0.9);
  });

  it('a chip note lasts as long as it is written; a plucked one rings over the rest', () => {
    const rms = (x: Float32Array, a: number, b: number) => {
      let s = 0;
      for (let i = Math.round(a * RATE); i < Math.round(b * RATE); i++) s += x[i] * x[i];
      return Math.sqrt(s / (Math.round(b * RATE) - Math.round(a * RATE)));
    };
    // tempo 60: the note 0–1 s, a rest 1–2 s, another note 2–4 s.
    const chip = wavOf('tempo: 60\ncola: 0.1\nvoz a = pulso50\nA4 q r q A4 h |\n');
    expect(rms(chip, 0.1, 0.9)).toBeGreaterThan(0.2);
    expect(rms(chip, 1.02, 1.98)).toBeLessThan(0.001);
    expect(rms(chip, 2.1, 3.9)).toBeGreaterThan(0.2);
    const pluck = wavOf('tempo: 60\ncola: 0.1\nvoz a = citara\nA4 q r q A4 h |\n');
    expect(rms(pluck, 1.02, 1.98)).toBeGreaterThan(0.01);
  });

  it('the chip drums hit with x and die by themselves', () => {
    const x = wavOf('tempo: 120\ncola: 0.3\nvoz b = bombo8\nx q r h. |\nvoz c = caja8\nr q x r h |\nvoz h = charles8\nr h x q r q |\n');
    let early = 0, late = 0;
    for (let i = 0; i < RATE * 0.1; i++) early = Math.max(early, Math.abs(x[i]));
    for (let i = Math.round(RATE * 1.8); i < Math.round(RATE * 2); i++) late = Math.max(late, Math.abs(x[i]));
    expect(early).toBeGreaterThan(0.3);
    expect(late).toBeLessThan(0.01);
  });

  it('the example renders the same bytes twice', () => {
    const file = fileURLToPath(new URL('../../../examples/sonido/chip_en_do.partitura', import.meta.url));
    const text = readFileSync(file, 'utf8');
    const a = musicToWav(parseScore(text, file)).wav;
    const b = musicToWav(parseScore(text, file)).wav;
    expect(a.length).toBeGreaterThan(1000);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('a game can bring its own chip voice as JSON, with hold', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-chip-'));
    try {
      mkdirSync(join(dir, 'instrumentos'));
      writeFileSync(join(dir, 'instrumentos', 'pulso_suave.json'), JSON.stringify({
        base: 440, ring: 0.1, hold: true,
        layers: [{ source: { type: 'square', freq: 440, duty: 0.375 } }],
      }));
      const file = join(dir, 'p.partitura');
      const s = parseScore(`tempo: 60\nfrecuencia: ${RATE}\nafinación: 441\ncola: 0.1\nvoz a = pulso_suave\nA4 q r q r h |\n`, file);
      const x = decodeWav(musicToWav(s).wav).samples;
      expect(Math.abs(dutyOf(x, RATE * 0.25, RATE * 0.75, 100) - 0.375)).toBeLessThanOrEqual(0.005 + 1e-9);
      let rest = 0;
      // From 1.1 s: a pulse that is not 50 % carries DC, and the DC blocker lets it go in some 13 ms.
      for (let i = Math.round(RATE * 1.1); i < Math.round(RATE * 1.98); i++) rest = Math.max(rest, Math.abs(x[i]));
      expect(rest).toBeLessThan(0.001);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
