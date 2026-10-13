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
  snow: z.object({
    tones: z.tuple([color, color, color, color]).describe('[lit, mid, shade, crack] of the snow, lit on the same side as the rock'),
    line: z.number().min(0).max(1).optional().describe('the share of the height, from the summit down, under snow (default 0.45): a shoulder lower than the line stays bare'),
    jag: z.number().min(0).optional().describe('how far the line breaks up and down, a share of the height: lower down the gullies between two ribs, higher on the ribs, which run dark up into the snow (default 0.12)'),
    salt: z.number().int().optional().describe('default the salt of the peak + 21'),
  }).optional().describe('peak: its own snow, down to a broken line half way down the slope (instead of a second, narrower peak painted over it)'),
  spire: z.number().min(0).max(0.9).optional().describe('pillar: how much narrower its top is than its foot, a share of its width: a needle (default 0)'),
  mesa: z.number().min(0).max(1.5).optional().describe('pillar: a broad crag with a table on top instead of a rounded column: the top keeps the width of the rock and is an ellipse seen from above, `mesa` × the half width deep, in the cap tones (lit on the west, its rim in shade); pines and a pavilion stand on the table (default 0)'),
  pines: z.object({
    count: range2.describe('[min, max] small pines on the top of each pillar'),
    tones: z.tuple([color, color, color]).describe('[dark, mid, snow] of a pine'),
    height: range2.optional().describe('[min, max] px of a pine (default [5, 8])'),
  }).optional().describe('pillar: little pines standing on its top'),
  over: z.number().min(0).max(1).optional().describe('pillar: the share of its height, from the top down, drawn again over the clouds (the masses, the sea, the wisps): a needle that stands out of the sea instead of being covered (default 0)'),
  pavilion: z.object({
    on: z.array(z.number().int()).describe('the pillars (indices of at) with a pavilion on their top'),
    tones: z.tuple([color, color, color, color, color]).describe('[roof dark, roof lit, snow, posts, floor]'),
    width: z.number().int().optional().describe('px across its eave (default the width of the top + 3, at least 7)'),
    posts: z.number().int().optional().describe('px of posts under the eave (default 3)'),
    ink: z.string().optional().describe('the inside between the posts and the edge of the eave (default roof dark)'),
    finial: z.string().optional().describe('the px on its ridge (default the posts)'),
  }).optional().describe('pillar: a little pavilion standing on the top of some pillars, drawn over the clouds'),
  chains: z.object({
    pairs: z.array(z.tuple([z.number().int(), z.number().int()])).describe('the pillars (indices of at) a chain joins, from top to top'),
    colors: z.tuple([color, color]).describe('[link, glint]'),
    sag: z.number().optional().describe('px it sags at its middle (default 6)'),
    drop: z.number().optional().describe('px under the top (or the eave of a pavilion) where it is tied (default 0)'),
    bells: z.string().optional().describe('a little bell under the middle of each chain, of this color'),
  }).optional().describe('pillar: chains hanging between the tops of two pillars, drawn over the clouds'),
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
    lobes: range2.optional().describe('[min, max] px: the top edge as a row of cloud tops that wide, a notch between two (default none: the bare wavering line, straight on steep sides)'),
    crest: z.number().optional().describe('with lobes: a cumulus on each lobe, this share of its radius, shaded and drifting like the other masses (default none)'),
    swell: z.number().optional().describe('height of a lobe over its width (default 0.3, each one 0.55 to 1.45 of it)'),
    salt: z.number().int().optional().describe('default 4500'),
  }).optional().describe('a floor of near-white cloud below a wavering line, heaped with cumulus'),
  drift: z.object({ layer: z.string(), px: z.number() }).optional().describe('{layer, px}: masses and wisps go to their own layer, which the game moves'),
  within: z.string().optional().describe('mask id (a brink): only inside it, the sky painted again past its foot'),
});

export type CloudscapeStep = z.infer<typeof cloudscapeStep>;
export type CloudscapePlane = z.infer<typeof cloudscapePlane>;
