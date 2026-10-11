// Schemas of the map steps that live in their own files (mapsteps/*.ts): the
// edge of a plateau over a sea of clouds (cliff), flights of stone steps
// (flight) and single carved things (feature: a meditation dais, an old slab,
// roots). Kept apart from maprecipe.ts so the painters can import mappaint.ts.

import { z } from 'zod';
import { climbRock, edgeStair, wornStairs } from './terraceschema';

const pt = z.tuple([z.number(), z.number()]);

export const cliffStep = z.object({
  step: z.literal('cliff'),
  id: z.string().optional(),
  material: z.string().describe('ramp of what lies far below the edge [deep, mist, cloud shadow, cloud, light]'),
  face: z.string().describe('rock face material: an 8-tone stone ramp (ink … highlight)'),
  side: z.literal('l').optional().describe('map side that ends in the cliff (only "l": the face looks west)'),
  inset: z.number().optional().describe('px from the map edge to the lip of the cliff (default -5: just outside)'),
  wobble: pt.optional().describe('px the lip wanders, [big waves, small waves] (default [3.4, 1.6])'),
  width: z.tuple([z.number(), z.number(), z.number()]).optional().describe('px of the rock face: [base, + fbm, + wave] (default [7, 4, 2.5])'),
  banks: z.number().optional().describe('px between two banks of clouds (default 34)'),
  peaks: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('far peaks in the clouds: [u, v of the top cells, half width px, height px]'),
  stones: z.array(z.number()).optional().describe('rows (v, cells) of a loose stone on the lip'),
  lip: z.string().optional().describe('color of the earth on the lip (default "madera sombra")'),
  grass_colors: z.tuple([z.string(), z.string()]).optional().describe('grass hanging over the lip [first px, the rest] (default ["bambú", "hoja"])'),
  pines: z.tuple([z.string(), z.string()]).optional().describe('pines on the far peaks [lit, shadow] (default ["hoja", "hoja sombra"])'),
  seed: z.number().int().optional().describe('salt of its noise (default 200)'),
  drift: z.object({
    layer: z.string().describe('the layer the drifting clouds go to (the game moves it: "corre")'),
    px: z.number().describe('px they drift each way: a cloud that would touch the rock face (or a far peak, without `peaks`) that far away stays painted on the ground'),
    peaks: z.string().optional().describe('the layer the far peaks, the clouds at their feet and the rock face go to, above the drifting clouds: then the clouds drift behind them and slide under the face (never past the lip)'),
  }).optional().describe('the banks of clouds that can drift go to their own layer; under them, the mist'),
});

export const brinkStep = z.object({
  step: z.literal('brink'),
  id: z.string().optional().describe('mask name for what lies past the face\'s foot (default brink<index>)'),
  face: z.string().describe('rock face material: 8-tone stone ramp with its moss (the hanging grass)'),
  sea: z.string().describe('ramp of what lies far below the foot [deep, haze, shadow, cloud, light]'),
  ring: z.boolean().optional().describe('the lip is a closed loop around the whole island (faces on every side)'),
  side: z.union([pt, z.tuple([z.number(), z.number(), z.number()])]).optional().describe('ring: side face px [base, + fbm, + more on the west] (default [7, 5, 0])'),
  view: pt.optional().describe('ring: [lean, sides]: faces in perspective from above-south (sect [0.35, 0.85])'),
  lip: z.array(pt).min(2).describe('[u, v] cells west to east: the lip; the face falls south under it'),
  wobble: pt.optional().describe('px the lip wanders, [big waves, small waves] (default [2.4, 1.2])'),
  drop: z.tuple([z.number(), z.number(), z.number()]).optional().describe('face px [base, + fbm, + jagged foot under each slab] (default [40, 10, 6])'),
  slabs: pt.optional().describe('px of a column of the face [across, down] (default [6, 30])'),
  taper: z.number().optional().describe('px over which the face shrinks toward the island\'s end (default 16; 0 straight)'),
  gap: z.number().optional().describe('px: a slit of sky this narrow between two columns is closed (default 8)'),
  drape: pt.optional().describe('grass curtains over the lip: [odds, longest px] (default [0.75, 12])'),
  bushes: pt.optional().describe('bushes leaning over the lip: [px apart, radius px] (default [22, 6]; 0 none)'),
  bare: z.array(z.tuple([z.number(), z.number(), z.number()])).optional().describe('ring: [u, v, radius] cells of lip with no bushes (a bay, a lookout)'),
  grass: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional().describe('curtain colors [lit blade, top, deep, edge] (default from the face\'s moss)'),
  haze: z.tuple([z.number(), z.number(), z.number()]).optional().describe('haze past the foot: [px across, px down, salt] (default [60, 7, 1211])'),
  mist: z.tuple([z.number(), z.number(), z.number()]).optional().describe('cloud banks hiding the foot: [bank px, thickness px, px above foot]'),
  falls: z.array(z.union([pt, z.tuple([z.number(), z.number(), z.number(), z.number()])])).optional().describe('waterfall [u cells, half width px] (ring: [u, half w px, v, length px])'),
  water: z.string().optional().describe('the water of the falls: a ramp [deep, mid, shallow, foam, glint]'),
  flow: z.string().optional().describe('layer of the light streaks of the falls (the game makes it flow down)'),
  pour: z.tuple([z.number(), z.number()]).optional().describe('ring: [spread, fade px]: the fall pours from a cleft and fades into cloud'),
  spring: z.number().optional().describe('px down the face where the falls leave a dark cleft (default 0: over the lip)'),
  run: z.number().optional().describe('px of the stream that runs to the lip above each fall (default 12)'),
  skip: z.array(z.string()).optional().describe('materials it never paints over (e.g. a stairway down the face)'),
  swallow: z.boolean().optional().describe('a cloud bank swallows what skip keeps, at the foot (default true)'),
  sky: z.array(z.string()).optional().describe('materials already sky: no face where the lip falls on one (default [sea])'),
  clear: z.array(z.string()).optional().describe('layers erased wherever it paints (clouds, far peaks of a side cliff)'),
  salt: z.number().int().optional().describe('salt of its noise (default 1500)'),
  swell: z.tuple([z.number(), z.number(), z.number()]).optional().describe('ring: [px, px across, salt]: the face drop swells in long waves along the island'),
  strips: z.boolean().optional().describe('ring: face columns as upright strips of varied width, broken in blocks (basalt)'),
  jitter: z.number().optional().describe('how far columns wander from their grid, 0..1 (default 0.7)'),
  shade: z.number().optional().describe('ring: light of the east side, in shade (default -0.3)'),
  lit: z.number().optional().describe('ring: light of the west side, in sun (default 0.45)'),
  dim: z.number().optional().describe('ring: how much darker a south face gets from its lip to its foot (default 1.0)'),
  contrast: z.number().optional().describe('ring: how much lighter or darker one column is than the next (default 0.32)'),
  ledges: z.number().optional().describe('ring: odds a column block\'s top wears a cap of grass (default 0)'),
  tufts: z.union([pt, z.tuple([z.number(), z.number(), z.number()])]).optional().describe('ring: [odds, radius px, overhang px]: green clumps on block tops (ledges)'),
  fringe: pt.optional().describe('ring: grass tongues over the side lips too: [odds, longest px]'),
  billows: z.tuple([z.number(), z.number(), z.number()]).optional().describe('cumulus masses swallow the foot: [px apart, radius px, px above the foot]'),
  soft: z.object({
    rim: z.tuple([z.string(), z.string()]).optional(),
    lumps: z.number().optional(),
    ragged: z.number().optional(),
    bright: z.number().optional(),
    smooth: z.number().int().optional(),
  }).optional().describe('billows: soft masses as in cloudscape soft'),
  clouds: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional().describe('billows: [crest, mid, belly, deep belly] (default tones 6, 5, 4, 3 of the sea)'),
  veil: z.tuple([z.number(), z.number()]).optional().describe('ring + view: [mist px up from the foot, + more in long waves]: the foot in mist'),
  notch: z.tuple([z.number(), z.number()]).optional().describe('ring + view: [rock px each side, bite px]: a front-facing face behind each fall'),
  spume: z.tuple([z.number(), z.number()]).optional().describe('ring + billows: [foam px over cloud, veil px under it]: falls break in clouds'),
  shelves: z.tuple([z.number(), z.number()]).optional().describe('ring + view + veil: grass ledges down the face: [odds per column, px wide]'),
  flank: z.number().optional().describe('ring + view: px of face a west or east lip shows (a tall map: 48–64)'),
  strata: z.tuple([z.number(), z.number()]).optional().describe('ring + view: [px apart, jitter px]: blocks break at shared levels'),
});

export const flightStep = z.object({
  step: z.literal('flight'),
  id: z.string().optional(),
  material: z.string().describe('the stone: an 8-tone ramp; its moss[1] is the grass on the treads'),
  style: z.enum(['down', 'climb', 'edge']).describe('down | climb | edge: how the stair runs (see docs/map_recipes.md)'),
  x: pt.optional().describe('down: [u0, u1] in cells, the walls inside'),
  to: z.number().optional().describe('down: the last row (v, cells)'),
  from: pt.optional().describe('climb: [u, v] in cells, the first tread at the middle of its height'),
  length: z.number().optional().describe('climb: px of treads (default 56)'),
  slope: z.number().optional().describe('climb: px it rises per px (default 0.22)'),
  stepped: z.boolean().optional().describe('climb: each tread level, edges climbing in steps (default false: a ramp)'),
  half: z.number().optional().describe('climb: half height of a tread, px (default 5.5)'),
  clearing: pt.optional().describe('climb: [half px, breathing px] of the opening cut in the forest ([10, 1.5])'),
  through: z.string().optional().describe('climb: forest material it cuts into (default the canopy); the cut is grass'),
  fade: pt.optional().describe('climb: [px, every px]: past px, one tone darker every px (default [24, 12])'),
  every: z.number().int().optional().describe('px of a tread (default 8 down, 7 climb)'),
  worn: wornStairs.omit({ rock: true }).extend({ rock: climbRock.optional() }).optional().describe('climb: worn stone steps with flank, north wall, shadow and moss {wall, …}'),
  edge: edgeStair.optional().describe('edge: the stair of the brink: where it goes and the rock it is cut into'),
  seed: z.number().int().optional(),
});

export const featureStep = z.object({
  step: z.literal('feature'),
  id: z.string().optional(),
  what: z.enum(['dais', 'slab', 'roots', 'ring', 'frost', 'ash']).describe('dais | slab | roots | ring | frost | ash (see docs/map_recipes.md)'),
  material: z.string().describe('dais, slab: 8-tone stone ramp; roots: the earth material they turn grass into'),
  at: pt.describe('[u, v] in cells: the center (dais, slab) or the foot of the trunk (roots)'),
  size: pt.optional().describe('dais: radii px (default [22, 17]); slab: half sizes px (default [7, 5.5])'),
  face: z.number().int().optional().describe('dais: px of its south face (default 3)'),
  corner: pt.optional().describe('slab: corner cut where |dx| > [0] and |dy| > [1] px (default [6, 4.5])'),
  octagon: z.boolean().optional().describe('dais: eight straight sides instead of an ellipse'),
  trigrams: z.array(z.string().regex(/^[01]{3}$/)).length(8).optional().describe('dais: 8 trigrams from north clockwise, lines top-down ("1" solid, "0" broken)'),
  trigramAt: z.number().optional().describe('dais: radius fraction where each trigram\'s middle bar sits (default 0.6)'),
  taiji: z.boolean().optional().describe('dais: a yin-yang at the center (7/40 of the radii) instead of the carved circle'),
  shadow: z.record(z.string(), z.string()).optional().describe('dais: material it shades → the material that px becomes'),
  roots: z.array(pt).optional().describe('roots: [angle in degrees (0 east, 90 south), length px]'),
  wood: z.tuple([z.string(), z.string()]).optional().describe('roots: [lit, shadow] (default ["madera", "madera sombra"])'),
  avoid: z.string().optional().describe('roots: id of a slab they pass under'),
  on: z.array(z.string()).optional().describe('ring: materials its stones shade (groove on the first); frost, ash: falls on'),
  offset: pt.optional().describe('ring: px from `at` to the middle of the ring (default [0, 1])'),
  count: z.number().int().optional().describe('ring: stones (default 7)'),
  phase: z.number().optional().describe('ring: angle of the first stone past the top, radians (default 0.2)'),
  stone: z.tuple([z.number(), z.number(), z.number()]).optional().describe('ring: [rx px, + up to px, ry px] of a stone (default [3.4, 1, 2.4])'),
  groove: z.tuple([z.number(), z.number(), z.string()]).optional().describe('ring: groove [samples around, noise above, color] ([260, 0.45, "hoja sombra"])'),
  box: pt.optional().describe('ring, frost, ash: half size px of its box (default ring [5, 4], frost [12, 6])'),
  squash: z.number().optional().describe('frost, ash: how much wider than tall (default frost 1.7, ash 1.8)'),
  band: z.tuple([z.number(), z.number(), z.number()]).optional().describe('frost: [inner, outer, wobble] px ([3.5, 6.5, 1.5]); ash: [_, radius px, _]'),
  split: z.number().optional().describe('frost: px past which it is the second color (default 5.2)'),
  colors: z.array(z.string()).optional().describe('frost: [inner, outer] colors; ash: [two tones]'),
  seed: z.number().int().optional().describe('salt (default per kind: dais 471, slab 481, roots 500, ring 251…)'),
});

const blob7 = z.array(z.number()).min(4).max(7)
  .describe('[u, v, rx, ry, wobble?, salt?, fine?] center and radii in cells (wobble default 0.14, fine 0.05)');

export const networkStep = z.object({
  step: z.literal('network'),
  id: z.string().optional(),
  material: z.string().describe('earth ramp of 5 tones [line, shadow, base, light, dust]'),
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
  ])).min(1).describe('roads, blobs, ovals added and blobs cut, in order, into one mask'),
  inside: z.tuple([z.string(), z.number()]).optional().describe('[mask id with a distance, px]: earth kept only px inside it, before the clean'),
  also: z.array(blob7).optional().describe('blobs added after the clean, each cleaned alone (a court paved later)'),
  breath: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('[breath samples, small one, px of small one]: half-width wobble ([30, 9, 0.6])'),
  min: z.number().optional().describe('narrowest half width, px (default 4.2)'),
  span: z.number().optional().describe('px around each road center where the distance to it is measured (default 9)'),
  trod: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px, wobble px, noise px, salt]: trodden this close to a road center'),
  mottle: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[salt, px across, px down] of the tone noise (default [221, 5.5, 4.5])'),
  trod_levels: pt.optional().describe('trodden: [low, high] noise thresholds for base / +1 / +2 ([0.42, 0.70])'),
  loose_levels: pt.optional().describe('loose dust: [low, high] thresholds for +1 / +2 tone (default [0.30, 0.46])'),
  ruts: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[from px, to px, salt, noise across, px down, above]: broken ruts off center'),
  ruts_on: z.literal('light').optional().describe('light: ruts only dull the lightest tone (leaves on a trail)'),
  grains: z.array(z.number()).min(3).max(4).optional()
    .describe('[salt, odds trodden, odds loose, odds light?] of dark/base/light grains'),
  grain_tones: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe('tones from the base of the grains: [trodden, loose, light] (default [-1, 0, 2])'),
  grains_all: z.boolean().optional().describe('grains fall on the border and bank too, with loose odds (default inside)'),
  bank: pt.optional().describe('bank tones from base on the light side, 1 and 2 px in (default [-1, -1])'),
  loose_tones: pt.optional().describe('dust tones from base above loose_levels [1] and [0] (default [2, 1])'),
  wheel_ruts: z.object({
    offset: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[px from the center, wobble px, samples of one wobble, salt (each side adds its sign: salt − 1 left, salt + 1 right)]'),
    gaps: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[samples of a stretch, salt, odds a stretch has its rut]: the ruts break (default [14, 887, 0.9])'),
    min: z.number().optional().describe('px from the border of the earth where a rut can be (default 3)'),
    tones: z.tuple([z.number(), z.number(), z.number()]).optional().describe('tones from the base: [the rut, the px below it, the px above it] (default [-1, 0, 1])'),
  }).optional().describe('two continuous cart-wheel ruts along trodden roads'),
  lip: z.union([z.boolean(), z.string()]).optional().describe('lit lip on grass facing the light (true: second-top tone; or a color name)'),
  tufts: z.object({
    count: z.number().int().nonnegative(), salt: z.number().int(),
    colors: z.tuple([z.string(), z.string()]).optional(),
  }).optional().describe('grass tufts creeping 2-3 px into the earth: {count, salt, colors: [tip, stem]}'),
  seed: z.number().int().optional(),
});

export const ropeStep = z.object({
  step: z.literal('rope'),
  id: z.string().optional(),
  layer: z.string().optional().describe('layer it goes on (default "front": it passes in front of people)'),
  from: pt.describe('[u, v] in cells: where it is tied'),
  to: pt.describe('[u, v] in cells: the other end, to the right (or below: north-south)'),
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
}).describe('planks: boards in rows across the floor (texture "planks"); options object');

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
  material: z.string().optional().describe('kind its px get, what other steps see (default "wall"; no material needed)'),
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[x, y, w, h] px from the map\'s top-left (margin negative): a straight wall'),
  from: z.enum(['t', 'b', 'l', 'r']).optional().describe('t | b | l | r: side the profile starts at (default "t")'),
  profile: z.array(profileEntry).min(1).describe('colors across the wall from `from`: a color is 1 px, {…} a band of h px'),
  windows: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[x, y, w, h] px: lattice windows lit from behind, with a sill'),
  lattice: lattice.optional(),
  columns: z.object({
    x: z.array(z.number()).describe('px from the left of the wall'),
    colors: z.array(z.string()).min(1).describe('across the column, left to right (its width)'),
    top: z.number().int().optional().describe('px below the top of the wall where it starts (default 2)'),
    cap: z.string().optional().describe('its first row (default "oro")'),
    foot: z.string().optional().describe('its last row, the bottom of the wall (default "túnica noche")'),
  }).optional().describe('lacquered columns standing in front of the wall'),
  doors: z.array(z.number()).optional().describe('cells (u) where a horizontal wall leaves a one-cell door'),
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
  }).optional().describe('its shadow on the floor along it, each px one tone darker {toward, depth…}'),
  layer: z.string().optional().describe('layer it goes on, over people (a beam, a lintel: "techos"); default ground'),
});

export const furnishStep = z.object({
  step: z.literal('furnish'),
  id: z.string().optional(),
  what: z.enum(['rug', 'shadows']).describe('rug | shadows (see docs/map_recipes.md)'),
  on: z.array(z.string()).describe('materials it is painted on (the floor)'),
  under: z.array(z.string()).optional().describe('rug: sprite prefixes (decor and landmarks) that get one (default ["mesa"])'),
  offset: pt.optional().describe('rug: center offset from the piece\'s cell, cells (default [1.0, 0.55])'),
  size: pt.optional().describe('rug: radii px (default [27, 13])'),
  corner: z.number().optional().describe('rug: radius of its corners px (default 4)'),
  border: z.tuple([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string()])]).optional()
    .describe('rug: [[inner lit, shade], [outer lit, shade]] border colors'),
  weave: z.tuple([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string()])]).optional()
    .describe('rug: [[even bands off, on], [odd bands off, on]] weave colors'),
  dot: z.tuple([z.string(), z.number().int().positive()]).optional().describe('rug: [color, every px]: where (x + y) % every = 0 (default ["oro", 6])'),
  skip: z.array(z.string()).optional().describe('shadows: sprite prefixes with no shadow (hung, standing lamps)'),
  shape: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('shadows, no sun: [rows, px in left, px past right, lean per row] ([4,3,2,1.2])'),
});

export const glowStep = z.object({
  step: z.literal('glow'),
  id: z.string().optional(),
  at: pt.describe('[u, v]: the cell of the light (its middle; fractions allowed)'),
  r: pt.describe('[core, edge] px: full light inside core, fading out to edge'),
  tones: z.number().int().min(1).optional().describe('tones lighter at the core (recipe lighten; default 2)'),
  on: z.array(z.string()).optional().describe('materials it lights (default any)'),
  layer: z.string().optional().describe('layer it goes on, the ground untouched (a `when` of the game)'),
  fray: z.number().min(0).max(1).optional().describe('how much each ring is bitten inward, in bites (default 0.5)'),
  salt: z.number().int().optional(),
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
export type BrinkStep = z.infer<typeof brinkStep>;
export type FlightStep = z.infer<typeof flightStep>;
export type FeatureStep = z.infer<typeof featureStep>;
export type PlanksOpts = z.infer<typeof planksOpts>;
export type WallStep = z.infer<typeof wallStep>;
export type FurnishStep = z.infer<typeof furnishStep>;
export type SunStep = z.infer<typeof sunStep>;
export type GlowStep = z.infer<typeof glowStep>;
