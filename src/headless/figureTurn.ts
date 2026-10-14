// A drawing turned 45° from two drawings of it: the diagonal views of a figure
// (front_right, back_left…) out of the view it faces and the profile beside it.
//
// Each row of a drawn head is a slice through it. The view the figure faces
// gives the slice's width (across), the profile its depth (front to back);
// together they make an ellipse per row. The diagonal camera sees each column
// of that ellipse at one point, and the point takes the pixel of whichever of
// the two drawings looks at it most squarely: the face from the front drawing,
// the ear and the back of the head from the profile. So the near eye stays
// whole, the far one narrows against the edge, and the ear of the profile
// shows on the side the head turns from. Nothing is drawn: every pixel is one
// the two drawings already have, and the silhouette gets its ink back.
//
// Pure: no Node imports.

/** One drawing as it lands on the canvas: rows already mirrored if it was flipped. */
export interface TurnSource {
  rows: string[];
  legend: Record<string, string>;
  /** where the joint the drawing hangs from falls, in the drawing's own pixels (fractional; 0 is the left/top edge) */
  jx: number;
  jy: number;
  /** degrees the figure faces in that view (0 screen right, 90 toward the viewer) */
  heading: number;
}

export interface Turned {
  rows: string[];
  legend: Record<string, string>;
  jx: number;
  jy: number;
}

const GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=?!<>~^';

/** how far inside a drawing's silhouette its pixels are read (its outline is not the turned head's) */
const INSET = 1.5;
/**
 * degrees round from the drawing it faces that a point still takes that
 * drawing's pixel: from the front, past it the ear and the hair behind it;
 * from behind, the back of the head reaches round to the ear, and only a
 * sliver of cheek is the profile's
 */
export const FACE_REACH = { front: 70, back: 80 };
/** where a profile has its ear, from the middle of the head toward the face (-1 the back, 1 the nose) */
const EAR = 0;
/** seen from behind, how far past the ear toward the face the profile is read at the edge (never the eye) */
const CHEEK = 0.1;

const rad = (d: number) => (d * Math.PI) / 180;
const snap = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

/** the horizontal axes of a view: screen x and depth toward the viewer, of a point (fwd, lat) of the figure */
function axes(heading: number): { ch: number; sh: number } {
  return { ch: snap(Math.cos(rad(heading))), sh: snap(Math.sin(rad(heading))) };
}

const opaque = (g: string | undefined) => g !== undefined && g !== '.' && g !== ' ';

/** a row's span in the figure's own coordinate along the axis this view shows ([lo, hi]), or undefined if empty */
function span(src: TurnSource, row: number, along: 'lat' | 'fwd'): [number, number] | undefined {
  const glyphs = [...(src.rows[row] ?? '')];
  let c0 = -1, c1 = -1;
  glyphs.forEach((g, i) => { if (opaque(g)) { if (c0 < 0) c0 = i; c1 = i; } });
  if (c0 < 0) return undefined;
  const { ch, sh } = axes(src.heading);
  // screen x = fwd·ch − lat·sh: the face view (|sh| ≈ 1) shows lat, the profile (|ch| ≈ 1) fwd
  const x0 = c0 - src.jx, x1 = c1 + 1 - src.jx;
  const k = along === 'lat' ? -sh : ch;
  if (Math.abs(k) < 0.3) return undefined;
  const a = x0 / k, b = x1 / k;
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * The drawing seen at `heading`, from `face` (the view it faces: front or
 * back) and `side` (the profile next to it, optional: without it each row is
 * taken round). `outlined`: the sources bring their own ink, so the result
 * inks its own silhouette in `ink`.
 */
export function turnArt(face: TurnSource, side: TurnSource | undefined, heading: number, ink?: string): Turned {
  const out = axes(heading);
  const sources = side ? [face, side] : [face];
  // rows, counted from the joint: the camera is level, so a row is the same row in every view
  const yLo = Math.min(...sources.map(s => Math.floor(-s.jy)));
  const yHi = Math.max(...sources.map(s => Math.ceil(s.rows.length - s.jy)));
  const colorAt = (s: TurnSource, row: number, col: number): string | undefined => {
    const g = [...(s.rows[row] ?? '')][col];
    return opaque(g) ? s.legend[g!] : undefined;
  };
  type Cell = { color: string; depth: number };
  const cells = new Map<number, Map<number, Cell>>();
  let xLo = Infinity, xHi = -Infinity;
  for (let k = yLo; k < yHi; k++) {
    const y = k + 0.5;
    const rowOf = (s: TurnSource) => Math.floor(s.jy + y);
    const lat = span(face, rowOf(face), 'lat');
    const fwd0 = side ? span(side, rowOf(side), 'fwd') : undefined;
    // seen from behind, the face never reaches the silhouette: the slice goes no further
    // forward than it goes back (the jaw of a profile would stick out of the hair)
    const behind = axes(face.heading).sh < 0;
    const fwd: [number, number] | undefined = fwd0 && behind ? [fwd0[0], Math.min(fwd0[1], -fwd0[0])] : fwd0;
    if (!lat && !fwd) continue;
    // the slice: an ellipse; a row one drawing lacks is taken round
    const cl = lat ? (lat[0] + lat[1]) / 2 : 0;
    const al = Math.max(0.5, lat ? (lat[1] - lat[0]) / 2 : (fwd![1] - fwd![0]) / 2);
    const cf = fwd ? (fwd[0] + fwd[1]) / 2 : 0;
    const bf = Math.max(0.5, fwd ? (fwd[1] - fwd[0]) / 2 : al);
    const row = new Map<number, Cell & { f: number; l: number; nf: number; nl: number }>();
    const steps = 720;
    for (let n = 0; n < steps; n++) {
      const p = (2 * Math.PI * n) / steps;
      const f = cf + bf * Math.cos(p), l = cl + al * Math.sin(p);
      // the outward normal of the ellipse, and whether this camera sees that side
      const nf = Math.cos(p) / bf, nl = Math.sin(p) / al;
      if (nf * out.sh + nl * out.ch <= 0) continue;
      const x = f * out.ch - l * out.sh;
      const depth = f * out.sh + l * out.ch;
      const col = Math.floor(x);
      const had = row.get(col);
      if (!had || depth > had.depth) row.set(col, { color: '', depth, f, l, nf, nl });
    }
    const got = new Map<number, Cell>();
    const fa = axes(face.heading);
    // which way the face drawing looks along fwd: +1 the front, -1 the back
    const sigma = Math.sign(fa.sh) || 1;
    const reach = sigma > 0 ? FACE_REACH.front : FACE_REACH.back;
    for (const [col, pt] of row) {
      // How far round from the drawing it faces this point is (0°: square on).
      // Up to FACE_REACH the pixel is that drawing's, read round the slice:
      // the far half of the face narrows against the edge, the near half
      // widens. Past it, the profile's, but only from the ear back (or, seen
      // from behind, from the ear to the cheek, never the eye): a profile draws
      // the eye and the cheek on its edge, where a head turned 45° shows the
      // ear, and read whole it puts a second face beside the first.
      const delta = Math.acos(Math.max(-1, Math.min(1, (pt.nf * fa.sh + pt.nl * fa.ch) / Math.hypot(pt.nf, pt.nl))));
      const inset = (v: number, c: number, r: number) => Math.max(c - Math.max(0, r - INSET), Math.min(c + Math.max(0, r - INSET), v));
      let c: string | undefined;
      if (fwd && side && (delta > rad(reach) || !lat)) {
        const u = lat ? (1 + Math.cos(delta)) / (1 + Math.cos(rad(reach))) : (1 + sigma * Math.cos(Math.atan2(pt.nl, pt.nf))) / 2;
        // u = 1 at the ear, 0 at the far end: the back of the head from the front, the cheek from behind
        const f = sigma > 0 ? cf + bf * (EAR - (1 - u) * (1 + EAR)) : cf + bf * (EAR + (1 - u) * CHEEK);
        const a = axes(side.heading);
        c = colorAt(side, rowOf(side), Math.floor(side.jx + inset(f, cf, bf) * a.ch));
      } else if (lat) {
        // inside the drawing's own line (INSET px): its outline is the edge of the head seen
        // from there, and here that edge is the middle of the cheek or the temple
        c = colorAt(face, rowOf(face), Math.floor(face.jx + inset(pt.f, cf, bf) * fa.ch - inset(pt.l, cl, al) * fa.sh));
      }
      if (c) got.set(col, { color: c, depth: pt.depth });
    }
    if (got.size) {
      cells.set(k, got);
      for (const col of got.keys()) { xLo = Math.min(xLo, col); xHi = Math.max(xHi, col); }
    }
  }
  if (!cells.size) return { rows: [], legend: {}, jx: 0, jy: 0 };
  const ks = [...cells.keys()];
  const kLo = Math.min(...ks), kHi = Math.max(...ks);
  const W = xHi - xLo + 1, H = kHi - kLo + 1;
  const grid: (string | null)[][] = Array.from({ length: H }, (_, r) =>
    Array.from({ length: W }, (_, c) => cells.get(r + kLo)?.get(c + xLo)?.color ?? null));
  if (ink) {
    // the silhouette's own line: what had a line in the drawings has one here
    const edge = grid.map((row, r) => row.map((c, x) => !!c && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !grid[r + dy]?.[x + dx])));
    grid.forEach((row, r) => row.forEach((_, x) => { if (edge[r][x]) row[x] = ink; }));
  }
  const glyphOf = new Map<string, string>();
  const legend: Record<string, string> = {};
  const rows = grid.map(row => row.map((c) => {
    if (!c) return '.';
    let g = glyphOf.get(c);
    if (!g) {
      g = GLYPHS[glyphOf.size];
      if (!g) throw new Error('figure: a turned drawing has more colors than glyphs');
      glyphOf.set(c, g);
      legend[g] = c;
    }
    return g;
  }).join(''));
  return { rows, legend, jx: -xLo, jy: -kLo };
}
