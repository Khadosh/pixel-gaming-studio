// Built-in instruments for scores (music.ts). Each one is sound recipe
// layers (recipe.ts) tuned to `base` Hz: a note plays them at note / base
// times their frequencies. Plucked and struck sounds (strings, bowls, bells,
// a gong, a drum, wood) ring `ring` seconds whatever the score writes; the
// chip voices (pulse, triangle, noise, as on a NES) have `hold`: a note
// sounds as long as it is written, and stops.
//
// A game can bring its own as a JSON file with the same shape
// ({ base, ring, pitched, strum, hold, layers }) and name it in the score.

import { z } from 'zod';
import { layerSchema } from './recipe';

export const instrumentSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  base: z.number().positive().optional().describe('Hz the layers are written at (default 440)'),
  ring: z.number().positive().optional().describe('seconds each note lasts, the tail included (default 3)'),
  pitched: z.boolean().optional().describe('false = a drum: x plays it as written, a note retunes it (default true)'),
  strum: z.number().nonnegative().optional().describe('seconds between the notes of a chord, low to high (default 0)'),
  hold: z.boolean().optional().describe('true = a note sounds as long as it is written and stops (organ, chip voices); default false, it rings `ring` seconds'),
  gain_db: z.number().optional(),
  layers: z.array(layerSchema).min(1),
});

export type Instrument = z.infer<typeof instrumentSchema>;

/** A pick: a tick of bright noise at the very start of a plucked note. */
const pick = (db: number, hp = 2500) => ({
  source: { type: 'noise' as const },
  gain_db: db,
  length: 0.03,
  envelope: { attack: 0.0005, decay: 0.014, sustain: 0, release: 0.005 },
  filters: [{ type: 'highpass' as const, freq: hp, track: false }],
});

/** A chip pulse: a square wave with this duty, held as long as the note. */
const pulse = (duty: number, what: string): Instrument => ({
  description: `chip pulse ${what}: a square wave ${duty * 100}% high, held as written (NES channels 1 and 2)`,
  base: 440, ring: 0.1, hold: true, gain_db: -9,
  layers: [{ source: { type: 'square', freq: 440, duty }, envelope: { attack: 0.002, release: 0.004 } }],
});

/** A chip drum hit: noise of the register at `clock` Hz that dies in `decay` seconds. */
const chipHit = (clock: number, decay: number, db = 0, short = false) => ({
  source: { type: 'chip_noise' as const, freq: clock, short },
  gain_db: db,
  envelope: { attack: 0.0005, decay, sustain: 0, release: 0.005, curve: 1.5 },
});

export const INSTRUMENTS: Record<string, Instrument> = {
  pulso12: pulse(0.125, 'thin'),
  pulso25: pulse(0.25, 'bright'),
  pulso50: pulse(0.5, 'hollow, the plain square'),
  triangular: {
    description: 'chip triangle: 16 steps, no even harmonics, held as written; the bass of a NES (channel 3)',
    base: 440, ring: 0.1, hold: true, gain_db: -3,
    layers: [{ source: { type: 'triangle', freq: 440, steps: 16 }, envelope: { attack: 0.001, release: 0.004 } }],
  },
  ruido: {
    description: 'chip noise: the long register, no pitch, held as written; a note moves its clock (base A4 = 7 kHz), x plays the base (NES channel 4)',
    base: 440, ring: 0.1, hold: true, gain_db: -12,
    layers: [{ source: { type: 'chip_noise', freq: 7000 }, envelope: { attack: 0.001, release: 0.004 } }],
  },
  bombo8: {
    description: 'chip kick: the triangle falling fast from 160 to 50 Hz, with a click of noise',
    base: 440, ring: 0.2, pitched: false,
    layers: [
      { source: { type: 'triangle', freq: [[0, 160], [0.07, 50]], steps: 16 }, envelope: { attack: 0.0005, decay: 0.15, sustain: 0, release: 0.01, curve: 1.2 } },
      chipHit(20000, 0.015, -10),
    ],
  },
  caja8: {
    description: 'chip snare: a burst of the long noise with a short triangle body',
    base: 440, ring: 0.25, pitched: false, gain_db: -4,
    layers: [
      chipHit(14000, 0.16),
      { source: { type: 'triangle', freq: [[0, 240], [0.04, 170]], steps: 16 }, gain_db: -6, envelope: { attack: 0.0005, decay: 0.05, sustain: 0, release: 0.005 } },
    ],
  },
  charles8: {
    description: 'chip hi-hat: a tick of high noise; a note moves it (base A4)',
    base: 440, ring: 0.08, pitched: false, gain_db: -10,
    layers: [chipHit(44000, 0.035)],
  },

  citara: {
    description: 'guzheng: bright plucked string over a wooden box, rings about four seconds',
    base: 440, ring: 4.2, strum: 0.014,
    layers: [
      {
        source: { type: 'string', freq: 440, ring: 4.2, damping: 0.5, pick: 0.12, bright: 0.72 },
        filters: [
          { type: 'peak', freq: 190, q: 1.3, gain_db: 4, track: false },
          { type: 'peak', freq: 720, q: 1.6, gain_db: 2.5, track: false },
          { type: 'peak', freq: 2600, q: 1, gain_db: -3, track: false },
          { type: 'lowpass', freq: 6500, track: false, poles: 1 },
        ],
      },
      pick(-24),
    ],
  },
  qin: {
    description: 'guqin: low, dark plucked string, soft finger, long ring',
    base: 440, ring: 5.5, strum: 0.02,
    layers: [
      {
        source: { type: 'string', freq: 440, ring: 5.5, damping: 0.78, pick: 0.21, bright: 0.35 },
        filters: [
          { type: 'peak', freq: 130, q: 1.2, gain_db: 5, track: false },
          { type: 'peak', freq: 480, q: 1.4, gain_db: 2, track: false },
          { type: 'lowpass', freq: 2800, track: false },
        ],
      },
      pick(-32, 1500),
    ],
  },
  gota: {
    description: 'a high plucked string that dies fast: a drop on the water',
    base: 440, ring: 1.6, strum: 0.03,
    layers: [
      {
        source: { type: 'string', freq: 440, ring: 1.4, damping: 0.42, pick: 0.3, bright: 0.55 },
        filters: [
          { type: 'peak', freq: 900, q: 1.2, gain_db: 3, track: false },
          { type: 'lowpass', freq: 5000, track: false, poles: 1 },
        ],
      },
      pick(-30, 3500),
    ],
  },
  cuenco: {
    description: 'singing bowl: inharmonic partials that beat slowly and die high first',
    base: 440, ring: 9,
    layers: [
      { source: { type: 'bell', freq: 440, beat: 1.4 } },
      {
        source: { type: 'noise', color: 'pink' }, gain_db: -26, length: 0.05,
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.005 },
        filters: [{ type: 'bandpass', freq: 1400, q: 1.2 }],
      },
    ],
  },
  campana: {
    description: 'small temple bell: brighter and shorter than the bowl',
    base: 880, ring: 6,
    layers: [
      { source: { type: 'bell', freq: 880, beat: 0.9, partials: [[1, 1, 5], [2.32, 0.55, 3.6], [4.25, 0.32, 2.2], [6.63, 0.18, 1.3], [9.38, 0.08, 0.8]] } },
      {
        source: { type: 'noise' }, gain_db: -30, length: 0.03,
        envelope: { attack: 0.0005, decay: 0.02, sustain: 0, release: 0.005 },
        filters: [{ type: 'highpass', freq: 3000 }],
      },
    ],
  },
  gong: {
    description: 'low gong: a wash of close partials and a slow swell of noise',
    base: 110, ring: 8,
    layers: [
      { source: { type: 'bell', freq: 110, beat: 2.2, partials: [[1, 1, 7], [1.47, 0.6, 6], [2.09, 0.5, 5], [2.56, 0.38, 4], [3.2, 0.26, 3], [4.11, 0.16, 2]] } },
      {
        source: { type: 'noise', color: 'pink' }, gain_db: -18, length: 4,
        envelope: { attack: 0.08, decay: 3.5, sustain: 0, release: 0.3 },
        filters: [{ type: 'bandpass', freq: 600, q: 0.8 }, { type: 'lowpass', freq: 2000, track: false }],
      },
      {
        source: { type: 'sine', freq: [[0, 140], [0.08, 110]] }, gain_db: -6, length: 1.2,
        envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 0.05 },
      },
    ],
  },
  tambor: {
    description: 'barrel drum (tanggu): a low thump that falls in pitch, skin and wood',
    base: 90, ring: 0.9, pitched: false,
    layers: [
      {
        source: { type: 'sine', freq: [[0, 175], [0.035, 98], [0.4, 88]] },
        envelope: { attack: 0.001, decay: 0.55, sustain: 0, release: 0.05 },
      },
      {
        source: { type: 'noise', color: 'brown' }, gain_db: -6, length: 0.2,
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
        filters: [{ type: 'lowpass', freq: 420 }],
      },
      {
        source: { type: 'noise' }, gain_db: -22, length: 0.04,
        envelope: { attack: 0.0005, decay: 0.025, sustain: 0, release: 0.005 },
        filters: [{ type: 'bandpass', freq: 1800, q: 1.1, track: false }],
      },
    ],
  },
  madera: {
    description: 'wood block: a dry knock with a pitch, tuned by the note (base A5)',
    base: 880, ring: 0.3,
    layers: [
      { source: { type: 'bell', freq: 880, partials: [[1, 1, 0.12], [2.6, 0.35, 0.06], [4.1, 0.15, 0.035]] } },
      {
        source: { type: 'noise' }, gain_db: -20, length: 0.02,
        envelope: { attack: 0.0005, decay: 0.008, sustain: 0, release: 0.003 },
        filters: [{ type: 'bandpass', freq: 2600, q: 1.5 }],
      },
    ],
  },
  bambu: {
    description: 'hollow bamboo knocked: a low, airy tock (base A4)',
    base: 440, ring: 0.5,
    layers: [
      { source: { type: 'bell', freq: 440, partials: [[1, 1, 0.22], [2.92, 0.3, 0.08], [5.2, 0.12, 0.04]] } },
      {
        source: { type: 'noise', color: 'pink' }, gain_db: -14, length: 0.05,
        envelope: { attack: 0.0008, decay: 0.03, sustain: 0, release: 0.01 },
        filters: [{ type: 'bandpass', freq: 900, q: 2 }],
      },
    ],
  },
};
