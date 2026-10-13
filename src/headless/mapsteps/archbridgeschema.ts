// Schema of the archbridge step (mapsteps/archbridge.ts): a stone bridge that crosses a stream from west to east,
// seen from above and the south: its deck and, under it, its south face with the arches the water runs through.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const archbridgeStep = z.object({
  step: z.literal('archbridge'),
  id: z.string().optional(),
  material: z.string().describe('the stone: a ramp [ink, shadow, mid, light, … lit] (6 tones or more)'),
  x: pt.describe('[west, east] cells: the ends of the deck'),
  y: pt.describe('[north, south] cells: the deck seen from above; the south face hangs under its south edge'),
  face: z.number().int().min(4).optional().describe('px of the south face under the deck (default 14)'),
  arches: z.array(z.object({ u: z.number().describe('cells: the middle of the arch'), half: z.number().min(2).describe('px: half its width at the foot') })).min(1).optional()
    .describe('each arch, opened in the face from its foot up (default one, at the middle, a third of the deck wide)'),
  rise: z.number().int().min(2).optional().describe('px the crown of an arch stands over the foot of the face (default the face less 4)'),
  curbs: z.number().int().min(0).optional().describe('px of the low parapet along each edge of the deck (default 3; 0 none)'),
  flags: pt.optional().describe('[w, h] px of a flagstone of the deck (default [10, 6])'),
  vault: z.number().int().min(1).optional().describe('px of shade inside an arch under its curve: the dark of the vault (default 4)'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west)'),
  salt: z.number().int().optional().describe('default 1581'),
});
export type ArchbridgeStep = z.infer<typeof archbridgeStep>;
