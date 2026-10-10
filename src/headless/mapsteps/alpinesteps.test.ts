// @vitest-environment node
// The map steps that came with the summit of The Unwritten Dao (a snowy
// mountain): both recipes against the script's PNGs, and each piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';

const FIX = join(__dirname, '../fixtures/mapas');
type Steps = MapRecipe['steps'];
const SNOW = ['nieve noche', 'nieve honda', 'nieve sombra', 'nieve', 'túnica luz'];
const G = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara'];
const ROCK = ['túnica noche', 'nieve noche', 'nieve honda', 'piedra sombra', 'piedra', 'piedra clara'];
const SHADE = {
  'túnica luz': 'nieve sombra', nieve: 'nieve sombra', 'nieve sombra': 'nieve honda', 'nieve honda': 'nieve noche',
  piedra: 'nieve honda', 'piedra clara': 'piedra', 'piedra sombra': 'nieve noche', hoja: 'hoja sombra', 'hoja clara': 'hoja', bambú: 'hoja',
};
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: SNOW }, huella: { ramp: SNOW },
  pasto: { ramp: G, texture: 'patches', base: 2, patches: { shade: [22, 331, 0.32], sun: [60, 14, 332], steps: [0.66], bright: null, blade_odds: [0, 0] } },
  tierra: { ramp: ['madera sombra', 'tierra sombra', 'tierra', 'arena'] },
  roca: { ramp: ROCK }, risco: { ramp: ROCK }, pared: { ramp: ROCK }, bosque: { ramp: ['túnica noche'] }, nubes: { ramp: ['celeste'] },
  hielo: { ramp: ['celeste', 'ojo'] },
};
function game(decor: MapGame['decor'] = []): MapGame { return { width: 12, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(12)), decor }; }
function recipe(steps: Steps, extra: Partial<MapRecipe> = {}): MapRecipe {
  return { game: game(), margin: [4, 1], shade: SHADE, materials: MATS, steps, ...extra };
}
const SNOWFIELD = { step: 'snowfield', material: 'nieve' } as const;
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const P = (m: PaintedMap, u: number, v: number): [number, number] => [m.origin[0] + Math.round(u * 16), m.origin[1] + Math.round(v * 16)];
const count = (m: PaintedMap, layer: string) => m.layers[layer]?.px.filter(c => c !== null).length ?? 0;
const kinds = (m: PaintedMap, k: string) => m.kind.filter(v => v === k).length;
const colors = (m: PaintedMap, pred: (x: number, y: number) => boolean) => {
  const s = new Set<string>();
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (pred(x, y)) s.add(at(m, 'ground', x, y) ?? '');
  return s;
};

function differ(file: string, prefix: string, layers: [string, string][]): Record<string, number> {
  const r = renderRecipe(join(FIX, file)), out: Record<string, number> = {};
  for (const [layer, suffix] of layers) {
    const ref = readPng(join(FIX, `${prefix}${suffix}.png`)), l = r.map.layers[layer];
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

describe('map recipe: the summit', () => {
  it('paints the same six layers the summit script painted, pixel for pixel, and passes the lint', async () => {
    const d = differ('cumbre.receta.json', 'cumbre_script', [['ground', ''], ['mechones', '_mechones'], ['brillos', '_brillos'], ['viento', '_viento'], ['vetas', '_vetas'], ['copas', '_copas']]);
    expect(d).toEqual({ ground: 0, mechones: 0, brillos: 0, viento: 0, vetas: 0, copas: 0 });
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'cumbre.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  }, 30000);

  it('paints the high summit the same, pixel for pixel', () => {
    const d = differ('cumbre_alta.receta.json', 'cumbre_alta_script', [['ground', ''], ['brillos', '_brillos'], ['viento', '_viento'], ['vetas', '_vetas']]);
    expect(d).toEqual({ ground: 0, brillos: 0, viento: 0, vetas: 0 });
  }, 30000);
});

describe('map steps of a snowy mountain', () => {
  it('snowfield: all snow, with lit crests and hollows in violet; with a cover, snow above a wavy line and grass below with the lip', () => {
    const m = paintMap(recipe([SNOWFIELD]), game());
    expect(kinds(m, 'nieve')).toBe(m.width * m.height);
    const used = colors(m, () => true);
    for (const c of ['nieve', 'túnica luz', 'nieve sombra']) expect(used.has(c), c).toBe(true);
    const c = paintMap(recipe([{ step: 'snowfield', id: 'l', material: 'nieve', cover: { line: { v: 5 }, grass: 'pasto' } }]), game());
    expect(kind(c, ...P(c, 6, 1))).toBe('nieve');
    expect(kind(c, ...P(c, 6, 9.5))).toBe('pasto');
    // the lip: a grass px right under snow is the grass shadow
    let lips = 0, under = 0;
    for (let y = 1; y < c.height - 1; y++) for (let x = 1; x < c.width - 1; x++) {
      if (kind(c, x, y) === 'pasto' && kind(c, x, y - 1) === 'nieve') { under++; if (at(c, 'ground', x, y) === 'hoja sombra') lips++; }
    }
    expect(under).toBeGreaterThan(0);
    expect(lips).toBe(under);
  });

  it('ledge and cloudsea: beyond the lip a sea of clouds with a floating peak; the face is rock', () => {
    const m = paintMap(recipe([SNOWFIELD, { step: 'ledge', material: 'risco', sea: 'nubes', side: 'l' },
      { step: 'cloudsea', sea: 'nubes', side: 'l', peaks: [[-2, 3, 6, 30]] }]), game());
    expect(kind(m, 2, 40)).toBe('nubes');
    expect(kind(m, m.origin[0] + 20, 40)).toBe('nieve');
    expect(kinds(m, 'risco')).toBeGreaterThan(m.height * 6);
    const sea = colors(m, (x, y) => kind(m, x, y) === 'nubes');
    for (const c of ['celeste', 'piedra clara', 'hoja sombra']) expect(sea.has(c), c).toBe(true);
    const r = paintMap(recipe([SNOWFIELD, { step: 'ledge', material: 'risco', sea: 'nubes', side: 'r' }]), game());
    expect(kind(r, r.width - 2, 40)).toBe('nubes');
    expect(kind(r, 2, 40)).toBe('nieve');
  });

  it('crag: snow on top, a face of rock, a shadow laid by shadows, veins of qi on their layer, a mouth with icicles', () => {
    const crag: MapStepOf<'crag'> = { step: 'crag', material: 'roca', masses: [[6, 3, 22, 8, 24]], salt: 421, shadow: true, veins: 2, mouth: { at: [6, 4.5], r: [6.5, 12], icicles: [443, 0.12, 9] } };
    const m = paintMap(recipe([SNOWFIELD, crag, { step: 'shadows', on: ['nieve'] }]), game());
    const rock = colors(m, (x, y) => kind(m, x, y) === 'roca');
    for (const c of ['piedra', 'nieve', 'túnica noche', 'qi', 'celeste luz']) expect(rock.has(c), c).toBe(true);
    expect(count(m, 'vetas')).toBeGreaterThan(5);
    const plain = paintMap(recipe([SNOWFIELD, { ...crag, shadow: false }, { step: 'shadows', on: ['nieve'] }]), game());
    let darker = 0;
    for (let i = 0; i < m.kind.length; i++) if (m.kind[i] === 'nieve' && m.layers.ground.px[i] !== plain.layers.ground.px[i]) darker++;
    expect(darker).toBeGreaterThan(50);
    const ice = paintMap(recipe([SNOWFIELD, { ...crag, face_colors: { piedra: 'celeste luz', 'piedra clara': 'ojo' } }]), game());
    expect(colors(ice, (x, y) => kind(ice, x, y) === 'roca').has('celeste luz')).toBe(true);
  });

  it('crag: with ink, its outline and seams are that stone tone and it keeps no túnica noche outside the mouth', () => {
    const base: MapStepOf<'crag'> = { step: 'crag', material: 'roca', masses: [[6, 3, 22, 8, 24]], salt: 421 };
    const inked = paintMap(recipe([SNOWFIELD, base]), game());
    expect(colors(inked, (x, y) => kind(inked, x, y) === 'roca').has('túnica noche')).toBe(true);
    const m = paintMap(recipe([SNOWFIELD, { ...base, ink: 'piedra sombra' }]), game());
    const rock = colors(m, (x, y) => kind(m, x, y) === 'roca');
    expect(rock.has('túnica noche')).toBe(false);
    expect(rock.has('piedra sombra')).toBe(true);
    // the same shape: only the ink changed
    let moved = 0;
    for (let i = 0; i < m.kind.length; i++) if ((m.kind[i] === 'roca') !== (inked.kind[i] === 'roca')) moved++;
    expect(moved).toBe(0);
  });

  it('crag: a cleft cut dark into it, icicles at the foot of the face', () => {
    const m = paintMap(recipe([SNOWFIELD, { step: 'crag', material: 'roca', masses: [[6, 3, 22, 8, 24]], salt: 421, cleft: [6, 4.5], icicles: 1 }]), game());
    const [x, y] = P(m, 6, 4.5);
    expect(at(m, 'ground', x, y - 1)).toBe('túnica noche');
    expect(colors(m, (X, Y) => kind(m, X, Y) === 'roca').has('ojo')).toBe(true);
  });

  it('mountain: a wall of crags on the left, darker the further from the map', () => {
    const m = paintMap(recipe([SNOWFIELD, { step: 'mountain', material: 'pared', side: 'l', on: ['nieve'] }]), game());
    expect(kind(m, 2, 60)).toBe('pared');
    expect(kind(m, m.origin[0] + 30, 60)).toBe('nieve');
    const far = colors(m, (x, y) => x < 10 && kind(m, x, y) === 'pared');
    expect(far.has('piedra clara')).toBe(false);
  });

  it('conifers: a dark forest on the right whose front trees by the edge go on the copas layer', () => {
    const m = paintMap(recipe([SNOWFIELD, { step: 'conifers', material: 'bosque', side: 'r' }]), game());
    expect(kind(m, m.width - 3, 60)).toBe('bosque');
    expect(kind(m, 30, 60)).toBe('nieve');
    expect(count(m, 'copas')).toBeGreaterThan(10);
    expect(colors(m, (x, y) => kind(m, x, y) === 'bosque').has('nieve sombra')).toBe(true);
  });

  it('trail: earth over grass with stones and its lit lip; trodden snow with footprints; slabs of rock with their shadow', () => {
    const cover = { step: 'snowfield', id: 'l', material: 'nieve', cover: { line: { v: 3 }, grass: 'pasto' } } as const;
    const curve = { points: [[6, 0], [6, 9.5]] as [number, number][], width: [6] as [number] };
    const earth = paintMap(recipe([cover, { step: 'trail', material: 'tierra', style: 'earth', on: ['pasto'], curves: [curve], salt: 395, grass: 'pasto' }]), game());
    expect(kind(earth, ...P(earth, 6, 8))).toBe('tierra');
    expect(kind(earth, ...P(earth, 6, 1))).toBe('nieve');
    expect(colors(earth, (x, y) => kind(earth, x, y) === 'tierra').has('piedra clara')).toBe(true);
    const trod = paintMap(recipe([SNOWFIELD, { step: 'trail', material: 'huella', style: 'trodden', on: ['nieve'], curves: [curve], salt: 407 }]), game());
    const tc = colors(trod, (x, y) => kind(trod, x, y) === 'huella');
    for (const c of ['nieve honda', 'túnica luz', 'nieve sombra']) expect(tc.has(c), c).toBe(true);
    const slabs = paintMap(recipe([SNOWFIELD, { step: 'trail', material: 'roca', style: 'slabs', on: ['nieve'], curves: [curve], salt: 571 }]), game());
    const sc = colors(slabs, (x, y) => kind(slabs, x, y) === 'roca');
    for (const c of ['piedra', 'piedra clara', 'nieve noche']) expect(sc.has(c), c).toBe(true);
  });

  it('tracks: paws in a line over the snow only', () => {
    const m = paintMap(recipe([SNOWFIELD, { step: 'tracks', on: ['nieve'], curves: [[[1, 5], [10, 5]]] }]), game());
    const plain = paintMap(recipe([SNOWFIELD]), game());
    let changed = 0;
    for (let i = 0; i < m.kind.length; i++) if (m.layers.ground.px[i] !== plain.layers.ground.px[i]) changed++;
    expect(changed).toBeGreaterThan(30);
    const none = paintMap(recipe([SNOWFIELD, { step: 'tracks', on: ['pasto'], curves: [[[1, 5], [10, 5]]] }]), game());
    expect(none.layers.ground.px).toEqual(plain.layers.ground.px);
  });

  it('pond, shrub, stones: ice with its lip, a juniper, stones poking out of the snow', () => {
    const m = paintMap(recipe([SNOWFIELD, { step: 'pond', material: 'hielo', on: ['nieve'], at: [[6, 5, 25, 12, 605]] },
      { step: 'shrub', material: 'roca', at: [[2, 2, 471]] }, { step: 'stones', on: 'nieve', count: 4000, odds: 1 }]), game());
    const ice = colors(m, (x, y) => kind(m, x, y) === 'hielo');
    for (const c of ['ojo', 'celeste', 'nieve honda', 'túnica luz']) expect(ice.has(c), c).toBe(true);
    expect(colors(m, (x, y) => kind(m, x, y) === 'roca').has('hoja')).toBe(true);
    expect(colors(m, (x, y) => kind(m, x, y) === 'nieve').has('piedra')).toBe(true);
  });

  it('shadows: a pine of the decor casts; a landmark does not unless asked', () => {
    const plain = paintMap(recipe([SNOWFIELD]), game());
    const diff = (g: MapGame, landmarks?: boolean) => {
      const m = paintMap(recipe([SNOWFIELD, { step: 'shadows', on: ['nieve'], landmarks }]), g);
      let d = 0;
      for (let i = 0; i < m.kind.length; i++) if (m.layers.ground.px[i] !== plain.layers.ground.px[i]) d++;
      return d;
    };
    expect(diff(game([{ sprite: 'pino_x', at: [5, 5], size: [2, 2] }]))).toBeGreaterThan(50);
    const lm = game([{ sprite: 'roca_x', at: [5, 5], size: [2, 2], landmark: true }]);
    expect(diff(lm)).toBe(0);
    expect(diff(lm, true)).toBeGreaterThan(50);
  });

  it('tussocks, sparkles, spindrift: tips on the layer that sways, sparkles apart, streaks of wind', () => {
    const m = paintMap(recipe([{ step: 'snowfield', material: 'nieve', cover: { line: { v: 3 }, grass: 'pasto' } },
      { step: 'tussocks', material: 'pasto', near: ['nieve'] }, { step: 'sparkles', on: ['nieve'], salt: 497, gap: 9 },
      { step: 'spindrift', on: ['nieve'], salt: 499, count: 300 }]), game());
    expect(count(m, 'mechones')).toBeGreaterThan(10);
    const sp: [number, number][] = [];
    m.layers.brillos.px.forEach((c, i) => { if (c) sp.push([i % m.width, Math.floor(i / m.width)]); });
    expect(sp.length).toBeGreaterThan(10);
    for (let i = 0; i < m.kind.length; i++) if (m.layers.viento.px[i]) expect(m.kind[i]).toBe('nieve');
    expect(count(m, 'viento')).toBeGreaterThan(100);
  });

  it('a layer the export names exists even when nothing paints it', () => {
    const m = paintMap(recipe([SNOWFIELD], { export: { id: 'x', layers: { ground: '', copas: '_copas' } } }), game());
    expect(m.layers.copas).toBeDefined();
    expect(count(m, 'copas')).toBe(0);
  });
});
