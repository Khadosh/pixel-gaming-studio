// Schema of the bluff step (mapsteps/bluff.ts): a rock with a flat top seen from above in 3/4 — the peña a pavilion
// stands on (the Campana Alta of The Unwritten Dao, #355: «la sensación de riscos en cada casa de los laterales»). The
// top is a polygon; under its south rim hangs the face, broken rock in blocks taller than wide, lit at the top and dark
// at the foot, a cornice of snow with icicles along the rim, narrowing as it goes down, the foot lost in the mist.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const bluffStep = z.object({
  step: z.literal('bluff'),
  id: z.string().optional(),
  material: z.string().describe('the rock: a ramp of 6 tones or more [ink, deep, shadow, mid, light, lit]'),
  top: z.array(pt).min(3).describe('[[u, v], …] cells: the flat top seen from above (a polygon); the face hangs under its south rim'),
  face: z.union([z.number().int().min(4), z.array(z.object({ u: z.number(), px: z.number().int().min(0) })).min(1)])
    .describe('px of the face under the rim: one number, or [{u, px}, …] from west to east (in between, interpolated)'),
  fill: z.string().optional().describe('material painted on the top (the snow of the terrace, under its paving); default the top is left as it is'),
  dome: z.boolean().optional().describe('the top is rounded, not flat: the fill lit toward the light, a tone down on the far side and darker at its rim there (default false: a terrace)'),
  snow: z.tuple([z.string(), z.string()]).optional().describe('[lit, shade] of the cornice along the rim and of the snow on some blocks (default none)'),
  cornice: z.number().int().min(0).optional().describe('px of the cornice of snow at the rim, give or take (default 3)'),
  icicles: z.tuple([z.string(), z.string()]).optional().describe('[light, shade] of the icicles that hang from the cornice (default none)'),
  taper: z.number().min(0).optional().describe('px each side of the face pulls in for every 10 px down: a pillar, not a wall (default 2)'),
  foot: z.object({
    mist: z.string().describe('the material of the mist the foot is lost in (its lighter tones)'),
    fade: z.number().int().min(1).describe('px over which the foot fades into it'),
  }).optional().describe('the foot of the face dissolves in mist; without it the face ends on what is under it, a row of shadow'),
  tiers: z.number().int().min(1).optional().describe('the face in tiers, each set back under a ledge with snow in stretches and lit again at its top: a stratified rock (default 1)'),
  cuts: z.array(pt).optional().describe('[[u0, u1], …] cells: clefts cut down the face (where a stair goes down it): no face nor cornice there, and beside each its walls, the one that looks west lit and the other in shade'),
  columns: z.number().int().min(2).optional().describe('px of a column of the face, give or take (default 6)'),
  strata: z.number().int().min(4).optional().describe('px of a course of the face (default 14)'),
  light: z.enum(['west', 'east']).optional().describe('the side the light comes from (default west)'),
  salt: z.number().int().optional().describe('default 1641'),
});
export type BluffStep = z.infer<typeof bluffStep>;
