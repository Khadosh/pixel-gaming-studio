// Checking a sound without ears: duration, levels, DC offset, where the
// energy sits in the spectrum (centroid), whether a loop splices without a
// jump, whether a one-shot starts and ends at silence, and sudden clicks.
// Two numbers answer what a world's `says` asks of its sounds in words (#33,
// el patio, S2): how even the level is over time ("parejo") and how far the
// partials that ring are from a harmonic series ("nada metálico").

import { blankImage, type Rgba } from '../png';
import { drawText, textWidth } from '../inspect';
import { gainToDb } from './synth';
import type { Wav } from './wav';

export interface SoundStats {
  name: string;
  rate: number;
  duration: number;
  peak_db: number;
  rms_db: number;
  dc: number;
  centroid_hz: number;
  clipped: number;
  loop: boolean;
  /** Loops: the jump from the last sample to the first, and a typical step (99th percentile). */
  seam?: { jump: number; typical: number; level_db: number; ok: boolean };
  /** One-shots: the first and last sample (should be ~0). */
  edges?: { start: number; end: number; ok: boolean };
  clicks: number;
  /**
   * How even it is: the spread, in dB, between a loud and a quiet moment
   * (the 90th and the 10th percentile of the level in half-second windows,
   * the silent ones left out). An even ambience is a few dB. Null under a
   * second: a one-shot is not even or uneven.
   */
  even_db: number | null;
  /**
   * How metallic: the share (0 to 1, by magnitude) of the partials that ring
   * after the attack that belong to no harmonic series. A string or a
   * marimba, a chord or a melody of them, is near 0; a bell, well over 0.3.
   * Null when nothing rings with a pitch (noise, a knock, too short).
   */
  inharmonic: number | null;
  /** Seconds of the first clicks, to find them. */
  click_at: number[];
  warnings: string[];
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Energy-weighted spectral centroid over 1024-sample Hann frames. */
export function spectralCentroid(x: Float32Array, rate: number): number {
  const size = 1024;
  let num = 0, den = 0;
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let start = 0; start + size <= Math.max(x.length, size); start += size / 2) {
    for (let i = 0; i < size; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      re[i] = (x[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < size / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      num += mag * ((k * rate) / size);
      den += mag;
    }
    if (start + size >= x.length) break;
  }
  return den > 0 ? num / den : 0;
}

/**
 * The spread of the level over time, in dB: 90th minus 10th percentile of the
 * RMS of half-second windows (what the ear calls even: a cricket that chirps
 * twice a second is), leaving out the ones under -60 dBFS (silence before a
 * knock is not unevenness). Null for a sound shorter than two windows: a
 * one-shot is not even or uneven.
 */
export function levelSpread(x: Float32Array, rate: number): number | null {
  const w = Math.max(1, Math.round(rate * 0.5));
  const levels: number[] = [];
  for (let i = 0; i + w <= x.length; i += w) {
    const db = gainToDb(rms(x, i, i + w));
    if (db > -60) levels.push(db);
  }
  if (levels.length < 2) return null;
  levels.sort((a, b) => a - b);
  const at = (p: number) => levels[Math.min(levels.length - 1, Math.floor(p * levels.length))];
  return at(0.9) - at(0.1);
}

/**
 * How metallic what rings is, measured window by window (4096 samples, after
 * the first 50 ms: the attack of anything struck is noise). In each window,
 * its strongest peaks (within 30 dB of the top one and 10 dB over the
 * spectrum around them, above 50 Hz, up to twelve; peaks closer than 6 % are
 * one partial with its beats or its vibrato), and the share of their magnitude that belongs to no harmonic
 * series. A peak is harmonic when it is a whole multiple of another, or when
 * one of its own multiples is there: the notes of a chord each bring their
 * harmonics, the partials of a bell (2.76, 5.4 times the hum) do not. One
 * out of series counts only while it rings, the same frequency for half a
 * second: a creak glides, an arpeggio of marimba notes dies first. Averaged
 * over the windows that ring, by their energy: a string, a marimba or a melody of them is near 0,
 * a bell well over 0.3. Null when no window rings
 * with a pitch (its peaks hold under a third of its energy: noise, crackle)
 * or the sound is too short.
 */
const RING_SECONDS = 0.5;

export function inharmonicity(x: Float32Array, rate: number): number | null {
  const skip = Math.round(rate * 0.05), size = 4096;
  if (x.length - skip < size / 2) return null;
  const re = new Float64Array(size), im = new Float64Array(size), mag = new Float64Array(size / 2);
  const hz = rate / size, lo = Math.ceil(50 / hz);
  const windows: { f: { f: number; m: number }[]; free: boolean[]; total: number }[] = [];
  for (let start = skip; start + size / 2 <= x.length; start += size / 2) {
    for (let i = 0; i < size; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      re[i] = (x[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    let top = 0, total = 0;
    for (let k = 0; k < size / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    for (let k = lo; k < size / 2; k++) { top = Math.max(top, mag[k]); total += mag[k] * mag[k]; }
    if (top < 1e-3) continue;
    // A partial stands 10 dB over the spectrum around it; a bump of a noise band does not.
    const around = (k: number) => {
      const near: number[] = [];
      for (let j = Math.max(lo, k - 24); j <= Math.min(size / 2 - 1, k + 24); j++) if (Math.abs(j - k) > 3) near.push(mag[j]);
      near.sort((a, b) => a - b);
      return near[near.length >> 1] ?? 0;
    };
    const peaks: { k: number; m: number }[] = [];
    for (let k = lo + 1; k < size / 2 - 1; k++) {
      if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > top * 0.0316 && mag[k] > 3.16 * around(k)) peaks.push({ k, m: mag[k] });
    }
    peaks.sort((a, b) => b.m - a.m);
    const strong: { k: number; m: number }[] = [];
    for (const p of peaks) {
      if (strong.length >= 12) break;
      if (!strong.some(q => Math.abs(q.k - p.k) <= Math.max(2, 0.06 * q.k))) strong.push(p);
    }
    let held = 0;
    for (const p of strong) for (let k = Math.max(lo, p.k - 3); k <= Math.min(size / 2 - 1, p.k + 3); k++) held += mag[k] * mag[k];
    if (held < total / 3) continue;
    // The exact frequency of each peak, from the parabola through it and its neighbours.
    const freq = (k: number) => {
      const a = mag[k - 1], b = mag[k], c = mag[k + 1], d = a - 2 * b + c;
      return (k + (d ? (0.5 * (a - c)) / d : 0)) * hz;
    };
    const f = strong.map(p => ({ f: freq(p.k), m: p.m }));
    // b is a whole multiple (2 to 16) of a, within 1.5 % or a bin and a half
    const multiple = (b: number, a: number) => {
      const n = Math.round(b / a);
      return n >= 2 && n <= 16 && Math.abs(b - n * a) <= Math.max(0.015 * b, 1.5 * hz);
    };
    windows.push({ f, free: f.map(p => !f.some(q => multiple(p.f, q.f) || multiple(q.f, p.f))), total });
  }
  // A partial out of series counts when it rings: the same frequency (within
  // 1 %) holds for half a second. A creak that glides, a melody or an
  // arpeggio of marimba notes moves on or dies first; a bell holds its
  // partials for seconds. (A pad of three sustained pure notes reads as metal.)
  const ring = Math.ceil((RING_SECONDS * rate) / (size / 2));
  const holds = (i: number, hz0: number) => {
    let n = 0;
    while (n < ring && windows[i + n]?.f.some(q => Math.abs(q.f - hz0) <= 0.01 * hz0)) n++;
    return n >= ring;
  };
  let sum = 0, weight = 0;
  windows.forEach((w, i) => {
    // Two pure tones at once (two marimba notes overlapping, two crickets) are an interval, not a body that rings.
    if (w.f.length < 3) { weight += w.total; return; }
    let free = 0, all = 0;
    w.f.forEach((p, j) => {
      all += p.m;
      if (w.free[j] && holds(i, p.f)) free += p.m;
    });
    sum += (free / all) * w.total;
    weight += w.total;
  });
  return weight ? Math.round((sum / weight) * 100) / 100 : null;
}

const roundOrNull = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function rms(x: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/**
 * Clicks: a jump in the middle of a sound that goes on. A sample whose second
 * difference stands far above what the few dozen samples around it do (twenty
 * times: crackle grains reach ten, a square gate or a cut sixty), while the
 * level before and after it is about the same. A high tone or noise has
 * large second differences all along, so its neighbourhood keeps up; an
 * onset out of silence (a crackle, a knock) changes the level, so it is an
 * attack, not a click. What is left is a waveform that jumps: a cut, a
 * square gate, a bad splice. Returns the sample index of each one.
 */
export function findClicks(x: Float32Array): number[] {
  const n = x.length;
  if (n < 8) return [];
  const d2 = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) d2[i] = Math.abs(x[i + 1] - 2 * x[i] + x[i - 1]);
  const acc = new Float64Array(n + 1), sq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { acc[i + 1] = acc[i] + d2[i] * d2[i]; sq[i + 1] = sq[i] + x[i] * x[i]; }
  const sum = (a: Float64Array, from: number, to: number) => a[Math.min(n, Math.max(0, to))] - a[Math.min(n, Math.max(0, from))];
  const level = (from: number, to: number) => Math.sqrt(sum(sq, from, to) / Math.max(1, Math.min(n, to) - Math.max(0, from)));
  const wide = 32, near = 2;
  const out: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (d2[i] < 0.02) continue;
    const count = Math.min(n, i + wide + 1) - Math.max(0, i - wide) - (Math.min(n, i + near + 1) - Math.max(0, i - near));
    const local = Math.sqrt(Math.max(0, sum(acc, i - wide, i + wide + 1) - sum(acc, i - near, i + near + 1)) / Math.max(1, count));
    if (d2[i] <= 20 * local) continue;
    const before = level(i - 48, i - near), after = level(i + near + 1, i + 48);
    if (before < 0.25 * after || after < 0.25 * before) continue;
    out.push(i);
    i += 64;
  }
  return out;
}

export function analyzeWav(name: string, wav: Wav): SoundStats {
  const x = wav.samples;
  const n = x.length;
  let peak = 0, sum = 0, sq = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    peak = Math.max(peak, Math.abs(v));
    sum += v;
    sq += v * v;
    if (Math.abs(v) >= 32767 / 32767 - 1e-6) clipped++;
  }
  const warnings: string[] = [];
  const stats: SoundStats = {
    name,
    rate: wav.rate,
    duration: n / wav.rate,
    peak_db: gainToDb(peak),
    rms_db: gainToDb(Math.sqrt(sq / Math.max(1, n))),
    dc: sum / Math.max(1, n),
    centroid_hz: spectralCentroid(x, wav.rate),
    clipped,
    loop: wav.loop !== undefined,
    clicks: 0,
    even_db: roundOrNull(levelSpread(x, wav.rate)),
    inharmonic: inharmonicity(x, wav.rate),
    click_at: [],
    warnings,
  };
  const clicks = findClicks(x);
  stats.clicks = clicks.length;
  stats.click_at = clicks.slice(0, 5).map(i => Math.round((i / wav.rate) * 1000) / 1000);
  if (peak === 0) warnings.push('silent');
  if (stats.peak_db > -0.5) warnings.push('peak above -0.5 dBFS');
  if (clipped > 0) warnings.push(`${clipped} clipped samples`);
  if (Math.abs(stats.dc) > 0.005) warnings.push('DC offset');
  if (stats.clicks > 0) warnings.push(`${stats.clicks} clicks (${stats.click_at.join(', ')} s)`);
  if (wav.loop) {
    // The splice is the step from the last sample to the first: it should be
    // no bigger than the usual step, and the waveform should bend through it
    // like anywhere else (the click test run across the seam).
    const steps = new Float32Array(Math.max(0, n - 1));
    for (let i = 1; i < n; i++) steps[i - 1] = Math.abs(x[i] - x[i - 1]);
    const typical = percentile(steps, 0.99);
    const jump = Math.abs(x[0] - x[n - 1]);
    const w = Math.min(Math.floor(n / 2), 256);
    const across = new Float32Array(2 * w);
    across.set(x.subarray(n - w, n), 0);
    across.set(x.subarray(0, w), w);
    const kinks = findClicks(across).filter(i => Math.abs(i - w) <= 3).length;
    const head = rms(x, 0, w), tail = rms(x, n - w, n);
    const levelDb = head > 0 && tail > 0 ? Math.abs(gainToDb(head) - gainToDb(tail)) : 0;
    const ok = jump <= Math.max(typical * 1.5, 0.002) && kinks === 0;
    stats.seam = { jump, typical, level_db: levelDb, ok };
    if (!ok) warnings.push('loop seam jumps');
  } else {
    const start = Math.abs(x[0] ?? 0), end = Math.abs(x[n - 1] ?? 0);
    const ok = start < 0.01 && end < 0.01;
    stats.edges = { start, end, ok };
    if (!ok) warnings.push('does not start/end at silence');
  }
  return stats;
}

const fmtDb = (db: number) => (Number.isFinite(db) ? db.toFixed(1) : '-inf');

/** One row per sound, aligned, for the terminal. */
export function statsTable(rows: SoundStats[]): string {
  const head = ['sound', 'sec', 'Hz', 'peak', 'rms', 'dc', 'centroid', 'even', 'inharm', 'loop', 'check'];
  const lines = rows.map(s => [
    s.name,
    s.duration.toFixed(2),
    String(s.rate),
    fmtDb(s.peak_db),
    fmtDb(s.rms_db),
    s.dc.toFixed(4),
    `${Math.round(s.centroid_hz)}`,
    s.even_db === null ? '-' : s.even_db.toFixed(1),
    s.inharmonic === null ? '-' : s.inharmonic.toFixed(2),
    s.loop ? (s.seam!.ok ? 'seam ok' : 'SEAM') : '-',
    s.warnings.length === 0 ? 'ok' : s.warnings.join('; '),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map(l => l[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => (i === 0 || i === cells.length - 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd();
  return [fmt(head), ...lines.map(fmt)].join('\n');
}

/** Waveform strips (min/max per column), one per sound, with its name. */
export function waveformSheet(items: { name: string; wav: Wav; stats: SoundStats }[], width = 480): Rgba {
  const px = 2, rowH = 64, label = 14, pad = 8;
  const sub = (it: { stats: SoundStats }) => `${it.stats.duration.toFixed(1)}s ${Math.round(it.stats.centroid_hz)}hz`;
  const longest = Math.max(...items.map(it => Math.max(textWidth(it.name, px), textWidth(sub(it), px))), 40);
  const w = pad * 3 + longest + width;
  const h = pad + items.length * (rowH + pad);
  const img = blankImage(w, h, [28, 26, 31, 255]);
  items.forEach((it, row) => {
    const y0 = pad + row * (rowH + pad);
    drawText(img, it.name, pad, y0 + 4, px, [230, 220, 198, 255]);
    drawText(img, sub(it), pad, y0 + 4 + label, px, [153, 143, 122, 255]);
    const x0 = pad * 2 + longest;
    const mid = y0 + rowH / 2;
    const x = it.wav.samples;
    const color: [number, number, number, number] = it.stats.warnings.length ? [201, 112, 90, 255] : [127, 174, 138, 255];
    for (let c = 0; c < width; c++) {
      const from = Math.floor((c * x.length) / width), to = Math.max(from + 1, Math.floor(((c + 1) * x.length) / width));
      let lo = 0, hi = 0;
      for (let i = from; i < to && i < x.length; i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
      const top = Math.round(mid - hi * (rowH / 2 - 1)), bottom = Math.round(mid - lo * (rowH / 2 - 1));
      for (let y = top; y <= bottom; y++) {
        const o = (y * img.width + x0 + c) * 4;
        img.data[o] = color[0]; img.data[o + 1] = color[1]; img.data[o + 2] = color[2]; img.data[o + 3] = 255;
      }
      const o = (mid * img.width + x0 + c) * 4;
      if (img.data[o] === 28) { img.data[o] = 70; img.data[o + 1] = 66; img.data[o + 2] = 75; }
    }
  });
  return img;
}
