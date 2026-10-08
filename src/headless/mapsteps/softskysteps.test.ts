// @vitest-environment node
// What the clouds and the water are made of (round seven of the island of the
// sect of The Unwritten Dao): soft masses whose belly melts into the sky,
// torn veils lying between them, a band of haze on the horizon, and falls that
// pour out of a broken cleft in threads and dissolve into the clouds below.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';
import { cumulus, type Tones4 } from './sky';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
const CLOUD: Tones4 = ['nube', 'nube media', 'nube panza', 'nube honda'];
const WATER = ['celeste oscuro', 'celeste', 'cielo', 'celeste luz', 'ojo'];

function game(): MapGame {
  return { width: 12, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(12)), decor: [] };
}
const LOOP: [number, number][] = [[1, 1.2], [6, 0.8], [11, 1.3], [11.4, 4], [10.8, 7], [6, 6.6], [1.2, 7.1], [0.6, 4]];
type Step = MapRecipe['steps'][number];
function recipe(steps: Step[]): MapRecipe {
  return {
    game: game(), margin: [5, 5], light: [1, 1],
    materials: {
      grass: { ramp: ['hoja sombra', 'hoja', 'bambú', 'bambú claro', 'pasto'], base: 2 },
      rock: { ramp: STONE },
      sky: { ramp: SKY },
      water: { ramp: WATER },
    },
    steps,
  };
}
const sky = (extra: object): Step => ({ step: 'cloudscape', material: 'sky', haze: [200, 4001, -1], ...extra } as Step);

describe('cumulus, soft', () => {
  const W = 200, H = 120;
  const paint = (edge: object) => {
    const out = new Map<number, string>();
    cumulus(W, H, 100, 70, 26, 77, CLOUD, (x, y, c) => out.set(y * W + x, c), 0, edge);
    return out;
  };

  it('the rim goes only outside the body, next to its shade, never against the crest, and only where free', () => {
    const hard = paint({}), soft = paint({ rim: ['cielo claro', 'cielo'] });
    const rim = [...soft].filter(([i]) => !hard.has(i));
    expect(rim.length).toBeGreaterThan(40);
    for (const [, c] of rim) expect(['cielo claro', 'cielo']).toContain(c);
    for (const [i] of hard) expect(soft.get(i)).toBe(hard.get(i));      // the body is the same
    // a rim px of the near tone touches a belly px, never only crest
    for (const [i, c] of rim) {
      if (c !== 'cielo claro') continue;
      const around = [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1].map(d => hard.get(i + d)).filter(Boolean);
      expect(around.some(t => t === CLOUD[2] || t === CLOUD[3]), `${i}`).toBe(true);
    }
    // the bottom of the mass has more rim than its top (a crisp crest, a soft belly)
    const ys = [...hard.keys()].map(k => Math.floor(k / W)), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const low = rim.filter(([i]) => Math.floor(i / W) > mid).length;
    expect(low).toBeGreaterThan(rim.length - low);
    // nothing where not free
    const none = paint({ rim: ['cielo claro', 'cielo'], free: () => false });
    expect(none.size).toBe(hard.size);
  });

  it('bright puts more of the mass in the light; fewer lumps make a smoother crest', () => {
    const share = (m: Map<number, string>) => [...m.values()].filter(c => c === CLOUD[0] || c === CLOUD[1]).length / m.size;
    expect(share(paint({ bright: 0.2, smooth: 5 }))).toBeGreaterThan(share(paint({})) + 0.1);
    // the top outline: how often the topmost px of a column jumps by more than one from the column before
    const jumps = (m: Map<number, string>) => {
      const top = new Map<number, number>();
      for (const k of m.keys()) { const x = k % W, y = Math.floor(k / W); top.set(x, Math.min(top.get(x) ?? 1e9, y)); }
      let n = 0;
      for (const [x, y] of top) if (top.has(x - 1) && Math.abs(top.get(x - 1)! - y) > 1) n++;
      return n;
    };
    expect(jumps(paint({ lumps: 0.3 }))).toBeLessThanOrEqual(jumps(paint({})));
  });
});

describe('cloudscape, soft', () => {
  it('horizon: a band of haze across the picture where the plain sky is one tone, solid in its middle', () => {
    const m = paintMap(recipe([sky({ horizon: [10, 50] })]), game());
    const W = m.width, g = m.layers.ground.px;
    const row = (y: number) => g.slice(y * W, (y + 1) * W);
    // the middle of the band: mostly veil (not the plain sky), with its solid lightest tone
    const midRow = row(30);
    expect(midRow.filter(c => c !== 'celeste').length / W).toBeGreaterThan(0.8);
    expect(midRow.includes('nube media')).toBe(true);
    // far from it: the plain sky only
    expect(new Set(row(m.height - 5))).toEqual(new Set(['celeste']));
  });

  it('streaks: veils of several rows, only over open sky, never over a mass', () => {
    const plain = paintMap(recipe([sky({ masses: { count: 20, size: [6, 20] } })]), game());
    const m = paintMap(recipe([sky({ masses: { count: 20, size: [6, 20] }, wisps: { count: 40, rows: [3, 3], length: [30, 50] } })]), game());
    const W = m.width, a = plain.layers.ground.px, b = m.layers.ground.px;
    const added: number[] = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { added.push(i); expect(a[i], `${i}`).toBe('celeste'); }
    expect(added.length).toBeGreaterThan(200);
    // more than one row: a streak px with another right under or over it
    const set = new Set(added);
    expect(added.filter(i => set.has(i + W) || set.has(i - W)).length).toBeGreaterThan(added.length * 0.3);
  });
});

describe('brink pour', () => {
  const island = (brink: object): Step[] => [
    sky({}),
    { step: 'area', material: 'grass', shape: 'all' } as Step,
    { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'sky', lip: LOOP, water: 'water', flow: 'falls', spring: 3, ...brink } as Step,
  ];
  const fall = (m: PaintedMap) => {
    const W = m.width, cols = new Map<number, number[]>();
    for (let i = 0; i < m.kind.length; i++) if (m.kind[i] === 'water') {
      const x = i % W, y = Math.floor(i / W);
      cols.set(x, [...(cols.get(x) ?? []), y]);
    }
    return cols;
  };

  it('a ragged head out of a cleft, threads running down, spray of cloud at the end', () => {
    const strip = paintMap(recipe(island({ falls: [[6, 6]] })), game());
    const m = paintMap(recipe(island({ falls: [[6, 6]], pour: [0.3, 14] })), game());
    const W = m.width, cols = fall(m);
    expect(cols.size).toBeGreaterThan(8);
    // the head: across the middle half of the fall the first water row is not one straight line (it is in the strip)
    const heads = (c: Map<number, number[]>) => {
      const xs = [...c.keys()].sort((a, b) => a - b), q = Math.trunc(xs.length / 4);
      return new Set(xs.slice(q, xs.length - q).map(x => Math.min(...c.get(x)!))).size;
    };
    expect(heads(fall(strip))).toBe(1);
    expect(heads(cols)).toBeGreaterThan(1);
    // threads: a water px keeps the tone of the one above more often than in the plain strip
    const keep = (p: PaintedMap) => {
      let n = 0, same = 0;
      for (let i = W; i < p.kind.length; i++) {
        if (p.kind[i] !== 'water' || p.kind[i - W] !== 'water' || !WATER.includes(p.layers.ground.px[i]!)) continue;
        n++;
        if (p.layers.ground.px[i] === p.layers.ground.px[i - W]) same++;
      }
      return same / n;
    };
    expect(keep(m)).toBeGreaterThan(keep(strip));
    // the end of a long fall off a side: cloud tones painted as part of the fall (its kind is the water's), none in the strip
    const spray = (p: PaintedMap) => {
      const c = fall(p);
      return [...c].flatMap(([x, ys]) => ys.map(y => p.layers.ground.px[y * W + x])).filter(t => (CLOUD as string[]).includes(t!)).length;
    };
    expect(spray(paintMap(recipe(island({ falls: [[2, 4, 4, 60]], pour: [0.3, 20] })), game()))).toBeGreaterThan(20);
    expect(spray(paintMap(recipe(island({ falls: [[2, 4, 4, 60]] })), game()))).toBe(0);
  });
});
