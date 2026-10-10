// The style lint of a painted map ground (the rules of The Unwritten Dao's
// docs/diseno/estilo_mapas.md, the same as its core/world/estilo_mapa.gd), so a
// drawing script can check its ground before the game ever loads it:
//
// - alpha is 0 or 255 (no soft edge) and, on a ground, no hole inside the map;
// - only colors of the palette;
// - no border between two materials (grass, earth, stone, water…) that runs
//   straight along a row or a column for more than `max_straight` px: the grid
//   does not show (`architecture` skips this one: walls and boards are straight);
// - variety: no more than a third of the cells identical to all their neighbours;
// - no blurred border: lone pixels of a material inside another (the dither of a
//   soft brush) stay under `max_loose` of the material changes. A one-pixel
//   diagonal line is a line, not a dither.
//
// Materials are named groups of hex colors; a color in no group is an accent
// (a flower, a spark, an outline) and takes the material of its left neighbour
// (or the first one to its right).

import type { Rgba } from './png';

export interface MapLintArea { x: number; y: number; w: number; h: number }

export interface MapLintOptions {
  /** The map inside the picture, in px (default: the whole picture). */
  area?: MapLintArea;
  /** Allowed "#rrggbb" colors; none = no palette check. */
  palette?: string[];
  /** Material name → its "#rrggbb" colors. */
  materials?: Record<string, string[]>;
  /** A ground (not a layer): shape rules and no holes. Default true. */
  ground?: boolean;
  /** Straight walls are fine (an interior, a stone terrace). */
  architecture?: boolean;
  cell?: number;
  /** Longest straight border, px (default 2 cells). */
  maxStraight?: number;
  /** Lone pixels allowed, as a fraction of the material changes (default 0.025). */
  maxLoose?: number;
  /** Picture px (1 = left out) that the shape rules skip: no straight border or lone pixel is counted on them
   *  (the sky around an island, a cliff face drawn straight on purpose). Same size as the picture. */
  ignore?: Uint8Array;
}

export interface MapLintReport {
  problems: string[];
  /** Material changes and lone pixels inside the area (the blur rule). */
  changes: number;
  loose: number;
  /** Straight borders found, each [x, y, 'vertical' | 'horizontal'] in picture px. */
  straight: [number, number, string][];
  /** map_lint of a recipe, on its ground: the stamps that stand on a base all of ink (settle takes it out). */
  closedInk?: { closed: number; total: number; share: number; ids: string[] };
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

function hexAt(img: Rgba, x: number, y: number): string {
  const i = (y * img.width + x) * 4;
  return `#${hex2(img.data[i])}${hex2(img.data[i + 1])}${hex2(img.data[i + 2])}`;
}

const alphaAt = (img: Rgba, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

/** The material of each pixel of the area (index into the material list; an accent takes its left neighbour's;
 *  -2 = left out by `ignore`, never a material and never borrowed). */
export function materialGrid(img: Rgba, area: MapLintArea, materials: Record<string, string[]>, ignore?: Uint8Array): Int32Array[] {
  const of = new Map<string, number>();
  Object.values(materials).forEach((list, i) => list.forEach(h => of.set(h.toLowerCase().slice(0, 7), i)));
  const grid: Int32Array[] = [];
  for (let y = area.y; y < area.y + area.h; y++) {
    const row = new Int32Array(area.w);
    let first = -1;
    for (let x = area.x; x < area.x + area.w; x++) {
      if (ignore && ignore[y * img.width + x]) { row[x - area.x] = -2; continue; }
      const m = alphaAt(img, x, y) > 127 ? (of.get(hexAt(img, x, y)) ?? -1) : -1;
      row[x - area.x] = m;
      if (first < 0 && m >= 0) first = m;
    }
    let last = first;
    for (let i = 0; i < row.length; i++) {
      if (row[i] === -2) continue;
      if (row[i] < 0) row[i] = last; else last = row[i];
    }
    grid.push(row);
  }
  return grid;
}

function straightBorders(grid: Int32Array[], area: MapLintArea, max: number): [number, number, string][] {
  const out: [number, number, string][] = [];
  const hh = grid.length, ww = area.w;
  for (let x = 0; x < ww - 1; x++) {
    let run = 0, pair = -1;
    for (let y = 0; y < hh; y++) {
      const a = grid[y][x], b = grid[y][x + 1];
      if (a !== b && a >= 0 && b >= 0) {
        const p = a * 16 + b;
        run = p === pair ? run + 1 : 1;
        pair = p;
        if (run === max + 1) out.push([area.x + x, area.y + y - max, 'vertical']);
      } else { run = 0; pair = -1; }
    }
  }
  for (let y = 0; y < hh - 1; y++) {
    let run = 0, pair = -1;
    for (let x = 0; x < ww; x++) {
      const a = grid[y][x], b = grid[y + 1][x];
      if (a !== b && a >= 0 && b >= 0) {
        const p = a * 16 + b;
        run = p === pair ? run + 1 : 1;
        pair = p;
        if (run === max + 1) out.push([area.x + x - max, area.y + y, 'horizontal']);
      } else { run = 0; pair = -1; }
    }
  }
  return out;
}

function sameCells(img: Rgba, area: MapLintArea, cell: number): [number, number] {
  const cols = Math.floor(area.w / cell), rows = Math.floor(area.h / cell);
  if (cols < 2 || rows < 2) return [0, cols * rows];
  const sig: string[][] = [];
  for (let cy = 0; cy < rows; cy++) {
    const row: string[] = [];
    for (let cx = 0; cx < cols; cx++) {
      const parts: string[] = [];
      for (let y = 0; y < cell; y++) {
        const i = ((area.y + cy * cell + y) * img.width + area.x + cx * cell) * 4;
        parts.push(Buffer.from(img.data.subarray(i, i + cell * 4)).toString('hex'));
      }
      row.push(parts.join(''));
    }
    sig.push(row);
  }
  let same = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (sig[ny][nx] !== sig[cy][cx]) { all = false; break; }
        }
      }
      if (all) same++;
    }
  }
  return [same, cols * rows];
}

/** [material changes, lone pixels] of the area: a drawn border has few islands, a dithered one many. */
export function fringes(grid: Int32Array[]): [number, number] {
  const hh = grid.length, ww = hh ? grid[0].length : 0;
  let changes = 0, loose = 0;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < ww; x++) {
      const v = grid[y][x];
      if (v < 0) continue;
      if (x + 1 < ww && grid[y][x + 1] >= 0 && grid[y][x + 1] !== v) changes++;
      if (y + 1 < hh && grid[y + 1][x] >= 0 && grid[y + 1][x] !== v) changes++;
      if (x > 0 && y > 0 && x + 1 < ww && y + 1 < hh && grid[y][x - 1] !== v && grid[y][x + 1] !== v
        && grid[y][x - 1] !== -2 && grid[y][x + 1] !== -2 && grid[y - 1][x] !== -2 && grid[y + 1][x] !== -2
        && grid[y - 1][x] !== v && grid[y + 1][x] !== v) {
        const nw = grid[y - 1][x - 1] === v, ne = grid[y - 1][x + 1] === v;
        const sw = grid[y + 1][x - 1] === v, se = grid[y + 1][x + 1] === v;
        const line = (nw && se && !ne && !sw) || (ne && sw && !nw && !se);
        if (!line) loose++;
      }
    }
  }
  return [changes, loose];
}

export function mapLint(img: Rgba, opts: MapLintOptions = {}): MapLintReport {
  const area = opts.area ?? { x: 0, y: 0, w: img.width, h: img.height };
  const cell = opts.cell ?? 16;
  const ground = opts.ground ?? true;
  const problems: string[] = [];
  if (area.x < 0 || area.y < 0 || area.x + area.w > img.width || area.y + area.h > img.height) {
    return { problems: [`the area ${area.w}x${area.h} at ${area.x},${area.y} does not fit in the ${img.width}x${img.height} picture`],
      changes: 0, loose: 0, straight: [] };
  }
  const allowed = opts.palette ? new Set(opts.palette.map(h => h.toLowerCase().slice(0, 7))) : null;
  let semi = 0, holes = 0;
  const off = new Map<string, number>();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const a = alphaAt(img, x, y);
      if (a > 0 && a < 255) semi++;
      if (a === 0) {
        if (ground && x >= area.x && y >= area.y && x < area.x + area.w && y < area.y + area.h) holes++;
        continue;
      }
      const h = hexAt(img, x, y);
      if (allowed && !allowed.has(h)) off.set(h, (off.get(h) ?? 0) + 1);
    }
  }
  if (semi) problems.push(`${semi} semi-transparent pixels (alpha must be 0 or 255)`);
  if (holes) problems.push(`${holes} transparent pixels inside the map`);
  if (off.size) problems.push(`colors off the palette: ${[...off.keys()].slice(0, 6).join(', ')}`);
  let straight: [number, number, string][] = [];
  let changes = 0, loose = 0;
  if (ground && opts.materials) {
    const grid = materialGrid(img, area, opts.materials, opts.ignore);
    const max = opts.maxStraight ?? 2 * cell;
    if (!opts.architecture) {
      straight = straightBorders(grid, area, max);
      for (const [x, y, dir] of straight.slice(0, 8)) problems.push(`straight ${dir} border longer than ${max} px at x=${x}, y=${y}`);
      if (straight.length > 8) problems.push(`… and ${straight.length - 8} more straight borders`);
    }
    [changes, loose] = fringes(grid);
    const maxLoose = opts.maxLoose ?? 0.025;
    if (changes > 0 && loose > maxLoose * changes) {
      problems.push(`${loose} lone pixels in ${changes} material changes: blurred border (limit ${(maxLoose * 100).toFixed(1)}%)`);
    }
  }
  if (ground) {
    const [same, total] = sameCells(img, area, cell);
    if (same * 3 > total) problems.push(`${same} of ${total} cells identical to their neighbours (more than a third)`);
  }
  return { problems, changes, loose, straight };
}
