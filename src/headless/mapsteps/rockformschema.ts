// The schema of a rock's relief (mapsteps/rockform.ts), apart so the recipe schemas import no painter.
import { z } from 'zod';

export const reliefOpts = z.object({
  facets: z.number().int().min(1).max(8).optional().describe('planes of the body, the top one included (default 5; a small rock takes fewer: one per 16 px² past the top). On a crag its lajas are 30 / facets + 2 px wide'),
  cracks: z.number().int().min(0).max(3).optional().describe('fine valleys in the deepest tone (default 1 from 6 px of radius, else 0; none under 4 px)'),
  height: z.number().positive().optional().describe('how much it stands out: 1 a boulder, 0.6 a low slab, 1.5 a tall stone (default 1); on a crag how much each laja turns'),
  seed: z.number().int().optional().describe('salt of its facets and cracks (default the salt of the rock; a crag uses its own salt)'),
}).describe('relief: the body as a height field of facets shaded from the light of the recipe (a plane of light on top, the side toward the sun light, the far side in shadow with a deeper core, a 1 px rim, cracks). The silhouette, the outline and the shadow it casts do not change');
export type Relief = z.infer<typeof reliefOpts>;
