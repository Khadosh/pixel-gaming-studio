// @vitest-environment node
// The steps that still cast their own way read the sun (issue #17): the shade of a bamboo thicket, the shadows of a
// summit (its crags and its decor), the overhang (trunk, boughs, roots and pads), the shadows of a glen and the face of
// a raised area. With a sun each one throws its shadow by the sun's rule into the one mask — the direction of the
// sun, as long as its height says, one tone over a crown's shadow and never two — and without it each one paints
// what it always painted (pinned by hash before the change).
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Ctx, paintMap, type PaintedMap } from '../mappaint';
import { gameGrid, readRecipe, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe, MapStep, MapStepOf } from '../maprecipe';
import { sunIgnored } from './sun';

const FIX = join(__dirname, '../fixtures/mapas');
const hash = (m: PaintedMap) => {
  const h = createHash('sha256');
  for (const name of Object.keys(m.layers).sort()) h.update(name + ':' + m.layers[name].px.map(c => c ?? '.').join(','));
  h.update(m.kind.join(','));
  return h.digest('hex');
};

// ------------------------------------------------------------------ a yard of grass (as in sunsteps.test.ts)

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'];
const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const MATS: MapRecipe['materials'] = {
  suelo: { ramp: GRASS, base: 2 },
  piedra: { ramp: STONE, moss: ['hoja sombra', 'hoja', 'bambú', 'bambú claro'] },
};
const game: MapGame = { width: 24, height: 16, grid: Array.from({ length: 16 }, () => '.'.repeat(24)), decor: [] };
const GROUND: MapStep = { step: 'area', material: 'suelo', shape: 'all' };
const yard = (steps: MapStep[], light?: MapRecipe['light']): MapRecipe => ({ game, materials: MATS, steps, ...(light ? { light } : {}) });

// a tree of limbs standing at the cell (8, 12): a trunk, a bough to the east, a root, two pads, the cast of one pad
// on the bark and the pad under it, a contact shadow under the root, and its shadow on the grass
const TREE: MapStepOf<'overhang'> = {
  step: 'overhang', layer: 'copas', grain: 0.5, cast: [3, 5], contact: ['prado hondo', 1],
  limbs: [
    { path: [[8, 12], [8.1, 10], [7.9, 8], [8, 6]], width: [8, 6, 6, 4] },
    { path: [[8, 8.5], [10, 7.8], [12, 7.5]], width: [3, 1.5] },
    { path: [[7.8, 11.8], [6.8, 12.2], [5.8, 12.4]], width: [3, 2, 0], root: true },
  ],
  pads: [[10.5, 7.4, 16, 5], [8, 6, 22, 7]],
  shadow: { at: [9, 6], on: ['suelo'] },
};
const FACE: MapStep[] = [GROUND, { step: 'area', id: 'peña', material: 'piedra', face: 12, shape: { rect: [4, 3, 8, 5] } }, { step: 'light', on: ['suelo'] }];

// ------------------------------------------------------------------ the fixtures (each with one of the steps)

const fixture = (file: string) => renderRecipe(join(FIX, file)).map;

describe('without the sun each step casts as it always did', () => {
  // pinned with the code of 9 October, before these steps read the sun
  const PINS: Record<string, string> = {
    'bosque (shade)': '92d7a5c9abed2ef3ac3393ef4a828211442615ec3dc58d32d18123b2f70be3b2',
    'cumbre (shadows)': '79cc3d3fb937bc5e70791cdbfdfa3acae7affdc7f51e0f3ad1a619fbbd091965',
    'terraza (overhang)': '468bb2a2fe12e1bff78d91983a32b09a7a5a28cfcee520a8f836e0dae0aeebfc',
    'rio_arriba (glenshade)': '71fd633019451fbc1a106d5f190046487acd2c5d7569209b84c07457c5ea9638',
    'ladera (area face, light)': '7f70c4b2e340a834bf36afe6d372bab5e7031a135726aaf785b7e0e3300cd9eb',
    'raices_boca (cavern)': '164a20090e221fef5401a468fa7a67f68758676a20d2ecc65ba0486512548e89',
    'a tree of limbs (overhang)': '74bf0cb3c78167127d02aff30cc63940ac6c46bb5e10e420c7e1666ec8a45b37',
    'a raised area (face)': '1d85fe62e3f3677c818609e1e34d0a32c2ddd2fda0e3f68dedd983cf02da3195',
  };
  const maps: Record<string, () => PaintedMap> = {
    'bosque (shade)': () => fixture('bosque.receta.json'),
    'cumbre (shadows)': () => fixture('cumbre.receta.json'),
    'terraza (overhang)': () => fixture('terraza.receta.json'),
    'rio_arriba (glenshade)': () => fixture('rio_arriba.receta.json'),
    'ladera (area face, light)': () => fixture('ladera.receta.json'),
    'raices_boca (cavern)': () => fixture('raices_boca.receta.json'),
    'a tree of limbs (overhang)': () => paintMap(yard([GROUND, TREE]), game),
    'a raised area (face)': () => paintMap(yard(FACE), game),
  };
  for (const name of Object.keys(PINS)) it(name, () => { expect(hash(maps[name]())).toBe(PINS[name]); }, 30000);
});

// ------------------------------------------------------------------ with the sun

const DIR: [number, number] = [1, 0.6], NU = Math.hypot(...DIR), U: [number, number] = [DIR[0] / NU, DIR[1] / NU];
const sun = (length: number, tone = 1): MapRecipe['light'] => ({ dir: DIR, length, tone, fray: 0 });
/** The px a map darkened against the same map without what casts: its color is a step (or more) down the shade of its material. */
function shadowOf(rec: MapRecipe, m: PaintedMap, bare: PaintedMap): [number, number][] {
  const ctx = new Ctx(rec, rec.game as MapGame), out: [number, number][] = [];
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const i = y * m.width + x, a = bare.layers.ground.px[i], b = m.layers.ground.px[i], k = m.kind[i];
    if (a === b || k !== bare.kind[i]) continue;
    let c = a;
    for (let n = 1; n <= 3; n++) { c = ctx.shade(c, k); if (c === b) { out.push([x, y]); break; } }
  }
  return out;
}
/** Every px of the shadow is exactly `tone` steps down from the bare ground: never more where two shadows meet. */
function toneOf(rec: MapRecipe, m: PaintedMap, bare: PaintedMap, tone: number): number {
  const ctx = new Ctx(rec, rec.game as MapGame), shaded = shadowOf(rec, m, bare);
  for (const [x, y] of shaded) {
    const i = y * m.width + x;
    let c = bare.layers.ground.px[i];
    for (let n = 0; n < tone; n++) c = ctx.shade(c, m.kind[i]);
    expect(m.layers.ground.px[i], `${x},${y}`).toBe(c);
  }
  return shaded.length;
}
const mid = (px: [number, number][]) => [px.reduce((a, p) => a + p[0], 0) / px.length, px.reduce((a, p) => a + p[1], 0) / px.length];
/** The cosine between the sun and the way the middle of a shadow moves when the sun goes from length a to b. */
const cosOf = (a: [number, number][], b: [number, number][]) => {
  const [ax, ay] = mid(a), [bx, by] = mid(b), m = Math.hypot(bx - ax, by - ay);
  return ((bx - ax) * U[0] + (by - ay) * U[1]) / m;
};
/** How far down the sun the shadow reaches from a foot. */
const reachFrom = (px: [number, number][], foot: [number, number]) => Math.max(...px.map(([x, y]) => (x - foot[0]) * U[0] + (y - foot[1]) * U[1]));
/** How far the shadow reaches from what casts, walking back up the sun from each of its px. */
const reachBack = (px: [number, number][], casts: (x: number, y: number) => boolean) => Math.max(...px.map(([x, y]) => {
  for (let t = 0; t < 400; t += 0.25) if (casts(Math.round(x - U[0] * t), Math.round(y - U[1] * t))) return t;
  return 0;
}));
const L0 = 0.3, L1 = 0.9;

describe('overhang under the sun', () => {
  const TRUNK: MapStepOf<'overhang'> = { step: 'overhang', layer: 'copas', foot: 12, pads: [], limbs: [TREE.limbs![0]], shadow: { on: ['suelo'] } };
  const at = (light: MapRecipe['light'], steps: MapStep[]) => { const r = yard([GROUND, ...steps], light); return [r, paintMap(r, game)] as const; };
  const bare = paintMap(yard([GROUND]), game);

  it('the trunk throws its shadow down the sun, as long as it is tall', () => {
    const [ra, a] = at(sun(L0), [TRUNK]), [rb, b] = at(sun(L1), [TRUNK]);
    const sa = shadowOf(ra, a, bare), sb = shadowOf(rb, b, bare);
    const top = Math.min(...a.layers.copas.px.flatMap((c, i) => (c ? [Math.floor(i / a.width)] : [])));
    const foot: [number, number] = [8 * 16, 12 * 16], tall = foot[1] - top;
    expect(cosOf(sa, sb)).toBeGreaterThan(0.95);
    const per = (reachFrom(sb, foot) - reachFrom(sa, foot)) / ((L1 - L0) * tall);
    expect(per).toBeGreaterThan(0.85);
    expect(per).toBeLessThan(1.15);
  });

  it('the shadow of a bough comes from the height of the bough', () => {
    // one bough alone, low and high over the same foot: its shadow lies as far down the sun as it is high
    const bough = (v: number): MapStepOf<'overhang'> => ({ step: 'overhang', layer: 'copas', foot: 12, pads: [], limbs: [{ path: [[8, v], [10, v - 0.2], [12, v - 0.3]], width: [3, 1.5] }], shadow: { on: ['suelo'] } });
    const fall = (v: number) => {
      const [r, m] = at(sun(L1), [bough(v)]), s = shadowOf(r, m, bare);
      return (mid(s)[1] - 12 * 16) / (12 * 16 - v * 16);   // px down the picture per px of height
    };
    const low = fall(9), high = fall(5);
    expect(low).toBeGreaterThan(0);
    expect(high / low).toBeGreaterThan(0.85);
    expect(high / low).toBeLessThan(1.15);
  });

  it('over the shadow of a crown it is `tone` steps down and never more; its old `at` says nothing', () => {
    const steps: MapStep[] = [TREE, { step: 'grove', id: 'g', layer: 'hojas', trees: [[11, 12.5, 'round', 3, 4013]] }];
    const [r, m] = at({ dir: DIR, length: 0.5, tone: 2, fray: 0 }, steps);
    expect(toneOf(r, m, bare, 2)).toBeGreaterThan(400);
    const [, other] = at({ dir: DIR, length: 0.5, tone: 2, fray: 0 }, [{ ...TREE, shadow: { at: [-20, -20], on: ['suelo'] } }, steps[1]]);
    expect(hash(other)).toBe(hash(m));
  });

  it('the pads still darken the bark and the pad under them (cast), from where the sun puts them', () => {
    // a pad over another, the higher one half a pad up: under the sun its shadow falls on the lower one
    const STACK: MapStepOf<'overhang'> = { ...TREE, pads: [[8, 7.6, 16, 5], [8.5, 6.2, 22, 7]] };
    const [, m] = at(sun(0.5), [STACK]), [, flat] = at(sun(0.5), [{ ...STACK, cast: undefined }]);
    const RAMP = ['madera clara', 'tierra', 'madera', 'madera sombra'], LEAVES = ['bambú claro', 'hoja clara', 'bambú', 'hoja', 'hoja sombra'];
    let bark = 0, leaves = 0;
    for (let i = 0; i < m.kind.length; i++) {
      const a = flat.layers.copas.px[i], b = m.layers.copas.px[i];
      if (a === b || !a || !b) continue;
      if (RAMP.includes(a)) { expect(RAMP.indexOf(b)).toBe(RAMP.indexOf(a) + 1); bark++; }
      else if (LEAVES.includes(a)) leaves++;
    }
    expect(bark).toBeGreaterThan(10);
    expect(leaves).toBeGreaterThan(20);
    // and the contact under the roots is a shadow of the sun on the grass, not a color painted on the layer
    expect(m.layers.copas.px.filter(c => c === 'prado hondo').length).toBe(0);
  });
});

describe('the face of a raised area under the sun', () => {
  const TALL = 32;
  const face = (light: MapRecipe['light'], extra: MapStep[] = []) => {
    const r = yard([GROUND, { step: 'area', id: 'peña', material: 'piedra', face: TALL, shape: { rect: [3, 1, 8, 7] } }, ...extra, { step: 'light', on: ['suelo'] }], light);
    return [r, paintMap(r, game)] as const;
  };
  const bare = paintMap(yard([GROUND, { step: 'area', id: 'peña', material: 'piedra', face: TALL, shape: { rect: [3, 1, 8, 7] } }]), game);

  it('falls down the sun from a wall as high as the face', () => {
    const [ra, a] = face(sun(L0)), [rb, b] = face(sun(L1));
    const sa = shadowOf(ra, a, bare), sb = shadowOf(rb, b, bare);
    const raised = (x: number, y: number) => a.kind[y * a.width + x] === 'piedra';
    expect(cosOf(sa, sb)).toBeGreaterThan(0.95);
    const per = (reachBack(sb, raised) - reachBack(sa, raised)) / ((L1 - L0) * TALL);
    expect(per).toBeGreaterThan(0.85);
    expect(per).toBeLessThan(1.15);
  });

  it('over the shadow of a crown it is `tone` steps down, never more', () => {
    const [r, m] = face({ dir: DIR, length: 0.5, tone: 2, fray: 0 }, [{ step: 'grove', id: 'g', layer: 'hojas', trees: [[12, 9, 'round', 3, 4013]] }]);
    expect(toneOf(r, m, bare, 2)).toBeGreaterThan(300);
  });
});

describe('the shade of a bamboo thicket under the sun', () => {
  // the thicket of grovesteps.test.ts: 12 × 8 cells, a wall border and a wall block in the middle
  const GRID = ['############', '#..........#', '#..........#', '#....##....#', '#....##....#', '#..........#', '#..........#', '############'];
  const FL = ['túnica noche', 'hoja sombra', 'vida sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro'];
  const g: MapGame = { width: 12, height: 8, grid: GRID, decor: [] };
  const rec = (steps: MapStep[], light?: MapRecipe['light']): MapRecipe => ({
    game: g, margin: [2, 1], scatter_salt: 341, steps: [{ step: 'thicket', id: 'b', material: 'musgo', dark: 'matorral' }, ...steps],
    materials: { musgo: { ramp: FL, base: 2 }, matorral: { ramp: ['túnica noche'] } }, ...(light ? { light } : {}),
  });
  const SHADE: MapStep = { step: 'shade', thicket: 'b', on: ['musgo'] };
  const bare = paintMap(rec([]), g);

  it('falls down the sun from a thicket as high as `height`', () => {
    const ra = rec([SHADE], sun(L0)), rb = rec([SHADE], sun(L1));
    const sa = shadowOf(ra, paintMap(ra, g), bare), sb = shadowOf(rb, paintMap(rb, g), bare);
    const thick = (x: number, y: number) => bare.kind[y * bare.width + x] !== 'musgo';
    expect(cosOf(sa, sb)).toBeGreaterThan(0.95);
    expect(reachBack(sb, thick)).toBeLessThanOrEqual(L1 * 32 + 1);
    const per = (reachBack(sb, thick) - reachBack(sa, thick)) / ((L1 - L0) * 32);
    expect(per).toBeGreaterThan(0.85);
    expect(per).toBeLessThan(1.15);
  });

  it('over the shadow of a crown it is `tone` steps down, never more; reach, slope and deep say nothing', () => {
    const light = { dir: DIR, length: 0.5, tone: 2, fray: 0 } as MapRecipe['light'];
    const grove: MapStep = { step: 'grove', id: 'g', layer: 'hojas', trees: [[3, 3, 'round', 3, 4013]] };
    const r = rec([SHADE, grove], light), m = paintMap(r, g);
    expect(toneOf(r, m, bare, 2)).toBeGreaterThan(400);
    const old = paintMap(rec([{ ...SHADE, reach: [9, 9, 3, 1], slope: 2, deep: 9 } as MapStep, grove], light), g);
    expect(hash(old)).toBe(hash(m));
  });
});

describe('the shadows of a summit under the sun', () => {
  const SNOW = ['nieve noche', 'nieve honda', 'nieve sombra', 'nieve', 'túnica luz'];
  const ROCK = ['túnica noche', 'nieve noche', 'nieve honda', 'piedra sombra', 'piedra', 'piedra clara'];
  const g = (decor: MapGame['decor'] = []): MapGame => ({ width: 16, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(16)), decor });
  const rec = (game: MapGame, steps: MapStep[], light?: MapRecipe['light']): MapRecipe => ({
    game, margin: [0, 0], steps: [{ step: 'area', material: 'nieve', shape: 'all' }, ...steps],
    materials: { nieve: { ramp: SNOW, base: 3 }, roca: { ramp: ROCK } }, ...(light ? { light } : {}),
  });
  const SHADOWS: MapStep = { step: 'shadows', on: ['nieve'] };
  const PINE = g([{ sprite: 'pino_x', at: [6, 6], size: [2, 3] }]);

  it('a pine of the decor throws its crown down the sun, as long as it is tall', () => {
    const bare = paintMap(rec(PINE, []), PINE);
    const ra = rec(PINE, [SHADOWS], sun(L0)), rb = rec(PINE, [SHADOWS], sun(L1));
    const sa = shadowOf(ra, paintMap(ra, PINE), bare), sb = shadowOf(rb, paintMap(rb, PINE), bare);
    expect(cosOf(sa, sb)).toBeGreaterThan(0.95);
    const foot: [number, number] = [7 * 16, 7 * 16];
    const per = (reachFrom(sb, foot) - reachFrom(sa, foot)) / ((L1 - L0) * 48);
    expect(per).toBeGreaterThan(0.85);
    expect(per).toBeLessThan(1.15);
  });

  it('a crag throws its shadow down the sun, never on itself', () => {
    const CRAG: MapStep = { step: 'crag', material: 'roca', masses: [[7, 4, 22, 8, 24]], salt: 421, shadow: true };
    const G = g(), bare = paintMap(rec(G, [{ ...CRAG, shadow: false } as MapStep]), G);
    const ra = rec(G, [CRAG, SHADOWS], sun(L0)), rb = rec(G, [CRAG, SHADOWS], sun(L1));
    const a = paintMap(ra, G), sa = shadowOf(ra, a, bare), sb = shadowOf(rb, paintMap(rb, G), bare);
    expect(sa.length).toBeGreaterThan(50);
    expect(cosOf(sa, sb)).toBeGreaterThan(0.95);
    for (const [x, y] of sb) expect(a.kind[y * a.width + x]).toBe('nieve');
  });

  it('over the shadow of a crown it is `tone` steps down, never more', () => {
    const light = { dir: DIR, length: 0.5, tone: 2, fray: 0 } as MapRecipe['light'];
    const bare = paintMap(rec(PINE, []), PINE);
    const r = rec(PINE, [SHADOWS, { step: 'grove', id: 'g', layer: 'hojas', trees: [[8.5, 7.5, 'round', 3, 4013]] }], light);
    expect(toneOf(r, paintMap(r, PINE), bare, 2)).toBeGreaterThan(300);
  });
});

describe('the shadows of a glen under the sun', () => {
  const rio = readRecipe(join(FIX, 'rio_arriba.receta.json'));
  const GAME = { ...gameGrid(join(FIX, 'rio_arriba.json'), join(FIX, 'rio_arriba_visuals.json')), decor: [] };
  const i = rio.steps.findIndex(s => s.step === 'glenshade'), wood = (rio.steps[i] as MapStepOf<'glenshade'>).wood;
  const upTo = (n: number, light?: MapRecipe['light'], more: MapStep[] = []) => {
    const r: MapRecipe = { ...rio, game: GAME, steps: [...rio.steps.slice(0, n), ...more], ...(light ? { light } : {}) };
    return [r, paintMap(r, GAME)] as const;
  };
  const [, bare] = upTo(i);

  it('the wood throws its shadow up to the sun\'s length times its height, every px of it down the sun from the wood', () => {
    const [ra, a] = upTo(i + 1, sun(L0)), [rb, b] = upTo(i + 1, sun(L1));
    const sa = shadowOf(ra, a, bare), sb = shadowOf(rb, b, bare);
    const woods = (x: number, y: number) => bare.kind[y * bare.width + x] === wood;
    // the wood stands on three sides of the clearing, so the middle of its shadow moves every way at once and says
    // nothing of the direction: instead every px of it has to see the wood walking back up the sun, no farther than
    // the sun's length times its height (a shadow thrown any other way would not)
    expect(reachBack(sb, woods)).toBeLessThanOrEqual(L1 * 32 + 1);
    expect(reachBack(sa, woods)).toBeLessThanOrEqual(L0 * 32 + 1);
    const per = (reachBack(sb, woods) - reachBack(sa, woods)) / ((L1 - L0) * 32);
    expect(per).toBeGreaterThan(0.85);
    expect(per).toBeLessThan(1.15);
  }, 30000);

  it('under the sun it needs no wetwood (its rim is the old light): the decor still throws; without the sun it still asks for one', () => {
    const noWood = rio.steps.slice(0, i + 1).filter(s => s.step !== 'wetwood');
    const TREE_G = { ...GAME, decor: [{ sprite: 'arbol_x', at: [8, 4] as [number, number], size: [2, 3] as [number, number] }] };
    const r: MapRecipe = { ...rio, game: TREE_G, steps: noWood, light: sun(L1) };
    const r0: MapRecipe = { ...r, game: GAME };
    const m = paintMap(r, TREE_G), m0 = paintMap(r0, GAME);
    let differ = 0;
    for (let k = 0; k < m.layers.ground.px.length; k++) if (m.layers.ground.px[k] !== m0.layers.ground.px[k]) differ++;
    expect(differ).toBeGreaterThan(40);
    expect(() => paintMap({ ...rio, game: GAME, steps: noWood }, GAME)).toThrow(/no wetwood/);
  }, 30000);

  it('a tree of the decor throws its crown down the sun, as long as it is tall', () => {
    const TREE_G = { ...GAME, decor: [{ sprite: 'arbol_x', at: [8, 4] as [number, number], size: [2, 3] as [number, number] }] };
    const with_ = (L: number) => {
      const r: MapRecipe = { ...rio, game: TREE_G, steps: rio.steps.slice(0, i + 1), light: sun(L) };
      const r0: MapRecipe = { ...r, game: GAME };
      return shadowOf(r, paintMap(r, TREE_G), paintMap(r0, GAME));
    };
    const sa = with_(L0), sb = with_(L1);
    expect(cosOf(sa, sb)).toBeGreaterThan(0.95);
    const foot: [number, number] = [(9 + 9) * 16, (1 + 5) * 16];
    const per = (reachFrom(sb, foot) - reachFrom(sa, foot)) / ((L1 - L0) * 48);
    expect(per).toBeGreaterThan(0.85);
    expect(per).toBeLessThan(1.15);
  }, 30000);

  it('over the shadow of a crown it is `tone` steps down, never more', () => {
    const [r, m] = upTo(i + 1, { dir: DIR, length: 0.5, tone: 2, fray: 0 }, [{ step: 'grove', id: 'g', layer: 'hojas', trees: [[-2, 6, 'round', 3, 4013]] }]);
    expect(toneOf(r, m, bare, 2)).toBeGreaterThan(400);
  }, 30000);
});

describe('a recipe with a sun that still declares the old light', () => {
  it('hears about each step that does (and a recipe without a sun hears nothing)', () => {
    const steps: MapStep[] = [
      { step: 'shade', thicket: 'b', on: ['musgo'], reach: [4, 5, 7, 331], deep: 2 },
      { step: 'overhang', layer: 'copas', pads: [], shadow: { at: [9, 6], on: ['suelo'] } },
      { step: 'overhang', layer: 'copas', pads: [], shadow: { on: ['suelo'] } },
      { step: 'glenshade', on: ['musgo'], wood: 'bosque', river: 'rio', casters: [{ prefix: 'arbol', at: [0.7, -0.2], r: [16, 8], salt: 7 }] },
      { step: 'cast', on: ['suelo'], lean: [0.5, 0.2] },
      { step: 'light', on: ['suelo'], trunks: [''] },
      { step: 'grove', id: 'g', layer: 'copas', trees: [] },
    ];
    const said = sunIgnored({ light: { dir: [1, 1], length: 0.3 }, steps });
    expect(said).toHaveLength(5);
    expect(said[0]).toMatch(/^step 0 \(shade\): reach, deep are the old light/);
    expect(said[1]).toMatch(/^step 1 \(overhang\): shadow\.at is the old light/);
    expect(said[2]).toMatch(/^step 3 \(glenshade\): casters\[\]\.at/);
    expect(said[3]).toMatch(/^step 4 \(cast\): lean/);
    expect(said[4]).toMatch(/^step 5 \(light\): trunks/);
    const pier: MapStep = { step: 'pier', material: 't', water: 'agua', x: [1, 0, 2, 0], y: [1, 2], salt: 1, shadow: { from: 2, to: 6, width: 4, rows: [4, 6] }, under: 3 };
    expect(sunIgnored({ light: { dir: [1, 1], length: 0.3 }, steps: [pier] })[0]).toMatch(/^step 0 \(pier\): shadow, under are the old light/);
    expect(sunIgnored({ light: [1, 1], steps })).toEqual([]);
    expect(sunIgnored({ steps })).toEqual([]);
  });
});
