// Schemas of the steps of a snowy mountain (mapsteps/alpine.ts): the snow and
// where it ends, the ledge over a sea of clouds with floating peaks, crags by a
// height field (snow on top, faces in facets, veins of qi), a mountain wall, a
// wall of snowy conifers, trails (earth, trodden snow, wind-swept slabs),
// tracks, frozen ponds, shrubs, the shadows they cast and what lives on top
// (grass tufts, stones poking out, sparkles, spindrift).

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const wave = z.tuple([z.number(), z.number(), z.number()]).describe('[amount, period px, salt]: amount·n1(t / period, salt)');
const width = z.tuple([z.number()]).rest(wave).describe('[base, …waves]: base + Σ amount·n1(i / period, salt) along the curve (i = sample, every 0.25 px)');
const line = z.object({
  v: z.number().describe('row of the line, in cells'),
  cells: z.array(wave).optional().describe('waves in cells (amount × cell), added to v (default [[0.6, 38, 301], [0.3, 12, 302]])'),
  px: z.array(wave).optional().describe('waves in px added after (default [[1.6, 4, 303]])'),
});

export const snowfieldStep = z.object({
  step: z.literal('snowfield'),
  id: z.string().optional().describe('id of its snow line: other steps (ledge, conifers, trail slush) read it'),
  material: z.string().describe('snow ramp [night, deep, shadow, snow, lit]'),
  salt: z.number().int().optional().describe('salt of the surface (default 321)'),
  hollows: pt.optional().describe('[below, above] height noise: violet hollows below, lit crests above'),
  cover: z.object({
    line,
    grass: z.string().describe('the material under the snow (texture patches: its numbers say the field)'),
    bare: z.array(z.number()).length(9).optional()
      .describe('above the line, grass shows where fbm(x/a, y/b + warp·n1(x/c, salt0), salt1, octaves) > above + max(0, line − clear px − y)/fade: [a, b, warp, c, salt0, salt1, octaves, above, clear px] with fade 14 (default [16, 9, 0.4, 5, 317, 311, 2, 0.7, 38.4])'),
    old: z.array(z.number()).length(9).optional()
      .describe('below the line, old snow for `cells` cells where fbm(x/a, y/b + warp·n1(x/c, salt0), salt1, octaves) > above + slope·d: [cells, a, b, warp, c, salt0, salt1, octaves, above] with slope 0.25 (default [4, 22, 11, 0.4, 6, 319, 313, 3, 0.55])'),
    smooth: z.number().int().optional().describe('clean passes of the snow border (default 6)'),
    min: z.number().int().optional().describe('patches of snow smaller than this many px are dropped (default 70)'),
  }).optional().describe('snow only above a wavy line (old patches below); grass under, with a snow lip'),
});

export const ledgeStep = z.object({
  step: z.literal('ledge'),
  material: z.string().describe('material (kind) of the rock face'),
  sea: z.string().describe('material (kind) of what lies beyond, far below (a cloudsea step paints it)'),
  side: z.enum(['l', 'r']).describe('which side of the map ends at the ledge'),
  out: z.number().optional().describe('px beyond the map side where the lip runs (default 4)'),
  wobble: z.array(wave).optional().describe('waves of the lip along y (default [[3.0, 26, 341], [1.4, 9, 342]])'),
  width: z.array(z.number()).length(7).optional().describe('face width [px, fbm amount, fbm px, salt, n1 amount, n1 px, salt]'),
  snow: z.union([z.literal('all'), z.tuple([z.string(), z.number()])]).optional().describe('snowy lip: all, or [snowfield line id, px below it] (default all)'),
  salt: z.number().int().optional().describe('salt of the cracks and spots (default 345)'),
});

export const cloudseaStep = z.object({
  step: z.literal('cloudsea'),
  sea: z.string().describe('material (kind) it paints: what a ledge left beyond it'),
  side: z.enum(['l', 'r']).describe('the margin it fills (left: 0 to the map; right: the map to the end)'),
  salt: z.number().int().optional().describe('salt of the streaks and banks (default 351)'),
  banks: z.number().optional().describe('px between two banks of clouds (default 26)'),
  peaks: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional().describe('floating rock columns [u, v top cells, half width px, height px]'),
  peak_salt: z.number().int().optional().describe('salt of the peaks (default salt + 10)'),
});

const mass = z.array(z.number()).min(5).max(6).describe('[u, v in cells, rx px, ry px, face px, dy px?]: one mass of the crag (its top at v, its foot face px below)');

export const cragStep = z.object({
  step: z.literal('crag'),
  material: z.string().describe('material (kind) of the crag'),
  masses: z.array(mass).min(1).describe('back to front; the highest one rules each spot'),
  salt: z.number().int().describe('salt of its height, facets, snow and veins'),
  snow_cap: z.number().optional().describe('how much of its top keeps snow (0.35 little … 0.75 most; default 0.42)'),
  shadow: z.boolean().optional().describe('it casts a shadow down-right (applied by the next shadows step)'),
  veins: z.number().int().optional().describe('veins of qi climbing the face (faint on the ground, their light on `vein_layer`)'),
  vein_layer: z.string().optional().describe('layer of the light running through the veins (default "vetas")'),
  cleft: z.array(z.number()).min(2).max(4).optional().describe('[u, v cells, rows px, spread]: a dark wedge cut up from v (rows 8, spread 0.45)'),
  face_colors: z.record(z.string(), z.string()).optional().describe('color → color on its faces (a wall of ice: piedra clara → ojo …)'),
  mouth: z.object({
    at: pt.describe('[u, v in cells]: the bottom middle of the mouth'),
    r: pt.describe('[rx, ry] px'),
    rim: z.number().optional().describe('share of the radius where the rim begins (default 0.72)'),
    colors: z.tuple([z.string(), z.string(), z.string()]).optional().describe('[rim left, rim right, inside] (default ["nieve noche", "nieve honda", "túnica noche"])'),
    icicles: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[salt, curve, most]: every 2 px along the top of the mouth, 1 to most px long, lower toward the sides by |dx|^1.6·curve'),
  }).optional().describe('a cave mouth cut into it'),
  icicles: z.number().optional().describe('odds of an icicle at the foot of its face, every 2 px (salt + 1)'),
});

export const mountainStep = z.object({
  step: z.literal('mountain'),
  material: z.string().describe('material (kind) of the mountain wall'),
  side: z.literal('l').describe('the side it rises on (left)'),
  out: z.number().optional().describe('px beyond the map side where it begins (default 3)'),
  wobble: z.array(wave).optional().describe('waves of its edge (default [[2.6, 21, 551], [1.3, 7, 552]])'),
  count: z.number().int().optional().describe('masses (default 60)'),
  salt: z.number().int().optional().describe('salt of where the masses go (default 553); the crag uses salt + 2'),
  depth: pt.optional().describe('px from the edge where it is one and two tones darker (default [26, 60])'),
  on: z.array(z.string()).describe('what beyond the edge turns into the wall, two tones darker (the snow)'),
  shadow: z.boolean().optional().describe('it casts a shadow (default true)'),
});

export const conifersStep = z.object({
  step: z.literal('conifers'),
  material: z.string().describe('material (kind) of the forest'),
  side: z.literal('r').describe('the side of the map the forest stands on (right)'),
  out: z.number().optional().describe('px beyond the map side (default 3)'),
  wobble: z.array(wave).optional().describe('waves of its edge (default [[2.4, 19, 381], [1.2, 7, 382]])'),
  salt: z.number().int().optional().describe('default 383'),
  tries: z.number().int().optional().describe('trees tried (default 900)'),
  snow: z.string().optional().describe('id of a snowfield line: above it the floor of the forest is snow in shadow'),
  layer: z.string().optional().describe('layer where the front trees by the edge go, in front of people (default "copas")'),
});

const curve = z.object({ points: z.array(pt).min(2).describe('[u, v] in cells'), width });

export const trailStep = z.object({
  step: z.literal('trail'),
  id: z.string().optional(),
  material: z.string().describe('material (kind) of the trail'),
  style: z.enum(['earth', 'trodden', 'slabs']).describe('earth | trodden | slabs (see docs/map_recipes.md)'),
  on: z.array(z.string()).describe('materials it can be painted over'),
  curves: z.array(curve).min(1),
  blobs: z.array(z.array(z.number()).min(5).max(7)).optional().describe('[u, v in cells, rx px, ry px, salt, wobble?, fine?] clearings'),
  cover: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional().describe('slabs: [px, px, salt, octaves, above]: snow covers where noise is above'),
  smooth: z.number().int().optional().describe('clean passes (default 2)'),
  salt: z.number().int().describe('salt of its texture'),
  grass: z.string().optional().describe('earth: the grass whose lit lip it leaves (its tone 4)'),
  slush: z.tuple([z.string(), z.number(), z.number(), z.number()]).optional().describe('earth: [snowfield line id, px below, salt, above]: slush entering the snow'),
  prints: z.number().int().optional().describe('trodden: footprints every this many samples along all the curves (default 3)'),
});

export const tracksStep = z.object({
  step: z.literal('tracks'),
  on: z.array(z.string()).describe('materials they mark'),
  curves: z.array(z.array(pt).min(2)).min(1).describe('[u, v] in cells, one after the other'),
  sample: z.number().optional().describe('px between samples of the curve (default 1)'),
  every: z.number().int().optional().describe('a print every this many samples (default 6)'),
  salt: z.number().int().optional(),
  paws: z.boolean().optional().describe('paws in a line (a wolf, a goat): 2 × 2 holes; else boots in pairs (default true)'),
  color: z.string().optional().describe('boots: the color of the print (default "nieve honda")'),
});

export const pondStep = z.object({
  step: z.literal('pond'),
  material: z.string().describe('material (kind) of the ice'),
  on: z.array(z.string()).describe('materials it freezes over'),
  at: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])).min(1).describe('ice ponds [u, v cells, rx px, ry px, salt] with sky streaks and cracks'),
});

export const shrubStep = z.object({
  step: z.literal('shrub'),
  material: z.string().describe('material (kind) it leaves'),
  at: z.array(z.tuple([z.number(), z.number(), z.number()])).min(1).describe('[u, v in cells, salt]: a low juniper of four clumps'),
  ramp: z.array(z.string()).length(5).optional().describe('[glint, light, mid, shadow, line] (default snow on dark green)'),
});

export const shadowsStep = z.object({
  step: z.literal('shadows'),
  on: z.array(z.string()).describe('materials that receive the shadows'),
  decor: z.boolean().optional().describe('game decor casts shadows (pines crown + trunk, big things an oval; default true)'),
  landmarks: z.boolean().optional().describe('landmarks cast too (default false)'),
  skip: z.array(z.string()).optional().describe('sprites that cast nothing'),
  casts: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])).optional().describe('[u, v in cells, rx px, ry px, salt]: scalloped shadows at fixed places'),
});

export const tussocksStep = z.object({
  step: z.literal('tussocks'),
  material: z.string().describe('the grass (its ramp of 5 tones)'),
  layer: z.string().optional().describe('layer of the tips, which sway (default "mechones")'),
  near: z.array(z.string()).describe('materials it gathers by'),
  count: z.number().int().optional().describe('tries (default 9000)'),
  salt: z.number().int().optional().describe('default 491'),
  dry: z.number().optional().describe('odds of a dry tussock, gold stems and sand tips (default 0.3)'),
});

export const stonesStep = z.object({
  step: z.literal('stones'),
  on: z.string().describe('the material (snow) stones poke out of, only on its tone 3'),
  count: z.number().int().optional().describe('tries (default 260)'),
  salt: z.number().int().optional().describe('default 493'),
  odds: z.number().optional().describe('default 0.25'),
});

export const sparklesStep = z.object({
  step: z.literal('sparkles'),
  layer: z.string().optional().describe('default "brillos" (it twinkles)'),
  on: z.array(z.string()).describe('materials where it sparkles'),
  salt: z.number().int(),
  gap: z.number().optional().describe('px between two (default 8)'),
  tries: z.number().int().optional().describe('default 4000'),
  over: z.array(z.string()).optional().describe('colors under a sparkle (default the light snow and ice)'),
  colors: z.array(z.string()).optional().describe('default ["túnica luz", "ojo"]'),
});

export const spindriftStep = z.object({
  step: z.literal('spindrift'),
  layer: z.string().optional().describe('default "viento" (it flows west to east)'),
  on: z.array(z.string()).describe('materials it blows over'),
  salt: z.number().int(),
  count: z.number().int().describe('streaks of 2 to 6 px'),
});

export type SnowfieldStep = z.infer<typeof snowfieldStep>;
export type LedgeStep = z.infer<typeof ledgeStep>;
export type CloudseaStep = z.infer<typeof cloudseaStep>;
export type CragStep = z.infer<typeof cragStep>;
export type MountainStep = z.infer<typeof mountainStep>;
export type ConifersStep = z.infer<typeof conifersStep>;
export type TrailStep = z.infer<typeof trailStep>;
export type TracksStep = z.infer<typeof tracksStep>;
export type PondStep = z.infer<typeof pondStep>;
export type ShrubStep = z.infer<typeof shrubStep>;
export type ShadowsStep = z.infer<typeof shadowsStep>;
export type TussocksStep = z.infer<typeof tussocksStep>;
export type StonesStep = z.infer<typeof stonesStep>;
export type SparklesStep = z.infer<typeof sparklesStep>;
export type SpindriftStep = z.infer<typeof spindriftStep>;
