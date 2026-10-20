// Voxels to isometric pixel art: the first try (the studio, 19 Oct 2026).
//
// The studio needs furniture in isometric, and the question it asks first is
// whether furniture modelled as boxes and projected comes out as pixel art or
// as a shrunk 3D render. This is the smallest thing that answers it: a model is
// a list of boxes, each of a material; a material says the tone of each face
// the 2:1 projection shows (top, left, right), always palette colors by name;
// and the pass that makes it drawn is what a pixel artist does by hand to a
// box — one tone per face, a contour of one pixel, a line where one thing
// stands in front of another, and a lighter rim where the top meets a side.
//
// The projection is the classic 2:1 one: one world unit along x moves one
// pixel right and half a pixel down, along y one pixel left and half down,
// along z one pixel up. A box 16 wide is a 32 px diamond; edges come out as
// clean two-to-one steps because every pixel samples its center.
//
// Pure: no Node imports.

export interface VoxelMaterial {
  /** Tone of the face that looks up. */
  top: string;
  /** Tone of the face that looks down-left (+y). */
  left: string;
  /** Tone of the face that looks down-right (+x). */
  right: string;
  /** Rim where the top meets a side, toward the viewer (optional). */
  edge?: string;
}

export interface VoxelBox {
  /** Far-bottom corner, in world units: x goes down-right, y down-left, z up. */
  at: [number, number, number];
  /** Extent along x, y, z. */
  size: [number, number, number];
  material: string;
  id?: string;
}

export interface VoxelModel {
  id: string;
  name?: string;
  materials: Record<string, VoxelMaterial>;
  boxes: VoxelBox[];
  /** Silhouette contour and the line where something stands in front: a color, or false for none. */
  outline?: string | false;
}

export type Face = 'top' | 'left' | 'right';

export interface VoxelHit {
  box: number;
  face: Face;
  /** x + y + z of the point hit: larger is closer to the viewer. */
  depth: number;
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

export function validateVoxel(model: VoxelModel): void {
  if (!model.boxes?.length) throw new Error('a voxel model needs at least one box');
  model.boxes.forEach((b, i) => {
    const name = b.id ? `box "${b.id}"` : `box ${i}`;
    if (!model.materials[b.material]) {
      throw new Error(`${name}: material "${b.material}" is not in materials (${Object.keys(model.materials).join(', ')})`);
    }
    for (const n of [...b.at, ...b.size]) if (!Number.isInteger(n)) throw new Error(`${name}: at and size are whole units`);
    if (b.size.some(n => n <= 0)) throw new Error(`${name}: size must be positive`);
    if (b.at.some(n => n < 0)) throw new Error(`${name}: at cannot be negative`);
  });
}

export function renderVoxel(model: VoxelModel): VoxelImage {
  validateVoxel(model);
  const X = Math.max(...model.boxes.map(b => b.at[0] + b.size[0]));
  const Y = Math.max(...model.boxes.map(b => b.at[1] + b.size[1]));
  const Z = Math.max(...model.boxes.map(b => b.at[2] + b.size[2]));

  // The occupancy grid: later boxes win, so a drawer front laid on a cabinet
  // is simply listed after it.
  const cell = new Int32Array(X * Y * Z).fill(-1);
  const at = (x: number, y: number, z: number) => (z * Y + y) * X + x;
  model.boxes.forEach((b, i) => {
    for (let z = b.at[2]; z < b.at[2] + b.size[2]; z++) {
      for (let y = b.at[1]; y < b.at[1] + b.size[1]; y++) {
        for (let x = b.at[0]; x < b.at[0] + b.size[0]; x++) cell[at(x, y, z)] = i;
      }
    }
  });

  // Screen bounds: u = x - y, v = (x + y) / 2 - z.
  const uMin = -Y, uMax = X;
  const vMin = -Z, vMax = (X + Y) / 2;
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
      const tEnd = Math.min(0, -A, -B) - 1;
      for (; t > tEnd; t -= step) {
        const x = A + t, y = B + t, z = t;
        if (x < 0 || y < 0 || z < 0) break;
        const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
        if (cx >= X || cy >= Y || cz >= Z) continue;
        const i = cell[at(cx, cy, cz)];
        if (i < 0) continue;
        // The face it came in through is the one whose upper side it is nearest to.
        const dx = cx + 1 - x, dy = cy + 1 - y, dz = cz + 1 - z;
        const face: Face = dz <= dx && dz <= dy ? 'top' : dy <= dx ? 'left' : 'right';
        hits[row][col] = { box: i, face, depth: x + y + z };
        break;
      }
    }
  }

  const pixels: (string | undefined)[][] = hits.map(r => r.map(h => {
    if (!h) return undefined;
    const m = model.materials[model.boxes[h.box].material];
    return m[h.face];
  }));

  // The rim: a top pixel right above a side of the same box.
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width; col++) {
      const h = hits[row][col], below = hits[row + 1][col];
      if (h?.face !== 'top' || !below || below.box !== h.box || below.face === 'top') continue;
      const edge = model.materials[model.boxes[h.box].material].edge;
      if (edge) pixels[row][col] = edge;
    }
  }

  if (model.outline !== false) {
    const ink = model.outline ?? 'tinta';
    const near = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const out = pixels.map(r => [...r]);
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
    for (let row = 0; row < height; row++) pixels[row] = out[row];
  }

  // Cropped to what was drawn: the box of the whole model leaves empty rows
  // where nothing reaches (a monitor on a desk does not fill the top corner).
  const filled = (r: number, c: number) => pixels[r][c] !== undefined;
  const rows = pixels.map((row, r) => row.some((_, c) => filled(r, c)));
  const top = rows.indexOf(true), bottom = rows.lastIndexOf(true);
  const cols = Array.from({ length: width }, (_, c) => pixels.some((_, r) => filled(r, c)));
  const left = cols.indexOf(true), right = cols.lastIndexOf(true);
  const crop = <T>(g: T[][]) => g.slice(top, bottom + 1).map(row => row.slice(left, right + 1));
  return {
    width: right - left + 1, height: bottom - top + 1,
    pixels: crop(pixels), hits: crop(hits),
    origin: [-uMin + pad - left, -vMin + pad - top],
  };
}
