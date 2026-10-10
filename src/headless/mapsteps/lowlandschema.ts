// Schemas of the steps of a dry lowland road (mapsteps/lowland.ts): straw in
// the grass, the lip of a high land over a far plain in the haze (fields, a
// river, a road going down), a wood of crowns past some sides of the map, damp
// earth, and the shadows the decor casts pixel by pixel from its silhouette.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const wave = z.tuple([z.number(), z.number(), z.number()]).describe('[amount, period px, salt]: amount·n1(t / period, salt)');

export const strawStep = z.object({
  step: z.literal('straw'),
  on: z.string().describe('the grass material (kind) it lies on'),
  patch: z.array(z.number()).length(8).optional()
    .describe('straw patch noise [a, b, salt, c, d, salt2, fine, above] (see docs)'),
  smooth: z.number().int().optional().describe('clean passes of the patches (default 2)'),
  margin: z.number().int().optional().describe('px from the border of the grass where no straw lies (default 2)'),
  strands: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[px across, px down, salt] of the noise of the strands (default [2.2, 5.0, 853])'),
  lit: z.array(z.tuple([z.number(), z.string()])).optional()
    .describe('[above, color] pairs from the top: strand color by its noise'),
  rest: z.string().optional().describe('color of the straw where no `lit` level is reached (default "pasto")'),
  shaded: z.object({
    colors: z.array(z.string()).describe('the grass tones in shade (under them the straw is darker)'),
    strand: z.tuple([z.number(), z.string()]).describe('[above, color]: a strand where its noise is above'),
    speck: z.tuple([z.number(), z.number(), z.number(), z.string()]).describe('[salt, rows of a speck, odds, color]: else a speck by h2(x, y / rows, salt)'),
  }).optional().describe('straw on darker grass as strands and specks (see docs/map_recipes.md)'),
});

export const overlookStep = z.object({
  step: z.literal('overlook'),
  material: z.string().describe('material (kind) of what lies beyond the lip: the far land'),
  at: z.number().describe('px from the map left side where the lip runs (negative: in the margin)'),
  waves: z.array(wave).optional().describe('waves of the lip along y (default [[1.6, 13, 901], [0.8, 4, 902]])'),
  bands: z.array(z.tuple([z.number(), z.string()])).optional()
    .describe('[depth px, color] bands from the lip out (lit lip, then the dark under it)'),
  face: z.tuple([z.number(), z.number(), z.number(), z.number(), z.string()]).optional()
    .describe('dark face after the bands: [px, wobble px, period px, salt, color]'),
  fields: z.object({
    u: pt.describe('u = x·u[0] + y·u[1]'),
    v: pt.describe('v = x·v[0] + y·v[1]'),
    size: pt.describe('[u, v] of one parcel'),
    salt: z.number().int(),
    colors: z.array(z.string()).min(1).describe('a parcel takes one of these by h2(column, row, salt)'),
    line: z.string().describe('the border between parcels (a parcel of this color has none)'),
  }).describe('the far plain: big pale parcels on a skewed grid, their borders a little lighter'),
  river: z.object({
    at: z.number().describe('px from the picture left'),
    waves: z.array(wave).describe('how it winds down the picture'),
    colors: z.array(z.string()).min(1).describe('one px each, left to right'),
  }).optional().describe('a river that winds down the far plain'),
  road: z.object({
    at: z.number().describe('px from the picture left'),
    sway: pt.describe('[amount px, period px]: at + amount·sin(y / period)'),
    color: z.string(),
    from: z.number().describe('row in cells where it starts (it comes down from the lip there)'),
  }).optional().describe('a road going away across the far plain'),
  clear: z.number().optional().describe('px the river and the road keep from the lip (default 5)'),
});

export const woodedgeStep = z.object({
  step: z.literal('woodedge'),
  id: z.string().optional().describe('id of its edge (a poke area reads it: crowns poking in from the right)'),
  material: z.string().describe('the wood (kind), canopy ramp from dark to light'),
  inset: z.number().optional().describe('px past the map sides where the wood starts (default 3)'),
  waves: z.array(wave).optional().describe('[amount, px, salt] waves of the right edge along y (top, bottom straight)'),
  salt: z.number().int().optional().describe('salt of the crowns (default 913; they are painted with salt + 2)'),
  tries: z.number().int().optional().describe('default 2500'),
  left: z.number().optional().describe('no crown left of the map left side + this many px (default 6)'),
  range: pt.optional().describe('[from, to] px past an edge where crowns are (default [2.5, 60])'),
  radius: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('r = a + min(depth, cap)·b + h2·c: [a, b, cap, c] (default [6, 0.3, 90, 5])'),
  depths: pt.optional().describe('px past the edge where the 2nd and 3rd ramps start (default [10, 28])'),
  ramps: z.array(z.array(z.string()).length(5)).length(3).optional()
    .describe('ramps [glint, light, mid, shadow, line] by depth (default from the ramp)'),
  keep: z.string().optional().describe('material (kind) the crowns never paint over (the far land)'),
  cut: z.string().optional().describe('mask id (a road net): no crown where its probes touch it'),
  earth: z.tuple([z.string(), z.number(), z.number()]).optional()
    .describe('[material, px, px]: that material past the edge goes 1, then 2 steps darker'),
  grass: z.object({
    on: z.string(),
    reach: z.number().describe('px past the top and bottom map sides where it starts'),
    shade: z.record(z.string(), z.string()).describe('color → its shade (a color not in it stays)'),
  }).optional().describe('the grass past the right edge and past top and bottom goes one step darker'),
});

export const dampStep = z.object({
  step: z.literal('damp'),
  at: pt.describe('[u, v] in cells: the middle of the spill'),
  r: pt.describe('[rx, ry] px'),
  salt: z.number().int(),
  wobble: z.number().optional().describe('default 0.25'),
  on: z.tuple([z.string(), z.number()]).describe('[mask id with a distance (the earth), px]: only on it, this far inside'),
  noise: z.tuple([z.number(), z.number(), z.number()]).describe('[px, salt, above]: fbm(x/px, y/px, salt, 2) above → the dark color'),
  colors: z.tuple([z.string(), z.string()]).describe('[dark, wet]'),
});

export const castStep = z.object({
  step: z.literal('cast'),
  on: z.array(z.string()).describe('materials the shadows land on'),
  skip: z.array(z.string()).optional().describe('decor whose sprite starts with one of these casts nothing (low things)'),
  skip_when: z.array(z.unknown()).optional().describe('decor whose `when` is one of these casts nothing (the night versions)'),
  lean: pt.optional().describe('[across, down] per px of height: where a px falls (default [0.55, 0.22])'),
  min: z.number().optional().describe('px at most this high cast nothing (default 1)'),
  smooth: z.number().int().optional().describe('clean passes of the shadow (default 2)'),
  landmarks: z.boolean().optional().describe('the landmarks with a sprite cast too (default false)'),
  offset: z.boolean().optional().describe('each piece stands where its offset puts it (default false: on its cell)'),
  foot: z.enum(['bottom', 'lowest']).optional().describe('bottom | lowest: a piece\'s foot row (sprite bottom or lowest opaque row)'),
  covers: z.boolean().optional().describe('every px of a piece stays out of the shadow, foot too (default false)'),
});

export type StrawStep = z.infer<typeof strawStep>;
export type OverlookStep = z.infer<typeof overlookStep>;
export type WoodedgeStep = z.infer<typeof woodedgeStep>;
export type DampStep = z.infer<typeof dampStep>;
export type CastStep = z.infer<typeof castStep>;
