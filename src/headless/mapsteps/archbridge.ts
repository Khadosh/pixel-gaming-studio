// A bridge on arches seen from the front: the archbridge step. A stone bridge that crosses a stream from west to
// east. From above, its deck: flagstones in staggered rows between two low parapets (their tops lit, an ink line
// outside). Under the south edge of the deck, its south face in courses of stone; in the face, each arch opens from
// the foot up to its crown: a ring of voussoirs (lit on the side of the light, a key at the crown) and inside it what
// runs under the bridge (the water painted before), darker right under the curve (the vault in shade) and a line of
// ink at the top. The foot of the face, between the arches, ends on the ground in a row of shadow. Not a plank over a
// ditch: a bridge you see the water go through.

import { h2 } from '../mapnoise';
import type { Ctx } from '../mappaint';
import type { ArchbridgeStep } from './archbridgeschema';

export function runArchbridge(ctx: Ctx, st: ArchbridgeStep): void {
  const g = ctx.ground, salt = st.salt ?? 1581;
  const n = ctx.mat(st.material).ramp.length;
  const t = (i: number) => ctx.tone(st.material, i);
  const INK = t(0), SHADOW = t(1), MID = t(2), LIGHT = t(3), LIT = t(n - 1), HIGH = t(Math.max(3, n - 2));
  const sun = st.light === 'east' ? -1 : 1;
  const [xw, yn] = ctx.P(st.x[0], st.y[0]), [xe, ys] = ctx.P(st.x[1], st.y[1]);
  const L = Math.round(xw), R = Math.round(xe) - 1, N = Math.round(yn), S = Math.round(ys) - 1;
  const face = st.face ?? 14, curbs = st.curbs ?? 3, [fw, fh] = st.flags ?? [10, 6], vault = st.vault ?? 4;
  const F = S + face;                                              // the last px row of the face
  const rise = Math.min(face, st.rise ?? face - 4);
  const arches = (st.arches ?? [{ u: (st.x[0] + st.x[1]) / 2, half: Math.max(4, (R - L) / 6) }]).map(a => ({ cx: ctx.P(a.u, 0)[0], hw: a.half }));
  const put = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
    g.set(x, y, c);
    ctx.setKind(x, y, st.material);
  };
  // the deck: flagstones in staggered rows, a lit lip on the north edge of each, joints in shadow
  for (let y = N; y <= S; y++) {
    const row = Math.floor((y - N) / fh), shift = (row % 2) * Math.floor(fw / 2);
    for (let x = L; x <= R; x++) {
      const col = Math.floor((x - L + shift) / fw);
      const jx = (x - L + shift) % fw === 0, jy = (y - N) % fh === 0;
      const v = h2(col, row, salt) - 0.5;
      // the deck is walked: light stone, joints a tone down (not the dark of the face), a lit lip on some
      let c = jx || jy ? MID : v > 0.2 ? LIT : v < -0.3 ? LIGHT : HIGH;
      if (jy && !jx && h2(col, row, salt + 1) < 0.5) c = LIT;
      put(x, y, c);
    }
  }
  // the parapets along both edges: a lit top, its south side in shade, the ends in ink
  if (curbs > 0) {
    for (const edge of [N, S - curbs + 1]) {
      for (let y = edge; y < edge + curbs; y++) {
        for (let x = L; x <= R; x++) {
          // a low wall seen from above: its top lit, a post every 12 px a tone up, the side toward the south in shade
          const k = y - edge, post = (x - L) % 12 === 0;
          put(x, y, k === 0 ? (edge === N ? SHADOW : LIT) : k === curbs - 1 ? SHADOW : post ? LIT : HIGH);
        }
      }
    }
    for (let y = N; y <= S; y++) { put(L, y, INK); put(R, y, INK); }
  }
  // the south face in courses, and the arches opened in it
  const inArch = (x: number, y: number) => {
    for (const a of arches) {
      const dx = (x + 0.5 - a.cx) / a.hw;
      if (Math.abs(dx) >= 1) continue;
      const crown = F + 1 - rise * Math.sqrt(1 - dx * dx);          // the curve of the arch over the foot of the face
      if (y >= crown) return { a, dx, d: y - crown };
    }
    return null;
  };
  const before = g.px.slice();
  for (let y = S + 1; y <= F; y++) {
    const course = Math.floor((y - S - 1) / 5), shift = (course % 2) * 6;
    for (let x = L; x <= R; x++) {
      const arch = inArch(x, y);
      if (arch) {
        // under the arch: what was there (the water), the vault in shade under the curve, ink at its top
        const was = before[y * ctx.W + x];
        if (arch.d < 1) put(x, y, INK);
        else if (arch.d < vault) g.set(x, y, ctx.shade(ctx.shade(was, ctx.kindAt(x, y)), ctx.kindAt(x, y)) ?? SHADOW);
        else if (arch.d < vault + 2) g.set(x, y, ctx.shade(was, ctx.kindAt(x, y)) ?? MID);
        continue;
      }
      const jx = (x - L + shift) % 12 === 0, jy = (y - S - 1) % 5 === 0;
      const across = (x - L) / Math.max(1, R - L) - 0.5;
      let c = jx || jy ? SHADOW : h2(Math.floor((x - L + shift) / 12), course, salt + 2) > 0.6 ? LIGHT : MID;
      if (y === S + 1) c = INK;                                        // the shadow line under the deck's edge
      if (x === L || x === R) c = (x === L) === (sun > 0) ? LIGHT : INK;
      if (across * sun > 0.42 && c === LIGHT) c = MID;                  // the side away from the light, a tone down
      put(x, y, c);
    }
  }
  // the voussoirs: a ring of stone around each arch, lit on the side of the light, a key at the crown
  for (const a of arches) {
    for (let x = Math.floor(a.cx - a.hw - 2); x <= Math.ceil(a.cx + a.hw + 2); x++) {
      for (let y = F - rise - 3; y <= F; y++) {
        if (x < L || x > R || inArch(x, y)) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [-2, 0], [0, 2]].some(([ox, oy]) => inArch(x + ox, y + oy));
        if (!near) continue;
        const dx = (x + 0.5 - a.cx) / a.hw;
        const key = Math.abs(x + 0.5 - a.cx) < 1.5 && y < F - rise + 1;
        put(x, y, key ? LIT : dx * sun < 0 ? HIGH : MID);
      }
    }
  }
  // the foot of the face on the ground: a row of shadow between the arches
  for (let x = L; x <= R; x++) {
    if (inArch(x, F)) continue;
    const y = F + 1, was = g.get(x, y);
    if (was !== null) g.set(x, y, ctx.shade(was, ctx.kindAt(x, y)) ?? was);
  }
}
