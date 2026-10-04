// @vitest-environment node
// The map steps and options that came with the village of The Unwritten Dao:
// the whole village recipe against the script's PNGs, and each new piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';

const FIX = join(__dirname, '../fixtures/mapas');
const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const EARTH = ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'arena'];
const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];
const FOREST = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro'];
type Steps = MapRecipe['steps'];

function game(decor: MapGame['decor'] = []): MapGame {
  return { width: 12, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(12)), decor };
}

function recipe(steps: Steps, extra: Partial<MapRecipe> = {}): MapRecipe {
  return {
    game: game(), margin: [4, 1], light: [1, 1],
    materials: {
      grass: { ramp: GRASS, texture: 'patches', base: 4 },
      earth: { ramp: EARTH, base: 2 },
      stone: { ramp: STONE, texture: 'paving', moss: MOSS },
      forest: { ramp: FOREST, texture: 'canopy' },
    },
    steps, ...extra,
  };
}

const ROADS: Steps[number] = {
  step: 'network', id: 'net', material: 'earth',
  parts: [
    { road: [[-4, 4], [6, 4], [16, 4]], width: [6, 1], salt: 201 },
    { blob: [6, 4, 2.5, 1.5, 0.15, 211] },
    { cut: [6, 4, 0.8, 0.5, 0.2, 218] },
  ],
};
const at = (m: PaintedMap, u: number, v: number) => (m.origin[1] + Math.round(v * 16)) * m.width + m.origin[0] + Math.round(u * 16);
const changed = (a: PaintedMap, b: PaintedMap, layer = 'ground') => a.layers[layer].px.filter((c, i) => c !== b.layers[layer].px[i]).length;

describe('map recipe: the village', () => {
  it('paints the same four layers the village script painted, pixel for pixel, and passes the style lint', async () => {
    const r = renderRecipe(join(FIX, 'aldea.receta.json'));
    for (const [layer, file] of [['ground', 'aldea_script.png'], ['mechones', 'aldea_script_mechones.png'],
      ['polvo', 'aldea_script_polvo.png'], ['copas', 'aldea_script_copas.png']]) {
      const ref = readPng(join(FIX, file)), l = r.map.layers[layer];
      expect([l.w, l.h]).toEqual([ref.width, ref.height]);
      let differ = 0;
      for (let i = 0; i < l.w * l.h; i++) {
        const c = l.px[i], a = ref.data[i * 4 + 3];
        const hex = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
        if ((c === null) !== (a === 0) || (c !== null && r.colors[c] !== hex)) differ++;
      }
      expect(differ, layer).toBe(0);
    }
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'aldea.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  });
});

describe('map steps of the village', () => {
  it('network: roads, blobs and cuts in one earth; trodden darker along the roads; a lit lip on the grass; tufts creep in', () => {
    const m = paintMap(recipe([{ step: 'area', material: 'grass', shape: 'all' }, ROADS]), game());
    expect(m.kind[at(m, 1, 4)]).toBe('earth');          // the road
    expect(m.kind[at(m, 6, 3)]).toBe('earth');          // the square
    expect(m.kind[at(m, 6, 4)]).toBe('grass');          // the island cut out of it
    expect(m.kind[at(m, 1, 1)]).toBe('grass');
    // trodden near a road center (tierra, few arena), dry dust away from them (much arena)
    const arena = (trod: [number, number, number, number]) => {
      const p = paintMap(recipe([{ step: 'area', material: 'grass', shape: 'all' }, { ...ROADS, trod } as Steps[number]]), game());
      return p.layers.ground.px.filter((c, i) => p.kind[i] === 'earth' && c === 'arena').length;
    };
    expect(arena([-99, 0, 7, 226])).toBeGreaterThan(2 * arena([99, 0, 7, 226]));
    // the lit lip: grass right under earth is the lightest-but-one
    let lips = 0;
    for (let i = m.width; i < m.kind.length; i++) if (m.kind[i] === 'grass' && m.kind[i - m.width] === 'earth') lips += m.layers.ground.px[i] === 'bambú claro' ? 1 : 0;
    expect(lips).toBeGreaterThan(100);
    const tufts = paintMap(recipe([{ step: 'area', material: 'grass', shape: 'all' }, { ...ROADS, tufts: { count: 2000, salt: 227, colors: ['bambú', 'hoja'] } } as Steps[number]]), game());
    expect(changed(tufts, m)).toBeGreaterThan(20);
  });

  it('paving: loose stones with a lit lip, joints of moss or earth, a shaded border; network "also" counts the court as earth', () => {
    const court = [6, 4, 2, 0.75, 0.12, 213];
    const m = paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { ...ROADS, also: [court] } as Steps[number],
      { step: 'area', id: 'court', material: 'stone', shape: { blobs: [court as [number, number, number, number, number, number]] }, paving: { at: [6, 4], joints: ['hoja', 'tierra sombra'] } },
    ]), game());
    const used = new Set<string>();
    m.kind.forEach((k, i) => { if (k === 'stone') used.add(m.layers.ground.px[i]!); });
    for (const c of ['niebla', 'piedra sombra']) expect(used.has(c), c).toBe(true);
    expect(used.has('hoja') || used.has('tierra sombra')).toBe(true);
    expect(m.kind[at(m, 6, 4)]).toBe('stone');
    // the bottom border of the court is shaded
    let y = at(m, 6, 4);
    while (m.kind[y + m.width] === 'stone') y += m.width;
    expect(['piedra sombra', 'tierra sombra']).toContain(m.layers.ground.px[y]);
  });

  it('outside cut: the forest leaves the road alone and the road fades into its shade; poke cut too', () => {
    const forest = (extra: object) => paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' }, ROADS,
      { step: 'area', id: 'f', material: 'forest', seed: 170, shape: { outside: { sides: 'lr', ...extra } } },
      { step: 'area', material: 'forest', layer: 'front', shape: { poke: 'f', count: 70, ...('cut' in extra ? { cut: 'net' } : {}) } },
    ]), game());
    const plain = forest({}), cut = forest({ cut: 'net', fade: {} });
    const margin = (m: PaintedMap) => m.kind.filter((k, i) => k === 'earth' && i % m.width < m.origin[0] - 4).length;
    expect(margin(cut)).toBeGreaterThan(margin(plain) + 100);
    // past the edge the road is darker than inside the map
    const lightness = (m: PaintedMap, u: number) => EARTH.indexOf(m.layers.ground.px[at(m, u, 4)]!);
    expect(lightness(cut, -3.9)).toBeLessThanOrEqual(1);
    // no crown of the front layer over the road in the margin
    expect(cut.layers.front.px[at(cut, -0.4, 4)]).toBeNull();
  });

  it('light: blocks, stripes and the reach of an edge shadow', () => {
    const base = paintMap(recipe([{ step: 'area', material: 'grass', shape: 'all' }]), game());
    const lit = paintMap(recipe([{ step: 'area', material: 'grass', shape: 'all' },
      { step: 'light', decor: false, blocks: [[2.125, 4.875, 3, 7, 1.3, 24, 12]], stripes: [[8, 3, 26, 0.3]] }]), game());
    expect(changed(lit, base)).toBeGreaterThan(300);
    // the wedge is off the right side of the block, not left of it
    expect(lit.layers.ground.px[at(lit, 5.1, 2.8)]).not.toBe(base.layers.ground.px[at(base, 5.1, 2.8)]);
    expect(lit.layers.ground.px[at(lit, 1.5, 2.5)]).toBe(base.layers.ground.px[at(base, 1.5, 2.5)]);
    const edge = (reach: [number, number]) => paintMap(recipe([{ step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', id: 'f', material: 'forest', shape: { outside: { sides: 'l' } } },
      { step: 'light', decor: false, edges: ['f'], reach }]), game());
    expect(changed(edge([4, 9]), base)).toBeGreaterThan(changed(edge([4, 0]), base));
  });

  it('scatter: flowers anywhere with chained odds, pebbles off the court, leaves near trees, dust in an ellipse; a rope with lanterns', () => {
    const steps: Steps = [{ step: 'area', material: 'grass', shape: 'all' }, ROADS];
    const base = paintMap(recipe(steps), game());
    const fl = paintMap(recipe([...steps, { step: 'scatter', what: 'flowers', count: 60, near: [], reach: 8, odds_each: true, odds: [0.45, 0.6],
      colors: [['flor clara'], ['oro claro'], ['bermellón claro']] }]), game());
    const flowers = fl.layers.ground.px.filter(c => c === 'flor clara' || c === 'oro claro' || c === 'bermellón claro').length;
    expect(flowers).toBeGreaterThan(30);
    const lv = paintMap(recipe([...steps, { step: 'scatter', what: 'leaves', count: 3000, on: ['grass', 'earth'], at: [[2, 2, 20]],
      colors: [['oro'], ['oro']] }]), game());
    lv.layers.ground.px.forEach((c, i) => {
      if (c !== 'oro') return;
      const x = i % lv.width, y = Math.floor(i / lv.width), [cx, cy] = [lv.origin[0] + 32, lv.origin[1] + 32];
      expect(Math.hypot(x - cx, y - cy)).toBeLessThan(22);
    });
    expect(changed(lv, base)).toBeGreaterThan(40);
    const dust = paintMap(recipe([...steps, { step: 'scatter', what: 'dew', layer: 'polvo', count: 3000, on: ['earth'], over: null, alone: false,
      reach: 0, spacing: 7, around: [6, 4, 30, 1.6], colors: [['oro claro', 'túnica luz']] }]), game());
    const dots = dust.layers.polvo.px.map((c, i) => [c, i] as const).filter(([c]) => c !== null);
    expect(dots.length).toBeGreaterThan(5);
    for (const [, i] of dots) expect(Math.hypot((i % dust.width - (dust.origin[0] + 96)) / 1.6, Math.floor(i / dust.width) - (dust.origin[1] + 64))).toBeLessThan(30);
    const rope = paintMap(recipe([...steps, { step: 'rope', layer: 'copas', from: [2, 1], to: [5, 1], sag: 5,
      hang: [{ at: 0.5, rows: ['x'], glyphs: { x: 'bermellón' }, offset: [0, 2] }] }]), game());
    const rp = rope.layers.copas;
    expect(rp.px.filter(c => c === 'madera sombra').length).toBe(49);
    const mid = rope.origin[0] + 56;   // the middle of the rope sags 5 px
    expect(rp.get(mid, rope.origin[1] + 16 + 5)).toBe('madera sombra');
    expect(rp.get(mid, rope.origin[1] + 16 + 7)).toBe('bermellón');
  });
});
