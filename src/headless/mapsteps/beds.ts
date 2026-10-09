// Garden beds seen from above in three quarters: a frame of boards around a
// rectangle of dark earth, its front board standing out of the ground with its
// face toward the south, furrows running east-west and a row of small plants on
// each ridge (heads of leaves, sprouts, flowers, clumps), the nearer rows over
// the farther ones; and the shadow of the bed on the ground to the south-east.
// The light comes from the north-west, as everywhere: the north and west boards
// show their lit tops, the plants are lit on their upper-left.

import { Mask, h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { BedsStep } from './buildingschema';

type Plant = NonNullable<BedsStep['plants']>[number];

export function runBeds(ctx: Ctx, st: BedsStep): void {
  const { W, H } = ctx, g = ctx.ground;
  const layer = ctx.layer(st.layer ?? 'ground');
  const salt = st.salt ?? 2101;
  const S = (i: number) => ctx.tone(st.soil, i), Fr = (i: number) => ctx.tone(st.frame, i);
  const b = st.board ?? 2, rise = st.rise ?? 3, rows = st.rows ?? 5;
  const kinds: Plant[] = st.plants ?? [{ shape: 'leafy' }];
  const mine = new Mask(W, H);
  const put = (x: number, y: number, c: string, kind: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    layer.set(x, y, c); ctx.setKind(x, y, kind); mine.set(x, y);
  };

  st.beds.forEach((bed, n) => {
    const [u, v, w, h] = bed;
    const kind = kinds[(bed.length > 4 ? bed[4]! : n) % kinds.length];
    const [fx0, fy0] = ctx.P(u, v), [fx1, fy1] = ctx.P(u + w, v + h);
    const x0 = Math.round(fx0), y0 = Math.round(fy0), x1 = Math.round(fx1) - 1, y1 = Math.round(fy1) - 1;
    const top = y1 - rise; // the last row of the top of the front board
    // ---- the boards: the frame seen from above, the front one's face, the ink around it
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (y > top) {
        // the face of the front board: lit lip, body, a dark line at its foot, a joint now and then
        const r = y - top - 1;
        const joint = (x - x0) % 11 === 10 && h2(x, n, salt) < 0.7;
        put(x, y, edge || r === rise - 1 ? Fr(0) : joint ? Fr(1) : r === 0 ? Fr(3) : Fr(2), st.frame);
        continue;
      }
      if (edge) { put(x, y, Fr(0), st.frame); continue; }
      const north = y < y0 + 1 + b, south = y > top - b, west = x < x0 + 1 + b, east = x > x1 - 1 - b;
      if (north || south || west || east) {
        // the top of a board: lit on the north and west ones, in half light on the east, a grain of joints
        const lit = (north && !east) || (west && !south);
        const first = (north && y === y0 + 1) || (west && x === x0 + 1) || (south && y === top - b + 1) || (east && x === x1 - b);
        put(x, y, lit ? (first ? Fr(4) : Fr(3)) : first ? Fr(3) : Fr(2), st.frame);
        continue;
      }
      // the earth: furrows east-west, the board's shadow on its north and west edge
      const yy = y - (y0 + 1 + b), xx = x - (x0 + 1 + b);
      const fur = yy % rows;
      let c = fur === rows - 1 ? 0 : fur === 0 ? 2 : 1;
      if (yy === 0 || xx === 0) c = 0;
      else if (c === 1 && h2(x, y, salt + 1) < 0.08) c = 2;
      put(x, y, S(c), st.soil);
    }
    // ---- the plants: a row on each ridge, back to front so the nearer ones cover the farther ones
    const sx0 = x0 + 1 + b, sx1 = x1 - 1 - b, sy0 = y0 + 1 + b, sy1 = top - b;
    const [dk, body, lt] = kind.colors ?? ['prado hondo', 'prado', 'prado claro'];
    const glint = kind.colors?.[3] ?? lt;
    const sp = kind.spacing ?? (kind.shape === 'sprout' ? 4 : 6);
    for (let ry = sy0 + Math.floor(rows / 2), row = 0; ry <= sy1; ry += rows, row++) {
      // every other row half a plant over, a plant missing now and then, each one a px up or down: a bed that grows,
      // not a tray
      for (let x = sx0 + 1 + (row % 2 ? Math.floor(sp / 2) : 0) + Math.floor(h2(row, n, salt + 2) * 2); x <= sx1 - 1; x += sp + Math.floor(h2(x, ry, salt + 3) * 2)) {
        if (h2(x, ry, salt + 5) < 0.1) continue;
        const jy = h2(x, ry, salt + 6) < 0.3 ? -1 : h2(x, ry, salt + 6) > 0.85 ? 1 : 0;
        const p = (dx: number, dy: number, c: string) => put(x + dx, ry + dy + jy, c, st.soil);
        const hs = h2(x, ry, salt + 4);
        switch (kind.shape) {
          case 'leafy':
            // a round head, 6 × 5: dark rim to the south-east, light to the north-west, a glint on top, a dark heart
            for (let dy = -3; dy <= 1; dy++) for (let dx = -3; dx <= 2; dx++) {
              const corner = (dx === -3 || dx === 2) && (dy === -3 || dy === 1);
              if (corner) continue;
              const s = dx + dy;
              p(dx, dy, s >= 2 || dy === 1 || dx === 2 ? dk : s <= -3 ? lt : body);
            }
            p(-2, -3, glint); p(-1, -3, lt);
            if (hs < 0.6) p(0, -1, dk);
            break;
          case 'sprout':
            p(0, 0, dk); p(0, -1, body); p(-1, -2, lt); p(1, -2, body);
            if (hs < 0.4) p(0, -2, lt);
            break;
          case 'flower': {
            const [bs, bb, bl] = kind.bloom ?? ['flor sombra', 'flor', 'flor clara'];
            p(0, 0, dk); p(-1, 0, body); p(1, 0, dk); p(0, -1, body); p(0, -2, dk);
            p(-1, -3, bl ?? bb); p(0, -3, bb); p(-1, -4, bb); p(0, -4, hs < 0.5 ? bb : bs); p(1, -3, bs);
            break;
          }
          case 'tall':
            for (let dy = -5; dy <= 0; dy++) for (let dx = -2; dx <= 1; dx++) {
              if ((dy === -5 && dx !== -1 && dx !== 0) || (dy === -4 && dx === 1 && hs < 0.5)) continue;
              p(dx, dy, dx === 1 || dy === 0 ? dk : dx === -2 || dy === -5 ? lt : (dx + dy) % 3 === 0 ? dk : body);
            }
            p(-1, -5, glint);
            break;
        }
      }
    }
  });
  // ---- the shadow of the beds on the ground, to the south-east (never on a bed): two tones down near the boards,
  // one further out, its far edge frayed so it never runs ruled
  const [dx, dy] = st.shadow?.offset ?? [4, 3];
  const on = st.shadow?.on ? new Set(st.shadow.on) : null;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const near = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mine.has(x, y)) continue;
    for (let k = 1; k <= steps; k++) {
      const X = x + Math.round(dx * k / steps), Y = y + Math.round(dy * k / steps);
      if (X < 0 || Y < 0 || X >= W || Y >= H || mine.has(X, Y)) continue;
      if (on && !on.has(ctx.kindAt(X, Y))) continue;
      const i = Y * W + X, deep = k <= Math.ceil(steps / 2) ? 2 : 1;
      if (deep > near[i]) near[i] = deep;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = near[y * W + x];
    if (n < 1) continue;
    if (n === 1 && h2(x, y, salt + 9) < 0.3) continue;
    for (let k = 0; k < n; k++) g.set(x, y, ctx.shade(g.get(x, y), ctx.kindAt(x, y)));
  }
  if (st.id) ctx.masks.set(st.id, mine);
}
