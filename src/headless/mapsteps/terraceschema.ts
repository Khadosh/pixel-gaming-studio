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
  id: z.string().optional().describe('its name: an area with `flank.join` naming it joins its wall to this one'),
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
  round: z.boolean().optional().describe('round ends (a loose end, a pillar): its top corners cut 2 and 1 px, its west end column lit and its east one in shadow, a corner stone in relief and not the vertex of a box'),
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

/** Stone steps with weight: lit treads, a one-px lit nose, the riser in shadow, low walls with their cap, the shadow cast beside, worn uneven stones and moss in some joints. */
export const wornStairs = z.object({
  riser: z.number().int().min(1).optional().describe('px of the riser under each nose, in shadow; its last row is the dark joint at its foot (default 2)'),
  wall: z.number().int().min(1).optional().describe('px of the low stone wall at each side: its cap in blocks and its outline (default 4 the stairway, 3 the climb)'),
  blocks: pt.optional().describe('[min, max] px of a stone of a tread; the joints between them are staggered tread by tread (default [6, 11])'),
  jitter: z.number().min(0).max(1).optional().describe('0..1, how worn: treads a px taller or shorter, a stone sunk one tone, chipped noses (default 0.5)'),
  moss: z.number().min(0).max(1).optional().describe('0..1, share of the joints with moss (the moss of the material, else hoja sombra / hoja) (default 0.3)'),
  shadow: z.number().int().min(0).optional().describe('px of the shadow it casts on the ground at its shaded side (default 2)'),
  rock: z.object({
    from: z.number().describe('row (v, cells) where it goes into the rock: the lip of the cliff it goes down'),
    material: z.string().describe('the rock: an 8-tone ramp (the face of the brink)'),
    wide: z.number().int().optional().describe('px each wall grows there (default 4)'),
  }).optional().describe('stairway: from `from` on the walls are the rock cut away around the steps: the left face in shadow, casting on the treads, the right one lit, cracks down both; the risers a px taller'),
  taper: z.number().min(-20).max(20).optional().describe('stairway: perspective, degrees a side: the flight (treads and walls) narrows toward the top of the picture, open below and closed above, a few degrees (see `foreshorten`). Negative widens it upward (default 0)'),
  foreshorten: z.number().min(0).max(1).optional().describe('stairway, with taper: 0..1, how much the far treads shorten (their lit part; the riser stays): what sells a climb. Default 1 with `top`, 0 without (a flight going down keeps its treads and darkens instead)'),
  hold: z.number().optional().describe('stairway, with taper: row (v, cells) where the flight is as wide as `x` (default `to` with `top`, else `from`: the end that meets the ground you walk)'),
  top: z.object({
    landing: z.number().int().min(2).optional().describe('px of the landing of flagstones between the lip and the first tread; the flagstones also go on up into the level, under the mist (default 6)'),
    face: z.number().int().min(0).optional().describe('px the face of the level above goes down under the lip beside the stair (default 10)'),
    spread: z.number().int().min(0).optional().describe('px the lip and its face run out past each wall, stepped down toward their ends (default 12)'),
    rise: z.number().int().min(2).optional().describe('px above the lip, from `from`, where the level beyond fades into `mist` (default 8)'),
    material: z.string().optional().describe('the stone of the lip and its face: an 8-tone ramp (default the ramp of the stair: its nose, its riser)'),
    mist: z.string().optional().describe('a sky ramp, light last: above the lip the level beyond lost in a checker of its two lightest tones, thicker upward. Without it the ground there is left as it is'),
  }).optional().describe('stairway: the head of a flight that climbs away (north): from `from`, `rise` px of mist, the lip of the level above (a lit stone edge at each side running out past its walls, the face of that level under it in shadowed courses, its shadow at the foot; the walls of the stair end there in a post), a landing of flagstones going on up into the level, and then the treads, so it reads as arriving somewhere higher, not going into the rock'),
  foot: z.object({
    material: z.string().describe('the material of the way that comes to the stair (earth: mottled, flagstones, grass…): the apron is painted in its texture'),
    width: z.number().positive().describe('cells: how wide that way comes; the apron opens from it to the stair with its walls'),
    length: z.number().positive().optional().describe('cells of the apron along the way (default 1.75)'),
    shift: z.number().optional().describe('cells the way comes in east (+) or west (-) of the middle of the stair (default 0)'),
    stones: pt.optional().describe('flagstones: [w, h] px of a stone (default [9, 6])'),
    sill: z.boolean().optional().describe('a sill of worn stones across the end of the stair, where the first step starts (default true)'),
    at: z.enum(['from', 'to']).optional().describe('which end of the flight it lies at: above `from` or below `to` (default `to` with `top`, else `from`: the end that meets the ground you walk)'),
  }).optional().describe('stairway: the foot of the stair, so the way that comes to it does not meet a wider stair all at once: a short apron of the way\'s material opening in a soft ragged diagonal from its width to the stair\'s, and a sill of worn stones across the end of the flight'),
  seed: z.number().int().optional(),
});

export const climbRock = z.object({
  material: z.string().describe('the rock: an 8-tone ramp (the face of the brink); its moss hangs over the rim and creeps up the foot'),
  face: z.number().int().min(0).optional().describe('px of rock face under the first tread (default 2)'),
  grow: z.number().min(0).optional().describe('px the face under the flight grows per step: it rises out of the ground along a ridge (default the riser)'),
  root: z.number().int().min(0).optional().describe('px more the face goes down at its last `every` steps, ragged, to be lost in the mist past the edge of an island (default 0)'),
}).describe('climb: the flight cut into a crest of rock, its steps seen from the front (the tread lit, its nose a px brighter, the riser in shadow with the dark joint at its foot), each one up and to the right of the last; above them the cut rock (`wall` px at the low corner of a tread, a lit rim and moss hanging over it), below them the face of the crest in columns lit from the left, growing step by step, grass creeping up its foot and its shadow below. There is no flank: `half` is half the width of a step (x) and every step is `every` px to the right of the last and `slope` × `every` px higher');

/** The stair of the brink: short flights down (or up) the face of the island, not across its top. */
export const edgeStair = z.object({
  rock: z.string().describe('the rock it is cut into: an 8-tone ramp (the face of the brink); its moss hangs over the rims'),
  legs: z.array(pt).min(1).optional().describe('[steps, shift px] of each flight from the brow on: how many steps, and how many px it starts east (+) or west (-) of the one before (the first: of the threshold). Between two flights a landing as wide as both: the break. Give `legs` or `path`'),
  path: z.array(pt).min(1).optional().describe('curved instead of `legs`: [u, v] in cells the stair passes through after `from`, smoothed into a curve (follow the lip of the brink a cell or so inside it). The treads turn with it (each across the line, the inner end shorter on a bend), the rock at its sides follows it, a landing in flagstones where it turns past `turn`, and its far end is lost as with legs. Up or down by where its last point lies (`dir` is ignored)'),
  turn: z.number().min(0).optional().describe('path: degrees the line turns over a landing and a step at each side for a landing to lie there (default 30)'),
  dir: z.enum(['up', 'down']).optional().describe('up: it climbs north from the brow, outside it, to a height beyond the map; down: it goes south from the brow down the face (default up)'),
  rest: z.number().int().min(4).optional().describe('px of a landing, and of the threshold on the brow (default 10)'),
  cheek: pt.optional().describe('[west, east] px of the rock on each side of the treads, give or take two block by block (default [4, 5])'),
  back: z.number().int().min(0).optional().describe('px of rock behind a landing where the next flight does not go, and at the end of the last flight when there is no `into` (×2) (default 6)'),
  face: z.number().int().min(0).optional().describe('up: px of a face of rock under what juts out past the brow, lost in the mist of `into` (default 0: with a brink ring whose lip goes round the stair, the brink hangs that face)'),
  into: z.string().optional().describe('the mist (a sky ramp, light last, as the brink sea): the last steps darken and the rock past them fades into a fine checker of its four lightest tones, as the veil of a brink, never a mass of cloud (and the foot of `face` too). Without it the far end is lost in rock'),
}).describe('edge: the stair of the brink, as the cliffs of the reference have them: born on a cell of the brow (`from`, the middle of the threshold), it goes up or down by the face in short flights with landings and breaks between them, rock at both sides that eats its edges (blocks of uneven heights and widths, some jutting over the treads, their shadow on them), the steps seen from the front (tread, lit nose, riser in shadow, `worn` wear: treads of uneven length, sunk stones, moss), landings in flagstones, and it is lost in mist and rock. Nothing of it lies over the grass inside the brow; every px is of the flight material, so a brink that skips it leaves it whole');

export const stairwayStep = z.object({
  step: z.literal('stairway'),
  material: z.string().describe('kind of its px'),
  x: span.describe('[from, to) in cells: the treads; a low wall of 2 px at each side'),
  from: z.number().describe('row of the first tread, cells; it goes to the bottom of the picture unless `to` says where it ends'),
  to: z.number().optional().describe('row past the last tread, cells: the flight ends there instead of at the bottom of the picture (a stairway inside a map, between two levels)'),
  middle: z.number().describe('u where the nose turns from lit to mid, cells'),
  every: z.number().int().optional().describe('px of a tread (default 5; 7 with `worn`)'),
  fade: z.number().int().optional().describe('treads before they start to go into the shade, one step each (default 2)'),
  tread: z.array(color).length(6).optional().describe('[nose left, nose right, then the rows 1 to 4] (default túnica luz, pergamino, piedra clara, túnica sombra, piedra, piedra sombra)'),
  wall: z.tuple([color, color, color]).optional().describe('[outer, mid, inner] (default piedra, piedra sombra, túnica oscura)'),
  worn: wornStairs.optional().describe('steps that read as stone: the colors come from the ramp of the material (`tread` and `wall` are not used), `every` defaults to 7, `middle` is not used and past `fade` it goes one step darker every two treads'),
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
export type WornStairs = z.infer<typeof wornStairs>;
export type SprigsStep = z.infer<typeof sprigsStep>;
export type FallenStep = z.infer<typeof fallenStep>;
export type MotesStep = z.infer<typeof motesStep>;
export type OverhangStep = z.infer<typeof overhangStep>;
