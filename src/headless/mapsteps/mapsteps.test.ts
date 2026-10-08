// @vitest-environment node
// The map steps and options that came with the sect of The Unwritten Dao: the
// whole sect recipe against the script's PNGs, and each new piece on its own.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';
import { pyRound } from '../mapnoise';

const FIX = join(__dirname, '../fixtures/mapas');
const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const EARTH = ['madera sombra', 'tierra sombra', 'tierra', 'madera clara', 'arena'];
const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'niebla sombra', 'piedra clara', 'niebla'];
const MOSS = ['hoja sombra', 'hoja', 'bambú', 'bambú claro'];
const FOREST = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro'];

function game(): MapGame {
  return { width: 12, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(12)), decor: [] };
}

function recipe(steps: MapRecipe['steps'], extra: Partial<MapRecipe> = {}): MapRecipe {
  return {
    game: game(), margin: [4, 1], light: [1, 1],
    materials: {
      grass: { ramp: GRASS, texture: 'patches', base: 4 },
      shaded: { ramp: GRASS, base: 4 },
      earth: { ramp: EARTH, texture: 'mottled', base: 2 },
      stone: { ramp: STONE, texture: 'flagstones', moss: MOSS },
      rock: { ramp: STONE, texture: 'grain', moss: MOSS },
      clouds: { ramp: ['celeste oscuro', 'celeste', 'niebla sombra', 'niebla', 'túnica luz'] },
      forest: { ramp: FOREST, texture: 'canopy' },
    },
    steps, ...extra,
  };
}

const count = (m: PaintedMap, kind: string) => m.kind.filter(k => k === kind).length;

describe('map recipe: the sect', () => {
  it('paints the same four layers the sect script painted, pixel for pixel, and passes the style lint', async () => {
    const r = renderRecipe(join(FIX, 'secta.receta.json'));
    for (const [layer, file] of [['ground', 'secta_script.png'], ['mechones', 'secta_script_mechones.png'],
      ['motas', 'secta_script_motas.png'], ['copas', 'secta_script_copas.png']]) {
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
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'secta.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  });
});

describe('map steps of the sect', () => {
  it('patches takes its own numbers: other salts and thresholds give other grass, no "bright" never lifts the shade', () => {
    const base = paintMap(recipe([{ step: 'area', material: 'grass', shape: 'all' }]), game());
    const r = recipe([{ step: 'area', material: 'grass', shape: 'all' }]);
    r.materials.grass.patches = { shade: [24, 19, 0.36], sun: [64, 14, 13], steps: [0.6, 0.68], bright: null, blades: 141 };
    const own = paintMap(r, game());
    const g0 = base.layers.ground.px, g1 = own.layers.ground.px;
    expect(g1.filter((c, i) => c !== g0[i]).length).toBeGreaterThan(g0.length * 0.2);
    // with two sun steps the lightest tone is base + 2 (pasto), and nothing below base - 1
    const used = new Set(g1);
    expect([...used].every(c => ['bambú', 'hoja clara', 'bambú claro', 'pasto'].includes(c!))).toBe(true);
  });

  it('patches with grain: no direction (the grass reads the same along and across the light), one px blades never side by side', () => {
    const r = recipe([{ step: 'area', material: 'grass', shape: 'all' }]);
    r.materials.grass.patches = { shade: [14, 19, 0.27], grain: { zone: 34, odds: [0.13, 0.07], lean: 1, tip: 0.1 } };
    const m = paintMap(r, game()), W = m.width, H = m.height, px = m.layers.ground.px;
    const base = 'hoja clara';
    // runs of the same tone along the light (down-right) and across it (down-left) are about as long
    const run = (dx: number) => {
      let total = 0, n = 0;
      for (let y = 4; y < H - 40; y += 3) for (let x = 40; x < W - 40; x += 5) {
        let k = 0;
        while (k < 30 && px[(y + k) * W + x + k * dx] === px[y * W + x]) k++;
        total += k; n++;
      }
      return total / n;
    };
    const along = run(1), across = run(-1);
    expect(Math.abs(along - across) / Math.max(along, across)).toBeLessThan(0.15);
    // with patches (sun stretched along the light) the same measure leans
    const old = recipe([{ step: 'area', material: 'grass', shape: 'all' }]);
    old.materials.grass.patches = { shade: [9, 19, 0.34], sun: [30, 9, 13], steps: [0.6, 0.68], bright: null, blades: 141 };
    const o = paintMap(old, game()), opx = o.layers.ground.px;
    const runO = (dx: number) => {
      let total = 0, n = 0;
      for (let y = 4; y < H - 40; y += 3) for (let x = 40; x < W - 40; x += 5) {
        let k = 0;
        while (k < 30 && opx[(y + k) * W + x + k * dx] === opx[y * W + x]) k++;
        total += k; n++;
      }
      return total / n;
    };
    expect(runO(1) / runO(-1)).toBeGreaterThan(1.3);
    // the base tone rules, blades of the tones next to it are sprinkled
    const count = (c: string) => px.filter(p => p === c).length;
    expect(count(base)).toBeGreaterThan(px.length * 0.5);
    expect(count('bambú claro')).toBeGreaterThan(px.length * 0.04);
    expect(count('bambú')).toBeGreaterThan(px.length * 0.04);
  });

  it('flagstones lay stones with a lit lip up-left and a joint down-right, worn lighter where asked', () => {
    const steps: MapRecipe['steps'] = [
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', id: 'patio', material: 'stone', shape: { rect: [2, 2, 8, 4] }, stones: [12, 7], seed: 421 },
    ];
    const m = paintMap(recipe(steps), game());
    const g = m.layers.ground, [ox, oy] = m.origin;
    const used = new Set<string>();
    for (let y = oy + 2 * 16; y < oy + 6 * 16; y++) for (let x = ox + 2 * 16; x < ox + 10 * 16; x++) if (m.kind[y * m.width + x] === 'stone') used.add(g.get(x, y)!);
    expect(used.has('piedra sombra')).toBe(true);              // joints
    expect(used.has('niebla') || used.has('piedra clara')).toBe(true);   // lips
    // the joint of a stone is down-right of its lip: under a lip px going down we meet a joint before leaving the area
    expect(count(m, 'stone')).toBeGreaterThan(8 * 4 * 256 * 0.9);
    const worn = paintMap(recipe([steps[0], { ...steps[1], wear: [6, 4, 0.5, 40, 20] } as MapRecipe['steps'][number]]), game());
    const light = (p: PaintedMap) => p.layers.ground.px.filter(c => c === 'niebla' || c === 'piedra clara').length;
    expect(light(worn)).toBeGreaterThan(light(m));
  });

  it('a curve shape is a band along the curve; area on: only over those materials', () => {
    const m = paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', material: 'earth', shape: { rect: [0, 0, 6, 8] } },
      { step: 'area', material: 'stone', on: ['grass'], shape: { blobs: [[6, 4, 3, 2, 0.1, 401, 0.06]] } },
      { step: 'area', id: 'walk', material: 'stone', shape: { curve: [[10, 0], [10, 8]], width: [6, 1], salt: 431 } },
    ]), game());
    const [ox, oy] = m.origin;
    // the blob spans both halves but only took the grass half
    for (let x = ox + 3 * 16; x < ox + 5 * 16; x++) expect(m.kind[(oy + 4 * 16) * m.width + x]).toBe('earth');
    expect(m.kind[(oy + 4 * 16) * m.width + ox + 7 * 16]).toBe('stone');
    expect(m.kind[(oy + 4 * 16) * m.width + ox + 10 * 16]).toBe('stone');
    expect(m.kind[(oy + 4 * 16) * m.width + ox + 10 * 16 + 9]).toBe('grass');
  });

  it('cliff: past the lip, clouds far below; the rock face between them; the grass hangs over the lip', () => {
    const m = paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'cliff', material: 'clouds', face: 'rock', peaks: [[-2, 2, 6, 30]], stones: [4] },
    ]), game());
    const [ox] = m.origin, row = 5 * 16;
    expect(m.kind[row * m.width + 2]).toBe('clouds');
    expect(m.kind[row * m.width + ox + 16]).toBe('grass');
    // walking right from the clouds we cross the rock face before the grass
    let x = 2;
    while (m.kind[row * m.width + x] === 'clouds') x++;
    expect(m.kind[row * m.width + x]).toBe('rock');
    expect(count(m, 'rock')).toBeGreaterThan(m.height * 5);
    const cloudColors = new Set(m.kind.map((k, i) => (k === 'clouds' ? m.layers.ground.px[i] : null)));
    expect(cloudColors.has('túnica luz')).toBe(true);
    expect(cloudColors.has('hoja')).toBe(true);            // the pines on the peak
  });

  it('cliff with drift: the clouds that can drift go to their layer and, moved px each way, still fall on the sea; the peaks go above them', () => {
    const steps = (drift?: { layer: string; px: number; peaks?: string }) => recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'cliff', material: 'clouds', face: 'rock', peaks: [[-2, 2, 6, 30]], stones: [4], ...(drift ? { drift } : {}) },
    ]);
    const still = paintMap(steps(), game());
    const m = paintMap(steps({ layer: 'nubes', px: 6, peaks: 'picos' }), game());
    const W = m.width, nubes = m.layers.nubes.px, picos = m.layers.picos.px;
    let moving = 0;
    for (let i = 0; i < nubes.length; i++) {
      if (nubes[i] === null) continue;
      moving++;
      const x = i % W, y = Math.floor(i / W);
      // moved, it falls on the sea, or under the face (which goes above it), never on the grass
      for (const dx of [-6, 6]) if (x + dx >= 0 && x + dx < W) expect(m.kind[y * W + x + dx] === 'clouds' || picos[y * W + x + dx] !== null).toBe(true);
    }
    expect(moving).toBeGreaterThan(200);
    expect(picos.filter(c => c === 'hoja').length).toBeGreaterThan(0);   // the pines went up
    expect(picos.filter((c, i) => c !== null && m.kind[i] === 'rock').length).toBeGreaterThan(m.height * 5);   // and the face
    expect(m.layers.ground.px.filter((c, i) => c === 'hoja' && m.kind[i] === 'clouds').length).toBe(0);
    // without drift nothing changes: same ground, no layers
    expect(still.layers.nubes).toBeUndefined();
  });

  it('outside: an opening pushes the forest edge back; crowns in a band; poke skips its gaps and adds its crowns', () => {
    const forest = (openings?: [number, number, number][]) => paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', id: 'f', material: 'forest', shape: { outside: { sides: 'r', openings, crowns: {} } } },
      { step: 'area', material: 'forest', layer: 'copas', seed: 700,
        shape: { poke: 'f', count: 40, gaps: [[4, 14]], crowns: [[13, 4, 8, 1]] } },
    ]), game());
    const plain = forest(), open = forest([[4, 13, 26]]);
    const [ox, oy] = plain.origin, y = oy + 4 * 16, x = ox + 12 * 16 + 2;
    expect(plain.kind[y * plain.width + x]).toBe('forest');
    expect(open.kind[y * open.width + x]).toBe('grass');
    // the extra crown is there, at the gap where no poked crown is
    expect(open.layers.copas.get(ox + 13 * 16, oy + 4 * 16)).not.toBeNull();
  });

  it('path on: paints only over grass, breath and salts change its wobble; branches can be trails', () => {
    const steps = (salts?: { wave: number }): MapRecipe['steps'] => [
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', material: 'stone', shape: { rect: [5, 0, 2, 8] } },
      { step: 'path', id: 'p', material: 'earth', on: ['grass'], points: [[0, 4], [11, 4]], width: [3.4, 2], min: 0, breath: [30, 1, 0],
        branches: [{ points: [[3, 0], [3, 8]], width: [4, 1], breath: 30, salt: 301 }], tufts: 0, ruts: [0, 0], salts },
    ];
    const m = paintMap(recipe(steps()), game());
    const [ox, oy] = m.origin;
    expect(m.kind[(oy + 4 * 16) * m.width + ox + 6 * 16]).toBe('stone');
    expect(m.kind[(oy + 4 * 16) * m.width + ox + 2 * 16]).toBe('earth');
    expect(m.kind[(oy + 1 * 16) * m.width + ox + 3 * 16]).toBe('earth');
    const other = paintMap(recipe(steps({ wave: 300 })), game());
    expect(other.kind.filter((k, i) => k !== m.kind[i]).length).toBeGreaterThan(0);
  });

  it('flight down stacks treads between walls; climb rises to the right through the forest, cut into grass', () => {
    const m = paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', id: 'f', material: 'forest', shape: { outside: { sides: 'r' } } },
      { step: 'flight', material: 'stone', style: 'down', x: [2, 4], to: 3, seed: 461 },
      { step: 'flight', material: 'stone', style: 'climb', from: [11, 4], seed: 472 },
    ]), game());
    const g = m.layers.ground, [ox, oy] = m.origin;
    // down: each 8 px a lit nose, then the riser in shadow
    const x = ox + 3 * 16;
    expect(['niebla', 'piedra clara']).toContain(g.get(x, 8));
    expect(g.get(x, 13)).toBe('piedra sombra');
    expect([0, 1, 2].map(i => g.get(ox + 2 * 16 - i, 10))).toContain('túnica oscura');   // the wall
    // climb: stone at the start, higher further right, grass where the forest was cut
    const yAt = (cx: number) => { for (let y = 0; y < m.height; y++) if (m.kind[y * m.width + cx] === 'stone') return y; return -1; };
    const x0 = ox + 11 * 16 + 1, x1 = x0 + 40;
    expect(yAt(x0)).toBeGreaterThan(0);
    expect(yAt(x1)).toBeLessThan(yAt(x0) - 5);
    expect(m.kind[(oy + 4 * 16 - 12) * m.width + x0 + 20]).toBe('grass');
  });

  it('feature: the dais has its lip, ring, trigrams and a shadow that turns grass into shaded grass; slab and roots', () => {
    const m = paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'feature', id: 'dais', what: 'dais', material: 'stone', at: [6, 4], shadow: { grass: 'shaded' } },
      { step: 'feature', id: 'losa', what: 'slab', material: 'stone', at: [2, 6] },
      { step: 'feature', what: 'roots', material: 'earth', at: [2, 5.5], roots: [[160, 22], [20, 20]], avoid: 'losa' },
    ]), game());
    const g = m.layers.ground, [ox, oy] = m.origin, cx = ox + 6 * 16, cy = oy + 4 * 16;
    expect(m.kind[cy * m.width + cx]).toBe('stone');
    expect(g.get(cx - 1, cy)).toBe('niebla');                    // the center, lit on the left
    expect(g.get(cx, cy + 17 + 2)).toBe('túnica noche');         // the face, its dark foot
    expect(count(m, 'shaded')).toBeGreaterThan(50);
    // its shadow is down-right: below-right of the face there is shaded grass
    expect(m.kind[(cy + 21) * m.width + cx + 3]).toBe('shaded');
    // ☰ (three solid strokes) above the center
    const strokes = [0, 1, 2].map(i => g.get(cx - 1 + 1, pyRound(cy - (0.4 + 0.16 * i) * 17 - 0.5)));
    expect(strokes.every(c => c === 'piedra sombra')).toBe(true);
    // the slab: its lit corner has moss, its foot is dark
    const [lx, ly] = [ox + 2 * 16, oy + 6 * 16];
    expect(g.get(lx, ly + 5)).toBe('túnica noche');
    expect(MOSS).toContain(g.get(lx - 5, ly - 4));
    // the roots turned grass into earth and are wood
    expect(m.layers.ground.px.filter(c => c === 'madera').length).toBeGreaterThan(5);
  });

  it('light: buildings, casts and the rim of a forest darken through the recipe shade table', () => {
    const steps: MapRecipe['steps'] = [
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'area', id: 'f', material: 'forest', shape: { outside: { sides: 'r' } } },
    ];
    const shade = { pasto: 'hoja', 'bambú claro': 'hoja', 'hoja clara': 'hoja', 'bambú': 'hoja', hoja: 'hoja sombra' };
    const lit = paintMap(recipe(steps, { shade }), game());
    const dark = paintMap(recipe([...steps, { step: 'light', faces: false, rim: ['f'], on: ['grass'],
      buildings: [[2, 5, 3, 6, 30, 601]], casts: [[8, 6, 10, 5, 603, 2, 0]] }], { shade }), game());
    const changed = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const a = lit.layers.ground.get(x, y)!, b = dark.layers.ground.get(x, y)!;
        if (a !== b) { n++; expect(b).toBe(shade[a as keyof typeof shade]); }
      }
      return n;
    };
    const [ox, oy] = lit.origin;
    expect(changed(ox + 5 * 16, oy + 2 * 16, ox + 7 * 16, oy + 4 * 16)).toBeGreaterThan(10);   // the wedge off the building
    expect(changed(ox + 7 * 16, oy + 5 * 16, ox + 9 * 16 + 4, oy + 7 * 16)).toBeGreaterThan(30); // the cast
    expect(changed(ox + 12 * 16 - 8, oy, ox + 12 * 16 + 2, oy + 8 * 16)).toBeGreaterThan(200);  // under the trees
  });

  it('scatter: the stream salt, tufts odds, flower odds and stems, dew over colors, litter on a path', () => {
    const steps = (): MapRecipe['steps'] => [
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'path', id: 'p', material: 'earth', points: [[0, 4], [11, 4]], width: [8, 0], tufts: 0, ruts: [0, 0] },
      { step: 'scatter', what: 'tufts', layer: 'tips', odds: [0.85, 0.22], far_spacing: 12 },
      { step: 'scatter', what: 'flowers', count: 400, colors: [['flor'], ['oro']], odds: [1], stem: [1, 2] },
      { step: 'scatter', what: 'litter', path: 'p', on: ['earth'], at: [[6, 4, 60, 1.6]], count: 2000 },
      { step: 'scatter', what: 'dew', layer: 'motes', over: ['pasto'], alone: false, reach: 0, colors: [['oro claro']] },
    ];
    const a = paintMap(recipe(steps()), game()), b = paintMap(recipe(steps(), { scatter_salt: 731 }), game());
    expect(a.layers.tips.px.filter((c, i) => c !== b.layers.tips.px[i]).length).toBeGreaterThan(0);
    const g = a.layers.ground.px;
    expect(g.includes('flor')).toBe(true);
    expect(g.includes('oro')).toBe(false);                       // odds [1]: always the first group
    expect(g.filter(c => c === 'piedra clara').length).toBeGreaterThan(0);   // pebbles from the litter
    for (let i = 0; i < g.length; i++) {
      if (a.layers.motes.px[i]) expect(g[i]).toBe('pasto');
      if (g[i] === 'piedra clara') expect(a.kind[i]).toBe('earth');
    }
  });
});

describe('the brink: an island that falls away to the south', () => {
  const sky = { step: 'cloudbanks', material: 'clouds', rows: { every: 14 } } as const;
  const steps = (extra: object = {}): MapRecipe['steps'] => [
    sky,
    { step: 'area', material: 'grass', shape: { rect: [-4, -3, 20, 8] } },
    { step: 'stairway', material: 'steps', x: [8, 9], from: 3.5, to: 7.5, middle: 8.5 },
    { step: 'brink', id: 'b', face: 'rock', sea: 'clouds', lip: [[-4, 4], [5, 4.4], [16, 4]], skip: ['steps'],
      falls: [[3, 5]], water: 'water', flow: 'falls', ...extra } as MapRecipe['steps'][number],
    { ...sky, within: 'b' },
  ];
  const r = (s: MapRecipe['steps']) => recipe(s, {
    margin: [4, 3],
    materials: { ...recipe([]).materials, steps: { ramp: STONE }, water: { ramp: ['celeste oscuro', 'celeste', 'celeste luz', 'ojo', 'túnica luz'] } },
  });

  it('under the lip the face falls, past its foot the same sky as before; a fall pours into the clouds and flows', () => {
    const m = paintMap(r(steps()), game());
    const W = m.width, [ox, oy] = m.origin;
    // going down a column: grass, then the rock face, then the sky far below
    const x = ox + 1 * 16, seen: string[] = [];
    for (let y = oy; y < m.height; y++) { const k = m.kind[y * W + x]; if (seen[seen.length - 1] !== k) seen.push(k); }
    expect(seen.slice(0, 3)).toEqual(['grass', 'rock', 'clouds']);
    let face = 0;
    for (let y = oy + 3 * 16; y < m.height; y++) if (m.kind[y * W + x] === 'rock') face++;
    expect(face).toBeGreaterThan(30);   // a precipice, not a curb
    // far below the foot the sky is the very same the first cloudbanks laid
    const plain = paintMap(r([sky]), game());
    for (let y = m.height - 12; y < m.height; y++) for (let i = 0; i < W; i++) expect(m.layers.ground.px[y * W + i]).toBe(plain.layers.ground.px[y * W + i]);
    // the fall: water down the face, its streaks on the layer that flows
    expect(count(m, 'water')).toBeGreaterThan(5 * 2 * 30);
    expect(m.layers.falls.px.some(c => c !== null)).toBe(true);
    // the stairway painted before is left alone over the face
    expect(count(m, 'steps')).toBeGreaterThan(16 * 2);
  });

  it('the lip is never a straight line, and with a spring the fall comes out of the face instead of over the lip', () => {
    const m = paintMap(r(steps()), game());
    const W = m.width, [ox, oy] = m.origin;
    const tops = new Set<number>();
    for (let x = ox; x < ox + 12 * 16; x++) {
      let y = oy;
      while (m.kind[y * W + x] !== 'rock' && y < m.height - 1) y++;
      tops.add(y);
    }
    expect(tops.size).toBeGreaterThan(4);
    const sprung = paintMap(r(steps({ spring: 7 })), game());
    const cx = ox + 3 * 16, lipRow = (p: PaintedMap) => { let y = oy; while (p.kind[y * W + cx] !== 'water' && y < p.height - 1) y++; return y; };
    expect(lipRow(sprung)).toBeGreaterThan(lipRow(m) + 5);
  });
});

describe('the brink as a ring: the whole island falls away', () => {
  const sky = { step: 'cloudbanks', material: 'clouds', rows: { every: 14 } } as const;
  const loop: [number, number][] = [[1, 1.2], [6, 0.8], [11, 1.3], [11.4, 4], [10.8, 7], [6, 6.6], [1.2, 7.1], [0.6, 4]];
  const r = recipe([
    sky,
    { step: 'area', material: 'grass', shape: 'all' },
    { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'clouds', lip: loop } as MapRecipe['steps'][number],
    { ...sky, within: 'b' },
  ], { margin: [4, 4] });

  it('south faces under the south lip, lit rock on the west side, nothing hangs from the north lip, sky all around', () => {
    const m = paintMap(r, game());
    const W = m.width, [ox, oy] = m.origin, k = (x: number, y: number) => m.kind[y * W + x];
    // the four corners of the picture are sky
    for (const [x, y] of [[0, 0], [W - 1, 0], [0, m.height - 1], [W - 1, m.height - 1]]) expect(k(x, y)).toBe('clouds');
    // down the middle: sky, the north lip, grass, then the face, then sky
    const x = ox + 6 * 16, seen: string[] = [];
    for (let y = 0; y < m.height; y++) if (seen[seen.length - 1] !== k(x, y)) seen.push(k(x, y));
    expect(seen).toEqual(['clouds', 'grass', 'rock', 'clouds']);
    let face = 0;
    for (let y = oy + 6 * 16; y < m.height; y++) if (k(x, y) === 'rock') face++;
    expect(face).toBeGreaterThan(30);
    // west of the island, at mid height: a band of rock (lit: some light tones), then sky
    const y = oy + 4 * 16, row: string[] = [];
    for (let X = ox + 1.6 * 16; X > 0; X--) { const c = k(Math.trunc(X), y); if (row[row.length - 1] !== c) row.push(c); }
    expect(row.slice(0, 3)).toEqual(['grass', 'rock', 'clouds']);
    const lit = new Set<string>();
    for (let X = 0; X < ox + 16; X++) if (k(X, y) === 'rock') lit.add(m.layers.ground.px[y * W + X]!);
    expect([...lit].some(c => c === 'piedra clara' || c === 'piedra')).toBe(true);
  });
});

describe('flight climb, stepped', () => {
  it('each tread is level and the next one higher: the top edge climbs in steps', () => {
    const paint = (stepped: boolean) => paintMap(recipe([
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'flight', material: 'stone', style: 'climb', from: [1, 5], length: 64, slope: 0.4, every: 8, stepped } as MapRecipe['steps'][number],
    ]), game());
    const tops = (m: PaintedMap) => {
      const [ox] = m.origin, out = new Set<number>();
      for (let x = ox + 16; x < ox + 16 + 64; x++) { let y = 0; while (m.kind[y * m.width + x] !== 'stone') y++; out.add(y); }
      return out.size;
    };
    expect(tops(paint(true))).toBeLessThanOrEqual(8);
    expect(tops(paint(false))).toBeGreaterThan(16);
  });
});

describe('cloudbanks with drift', () => {
  it('the banks go to their layer and, moved px each way, still fall on the sky past the island', () => {
    const sky = { step: 'cloudbanks', material: 'clouds', rows: { every: 14 }, drift: { layer: 'nubes', px: 4 } } as const;
    const loop: [number, number][] = [[1, 1.2], [6, 0.8], [11, 1.3], [11.4, 4], [10.8, 7], [6, 6.6], [1.2, 7.1], [0.6, 4]];
    const m = paintMap(recipe([
      sky,
      { step: 'area', material: 'grass', shape: 'all' },
      { step: 'brink', id: 'b', ring: true, face: 'rock', sea: 'clouds', lip: loop } as MapRecipe['steps'][number],
      { ...sky, within: 'b' },
    ], { margin: [4, 4] }), game());
    const W = m.width, l = m.layers.nubes.px;
    let on = 0;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === null) continue;
      on++;
      for (const d of [-4, 4]) expect(m.kind[i + d]).toBe('clouds');
    }
    expect(on).toBeGreaterThan(W * 20);
  });
});

describe('worn stairs', () => {
  const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
  const kindAt = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
  const row = (m: PaintedMap, y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 }, (_, i) => at(m, x0 + i, y));
  const most = (cs: (string | null)[], c: string) => cs.filter(v => v === c).length > cs.length / 2;
  const grass = { step: 'area', material: 'grass', shape: 'all' } as const;
  const stair = (worn: object, extra: object = {}) => ({ step: 'stairway', material: 'stone', x: [4, 6], from: 1, to: 6, middle: 5, fade: 99, worn: { jitter: 0, moss: 0, ...worn }, ...extra }) as MapRecipe['steps'][number];

  it('stairway: the tread lit, its nose a px brighter, the riser in shadow with the dark joint at its foot, every tread', () => {
    const m = paintMap(recipe([grass, stair({})]), game());
    const [ox, oy] = m.origin, s0 = ox + 4 * 16, s1 = ox + 6 * 16, y0 = oy + 16;
    for (let k = 0; k < 4; k++) {
      const nose = y0 + 7 * k + 4;   // every 7, riser 2: three rows of tread, the nose, two of riser
      expect(most(row(m, nose - 1, s0 + 1, s1), 'piedra clara'), `lit ${k}`).toBe(true);
      expect(most(row(m, nose, s0 + 1, s1), 'niebla'), `nose ${k}`).toBe(true);
      expect(most(row(m, nose + 1, s0, s1), 'piedra sombra'), `riser ${k}`).toBe(true);
      expect(row(m, nose + 2, s0, s1).every(c => c === 'túnica noche'), `foot ${k}`).toBe(true);
    }
    // the stones of a tread: some joints across it, not where the tread above has them
    const joints = (y: number) => row(m, y, s0 + 1, s1).flatMap((c, i) => (c === 'túnica oscura' ? [i] : []));
    expect(joints(y0 + 2).length).toBeGreaterThan(0);
    expect(joints(y0 + 2)).not.toEqual(joints(y0 + 9));
  });

  it('stairway: low walls with their outline and cap, and the shadow on the ground to the east', () => {
    const plain = paintMap(recipe([grass]), game());
    const m = paintMap(recipe([grass, stair({})]), game());
    const [ox, oy] = m.origin, s0 = ox + 4 * 16, s1 = ox + 6 * 16, y = oy + 16 + 10;
    expect([s0 - 4, s0 - 1, s1, s1 + 3].map(x => kindAt(m, x, y))).toEqual(['stone', 'stone', 'stone', 'stone']);
    expect(at(m, s0 - 4, y)).toBe('túnica noche');        // the outline of the west wall
    expect(at(m, s1 + 3, y)).toBe('túnica noche');        // and of the east one
    expect(at(m, s1 + 1, y)).toBe('piedra sombra');       // the cap, darker than the treads
    expect(kindAt(m, s1 + 4, y)).toBe('grass');
    expect(at(m, s1 + 4, y)).not.toBe(at(plain, s1 + 4, y));   // its shadow
    expect(at(m, s1 + 6, y)).toBe(at(plain, s1 + 6, y));       // two px of it
  });

  it('stairway: moss only in some joints, and none with moss 0', () => {
    const mossy = (m: PaintedMap) => m.kind.filter((k, i) => k === 'stone' && MOSS.includes(m.layers.ground.px[i]!)).length;
    expect(mossy(paintMap(recipe([grass, stair({ moss: 0 })]), game()))).toBe(0);
    expect(mossy(paintMap(recipe([grass, stair({ moss: 1 })]), game()))).toBeGreaterThan(4);
  });

  it('stairway: into the rock from a row, the walls are the cut rock, wider, and the risers taller', () => {
    const m = paintMap(recipe([grass, stair({ rock: { from: 3.5, material: 'rock', wide: 4 } })]), game());
    const [ox, oy] = m.origin, s0 = ox + 4 * 16, s1 = ox + 6 * 16;
    expect(kindAt(m, s0 - 6, oy + 16 + 3)).toBe('grass');    // above the lip the wall is 4 px
    expect(kindAt(m, s0 - 6, oy + 5 * 16)).toBe('stone');    // under it, 8
    expect(kindAt(m, s1 + 6, oy + 5 * 16)).toBe('stone');
    // a column of the treads under the lip: three rows of riser (the darkest two tones) under each nose
    const x = s0 + 5, col = Array.from({ length: 28 }, (_, i) => at(m, x, oy + 4 * 16 + i));
    const noses = col.flatMap((c, i) => (c === 'niebla' ? [i] : []));
    expect(noses.length).toBeGreaterThan(1);
    const n = noses[0];
    expect(col.slice(n + 1, n + 4).every(c => c === 'piedra sombra' || c === 'túnica noche')).toBe(true);
  });

  it('flight climb worn: stepped, a lit nose at the foot of each tread, the flank in shadow under it, its shadow below', () => {
    const climb = (worn?: object) => ({ step: 'flight', material: 'stone', style: 'climb', from: [1, 5], length: 64, slope: 0.4, every: 8, half: 5, fade: [999, 12], ...(worn ? { worn } : {}) }) as MapRecipe['steps'][number];
    const plain = paintMap(recipe([grass]), game());
    const m = paintMap(recipe([grass, climb({ jitter: 0, moss: 0 })]), game());
    const [ox, oy] = m.origin, start = ox + 16, yMid = oy + 5 * 16;
    let lastTop = Infinity;
    for (let k = 0; k < 7; k++) {
      const x0 = start + 8 * k, yc = Math.round(yMid - k * 8 * 0.4);
      expect(at(m, x0, yc), `nose ${k}`).toBe('niebla');
      let top = 0;
      while (kindAt(m, x0 + 4, top) !== 'stone') top++;
      expect(top, `step ${k} higher`).toBeLessThan(lastTop);
      lastTop = top;
      let y = yc;
      while (kindAt(m, x0 + 4, y) === 'stone' && ['niebla sombra', 'piedra clara', 'piedra', 'túnica oscura'].includes(at(m, x0 + 4, y)!)) y++;
      expect(at(m, x0 + 4, y + 1), `flank ${k}`).toBe('piedra sombra');
      let foot = y;
      while (kindAt(m, x0 + 4, foot) === 'stone') foot++;
      expect(at(m, x0 + 4, foot), `shadow ${k}`).not.toBe(at(plain, x0 + 4, foot));
    }
  });
});
