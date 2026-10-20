// Voxels to isometric pixel art (the studio, 19–20 Oct 2026).
//
// The studio needs furniture and rooms in isometric, and the question it asked
// first was whether furniture modelled as boxes and projected comes out as
// pixel art or as a shrunk 3D render. A model is a list of boxes, each of a
// material; a material says the tone of each face the 2:1 projection shows
// (top, left, right), always palette colors by name; and the pass that makes it
// drawn is what a pixel artist does by hand to a box — one tone per face, a
// contour of one pixel, a line where one thing stands in front of another, and
// a lighter rim where the top meets a side.
//
// A room is the same thing: a floor is a slab with tiles on its top, a wall is
// a box with height, a door is the gap between two, and the wall nearest to
// the viewer is cut low so the room can be seen. The geometry is world boxes
// and nothing else; the projection lives here, so a second projection would
// read the same models. What stands between two walls — a person, a piece of
// furniture drawn by hand — is the game's to place, so a model can be split in
// **layers** (`box.layer`) rendered on one shared canvas: the back of the room
// behind, the cut front wall in front, and the game puts the rest between.
//
// The projection is the classic 2:1 one: one world unit along x moves one
// pixel right and half a pixel down, along y one pixel left and half down,
// along z one pixel up. A box 16 wide is a 32 px diamond; edges come out as
// clean two-to-one steps because every pixel samples its center.
//
// The light: the faces take their tones from the material, which is written
// for a light from the upper left (top lightest, left in the middle, right
// darkest). A light from the upper right swaps the sides. With `shadows`, a
// point of a face that cannot see the light through the other boxes takes the
// next darker tone: a wall darkens the floor at its foot, a desk the floor
// under it.
//
// A face can carry a drawing (`box.paint`): a poster, a screen, the glass of a
// pinball, a face on a head. One unit of the face per pixel of the drawing,
// projected like the rest; the drawing takes the light of its face (see
// `VoxelPaint`) and turns with its box.
//
// Pure: no Node imports.

export interface VoxelTile {
  /** Tile size along x and y, in units: a joint every this many. */
  size: [number, number];
  /** Tone of every other tile, as on a checkerboard. */
  alt?: string;
  /** Tone of the joint line between tiles. */
  joint?: string;
  /** Tone of the joint in shadow, so the floor reads on under it (default: the right tone of the material). */
  shadeJoint?: string;
}

export interface VoxelMaterial {
  /** Tone of the face that looks up. */
  top: string;
  /** Tone of the face that looks down-left (+y). */
  left: string;
  /** Tone of the face that looks down-right (+x). */
  right: string;
  /** Rim where the top meets a side, toward the viewer (optional). */
  edge?: string;
  /** Tone of the top in shadow (default: the left tone). */
  shade?: string;
  /** Tiles on the top face: a floor. */
  tile?: VoxelTile;
  /** Lets the light through: glass casts no shadow, so a window throws its patch of sun on the floor. */
  clear?: boolean;
}

/**
 * A drawing on one face of a box, one unit of the face per pixel. Row 0 is the
 * top of a side and the far edge (-y) of the top; columns run left to right as
 * the face is seen from outside (on the left side, +y, along +x; on the right
 * side, +x, along -y; on the top, along +x). Where the drawing is empty ("."
 * or " " in `rows`, null in `pixels`) the face keeps its material.
 *
 * The light: the drawing is painted as drawn on a face in light (the top and
 * the lit side), and one step darker on the side in shadow and wherever the
 * boxes keep the light off (`shadows`): each color goes to `shade[color]`,
 * which the command fills from the palette when the drawing does not say it
 * (one step down the color's own ramp: the darker palette color nearest in
 * hue and chroma), and only when the material itself darkens there (a
 * material whose faces are one tone keeps the drawing as drawn). `glow` keeps
 * it as drawn everywhere (a screen, a backlit glass gives its own light).
 */
export interface VoxelPaint {
  /** The drawing as rows of glyphs, with `glyphs` saying the color of each. */
  rows?: string[];
  glyphs?: Record<string, string>;
  /** A PGS text drawing (path relative to the model): the command reads it into `pixels`. */
  draw?: string;
  /** With `draw`, which frame of the drawing (default 0). */
  frame?: number;
  /** The drawing as colors per pixel (null: the face shows). */
  pixels?: (string | null)[][];
  /** Where its top-left pixel goes on the face: [column, row] from the face's top-left (default [0, 0]). */
  at?: [number, number];
  /** Its color in shadow, per color (default: the same color; the command fills it from the palette). */
  shade?: Record<string, string>;
  /** Keeps its colors in shadow too: a screen, a lit sign. */
  glow?: boolean;
  /** Quarter turns the drawing took with its box (a top turns its picture; set by rotate). */
  turns?: number;
}

/** A face as a paint names it: the top, or a side by where it faces (left = +y, right = +x; -x and -y show once the box turns). */
export type PaintFace = 'top' | '+x' | '+y' | '-x' | '-y';
const PAINT_KEYS: Record<string, PaintFace> = { top: 'top', '+x': '+x', '+y': '+y', '-x': '-x', '-y': '-y', left: '+y', right: '+x' };

export interface VoxelBox {
  /** Far-bottom corner, in world units: x goes down-right, y down-left, z up. Can be negative: a figure modelled around its foot at (0, 0, 0). */
  at: [number, number, number];
  /** Extent along x, y, z. */
  size: [number, number, number];
  material: string;
  id?: string;
  /** Layer it is drawn on when the model is split (default "fondo"). */
  layer?: string;
  /** Its layer is a loose piece (see `VoxelPlace.loose`). */
  loose?: boolean;
  /** Drawings on its faces, by face: top, left (+y), right (+x), or -x, -y (they show once it turns). */
  paint?: Partial<Record<'top' | 'left' | 'right' | PaintFace, VoxelPaint>>;
}

export type VoxelLight = 'upper_left' | 'upper_right';

/** Another model placed inside this one: a desk in a room. */
export interface VoxelPlace {
  /** Path of the model, relative to the one that places it. */
  model: string;
  /** Where its (0, 0, 0) goes, in this model's units. */
  at: [number, number, number];
  /** Names its boxes (`<id>/<box>`); default the placed model's id. */
  id?: string;
  /** Layer every box of it goes to (default: what each box says). */
  layer?: string;
  /**
   * A piece the game moves: with layers, the room is drawn without it (no
   * pixels, no shadow, no contour on the floor), its layer is the piece alone
   * (whole, its own contour, shaded by itself and by the room where it was
   * placed: a cabinet in a corner keeps the corner's shade) and `<layer>_sombra` is
   * the shadow it casts on the back layer, in the room's own shadow tones.
   * The other layers keep it as placed: it still hides what stands behind it
   * (a person behind a desk) and shades them. Needs a `layer` of its own.
   */
  loose?: boolean;
  /** Quarter turns about the vertical, in degrees (0, 90, 180, 270): see `rotateModel`. */
  rotate?: number;
}

export interface VoxelModel {
  id: string;
  name?: string;
  materials: Record<string, VoxelMaterial>;
  boxes: VoxelBox[];
  /** Silhouette contour and the line where something stands in front: a color, or false for none. */
  outline?: string | false;
  /** Where the light comes from (default upper_left, as the materials are written). */
  light?: VoxelLight;
  /** Faces the boxes keep from the light take the next darker tone. */
  shadows?: boolean;
  /** Other models inside this one (furniture in a room), laid out with `placeModels`. */
  place?: VoxelPlace[];
  /**
   * The point the model stands on and turns about (default (0, 0, 0)): the
   * foot of a figure. `rotate` turns about it and `lugar.json` says the pixel
   * where it lands. Placing the model still puts its (0, 0, 0) at `at`.
   */
  pivot?: [number, number, number];
  /** Quarter turns of the whole model about its pivot, in degrees (0, 90, 180, 270): see `turnModel`. */
  rotate?: number;
}

function sameMaterial(a: VoxelMaterial, b: VoxelMaterial): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The model with every `place` laid out as boxes of its own: the furniture of
 * a room is drawn by the room, so its light and its shadows are the room's (a
 * desk on its own does not darken the floor; inside the room it does). Each
 * piece stays its own file, so the same desk goes in four offices. Materials
 * join by name; one name that means two different things is refused, because
 * one of the two would be drawn wrong. `load` reads a model by its path as
 * written, resolved by the caller; places nest.
 */
export function placeModels(model: VoxelModel, load: (path: string, from: string[]) => VoxelModel, chain: string[] = []): VoxelModel {
  if (!model.place?.length) return model;
  if (chain.length > 8) throw new Error(`place: more than 8 levels deep (${chain.join(' → ')})`);
  const materials: Record<string, VoxelMaterial> = { ...model.materials };
  const boxes: VoxelBox[] = [...model.boxes];
  for (const p of model.place) {
    if (chain.includes(p.model)) throw new Error(`place: ${p.model} places itself (${[...chain, p.model].join(' → ')})`);
    if (p.at.length !== 3 || p.at.some(n => !Number.isInteger(n))) throw new Error(`place ${p.model}: at is three whole units`);
    const inner = rotateModel(turnModel(placeModels(load(p.model, chain), load, [...chain, p.model])), p.rotate ?? 0);
    const id = p.id ?? inner.id;
    for (const [name, m] of Object.entries(inner.materials)) {
      if (materials[name] && !sameMaterial(materials[name], m)) {
        throw new Error(`place ${p.model}: material "${name}" is not the same as the one already in ${model.id} (rename one of the two)`);
      }
      materials[name] = m;
    }
    for (const b of inner.boxes) {
      boxes.push({
        ...b,
        at: [b.at[0] + p.at[0], b.at[1] + p.at[1], b.at[2] + p.at[2]],
        id: `${id}/${b.id ?? boxes.length}`,
        ...(p.layer ?? b.layer ? { layer: p.layer ?? b.layer } : {}),
        ...(p.loose || b.loose ? { loose: true } : {}),
      });
    }
  }
  const { place: _place, ...rest } = model;
  void _place;
  return { ...rest, materials, boxes };
}

/** The faces of a box's paint by their canonical names, refusing one face named twice. */
function paintFaces(b: VoxelBox, name: string): [PaintFace, VoxelPaint][] {
  const out: [PaintFace, VoxelPaint][] = [];
  for (const [k, p] of Object.entries(b.paint ?? {})) {
    if (!p) continue;
    const face = PAINT_KEYS[k];
    if (!face) throw new Error(`${name}: paint face "${k}" is top, left, right, +x, +y, -x or -y`);
    if (out.some(([f]) => f === face)) throw new Error(`${name}: paint names the face ${face} twice (left is +y, right is +x)`);
    out.push([face, p]);
  }
  return out;
}

/** +y comes to face +x: where each face of a box goes on a quarter turn. */
const TURN: Record<PaintFace, PaintFace> = { top: 'top', '+y': '+x', '+x': '-y', '-y': '-x', '-x': '+y' };

/** A box's paint after a quarter turn: the sides move round, the top turns its picture. */
function turnPaint(b: VoxelBox): VoxelBox {
  if (!b.paint) return b;
  const paint: VoxelBox['paint'] = {};
  for (const [face, p] of paintFaces(b, b.id ? `box "${b.id}"` : 'box')) {
    paint[TURN[face]] = face === 'top' ? { ...p, turns: ((p.turns ?? 0) + 1) % 4 } : p;
  }
  return { ...b, paint };
}

/**
 * The model turned about the vertical by quarter turns: 90 turns what faced
 * the viewer's left (+y) to face the right (+x), 180 shows its back, 270 the
 * other side. It stays in the corner it was in (its footprint from (0, 0)
 * turns with it: w × d becomes d × w), so a placed piece keeps its `at`. The
 * light does not turn: each face takes the tone of where it faces now, which
 * is right for a material that is light and shade; a feature painted as the
 * tone of one face (a screen as the left tone of a box) stays on whatever
 * faces that way, so a piece that will turn draws it as its own thin box.
 */
export function rotateModel(model: VoxelModel, degrees: number): VoxelModel {
  if (![0, 90, 180, 270].includes(degrees)) throw new Error(`rotate is 0, 90, 180 or 270 (quarter turns), got ${degrees}`);
  let boxes = model.boxes;
  for (let k = 0; k < degrees / 90; k++) {
    const W = Math.max(...boxes.map(b => b.at[0] + b.size[0]));
    // +y goes to +x: a point (x, y) lands at (y, W - x).
    boxes = boxes.map(b => turnPaint({ ...b, at: [b.at[1], W - b.at[0] - b.size[0], b.at[2]], size: [b.size[1], b.size[0], b.size[2]] }));
  }
  return degrees ? { ...model, boxes } : model;
}

/**
 * The model turned by its own `rotate` about its `pivot` (or by `degrees`,
 * when given, on top of it), with `rotate` spent: what a loose figure needs
 * to be drawn facing the other three ways. Unlike `rotateModel`, which keeps a
 * placed piece in its corner, this turns about a fixed point, so a figure
 * modelled around its foot keeps its foot where it was: 90 turns +y to +x
 * (what faced the viewer's left faces the right), 180 shows the back. A point
 * (x, y) goes to (px + (y - py), py - (x - px)); the light does not turn.
 */
export function turnModel(model: VoxelModel, degrees = 0): VoxelModel {
  const total = (model.rotate ?? 0) + degrees;
  const turns = (((total / 90) % 4) + 4) % 4;
  if (!Number.isInteger(total / 90)) throw new Error(`rotate is 0, 90, 180 or 270 (quarter turns), got ${total}`);
  const { rotate: _rotate, ...rest } = model;
  void _rotate;
  if (!turns) return model.rotate === undefined ? model : rest;
  const [px, py] = model.pivot ?? [0, 0, 0];
  if (!Number.isInteger(px) || !Number.isInteger(py)) throw new Error('pivot is three whole units');
  let boxes = model.boxes;
  for (let k = 0; k < turns; k++) {
    boxes = boxes.map(b => turnPaint({ ...b, at: [px + b.at[1] - py, py - (b.at[0] + b.size[0]) + px, b.at[2]], size: [b.size[1], b.size[0], b.size[2]] }));
  }
  return { ...rest, boxes };
}

export type Face = 'top' | 'left' | 'right';

export interface VoxelHit {
  box: number;
  face: Face;
  /** x + y + z of the point hit: larger is closer to the viewer. */
  depth: number;
  /** The point hit, in world units. */
  point: [number, number, number];
  /** Whether the boxes keep this point from the light (only with shadows). */
  shadow?: boolean;
}

export interface VoxelImage {
  width: number;
  height: number;
  /** Color (as the material names it) per pixel, undefined where empty. */
  pixels: (string | undefined)[][];
  /** What each pixel hit, for whoever wants to measure (undefined on contour and empty). */
  hits: (VoxelHit | undefined)[][];
  /** The pixel where world (0, 0, 0) lands. */
  origin: [number, number];
}

/** Depth jump, in world units along the view, that reads as one thing in front of another. */
const STEP = 3;

/** The default layer of a box. */
export const BACK_LAYER = 'fondo';

export function validateVoxel(model: VoxelModel): void {
  if (!model.boxes?.length) throw new Error('a voxel model needs at least one box');
  if (model.pivot !== undefined && (model.pivot.length !== 3 || model.pivot.some(n => !Number.isInteger(n)))) throw new Error('pivot is three whole units, [x, y, z]');
  if (model.light !== undefined && model.light !== 'upper_left' && model.light !== 'upper_right') {
    throw new Error(`light must be upper_left or upper_right (isometric faces), got "${model.light}"`);
  }
  for (const [name, m] of Object.entries(model.materials)) {
    if (m.tile && (m.tile.size.length !== 2 || m.tile.size.some(n => !Number.isInteger(n) || n <= 0))) {
      throw new Error(`material "${name}": tile.size is two whole units, [along x, along y]`);
    }
  }
  model.boxes.forEach((b, i) => {
    const name = b.id ? `box "${b.id}"` : `box ${i}`;
    if (!model.materials[b.material]) {
      throw new Error(`${name}: material "${b.material}" is not in materials (${Object.keys(model.materials).join(', ')})`);
    }
    for (const n of [...b.at, ...b.size]) if (!Number.isInteger(n)) throw new Error(`${name}: at and size are whole units`);
    if (b.size.some(n => n <= 0)) throw new Error(`${name}: size must be positive`);
    if (b.at.length !== 3 || b.size.length !== 3) throw new Error(`${name}: at and size are three numbers, [x, y, z]`);
    if (b.loose && (b.layer ?? BACK_LAYER) === BACK_LAYER) throw new Error(`${name}: a loose piece needs a layer of its own, not "${BACK_LAYER}"`);
    for (const [face] of paintFaces(b, name)) faceGrid(b, face, name);
  });
  for (const name of voxelLayers(model)) {
    const of = model.boxes.filter(b => (b.layer ?? BACK_LAYER) === name);
    if (of.some(b => b.loose) && !of.every(b => b.loose)) throw new Error(`layer "${name}": some boxes are loose and some are not (loose goes on the whole layer)`);
  }
}

/** The layers of a model, in the order their boxes first appear. */
export function voxelLayers(model: VoxelModel): string[] {
  return [...new Set(model.boxes.map(b => b.layer ?? BACK_LAYER))];
}

interface Grid {
  /** The far-bottom corner of the model (0 for a model with no negative coordinates). */
  x0: number; y0: number; z0: number;
  /** The near-top corner: one past the last cell. */
  X: number; Y: number; Z: number;
  cell: Int32Array;
  at: (x: number, y: number, z: number) => number;
}

function occupancy(model: VoxelModel, include: (i: number) => boolean): Grid {
  const x0 = Math.min(0, ...model.boxes.map(b => b.at[0]));
  const y0 = Math.min(0, ...model.boxes.map(b => b.at[1]));
  const z0 = Math.min(0, ...model.boxes.map(b => b.at[2]));
  const X = Math.max(...model.boxes.map(b => b.at[0] + b.size[0]));
  const Y = Math.max(...model.boxes.map(b => b.at[1] + b.size[1]));
  const Z = Math.max(...model.boxes.map(b => b.at[2] + b.size[2]));
  const nx = X - x0, ny = Y - y0, nz = Z - z0;
  // Later boxes win, so a drawer front laid on a cabinet is simply listed after it.
  const cell = new Int32Array(Math.max(0, nx * ny * nz)).fill(-1);
  const at = (x: number, y: number, z: number) => ((z - z0) * ny + (y - y0)) * nx + (x - x0);
  model.boxes.forEach((b, i) => {
    if (!include(i)) return;
    for (let z = b.at[2]; z < b.at[2] + b.size[2]; z++) {
      for (let y = b.at[1]; y < b.at[1] + b.size[1]; y++) {
        for (let x = b.at[0]; x < b.at[0] + b.size[0]; x++) cell[at(x, y, z)] = i;
      }
    }
  });
  return { x0, y0, z0, X, Y, Z, cell, at };
}

function occupied(g: Grid, x: number, y: number, z: number): boolean {
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  if (cx < g.x0 || cy < g.y0 || cz < g.z0 || cx >= g.X || cy >= g.Y || cz >= g.Z) return false;
  return g.cell[g.at(cx, cy, cz)] >= 0;
}

/** Toward the light, per unit of height: high enough that shadows stay short. */
function towardLight(light: VoxelLight): [number, number, number] {
  return light === 'upper_right' ? [0.5, -0.5, 0.7] : [-0.5, 0.5, 0.7];
}

function inShadow(all: Grid, p: [number, number, number], face: Face, L: [number, number, number]): boolean {
  // Off the face a hair, so the ray does not start inside its own box.
  const e = 0.02;
  let [x, y, z] = p;
  if (face === 'top') z += e; else if (face === 'left') y += e; else x += e;
  const step = 1 / 8;
  for (let k = 1; z + k * step * L[2] < all.Z + 1; k++) {
    const t = k * step;
    if (occupied(all, x + t * L[0], y + t * L[1], z + t * L[2])) return true;
  }
  return false;
}

interface Raster {
  width: number;
  height: number;
  hits: (VoxelHit | undefined)[][];
  origin: [number, number];
}

/**
 * Every pixel's first box, for the boxes `include` lets in, on the canvas of
 * the whole model; with shadows, the boxes `casts` lets in keep the light off.
 */
function rasterize(model: VoxelModel, include: (i: number) => boolean, casts: (i: number) => boolean = () => true): Raster {
  const g = occupancy(model, include);
  const { x0, y0, z0, X, Y, Z } = g;
  const all = model.shadows ? occupancy(model, i => casts(i) && !model.materials[model.boxes[i].material].clear) : g;
  const L = towardLight(model.light ?? 'upper_left');

  // Screen bounds: u = x - y, v = (x + y) / 2 - z. The top is kept on a
  // whole v, so every model samples the same lattice of the world (pixel
  // centers at whole u and v plus a half) and a frame lines up with another.
  const uMin = x0 - Y, uMax = X - y0;
  const vMin = Math.floor((x0 + y0) / 2) - Z, vMax = (X + Y) / 2 - z0;
  const pad = 1; // room for the contour
  const width = uMax - uMin + 2 * pad;
  const height = Math.ceil(vMax - vMin) + 2 * pad;

  const hits: (VoxelHit | undefined)[][] = Array.from({ length: height }, () => Array(width).fill(undefined));
  const step = 1 / 16;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const U = uMin + col - pad + 0.5;
      const V = vMin + row - pad + 0.5;
      // Points on this pixel's ray: (A + t, B + t, t), walked from the viewer away.
      const A = (2 * V + U) / 2;
      const B = (2 * V - U) / 2;
      let t = Math.max(Z, X - A, Y - B) + 1;
      const tEnd = Math.min(z0, x0 - A, y0 - B) - 1;
      for (; t > tEnd; t -= step) {
        const x = A + t, y = B + t, z = t;
        if (x < x0 || y < y0 || z < z0) break;
        const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
        if (cx >= X || cy >= Y || cz >= Z) continue;
        const i = g.cell[g.at(cx, cy, cz)];
        if (i < 0) continue;
        // The face it came in through is the one whose upper side it is nearest to.
        const dx = cx + 1 - x, dy = cy + 1 - y, dz = cz + 1 - z;
        const face: Face = dz <= dx && dz <= dy ? 'top' : dy <= dx ? 'left' : 'right';
        const point: [number, number, number] = [x, y, z];
        const hit: VoxelHit = { box: i, face, depth: x + y + z, point };
        if (model.shadows) hit.shadow = inShadow(all, point, face, L);
        hits[row][col] = hit;
        break;
      }
    }
  }
  return { width, height, hits, origin: [-uMin + pad, -vMin + pad] };
}

/** The remainder, on the positive side also below zero (a floor that starts at a negative x keeps its joints). */
function mod(a: number, n: number): number {
  return a < 0 ? ((a % n) + n) % n : a % n;
}

/** Width and height, in units, of a face of a box as its paint sees it. */
function faceSize(b: VoxelBox, face: PaintFace): [number, number] {
  const [sx, sy, sz] = b.size;
  return face === 'top' ? [sx, sy] : face === '+y' || face === '-y' ? [sx, sz] : [sy, sz];
}

const grids = new WeakMap<VoxelPaint, Map<string, (string | undefined)[][]>>();

/**
 * The drawing of one face as a grid the size of the face (undefined where the
 * face shows), laid at its `at` and turned as many times as its box: what the
 * render reads per unit. Refuses a drawing that does not fit its face.
 */
function faceGrid(b: VoxelBox, face: PaintFace, name: string): (string | undefined)[][] {
  const p = paintFaces(b, name).find(([f]) => f === face)?.[1];
  if (!p) return [];
  const [W, H] = faceSize(b, face);
  const key = `${W}x${H}`;
  const cached = grids.get(p)?.get(key);
  if (cached) return cached;
  const where = `${name}: paint ${face}`;
  const sources = [p.rows, p.pixels, p.draw].filter(v => v !== undefined).length;
  if (sources !== 1) throw new Error(`${where}: give one of rows (with glyphs), pixels or draw`);
  if (p.draw !== undefined && !p.pixels) throw new Error(`${where}: draw ${p.draw} is a text drawing the voxel command reads (here, give rows or pixels)`);
  let pixels: (string | undefined)[][];
  if (p.rows) {
    pixels = p.rows.map((row, r) => [...row].map((g, c) => {
      if (g === '.' || g === ' ') return undefined;
      const color = p.glyphs?.[g];
      if (!color) throw new Error(`${where}: glyph "${g}" (row ${r}, column ${c}) is not in glyphs`);
      return color;
    }));
  } else {
    pixels = p.pixels!.map(row => row.map(c => (c ? c : undefined)));
  }
  const turns = p.turns ?? 0;
  // The face the drawing was laid on, before its box turned (a top swaps its sides).
  const [w0, h0] = face === 'top' && turns % 2 ? [H, W] : [W, H];
  const [ax, ay] = p.at ?? [0, 0];
  if (!Number.isInteger(ax) || !Number.isInteger(ay) || ax < 0 || ay < 0) throw new Error(`${where}: at is two whole units from the face's top-left, [column, row]`);
  const dw = Math.max(0, ...pixels.map(r => r.length)), dh = pixels.length;
  if (ax + dw > w0 || ay + dh > h0) {
    throw new Error(`${where}: the drawing (${dw}x${dh}${ax || ay ? ` at ${ax},${ay}` : ''}) does not fit the face (${w0}x${h0} units)`);
  }
  let grid: (string | undefined)[][] = Array.from({ length: h0 }, (_, r) => Array.from({ length: w0 }, (_, c) => pixels[r - ay]?.[c - ax]));
  for (let k = 0; k < turns; k++) {
    // A quarter turn of a top: new[i][j] = old[j][C - 1 - i].
    const C = grid[0]?.length ?? 0;
    grid = Array.from({ length: C }, (_, i) => grid.map((row) => row[C - 1 - i]));
  }
  if (!grids.has(p)) grids.set(p, new Map());
  grids.get(p)!.set(key, grid);
  return grid;
}

/** The color a drawing gives this hit, already in its light, or undefined where no drawing is. */
function paintedTone(model: VoxelModel, h: VoxelHit): string | undefined {
  const b = model.boxes[h.box];
  if (!b.paint) return undefined;
  const [ax, ay, az] = b.at, [sx, sy, sz] = b.size;
  const cx = Math.floor(h.point[0]), cy = Math.floor(h.point[1]), cz = Math.floor(h.point[2]);
  // Only the box's own face: a face some later box laid inside it is not.
  let face: PaintFace, col: number, row: number;
  if (h.face === 'top') {
    if (cz + 1 !== az + sz) return undefined;
    face = 'top';
    // On a top, 2:1 shows one unit in two, as two pixels side by side (the
    // units between fall on no pixel center): a tile pattern can live with
    // that, a drawing cannot. So a drawing gives the right one of each pair
    // to the unit beside it along +x, and every pixel of the drawing gets a
    // pixel of the screen, half a unit off at most. On the plane, a pixel is
    // at (c + 1/4, r + 3/4) or (c + 3/4, r + 1/4).
    const lift = cz + 1 - h.point[2];
    const x = h.point[0] + lift, y = h.point[1] + lift;
    const ux = Math.floor(x + 0.25 + 1e-6);
    col = (ux < ax + sx ? ux : cx) - ax;
    row = Math.floor(y - 0.25 + 1e-6) - ay;
  }
  else if (h.face === 'left') { if (cy + 1 !== ay + sy) return undefined; face = '+y'; col = cx - ax; row = az + sz - 1 - cz; }
  else { if (cx + 1 !== ax + sx) return undefined; face = '+x'; col = ay + sy - 1 - cy; row = az + sz - 1 - cz; }
  const p = paintFaces(b, '').find(([f]) => f === face)?.[1];
  if (!p) return undefined;
  const c = faceGrid(b, face, b.id ? `box "${b.id}"` : `box ${h.box}`)[row]?.[col];
  if (c === undefined) return undefined;
  const dark = h.shadow || h.face === (model.light === 'upper_right' ? 'left' : 'right');
  return dark && !p.glow ? p.shade?.[c] ?? c : c;
}

/** The tone of one hit: the face, the tiles, the light and the shadow. */
function tone(model: VoxelModel, h: VoxelHit): string {
  const painted = paintedTone(model, h);
  if (painted !== undefined) return painted;
  const m = model.materials[model.boxes[h.box].material];
  const swap = model.light === 'upper_right';
  const face: Face = swap && h.face !== 'top' ? (h.face === 'left' ? 'right' : 'left') : h.face;
  if (face === 'top') {
    const [x, y] = h.point;
    const joint = !!m.tile?.joint && (mod(x, m.tile.size[0]) < 1 || mod(y, m.tile.size[1]) < 1);
    if (h.shadow) return joint ? (m.tile!.shadeJoint ?? m.right) : (m.shade ?? m.left);
    if (m.tile) {
      const [w, d] = m.tile.size;
      if (joint) return m.tile.joint!;
      if (m.tile.alt && mod(Math.floor(x / w) + Math.floor(y / d), 2) === 1) return m.tile.alt;
    }
    return m.top;
  }
  if (h.shadow && face === 'left') return m.right;
  return m[face];
}

/** Colors, rim and contour over a raster, still on the uncropped canvas. */
function paint(model: VoxelModel, r: Raster): (string | undefined)[][] {
  const { width, height, hits } = r;
  const pixels: (string | undefined)[][] = hits.map(row => row.map(h => (h ? tone(model, h) : undefined)));

  // The rim: a lit top pixel right above a side of the same box.
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width; col++) {
      const h = hits[row][col], below = hits[row + 1][col];
      if (h?.face !== 'top' || h.shadow || !below || below.box !== h.box || below.face === 'top') continue;
      const edge = model.materials[model.boxes[h.box].material].edge;
      // A drawing on the top goes to its edge: the rim does not cut it.
      if (edge && paintedTone(model, h) === undefined) pixels[row][col] = edge;
    }
  }

  if (model.outline !== false) {
    const ink = model.outline ?? 'tinta';
    const near = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const out = pixels.map(row => [...row]);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const h = hits[row][col];
        for (const [dr, dc] of near) {
          const n = hits[row + dr]?.[col + dc];
          if (!n) continue;
          // Empty next to something: the silhouette. Far next to near: the
          // line of one thing standing in front of another, on the far side.
          if (!h || n.depth - h.depth > STEP) { out[row][col] = ink; break; }
        }
      }
    }
    return out;
  }
  return pixels;
}

interface Box2 { top: number; bottom: number; left: number; right: number }

function contentBox(pixels: (string | undefined)[][]): Box2 | undefined {
  let top = Infinity, bottom = -1, left = Infinity, right = -1;
  pixels.forEach((row, r) => row.forEach((c, col) => {
    if (c === undefined) return;
    top = Math.min(top, r); bottom = Math.max(bottom, r);
    left = Math.min(left, col); right = Math.max(right, col);
  }));
  return bottom < 0 ? undefined : { top, bottom, left, right };
}

function cropped(r: Raster, pixels: (string | undefined)[][], b: Box2): VoxelImage {
  const crop = <T>(g: T[][]) => g.slice(b.top, b.bottom + 1).map(row => row.slice(b.left, b.right + 1));
  return {
    width: b.right - b.left + 1, height: b.bottom - b.top + 1,
    pixels: crop(pixels), hits: crop(r.hits),
    origin: [r.origin[0] - b.left, r.origin[1] - b.top],
  };
}

/** The whole model, cropped to what was drawn. */
export function renderVoxel(model: VoxelModel): VoxelImage {
  model = turnModel(model);
  validateVoxel(model);
  const r = rasterize(model, () => true);
  const pixels = paint(model, r);
  return cropped(r, pixels, contentBox(pixels)!);
}

/**
 * The model and each of its layers, all on one canvas (the crop of the whole),
 * so they stack back into the whole: the game draws the back layer, then
 * whatever stands in the room, then the front. The layers on top are cut out
 * of the whole, and the first is the whole wherever they do not cover it, so
 * stacked they are the whole pixel for pixel: no contour where a cut wall
 * meets the wall it is built against. Under what the layers on top cover, the
 * first is drawn alone (the back of the room has its floor where the front
 * wall stands), with the shadows of every box.
 *
 * A loose layer (boxes placed with `loose`) is a piece the game moves, so the
 * room is drawn as if it were not there, the piece comes alone and whole, and
 * `<layer>_sombra` is its shadow on the back layer. The piece keeps the
 * room's light where it was placed, and the other layers keep its shadow and
 * its cut (a person behind a desk): only the back has to be free of it, so it
 * can stand anywhere on the floor. Stacked where it was placed, the layers are
 * the whole but for the line at the foot of the piece and the shade loose
 * pieces throw on each other; `whole` is the room as placed, to compare.
 */
export function renderVoxelLayers(model: VoxelModel): { whole: VoxelImage; layers: Record<string, VoxelImage>; loose: string[] } {
  model = turnModel(model);
  validateVoxel(model);
  const layerOf = (i: number) => model.boxes[i].layer ?? BACK_LAYER;
  const fixed = (i: number) => !model.boxes[i].loose;
  const names = voxelLayers(model);
  const loose = names.filter(n => model.boxes.some(b => b.loose && (b.layer ?? BACK_LAYER) === n));
  const full = rasterize(model, () => true);
  const fullPx = paint(model, full);
  const box = contentBox(fullPx)!;
  // Everything as placed: what the layers on top are cut from (a desk still
  // hides the legs behind it, and its shadow on a low wall stays there).
  const r = full;
  const pixels = fullPx;
  // The room without the loose pieces: what the back is cut from.
  const room = loose.length ? rasterize(model, fixed, fixed) : r;
  const roomPx = loose.length ? paint(model, room) : pixels;
  const layers: Record<string, VoxelImage> = {};
  const upper = names.slice(1).filter(n => !loose.includes(n));
  // What goes on top is cut out of the whole, pixel for pixel: drawn alone, a
  // cut wall would get a contour where it meets the wall it is built against,
  // a line the room does not have. A contour pixel of the whole belongs to the
  // layer it outlines: around its silhouette, and the line on whatever stands
  // behind it, so it goes with it over what the game puts between (a person's
  // outline over the chair they sit on).
  const near = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const ink = model.outline === false ? undefined : (model.outline ?? 'tinta');
  const claim = (rr: Raster, px: (string | undefined)[][], keep: boolean) => {
    const claimed = px.map(row => row.map(() => false));
    upper.forEach(name => {
      const mine = rr.hits.map(row => row.map(h => !!h && layerOf(h.box) === name));
      const outlines = (y: number, x: number) => near.some(([dy, dx]) => {
        const n = rr.hits[y + dy]?.[x + dx];
        return !!n && mine[y + dy][x + dx] && n.depth - rr.hits[y][x]!.depth > STEP;
      });
      const own = px.map((row, y) => row.map((c, x) => {
        if (c === undefined) return undefined;
        const take = rr.hits[y][x] ? mine[y][x] || (c === ink && outlines(y, x)) : near.some(([dy, dx]) => mine[y + dy]?.[x + dx]);
        if (!take) return undefined;
        claimed[y][x] = true;
        return c;
      }));
      const hits = rr.hits.map((row, y) => row.map((h, x) => (mine[y][x] ? h : undefined)));
      if (keep) layers[name] = cropped({ ...rr, hits }, own, box);
    });
    return claimed;
  };
  const claimedTop = claim(r, pixels, true);
  const claimed = loose.length ? claim(room, roomPx, false) : claimedTop;
  // The back is the whole wherever nothing on top covers it, and drawn alone
  // under what does: it has to have floor where the front wall stands.
  const alone = rasterize(model, i => layerOf(i) === names[0], fixed);
  const behind = paint(model, alone);
  const back = roomPx.map((row, y) => row.map((c, x) => (claimed[y][x] ? behind[y][x] : c)));
  const backHits = room.hits.map((row, y) => row.map((h, x) => (claimed[y][x] ? alone.hits[y][x] : h && layerOf(h.box) === names[0] ? h : undefined)));
  layers[names[0]] = cropped({ ...room, hits: backHits }, back, box);
  // Each loose piece alone, and the floor and walls it darkens, in the tone
  // the room gives them in shadow (a joint stays a joint).
  const L = towardLight(model.light ?? 'upper_left');
  for (const name of loose) {
    const its = (i: number) => layerOf(i) === name;
    // Whole and with its own contour, in the room's light where it stands.
    const piece = rasterize(model, its, i => its(i) || fixed(i));
    layers[name] = cropped(piece, paint(model, piece), box);
    if (!model.shadows) continue;
    const casts = occupancy(model, i => its(i) && !model.materials[model.boxes[i].material].clear);
    const shade = back.map(row => row.map((): string | undefined => undefined));
    const hits = backHits.map(row => row.map((): VoxelHit | undefined => undefined));
    backHits.forEach((row, y) => row.forEach((h, x) => {
      if (!h || h.shadow) return;
      // Only what shows its own tone: the contour of something else stays its contour.
      const c = back[y][x];
      if (c !== tone(model, h) && c !== model.materials[model.boxes[h.box].material].edge) return;
      if (!inShadow(casts, h.point, h.face, L)) return;
      hits[y][x] = { ...h, shadow: true };
      shade[y][x] = tone(model, hits[y][x]!);
    }));
    layers[`${name}_sombra`] = cropped({ ...room, hits }, shade, box);
  }
  // In the order the boxes name them, each shadow after its piece.
  const ordered: Record<string, VoxelImage> = {};
  for (const name of names) {
    ordered[name] = layers[name];
    if (layers[`${name}_sombra`]) ordered[`${name}_sombra`] = layers[`${name}_sombra`];
  }
  return { whole: cropped(full, fullPx, box), layers: ordered, loose };
}

/**
 * The pixel of the canvas where a world point lands: how the game places
 * whatever stands in the room (a person's feet at the center of a tile).
 */
export function voxelToScreen(origin: [number, number], p: [number, number, number]): [number, number] {
  return [origin[0] + p[0] - p[1], origin[1] + (p[0] + p[1]) / 2 - p[2]];
}

/** A canvas, as the pixel where world (0, 0, 0) lands and its size. */
export interface VoxelCanvas {
  width: number;
  height: number;
  origin: [number, number];
}

/**
 * The smallest canvas every image fits in with its world (0, 0, 0) on the same
 * pixel: the frames of an animation, so the game draws each one at the same
 * place and none of them has to be anchored apart. Every model samples the
 * same lattice of the world, so laying a frame on it moves it by whole pixels.
 */
export function voxelCanvas(images: VoxelImage[]): VoxelCanvas {
  if (!images.length) throw new Error('a canvas needs at least one image');
  const left = Math.max(...images.map(im => im.origin[0]));
  const top = Math.max(...images.map(im => im.origin[1]));
  const right = Math.max(...images.map(im => im.width - im.origin[0]));
  const bottom = Math.max(...images.map(im => im.height - im.origin[1]));
  return { width: left + right, height: top + bottom, origin: [left, top] };
}

/** The image laid on a canvas, its (0, 0, 0) on the canvas's: empty around it. */
export function onCanvas(im: VoxelImage, c: VoxelCanvas): VoxelImage {
  const dx = c.origin[0] - im.origin[0], dy = c.origin[1] - im.origin[1];
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || dx < 0 || dy < 0 || dx + im.width > c.width || dy + im.height > c.height) {
    throw new Error('onCanvas: the image does not fit the canvas whole pixels apart');
  }
  const lay = <T>(g: T[][]): (T | undefined)[][] => Array.from({ length: c.height }, (_, y) =>
    Array.from({ length: c.width }, (_, x) => g[y - dy]?.[x - dx]));
  return { width: c.width, height: c.height, pixels: lay(im.pixels), hits: lay(im.hits), origin: [...c.origin] };
}

/**
 * Images of one canvas (a layer, or the frames of one) cut to the smallest box
 * that holds every painted pixel of all of them: the same box for every frame,
 * so a strip still has one width. `at` is where the box's top-left sits on the
 * canvas (draw the cut image there and it is the uncut one); each origin moves
 * with it. Nothing painted: a 1×1 empty image at (0, 0).
 */
export function cropImages(images: VoxelImage[]): { images: VoxelImage[]; at: [number, number] } {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const im of images) {
    im.pixels.forEach((row, y) => row.forEach((c, x) => {
      if (!c) return;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }));
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
  const cut = <T>(g: T[][]): T[][] => g.slice(y0, y1 + 1).map(row => row.slice(x0, x1 + 1));
  return {
    at: [x0, y0],
    images: images.map(im => ({
      width: x1 - x0 + 1, height: y1 - y0 + 1,
      pixels: cut(im.pixels), hits: cut(im.hits),
      origin: [im.origin[0] - x0, im.origin[1] - y0],
    })),
  };
}
