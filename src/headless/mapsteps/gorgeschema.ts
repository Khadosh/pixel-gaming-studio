// Schema of the gorge step (mapsteps/gorge.ts): running water falling down a cleft cut into a terrace, seen from above
// and the south: two walls of rock in shade and in light, the water between them pale at the lip and foam at the foot.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const gorgeStep = z.object({
  step: z.literal('gorge'),
  id: z.string().optional(),
  material: z.string().describe('the water: a ramp [deep, mid, shallow, foam, glint] (the ramp of a spill)'),
  rock: z.string().describe('the walls: a stone ramp of 6 tones or more [ink, deep, shadow, mid, light, lit]'),
  at: pt.describe('[u, v] in cells: the lip, the middle of the edge where the stream drops into the cleft (its north end)'),
  length: z.number().int().min(6).describe('px from the lip down to the foot, as the picture shows the cleft'),
  width: pt.describe('[at the lip, at the foot] px of half the width of the falling water: it spreads as it falls'),
  walls: z.number().int().min(2).optional().describe('px of each wall seen from above, give or take (default 7)'),
  snow: z.tuple([z.string(), z.string()]).optional().describe('[lit, shade] of the snow along the rim of both walls (default none)'),
  foot: pt.optional().describe('[rx, ry] px of the foam and spray at the foot (default [half width at the foot + 5, 5]; [0, 0] none)'),
  flow: z.string().optional().describe('layer of the light streaks down the water (the game makes it flow down); default none'),
  void: z.number().int().min(0).optional().describe('px of the dark inside of the cut between the water and each wall: the water stands in front of a hollow, two tones under the plane above and darker the deeper (default 0)'),
  lip: z.number().int().min(0).optional().describe('px of the lit edge of the terrace across the head of the cut, with the shadow it throws into it right under (default 0)'),
  relief: z.number().min(0).max(1).optional().describe('the share of the walls broken in ledges that jut toward the water (their top lit) and dark recesses, a course at a time (default 0: smooth walls)'),
  still: z.boolean().optional().describe('the water runs instead of falling (the neck that leads a stream to a bridge): no foam growing down it (default false)'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west: the west wall faces east, in shade)'),
  salt: z.number().int().optional().describe('default 1601'),
});
export type GorgeStep = z.infer<typeof gorgeStep>;
