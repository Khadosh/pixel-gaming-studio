// Foam that moves (unwritten-dao #356: «los sprites del splash que no se muevan y estén estáticos con el agua en
// movimiento se siente raro»). The falls (`cataract`, `spill`) paint their foam, spray and mist on the ground unless they
// are given a `foam` layer; with one, the ground keeps a calmer foam under (the white a tone down, holes of the shallow
// water in it) and the churn goes to that layer, which the game makes twinkle or flow: the spray past the edges and the
// mist go to the layer alone, over the rock as it was.

import { h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';

export interface FoamPainter {
  /** foam over the water: on the ground, or calmer on the ground and its churn on the layer */
  foam(x: number, y: number, c: string, kind: string | null): void;
  /** spray and mist over whatever is there: on the ground, or on the layer alone */
  spray(x: number, y: number, c: string): void;
  /** at the end of the step: the layer gets what the step did not paint over afterwards (as on the ground) */
  flush(): void;
}

export function foamPainter(ctx: Ctx, layer: string | undefined, material: string, salt: number): FoamPainter {
  const g = ctx.ground, live = layer ? ctx.layer(layer) : null;
  const t = (i: number) => ctx.tone(material, i);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < ctx.W && y < ctx.H;
  // what goes to the layer waits for the end of the step: a px the step paints over later (the sheet of the next drop,
  // the rim of a basin) loses its foam, as it would on the ground
  const later = new Map<number, [string, string | null]>();
  const defer = (x: number, y: number, c: string) => later.set(y * ctx.W + x, [c, g.get(x, y)]);
  return {
    foam(x, y, c, kind) {
      x = Math.floor(x); y = Math.floor(y);
      if (!inside(x, y)) return;
      // the calm foam under the churn: the glint a foam, a share of the foam the shallow water
      const calm = !live ? c : c === t(4) ? t(3) : c === t(3) && h2(x, y, salt + 991) < 0.45 ? t(2) : c;
      g.set(x, y, calm);
      if (kind) ctx.setKind(x, y, kind);
      if (live && calm !== c) defer(x, y, c);
    },
    spray(x, y, c) {
      x = Math.floor(x); y = Math.floor(y);
      if (!inside(x, y)) return;
      if (live) defer(x, y, c); else g.set(x, y, c);
    },
    flush() {
      if (!live) return;
      for (const [i, [c, under]] of later) {
        const x = i % ctx.W, y = Math.floor(i / ctx.W);
        if (g.get(x, y) === under) live.set(x, y, c);
      }
    },
  };
}
