/**
 * The effects a figure draws with its poses (Khadosh/pixel-gaming-studio#16):
 * the arc a blow cuts and the qi of a technique. They are not poses, so the
 * rig cannot make them out of capsules: they are painted on the frame once
 * the body and its outline are there, only on empty pixels (behind the body,
 * never over the face), flat and without ink, as light is.
 *
 * Pure: it takes the frame as arrays and the points the rig already projected.
 */

/** where the effect paints: the frame's pixels and, for each, whether it is free */
export interface FxCanvas {
  w: number; h: number;
  pixels: (string | null)[];
}

/** what the recipe says of the arc (`fx.slash`) */
export interface SlashSpec {
  /** the body of the arc (default the glow) */
  color?: string;
  /** its cutting edge, the outer pixel (default glow_core) */
  core?: string;
  /** px past the hand the blade reaches: the arc's radius is the arm plus this (default 0.3 of the figure's height) */
  reach?: number;
  /** px across at its thickest (default a twelfth of the figure's height, 2 at least) */
  width?: number;
  /** the hand that strikes (default right, the one the poses strike with) */
  hand?: 'left' | 'right';
}

/** what the recipe says of the qi (`fx.qi`) */
export interface QiSpec {
  color?: string;
  core?: string;
  /** the sparks' draw (default 1) */
  seed?: number;
}

/** a small deterministic generator: the same recipe draws the same sparks */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the angle from a to b, wrapped to (-π, π] */
function turn(a: number, b: number): number {
  let d = b - a;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  return d;
}

/**
 * The arc of a blow: a crescent round the shoulder, swept the short way from
 * where the hand was (`from`) to where it is (`to`), each measured from its
 * own frame's shoulder (the body lunges forward under the arm, and the arc is
 * the arm's turn, not the body's step), at the arm's length plus the blade's
 * reach. Thick in the middle and thin at both ends, its outer
 * pixel in `core` (the edge that cuts); `fade` is the frame after, the same
 * arc where it was cut, half as thick and without the edge. Answers the
 * pixels it painted. `shoulder` is on the canvas, `from` and `to` are the
 * hand from its shoulder.
 */
export function paintSlash(
  cv: FxCanvas, shoulder: [number, number], from: [number, number], to: [number, number],
  spec: { color: string; core: string; reach: number; width: number }, fade: boolean,
): number[] {
  const [cx, cy] = shoulder;
  const a0 = Math.atan2(from[1], from[0]);
  const sweep = turn(a0, Math.atan2(to[1], to[0]));
  // a hand that comes straight at the camera cuts no arc on screen
  if (Math.abs(sweep) < (20 * Math.PI) / 180) return [];
  const R = Math.max(Math.hypot(...from), Math.hypot(...to)) + spec.reach;
  const T = fade ? spec.width / 2 : spec.width;
  const done: number[] = [];
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      const i = y * cv.w + x;
      if (cv.pixels[i] !== null) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > R + 0.5 || d < R - T - 0.5) continue;
      const u = turn(a0, Math.atan2(dy, dx)) / sweep;
      if (u < 0 || u > 1) continue;
      // the tail of the frame after: the end the blade left last
      if (fade && u < 0.35) continue;
      const t = T * Math.sin(Math.PI * u);
      if (t < 0.6 || d < R - t) continue;
      cv.pixels[i] = !fade && d > R - 0.5 ? spec.core : spec.color;
      done.push(i);
    }
  }
  return done;
}

/** how the qi shows in a frame (from the pose table) */
export interface QiPose {
  /** sparks rising round the outline: 1 a few, 2 more */
  sparks?: number;
  /** a dome of qi over the body: how far it reaches each side, in heights of the figure */
  sphere?: number;
  /** the share of the ring already gone (0 whole) */
  broken?: number;
}

/**
 * The qi of a technique: sparks of two pixels rising off the outline, 1 to 3
 * px out from it, and a dome of qi over the body, two pixels wide and broken
 * in arcs, its outer edge lit on the upper left (the light of the world),
 * standing in the ripple it makes on the ground round the feet. \`figure\` is
 * the silhouette (pixels the body took), \`cx\` the chest's column, \`ground\`
 * the soles' row, \`tall\` the figure's height on screen. \`frame\` reseeds the
 * sparks so they flicker from one frame to the next.
 */
export function paintQi(
  cv: FxCanvas, figure: Uint8Array, cx: number, ground: number, tall: number,
  qi: QiPose, spec: { color: string; core: string; seed: number }, frame: number,
): number[] {
  const done: number[] = [];
  const put = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
    const i = y * cv.w + x;
    if (cv.pixels[i] !== null) return;
    cv.pixels[i] = c;
    done.push(i);
  };
  const { w, h } = cv;
  if (qi.sphere) {
    // a dome on the ground: half an ellipse \`A\` wide each side and \`B\` tall
    // over the soles, standing in a ripple as wide as it. Both are upright where
    // they meet, so the line goes on round with no corner (a ring centred over
    // the ground came down slanted onto the ripple: crosses and hooks)
    const A = Math.max(3, qi.sphere * tall), B = Math.max(A, (0.5 + qi.sphere) * tall + 3);
    const gy = ground + 0.5;
    // twelve arcs, a few of them gone (more as it breaks), always the same ones for a seed
    const gone = new Set<number>();
    const r = rng(spec.seed * 7919 + 17);
    const order = Array.from({ length: 12 }, (_, n) => n).sort(() => r() - 0.5);
    for (const n of order.slice(0, Math.round(12 * Math.min(0.9, 0.2 + (qi.broken ?? 0))))) gone.add(n);
    for (let y = 0; y <= ground; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - cx) / A, dy = (y + 0.5 - gy) / B;
        const e = Math.hypot(dx, dy);
        // how far from the curve, in px: the band is two wide, one each side
        const d = (e - 1) / (Math.hypot(dx / A, dy / B) / (e || 1) || 1);
        if (d < -1 || d >= 1) continue;
        // the arcs go round the half from one end to the other
        if (gone.has(Math.min(11, Math.floor(((Math.atan2(-dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / Math.PI * 12)))) continue;
        // lit from the upper left: the outer edge of the side that faces it is the core
        put(x, y, d >= 0 && dx < 0 && dy < -0.35 ? spec.core : spec.color);
      }
    }
    const rx = A, ry = Math.max(1, A / 4);
    // one pixel per column where it is flat and one per row where it is steep
    // (the two meet where the slope is 1): a clean line
    const flat = rx / Math.hypot(rx, ry), steep = ry / Math.hypot(rx, ry);
    for (let x = Math.ceil(cx - rx - 0.5); x <= Math.floor(cx + rx - 0.5); x++) {
      const u = (x + 0.5 - cx) / rx;
      if (Math.abs(u) > flat) continue;
      const dy = ry * Math.sqrt(Math.max(0, 1 - u * u));
      put(x, Math.floor(gy - dy), spec.color);
      put(x, Math.floor(gy + dy), spec.color);
    }
    for (let y = Math.ceil(gy - ry - 0.5); y <= Math.floor(gy + ry - 0.5); y++) {
      const v = (y + 0.5 - gy) / ry;
      if (Math.abs(v) > steep) continue;
      const dx = rx * Math.sqrt(Math.max(0, 1 - v * v));
      put(Math.floor(cx - dx), y, spec.color);
      put(Math.floor(cx + dx), y, spec.color);
    }
  }
  if (qi.sparks) {
    // the band 1 to 3 px out from the silhouette, where a spark can start
    const N = w * h;
    const dist = new Int16Array(N).fill(99);
    const queue: number[] = [];
    for (let i = 0; i < N; i++) if (figure[i]) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      if (dist[i] >= 3) continue;
      const x = i % w, y = Math.floor(i / w);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; queue.push(j); }
      }
    }
    const band: number[] = [];
    for (let i = 0; i < N; i++) if (dist[i] >= 1 && dist[i] <= 3 && cv.pixels[i] === null) band.push(i);
    const r = rng(spec.seed * 104729 + frame * 31 + 1);
    const count = Math.round(qi.sparks * Math.max(3, tall / 6));
    for (let n = 0; n < count && band.length; n++) {
      const i = band.splice(Math.floor(r() * band.length), 1)[0];
      const x = i % w, y = Math.floor(i / w);
      // qi rises: the spark and its light trail one pixel above
      put(x, y, spec.color);
      put(x, y - 1, spec.core);
    }
  }
  return done;
}
