// @vitest-environment node
// Settle («asentar», 10 October): «una piedra al borde de un estanque se siente como una pelota de roca puesta ahí».
// A stamp laid whole, its ink closed on four sides, with the shadow of the sun as its only bond to the ground. The
// steps that lay a thing with a foot register it; a settle step sinks it, takes the ink out of its foot, lays a ring
// at its foot, grows blades over it and, by water, wets it and mirrors it. Without a settle step, nothing changes.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';
import { closedInkOf } from './settle';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'];
const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const WATER = ['túnica noche', 'celeste oscuro', 'celeste', 'celeste luz', 'ojo'];
const MATS: MapRecipe['materials'] = {
  pasto: { ramp: GRASS, base: 2, texture: 'patches' },
  agua: { ramp: WATER, texture: 'water' },
  piedra: { ramp: STONE, texture: 'grain' },
};
const game: MapGame = { width: 12, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(12)), decor: [] };
// a rock drawn the way the stamps of the game are: ink all round, its foot a row of ink
const ROCK = ['.KKKKKK.', 'KLLPPPPK', 'KLPPPPDK', 'KPPPPPDK', 'KPPPPDDK', 'KPPPDDDK', '.KKKKKK.'];
const GLYPHS = { K: 'tinta', L: 'piedra clara', P: 'piedra', D: 'piedra sombra' };
// one on the grass (its box from (32, 16)), one at the edge of the water (its foot on the row over the water, y 79)
const GRASS_AT: [number, number] = [2, 1], WATER_AT: [number, number] = [7, 73 / 16];
const BASE: MapStep[] = [
  { step: 'area', material: 'pasto', shape: 'all' },
  { step: 'area', material: 'agua', shape: { rect: [0, 5, 12, 3] } },
  { step: 'scatter', id: 'piedra del pasto', what: 'stamp', at: [GRASS_AT], rows: ROCK, glyphs: GLYPHS, kind: 'piedra', stands: true },
  { step: 'scatter', id: 'piedra del agua', what: 'stamp', at: [WATER_AT], rows: ROCK, glyphs: GLYPHS, kind: 'piedra', stands: true },
  { step: 'rocks', material: 'piedra', on: ['pasto'], at: [[9, 2.5, 6, 4, 77]] },
];
const SUN: MapRecipe['light'] = { dir: [0.5, 1], length: 0.25, tone: 1, on: ['pasto'] };
const paint = (settle: Record<string, unknown> | null, light: MapRecipe['light'] | null = SUN): PaintedMap =>
  paintMap({ game, materials: MATS, steps: [...BASE, ...(settle ? [{ step: 'settle', ...settle } as MapStep] : [])], ...(light ? { light } : {}) }, game);
const OFF = { sink: 0, ink: false, ring: false, tufts: false, wet: false };
const hash = (m: PaintedMap) => {
  const h = createHash('sha256');
  for (const name of Object.keys(m.layers).sort()) h.update(name + ':' + m.layers[name].px.map(c => c ?? '.').join(','));
  h.update(m.kind.join(','));
  return h.digest('hex');
};
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
const kindAt = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
// the grass rock: x 32..39, rows 16..22 (its foot); the water rock: x 112..119, rows 73..79
const G = { x0: 32, x1: 39, y0: 16, foot: 22 }, Wt = { x0: 112, x1: 119, y0: 73, foot: 79 };
const rows = (m: PaintedMap, r: typeof G, y: number) => Array.from({ length: r.x1 - r.x0 + 1 }, (_, i) => at(m, r.x0 + i, y));
const diff = (a: PaintedMap, b: PaintedMap, box: [number, number, number, number]) => {
  const out: [number, number][] = [];
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) if (at(a, x, y) !== at(b, x, y)) out.push([x, y]);
  return out;
};

describe('settle: what stands sits in the ground', () => {
  it('without a settle step the map is what it was (registering paints nothing), and a settle with every rule off too', () => {
    const none = paint(null);
    // pinned with the code of 10 October before settle existed (git archive of HEAD 6aa6053)
    expect(hash(none)).toBe('2bbcd6a1f6c536db58c1e22dd2a48d170344031f3061768faf0e4b803dd15434');
    expect(hash(paint(OFF))).toBe(hash(none));
  });

  it('sinks for real: the foot row goes under the ground and the ground comes back over it, along a bitten line', () => {
    const before = paint(null), after = paint({ ink: false, ring: false, tufts: false, wet: false });
    // before: the whole foot row is the rock (ink); after, ground came back over part of it: grass, of the grass kind
    expect(rows(before, G, G.foot).slice(1, -1).every(c => c === 'tinta')).toBe(true);
    const back = Array.from({ length: G.x1 - G.x0 + 1 }, (_, i) => G.x0 + i).filter(x => kindAt(after, x, G.foot) === 'pasto');
    expect(back.length).toBeGreaterThan(3);
    for (const x of back) expect(GRASS).toContain(at(after, x, G.foot));
    // the line is not ruled: across the foot, the lowest px of the rock is not on one row
    const lowest = Array.from({ length: G.x1 - G.x0 - 1 }, (_, i) => G.x0 + 1 + i).map(x => {
      let y = G.foot;
      while (y > G.y0 && kindAt(after, x, y) !== 'piedra') y--;
      return y;
    });
    expect(Math.max(...lowest)).toBeLessThan(G.foot);
    expect(new Set(lowest).size).toBeGreaterThan(1);
    // sink 0: nothing sinks
    expect(rows(paint({ ...OFF }), G, G.foot)).toEqual(rows(before, G, G.foot));
  });

  it('no ink at the foot: every px of the rock that faces the ground is its own deepest tone, and the ink above stays', () => {
    const after = paint({ ring: false, tufts: false, wet: false });
    for (let x = G.x0; x <= G.x1; x++) {
      let y = G.foot;
      while (y > G.y0 && kindAt(after, x, y) !== 'piedra') y--;
      if (kindAt(after, x, y) === 'piedra') expect(at(after, x, y)).not.toBe('tinta');
    }
    // the top row of the rock is still ink
    expect(rows(after, G, G.y0).slice(1, -1).every(c => c === 'tinta')).toBe(true);
    // ink: false keeps it
    const kept = paint({ ring: false, tufts: false, wet: false, ink: false });
    expect(Array.from({ length: 8 }, (_, i) => at(kept, G.x0 + i, G.foot - 1)).filter(c => c === 'tinta').length).toBeGreaterThan(0);
  });

  it('a ring at the foot: the ground a tone down below it and at both sides, whether there is a sun or not', () => {
    for (const light of [SUN, null]) {
      const without = paint({ ...OFF, sink: 0 }, light), withRing = paint({ ...OFF, ring: { fray: 0 } }, light);
      const darker = diff(without, withRing, [G.x0 - 3, G.y0, G.x1 + 3, G.foot + 4]).filter(([x, y]) => kindAt(withRing, x, y) === 'pasto');
      for (const [x, y] of darker) expect(GRASS.indexOf(at(withRing, x, y)!)).toBeLessThan(GRASS.indexOf(at(without, x, y)!));
      // below the foot, and at the left and at the right (not only where the sun throws the shadow)
      expect(darker.some(([, y]) => y > G.foot)).toBe(true);
      expect(darker.some(([x, y]) => x < G.x0 && y <= G.foot)).toBe(true);
      expect(darker.some(([x, y]) => x > G.x1 && y <= G.foot)).toBe(true);
      // wider below than at the sides
      expect(Math.max(...darker.map(([, y]) => y)) - G.foot).toBeGreaterThan(Math.max(...darker.filter(([x]) => x < G.x0).map(([x]) => G.x0 - x)));
    }
  });

  it('blades of the grass over the edge of the foot: they stand on the ground and step on the rock', () => {
    const bare = paint({ ...OFF }), grown = paint({ ...OFF, tufts: { density: 2 } });
    const on = diff(bare, grown, [G.x0, G.y0, G.x1, G.foot]).filter(([x, y]) => kindAt(bare, x, y) === 'piedra');
    expect(on.length).toBeGreaterThan(0);
    for (const [x, y] of on) expect(GRASS).toContain(at(grown, x, y));
    // tufts: false grows none
    expect(diff(bare, paint({ ...OFF, tufts: false }), [0, 0, 191, 127])).toEqual([]);
  });

  it('wet only by the water: a band down the foot, foam and a broken reflection in the water; the rock on the grass stays dry', () => {
    const dry = paint({ ...OFF }), wet = paint({ ...OFF, wet: {} });
    // the rock by the water: its lower rows darker, never its top
    const band = diff(dry, wet, [Wt.x0, Wt.y0, Wt.x1, Wt.foot]);
    expect(band.length).toBeGreaterThan(1);
    expect(Math.min(...band.map(([, y]) => y))).toBeGreaterThan(Wt.y0 + 1);
    for (const [x, y] of band) expect(STONE.indexOf(at(wet, x, y)!)).toBeLessThan(STONE.indexOf(at(dry, x, y)!));
    // in the water under it: foam (lighter) on its first row and the reflection (darker) below, dithered
    const water = diff(dry, wet, [Wt.x0 - 1, Wt.foot + 1, Wt.x1 + 1, Wt.foot + 6]);
    expect(water.some(([x, y]) => WATER.indexOf(at(wet, x, y)!) > WATER.indexOf(at(dry, x, y)!))).toBe(true);
    const mirror = water.filter(([x, y]) => WATER.indexOf(at(wet, x, y)!) < WATER.indexOf(at(dry, x, y)!));
    expect(mirror.length).toBeGreaterThan(2);
    expect(mirror.some(([x, y]) => mirror.some(([a, b]) => a === x + 1 && b === y))).toBe(false);   // dithered: never two side by side
    // the rock on the grass: nothing of the wet rule
    expect(diff(dry, wet, [G.x0 - 4, G.y0 - 4, G.x1 + 4, G.foot + 8])).toEqual([]);
  });

  it('targets: only the things named settle (by step id, step name or kind)', () => {
    const bare = paint(null), one = paint({ targets: ['piedra del agua'] });
    expect(diff(bare, one, [G.x0 - 4, G.y0 - 4, G.x1 + 4, G.foot + 6])).toEqual([]);
    expect(diff(bare, one, [Wt.x0 - 4, Wt.y0 - 4, Wt.x1 + 4, Wt.foot + 6]).length).toBeGreaterThan(0);
    const rocks = paint({ targets: ['rocks'] });
    expect(diff(bare, rocks, [G.x0 - 4, G.y0 - 4, G.x1 + 4, G.foot + 6])).toEqual([]);
    expect(diff(bare, rocks, [136, 24, 160, 60]).length).toBeGreaterThan(0);
  });

  it('the lint: stamps whose feet are all ink, every one before settle and none after', () => {
    expect(closedInkOf(paint(null))).toEqual(expect.objectContaining({ closed: 2, total: 2 }));
    expect(closedInkOf(paint({}))).toEqual(expect.objectContaining({ closed: 0, total: 2 }));
  });
});
