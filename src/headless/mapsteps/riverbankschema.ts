// Schemas of the steps of a river bank (mapsteps/riverbank.ts): wavy lines
// across the map (the shores), the wood in silhouette around it, a sand beach,
// a mud bank, trodden footpaths, a pier of planks on pilings, reeds stalk by
// stalk, rocks with their shadow, ovals and bands of shade, tufts and flowers
// by their own draws, glints and streaks of current, a dry ditch, a dry pond of
// cracked mud with a walk of slabs across, Voronoi slabs and the water that
// comes back to a ditch and a pond.

import { z } from 'zod';
import { reliefOpts } from './rockformschema';

const pt = z.tuple([z.number(), z.number()]);
const wave = z.tuple([z.number(), z.number(), z.number()]).describe('[amount px, period px, salt]: amount·n1(t / period, salt)');
const waves = z.array(wave);
const lineRef = z.tuple([z.string(), z.number()]).describe('[line, px]: a line of a lines step plus px (negative: above it)');

export const linesStep = z.object({
  step: z.literal('lines'),
  lines: z.record(z.string(), z.object({
    at: z.number().describe('row in cells where it runs'),
    waves: waves.describe('its waves along x'),
    sines: z.array(z.tuple([z.number(), z.number(), z.number()])).optional().describe('[amount px, period px, phase]: then amount·sin(x / period + phase) each (a regular ripple)'),
    slope: z.tuple([z.number(), z.number()]).optional().describe('[u, px per px]: then, right of column u, it goes down this much per px'),
  })).describe('name → wavy line y(x) across the map; shapes and river steps read it by name'),
});

const side = z.object({ at: z.number().describe('px from the map side (out: negative on the left, positive on the right)'), waves: waves.describe('waves along y') });

export const wildwoodStep = z.object({
  step: z.literal('wildwood'),
  material: z.string().describe('the wood (kind)'),
  salt: z.number().int().describe('salt of the crowns (they are painted with salt + 5)'),
  tries: z.number().int().optional().describe('default 4000'),
  clear: z.object({ from: lineRef.optional(), to: lineRef.optional() }).optional()
    .describe('no wood between these lines (a river): from line + px to line + px'),
  bottom: z.object({
    line: z.string().optional().describe('a line it follows (default the map bottom side)'),
    at: z.number().describe('px past that line (or the map bottom side)'),
    waves: waves,
    depth: z.number().describe('px added to the depth (how far past it)'),
  }).optional().describe('the wood below this'),
  top: z.object({
    at: z.number().describe('px from the map top side (negative: above it)'),
    waves: waves,
    depth: z.number().describe('the depth is the map top side + this - y'),
    gap: pt.optional().describe('[u, px]: no wood within px of this column (a road comes in)'),
  }).optional().describe('the wood above this'),
  left: side.optional(),
  right: side.optional(),
  radius: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('r = a + min(depth, cap)·b + h2·c: [a, b, cap, c] (default [6, 0.25, 60, 4])'),
  near: pt.optional().describe('[depth, px]: crowns less deep than this are at most px (default [9, 8])'),
  depths: pt.optional().describe('depths where the second and third ramps start (default [9, 24])'),
  ramps: z.array(z.array(z.string()).length(5)).length(3).describe('[glint, light, mid, shadow, line] by depth'),
  fill: z.string().optional().describe('color where the wood has no crown (default "túnica noche")'),
});

export const beachStep = z.object({
  step: z.literal('beach'),
  id: z.string().optional().describe('id of its mask (default "beach")'),
  material: z.string(),
  between: z.tuple([z.string(), z.string()]).describe('[top line, water line]: the sand lies between them'),
  noise: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[px across, px down, salt] of the sand tones (default [6, 4, 1121])'),
  bands: z.array(z.tuple([z.number().nullable(), z.number(), z.string(), z.string()])).optional()
    .describe('[px to water (null: rest), above, color, else] bands: wet sand, then dry'),
  lip: z.tuple([z.number(), z.number(), z.number(), z.string(), z.string()]).optional()
    .describe('grass lip [px, salt, odds, color, else] under the top line'),
  specks: z.tuple([z.number(), z.number(), z.number(), z.string()]).optional()
    .describe('lone stones on dry sand [salt, odds, px from water, color]'),
  shells: z.object({
    count: z.number().int(), salt: z.number().int(),
    clear: z.number().describe('px from the water where none lie'),
    colors: z.tuple([z.number(), z.string(), z.string()]).describe('[odds, color, else]'),
    shadow: z.string(),
  }).optional().describe('shells and pebbles with their shadow down-right'),
});

export const mudbankStep = z.object({
  step: z.literal('mudbank'),
  material: z.string(),
  below: z.string().describe('the line it lies under (the water above it)'),
  depth: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).describe('[px, more px, period, row, salt]: px + more·fbm(x / period, row, salt, 2) deep'),
  bands: z.array(z.tuple([z.number(), z.string()])).describe('[px, color]: by px under the line, the first not reached'),
  noise: z.tuple([z.number(), z.number(), z.number(), z.number(), z.string(), z.string()]).describe('[px across, px down, salt, above, color, else] for the rest'),
  skip: z.array(z.string()).optional().describe('materials it never covers'),
});

const trailPart = z.union([
  z.object({ points: z.array(pt).min(2).describe('[u, v] in cells'), width: pt.describe('[half width px, how much it breathes px]'), salt: z.number().int() }),
  z.object({ blob: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]).describe('[u, v, rx px, ry px, salt, wobble]') }),
]);

export const footpathStep = z.object({
  step: z.literal('footpath'),
  id: z.string().optional(),
  material: z.string(),
  parts: z.array(trailPart).min(1).describe('trodden ribbons and blobs, one mask'),
  salt: z.number().int().describe('salt of the earth tones (the specks use salt + 1, the ruts salt + 2)'),
  avoid: z.object({
    kinds: z.array(z.string()).optional().describe('materials it never covers'),
    rows: pt.optional().describe('[v, px]: except within px of this row (a road that enters the wood)'),
    between: z.tuple([z.string(), z.string()]).optional().describe('[top line, bottom line]: never between them (the river)'),
  }).optional(),
  lip: z.tuple([z.string(), z.string()]).optional().describe('[grass material, color]: the grass right or below of the path (default none)'),
  over: z.object({
    mask: z.string().describe('id of a mask (a beach)'),
    material: z.string().describe('the path becomes this material there'),
    colors: z.array(z.string()).describe('only these colors change'),
    pick: z.tuple([z.number(), z.number(), z.string(), z.string()]).describe('[salt, odds, color, else]'),
  }).optional().describe('where the path crosses another mask (sand) it is that, trodden darker'),
});

const pierY = z.union([z.number().describe('row in cells'), z.object({ line: z.string(), at: z.number().describe('u where the line is read'), add: z.number() })]);
const pierRef = z.tuple([z.enum(['l', 'r', 't', 'b', 'm']), z.number()]);

export const pierStep = z.object({
  step: z.literal('pier'),
  material: z.string().describe('the planks (kind)'),
  water: z.string().describe('id of the water mask under it'),
  x: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u0, px0, u1, px1]: the deck from trunc(px of u0) + px0 to trunc(px of u1) + px1'),
  y: z.tuple([pierY, pierY]).describe('[top, bottom] of the deck'),
  salt: z.number().int(),
  stringers: z.boolean().optional().describe('the long beams at its sides, seen in the water'),
  shadow: z.object({ from: z.number(), to: z.number(), width: z.number(), rows: pt }).optional()
    .describe('no sun: its shadow on the water to the right {from, to, width, rows} px'),
  under: z.number().optional().describe('rows of shadow below its end (default none)'),
  height: z.number().optional().describe('with a sun: px the deck stands over the water (default 8)'),
  pilings: z.array(z.tuple([pierRef, z.union([pierRef, z.number()])])).optional()
    .describe('posts [[l|r, px], [t|b|m, px] or v] by the deck, ripple at the foot'),
  ripple: z.tuple([z.string(), z.string()]).optional().describe('[ends, middle] ripple colors at a post\'s foot (["celeste luz", "celeste"])'),
});

export const reedsStep = z.object({
  step: z.literal('reeds'),
  clumps: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u, v, stalks, spread px, salt]: v is the foot row (or px added to `line`)'),
  shift: z.number().optional().describe('cells added to each u (default 0)'),
  line: z.string().optional().describe('the clumps stand on this line (their v is px added to it)'),
  rows: z.object({
    count: z.number().int(), start: z.number(), step: z.number(),
    jitter: pt.describe('[salt, cells]: u = start + k·step + (h2(k, 1, salt) - 0.5)·cells'),
    skip: z.array(pt).optional().describe('[u0, u1]: none strictly inside'),
    line: z.string(), foot: pt.describe('[px, more px]: line + px + h2(k, 2, salt)·more'),
    stalks: pt.describe('[n, more]: n + int(h2(k, 3, salt)·more)'),
    spread: z.number(), salt: z.number().int().describe('clump k has salt + k'),
  }).optional().describe('a row of clumps along a shore'),
  front: z.boolean().optional().describe('the whole clump on the `front` layer, in front of people (reeds in the water)'),
  tall: z.number().optional().describe('default 1'),
  not: pt.optional().describe('[u0, u1]: no stalk between these columns (a pier)'),
  tips: z.string().optional().describe('layer of what sways (default "mechones")'),
  layer: z.string().optional().describe('layer of the front clumps (default "copas")'),
  mark: z.tuple([z.array(z.string()), z.string()]).optional().describe('[materials, material]: ground under stalks becomes that material'),
});

export const rocksStep = z.object({
  step: z.literal('rocks'),
  material: z.string().describe('a stone material (grain roles)'),
  at: z.array(z.union([z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]), z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.boolean()])]))
    .describe('[u, v, rx px, ry px, salt, moss?]'),
  on: z.array(z.string()).describe('materials its shadow lands on'),
  shadow: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[dx, dy, rx, ry] × its radii: oval shadow (default [0.5, 0.6, 1.1, 0.8])'),
  relief: reliefOpts.optional().describe('the body as facets shaded from the light of the recipe (docs/map_recipes.md)'),
});

export const umbraStep = z.object({
  step: z.literal('umbra'),
  on: z.array(z.string()).describe('materials it darkens'),
  ovals: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])).optional().describe('[u, v, rx px, ry px, salt]: an oval with a wavy border'),
  deep: z.boolean().optional().describe('two steps darker'),
  ramp: z.boolean().optional().describe("darken down each px's material ramp, not the shade table"),
  bands: z.array(z.object({
    rows: pt.describe('[v0, v1]'), x: pt.describe('[u0, u1]'),
    top: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[px, wave px, period, salt]: nothing above row v0 + px + wave·n1(x / period, salt)'),
  })).optional().describe('the shadow of a roof: a band with a wavy top'),
  along: z.array(z.object({
    of: z.array(z.string()).describe('materials (kinds) it hugs: a wall, a stone floor, a building'),
    px: pt.describe('[min, max] px it reaches from them, by a noise along the edge (min 0: it breaks up in stretches)'),
    period: z.number().optional().describe('px of the noise (default 9)'),
    salt: z.number().int(),
    box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[u0, v0, u1, v1] cells: only inside (default the whole map)'),
    stands: z.number().min(0).optional().describe('px: the foot of what stands (a stamp with `stands`: a lantern, a banner pole, a statue) up to this height above its bottom row hugs too, so it sits in the band at its foot and is not haloed up its sides; its own px are never darkened'),
  })).optional().describe('the grass at the foot of walls, floors, fences: a frayed dark band'),
});

export const meadowStep = z.object({
  step: z.literal('meadow'),
  what: z.enum(['tufts', 'flowers']),
  on: z.string().describe('the grass material'),
  count: z.number().int(),
  salt: z.number().int(),
  odds: z.number().optional().describe('tufts: odds of each try (h2(k, 9, salt))'),
  odds_below: pt.optional().describe('tufts: [v, odds] below this row'),
  shapes: z.array(z.array(z.string())).optional().describe('tufts: rows of glyphs, l the leaves, h the tips'),
  layer: z.string().optional().describe('tufts: the tips (default "mechones")'),
  colors: z.array(z.tuple([z.string(), z.string()])).optional().describe('flowers: [color, color by it]'),
  stem: z.string().optional().describe('flowers: color under them (default "hoja sombra")'),
});

export const shimmerStep = z.object({
  step: z.literal('shimmer'),
  water: z.string().describe('id of the water mask'),
  salt: z.number().int(),
  glints: z.string().describe('layer of the glints (they twinkle)'),
  flow: z.string().describe('layer of the streaks of current (they flow)'),
  sun: z.number().optional().describe('u: right of it only some glints are bright'),
  colors: z.tuple([z.string(), z.string()]).optional().describe('[bright, glint] (default ["ojo", "celeste luz"])'),
  material: z.string().describe('the water material: a streak is one step up its ramp'),
  else: z.string().optional().describe('streak over a color not in the ramp (default "celeste")'),
  skip: z.array(z.string()).optional().describe('materials with no glint nor streak (the pier)'),
});

const voronoiOpts = {
  n: z.number().int().describe('how many slabs'),
  stretch: z.number().optional().describe('default 1.6'),
  salt: z.number().int(),
  moss: z.number().optional().describe('share of the joints with moss (default 0)'),
  ramp: z.tuple([z.string(), z.string(), z.string()]).optional().describe('[lit, mid, dark] (default piedra clara, piedra, piedra sombra)'),
  joint: z.string().optional().describe('default "túnica oscura"'),
  moss_color: z.string().optional().describe('default "hoja"'),
};

export const slabsStep = z.object({
  step: z.literal('slabs'),
  material: z.string(),
  blob: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]).describe('[u, v, rx px, ry px, salt, wobble]'),
  ...voronoiOpts,
});

export const ditchStep = z.object({
  step: z.literal('ditch'),
  id: z.string().optional().describe('id of its mask (default "ditch")'),
  river: z.tuple([z.string().nullable(), z.string().nullable()]).describe('[top line, bottom line] of the river it starts from (null: picture side)'),
  u: z.number().describe('column of its middle'),
  waves: z.array(wave).describe('[px, factor, salt]: px·n1(v·factor, salt) waves of its middle along v (cells)'),
  from: z.tuple([z.string(), z.number()]).describe('[line, px]: it starts at the line (read at u) + px'),
  to: z.number().describe('v where it ends'),
  half: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[px, wave px, factor, salt]: half width px + wave·n1(v·factor, salt)'),
  lip: z.number().optional().describe('px of the stone lip (default 1.8)'),
  stone: z.string(), earth: z.string(),
  salts: z.tuple([z.number(), z.number(), z.number()]).describe('[lip stones, earth, specks]'),
});

export const claypanStep = z.object({
  step: z.literal('claypan'),
  id: z.string().optional().describe('id of its mask (default "claypan")'),
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u0, v0, u1, v1]'),
  inset: z.number().optional().describe('px inside the rect (default 5)'),
  power: z.number().optional().describe('of its rounded square (default 3.2)'),
  wobble: z.array(wave).describe('[amount, angle factor, salt] waves of its border with the angle'),
  rim: z.tuple([z.number(), z.number(), z.number()]).describe('[px, period, salt]: the stone rim, wider at top and bottom'),
  walk: z.object({
    rows: z.tuple([z.number(), z.number()]).describe('[v0, v1]'),
    top: waves.describe('waves of its top row along x (amount in cells)'), bottom: waves.describe('the same for its bottom row'),
    x: z.tuple([z.number(), z.number()]).describe('[u0, u1]'),
    left: waves, right: waves.describe('waves of its ends along y'),
    material: z.string(), ...voronoiOpts,
  }).describe('a walk of slabs across it'),
  mud: z.string(), stone: z.string(),
  plates: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[count, spacing px, salt, colors salt]: Voronoi plates of cracked mud'),
  rim_slabs: z.object(voronoiOpts),
});

export const floodwaterStep = z.object({
  step: z.literal('floodwater'),
  layer: z.string(),
  from: z.array(z.string()).describe('ids of the masks it fills'),
  water: z.string().describe('id of the river mask (not here)'),
  skip: z.array(z.string()).describe('materials it never covers'),
  material: z.string().describe('a water material: [deep, mid, shallow, foam, glint]'),
  edge: z.string().optional().describe('the px under its upper border (default "túnica oscura")'),
  channel: z.object({
    mask: z.string().describe('id of a narrow mask (a ditch) whose water sits low between its walls'),
    wall: z.number().int().describe('px of its shaded wall (the side away from the light) left dry'),
  }).optional().describe('{mask, wall}: a full ditch that still reads as one (wall kept, no foam)'),
  salt: z.number().int().describe('salt of the depth noise (the ripples use salt + 1)'),
});

export type LinesStep = z.infer<typeof linesStep>;
export type WildwoodStep = z.infer<typeof wildwoodStep>;
export type BeachStep = z.infer<typeof beachStep>;
export type MudbankStep = z.infer<typeof mudbankStep>;
export type FootpathStep = z.infer<typeof footpathStep>;
export type PierStep = z.infer<typeof pierStep>;
export type ReedsStep = z.infer<typeof reedsStep>;
export type RocksStep = z.infer<typeof rocksStep>;
export type UmbraStep = z.infer<typeof umbraStep>;
export type MeadowStep = z.infer<typeof meadowStep>;
export type ShimmerStep = z.infer<typeof shimmerStep>;
export type SlabsStep = z.infer<typeof slabsStep>;
export type DitchStep = z.infer<typeof ditchStep>;
export type ClaypanStep = z.infer<typeof claypanStep>;
export type FloodwaterStep = z.infer<typeof floodwaterStep>;
