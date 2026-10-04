// Schemas of the map steps that live in their own files (mapsteps/*.ts): the
// edge of a plateau over a sea of clouds (cliff), flights of stone steps
// (flight) and single carved things (feature: a meditation dais, an old slab,
// roots). Kept apart from maprecipe.ts so the painters can import mappaint.ts.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const cliffStep = z.object({
  step: z.literal('cliff'),
  id: z.string().optional(),
  material: z.string().describe('what lies below the edge, far away: a ramp [deep, mist, cloud shadow, cloud, cloud light] (e.g. celeste oscuro … túnica luz)'),
  face: z.string().describe('the rock face material: an 8-tone stone ramp (ink, line, dark, shadow, mid, speck, light, highlight)'),
  side: z.literal('l').optional().describe('the side of the map that ends in the cliff (only "l": the face looks west, lit by the morning)'),
  inset: z.number().optional().describe('px from the map edge to the lip of the cliff (default -5: just outside)'),
  wobble: pt.optional().describe('px the lip wanders, [big waves, small waves] (default [3.4, 1.6])'),
  width: z.tuple([z.number(), z.number(), z.number()]).optional().describe('px of the rock face: [base, + fbm, + wave] (default [7, 4, 2.5])'),
  banks: z.number().optional().describe('px between two banks of clouds (default 34)'),
  peaks: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('far peaks rising from the clouds: [u, v of the top in cells, half width px, height px]'),
  stones: z.array(z.number()).optional().describe('rows (v, cells) of a loose stone on the lip'),
  lip: z.string().optional().describe('color of the earth on the lip (default "madera sombra")'),
  grass_colors: z.tuple([z.string(), z.string()]).optional().describe('the grass that hangs over the lip [first px, the rest] (default ["bambú", "hoja"])'),
  pines: z.tuple([z.string(), z.string()]).optional().describe('the pines on top of the far peaks [lit, shadow] (default ["hoja", "hoja sombra"])'),
  seed: z.number().int().optional().describe('salt of its noise (default 200)'),
});

export const flightStep = z.object({
  step: z.literal('flight'),
  id: z.string().optional(),
  material: z.string().describe('the stone: an 8-tone ramp; its moss[1] is the grass on the treads'),
  style: z.enum(['down', 'climb']).describe('down: treads stacked from the top of the picture down to `to`, between two low walls; climb: treads side by side along x, rising to the right by `slope`, between two walls, into a forest'),
  x: pt.optional().describe('down: [u0, u1] in cells, the walls inside'),
  to: z.number().optional().describe('down: the last row (v, cells)'),
  from: pt.optional().describe('climb: [u, v] in cells, the first tread at the middle of its height'),
  length: z.number().optional().describe('climb: px of treads (default 56)'),
  slope: z.number().optional().describe('climb: px it rises per px (default 0.22)'),
  half: z.number().optional().describe('climb: half height of a tread, px (default 5.5)'),
  clearing: pt.optional().describe('climb: [half px, breathing px] of the opening cut in the forest around it (default [10, 1.5])'),
  through: z.string().optional().describe('climb: the forest material it is cut into (default the canopy material); the cut becomes grass'),
  fade: pt.optional().describe('climb: [px, every px]: after this many px each `every` px is one step darker (in the forest shade) (default [24, 12])'),
  every: z.number().int().optional().describe('px of a tread (default 8 down, 7 climb)'),
  seed: z.number().int().optional(),
});

export const featureStep = z.object({
  step: z.literal('feature'),
  id: z.string().optional(),
  what: z.enum(['dais', 'slab', 'roots']).describe('dais: a round stone platform with a south face, a lit lip, a carved ring, the eight trigrams and a carved center, and its cast shadow; slab: an old rectangular stone with cut corners, a crack and moss on the lit corner; roots: roots that leave the foot of a trunk and sink into the earth'),
  material: z.string().describe('dais, slab: an 8-tone stone ramp (moss from its moss); roots: the earth material they turn grass into'),
  at: pt.describe('[u, v] in cells: the center (dais, slab) or the foot of the trunk (roots)'),
  size: pt.optional().describe('dais: radii px (default [22, 17]); slab: half sizes px (default [7, 5.5])'),
  face: z.number().int().optional().describe('dais: px of its south face (default 3)'),
  corner: pt.optional().describe('slab: the corner is cut where both |dx| > corner[0] and |dy| > corner[1] px (default [6, 4.5])'),
  shadow: z.record(z.string(), z.string()).optional().describe('dais: material it casts its shadow on → the material that pixel becomes (it stays shaded for what comes after)'),
  roots: z.array(pt).optional().describe('roots: [angle in degrees (0 east, 90 south), length px]'),
  wood: z.tuple([z.string(), z.string()]).optional().describe('roots: [lit, shadow] (default ["madera", "madera sombra"])'),
  avoid: z.string().optional().describe('roots: id of a slab they pass under'),
  seed: z.number().int().optional().describe('salt (default: dais 471, slab 481, roots 500)'),
});

const blob7 = z.array(z.number()).min(4).max(7)
  .describe('[u, v, rx, ry, wobble?, salt?, fine?] center and radii in cells (wobble default 0.14, fine 0.05)');

export const networkStep = z.object({
  step: z.literal('network'),
  id: z.string().optional(),
  material: z.string().describe('the earth: a 5-tone ramp [line, shadow, base, light, dust] (base index from the material)'),
  parts: z.array(z.union([
    z.object({
      road: z.array(pt).min(2).describe('[u, v] in cells: a road through these points'),
      width: pt.describe('[half width px, how much it breathes px]'),
      salt: z.number().int().describe('salt of its breath (the small breath uses salt + 1)'),
      ruts: z.boolean().optional().describe('its center line is trodden (default true)'),
    }),
    z.object({ blob: blob7.describe('an organic blob of earth (a square, a yard)') }),
    z.object({ cut: blob7.describe('an organic blob taken out again (an island of grass people walk around)') }),
  ])).min(1).describe('in order, into one mask: roads, blobs added and blobs cut; then the border is cleaned once'),
  also: z.array(blob7).optional().describe('blobs added after the clean, each cleaned on its own (a court paved later over the earth: the earth counts it, its tufts stay out)'),
  breath: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('[samples of one breath, of the small one, px of the small one]: half width = width[0] + width[1]·n1(i/b0) + b2·n1(i/b1) (default [30, 9, 0.6])'),
  min: z.number().optional().describe('narrowest half width, px (default 4.2)'),
  span: z.number().optional().describe('px around each road center where the distance to it is measured (default 9)'),
  trod: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px, wobble px, noise px, salt]: closer than px (± wobble) to a road center the earth is trodden (default [5.8, 2.2, 7, 226])'),
  mottle: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[salt, px across, px down] of the tone noise (default [221, 5.5, 4.5])'),
  trod_levels: pt.optional().describe('trodden: below [0] the base tone, above [1] two up, between one up (default [0.42, 0.70])'),
  loose_levels: pt.optional().describe('not trodden (dry dust): above [1] two up, above [0] one up, else the base (default [0.30, 0.46])'),
  ruts: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[from px, to px, salt, noise px across, px down, above]: broken ruts this far from a road center, one tone down (default [3.0, 4.2, 225, 6, 2, 0.42])'),
  grains: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('[salt, odds trodden, odds loose]: a dark grain (trodden) or a base one (loose), else a light one with the trodden odds (default [223, 0.035, 0.016])'),
  lip: z.boolean().optional().describe('the grass that faces the light across the earth gets a lit lip (default true)'),
  tufts: z.object({
    count: z.number().int().nonnegative(), salt: z.number().int(),
    colors: z.tuple([z.string(), z.string()]).optional(),
  }).optional().describe('tries of grass tufts creeping into the earth 2-3 px from its border: {count, salt, colors: [tip, stem]} (default none)'),
  seed: z.number().int().optional(),
});

export const ropeStep = z.object({
  step: z.literal('rope'),
  id: z.string().optional(),
  layer: z.string().optional().describe('layer it goes on (default "front": it passes in front of people)'),
  from: pt.describe('[u, v] in cells: where it is tied'),
  to: pt.describe('[u, v] in cells: the other end, to the right'),
  sag: z.number().optional().describe('px it sags in the middle (default 5)'),
  color: z.string().optional().describe('default "madera sombra"'),
  hang: z.array(z.object({
    at: z.number().describe('0..1 along the rope'),
    rows: z.array(z.string()).describe('rows of glyphs, "." transparent'),
    glyphs: z.record(z.string(), z.string()).describe('glyph → color name'),
    offset: pt.optional().describe('px from the rope point to the top-left of the rows (default [0, 0])'),
  })).optional().describe('things hanging from it (lanterns, flags), drawn after the rope'),
});

export const pavingOpts = z.object({
  at: pt.describe('[u, v] in cells: the middle of the court'),
  count: z.number().int().optional().describe('stones (default 18)'),
  spread: pt.optional().describe('[px, px] the seeds fall this far from the middle (default [34, 13])'),
  apart: pt.optional().describe('[px, squash of the rows] two seeds are at least this far (default [9, 1.5])'),
  squash: z.number().optional().describe('rows squashed this much when finding the owner stone (default 1.4)'),
  joint: z.number().optional().describe('where the two nearest seeds are closer than this (squared px) it is a joint (default 14)'),
  tries: z.number().int().optional().describe('default 400'),
  salt: z.number().int().optional().describe('seeds; joints salt + 2, tones + 4, specks + 6 (default 231)'),
  joints: z.tuple([z.string(), z.string()]).optional().describe('[moss, earth] in the joints; earth also on the border of a joint (default [moss[1], shadow])'),
}).describe('paving: loose Voronoi stones around a center (texture "paving")');

export type PavingOpts = z.infer<typeof pavingOpts>;
export type NetworkStep = z.infer<typeof networkStep>;
export type RopeStep = z.infer<typeof ropeStep>;
export type CliffStep = z.infer<typeof cliffStep>;
export type FlightStep = z.infer<typeof flightStep>;
export type FeatureStep = z.infer<typeof featureStep>;
