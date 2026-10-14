// A mine on top of a cavern (The Unwritten Dao, #400: the iron vein under the low terraces, a grey blob of cave that
// did not read as a gallery). Three pieces a cave of rock alone does not have:
// - timbers: a frame against a south face, two posts standing on the floor at its foot and a cap beam across the top
//   of the face, iron brackets at the joints, the shadow of each post on the face beside it and on the floor;
// - burrow: a mouth dug into a face down to the floor, dark inside, its rim of loose earth, the earth it threw out
//   fanned on the floor with pebbles, and the face around it peeled in claw marks (fresh stone, lighter);
// - ore: lumps of ore on the floor, a rounded rock with rust flecks, its shadow, a twinkle on the glints layer.

import { h2, n1 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import { cave, darker, faceBottom, isFloor } from './cavern';
import type { BurrowStep, OreStep, TimbersStep } from './mineschema';

/** The foot of the face of the wall cell that starts at row `top`: past any floor at the top of the cell (a corridor
 *  above whose floor wanders into it), through the rock, to the first floor row below. */
function faceFoot(ctx: Ctx, cv: ReturnType<typeof cave>, x: number, top: number): number {
  let y = top;
  while (y < ctx.H && isFloor(ctx, cv, x, y)) y++;
  return faceBottom(ctx, cv, x, y);
}

export function runTimbers(ctx: Ctx, st: TimbersStep): void {
  const cv = cave(ctx, 'timbers');
  const g = ctx.ground, { cell, oy: OY } = ctx;
  const [lit, mid, shade] = st.tones ?? ['madera clara', 'madera', 'madera sombra'];
  const [ironLit, iron] = st.iron ?? ['bronce', 'pelo oscuro'];
  const span = (st.span ?? 1.25) * cell;
  const dk = (x: number, y: number) => { const c = g.get(x, y); if (c) g.set(x, y, darker(ctx, c, 1, cv.darkest)); };
  for (const [u, v] of st.at) {
    const [cx] = ctx.P(u, v);
    const xl = Math.round(cx - span / 2), xr = Math.round(cx + span / 2) - 4;
    const top = OY + v * cell;
    // the face at each post: from the floor up its height; the beam sits two px under the top edge of the face
    const fbL = faceFoot(ctx, cv, xl + 1, top), fbR = faceFoot(ctx, cv, xr + 1, top);
    if (fbL >= ctx.H || fbR >= ctx.H) continue;
    const beamY = Math.min(fbL - cv.faceH(xl + 1), fbR - cv.faceH(xr + 1)) + 2;
    // posts: three px, lit on the left; a dark knot now and then; the foot one px into the floor
    for (const [x0, fb] of [[xl, fbL], [xr, fbR]] as const) {
      for (let y = beamY + 3; y <= fb; y++) {
        g.set(x0, y, lit);
        g.set(x0 + 1, y, h2(x0, y >> 1, 431) < 0.12 ? shade : mid);
        g.set(x0 + 2, y, mid);
        g.set(x0 + 3, y, shade);
      }
      // its shadow on the face to the right, and on the floor below it
      for (let y = beamY + 3; y < fb; y++) dk(x0 + 4, y);
      for (let x = x0; x <= x0 + 4; x++) if (isFloor(ctx, cv, x, fb + 1)) dk(x, fb + 1);
    }
    // the cap beam, one px past each post: lit top, mid, shadow underneath; end grain darker
    for (let x = xl - 1; x <= xr + 4; x++) {
      g.set(x, beamY, lit);
      g.set(x, beamY + 1, (x === xl - 1 || x === xr + 4) ? shade : (h2(x >> 2, beamY, 432) < 0.15 ? shade : mid));
      g.set(x, beamY + 2, shade);
      if (!isFloor(ctx, cv, x, beamY + 3)) dk(x, beamY + 3);
    }
    // iron brackets where post and beam meet
    for (const x0 of [xl, xr]) {
      g.set(x0 + 1, beamY + 1, ironLit);
      g.set(x0 + 2, beamY + 1, iron);
      g.set(x0 + 1, beamY + 3, iron);
      g.set(x0 + 2, beamY + 3, iron);
    }
  }
}

export function runBurrow(ctx: Ctx, st: BurrowStep): void {
  const cv = cave(ctx, 'burrow');
  const g = ctx.ground, { cell, oy: OY } = ctx, salt = st.salt ?? 440;
  const [cx] = ctx.P(st.at[0], st.at[1]);
  const top = OY + st.at[1] * cell;
  const fb = faceFoot(ctx, cv, Math.round(cx), top);
  if (fb >= ctx.H) return;
  const [rw, rh] = st.r ?? [6, 9];
  const fl = (x: number, y: number) => isFloor(ctx, cv, x, y);
  // the face around it peeled by claws: short parallel strokes of fresh stone, three to a mark
  const hf = cv.faceH(Math.round(cx));
  for (let k = 0; k < (st.scrapes ?? 3); k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const x0 = Math.round(cx + side * (rw + 3 + 4 * h2(k, 1, salt))), y0 = fb - hf + 2 + Math.floor(h2(k, 2, salt) * 3);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const x = x0 + j * 2 + i * side, y = y0 + i;
      if (!fl(x, y) && y < fb - 1 && cv.down[y * ctx.W + x] <= cv.faceH(x)) g.set(x, y, i === 0 ? 'piedra clara' : 'piedra');
    }
  }
  // the earth it threw out, fanned on the floor in front
  const [sx, sy] = st.spoil ?? [14, 7];
  for (let y = fb; y < fb + sy * 2 + 2; y++) for (let x = Math.floor(cx - sx - 2); x < cx + sx + 3; x++) {
    if (!fl(x, y)) continue;
    const d = ((x + 0.5 - cx) / sx) ** 2 + ((y + 0.5 - fb) / sy) ** 2 + 0.3 * n1(x / 3 + y / 4, salt + 1);
    if (d >= 1) continue;
    const c = d > 0.75 ? 'madera sombra' : (h2(x, y, salt + 2) < 0.25 ? 'tierra' : 'tierra sombra');
    g.set(x, y, c);
  }
  for (let k = 0; k < 7; k++) {
    const x = Math.round(cx + (h2(k, 3, salt) - 0.5) * sx * 1.7), y = Math.round(fb + 2 + h2(k, 4, salt) * sy * 1.2);
    if (!fl(x, y) || !fl(x + 1, y + 1)) continue;
    g.set(x, y, 'piedra clara'); g.set(x + 1, y, 'piedra'); g.set(x, y + 1, 'pelo claro'); g.set(x + 1, y + 1, 'pelo oscuro');
  }
  // the mouth: an arch into the face down to the floor, the dark deeper toward the top; a rim of loose earth
  for (let y = fb - rh - 1; y <= fb + 1; y++) for (let x = Math.floor(cx - rw - 1); x <= cx + rw + 1; x++) {
    const d = ((x + 0.5 - cx) / rw) ** 2 + ((y + 0.5 - fb) / rh) ** 2;
    const dRim = ((x + 0.5 - cx) / (rw + 1.3)) ** 2 + ((y + 0.5 - fb) / (rh + 1.3)) ** 2;
    if (y > fb + 1) continue;
    if (d < 1) g.set(x, y, d < 0.55 || y < fb - rh * 0.5 ? 'tinta' : 'túnica noche');
    else if (dRim < 1) g.set(x, y, y >= fb - 1 ? 'tierra sombra' : (x < cx ? 'tierra' : 'madera sombra'));
  }
}

export function runOre(ctx: Ctx, st: OreStep): void {
  const g = ctx.ground, glints = ctx.layer(st.glints ?? 'brillos'), salt = st.salt ?? 450;
  const [sLit, sMid, sShade] = st.stone ?? ['piedra', 'piedra sombra', 'pelo claro'];
  const [lit, rust, dark] = st.tones ?? ['fuego', 'piel sombra', 'castaño'];
  st.lumps.forEach(([u, v, r], k) => {
    const [cx, cy] = ctx.P(u, v);
    const ry = r * 0.75;
    // its shadow first, down to the right
    for (let y = Math.floor(cy - ry); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - r); x <= cx + r + 2; x++) {
      if (((x + 0.5 - cx - 1.2) / r) ** 2 + ((y + 0.5 - cy - 1.5) / ry) ** 2 < 1) { const c = g.get(x, y); if (c) g.set(x, y, darker(ctx, c, 1)); }
    }
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy + 0.25 * n1(x / 2 + y, salt + k) >= 1) continue;
      const t = dx + dy * 1.2;
      let c = t < -0.5 ? sLit : (t > 0.55 ? sShade : sMid);
      const f = h2(x >> 1, y >> 1, salt + k * 7);
      if (f < 0.3) c = t < 0 ? lit : rust;
      else if (f < 0.38) c = dark;
      g.set(x, y, c);
      if (c === lit && h2(x, y, salt + 3) < 0.4) glints.set(x, y, 'fuego luz');
    }
  });
}
