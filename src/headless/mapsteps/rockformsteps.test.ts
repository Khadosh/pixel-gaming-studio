// @vitest-environment node
// Relief («una pelota de roca», 10 October): the rocks of PGS were a ball of two tones. With `relief` a rock is a
// height field of facets shaded from the light of the recipe: a plane of light on top and toward the sun, the far
// side in shadow with a deeper core under a crest, one px of rim light, cracks in the deepest tone. Without it,
// nothing changes; with it, the silhouette, the outline and the shadow it casts do not change either.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { Ctx, paintMap, stone, stoneRoles, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStep } from '../maprecipe';
import { lightToward, paintRockForm } from './rockform';
import type { Relief } from './rockformschema';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const GRASS = ['prado hondo', 'prado sombra', 'prado', 'prado claro', 'prado luz'];
const SNOW = ['nieve noche', 'nieve honda', 'nieve sombra', 'nieve', 'túnica luz'];
const game: MapGame = { width: 14, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(14)), decor: [] };
const MATS: MapRecipe['materials'] = {
  pasto: { ramp: GRASS, base: 2, texture: 'patches' }, piedra: { ramp: STONE, texture: 'grain' },
  roca: { ramp: ['túnica noche', 'nieve noche', 'nieve honda', 'piedra sombra', 'piedra', 'piedra clara'] }, nieve: { ramp: SNOW },
};
const SUN = (dir: [number, number]): MapRecipe['light'] => ({ dir, length: 0.25, tone: 1, on: ['pasto'] });
const steps = (relief: Relief | null): MapStep[] => [
  { step: 'area', material: 'pasto', shape: 'all' },
  { step: 'rocks', material: 'piedra', on: ['pasto'], at: [[3, 3, 14, 11, 16], [8, 2.5, 6, 4, 14]], ...(relief ? { relief } : {}) },
  { step: 'scatter', what: 'boulders', material: 'piedra', at: [[6, 6, 0.4, 0.32], [8, 6.5, 0.25, 0.2]], ...(relief ? { relief } : {}) },
  { step: 'crag', material: 'roca', masses: [[11.5, 3, 22, 8, 24]], salt: 421, shadow: true, ...(relief ? { relief } : {}) },
  { step: 'light' }, { step: 'settle' },
] as MapStep[];
const paint = (relief: Relief | null, dir: [number, number] = [0.5, 1]): PaintedMap =>
  paintMap({ game, light: SUN(dir), materials: MATS, steps: steps(relief) }, game);
const hash = (m: PaintedMap) => {
  const h = createHash('sha256');
  for (const name of Object.keys(m.layers).sort()) h.update(name + ':' + m.layers[name].px.map(c => c ?? '.').join(','));
  h.update(m.kind.join(','));
  return h.digest('hex');
};

/** One rock alone, through stone() as the steps call it, and its form (what each px was painted as). */
function one(relief: Relief | null, dir: [number, number] = [0.5, 1], r: [number, number] = [14, 11], salt = 16) {
  const recipe = { game, light: SUN(dir), materials: MATS, steps: [] } as MapRecipe;
  const ctx = new Ctx(recipe, game);
  const pts = stone(ctx, 'piedra', 64, 64, r[0], r[1], salt, false, relief);
  const again = new Ctx(recipe, game);
  const form = relief ? paintRockForm(again, 'piedra', pts, { cx: 64, cy: 64, rx: r[0], ry: r[1], seed: salt, relief, tones: stoneRoles(again, 'piedra'), moss: false, light: lightToward(again, 64, 64 + r[1]) }) : null;
  return { ctx, pts, form, W: ctx.W };
}
const T = { line: 'túnica noche', dark: 'túnica oscura', shadow: 'piedra sombra', mid: 'piedra', light: 'piedra clara', high: 'niebla' };
const centroid = (keys: number[], W: number): [number, number] =>
  [keys.reduce((a, k) => a + (k % W), 0) / keys.length, keys.reduce((a, k) => a + Math.floor(k / W), 0) / keys.length];

describe('relief: a rock as a height field shaded from the light', () => {
  it('without relief the map is what it was (rocks, boulders and crags, settled), pixel for pixel', () => {
    // pinned with the code before relief existed (git archive of HEAD bd7fa22)
    expect(hash(paint(null))).toBe('1baadaec2971cbdb644fc743955a371932456bde8eb2e339b93c2d6ae9ad48ae');
  });

  it('the silhouette, the kind and the outline do not change; only the colors inside it do', () => {
    const before = one(null), after = one({});
    expect([...after.pts.keys()]).toEqual([...before.pts.keys()]);
    const W = before.W;
    for (const key of before.pts.keys()) {
      const x = key % W, y = Math.floor(key / W);
      expect(after.ctx.kindAt(x, y)).toBe(before.ctx.kindAt(x, y));
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => !before.pts.has((y + j) * W + x + i));
      if (edge) expect(after.ctx.ground.get(x, y)).toBe(before.ctx.ground.get(x, y));
    }
    // the whole map: same kinds everywhere (the silhouette of every rock, boulder and crag)
    expect(paint({}).kind).toEqual(paint(null).kind);
  });

  it('the body takes at least three tones: light toward the sun and up, the deep ones on the far side', () => {
    const { ctx, pts, form, W } = one({});
    const body = [...pts.keys()].filter(k => form!.px.get(k)!.role !== 'outline');
    const tones = new Set(body.map(k => ctx.ground.get(k % W, Math.floor(k / W))));
    expect(tones.size).toBeGreaterThanOrEqual(3);
    const of = (c: string) => body.filter(k => ctx.ground.get(k % W, Math.floor(k / W)) === c);
    const lit = of(T.light), deep = [...of(T.shadow), ...of(T.dark)];
    expect(lit.length).toBeGreaterThan(10);
    expect(deep.length).toBeGreaterThan(10);
    // the light comes from up-left (dir [0.5, 1] is where the shadows fall): the lit tone is up and left of the deep
    const [lx, ly] = centroid(lit, W), [dx, dy] = centroid(deep, W);
    expect(lx).toBeLessThan(dx);
    expect(ly).toBeLessThan(dy);
    // a plane of light on top: the px right under the crest of the dome is light
    const top = body.filter(k => form!.px.get(k)!.facet === 0);
    expect(top.length).toBeGreaterThan(5);
    expect(of(T.light).filter(k => form!.px.get(k)!.facet === 0).length / top.length).toBeGreaterThan(0.5);
    // a deeper core than the shadow, under a crest
    expect(body.filter(k => form!.px.get(k)!.role === 'core').length).toBeGreaterThan(0);
  });

  it('a rim of one px in the lightest tone inside the outline, on the side of the light only', () => {
    const { ctx, form, W } = one({});
    const rim = [...form!.px].filter(([, e]) => e.role === 'rim').map(([k]) => k);
    expect(rim.length).toBeGreaterThan(4);
    for (const k of rim) {
      const x = k % W, y = Math.floor(k / W);
      expect(ctx.ground.get(x, y)).toBe(T.high);
      // one px: toward the light (left or up) the next px is the outline, so the rim never runs two deep
      expect(form!.px.get(k - 1)?.role === 'outline' || form!.px.get(k - W)?.role === 'outline').toBe(true);
    }
    // never on the far side: every rim px is on the lit half of the rock
    const [cx, cy] = centroid([...form!.px.keys()], W);
    for (const k of rim) expect((k % W - cx) * 0.447 + (Math.floor(k / W) - cy) * 0.894).toBeLessThan(0);
  });

  it('turning the sun moves the lit side', () => {
    // the lit tones against the deep ones, across: which side of the rock looks at the sun
    const lean = (dir: [number, number]) => {
      const { ctx, pts, W } = one({}, dir), keys = [...pts.keys()], c = (k: number) => ctx.ground.get(k % W, Math.floor(k / W));
      return centroid(keys.filter(k => c(k) === T.light || c(k) === T.mid), W)[0] - centroid(keys.filter(k => c(k) === T.shadow || c(k) === T.dark), W)[0];
    };
    // shadows down-right: the lit side is the left; shadows down-left: the right
    expect(lean([0.5, 1])).toBeLessThan(-2);
    expect(lean([-0.5, 1])).toBeGreaterThan(2);
  });

  it('cracks run in the deepest tone of the body, and none on a small rock or with cracks: 0', () => {
    const { ctx, form, W } = one({ cracks: 2 });
    const crack = [...form!.px].filter(([, e]) => e.role === 'crack').map(([k]) => k);
    expect(crack.length).toBeGreaterThan(5);
    for (const k of crack) expect(ctx.ground.get(k % W, Math.floor(k / W))).toBe(T.dark);
    expect([...one({ cracks: 0 }).form!.px.values()].some(e => e.role === 'crack')).toBe(false);
    expect([...one({ cracks: 2 }, [0.5, 1], [3, 3]).form!.px.values()].some(e => e.role === 'crack')).toBe(false);
  });

  it('a small rock takes fewer facets so it reads at 1×, and facets: 1 is one plane', () => {
    const facets = (relief: Relief, r: [number, number]) => new Set([...one(relief, [0.5, 1], r).form!.px.values()].map(e => e.facet)).size;
    expect(facets({}, [14, 11])).toBe(5);
    expect(facets({}, [3, 3])).toBeLessThan(5);
    expect(facets({ facets: 1 }, [14, 11])).toBe(1);
  });

  it('a crag with relief keeps its shape, and the sun turns which side of its lajas is lit', () => {
    const plain = paint(null), lit = paint({}), flipped = paint({}, [-0.5, 1]);
    expect(lit.kind).toEqual(plain.kind);
    const crag = (m: PaintedMap) => [...m.kind.keys()].filter(i => m.kind[i] === 'roca');
    const share = (m: PaintedMap, side: 'l' | 'r') => {
      const px = crag(m), xs = px.map(i => i % m.width), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      const half = px.filter(i => (side === 'l' ? i % m.width < mid : i % m.width > mid));
      return half.filter(i => m.layers.ground.px[i] === 'piedra clara').length / half.length;
    };
    expect(hash(lit)).not.toBe(hash(plain));
    expect(share(lit, 'l')).toBeGreaterThan(share(lit, 'r'));
    expect(share(flipped, 'r')).toBeGreaterThan(share(flipped, 'l'));
  });
});
