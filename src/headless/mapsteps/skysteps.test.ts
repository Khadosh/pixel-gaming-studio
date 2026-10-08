// @vitest-environment node
// The sky around an island (cloudscape, mapsteps/sky.ts) and what came with it
// to the ring of a brink: upright basalt strips, a drop that swells, grass on the
// ledges and hanging off the sides, falls off a side, cumulus at the foot.
// Born for the fourth round of the island of the sect of The Unwritten Dao.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe } from '../maprecipe';
import { cumulus, type Tones4 } from './sky';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];
const SKY = ['celeste oscuro', 'celeste', 'celeste luz', 'nube honda', 'nube panza', 'nube media', 'nube'];
const CLOUD: Tones4 = ['nube', 'nube media', 'nube panza', 'nube honda'];

function game(): MapGame {
  return { width: 12, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(12)), decor: [] };
}
const LOOP: [number, number][] = [[1, 1.2], [6, 0.8], [11, 1.3], [11.4, 4], [10.8, 7], [6, 6.6], [1.2, 7.1], [0.6, 4]];
function recipe(steps: MapRecipe['steps']): MapRecipe {
  return {
    game: game(), margin: [5, 5], light: [1, 1],
    materials: {
      grass: { ramp: ['hoja sombra', 'hoja', 'bambú', 'bambú claro', 'pasto'], base: 2 },
      rock: { ramp: STONE, moss: MOSS },
      sky: { ramp: SKY },
      water: { ramp: ['celeste oscuro', 'celeste', 'celeste luz', 'ojo', 'túnica luz'] },
    },
    steps,
  };
}
type Step = MapRecipe['steps'][number];
const island = (brink: object = {}, sky: object = {}): MapRecipe['steps'] => {
  const s = { step: 'cloudscape', material: 'sky', ...sky } as Step;
  return [
    s,
    { step: 'area', material: 'grass', shape: 'all' },
    { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'sky', lip: LOOP, ...brink } as Step,
    { ...s, within: 'b' } as Step,
  ];
};
const px = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];

describe('cumulus', () => {
  it('lit crest on top, cold belly below, all four tones, a big one much bigger than a small one', () => {
    const W = 200, H = 120;
    const paint = (r: number) => {
      const out = new Map<number, string>();
      cumulus(W, H, 100, 70, r, 77, CLOUD, (x, y, c) => out.set(y * W + x, c));
      return out;
    };
    const big = paint(30), small = paint(6);
    expect(big.size).toBeGreaterThan(small.size * 12);
    expect(new Set(big.values()).size).toBe(4);
    // the upper third is mostly crest and mid, the lower third mostly belly
    const rows = [...big.keys()].map(k => Math.floor(k / W));
    const y0 = Math.min(...rows), y1 = Math.max(...rows), third = (y1 - y0) / 3;
    const share = (from: number, to: number, tones: string[]) => {
      let n = 0, t = 0;
      for (const [k, c] of big) { const y = Math.floor(k / W); if (y >= from && y < to) { n++; if (tones.includes(c)) t++; } }
      return t / n;
    };
    expect(share(y0, y0 + third, [CLOUD[0], CLOUD[1]])).toBeGreaterThan(0.6);
    expect(share(y1 - third, y1 + 1, [CLOUD[2], CLOUD[3]])).toBeGreaterThan(0.5);
  });
});

describe('cloudscape', () => {
  it('masses of many sizes on the drifting layer, never cut by the island: one that would touch it stays on the ground, behind', () => {
    const m = paintMap(recipe(island({}, { masses: { count: 60, size: [4, 40] }, drift: { layer: 'nubes', px: 4 } })), game());
    const W = m.width, l = m.layers.nubes.px;
    let on = 0;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === null) continue;
      on++;
      for (const d of [-4, 4]) expect(m.kind[i + d]).toBe('sky');
    }
    expect(on).toBeGreaterThan(W * 10);
    // clouds on the ground too (the ones by the island), and the island untouched by them
    expect(m.layers.ground.px.filter(c => c === 'nube').length).toBeGreaterThan(50);
    const [ox, oy] = m.origin;
    expect(m.kind[(oy + 4 * 16) * W + ox + 6 * 16]).toBe('grass');
  });

  it('planes: far peaks in their pale tones, near pillars in theirs with green on top; the sky has its two tones', () => {
    const m = paintMap(recipe([{
      step: 'cloudscape', material: 'sky', planes: [
        { shape: 'peak', tones: ['nieve', 'nieve sombra', 'nieve honda', 'nieve noche'], at: [[3, 9, 20, 60]], feet: 0 },
        { tones: ['piedra clara', 'piedra', 'piedra sombra', 'tinta'], cap: ['bambú claro', 'bambú', 'hoja'], at: [[10, 9, 8, 70]], feet: 0 },
      ],
    } as Step]), game());
    const used = new Set(m.layers.ground.px);
    for (const c of ['nieve', 'nieve sombra', 'piedra clara', 'piedra', 'tinta', 'bambú claro', 'bambú', 'celeste oscuro', 'celeste']) expect(used.has(c), c).toBe(true);
    // the pillar is lit on its left: left of its middle more light than right of it
    const [ox, oy] = m.origin, cx = ox + 10 * 16, y = oy + 9 * 16 - 20;
    let lit = 0;
    for (let x = cx - 8; x < cx; x++) if (px(m, x, y) === 'piedra clara') lit++;
    for (let x = cx + 1; x < cx + 9; x++) if (px(m, x, y) === 'piedra clara') lit--;
    expect(lit).toBeGreaterThan(0);
  });
});

describe('the ring of a brink, round four', () => {
  it('strips: the cracks of the face run straight down; ledges wear grass; swell makes the face taller in places', () => {
    const plain = paintMap(recipe(island()), game());
    const m = paintMap(recipe(island({ strips: true, slabs: [8, 30], jitter: 0.9, ledges: 1, swell: [14, 40, 7] })), game());
    const W = m.width;
    // a crack px (ink or line) with another right under it: far more often with strips
    const vertical = (p: PaintedMap) => {
      let n = 0, v = 0;
      for (let i = 0; i < p.kind.length - W; i++) {
        if (p.kind[i] !== 'rock' || !['tinta', 'túnica noche'].includes(p.layers.ground.px[i]!)) continue;
        n++;
        if (p.layers.ground.px[i + W] === p.layers.ground.px[i]) v++;
      }
      return v / n;
    };
    expect(vertical(m)).toBeGreaterThan(vertical(plain));
    // grass on the face well below the lip: the ledges
    const grassDeep = (p: PaintedMap) => {
      let n = 0;
      for (let x = 0; x < W; x++) {
        let lip = -1;
        for (let y = 0; y < p.height; y++) {
          const k = p.kind[y * W + x];
          if (k === 'grass') lip = y;
          else if (k === 'rock' && lip >= 0 && y > lip + 24 && MOSS.includes(p.layers.ground.px[y * W + x]!)) n++;
        }
      }
      return n;
    };
    expect(grassDeep(m)).toBeGreaterThan(grassDeep(plain) + 20);
    // the face measured down each column: with swell its height spreads more
    const spread = (p: PaintedMap) => {
      const hs: number[] = [];
      for (let x = p.origin[0] + 16; x < p.origin[0] + 10 * 16; x++) {
        let h = 0;
        for (let y = p.origin[1] + 6 * 16; y < p.height; y++) if (p.kind[y * W + x] === 'rock') h++;
        hs.push(h);
      }
      return Math.max(...hs) - Math.min(...hs);
    };
    expect(spread(m)).toBeGreaterThan(spread(plain));
  });

  it('tufts: cushions of green sit on the ledges of the strips, never floating in the middle of a block', () => {
    const base = { strips: true, slabs: [8, 24], jitter: 0.9 };
    const plain = paintMap(recipe(island(base)), game());
    const m = paintMap(recipe(island({ ...base, tufts: [1, 8] })), game());
    const W = m.width;
    const added = new Set<number>();
    for (let i = 0; i < m.kind.length; i++) {
      if (m.kind[i] === 'rock' && m.layers.ground.px[i] !== plain.layers.ground.px[i] && MOSS.includes(m.layers.ground.px[i]!)) added.add(i);
    }
    expect(added.size).toBeGreaterThan(30);
    // each cushion (a patch of new green) is cut to the ledge: about as tall as the ledge band, never a ball (one of that radius is 16 px or more)
    const seen = new Set<number>(), heights: number[] = [];
    for (const i of added) {
      if (seen.has(i)) continue;
      const stack = [i];
      let y0 = Infinity, y1 = -1;
      seen.add(i);
      while (stack.length) {
        const k = stack.pop()!, y = Math.floor(k / W);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const d of [1, -1, W, -W]) if (added.has(k + d) && !seen.has(k + d)) { seen.add(k + d); stack.push(k + d); }
      }
      heights.push(y1 - y0 + 1);
    }
    expect(Math.max(...heights)).toBeLessThan(16);
    expect(heights.reduce((a, b) => a + b, 0) / heights.length).toBeLessThanOrEqual(8);
  });

  it('fringe hangs grass off the sides; shade lights the east side; billows swallow the foot in cumulus', () => {
    const plain = paintMap(recipe(island()), game());
    const m = paintMap(recipe(island({ fringe: [1, 6], shade: 0.2, billows: [16, 10, 0] })), game());
    const W = m.width, [ox, oy] = m.origin, y = oy + 4 * 16;
    // west of the island at mid height: green on the rock right by the lip
    let green = 0;
    for (let x = 0; x < ox + 2 * 16; x++) if (m.kind[y * W + x] === 'rock' && MOSS.includes(px(m, x, y)!)) green++;
    expect(green).toBeGreaterThan(0);
    // the east side: lighter tones than without shade
    const light = (p: PaintedMap) => {
      let n = 0;
      for (let yy = oy + 2 * 16; yy < oy + 6 * 16; yy++) for (let x = ox + 11 * 16; x < W; x++) {
        if (p.kind[yy * W + x] === 'rock' && ['piedra', 'niebla sombra', 'piedra clara'].includes(p.layers.ground.px[yy * W + x]!)) n++;
      }
      return n;
    };
    expect(light(m)).toBeGreaterThan(light(plain));
    // under the island: the four cloud tones of cumulus (the flat banks have no deep belly)
    const used = new Set<string>();
    for (let i = (oy + 7 * 16) * W; i < m.kind.length; i++) if (m.kind[i] === 'sky') used.add(m.layers.ground.px[i]!);
    for (const c of ['nube', 'nube media', 'nube panza', 'nube honda']) expect(used.has(c), c).toBe(true);
  });

  it('a fall off a side pours from the edge on its row, down over the side and the sky, never over the island', () => {
    const m = paintMap(recipe([
      ...island({ water: 'water', flow: 'falls', falls: [[2, 2, 4, 40]] }),
    ]), game());
    const W = m.width, [ox, oy] = m.origin;
    let water = 0, low = 0;
    for (let i = 0; i < m.kind.length; i++) {
      if (m.kind[i] !== 'water') continue;
      water++;
      const x = i % W, y = Math.floor(i / W);
      expect(x).toBeLessThan(ox + 2 * 16);         // out to the west edge, not where (2, 4) is
      if (y > oy + 4 * 16 + 20) low++;
    }
    expect(water).toBeGreaterThan(40);
    expect(low).toBeGreaterThan(0);
    expect(m.layers.falls.px.some(c => c !== null)).toBe(true);
  });
});
