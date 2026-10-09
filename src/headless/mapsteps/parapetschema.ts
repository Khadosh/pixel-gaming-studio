// Schema of the parapet step (mapsteps/parapet.ts): a wall seen from above drawn
// as one object from a path, so its top is one band of the same stone in every
// run and turns at the corners without changing.

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);

export const parapetStep = z.object({
  step: z.literal('parapet'),
  id: z.string().optional().describe('its name (its top is kept as the mask of this id)'),
  material: z.string().describe('the stone of the wall (kind of its px); an 8-tone ramp [night, deep, joint of the face, shadow, stone, warm light, light, lit] (e.g. tinta, túnica noche, túnica oscura, piedra sombra, piedra, túnica sombra, piedra clara, pergamino); moss from its moss [dark, light]'),
  path: z.array(pt).min(2).describe('[u, v] in cells: the middle line of the wall, vertex by vertex; each run goes east-west or north-south'),
  closed: z.boolean().optional().describe('the last vertex goes back to the first (a compound)'),
  gaps: z.array(z.tuple([pt, pt])).optional().describe('openings [[u, v], [u, v]] on a run (a gate): the wall stops there and each side ends in a pillar'),
  ends: z.enum(['pillar', 'flush']).optional().describe('the two ends of an open path: a pillar (default) or the band just stopping there, round at its outer corners (a wall that runs into another one: its top meets the other top)'),
  top: z.number().positive().describe('cells: width of the top, the same in every run'),
  face: z.number().min(0).describe('cells: height of the face, hanging under the runs that go east-west (they face south); a north-south run shows only its top and a fine shadow on the side away from the light'),
  light: z.enum(['northwest', 'northeast']).optional().describe('where the light comes from (default northwest): lit edge on that side of the top, the dark joint and the shadow on the other'),
  stones: z.tuple([z.number(), z.number()]).optional().describe('px: the smallest and the biggest stone of the rubble (default [3, 6])'),
  pillar: z.object({
    bulge: z.number().int().min(0).optional().describe('px it stands out of the wall at each side (default 2)'),
    rise: z.number().int().min(0).optional().describe('px it stands higher than the wall (default 3)'),
    length: z.number().int().min(2).optional().describe('px along the wall (default the top + 2 bulges)'),
  }).optional().describe('the pillars at the ends of a gap or of an open path'),
  shadow: z.number().int().min(0).max(4).optional().describe('px of the shadow on the ground beside a north-south run, away from the light, past the sliver of its side (1 or 2 px by stone): up to this, by stretches (default 1)'),
  salt: z.number().int().optional().describe('salt of the stones of the top; the face +7, the edges +13, the moss +17, the tufts +23 (default 1401)'),
  sink: z.object({
    material: z.string().describe('the grass at the foot (kind; tones 3 and 4 of its ramp)'),
    rough: z.number().int().optional().describe('px: tufts every two px rise up to this much over the wave (default 2)'),
    salt: z.number().int().optional().describe('default 1403'),
    on: z.array(z.string()).optional().describe('only where the ground at the foot is of these materials (default everywhere); elsewhere (a paved floor) the foot only darkens the px under it'),
    tufts: z.number().min(0).max(1).optional().describe('odds of a tuft of it eating the edge of the top every 3 px of a north-south run (default 0.3)'),
  }).optional().describe('the foot of each face sinks into the grass (a wavy edge rising over it), and tufts eat the edges of the north-south runs'),
  moss: z.object({
    count: z.number().int().optional().describe('hairs of moss hanging from the top down the faces (default one each 12 px of face)'),
    joints: z.number().min(0).max(1).optional().describe('odds of moss in a joint of the top (default 0.12)'),
    skip: z.tuple([z.number(), z.number()]).optional().describe('[from, to] in cells across: no hanging moss here (a stairway)'),
    colors: z.tuple([z.string(), z.string()]).optional().describe('[light, dark] (default the moss of the material, else hoja, hoja sombra)'),
    salt: z.number().int().optional(),
  }).optional().describe('moss: hairs hanging from the edge of the top down the face, and in some joints of the top'),
});

export type ParapetStep = z.infer<typeof parapetStep>;
