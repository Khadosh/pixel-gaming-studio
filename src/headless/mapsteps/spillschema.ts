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
  ledges: z.array(z.object({
    at: z.number().min(0.05).max(0.95).describe('where down the fall, a share of its length'),
    widen: z.number().optional().describe('px each side the water spreads under it (default 3)'),
    shift: z.number().optional().describe('px the water moves east (+) or west (-) under it (default 0)'),
  })).optional().describe('ledges the water rebounds on half way down (a fall in two or three leaps): a lip of rock across it (`rock`), a band of foam on it, and under it the water wider and moved; default none'),
  rock: z.string().optional().describe('the ledges: a stone ramp [ink, deep, shadow, mid, …] (default the deep tone of the water)'),
  ragged: z.number().int().min(0).optional().describe('px the head of each column of water starts lower than the highest one: a broken lip instead of a straight one; the lips of the ledges break too, up to half as much (default 0)'),
  salt: z.number().int().optional().describe('default 1491'),
});
export type SpillStep = z.infer<typeof spillStep>;
