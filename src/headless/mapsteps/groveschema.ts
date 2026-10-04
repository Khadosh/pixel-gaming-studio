// Schemas of the steps of a grove (mapsteps/grove.ts): a walkable floor carved
// out of a thicket by the game grid, the rock that leans on it, what lies inside
// the thicket, canes drawn one by one in front of people, the shadows the
// thicket casts and the beams of light that fall between the canes.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const thicketStep = z.object({
  step: z.literal('thicket'),
  id: z.string().optional().describe('id of the floor: other steps read its mask and its distance to the thicket'),
  material: z.string().describe('the floor (moss, leaf litter): usually texture "patches"'),
  dark: z.string().describe('the thicket: its first tone fills everything that is not floor'),
  open: z.array(rect).optional().describe('[u, v, w, h] in cells walkable even if they are walls or margin (a clearing on a wall cell, the trail out of the map)'),
  edge: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[amount, px, salt, octaves] of each noise added to the smoothed grid where the floor ends (default [[0.30, 11, 201, 3], [0.12, 4, 202, 2]])'),
  smooth: z.number().int().optional().describe('passes of the clean of its border (default 3)'),
  clearings: z.array(z.array(z.number()).min(6).max(7)).optional()
    .describe('[u, v in cells, r px, squash, wobble px, salt, lobes?]: round clearings added to the floor (r + wobble·n1(angle·lobes), lobes default 2)'),
  damp: pt.nullable().optional().describe('[px, tone]: this close to the thicket the floor is never lighter than this tone of its ramp (damp moss) (default [3, 2]; null none)'),
});

export const outcropStep = z.object({
  step: z.literal('outcrop'),
  id: z.string().optional(),
  material: z.string().describe('an 8-tone stone ramp with its moss'),
  masses: z.array(z.array(z.number()).min(4).max(5)).min(1).describe('[u, v in cells, rx px, ry px, salt?]: the ellipses of the rock (salt default trunc(u·10))'),
  wobble: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[amount, lobes, phase, fine amount, fine lobes, fine salt] of its border (default [0.1, 1.6, 3, 0.05, 7, 5])'),
  floor: z.tuple([z.string(), z.number()]).optional().describe('[id of a thicket floor, v in cells]: below this row the rock leaves the floor free'),
  face: z.number().int().optional().describe('px of its south face (default 9)'),
  vein: pt.optional().describe('[salt, odds]: dark veins down the face (default [241, 0.18])'),
  top: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[salt, px along the light, px across, above: mid, above: shadow (else dark)] of the streaks of its top (default [242, 9, 3, 0.6, 0.32])'),
  rim: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[salt, px, above]: moss on the lit rim of the top (default [243, 4, 0.42])'),
  rim_colors: z.tuple([z.string(), z.string()]).optional().describe('[on the lit edge, inside] (default [moss[1], moss[0]])'),
  boulders: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u, v in cells, rx px, ry px]: big stones with moss piled on top, back to front, each with a dark seat on the rock'),
  salt: z.number().int().optional().describe('salt of the first boulder (default 960)'),
});

export const undergrowthStep = z.object({
  step: z.literal('undergrowth'),
  thicket: z.string().describe('id of the thicket step'),
  mottle: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).optional()
    .describe('[px, salt, edge px, above near the edge, above anywhere]: leaves near the border, dark depths elsewhere (default [6, 281, 2, 0.5, 0.72])'),
  colors: z.tuple([z.string(), z.string()]).optional().describe('[near the border, the depths] (default ["hoja sombra", "pelo oscuro"])'),
  dashes: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[tries, salt, odds of the first color]: fallen leaves, two px and a third below (default [1600, 282, 0.6])'),
  dash_colors: z.tuple([z.string(), z.string()]).optional().describe('default ["bronce", "pelo oscuro"]'),
});

const ramp5 = z.array(z.string()).length(5);
const ramp3 = z.array(z.string()).length(3);

export const canesStep = z.object({
  step: z.literal('canes'),
  thicket: z.string().describe('id of the thicket step: canes are born in its wall cells (and the margin) and rise'),
  layer: z.string().optional().describe('layer of the canes (default "canes": in front of people, still)'),
  leaves: z.tuple([z.string(), z.string()]).optional().describe('the two layers of leaves, which sway out of step (default ["leaves", "leaves_b"])'),
  ramps: z.array(ramp5).length(4).optional().describe('by depth (front to deep): [light, mid, shadow, node, joint]'),
  leaf_ramps: z.array(ramp3).length(4).optional().describe('by depth: [base of a leaf, its tip, its shadow below]'),
  per_cell: pt.optional().describe('[canes per wall cell of the map, per cell of the margin] (default [3, 2])'),
  clear: z.array(pt).optional().describe('[u, v] cells where someone stands (people, an exit): no cane covers them; the decor of the game is kept clear too'),
  skip: z.array(z.string()).optional().describe('decor prefixes that do not keep canes away (lights, fireflies)'),
  avoid: z.array(z.string()).optional().describe('materials canes never cover above their root (a rock)'),
  path: z.string().optional().describe('id of a trail: on a cell it crosses the canes stay low'),
  foot: z.tuple([z.string(), z.string()]).optional().describe('[left of the foot, right] the shadow at the foot of a cane (default ["túnica noche", "tinta"])'),
  tall: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[odds, px, salt]: on some walkable cells behind a root the canes pass in front this many px (default [0.45, 9, 291])'),
  height: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[px, + up to px, + px when deeper] (default [30, 22, 10])'),
  salts: z.object({ root: z.number(), row: z.number(), thin: z.number(), cane: z.number(), leaf: z.number(), wiggle: z.number() }).partial().optional()
    .describe('salts of where roots fall (301, 302), of thinning the deep ones (363), of each cane (311), of its leaves (321) and of the low edge behind (292)'),
});

export const shadeStep = z.object({
  step: z.literal('shade'),
  thicket: z.string().describe('id of the thicket step whose border casts'),
  casters: z.array(z.string()).optional().describe('materials that also cast (a rock)'),
  on: z.array(z.string()).describe('materials that receive the shadows'),
  reach: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[px, + px of noise, noise px, salt] (default [4, 5, 7, 331])'),
  slope: z.number().optional().describe('px down per px across of the light (default 0.8)'),
  deep: z.number().optional().describe('this close to what casts, two tones darker (default 2)'),
  casts: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('[u, v in cells, rx px, ry px, salt]: soft oval shadows (of the landmarks), one tone each, stacking'),
});

export const beamsStep = z.object({
  step: z.literal('beams'),
  thicket: z.string().describe('id of the thicket step: the light only falls on its floor (not on the faces)'),
  layer: z.string().optional().describe('layer of the light (default "beams"; the game shows it only by day)'),
  dust: z.string().optional().describe('layer of the motes of dust in the beams (default "dust")'),
  beams: z.array(z.tuple([z.number(), z.number(), z.number()])).min(1).describe('[u, v in cells, width px]: the middle of each beam'),
  dir: pt.optional().describe('the direction the light goes (default [0.78, 0.62]: down to the right)'),
  length: pt.optional().describe('[half length px, px of its taper] (default [34, 36])'),
  wobble: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[px, px along, salt (+ index)] of its sides (default [1.4, 6, 351])'),
  mottle: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('[px across, px down, salt (+ index), below]: the leaves above cut it in spots (default [5, 4, 352, 0.36])'),
  core: pt.optional().describe('[share of the half width, half length px] where it is two tones lighter (default [0.45, 22])'),
  motes: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[odds, salt, px up] of a mote in the core (default [0.006, 353, 3])'),
  mote_colors: z.tuple([z.string(), z.string()]).optional().describe('[60 %, the rest] (default ["oro claro", "túnica luz"])'),
  dust_on: z.array(z.string()).optional().describe('materials over which motes float (default all)'),
});

export type ThicketStep = z.infer<typeof thicketStep>;
export type OutcropStep = z.infer<typeof outcropStep>;
export type UndergrowthStep = z.infer<typeof undergrowthStep>;
export type CanesStep = z.infer<typeof canesStep>;
export type ShadeStep = z.infer<typeof shadeStep>;
export type BeamsStep = z.infer<typeof beamsStep>;
