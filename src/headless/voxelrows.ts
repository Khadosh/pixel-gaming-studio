// Where each row of a drawing on a round shape falls (Khadosh/pixel-gaming-studio#56).
//
// A drawing on a side of a sphere or a cylinder is not laid one unit per
// pixel: its rows are spread over what that side shows, from the top of the
// shape to the bottom (see `paintedOnShape` in voxel.ts), so a row can take
// two rows of the screen, share one with the next, or not show at all. The
// studio found out where by painting every row a color of its own and
// looking, face after face (Khadosh/estudio#98, #131, #167, #280). This is
// that, done by the engine: `voxel debug=filas` swaps every drawing on a
// round shape for one where each row is a color (strong where the drawing
// has ink, pale where the shape shows through), renders the model in every
// turn and numbers, at the margin, the row of the screen each row of the
// drawing lands on, and which do not land at all.
//
// The rows are read back from the pixels, not recomputed: each cell of the
// swapped drawing is a marker naming its box, face and row, and the render
// keeps it as drawn (`glow`), so what is counted is what the render does.

import { PAINT_KEYS, paintFrame, renderVoxel, turnModel, type PaintFace, type VoxelImage, type VoxelModel, type VoxelPaint } from './voxel';
import { blankImage, blit, setPixel, type Rgba } from './png';
import { drawText, textWidth } from './inspect';
import { hexToRgba } from './render';

const MARK = 'filas|';

/** The colors of the rows, in turn: neighbours far apart in hue, so two rows that touch never look alike. */
export const ROW_COLORS = ['#e8413c', '#33c4d6', '#f2c230', '#4a5fe0', '#5cc23a', '#d63fc0', '#f08a28', '#9b6bf2'];

/** A face of a box with a drawing on it, as the model wrote it (before any turn). */
export interface RowFace { box: number; id: string; face: PaintFace; rows: number; at: number }

function inkOf(p: VoxelPaint): boolean[][] {
  if (p.rows) return p.rows.map(r => [...r].map(g => g !== '.' && g !== ' '));
  return (p.pixels ?? []).map(r => r.map(c => !!c));
}

/**
 * The model with every drawing on a side of a round shape swapped for its
 * rows: each cell of the face a marker of its box, face and row, and whether
 * the drawing has ink there (row -1: a top, or the end of a cylinder lying
 * down, laid unit by unit and not numbered). A box that is not round keeps
 * its drawing. `flats` names the boxes with both, where the two share it. Before any turn,
 * so the face is the one the model names.
 */
export function rowsModel(model: VoxelModel): { model: VoxelModel; faces: RowFace[]; flats: string[] } {
  const faces: RowFace[] = [];
  const flats: string[] = [];
  const boxes = model.boxes.map((b, i) => {
    if (!b.shape || !b.paint) return b;
    const paint: NonNullable<typeof b.paint> = {};
    for (const [key, p] of Object.entries(b.paint)) {
      const face = PAINT_KEYS[key];
      if (!p || !face) continue;
      // A top, and the flat end of a cylinder lying down, take the drawing one
      // unit per unit: nothing is spread there, so they are not numbered; they
      // go grey, to show where they take the shape from the side's drawing.
      const flat = face === 'top' || (b.shape === 'cylinder' && (b.axis === 'x' ? /x$/ : b.axis === 'y' ? /y$/ : /^$/).test(face));
      const [W, H] = paintFrame(b, face, p);
      const [ax, ay] = p.at ?? [0, 0];
      const ink = inkOf(p);
      paint[face] = {
        pixels: Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => `${MARK}${i}|${face}|${flat ? -1 : r}|${ink[r - ay]?.[c - ax] ? 1 : 0}`)),
        glow: true,
        ...(p.turns ? { turns: p.turns } : {}),
      };
      if (!flat) faces.push({ box: i, id: b.id ?? `caja ${i}`, face, rows: H, at: ay });
      else flats.push(b.id ?? `caja ${i}`);
    }
    return { ...b, paint };
  });
  // Only the boxes that carry both: a box with a top alone has nothing to number.
  return { model: { ...model, boxes }, faces, flats: [...new Set(flats)].filter(id => faces.some(f => f.id === id)) };
}

/** A pixel's marker, read back: which box, face and row it is, and whether the drawing has ink there. */
export function readMark(c: string | null | undefined): { box: number; face: PaintFace; row: number; ink: boolean } | undefined {
  if (!c?.startsWith(MARK)) return undefined;
  const [box, face, row, ink] = c.slice(MARK.length).split('|');
  return { box: Number(box), face: face as PaintFace, row: Number(row), ink: ink === '1' };
}

/** Where the rows of one face fall in one view: per row, the rows of the screen it takes (top to bottom), empty when it does not show. */
export interface RowsSeen { face: RowFace; screen: number[][] }

/** Reads, off a render, the rows of the screen each row of each face takes. */
export function rowsSeen(img: VoxelImage, faces: RowFace[]): RowsSeen[] {
  const seen = faces.map(face => ({ face, screen: Array.from({ length: face.rows }, () => new Set<number>()) }));
  img.pixels.forEach((row, y) => row.forEach(c => {
    const m = readMark(c);
    if (!m) return;
    seen.find(s => s.face.box === m.box && s.face.face === m.face)?.screen[m.row]?.add(y);
  }));
  return seen.map(s => ({ face: s.face, screen: s.screen.map(ys => [...ys].sort((a, b) => a - b)) }));
}

/** The turns a sheet shows by default: the eight views of a figure. */
export const ALL_TURNS = [0, 45, 90, 135, 180, 225, 270, 315];

/** The model (already swapped by `rowsModel`) drawn in each turn; a turn it cannot take (an eighth of a placed room) is left out and said. */
export function rowsViews(model: VoxelModel, turns: number[]): { views: { turn: number; image: VoxelImage }[]; skipped: string[] } {
  const views: { turn: number; image: VoxelImage }[] = [];
  const skipped: string[] = [];
  for (const turn of turns) {
    try { views.push({ turn, image: renderVoxel(turnModel(model, turn)) }); }
    catch (err) { skipped.push(`giro ${turn}: ${(err as Error).message}`); }
  }
  return { views, skipped };
}

/** A short name of a face for the margin (the font has no "+"): t for the top, y, x, -y, -x for the sides. */
const TAG: Record<PaintFace, string> = { top: 't', '+y': 'y', '+x': 'x', '-y': '-y', '-x': '-x' };

/** How a face is named at the margin: its tag, after a letter of its box when there are several boxes. */
export function faceTags(faces: RowFace[]): string[] {
  const boxes = [...new Set(faces.map(f => f.box))];
  const one = faces.length === 1;
  return faces.map(f => (one ? '' : (boxes.length > 1 ? String.fromCharCode(97 + boxes.indexOf(f.box)) : '') + TAG[f.face]));
}

/** One line per face and view: `0: 3 · 1: 4-5 · 2: 5 …`, and the rows that do not show. */
export function rowsText(views: { turn: number; seen: RowsSeen[] }[], tags: string[]): string[] {
  const lines: string[] = [];
  for (const { turn, seen } of views) {
    seen.forEach((s, k) => {
      const where = s.screen.map((ys, r) => (ys.length ? `${r}→${ys[0] === ys[ys.length - 1] ? ys[0] : `${ys[0]}-${ys[ys.length - 1]}`}` : undefined)).filter(Boolean);
      const hidden = s.screen.map((ys, r) => (ys.length ? -1 : r)).filter(r => r >= 0);
      if (!where.length) return void lines.push(`giro ${turn} · ${s.face.id} ${s.face.face}${tags[k] ? ` (${tags[k]})` : ''}: no se ve`);
      lines.push(`giro ${turn} · ${s.face.id} ${s.face.face}${tags[k] ? ` (${tags[k]})` : ''}: fila→y ${where.join(' ')}${hidden.length ? ` · no se ven: ${compact(hidden)}` : ''}`);
    });
  }
  return lines;
}

/** 3,4,5,9 → 3-5 9. */
function compact(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (ns[j + 1] === ns[j] + 1) j++;
    out.push(i === j ? `${ns[i]}` : `${ns[i]}-${ns[j]}`);
    i = j;
  }
  return out.join(' ');
}

const BACK: [number, number, number, number] = [0x1c, 0x18, 0x22, 255];
const DIM: [number, number, number, number] = [0x8a, 0x80, 0x96, 255];
/** A top, or a flat end, on a box whose side is numbered: grey, so its share of the shape shows. */
const FLAT = '#9a94a4';

function solid(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgba(hex);
  return [r, g, b, 255];
}

function pale(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgba(hex);
  return [Math.round(r * 0.45 + 0x1c * 0.55), Math.round(g * 0.45 + 0x18 * 0.55), Math.round(b * 0.45 + 0x22 * 0.55), 255];
}

/**
 * The sheet: the views side by side on a dark ground, each `scale` times, its
 * turn above it and, at its left, a number per row of the screen a row of a
 * drawing lands on (at the middle of the rows it takes; two that land on the
 * same one share it). A row is its color, strong where the drawing has ink.
 */
export function rowsSheet(views: { turn: number; image: VoxelImage; seen: RowsSeen[] }[], tags: string[], hexOf: (c: string) => string, scale: number): Rgba {
  const px = Math.max(1, Math.floor(scale / 6));
  const perRow = 4;
  const lineH = 6 * px;
  const pad = 4 * px;
  const labelled = views.map(v => {
    const at = new Map<number, string[]>();
    v.seen.forEach((s, k) => s.screen.forEach((ys, r) => {
      if (!ys.length) return;
      const mid = ys[Math.floor((ys.length - 1) / 2)];
      at.set(mid, [...(at.get(mid) ?? []), `${tags[k]}${r}`]);
    }));
    const margin = Math.max(textWidth('00', px), ...[...at.values()].map(l => textWidth(l.join(' '), px))) + pad;
    return { ...v, at, margin };
  });
  const head = lineH + pad;
  const cellW = (v: typeof labelled[number]) => v.margin + v.image.width * scale + pad * 2;
  const bands: (typeof labelled)[] = [];
  for (let i = 0; i < labelled.length; i += perRow) bands.push(labelled.slice(i, i + perRow));
  const bandH = (band: typeof labelled) => head + Math.max(...band.map(v => v.image.height * scale)) + pad * 2;
  const width = Math.max(...bands.map(band => band.reduce((w, v) => w + cellW(v), pad)));
  const height = bands.reduce((h, band) => h + bandH(band), pad);
  const sheet = blankImage(width, height, BACK);
  let y0 = pad;
  for (const band of bands) {
    let x = pad;
    const top = y0 + head;
    for (const v of band) {
      const ox = x + v.margin;
      drawText(sheet, `giro ${v.turn}`, ox, y0, px, DIM);
      const pic = blankImage(v.image.width * scale, v.image.height * scale);
      v.image.pixels.forEach((row, y) => row.forEach((c, cx) => {
        if (!c) return;
        const m = readMark(c);
        const color = !m ? '' : m.row < 0 ? FLAT : ROW_COLORS[m.row % ROW_COLORS.length];
        const rgba: [number, number, number, number] = m ? (m.ink ? solid(color) : pale(color)) : solid(hexOf(c));
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) setPixel(pic, cx * scale + dx, y * scale + dy, rgba);
      }));
      blit(sheet, pic, ox, top);
      for (const [y, names] of v.at) {
        // The first row named there gives the color of the number.
        const r = Number(names[0].replace(/^[a-z-]*/, ''));
        const text = names.join(' ');
        drawText(sheet, text, ox - pad / 2 - textWidth(text, px), top + y * scale + Math.floor((scale - 5 * px) / 2), px, solid(ROW_COLORS[r % ROW_COLORS.length]));
      }
      x += cellW(v);
    }
    y0 += bandH(band);
  }
  return sheet;
}
