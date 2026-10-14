// Schema of the cataract step (mapsteps/cataract.ts): a waterfall in a gorge of rock, seen from above in 3/4, top to
// bottom in one description: the lip where the water breaks, the sheet falling between faces of columnar rock with
// thickness, the basin at the foot with its ring of foam and the mist rising, and the next lip on the far rim of the
// basin (the rest between two drops), down to the last foot.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const cataractDrop = z.object({
  length: z.number().int().min(8).describe('px from this lip down to where the sheet lands'),
  width: pt.describe('[at the lip, at the foot] px of half the width of the sheet: it narrows or opens as it falls'),
  shift: z.number().optional().describe('px the foot lies east (+) or west (-) of the lip: the sheet leans (default 0)'),
  face: z.number().int().min(3).optional().describe('px of the rock face beside the sheet on each side, give or take: the cut of the gorge with its columns and cornices (default 14)'),
  lip: z.number().int().min(0).optional().describe('px the lip bows toward the viewer in its middle: a curve, not a ruler (default 3)'),
  still: z.boolean().optional().describe('the water runs on instead of falling (a stream down a cut to a bridge): long streaks, no glint at the lip, no strands, no foam nor mist at the foot (default false)'),
  outlet: pt.optional().describe('[dx, half] px: on the last basin, the gap in its far rim where the water goes on as a stream (dx from the foot)'),
  fade: z.number().int().min(0).optional().describe('px the last sheet goes on falling past its foot when there is no floor under it (a fall into the void, the sea of clouds): it opens and breaks in threads that thin out into the mist, no heap of foam (default 0; ignored with a pool)'),
  pool: pt.optional().describe('[rx, ry] px of the basin the sheet falls into, wider than the sheet: calm water inside a rim of rock, the foam ring where it lands; the next drop leaves from its far (south) rim. Without it the water lands on a heap of foam'),
});

export const cataractStep = z.object({
  step: z.literal('cataract'),
  id: z.string().optional(),
  material: z.string().describe('the water: a ramp [deep, mid, shallow, foam, glint]'),
  rock: z.string().describe('the rock: a ramp of 6 tones or more [ink, deep, shadow, mid, light, lit]'),
  at: pt.describe('[u, v] cells: the middle of the first lip'),
  drops: z.array(cataractDrop).min(1).describe('the drops, top to bottom; each starts on the far rim of the pool of the one above (or at its foot)'),
  snow: z.tuple([z.string(), z.string()]).optional().describe('[lit, shade] of the snow on the cornices and the rims (default none)'),
  mist: z.number().min(0).max(1).optional().describe('how thick the mist rising from each foot is (default 0.5; 0 none)'),
  columns: z.number().int().min(2).optional().describe('px of a column of the rock face, give or take (default 5)'),
  strata: z.number().int().min(4).optional().describe('px between two cornices of the rock face (default 11)'),
  shade: z.number().int().min(0).optional().describe('px of shadow at the head of the first faces, thrown by the bridge or the terrace the water leaves (default 0)'),
  flow: z.string().optional().describe('layer of the light streaks down the sheets (the game makes it flow down); default none'),
  foam: z.string().optional().describe('layer of the churn of the foam where each sheet lands, the spray past its edges and the mist (the game makes it twinkle): the ground keeps a calmer foam under it; default none, all on the ground'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west: the west face looks east, in shade)'),
  salt: z.number().int().optional().describe('default 1621'),
});
export type CataractStep = z.infer<typeof cataractStep>;
