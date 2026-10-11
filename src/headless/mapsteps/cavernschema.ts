// Schemas of the steps of a cave (mapsteps/cavern.ts): a maze of rock seen from
// above with its south faces, a cold stone floor, roots coming down the faces,
// inscriptions carved in columns, a ladder of roots, a still pool, a carved
// formation that lights up, the darkness past the map and the lone pixels
// softened into accents.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const color = z.string();

export const cavernStep = z.object({
  step: z.literal('cavern'),
  round: z.number().int().positive().optional().describe('grid_mask window radius px (default 5)'),
  wobble: z.number().optional().describe('grid_mask wobble px (default 4)'),
  wobble_scale: z.number().optional().describe('grid_mask bump size px (default 8)'),
  keep: z.tuple([z.number().int(), z.number().int()]).optional().describe('[floor, shaft] inset px each cell keeps (default [3, 4])'),
  exits: z.boolean().optional().describe('exit corridors go on into the margin, lost in the dark (default true)'),
  shafts: z.array(z.tuple([z.number().int(), z.number().int(), z.number().int()])).optional()
    .describe('[u, from v, to v] cells (inclusive): a black shaft going up'),
  face: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('south face height [base px, swing, period px, swing 2, period 2 px]'),
  facets: pt.optional().describe('[top px, floor px] Voronoi facet size of rock and floor (default [12, 11])'),
  pebbles: z.number().optional().describe('odds a floor px away from the walls gets a loose pebble (default 0.0015)'),
  glints: z.string().optional().describe('layer of the wet glints of the faces (default "brillos")'),
  darkest: color.optional().describe('what a color not in the recipe shade table darkens into (default "tinta")'),
  floorKind: z.string().optional().describe('the kind its floor px get (default none): a later `on` lights only the floor'),
  tones: z.object({
    edge: z.tuple([color, color]).optional().describe('[lit, plain] the top edge of a face (default niebla sombra, piedra)'),
    under: color.optional().describe('the row under the edge (default piedra sombra)'),
    face: color.optional().describe('the face and its foot (default túnica oscura)'),
    strata: z.tuple([color, color]).optional().describe('[light, dark] strata of the face (default pelo claro, piedra sombra)'),
    vein: color.optional().describe('default pelo oscuro'),
    wet: z.tuple([color, color]).optional().describe('[glint, under it] (default celeste luz, niebla sombra)'),
    outline: color.optional().describe('the outline of the rock seen from above (default tinta)'),
    lip: color.optional().describe('its lit lip (default pelo claro)'),
    top: z.tuple([color, color, color]).optional().describe('the facets of the rock above, dark to light (default tinta, túnica noche, pelo oscuro)'),
    floor: z.tuple([color, color, color]).optional().describe('[dark, base, worn] of the floor (default piedra sombra, piedra, niebla sombra)'),
    crack: color.optional().describe('the cracks between floor slabs (default pelo claro)'),
    foot: color.optional().describe('the floor at the foot of a wall (default túnica oscura)'),
    pebble: z.tuple([color, color, color]).optional().describe('[light, base, shadow] (default piedra clara, piedra, pelo oscuro)'),
  }).optional().describe('the colors of the cavern'),
}).describe('the walls of the game grid as a mass of rock (pgs grid_mask: round corners, wandering borders) seen from above in dark facets with an outline and a lit lip; where it gives on a floor below, its face: a lit edge, strata, a vein, wet glints and a dark foot; the floor of cold stone in cracked slabs, darker at the foot of the walls. The steps that follow read it');

export const hangrootsStep = z.object({
  step: z.literal('hangroots'),
  odds: z.number().int().optional().describe('face cell gets a root when cell noise < this, of 100 (default 24)'),
  drip: z.number().int().optional().describe('a root drips when the cell noise (salt 6) is below this (default 55)'),
  hang: z.number().int().optional().describe('thin roots hang in front when cell noise < this, of 100 (default 60)'),
  tones: z.tuple([color, color, color]).optional().describe('[lit, mid, shadow] of the roots (default madera clara, madera, madera sombra)'),
  front: z.string().optional().describe('layer of the roots that hang in front of people (default "raices")'),
  drops: z.string().optional().describe('layer of the drops that fall (default "gotas")'),
  glints: z.string().optional().describe('layer of the glint of each puddle (default "brillos")'),
}).describe('roots coming down the south faces of a cavern: a thick one out of the rock above (darker there), sometimes a thin one braided by it, rootlets opening on the floor, earth that came down with them; some drip into a puddle, some hang thin roots in front where nobody stands below');

export const carvingsStep = z.object({
  step: z.literal('carvings'),
  at: z.array(pt).optional().describe('face cells carved first, in this order'),
  within: z.object({ box: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u0, v0, u1, v1] cells, inclusive'), max: z.number().int() }).optional()
    .describe('{box: [u, v, w, h] cells, max}: carve rootless face cells inside the box'),
  count: z.number().int().optional().describe('carve this many rootless face cells by cell noise (default 2)'),
  cols: z.number().int().optional().describe('columns of glyphs (default 3)'),
  ink: color.optional().describe('color of the carved strokes (default tinta; a tone of its stone: no ink)'),
}).describe('inscriptions carved in the south faces of a cavern: a smoothed slab with its lit edge and columns of illegible 3×3 strokes (a dark groove, a lit lower edge)');

export const rootladderStep = z.object({
  step: z.literal('rootladder'),
  u: z.number().describe('left cell column of the ladder (it is one cell wide)'),
  bottom: z.number().describe('where it ends, v in cells (fractions allowed)'),
}).describe('a ladder of roots coming down a shaft from the top of the picture: two thick twisted rails and uneven rungs, lost in the dark up there');

export const poolStep = z.object({
  step: z.literal('pool'),
  at: pt.describe('[u, v] center in cells'),
  r: pt.optional().describe('[rx, ry] px (default [40, 13])'),
  glints: z.string().optional().describe('layer of its glints (default "brillos")'),
}).describe('a still dark pool on the floor of a cavern: veins of the ceiling reflected, a lit upper shore, a dark lower shore, glints in streaks on a layer');

export const formationStep = z.object({
  step: z.literal('formation'),
  at: pt.describe('[u, v] center in cells'),
  r: pt.describe('[rx, ry] of the outer ring in cells (flattened: it is seen in 3/4)'),
  inner: pt.optional().describe('[px, px] the inner ring is inside the outer one (default [9, 6])'),
  layer: z.string().describe('layer of the lit formation (a patch the game shows when it lights up)'),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u, v, w, h] cells: the room the lit layer covers (export.crop crops it there)'),
}).describe('a formation diagram carved in a cavern floor: two rings, the eight trigrams of the earlier heaven between them and eight spokes; carved on the ground, lit (qi with a glow) on its layer');

export const gloomStep = z.object({
  step: z.literal('gloom'),
  at: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('px past the map for 1, 2, 3, 5 steps darker (default [4, 18, 34, 52])'),
  clear: z.array(z.string()).optional().describe('layers cleared where it is 2 steps dark or more (default brillos, gotas, raices)'),
  area: z.string().optional().describe('id of a mask: darken by px out of it instead of past the map'),
  salt: z.number().int().optional().describe('salt of its wavy edge (default the cavern\'s; 0 with none)'),
  darkest: z.string().optional().describe('where the shade table ends (default the cavern\'s, else tinta)'),
}).describe('past the border of the map (or of an area) everything darkens into the black, by the recipe shade table (a cavern lit only by a torch)');

export const softenStep = z.object({
  step: z.literal('soften'),
  accent: z.record(z.string(), z.string()).describe('color → an accent of the same value (not in any material)'),
  passes: z.number().int().optional().describe('default 2'),
}).describe('a lone pixel of a material inside another (what the lint calls a blur) becomes an accent of its value: it looks the same and is no material. Materials are the recipe ramps; any other color takes its left neighbour\'s');

export type CavernStep = z.infer<typeof cavernStep>;
export type HangrootsStep = z.infer<typeof hangrootsStep>;
export type CarvingsStep = z.infer<typeof carvingsStep>;
export type RootladderStep = z.infer<typeof rootladderStep>;
export type PoolStep = z.infer<typeof poolStep>;
export type FormationStep = z.infer<typeof formationStep>;
export type GloomStep = z.infer<typeof gloomStep>;
export type SoftenStep = z.infer<typeof softenStep>;
