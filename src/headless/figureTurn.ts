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
 * from the front, degrees round from the front drawing that a point still
 * takes its pixel; past it, the ear and the hair behind it, from the profile
 */
export const FACE_REACH = 70;
/** where a profile has its ear, from the middle of the head toward the face (-1 the back, 1 the nose) */
const EAR = 0;
/**
 * from behind, how much more squarely the profile has to look at a point than
 * the back drawing to give its pixel: the back of the head and the bun stay
 * the back drawing's, the side of the head and the ear are the profile's
 */
const SIDE_BIAS = 0.3;
/** from behind, a row narrower than this share of the widest (a bun, its ribbon) moves whole, as drawn */
const NARROW = 0.55;

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
 * A row's span across, as the median of its own and the two above and below:
 * an ear drawn a pixel out on one row (\`kck\`) stays inside the head instead of
 * pushing that row's slice out into a streak.
 */
function smoothSpan(src: TurnSource, row: number): [number, number] | undefined {
  const own = span(src, row, 'lat');
  if (!own) return undefined;
  const near = [-2, -1, 0, 1, 2].map(d => span(src, row + d, 'lat')).filter((x): x is [number, number] => !!x);
  const med = (v: number[]) => { const o = [...v].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };
  return [med(near.map(x => x[0])), med(near.map(x => x[1]))];
}

/**
 * The drawing seen at `heading`, from `face` (the view it faces: front or
 * back) and `side` (the profile next to it, optional: without it each row is
 * taken round). `outlined`: the sources bring their own ink, so the result
 * inks its own silhouette in `ink`.
 */
export function turnArt(face: TurnSource, side0: TurnSource | undefined, heading: number, ink?: string): Turned {
  const side = side0;
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
  const maxAl = Math.max(0, ...face.rows.map((_, r) => { const sp = span(face, r, 'lat'); return sp ? (sp[1] - sp[0]) / 2 : 0; }));
  for (let k = yLo; k < yHi; k++) {
    const y = k + 0.5;
    const rowOf = (s: TurnSource) => Math.floor(s.jy + y);
    const lat = axes(face.heading).sh < 0 ? smoothSpan(face, rowOf(face)) : span(face, rowOf(face), 'lat');
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
    if (behind && lat && al < NARROW * maxAl) {
      // a narrow row over the head (a bun, its ribbon, a topknot) seen from behind turns whole:
      // it moves with its centre, as drawn, instead of wrapping round a slice its size
      const fa0 = axes(face.heading);
      const xc = cf * out.ch - cl * out.sh;
      const got = new Map<number, Cell>();
      [...(face.rows[rowOf(face)] ?? '')].forEach((g, c) => {
        if (!opaque(g)) return;
        const xs = c + 0.5 - face.jx; // in the back view, x = −lat·sh
        const col = Math.floor(xc + (xs - -cl * fa0.sh));
        got.set(col, { color: face.legend[g], depth: 0 });
      });
      if (got.size) {
        cells.set(k, got);
        for (const col of got.keys()) { xLo = Math.min(xLo, col); xHi = Math.max(xHi, col); }
      }
      continue;
    }
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
    const reach = FACE_REACH;
    for (const [col, pt] of row) {
      // How far round from the drawing it faces this point is (0°: square on).
      // Up to FACE_REACH the pixel is that drawing's, read round the slice:
      // the far half of the face narrows against the edge, the near half
      // widens. Past it, the profile's, but only from the ear back: a profile
      // draws the eye and the cheek on its edge, where a head turned 45° shows
      // the ear, and read whole it puts a second face beside the first.
      const delta = Math.acos(Math.max(-1, Math.min(1, (pt.nf * fa.sh + pt.nl * fa.ch) / Math.hypot(pt.nf, pt.nl))));
      const inset = (v: number, c: number, r: number) => Math.max(c - Math.max(0, r - INSET), Math.min(c + Math.max(0, r - INSET), v));
      let c: string | undefined;
      if (sigma < 0) {
        // seen from behind: only the back half of the head, each point from the drawing that looks
        // at it most squarely: the back of the head from the back, the side of the head (the hair
        // over the temple, the ear with its line) from the profile; the face is never there
        if ((pt.f - cf) * sigma < 0) continue;
        const n = Math.hypot(pt.nf, pt.nl);
        const sa = side ? axes(side.heading) : undefined;
        const seenBack = (pt.nf * fa.sh + pt.nl * fa.ch) / n;
        const seenSide = sa ? (pt.nf * sa.sh + pt.nl * sa.ch) / n : -1;
        if (side && fwd && sa && seenSide > seenBack + SIDE_BIAS) c = colorAt(side, rowOf(side), Math.floor(side.jx + inset(pt.f, cf, bf) * sa.ch));
        else if (lat) c = colorAt(face, rowOf(face), Math.floor(face.jx - inset(pt.l, cl, al) * fa.sh));
      } else if (fwd && side && (delta > rad(reach) || !lat)) {
        const u = lat ? (1 + Math.cos(delta)) / (1 + Math.cos(rad(reach))) : (1 + Math.cos(Math.atan2(pt.nl, pt.nf))) / 2;
        // u = 1 at the ear, 0 at the back of the head
        const f = cf + bf * (EAR - (1 - u) * (1 + EAR));
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
  // a hole one pixel wide inside the head (a gap between two columns read from
  // different views) is not a hole in the hair: it takes its neighbours' colour,
  // or the outline below would ring it in ink and it would show the ground through
  closePinholes(grid);
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

/**
 * Fills every empty cell whose four neighbours are drawn with the colour most
 * of them have (the first one, on a tie): a turned drawing has no pinholes.
 */
export function closePinholes(grid: (string | null)[][]): number {
  let filled = 0;
  const H = grid.length;
  for (let r = 0; r < H; r++) {
    for (let x = 0; x < grid[r].length; x++) {
      if (grid[r][x]) continue;
      const around = [grid[r - 1]?.[x], grid[r + 1]?.[x], grid[r][x - 1], grid[r][x + 1]];
      if (around.some(c => !c)) continue;
      const count = new Map<string, number>();
      for (const c of around) count.set(c!, (count.get(c!) ?? 0) + 1);
      let best = around[0]!;
      for (const [c, n] of count) if (n > count.get(best)!) best = c;
      grid[r][x] = best;
      filled++;
    }
  }
  return filled;
}

/** how far (rgb distance) a colour of the hair may be from its main one to streak the hair over a lost profile's face */
const HAIR_STREAK = 50;

/** a profile turned on into a lost profile: the rows and legend of the drawing, in its own pixels */
export interface LostProfileOptions {
  /** the face's tones, light to dark: the first is the skin the face is read from, the darkest the ear's shade */
  skin: string[];
  ink: string;
  /** px of cheek left showing at the front edge (one more on the lower half: the jaw) */
  cheek?: number;
  /** px the nose is cut back */
  trim?: number;
}

/**
 * A head seen from behind and turned toward the other one, out of its profile
 * (facing screen right, as drawn): the lost profile. The face turns away and
 * the hair covers it; what stays is the ear and, along the front edge, a strip
 * of cheek (`cheek` px, one more on the jaw) with the nose cut back (`trim`).
 * The eye goes: the pixels round its glint (the lightest non-skin pixel of the
 * face, and the eye's other colours touching it, a column either side) become
 * skin. The hair that covers the face is the drawing's own: the commonest colour
 * behind the ear, streaked with the next commonest above the face when the
 * face's rows have it too and it is close in tone (`HAIR_STREAK`; never a hat, a band or a ribbon). The ear is found by the face's darkest
 * tone: the leftmost pixel of it and the skin right after it; with no ear
 * drawn (hair over it) the face starts at its leftmost skin. The bottom
 * rows with a single pixel of skin past the ear are the neck, left as drawn.
 */
export function lostProfile(rows0: string[], legend0: Record<string, string>, opts: LostProfileOptions): { rows: string[]; legend: Record<string, string> } {
  const cheek = opts.cheek ?? 2, trim = opts.trim ?? 1;
  const norm = (c: string) => c.toLowerCase();
  const skinSet = new Set(opts.skin.map(norm));
  const skin0 = norm(opts.skin[0]), ink = norm(opts.ink);
  // a single tone has no shade to find the ear by
  const dark = norm(opts.skin[opts.skin.length - 1]) === skin0 ? undefined : norm(opts.skin[opts.skin.length - 1]);
  const legend: Record<string, string> = { ...legend0 };
  const colorOf = (g: string) => (opaque(g) ? norm(legend[g] ?? '') : undefined);
  const glyphFor = (hex: string) => {
    const g = Object.keys(legend).find(k => norm(legend[k]) === hex);
    if (g) return g;
    const free = [...GLYPHS].find(k => !(k in legend))!;
    legend[free] = hex;
    return free;
  };
  const sk = glyphFor(skin0), inkG = glyphFor(ink);
  const rows = rows0.map(r => [...r]);
  const at = (r: number, c: number) => colorOf(rows[r]?.[c] ?? '.');
  const isSkin = (r: number, c: number) => { const x = at(r, c); return !!x && skinSet.has(x); };
  // the ear: the leftmost pixel of the darkest tone, and the skin right after it
  let earC = Infinity, earR = -1;
  if (dark) rows.forEach((row, r) => row.forEach((_, c) => { if (at(r, c) === dark && c < earC) { earC = c; earR = r; } }));
  // no ear drawn (long hair over it): the face starts at its leftmost skin
  const firstSkin = Math.min(...rows.map((row, r) => row.findIndex((_, c) => at(r, c) === skin0)).filter(c => c >= 0));
  if (!Number.isFinite(firstSkin)) return { rows: rows0, legend: legend0 };
  const ear = earR < 0 ? firstSkin - 1 : isSkin(earR, earC + 1) && !isSkin(earR, earC + 2) ? earC + 2 : earC + 1;
  const past = rows.map((row, r) => row.filter((_, c) => c > ear && at(r, c) === skin0).length);
  const face = past.map((n, r) => (n ? r : -1)).filter(r => r >= 0);
  // the bottom rows with a single pixel of skin past the ear are the neck under the jaw: not the face
  while (face.length > 1 && past[face[face.length - 1]] < 2) face.pop();
  if (!face.length) return { rows: rows0, legend: legend0 };
  // the eye: its glint and the colours touching it that are neither skin nor ink
  let gl: [number, number] | undefined, best = -1;
  for (const r of face) rows[r].forEach((_, c) => {
    const x = at(r, c);
    if (c <= ear || !x || skinSet.has(x) || x === ink) return;
    const h = parseInt(x.slice(1), 16);
    const lum = ((h >> 16) & 255) + ((h >> 8) & 255) + (h & 255);
    if (lum > best) { best = lum; gl = [r, c]; }
  });
  if (gl) {
    const seen = new Set<string>([gl.join(',')]);
    const todo = [gl];
    let r0 = gl[0], r1 = gl[0], c0 = gl[1], c1 = gl[1];
    while (todo.length) {
      const [r, c] = todo.pop()!;
      r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const R = r + dr, C = c + dc, x = at(R, C);
        if (seen.has(R + ',' + C) || !x || skinSet.has(x) || x === ink || C <= ear) continue;
        seen.add(R + ',' + C); todo.push([R, C]);
      }
    }
    for (let r = r0; r <= r1; r++) for (let c = c0 - 1; c <= c1 + 1; c++) if (opaque(rows[r]?.[c])) rows[r][c] = sk;
  }
  // the hair that covers the face: the commonest colour behind the ear at the face's height (the
  // hair that goes on over it), and, dithered in, the next commonest of the rows above the face
  // that the face's rows also have, close to it in tone (a streak, not a hat, a band or a ribbon)
  const rgb = (g: string) => { const h = parseInt(colorOf(g)!.slice(1), 16); return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; };
  const far = (a: string, b: string) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const hairy = (g: string) => { const x = colorOf(g); return !!x && x !== ink && !skinSet.has(x); };
  const rank = (cells: string[]) => {
    const n = new Map<string, number>();
    for (const g of cells) if (hairy(g)) n.set(g, (n.get(g) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  };
  const above = rank(rows.filter(row => !row.some(g => colorOf(g) === skin0)).flat());
  const hair = rank(face.flatMap(r => rows[r].slice(0, ear + 1)))[0] ?? above[0] ?? sk;
  const atFace = new Set(face.flatMap(r => [...rows0[r]]));
  const hair2 = above.find(g => g !== hair && atFace.has(g) && far(g, hair) <= HAIR_STREAK) ?? hair;
  const half = face[0] + Math.floor(face.length / 2);
  for (const r of face) {
    const row = rows[r];
    const lastOf = () => { for (let c = row.length - 1; c >= 0; c--) if (opaque(row[c])) return c; return -1; };
    for (let n = 0; n < trim; n++) { const l = lastOf(); if (l >= 0) row[l] = '.'; }
    const last = lastOf();
    if (last < 0) continue;
    row[last] = inkG;
    const ch = cheek + (r >= half ? 1 : 0);
    for (let c = ear + 1; c < last - ch; c++) if (opaque(row[c])) row[c] = (c + r) % 3 ? hair : hair2;
  }
  return { rows: rows.map(r => r.join('')), legend };
}
