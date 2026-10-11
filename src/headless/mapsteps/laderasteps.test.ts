// @vitest-environment node
// What the engine did not know for a snowy mountain slope (The Unwritten Dao #245, the caves of the immortal): the
// top of a crag shaded from the ramp of its material, drifts of snow with a side to the sun and a side in shade, the
// flanks of a tall map seen from the south (granite in courses, lit by the sun), a crag laid by a place, wet stones
// in any water, a gloom around any area and a rug that goes under a stamp.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { renderRecipe } from '../mapfile';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStep, MapStepOf } from '../maprecipe';

type Steps = MapRecipe['steps'];
const SNOW = ['nieve noche', 'nieve honda', 'nieve sombra', 'nieve', 'túnica luz'];
const BASALT = ['basalto hondo', 'basalto sombra', 'basalto', 'piedra sombra', 'basalto claro', 'piedra'];
const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
const WATER = ['celeste oscuro', 'celeste', 'celeste luz', 'ojo', 'nube'];
const SHADE = { 'túnica luz': 'nieve sombra', nieve: 'nieve sombra', 'nieve sombra': 'nieve honda', 'nieve honda': 'nieve noche' };
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: SNOW }, ceja: { ramp: BASALT, base: 2 }, piedra: { ramp: STONE, texture: 'grain' },
  granito: { ramp: STONE, moss: ['nieve honda', 'nieve sombra', 'nieve', 'túnica luz'] }, cielo: { ramp: SKY },
  agua: { ramp: WATER, texture: 'water' },
};
const SUN = (dir: [number, number]): MapRecipe['light'] => ({ dir, length: 0.25, tone: 1, on: ['nieve'] });
function game(w = 12, h = 10): MapGame { return { width: w, height: h, grid: Array.from({ length: h }, () => '.'.repeat(w)), decor: [] }; }
function recipe(steps: Steps, extra: Partial<MapRecipe> = {}): MapRecipe {
  return { game: game(), margin: [4, 1], shade: SHADE, materials: MATS, steps, ...extra };
}
const SNOWFIELD: MapStep = { step: 'snowfield', material: 'nieve', hollows: [0, 2] };   // (no hollows, no crests: flat snow)
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const P = (m: PaintedMap, u: number, v: number): [number, number] => [m.origin[0] + Math.round(u * 16), m.origin[1] + Math.round(v * 16)];
/** The place of a color in a ramp (its lightness, as the ramp orders it), -1 off it. */
const idx = (ramp: string[], c: string | null) => (c === null ? -1 : ramp.indexOf(c));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const NAMES = [...new Set([...SNOW, ...BASALT, ...STONE, ...SKY, ...WATER, 'túnica noche', 'qi', 'qi sombra', 'ojo'])];
const COLORS = Object.fromEntries(NAMES.map((n, i) => [n, `#${(30 + i * 4).toString(16).padStart(2, '0')}${(60 + i * 3).toString(16)}90`]));

describe('crag: top_colors', () => {
  const crag: MapStepOf<'crag'> = { step: 'crag', material: 'ceja', masses: [[6, 3, 28, 12, 22]], salt: 421, snow_cap: 0.2 };

  it('a map recolors its top and leaves its faces as they were', () => {
    const plain = paintMap(recipe([SNOWFIELD, crag]), game());
    const m = paintMap(recipe([SNOWFIELD, { ...crag, top_colors: { 'piedra clara': 'basalto claro', piedra: 'basalto' } }]), game());
    let changed = 0;
    for (let i = 0; i < m.kind.length; i++) {
      const a = plain.layers.ground.px[i], b = m.layers.ground.px[i];
      if (a === b) continue;
      changed++;
      expect([a, b]).toEqual(a === 'piedra clara' ? ['piedra clara', 'basalto claro'] : ['piedra', 'basalto']);
    }
    expect(changed).toBeGreaterThan(30);
    // the faces keep their piedra clara: only the top took the map
    expect(m.layers.ground.px.filter(c => c === 'piedra clara').length).toBeGreaterThan(10);
  });

  it('"ramp": the rock of the top is the ramp of the material, darker than the fixed stone, lit on the side of the sun', () => {
    const lit = (dir: [number, number]) => {
      const m = paintMap(recipe([SNOWFIELD, { ...crag, top_colors: 'ramp' }], { light: SUN(dir) }), game());
      const [cx] = P(m, 6, 3), west: number[] = [], east: number[] = [];
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        const i = idx(BASALT, at(m, x, y));
        if (kind(m, x, y) !== 'ceja' || i < 0 || at(m, x, y) === 'piedra sombra' || at(m, x, y) === 'piedra') continue;
        (x < cx - 4 ? west : x > cx + 4 ? east : []).push(i);
      }
      return { m, west: mean(west), east: mean(east), n: west.length + east.length };
    };
    const fromWest = lit([1, 0.4]), fromEast = lit([-1, 0.4]);
    expect(fromWest.n).toBeGreaterThan(80);
    expect(fromWest.west - fromWest.east).toBeGreaterThan(0.4);
    expect(fromEast.east - fromEast.west).toBeGreaterThan(0.4);
    // the old fixed tones of the top are gone from it: its rock is basalt (the faces keep their stone)
    const plain = paintMap(recipe([SNOWFIELD, crag], { light: SUN([1, 0.4]) }), game());
    let basalt = 0, wasStone = 0;
    for (let i = 0; i < plain.kind.length; i++) {
      if (BASALT.slice(0, 3).includes(fromWest.m.layers.ground.px[i] ?? '') || fromWest.m.layers.ground.px[i] === 'basalto claro') {
        basalt++;
        if (['piedra clara', 'piedra', 'nieve honda', 'nieve noche', 'piedra sombra'].includes(plain.layers.ground.px[i] ?? '')) wasStone++;
      }
    }
    expect(basalt).toBeGreaterThan(80);
    expect(wasStone / basalt).toBeGreaterThan(0.6);
  });
});

describe('drifts', () => {
  const sunny = (dir: [number, number], drift: Partial<MapStepOf<'drifts'>> = {}) => paintMap(recipe([SNOWFIELD,
    { step: 'drifts', material: 'nieve', on: ['nieve'], count: 0, at: [[6, 5, 34, 18, 7]], ...drift } as MapStep], { light: SUN(dir) }), game());

  it('a mound: lit on the side of the sun, in shade on the other, no outline, only on the snow', () => {
    const halves = (m: PaintedMap) => {
      const [cx, cy] = P(m, 6, 5), w: number[] = [], e: number[] = [];
      for (let y = cy - 14; y <= cy + 14; y++) for (let x = cx - 30; x <= cx + 30; x++) (x < cx - 3 ? w : x > cx + 3 ? e : []).push(idx(SNOW, at(m, x, y)));
      return [mean(w), mean(e)];
    };
    const [w1, e1] = halves(sunny([1, 0.3]));
    const [w2, e2] = halves(sunny([-1, 0.3]));
    // (the ramp place: 3 is the snow, 2 its shadow; a measurable side each way)
    expect(w1 - e1).toBeGreaterThan(0.25);
    expect(e2 - w2).toBeGreaterThan(0.25);
    const m = sunny([1, 0.3]);
    const used = new Set(m.layers.ground.px.filter(c => c !== null));
    for (const c of used) expect(SNOW, c).toContain(c);
    expect(used.has('nieve sombra')).toBe(true);
    expect(used.has('túnica luz')).toBe(true);
  });

  it('the wind: a mound is long upwind and short on the lee', () => {
    const flat = paintMap(recipe([SNOWFIELD], { light: SUN([0, 1]) }), game());
    const reach = (wind: [number, number]) => {
      // (base 1: every px of the mound is painted a tone off the snow, so its whole footprint shows)
      const m = sunny([0, 1], { wind, base: 1 }), [cx, cy] = P(m, 6, 5);
      let w = 0, e = 0;
      for (let y = cy - 18; y <= cy + 18; y++) for (let x = cx - 50; x <= cx + 50; x++) {
        if (at(m, x, y) === at(flat, x, y)) continue;
        if (x < cx) w = Math.max(w, cx - x); else e = Math.max(e, x - cx);
      }
      return w - e;
    };
    // (the crest a third of the way to the lee: the footprint reaches farther upwind, whichever way it blows)
    expect(reach([1, 0])).toBeGreaterThanOrEqual(2);
    expect(reach([-1, 0])).toBeLessThanOrEqual(-2);
    expect(reach([1, 0]) - reach([-1, 0])).toBeGreaterThanOrEqual(5);
  });

  it('banks: snow heaped against a rock (a thing with a foot) and against a material, not without asking', () => {
    const rocks: MapStep = { step: 'rocks', material: 'piedra', on: ['nieve'], at: [[6, 5, 9, 7, 31]] } as MapStep;
    const steps = (against?: object) => [SNOWFIELD, rocks, { step: 'drifts', material: 'nieve', on: ['nieve'], count: 0, ...(against ? { against } : {}) } as MapStep];
    const none = paintMap(recipe(steps(), { light: SUN([1, 0.5]) }), game());
    const bank = paintMap(recipe(steps({}), { light: SUN([1, 0.5]) }), game());
    const kinds = paintMap(recipe(steps({ kinds: ['piedra'], targets: ['nothing'] }), { light: SUN([1, 0.5]) }), game());
    const [cx, cy] = P(bank, 6, 5);
    const near = (m: PaintedMap) => {
      let n = 0;
      for (let y = cy - 16; y <= cy + 16; y++) for (let x = cx - 20; x <= cx + 20; x++) if (kind(m, x, y) === 'nieve' && at(m, x, y) !== at(none, x, y)) n++;
      return n;
    };
    expect(near(bank)).toBeGreaterThan(15);
    expect(near(kinds)).toBeGreaterThan(15);
    // nothing laid but the rock, so nothing changes far from it
    let far = 0;
    for (let y = 0; y < bank.height; y++) for (let x = 0; x < bank.width; x++) if (Math.abs(x - cx) > 30 && at(bank, x, y) !== at(none, x, y)) far++;
    expect(far).toBe(0);
  });
});

describe('brink: the flanks of a tall map (flank, strata, the sun)', () => {
  const tall = (w = 10, h = 26): MapGame => ({ width: w, height: h, grid: Array.from({ length: h }, () => '.'.repeat(w)), decor: [] });
  const LIP: [number, number][] = [[0.5, -4], [5, -4.4], [9.5, -4], [9.6, 4], [9.4, 12], [9.6, 20], [9.5, 30], [5, 30.4], [0.5, 30], [0.4, 20], [0.6, 12], [0.4, 4]];
  const paint = (brink: object, dir: [number, number] = [0.5, 1]) => paintMap({
    game: tall(), margin: [6, 2], light: { dir, length: 0.25, tone: 1, on: ['nieve'] }, shade: SHADE, materials: MATS,
    steps: [{ step: 'area', material: 'cielo', shape: 'all' }, SNOWFIELD,
      { step: 'brink', id: 'b', ring: true, face: 'granito', sea: 'cielo', lip: LIP, drop: [80, 0, 0], bushes: [0, 0], drape: [0, 0], view: [0.35, 0.85], ...brink } as MapStep],
  }, tall());
  const faceRun = (m: PaintedMap, y: number, west: boolean) => {
    let n = 0;
    for (let x = 0; x < m.width; x++) if (kind(m, x, y) === 'granito' && (west ? x < m.width / 2 : x > m.width / 2)) n++;
    return n;
  };

  it('flank: a west or east lip shows that many px of face, whatever the drop', () => {
    const y = paint({}).origin[1] + 12 * 16, lean = faceRun(paint({}), y, true);
    expect(lean).toBeLessThan(36);
    const wide = paint({ flank: 52 });
    expect(faceRun(wide, y, true)).toBeGreaterThan(lean + 15);
    expect(Math.abs(faceRun(wide, y, true) - 52)).toBeLessThan(8);
    expect(Math.abs(faceRun(wide, y, false) - 52)).toBeLessThan(8);
  });

  it('strata: the blocks of the flank break on shared levels (its ledges line up across the columns)', () => {
    const m = paint({ flank: 48, strata: [12, 0] }), loose = paint({ flank: 48 });
    const peak = (p: PaintedMap) => {
      const by = new Array(12).fill(0);
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width / 2; x++) {
        // a ledge: the dark tone with face below it of another block
        if (kind(p, x, y) === 'granito' && at(p, x, y) === 'túnica oscura' && kind(p, x, y + 1) === 'granito') by[y % 12]++;
      }
      return Math.max(...by) / Math.max(1, mean(by));
    };
    // (half the joints of a column are shut, so a level holds about half the ledges; with no strata they spread out)
    expect(peak(m)).toBeGreaterThan(1.6);
    expect(peak(loose)).toBeLessThan(1.3);
  });

  it('the sun: the flank toward it is the lit one, from the west or from the east', () => {
    const sideLum = (m: PaintedMap, west: boolean) => {
      const xs: number[] = [];
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        if (kind(m, x, y) === 'granito' && (west ? x < m.width / 2 : x > m.width / 2)) xs.push(idx(STONE, at(m, x, y)));
      }
      return mean(xs.filter(v => v >= 0));
    };
    const w = paint({ flank: 48 }, [0.5, 1]), e = paint({ flank: 48 }, [-0.5, 1]);
    expect(sideLum(w, true) - sideLum(w, false)).toBeGreaterThan(0.5);
    expect(sideLum(e, false) - sideLum(e, true)).toBeGreaterThan(0.5);
  });
});

describe('a crag laid by a place, wet stones in any water, gloom around an area, a rug under a stamp', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-ladera-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const write = (name: string, json: unknown) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(json)); return p; };

  it('place: a crag of a place (its masses, its cleft, its mouth) paints what the crag written inline there paints', () => {
    const cave: MapStepOf<'crag'> = { step: 'crag', material: 'ceja', masses: [[2, 1, 22, 9, 20]], salt: 77, cleft: [1, 1.5], mouth: { at: [2.5, 2.4], r: [5, 9] } };
    write('cueva.json', { size: [5, 4], steps: [cave] });
    const base = { game: game(), margin: [4, 1], shade: SHADE, materials: MATS, colors: COLORS };
    const inline = renderRecipe(write('inline.json', { ...base, steps: [SNOWFIELD, moveStep(cave, 4, 3)] }));
    const placed = renderRecipe(write('placed.json', { ...base, steps: [SNOWFIELD, { step: 'place', recipe: 'cueva.json', at: [4, 3] }] }));
    expect(placed.map.layers.ground.px).toEqual(inline.map.layers.ground.px);
    expect(placed.map.kind.filter(k => k === 'ceja').length).toBeGreaterThan(200);
    expect((moveStep(cave, 4, 3) as MapStepOf<'crag'>).mouth!.at).toEqual([6.5, 5.4]);
  });

  it('wetstones: with no glen, by the water of a curve (its id or its material), foam upstream and a wake down the flow', () => {
    const stream: MapStep = { step: 'water', id: 'arroyo', material: 'agua', shape: { curve: [[6, -1], [6, 5], [6, 11]], width: [24, 0], salt: 3 } } as MapStep;
    const stones = (water: string[], flow?: [number, number]) => ({ step: 'wetstones', material: 'piedra', stones: [{ at: [6, 5], r: [4, 3], salt: 9, moss: false }], water, ...(flow ? { flow } : {}) }) as MapStep;
    const plain = paintMap(recipe([SNOWFIELD, stream]), game());
    const byId = paintMap(recipe([SNOWFIELD, stream, stones(['arroyo'], [0, 1])]), game());
    const byKind = paintMap(recipe([SNOWFIELD, stream, stones(['agua'], [0, 1])]), game());
    expect(byKind.layers.ground.px).toEqual(byId.layers.ground.px);
    const [cx, cy] = P(byId, 6, 5);
    let above = 0, below = 0;
    for (let y = cy - 8; y <= cy + 12; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      if (at(byId, x, y) === at(plain, x, y) || kind(byId, x, y) === 'piedra') continue;
      if (at(byId, x, y) === 'ojo' && y < cy) above++;
      if (at(byId, x, y) === 'celeste luz' && y > cy) below++;
    }
    expect(above).toBeGreaterThan(2);
    expect(below).toBeGreaterThan(2);
    expect(() => paintMap(recipe([SNOWFIELD, stream, stones(['lava'])]), game())).toThrow(/neither a mask nor a material/);
  });

  it('gloom: around an area, with no cavern (inside it nothing changes, far from it all is dark)', () => {
    const shade = { ...SHADE, nieve: 'nieve sombra', 'nieve noche': 'tinta' };
    const steps = (gloom: object): MapStep[] => [SNOWFIELD, { step: 'area', id: 'sala', material: 'nieve', shape: { rect: [3, 3, 4, 3] } } as MapStep, { step: 'gloom', clear: [], ...gloom } as MapStep];
    const m = paintMap(recipe(steps({ area: 'sala' }), { shade }), game());
    const flat = paintMap(recipe(steps({ area: 'sala' }).slice(0, 2), { shade }), game());
    const [x0, y0] = P(m, 3, 3);
    for (let y = y0; y < y0 + 48; y++) for (let x = x0; x < x0 + 64; x++) expect(at(m, x, y)).toBe(at(flat, x, y));
    // inside the map, four cells from the area: all dark (past the map alone would leave it)
    const [fx, fy] = P(m, 11.5, 9.5);
    expect(at(m, fx, fy)).toBe('tinta');
    // no area, no cavern: past the map, as a cavern's gloom does
    const edge = paintMap(recipe(steps({}), { shade }), game());
    expect(at(edge, 0, 0)).not.toBe(at(flat, 0, 0));
  });

  it('furnish rug: a stamp laid before it on the floor stays on top', () => {
    const decor = [{ sprite: 'mesa_x', at: [4, 4] as [number, number], size: [2, 1] as [number, number] }];
    const g = { ...game(), decor };
    const stamp: MapStep = { step: 'scatter', what: 'stamp', at: [[5, 4.6]], rows: ['AAAA', 'AAAA', 'AAAA'], glyphs: { A: 'tinta' } } as MapStep;
    const rug: MapStep = { step: 'furnish', what: 'rug', on: ['nieve'] } as MapStep;
    const under = paintMap(recipe([SNOWFIELD, stamp, rug], { game: g }), g);
    const over = paintMap(recipe([SNOWFIELD, rug], { game: g }), g);
    const [sx, sy] = P(under, 5, 4.6);
    let ink = 0, rugged = 0;
    for (let y = sy - 4; y < sy + 4; y++) for (let x = sx - 4; x < sx + 6; x++) { if (at(under, x, y) === 'tinta') ink++; if (at(over, x, y) !== 'tinta') rugged++; }
    expect(ink).toBe(12);
    expect(rugged).toBeGreaterThan(40);
  });
});
