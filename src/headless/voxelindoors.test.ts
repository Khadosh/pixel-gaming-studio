// The inside of a room lit by its lamps instead of the sun (indoors).
import { describe, it, expect } from 'vitest';
import { renderVoxel, renderVoxelLayers, type VoxelModel } from './voxel';

const mats = {
  piso: { top: '#cccccc', left: '#999999', right: '#666666', shade: '#555555' },
  caja: { top: '#ffcc00', left: '#cc9900', right: '#996600' },
};

/** A floor 60 x 60 with a block 6 high in the middle and a wall 30 high at the back, along x = 8. */
function sala(extra: Partial<VoxelModel> = {}): VoxelModel {
  return {
    id: 'sala', outline: false, shadows: true, materials: mats,
    boxes: [
      { at: [0, 0, 0], size: [60, 60, 2], material: 'piso' },
      { at: [20, 20, 2], size: [6, 6, 6], material: 'caja', id: 'caja' },
      { at: [8, 0, 2], size: [2, 60, 30], material: 'caja', id: 'pared' },
    ],
    ...extra,
  };
}

/** Whether the floor at world (x, y) is in shadow: the pixel that shows that unit of the floor's top. */
function sombra(m: VoxelModel, x: number, y: number): boolean {
  const img = renderVoxel(m);
  for (const row of img.hits) for (const h of row) {
    if (h && h.face === 'top' && Math.floor(h.point[0]) === x && Math.floor(h.point[1]) === y && Math.abs(h.point[2] - 2) < 0.1) return !!h.shadow;
  }
  throw new Error(`the floor at ${x}, ${y} does not show`);
}

describe('indoors: a room lit by its lamps', () => {
  const lampara = (at: [number, number, number], reach = 80) => ({ indoors: [{ at: [10, 0, 2] as [number, number, number], size: [36, 60, 40] as [number, number, number], lamps: [{ at, reach }] }] });

  it('a block casts its shadow away from the lamp, not the way of the sun', () => {
    // The sun (upper left) throws it toward +x, -y; a lamp at +x throws it toward -x.
    expect(sombra(sala(), 28, 22)).toBe(true);
    const m = sala(lampara([36, 23, 30]));
    expect(sombra(m, 17, 23)).toBe(true);
    expect(sombra(m, 28, 22)).toBe(false);
  });

  it('past its reach the floor is in shadow: the far corners stay dark', () => {
    const m = sala(lampara([24, 30, 30], 34));
    expect(sombra(m, 24, 34)).toBe(false);
    expect(sombra(m, 44, 58)).toBe(true);
  });

  it('outside the room the sun lights as before', () => {
    const m = sala(lampara([36, 23, 30]));
    expect(sombra(m, 50, 30)).toBe(sombra(sala(), 50, 30));
    expect(sombra(m, 50, 30)).toBe(false);
  });

  it('a lamp does not light through a wall', () => {
    // The room is the whole floor, the lamp on the far side of the wall.
    const indoors = [{ at: [0, 0, 2] as [number, number, number], size: [60, 60, 40] as [number, number, number], lamps: [{ at: [4, 30, 20] as [number, number, number], reach: 200 }] }];
    expect(sombra(sala({ indoors }), 40, 46)).toBe(true);
    const sinPared = sala({ indoors });
    sinPared.boxes = sinPared.boxes.filter(b => b.id !== 'pared');
    expect(sombra(sinPared, 40, 46)).toBe(false);
  });

  it('refuses a lamp with no reach and a turned model', () => {
    expect(() => renderVoxel(sala({ indoors: [{ at: [0, 0, 0], size: [1, 1, 1], lamps: [{ at: [0, 0, 0], reach: 0 }] }] }))).toThrow(/reach/);
    expect(() => renderVoxel(sala({ ...lampara([1, 1, 1]), projection: 'front' }))).toThrow(/indoors/);
  });
});

describe('indoors: the shadow of a loose piece', () => {
  const lampara = { indoors: [{ at: [10, 0, 2] as [number, number, number], size: [36, 60, 40] as [number, number, number], lamps: [{ at: [36, 23, 30] as [number, number, number], reach: 80 }] }] };

  /** The room with the block loose, in a layer of its own. */
  function suelta(extra: Partial<VoxelModel> = {}): VoxelModel {
    const m = sala(extra);
    m.boxes = m.boxes.map(b => (b.id === 'caja' ? { ...b, layer: 'mueble', loose: true } : b));
    return m;
  }

  /** Whether the piece's `_sombra` layer darkens the floor at world (x, y). */
  function enSuSombra(m: VoxelModel, x: number, y: number): boolean {
    const capa = renderVoxelLayers(m, ['mueble_sombra']).layers.mueble_sombra;
    for (const row of capa.hits) for (const h of row) {
      if (h && h.face === 'top' && Math.floor(h.point[0]) === x && Math.floor(h.point[1]) === y && Math.abs(h.point[2] - 2) < 0.1) return !!h.shadow;
    }
    return false;
  }

  it('in a room, it falls away from the lamp, as the whole draws it', () => {
    const m = suelta(lampara);
    expect(enSuSombra(m, 17, 23)).toBe(true);
    expect(enSuSombra(m, 28, 22)).toBe(false);
    expect(sombra(sala(lampara), 17, 23)).toBe(true);
  });

  it('outside a room, it falls the way of the sun, as before', () => {
    // Without the wall, whose own shadow (the sun's) covers that floor already.
    const m = suelta();
    m.boxes = m.boxes.filter(b => b.id !== 'pared');
    expect(enSuSombra(m, 28, 22)).toBe(true);
    expect(enSuSombra(m, 17, 23)).toBe(false);
  });
});
