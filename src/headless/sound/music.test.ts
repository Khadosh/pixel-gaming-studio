// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScore, renderScore, parsePitch, pitchHz } from './music';
import { musicToWav, parseRecipe, renderRecipe } from './index';
import { analyzeWav } from './analyze';
import { decodeWav } from './wav';
import { runCommand } from '../commands';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-music-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// The theme of The Unwritten Dao: yu mode on A, ends on D without resolving.
const THEME = `
titulo: tema
tempo: 66
compas: 4/4
semilla: 7
loop: si
humano: tiempo=0.012 fuerza=1.5
sala: 0.2 largo=2
instrumento cit = citara
voz tema = cit
mf | A3 q E4 h. | D4 e E4 G4 q E4 h | D4 q C4 A3 h | C4 q D4 h. |
voz cuenco = cuenco gain=-8
| A4 w | r w | r w | r w |
`;

/** Fundamental by autocorrelation over a window (Hz). */
function pitchOf(x: Float32Array, rate: number, from: number, lo = 80, hi = 1500): number {
  const size = 4096;
  const seg = x.subarray(from, from + size);
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(rate / hi); lag <= Math.ceil(rate / lo); lag++) {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  // Parabolic refinement around the best lag.
  const ac = (lag: number) => { let s = 0; for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag]; return s; };
  const a = ac(bestLag - 1), b = ac(bestLag), c = ac(bestLag + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return rate / (bestLag + (Number.isFinite(shift) ? shift : 0));
}

describe('scores', () => {
  it('reads notes, durations that carry over, rests, chords, repeats and dynamics', () => {
    const s = parseScore(`tempo: 60\nvoz a = citara\np A3 q E4 r h | [ D4 e E4 ]x2 r q A3+E4 |\n`);
    const v = s.voices[0];
    expect(v.beats).toBe(8);
    expect(v.notes.map(n => n.beat)).toEqual([0, 1, 4, 4.5, 5, 5.5, 7]);
    expect(v.notes[1].pitches).toEqual([parsePitch('E4')]);
    expect(v.notes[6].pitches).toEqual([parsePitch('A3'), parsePitch('E4')]);
    expect(v.notes[0].db).toBe(-8);
    expect(parsePitch('A4')).toBe(0);
    expect(parsePitch('C#4')).toBe(-8);
    expect(parsePitch('Bb2')).toBe(-23);
    expect(pitchHz(parsePitch('A3')!)).toBeCloseTo(220, 6);
  });

  it('a bar that does not close names its line; unknown words too', () => {
    expect(() => parseScore(`voz a = citara\nA3 q E4 h |\n`, 'mal.partitura')).toThrow(/mal\.partitura:2: el compás no cierra/);
    expect(() => parseScore(`voz a = citara\nA3 q\nH9 q\n`, 'mal.partitura')).toThrow(/mal\.partitura:3: no entiendo «H9»/);
    expect(() => parseScore(`voz a = flauta\nA3 q\n`, 'mal.partitura')).toThrow(/no conozco el instrumento «flauta»/);
    expect(() => parseScore(`voz a = citara\n[ A3 q\n`, 'mal.partitura')).toThrow(/sin cerrar/);
  });

  it('the same score and seed give the same bytes; another seed, others', () => {
    const a = musicToWav(parseScore(THEME)).wav;
    const b = musicToWav(parseScore(THEME)).wav;
    expect(Buffer.compare(a, b)).toBe(0);
    const c = musicToWav(parseScore(THEME.replace('semilla: 7', 'semilla: 8'))).wav;
    expect(Buffer.compare(a, c)).not.toBe(0);
  });

  it('a loop is as long as its bars and splices with no jump, even with a note ringing over the seam', () => {
    // The last note rings past the end: its tail has to come back at the start.
    const r = renderScore(parseScore(THEME.replace('| C4 q D4 h. |', '| C4 q D4 h G4 q |')));
    expect(r.bars).toBe(4);
    expect(r.samples.length).toBe(Math.round(4 * 4 * (60 / 66) * 22050));
    const s = analyzeWav('tema', { rate: r.rate, samples: r.samples, loop: r.loop });
    expect(s.seam!.ok).toBe(true);
    expect(s.seam!.jump).toBeGreaterThan(0); // something is really sounding across it
    expect(s.clicks).toBe(0);
    expect(s.warnings).toEqual([]);
  });

  it('levels: the peak lands on normalize, nothing clips, no DC; a one-shot ends at silence', () => {
    const s = analyzeWav('t', decodeWav(musicToWav(parseScore(THEME)).wav));
    expect(s.clipped).toBe(0);
    expect(Math.abs(s.dc)).toBeLessThan(0.005);
    const six = analyzeWav('t', decodeWav(musicToWav(parseScore(THEME.replace('loop: si', 'normalizar: -6'))).wav));
    expect(Math.abs(six.peak_db + 6)).toBeLessThan(0.1);
    expect(six.loop).toBe(false);
    expect(six.edges!.ok).toBe(true);
    expect(six.rms_db).toBeLessThan(-12); // plucked: peaks well over the body
  });

  it('humanizing moves notes a little, never a lot', () => {
    const straight = renderScore(parseScore(`tempo: 60\nsemilla: 3\nvoz a = madera\nA5 q A5 A5 A5 |\n`));
    const loose = renderScore(parseScore(`tempo: 60\nsemilla: 3\nhumano: tiempo=0.02 fuerza=2\nvoz a = madera\nA5 q A5 A5 A5 |\n`));
    const onset = (x: Float32Array, from: number) => { for (let i = from; i < x.length; i++) if (Math.abs(x[i]) > 0.05) return i; return -1; };
    const rate = straight.rate;
    const a = onset(straight.samples, Math.round(0.6 * rate)), b = onset(loose.samples, Math.round(0.6 * rate));
    expect(Math.abs(a - Math.round(1 * rate))).toBeLessThan(0.005 * rate);
    expect(Math.abs(b - a)).toBeLessThan(0.03 * rate);
  });
});

describe('instruments', () => {
  it('the string is in tune at every pitch (the old pluck rounded the period)', () => {
    for (const name of ['A2', 'E3', 'A3', 'E4', 'G4', 'E5']) {
      const hz = pitchHz(parsePitch(name)!);
      const r = renderRecipe(parseRecipe({ duration: 0.6, layers: [{ source: { type: 'string', freq: hz } }] }));
      const got = pitchOf(r.samples, r.rate, 2000, 60, 1400);
      const cents = 1200 * Math.log2(got / hz);
      expect(Math.abs(cents), `${name}: ${got.toFixed(2)} Hz vs ${hz.toFixed(2)}`).toBeLessThan(6);
    }
  });

  it('a string rings for about its ring, high or low', () => {
    for (const hz of [110, 660]) {
      const r = renderRecipe(parseRecipe({ duration: 3, layers: [{ source: { type: 'string', freq: hz, ring: 2 } }] }));
      const level = (t: number) => { let s = 0; const a = Math.round(t * r.rate); for (let i = a; i < a + 1000; i++) s += r.samples[i] ** 2; return Math.sqrt(s / 1000); };
      const drop = 20 * Math.log10(level(1.0) / level(0.1));
      // 0.9 s of a 2 s ring is about 27 dB (the high harmonics die faster).
      expect(drop, `${hz} Hz`).toBeLessThan(-18);
      expect(drop, `${hz} Hz`).toBeGreaterThan(-45);
    }
  });

  it('the bowl is inharmonic and its high partials die first', () => {
    const r = renderRecipe(parseRecipe({ duration: 6, normalize: -6, layers: [{ source: { type: 'bell', freq: 300 } }] }));
    const early = analyzeWav('e', { rate: r.rate, samples: r.samples.slice(0, r.rate) });
    const late = analyzeWav('l', { rate: r.rate, samples: r.samples.slice(4 * r.rate, 5 * r.rate) });
    expect(late.centroid_hz).toBeLessThan(early.centroid_hz);
    expect(early.edges!.start).toBeLessThan(0.01);
  });

  it('a peak filter can stay put while the note moves (the box of the instrument)', () => {
    const one = parseRecipe({ duration: 1, layers: [{ source: { type: 'noise' }, filters: [{ type: 'peak', freq: 300, q: 4, gain_db: 18, track: false }] }] });
    expect(renderRecipe(one).samples.length).toBe(22050);
  });
});

describe('music command', () => {
  it('renders a directory of scores and sound_contact checks them', async () => {
    const src = join(dir, 'musica');
    mkdirSync(src);
    writeFileSync(join(src, 'tema.partitura'), THEME);
    mkdirSync(join(src, 'instrumentos'));
    writeFileSync(join(src, 'instrumentos', 'golpe.json'), JSON.stringify({
      base: 440, ring: 0.4, pitched: false,
      layers: [{ source: { type: 'sine', freq: 100 }, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } }],
    }));
    writeFileSync(join(src, 'golpes.partitura'), `tempo: 90\nloop: si\nvoz g = golpe\nx q x r h |\n`);
    const made = await runCommand('music', { score: src, out_dir: src });
    expect((made.data as { written: number }).written).toBe(2);
    expect(existsSync(join(src, 'tema.wav'))).toBe(true);
    const checked = await runCommand('sound_contact', { paths: [src] });
    expect((checked.data as { warnings: number }).warnings).toBe(0);
    expect(checked.text).toMatch(/tema .*seam ok/);
  });

  it('takes the score text inline', async () => {
    const out = join(dir, 'x.wav');
    const res = await runCommand('music', { score: 'tempo: 120\nvoz a = campana\nA5 q E5 r h |\n', out });
    expect((res.data as { notes: number }).notes).toBe(2);
  });
});
