// Schema of the `grove` step (mapsteps/plant.ts): a family of trees planted by
// recipe — round broadleaves, pines and a few plums — each with its trunk on
// the ground and its crown on a front layer, all drawn by the same hand (the
// same greens, the same outline, the same light). Not to be confused with
// mapsteps/grove.ts, the bamboo thicket family of steps.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
export const treeKind = z.enum(['round', 'pine', 'plum', 'bush']);

const tree = z.union([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), treeKind]),
  z.tuple([z.number(), z.number(), treeKind, z.number()]),
  z.tuple([z.number(), z.number(), treeKind, z.number(), z.number()]),
]).describe('[u, v in cells, kind?, height in cells?, salt?]: salt of its shape (default the salt of the step + 13 × its index: a tree laid by a place keeps its shape wherever it lands in the list): the foot of the trunk (the middle of a cell is u + 0.5; its floor v + 0.9). A bush has no trunk: three or four lumps sitting on the ground at that foot, on the ground layer (behind people), as tall as its height (from 0.4 cell)');

const weights = z.object({ round: z.number().optional(), pine: z.number().optional(), plum: z.number().optional(), bush: z.number().optional() })
  .describe('odds of each kind (default round 0.7, pine 0.27, plum 0.03, bush 0)');

export const groveZone = z.object({
  within: z.string().describe('id of a mask (a brink registers "<id> top", the island): the feet stand inside it'),
  band: pt.optional().describe('[from, to] px from the border of the mask, inward, where the feet stand (default [2, 40])'),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[u0, v0, u1, v1] in cells: only feet inside this box'),
  count: z.number().int().positive().describe('trees wanted (fewer if they do not fit)'),
  spacing: z.number().optional().describe('px between two feet at least (default 14); trees overlap when it is less than their width'),
  size: pt.optional().describe('[min, max] height in cells (default the step size)'),
  kinds: weights.optional(),
  walkable: z.boolean().optional().describe('feet may stand on a walkable cell of the game (default false: the zone never blocks a path)'),
  salt: z.number().int().optional().describe('salt of its draws (default 2400 + the index of the zone)'),
  out: z.number().optional().describe('px the foot moves out of the mask after it is drawn, across its border (not over a north-looking one): bushes spilling over the lip of a cliff (default 0)'),
  tall: z.array(z.tuple([z.number().min(0).max(1), z.number().positive()])).optional().describe('[[odds, factor]…]: some trees taller; feet stay, never onto kept or avoid'),
  groups: z.tuple([z.number().int().min(1), z.number().int().min(1), z.number()]).optional().describe('[fewest, most, gap px]: trees come in groups instead of an even carpet: each drawn tree keeps `gap` px off every other group and gathers up to most - 1 more around it, `spacing` apart; open grass shows between the groups (a wood of clumps, not a wall; default none)'),
});

export const groveStep = z.object({
  step: z.literal('grove'),
  id: z.string().optional(),
  layer: z.string().optional().describe('crown layer, in front of people (default "copas"); trunks go on the ground'),
  trees: z.array(tree).optional().describe('trees at given places'),
  into: z.string().optional().describe('in a place step: id of a mother grove its `trees` join (only `trees` allowed)'),
  zones: z.array(groveZone).optional().describe('trees planted by density and salt'),
  kinds: weights.optional(),
  size: pt.optional().describe('[min, max] height in cells of a tree without one (default [2, 4])'),
  on: z.array(z.string()).optional().describe('materials under a zone tree\'s foot (default any but the empty one)'),
  avoid: z.array(z.string()).optional().describe('ids of masks no foot of a zone stands on or near (6 px): a path, a clearing'),
  keep: z.array(z.union([pt, z.tuple([z.number(), z.number(), z.number(), z.number()])])).optional()
    .describe('[u, v, w?, h?] cells no crown or shadow covers (occupied cells always kept)'),
  behind: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u, v, w, h] boxes of standing things a tree behind them must not cover'),
  clear: z.array(z.union([pt, z.tuple([z.number(), z.number(), z.number()])])).optional()
    .describe('[u, v, r?] cells: no zone tree foot within r cells (default 1.5)'),
  leaves: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('round crown colors [outline, shadow, mid, light, glint]'),
  needles: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('pine colors [outline, shadow, mid, light, glint]'),
  snow: z.tuple([z.number(), z.string(), z.string(), z.string()]).optional()
    .describe('[px, lit, mid, shade]: snow on each tier of a pine, px deep at the peak'),
  blossom: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('plum colors [outline, shadow, mid, light, glint]'),
  bush: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('[outline, shadow, mid, light, glint] of a bush (default the leaves)'),
  bark: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional().describe('bark colors [light, mid, dark, outline]'),
  drape: z.tuple([z.array(z.string()), z.number()]).optional()
    .describe('[face materials, px]: green hangs over a cliff lip under a crown'),
  salt: z.number().int().optional().describe('salt of the shapes (default 2300)'),
  shadows: z.boolean().optional().describe('a later light step casts their shadows (default true)'),
  crowns: z.object({
    spread: z.number().positive().optional().describe('crown width times this, for every tree but a bush (default 1): a crown larger against its trunk; what it covers is checked against `keep` and the occupied cells as always'),
    fall: z.number().min(0).optional().describe('how much darker a crown gets from its middle down to its lower border, a light from above (default 0; 0.3 puts the lower half at ~0.8 of the upper one in value)'),
    low: z.number().min(0.1).max(0.5).optional().describe('where the crown of a broadleaf (or a plum) starts, as a fraction of its height from the foot (default 0.3): lower, more crown and less bare trunk'),
    under: z.number().int().min(0).optional().describe('px of shade along the lower border of a crown, inside its outline (default 0)'),
  }).optional().describe('crown light and size against the trunk {spread, low, fall, under}'),
});

export type GroveStep = z.infer<typeof groveStep>;
export type TreeKind = z.infer<typeof treeKind>;
