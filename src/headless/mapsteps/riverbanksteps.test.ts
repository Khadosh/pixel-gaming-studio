// @vitest-environment node
// The map steps that came with the river bank of The Unwritten Dao (the
// landing and the far bank): the recipes against the script's PNGs, and each
// piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { outputLayer, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe } from '../maprecipe';
import { readPng } from '../png';

const FIX = join(__dirname, '../fixtures/mapas');
type Steps = MapRecipe['steps'];
const G = ['túnica noche', 'hoja sombra', 'vida sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro'];
const WATER = ['hoja sombra', 'celeste oscuro', 'celeste', 'celeste luz', 'ojo'];
const SHADE = {
  pasto: 'hoja', 'bambú claro': 'hoja', 'hoja clara': 'hoja', bambú: 'hoja', hoja: 'hoja sombra', 'vida sombra': 'hoja sombra',
  arena: 'madera clara', 'madera clara': 'madera', tierra: 'tierra sombra', 'tierra sombra': 'madera sombra', 'madera sombra': 'túnica noche',
  'celeste luz': 'celeste', celeste: 'celeste oscuro', 'celeste oscuro': 'hoja sombra',
};
const MATS: MapRecipe['materials'] = {
  pasto: { ramp: G, texture: 'patches', base: 3, patches: { shade: [24, 1101, 0.31], sun: [64, 15, 1102], steps: [0.6, 0.67], bright: 0.64, blades: 1103, blades_up: 1104 } },
  bosque: { ramp: ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara'] },
  arena: { ramp: ['tierra sombra', 'tierra', 'madera clara', 'arena'] },
  barro: { ramp: ['madera sombra', 'tierra sombra', 'tierra', 'madera clara'] },
  tierra: { ramp: ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'arena'], base: 2 },
  agua: { ramp: WATER },
  piedra: { ramp: ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'], moss: ['hoja sombra', 'hoja', 'bambú', 'bambú claro'] },
  tablas: { ramp: ['túnica noche', 'madera sombra', 'tierra', 'madera', 'madera clara', 'arena'] },
  lajas: { ramp: ['túnica oscura', 'piedra sombra', 'piedra', 'piedra clara'] },
  juncos: { ramp: ['hoja sombra', 'hoja'] },
};
const RAMPS = [['hoja clara', 'bambú', 'hoja', 'hoja sombra', 'túnica noche'], ['hoja', 'vida sombra', 'hoja sombra', 'túnica noche', 'túnica noche'],
  ['hoja sombra', 'hoja sombra', 'túnica noche', 'túnica noche', 'túnica noche']];
function game(): MapGame { return { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)) }; }
function recipe(steps: Steps): MapRecipe { return { game: game(), margin: [3, 1], shade: SHADE, materials: MATS, steps }; }
const GRASS = { step: 'area', material: 'pasto', shape: 'all' } as const;
const LINES = { step: 'lines', lines: { arena: { at: 6, waves: [[2, 21, 1]] }, arriba: { at: 7.5, waves: [[2, 25, 2]] }, abajo: { at: 10, waves: [[2, 23, 3]] } } } as const;
const RIVER = { step: 'water', id: 'agua', material: 'agua', shape: { between: ['arriba', 'abajo'] }, bank: ['tierra sombra', 'madera sombra'], reflection: 'hoja sombra', seed: 7 } as const;
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const count = (m: PaintedMap, layer: string, pred: (c: string, x: number, y: number) => boolean = () => true) => {
  let n = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const c = at(m, layer, x, y); if (c !== null && pred(c, x, y)) n++; }
  return n;
};
const kinds = (m: PaintedMap, k: string) => m.kind.filter(v => v === k).length;
const row = (v: number) => Math.trunc(16 + v * 16);

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

describe('map recipe: the river bank', () => {
  it('paints the same five layers the landing script painted, pixel for pixel', () => {
    const d = differ('embarcadero.receta.json', 'embarcadero_script', [['ground', ''], ['mechones', '_mechones'], ['brillos', '_brillos'], ['corriente', '_corriente'], ['copas', '_copas']]);
    expect(d).toEqual({ ground: 0, mechones: 0, brillos: 0, corriente: 0, copas: 0 });
  }, 30000);

  it('paints the six layers of the far bank (the water of the pond cropped to the map), pixel for pixel', () => {
    const d = differ('otra_orilla.receta.json', 'otra_orilla_script', [['ground', ''], ['mechones', '_mechones'], ['brillos', '_brillos'], ['corriente', '_corriente'], ['copas', '_copas'], ['agua', '_agua']]);
    expect(d).toEqual({ ground: 0, mechones: 0, brillos: 0, corriente: 0, copas: 0, agua: 0 });
  }, 30000);
});

describe('map steps of a river bank', () => {
  const base = paintMap(recipe([GRASS, LINES, RIVER]), game());

  it('lines and the between shape: the water lies between two wavy lines, full width', () => {
    for (const x of [0, 50, 150, base.width - 1]) {
      expect(kind(base, x, row(6.8))).toBe('pasto');
      expect(kind(base, x, row(8.8))).toBe('agua');
      expect(kind(base, x, row(10.6))).toBe('pasto');
    }
    // the line waves: the first water row is not the same everywhere
    const first = (x: number) => { let y = 0; while (kind(base, x, y) !== 'agua') y++; return y; };
    expect(new Set([0, 40, 80, 120, 160, 200].map(first)).size).toBeGreaterThan(1);
  });

  it('patches blades_up: the salt of the second px of a blade changes the grass', () => {
    const other = paintMap(recipe([{ ...GRASS }]), game());
    const moved = paintMap({ ...recipe([GRASS]), materials: { ...MATS, pasto: { ...MATS.pasto, patches: { ...MATS.pasto.patches, blades_up: 999 } } } }, game());
    expect(count(moved, 'ground', (c, x, y) => c !== at(other, 'ground', x, y))).toBeGreaterThan(0);
  });

  it('wildwood: crowns past the sides and below, none between the clear lines', () => {
    const m = paintMap(recipe([GRASS, LINES, { step: 'wildwood', material: 'bosque', salt: 5, ramps: RAMPS,
      clear: { from: ['arriba', -6], to: ['abajo', 8] }, bottom: { line: 'abajo', at: 18, waves: [[4, 15, 3]], depth: 2 },
      left: { at: -1, waves: [[2.5, 17, 1]] }, right: { at: 1, waves: [[2.5, 17, 2]] } }]), game());
    expect(kind(m, 10, row(3))).toBe('bosque');
    expect(kind(m, m.width - 10, row(3))).toBe('bosque');
    expect(kind(m, 120, row(3))).toBe('pasto');
    expect(kind(m, 10, row(8.8))).toBe('pasto');
    expect(kind(m, 120, m.height - 2)).toBe('bosque');
    expect(new Set(m.layers.ground.px.filter((c, i) => m.kind[i] === 'bosque')).size).toBeGreaterThan(3);
  });

  it('beach and mudbank: sand between the lines, wet by the water; mud under the far shore', () => {
    const m = paintMap(recipe([GRASS, LINES, { step: 'beach', material: 'arena', between: ['arena', 'arriba'],
      shells: { count: 200, salt: 3, clear: 4, colors: [0.6, 'piedra clara', 'túnica luz'], shadow: 'tierra sombra' } },
    { step: 'mudbank', material: 'barro', below: 'abajo', depth: [4, 2, 6, 0.3, 4], bands: [[1.5, 'tierra sombra']], noise: [4, 3, 5, 0.5, 'tierra', 'madera sombra'] }, RIVER]), game());
    expect(kinds(m, 'arena')).toBeGreaterThan(1000);
    // the px just above the water is wet sand
    let wet = 0, n = 0;
    for (let x = 0; x < m.width; x++) for (let y = 1; y < m.height; y++) if (kind(m, x, y) === 'agua' && kind(m, x, y - 1) === 'arena') { n++; if (at(m, 'ground', x, y - 1) === 'tierra') wet++; }
    expect(wet / n).toBeGreaterThan(0.95);
    expect(count(m, 'ground', c => c === 'piedra clara' || c === 'túnica luz')).toBeGreaterThan(0);
    for (let x = 0; x < m.width; x++) { let y = 0; while (kind(m, x, y) !== 'barro' && y < m.height - 1) y++; expect(kind(m, x, y - 1)).toBe('agua'); }
  });

  it('footpath: trodden earth kept off the river, a lit lip on the grass, darker sand where it crosses a beach', () => {
    const m = paintMap(recipe([GRASS, LINES, { step: 'beach', material: 'arena', between: ['arena', 'arriba'] },
      { step: 'footpath', material: 'tierra', salt: 9, parts: [{ points: [[5, -1], [5, 4], [5.5, 12]], width: [6, 1], salt: 3 }],
        avoid: { between: ['arriba', 'abajo'] }, lip: ['pasto', 'bambú claro'],
        over: { mask: 'beach', material: 'arena', colors: ['arena', 'madera clara'], pick: [4, 0.6, 'madera clara', 'tierra'] } }, RIVER]), game());
    expect(kind(m, 48 + 80, row(2))).toBe('tierra');
    expect(kind(m, 48 + 80, row(8.8))).toBe('agua');
    expect(count(m, 'ground', c => c === 'bambú claro')).toBeGreaterThan(20);
    // where it crosses the sand the path is sand, without the light sand tone
    let crossed = 0;
    for (let y = 0; y < m.height; y++) for (let x = 110; x < 150; x++) if (kind(m, x, y) === 'arena' && at(m, 'ground', x, y) === 'arena') crossed++;
    const plain = paintMap(recipe([GRASS, LINES, { step: 'beach', material: 'arena', between: ['arena', 'arriba'] }]), game());
    let before = 0;
    for (let y = 0; y < m.height; y++) for (let x = 110; x < 150; x++) if (at(plain, 'ground', x, y) === 'arena') before++;
    expect(crossed).toBeLessThan(before);
  });

  it('pier: planks over the water with their shadow and pilings standing in it', () => {
    const m = paintMap(recipe([GRASS, LINES, RIVER, { step: 'pier', material: 'tablas', water: 'agua', x: [5, 0, 7, 0],
      y: [{ line: 'arriba', at: 6, add: -7 }, 9.5], salt: 3, stringers: true, shadow: { from: 2, to: 6, width: 4, rows: [4, 6] }, under: 3,
      pilings: [[['l', -1], ['b', 1]], [['r', 0], ['b', 1]]] }]), game());
    expect(kinds(m, 'tablas')).toBeGreaterThan(400);
    expect(kind(m, 48 + 96, row(8.5))).toBe('tablas');
    expect(count(m, 'ground', c => c === 'madera clara' || c === 'arena', )).toBeGreaterThan(50);
    // the post of a piling: its lit column is madera, its foot dark
    const x0 = 48 + 80 - 1, y1 = Math.trunc(row(9.5)) + 1;
    expect(at(m, 'ground', x0, y1 - 3)).toBe('madera');
    expect(at(m, 'ground', x0, y1 + 1)).toBe('túnica noche');
    // its shadow: the water right of the deck is darker than further right
    const dark = (x: number) => { let n = 0; for (let y = row(8.4); y < row(9.4); y++) if (at(m, 'ground', x, y) === 'hoja sombra' || at(m, 'ground', x, y) === 'celeste oscuro') n++; return n; };
    expect(dark(48 + 112 + 3)).toBeGreaterThanOrEqual(dark(48 + 112 + 30));
  });

  it('reeds: tips sway on their layer; a front clump stands whole in front of people; none over a pier', () => {
    const back = paintMap(recipe([GRASS, LINES, RIVER, { step: 'reeds', clumps: [[3, 7, 9, 6, 11]], mark: [['pasto'], 'juncos'] }]), game());
    expect(count(back, 'mechones')).toBeGreaterThan(10);
    expect(kinds(back, 'juncos')).toBeGreaterThan(5);
    expect(count(back, 'copas')).toBe(0);
    const front = paintMap(recipe([GRASS, LINES, RIVER, { step: 'reeds', line: 'arriba', front: true, clumps: [[3, 4, 9, 6, 11], [6, 4, 9, 6, 12]], not: [5.5, 7] }]), game());
    expect(count(front, 'copas')).toBeGreaterThan(30);
    expect(count(front, 'mechones')).toBe(0);
    expect(count(front, 'copas', (_, x) => x >= 48 + 88 && x <= 48 + 112)).toBe(0);
    const rows = paintMap(recipe([GRASS, LINES, RIVER, { step: 'reeds', rows: { count: 12, start: 0, step: 1, jitter: [5, 0.5], skip: [[4, 8]],
      line: 'abajo', foot: [3, 6], stalks: [5, 5], spread: 5, salt: 40 } }]), game());
    expect(count(rows, 'mechones', (_, x) => x > 48 + 16 * 4.6 && x < 48 + 16 * 7.4)).toBe(0);
    expect(count(rows, 'mechones')).toBeGreaterThan(40);
  });

  it('rocks and umbra: a stone with its shadow; an oval and a band of shade on some materials only', () => {
    const m = paintMap(recipe([GRASS, LINES, RIVER, { step: 'rocks', material: 'piedra', on: ['pasto'], at: [[5, 3, 7, 5, 3], [8, 3, 4, 3, 4, false]] }]), game());
    expect(kind(m, 48 + 80, row(3))).toBe('piedra');
    expect(count(m, 'ground', c => c === 'niebla' || c === 'piedra clara')).toBeGreaterThan(5);
    const plain = base;
    const sh = paintMap(recipe([GRASS, LINES, RIVER, { step: 'umbra', on: ['pasto'], ovals: [[5, 3, 20, 6, 1]],
      bands: [{ rows: [5, 6], x: [1, 3], top: [4, 2, 5, 9] }] }]), game());
    const changed = (x0: number, x1: number, y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (at(sh, 'ground', x, y) !== at(plain, 'ground', x, y)) n++; return n; };
    expect(changed(48 + 70, 48 + 90, row(3) - 3, row(3) + 3)).toBeGreaterThan(50);
    expect(changed(48 + 16, 48 + 48, row(5), row(5) + 2)).toBe(0); // above the wavy top
    expect(changed(48 + 16, 48 + 48, row(5) + 8, row(6))).toBeGreaterThan(50);
    expect(changed(48 + 70, 48 + 90, row(8.8), row(9.2))).toBe(0); // not on the water
  });

  it('meadow: tufts by their own draws (tips sway), flowers with a stem', () => {
    const m = paintMap(recipe([GRASS, { step: 'meadow', what: 'tufts', on: 'pasto', count: 2000, salt: 3, odds: 0.3 },
      { step: 'meadow', what: 'flowers', on: 'pasto', count: 200, salt: 4 }]), game());
    expect(count(m, 'mechones')).toBeGreaterThan(40);
    expect(count(m, 'ground', c => c === 'flor clara' || c === 'pergamino' || c === 'celeste luz')).toBeGreaterThan(10);
    const fewer = paintMap(recipe([GRASS, { step: 'meadow', what: 'tufts', on: 'pasto', count: 2000, salt: 3, odds: 0.05 }]), game());
    expect(count(fewer, 'mechones')).toBeLessThan(count(m, 'mechones'));
  });

  it('shimmer: glints and streaks only on the water away from its shore, none on the pier; more bright glints where the sun is', () => {
    const m = paintMap(recipe([GRASS, LINES, RIVER, { step: 'pier', material: 'tablas', water: 'agua', x: [5, 0, 7, 0], y: [7, 9.5], salt: 3 },
      { step: 'shimmer', water: 'agua', salt: 8, glints: 'brillos', flow: 'corriente', sun: 6, material: 'agua', skip: ['tablas'] }]), game());
    expect(count(m, 'brillos')).toBeGreaterThan(10);
    expect(count(m, 'corriente')).toBeGreaterThan(100);
    expect(count(m, 'brillos', (_, x, y) => kind(m, x, y) !== 'agua')).toBe(0);
    expect(count(m, 'corriente', (_, x, y) => kind(m, x, y) !== 'agua')).toBe(0);
    const bright = (pred: (x: number) => boolean) => count(m, 'brillos', (c, x) => c === 'ojo' && pred(x)) / Math.max(1, count(m, 'brillos', (_, x) => pred(x)));
    expect(bright(x => x < 48 + 96)).toBeGreaterThan(bright(x => x >= 48 + 96));
  });

  it('slabs, ditch, claypan and floodwater: a dry pond with a walk across, a ditch to the river, and the water that comes back on its own layer', () => {
    const steps: Steps = [GRASS, { step: 'lines', lines: { agua: { at: 2, waves: [[2, 23, 2]] } } },
      { step: 'ditch', id: 'acequia', river: [null, 'agua'], u: 2.5, waves: [[2, 2.4, 1], [0.9, 6, 2]], from: ['agua', -3], to: 5.5, half: [4, 1, 5, 3], stone: 'piedra', earth: 'barro', salts: [4, 5, 6] },
      { step: 'claypan', id: 'estanque', rect: [2, 5, 11, 11], wobble: [[0.06, 3.1, 7]], rim: [5, 6, 8],
        walk: { rows: [7.6, 8.4], top: [[0.1, 5, 9]], bottom: [[0.1, 7, 10]], x: [1.6, 11.4], left: [[2, 4, 11]], right: [[2, 4, 12]], material: 'lajas', n: 20, stretch: 1.9, salt: 13 },
        mud: 'barro', stone: 'piedra', plates: [100, 5.2, 14, 15], rim_slabs: { n: 60, stretch: 1.2, moss: 0.25, salt: 16 } },
      { step: 'slabs', material: 'lajas', blob: [9, 3, 20, 6, 17, 0.12], n: 8, salt: 18 },
      { step: 'water', id: 'agua', material: 'agua', shape: { between: [null, 'agua'] }, seed: 19 },
      { step: 'floodwater', layer: 'lleno', from: ['estanque', 'acequia'], water: 'agua', skip: ['piedra'], material: 'agua', salt: 20 }];
    const m = paintMap({ ...recipe(steps), export: { id: 'x', crop: ['lleno'] } }, game());
    expect(kind(m, 48 + 104, row(8))).toBe('lajas');
    expect(kind(m, 48 + 104, row(6.4))).toBe('barro');
    expect(kind(m, 48 + 104, row(10.3))).toBe('barro');
    expect(kinds(m, 'piedra')).toBeGreaterThan(300);
    expect(count(m, 'ground', c => c === 'túnica oscura')).toBeGreaterThan(30);
    expect(kind(m, 48 + 40, row(4))).toBe('barro'); // the ditch
    expect(kind(m, 48 + 40, row(1))).toBe('agua');
    expect(kind(m, 48 + 145, row(3))).toBe('lajas'); // the slabs
    // the water fills the pond and the ditch, not the walk, the stones nor the river
    const full = count(m, 'lleno');
    expect(full).toBeGreaterThan(2000);
    expect(count(m, 'lleno', (_, x, y) => !['barro'].includes(kind(m, x, y)))).toBe(0);
    expect(at(m, 'lleno', 48 + 104, row(8))).toBeNull();
    expect(at(m, 'lleno', 48 + 104, row(6.6))).not.toBeNull();
  });

  it('floodwater with a channel: the full ditch keeps its shaded wall dry and its water deep, without foam', () => {
    const ditch = { step: 'ditch', id: 'acequia', river: [null, 'agua'], u: 2.5, waves: [[2, 2.4, 1], [0.9, 6, 2]], from: ['agua', -3], to: 5.5, half: [4, 1, 5, 3], stone: 'piedra', earth: 'barro', salts: [4, 5, 6] } as const;
    const flood = { step: 'floodwater', layer: 'lleno', from: ['acequia'], water: 'agua', skip: ['piedra'], material: 'agua', salt: 20 } as const;
    const base: Steps = [GRASS, { step: 'lines', lines: { agua: { at: 2, waves: [[2, 23, 2]] } } }, ditch,
      { step: 'water', id: 'agua', material: 'agua', shape: { between: [null, 'agua'] }, seed: 19 }];
    const plain = paintMap({ ...recipe([...base, flood]), export: { id: 'x' } }, game());
    const chan = paintMap({ ...recipe([...base, { ...flood, channel: { mask: 'acequia', wall: 2 } }]), export: { id: 'x' } }, game());
    let walls = 0, wet = 0, foam = 0;
    for (let y = 0; y < chan.height; y++) for (let x = 1; x < chan.width; x++) {
      if (kind(chan, x, y) !== 'barro' || at(plain, 'lleno', x, y) === null) continue;
      wet++;
      if (kind(chan, x - 1, y) !== 'barro') { if (at(chan, 'lleno', x, y) === null) walls++; }
      if (at(chan, 'lleno', x, y) === 'celeste luz') foam++;
    }
    expect(wet).toBeGreaterThan(100);
    expect(walls).toBeGreaterThan(20); // the first px of its left wall stays earth
    expect(foam).toBe(0);
    expect(count(plain, 'lleno', c => c === 'celeste luz')).toBeGreaterThan(10); // without it, foam on both sides
  });
});
