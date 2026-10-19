// A sound recipe: layers that are mixed, each with a source (or sub-layers),
// filters, an ADSR envelope, LFOs, a simple echo and optional scattered events
// (a bird now and then, a cup, a knock of bamboo). Pure data, like a text
// drawing: the WAV is always rebuilt from it, and the same recipe + seed gives
// the same bytes.

import { z } from 'zod';

/** A value, or [seconds, value] points (linear in between, held at the ends), relative to the voice start. */
const curve = z.union([z.number(), z.array(z.tuple([z.number(), z.number()])).min(1)]);
export type Curve = z.infer<typeof curve>;

const envelope = z.object({
  attack: z.number().nonnegative().optional().describe('seconds (default 0.005)'),
  decay: z.number().nonnegative().optional().describe('seconds (default 0)'),
  sustain: z.number().min(0).max(1).optional().describe('level after the decay (default 1)'),
  hold: z.number().nonnegative().optional().describe('seconds at the sustain level (default: whatever fills the voice)'),
  release: z.number().nonnegative().optional().describe('seconds (default 0.01)'),
  curve: z.number().positive().optional().describe('exponent of decay and release (1 linear, default 2: falls fast, then tails)'),
});

const filter = z.object({
  type: z.enum(['lowpass', 'highpass', 'bandpass', 'peak']),
  freq: curve.describe('cutoff / center in Hz, or [t, Hz] points'),
  q: z.number().positive().optional().describe('biquad resonance (default 0.707; bandpass and peak: higher = narrower)'),
  poles: z.union([z.literal(1), z.literal(2)]).optional().describe('1 = gentle one-pole (lowpass/highpass), 2 = biquad (default)'),
  gain_db: z.number().optional().describe('peak: boost (or cut) at freq in dB (default 6): the resonance of a body or a box'),
  track: z.boolean().optional().describe('follow the pitch of the voice (default true); false = a fixed resonance, like the wooden box of an instrument'),
});

const lfo = z.object({
  target: z.enum(['gain', 'freq', 'cutoff']),
  rate: z.number().positive().describe('Hz'),
  depth: z.number().describe('gain: 0..1 of the level it can take away; freq: semitones; cutoff: octaves'),
  shape: z.enum(['sine', 'triangle', 'square', 'random']).optional().describe('random = smooth seeded wander (wind, gusts)'),
  phase: z.number().optional().describe('0..1'),
});

const echo = z.object({
  delay: z.number().positive().describe('seconds'),
  feedback: z.number().min(0).max(0.95).optional().describe('default 0.3'),
  mix: z.number().min(0).max(1).optional().describe('default 0.3'),
});

const events = z.object({
  every: z.union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])])
    .optional().describe('seconds between events, or [min, max] (seeded)'),
  start: z.number().nonnegative().optional().describe('first event at this time (default: a random point in the first gap)'),
  times: z.array(z.number().nonnegative()).optional().describe('explicit times instead of every'),
  pitch: z.tuple([z.number().positive(), z.number().positive()]).optional().describe('random pitch ratio per event'),
  gain_db: z.tuple([z.number(), z.number()]).optional().describe('random gain per event'),
});

const source = z.object({
  type: z.enum(['sine', 'triangle', 'square', 'saw', 'noise', 'pluck', 'crackle', 'string', 'bell']),
  freq: curve.optional().describe('Hz (oscillators, pluck, string, bell; default 440); in the file also a note, "G5" or [t, "G5"] points, turned into Hz with the tuning'),
  duty: z.number().min(0.01).max(0.99).optional().describe('square: fraction high (default 0.5)'),
  color: z.enum(['white', 'pink', 'brown']).optional().describe('noise and crackle (default white)'),
  decay: z.number().min(0.5).max(1).optional().describe('pluck: string loss per pass (default 0.996)'),
  damping: z.number().min(0).max(1).optional().describe('pluck and string: 0 bright … 1 dull (default 0.5 pluck, 0.6 string): how fast the high harmonics die'),
  density: z.number().positive().optional().describe('crackle: bursts per second (default 20)'),
  burst: z.number().positive().optional().describe('crackle: burst length in seconds (default 0.004)'),
  ring: z.number().positive().optional().describe('string: seconds until the note falls 60 dB, the same at every pitch (default 3)'),
  pick: z.number().min(0).max(0.5).optional().describe('string: where the string is plucked, 0..0.5 of its length (default 0.13; near 0 bright and thin, 0.5 hollow)'),
  bright: z.number().min(0).max(1).optional().describe('string: how hard the pick is, 0 soft … 1 hard (default 0.6)'),
  partials: z.array(z.tuple([z.number().positive(), z.number().nonnegative(), z.number().positive()])).min(1).optional()
    .describe('bell: [ratio, amplitude, seconds to -60 dB] per mode (default a singing bowl: inharmonic partials, the high ones die first)'),
  beat: z.number().nonnegative().optional().describe('bell: each mode is two close modes this many Hz apart, the slow wobble of a bowl (default 0)'),
});

export interface LayerSpec {
  source?: z.infer<typeof source>;
  layers?: LayerSpec[];
  gain_db?: number;
  start?: number;
  length?: number;
  envelope?: z.infer<typeof envelope>;
  filters?: z.infer<typeof filter>[];
  lfo?: z.infer<typeof lfo>[];
  echo?: z.infer<typeof echo>;
  events?: z.infer<typeof events>;
  seed?: number;
}

export const layerSchema: z.ZodType<LayerSpec> = z.lazy(() => z.object({
  source: source.optional(),
  layers: z.array(layerSchema).optional().describe('sub-layers mixed as one voice (a bell with its partials, a bird call)'),
  gain_db: z.number().optional(),
  start: z.number().nonnegative().optional().describe('seconds (no events)'),
  length: z.number().positive().optional().describe('seconds of each voice (default: the envelope, or the rest of the sound)'),
  envelope: envelope.optional(),
  filters: z.array(filter).optional(),
  lfo: z.array(lfo).optional(),
  echo: echo.optional(),
  events: events.optional().describe('repeat this layer as separate voices over the sound'),
  seed: z.number().int().optional().describe('own seed (default: derived from the recipe seed and the layer position)'),
}).refine(l => (l.source ? 1 : 0) + (l.layers ? 1 : 0) === 1, { message: 'a layer has a source or layers, not both' }));

export const recipeSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  rate: z.union([z.literal(22050), z.literal(44100)]).optional().describe('sample rate (default: sound.rate of the nearest pgs.json, else 22050)'),
  tuning: z.number().positive().optional().describe('Hz of A4 for the notes (default: sound.tuning of the nearest pgs.json, else 440)'),
  scale: z.string().optional().describe('the scale the notes are checked against: "mayor_pentatonica", "la menor" (default: sound.scale of the nearest pgs.json)'),
  duration: z.number().positive().max(120).describe('seconds'),
  seed: z.number().int().optional().describe('default 1'),
  loop: z.boolean().optional().describe('the end splices into the start (crossfade) and the WAV carries a loop point'),
  crossfade: z.number().positive().optional().describe('loop crossfade in seconds (default min(1, duration/4))'),
  gain_db: z.number().optional().describe('master gain (ignored with normalize)'),
  normalize: z.number().max(0).optional().describe('scale so the peak lands at this dBFS'),
  layers: z.array(layerSchema).min(1),
});

export type Recipe = z.infer<typeof recipeSchema>;
