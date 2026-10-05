// Schemas of the map steps that live in their own files (mapsteps/*.ts): the
// edge of a plateau over a sea of clouds (cliff), flights of stone steps
// (flight) and single carved things (feature: a meditation dais, an old slab,
// roots). Kept apart from maprecipe.ts so the painters can import mappaint.ts.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const cliffStep = z.object({
  step: z.literal('cliff'),
  id: z.string().optional(),
  material: z.string().describe('what lies below the edge, far away: a ramp [deep, mist, cloud shadow, cloud, cloud light] (e.g. celeste oscuro … túnica luz)'),
  face: z.string().describe('the rock face material: an 8-tone stone ramp (ink, line, dark, shadow, mid, speck, light, highlight)'),
  side: z.literal('l').optional().describe('the side of the map that ends in the cliff (only "l": the face looks west, lit by the morning)'),
  inset: z.number().optional().describe('px from the map edge to the lip of the cliff (default -5: just outside)'),
  wobble: pt.optional().describe('px the lip wanders, [big waves, small waves] (default [3.4, 1.6])'),
  width: z.tuple([z.number(), z.number(), z.number()]).optional().describe('px of the rock face: [base, + fbm, + wave] (default [7, 4, 2.5])'),
  banks: z.number().optional().describe('px between two banks of clouds (default 34)'),
  peaks: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('far peaks rising from the clouds: [u, v of the top in cells, half width px, height px]'),
  stones: z.array(z.number()).optional().describe('rows (v, cells) of a loose stone on the lip'),
  lip: z.string().optional().describe('color of the earth on the lip (default "madera sombra")'),
  grass_colors: z.tuple([z.string(), z.string()]).optional().describe('the grass that hangs over the lip [first px, the rest] (default ["bambú", "hoja"])'),
  pines: z.tuple([z.string(), z.string()]).optional().describe('the pines on top of the far peaks [lit, shadow] (default ["hoja", "hoja sombra"])'),
  seed: z.number().int().optional().describe('salt of its noise (default 200)'),
});

export const flightStep = z.object({
  step: z.literal('flight'),
  id: z.string().optional(),
  material: z.string().describe('the stone: an 8-tone ramp; its moss[1] is the grass on the treads'),
  style: z.enum(['down', 'climb']).describe('down: treads stacked from the top of the picture down to `to`, between two low walls; climb: treads side by side along x, rising to the right by `slope`, between two walls, into a forest'),
  x: pt.optional().describe('down: [u0, u1] in cells, the walls inside'),
  to: z.number().optional().describe('down: the last row (v, cells)'),
  from: pt.optional().describe('climb: [u, v] in cells, the first tread at the middle of its height'),
  length: z.number().optional().describe('climb: px of treads (default 56)'),
  slope: z.number().optional().describe('climb: px it rises per px (default 0.22)'),
  half: z.number().optional().describe('climb: half height of a tread, px (default 5.5)'),
  clearing: pt.optional().describe('climb: [half px, breathing px] of the opening cut in the forest around it (default [10, 1.5])'),
  through: z.string().optional().describe('climb: the forest material it is cut into (default the canopy material); the cut becomes grass'),
  fade: pt.optional().describe('climb: [px, every px]: after this many px each `every` px is one step darker (in the forest shade) (default [24, 12])'),
  every: z.number().int().optional().describe('px of a tread (default 8 down, 7 climb)'),
  seed: z.number().int().optional(),
});

export const featureStep = z.object({
  step: z.literal('feature'),
  id: z.string().optional(),
  what: z.enum(['dais', 'slab', 'roots', 'ring', 'frost', 'ash']).describe('dais: a round stone platform with a south face, a lit lip, a carved ring, the eight trigrams and a carved center, and its cast shadow; slab: an old rectangular stone with cut corners, a crack and moss on the lit corner; roots: roots that leave the foot of a trunk and sink into the earth; ring: a forgotten formation, flat stones in a ring eaten by moss, each with its small shadow, and a worn groove joining them; frost: a broken band of frost around something (a tomb), lighter inside; ash: the ash of a fire, two tones'),
  material: z.string().describe('dais, slab: an 8-tone stone ramp (moss from its moss); roots: the earth material they turn grass into'),
  at: pt.describe('[u, v] in cells: the center (dais, slab) or the foot of the trunk (roots)'),
  size: pt.optional().describe('dais: radii px (default [22, 17]); slab: half sizes px (default [7, 5.5])'),
  face: z.number().int().optional().describe('dais: px of its south face (default 3)'),
  corner: pt.optional().describe('slab: the corner is cut where both |dx| > corner[0] and |dy| > corner[1] px (default [6, 4.5])'),
  shadow: z.record(z.string(), z.string()).optional().describe('dais: material it casts its shadow on → the material that pixel becomes (it stays shaded for what comes after)'),
  roots: z.array(pt).optional().describe('roots: [angle in degrees (0 east, 90 south), length px]'),
  wood: z.tuple([z.string(), z.string()]).optional().describe('roots: [lit, shadow] (default ["madera", "madera sombra"])'),
  avoid: z.string().optional().describe('roots: id of a slab they pass under'),
  on: z.array(z.string()).optional().describe('ring: materials its stones shade and the groove marks (the groove only the first); frost, ash: materials it falls on'),
  offset: pt.optional().describe('ring: px from `at` to the middle of the ring (default [0, 1])'),
  count: z.number().int().optional().describe('ring: stones (default 7)'),
  phase: z.number().optional().describe('ring: angle of the first stone past the top, radians (default 0.2)'),
  stone: z.tuple([z.number(), z.number(), z.number()]).optional().describe('ring: [rx px, + up to px, ry px] of a stone (default [3.4, 1, 2.4])'),
  groove: z.tuple([z.number(), z.number(), z.string()]).optional().describe('ring: [samples around, above (noise), color] of the groove (default [260, 0.45, "hoja sombra"])'),
  box: pt.optional().describe('ring, frost, ash: half size px of the box it is drawn in (default ring [5, 4], frost [12, 6], ash [7, 4])'),
  squash: z.number().optional().describe('frost, ash: how much wider than tall (default frost 1.7, ash 1.8)'),
  band: z.tuple([z.number(), z.number(), z.number()]).optional().describe('frost: [inner px, outer px, + outer wobble px] (default [3.5, 6.5, 1.5]); ash: [_, radius px, _] (default [0, 3.6, 0])'),
  split: z.number().optional().describe('frost: px past which it is the second color (default 5.2)'),
  colors: z.array(z.string()).optional().describe('frost: [inner, outer] (default ["niebla", "niebla sombra"]); ash: [two tones] (default ["piedra sombra", "túnica oscura"])'),
  seed: z.number().int().optional().describe('salt (default: dais 471, slab 481, roots 500, ring 251 (moss + 1 + k, groove + 2), frost 262 (its noise + 1), ash 271)'),
});

const blob7 = z.array(z.number()).min(4).max(7)
  .describe('[u, v, rx, ry, wobble?, salt?, fine?] center and radii in cells (wobble default 0.14, fine 0.05)');

export const networkStep = z.object({
  step: z.literal('network'),
  id: z.string().optional(),
  material: z.string().describe('the earth: a 5-tone ramp [line, shadow, base, light, dust] (base index from the material)'),
  parts: z.array(z.union([
    z.object({
      road: z.array(pt).min(2).describe('[u, v] in cells: a road through these points'),
      width: pt.describe('[half width px, how much it breathes px]'),
      salt: z.number().int().describe('salt of its breath (the small breath uses salt + 1)'),
      ruts: z.boolean().optional().describe('its center line is trodden (default true)'),
    }),
    z.object({ blob: blob7.describe('an organic blob of earth (a square, a yard)') }),
    z.object({ cut: blob7.describe('an organic blob taken out again (an island of grass people walk around)') }),
    z.object({ oval: z.array(z.number()).min(6).max(7).describe('[u, v in cells, rx px, ry px, wobble, salt, lobes?]: an oval whose radius breathes by wobble·n1(angle·lobes) (lobes default 1.7): a trodden clearing (by a fire)') }),
  ])).min(1).describe('in order, into one mask: roads, blobs and ovals added, blobs cut; then the border is cleaned once'),
  inside: z.tuple([z.string(), z.number()]).optional().describe('[id of a mask with a distance (a thicket floor), px]: before the clean, the earth keeps only what lies inside it, at least px from its border'),
  also: z.array(blob7).optional().describe('blobs added after the clean, each cleaned on its own (a court paved later over the earth: the earth counts it, its tufts stay out)'),
  breath: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('[samples of one breath, of the small one, px of the small one]: half width = width[0] + width[1]·n1(i/b0) + b2·n1(i/b1) (default [30, 9, 0.6])'),
  min: z.number().optional().describe('narrowest half width, px (default 4.2)'),
  span: z.number().optional().describe('px around each road center where the distance to it is measured (default 9)'),
  trod: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px, wobble px, noise px, salt]: closer than px (± wobble) to a road center the earth is trodden (default [5.8, 2.2, 7, 226])'),
  mottle: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[salt, px across, px down] of the tone noise (default [221, 5.5, 4.5])'),
  trod_levels: pt.optional().describe('trodden: below [0] the base tone, above [1] two up, between one up (default [0.42, 0.70])'),
  loose_levels: pt.optional().describe('not trodden (dry dust): above [1] two up, above [0] one up, else the base (default [0.30, 0.46])'),
  ruts: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[from px, to px, salt, noise px across, px down, above]: broken ruts this far from a road center, one tone down (default [3.0, 4.2, 225, 6, 2, 0.42])'),
  ruts_on: z.literal('light').optional().describe('light: the ruts only dull the lightest tone (two up → one up) and leave the rest (leaves on a trail)'),
  grains: z.array(z.number()).min(3).max(4).optional()
    .describe('[salt, odds trodden, odds loose, odds light?]: a dark grain (trodden) or a base one (loose), else a light one (odds light, default the trodden odds) (default [223, 0.035, 0.016])'),
  grain_tones: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('tones from the base of the grains: [trodden, loose, light] (default [-1, 0, 2])'),
  grains_all: z.boolean().optional().describe('the grains fall on the border and the bank too, with the loose odds (default only inside)'),
  bank: pt.optional().describe('tones from the base of the bank on the side of the light, 1 and 2 px in (default [-1, -1])'),
  loose_tones: pt.optional().describe('tones from the base of the dry dust above loose_levels[1] and above loose_levels[0] (default [2, 1])'),
  wheel_ruts: z.object({
    offset: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[px from the center, wobble px, samples of one wobble, salt (each side adds its sign: salt − 1 left, salt + 1 right)]'),
    gaps: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[samples of a stretch, salt, odds a stretch has its rut]: the ruts break (default [14, 887, 0.9])'),
    min: z.number().optional().describe('px from the border of the earth where a rut can be (default 3)'),
    tones: z.tuple([z.number(), z.number(), z.number()]).optional().describe('tones from the base: [the rut, the px below it, the px above it] (default [-1, 0, 1])'),
  }).optional().describe('two continuous ruts (cart wheels) along the trodden roads, one each side of the center: a dark line, its lip below and its light above'),
  lip: z.union([z.boolean(), z.string()]).optional().describe('the grass that faces the light across the earth gets a lit lip (default true: its tone second from the top; a color name: that color)'),
  tufts: z.object({
    count: z.number().int().nonnegative(), salt: z.number().int(),
    colors: z.tuple([z.string(), z.string()]).optional(),
  }).optional().describe('tries of grass tufts creeping into the earth 2-3 px from its border: {count, salt, colors: [tip, stem]} (default none)'),
  seed: z.number().int().optional(),
});

export const ropeStep = z.object({
  step: z.literal('rope'),
  id: z.string().optional(),
  layer: z.string().optional().describe('layer it goes on (default "front": it passes in front of people)'),
  from: pt.describe('[u, v] in cells: where it is tied'),
  to: pt.describe('[u, v] in cells: the other end, to the right'),
  sag: z.number().optional().describe('px it sags in the middle (default 5)'),
  color: z.string().optional().describe('default "madera sombra"'),
  hang: z.array(z.object({
    at: z.number().describe('0..1 along the rope'),
    rows: z.array(z.string()).describe('rows of glyphs, "." transparent'),
    glyphs: z.record(z.string(), z.string()).describe('glyph → color name'),
    offset: pt.optional().describe('px from the rope point to the top-left of the rows (default [0, 0])'),
  })).optional().describe('things hanging from it (lanterns, flags), drawn after the rope'),
});

export const pavingOpts = z.object({
  at: pt.describe('[u, v] in cells: the middle of the court'),
  count: z.number().int().optional().describe('stones (default 18)'),
  spread: pt.optional().describe('[px, px] the seeds fall this far from the middle (default [34, 13])'),
  apart: pt.optional().describe('[px, squash of the rows] two seeds are at least this far (default [9, 1.5])'),
  squash: z.number().optional().describe('rows squashed this much when finding the owner stone (default 1.4)'),
  joint: z.number().optional().describe('where the two nearest seeds are closer than this (squared px) it is a joint (default 14)'),
  tries: z.number().int().optional().describe('default 400'),
  salt: z.number().int().optional().describe('seeds; joints salt + 2, tones + 4, specks + 6 (default 231)'),
  joints: z.tuple([z.string(), z.string()]).optional().describe('[moss, earth] in the joints; earth also on the border of a joint (default [moss[1], shadow])'),
}).describe('paving: loose Voronoi stones around a center (texture "paving")');

export const planksOpts = z.object({
  board: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[px of a board with its joint, shortest px, + up to px]: boards run along x (default [6, 18, 30])'),
  tones: z.array(z.string()).optional().describe('tones a board is drawn from, one per board (repeat one to make it likelier; default the ramp)'),
  salt: z.number().int().optional().describe('salt of the row start; the length uses salt + 2, the tone + 4, the grain + 6, the knots + 8 and + 10 (default 701)'),
  fall: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[weight of the depth, corner px, corner from, corner weight, above]: a whole board is one tone darker where depth·w + max(0, from − d/corner)·cw > above; depth is 0 at the top of the floor and 1 at its foot, d the px from its middle to the nearest side (the light comes from the back wall) (default [0.85, 40, 0.45, 0.8, 0.74])'),
  grain: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px along, px across, dark above, light below]: long thin waving streaks, one tone darker above, one lighter below (only in the 2 middle rows and for the `streak` tones) (default [9, 1.3, 0.70, 0.24])'),
  streak: z.array(z.string()).optional().describe('tones whose light streaks show (default all)'),
  knots: z.number().optional().describe('odds of a knot in a board (default 0.18)'),
  colors: z.object({
    joint: z.string().optional().describe('the joint under each row (default "madera sombra")'),
    end: z.string().optional().describe('the last px of a board (default "madera sombra")'),
    nails: z.tuple([z.string(), z.string()]).optional().describe('[left nail, right nail], 2 px in from each end (default ["madera sombra", "tierra sombra"])'),
    knot: z.string().optional().describe('the eye of a knot; its sides are its tone one darker (default "madera sombra")'),
  }).optional(),
  by_tone: z.record(z.string(), z.object({ joint: z.string().optional(), lip: z.string().optional() })).optional()
    .describe('per board tone: its own joint color, its own lit lip (default the lip is the tone one lighter, by the recipe `lighten`)'),
}).describe('planks: boards laid in rows across the floor (texture "planks"): each board its tone, a lit lip on top, the joint below, the end in shadow, grain, knots and two nails');

const profileEntry = z.union([
  z.string(),
  z.object({
    c: z.string().describe('color'),
    h: z.number().int().positive().optional().describe('px of this band (default 1)'),
    split: z.tuple([z.number(), z.string()]).optional().describe('[share of the wall length, color]: past that share the band is this color (the plaster in shade)'),
    boards: z.tuple([z.number().int().positive(), z.string(), z.string()]).optional().describe('[period px, color of px 0, color of px 1]: vertical boards along the wall'),
  }),
]);

const lattice = z.object({
  every: z.number().int().positive().optional().describe('px between two bars (default 4; the bars are at 1 mod every)'),
  frame: z.string().optional().describe('default "madera sombra"'),
  inner: z.tuple([z.string(), z.string()]).optional().describe('[lit top/left, rest] of the inner frame (default ["madera clara", "madera"])'),
  bars: z.string().optional().describe('default "madera sombra"'),
  paper: z.tuple([z.string(), z.string()]).optional().describe('[paper, a fleck each 7 px] with the light behind (default ["túnica luz", "pergamino"])'),
  sill: z.tuple([z.string(), z.string()]).optional().describe('[lit, shadow]: the sill under it, 1 px wider each side (default ["madera clara", "madera sombra"])'),
});

export const wallStep = z.object({
  step: z.literal('wall'),
  id: z.string().optional(),
  material: z.string().optional().describe('the kind its pixels get (what other steps see; default "wall"; it needs no material in the recipe)'),
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[x, y, w, h] px from the top-left corner of the map (the margin is negative): a straight wall'),
  from: z.enum(['t', 'b', 'l', 'r']).optional().describe('the side the profile starts at: t for a wall seen face on (its bands from the top) or a beam seen from above; l/r for a side beam (from its outer side) (default "t")'),
  profile: z.array(profileEntry).min(1).describe('colors across the wall, from the `from` side: a color is 1 px, an object a band of h px'),
  windows: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[x, y, w, h] px from the map corner: lattice windows with paper lit from behind and a sill (the sun step casts their light)'),
  lattice: lattice.optional(),
  columns: z.object({
    x: z.array(z.number()).describe('px from the left of the wall'),
    colors: z.array(z.string()).min(1).describe('across the column, left to right (its width)'),
    top: z.number().int().optional().describe('px below the top of the wall where it starts (default 2)'),
    cap: z.string().optional().describe('its first row (default "oro")'),
    foot: z.string().optional().describe('its last row, the bottom of the wall (default "túnica noche")'),
  }).optional().describe('lacquered columns standing in front of the wall'),
  doors: z.array(z.number()).optional().describe('cells (u) of the map where a horizontal wall leaves a door one cell wide (e.g. the exit)'),
  threshold: z.object({
    rows: z.array(z.string()).min(1).describe('colors down from the top of the wall (it may go past the wall)'),
    jamb: z.string().optional().describe('its two side columns in the first `jamb_rows` rows (default "túnica noche")'),
    jamb_rows: z.number().int().optional().describe('default 9'),
    light: z.string().optional().describe('layer where the first jamb_rows rows (not the jambs) go one tone lighter (the day outside)'),
  }).optional().describe('a stone sill in each door'),
  shadow: z.object({
    toward: z.enum(['t', 'b', 'l', 'r']).describe('the side the shadow falls toward (into the room)'),
    depth: z.tuple([z.number(), z.number()]).describe('[px, + px of noise]: depth = px + int(noise · fbm(along/scale))'),
    scale: z.number().optional().describe('px of the noise along the wall (default 7)'),
    salt: z.number().int().optional().describe('default 715'),
    on: z.array(z.string()).describe('materials that receive it (the floor)'),
  }).optional().describe('the shadow the wall casts on the floor along it: each px one tone darker (recipe shade)'),
});

export const furnishStep = z.object({
  step: z.literal('furnish'),
  id: z.string().optional(),
  what: z.enum(['rug', 'shadows']).describe('rug: a reed mat under each piece of decor with one of the `under` prefixes (rounded corners, a cloth border lit up-left, a herringbone weave); shadows: short cold shadows at the foot of the decor, down-right, each px one tone darker (they stack where two meet)'),
  on: z.array(z.string()).describe('materials it is painted on (the floor)'),
  under: z.array(z.string()).optional().describe('rug: sprite prefixes (decor and landmarks) that get one (default ["mesa"])'),
  offset: pt.optional().describe('rug: its center from the cell of the piece, cells (default [1.0, 0.55]: under a two-cell table)'),
  size: pt.optional().describe('rug: radii px (default [27, 13])'),
  corner: z.number().optional().describe('rug: radius of its corners px (default 4)'),
  border: z.tuple([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string()])]).optional()
    .describe('rug: [[inner band lit, shade], [outer px lit, shade]] (default [["piel", "piel sombra"], ["bermellón", "madera sombra"]])'),
  weave: z.tuple([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string()])]).optional()
    .describe('rug: [[even bands of 3 rows: off, on], [odd bands: off, on]] by (x/2 + y/3) parity (default [["arena", "oro claro"], ["oro", "arena"]])'),
  dot: z.tuple([z.string(), z.number().int().positive()]).optional().describe('rug: [color, every px]: where (x + y) % every = 0 (default ["oro", 6])'),
  skip: z.array(z.string()).optional().describe('shadows: sprite prefixes with none (hung on the wall, standing lamps) (default [])'),
  shape: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('shadows: [rows, px in from the left, px past the right, lean px per row] (default [4, 3, 2, 1.2])'),
});

export const sunStep = z.object({
  step: z.literal('sun'),
  id: z.string().optional(),
  wall: z.string().describe('id of the wall step whose windows let the light in'),
  layer: z.string().optional().describe('layer it goes on (default "sun"; the game can show it only by day)'),
  on: z.array(z.string()).describe('materials it falls on (the floor)'),
  shift: z.number().optional().describe('px it falls to the right of the window (default 14)'),
  drop: z.number().optional().describe('px below the foot of the wall where it starts (default 3)'),
  stretch: z.number().optional().describe('rows on the floor per row of the window (default 1.8)'),
  lean: z.number().optional().describe('px it leans right per row of the window (default 0.9)'),
  steps: z.number().int().optional().describe('tones lighter than the floor under it (recipe lighten; default 2)'),
});

export type PavingOpts = z.infer<typeof pavingOpts>;
export type NetworkStep = z.infer<typeof networkStep>;
export type RopeStep = z.infer<typeof ropeStep>;
export type CliffStep = z.infer<typeof cliffStep>;
export type FlightStep = z.infer<typeof flightStep>;
export type FeatureStep = z.infer<typeof featureStep>;
export type PlanksOpts = z.infer<typeof planksOpts>;
export type WallStep = z.infer<typeof wallStep>;
export type FurnishStep = z.infer<typeof furnishStep>;
export type SunStep = z.infer<typeof sunStep>;
