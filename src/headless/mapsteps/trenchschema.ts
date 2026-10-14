// Schema of the trench step (mapsteps/trench.ts): a channel cut down into the ground along a curve, seen from above and
// a little from the south: the water (or a glowing seam) at the bottom, the far bank's face that looks south, the side
// walls from above, the lips, and bridges that span it on an arch.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const trenchStep = z.object({
  step: z.literal('trench'),
  id: z.string().optional(),
  material: z.string().describe('what runs at the bottom: a water ramp [deep, mid, shallow, foam, glint]'),
  rock: z.string().describe('the walls: a stone ramp of 6 tones or more [ink, deep, shadow, mid, light, lit]'),
  curve: z.array(z.tuple([z.number(), z.number(), z.number()])).min(2).describe('[u, v, half width px] in cells, the middle of the cut from one end to the other'),
  depth: z.number().int().min(2).describe('px of the face of the far (north) bank seen across the cut: how sunk it reads'),
  side: z.number().int().min(0).optional().describe('px of each side wall seen from above along a cut that runs north-south (default 3)'),
  glow: z.boolean().optional().describe('the bottom gives light (a seam of living water in ice): bright in the middle, and the faces lit from below instead of darker toward the bottom (default false)'),
  snow: z.tuple([z.string(), z.string()]).optional().describe('[lit, shade] of the snow on the lips (default none: the lit rock)'),
  bridges: z.array(z.object({
    v: z.number().describe('cells: the row of the middle of the deck'),
    thick: z.number().int().min(2).optional().describe('px of the deck north to south (default 8)'),
    reach: z.number().int().min(0).optional().describe('px the deck rests on each bank past the lip (default 4)'),
    material: z.string().optional().describe('the deck: a ramp, dark to light (default the rock)'),
  })).optional().describe('bridges across the cut: a deck of slabs and, under its south edge, its face with the arch the water runs through'),
  flow: z.string().optional().describe('layer of the light streaks along the water (the game makes it flow down); default none'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west: the west wall faces east, in shade)'),
  salt: z.number().int().optional().describe('default 1747'),
});
export type TrenchStep = z.infer<typeof trenchStep>;
