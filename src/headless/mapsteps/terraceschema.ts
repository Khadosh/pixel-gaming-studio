// Schemas of the steps of a terrace in the sky (mapsteps/terrace.ts): the sea of
// clouds seen from above with floating peaks, the ashlar face of the terrace
// sinking into the clouds, big stones laid in courses worn where people walk, a
// runner of long slabs, the round arena of a duel, lacquered balustrades on their
// curbs, a stairway going down, sprigs in the mossy joints, fallen leaves, motes
// of light, and the branch of a cliff pine reaching over it all.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const span = pt.describe('[from, to] in cells (fractions allowed; a cell is 16 px, so 1/16 is one px)');
const color = z.string();
const colors2 = z.tuple([color, color]);

export const cloudbanksStep = z.object({
  step: z.literal('cloudbanks'),
  material: z.string().describe('the sky below (kind of every pixel); its ramp is [deep, haze, shadow, cloud, light]'),
  haze: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px across, px down, salt, below]: the haze is the deep tone where fbm is below `below`, else the haze tone (default [60, 7, 1211, 0.3])'),
  rows: z.object({
    every: z.number().int().optional().describe('px between two rows of banks (default 16)'),
    from: z.number().int().optional().describe('row of the first one, px (default -2)'),
    salt: z.number().int().optional().describe('salt of where banks go: salt..salt+5 (default 1250)'),
    bank_salt: z.number().int().optional().describe('salt of the i-th bank (sorted by row) = bank_salt + i·bank_every (default 1260)'),
    bank_every: z.number().int().optional().describe('default 7'),
  }).optional().describe('long flat banks of cloud seen from above, one row after the other: a domed top in lumps (lit), a flat cold belly'),
  peaks: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('floating peaks [u, v in cells (the top), half width px, height px, pines]: a column of rock widening down with ledges, lit left, flat pines on top'),
  peak_salts: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[left side, right side, cracks, lit edge, pines] (+ the index of the peak but the pines; default [1220, 1225, 1230, 1231, 1241])'),
  pines: z.tuple([color, color, color, color, color]).optional()
    .describe('[trunk, lit left, crown, under, light top-left] (default madera sombra, bambú, hoja, hoja sombra, bambú claro)'),
  feet: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[salt, salt step, thickness px, spread (× half width), px above the foot]: a bank hiding the foot of each peak (default [1290, 5, 5, 2.2, 3])'),
  drift: z.object({ layer: z.string(), px: z.number() }).optional().describe('the long banks go to their own layer (the game moves it: "corre") instead of the ground; with within, only the banks that moved px each way still fall on the sky stay there'),
  within: z.string().optional().describe('only inside this mask (the id of a brink: what lies past its foot): the same sky as a first cloudbanks step with the same numbers, painted again where the island fell away'),
});

export const ashlarStep = z.object({
  step: z.literal('ashlar'),
  material: z.string().describe('the face (kind); its ramp is [night, dark, shadow, stone]'),
  x: span.describe('[from, to) in cells: the face runs across this'),
  y: span.describe('[from, to) in cells: its top row and the row past its foot'),
  course: z.number().int().optional().describe('px of a course of stones (default 5)'),
  salt: z.number().int().optional().describe('salt of the joints, the dark foot salt + 1 (default 1301)'),
  sink: z.object({
    material: z.string().describe('the clouds it sinks into (kind; tones 3 and 4 of its ramp)'),
    x: span,
    salt: z.number().int().optional().describe('default 1303'),
    rough: z.number().int().optional().describe('px: tufts every two px rise up to this much over the wave (grass at the foot of a wall, not a smooth bank of cloud; default 0)'),
  }).optional().describe('the foot of the face sinks into the clouds: a wavy edge of cloud rising over it'),
  moss: z.object({
    count: z.number().int(),
    x: span.describe('where it may hang'),
    skip: span.optional().describe('no moss here (a stairway)'),
    salt: z.number().int().optional().describe('default 1305'),
    colors: colors2.optional().describe('[light, dark] (default hoja, hoja sombra)'),
  }).optional().describe('moss hanging from the curb down the face'),
  ragged: z.number().int().optional().describe('px: the stones of the top course stand each at its own height (up to this much lower) with their top corners worn round: a rubble wall, not a ruled top (default 0)'),
});

export const coursesStep = z.object({
  step: z.literal('courses'),
  material: z.string().describe('the stone (kind); its ramp is [joint dark, joint, cold, grain, shade, mid, light, lit] (e.g. piedra sombra, piedra, niebla sombra, niebla, túnica sombra, piedra clara, pergamino, túnica luz); moss from its moss [dark, light]'),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u0, v0, u1, v1) in cells: the paved box'),
  row: z.number().int().optional().describe('px of a course (default 15)'),
  salt: z.number().int().optional().describe('default 1321 (tones +3, moss +5, grain +7, cracks +11, specks +13, cold joint +9)'),
  wear: z.object({
    lanes: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
      .describe('[u, below v in cells, half px, amount]: a worn lane down from v (amount at its middle, none at half px)'),
    rings: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])).optional()
      .describe('[u, v in cells, rx px, ry px, amount, at, half]: a worn ring where the elliptic distance is within half of at'),
    spots: z.object({ amount: z.number(), r: pt.describe('[rx, ry] px'), at: z.array(pt) }).optional().describe('worn spots (a gaussian) at these cells'),
  }).optional().describe('how much each px is trodden (lighter): the max of these'),
  edge: z.object({
    id: z.string().describe('id of the mask of the edge band (fallen leaves read it)'),
    sides: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('weights of the distance to [left, right, top, bottom] (default [1, 1, 1.4, 1.6])'),
    band: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[px, + px of noise, noise scale px, salt] (default [9, 6, 9, 1311])'),
    corners: z.array(z.tuple([z.enum(['tl', 'tr', 'bl', 'br']), z.number()])).optional().describe('[corner, weight] (default bl 1, tr 1, tl 1.3)'),
    corner: z.number().optional().describe('px around a corner (default 22)'),
  }).optional().describe('where nobody walks (by the sides): moss gets into the joints there'),
  cracks: z.number().int().optional().describe('short cracks with a lit edge (default 9)'),
  overgrow: z.object({
    at: z.number().optional().describe('how far in the green comes: 1 only right at the walls, 0 up to the inner limit of the edge band, below 0 past it (default 0.4)'),
    noise: z.tuple([z.number(), z.number(), z.number().int()]).optional().describe('[scale px, amount, salt]: how ragged its front is (default [11, 0.7, 1317])'),
    joints: z.number().optional().describe('share of the joints that hold a line of moss anywhere on the floor, also where people walk (default 0)'),
    colors: z.array(z.string()).min(2).optional().describe('dark to light (default the moss of the material)'),
    kind: z.string().optional().describe('the material its px become (e.g. "pasto": what is scattered on grass later lands on it too; default it stays the stone)'),
  }).optional().describe('an old floor where nobody walks: moss and grass come in from the walls over the slabs (needs edge), ragged, lighter in the middle of a patch, with a dark rim, and the slabs peek through'),
});

export const runnerStep = z.object({
  step: z.literal('runner'),
  material: z.string().describe('kind of its px; ramp as in courses'),
  x: span.describe('[from, to) in cells: the runner with its two edges'),
  y: span.describe('[from, to) in cells'),
  middle: z.number().describe('u of its middle, cells'),
  every: z.number().int().optional().describe('px of a slab (default 7)'),
  split: pt.optional().describe('px from the middle of the joint between the two slabs of a row [odd rows, even rows] (default [-3, 4])'),
  crown: pt.optional().describe('[amount, px]: lighter towards the middle (default [0.25, 10])'),
  salt: z.number().int().optional().describe('default 1331'),
});

export const arenaStep = z.object({
  step: z.literal('arena'),
  material: z.string().describe('kind of its px; ramp [night, dark, shadow, joint, shade, mid, light, lit, scuff]'),
  at: pt.describe('center [u, v] in cells'),
  r: pt.describe('[rx, ry] px'),
  face: z.number().int().optional().describe('px of its step to the south (default 3)'),
  voussoirs: z.number().int().optional().describe('stones of the curb (default 28)'),
  rays: pt.optional().describe('stones of the outer and the inner ring (default [18, 10])'),
  bronze: z.tuple([color, color, color]).optional().describe('[dark, mid, light] of the studs and the ring (default bronce, oro, oro claro)'),
  studs: z.number().int().optional().describe('studs on the curb (default 8)'),
  scuffs: z.number().int().optional().describe('short arcs scuffed on the worn band (default 16)'),
  salt: z.number().int().optional().describe('default 1341 (+1 the tone of each stone, +10 the scuffs)'),
});

const across = z.object({
  y: z.number().describe('row of the top of its curb, cells'),
  curb: span.describe('[from, to] in cells, both included'),
  rail: span.describe('[from, to] in cells, both included'),
  height: z.number().int().describe('px of the rail above its curb'),
  posts: z.number().int().describe('px between two posts'),
  gaps: z.array(span).optional().describe('[from, to) in cells: openings (a stairway, a hatch)'),
  balusters: z.boolean().optional().describe('balusters between the posts (default true)'),
  holes: z.array(span).optional().describe('[from, to) in cells: a dark hole in the curb under a gap'),
});

export const balustradeStep = z.object({
  step: z.literal('balustrade'),
  material: z.string().describe('kind of its px'),
  across: z.array(across).optional().describe('rails along a row, seen from the front: a curb, a lacquered handrail, balusters, posts with gold finials; they stand up (a cast step throws their shadow)'),
  down: z.object({
    x: span.describe('[left, right] in cells: the column of each side rail'),
    y: span.describe('[from, to) in cells'),
    finials: z.number().int().describe('px between two finials, from y[0] + 8 px'),
  }).optional().describe('the rails of the sides, seen from above: curb and handrail along, gold finials every so often'),
  lacquer: z.tuple([color, color, color, color]).optional().describe('[line, dark, mid, light] (default tinta, madera sombra, bermellón, bermellón claro)'),
  curb: z.tuple([color, color, color, color]).optional().describe('[dark, mid, light, high] (default piedra sombra, piedra, piedra clara, niebla)'),
  gold: z.tuple([color, color, color]).optional().describe('[dark, mid, light] (default bronce, oro, oro claro)'),
  hole: colors2.optional().describe('[lip, hole] (default piedra sombra, túnica oscura)'),
});

export const stairwayStep = z.object({
  step: z.literal('stairway'),
  material: z.string().describe('kind of its px'),
  x: span.describe('[from, to) in cells: the treads; a low wall of 2 px at each side'),
  from: z.number().describe('row of the first tread, cells; it goes to the bottom of the picture unless `to` says where it ends'),
  to: z.number().optional().describe('row past the last tread, cells: the flight ends there instead of at the bottom of the picture (a stairway inside a map, between two levels)'),
  middle: z.number().describe('u where the nose turns from lit to mid, cells'),
  every: z.number().int().optional().describe('px of a tread (default 5)'),
  fade: z.number().int().optional().describe('treads before they start to go into the shade, one step each (default 2)'),
  tread: z.array(color).length(6).optional().describe('[nose left, nose right, then the rows 1 to 4] (default túnica luz, pergamino, piedra clara, túnica sombra, piedra, piedra sombra)'),
  wall: z.tuple([color, color, color]).optional().describe('[outer, mid, inner] (default piedra, piedra sombra, túnica oscura)'),
});

export const sprigsStep = z.object({
  step: z.literal('sprigs'),
  on: z.array(z.string()).describe('kinds'),
  over: z.array(color).describe('only over these colors (the moss of the joints)'),
  tries: z.number().int(),
  spacing: z.number().describe('px between two'),
  shapes: z.array(z.array(z.string()).min(1)).min(1).describe('rows of "h" (tip, on the layer), "l" (stem, on the ground) and "."'),
  colors: colors2.optional().describe('[stem, tip] (default hoja, bambú)'),
  layer: z.string().describe('layer of the tips'),
});

export const fallenStep = z.object({
  step: z.literal('fallen'),
  on: z.array(z.string()).describe('kinds'),
  count: z.number().int(),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('[u0, v0, u1, v1] in cells where they are tried'),
  edge: z.string().describe('id of a mask (the edge band of courses): only there'),
  colors: z.tuple([color, color, color]).optional().describe('[leaf, leaf, its tail] (default oro, oro claro, bronce)'),
});

export const motesStep = z.object({
  step: z.literal('motes'),
  on: z.array(z.string()).describe('kinds'),
  over: z.array(color).describe('only over these colors'),
  tries: z.number().int(),
  clear: pt.describe('[px across, px down]: no other mote within'),
  colors: z.array(color).min(1).max(2).describe('one color, or two drawn half and half'),
  pair: z.boolean().optional().describe('a second px at the right when that one is also over (a glint)'),
  layer: z.string(),
});

export const overhangStep = z.object({
  step: z.literal('overhang'),
  layer: z.string().describe('layer it is painted on (in front of people)'),
  trunk: z.array(pt).min(2).describe('[u, v] in cells: the trunk, thick at its first point'),
  width: pt.optional().describe('[half width px at the start, how much thinner at the end] (default [2, 1.2])'),
  bark: z.tuple([color, color, color, color]).optional().describe('[light, mid, dark, outline] (default madera clara, madera, madera sombra, túnica noche)'),
  pads: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).describe('flat crowns [u, v in cells, rx px, ry px]: a domed lumpy top, a flat belly'),
  leaves: z.tuple([color, color, color, color, color, color]).optional().describe('[night, shadow, mid, crown, light, glint] (default túnica noche, hoja sombra, hoja, bambú, bambú claro, hoja clara)'),
  salts: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[bark, lumps, spots] (default [1811, 1800, 1820]; lumps and spots + the index of the pad)'),
  shadow: z.object({ at: pt.describe('[dx, dy] px'), on: z.array(z.string()) }).optional().describe('its shadow on the ground'),
});

export type CloudbanksStep = z.infer<typeof cloudbanksStep>;
export type AshlarStep = z.infer<typeof ashlarStep>;
export type CoursesStep = z.infer<typeof coursesStep>;
export type RunnerStep = z.infer<typeof runnerStep>;
export type ArenaStep = z.infer<typeof arenaStep>;
export type BalustradeStep = z.infer<typeof balustradeStep>;
export type StairwayStep = z.infer<typeof stairwayStep>;
export type SprigsStep = z.infer<typeof sprigsStep>;
export type FallenStep = z.infer<typeof fallenStep>;
export type MotesStep = z.infer<typeof motesStep>;
export type OverhangStep = z.infer<typeof overhangStep>;
