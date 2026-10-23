// Writing fewer columns in a text drawing (Khadosh/pixel-gaming-studio#27):
// a frame that comes from another one (`== blink 1 < blink 0`, then only the
// rows that change), a frame written by its left half (`half: left`) and a
// whole animation that is another one mirrored (`anim: walk_left
// mirror_of=walk_right`). `ascii.ts` reads and writes them; this file is the
// arithmetic both directions share, so what `toAscii` writes back is exactly
// what `fromAscii` will rebuild. Pure, no Node: the web editor saves through
// it too.

import type { AnimationDef, Frame } from '../lib/types';

/** How a frame comes from an earlier one: mirrored, then shifted, then these rows. */
export interface FrameDerivation {
  /** The reference as it was written after "<" ("blink 0", "3"), for writing it back the same. */
  ref: string;
  /** Index (in the asset) of the frame it comes from; always an earlier one. */
  from: number;
  flip?: 'h' | 'v';
  shift?: [number, number];
  /** Rows the text listed ("N: …"), in the order written. */
  rows: number[];
}

/** Width of the half of a row that `half: left` writes: the middle column is the left half's. */
export function halfWidth(width: number): number {
  return Math.ceil(width / 2);
}

/** A row written by its left half, completed by its mirror. */
export function mirrorHalf(half: number[], width: number): number[] {
  const row = new Array<number>(width).fill(0);
  half.forEach((v, x) => { row[x] = v; row[width - 1 - x] = v; });
  return row;
}

/** Whether a row reads the same from either end (so `half: left` can hold it). */
export function symmetricRow(row: number[]): boolean {
  for (let x = 0, w = row.length; x < w / 2; x++) if (row[x] !== row[w - 1 - x]) return false;
  return true;
}

export function flipFrame(grid: Frame, flip: 'h' | 'v'): Frame {
  return flip === 'h' ? grid.map(row => [...row].reverse()) : [...grid].reverse().map(row => [...row]);
}

/** Moves the picture by (dx, dy); what leaves the canvas is lost, what it uncovers is clear. */
export function shiftFrame(grid: Frame, dx: number, dy: number): Frame {
  const h = grid.length, w = grid[0]?.length ?? 0;
  const out: Frame = Array.from({ length: h }, () => new Array<number>(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x + dx, ny = y + dy;
      if (grid[y][x] && nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny][nx] = grid[y][x];
    }
  }
  return out;
}

/** The frame a derivation starts from, before its own rows: the reference mirrored and shifted. */
export function derivedBase(ref: Frame, d: Pick<FrameDerivation, 'flip' | 'shift'>): Frame {
  let out = ref.map(row => [...row]);
  if (d.flip) out = flipFrame(out, d.flip);
  if (d.shift) out = shiftFrame(out, d.shift[0], d.shift[1]);
  return out;
}

export function sameRow(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function sameFrame(a: Frame, b: Frame): boolean {
  return a.length === b.length && a.every((row, y) => sameRow(row, b[y]));
}

/** What `toAscii` needs to write a drawing short: the same three things a text can say. */
export interface CompactLayout {
  derived: Record<number, FrameDerivation>;
  half: number[];
  mirrors: Record<string, string>;
}

/**
 * The shortest way to write frames that are already drawn whole
 * (`to_ascii compact=true`): an animation that is another one mirrored becomes
 * `mirror_of=`, a frame that is close to one above (as it is, mirrored, or
 * moved one px) lists only the rows that change, and a symmetric frame or set
 * of rows is written by its left half. Each form is taken only where it is
 * shorter than the frame written whole, so a drawing with nothing repeated
 * comes out the same. Only how the text says it changes: `fromAscii` rebuilds
 * the same pixels.
 */
export function compactLayout(grids: Frame[], animations: AnimationDef[]): CompactLayout {
  const height = grids[0]?.length ?? 0, width = grids[0]?.[0]?.length ?? 0;
  const hw = halfWidth(width);
  const out: CompactLayout = { derived: {}, half: [], mirrors: {} };

  // Mirrors, under the rule toAscii keeps them by: their frames are the last
  // ones, in order, each in that animation alone, and come from frames above
  // them. An option the mirror lacks would come from the other one, so they
  // have to agree on those.
  const uses = new Map<number, number>();
  for (const a of animations) for (const f of a.frameIndices) uses.set(f, (uses.get(f) ?? 0) + 1);
  const inherits = (a: AnimationDef, src: AnimationDef) =>
    (['fps', 'loop', 'durations'] as const).every(k => a[k] !== undefined || src[k] === undefined) &&
    (a.label !== a.name.toUpperCase() || src.label === src.name.toUpperCase());
  let pairs: { a: AnimationDef; src: AnimationDef }[] = [];
  for (const a of animations) {
    if (!a.frameIndices.length || pairs.some(p => p.src === a)) continue;
    const src = animations.find(s => s !== a && !pairs.some(p => p.a === s) && s.frameIndices.length === a.frameIndices.length &&
      s.frameIndices.every(f => f < Math.min(...a.frameIndices)) && inherits(a, s) &&
      a.frameIndices.every((f, i) => sameFrame(grids[f], flipFrame(grids[s.frameIndices[i]], 'h'))));
    if (src) pairs.push({ a, src });
  }
  const fits = (ps: typeof pairs) => {
    const names = new Set(ps.map(p => p.a.name));
    const tail = ps.flatMap(p => p.a.frameIndices), first = grids.length - tail.length;
    return tail.every((f, i) => f === first + i && uses.get(f) === 1) &&
      ps.every(p => !names.has(p.src.name) && p.src.frameIndices.every(f => f < first));
  };
  while (pairs.length && !fits(pairs)) pairs = pairs.slice(1);
  const omitted = new Set<number>();
  for (const { a, src } of pairs) {
    out.mirrors[a.name] = src.name;
    for (const f of a.frameIndices) omitted.add(f);
  }

  // Every row of every frame as a key, mirrored or not and moved -1, 0 or 1 px
  // across; a move up or down is a shift of rows, so comparing two frames is
  // comparing keys row by row.
  const blank = new Array<number>(width).fill(0).join(',');
  const moves: { flip?: 'h'; dx: number }[] = [];
  for (const flip of [undefined, 'h' as const]) for (const dx of [0, -1, 1]) moves.push({ flip, dx });
  const keys = grids.map(g => moves.map(m => derivedBase(g, { flip: m.flip, shift: m.dx ? [m.dx, 0] : undefined }).map(r => r.join(','))));
  const plain = grids.map(g => g.map(r => r.join(',')));
  const symmetric = grids.map(g => g.map(symmetricRow));
  const slot = (f: number) => {
    for (const a of animations) {
      const pos = a.frameIndices.indexOf(f);
      if (pos >= 0) return `${a.name} ${pos}`;
    }
    return String(f);
  };
  // Characters each way would take, newlines included (close enough to choose).
  const rowsCost = (f: number, rows: number[]) => {
    const byHalf = rows.length > 0 && rows.every(y => symmetric[f][y]);
    const whole = rows.reduce((n, y) => n + String(y).length + 3 + width, 0);
    const half = 11 + rows.reduce((n, y) => n + String(y).length + 3 + hw, 0);
    return byHalf && half < whole ? { cost: half, byHalf } : { cost: whole, byHalf: false };
  };

  for (let f = 0; f < grids.length; f++) {
    if (omitted.has(f)) continue;
    const allSymmetric = symmetric[f].every(Boolean);
    let best = allSymmetric && 11 + height * (hw + 1) < height * (width + 1)
      ? { cost: 11 + height * (hw + 1), byHalf: true, d: undefined as FrameDerivation | undefined }
      : { cost: height * (width + 1), byHalf: false, d: undefined as FrameDerivation | undefined };
    for (let g = f - 1; g >= 0; g--) {
      if (omitted.has(g)) continue;
      const ref = slot(g);
      moves.forEach((m, mi) => {
        for (const dy of [0, -1, 1]) {
          const rows: number[] = [];
          for (let y = 0; y < height; y++) {
            const from = y - dy;
            const base = from >= 0 && from < height ? keys[g][mi][from] : blank;
            if (base !== plain[f][y]) rows.push(y);
          }
          const shift: [number, number] | undefined = m.dx || dy ? [m.dx, dy] : undefined;
          const head = 4 + ref.length + (m.flip ? 8 : 0) + (shift ? 8 + shift.join(',').length : 0);
          const r = rowsCost(f, rows);
          if (head + r.cost < best.cost) best = { cost: head + r.cost, byHalf: r.byHalf, d: { ref, from: g, flip: m.flip, shift, rows } };
        }
      });
    }
    if (best.d) out.derived[f] = best.d;
    if (best.byHalf) out.half.push(f);
  }
  return out;
}
