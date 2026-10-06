// @vitest-environment node
// The map steps that came with the roots of the pine of The Unwritten Dao (a
// maze of caves lit by a torch): the recipe against the script's PNGs, and each
// piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { gameGrid, outputLayer, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';
import { cellNoise } from './cavern';

const FIX = join(__dirname, '../fixtures/mapas');
type Steps = MapRecipe['steps'];
const DARKER: Record<string, string> = {
  'piedra clara': 'piedra', piedra: 'piedra sombra', 'niebla sombra': 'piedra sombra', 'piedra sombra': 'túnica oscura',
  'túnica oscura': 'pelo oscuro', 'pelo claro': 'pelo oscuro', 'pelo oscuro': 'túnica noche', 'túnica noche': 'tinta', tinta: 'tinta',
  'madera clara': 'madera', madera: 'madera sombra', 'madera sombra': 'túnica noche', tierra: 'tierra sombra',
  'tierra sombra': 'madera sombra', celeste: 'celeste oscuro', 'celeste oscuro': 'túnica noche', 'celeste luz': 'celeste',
};
const MATS: MapRecipe['materials'] = {
  piedra: { ramp: ['túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara'] },
  tierra: { ramp: ['madera sombra', 'tierra sombra', 'madera', 'tierra', 'madera clara'] },
  agua: { ramp: ['celeste oscuro', 'celeste', 'celeste luz', 'ojo'] },
  sombra: { ramp: ['tinta', 'túnica noche'] },
};
// a 12×8 maze: a corridor along row 3 and a room below, a wall row 2 with faces, an exit on the left
const GRID = [
  '############',
  '############',
  '############',
  'E..........#',
  '#.#####.####',
  '#..........#',
  '#..........#',
  '############',
];
function game(occupied: [number, number][] = []): MapGame { return { width: 12, height: 8, grid: GRID, decor: [], occupied }; }
function recipe(steps: Steps, occupied: [number, number][] = []): MapRecipe {
  return { game: game(occupied), margin: [3, 3], seed: 7, shade: DARKER, materials: MATS, steps };
}
const CAVE = { step: 'cavern' } as const;
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const count = (m: PaintedMap, layer: string, pred: (c: string, x: number, y: number) => boolean = () => true) => {
  let n = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const c = at(m, layer, x, y); if (c !== null && pred(c, x, y)) n++; }
  return n;
};
const P = (u: number, v: number): [number, number] => [48 + u * 16, 48 + v * 16];

function differ(file: string, prefix: string, layers: [string, string][]): Record<string, number> {
  const r = renderRecipe(join(FIX, file)), out: Record<string, number> = {};
  for (const [layer, suffix] of layers) {
    const ref = readPng(join(FIX, `${prefix}${suffix}.png`)), l = outputLayer(r, layer);
    expect([l.w, l.h], layer).toEqual([ref.width, ref.height]);
    let d = 0;
    for (let i = 0; i < l.w * l.h; i++) {
      const c = l.px[i], a = ref.data[i * 4 + 3];
      const hex = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
      if ((c === null) !== (a === 0) || (c !== null && r.colors[c] !== hex)) d++;
    }
    out[layer] = d;
  }
  return out;
}

const LAYERS: [string, string][] = [['ground', ''], ['raices', '_raices'], ['gotas', '_gotas'], ['brillos', '_brillos']];

describe('map recipe: the roots of the pine', () => {
  it('paints the same layers the roots script painted on three floors, pixel for pixel, and passes the lint', async () => {
    expect(differ('raices_boca.receta.json', 'raices_boca_script', LAYERS)).toEqual({ ground: 0, raices: 0, gotas: 0, brillos: 0 });
    expect(differ('raices_agua.receta.json', 'raices_agua_script', LAYERS)).toEqual({ ground: 0, raices: 0, gotas: 0, brillos: 0 });
    expect(differ('raices_nicho.receta.json', 'raices_nicho_script', [...LAYERS, ['formacion', '_formacion']]))
      .toEqual({ ground: 0, raices: 0, gotas: 0, brillos: 0, formacion: 0 });
    for (const f of ['raices_boca', 'raices_nicho']) {
      const lint = await runCommand('map_lint', { recipe: join(FIX, `${f}.receta.json`) });
      for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
    }
  }, 60000);

  it('reads who stands where from the game map, and the cell noise is the maze builder one', () => {
    const g = gameGrid(join(FIX, 'raices_nicho.json'));
    expect(g.occupied).toContainEqual([5, 1]);           // the player start
    expect(g.occupied).toContainEqual([13, 1]);          // an npc
    expect(g.occupied).toContainEqual([5, 0]);           // a landmark
    expect([cellNoise(3, 4, 1), cellNoise(24, 16, 9), cellNoise(0, 0, 6), cellNoise(17, 2, 8)]).toEqual([25, 31, 93, 77]);
  });

  it('cavern: rock seen from above with an outline, a face over the floor below, a floor of stone, the exit going on into the margin', () => {
    const m = paintMap(recipe([CAVE]), game());
    const g = (x: number, y: number) => at(m, 'ground', x, y);
    // deep in the rock: dark facets
    expect(['tinta', 'túnica noche', 'pelo oscuro']).toContain(g(...P(5, 0)));
    // the face of row 2 over the corridor of row 3: cold rock, the foot dark
    const [fx, fy] = P(5, 3);
    const band = Array.from({ length: 14 }, (_, k) => g(fx + 8, fy + 2 - k));
    expect(band).toContain('túnica oscura');
    expect(['túnica oscura', 'pelo claro', 'piedra sombra', 'pelo oscuro', 'niebla sombra', 'piedra']).toContain(g(fx + 8, fy - 4));
    // the floor in the middle of the room is stone, the foot of the wall above it dark
    expect(['piedra', 'piedra sombra', 'niebla sombra', 'pelo claro', 'piedra clara', 'pelo oscuro']).toContain(g(...P(5, 6).map(v => v + 8) as [number, number]));
    expect(g(P(5, 5)[0] + 8, P(5, 5)[1] + 1)).toBe('túnica oscura');
    // the exit on the left goes on into the margin: floor there too
    const [ex, ey] = P(-2, 3);
    expect(['piedra', 'piedra sombra', 'niebla sombra', 'pelo claro', 'túnica oscura', 'túnica noche', 'pelo oscuro']).toContain(g(ex + 8, ey + 8));
    expect(g(ex + 8, ey + 8)).not.toBe('tinta');
    // a shaft is painted black
    const s = paintMap(recipe([{ step: 'cavern', shafts: [[3, -3, 0]] }]), game());
    expect(at(s, 'ground', P(3, -1)[0] + 8, P(3, -1)[1] + 8)).toBe('tinta');
    // tones change the colors
    const t = paintMap(recipe([{ step: 'cavern', tones: { foot: 'madera sombra' } }]), game());
    expect(at(t, 'ground', P(5, 5)[0] + 8, P(5, 5)[1] + 1)).toBe('madera sombra');
  });

  it('hangroots: roots down the faces, rootlets on the floor, drops on their layer, nothing hanging in front over who stands below', () => {
    const steps: Steps = [CAVE, { step: 'hangroots', odds: 100, drip: 100, hang: 100 }];
    const m = paintMap(recipe(steps), game());
    expect(count(m, 'ground', c => c.startsWith('madera'))).toBeGreaterThan(100);
    expect(count(m, 'gotas', c => c === 'celeste luz')).toBeGreaterThan(10);
    expect(count(m, 'raices')).toBeGreaterThan(20);
    expect(count(m, 'brillos', c => c === 'celeste luz')).toBeGreaterThan(0);
    const none = paintMap(recipe([CAVE, { step: 'hangroots', odds: 0 }]), game());
    expect(count(none, 'ground', c => c.startsWith('madera'))).toBe(0);
    // somebody standing under every face: no root hangs in front
    const all: [number, number][] = [];
    for (let u = 0; u < 12; u++) for (const v of [3, 5]) all.push([u, v]);
    const busy = paintMap(recipe(steps, all), game(all));
    expect(count(busy, 'raices')).toBe(0);
  });

  it('carvings: a smoothed slab with columns of strokes on a face', () => {
    const plain = paintMap(recipe([CAVE]), game());
    const m = paintMap(recipe([CAVE, { step: 'carvings', at: [[1, 2], [3, 2], [5, 2], [7, 2], [9, 2]], count: 0 }]), game());
    let changed = 0, ink = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (at(m, 'ground', x, y) !== at(plain, 'ground', x, y)) changed++;
      if (at(m, 'ground', x, y) === 'tinta' && at(plain, 'ground', x, y) !== 'tinta') ink++;
    }
    expect(changed).toBeGreaterThan(20);
    expect(ink).toBeGreaterThan(5);
  });

  it('rootladder: two rails and rungs of wood down a shaft, darker up in the black', () => {
    const m = paintMap(recipe([{ step: 'cavern', shafts: [[3, -3, 0]] }, { step: 'rootladder', u: 3, bottom: 1.75 }]), game());
    const [x0] = P(3, 0);
    const wood = (y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x0 + 16; x++) if (/madera/.test(at(m, 'ground', x, y) ?? '')) n++; return n; };
    expect(wood(40, 75)).toBeGreaterThan(15);
    expect(wood(2, 12)).toBeLessThan(wood(40, 75));
  });

  it('pool: still water only on the floor, a lit upper shore, glints on its layer', () => {
    const m = paintMap(recipe([CAVE, { step: 'pool', at: [5.5, 5.5], r: [30, 10] }]), game());
    const water = count(m, 'ground', c => c.startsWith('celeste'));
    expect(water).toBeGreaterThan(200);
    const [, cy] = P(5.5, 5.5);
    let top = -1;
    for (let y = cy - 14; y < cy; y++) if ((at(m, 'ground', P(5.5, 0)[0], y) ?? '').startsWith('celeste')) { top = y; break; }
    expect(at(m, 'ground', P(5.5, 0)[0], top)).toBe('celeste');
    expect(count(m, 'brillos')).toBeGreaterThan(0);
  });

  it('formation: carved rings and trigrams on the ground, lit on its layer only inside the box, cut there on export', () => {
    const steps: Steps = [CAVE, { step: 'formation', at: [5.5, 5.5], r: [3.5, 1.2], inner: [5, 4], layer: 'formacion', box: [1, 5, 10, 2] }];
    const m = paintMap(recipe(steps), game());
    expect(count(m, 'formacion', c => c === 'qi')).toBeGreaterThan(40);
    expect(count(m, 'formacion', c => c === 'ojo')).toBeGreaterThan(5);
    expect(count(m, 'formacion', c => c === 'qi sombra')).toBeGreaterThan(40);
    expect(count(m, 'formacion', (_c, x, y) => x < P(1, 0)[0] || y < P(0, 5)[1] || y >= P(0, 7)[1])).toBe(0);
    expect(count(m, 'ground', c => c === 'pelo oscuro')).toBeGreaterThan(40);
    const r = { recipe: { ...recipe(steps), export: { id: 'x', windows: { formacion: [1, 5, 10, 2] as [number, number, number, number] }, ids: { formacion: 'la_formacion' } } }, map: m, colors: {} };
    const l = outputLayer(r, 'formacion');
    expect([l.w, l.h]).toEqual([160, 32]);
    expect(l.px.filter(c => c === 'ojo').length).toBe(count(m, 'formacion', c => c === 'ojo'));
  });

  it('gloom: past the map it all darkens into the black and the live layers go away', () => {
    const steps: Steps = [CAVE, { step: 'hangroots', odds: 100, drip: 100, hang: 100 }];
    const lit = paintMap(recipe(steps), game());
    const m = paintMap(recipe([...steps, { step: 'gloom', at: [2, 6, 10, 14] }]), game());
    const [ex, ey] = P(-2.5, 3.5);
    expect(at(lit, 'ground', ex, ey)).not.toBe('tinta');
    expect(['tinta', 'túnica noche']).toContain(at(m, 'ground', ex, ey));
    // inside the map nothing changes
    expect(at(m, 'ground', ...P(5.5, 5.5))).toBe(at(lit, 'ground', ...P(5.5, 5.5)));
    expect(count(m, 'raices', (_c, x, y) => x < 48 - 10 || y < 48 - 10)).toBe(0);
  });

  it('soften: a lone pixel of one material inside another becomes its accent, a diagonal line stays', () => {
    const g: MapGame = { width: 2, height: 2, grid: ['..', '..'] };
    const mats: MapRecipe['materials'] = { ...MATS, piedra: { ...MATS.piedra, texture: 'flat' }, agua: { ...MATS.agua, texture: 'flat', base: 1 } };
    const px = (u: number, v: number): MapStepOf<'area'> => ({ step: 'area', material: 'agua', shape: { rect: [u / 16, v / 16, 1 / 16, 1 / 16] } });
    const steps: Steps = [{ step: 'area', material: 'piedra', shape: 'all' }, px(10, 10), px(20, 20), px(21, 21), px(22, 22)];
    const before = paintMap({ game: g, materials: mats, steps }, g);
    expect(at(before, 'ground', 10, 10)).toBe('celeste');
    const m = paintMap({ game: g, materials: mats, steps: [...steps, { step: 'soften', accent: { celeste: 'niebla sombra' }, passes: 1 }] }, g);
    expect(at(m, 'ground', 10, 10)).toBe('niebla sombra');
    expect(at(m, 'ground', 21, 21)).toBe('celeste');
  });
});
