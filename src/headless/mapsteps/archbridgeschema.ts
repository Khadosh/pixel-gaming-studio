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
  flush: z.array(z.enum(['west', 'east'])).optional().describe('the ends where the deck runs on into the ground it comes to (a terrace): no line of ink across the deck there (default none)'),
  rails: z.object({
    edges: z.array(z.enum(['north', 'south'])).min(1).optional().describe('which edges of the deck get a rail (default both)'),
    height: z.number().int().min(2).optional().describe('px of the rail over its curb (default 5)'),
    posts: z.number().int().min(4).optional().describe('px between two posts (default 13)'),
    piers: z.number().int().min(0).optional().describe('px the pier at each end of a rail stands over it: a square post with a cap and a gold finial; the south ones go down the face to its foot, pilasters framing the arches (default 5; 0 none)'),
    lacquer: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional().describe('the handrail [line, dark, mid, light] (as balustrade)'),
    curb: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional().describe('the curb [dark, mid, light, high] (as balustrade)'),
  }).optional().describe('balustrades along the deck, as the balustrade step draws them, with a pier at each end: the bridge railed from end to end, the rail of a terrace can come to its pier'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west)'),
  salt: z.number().int().optional().describe('default 1581'),
});
export type ArchbridgeStep = z.infer<typeof archbridgeStep>;
