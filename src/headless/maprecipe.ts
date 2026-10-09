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
import { beamsStep, canesStep, outcropStep, shadeStep, thicketStep, undergrowthStep } from './mapsteps/groveschema';
import { cloudseaStep, conifersStep, cragStep, ledgeStep, mountainStep, pondStep, shadowsStep, shrubStep, snowfieldStep, sparklesStep, spindriftStep, stonesStep, tracksStep, trailStep, tussocksStep } from './mapsteps/alpineschema';
import { castStep, dampStep, overlookStep, strawStep, woodedgeStep } from './mapsteps/lowlandschema';
import {
  beachStep, claypanStep, ditchStep, floodwaterStep, footpathStep, linesStep, meadowStep, mudbankStep, pierStep, reedsStep,
  rocksStep, shimmerStep, slabsStep, umbraStep, wildwoodStep,
} from './mapsteps/riverbankschema';
import {
  arenaStep, ashlarStep, balustradeStep, cloudbanksStep, coursesStep, fallenStep, motesStep, overhangStep, runnerStep, sprigsStep, stairwayStep,
} from './mapsteps/terraceschema';
import { carvingsStep, cavernStep, formationStep, gloomStep, hangrootsStep, poolStep, rootladderStep, softenStep } from './mapsteps/cavernschema';
import { glenStep, cushionsStep, mudtrailStep, shingleStep, ledgeslabsStep, plungeStep, wetstonesStep, wetwoodStep, glenshadeStep, glenlitterStep, glenflowStep, boughsStep } from './mapsteps/glenschema';
import { groveStep } from './mapsteps/plantschema';
import { parapetStep } from './mapsteps/parapetschema';
import { cloudscapeStep } from './mapsteps/skyschema';
import { brinkStep, cliffStep, featureStep, flightStep, furnishStep, networkStep, pavingOpts, planksOpts, ropeStep, sunStep, wallStep } from './mapsteps/schema';

const pt = z.tuple([z.number(), z.number()]);

export const textureSchema = z.enum(['patches', 'mottled', 'canopy', 'grain', 'slabs', 'flagstones', 'rubble', 'paving', 'planks', 'flat', 'water'])
  .describe('patches: light patches stretched along the light, with blades (grass, snow); mottled: three tones at 5 px with grains (earth); canopy: tree crowns in silhouette, darker with depth (a forest edge); grain: stone with veins along the light and moss on the lit lip; slabs: Voronoi stones with a lit lip and a joint; flagstones: laid stones one per cell of a staggered grid (the area says stones: [w, h] px), lit lip up-left, joint down-right, moss creeping into the joints of the border, worn where wear says; rubble: rounded stones of different sizes packed with dark joints, not in courses (the area says stones: [smallest, biggest] px, default [3, 6]), lit up-left, from an 8-tone ramp (joint 2, stones 4 to 6); paving: loose Voronoi stones around the middle of a court (the area says paving: {at, …}), moss and earth in the joints; planks: a wooden floor of boards in rows over the box of the area (the area says planks: {…}); flat: the base tone; water: bands by distance to the shore');

const patchesSchema = z.object({
  shade: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[scale px, salt, below]: where this noise is below `below` the grass is one tone darker (default [26·scale/26, 9 + seed, 0.40])'),
  sun: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[px along the light, px across, salt] of the sun patches (default [70, 15, 3 + seed]·scale/26)'),
  steps: z.array(z.number()).min(1).optional().describe('sun thresholds: above steps[i] the grass is i + 1 tones lighter (default [0.62, 0.67, 0.73])'),
  bright: z.number().nullable().optional().describe('where the shade noise is above this (and no sun), one tone lighter; null = never (default 0.62)'),
  blades: z.number().optional().describe('salt of the blades that rise from a lighter tone (default 41 + seed)'),
  blades_up: z.number().optional().describe('salt of the odds a blade goes two px up (default blades + 2)'),
  blade_odds: pt.optional().describe('[odds of a blade one px up, odds it goes two px up] (default [0.55, 0.35])'),
  half: pt.optional().describe('[shade, sun]: where the shade noise is past `below` but still under half[0], the base tone only where the sun noise is above half[1], else one tone darker (a dry grass, worn in bands; default none)'),
  grain: z.object({
    zone: z.number().positive().optional().describe('px of the broad soft zones that lean the grain lighter or darker (default 40)'),
    odds: pt.optional().describe('[odds a px starts a lighter blade, odds it starts a darker one] where the zone is even (default [0.09, 0.07])'),
    lean: z.number().min(0).max(1).optional().describe('how much the zone moves those odds: 0 none, 1 from nothing to double (default 0.8)'),
    tip: z.number().min(0).max(1).optional().describe('odds a lighter blade tops with a second tone up (default 0.12)'),
    tall: z.number().min(0).max(1).optional().describe('odds a blade is two px high instead of one (default 0.5)'),
    salt: z.number().optional().describe('salt of the grain (default 61 + seed)'),
  }).optional().describe('no direction: instead of patches the grass is its base tone with blades one px wide, lighter and darker, sprinkled px by px (never two side by side), more of the lighter ones where a broad soft noise is high and of the darker where it is low; shade still darkens where its noise is below (pass below 0 to skip it). The fine grass of a painted meadow seen from above, where patches would read as streaks'),
}).describe('patches: the numbers of its noise (all salts absolute)');

export const materialSchema = z.object({
  ramp: z.array(z.string()).min(1).describe('palette color names from dark to light'),
  texture: textureSchema.optional(),
  base: z.number().int().nonnegative().optional().describe('index of the main tone (default: the middle one)'),
  scale: z.number().positive().optional().describe('size of a patch, px (default by texture)'),
  shade_max: z.number().int().nonnegative().optional().describe('in a shadow no tone is lighter than this index (default base - 1)'),
  shade_min: z.number().int().nonnegative().optional().describe('a shadow never goes darker than this index (default 0)'),
  moss: z.array(z.string()).optional().describe('stone/slabs: moss colors, dark to light'),
  patches: patchesSchema.optional(),
  levels: z.tuple([z.number(), z.number()]).optional().describe('mottled: below levels[0] the base tone, above levels[1] two up, between one up (default [0.40, 0.66])'),
});
export type MapMaterial = z.infer<typeof materialSchema>;

const blob = z.union([
  z.tuple([z.number(), z.number(), z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
]).describe('[u, v, rx, ry, wobble?, salt?, fine?] center and radii in cells; salt and fine (the small roughness, default 0.05) to copy a drawing exactly');

export const shapeSchema = z.union([
  z.literal('all'),
  z.object({ blobs: z.array(blob).min(1) }),
  z.object({ cells: z.string().describe('grid letters of the game grid (e.g. "#" walls)'), round: z.number().optional(), wobble: z.number().optional() }),
  z.object({
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u, v, w, h] in cells'),
    wobble: z.number().optional().describe('px the four sides fray in and out (a court laid by hands, not cut by a ruler): 0 = a ruler (default)'),
    period: z.number().optional().describe('px of one wave of that fraying (default 13)'),
    corners: z.number().optional().describe('px taken off each corner along the diagonal (default 0)'),
    salt: z.number().int().optional(),
  }),
  z.object({ between: z.tuple([z.string().nullable(), z.string().nullable()]).describe('[top line, bottom line] of a lines step (null: the picture side): the px from the top one (inclusive) to the bottom one (a river)') }),
  z.object({
    curve: z.array(pt).min(2).describe('[u, v] in cells: a band along this curve (a paved walk)'),
    width: pt.describe('[half width px, how much it breathes px]'),
    period: z.number().optional().describe('samples (every 0.25 px) of one breath (default 14)'),
    salt: z.number().int().optional(),
  }),
  z.object({
    outside: z.object({
      sides: z.string().optional().describe('which sides of the map: any of "lrtb" (default "lr")'),
      inset: z.number().optional().describe('px the edge enters into the map (default 2)'),
      wobble: z.number().optional().describe('px the edge wanders (default 2.4)'),
      openings: z.array(z.tuple([z.number(), z.number(), z.number()])).optional()
        .describe('where the edge recedes (a path goes in): [v or u in cells along the side, half px, depth px]'),
      crowns: z.object({
        tries: z.number().int().optional().describe('default 1600'),
        from: z.number().optional().describe('px inside the map edge where crowns start to be tried (default -10)'),
        touch: z.number().optional().describe('px a crown may sit inside the edge (default -2)'),
        clip: z.number().optional().describe('crowns are not painted further than this many px inside the map edge (default -4)'),
      }).optional().describe('crowns tried only in a band by the side (l or r) instead of the whole picture, and allowed to touch the edge'),
      tries: z.number().int().optional().describe('crowns tried over the whole picture (default 2600)'),
      far: z.number().optional().describe('px beyond the edge where crowns stop (default 46)'),
      cut: z.string().optional().describe('id of a mask (a road net) that cuts the forest: no crown where its probes (±r across, 0.6r up, 0.8r down) touch it, and no dark within `clear` of it (the grass stays)'),
      clear: pt.optional().describe('[px across, px down] of the probes that keep the dark off the cut (default [14, 12])'),
      fade: z.object({
        at: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
          .describe('[px, px, px, px] past the edge: from the 1st the cut darkens one step, from the 2nd two, from the 3rd it is the forest dark (from the 4th always the darkest) (default [10, 22, 44, 60])'),
        salt: z.number().int().optional().describe('salt of the mix of the two darks (default 257)'),
        dark: z.tuple([z.string(), z.string()]).optional().describe('the forest dark the cut fades into (default [tone 0, tone 1])'),
        grass: z.number().optional().describe('px past the edge where the grass left in the clearing goes from one step darker to two (default 20)'),
        on: z.array(z.string()).optional().describe('materials of that grass (default the patches materials)'),
      }).optional().describe('what the cut does past the forest edge: it fades into the shade'),
    }),
  }),
  z.object({
    poke: z.string().describe('id of an "outside" area: crowns that poke in from its edge'),
    count: z.number().int().positive().optional(),
    r: pt.optional().describe('[min, max] crown radius, px'),
    reach: pt.optional().describe('[min, max] px a crown pokes past the edge'),
    gaps: z.array(pt).optional().describe('[v in cells, half px]: rows with no crown (an opening)'),
    crowns: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
      .describe('extra crowns [u, v in cells, r px, depth 0-3 (-1 = lit)] painted with the others'),
    cut: z.string().optional().describe('id of a mask (a road net): no crown where its probes (±r) touch it'),
    spacing: z.number().optional().describe('px down the side between two crowns (default 38)'),
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
  on: z.array(z.string()).optional().describe('only over these materials (blobs, before cleaning the border)'),
  stones: pt.optional().describe('flagstones: [w, h] px of a stone (default [12, 7]); rubble: [smallest, biggest] px (default [3, 6])'),
  wear: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('flagstones: worn (lighter) around [u, v in cells, amount, rx px, ry px]'),
  paving: pavingOpts.optional(),
  planks: planksOpts.optional(),
  flank: z.object({
    side: z.enum(['east', 'west']).optional().describe('the side of the face, away from the light (default east)'),
    width: z.number().int().min(1).max(6).optional().describe('px of the face (default 3)'),
    material: z.string().optional().describe('its ramp (default the area material)'),
    rim: z.boolean().optional().describe('1 px lit lip on the other side'),
    every: z.number().int().min(3).optional().describe('px between joints without flagstones (default 5)'),
    ragged: z.boolean().optional().describe('default true: stones of the face width or width-1, of the top 1 px out on the lit side or not'),
    salt: z.number().int().optional(),
    join: z.array(z.string()).optional().describe('ids of ashlar steps painted before that this wall meets at one of its ends (the walls of a compound): the top runs on over the cap of the ashlar to where its face starts, the side face comes down to there and stops, the face goes on under the corner, the end of the ashlar never shows past the top, and the outer corner is cut round (no vertex of a box)'),
  }).optional().describe('the top of a narrow wall: its side face, joints where a stone of the top ends, darker at the foot; stops at another wall of its material'),
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
  branches: z.array(z.object({
    points: z.array(pt).min(2), width: z.tuple([z.number(), z.number()]).optional(),
    breath: z.number().optional().describe('samples of one breath: then half width = width[0] + width[1]·noise (another trail of the same earth)'),
    salt: z.number().int().optional(),
  })).optional()
    .describe('side tongues: half width = width[0] + width[1]·sin(π·t)'),
  breath: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[samples of one breath, of the small one, share of the small one] (default [46, 22, 0.25])'),
  on: z.array(z.string()).optional().describe('paints only over these materials (the shape still counts whole); the lit lip goes where it painted'),
  salts: z.object({ wave: z.number(), wave2: z.number(), mottle: z.number() }).partial().optional()
    .describe('absolute salts of its noise, to copy a drawing (default 21, 22 and 51 + seed; the grains use mottle + 3)'),
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
  trees: z.boolean().optional().describe('cast the shadows of the trees of the grove steps before it (default true)'),
  crowns: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[rx, ry, ahead, core], all times the crown width: a grove tree casts a round soft shadow at its foot instead of the flat scalloped one, ahead·width down-light, one tone darker and two inside its core (core·the radii); the stripe of the trunk stays (default none: the flat one)'),
  trunks: z.array(z.string()).optional().describe('sprite prefixes that also cast the stripe of a trunk (default ["pino", "arbol"])'),
  low: z.array(z.string()).optional().describe('sprite prefixes of low things with a shadow (default: those with shadow in visuals)'),
  skip: z.array(z.string()).optional().describe('sprites without a shadow'),
  edges: z.array(z.string()).optional().describe('ids of "outside" areas whose edge casts a shadow into the map'),
  faces: z.boolean().optional().describe('raised areas cast a long shadow from their face (default true)'),
  on: z.array(z.string()).optional().describe('materials that receive shadows (default all but the ones that cast)'),
  buildings: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u0, u1, foot v in cells, depth px, side px, salt]: a band under a building and a wedge off its right side'),
  casts: z.array(z.union([
    z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
    z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  ])).optional().describe('scalloped shadows at fixed places: [u, v in cells, rx px, ry px, salt, dx px?, dy px?]'),
  reach: z.tuple([z.number(), z.number()]).optional().describe('px of the shadow of an edge: [base, + noise] (default [4, 4])'),
  blocks: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u0, u1, foot v in cells, depth px, skew, salt, side px]: the shadow of a block (a house): a wedge `side` px tall off its right side (from u1) that grows down, and under the foot a band `depth` px deep that leans right by skew per px; its first two rows under the block are deeper'),
  stripes: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u, v in cells, length px, slope]: a 2 px stripe going right and down (the shadow of a pole)'),
  rim: z.array(z.string()).optional().describe('ids of "outside" areas that darken a band of 4 to 8 px inside their own edge, whatever the light (shade under the trees)'),
  seed: z.number().int().optional(),
});

export const scatterStep = z.object({
  step: z.literal('scatter'),
  what: z.enum(['tufts', 'flowers', 'pebbles', 'dew', 'boulders', 'stamp', 'litter', 'leaves', 'dashes']).describe('litter: fallen needles near a tree (at) and pebbles on a path; leaves: dry leaves fallen near trees (at: [u, v, r px]), one or two px, the px below in shadow; dashes: dry leaves of bamboo, dashes of a few px lying flat or sloping, more on the first `on` material (a trail) than on the others'),
  on: z.array(z.string()).optional().describe('materials it can land on'),
  count: z.number().int().nonnegative().optional().describe('tries'),
  near: z.array(z.string()).optional().describe('materials it prefers to be near (flowers: [] = anywhere)'),
  near_px: z.number().int().optional(),
  spacing: z.number().optional().describe('px between two of them'),
  layer: z.string().optional().describe('layer for what moves (tufts: their tips; dew: the dots)'),
  colors: z.array(z.array(z.string())).optional().describe('flowers: color groups; dew: [[first, second]]; leaves: [colors, the color of the second px of each]; dashes: [colors on the first material, on the others] (default [["bronce", "oro", "oro claro"], ["bronce", "oro"]])'),
  at: z.array(z.array(z.number())).optional().describe('fixed places [u, v, …]; flowers: a clump at each [u, v] in cells (instead of count tries); boulders [u, v, rx, ry] in cells; leaves: the trees [u, v in cells, r px, squash across?] (squash: the distance across is divided by it, default 1)'),
  more_in: z.string().optional().describe('pebbles: id of a path whose clearings get more'),
  rows: z.array(z.string()).optional().describe('stamp: rows of glyphs, "." transparent'),
  glyphs: z.record(z.string(), z.string()).optional().describe('stamp: glyph → color name'),
  draw: z.string().optional().describe('stamp: a drawing of the object from a file (a text drawing in the from_ascii format, path relative to the recipe) instead of rows and glyphs: the object has a name, is opened and retouched in the editor and is reused by other recipes. Every color of the drawing must be in the palette of the recipe, or the recipe fails listing the ones that are not'),
  walkable: z.boolean().optional().describe('false: never on a walkable cell of the game'),
  odds: z.array(z.number()).nullable().optional().describe('tufts: [near, far] chance to keep a try (default [0.9, 0.28]; null: every try is kept, no draw); dashes: [on the first material, on the others far from the edge, near it] (default [0.55, 0.10, 0.22]); flowers: cumulative chance of each color group; litter: [needles near the tree, pebble] (default [0.6, 0.75]); pebbles: [keep, big below, small below] (default [0.16, 0.3, 0.65]); leaves: [skip, a second px] (default [0.5, 0.5])'),
  odds_each: z.boolean().optional().describe('flowers: each color group tries its odds with a draw of its own, in order (the last takes the rest)'),
  own: z.boolean().optional().describe('pebbles: only on pixels still of the path material (not on what was paved over it)'),
  around: z.array(z.number()).optional().describe('dew: only inside the ellipse [u, v in cells, r px, squash across]'),
  far_spacing: z.number().optional().describe('tufts: px between two far from everything (default spacing·11/8)'),
  stem: z.tuple([z.number(), z.number()]).optional().describe('flowers: the pixel under one is tone stem[0] where the grass is at most tone stem[1], else stem[1] (default [1, base - 1])'),
  over: z.array(z.string()).nullable().optional().describe('dew: only over these colors (default the 3 lightest tones of its material; null: any color)'),
  alone: z.boolean().optional().describe('dew: false lets it fall where another layer has a pixel (default true)'),
  reach: z.number().optional().describe('dew: px beyond the map sides it may fall (default 40); flowers: only this close to the map sides (default anywhere)'),
  path: z.string().optional().describe('litter: id of the path it falls on (default the first)'),
  edge: z.tuple([z.string(), z.number()]).optional().describe('tufts, dashes: [id of a mask with a distance (a thicket floor, a path), px]: "near" is this many px or less from its border (instead of near other materials)'),
  shapes: z.array(z.array(z.string()).min(1)).optional().describe('tufts: their shapes, rows of "h" (tip, on the layer), "l" (stem, on the ground) and "." (default four built-in shapes)'),
  lift: pt.optional().describe('tufts: the stem is at least this tone of the ramp, the tip at least that one (default [0, 0])'),
  unknown: z.number().int().optional().describe('tufts: tone taken when the color under it is not of its ramp (default: no tuft there)'),
  foot: z.boolean().optional().describe('tufts: false: no shadow under the stems (default true)'),
  length: pt.optional().describe('dashes: [px, + up to px] (default [2, 2])'),
  avoid: z.string().optional().describe('dashes: a layer they never fall under (the tips of the tufts)'),
  material: z.string().optional().describe('boulders: the stone material'),
  left: z.number().optional().describe('tufts: only where x is past the map left side + left px (default anywhere)'),
  straw: z.tuple([z.string(), z.string()]).optional().describe('tufts: [stem, tip] colors of a dry stalk where the color under it is not of its ramp (straw); default: no tuft there'),
  dry: z.tuple([z.number(), z.string()]).optional().describe('tufts: [odds, color]: with a draw of its own, the tip is this color (a dry tip) instead of two tones up'),
  many: pt.optional().describe('flowers: [least, + up to] px in a group (default [3, 4])'),
  mid: z.boolean().optional().describe('pebbles: false: the small pebble has no mid-stone px at its right (default true)'),
  dust: z.string().optional().describe('pebbles: a grain falling on the lightest earth tone turns this color (default: that tone)'),
  fade: z.number().optional().describe('leaves: a leaf is skipped with odds distance/fade (fewer away from the tree) instead of odds[0], and lands up to r px from it'),
  below_on: z.boolean().optional().describe('leaves: the px below goes into shadow only when it is of an `on` material (default any)'),
  spacing_y: z.number().optional().describe('dew: px up and down between two dots (default spacing)'),
  inside: z.tuple([z.string(), z.number()]).optional().describe('dew: [id of a mask with a distance (a path), px]: only this far or more inside it'),
  kind: z.string().optional().describe('stamp: the material its pixels become (default the one under it)'),
  stands: z.boolean().optional().describe('stamp: it stands up from its bottom row (a pillar): a cast step throws its shadow, like the decor'),
  outside: z.array(z.string()).optional().describe('ids of masks: a fixed place (`at`) whose cell px falls inside any of them is skipped (a place that reserves its rectangle)'),
  seed: z.number().int().optional(),
});

/**
 * A recipe inside another one: `recipe` (a file, relative to the recipe) is laid at `at`. Its steps are in its own
 * cells (its origin at (0, 0)); mapplace.ts inlines them moved to `at` before painting, with the materials and colors
 * of the sub-recipe added to the mother's, so the painter never sees a `place`.
 */
export const placeStep = z.object({
  step: z.literal('place'),
  id: z.string().optional(),
  recipe: z.string().describe('the sub-recipe file (relative to this recipe): materials, colors, steps and its size, in its own cells'),
  at: pt.describe('[u, v] in cells of this recipe where the origin (0, 0) of the sub-recipe goes'),
  reserve: z.string().optional().describe('id of a mask of the rectangle of the sub-recipe (its `size` from `at`), registered before the first step: a grove of the mother avoids it (`avoid`), a scatter skips its fixed places in it (`outside`)'),
});

export const stepSchema = z.discriminatedUnion('step', [areaStep, placeStep, pathStep, waterStep, lightStep, scatterStep, cliffStep, brinkStep, flightStep, featureStep, networkStep, ropeStep, wallStep, furnishStep, sunStep,
  thicketStep, outcropStep, undergrowthStep, canesStep, shadeStep, beamsStep,
  snowfieldStep, ledgeStep, cloudseaStep, cragStep, mountainStep, conifersStep, trailStep, tracksStep, pondStep, shrubStep, shadowsStep, tussocksStep, stonesStep, sparklesStep, spindriftStep,
  strawStep, overlookStep, woodedgeStep, dampStep, castStep,
  linesStep, wildwoodStep, beachStep, mudbankStep, footpathStep, pierStep, reedsStep, rocksStep, umbraStep, meadowStep, shimmerStep, slabsStep, ditchStep, claypanStep, floodwaterStep,
  cloudbanksStep, ashlarStep, coursesStep, runnerStep, arenaStep, balustradeStep, stairwayStep, sprigsStep, fallenStep, motesStep, overhangStep,
  cavernStep, hangrootsStep, carvingsStep, rootladderStep, poolStep, formationStep, gloomStep, softenStep,
  glenStep, cushionsStep, mudtrailStep, shingleStep, ledgeslabsStep, plungeStep, wetstonesStep, wetwoodStep, glenshadeStep, glenlitterStep, glenflowStep, boughsStep, groveStep, cloudscapeStep, parapetStep]);
export type MapStep = z.infer<typeof stepSchema>;
/** One kind of step, e.g. `MapStepOf<'water'>`: the type to declare a step by hand with. */
export type MapStepOf<K extends MapStep['step']> = Extract<MapStep, { step: K }>;

export const decorSchema = z.object({
  sprite: z.string(),
  at: pt,
  size: pt.optional(),
  shadow: z.union([z.boolean(), z.string()]).optional(),
  when: z.unknown().optional(),
  landmark: z.boolean().optional().describe('a landmark of the game (not decor): some steps leave it out'),
  offset: pt.optional().describe('[du, dv] in cells: where the game draws it, off its cell (the cast step uses it with offset: true)'),
  mask: z.array(z.string()).optional().describe('its silhouette (first frame, size × cell px): rows of "#" (opaque) and "."'),
});

export const gameSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  grid: z.array(z.string()).describe('one row per cell row: "." walkable, "#" wall, "D" decor, "E" exit'),
  decor: z.array(decorSchema).optional(),
  occupied: z.array(pt).optional().describe('cells where someone stands or something is that is not decor: the player start, the npcs, every landmark'),
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
  shade: z.record(z.string(), z.string()).optional().describe('color → the color a shadow turns it into; when given it is the whole rule (a color not in it stays), instead of one step down each ramp'),
  lighten: z.record(z.string(), z.string()).optional().describe('color → the color the light turns it into (one step lighter and warmer): the lit lips of planks, the sun through a window'),
  scatter_salt: z.number().int().optional().describe('salt of the random stream the scatter steps share (default 131)'),
  sprites: z.string().optional().describe('folder of the decor sprites (each visuals entry `pss` + ".png", relative to the recipe): their silhouettes come with the decor, for the cast step'),
  materials: z.record(z.string(), materialSchema),
  steps: z.array(stepSchema),
  masks: z.record(z.string(), z.array(z.tuple([z.number(), z.number(), z.number(), z.number()]))).optional()
    .describe('id → rectangles [u, v, w, h] in cells: masks registered before the first step (a place with `reserve` adds one); a grove `avoid`s them, a scatter keeps its fixed places `outside` them'),
  size: pt.optional().describe('a sub-recipe (laid by a place step): its width and height in cells from its origin, the rectangle a `reserve` keeps'),
  lint: z.object({
    materials: z.union([z.string(), z.record(z.string(), z.array(z.string()))]).optional()
      .describe('material → hex colors for map_lint (a JSON path or the object); default: the ramps, each color to its first material'),
    architecture: z.boolean().optional(),
    skip: z.array(z.string()).optional()
      .describe('materials of the ground whose px the shape rules leave out (the sky around an island, a cliff face drawn straight on purpose)'),
  }).optional(),
  export: z.object({
    id: z.string(),
    layers: z.record(z.string(), z.string()).optional().describe('layer → suffix of its file (ground: "")'),
    names: z.record(z.string(), z.string()).optional().describe('layer → the name written in its text drawing and asset'),
    png: z.string().optional().describe('folder for the PNG of each layer, with its Aseprite JSON (relative to the recipe)'),
    txt: z.string().optional().describe('folder for the text drawing of each layer (the source the game rebuilds from)'),
    src: z.string().optional().describe('folder for the .pss.json of each layer, rebuilt from its text drawing'),
    game: z.string().optional().describe('game map JSON to write "ground" into (default: the recipe game, when it is a path)'),
    ground: z.record(z.string(), z.unknown()).optional()
      .describe('keys written into the game map\'s ground object (painting, margen, vivo, copas…); margen defaults to the recipe margin. Only changed keys are rewritten; the rest of the file keeps its text'),
    crop: z.array(z.string()).optional().describe('layers written without the margin, the size of the map (a patch the game lays on the map, like the sun of a room)'),
    windows: z.record(z.string(), z.tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()])).optional()
      .describe('layer → [u, v, w, h] in cells: that layer is written cut to this window of the map (a patch the game lays on one room)'),
    ids: z.record(z.string(), z.string()).optional().describe('layer → the whole id of its file (instead of export.id + its suffix): a patch with a name of its own'),
    ground_at: z.string().optional().describe('key of the ground object in the game map ("" = the top level; default "ground")'),
  }).optional(),
});
export type MapRecipe = z.infer<typeof recipeSchema>;
