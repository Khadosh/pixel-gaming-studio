// Schemas of the steps of a glen at the foot of a waterfall (mapsteps/glen.ts):
// the layout (a plunge pool, the stream that leaves it, a river below a line,
// trodden earth, a ledge of slabs, a gravel beach), wet moss cushions by the
// water, the wet earth trail, the gravel beach, the ledge of wet slabs, the
// water with its high banks and its foam, wet stones with their wake, the wet
// wood on the sides, the cast shadows, the small things by the shared random
// stream, what moves on the water, and the boughs that reach in front.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const color = z.string();
const blob = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])
  .describe('[u, v, rx px, ry px, salt, wobble]: an organic blob (fine roughness 0.05)');
const wave = z.tuple([z.number(), z.number(), z.number()]).describe('[amount px, period px, salt]: amount·n1(t / period, salt)');

export const glenStep = z.object({
  step: z.literal('glen'),
  pool: z.array(blob).min(1).describe('the plunge pool: these blobs together, cleaned once (mask "pool")'),
  stream: z.object({
    points: z.array(pt).min(2).describe('[u, v] cells, from the pool down'),
    width: pt.describe('[half width px, swing px]: half = w0 + w1·n1(i / period, salt)'),
    period: z.number().describe('samples per swing'),
    salt: z.number().int(),
  }).describe('the stream that leaves the pool (mask "stream", not cleaned on its own)'),
  river: z.string().describe('the line of a lines step: the river is everything at or below it (mask "river")'),
  earth: z.object({
    roads: z.array(z.object({
      points: z.array(pt).min(2).describe('[u, v] cells'),
      width: pt.describe('[half width px, swing px]: half = max(min, w0 + w1·n1(i/period, salt) + fine·n1(i/fine period, salt + 1))'),
      salt: z.number().int(),
    })).describe('trodden roads; their centers (every other sample) give the ruts'),
    clearings: z.array(blob).optional().describe('organic clearings of earth'),
    min: z.number().optional().describe('the narrowest half width px (default 3.6)'),
    period: z.number().optional().describe('samples per big swing (default 30)'),
    fine: pt.optional().describe('[amount px, samples per swing] of the fine swing (default [0.6, 9])'),
  }).describe('the trodden earth (mask "earth", cleaned; never on the water nor the beach)'),
  ledge: z.array(blob).describe('a ledge of slabs (mask "ledge", cleaned; never on the water)'),
  beach: z.string().describe('the line of a lines step: the gravel beach is at or below it and off the water (mask "sand", cleaned)'),
}).describe('the layout of a glen, masks only (the steps that follow paint them): water = pool + stream + river (cleaned), earth, ledge, sand; distances "water" (inside it), "earth" and "land" (from the land to the water)');

export const cushionsStep = z.object({
  step: z.literal('cushions'),
  reach: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px, more px, period px, salt]: closer to the water than px + more·fbm(x/period, y/period, salt, 2) (default [9, 4, 6, 337])'),
  noise: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px across, px down, salt, above]: and where this noise is above (default [5, 4, 338, 0.42])'),
  map: z.record(z.string(), color).optional().describe('color under → cushion color (default {"bambú": "hoja"})'),
  else: color.optional().describe('the cushion color over anything else (default "vida sombra")'),
}).describe('wet moss cushions by the water (needs a glen step): a cleaned mask near the water painted a deep green over what is there');

export const mudtrailStep = z.object({
  step: z.literal('mudtrail'),
  material: z.string().describe('the earth (ramp [dark, shadow, base, light], base 2)'),
  salts: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[tones, ruts, grains, wet, creeping tufts] (default [341, 342, 343, 344, 345])'),
  levels: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('tones by the 5 px noise: below a → shadow, below b → base, above c → light (default [0.30, 0.42, 0.62])'),
  wet: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('[px, more px, period px]: closer to the water than this the earth is one tone wetter (default [14, 6, 6])'),
  grains: z.number().optional().describe('odds of a dark grain, and of a light one beside it (default 0.035)'),
  lip: z.object({ grass: z.string(), color: color, not: z.array(z.string()).optional().describe('masks where no lip goes') })
    .optional().describe('the lit lip of the grass below and right of the earth'),
  tufts: z.object({ count: z.number().int(), colors: z.tuple([color, color]).describe('[tip, stem]') }).optional()
    .describe('tufts creeping in at 2–3 px from the border (default 380, ["bambú", "hoja"])'),
}).describe('the wet trail of a glen on the "earth" mask: the edge in shadow, mottled in three tones at 5 px, wetter near the water, grains, ruts beside the middle, the lit lip of the grass and tufts creeping in');

export const shingleStep = z.object({
  step: z.literal('shingle'),
  material: z.string().describe('the gravel (ramp [dark, shadow, base, light, sand], base 2)'),
  salts: pt.optional().describe('[tones, the face] (default [351, 352])'),
  lip: z.tuple([z.string(), color]).optional().describe('[grass, color]: the grass right over the beach (default none)'),
}).describe('the gravel beach of a glen on the "sand" mask: a face of earth under the grass above, wet by the water, dry sand and light in between');

export const ledgeslabsStep = z.object({
  step: z.literal('ledgeslabs'),
  material: z.string(),
  at: pt.describe('[u, v] cells: the middle of the seeds box'),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[dx, w, dy, h] px of the seeds box from `at` (default [-18, 36, -34, 62])'),
  count: z.number().int().optional().describe('slabs (default 16)'),
  tries: z.number().int().optional().describe('default 600'),
  gap: z.number().optional().describe('px between seeds (default 8)'),
  stretch: z.number().optional().describe('y stretch of the distance (default 1.3)'),
  joint: z.number().optional().describe('squared px between the two nearest seeds under which it is a joint (default 12)'),
  salts: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[seeds, joint moss, slab tone, moss] (default [361, 363, 365, 366])'),
  tones: z.object({
    joint: z.tuple([color, color]).optional().describe('moss in the joints [above, else] (default vida sombra, hoja sombra)'),
    lip: color.optional(), edge: color.optional(),
    slabs: z.array(color).optional().describe('slab tones by h2 (default piedra, piedra sombra, piedra)'),
    moss: color.optional(), rim: z.tuple([color, color]).optional().describe('[slab, joint] at the right and bottom border'),
  }).optional(),
}).describe('a ledge of wet slabs on the "ledge" mask (Voronoi with a stretch): lit lip, dark joint, moss in the joints and climbing the slabs, a dark border right and below');

export const plungeStep = z.object({
  step: z.literal('plunge'),
  material: z.string().describe('the water: ramp [deep, mid, shallow, foam, glint]'),
  banks: z.array(z.string()).describe('materials that make a high bank over the water (a face of earth and a cold shadow)'),
  ledge: z.string().optional().describe('the material of a ledge: its face over the water is rock'),
  beach: z.string().optional().describe('the material of a beach: the water licks it'),
  river: z.string().describe('the line where the river starts'),
  salts: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[river depth, river channel, pool depth, foam] (default [371, 372, 373, 374])'),
  faces: z.object({ earth: z.tuple([color, color]), rock: z.tuple([color, color]) }).optional()
    .describe('the two px of a high bank face (default earth tierra sombra, madera sombra; rock túnica oscura, túnica noche)'),
  pebbles: pt.optional().describe('[tries, salt]: pebbles seen under the shallows of the river (default [600, 375])'),
  foam: z.object({
    at: pt.describe('[u, v] cells: the foot of the fall'),
    squash: z.number().optional().describe('x squash of the rings (default 1.9)'),
    salt: z.number().int().optional().describe('default 381'),
    rings: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), color])).optional()
      .describe('[radius px, swing px, period px, salt, above, color]: thin rings opening (default [[12, 1.5, 5, 382, 0.4, "celeste luz"], [17, 1.5, 6, 383, 0.52, "celeste"]])'),
  }).optional().describe('the foam at the foot of a fall, in the pool'),
}).describe('the water of a glen (needs a glen step): the river by depth under its line with a channel, the pool and the stream by distance to the shore; high banks show their face and cast a cold shadow, the water licks the beach, foam on the low shore; pebbles under the shallows; the foam of the fall in rings');

export const wetstonesStep = z.object({
  step: z.literal('wetstones'),
  material: z.string().describe('the stone (grain ramp)'),
  stones: z.array(z.object({
    at: pt.describe('[u, v] cells'), r: pt.describe('[rx, ry] px'), salt: z.number().int(),
    moss: z.boolean().optional().describe('default true'),
    wake: z.boolean().optional().describe('foam upstream (left) and a wake to the right (default true)'),
  })),
  colors: z.tuple([color, color]).optional().describe('[foam, wake] (default ojo, celeste luz)'),
}).describe('wet stones in and by the water of a glen, each with its foam on the left and its wake to the right');

const edgeSide = z.object({ at: z.number().describe('px from the map side'), waves: z.array(wave) });

export const wetwoodStep = z.object({
  step: z.literal('wetwood'),
  material: z.string(),
  left: edgeSide, right: edgeSide,
  river: z.string().describe('the line of the river: no wood near it'),
  salt: z.number().int().optional().describe('salt of the crowns (default 421; painted with salt + 4)'),
  tries: z.number().int().optional().describe('default 3200'),
  ramps: z.array(z.array(color).length(5)).length(4).describe('[glint, light, mid, shadow, line] by depth (< 9, < 26, < 52, more px)'),
  lit: z.array(color).length(5).describe('the ramp of the near crowns on the sunny (right) half'),
  fill: color.optional().describe('default túnica noche'),
  top: z.tuple([color, color, z.number()]).optional().describe('[far, near, px]: above the map (off the ledge) the wood closes (default túnica noche, hoja sombra, 5)'),
  fade: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px past the edge, one step until, deep from, all dark from, salt]: past the edge what is not wood darkens (default [10, 24, 52, 66, 427])'),
  deep: z.tuple([color, color]).optional().describe('[dark, else] the deep fade (default túnica noche, hoja sombra)'),
}).describe('the wet wood on the sides of a glen (needs a glen step): crowns by depth past a wavy edge, never on the earth nor near the river; past the edge the trail and the shore darken into the wood; above the map it closes. Its edges are read by glenshade and boughs');

export const glenshadeStep = z.object({
  step: z.literal('glenshade'),
  casters: z.array(z.object({
    prefix: z.string().describe('decor sprites that start with this'),
    at: pt.describe('without a sun: [du, dv] cells from the middle of its foot'),
    r: pt.describe('[rx, ry] px'),
    salt: z.union([z.number().int(), z.tuple([z.number()])]).describe('a salt, or [mul]: trunc(middle u·mul + foot v)'),
    deep: z.boolean().optional().describe('without a sun: two steps darker'),
    trunk: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[dv, px, slope]: a trunk shadow two px thick from the middle of the foot (with a sun it only says the piece is a tree: a crown on a trunk)'),
  })).describe('the decor that casts (night pieces never)'),
  casts: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])).optional().describe('[u, v, rx px, ry px, salt] more ovals'),
  rim: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('without a sun: [px, more px, period, row, salt]: the shadow of the wood on the left (default [4, 5, 9, 3.3, 431])'),
  height: z.number().positive().optional().describe('with a sun: px the wood stands over its edge (default 32): its shadow reaches the sun\'s length times that'),
  on: z.array(z.string()).describe('materials the shadows darken'),
  wood: z.string().describe('the wood material: the rim never falls on it'),
  river: z.string().describe('the line of the river: the rim stops there'),
}).describe('cold shadows cast down-right (needs wetwood): lobed ovals under the decor, a trunk for trees, more ovals, the rim of the wood on the left; cleaned once, one step darker (two where deep)');

export const glenlitterStep = z.object({
  step: z.literal('glenlitter'),
  grass: z.string().describe('the grass (its ramp is the tone ladder of the tufts)'),
  earth: z.string(), beach: z.string(), water: z.string().describe('the kind a puddle becomes'),
  tufts: z.object({
    count: z.number().int().optional(), odds: pt.optional(), spacing: pt.optional(), near: pt.optional(),
    shapes: z.array(z.array(z.string())).optional(), layer: z.string().optional(), unknown: z.tuple([color, z.number().int()]).optional(),
  }).optional().describe('tufts: count (9000), odds [near, far] ([0.9, 0.35]), spacing [near, far] px ([8, 11]), near [px to the water, px around the earth] ([10, 6]), shapes, layer of the tips ("mechones"), unknown [color, tone] (["vida sombra", 1])'),
  flowers: z.object({
    count: z.number().int().optional(), reach: z.number().optional(), far: z.number().optional(),
    colors: z.tuple([z.number(), z.array(color), z.array(color)]).optional(), stem: color.optional(),
  }).optional().describe('pale flowers by the water: count (36), px past the map (8), px from the water (22), [odds, colors, else], stem (hoja sombra)'),
  stones: z.object({ count: z.number().int().optional() }).optional().describe('pebbles and puddles on the earth, pebbles on the beach (1300 tries)'),
  leaves: z.object({ count: z.number().int().optional(), r: z.number().optional(), colors: z.array(color).optional() }).optional()
    .describe('fallen leaves near the trees (decor "arbol…"): count (500), r px (26), colors'),
}).describe('the small things of a glen by the shared random stream, in order: tufts (tips on a layer that sways), pale flowers by the water, pebbles and puddles that reflect the sky on the earth, pebbles on the beach, fallen leaves');

export const glenflowStep = z.object({
  step: z.literal('glenflow'),
  water: z.string().describe('the water material'),
  layers: z.tuple([z.string(), z.string(), z.string()]).optional().describe('[glints, stream, river] (default brillos, corriente, rio)'),
  sun: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[px along, px across, salt, above]: sunny glints are white (default [64, 13, 333, 0.6])'),
  river: z.string().describe('the line of the river'),
  fall: pt.optional().describe('[u, v] cells: the foot of a fall, where the foam twinkles more'),
}).describe('what moves on the water of a glen: glints (sunny ones white), the foam of the fall twinkling more, streaks down the stream and along the river, each on its layer');

export const boughsStep = z.object({
  step: z.literal('boughs'),
  layer: z.string().optional().describe('default copas'),
  count: z.number().int().optional().describe('tries (default 70)'),
  salts: pt.optional().describe('[boughs, hanging moss] (default [461, 467])'),
  ramps: z.tuple([z.array(color).length(5), z.array(color).length(5)]).describe('[left, right]'),
  hang: z.tuple([color, color]).optional().describe('[moss, tip] (default hoja clara, bambú)'),
  river: z.string(),
}).describe('boughs of the wet wood (needs wetwood) reaching in front of people from both edges, alternating, apart, never over the earth nor the river, with moss hanging from their lowest px');

export type GlenStep = z.infer<typeof glenStep>;
export type CushionsStep = z.infer<typeof cushionsStep>;
export type MudtrailStep = z.infer<typeof mudtrailStep>;
export type ShingleStep = z.infer<typeof shingleStep>;
export type LedgeslabsStep = z.infer<typeof ledgeslabsStep>;
export type PlungeStep = z.infer<typeof plungeStep>;
export type WetstonesStep = z.infer<typeof wetstonesStep>;
export type WetwoodStep = z.infer<typeof wetwoodStep>;
export type GlenshadeStep = z.infer<typeof glenshadeStep>;
export type GlenlitterStep = z.infer<typeof glenlitterStep>;
export type GlenflowStep = z.infer<typeof glenflowStep>;
export type BoughsStep = z.infer<typeof boughsStep>;
