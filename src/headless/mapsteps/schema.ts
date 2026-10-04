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

export type CliffStep = z.infer<typeof cliffStep>;
export type FlightStep = z.infer<typeof flightStep>;
export type FeatureStep = z.infer<typeof featureStep>;
