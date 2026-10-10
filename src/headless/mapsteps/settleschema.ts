// Schema of the settle step (mapsteps/settle.ts): what stands on the ground —
// a stamp that stands, a rock, a trunk, a post, a piling, the foot of a
// building — sits IN the ground instead of on it. The steps that lay those
// things register them as they paint ("things with a foot"); settle takes the
// ones laid before it and, by rule: sinks the foot, takes the ink out of it,
// lays an occlusion ring around it, grows blades (or pebbles) over its edge,
// and by context wets it (water at its foot: a wet band, foam, a broken
// reflection) or, when asked, mosses it (shaded grass: away from the sun).
// No tuples here: the MCP catalog of this step must stay valid JSON Schema for
// every client (a tuple is an `items` array some of them reject).

import { z } from 'zod';

export const settleKinds = ['stamp', 'stone', 'trunk', 'post', 'piling', 'building'] as const;

const ringOpts = z.object({
  tones: z.number().int().min(1).max(3).optional().describe('tones down the ground material (recipe shade; default 1)'),
  below: z.number().min(0).optional().describe('px it reaches below the foot (default 2; 3 for a thing 18 px high or more)'),
  side: z.number().min(0).optional().describe('px it reaches at the sides of the foot (default 1)'),
  fray: z.number().min(0).max(1).optional().describe('how much its outer edge is bitten away, in bites (default 0.4)'),
});

const tuftsOpts = z.object({
  density: z.number().min(0).optional().describe('blades per 5 px of foot where all around is grass (default 1; scaled by the share of grass around)'),
  pebbles: z.boolean().optional().describe('on earth, sand or stone: a few pebbles at the foot instead (default true)'),
});

const wetOpts = z.object({
  near: z.number().int().min(0).optional().describe('px from the foot where water makes it wet (default 2)'),
  rows: z.number().int().min(0).optional().describe('rows of the wet band up from the foot, give or take one (default 3; 2 under 10 px high)'),
  tones: z.number().int().min(1).optional().describe('tones down the colors of the thing in the band (default 2)'),
  foam: z.boolean().optional().describe('a broken line of foam where it meets the water (default true)'),
  reflect: z.number().int().min(0).optional().describe('rows of the thing mirrored into the water, dithered and broken (default 4; 0: none)'),
  materials: z.array(z.string()).optional().describe('the water materials (default: those with texture water)'),
  layers: z.array(z.string()).optional().describe('layers that can hold water over the ground (a pond the game fills): band, foam and reflection go on that layer'),
});

const mossOpts = z.object({
  odds: z.number().min(0).max(1).optional().describe('share of the thing under moss, give or take (default 0.14)'),
  colors: z.array(z.string()).min(1).optional().describe('moss tones dark to light (default: two tones under the base of the grass, and its base)'),
  shade: z.number().min(0).max(1).optional().describe('share of the grass on its side toward the light that must be in shade (default 0.5)'),
});

export const settleStep = z.object({
  step: z.literal('settle'),
  id: z.string().optional(),
  targets: z.array(z.string()).optional().describe('step ids, step names or kinds to settle (default: all but buildings)'),
  sink: z.number().int().min(0).optional().describe('px the foot sinks (default 1-3 by height, at most a third of it; 0: none)'),
  ink: z.boolean().optional().describe('ink of the lower quarter turns its deepest tone (default true)'),
  ring: z.union([z.literal(false), ringOpts]).optional().describe('the dark ring at its foot (false: none)'),
  tufts: z.union([z.literal(false), tuftsOpts]).optional().describe('blades or pebbles over the edge of its foot (false: none)'),
  wet: z.union([z.literal(false), wetOpts]).optional().describe('water at its foot: wet band, foam, reflection (false: none)'),
  moss: z.union([z.boolean(), mossOpts]).optional().describe('its foot in shaded grass: moss away from the sun (default off)'),
  salt: z.number().int().optional(),
});

export type SettleStep = z.infer<typeof settleStep>;
