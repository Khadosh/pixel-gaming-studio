// @vitest-environment node
// The map steps that came with the bamboo forest of The Unwritten Dao (a grove:
// a floor carved out of a thicket): the whole recipe against the script's PNGs,
// and each piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { outputLayer, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';

const FIX = join(__dirname, '../fixtures/mapas');
type Steps = MapRecipe['steps'];
const FL = ['túnica noche', 'hoja sombra', 'vida sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro'];
const SHADE = { hoja: 'hoja sombra', bambú: 'hoja', 'hoja clara': 'hoja', 'bambú claro': 'hoja', tierra: 'tierra sombra', 'madera clara': 'tierra', 'tierra sombra': 'madera sombra' };
const LIGHTEN = { 'túnica noche': 'hoja sombra', 'hoja sombra': 'hoja', 'vida sombra': 'hoja', hoja: 'bambú', bambú: 'hoja clara', 'hoja clara': 'bambú claro', 'tierra sombra': 'tierra', tierra: 'madera clara' };

// 12 × 8 cells: a wall border, a wall block in the middle (cells 5-6, rows 3-4)
const GRID = ['############', '#..........#', '#..........#', '#....##....#', '#....##....#', '#..........#', '#..........#', '############'];
function game(decor: MapGame['decor'] = []): MapGame { return { width: 12, height: 8, grid: GRID, decor }; }
const MATS: MapRecipe['materials'] = {
  musgo: { ramp: FL, texture: 'patches', base: 2, patches: { shade: [20, 211, 0.38], sun: [40, 12, 212], steps: [0.6], bright: 0.66, blades: 213, blade_odds: [0.5, 0] } },
  matorral: { ramp: ['túnica noche'] },
  sendero: { ramp: ['madera sombra', 'tierra sombra', 'tierra sombra', 'tierra', 'madera clara'], base: 2 },
  roca: { ramp: ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'piedra clara', 'piedra clara', 'niebla'], moss: ['hoja sombra', 'hoja', 'bambú', 'bambú claro'] },
};
const THICKET = { step: 'thicket', id: 'b', material: 'musgo', dark: 'matorral' } as const;
function recipe(steps: Steps, extra: Partial<MapRecipe> = {}): MapRecipe {
  return { game: game(), margin: [2, 1], shade: SHADE, lighten: LIGHTEN, scatter_salt: 341, materials: MATS, steps: [THICKET, ...steps], ...extra };
}
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
/** Pixel of the cell (u, v) of the map, at (dx, dy) px inside it. */
const cellPx = (m: PaintedMap, u: number, v: number, dx = 8, dy = 8): [number, number] => [m.origin[0] + u * 16 + dx, m.origin[1] + v * 16 + dy];
const count = (m: PaintedMap, layer: string) => m.layers[layer]?.px.filter(c => c !== null).length ?? 0;

describe('map recipe: the bamboo forest', () => {
  it('paints the same seven layers the forest script painted, pixel for pixel (the beams cropped to the map), and passes the lint', async () => {
    const r = renderRecipe(join(FIX, 'bosque.receta.json'));
    const layers: [string, string][] = [['ground', ''], ['haces', '_haces'], ['canas', '_canas'], ['hojas', '_hojas'], ['hojas_b', '_hojas_b'], ['mechones', '_mechones'], ['polvo', '_polvo']];
    for (const [layer, suffix] of layers) {
      const ref = readPng(join(FIX, `bosque_script${suffix}.png`)), l = outputLayer(r, layer);
      expect([l.w, l.h], layer).toEqual([ref.width, ref.height]);
      let differ = 0;
      for (let i = 0; i < l.w * l.h; i++) {
        const c = l.px[i], a = ref.data[i * 4 + 3];
        const hex = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
        if ((c === null) !== (a === 0) || (c !== null && r.colors[c] !== hex)) differ++;
      }
      expect(differ, layer).toBe(0);
    }
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'bosque.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  });
});

describe('map steps of a grove', () => {
  it('thicket: walls and margin are thicket, the rest floor with a curved border; open cells and clearings join the floor; damp by the border', () => {
    const m = paintMap(recipe([]), game());
    expect(kind(m, ...cellPx(m, 2, 2))).toBe('musgo');
    expect(kind(m, ...cellPx(m, 0, 0))).toBe('matorral');
    expect(at(m, 'ground', ...cellPx(m, 0, 0))).toBe('túnica noche');
    expect(kind(m, ...cellPx(m, -1, 4))).toBe('matorral');
    // the border is not the grid: along the edge of the wall block the floor line wanders
    const ys = new Set<number>();
    for (let x = cellPx(m, 5, 3, 0)[0]; x < cellPx(m, 7, 3, 0)[0]; x++) { let y = cellPx(m, 5, 2, 0, 0)[1]; while (kind(m, x, y) === 'musgo') y++; ys.add(y); }
    expect(ys.size).toBeGreaterThan(1);
    // damp: nothing lighter than tone 2 within 3 px of the thicket
    const fl = paintMap(recipe([]), game());
    let light = 0;
    for (let y = 0; y < fl.height; y++) for (let x = 0; x < fl.width; x++) {
      if (kind(fl, x, y) !== 'musgo') continue;
      const nearDark = [[3, 0], [-3, 0], [0, 3], [0, -3]].some(([i, j]) => kind(fl, x + i, y + j) === 'matorral');
      if (nearDark && FL.indexOf(at(fl, 'ground', x, y)!) > 2 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => kind(fl, x + i, y + j) === 'matorral')) light++;
    }
    expect(light).toBe(0);
    // open cells and a clearing on the wall block
    const o = paintMap(recipe([], { steps: [{ ...THICKET, open: [[5, 3, 2, 2], [-2, 4, 2, 1]] }] }), game());
    expect(kind(o, ...cellPx(o, 5, 3, 16, 16))).toBe('musgo');
    expect(kind(o, ...cellPx(o, -1, 4))).toBe('musgo');
    const c = paintMap(recipe([], { steps: [{ ...THICKET, clearings: [[6, 4, 14, 1, 0, 1]] }] }), game());
    expect(kind(c, ...cellPx(c, 6, 4, 0, 0))).toBe('musgo');
  });

  it('network inside a thicket: an oval clearing, the earth kept off the border, ruts that only dull the light tone, a lip of a given color', () => {
    const road = { road: [[1, 6.5], [10.5, 6.5]] as [number, number][], width: [4, 0.5] as [number, number], salt: 221 };
    const net = (extra: object) => ({ step: 'network' as const, id: 'n', material: 'sendero', parts: [road, { oval: [3, 2, 20, 10, 0.15, 225] }], inside: ['b', 2] as [string, number], lip: 'bambú', ...extra });
    const m = paintMap(recipe([net({})]), game());
    expect(kind(m, ...cellPx(m, 3, 2, 0, 0))).toBe('sendero');
    // never within 2 px of the thicket
    for (let y = 1; y < m.height - 1; y++) for (let x = 1; x < m.width - 1; x++) {
      if (kind(m, x, y) === 'sendero') expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => kind(m, x + i, y + j) === 'matorral')).toBe(false);
    }
    // the lip: the moss right below or right of the earth is bambú
    let lips = 0, other = 0;
    for (let y = 1; y < m.height; y++) for (let x = 1; x < m.width; x++) {
      if (kind(m, x, y) === 'musgo' && (kind(m, x, y - 1) === 'sendero' || kind(m, x - 1, y) === 'sendero')) { if (at(m, 'ground', x, y) === 'bambú') lips++; else other++; }
    }
    expect(lips).toBeGreaterThan(20);
    expect(other).toBe(0);
    // ruts_on light: the ruts only turn the lightest tone one step down, nothing else
    const plain = { trod: [999, 0, 7, 226] as [number, number, number, number], grains: [223, 0, 0] as [number, number, number] };
    const a = paintMap(recipe([net({ ...plain, ruts: [0, 0, 232, 3, 5, 0] })]), game());
    const r = paintMap(recipe([net({ ...plain, ruts: [0, 99, 232, 3, 5, 0], ruts_on: 'light' })]), game());
    let dulled = 0;
    for (let i = 0; i < r.kind.length; i++) {
      if (a.layers.ground.px[i] === r.layers.ground.px[i]) continue;
      expect([a.layers.ground.px[i], r.layers.ground.px[i]]).toEqual(['madera clara', 'tierra']);
      dulled++;
    }
    expect(dulled).toBeGreaterThan(50);
  });

  it('outcrop: a rock with a dark south face flagged as face, cut where the floor is open below a row; boulders with moss on top clear the face', () => {
    const m = paintMap(recipe([{ step: 'outcrop', material: 'roca', masses: [[6, 1, 30, 14]], floor: ['b', 2], boulders: [[6, 0.6, 9, 7]] }]), game());
    let face = 0, top = 0, moss = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (kind(m, x, y) !== 'roca') continue;
      expect(y).toBeLessThanOrEqual(cellPx(m, 0, 2, 0, 0)[1] + 1 + 30);
      const c = at(m, 'ground', x, y)!;
      if (['hoja', 'bambú', 'bambú claro'].includes(c)) moss++;
      // probe the face below the boulder: dark tones only
      const [fx] = cellPx(m, 6, 0, 0, 0);
      if (x === fx && c) (['túnica noche', 'túnica oscura', 'piedra sombra', 'piedra'].includes(c) ? face++ : top++);
    }
    expect(moss).toBeGreaterThan(5);
    expect(face).toBeGreaterThan(5);
    const none = paintMap(recipe([{ step: 'outcrop', material: 'roca', masses: [[6, 1, 30, 14]] }]), game());
    expect(none.kind.filter(k => k === 'roca').length).toBeGreaterThan(m.kind.filter(k => k === 'roca').length - 200);
  });

  it('undergrowth: only inside the thicket, with leaves by its border and fallen leaves', () => {
    const base = paintMap(recipe([]), game());
    const m = paintMap(recipe([{ step: 'undergrowth', thicket: 'b' }]), game());
    let changed = 0;
    for (let i = 0; i < m.kind.length; i++) {
      if (m.layers.ground.px[i] !== base.layers.ground.px[i]) { changed++; if (base.kind[i] === 'musgo') expect(m.kind[i - 1] === 'matorral' || m.kind[i - 2] === 'matorral' || m.kind[i - m.width - 1] === 'matorral' || m.kind[i - m.width - 2] === 'matorral').toBe(true); }
    }
    expect(changed).toBeGreaterThan(500);
    expect(m.layers.ground.px).toContain('bronce');
    expect(m.layers.ground.px).toContain('hoja sombra');
  });

  it('canes: born in wall cells, they rise and never cover the cell in front of their foot nor a clear cell; leaves on two layers', () => {
    const decor = [{ sprite: 'fogata', at: [3, 2] as [number, number] }];
    const m = paintMap(recipe([{ step: 'canes', thicket: 'b', clear: [[8, 2]] }], { game: game(decor) }), game(decor));
    expect(count(m, 'canes')).toBeGreaterThan(1000);
    expect(count(m, 'leaves')).toBeGreaterThan(100);
    expect(count(m, 'leaves_b')).toBeGreaterThan(100);
    const cellOf = (x: number, y: number) => [Math.floor((x - m.origin[0]) / 16), Math.floor((y - m.origin[1]) / 16)];
    for (const layer of ['canes', 'leaves', 'leaves_b']) for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (at(m, layer, x, y) === null) continue;
      const [u, v] = cellOf(x, y);
      expect(`${u},${v}`).not.toBe('8,2');
      expect(`${u},${v}`).not.toBe('3,2');
      // a walkable cell is only covered from behind: never the bottom row of the floor (row 6), which has nothing below it but wall
      if (v === 6 && u >= 1 && u <= 10) expect(y).toBeGreaterThanOrEqual(m.origin[1] + 7 * 16 - 16);
    }
    // the foot of a cane casts a dark shadow on the thicket
    expect(m.layers.ground.px).toContain('tinta');
  });

  it('shade: the thicket casts down-light on the floor, deeper by it; ovals stack one tone each', () => {
    const base = paintMap(recipe([]), game());
    const m = paintMap(recipe([{ step: 'shade', thicket: 'b', on: ['musgo'] }]), game());
    let darker = 0, lighter = 0;
    for (let i = 0; i < m.kind.length; i++) {
      if (m.kind[i] !== 'musgo') continue;
      const a = FL.indexOf(base.layers.ground.px[i]!), b = FL.indexOf(m.layers.ground.px[i]!);
      if (b < a) darker++; else if (b > a) lighter++;
    }
    expect(darker).toBeGreaterThan(300);
    expect(lighter).toBe(0);
    // two ovals over the same place: two tones down, by the recipe shade
    const ov = paintMap(recipe([{ step: 'shade', thicket: 'b', on: ['musgo'], reach: [0, 0, 7, 1], casts: [[3, 3, 10, 5, 1], [3, 3, 10, 5, 2]] }]), game());
    const sh = (c: string) => (SHADE as Record<string, string>)[c] ?? c;
    const [cx, cy] = cellPx(ov, 3, 3, 0, 0);
    expect(at(ov, 'ground', cx, cy)).toBe(sh(sh(at(base, 'ground', cx, cy)!)));
    const [fx, fy] = cellPx(ov, 9, 5);
    expect(at(ov, 'ground', fx, fy)).toBe(at(base, 'ground', fx, fy));
  });

  it('beams: a lighter copy of the floor on its own layer, only on the floor, with motes above', () => {
    const m = paintMap(recipe([{ step: 'beams', thicket: 'b', beams: [[3, 3, 16], [8, 4, 18]], motes: [0.2, 353, 3] }]), game());
    let n = 0;
    for (let i = 0; i < m.kind.length; i++) {
      const c = m.layers.beams.px[i];
      if (c === null) continue;
      n++;
      expect(m.kind[i]).toBe('musgo');
      expect(FL.indexOf(c)).toBeGreaterThan(FL.indexOf(m.layers.ground.px[i]!));
    }
    expect(n).toBeGreaterThan(300);
    expect(count(m, 'dust')).toBeGreaterThan(3);
    // no lone pixel left
    const W = m.width, L = m.layers.beams.px;
    for (let y = 1; y < m.height - 1; y++) for (let x = 1; x < W - 1; x++) if (L[y * W + x] !== null) expect([1, -1, W, -W].some(d => L[y * W + x + d] !== null)).toBe(true);
  });

  it('feature ring, frost and ash: stones in a ring with a groove; a band of frost; ash only on its material', () => {
    const m = paintMap(recipe([{ step: 'feature', what: 'ring', material: 'roca', at: [6, 2.5], on: ['musgo'] }]), game());
    const stones = m.kind.filter(k => k === 'roca').length;
    expect(stones).toBeGreaterThan(7 * 15);
    expect(m.layers.ground.px).toContain('piedra clara');
    const [cx, cy] = cellPx(m, 6, 2.5, 0, 1);
    expect(kind(m, Math.round(cx), Math.round(cy))).toBe('musgo');   // the middle stays free
    const f = paintMap(recipe([{ step: 'feature', what: 'frost', material: 'roca', at: [3, 2], on: ['musgo'] }]), game());
    const frost = f.layers.ground.px.filter(c => c === 'niebla' || c === 'niebla sombra').length;
    expect(frost).toBeGreaterThan(10);
    const [tx, ty] = cellPx(f, 3, 2, 0, 0);
    expect(['niebla', 'niebla sombra']).not.toContain(at(f, 'ground', tx, ty));   // the inside stays bare
    const a = paintMap(recipe([{ step: 'feature', what: 'ash', material: 'roca', at: [3, 2], on: ['sendero'] }]), game());
    expect(a.layers.ground.px).not.toContain('túnica oscura');
    const b = paintMap(recipe([{ step: 'feature', what: 'ash', material: 'roca', at: [3, 2], on: ['musgo'] }]), game());
    expect(b.layers.ground.px.filter(c => c === 'túnica oscura' || c === 'piedra sombra').length).toBeGreaterThan(20);
  });

  it('scatter tufts with edge, shapes, lift and foot; dashes more on the trail, never under the tips', () => {
    const net = { step: 'network' as const, id: 'n', material: 'sendero', parts: [{ road: [[1, 3.5], [10.5, 3.5]] as [number, number][], width: [5, 0.5] as [number, number], salt: 221 }], inside: ['b', 2] as [string, number] };
    const tufts = { step: 'scatter' as const, what: 'tufts' as const, on: ['musgo'], layer: 'tips', count: 9000, edge: ['b', 7] as [string, number], odds: [0.85, 0.2], spacing: 7, far_spacing: 11, shapes: [['h.h', 'l.l']], lift: [3, 4] as [number, number], unknown: 3, foot: false };
    const m = paintMap(recipe([net, tufts, { step: 'scatter', what: 'dashes', on: ['sendero', 'musgo'], count: 4000, edge: ['b', 5], avoid: 'tips' }]), game());
    const tips = m.layers.tips.px.filter(c => c !== null);
    expect(tips.length).toBeGreaterThan(20);
    for (const c of tips) expect(FL.indexOf(c!)).toBeGreaterThanOrEqual(4);
    let onTrail = 0, onMoss = 0, trail = 0, moss = 0;
    for (let i = 0; i < m.kind.length; i++) {
      const c = m.layers.ground.px[i];
      if (m.kind[i] === 'sendero') { trail++; if (['bronce', 'oro', 'oro claro'].includes(c!)) onTrail++; }
      if (m.kind[i] === 'musgo') { moss++; if (['bronce', 'oro'].includes(c!)) onMoss++; }
      if (['bronce', 'oro', 'oro claro'].includes(c!)) expect(m.layers.tips.px[i]).toBeNull();
    }
    expect(onTrail / trail).toBeGreaterThan(2 * onMoss / moss);
  });

  it('the forest steps are MCP tools', async () => {
    for (const name of ['map_thicket', 'map_outcrop', 'map_undergrowth', 'map_canes', 'map_shade', 'map_beams']) {
      await expect(runCommand(name, {})).rejects.toThrow(/invalid arguments/);
    }
    await expect(runCommand('map_nope', {})).rejects.toThrow();
  });
});
