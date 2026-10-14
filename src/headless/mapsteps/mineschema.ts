// Schemas of the steps of a mine (mapsteps/mine.ts), on top of a cavern: timber frames against the south faces, a
// burrow dug into a face with its spoil, and lumps of ore on the floor (The Unwritten Dao, #400: the iron vein).

import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const color = z.string();

export const timbersStep = z.object({
  step: z.literal('timbers'),
  id: z.string().optional(),
  at: z.array(pt).min(1).describe('[u, v]: the middle of each frame, u in cells (fractions allowed), v the wall cell of the face'),
  span: z.number().positive().optional().describe('cells between the two posts, outside to outside (default 1.25)'),
  tones: z.tuple([color, color, color]).optional().describe('[lit, mid, shadow] of the wood (default madera clara, madera, madera sombra)'),
  iron: z.tuple([color, color]).optional().describe('[lit, dark] of the brackets (default bronce, pelo oscuro)'),
});

export const burrowStep = z.object({
  step: z.literal('burrow'),
  id: z.string().optional(),
  at: pt.describe('[u, v]: u the middle of the mouth in cells, v the wall cell of the face it is dug into'),
  r: pt.optional().describe('[half width, height] px of the mouth (default [6, 9])'),
  spoil: pt.optional().describe('[rx, ry] px of the dug earth fanned on the floor (default [14, 7])'),
  scrapes: z.number().int().min(0).optional().describe('claw marks peeled in the face around it (default 3)'),
  salt: z.number().int().optional(),
});

export const oreStep = z.object({
  step: z.literal('ore'),
  id: z.string().optional(),
  lumps: z.array(z.tuple([z.number(), z.number(), z.number()])).min(1).describe('[u, v, r px]: lumps of ore on the floor'),
  stone: z.tuple([color, color, color]).optional().describe('[lit, mid, shadow] of the rock (default piedra, piedra sombra, pelo claro)'),
  tones: z.tuple([color, color, color]).optional().describe('[lit, rust, dark] of the ore (default fuego, piel sombra, castaño)'),
  glints: z.string().optional().describe('layer of the twinkle (default "brillos")'),
  salt: z.number().int().optional(),
});

export type TimbersStep = z.infer<typeof timbersStep>;
export type BurrowStep = z.infer<typeof burrowStep>;
export type OreStep = z.infer<typeof oreStep>;
