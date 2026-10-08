// @vitest-environment node
// The map steps that came with the lower road of The Unwritten Dao (a dry
// lowland): the recipe against the script's PNGs, and each piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { paintMap, type PaintedMap } from '../mappaint';
import { gameGrid, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';

const FIX = join(__dirname, '../fixtures/mapas');
type Steps = MapRecipe['steps'];
const G = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const EARTH = ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'arena'];
const SHADE = {
  pasto: 'hoja', 'bambú claro': 'hoja', 'hoja clara': 'hoja', bambú: 'hoja', hoja: 'hoja sombra',
  arena: 'madera clara', 'madera clara': 'madera', tierra: 'tierra sombra', 'tierra sombra': 'madera sombra', 'madera sombra': 'túnica noche',
  'oro claro': 'oro', oro: 'bronce',
};
const MATS: MapRecipe['materials'] = {
  pasto: { ramp: G, texture: 'patches', base: 5, patches: { shade: [22, 819, 0.34], sun: [50, 12, 813], steps: [0.6], bright: null, blades: 841 } },
  tierra: { ramp: EARTH, base: 2 },
  piedra: { ramp: ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'], texture: 'grain' },
  bosque: { ramp: ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara'], texture: 'canopy' },
  lejos: { ramp: ['niebla'] },
};
function game(decor: MapGame['decor'] = []): MapGame { return { width: 12, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(12)), decor }; }
function recipe(steps: Steps, extra: Partial<MapRecipe> = {}): MapRecipe {
  return { game: game(), margin: [3, 1], shade: SHADE, scatter_salt: 921, materials: MATS, steps, ...extra };
}
const GRASS = { step: 'area', material: 'pasto', shape: 'all' } as const;
const ROAD: MapStepOf<'network'> = {
  step: 'network', id: 'tierra', material: 'tierra', min: 3.2, span: 12,
  parts: [{ road: [[-1, 5], [4, 4.8], [8, 5.2], [13, 5]], width: [12.5, 1.6], salt: 861 }],
  trod: [9.0, 0, 7, 226], ruts: [0, 0, 225, 6, 2, 0.42],
};
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const count = (m: PaintedMap, layer: string, pred: (c: string, x: number, y: number) => boolean = () => true) => {
  let n = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const c = at(m, layer, x, y); if (c !== null && pred(c, x, y)) n++; }
  return n;
};
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

describe('map recipe: the lower road', () => {
  it('paints the same four layers the lower road script painted, pixel for pixel, and passes the lint', async () => {
    const d = differ('camino.receta.json', 'camino_script', [['ground', ''], ['mechones', '_mechones'], ['polvo', '_polvo'], ['copas', '_copas']]);
    expect(d).toEqual({ ground: 0, mechones: 0, polvo: 0, copas: 0 });
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'camino.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  }, 30000);

  it('the game grid brings the silhouette of each decor sprite from the sprites folder', () => {
    const g = gameGrid(join(FIX, 'camino.json'), join(FIX, 'camino_visuals.json'), { dir: join(FIX, 'camino_sprites'), cell: 16 });
    const arco = g.decor!.find(d => d.sprite === 'arco_camino')!;
    expect(arco.mask!.length).toBe(48);
    expect(arco.mask![0].length).toBe(48);
    expect(arco.mask!.join('')).toContain('#');
    expect(arco.mask!.join('')).toContain('.');
    expect(gameGrid(join(FIX, 'camino.json'), join(FIX, 'camino_visuals.json')).decor!.every(d => !d.mask)).toBe(true);
  });

  it('the game grid leaves out the decor of a layer the map turns off: no shadow, not in the way', () => {
    const dir = mkdtempSync(join(tmpdir(), 'capas-'));
    const map = (capas: Record<string, boolean>) => {
      const p = join(dir, 'mapa.json');
      writeFileSync(p, JSON.stringify({
        width: 6, height: 4, capas,
        decor: [{ sprite: 'banco', at: [1, 1], capa: 'mobiliario' }, { sprite: 'roca', at: [3, 1] }, { sprite: 'farol', at: [4, 2], capa: 'luces' }],
        landmarks: [{ at: [2, 3], visual: { sprite: 'gong', capa: 'mobiliario' } }],
      }));
      return gameGrid(p);
    };
    const off = map({ mobiliario: false });
    expect(off.decor!.map(d => d.sprite)).toEqual(['roca', 'farol']);   // a layer not named in capas stays on
    expect(off.grid[1][1]).toBe('.');
    expect(off.grid[1][3]).toBe('D');
    const on = map({ mobiliario: true });
    expect(on.decor!.map(d => d.sprite)).toEqual(['banco', 'roca', 'farol', 'gong']);
    expect(on.grid[1][1]).toBe('D');
  });
});

describe('map steps of a dry lowland', () => {
  it('patches half: a band of shade where only the sunny part keeps the base tone (more grass one tone down)', () => {
    const dark = (m: PaintedMap) => count(m, 'ground', c => c === 'hoja clara');
    const plain = paintMap(recipe([GRASS]), game());
    const half = paintMap(recipe([GRASS], { materials: { ...MATS, pasto: { ...MATS.pasto, patches: { ...MATS.pasto.patches, half: [0.42, 0.5] } } } }), game());
    expect(dark(half)).toBeGreaterThan(dark(plain));
  });

  it('network: wheel ruts are continuous dark lines with a lit px above; bank, loose tones and grains everywhere', () => {
    const plain = paintMap(recipe([GRASS, ROAD]), game());
    const rutted = paintMap(recipe([GRASS, { ...ROAD, wheel_ruts: { offset: [5.0, 0.8, 40, 885], gaps: [14, 887, 1] } }]), game());
    const dark = (m: PaintedMap) => count(m, 'ground', (c, x, y) => kind(m, x, y) === 'tierra' && c === 'tierra sombra');
    expect(dark(rutted)).toBeGreaterThan(dark(plain) + 200);
    // without gaps every column of the road has a rut px with its light above it
    let lit = 0;
    for (let y = 1; y < rutted.height; y++) for (let x = 0; x < rutted.width; x++) {
      if (at(rutted, 'ground', x, y) === 'tierra sombra' && at(plain, 'ground', x, y) !== 'tierra sombra' && at(rutted, 'ground', x, y - 1) === 'madera clara') lit++;
    }
    expect(lit).toBeGreaterThan(200);
    const bank = paintMap(recipe([GRASS, { ...ROAD, bank: [-1, 0] }]), game());
    expect(dark(bank)).toBeLessThan(dark(plain));
    const loose = paintMap(recipe([GRASS, { ...ROAD, trod: [0, 0, 7, 226], loose_tones: [1, 2] }]), game());
    const looseDef = paintMap(recipe([GRASS, { ...ROAD, trod: [0, 0, 7, 226] }]), game());
    const sand = (m: PaintedMap) => count(m, 'ground', (c, x, y) => kind(m, x, y) === 'tierra' && c === 'arena');
    expect(sand(loose)).not.toBe(sand(looseDef));
    const all = paintMap(recipe([GRASS, { ...ROAD, grains: [893, 0.2, 0.2, 0.2], grain_tones: [0, 0, 2], grains_all: true }]), game());
    const some = paintMap(recipe([GRASS, { ...ROAD, grains: [893, 0.2, 0.2, 0.2], grain_tones: [0, 0, 2] }]), game());
    expect(count(all, 'ground', (c, x, y) => kind(all, x, y) === 'tierra' && c === 'arena'))
      .toBeGreaterThan(count(some, 'ground', (c, x, y) => kind(some, x, y) === 'tierra' && c === 'arena'));
  });

  it('straw: gold strands on the grass, never by the border of the earth', () => {
    const m = paintMap(recipe([GRASS, ROAD, { step: 'straw', on: 'pasto', patch: [34, 17, 851, 6, 3, 852, 0.12, 0.4] }]), game());
    const gold = count(m, 'ground', (c, x, y) => kind(m, x, y) === 'pasto' && (c === 'oro claro' || c === 'oro'));
    expect(gold).toBeGreaterThan(300);
    for (let y = 0; y < m.height; y++) for (let x = 1; x < m.width; x++) {
      if (kind(m, x, y) === 'pasto' && kind(m, x - 1, y) === 'tierra') expect(['oro', 'oro claro']).not.toContain(at(m, 'ground', x, y));
    }
  });

  it('overlook: past the lip the far plain, with its river and its road from a row on', () => {
    const m = paintMap(recipe([GRASS, {
      step: 'overlook', material: 'lejos', at: -3,
      fields: { u: [0.8, 0.5], v: [-0.4, 1], size: [9, 6], salt: 905, colors: ['oro claro', 'niebla', 'niebla sombra'], line: 'niebla' },
      river: { at: 14, waves: [[7, 25, 909]], colors: ['celeste luz', 'celeste'] }, road: { at: 30, sway: [4, 9], color: 'pergamino', from: 5 },
    }]), game());
    expect(kind(m, 2, 50)).toBe('lejos');
    expect(kind(m, m.origin[0] + 4, 50)).toBe('pasto');
    const far = colors(m, (x, y) => kind(m, x, y) === 'lejos');
    for (const c of ['celeste', 'celeste luz', 'pergamino', 'niebla', 'oro claro', 'túnica noche', 'madera sombra']) expect(far.has(c), c).toBe(true);
    expect(count(m, 'ground', (c, x, y) => c === 'pergamino' && y <= m.origin[1] + 5 * 16)).toBe(0);
  });

  it('woodedge: crowns past the right, top and bottom, never on the road; the earth past the edge darker; poke reads its edge', () => {
    const wood: MapStepOf<'woodedge'> = { step: 'woodedge', id: 'arboleda', material: 'bosque', cut: 'tierra', earth: ['tierra', 10, 22], grass: { on: 'pasto', reach: 2, shade: { pasto: 'hoja', 'bambú claro': 'hoja' } } };
    const plain = paintMap(recipe([GRASS, ROAD]), game());
    const m = paintMap(recipe([GRASS, ROAD, wood]), game());
    const right = m.origin[0] + 12 * 16;
    expect(kind(m, right + 30, 10 + m.origin[1] + 16)).toBe('bosque');
    expect(kind(m, m.origin[0] + 80, 4)).toBe('bosque');
    expect(kind(m, m.origin[0] + 80, m.height - 4)).toBe('bosque');
    expect(kind(m, m.origin[0] + 80, m.origin[1] + 40)).toBe('pasto');
    const roadPast = (pm: PaintedMap) => colors(pm, (x, y) => x > right + 16 && kind(pm, x, y) === 'tierra');
    expect(roadPast(m).size).toBeGreaterThan(0);
    expect(roadPast(m).has('arena')).toBe(false);
    expect(roadPast(plain).has('arena')).toBe(true);
    const poke = (spacing: number) => paintMap(recipe([GRASS, ROAD, wood,
      { step: 'area', material: 'bosque', layer: 'copas', shape: { poke: 'arboleda', cut: 'tierra', spacing } }]), game());
    expect(count(poke(20), 'copas')).toBeGreaterThan(count(poke(60), 'copas'));
  });

  it('damp: wet and dark earth in a blob, only on the earth', () => {
    const m = paintMap(recipe([GRASS, ROAD, { step: 'damp', at: [6, 5], r: [14, 6], salt: 917, on: ['tierra', 2], noise: [2, 918, 0.45], colors: ['madera sombra', 'tierra'] }]), game());
    const plain = paintMap(recipe([GRASS, ROAD]), game());
    const [cx, cy] = [m.origin[0] + 96, m.origin[1] + 80];
    const near = (pm: PaintedMap) => colors(pm, (x, y) => Math.abs(x - cx) < 10 && Math.abs(y - cy) < 4 && kind(pm, x, y) === 'tierra');
    expect(near(m).has('madera sombra')).toBe(true);
    expect([...near(m)].every(c => c === 'madera sombra' || c === 'tierra')).toBe(true);
    expect(near(plain).has('arena')).toBe(true);
  });

  it('cast: each opaque px of a silhouette casts down-right by its height; night versions and low things cast nothing; stamps that stand cast too', () => {
    const tall = Array.from({ length: 32 }, (_, y) => (y < 4 ? '................' : '......####......'));
    const deco = (extra: Partial<NonNullable<MapGame['decor']>[number]> = {}) => game([{ sprite: 'poste', at: [4, 4], size: [1, 2], mask: tall, ...extra }]);
    const cast: MapStepOf<'cast'> = { step: 'cast', on: ['pasto'], skip: ['mata'], skip_when: [{ de_noche: true }] };
    const plain = paintMap(recipe([GRASS]), game());
    const shaded = (m: PaintedMap) => count(m, 'ground', (c, x, y) => c !== at(plain, 'ground', x, y));
    const m = paintMap({ ...recipe([GRASS, cast]), game: deco() }, deco());
    expect(shaded(m)).toBeGreaterThan(30);
    // the shadow lies right of and below the foot of the post
    const foot = [m.origin[0] + 4 * 16 + 6, m.origin[1] + 5 * 16];
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (at(m, 'ground', x, y) !== at(plain, 'ground', x, y)) { expect(x).toBeGreaterThan(foot[0]); expect(y).toBeGreaterThanOrEqual(foot[1] - 2); }
    }
    expect(shaded(paintMap(recipe([GRASS, cast]), deco({ when: { de_noche: true } })))).toBe(0);
    expect(shaded(paintMap(recipe([GRASS, cast]), deco({ sprite: 'mata_x' })))).toBe(0);
    const stamp: MapStepOf<'scatter'> = { step: 'scatter', what: 'stamp', at: [[4, 2]], rows: Array.from({ length: 28 }, () => 'ss'), glyphs: { s: 'piedra' }, kind: 'lejos', stands: true };
    const s = paintMap(recipe([GRASS, stamp, cast]), game());
    expect(kind(s, m.origin[0] + 64, m.origin[1] + 40)).toBe('lejos');
    expect(count(s, 'ground', (c, x, y) => c !== 'piedra' && c !== at(plain, 'ground', x, y))).toBeGreaterThan(10);
    const flat = paintMap(recipe([GRASS, { ...stamp, stands: false }, cast]), game());
    expect(count(flat, 'ground', (c, x, y) => c !== 'piedra' && c !== at(plain, 'ground', x, y))).toBe(0);
  });

  it('scatter options: tufts with no odds draw, a left bound, straw stalks and dry tips; flowers in small groups; pebbles and leaves and dust with their rules', () => {
    const tufts = (o: object) => paintMap(recipe([GRASS, { step: 'scatter', what: 'tufts', layer: 'mechones', count: 4000, on: ['pasto'], spacing: 9, far_spacing: 9, ...o }]), game());
    const all = tufts({ odds: null });
    expect(count(all, 'mechones')).toBeGreaterThan(count(tufts({}), 'mechones'));
    const left = tufts({ odds: null, left: 64 });
    expect(count(left, 'mechones', (_, x) => x < left.origin[0] + 60)).toBe(0);
    expect(count(tufts({ odds: null, dry: [1, 'oro claro'] }), 'mechones', c => c !== 'oro claro')).toBe(0);
    const straw = paintMap(recipe([GRASS, { step: 'straw', on: 'pasto', patch: [34, 17, 851, 6, 3, 852, 0.12, 0.3] },
      { step: 'scatter', what: 'tufts', layer: 'mechones', count: 4000, on: ['pasto'], odds: null, spacing: 9, far_spacing: 9, straw: ['oro', 'túnica luz'] }]), game());
    expect(count(straw, 'mechones', c => c === 'túnica luz')).toBeGreaterThan(0);
    const flowers = (many?: [number, number]) => paintMap(recipe([GRASS, { step: 'scatter', what: 'flowers', count: 60, on: ['pasto'], near: [], colors: [['flor']], ...(many ? { many } : {}) }]), game());
    expect(count(flowers([1, 1]), 'ground', c => c === 'flor')).toBeLessThan(count(flowers(), 'ground', c => c === 'flor'));
    // at fixed places: a clump at each, nowhere else
    const placed = paintMap(recipe([GRASS, { step: 'scatter', what: 'flowers', at: [[2, 2], [9, 7]], on: ['pasto'], near: [], colors: [['flor']], many: [4, 0] }]), game());
    const [o0, o1] = placed.origin;
    const fl = (pred: (x: number, y: number) => boolean) => count(placed, 'ground', (c, x, y) => c === 'flor' && pred(x - o0, y - o1));
    expect(fl((x, y) => Math.hypot(x - 32, y - 32) < 9)).toBeGreaterThan(0);
    expect(fl((x, y) => Math.hypot(x - 144, y - 112) < 9)).toBeGreaterThan(0);
    expect(fl(() => true)).toBe(fl((x, y) => Math.hypot(x - 32, y - 32) < 9 || Math.hypot(x - 144, y - 112) < 9));
    const peb = (o: object) => paintMap(recipe([GRASS, ROAD, { step: 'scatter', what: 'pebbles', more_in: 'tierra', count: 3000, on: [], material: 'piedra', odds: [1, 0, 0.5], ...o }]), game());
    expect(count(peb({ mid: false }), 'ground', c => c === 'piedra')).toBeLessThan(count(peb({}), 'ground', c => c === 'piedra'));
    expect(count(peb({ dust: 'pergamino' }), 'ground', c => c === 'pergamino')).toBeGreaterThan(0);
    const leaves = (o: object) => paintMap(recipe([GRASS, ROAD, { step: 'scatter', what: 'leaves', count: 3000, on: ['pasto'], at: [[6, 2, 40, 1.4]], colors: [['oro claro']], ...o }]), game());
    const faded = leaves({ fade: 30 });
    expect(count(faded, 'ground', c => c === 'oro claro')).toBeGreaterThan(0);
    expect(count(faded, 'ground', c => c === 'oro claro')).toBeLessThan(count(leaves({ fade: 1000 }), 'ground', c => c === 'oro claro'));
    const below = (o: object) => count(leaves({ fade: 1000, ...o }), 'ground', (c, x, y) => kind(faded, x, y) === 'tierra' && c === 'tierra sombra');
    expect(below({ below_on: true })).toBeLessThan(below({}));
    const dust = (o: object) => paintMap(recipe([GRASS, ROAD, { step: 'scatter', what: 'dew', layer: 'polvo', count: 3000, on: ['tierra'], over: null, alone: false, reach: 0, spacing: 3, colors: [['oro claro', 'túnica luz']], ...o }]), game());
    expect(count(dust({ spacing_y: 9 }), 'polvo')).toBeLessThan(count(dust({}), 'polvo'));
    const deep = dust({ inside: ['tierra', 6] });
    expect(count(deep, 'polvo')).toBeGreaterThan(0);
    expect(count(deep, 'polvo')).toBeLessThan(count(dust({}), 'polvo'));
  });
});
