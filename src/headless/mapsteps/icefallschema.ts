// Schema of the icefall step (mapsteps/icefall.ts): a waterfall frozen on its way down a face of rock.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const icefallStep = z.object({
  step: z.literal('icefall'),
  id: z.string().optional(),
  material: z.string().describe('the ice (kind of its px on the ground); a 6-tone ramp [ink, deep, shadow, mid, light, lit] (e.g. celeste oscuro, celeste, niebla sombra, celeste luz, nube, ojo)'),
  at: pt.describe('[u, v] in cells: the head of the fall, the middle of the lip it pours from'),
  length: z.number().int().min(4).describe('px from the head down to its foot'),
  width: pt.describe('[at the head, at the foot] px of half its width: it spreads as it falls'),
  flutes: pt.optional().describe('[narrowest, widest] px of one column of ice; the columns sit side by side, each round (lit on the side of the light, a dark gutter on the other) (default [2, 4])'),
  icicles: z.number().int().min(0).optional().describe('px the longest icicle hangs under the foot of its column; each column its own length, a tip of one px (default 5; 0 none)'),
  foot: pt.optional().describe('[rx, ry] px of the heap of ice and frozen spray at the foot, over the icicles (default none: the curtain just hangs)'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west)'),
  layer: z.string().optional().describe('layer it goes on (default the ground, and then its px take the kind of the material)'),
  salt: z.number().int().optional().describe('default 1471 (+1 the columns, +2 the bulges, +3 the threads of light, +4 the icicles, +5 the foot)'),
});
export type IcefallStep = z.infer<typeof icefallStep>;
