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

// The four faults of the first pass over the twenty maps of the game (10 October): a trunk standing on another came
// out cut in two with grass in between, a house mirrored the top of the gravestone under it up over its foot, a crate
// had its straight base bitten, the red of a lantern painted the foot of its post (and its tassel got wet), and a
// log three px high counted as closed by ink.
describe('settle on what the game lays: things on things, built bases, two materials', () => {
  const WOOD = ['tinta', 'madera sombra', 'madera', 'madera clara'];
  const LAC = ['l0', 'laca honda', 'laca', 'laca clara', 'l4', 'l5', 'l6', 'l7'];
  const MATS2: MapRecipe['materials'] = { ...MATS, madera: { ramp: WOOD, texture: 'grain' }, laca: { ramp: LAC, texture: 'grain' } };
  const TRUNK = ['KmmK', 'KmmK', 'KmmK', 'KmmK', 'KmmK', 'KmmK', 'KmmK', 'KmmK', 'KmmmmK', 'KKKKKK'];
  const HOUSE = ['KKKKKKKKKKKK', ...Array.from({ length: 10 }, () => 'KmmmmmmmmmmK'), 'KKKKKKKKKKKK'];
  // a gravestone with no ink on its top (its top is what a sunk foot over it mirrored up)
  const STONE2 = ['PPPPPP', 'KPPPPK', 'KPPDDK', '.KKKK.'];
  const CRATE = ['KKKKKKKKKKKKKKKK', 'KmmmmmmmmmmmmmmK', 'KmMmmmmmmmmmmmMK', 'KmmmmmmmmmmmmmmK', 'KmmmmmmMmmmmmmmK', 'KmmmmmmmmmmmmmmK', 'KmmmmmmmmmmmmmmK', 'KKKKKKKKKKKKKKKK'];
  const LEGS = ['.KKKKKKKKKK.', 'KmmmmmmmmmmK', 'KmmmmMmmmmmK', 'KmmmmmmmmmmK', 'KmmmmmmmmmmK', '.KKKKKKKKKK.', '.KmK....KmK.', '.KmK....KmK.', 'KKKK....KKKK'];
  // a lantern of lacquer on a post of wood, its tassel of gold: the lacquer is darker than the wood
  const LANTERN = ['..KKKmK', '..K..mK', '.KmK.mK', 'abaafmK', 'abaafmK', 'abaafmK', '.aaf.mK', '.KmK.mK', '..o..mK', '.....mK', '.....KK', '.....KK'];
  const LOG = ['Mmmmmmmmmm', 'mmmmmmmmmK', 'KKKKKKKKKK'];
  const SHADED = ['mmmmmm', 'mMmmmm', 'mmmmmm', 'mmmmMm', 'mmmmmm', 'KKKKKK'];
  const GL2 = { K: 'tinta', m: 'madera', M: 'madera clara', P: 'piedra', D: 'piedra sombra', a: 'laca honda', b: 'laca clara', f: 'laca', o: 'oro' };
  const st = (id: string, rows: string[], at: [number, number]): MapStep => ({ step: 'scatter', id, what: 'stamp', at: [at], rows, glyphs: GL2, stands: true });
  const STEPS2: MapStep[] = [
    { step: 'area', material: 'pasto', shape: 'all' },
    { step: 'area', material: 'agua', shape: { rect: [0, 5, 12, 3] } },
    // the trunk behind (its box from (16, 8)), the one in front laid after it over its foot (from (16, 15))
    st('tronco atrás', TRUNK, [1, 0.5]), st('tronco delante', TRUNK, [1, 15 / 16]),
    // a house whose foot stands on the top of a gravestone (box (48, 8)..(59, 19); the stone from (51, 20))
    st('choza', HOUSE, [3, 0.5]), st('lápida', STONE2, [51 / 16, 20 / 16]),
    st('cajón', CRATE, [5, 1]), st('brasero', LEGS, [7, 1]),
    // the lantern with its foot by the water (box (160, 68)..(166, 79), the water from y 80)
    st('farolito', LANTERN, [10, 68 / 16]),
    st('leño', LOG, [1, 3]), st('sombreado', SHADED, [3, 3]), st('roca', ROCK, [5, 3]),
  ];
  const paint2 = (settle: Record<string, unknown> | null): PaintedMap =>
    paintMap({ game, materials: MATS2, steps: [...STEPS2, ...(settle ? [{ step: 'settle', ...settle } as MapStep] : [])] }, game);
  const box = (m: PaintedMap, x0: number, y0: number, x1: number, y1: number) => {
    const out: (string | null)[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(at(m, x, y));
    return out;
  };
  const lowest = (m: PaintedMap, x: number, y0: number, y1: number, colors: string[]) => {
    let y = y1;
    while (y > y0 && !colors.includes(at(m, x, y)!)) y--;
    return y;
  };

  it('1. two trunks one on the other stay whole: no ground mirrored between them, no blade on the one in front', () => {
    const before = paint2(null), after = paint2({ targets: ['tronco atrás', 'tronco delante'], tufts: { density: 3 } });
    // the trunk behind from its top down to where the one in front begins, and the one in front down to near its
    // foot: wood or ink, never grass
    for (let y = 8; y <= 21; y++) for (let x = 16; x <= 19; x++) expect(GRASS, `${x},${y}`).not.toContain(at(after, x, y));
    // the trunk in front keeps every px it had above its own foot (nothing of it sank into the one behind)
    expect(box(after, 16, 15, 19, 20)).toEqual(box(before, 16, 15, 19, 20));
  });

  it('1. a foot on another thing does not sink there, and never mirrors that thing up (a house over a gravestone)', () => {
    const before = paint2(null), after = paint2({ targets: ['choza'], tufts: { density: 3 } });
    // the house never takes the stone's colors, and its columns over the stone keep their foot
    expect(box(after, 48, 8, 59, 19).some(c => c === 'piedra' || c === 'piedra sombra')).toBe(false);
    for (let x = 51; x <= 56; x++) for (const y of [18, 19]) expect(['tinta', 'madera', 'madera sombra']).toContain(at(after, x, y));
    // the stone under it: untouched (no blade, no ring on it)
    const stone = (m: PaintedMap) => box(m, 51, 20, 56, 23).map((c, i) => GRASS.includes(box(before, 51, 20, 56, 23)[i]!) ? null : c);
    expect(stone(after)).toEqual(stone(before));
  });

  it('2. a straight built base sinks level (never bitten), and legs sink a third of their height, their sides inked', () => {
    const before = paint2(null), after = paint2({ targets: ['cajón', 'brasero'], ring: false, tufts: false, wet: false });
    // the crate (80..95, 16..23): every column ends on one row, over its old foot
    const bottoms = Array.from({ length: 16 }, (_, i) => lowest(after, 80 + i, 16, 23, ['tinta', 'madera', 'madera clara']));
    expect(new Set(bottoms).size).toBe(1);
    expect(bottoms[0]).toBeLessThan(23);
    // the brazier (112..123, 16..24): its belly over the legs as it was, its legs lose one row and keep their ink
    expect(box(after, 112, 16, 123, 21)).toEqual(box(before, 112, 16, 123, 21));
    for (const x of [113, 115, 120, 122]) {
      expect(lowest(after, x, 22, 24, ['tinta', 'madera', 'madera clara'])).toBe(23);
      expect(at(after, x, 22)).toBe('tinta');
    }
  });

  it('3. two materials: the foot of the post takes the wood above it, never the lacquer; the tassel stays dry', () => {
    const before = paint2(null), after = paint2({ targets: ['farolito'] });
    // the post (165..166) down from the lantern: wood or ink, no lacquer
    for (let y = 75; y <= 79; y++) for (const x of [165, 166]) expect(LAC, `${x},${y}`).not.toContain(at(after, x, y));
    expect([at(after, 165, 77), at(after, 165, 78)].some(c => WOOD.includes(c!))).toBe(true);
    // the lantern and its tassel: as they were (by the water, not wet: they do not touch it)
    const lantern = (m: PaintedMap) => box(m, 160, 68, 164, 76).map((c, i) => GRASS.includes(box(before, 160, 68, 164, 76)[i]!) ? null : c);
    expect(lantern(after)).toEqual(lantern(before));
    expect(at(after, 162, 76)).toBe('oro');
  });

  it('4. closed ink: a flat thing (4 px high or less) is not measured, and a base of its own shade is not ink', () => {
    const m = closedInkOf(paint2(null))!;
    // stamps measured: the trunks, the house, the crate, the brazier, the lantern, the shaded, the rock; not the log
    // nor the gravestone (4 px). The shaded one is not closed: its base is its shade, its top is not closed by it
    expect(m.total).toBe(8);
    expect(m.ids.some(s => s.startsWith('leño'))).toBe(false);
    expect(m.ids.some(s => s.startsWith('sombreado'))).toBe(false);
    expect(m.ids.some(s => s.startsWith('roca'))).toBe(true);
  });
});
