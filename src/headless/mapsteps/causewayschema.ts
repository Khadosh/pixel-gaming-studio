// Schema of the causeway step (mapsteps/causeway.ts): the stone piers and arches of a bridge that crosses water from
// south to north, seen from above.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const causewayStep = z.object({
  step: z.literal('causeway'),
  id: z.string().optional(),
  material: z.string().describe('the stone of the piers: a ramp [ink, shadow, mid, light, … lit]'),
  x: pt.describe('[west, east] cells: the sides of the deck the piers stick out of'),
  y: pt.describe('[north, south] cells: the stretch of the deck over the water'),
  on: z.array(z.string()).min(1).describe('the kinds it paints over (the water); the deck and banks stay'),
  every: z.number().min(6).optional().describe('px from one pier to the next (default 22)'),
  pier: pt.optional().describe('[out, long] px of a pier (default [5, 8])'),
  rise: z.number().int().min(0).optional().describe('px of the south face of a pier under its top (default 3)'),
  arch: pt.optional().describe('[west, east] px the dark under an arch reaches out (default [3, 6])'),
  shade: z.array(z.string()).min(1).max(2).optional().describe('[deep, edge] colors under an arch (default its shadow and mid tones)'),
  salt: z.number().int().optional().describe('default 1571: how the length of each pier wavers'),
});
export type CausewayStep = z.infer<typeof causewayStep>;
