// Planks: a wooden floor of boards laid in rows over the box of an area. Each
// row starts at its own offset; each board has its length and tone, a lit lip
// on top, the joint below, its end in shadow, long waving grain, sometimes a
// knot, and a nail 2 px in from each end. The light comes from the back of the
// room: the boards near the front and in the corners are one tone darker, a
// whole board at a time. Port of the floor of The Unwritten Dao's tea house
// script (scripts/suelo_casa_te.py).

import { fbm, h2, type Mask } from '../mapnoise';
import type { Ctx, Layer } from '../mappaint';
import type { PlanksOpts } from './schema';

export function texturePlanks(ctx: Ctx, mask: Mask, name: string, o: PlanksOpts = {}, layer: Layer = ctx.ground): void {
  const b = mask.bounds();
  if (!b) return;
  const [FL, FT] = [b[0], b[1]], FR = b[2] + 1, FB = b[3] + 1;
  const g = layer;
  const [bh, len0, lenAdd] = o.board ?? [6, 18, 30];
  const tones = o.tones ?? ctx.mat(name).ramp;
  const s = o.salt ?? 701;
  const [fw, cpx, cfrom, cw, above] = o.fall ?? [0.85, 40, 0.45, 0.8, 0.74];
  const [gx, gy, gdark, glight] = o.grain ?? [9, 1.3, 0.70, 0.24];
  const streak = o.streak ? new Set(o.streak) : null;
  const knots = o.knots ?? 0.18;
  const col = o.colors ?? {};
  const jointC = col.joint ?? 'madera sombra', endC = col.end ?? 'madera sombra';
  const [nailL, nailR] = col.nails ?? ['madera sombra', 'tierra sombra'];
  const knotC = col.knot ?? 'madera sombra';
  const m = Math.floor((bh - 2) / 2); // the two middle rows of a board: m, m + 1
  const dn = (c: string) => ctx.shade(c, name) ?? c;
  let row = 0;
  for (let y = FT; y < FB + bh; y += bh, row++) {
    let x = FL - Math.trunc(h2(row, 1, s) * lenAdd);
    let seg = 0;
    while (x < FR) {
      const length = len0 + Math.trunc(h2(row, seg, s + 2) * lenAdd);
      let tone = tones[Math.trunc(h2(row, seg, s + 4) * tones.length)];
      const mid = Math.min(Math.max(x + length / 2.0, FL), FR);
      const far = (y + bh / 2 - FT) / (FB - FT);
      const corner = Math.min(mid - FL, FR - mid) / cpx;
      if (far * fw + Math.max(0.0, cfrom - corner) * cw > above) tone = dn(tone);
      const own = o.by_tone?.[tone] ?? {};
      const knot = h2(row, seg, s + 8) < knots;
      const kx = knot ? x + 6 + Math.trunc(h2(row, seg, s + 10) * Math.max(1, length - 12)) : 0;
      for (let yy = y; yy < y + bh; yy++) {
        if (yy >= FB) continue;
        for (let xx = Math.max(x, FL); xx < Math.min(x + length, FR); xx++) {
          if (!mask.has(xx, yy)) continue;
          const t = yy - y;
          let c: string;
          if (t === bh - 1) c = own.joint ?? jointC;
          else if (xx === x + length - 1) c = endC;
          else if (t === 0) c = own.lip ?? ctx.lighten(tone);
          else {
            c = tone;
            const v = fbm((xx + seg * 37) / gx, (yy + row * 11) / gy, s + 6, 2);
            if (v > gdark) c = dn(tone);
            else if (v < glight && (t === m || t === m + 1)) c = !streak || streak.has(tone) ? ctx.lighten(tone) : tone;
            if (knot && Math.abs(xx - kx) <= 1 && (t === m || t === m + 1)) c = xx === kx ? knotC : dn(tone);
          }
          if (t === m && (xx === x + 2 || xx === x + length - 3)) c = xx === x + 2 ? nailL : nailR;
          g.set(xx, yy, c);
          ctx.setKind(xx, yy, name);
        }
      }
      x += length;
      seg++;
    }
  }
}
