// @vitest-environment node
// What the market of the sect brought (unwritten-dao docs/diseno/mercado.md): a stall step (a counter with goods,
// posts, an awning of cloth on its own layer that slopes, sags, lifts its corners and hangs a valance, the shade
// under it and its shadow on the ground), and a rope a place can lay.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const CLOTH = ['tinta', 'madera sombra', 'bermellón', 'bermellón claro', 'piel sombra', 'piel'];
const MATS: MapRecipe['materials'] = {
  suelo: { ramp: ['prado hondo', 'prado sombra', 'prado'], base: 2 },
  madera: { ramp: ['túnica noche', 'madera sombra', 'madera', 'madera clara', 'arena'] },
  toldo: { ramp: CLOTH },
};
const game: MapGame = { width: 10, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(10)), decor: [] };
const GROUND: MapStepOf<'area'> = { step: 'area', material: 'suelo', shape: 'all' };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const px = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;

describe('map stall', () => {
  // posts on x 32 and 79, the back ones on y 64, the front ones (and the counter's foot) on y 95
  const STALL: MapStepOf<'stall'> = {
    step: 'stall', id: 'puesto', rect: [2, 4, 3, 2], cloth: 'toldo', wood: 'madera', layer: 'techos',
    goods: [{ kind: 'fruit' }, { kind: 'pottery' }], shadow: { on: ['suelo'] },
  };
  const m = paintMap(recipe([GROUND, STALL]), game);
  const bare = paintMap(recipe([GROUND]), game);
  const clothRows = (x: number) => {
    const ys: number[] = [];
    for (let y = 0; y < m.height; y++) if (CLOTH.slice(1).includes(px(m, 'techos', x, y)!)) ys.push(y);
    return ys;
  };

  it('the awning is cloth on its own layer, over the counter, and the counter and posts stay on the ground', () => {
    expect(clothRows(56).length).toBeGreaterThan(20);
    expect(m.kind[95 * m.width + 56]).toBe('madera');                    // the foot of the counter
    expect(MATS.madera.ramp).toContain(px(m, 'ground', 56, 90));          // its face
    expect(px(m, 'ground', 56, 20)).toBe(px(bare, 'ground', 56, 20));     // nothing of the cloth on the ground
  });

  it('the hem sags in the middle and the corners lift', () => {
    const foot = (x: number) => Math.max(...clothRows(x));
    expect(foot(56)).toBeGreaterThan(foot(34));
    expect(foot(34)).toBeGreaterThanOrEqual(foot(31));
  });

  it('the ridge is lit, the valance under the hem in shadow, ink around it', () => {
    const ys = clothRows(56);
    expect(px(m, 'techos', 56, ys[0])).toBe(CLOTH[5]);
    expect(px(m, 'techos', 56, ys[0] - 1)).toBe('tinta');
    expect(ys.slice(-3).map(y => px(m, 'techos', 56, y))).toContain(CLOTH[2]);
  });

  it('goods stand on the counter, and the awning throws its shadow on the ground to the south-east', () => {
    let goods = 0;
    for (let y = 70; y < 90; y++) for (let x = 34; x < 78; x++) if (['bermellón claro', 'oro', 'bambú', 'arena', 'madera clara', 'basalto claro'].includes(px(m, 'ground', x, y)!)) goods++;
    expect(goods).toBeGreaterThan(10);
    // right of the stall, under where the awning's shadow falls: darker than bare grass
    let darker = 0;
    for (let y = 70; y < 96; y++) for (let x = 84; x < 92; x++) if (px(m, 'ground', x, y) !== px(bare, 'ground', x, y)) darker++;
    expect(darker).toBeGreaterThan(40);
  });

  it('a place lays it and its rope', () => {
    const moved = moveStep(STALL, 3, 1, 'x') as MapStepOf<'stall'>;
    expect(moved.rect).toEqual([5, 5, 3, 2]);
    const rope = moveStep({ step: 'rope', from: [1, 1], to: [4, 0.5] }, 2, 3, 'x') as MapStepOf<'rope'>;
    expect([rope.from, rope.to]).toEqual([[3, 4], [6, 3.5]]);
  });
});
