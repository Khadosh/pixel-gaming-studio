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
// A box can be a round shape instead (`box.shape`): the sphere, ellipsoid,
// cylinder or capsule that fills it. Its silhouette is the shape's, not a
// stair of cells; its tone at every pixel comes from where its surface faces
// (the normal), cut into the bands of the material's ramp, so a sphere is
// light at the upper left and dark at the lower right in clean bands, where a
// sphere made of cells came out as a checkerboard of tops and sides; it has
// contour only at its silhouette; and a drawing on one of its faces is laid
// on the surface as seen from that side (a face on a head, the print on a
// ball). Because the shape is its box, it moves, turns, is placed and derived
// as a box does.
//
// A model can be another one with some changes (`base` + `changes`): a pose
// of a figure is the standing one with its legs and arms swapped, its head
// turned, its body raised; a look is the same figure with other materials.
// Boxes are named by `id` or by a `group` (see `deriveModel`).
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

/**
 * A grain on the sides of a material: the earth of a cut, a rock wall, a
 * bank, scattered for you instead of drawn unit by unit (see `grainPaints`).
 * The same seed on the same box is always the same scatter.
 */
export interface VoxelGrain {
  /** The colors of the specks, one picked at random for each. */
  colors: string[];
  /** The share of a side's units that get a speck, 0 to 1 (an earth: 0.025). */
  density: number;
  /** Another seed, another scatter of the same grain (default 0). */
  seed?: number;
  /**
   * Pebbles, one every `every` units along the side: a clump three units
   * wide and two high with a bump on top, in `colors` [body, its shaded
   * corner], none nearer the top edge than `below` units (default 0).
   */
  stones?: { colors: [string, string]; every: number; below?: number };
  /** Roots hanging from the top edge, one every `every` units along the side, each `length` [shortest, longest] units long, wandering a unit left or right. */
  roots?: { color: string; every: number; length: [number, number] };
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
  /** A grain scattered on its sides (not its top, nor a round shape): see `VoxelGrain`. */
  grain?: VoxelGrain;
  /**
   * The tones of a round shape (`box.shape`) from light to dark, two to four:
   * its surface takes the one for how much it faces the light. Default the
   * faces' tones, top, left and right (a shape shades as its box would on the
   * faces that face the same way); four puts a highlight first.
   */
  ramp?: string[];
}

/**
 * A round shape that fills its box: `sphere` (a cube), `ellipsoid`,
 * `cylinder` (round across its `axis`, flat at its ends) and `capsule` (a
 * cylinder with round ends: as long along its axis as it is wide at least).
 */
export type VoxelShape = 'sphere' | 'ellipsoid' | 'cylinder' | 'capsule';
const SHAPES: VoxelShape[] = ['sphere', 'ellipsoid', 'cylinder', 'capsule'];

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
  /**
   * The same drawing in shadow, the same size, as rows of glyphs (read with
   * `glyphs`): where it has a pixel, that is the color there in shadow, over
   * `shade`; where it is empty, `shade` says it. For two parts of one color
   * that go to different colors in shadow (hair and beard).
   */
  shadeRows?: string[];
  /** The same drawing in shadow as colors per pixel (null: `shade` says it). */
  shadePixels?: (string | null)[][];
  /** The same drawing in shadow as a PGS text drawing (path relative to the model; same `frame`): the command reads it into `shadePixels`. */
  shadeDraw?: string;
  /** Keeps its colors in shadow too: a screen, a lit sign. */
  glow?: boolean;
  /**
   * On a side (+x, +y, -x, -y), the drawing as it is to look on screen, not
   * as it lies on the face. A side shows in 2:1 as a parallelogram, each
   * column of units half a pixel lower than the one before (on +y, the left
   * of the screen) or higher (on +x, the right): a drawing laid on the face
   * comes out sheared, and the other way round once the box turns 90. With
   * `upright`, the drawing is laid on the face's box on screen instead: as
   * many columns as the face has units, and its height plus half its width
   * in rows (`ceil(width / 2)`), row 0 at the face's highest point; what
   * falls off the face does not show. So a cube, a sign, a portrait drawn
   * straight comes out straight on whatever side the box turns it to, from
   * one model. Not on a top, nor on a round shape.
   */
  upright?: boolean;
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
  /** A name it shares with other boxes (an arm, the legs, the head), for the `changes` of a model derived from this one. */
  group?: string;
  /** Layer it is drawn on when the model is split (default "fondo"). */
  layer?: string;
  /** Its layer is a loose piece (see `VoxelPlace.loose`). */
  loose?: boolean;
  /**
   * Drawings on its faces, by face: top, left (+y), right (+x), or -x, -y
   * (they show once it turns). On a round shape the drawing goes on its
   * surface: a top straight down, a side as it is seen from the front (see
   * `paintedOnShape`).
   */
  paint?: Partial<Record<'top' | 'left' | 'right' | PaintFace, VoxelPaint>>;
  /** A round shape that fills the box instead of the box (see `VoxelShape`). */
  shape?: VoxelShape;
  /** The axis of a cylinder or a capsule (default z, standing). */
  axis?: 'x' | 'y' | 'z';
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

/**
 * Boxes, by name: a string names every box whose `id` or `group` is it (`*`
 * stands for any run of characters: "brazo_*"), a list names the boxes of any
 * of them. A name that names no box is refused: a typo would change nothing.
 */
export type VoxelSelector = string | string[];

/** One change a derived model makes to its base: exactly one of remove, replace, add, move or turn. */
export interface VoxelChange {
  /** These boxes go. */
  remove?: VoxelSelector;
  /** These boxes go, and `with` comes in where the first of them was (so it is drawn in its order); a new box without `group` takes theirs when they share one. */
  replace?: VoxelSelector;
  with?: VoxelBox[];
  /** Boxes added at the end (drawn over whatever they overlap). */
  add?: VoxelBox[];
  /** These boxes moved by `by`, [x, y, z] whole units. */
  move?: VoxelSelector;
  by?: [number, number, number];
  /**
   * These boxes turned by quarter turns about the line along `axis` through
   * `about` (whole units, default (0, 0, 0)): a head about its neck, an arm
   * about its shoulder. z: +y goes to +x (as `rotate`); x: what hangs (-z)
   * comes forward to +y; y: what hangs goes out to +x. A box with paint turns
   * only about z (its drawings move round as with `rotate`).
   */
  turn?: VoxelSelector;
  axis?: 'x' | 'y' | 'z';
  degrees?: number;
  about?: [number, number, number];
}

export interface VoxelModel {
  id: string;
  /**
   * Path of another model (relative to this one) this one is, but for
   * `changes`: what it does not say (materials, outline, light, pivot, rotate,
   * palette…) it takes from the base; its `materials` join the base's by name
   * (same name: this one's), its `boxes` and `place` go after the base's. A
   * base can have a base of its own.
   */
  base?: string;
  /** What changes from the base, in order (see `VoxelChange`). */
  changes?: VoxelChange[];
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
  /**
   * Turns of the whole model about its pivot, in degrees: quarter turns (0,
   * 90, 180, 270) or the eighths between them (45, 135, 225, 315), the four
   * views a figure has between the four of the grid: see `turnModel`.
   */
  rotate?: number;
  /**
   * Set by `turnModel` when the turn ends on an eighth: the model is drawn as
   * turned 45° more about its pivot (+y facing the viewer), so only its +y
   * side and its tops show, one unit √2 pixels wide (as a diagonal of the
   * world is on the screen) and a unit of depth 1/√2 high.
   */
  eighth?: boolean;
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
    const turned = turnModel(placeModels(load(p.model, chain), load, [...chain, p.model]));
    if (turned.eighth) throw new Error(`place ${p.model}: a model turned by an eighth (45, 135…) is drawn alone, it cannot be placed in another`);
    const inner = rotateModel(turned, p.rotate ?? 0);
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

const escapeRe = (t: string) => t.replace(/[.+?^$()|[\]{}\\]/g, '\\$&');

/** A model as written: one with a base need not list boxes of its own. */
export type VoxelSource = Omit<VoxelModel, 'boxes'> & { boxes?: VoxelBox[] };

/** Whether a selector names this box. */
function selects(sel: VoxelSelector, b: VoxelBox): boolean {
  const names = Array.isArray(sel) ? sel : [sel];
  return names.some(n => {
    const re = new RegExp('^' + n.split('*').map(escapeRe).join('.*') + '$');
    return (b.id !== undefined && re.test(b.id)) || (b.group !== undefined && re.test(b.group));
  });
}

const AXIS_TURN: Record<'x' | 'y' | 'z', (d: [number, number, number]) => [number, number, number]> = {
  // A quarter turn of a point relative to the line it turns about.
  z: ([x, y, z]) => [y, -x, z],
  x: ([x, y, z]) => [x, -z, y],
  y: ([x, y, z]) => [-z, y, x],
};

/** A box turned a quarter about the line along axis through c: its corners turned, the box between them. */
function turnBox(b: VoxelBox, axis: 'x' | 'y' | 'z', c: [number, number, number]): VoxelBox {
  const corner = (p: number[]) => AXIS_TURN[axis]([p[0] - c[0], p[1] - c[1], p[2] - c[2]]).map((v, i) => v + c[i]);
  const p = corner(b.at), q = corner(b.at.map((v, i) => v + b.size[i]));
  const at = p.map((v, i) => Math.min(v, q[i])) as [number, number, number];
  const size = p.map((v, i) => Math.abs(v - q[i])) as [number, number, number];
  const turned = turnShape({ ...b, at, size }, AXIS_TURN[axis]);
  return axis === 'z' ? turnPaint(turned) : turned;
}

/** A cylinder or capsule's axis after a turn that takes each direction d to f(d). */
function turnShape(b: VoxelBox, f: (d: [number, number, number]) => [number, number, number]): VoxelBox {
  if (b.shape !== 'cylinder' && b.shape !== 'capsule') return b;
  const was = b.axis ?? 'z';
  const d = f(was === 'x' ? [1, 0, 0] : was === 'y' ? [0, 1, 0] : [0, 0, 1]);
  const axis = d[0] ? 'x' : d[1] ? 'y' : 'z';
  return axis === was ? b : { ...b, axis };
}

/**
 * The model as its `base` with its `changes` made: the pose of a figure as the
 * standing one but for its legs and arms, a head turned about its neck, the
 * body raised a unit in a step of a walk. `load` reads a model by its path as
 * written (resolved by the caller, beside the model that names it); bases
 * nest. A model without `base` comes back as it is. The changes go in order,
 * each naming boxes by `id` or `group` (see `VoxelSelector`).
 */
export function deriveModel(model: VoxelSource, load: (path: string, from: string[]) => VoxelSource, chain: string[] = []): VoxelModel {
  if (model.base === undefined) {
    if (model.changes?.length) throw new Error(`${model.id}: changes need a base (the model they change)`);
    return model as VoxelModel;
  }
  if (chain.includes(model.base)) throw new Error(`base: ${model.base} goes round in a circle (${[...chain, model.base].join(' → ')})`);
  if (chain.length > 8) throw new Error(`base: more than 8 levels deep (${chain.join(' → ')})`);
  const base = deriveModel(load(model.base, chain), load, [...chain, model.base]);
  const { base: _base, changes = [], materials, boxes, place, ...own } = model;
  void _base;
  const out: VoxelModel = { ...base, ...own, materials: { ...base.materials, ...materials }, boxes: [...base.boxes, ...(boxes ?? [])] };
  if (base.place || place) out.place = [...(base.place ?? []), ...(place ?? [])];
  const whole = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(x => Number.isInteger(x));
  changes.forEach((ch, k) => {
    const where = `${model.id}: change ${k + 1}`;
    const kinds = (['remove', 'replace', 'add', 'move', 'turn'] as const).filter(f => ch[f] !== undefined);
    if (kinds.length !== 1) throw new Error(`${where}: say one of remove, replace, add, move or turn (it says ${kinds.join(', ') || 'none'})`);
    const kind = kinds[0];
    if (kind === 'add') {
      if (!Array.isArray(ch.add)) throw new Error(`${where}: add is a list of boxes`);
      out.boxes = [...out.boxes, ...ch.add];
      return;
    }
    const sel = ch[kind] as VoxelSelector;
    if (!(typeof sel === 'string' || (Array.isArray(sel) && sel.length && sel.every(n => typeof n === 'string')))) throw new Error(`${where}: ${kind} names boxes by id or group: a name or a list of names`);
    const hit = out.boxes.map(b => selects(sel, b));
    if (!hit.some(Boolean)) throw new Error(`${where}: ${kind} ${JSON.stringify(sel)} names no box (by id or group) in ${base.id}`);
    if (kind === 'remove') { out.boxes = out.boxes.filter((_, i) => !hit[i]); return; }
    if (kind === 'replace') {
      if (!Array.isArray(ch.with)) throw new Error(`${where}: replace needs with, the boxes that go in their place`);
      const groups = [...new Set(out.boxes.filter((_, i) => hit[i]).map(b => b.group))];
      const group = groups.length === 1 ? groups[0] : undefined;
      const first = hit.indexOf(true);
      const news = ch.with.map(b => (b.group === undefined && group !== undefined ? { ...b, group } : b));
      out.boxes = out.boxes.flatMap((b, i) => (i === first ? news : hit[i] ? [] : [b]));
      return;
    }
    if (kind === 'move') {
      if (!whole(ch.by, 3)) throw new Error(`${where}: move needs by, three whole units [x, y, z]`);
      const by = ch.by!;
      out.boxes = out.boxes.map((b, i) => (hit[i] ? { ...b, at: [b.at[0] + by[0], b.at[1] + by[1], b.at[2] + by[2]] } : b));
      return;
    }
    const axis = ch.axis ?? 'z';
    if (!['x', 'y', 'z'].includes(axis)) throw new Error(`${where}: axis is x, y or z, got ${JSON.stringify(axis)}`);
    const degrees = ch.degrees ?? 0;
    if (![90, 180, 270].includes(degrees)) throw new Error(`${where}: turn needs degrees, 90, 180 or 270 (quarter turns), got ${ch.degrees}`);
    const about = ch.about ?? [0, 0, 0];
    if (!whole(about, 3)) throw new Error(`${where}: about is three whole units [x, y, z]`);
    out.boxes = out.boxes.map((b, i) => {
      if (!hit[i]) return b;
      if (axis !== 'z' && b.paint && Object.values(b.paint).some(Boolean)) throw new Error(`${where}: box ${b.id ?? i} has paint, and a box with paint turns only about z`);
      let t = b;
      for (let q = 0; q < degrees / 90; q++) t = turnBox(t, axis, about);
      return t;
    });
  });
  return out;
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
    boxes = boxes.map(b => turnPaint(turnShape({ ...b, at: [b.at[1], W - b.at[0] - b.size[0], b.at[2]], size: [b.size[1], b.size[0], b.size[2]] }, AXIS_TURN.z)));
  }
  return degrees ? { ...model, boxes } : model;
}

/**
 * The model turned by its own `rotate` about its `pivot` (or by `degrees`,
 * when given, on top of it), with `rotate` spent: what a loose figure needs
 * to be drawn facing the other ways. Unlike `rotateModel`, which keeps a
 * placed piece in its corner, this turns about a fixed point, so a figure
 * modelled around its foot keeps its foot where it was: 90 turns +y to +x
 * (what faced the viewer's left faces the right), 180 shows the back. A point
 * (x, y) goes to (px + (y - py), py - (x - px)); the light does not turn.
 *
 * An eighth (45, 135, 225, 315) turns the boxes by the quarter turns below
 * it and marks the model `eighth`: the render turns it the last 45° as it
 * draws (boxes stay on the grid, the view turns), so 45 shows +y to the
 * viewer (down the screen), 135 to the right, 225 away (up), 315 to the left.
 */
export function turnModel(model: VoxelModel, degrees = 0): VoxelModel {
  const total = (model.rotate ?? 0) + degrees + (model.eighth ? 45 : 0);
  if (!Number.isInteger(total / 45)) throw new Error(`rotate is a multiple of 45 (quarter turns, or the eighths between them), got ${total}`);
  const eighths = (((total / 45) % 8) + 8) % 8;
  const turns = Math.floor(eighths / 2);
  const { rotate: _rotate, eighth: _eighth, ...rest } = model;
  void _rotate; void _eighth;
  const half = eighths % 2 === 1;
  if (!turns && !half) return model.rotate === undefined && !model.eighth ? model : rest;
  const [px, py] = model.pivot ?? [0, 0, 0];
  if (!Number.isInteger(px) || !Number.isInteger(py)) throw new Error('pivot is three whole units');
  let boxes = model.boxes;
  for (let k = 0; k < turns; k++) {
    boxes = boxes.map(b => turnPaint(turnShape({ ...b, at: [px + b.at[1] - py, py - (b.at[0] + b.size[0]) + px, b.at[2]], size: [b.size[1], b.size[0], b.size[2]] }, AXIS_TURN.z)));
  }
  return half ? { ...rest, boxes, eighth: true } : { ...rest, boxes };
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
  /** On a round shape, where its surface faces there (unit length): `face` is the nearest of the three. */
  normal?: [number, number, number];
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
/**
 * The same, turned an eighth: seen from the front, a leg stepping back one
 * unit per row (a stair of boxes) jumps more than 3 from one row to the next
 * (√2 for the unit back, plus the row down), and would come out striped.
 */
const STEP_EIGHTH = 4;
const stepOf = (model: VoxelModel) => (model.eighth ? STEP_EIGHTH : STEP);

/** The default layer of a box. */
export const BACK_LAYER = 'fondo';

export function validateVoxel(model: VoxelModel): void {
  if (!model.boxes?.length) throw new Error('a voxel model needs at least one box');
  if (model.pivot !== undefined && (model.pivot.length !== 3 || model.pivot.some(n => !Number.isInteger(n)))) throw new Error('pivot is three whole units, [x, y, z]');
  if (model.light !== undefined && model.light !== 'upper_left' && model.light !== 'upper_right') {
    throw new Error(`light must be upper_left or upper_right (isometric faces), got "${model.light}"`);
  }
  for (const [name, m] of Object.entries(model.materials)) {
    if (m.ramp !== undefined && (!Array.isArray(m.ramp) || m.ramp.length < 2 || m.ramp.length > 4 || m.ramp.some(c => typeof c !== 'string'))) {
      throw new Error(`material "${name}": ramp is two to four colors, from light to dark`);
    }
    if (m.grain !== undefined) validateGrain(m.grain, `material "${name}": grain`);
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
    if (b.shape !== undefined && !SHAPES.includes(b.shape)) throw new Error(`${name}: shape is ${SHAPES.join(', ')}, got ${JSON.stringify(b.shape)}`);
    if (b.axis !== undefined) {
      if (b.shape !== 'cylinder' && b.shape !== 'capsule') throw new Error(`${name}: axis is for a cylinder or a capsule`);
      if (!['x', 'y', 'z'].includes(b.axis)) throw new Error(`${name}: axis is x, y or z, got ${JSON.stringify(b.axis)}`);
    }
    if (b.shape === 'sphere' && (b.size[0] !== b.size[1] || b.size[1] !== b.size[2])) throw new Error(`${name}: a sphere fills a cube (size ${b.size.join('x')}: say ellipsoid)`);
    if (b.shape === 'capsule') {
      const k = AXES[b.axis ?? 'z'];
      const across = Math.min(...b.size.filter((_, j) => j !== k));
      if (b.size[k] < across) throw new Error(`${name}: a capsule is at least as long along its axis as it is wide (${b.size[k]} along ${b.axis ?? 'z'}, ${across} across: say ellipsoid)`);
    }
    if (b.loose && (b.layer ?? BACK_LAYER) === BACK_LAYER) throw new Error(`${name}: a loose piece needs a layer of its own, not "${BACK_LAYER}"`);
    for (const [face] of paintFaces(b, name)) { faceGrid(b, face, name); faceGrid(b, face, name, true); }
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

const AXES = { x: 0, y: 1, z: 2 } as const;

/** A round shape, ready to ask: whether a point is inside it and where its surface faces there. */
interface Solid {
  box: number;
  lo: [number, number, number];
  hi: [number, number, number];
  inside: (p: [number, number, number]) => boolean;
  normal: (p: [number, number, number]) => [number, number, number];
}

function unit(v: [number, number, number]): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function solidOf(b: VoxelBox, i: number): Solid {
  const lo = b.at, hi: [number, number, number] = [b.at[0] + b.size[0], b.at[1] + b.size[1], b.at[2] + b.size[2]];
  const c = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2), r = b.size.map(n => n / 2);
  const shape = b.shape!;
  if (shape === 'sphere' || shape === 'ellipsoid') {
    return {
      box: i, lo, hi,
      inside: p => ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2 <= 1,
      normal: p => unit([(p[0] - c[0]) / r[0] ** 2, (p[1] - c[1]) / r[1] ** 2, (p[2] - c[2]) / r[2] ** 2]),
    };
  }
  const k = AXES[b.axis ?? 'z'];
  const [j, l] = [0, 1, 2].filter(n => n !== k);
  const across = (p: [number, number, number]) => ((p[j] - c[j]) / r[j]) ** 2 + ((p[l] - c[l]) / r[l]) ** 2;
  if (shape === 'cylinder') {
    return {
      box: i, lo, hi,
      inside: p => p[k] >= lo[k] && p[k] < hi[k] && across(p) <= 1,
      // The flat end when the point is nearer to it than to the round side.
      normal: p => {
        const toEnd = Math.min(hi[k] - p[k], p[k] - lo[k]);
        const toSide = (1 - Math.sqrt(across(p))) * Math.min(r[j], r[l]);
        const n: [number, number, number] = [0, 0, 0];
        if (toEnd < toSide) { n[k] = hi[k] - p[k] <= p[k] - lo[k] ? 1 : -1; return n; }
        n[j] = (p[j] - c[j]) / r[j] ** 2; n[l] = (p[l] - c[l]) / r[l] ** 2;
        return unit(n);
      },
    };
  }
  // A capsule: an ellipsoid end of the thinner radius along its axis, slid along the middle.
  const rc = Math.min(r[j], r[l]);
  const along = (p: [number, number, number]) => p[k] - Math.min(Math.max(p[k], lo[k] + rc), hi[k] - rc);
  return {
    box: i, lo, hi,
    inside: p => across(p) + (along(p) / rc) ** 2 <= 1,
    normal: p => {
      const n: [number, number, number] = [0, 0, 0];
      n[j] = (p[j] - c[j]) / r[j] ** 2; n[l] = (p[l] - c[l]) / r[l] ** 2; n[k] = along(p) / rc ** 2;
      return unit(n);
    },
  };
}

/** The round shapes `include` lets in, in the order of their boxes. */
function solids(model: VoxelModel, include: (i: number) => boolean): Solid[] {
  return model.boxes.flatMap((b, i) => (b.shape && include(i) ? [solidOf(b, i)] : []));
}

/** The last of the shapes with this point inside (later boxes win), or -1. */
function solidAt(ss: Solid[], p: [number, number, number]): number {
  for (let k = ss.length - 1; k >= 0; k--) {
    const s = ss[k];
    if (p[0] < s.lo[0] || p[1] < s.lo[1] || p[2] < s.lo[2] || p[0] >= s.hi[0] || p[1] >= s.hi[1] || p[2] >= s.hi[2]) continue;
    if (s.inside(p)) return k;
  }
  return -1;
}

/** The face of a box nearest to where a surface faces: what a shape's hit counts as for whatever asks a face. */
function faceOf(n: [number, number, number], eighth: boolean): Face {
  if (eighth) return n[2] >= n[1] ? 'top' : 'left';
  return n[2] >= n[1] && n[2] >= n[0] ? 'top' : n[1] >= n[0] ? 'left' : 'right';
}

/**
 * Which box fills each cell. A round shape fills the cells whose center it
 * holds, and only with `shapes` (what casts shadows): the render finds a
 * shape's surface by the shape itself, not by its cells.
 */
function occupancy(model: VoxelModel, include: (i: number) => boolean, shapes = false): Grid {
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
    if (!include(i) || (b.shape && !shapes)) return;
    const s = b.shape ? solidOf(b, i) : undefined;
    for (let z = b.at[2]; z < b.at[2] + b.size[2]; z++) {
      for (let y = b.at[1]; y < b.at[1] + b.size[1]; y++) {
        for (let x = b.at[0]; x < b.at[0] + b.size[0]; x++) {
          if (!s || s.inside([x + 0.5, y + 0.5, z + 0.5])) cell[at(x, y, z)] = i;
        }
      }
    }
  });
  return { x0, y0, z0, X, Y, Z, cell, at };
}

/** The cells some round shape's box reaches into: there a ray asks the shape at every point, not by the cell. */
function nearSolids(g: Grid, ss: Solid[]): Uint8Array {
  const near = new Uint8Array(g.cell.length);
  for (const s of ss) {
    for (let z = Math.max(g.z0, s.lo[2]); z < Math.min(g.Z, s.hi[2]); z++) {
      for (let y = Math.max(g.y0, s.lo[1]); y < Math.min(g.Y, s.hi[1]); y++) {
        for (let x = Math.max(g.x0, s.lo[0]); x < Math.min(g.X, s.hi[0]); x++) near[g.at(x, y, z)] = 1;
      }
    }
  }
  return near;
}

/** Cells per side of a block: a block with nothing in it is crossed in one jump. */
const BLOCK = 8;

interface Blocks { nx: number; ny: number; nz: number; full: Uint8Array }

const blockCache = new WeakMap<Grid, Blocks>();

/** Which blocks of BLOCK cells a side have a box in them (or a cell `near` marks): the rest a ray crosses at once. */
function blocksOf(g: Grid, near?: Uint8Array): Blocks {
  const cached = near ? undefined : blockCache.get(g);
  if (cached) return cached;
  const sx = g.X - g.x0, sy = g.Y - g.y0, sz = g.Z - g.z0;
  const nx = Math.ceil(sx / BLOCK), ny = Math.ceil(sy / BLOCK), nz = Math.ceil(sz / BLOCK);
  const full = new Uint8Array(nx * ny * nz);
  for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
    const c = (z * sy + y) * sx + x;
    if (g.cell[c] >= 0 || near?.[c]) full[(((z / BLOCK) | 0) * ny + ((y / BLOCK) | 0)) * nx + ((x / BLOCK) | 0)] = 1;
  }
  const b = { nx, ny, nz, full };
  if (!near) blockCache.set(g, b);
  return b;
}

/**
 * Whether some box fills the cell of this point (other than `self`: a shape
 * does not shade itself, its ramp does), and only the boxes `keep` lets in.
 */
function occupied(g: Grid, x: number, y: number, z: number, self = -1, keep?: (i: number) => boolean): boolean {
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  if (cx < g.x0 || cy < g.y0 || cz < g.z0 || cx >= g.X || cy >= g.Y || cz >= g.Z) return false;
  const i = g.cell[g.at(cx, cy, cz)];
  return i >= 0 && i !== self && (!keep || keep(i));
}

/** Toward the light, per unit of height: high enough that shadows stay short. */
function towardLight(light: VoxelLight): [number, number, number] {
  return light === 'upper_right' ? [0.5, -0.5, 0.7] : [-0.5, 0.5, 0.7];
}

function inShadow(all: Grid, h: VoxelHit, L: [number, number, number], keep?: (i: number) => boolean): boolean {
  // Off the face a hair, so the ray does not start inside its own box.
  const e = 0.02;
  let [x, y, z] = h.point;
  if (h.normal) { x += e * h.normal[0]; y += e * h.normal[1]; z += e * h.normal[2]; }
  else if (h.face === 'top') z += e; else if (h.face === 'left') y += e; else x += e;
  const self = h.normal ? h.box : -1;
  const step = 1 / 8;
  // Walked an eighth of a unit at a time, but an empty block is crossed in
  // one jump, to the last point still in it, found by the same sums the walk
  // does: each coordinate only grows or only shrinks along the walk, so every
  // point between two in one block is in it too (entry 118).
  const [L0, L1, L2] = L;
  const { x0, y0, z0, X, Y, Z } = all;
  const blocks = blocksOf(all);
  const blockAt = (k: number) => {
    const t = k * step;
    const cx = Math.floor(x + t * L0), cy = Math.floor(y + t * L1), cz = Math.floor(z + t * L2);
    if (cx < x0 || cy < y0 || cz < z0 || cx >= X || cy >= Y || cz >= Z) return -1;
    return ((((cz - z0) / BLOCK) | 0) * blocks.ny + (((cy - y0) / BLOCK) | 0)) * blocks.nx + (((cx - x0) / BLOCK) | 0);
  };
  for (let k = 1; z + k * step * L2 < Z + 1; k++) {
    const t = k * step;
    const px = x + t * L0, py = y + t * L1, pz = z + t * L2;
    if (occupied(all, px, py, pz, self, keep)) return true;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    // Off the boxes and going away from them: nothing more to hit.
    if (cz >= Z || (cx < x0 && L0 <= 0) || (cx >= X && L0 >= 0) || (cy < y0 && L1 <= 0) || (cy >= Y && L1 >= 0)) return false;
    const blk = blockAt(k);
    if (blk < 0 || blocks.full[blk]) continue;
    // Where the ray leaves the block, as a real number of steps; then the last point in it, exactly.
    const lo = [x0 + (((cx - x0) / BLOCK) | 0) * BLOCK, y0 + (((cy - y0) / BLOCK) | 0) * BLOCK, z0 + (((cz - z0) / BLOCK) | 0) * BLOCK];
    let leave = Infinity;
    if (L0) leave = Math.min(leave, ((L0 > 0 ? lo[0] + BLOCK : lo[0]) - x) / (step * L0));
    if (L1) leave = Math.min(leave, ((L1 > 0 ? lo[1] + BLOCK : lo[1]) - y) / (step * L1));
    if (L2) leave = Math.min(leave, ((L2 > 0 ? lo[2] + BLOCK : lo[2]) - z) / (step * L2));
    let last = Math.max(k, Math.floor(leave));
    while (last > k && blockAt(last) !== blk) last--;
    while (blockAt(last + 1) === blk) last++;
    k = last;
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
  if (model.eighth) return rasterizeEighth(model, include, casts);
  const g = occupancy(model, include);
  const ss = solids(model, include);
  const { x0, y0, z0, X, Y, Z } = g;
  const all = model.shadows ? occupancy(model, i => casts(i) && !model.materials[model.boxes[i].material].clear, true) : g;
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
  // The ray is walked a sixteenth of a unit at a time. U and V are half units,
  // so A and B are quarters and every point walked is a whole number of
  // sixteenths: the walk goes in integers (T = 16 t), and an empty cell (no
  // box, no round shape near), or a whole empty block of them, is crossed in
  // one jump to the first point past it, the same point the walk one by one
  // would reach (entry 118).
  const near = ss.length ? nearSolids(g, ss) : undefined;
  const blocks = blocksOf(g, near);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const U = uMin + col - pad + 0.5;
      const V = vMin + row - pad + 0.5;
      // Points on this pixel's ray: (A + t, B + t, t), walked from the viewer away.
      const A = (2 * V + U) / 2;
      const B = (2 * V - U) / 2;
      const a = 16 * A, b = 16 * B;
      // From the first point inside the grid: the ones before it are past one of its far sides.
      let T = Math.min(16 * (Math.max(Z, X - A, Y - B) + 1), 16 * X - a - 1, 16 * Y - b - 1, 16 * Z - 1);
      const TEnd = 16 * (Math.min(z0, x0 - A, y0 - B) - 1);
      for (; T > TEnd; T--) {
        const x = (a + T) / 16, y = (b + T) / 16, z = T / 16;
        if (x < x0 || y < y0 || z < z0) break;
        const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
        if (cx >= X || cy >= Y || cz >= Z) continue;
        const c = g.at(cx, cy, cz);
        const i = g.cell[c];
        if (i < 0 && !near?.[c]) {
          // To the last point in this cell, or in its block when the block is
          // empty: the loop steps to the first one past it.
          const bx = ((cx - x0) / BLOCK) | 0, by = ((cy - y0) / BLOCK) | 0, bz = ((cz - z0) / BLOCK) | 0;
          if (blocks.full[(bz * blocks.ny + by) * blocks.nx + bx]) T = Math.max(16 * cx - a, 16 * cy - b, 16 * cz);
          else T = Math.max(16 * (x0 + bx * BLOCK) - a, 16 * (y0 + by * BLOCK) - b, 16 * (z0 + bz * BLOCK));
          continue;
        }
        const point: [number, number, number] = [x, y, z];
        const k = ss.length ? solidAt(ss, point) : -1;
        let hit: VoxelHit;
        if (k >= 0 && ss[k].box > i) {
          const normal = ss[k].normal(point);
          hit = { box: ss[k].box, face: faceOf(normal, false), depth: x + y + z, point, normal };
        } else {
          if (i < 0) continue;
          // The face it came in through is the one whose upper side it is nearest to.
          const dx = cx + 1 - x, dy = cy + 1 - y, dz = cz + 1 - z;
          const face: Face = dz <= dx && dz <= dy ? 'top' : dy <= dx ? 'left' : 'right';
          hit = { box: i, face, depth: x + y + z, point };
        }
        if (model.shadows) hit.shadow = inShadow(all, hit, L);
        hits[row][col] = hit;
        break;
      }
    }
  }
  return { width, height, hits, origin: [-uMin + pad, -vMin + pad] };
}

const SQRT2 = Math.SQRT2;

/** Toward the light in the model's own axes: turned back by the eighth when it is turned one. */
function rayToLight(model: VoxelModel): [number, number, number] {
  const W = towardLight(model.light ?? 'upper_left');
  return model.eighth ? [(W[0] - W[1]) / SQRT2, (W[0] + W[1]) / SQRT2, W[2]] : W;
}

/**
 * `rasterize` for a model turned an eighth (`eighth`): the boxes as they are,
 * turned 45° more about the pivot as they are drawn, so +y faces the viewer.
 * A point (x, y, z) of the model, from the pivot (px, py), lands at
 * u = (px - py) + √2 (x - px), v = (px + py) / 2 + (y - py) / √2 - z, the
 * same screen as the grid's (the pivot where it would be unturned, world
 * (0, 0, 0) at `origin` as always). Only the tops and the +y side show (the
 * ±x sides are edge on), +y as the `left` face; the hits keep the point in
 * the model's own units, so paint reads them as on the grid. The pixel
 * centers sit symmetric about the pivot, so a figure symmetric about its
 * pivot comes out symmetric.
 */
function rasterizeEighth(model: VoxelModel, include: (i: number) => boolean, casts: (i: number) => boolean): Raster {
  const g = occupancy(model, include);
  const ss = solids(model, include);
  const { x0, y0, z0, X, Y, Z } = g;
  const all = model.shadows ? occupancy(model, i => casts(i) && !model.materials[model.boxes[i].material].clear, true) : g;
  // The light, turned back by the eighth into the model's own axes.
  const L = rayToLight(model);
  const [px, py] = model.pivot ?? [0, 0, 0];
  const cu = px - py, cv = (px + py) / 2;
  const uMin = Math.floor(cu + SQRT2 * (x0 - px)), uMax = Math.ceil(cu + SQRT2 * (X - px));
  const vMin = Math.floor(cv + (y0 - py) / SQRT2) - Z, vMax = Math.ceil(cv + (Y - py) / SQRT2 - z0);
  const pad = 1;
  const width = uMax - uMin + 2 * pad;
  const height = vMax - vMin + 2 * pad;
  const hits: (VoxelHit | undefined)[][] = Array.from({ length: height }, () => Array(width).fill(undefined));
  const step = 1 / 32;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const U = uMin + col - pad + 0.5;
      const V = vMin + row - pad + 0.5;
      const x = px + (U - cu) / SQRT2;
      if (x < x0 || x >= X) continue;
      const cx = Math.floor(x);
      // Along the ray: z = t, y = py + √2 (V - cv + t), from the viewer away.
      const yAt = (t: number) => py + SQRT2 * (V - cv + t);
      let t = Math.min(Z, (Y - py) / SQRT2 - (V - cv)) + step;
      const tEnd = Math.max(z0, (y0 - py) / SQRT2 - (V - cv)) - step;
      for (; t > tEnd; t -= step) {
        const y = yAt(t), z = t;
        const cy = Math.floor(y), cz = Math.floor(z);
        if (cy < y0 || cz < z0 || cy >= Y || cz >= Z) continue;
        const i = g.cell[g.at(cx, cy, cz)];
        const k = ss.length ? solidAt(ss, [x, y, z]) : -1;
        if (k >= 0 && ss[k].box > i) {
          const point: [number, number, number] = [x, y, z];
          const normal = ss[k].normal(point);
          const hit: VoxelHit = { box: ss[k].box, face: faceOf(normal, true), depth: SQRT2 * (y - py) + z, point, normal };
          if (model.shadows) hit.shadow = inShadow(all, hit, L);
          hits[row][col] = hit;
          break;
        }
        if (i < 0) continue;
        // Back along the ray to the cell's top and to its +y side: the nearer one is the face it came in through.
        const dz = cz + 1 - z, dy = (cy + 1 - y) / SQRT2;
        const face: Face = dz <= dy ? 'top' : 'left';
        // On that face exactly, so a drawing reads the unit it shows.
        const back = face === 'top' ? dz : dy;
        const point: [number, number, number] = face === 'top'
          ? [x, Math.min(y + SQRT2 * back, cy + 1 - 1e-6), cz + 1 - 1e-6]
          : [x, cy + 1 - 1e-6, Math.min(z + back, cz + 1 - 1e-6)];
        const hit: VoxelHit = { box: i, face, depth: SQRT2 * (point[1] - py) + point[2], point };
        if (model.shadows) hit.shadow = inShadow(all, hit, L);
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

/** Rows an upright drawing has over a side (see `VoxelPaint.upright`): its height, plus the half pixel each column of units slides. */
function uprightRows(W: number, H: number): number {
  return H + Math.ceil(W / 2);
}

const grids = new WeakMap<VoxelPaint, Map<string, (string | undefined)[][]>>();

/** A drawing given as rows of glyphs or as colors, as colors (undefined where the face shows). */
function drawingPixels(p: VoxelPaint, rows: string[] | undefined, pixels: (string | null)[][] | undefined, where: string): (string | undefined)[][] {
  if (rows) {
    return rows.map((row, r) => [...row].map((g, c) => {
      if (g === '.' || g === ' ') return undefined;
      const color = p.glyphs?.[g];
      if (!color) throw new Error(`${where}: glyph "${g}" (row ${r}, column ${c}) is not in glyphs`);
      return color;
    }));
  }
  return pixels!.map(row => row.map(c => (c ? c : undefined)));
}

/**
 * The drawing of one face as a grid the size of the face (undefined where the
 * face shows), laid at its `at` and turned as many times as its box: what the
 * render reads per unit. Refuses a drawing that does not fit its face. With
 * `shade`, the drawing in shadow (`shadeRows`, `shadePixels`), laid the same
 * way, or [] when the paint has none.
 */
function faceGrid(b: VoxelBox, face: PaintFace, name: string, shade = false): (string | undefined)[][] {
  const p = paintFaces(b, name).find(([f]) => f === face)?.[1];
  if (!p) return [];
  const [W, H] = faceSize(b, face);
  const key = `${W}x${H}${shade ? ' shade' : ''}`;
  const cached = grids.get(p)?.get(key);
  if (cached) return cached;
  const where = `${name}: paint ${face}`;
  const sources = [p.rows, p.pixels, p.draw].filter(v => v !== undefined).length;
  if (sources !== 1) throw new Error(`${where}: give one of rows (with glyphs), pixels or draw`);
  if (p.draw !== undefined && !p.pixels) throw new Error(`${where}: draw ${p.draw} is a text drawing the voxel command reads (here, give rows or pixels)`);
  const shades = [p.shadeRows, p.shadePixels, p.shadeDraw].filter(v => v !== undefined).length;
  if (shades > 1) throw new Error(`${where}: give one of shadeRows (with glyphs), shadePixels or shadeDraw`);
  if (p.shadeDraw !== undefined && !p.shadePixels) throw new Error(`${where}: shadeDraw ${p.shadeDraw} is a text drawing the voxel command reads (here, give shadeRows or shadePixels)`);
  if (p.upright !== undefined && typeof p.upright !== 'boolean') throw new Error(`${where}: upright is true or false`);
  if (p.upright && face === 'top') throw new Error(`${where}: upright is for a side (a top shows as drawn, two pixels a unit)`);
  if (p.upright && b.shape) throw new Error(`${where}: upright is for a side of a box (on a round shape the drawing already goes as seen from the front)`);
  let pixels = drawingPixels(p, p.rows, p.pixels, where);
  const dw = Math.max(0, ...pixels.map(r => r.length)), dh = pixels.length;
  if (shade) {
    if (!shades) return [];
    pixels = drawingPixels(p, p.shadeRows, p.shadePixels, `${where} (in shadow)`);
    const sw = Math.max(0, ...pixels.map(r => r.length)), sh = pixels.length;
    // The same drawing in shadow: the same size, so it lies where the drawing does.
    if (sw !== dw || sh !== dh) throw new Error(`${where}: the drawing in shadow is ${sw}x${sh} and the drawing ${dw}x${dh} (the same drawing, with its colors in shadow)`);
  }
  const turns = p.turns ?? 0;
  // The face the drawing was laid on, before its box turned (a top swaps its sides).
  const [w0, h0] = face === 'top' && turns % 2 ? [H, W] : p.upright ? [W, uprightRows(W, H)] : [W, H];
  const [ax, ay] = p.at ?? [0, 0];
  if (!Number.isInteger(ax) || !Number.isInteger(ay) || ax < 0 || ay < 0) throw new Error(`${where}: at is two whole units from the face's top-left, [column, row]`);
  if (ax + dw > w0 || ay + dh > h0) {
    throw new Error(`${where}: the drawing (${dw}x${dh}${ax || ay ? ` at ${ax},${ay}` : ''}) does not fit the face (${w0}x${h0} ${p.upright ? `pixels upright: ${W}x${H} units` : 'units'})`);
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

/**
 * Which unit a pixel of a drawing on a top shows, as [column, row] of the
 * face. Half the pixels of a top fall on a unit's center and show it. The
 * other half (the right pixel of each pair) fall on the corner where four
 * units meet, between the unit on their left and the one on their right,
 * and show one of the other two: the one along +x (drawn half a pixel
 * high), so every unit of the drawing gets a pixel (entry 109).
 *
 * An edge of the drawing that runs along a diagonal of the world comes out
 * flat on the screen, two units per row of pixels, and on one of the two
 * diagonals (which one depends on where the drawing lies, so turning it 180
 * can bring it) the unit along +x is the wrong one: a pixel unlike both its
 * neighbours, which are alike, one yes and one no along the edge (a comb:
 * the heart of the studio's pinball, turned). There the corner shows the
 * unit along -y (half a pixel low), which is like its neighbours: the edge
 * comes out straight, a unit beyond it goes. Only between two shapes at
 * least two units thick at that corner: a mark one unit wide (an arrow, a
 * dot, a line along the diagonal) stays as drawn.
 */
function topUnit(b: VoxelBox, grid: (string | undefined)[][], cx: number, ux: number, uy: number): [number, number] {
  const [ax, ay] = b.at, [sx] = b.size;
  // A pixel on a unit's center, or a corner at the +x edge: the unit under it.
  if (ux === cx || ux >= ax + sx) return [cx - ax, uy - ay];
  const at = (x: number, y: number) => grid[y - ay]?.[x - ax];
  // A tooth: the unit along +x (x, y) is unlike the ones on the left (x - 1,
  // y), the right (x, y - 1) and along -y (x - 1, y - 1), which are alike;
  // each side with the three units beyond it, so both are two units thick
  // (off the face counts as no drawing).
  const tooth = (x: number, y: number) => {
    if (y - 1 < ay) return false;
    const like = at(x - 1, y), own = at(x, y);
    if (own === like) return false;
    return [[x, y - 1], [x - 1, y - 1], [x - 2, y - 1], [x - 1, y - 2], [x - 2, y - 2]].every(([i, j]) => at(i, j) === like)
      && [[x + 1, y], [x, y + 1], [x + 1, y + 1]].every(([i, j]) => at(i, j) === own);
  };
  if (tooth(ux, uy)) return [ux - 1 - ax, uy - 1 - ay];
  return [ux - ax, uy - ay];
}

/** The tones of a shape's material from light to dark: its ramp, or its faces' tones. */
function rampOf(m: VoxelMaterial): string[] {
  return m.ramp ?? [...new Set([m.top, m.left, m.right])];
}

/**
 * How much a shape's surface faces the light there, from 1 (straight at it)
 * to -1 (straight away). The light
 * is the one the materials are written for (as a box's faces take top, left
 * and right whatever way the view turns), so a shape shades as the boxes
 * beside it.
 */
function lightOn(model: VoxelModel, n: [number, number, number]): number {
  const L = unit(towardLight(model.light ?? 'upper_left'));
  return n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
}

/**
 * Where the bands of a ramp change, by how much the surface faces the light:
 * with three tones, a box's top (0.67) takes the first, its lit side (0.48)
 * the second and its side in shadow (-0.48) the third, as on a box; with
 * four, the first is a highlight where it faces the light almost straight on.
 * The darkest band starts a little past where the surface turns from the
 * light, so a sphere is light with a crescent of shade at its lower right, as
 * it is drawn, and not half in the dark.
 */
const BANDS: Record<number, number[]> = { 2: [0], 3: [0.57, -0.1], 4: [0.85, 0.57, -0.1] };

/** The step of its ramp a shape takes there: 0 the lightest; a cast shadow takes one more. */
function rampStep(model: VoxelModel, h: VoxelHit, tones: number): number {
  const s = lightOn(model, h.normal!);
  let k = BANDS[tones].findIndex(t => s >= t);
  if (k < 0) k = tones - 1;
  return Math.min(tones - 1, k + (h.shadow ? 1 : 0));
}

/**
 * Directions a drawing on a shape is laid from, by face: a side from where
 * the figure turned an eighth toward that side is seen (level and from above,
 * as the view looks), the top from straight above.
 */
const FROM: Record<PaintFace, [number, number, number]> = {
  top: [0, 0, 1], '+y': [0, SQRT2 / Math.sqrt(3), 1 / Math.sqrt(3)], '+x': [SQRT2 / Math.sqrt(3), 0, 1 / Math.sqrt(3)],
  '-y': [0, -SQRT2 / Math.sqrt(3), 1 / Math.sqrt(3)], '-x': [-SQRT2 / Math.sqrt(3), 0, 1 / Math.sqrt(3)],
};

/** A side of a box, as a paint names it. */
type Side = Exclude<PaintFace, 'top'>;

/**
 * Of a point of a shape, how far down it is seen from that side: as the
 * eighth view puts it on the screen, the depth along the side over √2 less the
 * height (one unit per pixel row).
 */
const seenDown = (p: [number, number, number], face: Side) =>
  ({ '+y': p[1], '+x': p[0], '-y': -p[1], '-x': -p[0] })[face] / SQRT2 - p[2];

const spans = new WeakMap<VoxelBox, Map<string, [number, number]>>();

/** From the top to the bottom of what that side shows of a shape, as `seenDown` measures it (sampled inside it, a quarter unit apart). */
function seenSpan(b: VoxelBox, face: Side): [number, number] {
  const cached = spans.get(b)?.get(face);
  if (cached) return cached;
  const s = solidOf(b, 0);
  let lo = Infinity, hi = -Infinity;
  const q = 0.25;
  for (let x = b.at[0] + q / 2; x < s.hi[0]; x += q) for (let y = b.at[1] + q / 2; y < s.hi[1]; y += q) for (let z = b.at[2] + q / 2; z < s.hi[2]; z += q) {
    if (!s.inside([x, y, z])) continue;
    const v = seenDown([x, y, z], face);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span: [number, number] = [lo - q / 2, hi + q / 2];
  if (!spans.has(b)) spans.set(b, new Map());
  spans.get(b)!.set(face, span);
  return span;
}

/**
 * The color a drawing on a round shape gives this hit: of the faces that
 * carry one, the one the surface faces most. A drawing on the top is read
 * straight down, one unit per unit as on its box. One on a side is laid on
 * the shape as that side is seen in the view turned an eighth toward it (a
 * face seen from the front): its columns along the side, one unit each as on
 * the box, and its rows spread over the shape from the top of what is seen to
 * the bottom, so seen from the front it reads as drawn, over the whole of the
 * shape, and from the other views it turns with it. In shadow where the surface takes the darkest tone of its
 * ramp (facing away from the light, or in a cast shadow).
 */
function paintedOnShape(model: VoxelModel, h: VoxelHit): string | undefined {
  const b = model.boxes[h.box];
  const name = b.id ? `box "${b.id}"` : `box ${h.box}`;
  const n = h.normal!;
  let best: [PaintFace, VoxelPaint] | undefined, most = 0;
  for (const [face, p] of paintFaces(b, name)) {
    const d = FROM[face];
    const dot = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    if (dot > most) { most = dot; best = [face, p]; }
  }
  if (!best) return undefined;
  const [face, p] = best;
  const [ax, ay] = b.at, [sx, sy, sz] = b.size;
  const cx = Math.floor(h.point[0]), cy = Math.floor(h.point[1]);
  let col: number, row: number;
  if (face === 'top') [col, row] = [cx - ax, cy - ay];
  else {
    const [lo, hi] = seenSpan(b, face);
    row = Math.min(sz - 1, Math.max(0, Math.floor(((seenDown(h.point, face) - lo) / (hi - lo)) * sz)));
    // Left to right as the side is seen: a quarter turn takes +y to +x, -y, -x
    // and the drawing with it, so its columns run along +x, -y, -x, +y.
    col = { '+y': cx - ax, '+x': ay + sy - 1 - cy, '-y': ax + sx - 1 - cx, '-x': cy - ay }[face];
  }
  const c = faceGrid(b, face, name)[row]?.[col];
  if (c === undefined) return undefined;
  const tones = rampOf(model.materials[b.material]).length;
  const dark = h.shadow || rampStep(model, h, tones) === tones - 1;
  return dark && !p.glow ? faceGrid(b, face, name, true)[row]?.[col] ?? p.shade?.[c] ?? c : c;
}

/** The color a drawing gives this hit, already in its light, or undefined where no drawing is. */
function paintedTone(model: VoxelModel, h: VoxelHit): string | undefined {
  const b = model.boxes[h.box];
  if (!b.paint) return undefined;
  if (h.normal) return paintedOnShape(model, h);
  const [ax, ay, az] = b.at, [sx, sy, sz] = b.size;
  const cx = Math.floor(h.point[0]), cy = Math.floor(h.point[1]), cz = Math.floor(h.point[2]);
  // Only the box's own face: a face some later box laid inside it is not.
  let face: PaintFace, col: number, row: number;
  if (h.face === 'top' && model.eighth) {
    if (cz + 1 !== az + sz) return undefined;
    face = 'top';
    // Seen turned, a top is no 2:1 lattice: each pixel shows the unit under it.
    [col, row] = [cx - ax, cy - ay];
  }
  else if (h.face === 'top') {
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
    const uy = Math.floor(y - 0.25 + 1e-6);
    [col, row] = topUnit(b, faceGrid(b, 'top', b.id ? `box "${b.id}"` : `box ${h.box}`), cx, ux, uy);
  }
  else if (h.face === 'left') { if (cy + 1 !== ay + sy) return undefined; face = '+y'; col = cx - ax; row = az + sz - 1 - cz; }
  else { if (cx + 1 !== ax + sx) return undefined; face = '+x'; col = ay + sy - 1 - cy; row = az + sz - 1 - cz; }
  const p = paintFaces(b, '').find(([f]) => f === face)?.[1];
  if (!p) return undefined;
  if (p.upright && face !== 'top') {
    // The row on screen, from the face's highest point: how far down the
    // point is from the face's top edge, plus how far that edge has slid
    // down there (half a pixel a unit: on +y from its left end, on +x from
    // its right one). Seen turned an eighth a side shows from the front,
    // unsheared: the drawing's middle on the face's middle.
    const down = az + sz - h.point[2];
    const [W] = faceSize(b, face);
    const slid = model.eighth ? Math.ceil(W / 2) / 2 : face === '+y' ? (h.point[0] - ax) / 2 : (h.point[1] - ay) / 2;
    row = Math.floor(down + slid + 1e-6);
  }
  const name = b.id ? `box "${b.id}"` : `box ${h.box}`;
  const c = faceGrid(b, face, name)[row]?.[col];
  if (c === undefined) return undefined;
  const dark = h.shadow || h.face === (model.light === 'upper_right' ? 'left' : 'right');
  // In shadow: what the drawing in shadow says there, else the shade of its color.
  return dark && !p.glow ? faceGrid(b, face, name, true)[row]?.[col] ?? p.shade?.[c] ?? c : c;
}

/** The tone of one hit: the face, the tiles, the light and the shadow. */
function tone(model: VoxelModel, h: VoxelHit): string {
  const painted = paintedTone(model, h);
  if (painted !== undefined) return painted;
  const m = model.materials[model.boxes[h.box].material];
  if (h.normal) {
    const ramp = rampOf(m);
    return ramp[rampStep(model, h, ramp.length)];
  }
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

/**
 * Colors, rim and contour over a raster, still on the uncropped canvas.
 * `seam`, for a pixel and its neighbour, says whether the line goes there
 * when it decides (two loose pieces, each drawn alone), undefined when not.
 */
function paint(model: VoxelModel, r: Raster, seam?: (h: VoxelHit, n: VoxelHit) => boolean | undefined): (string | undefined)[][] {
  const { width, height, hits } = r;
  const pixels: (string | undefined)[][] = hits.map(row => row.map(h => (h ? tone(model, h) : undefined)));

  // On a round shape, a pixel of one band alone among another's (where a band
  // edge grazes the lattice) takes its neighbours' tone: bands, not specks.
  const plain = (h: VoxelHit | undefined, box: number) => !!h?.normal && h.box === box && paintedTone(model, h) === undefined;
  const near4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const before = pixels.map(row => [...row]);
  hits.forEach((row, y) => row.forEach((h, x) => {
    if (!h || !plain(h, h.box)) return;
    const around = near4.filter(([dy, dx]) => plain(hits[y + dy]?.[x + dx], h.box)).map(([dy, dx]) => before[y + dy][x + dx]!);
    if (around.length < 2 || around.some(c => c === before[y][x])) return;
    const most = around.reduce((m, c) => (around.filter(v => v === c).length > around.filter(v => v === m).length ? c : m), around[0]);
    pixels[y][x] = most;
  }));

  // The rim: a lit top pixel right above a side of the same box.
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width; col++) {
      const h = hits[row][col], below = hits[row + 1][col];
      if (h?.face !== 'top' || h.normal || h.shadow || !below || below.box !== h.box || below.face === 'top') continue;
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
          // line of one thing standing in front of another, on the far side
          // (not within one round shape: its surface runs steep toward its
          // silhouette, and is one thing).
          // Two loose pieces, each drawn alone: the line is on the one behind.
          const cut = h ? seam?.(h, n) : undefined;
          if (cut !== undefined) { if (cut) { out[row][col] = ink; break; } continue; }
          if (!h || (n.depth - h.depth > stepOf(model) && !(n.normal && n.box === h.box))) { out[row][col] = ink; break; }
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

function validateGrain(g: VoxelGrain, where: string): void {
  const whole = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0;
  if (!Array.isArray(g.colors) || !g.colors.length || g.colors.some(c => typeof c !== 'string' || !c)) throw new Error(`${where}: colors is one color or more, the specks'`);
  if (typeof g.density !== 'number' || !(g.density >= 0 && g.density <= 1)) throw new Error(`${where}: density is the share of units with a speck, 0 to 1`);
  if (g.seed !== undefined && !Number.isInteger(g.seed)) throw new Error(`${where}: seed is a whole number`);
  if (g.stones !== undefined) {
    const st = g.stones;
    if (!Array.isArray(st.colors) || st.colors.length !== 2 || st.colors.some(c => typeof c !== 'string' || !c)) throw new Error(`${where}: stones.colors is two colors, [body, shaded corner]`);
    if (!whole(st.every)) throw new Error(`${where}: stones.every is a whole number of units, one pebble every so many along the side`);
    if (st.below !== undefined && !(Number.isInteger(st.below) && st.below >= 0)) throw new Error(`${where}: stones.below is a whole number of units from the top edge`);
  }
  if (g.roots !== undefined) {
    const r = g.roots;
    if (typeof r.color !== 'string' || !r.color) throw new Error(`${where}: roots.color is a color`);
    if (!whole(r.every)) throw new Error(`${where}: roots.every is a whole number of units, one root every so many along the side`);
    if (!Array.isArray(r.length) || r.length.length !== 2 || !whole(r.length[0]) || !whole(r.length[1]) || r.length[0] > r.length[1]) throw new Error(`${where}: roots.length is [shortest, longest], whole units`);
  }
}

/** A small seeded generator (mulberry32): the same seed, the same numbers. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One side of a box under its material's grain, as a drawing the size of the side (null where the material shows). */
function grainPixels(g: VoxelGrain, b: VoxelBox, face: PaintFace): (string | null)[][] {
  const [W, H] = faceSize(b, face);
  const rnd = seeded(`${g.seed ?? 0}|${face}|${b.at.join(',')}|${b.size.join(',')}`);
  const int = (n: number) => Math.floor(rnd() * n);
  const c: (string | null)[][] = Array.from({ length: H }, () => Array(W).fill(null));
  const put = (x: number, y: number, color: string) => { if (y >= 0 && y < H && x >= 0 && x < W) c[y][x] = color; };
  for (let k = Math.round(W * H * g.density); k > 0; k--) put(int(W), int(H), g.colors[int(g.colors.length)]);
  const st = g.stones;
  if (st && W > 4 && H - 4 > (st.below ?? 0)) {
    for (let k = Math.floor(W / st.every); k > 0; k--) {
      const x = int(W - 4), y = (st.below ?? 0) + int(H - 4 - (st.below ?? 0));
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, -1]]) put(x + dx, y + dy, st.colors[0]);
      put(x + 2, y + 1, st.colors[1]);
    }
  }
  const r = g.roots;
  if (r) {
    for (let k = Math.floor(W / r.every); k > 0; k--) {
      let x = int(W);
      const n = r.length[0] + int(r.length[1] - r.length[0] + 1);
      for (let y = 0; y < n && y < H; y++) {
        put(x, y, r.color);
        x += [-1, 0, 0, 1][int(4)];
      }
    }
  }
  return c;
}

/**
 * The model with the grain of its materials laid on the sides of their boxes
 * as drawings (`paint`), so a grain takes the light of each side as any
 * drawing does (as given on the lit side, a step darker on the side in shadow
 * and in cast shadow). A side the box already paints keeps its drawing; a top
 * and a round shape keep their material. The render does it by itself; the
 * voxel command does it first, to fill the shade of its colors from the
 * palette as it does for every drawing.
 */
export function grainPaints(model: VoxelModel): VoxelModel {
  if (!Object.values(model.materials).some(m => m.grain)) return model;
  const boxes = model.boxes.map((b, i) => {
    const g = model.materials[b.material]?.grain;
    if (!g || b.shape) return b;
    validateGrain(g, `material "${b.material}": grain`);
    const has = new Set(paintFaces(b, b.id ? `box "${b.id}"` : `box ${i}`).map(([f]) => f));
    const paint: VoxelBox['paint'] = { ...b.paint };
    for (const face of ['+x', '+y', '-x', '-y'] as PaintFace[]) {
      if (!has.has(face)) paint[face] = { pixels: grainPixels(g, b, face) };
    }
    return { ...b, paint };
  });
  return { ...model, boxes };
}

/** The whole model, cropped to what was drawn. */
export function renderVoxel(model: VoxelModel): VoxelImage {
  model = turnModel(grainPaints(model));
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
 * the whole but for the line at the foot of the piece; `whole` is the room as
 * placed, to compare, drawn as the loose pieces stack: where two meet, neither
 * shades the other and the one in front keeps its contour on the one behind.
 *
 * With `only`, just those layers are drawn (the others are left out of
 * `layers`, and `names` says them all): a piece of furniture drawn in its
 * room for its light needs neither the back nor the other pieces, and comes
 * out the same as when everything is drawn.
 */
export function renderVoxelLayers(model: VoxelModel, only?: string[]): { whole: VoxelImage; layers: Record<string, VoxelImage>; loose: string[]; names: string[] } {
  model = turnModel(grainPaints(model));
  validateVoxel(model);
  const layerOf = (i: number) => model.boxes[i].layer ?? BACK_LAYER;
  const fixed = (i: number) => !model.boxes[i].loose;
  const names = voxelLayers(model);
  const loose = names.filter(n => model.boxes.some(b => b.loose && (b.layer ?? BACK_LAYER) === n));
  const wants = (name: string) => !only || only.includes(name);
  // The back is drawn for itself and for the shadows of the loose pieces, which fall on it.
  const needBack = wants(names[0]) || (!!model.shadows && loose.some(n => wants(`${n}_sombra`)));
  const full = rasterize(model, () => true);
  const fullPx = paint(model, full);
  const box = contentBox(fullPx)!;
  // Everything as placed: what the layers on top are cut from (a desk still
  // hides the legs behind it, and its shadow on a low wall stays there).
  const r = full;
  const pixels = fullPx;
  // The room without the loose pieces: what the back is cut from.
  const room = loose.length && needBack ? rasterize(model, fixed, fixed) : r;
  const roomPx = loose.length && needBack ? paint(model, room) : pixels;
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
        return !!n && mine[y + dy][x + dx] && n.depth - rr.hits[y][x]!.depth > stepOf(model);
      });
      const own = px.map((row, y) => row.map((c, x) => {
        if (c === undefined) return undefined;
        const take = rr.hits[y][x] ? mine[y][x] || (c === ink && outlines(y, x)) : near.some(([dy, dx]) => mine[y + dy]?.[x + dx]);
        if (!take) return undefined;
        claimed[y][x] = true;
        return c;
      }));
      const hits = rr.hits.map((row, y) => row.map((h, x) => (mine[y][x] ? h : undefined)));
      if (keep && wants(name)) layers[name] = cropped({ ...rr, hits }, own, box);
    });
    return claimed;
  };
  const claimedTop = claim(r, pixels, true);
  let back: (string | undefined)[][] = [], backHits: (VoxelHit | undefined)[][] = [];
  if (needBack) {
    const claimed = loose.length ? claim(room, roomPx, false) : claimedTop;
    // The back is the whole wherever nothing on top covers it, and drawn alone
    // under what does: it has to have floor where the front wall stands.
    const alone = rasterize(model, i => layerOf(i) === names[0], fixed);
    const behind = paint(model, alone);
    back = roomPx.map((row, y) => row.map((c, x) => (claimed[y][x] ? behind[y][x] : c)));
    backHits = room.hits.map((row, y) => row.map((h, x) => (claimed[y][x] ? alone.hits[y][x] : h && layerOf(h.box) === names[0] ? h : undefined)));
    if (wants(names[0])) layers[names[0]] = cropped({ ...room, hits: backHits }, back, box);
  }
  // Each loose piece alone, and the floor and walls it darkens, in the tone
  // the room gives them in shadow (a joint stays a joint).
  const L = towardLight(model.light ?? 'upper_left');
  for (const name of loose) {
    const its = (i: number) => layerOf(i) === name;
    // Whole and with its own contour, in the room's light where it stands.
    if (wants(name)) {
      const piece = rasterize(model, its, i => its(i) || fixed(i));
      layers[name] = cropped(piece, paint(model, piece), box);
    }
    if (!model.shadows || !wants(`${name}_sombra`)) continue;
    const casts = occupancy(model, i => its(i) && !model.materials[model.boxes[i].material].clear, true);
    const shade = back.map(row => row.map((): string | undefined => undefined));
    const hits = backHits.map(row => row.map((): VoxelHit | undefined => undefined));
    backHits.forEach((row, y) => row.forEach((h, x) => {
      if (!h || h.shadow) return;
      // Only what shows its own tone: the contour of something else stays its contour.
      const c = back[y][x];
      if (c !== tone(model, h) && c !== model.materials[model.boxes[h.box].material].edge) return;
      if (!inShadow(casts, h, L)) return;
      hits[y][x] = { ...h, shadow: true };
      shade[y][x] = tone(model, hits[y][x]!);
    }));
    layers[`${name}_sombra`] = cropped({ ...room, hits }, shade, box);
  }
  // In the order the boxes name them, each shadow after its piece.
  const ordered: Record<string, VoxelImage> = {};
  const all: string[] = [];
  for (const name of names) {
    all.push(name);
    if (model.shadows && loose.includes(name)) all.push(`${name}_sombra`);
    if (layers[name]) ordered[name] = layers[name];
    if (layers[`${name}_sombra`]) ordered[`${name}_sombra`] = layers[`${name}_sombra`];
  }
  // The whole as the loose pieces stack: each is drawn alone, so where two
  // meet (a pinball against an arcade) neither shades the other and the one
  // in front keeps its contour. The layers are cut from the whole as placed.
  if (loose.length > 1) {
    const isLoose = (i: number) => !!model.boxes[i].loose;
    let apart = full;
    if (model.shadows) {
      const blocks = (i: number) => !model.materials[model.boxes[i].material].clear;
      const fixedGrid = occupancy(model, i => !isLoose(i) && blocks(i), true);
      const looseGrid = occupancy(model, i => isLoose(i) && blocks(i), true);
      const ray = rayToLight(model);
      apart = { ...full, hits: full.hits.map(row => row.map(h => {
        if (!h?.shadow || !isLoose(h.box)) return h;
        const mine = layerOf(h.box);
        return inShadow(fixedGrid, h, ray) || inShadow(looseGrid, h, ray, i => layerOf(i) === mine) ? h : { ...h, shadow: false };
      })) };
    }
    // Which of two loose pieces goes in front, as a game stacks them: the one
    // whose footprint lies wholly past the other's along x or y; when the
    // footprints overlap, the nearer point.
    const feet = new Map<string, [number, number, number, number]>();
    model.boxes.forEach((b, i) => {
      if (!isLoose(i)) return;
      const f = feet.get(layerOf(i)) ?? [Infinity, -Infinity, Infinity, -Infinity];
      feet.set(layerOf(i), [Math.min(f[0], b.at[0]), Math.max(f[1], b.at[0] + b.size[0]), Math.min(f[2], b.at[1]), Math.max(f[3], b.at[1] + b.size[1])]);
    });
    const past = (a: string, b: string) => feet.get(a)![0] >= feet.get(b)![1] || feet.get(a)![2] >= feet.get(b)![3];
    const seam = (h: VoxelHit, n: VoxelHit) => {
      if (!isLoose(h.box) || !isLoose(n.box)) return undefined;
      const mine = layerOf(h.box), its = layerOf(n.box);
      if (mine === its) return undefined;
      return past(its, mine) || (!past(mine, its) && n.depth > h.depth);
    };
    return { whole: cropped(apart, paint(model, apart, seam), box), layers: ordered, loose, names: all };
  }
  return { whole: cropped(full, fullPx, box), layers: ordered, loose, names: all };
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
