// Schema of the spill step (mapsteps/spill.ts): running water falling down a face (a retaining wall, a step of rock).

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const spillStep = z.object({
  step: z.literal('spill'),
  id: z.string().optional(),
  material: z.string().describe('the water: a ramp [deep, mid, shallow, foam, glint] (the ramp of a water step)'),
  at: pt.describe('[u, v] in cells: the head of the fall, the middle of the edge it pours over'),
  length: z.number().int().min(4).describe('px from the head down to its foot'),
  width: pt.describe('[at the head, at the foot] px of half its width: it spreads a little as it falls'),
  flow: z.string().optional().describe('layer of the light streaks down the fall (the game makes it flow down); default none'),
  foot: pt.optional().describe('[rx, ry] px of the foam where it lands (default [half width at the foot + 4, 4]; [0, 0] none)'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west)'),
  salt: z.number().int().optional().describe('default 1491'),
});
export type SpillStep = z.infer<typeof spillStep>;
