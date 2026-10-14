// @vitest-environment node
// The steps of a mine on top of a cavern (unwritten-dao #400, the iron vein): the rim of cobbles, the ore in the
// faces, the faces in blocks, the timber frames, the burrow and the lumps of ore.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';

type Steps = MapRecipe['steps'];
const SHADE: Record<string, string> = {
  'piedra clara': 'piedra', piedra: 'piedra sombra', 'piedra sombra': 'túnica oscura', 'túnica oscura': 'pelo oscuro',
  'pelo claro': 'pelo oscuro', 'pelo oscuro': 'túnica noche', 'túnica noche': 'tinta', tinta: 'tinta',
  madera: 'madera sombra', 'madera sombra': 'túnica noche', tierra: 'tierra sombra', 'tierra sombra': 'madera sombra',
};
// a corridor along row 3 under three rows of rock (a face over it), a wall row 4, a room below
const GRID = ['############', '############', '############', '#..........#', '#.#####.####', '#..........#', '#..........#', '############'];
const game = (): MapGame => ({ width: 12, height: 8, grid: GRID, decor: [] });
const recipe = (steps: Steps): MapRecipe => ({ game: game(), margin: [3, 3], seed: 7, shade: SHADE, materials: {}, steps });
const CAVE = { step: 'cavern' } as const;
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const count = (m: PaintedMap, layer: string, pred: (c: string) => boolean) => {
  let n = 0;
  for (let i = 0; i < m.width * m.height; i++) { const c = m.layers[layer]?.px[i]; if (c && pred(c)) n++; }
  return n;
};
// px of the cell (u, v): the margin is 3 cells
const X = (u: number) => 48 + u * 16, Y = (v: number) => 48 + v * 16;

describe('map mine steps', () => {
  it('cavern rim: a band of cobbles on the rock along the floor, in its three tones and the gap; none without it', () => {
    const tones = ['piedra clara', 'piedra', 'piedra sombra', 'túnica oscura'] as [string, string, string, string];
    const m = paintMap(recipe([{ step: 'cavern', rim: { tones } }]), game());
    const plain = paintMap(recipe([CAVE]), game());
    for (const c of tones) expect(count(m, 'ground', k => k === c), c).toBeGreaterThan(20);
    expect(count(plain, 'ground', k => k === 'piedra clara')).toBeLessThan(count(m, 'ground', k => k === 'piedra clara'));
    // the middle of a long rock mass stays rock-top (not cobbles)
    expect(tones).not.toContain(at(m, 'ground', X(5), Y(0) - 30));
  });

  it('cavern veins: rust flecks in the faces and twinkles on the glints layer; blocks put joints in the face', () => {
    const m = paintMap(recipe([{ step: 'cavern', veins: { odds: 0.5 } }]), game());
    expect(count(m, 'ground', c => c === 'piel sombra')).toBeGreaterThan(5);
    expect(count(m, 'brillos', c => c === 'fuego luz')).toBeGreaterThan(0);
    const none = paintMap(recipe([CAVE]), game());
    expect(count(none, 'ground', c => c === 'piel sombra')).toBe(0);
    const b = paintMap(recipe([{ step: 'cavern', blocks: [6, 4] }]), game());
    expect(b.layers.ground.px).not.toEqual(none.layers.ground.px);
  });

  it('timbers: two posts standing on the floor and a beam across the face, iron at the joints', () => {
    const m = paintMap(recipe([CAVE, { step: 'timbers', at: [[5.5, 2]] }]), game());
    const wood = (c: string | null) => c === 'madera clara' || c === 'madera' || c === 'madera sombra';
    // the posts: wood low on the face over the corridor (row 3), at both sides of the middle
    const foot = Y(3) - 4;
    const row = Array.from({ length: 30 }, (_, i) => at(m, 'ground', X(5.5) - 15 + i, foot));
    expect(row.filter(wood).length).toBeGreaterThanOrEqual(6);
    expect(count(m, 'ground', c => c === 'bronce')).toBe(2);
    // a frame at a cell with no face is skipped, nothing painted
    const off = paintMap(recipe([CAVE, { step: 'timbers', at: [[5.5, 7]] }]), game());
    expect(count(off, 'ground', c => c === 'bronce')).toBe(0);
  });

  it('burrow: a dark mouth in the face, the earth it threw on the floor; ore: lumps with rust and a twinkle', () => {
    const m = paintMap(recipe([CAVE, { step: 'burrow', at: [5.5, 2] }]), game());
    expect(at(m, 'ground', X(5.5), Y(3) - 3)).toBe('tinta');
    expect(count(m, 'ground', c => c === 'tierra sombra')).toBeGreaterThan(20);
    const o = paintMap(recipe([CAVE, { step: 'ore', lumps: [[3.5, 5.5, 4], [8.5, 5.5, 4]] }]), game());
    expect(count(o, 'ground', c => c === 'piel sombra' || c === 'fuego')).toBeGreaterThan(4);
  });
});
