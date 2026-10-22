// @vitest-environment node
// The light of an interior (unwritten-dao docs/diseno/interiores.md, §2, M1–M4): a lamp instead of the sun
// (`light.source`), the pool of light around it (`glow`), a beam over people (`wall.layer`) and the shadows at the
// foot of the furniture thrown by the light of the recipe (`furnish.shadows`). The room with a candle in the middle
// and four pieces around it is the fixture `cuarto_vela.receta.json`; a recipe whose sun has a `dir` paints what it
// painted before the lamp existed (pinned by hash with the code of 10 October).
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { expandDrawings, readRecipe, recipeColors } from '../mapfile';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';
import { sunIgnored } from './sun';

const FIX = join(__dirname, '../fixtures/mapas');
const hash = (m: PaintedMap) => {
  const h = createHash('sha256');
  for (const name of Object.keys(m.layers).sort()) h.update(name + ':' + m.layers[name].px.map(c => c ?? '.').join(','));
  h.update(m.kind.join(','));
  return h.digest('hex');
};
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;

// ------------------------------------------------------------------ M1: a lamp instead of the sun

describe('light.source: a lamp in the room', () => {
  // its furniture is drawn in objetos/: read as the painter takes it, each stamp as rows at its top-left corner
  const path = join(FIX, 'cuarto_vela.receta.json'), read = readRecipe(path);
  const room = expandDrawings(read, path, recipeColors(read, path));
  const game = room.game as MapGame;
  // the four pieces that stand, with their foot (middle of the bottom row, px) and height
  const pieces = room.steps.flatMap(st => st.step === 'scatter' && st.stands ? [st] : []).map(st => {
    const [u, v] = st.at![0], rows = st.rows!, x0 = Math.round(16 + 16 * u), y0 = Math.round(16 + 16 * v);
    return { foot: [x0 + rows[0].length / 2, y0 + rows.length - 1] as [number, number], h: rows.length, x0, x1: x0 + rows[0].length - 1 };
  });
  const lamp = [16 + 16 * 5.5, 16 + 16 * 4.5];
  const without = (r: MapRecipe): MapRecipe => ({ ...r, steps: r.steps.map(st => st.step === 'scatter' ? { ...st, stands: false } : st) });

  it('four pieces around a candle: four shadows away from it, longer the taller the piece', () => {
    const lit = paintMap(room, game), bare = paintMap(without(room), game);
    const shadow: [number, number][] = [];
    for (let y = 0; y < lit.height; y++) for (let x = 0; x < lit.width; x++) {
      const i = y * lit.width + x;
      if (lit.kind[i] === 'tablas' && lit.layers.ground.px[i] !== bare.layers.ground.px[i]) shadow.push([x, y]);
    }
    expect(pieces.length).toBe(4);
    expect(shadow.length).toBeGreaterThan(400);
    const reach = pieces.map(({ foot, x0, x1 }) => {
      const d = [foot[0] - lamp[0], foot[1] - lamp[1]], n = Math.hypot(d[0], d[1]), u = [d[0] / n, d[1] / n];
      const mine = shadow.filter(p => pieces.every(o => Math.hypot(p[0] - foot[0], p[1] - foot[1]) <= Math.hypot(p[0] - o.foot[0], p[1] - o.foot[1])));
      expect(mine.length).toBeGreaterThan(30);
      // its middle lies away from the lamp, and nothing of it toward the lamp
      const mx = mine.reduce((a, p) => a + p[0], 0) / mine.length - foot[0], my = mine.reduce((a, p) => a + p[1], 0) / mine.length - foot[1];
      expect((mx * u[0] + my * u[1]) / Math.hypot(mx, my)).toBeGreaterThan(0.8);
      // (from the end of its foot row nearest the px: a wide piece shades along its whole foot)
      for (const p of mine) expect(Math.max(...[x0, x1].map(x => (p[0] - x) * u[0] + (p[1] - foot[1]) * u[1]))).toBeGreaterThan(-2);
      return Math.max(...mine.map(p => (p[0] - foot[0]) * u[0] + (p[1] - foot[1]) * u[1]));
    });
    // heights 30, 10, 9, 22: the wardrobe reaches farthest, then the screen, then the table and the chest
    const order = pieces.map((p, i) => [p.h, reach[i]]).sort((a, b) => b[0] - a[0]).map(([, r]) => r);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]).toBeGreaterThan(order[i] - 1);
    expect(order[0]).toBeGreaterThan(2 * order[3]);
  });

  it('a shorter `length` caps the shadows shorter', () => {
    const short = paintMap({ ...room, light: { ...(room.light as object), length: 0.4 } as MapRecipe['light'] }, game);
    const long = paintMap(room, game), bare = paintMap(without(room), game);
    const count = (m: PaintedMap) => m.kind.filter((k, i) => k === 'tablas' && m.layers.ground.px[i] !== bare.layers.ground.px[i]).length;
    expect(count(short)).toBeLessThan(count(long));
  });

  it('a sun with dir paints what it painted before the lamp: the yard of the island, pinned', () => {
    const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'];
    const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
    const MATS: MapRecipe['materials'] = {
      suelo: { ramp: GRASS, base: 2 }, lajas: { ramp: STONE, texture: 'flagstones' },
      tierra: { ramp: ['túnica noche', 'madera sombra', 'tierra sombra', 'tierra'] },
      tablas: { ramp: ['túnica noche', 'madera sombra', 'madera', 'madera clara', 'arena'] },
      teja: { ramp: ['tinta', 'tinta', 'basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz'] },
      piedra: { ramp: STONE }, revoque: { ramp: ['piedra sombra', 'piedra', 'túnica sombra', 'pergamino'] },
      vigas: { ramp: ['tinta', 'madera sombra', 'madera', 'madera clara', 'arena'] },
      toldo: { ramp: ['tinta', 'madera sombra', 'bermellón', 'bermellón claro', 'piel sombra', 'piel'] },
    };
    const yard: MapGame = { width: 24, height: 16, grid: Array.from({ length: 16 }, () => '.'.repeat(24)), decor: [{ sprite: 'mesa', at: [6, 13], size: [2, 1] }, { sprite: 'farol', at: [9, 13] }] };
    const steps: MapStep[] = [
      { step: 'area', material: 'suelo', shape: 'all' },
      { step: 'area', id: 'patio', material: 'lajas', shape: { rect: [2, 8, 9, 3] } },
      { step: 'building', id: 'casa', rect: [2, 2, 8, 4], wall: 30, material: 'revoque', frame: 'vigas', stone: 'piedra', shadow: { on: ['suelo', 'lajas'] }, roof: { material: 'teja', hip: 10, upturn: 6 } },
      { step: 'stall', id: 'puesto', rect: [14, 9, 3, 1.5], cloth: 'toldo', wood: 'tablas', layer: 'techos', goods: [{ kind: 'pottery' }], shadow: { on: ['suelo'] } },
      { step: 'fence', id: 'cerca', material: 'vigas', path: [[12, 12], [20, 12]], shadow: 1, on: ['suelo'], salt: 1901 },
      { step: 'beds', id: 'huerto', soil: 'tierra', frame: 'tablas', beds: [[2, 12, 3, 2]], plants: [{ shape: 'leafy' }], rise: 3, shadow: { on: ['suelo'] } },
      { step: 'scatter', what: 'stamp', at: [[11, 9]], rows: ['.AA.', 'AAAA', 'AAAA', 'AAAA', '.AA.'], glyphs: { A: 'madera' }, stands: true },
      { step: 'area', id: 'peña', material: 'piedra', face: 12, shape: { rect: [18, 1, 4, 3] } },
      { step: 'grove', id: 'arboleda', layer: 'copas', trees: [[14, 5, 'round', 3, 4013], [18, 6, 'pine', 3, 4026], [21, 9, 'bush', 0.8, 4039]] },
      { step: 'light', on: ['suelo', 'lajas'] },
    ];
    // the light of the island (sect.json): dir [0.5, 1], length 0.25, tone 2, soft 2
    const light: MapRecipe['light'] = { dir: [0.5, 1], length: 0.25, tone: 2, soft: 2, contrast: 0.2, crown: [0.4, 0.24], on: ['suelo', 'lajas'], tones: { lajas: 1 } };
    expect(hash(paintMap({ game: yard, materials: MATS, steps, light }, yard))).toBe('d9a79f5939e8d509034f4cce31e191cc8005f29f4e312eac57179a7388cfe67f');
  }, 30000);

  it('a light with neither dir nor source says so', () => {
    expect(() => paintMap({ ...room, light: { length: 1 } as MapRecipe['light'] }, game)).toThrow(/dir.*source/);
  });
});

// ------------------------------------------------------------------ a small room for M2–M4

const LIGHTEN = { 'madera sombra': 'madera', madera: 'tierra', tierra: 'madera clara', 'madera clara': 'arena', arena: 'piel clara', piedra: 'piedra clara' };
const SHADE = { 'piel clara': 'arena', arena: 'madera clara', 'madera clara': 'madera', madera: 'madera sombra', 'madera sombra': 'túnica noche', piedra: 'piedra sombra', 'piedra clara': 'piedra' };
const small = (decor: MapGame['decor'] = []): MapGame => ({ width: 10, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(10)), decor });
const roomOf = (steps: MapStep[], extra: Partial<MapRecipe> = {}): MapRecipe => ({
  game: small(), shade: SHADE, lighten: LIGHTEN,
  materials: { tablas: { ramp: ['madera sombra', 'madera', 'madera clara'] }, lajas: { ramp: ['piedra sombra', 'piedra', 'piedra clara'] } },
  steps: [{ step: 'area', material: 'tablas', shape: 'all' }, { step: 'area', id: 'piedra', material: 'lajas', shape: { rect: [0, 0, 2, 8] } }, ...steps], ...extra,
});
/** How many steps of the lighten table take `base` to `c` (0: the same; -1: not by lightening). */
const steps = (c: string | null, base: string | null) => {
  let k = base, n = 0;
  while (k !== c && k !== null && n < 5) { k = LIGHTEN[k as keyof typeof LIGHTEN] ?? null; n++; }
  return k === c ? n : -1;
};

describe('glow: a pool of lamp light on the floor', () => {
  const GLOW: MapStep = { step: 'glow', at: [5, 4], r: [10, 30], tones: 2, on: ['tablas'] };
  const bare = paintMap(roomOf([]), small()), lit = paintMap(roomOf([GLOW]), small());
  const [cx, cy] = [5.5 * 16, 4.5 * 16];

  it('lighter at the middle than at the edge, by the lighten table', () => {
    expect(steps(at(lit, 'ground', cx, cy), at(bare, 'ground', cx, cy))).toBe(2);
    let ring = 0, n = 0;
    for (let a = 0; a < 64; a++) {
      const x = Math.round(cx + 26 * Math.cos(a / 10)), y = Math.round(cy + 26 * Math.sin(a / 10));
      if (lit.kind[y * lit.width + x] !== 'tablas') continue;
      n++; ring += steps(at(lit, 'ground', x, y), at(bare, 'ground', x, y));
    }
    expect(ring / n).toBeLessThan(1.2);
    expect(ring / n).toBeGreaterThan(0);
  });

  it('nothing past the edge, and its rings bitten (not a ruled circle)', () => {
    const tiers = new Set<number>();
    for (let y = 0; y < lit.height; y++) for (let x = 0; x < lit.width; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), s = steps(at(lit, 'ground', x, y), at(bare, 'ground', x, y));
      if (d > 30) expect(s).toBe(0);
      if (Math.abs(d - 17) < 1) tiers.add(s);   // inside the 2-tone threshold (20) by less than a bite
    }
    expect(tiers.size).toBeGreaterThan(1);   // at one distance, px of two rings: the border wanders
  });

  it('on: only those materials', () => {
    const wide = paintMap(roomOf([{ ...GLOW, at: [2, 4], r: [10, 40] } as MapStep]), small());
    for (let i = 0; i < wide.kind.length; i++) if (wide.kind[i] === 'lajas') expect(wide.layers.ground.px[i]).toBe(bare.layers.ground.px[i]);
  });

  it('with layer the ground stays as it was and the layer holds the light, over the finished ground', () => {
    const m = paintMap(roomOf([{ ...GLOW, layer: 'velas' } as MapStep]), small());
    expect(m.layers.ground.px).toEqual(bare.layers.ground.px);
    expect(at(m, 'velas', cx, cy)).toBe(at(lit, 'ground', cx, cy));
    expect(m.layers.velas.px.filter(c => c !== null).length).toBeGreaterThan(1000);
  });
});

// ------------------------------------------------------------------ M3: a beam over people

describe('wall.layer: a beam or a lintel on a layer of its own', () => {
  const BEAM: MapStep = { step: 'wall', id: 'viga', material: 'viga', rect: [0, 40, 160, 5], profile: ['túnica noche', 'madera clara', 'madera', 'madera sombra', 'túnica noche'], shadow: { toward: 'b', depth: [2, 0], on: ['tablas'] } };

  it('without layer, as before: on the ground, its kind on the floor', () => {
    const m = paintMap(roomOf([BEAM]), small());
    expect(at(m, 'ground', 80, 41)).toBe('madera clara');
    expect(m.kind[41 * m.width + 80]).toBe('viga');
    expect(m.layers.techos).toBeUndefined();
  });

  it('with layer, the floor has no beam and the layer does; its shadow stays on the floor', () => {
    const bare = paintMap(roomOf([]), small());
    const m = paintMap(roomOf([{ ...BEAM, layer: 'techos' } as MapStep]), small());
    for (let y = 40; y < 45; y++) for (let x = 32; x < 160; x++) {
      expect(at(m, 'ground', x, y)).toBe(at(bare, 'ground', x, y));
      expect(m.kind[y * m.width + x]).toBe('tablas');
      expect(at(m, 'techos', x, y)).not.toBeNull();
    }
    expect(at(m, 'techos', 80, 41)).toBe('madera clara');
    // the shadow under it, two px on the floor
    for (const y of [45, 46]) expect(at(m, 'ground', 80, y)).not.toBe(at(bare, 'ground', 80, y));
    expect(at(m, 'ground', 80, 47)).toBe(at(bare, 'ground', 80, 47));
  });
});

// ------------------------------------------------------------------ M4: the shadows of the furniture read the light

describe('furnish shadows: thrown by the light of the recipe', () => {
  const decor: MapGame['decor'] = [{ sprite: 'mesa', at: [5, 3], size: [1, 2] }];
  const FURNISH: MapStep = { step: 'furnish', what: 'shadows', on: ['tablas'] };
  const centroid = (light: MapRecipe['light']) => {
    const g = small(decor), bare = paintMap(roomOf([], { game: g }), g);
    const m = paintMap(roomOf([FURNISH], { game: g, light }), g);
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < m.kind.length; i++) if (m.layers.ground.px[i] !== bare.layers.ground.px[i]) { sx += i % m.width; sy += Math.floor(i / m.width); n++; }
    expect(n).toBeGreaterThan(20);
    return [sx / n - 5.5 * 16, sy / n - 4 * 16];   // from the middle of the foot of the piece (row 4)
  };

  it('the sun from the north-west: the shadow falls to the south-east', () => {
    const [dx, dy] = centroid({ dir: [1, 1], length: 0.6, tone: 1, fray: 0 });
    expect(dx).toBeGreaterThan(3);
    expect(dy).toBeGreaterThan(0);
  });

  it('a lamp to the left: the shadow falls to the right', () => {
    const [dx, dy] = centroid({ source: { at: [1, 4], h: 40 }, length: 0.8, tone: 1, fray: 0 });
    expect(dx).toBeGreaterThan(5);
    expect(Math.abs(dy)).toBeLessThan(dx);
  });

  it('a lamp to the right: to the left (the same step, the other way)', () => {
    const [dx] = centroid({ source: { at: [9, 4], h: 40 }, length: 0.8, tone: 1, fray: 0 });
    expect(dx).toBeLessThan(-5);
  });

  it('with a light, the old shape is not used and the lint says so; without one it is the old shadow', () => {
    const shaped: MapStep = { ...FURNISH, shape: [4, 3, 2, 1.2] } as MapStep;
    expect(sunIgnored({ light: { dir: [1, 1], length: 0.5 }, steps: [shaped] })[0]).toMatch(/furnish.*shape/);
    expect(sunIgnored({ light: [1, 1], steps: [shaped] })).toEqual([]);
    const g = small(decor);
    const old = paintMap(roomOf([FURNISH], { game: g }), g), bare = paintMap(roomOf([], { game: g }), g);
    // down-right of the foot, 4 rows, stacking: the old rule
    expect(at(old, 'ground', 5.5 * 16 + 6, 4 * 16 + 1)).not.toBe(at(bare, 'ground', 5.5 * 16 + 6, 4 * 16 + 1));
  });
});
