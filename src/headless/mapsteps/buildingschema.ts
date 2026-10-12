// Schemas of the steps that draw a building seen from above in three quarters
// (mapsteps/building.ts and mapsteps/fence.ts): a roof of tiles with its eaves
// and the shadow they throw on the wall, a stone chimney with its oven mouth,
// fire and smoke, the walls of a house with their side in shadow and their
// shadow on the ground, and a wooden fence along a path. Each one stands alone
// (a courtyard uses a fence, a shed only a roof); `building` puts plinth, walls
// and roof together.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** What a roof is, without where it goes: the building step lays it over its walls. */
export const roofShape = z.object({
  material: z.string().describe('the tiles: a ramp of at least 6 tones [ink, deep, shadow, body, light, lit] (+ a glint), e.g. tinta, basalto hondo, basalto sombra, basalto, basalto claro, basalto luz, niebla'),
  ridge: z.enum(['h', 'v']).optional().describe('the ridge runs east-west (h: the south slope is what shows, the north one hides behind the ridge) or north-south (v: two slopes, the west one lit and the east one in shade) (default h)'),
  hip: z.number().int().min(0).optional().describe('h: px the ridge stops short of each end: the ends are hips (two triangles, the west lit and the east in shade, with a ridge of tiles down each hip line); 0 = gable ends (default 0)'),
  lean: z.enum(['west', 'east']).optional().describe('v: one slope only, falling to that side, its ridge along the other edge (a shed leaning on a wall; no gable)'),
  gable: z.number().int().min(0).optional().describe('v: px high of the gable at the south end (the triangle of wall under the two slopes, framed by its bargeboards); 0 = none (default 0)'),
  pediment: z.object({
    fill: z.array(z.string()).min(2).optional().describe('the triangle: [shadow, body] (default túnica sombra, pergamino)'),
    barge: z.array(z.string()).min(3).optional().describe('the bargeboards: [dark, body, light] (default madera sombra, bermellón, bermellón claro)'),
    strut: z.string().optional().describe('the post down the middle of the triangle (default madera sombra)'),
  }).optional(),
  tile: pt.optional().describe('px of one tile: [across, down the slope] (default [5, 4])'),
  eaves: z.number().int().min(0).optional().describe('px the roof stands out of its rect on every side (default 3)'),
  flare: z.number().int().min(0).optional().describe('h: px the eaves are wider than the ridge at each end (a roof seen from above is wider at the bottom; default a ninth of its height)'),
  upturn: z.number().int().min(0).optional().describe('px the corners of the eaves rise, curving up, and stand out (default 0)'),
  cap: z.number().int().min(2).optional().describe('px of the ridge (its tiles, lit on top, a joint every 6 px; default 3)'),
  crest: z.number().int().min(0).optional().describe('h: px high of an ornament on the middle of the ridge (default 0: none)'),
  hook: z.boolean().optional().describe('h: the horns at the ends of the ridge rise bulging out and curl back in over the ridge (the fish tails of a temple; default false: they sweep out)'),
  ornament: z.object({
    width: z.number().int().min(6).describe('px wide of the mound'),
    colors: z.array(z.string()).length(3).optional().describe('the gold: [dark, body, light] (default bronce, oro, oro claro)'),
    heart: z.string().optional().describe('the middle of the medallion (default bermellón)'),
  }).optional().describe('h, with crest: instead of a pearl, a crest of scrolls `crest` px high (a mound of curls in the tiles with gold beads) and a round medallion of gold on the ridge at its foot (the ridge of a temple)'),
  curl: z.number().int().min(0).optional().describe('px the ends of the ridge rise in a hook (default 3)'),
  trim: z.string().optional().describe('the ridge, the hips and the horns in another ramp of the same tones (a green roof with grey ridges; default the tiles)'),
  sweep: z.number().min(0).max(1).optional().describe('h: how concave the roof is: 0 the eaves run nearly straight and only the corners turn up, the sides and hips straight; 1 the whole line of the eaves curves up from the middle and the sides and hips stay narrow and flare out at the foot (default 0)'),
  tips: z.number().gt(0).max(1).optional().describe('h: the share of each half of the eaves that rises to the corner (`upturn` px at the very corner); the middle runs flat (the eaves of a temple: flat along the front, turning up only at the corners, 0.15 to 0.45); default none: the eaves curve from the middle as `sweep` says'),
  tiphook: z.union([z.number().int().min(0), z.tuple([z.number().int().min(0), z.number().int().min(0)])]).optional().describe('h, with hip: px high of a hook at each front corner of the eaves, where a hip comes down: a thin curl out and up whose top turns back in, in the trim (the corners of a temple or a pavilion); [west, east] gives each its own, 0 none (the corner a wing hides; default none)'),
  back: z.number().int().min(0).optional().describe('h, with hip: px the back corners of the eaves stand lower than the ridge (the top of each hip face falls from the end of the ridge to its back corner, which turns up in a point; a roof seen from above and in front is a pyramid, not a box; default 0)'),
  hipcap: z.number().int().min(3).optional().describe('h: px wide of the roll of tiles down each hip (default 3)'),
  shadow: z.number().int().min(0).optional().describe('px of the band of shadow the eaves throw on what is under them (the wall; default 3)'),
  ribs: z.enum(['fan', 'even']).optional().describe('h: how the columns of tiles of the front fan out toward the eaves (which are wider than the ridge): fan, each px takes the column its middle falls in (a channel can double or skip a row: a zigzag where the hips flare most); even, exactly one dark px per channel per row, the channels leaning smooth (default fan)'),
  lip: z.boolean().optional().describe('h: the row of tile ends along the eaves in the ramp of `trim` (a grey lip along a green roof: where one tier ends over another, the edge reads; default false)'),
  overroof: z.boolean().optional().describe('a tier over another roof on its layer (the upper roof of a pavilion of two tiers, the body of a house over its wings): the band of shadow of its eaves falls on the tiles under it, not only on the ground (default false)'),
  ridgeband: z.object({
    height: z.number().int().min(2).describe('px of the band from the top of the ridge down (at least `cap`)'),
    inset: z.number().int().min(0).optional().describe('px it stops short of each end of the ridge, where the horns rise (default 3)'),
    colors: z.array(z.string()).length(3).optional().describe('the gold beads: [dark, body, light] (default bronce, oro, oro claro)'),
    rise: z.number().int().min(0).optional().describe('px the band climbs over the ridge at its middle, a curl at a time, less and less toward the ends (the crest and its medallion ride on it; default 0: flat, never over the ridge)'),
    reach: z.number().min(0.05).max(1).optional().describe('how far out from the middle it climbs, as a share of each half of the band (default 0.6: the outer curls stay on the ridge)'),
  }).optional().describe('h: the ridge of a temple, ornamented from horn to horn: a band of curls in place of the roll (from the top of the ridge down, never over it), a curl every 8 px with its top rounded and lit, a dark seam between two and a gold bead in each; `crest`/`ornament` and the horns go over it'),
  outline: z.boolean().optional().describe('a line of ink around its top and its ends, where it stands against what is behind it (default true)'),
  moss: z.object({
    odds: z.number().min(0).max(1).describe('the share of the tiles under moss, give or take (an old roof: 0.08 to 0.2)'),
    colors: z.tuple([z.string(), z.string(), z.string()]).optional().describe('[deep, body, lit] (default hoja sombra, prado hondo, prado sombra)'),
    salt: z.number().int().optional().describe('default the salt of the roof + 61'),
  }).optional().describe('moss grown on an old roof: soft patches, more toward the eaves (where the water runs off) than under the ridge, in the channels first; each px takes the moss tone of its tile tone (a lit rib lit moss, a channel deep moss), so the tiles still read under it'),
  thatch: z.union([z.literal(true), z.object({
    course: z.number().int().min(3).optional().describe('px of a course of bundles down the slope (default 5)'),
    fray: z.number().int().min(0).optional().describe('px the lower edge of a course hangs ragged over the next, at most (default 2)'),
    ties: z.number().int().min(0).optional().describe('px between two ties of the ridge roll (default 10; 0 none)'),
  })]).optional().describe('straw instead of tiles, on the same shape: bundles in courses parallel to the eaves, combed down the slope, each course hanging ragged over the next with a dark frayed shadow under it, a thick edge of cut ends along the eaves (a straw tip hanging under some), the ends of a gable rounded over, the ridge a roll bound with ties; the face toward the sun of the recipe one tone up, the one away from it one down. The material is the straw: a ramp [ink, deep, shadow, body, light, lit] (e.g. madera sombra, tierra sombra, bronce, oro, oro claro, arena). No horns, crest nor hooks; moss works as on tiles'),
  layer: z.string().optional().describe('layer of the roof (default the ground; its shadow always goes to the ground)'),
  salt: z.number().int().optional().describe('salt of the tiles (default 1701)'),
});

export const roofStep = roofShape.extend({
  step: z.literal('roof'),
  id: z.string().optional().describe('its name: the mask of its tiles (a chimney casts its shadow on it)'),
  rect: rect.describe('[u, v, w, h] in cells: the roof seen from above without its eaves, from the top of the ridge to the line of the eaves'),
});

/** A column of smoke, without where it starts: a chimney lays it over its flue, the smoke step at a point. */
export const smokeShape = z.object({
  layer: z.string().optional().describe('default "humo"'),
  puffs: z.number().int().min(1).optional().describe('default 5'),
  drift: pt.optional().describe('px [right, up] the last puff is from the top of the flue (default [14, 34])'),
  size: pt.optional().describe('px [first, last] radius of a puff: the column opens as it rises (default [2.5, 8])'),
  fade: z.number().min(0).max(1).optional().describe('the part of the column, from the top, where it thins out: lighter puffs, fewer px, holes, until nothing is left (default 0.6; 0 = whole to the end)'),
  colors: z.array(z.string()).min(3).max(4).optional().describe('[shadow, body, light] or [shadow, body, light, faint] (the last of the high puffs; default niebla sombra, niebla, nube)'),
});

export const chimneyStep = z.object({
  step: z.literal('chimney'),
  id: z.string().optional(),
  material: z.string().describe('its stone: an 8-tone ramp [night, deep, joint, shadow, stone, warm light, light, lit] (the one of a parapet)'),
  at: pt.describe('[u, v] in cells: the middle of its foot on the ground'),
  base: pt.describe('px [width, height] of the body that stands on the ground (the oven)'),
  stack: pt.optional().describe('px [width, height] of the flue over the body (default none: the body is the whole chimney)'),
  shift: z.number().int().optional().describe('px the flue stands off the middle of the body (- west, + east; default 0)'),
  shoulder: z.number().int().min(0).optional().describe('px high of the slope from the top of the body to the flue (default 4)'),
  side: z.number().int().min(0).optional().describe('px of its east side in shade (default 3)'),
  cap: z.number().int().min(2).optional().describe('px of the capstone on the flue, one px wider each side, with its dark opening (default 3)'),
  stones: pt.optional().describe('px [smallest, biggest] stone (default [3, 6]): rubble its sizes; coursed, a block is the biggest + 2 px long, give or take'),
  masonry: z.enum(['coursed', 'rubble']).optional().describe('coursed: squared blocks in rows, the joints of one row off the next (default); rubble: rounded stones packed with dark joints (the one of a parapet)'),
  course: z.number().int().min(3).optional().describe('coursed: px high of a row of blocks, its joint included (default 5)'),
  mouth: z.object({
    size: pt.describe('px [width, height] of the arched opening at the foot of the body'),
    ring: z.number().int().min(1).optional().describe('px of the arch of stones around it (default 2)'),
  }).optional().describe('the oven mouth: an arch of voussoirs, dark inside, the fire on its own layer'),
  fire: z.object({
    layer: z.string().optional().describe('default "fuego" (the game animates it: vivo)'),
    frames: z.number().int().min(1).max(8).optional().describe('drawings of the fire, each on its own layer <layer>_1 … <layer>_n for the game to show in turn (mov "cuadros"): the same bed, tongues that rise and let go of their tips, a heart that beats; 1 = one layer <layer> (default 1)'),
    colors: z.array(z.string()).min(3).max(4).optional().describe('[edge, flame, core] or [edge, flame, core, heart] (the white of the hottest; default bermellón, fuego, fuego luz)'),
    back: z.tuple([z.string(), z.string()]).optional().describe('[top, bottom] the inside of the oven behind the flames, lit by them (default the darkest stone; with frames, madera sombra and bermellón: never black behind a flame)'),
    glow: z.number().int().min(0).optional().describe('px the light of the fire reaches over the ground in front of the mouth, on the fire layer, through the recipe lighten table (default 0)'),
  }).optional(),
  smoke: smokeShape.optional(),
  shadow: z.object({
    px: z.number().int().min(0).optional().describe('px of the shadow beside it, away from the light (default 5)'),
    on: z.array(z.string()).optional().describe('ids of masks (a roof) or materials it falls on (default anything that is not the chimney)'),
    layer: z.string().optional().describe('the layer its shadow on the masks of `on` darkens: the one of the roof (a roof on "techos": "techos"; default the ground, under the roof)'),
  }).optional().describe('the shadow it throws to the east (on the roof and the ground)'),
  layer: z.string().optional().describe('layer of the chimney (default the ground)'),
  stack_layer: z.string().optional().describe('layer of its upper part: the shoulder, the flue and its cap (and the body over `split`), the rest on `layer` (the oven on the ground, people in front of it over it; the flue over people: "techos"; default `layer`)'),
  split: z.number().int().min(0).optional().describe('with stack_layer: px over the foot where the chimney passes to it (default the height of the body)'),
  salt: z.number().int().optional().describe('default 1801'),
});

export const smokeStep = smokeShape.extend({
  step: z.literal('smoke'),
  id: z.string().optional(),
  at: pt.describe('[u, v] in cells: where the column starts (the mouth of an incense burner, a campfire): it rises and drifts from there'),
  salt: z.number().int().optional().describe('default 1851'),
}).describe('a column of smoke on its own layer, from a point: the smoke of a chimney without the chimney (an incense burner, a campfire, a kitchen); the game animates the layer');

export const fenceStep = z.object({
  step: z.literal('fence'),
  id: z.string().optional(),
  material: z.string().describe('the wood: a ramp [dark, shadow, body, light, lit] (e.g. túnica noche, madera sombra, madera, madera clara, arena)'),
  path: z.array(pt).min(2).describe('[u, v] in cells: the foot of the fence, vertex by vertex, at any angle: east-west the rails are bars between the posts; a diagonal (down the hill) leans them, each post at its height; north-south (seen end on) each rail is its edge, an upright line from post to post, the high one on the lit side, the low one on the shaded side'),
  gaps: z.array(z.tuple([pt, pt])).optional().describe('openings [[u, v], [u, v]] on a run (where you walk in): no rail between them, a post at each side'),
  spacing: z.number().positive().optional().describe('px between two posts at most (default 14); a north-south run, foreshortened, puts them closer (0.85 of it, room left for the rails between them); a steep diagonal up to 1.3 times further, so its rails lean between them'),
  post: pt.optional().describe('px [width, height] of a post, under its cap (a px wider each side; default [3, 12])'),
  rails: z.array(z.number()).min(1).optional().describe('px over the foot of each rail (default [4, 9])'),
  rail: z.number().int().min(1).max(3).optional().describe('px thick of a bar (east-west or diagonal): its lit top, its body, its shaded underside, a line of ink under it (default 2)'),
  shadow: z.number().int().min(0).optional().describe('px thick of the shadow posts and rails throw on the ground, down and to the right as a cast step throws it (a px h high falls 0.55·h right and 0.22·h down of its foot); 0 = none (default 1)'),
  on: z.array(z.string()).optional().describe('materials its shadow falls on (default anything that is not the fence)'),
  tufts: z.string().optional().describe('a grass material: tufts at the foot of some posts (tones 3 and 4 of its ramp)'),
  layer: z.string().optional().describe('default the ground'),
  salt: z.number().int().optional().describe('default 1901'),
});

const opening = z.object({
  at: pt.describe('[from, to] in cells from the west side of the building: the front is open there (a workshop): the inside shows'),
  shelf: z.number().int().optional().describe('px under the top of the opening of a shelf with things on it (default 9; 0 = none)'),
  goods: z.array(z.string()).optional().describe('colors of the things on the shelf (default oro, bronce, piedra clara, madera clara)'),
  board: z.boolean().optional().describe('a sign board on the back wall over the shelf, with dark strokes (default false)'),
  bench: z.boolean().optional().describe('a bench across the bottom of the opening (default true)'),
  floor: z.number().int().min(0).optional().describe('px of floor seen inside, between the back wall and the front edge (an open pavilion: you see where you would stand); the plinth runs on under the opening and the floor is its top, flags of its stone in the shade of the roof at the back and lit at the front edge; the back wall stands on it (default 0: no floor, the bays of a workshop)'),
  columns: z.number().int().min(0).optional().describe('free-standing columns inside the opening, evenly spaced, from the floor to the lintel (the bays of a pavilion; default 0)'),
  layer: z.string().optional().describe('with a floor: the front of the opening (its two posts, its free columns and the lintel over them) on this layer, the back wall and the floor behind them on the ground: whoever walks the floor passes behind the columns (an open pavilion you walk through: "techos"; default the ground)'),
});

export const buildingStep = z.object({
  step: z.literal('building'),
  id: z.string().optional().describe('its name: the mask of the whole building (walls and roof); the roof is "<id> roof"'),
  rect: rect.describe('[u, v, w, h] in cells: the building seen from above, from the top of its ridge to the foot of its front wall (the side in shade and the eaves stand out of it)'),
  wall: z.number().int().positive().describe('px high of the front wall, from the foot to the line of the eaves'),
  material: z.string().describe('the plaster of the walls: a ramp [deep, shadow, body, light] (e.g. piedra sombra, túnica sombra, pergamino, túnica luz)'),
  frame: z.string().describe('the timber: a ramp [dark, shadow, body, light, lit] (posts, beams, sills)'),
  stone: z.string().optional().describe('the plinth: an 8-tone stone ramp (default none: no plinth)'),
  plinth: z.number().int().min(0).optional().describe('px high of the stone plinth at the foot of the walls (default 4 with a stone)'),
  bays: z.number().int().positive().optional().describe('px between two posts of the front (default 24)'),
  rail: z.number().int().min(0).optional().describe('px under the top of the wall of a beam across the front (default 0: none)'),
  side: z.number().int().min(0).optional().describe('px of its east wall, in shade, receding (default 6)'),
  open: z.array(opening).optional(),
  windows: z.array(rect).optional().describe('[x, y, w, h] px from the top-left corner of the front wall: lattice windows'),
  panes: z.string().optional().describe('the paper of the lattice windows: a ramp [shaded, lit] (default the two light tones of the plaster); with a dark wall (wood) the paper stays light'),
  doors: z.array(pt).optional().describe('[from, to] in cells from the west side: a door of planks under a dark lintel; 10 px wide or more it is a double door (two leaves with lit stiles, sunk panels, a seam and two rings)'),
  stoop: z.object({
    at: pt.describe('[from, to] in cells from the west side: the width of the top tread (the door it leads to)'),
    treads: z.number().int().min(1).max(8).optional().describe('how many (default 3)'),
    tread: z.number().int().min(3).optional().describe('px of a tread from front to back, its riser included (default 6)'),
    riser: z.number().int().min(1).optional().describe('px of the riser under each nose, in shadow (default 2)'),
    spread: z.number().int().min(0).optional().describe('px each tread is wider than the one above, each side (default 1)'),
    cheek: z.number().int().min(0).optional().describe('px of the stone block at each side of the flight, as high as the plinth at the top and stepping down with the treads (default 5; 0 = none)'),
    material: z.string().optional().describe('its stone: an 8-tone ramp (default the plinth stone)'),
  }).optional().describe('steps of stone down from the plinth, in front of the wall: lit noses, risers in shadow, blocks with staggered joints, a cheek block each side, its shadow to the south-east'),
  boards: z.union([z.literal(true), z.object({
    width: z.number().int().min(3).optional().describe('px of a board, its seam included (default 4)'),
    weathered: z.number().min(0).max(1).optional().describe('odds a board is a tone darker than the rest (default 0.3)'),
  })]).optional().describe('the wall between the posts in upright boards of `material` instead of plaster (an old shed, a house of grey wood): each board its lit edge to the west, its body, a dark seam to the east, some a tone off, a knot now and then, the foot dirtier (default none: plaster)'),
  pillars: z.object({
    width: z.number().int().min(3).describe('px wide of each post (3 is the post of a plain wall)'),
    shade: z.number().int().min(0).optional().describe('px of the band of shade each one throws on the wall to its east (default 2)'),
    base: z.union([z.literal(true), z.string()]).optional().describe('a block of light stone under each one, on the plinth, a px wider on each side: true the stone of the plinth, or a material (an 8-tone ramp; default none)'),
    base_height: z.number().int().min(2).optional().describe('px high of the block (default 4)'),
    brackets: z.number().int().min(2).optional().describe('px of a beam under the lintel, from post to post: a dark band with the lit heads of the brackets every 6 px (default none)'),
  }).optional().describe('the posts of the front stand off the wall (a temple, a hall): thicker, with an ink line on their east edge, a band of shade on the wall beside them and a stone block at their foot; doors and windows keep their places'),
  door_lattice: pt.optional().describe('[from, high] px under the top of the wall: the upper panels of a double door are lattice there (the doors of a temple: bars of its wood over paper, like the windows; default none)'),
  door: z.string().optional().describe('the wood of the doors: a ramp [dark, shadow, body, light, lit] (default the frame)'),
  shadow: z.object({
    offset: pt.optional().describe('px [right, down] the shadow of the building stands off it (default [8, 3])'),
    on: z.array(z.string()).optional().describe('materials it falls on (default anything that is not the building)'),
  }).optional().describe('its shadow on the ground, to the south-east'),
  roof: roofShape.optional().describe('the roof over the walls (default none)'),
  salt: z.number().int().optional().describe('default 1601'),
});

export type RoofShape = z.infer<typeof roofShape>;
export type RoofStep = z.infer<typeof roofStep>;
export type ChimneyStep = z.infer<typeof chimneyStep>;
export type SmokeShape = z.infer<typeof smokeShape>;
export type SmokeStep = z.infer<typeof smokeStep>;
export type FenceStep = z.infer<typeof fenceStep>;
export type BuildingStep = z.infer<typeof buildingStep>;

/** A kind of plant in a bed: what grows in its rows. */
const plantKind = z.object({
  shape: z.enum(['leafy', 'sprout', 'flower', 'tall']).describe('leafy: a round head of leaves (a cabbage, a lettuce), lit on its upper-left; sprout: a stem with two leaves in a V; flower: a stem, two leaves and a head of color; tall: a clump higher than wide (herbs, beans)'),
  colors: z.array(z.string()).min(3).max(4).optional().describe('the leaves: [dark, body, light] or [dark, body, light, glint] (default prado hondo, prado, prado claro)'),
  bloom: z.array(z.string()).min(2).max(3).optional().describe('flower: the head [shadow, body] or [shadow, body, light] (default flor sombra, flor, flor clara)'),
  spacing: z.number().int().min(2).optional().describe('px between two plants of a row, give or take one (default 6; 4 sprout)'),
  size: z.number().min(1).max(4).optional().describe('how big a plant grows (1: the small heads; more: a mound of leaves `size` times as big, its edge in scallops, leaf by leaf, a flower with blooms over its top; default 1); give it more `spacing` and `rows`'),
});

export const bedsStep = z.object({
  step: z.literal('beds'),
  id: z.string().optional().describe('its name: the mask of every bed (boards and soil)'),
  soil: z.string().describe('the earth inside: a ramp [deep, dark, body, light] (dark loam, darker than a path)'),
  frame: z.string().describe('the boards: a ramp [dark, shadow, body, light, lit] (the wood of a fence)'),
  beds: z.array(z.union([rect, z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])])).min(1)
    .describe('[u, v, w, h] in cells, the bed seen from above with its front board, or [u, v, w, h, k]: k the index of its kind in `plants` (default the beds take the kinds in turn)'),
  plants: z.array(plantKind).min(1).optional().describe('what grows in them (default one kind, leafy)'),
  rows: z.number().int().min(3).optional().describe('px from one row of plants to the next, a furrow between two (default 5)'),
  board: z.number().int().min(1).optional().describe('px of the boards seen from above (default 2)'),
  overflow: z.number().int().min(0).optional().describe('px the plants spill out of the bed: the rows start that much over the back board and run that far past the side ones (half of it over the front one); the plants of all the beds are laid after all the boards, the nearer ones over the farther (a garden that grows over its frames; default 0)'),
  rise: z.number().int().min(0).optional().describe('px of the front board standing out of the ground, its face toward the south (default 3)'),
  shadow: z.object({
    offset: pt.optional().describe('px [right, down] (default [4, 3]); two tones down the near half, one the far half'),
    on: z.array(z.string()).optional().describe('materials it falls on (default anything that is not a bed)'),
  }).optional().describe('the shadow of a bed (boards and plants) on the ground, to the south-east'),
  layer: z.string().optional().describe('default the ground'),
  salt: z.number().int().optional().describe('default 2101'),
});
export type BedsStep = z.infer<typeof bedsStep>;

/** What a stall sells: a kind of goods laid on its counter. */
const goodsKind = z.object({
  kind: z.enum(['fruit', 'cloth', 'pottery', 'herbs', 'baskets']).describe('fruit: a basket heaped with round fruit; cloth: folded bolts stacked two or three high; pottery: jars and bowls with a lit shoulder; herbs: bunches of leaves; baskets: empty woven baskets with a lit rim'),
  colors: z.array(z.array(z.string()).length(3)).min(1).optional().describe('[dark, body, light] ramps the goods take in turn (default by kind)'),
});

export const stallStep = z.object({
  step: z.literal('stall'),
  id: z.string().optional().describe('its name: the mask of its counter, posts and goods (`<id>`) and of its awning (`<id> awning`)'),
  rect: rect.describe('[u, v, w, h] in cells: the ground between the posts, the back ones on row v and the front ones on v + h, where the front of the counter stands'),
  cloth: z.string().describe('the awning: a ramp of 6 tones [ink, deep, shadow, body, light, lit] (red: tinta, madera sombra, bermellón, bermellón claro, piel sombra, piel)'),
  wood: z.string().describe('posts and counter: a ramp [dark, shadow, body, light, lit] (the wood of a fence)'),
  posts: z.union([z.literal(2), z.literal(4)]).optional().describe('2: only the front posts (the back of the awning tied to something behind); 4: back ones too (default 4)'),
  post: z.number().int().min(2).max(5).optional().describe('px wide of a post (default 3)'),
  height: pt.optional().describe('px [front, back] the awning stands over the ground at the front and back posts: higher at the back, so it slopes toward the front (default [34, 38])'),
  eaves: z.number().int().min(0).optional().describe('px the cloth stands out of the posts east and west (default 3)'),
  flare: z.number().min(0).optional().describe('px the hem is wider than the ridge at each end: seen from above the cloth opens toward the front (default 3)'),
  peak: z.number().int().min(0).optional().describe('px the posts stand out over the cloth, a knob of ink on top: the back ones over the ridge, the front ones over the corners of the hem (default 4)'),
  overhang: z.number().int().min(0).optional().describe('px the cloth runs on past the front posts, down the slope (default 2)'),
  sag: z.number().min(0).optional().describe('px the hem hangs lower in the middle than at the posts: the cloth sags between them (default 3)'),
  upturn: z.number().min(0).optional().describe('px the corners of the hem rise (default 4)'),
  valance: z.number().int().min(0).optional().describe('px of the hanging strip along the front, in shadow, its foot scalloped (default 4)'),
  panels: z.number().int().min(1).optional().describe('how many widths of cloth sewn side by side: a seam runs down the slope between two, its crease in shadow and its lip lit on the west (default 3)'),
  folds: z.boolean().optional().describe('a crease from each front post up toward the middle of the ridge: the cloth pulled at its corners sags between them (default true)'),
  stripes: z.object({
    cloth: z.string().describe('the second cloth: a ramp of 6 tones like `cloth` (white: tinta, piedra sombra, túnica sombra, pergamino, túnica luz, nube)'),
    width: z.number().int().min(1).optional().describe('px of a stripe across the ridge (default 3); they widen with the cloth toward the hem'),
  }).optional().describe('stripes: `cloth` and this one in turn'),
  counter: z.object({
    depth: z.number().int().min(2).optional().describe('px of its top seen from above (default 8)'),
    rise: z.number().int().min(2).optional().describe('px of its front face (default 9)'),
    inset: z.number().int().optional().describe('px it stands in from the outer side of the posts, each side (default 1)'),
  }).optional().describe('the counter along the front, between the front posts: its top of boards, its face of planks'),
  shelf: z.boolean().optional().describe('a shelf at the back, under the awning, with more of the goods on it, a tone down in its shade (default true when there are goods); with `layer` it goes on the awning\'s layer, with the back posts, so whoever walks behind the stall stays behind them'),
  goods: z.array(goodsKind).optional().describe('what is on the counter, left to right, the kinds in turn (default none)'),
  heap: z.number().int().min(1).max(3).optional().describe('rows of goods on the counter: the ones behind half an item over and higher, so the counter is heaped; with 2 or more the shelf is heaped too (default 1)'),
  under: z.number().int().min(0).optional().describe('px of the band of shade under the hem, on the counter, the goods and the posts (default 3)'),
  shadow: z.object({
    offset: pt.optional().describe('px [right, down] the shadow of the awning falls off it on the ground (default [10, 5])'),
    on: z.array(z.string()).optional().describe('materials it falls on (default anything that is not the stall)'),
  }).optional().describe('the shadow of the awning on the ground: two tones down inside, one at its frayed edge'),
  layer: z.string().optional().describe('layer of the awning (a roof: people walk under it; default the ground); counter, posts and goods stay on the ground'),
  covered: z.object({
    cloth: z.string().describe('the tarp: a ramp of 6 tones like `cloth` [ink, deep, shadow, body, light, lit]; its edge is its deep tone, never the ink (canvas: tinta, piedra sombra, túnica sombra, pergamino, túnica luz, nube)'),
    layer: z.string().optional().describe('layer of the tarp (default the ground: a stall always covered); on a layer of its own the stall shows its goods by day and the tarp is laid over them when the game shows that layer (at night); then the goods on the shelf go on the ground, under the tarp (its board stays up), and the awning still covers them'),
    drop: z.number().int().min(1).optional().describe('px the tarp hangs down the front face of the counter (default 4)'),
    ropes: z.number().int().min(0).optional().describe('ropes tied across the tarp, front to back, in the dark of the wood (default 2)'),
  }).optional().describe('the stall shut: a tarp laid over the counter and its goods, draped over their heaps (lit on the west of each heap, in shade on the east, a crease between two), turned over the front lip and hanging down the face, under the front posts and in the shade of the hem'),
  salt: z.number().int().optional().describe('default 2301'),
});
export type StallStep = z.infer<typeof stallStep>;
