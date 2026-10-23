// The transplant: the recipe of a place laid on a new map of the game
// (Khadosh/pixel-gaming-studio#1, option B, Joaquín's call on 23 October 2026).
//
// The game made three maps out of the recipe of a sister map by hand (the high
// summit from the summit, the far bank from the pier, two roots of the pine
// from the first). What they share is the structure: the same steps, with the
// numbers moved. A step that reads the game grid (the cave, its roots, the dark
// past the border) goes as it is; a step that carries positions (the pool at
// [12.5, 9.1], the pier on columns 11 to 13, the shore on row 12.3) has to be
// put again on the new map, and the rule for that is one for every step:
// **anchor it to what the game map says is there.** The game map names its
// tiles (`ground.patches`: `rio`, `orilla_abajo`, `muelle`, `raices_agua`…),
// its walls, its decor and its landmarks, so a position is read on the map it
// came from (what is under it) and looked for on the new one:
//
//   - a cell on a rare tile (a pier, the water of a cave) moves with that tile,
//     at the same place in its box; when the new map has none, the step (or
//     the one item of its list) is not laid, and the answer says why;
//   - a cell next to a piece of decor or a landmark both maps have moves with it;
//   - a cell on a common tile (floor, wall, grass) stays if the new map has the
//     same there, else goes to the nearest cell that has it;
//   - a row or a column alone (a shore across the map) is anchored to the edge
//     of a band (a tile across most of the map) both maps have;
//   - off the map, it keeps its distance to the side it is past.
//
// What each step declares is only which of its fields are positions and of
// what form (TRANSPLANT, below); a step with no entry goes as it is and is
// warned about. Seeds are not structure: `seed` replaces the recipe's, salts
// stay. What the new map has that no step of the recipe paints (the ditch of
// the far bank, which the pier does not have) is said, not invented.
//
// Pure: no files. The command (commands.ts, map_transplant) reads the maps and
// rebases the paths. Read for people in docs/mapas/trasplante.md.

import type { MapRecipe, MapStep } from './maprecipe';
import type { PaintedMap } from './mappaint';

/** What a game map says about each cell: its tile, and the marks (decor, landmarks) standing on cells. */
export interface TileMap {
  width: number;
  height: number;
  /** Row-major tile name of each cell: the ground patch, else "#" for a wall, else the default ground. */
  tiles: string[];
  /** The default ground tile (the most common, which is not a feature). */
  ground: string;
  /** Decor by sprite and landmarks by id, where they stand. */
  marks: { key: string; at: [number, number] }[];
  title?: string;
}

/** The shape of a game map JSON the transplant reads (The Unwritten Dao's: data/world/<map>.json). */
export interface TileMapJson {
  width: number;
  height: number;
  title?: string;
  walls?: [number, number][];
  wall_rects?: [number, number, number, number][];
  ground?: { default?: string; patches?: { tile: string; at: [number, number] }[] };
  decor?: { sprite: string; at: [number, number] }[];
  landmarks?: { id?: string; at: [number, number] }[];
  /** An inline grid (map_from_game with grid=): "#" walls, every other letter its own tile. */
  grid?: string[];
}

const WALL = '#';

/** The tiles of a game map: what the transplant reads a position against. */
export function tileMap(json: TileMapJson): TileMap {
  const { width, height } = json;
  const ground = json.ground?.default ?? '.';
  const tiles = Array<string>(width * height).fill(ground);
  const put = (u: number, v: number, t: string) => { if (u >= 0 && v >= 0 && u < width && v < height) tiles[v * width + u] = t; };
  json.grid?.forEach((row, v) => [...row].forEach((ch, u) => put(u, v, ch === '.' ? ground : ch)));
  for (const [x, y, w, h] of json.wall_rects ?? []) for (let v = y; v < y + h; v++) for (let u = x; u < x + w; u++) put(u, v, WALL);
  for (const [u, v] of json.walls ?? []) put(u, v, WALL);
  for (const p of json.ground?.patches ?? []) put(p.at[0], p.at[1], p.tile);
  const marks = [
    ...(json.decor ?? []).map(d => ({ key: `decor ${d.sprite}`, at: d.at })),
    ...(json.landmarks ?? []).filter(l => l.id).map(l => ({ key: `landmark ${l.id}`, at: l.at })),
  ];
  return { width, height, tiles, ground, marks, ...(json.title ? { title: json.title } : {}) };
}

/** A box of cells, [u0, u1) × [v0, v1). */
interface Box { u0: number; v0: number; u1: number; v1: number }

interface Feature { name: string; cells: [number, number][]; box: Box }

/** Under this share of the cells a tile is a feature (a pier, a pool), not ground. */
const RARE = 0.05;
/** A row (or column) where a tile covers at least this share is part of a band of it. */
const BAND = 0.5;
/** Cells from a mark within which a position moves with it. */
const NEAR_MARK = 1.5;
/** Cells from a side of the map within which a row or a column keeps to the side. */
const SIDE = 1;

function features(m: TileMap): Map<string, Feature> {
  const out = new Map<string, Feature>();
  m.tiles.forEach((t, i) => {
    const u = i % m.width, v = Math.floor(i / m.width);
    let f = out.get(t);
    if (!f) { f = { name: t, cells: [], box: { u0: u, v0: v, u1: u + 1, v1: v + 1 } }; out.set(t, f); }
    f.cells.push([u, v]);
    f.box.u0 = Math.min(f.box.u0, u); f.box.v0 = Math.min(f.box.v0, v);
    f.box.u1 = Math.max(f.box.u1, u + 1); f.box.v1 = Math.max(f.box.v1, v + 1);
  });
  return out;
}

/** The edges of the bands of a tile along one axis: the lines where it starts and ends covering most of the map. */
function bandEdges(m: TileMap, tile: string, axis: 'row' | 'col'): { top: number[]; bottom: number[] } {
  const n = axis === 'row' ? m.height : m.width, across = axis === 'row' ? m.width : m.height;
  const banded = Array.from({ length: n }, (_, k) => {
    let c = 0;
    for (let j = 0; j < across; j++) if (m.tiles[axis === 'row' ? k * m.width + j : j * m.width + k] === tile) c++;
    return c / across >= BAND;
  });
  const top: number[] = [], bottom: number[] = [];
  for (let k = 0; k < n; k++) {
    if (banded[k] && (k === 0 || !banded[k - 1])) top.push(k);
    if (banded[k] && (k === n - 1 || !banded[k + 1])) bottom.push(k + 1);
  }
  return { top, bottom };
}

/** Where x falls in [a0, a1), put in [b0, b1): scaled inside, the same distance past the nearest end outside. */
function along(x: number, a0: number, a1: number, b0: number, b1: number): number {
  if (x < a0) return b0 - (a0 - x);
  if (x > a1) return b1 + (x - a1);
  return b0 + ((x - a0) * (b1 - b0)) / (a1 - a0);
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const fmt = (p: number[]) => `[${p.map(x => round(x)).join(', ')}]`;

type Placed<T> = { value: T; how: string } | { lost: string };

/** Every rule of placing, between the map a recipe was made for and the new one. */
export class Anchors {
  private readonly fs: Map<string, Feature>;
  private readonly ft: Map<string, Feature>;
  constructor(readonly src: TileMap, readonly tgt: TileMap) {
    this.fs = features(src);
    this.ft = features(tgt);
  }

  private tileAt(m: TileMap, u: number, v: number): string { return m.tiles[v * m.width + u]; }
  private rare(t: string): boolean {
    return t !== WALL && t !== this.src.ground && (this.fs.get(t)?.cells.length ?? 0) <= RARE * this.src.width * this.src.height;
  }

  /** A row across the map (or a column down it): the edge of a band both maps have, else the side it is nearest. */
  line(x: number, axis: 'row' | 'col'): Placed<number> {
    // at the edge of the map, or past it, what holds is the side: the wood that frames it, a clump off the shore
    const n = axis === 'row' ? this.src.height : this.src.width;
    if (x < SIDE || x > n - SIDE) return { value: this.side(x, axis === 'row' ? 'v' : 'u'), how: 'the same distance to its side' };
    let best: { d: number; value: number; how: string } | undefined;
    for (const t of this.fs.keys()) {
      if (!this.ft.has(t)) continue;
      const a = bandEdges(this.src, t, axis), b = bandEdges(this.tgt, t, axis);
      for (const side of ['top', 'bottom'] as const) {
        a[side].forEach((e, i) => {
          if (!b[side].length) return;
          const e2 = b[side][Math.min(i, b[side].length - 1)];
          const d = Math.abs(x - e);
          // the ground tile is a band too, but a weak anchor: a real tile wins at the same distance
          const weight = d + (t === this.src.ground ? 0.5 : 0);
          if (!best || weight < best.d) best = { d: weight, value: e2 + (x - e), how: `${side === 'top' ? 'top' : 'bottom'} of the band ${t}` };
        });
      }
    }
    if (best) return { value: best.value, how: best.how };
    return { value: this.side(x, axis === 'row' ? 'v' : 'u'), how: 'distance to the nearest side (no band both maps have)' };
  }

  /** The same distance to the nearest side of the map. */
  private side(x: number, axis: 'u' | 'v'): number {
    const n = axis === 'u' ? this.src.width : this.src.height, n2 = axis === 'u' ? this.tgt.width : this.tgt.height;
    return x < n / 2 ? x : n2 - (n - x);
  }

  /** One coordinate of a thing (a column of a pier, the row of a shadow): the rare tile it is on, else as a line. */
  coord(x: number, axis: 'u' | 'v'): Placed<number> {
    let best: { size: number; f: Feature } | undefined;
    for (const f of this.fs.values()) {
      if (!this.rare(f.name) || !this.ft.has(f.name)) continue;
      const [a0, a1] = axis === 'u' ? [f.box.u0, f.box.u1] : [f.box.v0, f.box.v1];
      if (x < a0 - 1 || x > a1 + 1) continue;
      const size = (f.box.u1 - f.box.u0) * (f.box.v1 - f.box.v0);
      if (!best || size < best.size) best = { size, f };
    }
    if (best) {
      const a = best.f.box, b = this.ft.get(best.f.name)!.box;
      const value = axis === 'u' ? along(x, a.u0, a.u1, b.u0, b.u1) : along(x, a.v0, a.v1, b.v0, b.v1);
      return { value, how: `with ${best.f.name}` };
    }
    return this.line(x, axis === 'u' ? 'col' : 'row');
  }

  /** A point [u, v] in cells. */
  point(u: number, v: number): Placed<[number, number]> {
    const { width: W, height: H } = this.src;
    if (u < 0 || v < 0 || u >= W || v >= H) {
      const nu = u < 0 || u >= W ? this.side(u, 'u') : (u * this.tgt.width) / W;
      const nv = v < 0 || v >= H ? this.side(v, 'v') : (v * this.tgt.height) / H;
      return { value: [nu, nv], how: 'off the map: the same distance to its side' };
    }
    const cu = Math.floor(u), cv = Math.floor(v), t = this.tileAt(this.src, cu, cv);
    if (this.rare(t)) {
      const f = this.ft.get(t);
      if (!f) return { lost: `the new map has no ${t}` };
      const a = this.fs.get(t)!.box, b = f.box;
      return { value: [along(u, a.u0, a.u1, b.u0, b.u1), along(v, a.v0, a.v1, b.v0, b.v1)], how: `with ${t}` };
    }
    // a mark both maps have, one of it on each, next to it
    let mark: { d: number; key: string; at: [number, number] } | undefined;
    for (const m of this.src.marks) {
      const d = Math.hypot(m.at[0] + 0.5 - u, m.at[1] + 0.5 - v);
      if (d > NEAR_MARK || (mark && d >= mark.d)) continue;
      const there = this.tgt.marks.filter(x => x.key === m.key), here = this.src.marks.filter(x => x.key === m.key);
      if (there.length === 1 && here.length === 1) mark = { d, key: m.key, at: m.at };
    }
    if (mark) {
      const to = this.tgt.marks.find(x => x.key === mark!.key)!.at;
      return { value: [u + to[0] - mark.at[0], v + to[1] - mark.at[1]], how: `with the ${mark.key}` };
    }
    if (cu < this.tgt.width && cv < this.tgt.height && this.tileAt(this.tgt, cu, cv) === t) return { value: [u, v], how: `kept (still ${t})` };
    const f = this.ft.get(t);
    if (!f) return { value: [u, v], how: `kept: the new map has no ${t} (by eye)` };
    let near = f.cells[0], dn = Infinity;
    for (const c of f.cells) { const d = Math.hypot(c[0] - cu, c[1] - cv); if (d < dn) { dn = d; near = c; } }
    return { value: [u + near[0] - cu, v + near[1] - cv], how: `to the nearest ${t}` };
  }
}

// ------------------------------------------------------------------ what each step declares

/** One step being laid again: helpers that move its positions and keep the log. */
export class StepMove {
  /** Set when the step itself cannot be laid on the new map. */
  lost?: string;
  readonly moved: string[] = [];
  readonly dropped: string[] = [];
  readonly warnings: string[] = [];
  constructor(readonly a: Anchors, readonly cell: number, readonly lines: Map<string, { from: number; to: number }>) {}

  private log(what: string, from: number[], p: { value: number | number[]; how: string }) {
    const to = Array.isArray(p.value) ? p.value : [p.value];
    if (to.every((x, i) => round(x) === round(from[i]))) return;
    this.moved.push(`${what} ${fmt(from)} → ${fmt(to)} (${p.how})`);
  }

  /** The first two numbers of a tuple are [u, v]: moved in place; false when it could not be laid. */
  point(t: number[], what: string): boolean {
    const p = this.a.point(t[0], t[1]);
    if ('lost' in p) { this.dropped.push(`${what} ${fmt(t.slice(0, 2))}: ${p.lost}`); return false; }
    this.log(what, t.slice(0, 2), p);
    t[0] = round(p.value[0]); t[1] = round(p.value[1]);
    return true;
  }

  /** A point the step cannot do without: the step is lost if it is. */
  need(t: number[], what: string): void {
    if (!this.point(t, what)) this.lost = this.dropped.pop()!;
  }

  /** A list of points (or of tuples starting with one): the ones that cannot be laid leave the list. */
  points<T extends number[]>(list: T[] | undefined, what: string): T[] | undefined {
    if (!list) return list;
    return list.filter((t, i) => this.point(t, `${what}[${i}]`));
  }

  /**
   * The points of a line (a footpath): each one on a tile of its own is laid by it; one with nothing of its own
   * under it goes with the nearest point of its line that has, so the line keeps its shape; and the ones past a
   * point that is not on the new map leave with it (the branch it was part of is not there).
   */
  polyline(list: number[][], what: string): number[][] {
    const placed = list.map(t => {
      const p = this.a.point(t[0], t[1]);
      return 'lost' in p ? { lost: p.lost } : { value: p.value, how: p.how, own: p.how.startsWith('with ') && !p.how.startsWith('with the ') };
    });
    const out: number[][] = [];
    list.forEach((t, i) => {
      const p = placed[i];
      if ('lost' in p) { this.dropped.push(`${what}[${i}] ${fmt(t.slice(0, 2))}: ${p.lost}`); return; }
      let value = p.value, how = p.how;
      if (!p.own) {
        // the nearest point of the line laid by a tile of its own, with no lost point between
        let best: number | undefined;
        for (let d = 1; d < list.length && best === undefined; d++) {
          for (const j of [i - d, i + d]) {
            if (j < 0 || j >= list.length) continue;
            const q = placed[j];
            const between = placed.slice(Math.min(i, j) + 1, Math.max(i, j));
            if (!('lost' in q) && q.own && !between.some(b => 'lost' in b) && !('lost' in q)) { best = j; break; }
          }
        }
        const lostNear = placed.some((b, j) => 'lost' in b && (best === undefined || (j > Math.min(i, best) && j < Math.max(i, best))));
        if (best === undefined && lostNear) { this.dropped.push(`${what}[${i}] ${fmt(t.slice(0, 2))}: it goes on from a part that is not on the new map`); return; }
        if (best !== undefined) {
          const q = placed[best] as { value: [number, number] }, o = list[best];
          value = [t[0] + q.value[0] - o[0], t[1] + q.value[1] - o[1]];
          how = `with its line (point ${best})`;
        }
      }
      this.log(`${what}[${i}]`, t.slice(0, 2), { value, how });
      t[0] = round(value[0]); t[1] = round(value[1]);
      out.push(t);
    });
    return out;
  }

  /** A rectangle [u, v, w, h] (or a box [u0, v0, u1, v1] with `corners`): moved whole with its middle. */
  box(r: number[], what: string, corners = false): boolean {
    const mid = corners ? [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2] : [r[0] + r[2] / 2, r[1] + r[3] / 2];
    const p = this.a.point(mid[0], mid[1]);
    if ('lost' in p) { this.dropped.push(`${what} ${fmt(r)}: ${p.lost}`); return false; }
    const du = p.value[0] - mid[0], dv = p.value[1] - mid[1];
    // a box of cells stays on whole cells
    const ru = corners || Number.isInteger(r[0]) ? Math.round(du) : du, rv = corners || Number.isInteger(r[1]) ? Math.round(dv) : dv;
    const from = r.slice();
    r[0] = round(r[0] + ru); r[1] = round(r[1] + rv);
    if (corners) { r[2] = round(r[2] + ru); r[3] = round(r[3] + rv); }
    this.log(what, from, { value: r.slice(), how: p.how });
    return true;
  }

  /**
   * A band between two lines (null: the side of the picture): what it covered on the old map should be what it
   * covers on the new one. A river at the edge of the map is not a river across it, and no rule turns one into
   * the other: it is said.
   */
  between(b: (string | null)[] | undefined, what: string): void {
    if (!b) return;
    const most = (map: TileMap, side: 'from' | 'to') => {
      const row = (name: string | null, end: number) => (name === null ? end : this.lines.get(name)?.[side]);
      const v0 = row(b[0], 0), v1 = row(b[1], map.height);
      if (v0 === undefined || v1 === undefined) return undefined;
      const count = new Map<string, number>();
      for (let v = Math.max(0, Math.round(v0)); v < Math.min(map.height, Math.round(v1)); v++) {
        for (let u = 0; u < map.width; u++) { const t = map.tiles[v * map.width + u]; count.set(t, (count.get(t) ?? 0) + 1); }
      }
      return [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    };
    const a = most(this.a.src, 'from'), t = most(this.a.tgt, 'to');
    if (a && t && a !== t) this.warnings.push(`${what} [${b.map(x => x ?? 'side').join(', ')}] covered mostly ${a} on the old map and covers mostly ${t} on the new one: the new map is not shaped like this recipe there`);
  }

  /** A coordinate of a thing: u (a column) or v (a row). */
  coord(o: Record<string, unknown> | number[], key: string | number, axis: 'u' | 'v', what: string): void {
    const x = (o as Record<string, unknown>)[key as string];
    if (typeof x !== 'number') return;
    const p = this.a.coord(x, axis) as { value: number; how: string };
    this.log(what, [x], p);
    (o as Record<string, unknown>)[key as string] = round(p.value);
  }

  /** A row across the map (a shore) or a column down it. */
  line(o: Record<string, unknown> | number[], key: string | number, axis: 'row' | 'col', what: string): void {
    const x = (o as Record<string, unknown>)[key as string];
    if (typeof x !== 'number') return;
    const p = this.a.line(x, axis) as { value: number; how: string };
    this.log(what, [x], p);
    (o as Record<string, unknown>)[key as string] = round(p.value);
  }
}

type Step = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- each step has its own schema
type Declare = (s: Step, m: StepMove) => void;

const none: Declare = () => {};

/** A shape of an area or a water step. */
function shape(sh: Step | string | undefined, m: StepMove): void {
  if (!sh || typeof sh !== 'object') return;
  m.between(sh.between, 'shape.between');
  if (sh.rect && !m.box(sh.rect, 'shape.rect')) m.lost = m.dropped.pop();
  if (sh.blobs) { sh.blobs = m.points(sh.blobs, 'shape.blobs'); if (!sh.blobs.length) m.lost = 'no blob of its shape is on the new map'; }
  if (sh.curve) for (const [i, p] of sh.curve.entries()) m.need(p, `shape.curve[${i}]`);
  if (sh.outside?.openings) for (const [i, o] of sh.outside.openings.entries()) m.coord(o, 0, 'v', `shape.outside.openings[${i}]`);
  if (sh.crowns) sh.crowns = m.points(sh.crowns, 'shape.crowns');
  if (sh.gaps) for (const [i, g] of sh.gaps.entries()) m.coord(g, 0, 'v', `shape.gaps[${i}]`);
}

/** Two numbers of a step that are [u, v] together (rootladder: u and bottom). */
function pair(s: Step, ku: string, kv: string, m: StepMove, need = true): void {
  if (typeof s[ku] !== 'number' || typeof s[kv] !== 'number') return;
  const t = [s[ku], s[kv]];
  if (need) m.need(t, `${ku}, ${kv}`); else m.point(t, `${ku}, ${kv}`);
  [s[ku], s[kv]] = t;
}

/** The row of a line of a lines step (the middle of its waves is `at`). */
const lineRow = (m: StepMove, name: string | undefined, side: 'from' | 'to') => (name ? m.lines.get(name)?.[side] : undefined);

/**
 * Which fields of each step are positions, and of what form. The families done
 * first are the roots of the pine and the river bank (the ones measured against
 * their real sister map), with the core steps they use; a step with no entry
 * goes as it is, warned about.
 */
export const TRANSPLANT: Record<string, Declare> = {
  // ---- core
  area: (s, m) => shape(s.shape, m),
  water: (s, m) => shape(s.shape, m),
  path: (s, m) => { if (s.points) { s.points = m.polyline(s.points, 'points'); if (s.points.length < 2) m.lost = 'fewer than two of its points are on the new map'; } },
  scatter: (s, m) => {
    if (s.at) { s.at = m.points(s.at, 'at'); if (!s.at.length) m.lost = 'none of its places is on the new map'; }
    if (s.along) for (const [i, p] of s.along.entries()) m.need(p, `along[${i}]`);
  },
  light: none, material: none, settle: none,
  // ---- raices
  cavern: (s, m) => {
    for (const [i, sh] of (s.shafts ?? []).entries()) {
      // a shaft goes up from a floor cell: [u, from v, to v], anchored at its foot
      const t = [sh[0] + 0.5, Math.max(sh[2], 0) + 0.5];
      if (!m.point(t, `shafts[${i}]`)) { s.shafts[i] = null; continue; }
      const du = Math.round(t[0] - 0.5 - sh[0]), dv = Math.round(t[1] - 0.5 - Math.max(sh[2], 0));
      s.shafts[i] = [sh[0] + du, sh[1] + dv, sh[2] + dv];
    }
    if (s.shafts) s.shafts = s.shafts.filter(Boolean);
  },
  hangroots: none, gloom: none, soften: none,
  carvings: (s, m) => {
    if (s.at) s.at = m.points(s.at, 'at');
    if (s.within && !m.box(s.within.box, 'within.box', true)) delete s.within;
  },
  rootladder: (s, m) => pair(s, 'u', 'bottom', m),
  pool: (s, m) => m.need(s.at, 'at'),
  formation: (s, m) => {
    const before = s.at.slice();
    m.need(s.at, 'at');
    if (m.lost) return;
    // the room of its lit layer goes with it, on whole cells
    const du = Math.round(s.at[0] - before[0]), dv = Math.round(s.at[1] - before[1]);
    s.box = [s.box[0] + du, s.box[1] + dv, s.box[2], s.box[3]];
  },
  // ---- orilla
  lines: (s, m) => {
    for (const [name, l] of Object.entries(s.lines as Record<string, Step>)) {
      const from = l.at;
      m.line(l, 'at', 'row', `lines.${name}.at`);
      m.lines.set(name, { from, to: l.at });
      if (l.slope) m.coord(l.slope, 0, 'u', `lines.${name}.slope`);
    }
  },
  wildwood: (s, m) => {
    if (s.top?.gap) m.coord(s.top.gap, 0, 'u', 'top.gap');
    // the bottom of the wood is px past a line: what stays put is where it ends on the map
    const b = s.bottom;
    if (b?.line && lineRow(m, b.line, 'from') !== undefined) {
      const abs = { v: lineRow(m, b.line, 'from')! + b.at / m.cell };
      m.line(abs, 'v', 'row', 'bottom (line + at)');
      b.at = round((abs.v - lineRow(m, b.line, 'to')!) * m.cell);
    }
  },
  beach: (s, m) => m.between(s.between, 'between'), mudbank: none, meadow: (s, m) => { if (s.odds_below) m.line(s.odds_below, 0, 'row', 'odds_below'); },
  footpath: (s, m) => {
    const parts = Array.isArray(s.parts) ? s.parts : [s.parts];
    const kept = parts.filter((p: Step, i: number) => {
      if (p.points) {
        p.points = m.polyline(p.points, `parts[${i}].points`);
        if (p.points.length < 2) { m.dropped.push(`parts[${i}]: fewer than two of its points are on the new map`); return false; }
        return true;
      }
      if (p.blob) return m.point(p.blob, `parts[${i}].blob`);
      return true;
    });
    if (!kept.length) m.lost = 'no part of it is on the new map';
    s.parts = Array.isArray(s.parts) ? kept : kept[0];
    if (s.avoid?.rows) m.line(s.avoid.rows, 0, 'row', 'avoid.rows');
  },
  pier: (s, m) => {
    // the deck as a box: its middle tells where it goes, its columns go with the tile under it
    const row = (y: Step | number, side: 'from') => (typeof y === 'number' ? y : (lineRow(m, y.line, side) ?? 0) + y.add / m.cell);
    const mid = [(s.x[0] + s.x[2]) / 2, (row(s.y[0], 'from') + row(s.y[1], 'from')) / 2];
    const logged = m.moved.length;
    if (!m.point(mid.slice(), 'deck')) { m.lost = m.dropped.pop(); return; }
    m.moved.length = logged;
    m.coord(s.x, 0, 'u', 'x[0]'); m.coord(s.x, 2, 'u', 'x[2]');
    for (const [i, y] of s.y.entries()) {
      if (typeof y === 'number') m.coord(s.y, i, 'v', `y[${i}]`);
      else m.coord(y, 'at', 'u', `y[${i}].at`);
    }
  },
  rocks: (s, m) => { s.at = m.points(s.at, 'at'); if (!s.at.length) m.lost = 'none of its rocks is on the new map'; },
  reeds: (s, m) => {
    if (s.clumps) {
      if (s.line) for (const [i, c] of s.clumps.entries()) m.coord(c, 0, 'u', `clumps[${i}]`);
      else s.clumps = m.points(s.clumps, 'clumps');
    }
    if (s.not) { m.coord(s.not, 0, 'u', 'not[0]'); m.coord(s.not, 1, 'u', 'not[1]'); }
    for (const [i, k] of (s.rows?.skip ?? []).entries()) { m.coord(k, 0, 'u', `rows.skip[${i}][0]`); m.coord(k, 1, 'u', `rows.skip[${i}][1]`); }
  },
  umbra: (s, m) => {
    if (s.ovals) s.ovals = m.points(s.ovals, 'ovals');
    for (const [i, b] of (s.bands ?? []).entries()) {
      m.coord(b.rows, 0, 'v', `bands[${i}].rows[0]`); m.coord(b.rows, 1, 'v', `bands[${i}].rows[1]`);
      m.coord(b.x, 0, 'u', `bands[${i}].x[0]`); m.coord(b.x, 1, 'u', `bands[${i}].x[1]`);
    }
  },
  shimmer: (s, m) => m.coord(s, 'sun', 'u', 'sun'),
  slabs: (s, m) => m.need(s.blob, 'blob'),
  ditch: (s, m) => { m.coord(s, 'u', 'u', 'u'); m.line(s, 'to', 'row', 'to'); },
  claypan: (s, m) => {
    if (!m.box(s.rect, 'rect', true)) { m.lost = m.dropped.pop(); return; }
    if (s.walk) {
      m.coord(s.walk.rows, 0, 'v', 'walk.rows[0]'); m.coord(s.walk.rows, 1, 'v', 'walk.rows[1]');
      m.coord(s.walk.x, 0, 'u', 'walk.x[0]'); m.coord(s.walk.x, 1, 'u', 'walk.x[1]');
    }
  },
  floodwater: none,
};

// ------------------------------------------------------------------ the transplant

export interface StepReport {
  index: number;
  step: string;
  id?: string;
  /** kept: as it was (it reads the grid); moved: some positions changed; partly: some items left out; lost: not laid; undeclared: went as it was, unread. */
  status: 'kept' | 'moved' | 'partly' | 'lost' | 'undeclared';
  moved: string[];
  dropped: string[];
  why?: string;
}

export interface Transplant {
  recipe: MapRecipe;
  steps: StepReport[];
  /** Tiles of the new map the map the recipe was made for does not have: nothing of the recipe answers to them. */
  unpainted: { tile: string; cells: number }[];
  warnings: string[];
}

export interface TransplantOptions {
  /** The new seed (default the recipe's): a seed is a choice, not structure. */
  seed?: number;
  /** What the recipe's `game` becomes (a path relative to the new recipe, or an inline grid). */
  game: MapRecipe['game'];
  /** The export id of the new map (default the old one). */
  id?: string;
  /** Rebase a path of the recipe (palette, visuals, a stamp's drawing) to the new recipe's folder. */
  rebase?: (p: string) => string;
}

/** Lays a recipe made for one game map on another: what reads the grid as it is, what carries positions anchored again. */
export function transplantRecipe(recipe: MapRecipe, src: TileMap, tgt: TileMap, opts: TransplantOptions): Transplant {
  const a = new Anchors(src, tgt);
  const out = JSON.parse(JSON.stringify(recipe)) as MapRecipe;
  const cell = recipe.cell ?? 16;
  const lines = new Map<string, { from: number; to: number }>();
  const reports: StepReport[] = [];
  const warnings: string[] = [];
  const kept: MapStep[] = [];
  const rebase = opts.rebase ?? ((p: string) => p);
  const gone = new Set<string>();
  out.steps.forEach((step, index) => {
    const s = step as Step;
    const id = typeof s.id === 'string' ? s.id : undefined;
    const declare = TRANSPLANT[s.step];
    const base = { index, step: s.step, ...(id ? { id } : {}) };
    for (const k of ['draw', 'library']) {
      if (typeof s[k] === 'string') s[k] = rebase(s[k]);
      else if (Array.isArray(s[k])) s[k] = s[k].map((p: unknown) => (typeof p === 'string' ? rebase(p) : p));
    }
    if (s.hang && typeof s.hang.draw === 'string') s.hang.draw = rebase(s.hang.draw);
    // a step that reads the mask (or the water) of a step not laid goes with it
    const reads = [...gone].filter(g => refersTo(s, g));
    if (reads.length) {
      reports.push({ ...base, status: 'lost', moved: [], dropped: [], why: `it reads ${reads.join(', ')}, not laid` });
      if (id) gone.add(id);
      return;
    }
    if (!declare) {
      reports.push({ ...base, status: 'undeclared', moved: [], dropped: [] });
      kept.push(step);
      return;
    }
    const m = new StepMove(a, cell, lines);
    declare(s, m);
    if (m.lost) { reports.push({ ...base, status: 'lost', moved: [], dropped: [], why: m.lost }); if (id) gone.add(id); return; }
    warnings.push(...m.warnings.map(w => `${index} ${s.step}: ${w}`));
    reports.push({ ...base, status: m.dropped.length ? 'partly' : m.moved.length ? 'moved' : 'kept', moved: m.moved, dropped: m.dropped });
    kept.push(step);
  });
  out.steps = kept;
  out.game = opts.game;
  if (opts.seed !== undefined) out.seed = opts.seed;
  for (const k of ['palette', 'visuals', 'sprites'] as const) if (typeof out[k] === 'string') out[k] = rebase(out[k]!);
  if (typeof out.lint?.materials === 'string') out.lint.materials = rebase(out.lint.materials);
  if (out.export) {
    if (opts.id) out.export.id = opts.id;
    // the names of the drawings carry the title of the place: the new map's
    if (src.title && tgt.title && out.export.names) {
      for (const [k, v] of Object.entries(out.export.names)) out.export.names[k] = v.split(src.title).join(tgt.title);
    }
    for (const k of ['png', 'txt', 'src', 'game'] as const) if (typeof out.export[k] === 'string') out.export[k] = rebase(out.export[k]!);
  }
  // a variant that names a step not laid would stop the render: said here
  for (const [name, v] of Object.entries(out.variants ?? {})) {
    const named = [...(v.remove ?? []), ...Object.keys(v.set ?? {})].filter(x => gone.has(x));
    if (named.length) warnings.push(`variant ${name} names ${named.join(', ')}, not laid on the new map: edit the variant`);
  }
  const undeclared = reports.filter(r => r.status === 'undeclared').map(r => r.step);
  if (undeclared.length) warnings.push(`went as they were, with no rule for their positions yet: ${[...new Set(undeclared)].join(', ')} (TRANSPLANT in maptransplant.ts)`);
  const fs = features(src), ft = features(tgt);
  const unpainted = [...ft.values()].filter(f => !fs.has(f.name)).map(f => ({ tile: f.name, cells: f.cells.length }));
  return { recipe: out, steps: reports, unpainted, warnings };
}

/** Whether a step names an id anywhere but in its own `id` (a mask it reads, the water it is on). */
function refersTo(v: unknown, id: string, key?: string): boolean {
  if (typeof v === 'string') return key !== 'id' && v === id;
  if (Array.isArray(v)) return v.some(x => refersTo(x, id));
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => refersTo(x, id, k));
  return false;
}

/** What a transplant did, a line per step, for the answer of the command. */
export function transplantText(t: Transplant): string[] {
  const lines: string[] = [];
  for (const r of t.steps) {
    const name = `${r.index} ${r.step}${r.id ? ` (${r.id})` : ''}`;
    if (r.status === 'lost') { lines.push(`${name}: not laid — ${r.why}`); continue; }
    if (r.status === 'undeclared') { lines.push(`${name}: as it was (no rule for its positions)`); continue; }
    if (r.status === 'kept') { lines.push(`${name}: as it was`); continue; }
    lines.push(`${name}: ${r.moved.length} moved${r.dropped.length ? `, ${r.dropped.length} left out` : ''}`);
    for (const x of r.moved) lines.push(`  ${x}`);
    for (const x of r.dropped) lines.push(`  left out: ${x}`);
  }
  if (t.unpainted.length) lines.push(`the new map has what the old one did not, and nothing of the recipe paints it: ${t.unpainted.map(u => `${u.tile} (${u.cells})`).join(', ')}`);
  lines.push(...t.warnings);
  return lines;
}

/** How much of the structure two painted maps share: the share of ground px whose material differs. */
export function compareKinds(a: PaintedMap, b: PaintedMap): { differ: number; share: number; by: [string, number][] } {
  if (a.kind.length !== b.kind.length) throw new Error(`the maps differ in size: ${a.width}x${a.height} and ${b.width}x${b.height} px`);
  let differ = 0;
  const by = new Map<string, number>();
  for (let i = 0; i < a.kind.length; i++) {
    if (a.kind[i] === b.kind[i]) continue;
    differ++;
    const k = `${b.kind[i] || '-'} → ${a.kind[i] || '-'}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  return { differ, share: differ / a.kind.length, by: [...by.entries()].sort((x, y) => y[1] - x[1]) };
}
