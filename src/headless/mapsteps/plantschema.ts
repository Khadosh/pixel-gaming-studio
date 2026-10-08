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
]).describe('[u, v in cells, kind?, height in cells?]: the foot of the trunk (the middle of a cell is u + 0.5; its floor v + 0.9). A bush has no trunk: three or four lumps sitting on the ground at that foot, on the ground layer (behind people), as tall as its height (from 0.4 cell)');

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
  groups: z.tuple([z.number().int().min(1), z.number().int().min(1), z.number()]).optional().describe('[fewest, most, gap px]: trees come in groups instead of an even carpet: each drawn tree keeps `gap` px off every other group and gathers up to most - 1 more around it, `spacing` apart; open grass shows between the groups (a wood of clumps, not a wall; default none)'),
});

export const groveStep = z.object({
  step: z.literal('grove'),
  id: z.string().optional(),
  layer: z.string().optional().describe('layer of the crowns, in front of people (default "copas"); the trunks go on the ground'),
  trees: z.array(tree).optional().describe('trees at given places'),
  zones: z.array(groveZone).optional().describe('trees planted by density and salt'),
  kinds: weights.optional(),
  size: pt.optional().describe('[min, max] height in cells of a tree without one (default [2, 4])'),
  on: z.array(z.string()).optional().describe('materials (kinds) under the foot of a zone tree, 3 px around and 6 up (default any but the empty one)'),
  avoid: z.array(z.string()).optional().describe('ids of masks no foot of a zone stands on or near (6 px): a path, a clearing'),
  keep: z.array(z.union([pt, z.tuple([z.number(), z.number(), z.number(), z.number()])])).optional()
    .describe('[u, v, w?, h?] cells no crown nor its shadow covers, besides the occupied cells of the game (where someone stands or a landmark is), which are always kept: a zone tree that would is not planted, a given one is an error'),
  behind: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u, v, w, h] boxes of things that stand on the bottom row of the box (a sprite of the game, drawn under the crowns): no crown nor its shadow of a tree whose foot is above the bottom of the box covers it (the tree is behind it); a tree whose foot is on or below it is in front and may. A zone tree that would is not planted, a given one is an error'),
  clear: z.array(z.union([pt, z.tuple([z.number(), z.number(), z.number()])])).optional()
    .describe('[u, v, r?] cells no foot of a zone stands within r cells of (default 1.5; an entrance, a spot people stand on); occupied cells of the game are always kept'),
  leaves: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('[outline, shadow, mid, light, glint] of a round crown (default túnica noche, hoja sombra, hoja, bambú, bambú claro)'),
  needles: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('[outline, shadow, mid, light, glint] of a pine (default túnica noche, hoja sombra, hoja, bambú, bambú claro)'),
  blossom: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('[outline, shadow, mid, light, glint] of a plum (default túnica noche, flor sombra, flor, flor clara, túnica luz)'),
  bush: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]).optional()
    .describe('[outline, shadow, mid, light, glint] of a bush (default the leaves)'),
  bark: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional().describe('[light, mid, dark, outline] (default madera clara, madera, madera sombra, túnica noche)'),
  drape: z.tuple([z.array(z.string()), z.number()]).optional()
    .describe('[face materials, px]: where a crown stands over the lip of a cliff (the first px of one of these materials below its foot, 20 px down at most), green hangs from the lip under it in curtains up to this long, longest under the middle of the crown (default none)'),
  salt: z.number().int().optional().describe('salt of the shapes (default 2300)'),
  shadows: z.boolean().optional().describe('a later light step casts their shadows (default true)'),
});

export type GroveStep = z.infer<typeof groveStep>;
export type TreeKind = z.infer<typeof treeKind>;
