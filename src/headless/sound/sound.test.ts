// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRecipe } from './synth';
import { encodeWav, decodeWav } from './wav';
import { analyzeWav } from './analyze';
import { parseRecipe, soundToWav } from './index';
import { runCommand } from '../commands';
import type { Recipe } from './recipe';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pss-sound-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const wind: Recipe = parseRecipe({
  id: 'viento', duration: 3, loop: true, seed: 7, normalize: -12,
  layers: [
    { source: { type: 'noise', color: 'pink' }, filters: [{ type: 'lowpass', freq: 600 }],
      lfo: [{ target: 'cutoff', rate: 0.5, depth: 1, shape: 'random' }, { target: 'gain', rate: 0.3, depth: 0.5, shape: 'random' }] },
    { source: { type: 'sine', freq: 3000 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0 },
      events: { every: [0.4, 0.9], pitch: [0.9, 1.2], gain_db: [-12, -4] }, filters: [{ type: 'bandpass', freq: 3000, q: 3 }] },
  ],
});

const stats = (r: Recipe) => analyzeWav(r.id ?? 'x', decodeWav(soundToWav(r).wav));

describe('sound recipes', () => {
  it('the same recipe and seed give the same bytes; another seed, others', () => {
    const a = soundToWav(wind).wav;
    const b = soundToWav(wind).wav;
    expect(Buffer.compare(a, b)).toBe(0);
    const c = soundToWav({ ...wind, seed: 8 }).wav;
    expect(Buffer.compare(a, c)).not.toBe(0);
  });

  it('a layer keeps its sound when another layer is added', () => {
    const one = renderRecipe({ ...wind, normalize: undefined, layers: [wind.layers[0]] }).samples;
    const extra = parseRecipe({ duration: 3, layers: [{ source: { type: 'sine', freq: 100 }, gain_db: -200 }] }).layers[0];
    const two = renderRecipe({ ...wind, normalize: undefined, layers: [wind.layers[0], extra] }).samples;
    let diff = 0;
    for (let i = 0; i < one.length; i++) diff = Math.max(diff, Math.abs(one[i] - two[i]));
    expect(diff).toBeLessThan(1e-6);
  });

  it('a loop splices without a jump, and the check catches one that does not', () => {
    const s = stats(wind);
    expect(s.loop).toBe(true);
    expect(s.seam!.ok).toBe(true);
    expect(s.warnings).toEqual([]);
    // A sine cut at a non-whole number of cycles, marked as a loop: it jumps.
    const tone = renderRecipe(parseRecipe({ duration: 1, layers: [{ source: { type: 'sine', freq: 441.3 } }], normalize: -6 }));
    const cut = tone.samples.slice(0, Math.round(0.73 * tone.rate));
    const bad = analyzeWav('cut', decodeWav(encodeWav(tone.rate, cut, { start: 0, end: cut.length - 1 })));
    expect(bad.seam!.ok).toBe(false);
    // The same sine as a real loop recipe splices fine.
    const good = stats(parseRecipe({ duration: 0.73, loop: true, crossfade: 0.2, layers: [{ source: { type: 'sine', freq: 441.3 } }], normalize: -6 }));
    expect(good.seam!.ok).toBe(true);
  });

  it('never clips: a loud recipe is pulled under 0 dBFS, normalize lands on its target', () => {
    const loud = parseRecipe({ duration: 0.5, gain_db: 30, layers: [{ source: { type: 'square', freq: 220 } }] });
    const r = soundToWav(loud);
    expect(r.limited).toBe(true);
    expect(r.stats.peak_db).toBeLessThan(0);
    expect(r.stats.clipped).toBe(0);
    const norm = stats(parseRecipe({ duration: 0.5, normalize: -9, layers: [{ source: { type: 'saw', freq: 110 } }] }));
    expect(Math.abs(norm.peak_db + 9)).toBeLessThan(0.1);
  });

  it('one-shots start and end at silence and carry no DC', () => {
    const thud = stats(parseRecipe({ duration: 0.4, normalize: -6, layers: [
      { source: { type: 'noise', color: 'brown' }, filters: [{ type: 'lowpass', freq: 300 }] },
      { source: { type: 'sine', freq: [[0, 140], [0.2, 60]] }, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } },
    ] }));
    expect(thud.edges!.ok).toBe(true);
    expect(Math.abs(thud.dc)).toBeLessThan(0.005);
  });

  it('every source sounds, and the centroid tells low from high', () => {
    for (const type of ['sine', 'triangle', 'square', 'saw', 'noise', 'pluck', 'crackle'] as const) {
      const s = stats(parseRecipe({ duration: 0.5, normalize: -6, layers: [{ source: { type, freq: 330 } }] }));
      expect(s.peak_db, type).toBeGreaterThan(-7);
      expect(Number.isFinite(s.rms_db), type).toBe(true);
    }
    const low = stats(parseRecipe({ duration: 1, normalize: -6, layers: [{ source: { type: 'noise', color: 'brown' }, filters: [{ type: 'lowpass', freq: 300 }] }] }));
    const high = stats(parseRecipe({ duration: 1, normalize: -6, layers: [{ source: { type: 'noise' }, filters: [{ type: 'highpass', freq: 4000 }] }] }));
    expect(low.centroid_hz).toBeLessThan(800);
    expect(high.centroid_hz).toBeGreaterThan(4000);
  });

  it('events land where they are told', () => {
    const r = renderRecipe(parseRecipe({ duration: 2, layers: [{ source: { type: 'sine', freq: 1000 },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, events: { times: [0.5, 1.5] } }] }));
    const energy = (from: number, to: number) => {
      let e = 0;
      for (let i = Math.round(from * r.rate); i < Math.round(to * r.rate); i++) e += r.samples[i] ** 2;
      return e;
    };
    expect(energy(0.5, 0.56)).toBeGreaterThan(1);
    expect(energy(1.5, 1.56)).toBeGreaterThan(1);
    expect(energy(0.7, 1.4)).toBeLessThan(1e-6);
  });

  it('the click check flags a jump in a clean tone and passes the clean tone', () => {
    const tone = renderRecipe(parseRecipe({ duration: 0.5, normalize: -6, layers: [{ source: { type: 'sine', freq: 200 }, envelope: { attack: 0.01, release: 0.05 } }] }));
    expect(analyzeWav('t', { rate: tone.rate, samples: tone.samples }).clicks).toBe(0);
    const broken = tone.samples.slice();
    for (let i = 5000; i < broken.length; i++) broken[i] = -broken[i];
    expect(analyzeWav('t', { rate: tone.rate, samples: broken }).clicks).toBeGreaterThan(0);
  });

  it('WAV round trip keeps rate, samples and the loop point', () => {
    const r = renderRecipe(wind);
    const back = decodeWav(encodeWav(r.rate, r.samples, r.loop));
    expect(back.rate).toBe(22050);
    expect(back.samples.length).toBe(r.samples.length);
    expect(back.loop).toEqual({ start: 0, end: r.samples.length - 1 });
    let err = 0;
    for (let i = 0; i < r.samples.length; i++) err = Math.max(err, Math.abs(back.samples[i] - r.samples[i]));
    expect(err).toBeLessThan(1 / 32767 + 1e-6);
  });

  it('a bad recipe names where it fails', () => {
    expect(() => parseRecipe({ duration: 1, layers: [{ source: { type: 'kazoo' } }] }, 'mal.json')).toThrow(/mal\.json/);
    expect(() => parseRecipe({ duration: 1, layers: [{}] })).toThrow(/source or layers/);
  });
});

describe('sound commands', () => {
  it('sound renders a directory of recipes and sound_contact checks them', async () => {
    const src = join(dir, 'recetas');
    mkdirSync(src);
    writeFileSync(join(src, 'viento.json'), JSON.stringify(wind));
    writeFileSync(join(src, 'tin.json'), JSON.stringify({ duration: 0.5, normalize: -10, layers: [
      { source: { type: 'sine', freq: 2600 }, envelope: { attack: 0.002, decay: 0.45, sustain: 0 } }] }));
    const out = join(dir, 'wav');
    const made = await runCommand('sound', { recipe: src, out_dir: out });
    expect((made.data as { written: number }).written).toBe(2);
    expect(existsSync(join(out, 'viento.wav'))).toBe(true);
    expect(readFileSync(join(out, 'tin.wav')).toString('ascii', 0, 4)).toBe('RIFF');
    const sheet = join(dir, 'sheet.png');
    const checked = await runCommand('sound_contact', { paths: [out], out: sheet });
    expect(checked.text).toMatch(/viento .*seam ok/);
    expect((checked.data as { warnings: number }).warnings).toBe(0);
    expect(existsSync(sheet)).toBe(true);
  });

  it('sound takes an inline recipe', async () => {
    const out = join(dir, 'x.wav');
    const res = await runCommand('sound', { recipe: { duration: 0.2, layers: [{ source: { type: 'pluck', freq: 196 } }] }, out });
    expect((res.data as { duration: number }).duration).toBeCloseTo(0.2, 2);
  });

  // The examples are the only reference a newcomer has: if one of them stops
  // rendering, or stops passing the check it is supposed to teach, it is a bug.
  it('every example in examples/sonido renders and passes the check', async () => {
    const examples = fileURLToPath(new URL('../../../examples/sonido', import.meta.url));
    const out = join(dir, 'ejemplos');
    const sounds = await runCommand('sound', { recipe: examples, out_dir: out });
    expect((sounds.data as { written: number }).written).toBe(6);
    const score = await runCommand('music', { score: examples, out_dir: out });
    expect((score.data as { written: number }).written).toBe(1);
    const checked = await runCommand('sound_contact', { paths: [out] });
    expect((checked.data as { sounds: unknown[] }).sounds.length).toBe(7);
    expect((checked.data as { warnings: number }).warnings).toBe(0);
    expect(checked.text).toMatch(/agua_que_corre .*seam ok/);
    expect(checked.text).toMatch(/bucle_en_la .*seam ok/);
  });
});
