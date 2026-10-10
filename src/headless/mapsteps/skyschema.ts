// Schema of the `cloudscape` step (mapsteps/sky.ts): the sky around an island
// seen from above — a deep sky in soft patches, ranges of far peaks fading into
// the haze plane after plane, masses of cumulus of very different sizes (a few
// big, many small) with a lit crest and a cold belly, and thin wisps between.

import { z } from 'zod';

const color = z.string();
const range2 = z.tuple([z.number(), z.number()]);

export const cloudscapePlane = z.object({
  shape: z.enum(['pillar', 'peak']).optional().describe('pillar: a karst column in blocks, rounded on top (default); peak: a far mountain, a summit and its shoulders with ribs running down'),
  tones: z.tuple([color, color, color, color]).describe('[lit, mid, shade, crack] of the rock; a far plane is pale and low in contrast'),
  cap: z.tuple([color, color, color]).optional().describe('[lit, mid, shade] of the green on top (and hanging from it); none: bare rock'),
  count: z.number().int().optional().describe('peaks drawn at random over the picture (default 0)'),
  at: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional()
    .describe('peaks at given places: [u, v in cells (the foot), half width px, height px]'),
  width: range2.optional().describe('[min, max] half width px of a random peak (default [5, 12])'),
  height: range2.optional().describe('[min, max] height px of a random peak (default [30, 70])'),
  feet: z.number().optional().describe('cloud masses at the foot of each peak, radius × its half width (default 1.4; 0: none)'),
  salt: z.number().int().optional().describe('default 4100 + the index of the plane'),
});

export const cloudscapeStep = z.object({
  step: z.literal('cloudscape'),
  material: z.string().describe('kind of every px; its ramp gives the sky [deep, mid, light]'),
  clouds: z.tuple([color, color, color, color]).optional().describe('cloud tones [crest, mid, belly, deep belly] (default ramp 6, 5, 4, 3)'),
  haze: z.tuple([z.number(), z.number(), z.number()]).optional().describe('[px across, salt, deep]: sky mid tone, deep tone in soft patches'),
  planes: z.array(cloudscapePlane).optional().describe('ranges of peaks, far to near: each one over the clouds of the one before'),
  masses: z.object({
    count: z.number().int().describe('masses of cloud'),
    size: range2.optional().describe('[min, max] radius px (default [5, 34])'),
    skew: z.number().optional().describe('how much more often the small ones come (radius = min·(max/min)^(u^skew); default 2.4)'),
    salt: z.number().int().optional().describe('default 4200'),
    wisps: z.number().optional().describe('odds of thin wisps trailing from the sides of a mass (default 0.6)'),
    top: z.number().optional().describe('no mass with its centre above this px: what sky shows up there is the haze of the horizon, not loose clouds (default none)'),
  }).optional().describe('cumulus masses: lumps lit upper-left, cold belly, back to front'),
  wisps: z.object({
    count: z.number().int(),
    length: range2.optional().describe('[min, max] px (default [8, 30])'),
    salt: z.number().int().optional().describe('default 4300'),
    rows: range2.optional().describe('[min, max] rows of a streak (default [1, 1]): with more than one (or with soft), torn veils lying between the masses — the middle row longest, the ends frayed, only over open sky'),
  }).optional().describe('thin streaks of cloud one px tall, broken, in the open sky'),
  soft: z.object({
    rim: z.tuple([color, color]).optional().describe('[near, far]: the band where a cloud meets the sky, 1 px of near (a few gaps) and 1 px of far in a fine checker (default the light tone of the sky, both)'),
    lumps: z.number().optional().describe('little lumps on the tops of a mass, × (default 1; less: a smoother crest, fewer regular scallops)'),
    ragged: z.number().optional().describe('the outline of a mass wobbles slowly this much of its radius (default 0)'),
    bright: z.number().optional().describe('more of a mass in the light: mostly crest and mid with a thin cold belly (default 0)'),
    smooth: z.number().int().optional().describe('passes of softening of the domes the light reads (default 2; more: broad soft shading instead of crumpled facets)'),
  }).optional().describe('soft masses: edges melt into the sky, a less scalloped crest'),
  horizon: z.tuple([z.number(), z.number()]).or(z.tuple([z.number(), z.number(), z.number()])).optional()
    .describe('[top, bottom px, salt?]: a wavering haze band behind the masses'),
  sea: z.object({
    top: z.number().describe('px: the line where the sea of cloud begins, wavering slowly; below it the picture is cloud'),
    rise: z.number().optional().describe('px the line climbs at the left and right edges, as a parabola (default 0): the sea wraps the low sides'),
    holes: z.number().optional().describe('share of the sea where the sky shows through, in small gaps (default 0.06; 0: none)'),
    count: z.number().int().optional().describe('cumulus masses along the line and inside the sea, bunched near the line (default one per 8 px across)'),
    size: range2.optional().describe('[min, max] radius px of those masses (default [10, 30])'),
    salt: z.number().int().optional().describe('default 4500'),
  }).optional().describe('a floor of near-white cloud below a wavering line, heaped with cumulus'),
  drift: z.object({ layer: z.string(), px: z.number() }).optional().describe('{layer, px}: masses and wisps go to their own layer, which the game moves'),
  within: z.string().optional().describe('mask id (a brink): only inside it, the sky painted again past its foot'),
});

export type CloudscapeStep = z.infer<typeof cloudscapeStep>;
export type CloudscapePlane = z.infer<typeof cloudscapePlane>;
