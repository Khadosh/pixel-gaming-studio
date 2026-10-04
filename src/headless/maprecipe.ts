// The map recipe: a painted map ground described as data instead of a script.
//
// A recipe is the game's grid (width, height, walls, decor with its footprint,
// exits; read from the game's map JSON) plus a margin painted around it, named
// materials (a ramp of palette colors from dark to light and a texture), and a
// list of painting steps run in order: areas, paths, water, light, scatter.
// Positions and sizes of map things are in cells of the map (fractions allowed;
// (0, 0) is the top-left corner of the map, the margin is negative); small
// things (a half width, a face height, a spacing) are in px. Colors are names
// of the palette (the game's mother palette). Same recipe and seed, same pixels.
//
// Schemas here; the painter is mappaint.ts; the commands map_* in commands.ts.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const textureSchema = z.enum(['patches', 'mottled', 'canopy', 'grain', 'slabs', 'flat', 'water'])
  .describe('patches: light patches stretched along the light, with blades (grass, snow); mottled: three tones at 5 px with grains (earth); canopy: tree crowns in silhouette, darker with depth (a forest edge); grain: stone with veins along the light and moss on the lit lip; slabs: Voronoi stones with a lit lip and a joint; flat: the base tone; water: bands by distance to the shore');

export const materialSchema = z.object({
  ramp: z.array(z.string()).min(1).describe('palette color names from dark to light'),
  texture: textureSchema.optional(),
  base: z.number().int().nonnegative().optional().describe('index of the main tone (default: the middle one)'),
  scale: z.number().positive().optional().describe('size of a patch, px (default by texture)'),
  shade_max: z.number().int().nonnegative().optional().describe('in a shadow no tone is lighter than this index (default base - 1)'),
  shade_min: z.number().int().nonnegative().optional().describe('a shadow never goes darker than this index (default 0)'),
  moss: z.array(z.string()).optional().describe('stone/slabs: moss colors, dark to light'),
});
export type MapMaterial = z.infer<typeof materialSchema>;

const blob = z.union([
  z.tuple([z.number(), z.number(), z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
]).describe('[u, v, rx, ry, wobble?] center and radii in cells');

export const shapeSchema = z.union([
  z.literal('all'),
  z.object({ blobs: z.array(blob).min(1) }),
  z.object({ cells: z.string().describe('grid letters of the game grid (e.g. "#" walls)'), round: z.number().optional(), wobble: z.number().optional() }),
  z.object({ rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u, v, w, h] in cells') }),
  z.object({
    outside: z.object({
      sides: z.string().optional().describe('which sides of the map: any of "lrtb" (default "lr")'),
      inset: z.number().optional().describe('px the edge enters into the map (default 2)'),
      wobble: z.number().optional().describe('px the edge wanders (default 2.4)'),
    }),
  }),
  z.object({
    poke: z.string().describe('id of an "outside" area: crowns that poke in from its edge'),
    count: z.number().int().positive().optional(),
    r: pt.optional().describe('[min, max] crown radius, px'),
    reach: pt.optional().describe('[min, max] px a crown pokes past the edge'),
  }),
]);
export type MapShape = z.infer<typeof shapeSchema>;

export const areaStep = z.object({
  step: z.literal('area'),
  id: z.string().optional(),
  material: z.string(),
  shape: shapeSchema,
  layer: z.string().optional().describe('layer to paint (default "ground"); e.g. "front" for what passes in front of people'),
  face: z.number().int().positive().optional().describe('a raised area: px of its south face (a crag, a terrace)'),
  holes: z.array(pt).optional().describe('dark holes at the foot of the face: [u, radius px]'),
  seed: z.number().int().optional(),
});

const widen = z.object({ at: z.number().describe('row (v, cells) where the path widens'), add: z.number(), spread: z.number().optional() });

export const pathStep = z.object({
  step: z.literal('path'),
  id: z.string().optional(),
  material: z.string(),
  points: z.array(pt).min(2).describe('[u, v] in cells, through which the curve passes'),
  width: z.tuple([z.number(), z.number()]).optional().describe('[half width px, how much it breathes px] (default [6.6, 2.8])'),
  min: z.number().optional().describe('narrowest half width px (default 4.6)'),
  widen: z.array(widen).optional(),
  clearings: z.array(blob).optional().describe('organic blobs added to the path (a clearing, the mouth of a cave)'),
  branches: z.array(z.object({ points: z.array(pt).min(2), width: z.tuple([z.number(), z.number()]).optional() })).optional()
    .describe('side tongues: half width = width[0] + width[1]·sin(π·t)'),
  bank: z.boolean().optional().describe('the cast shadow of the bank on the side of the light and a lit lip on the far grass (default true)'),
  ruts: z.tuple([z.number(), z.number()]).optional().describe('broken ruts this far from the center, px (default [3, 4]; [0, 0] none)'),
  tufts: z.number().int().nonnegative().optional().describe('tries of grass tufts creeping in from the border (default 260)'),
  stairs: z.object({ to: z.number().describe('stairs from the top of the picture down to this row (v)'), every: z.number().int().optional(), material: z.string() }).optional(),
  seed: z.number().int().optional(),
});

export const waterStep = z.object({
  step: z.literal('water'),
  id: z.string().optional(),
  material: z.string().describe('a material whose ramp is [deep, mid, shallow, foam, glint]'),
  shape: shapeSchema,
  bank: z.array(z.string()).optional().describe('colors of the high bank face over the water (first px first)'),
  reflection: z.string().optional().describe('color of the bank reflected in the water'),
  waves: z.number().optional().describe('one wave each this many px² (default 420; 0 none)'),
  glints: z.string().optional().describe('layer for the glints (the game makes them twinkle)'),
  seed: z.number().int().optional(),
});

export const lightStep = z.object({
  step: z.literal('light'),
  decor: z.boolean().optional().describe('cast the shadows of the decor and the landmarks of the game (default true)'),
  trunks: z.array(z.string()).optional().describe('sprite prefixes that also cast the stripe of a trunk (default ["pino", "arbol"])'),
  low: z.array(z.string()).optional().describe('sprite prefixes of low things with a shadow (default: those with shadow in visuals)'),
  skip: z.array(z.string()).optional().describe('sprites without a shadow'),
  edges: z.array(z.string()).optional().describe('ids of "outside" areas whose edge casts a shadow into the map'),
  faces: z.boolean().optional().describe('raised areas cast a long shadow from their face (default true)'),
  on: z.array(z.string()).optional().describe('materials that receive shadows (default all but the ones that cast)'),
  seed: z.number().int().optional(),
});

export const scatterStep = z.object({
  step: z.literal('scatter'),
  what: z.enum(['tufts', 'flowers', 'pebbles', 'dew', 'boulders', 'stamp']),
  on: z.array(z.string()).optional().describe('materials it can land on'),
  count: z.number().int().nonnegative().optional().describe('tries'),
  near: z.array(z.string()).optional().describe('materials it prefers to be near'),
  near_px: z.number().int().optional(),
  spacing: z.number().optional().describe('px between two of them'),
  layer: z.string().optional().describe('layer for what moves (tufts: their tips; dew: the dots)'),
  colors: z.array(z.array(z.string())).optional().describe('flowers: color groups'),
  at: z.array(z.array(z.number())).optional().describe('fixed places [u, v, …]; boulders [u, v, rx, ry] in cells'),
  more_in: z.string().optional().describe('pebbles: id of a path whose clearings get more'),
  rows: z.array(z.string()).optional().describe('stamp: rows of glyphs, "." transparent'),
  glyphs: z.record(z.string(), z.string()).optional().describe('stamp: glyph → color name'),
  walkable: z.boolean().optional().describe('false: never on a walkable cell of the game'),
  material: z.string().optional().describe('boulders: the stone material'),
  seed: z.number().int().optional(),
});

export const stepSchema = z.discriminatedUnion('step', [areaStep, pathStep, waterStep, lightStep, scatterStep]);
export type MapStep = z.infer<typeof stepSchema>;

export const decorSchema = z.object({
  sprite: z.string(),
  at: pt,
  size: pt.optional(),
  shadow: z.union([z.boolean(), z.string()]).optional(),
  when: z.unknown().optional(),
});

export const gameSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  grid: z.array(z.string()).describe('one row per cell row: "." walkable, "#" wall, "D" decor, "E" exit'),
  decor: z.array(decorSchema).optional(),
});
export type MapGame = z.infer<typeof gameSchema>;

export const recipeSchema = z.object({
  game: z.union([z.string(), gameSchema]).describe('the game map JSON (path, relative to the recipe) or the grid itself'),
  visuals: z.string().optional().describe('the game visuals JSON (sizes and shadows of the decor)'),
  palette: z.string().optional().describe('palette asset with the color names (path, relative to the recipe)'),
  colors: z.record(z.string(), z.string()).optional().describe('extra color names → hex'),
  cell: z.number().int().positive().optional(),
  margin: pt.optional().describe('cells painted around the map [x, y] (default [0, 0])'),
  seed: z.number().int().optional(),
  light: pt.optional().describe('where shadows fall (default [1, 1]: the light comes from the upper left)'),
  materials: z.record(z.string(), materialSchema),
  steps: z.array(stepSchema),
  lint: z.object({
    materials: z.union([z.string(), z.record(z.string(), z.array(z.string()))]).optional()
      .describe('material → hex colors for map_lint (a JSON path or the object); default: the ramps, each color to its first material'),
    architecture: z.boolean().optional(),
  }).optional(),
  export: z.object({
    id: z.string(),
    layers: z.record(z.string(), z.string()).optional().describe('layer → suffix of its file (ground: "")'),
  }).optional(),
});
export type MapRecipe = z.infer<typeof recipeSchema>;
