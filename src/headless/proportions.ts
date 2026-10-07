// The proportion map: where the lines of a body fall, declared by the project.
//
// PGS has two animation contracts. `body` **draws** a figure with a whole rig;
// `directional` is only kept by importing art made somewhere else. The hole in
// the middle is that nothing says how a body of this project is proportioned,
// so every drawing re-invents it and the engine goes back to guessing.
//
// It guesses badly, and there is a bug to prove it: the anatomy engine took
// whatever sticks out sideways for an arm, so a sword hilt and a gourd got
// swung and the sleeves stayed still. The cure was to stop guessing and be
// able to say it — but `anatomy` says it **per drawing**, as a patch for a
// guess that came out wrong on *that* character. This turns it around: the
// project declares its proportions once and every character is born from them.
//
// Three maps, one thing:
//
//   - `rows`   — the lines down the body, as a fraction of its height: chin,
//                shoulder, sash, hem, boots. Turning does not move your chin,
//                so these hold in every view.
//   - `widths` — the same scale across, **also of the height**: that is what
//                makes it one map and not two. A body's proportions are of its
//                own height the way a canon counts heads, so the same numbers
//                fit a 16x32 chibi and a 48x48 figure, and raising an arm does
//                not change the unit. A profile is narrower **on purpose**, so
//                these hold only facing the camera: a lint that does not know
//                that gives a false red.
//   - `face`   — eyes, hairline and mouth inside the head, as a fraction of
//                the head box, so a face survives a head that grows.
//
// The numbers come from a real study: the game measured a 16×32 chibi row by
// row (`docs/referencia/chibi_proporciones.png`) after losing two passes for
// not having them — the first came out with no arms, the second with the head
// at 44 % of the height. The third came out right because there was a number
// to meet.
//
// Pure: no Node imports, so the app can use it too.

import type { AnatomyConfig, Frame } from '../lib/types';

/** A number to meet, or a range `[min, max]` that nothing inside is wrong. */
export type Band = number | [number, number];

/** Inside the head: fractions of the head box, not of the canvas. */
export interface FaceMap {
  /** Down the head box, 0 at its top: hairline, eyes, mouth. */
  rows?: Record<string, number>;
  /** Across the head box: the eye spacing, the skin box. */
  widths?: Record<string, number>;
}

/**
 * Which named line plays which part for the anatomy engine. The project keeps
 * its own words — the game measured a `menton` and a `faja`, not a neck and a
 * waist — and this says what they are, so the engine can read a map it did not
 * write. `torso` names a **width** (the shoulder); the rest name rows.
 */
export interface ProportionRoles {
  neck?: string;
  waist?: string;
  knee?: string;
  ankle?: string;
  torso?: string;
}

/** Everything but the variants, which is what a variant may override. */
export interface ProportionBase {
  says?: string;
  /**
   * How far off a drawing may be, as a fraction of the side. The slack is
   * never less than one pixel: at 16 px across you cannot be more exact than
   * that, and a rule nobody can meet is noise.
   */
  tolerance?: number;
  /** Down the figure, 0 at the crown and 1 at the soles. */
  rows?: Record<string, number>;
  /** Across the figure. A name that is also a row is measured at that row. */
  widths?: Record<string, number>;
  face?: FaceMap;
  anatomy?: ProportionRoles;
  /**
   * The counts the study makes by hand. `head_of_height` is the head over the
   * whole figure; `head_of_shoulder` is the head over the shoulder, and the
   * game's rule is "never more than 1": on the reference sheet the shoulder is
   * the wider of the two.
   */
  ratios?: Record<string, Band>;
  /**
   * The views where a width means what it says. Default: the pose with no view
   * at all (the `body` contract poses one figure) plus `down` and `up`. A
   * `left` or `right` is a profile and its widths are skipped, with a reason.
   */
  facing?: string[];
  /**
   * The animations the map describes, by role (the view taken off). Default:
   * the idle, and nothing else.
   *
   * A map is the body **standing**. Mid-stride a walk swings an arm out past
   * the shoulder and a sit folds the legs under a torso that now starts a
   * third of the way down the canvas: measuring those against the standing
   * numbers reds a character that is right, the same way measuring a profile
   * does. The idle is also the pose the rest grow from (`animate
   * base_from="idle_{view}"`), so it is the one worth holding to a number.
   */
  poses?: string[];
}

export interface ProportionMap extends ProportionBase {
  /**
   * A map of its own for a size with a name. A 16×32 chibi is not a small
   * adult: at 32 px a face needs five rows, so its head takes a third of the
   * body where the sheet gives it a quarter. Keyed by the names in
   * `visual.sizes`, so an asset of that size picks its map by itself.
   */
  variants?: Record<string, ProportionBase>;
}

/** Half a pixel of slack is no slack; a lint has to be meetable. */
export const DEFAULT_TOLERANCE = 0.04;

/** The views a width is true in, when the map does not say. */
export const FACING = ['', 'down', 'up'];

/** The box a figure actually fills, which is what its proportions are of. */
export interface FigureBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

/** The painted bounds of a frame, or undefined when nothing is painted. */
export function figureBox(frame: Frame): FigureBox | undefined {
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  for (let r = 0; r < frame.length; r++) {
    const row = frame[r];
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue;
      if (r < top) top = r;
      if (r > bottom) bottom = r;
      if (c < left) left = c;
      if (c > right) right = c;
    }
  }
  if (bottom < 0) return undefined;
  return { top, bottom, left, right, height: bottom - top + 1, width: right - left + 1 };
}

/** The whole canvas as a box, for a map read without a drawing in hand. */
export function canvasBox(width: number, height: number): FigureBox {
  return { top: 0, bottom: height - 1, left: 0, right: width - 1, height, width };
}

function mergeRecord<T>(a: Record<string, T> | undefined, b: Record<string, T> | undefined) {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b };
}

/**
 * The base map with a variant folded in, key by key: a variant says only what
 * differs, so a chibi that keeps the hem of the sheet does not restate it.
 */
export function resolveProportions(map: ProportionMap, variant?: string): ProportionBase {
  const v = variant ? map.variants?.[variant] : undefined;
  if (!v) return map;
  return {
    says: v.says ?? map.says,
    tolerance: v.tolerance ?? map.tolerance,
    rows: mergeRecord(map.rows, v.rows),
    widths: mergeRecord(map.widths, v.widths),
    face: v.face || map.face
      ? { rows: mergeRecord(map.face?.rows, v.face?.rows), widths: mergeRecord(map.face?.widths, v.face?.widths) }
      : undefined,
    anatomy: mergeRecord(map.anatomy as Record<string, string>, v.anatomy as Record<string, string>) as ProportionRoles,
    ratios: mergeRecord(map.ratios, v.ratios),
    facing: v.facing ?? map.facing,
  };
}

/** The named lines as rows of the box. 1 is the soles, just past the last row. */
export function rowsIn(map: ProportionBase, box: FigureBox): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, f] of Object.entries(map.rows ?? {})) out[name] = box.top + Math.round(f * box.height);
  return out;
}

/** The named widths in pixels — of the height too, which is the whole point. */
export function widthsIn(map: ProportionBase, box: FigureBox): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, f] of Object.entries(map.widths ?? {})) out[name] = Math.round(f * box.height);
  return out;
}

/**
 * Where the face falls in pixels, given the head box (the crown down to the
 * neck line). Nothing draws it yet — this is the number an expression needs:
 * with the eyes declared, a blink is an operation and not a redrawing.
 */
export function faceIn(map: ProportionBase, box: FigureBox, neckRow: number): { rows: Record<string, number>; widths: Record<string, number> } {
  const h = Math.max(1, neckRow - box.top);
  const rows: Record<string, number> = {};
  for (const [name, f] of Object.entries(map.face?.rows ?? {})) rows[name] = box.top + Math.round(f * h);
  const widths: Record<string, number> = {};
  const headW = widthsIn(map, box)[map.anatomy?.neck ?? ''] ?? box.width;

  for (const [name, f] of Object.entries(map.face?.widths ?? {})) widths[name] = Math.round(f * headW);
  return { rows, widths };
}

/**
 * The map as the anatomy engine's config: the rows it needs and the torso
 * columns, so `animate` stops looking for the neck and the arms in the pixels.
 * This is where the whole thing pays off for the engine.
 */
export function anatomyFrom(map: ProportionBase, box: FigureBox, frame?: Frame): Partial<AnatomyConfig> {
  const rows = rowsIn(map, box);
  const widths = widthsIn(map, box);
  const roles = map.anatomy ?? {};
  const out: Partial<AnatomyConfig> = {};
  if (roles.neck && rows[roles.neck] !== undefined) out.neckRow = rows[roles.neck];
  if (roles.waist && rows[roles.waist] !== undefined) out.waistRow = rows[roles.waist];
  if (roles.knee && rows[roles.knee] !== undefined) out.kneeRow = rows[roles.knee];
  if (roles.ankle && rows[roles.ankle] !== undefined) out.ankleRow = rows[roles.ankle];
  const torso = roles.torso ? widths[roles.torso] : undefined;
  if (torso) {
    // Where the body's middle is: the span at the shoulder line, if there is a
    // drawing to look at. The box's own midpoint is pulled off centre by
    // whatever hangs out to one side — which is the very mistake the map is
    // here to stop.
    const rough = Math.round((box.left + box.right) / 2);
    const shoulder = frame && roles.torso !== undefined ? spanAt(frame, rows[roles.torso], rough) : undefined;
    const center = shoulder ? Math.round((shoulder.left + shoulder.right) / 2) : rough;
    out.torsoCenterCol = center;
    out.torsoLeft = Math.max(box.left, center - Math.floor((torso - 1) / 2));
    out.torsoRight = Math.min(box.right, out.torsoLeft + torso - 1);
  }
  return out;
}

/**
 * The map as the knobs of a drawn figure (`figure.ts`): how many heads tall
 * the body is. This is what makes twenty characters look like the same sect —
 * they come out of one map instead of twenty drawings, and it is the number
 * the game lost a pass to (the second chibi had the head at 44 % of the
 * height, which is 2.3 heads, and nobody had written down that it should not).
 *
 * Only `heads`, on purpose: it is the one knob the map defines exactly. The
 * rig's shoulder is a radius in its own 3D frame, not a fraction of a canvas,
 * so turning `widths.hombro` into `build.shoulders` would be a guess — and a
 * guess dressed as a number is what this whole thing exists to stop.
 */
export function buildFrom(map: ProportionBase): { heads?: number } {
  const head = bandMid(map.ratios?.head_of_height);
  if (!head || head <= 0) return {};
  return { heads: round2(1 / head) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bandMid(b: Band | undefined): number | undefined {
  if (b === undefined) return undefined;
  return typeof b === 'number' ? b : (b[0] + b[1]) / 2;
}

/** Is this view one where a width means what it says? */
export function facesCamera(view: string, map: ProportionBase): boolean {
  return (map.facing ?? FACING).includes(view);
}

export interface ProportionCheck {
  /** What was measured, in the project's own words. */
  what: string;
  /** What the map asks for. */
  want: string;
  /** What the drawing has. */
  got: string;
  ok: boolean;
}

export interface ProportionReport {
  checks: ProportionCheck[];
  /** Checks not run, and why — a skipped check said out loud is not a pass. */
  skipped: { what: string; why: string }[];
}

/**
 * The body's span at one row: the unbroken run of paint that the figure's
 * middle passes through, not the leftmost and rightmost pixel of the row.
 *
 * This is the lesson of the bug the map was written for. A sword on the back
 * and a gourd at the hip stick out past the body, and a lint that measures
 * edge to edge calls a 6 px neck a 10 px neck because of a hilt two columns
 * away. The run through the middle is the body; whatever floats beside it is
 * luggage. When the middle column is bare (two legs with air between them) it
 * falls back to the whole span, which is then what the row is.
 */
export function spanAt(frame: Frame, row: number, center?: number): { left: number; right: number } | undefined {
  const r = frame[row];
  if (!r) return undefined;
  let left = -1, right = -1;
  const runs: { left: number; right: number }[] = [];
  for (let c = 0; c < r.length; c++) {
    if (r[c]) {
      if (left < 0) left = c;
      right = c;
      if (runs.length && runs[runs.length - 1].right === c - 1) runs[runs.length - 1].right = c;
      else runs.push({ left: c, right: c });
    }
  }
  if (left < 0) return undefined;
  if (center !== undefined) {
    const mid = runs.find(run => center >= run.left && center <= run.right);
    if (mid) return mid;
  }
  return { left, right };
}

function widestBetween(frame: Frame, from: number, to: number, center: number): number {
  let best = 0;
  for (let r = Math.max(0, from); r <= Math.min(frame.length - 1, to); r++) {
    const s = spanAt(frame, r, center);
    if (s) best = Math.max(best, s.right - s.left + 1);
  }
  return best;
}

/**
 * Does this drawing keep the map? The vertical lines are checked in every
 * view; the widths and the count made of them only facing the camera, because
 * of the one thing the game found out about control: **the two counts only
 * hold from the front.** A profile's shoulder is narrower on purpose, so a
 * lint that checks it there reds a drawing that is right.
 */
export function checkProportions(frame: Frame, map: ProportionBase, view = ''): ProportionReport {
  const checks: ProportionCheck[] = [];
  const skipped: { what: string; why: string }[] = [];
  const box = figureBox(frame);
  if (!box) return { checks, skipped: [{ what: 'proporciones', why: 'the frame is empty' }] };

  const rows = rowsIn(map, box);
  const widths = widthsIn(map, box);
  const front = facesCamera(view, map);
  const tol = map.tolerance ?? DEFAULT_TOLERANCE;
  const slackX = Math.max(1, Math.round(tol * box.height));
  const center = Math.round((box.left + box.right) / 2);
  const profile = view ? `a ${view} is a profile and its widths are narrower on purpose` : 'this view does not face the camera';

  for (const [name, want] of Object.entries(widths)) {
    const row = rows[name];
    if (row === undefined) {
      skipped.push({ what: `ancho ${name}`, why: `"${name}" is a width with no row of the same name to measure it at` });
      continue;
    }
    if (!front) { skipped.push({ what: `ancho ${name}`, why: profile }); continue; }
    const span = spanAt(frame, row, center);
    if (!span) {
      checks.push({ what: `ancho ${name}`, want: `${want} px (row ${row})`, got: 'nothing painted', ok: false });
      continue;
    }
    const got = span.right - span.left + 1;
    checks.push({
      what: `ancho ${name}`,
      want: `${want} px ±${slackX} (row ${row})`,
      got: `${got} px`,
      ok: Math.abs(got - want) <= slackX,
    });
  }

  const neckName = map.anatomy?.neck;
  const neckRow = neckName ? rows[neckName] : undefined;

  const hoh = map.ratios?.head_of_height;
  if (hoh !== undefined) {
    if (neckRow === undefined) {
      skipped.push({ what: 'cabeza/alto', why: 'the map does not say which line is the neck (anatomy.neck)' });
    } else {
      const got = (neckRow - box.top) / box.height;
      checks.push(ratioCheck('cabeza/alto', got, hoh, tol));
    }
  }

  const hos = map.ratios?.head_of_shoulder;
  if (hos !== undefined) {
    const shoulderName = map.anatomy?.torso;
    const shoulderRow = shoulderName ? rows[shoulderName] : undefined;
    if (neckRow === undefined || shoulderRow === undefined) {
      skipped.push({ what: 'cabeza/hombro', why: 'the map needs anatomy.neck and anatomy.torso as named rows' });
    } else if (!front) {
      skipped.push({ what: 'cabeza/hombro', why: profile });
    } else {
      const head = widestBetween(frame, box.top, neckRow - 1, center);
      const span = spanAt(frame, shoulderRow, center);
      const shoulder = span ? span.right - span.left + 1 : 0;
      if (!head || !shoulder) {
        checks.push({ what: 'cabeza/hombro', want: band(hos), got: 'nothing painted', ok: false });
      } else {
        checks.push(ratioCheck('cabeza/hombro', head / shoulder, hos, tol, `${head}/${shoulder} px`));
      }
    }
  }

  if (map.face?.rows && neckRow !== undefined) {
    const face = faceIn(map, box, neckRow);
    for (const [name, row] of Object.entries(face.rows)) {
      checks.push({
        what: `faccion ${name}`,
        want: `inside the head (rows ${box.top}–${neckRow - 1})`,
        got: `row ${row}`,
        ok: row >= box.top && row < neckRow,
      });
    }
  }

  return { checks, skipped };
}

function band(b: Band): string {
  return typeof b === 'number' ? b.toFixed(2) : `${b[0].toFixed(2)}–${b[1].toFixed(2)}`;
}

function ratioCheck(what: string, got: number, want: Band, tol: number, note?: string): ProportionCheck {
  const ok = typeof want === 'number'
    ? Math.abs(got - want) <= tol
    : got >= want[0] && got <= want[1];
  return {
    what,
    want: typeof want === 'number' ? `${want.toFixed(2)} ±${tol.toFixed(2)}` : band(want),
    got: `${got.toFixed(2)}${note ? ` (${note})` : ''}`,
    ok,
  };
}

/** The checks a report failed, as one line each. */
export function proportionWarnings(r: ProportionReport): string[] {
  return r.checks.filter(c => !c.ok).map(c => `${c.what}: asks ${c.want}, has ${c.got}`);
}
