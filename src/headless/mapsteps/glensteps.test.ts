// @vitest-environment node
// The map steps that came with the glen upriver of The Unwritten Dao (a mossy
// clearing at the foot of a waterfall): the recipe against the script's PNGs,
// and what each piece does.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { Ctx, paintMap, type PaintedMap } from '../mappaint';
import { gameGrid, outputLayer, readRecipe, renderRecipe, type RenderedRecipe } from '../mapfile';
import type { MapGame, MapRecipe } from '../maprecipe';
import { readPng } from '../png';
import { lineY, runLines } from './riverbank';

const FIX = join(__dirname, '../fixtures/mapas');
const LAYERS: [string, string][] = [['ground', ''], ['mechones', '_mechones'], ['brillos', '_brillos'], ['corriente', '_corriente'], ['rio', '_rio'], ['copas', '_copas'], ['grullas', '_grullas']];

let cached: RenderedRecipe | null = null;
const rendered = () => (cached ??= renderRecipe(join(FIX, 'rio_arriba.receta.json')));
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const count = (m: PaintedMap, layer: string, pred: (c: string, x: number, y: number) => boolean = () => true) => {
  let n = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const c = at(m, layer, x, y); if (c !== null && pred(c, x, y)) n++; }
  return n;
};
const GAME = gameGrid(join(FIX, 'rio_arriba.json'), join(FIX, 'rio_arriba_visuals.json'));
/** The same recipe with its steps cut after the first `n`. */
function upTo(n: number): PaintedMap {
  const rec = readRecipe(join(FIX, 'rio_arriba.receta.json'));
  return paintMap({ ...rec, game: GAME, steps: rec.steps.slice(0, n) }, GAME);
}
const stepIndex = (name: string) => rendered().recipe.steps.findIndex(s => s.step === name);

describe('the glen upriver against its script', () => {
  it('every layer is the same as the script painted, pixel for pixel', () => {
    const r = rendered();
    for (const [layer, suffix] of LAYERS) {
      const ref = readPng(join(FIX, `rio_arriba_script${suffix}.png`)), l = outputLayer(r, layer);
      expect([l.w, l.h], layer).toEqual([ref.width, ref.height]);
      let d = 0;
      for (let i = 0; i < l.w * l.h; i++) {
        const c = l.px[i], a = ref.data[i * 4 + 3];
        const hex = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
        if ((c === null) !== (a === 0) || (c !== null && r.colors[c] !== hex)) d++;
      }
      expect(d, layer).toBe(0);
    }
  });
});

describe('lines: sines and slope', () => {
  it('a sine ripples the line and a slope takes it down right of its column', () => {
    const game: MapGame = { width: 10, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(10)) };
    const ctx = new Ctx({ game, margin: [0, 0], materials: {}, steps: [] } as MapRecipe, game);
    runLines(ctx, { step: 'lines', lines: { flat: { at: 5, waves: [] }, wavy: { at: 5, waves: [], sines: [[2, 4, 0]] }, down: { at: 5, waves: [], slope: [4, 0.5] } } });
    const flat = lineY(ctx, 'flat'), wavy = lineY(ctx, 'wavy'), down = lineY(ctx, 'down');
    expect(flat(30)).toBe(80);
    expect(wavy(4 * Math.PI / 2)).toBeCloseTo(82, 9);
    expect(down(64)).toBe(80);
    expect(down(84)).toBe(90);
  });
});

describe('the glen steps', () => {
  it('glen lays out masks only: nothing is painted, and earth, sand and ledge never touch the water', () => {
    const m = upTo(stepIndex('glen') + 1);
    expect(count(m, 'ground')).toBe(0);
  });

  it('cushions paint the deep green only near the water', () => {
    const before = upTo(stepIndex('cushions')), after = upTo(stepIndex('cushions') + 1);
    let changed = 0, far = 0;
    for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) {
      if (at(before, 'ground', x, y) === at(after, 'ground', x, y)) continue;
      changed++;
      expect(['vida sombra', 'hoja']).toContain(at(after, 'ground', x, y));
      if (y < 40) far++;
    }
    expect(changed).toBeGreaterThan(500);
    expect(far).toBe(0);
  });

  it('mudtrail paints the earth in its tones, the lip of the moss lit beside it', () => {
    const m = upTo(stepIndex('mudtrail') + 1);
    const earth = m.kind.filter(k => k === 'tierra').length;
    expect(earth).toBeGreaterThan(3000);
    const tones = new Set<string>();
    for (let i = 0; i < m.kind.length; i++) if (m.kind[i] === 'tierra') tones.add(m.layers.ground.px[i]!);
    expect([...tones].every(c => ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'bambú', 'hoja'].includes(c))).toBe(true);
    expect(count(m, 'ground', (c, x, y) => c === 'hoja clara' && kind(m, x, y) === 'musgo' && kind(m, x, y - 1) === 'tierra')).toBeGreaterThan(50);
  });

  it('plunge: a high bank shows two px of face over the water, the beach is licked by foam', () => {
    const m = upTo(stepIndex('plunge') + 1);
    let faces = 0, licks = 0;
    for (let y = 1; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (kind(m, x, y) !== 'agua') continue;
      if (['tierra', 'musgo'].includes(kind(m, x, y - 1)) && at(m, 'ground', x, y) === 'tierra sombra' && at(m, 'ground', x, y + 1) === 'madera sombra') faces++;
      if (kind(m, x, y - 1) === 'grava' && at(m, 'ground', x, y) === 'celeste luz') licks++;
    }
    expect(faces).toBeGreaterThan(10);
    expect(licks).toBeGreaterThan(100);
  });

  it('wetstones are stone in the water with foam on their left', () => {
    const m = upTo(stepIndex('wetstones') + 1);
    expect(m.kind.filter(k => k === 'roca').length).toBeGreaterThan(200);
    expect(count(m, 'ground', (c, x, y) => c === 'ojo' && kind(m, x + 1, y) === 'roca')).toBeGreaterThan(10);
  });

  it('wetwood fills both sides past the edge, never the earth, and closes above the map', () => {
    const m = upTo(stepIndex('wetwood') + 1);
    expect(kind(m, 5, 60)).toBe('bosque');
    expect(kind(m, m.width - 5, 60)).toBe('bosque');
    expect(at(m, 'ground', 300, 2)).toBe('túnica noche');
  });

  it('glenshade only darkens: every changed px is one or two steps down the shade table', () => {
    const i = stepIndex('glenshade'), before = upTo(i), after = upTo(i + 1), shade = rendered().recipe.shade!;
    let n = 0;
    for (let k = 0; k < after.kind.length; k++) {
      const a = before.layers.ground.px[k]!, b = after.layers.ground.px[k]!;
      if (a === b) continue;
      n++;
      expect([shade[a], shade[shade[a]]]).toContain(b);
    }
    expect(n).toBeGreaterThan(500);
  });

  it('glenlitter puts the tips of the tufts on their own layer, over the moss', () => {
    const m = upTo(stepIndex('glenlitter') + 1);
    expect(count(m, 'mechones')).toBeGreaterThan(200);
    expect(count(m, 'mechones', (_, x, y) => kind(m, x, y) !== 'musgo')).toBe(0);
  });

  it('glenflow: glints only on the water, the streaks of the stream and the river on their layers', () => {
    const m = rendered().map;
    expect(count(m, 'brillos')).toBeGreaterThan(50);
    expect(count(m, 'brillos', (_, x, y) => kind(m, x, y) !== 'agua')).toBe(0);
    expect(count(m, 'corriente')).toBeGreaterThan(10);
    expect(count(m, 'rio')).toBeGreaterThan(50);
  });

  it('boughs reach in from both sides on the front layer, with moss hanging', () => {
    const m = rendered().map, mid = m.width / 2;
    expect(count(m, 'copas', (_, x) => x < mid)).toBeGreaterThan(50);
    expect(count(m, 'copas', (_, x) => x > mid)).toBeGreaterThan(50);
    expect(count(m, 'copas', c => c === 'bambú')).toBeGreaterThan(5);
  });
});
