// @vitest-environment node
// The map steps that came with the duel terrace of The Unwritten Dao: the
// recipe against the script's PNGs, and each piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { gameGrid, outputLayer, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';

const FIX = join(__dirname, '../fixtures/mapas');
type Steps = MapRecipe['steps'];
const STONE = ['piedra sombra', 'piedra', 'niebla sombra', 'niebla', 'túnica sombra', 'piedra clara', 'pergamino', 'túnica luz'];
const MATS: MapRecipe['materials'] = {
  nubes: { ramp: ['celeste oscuro', 'celeste', 'niebla sombra', 'niebla', 'túnica luz'] },
  cara: { ramp: ['túnica noche', 'túnica oscura', 'piedra sombra', 'piedra'] },
  losas: { ramp: STONE, moss: ['hoja sombra', 'hoja'] },
  ruedo: { ramp: ['túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino', 'túnica luz', 'niebla sombra'] },
  baranda: { ramp: ['tinta', 'madera sombra', 'bermellón', 'bermellón claro'] },
  escalinata: { ramp: ['piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino', 'túnica luz'] },
};
const SHADE = { 'túnica luz': 'niebla', pergamino: 'niebla sombra', 'túnica sombra': 'niebla sombra', 'piedra clara': 'niebla sombra', niebla: 'niebla sombra', 'niebla sombra': 'piedra', piedra: 'piedra sombra', 'piedra sombra': 'túnica oscura', 'túnica oscura': 'túnica noche', hoja: 'hoja sombra' };
function game(decor: MapGame['decor'] = []): MapGame { return { width: 12, height: 10, grid: Array.from({ length: 10 }, () => '.'.repeat(12)), decor }; }
function recipe(steps: Steps, decor: MapGame['decor'] = []): MapRecipe { return { game: game(decor), margin: [3, 1], shade: SHADE, scatter_salt: 1731, materials: MATS, steps }; }
const SKY = { step: 'cloudbanks', material: 'nubes' } as const;
const FLOOR: MapStepOf<'courses'> = { step: 'courses', material: 'losas', box: [0, 1, 12, 9], edge: { id: 'orilla' } };
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const count = (m: PaintedMap, layer: string, pred: (c: string, x: number, y: number) => boolean = () => true) => {
  let n = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const c = at(m, layer, x, y); if (c !== null && pred(c, x, y)) n++; }
  return n;
};
const P = (u: number, v: number): [number, number] => [48 + u * 16, 16 + v * 16];

function differ(file: string, prefix: string, layers: [string, string][]): Record<string, number> {
  const r = renderRecipe(join(FIX, file)), out: Record<string, number> = {};
  for (const [layer, suffix] of layers) {
    const ref = readPng(join(FIX, `${prefix}${suffix}.png`)), l = outputLayer(r, layer);
    expect([l.w, l.h], layer).toEqual([ref.width, ref.height]);
    let d = 0;
    for (let i = 0; i < l.w * l.h; i++) {
      const c = l.px[i], a = ref.data[i * 4 + 3];
      const hex = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
      if ((c === null) !== (a === 0) || (c !== null && r.colors[c] !== hex)) d++;
    }
    out[layer] = d;
  }
  return out;
}

describe('map recipe: the duel terrace', () => {
  it('paints the same four layers the terrace script painted, pixel for pixel, and passes the lint', async () => {
    const d = differ('terraza.receta.json', 'terraza_script', [['ground', ''], ['mechones', '_mechones'], ['motas', '_motas'], ['copas', '_copas']]);
    expect(d).toEqual({ ground: 0, mechones: 0, motas: 0, copas: 0 });
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'terraza.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  }, 30000);

  it('the game grid brings the offset of decor and landmarks', () => {
    const g = gameGrid(join(FIX, 'terraza.json'), join(FIX, 'terraza_visuals.json'));
    expect(g.decor!.find(d => d.sprite === 'farol_terraza')!.offset).toEqual([0, -0.1]);
    expect(g.decor!.find(d => d.sprite === 'banco')!.offset).toBeUndefined();
  });
});

describe('map steps of a terrace in the sky', () => {
  it('cloudbanks: every px is sky; banks bring cloud tones; a peak paints its rock and pines', () => {
    const m = paintMap(recipe([SKY]), game());
    expect(m.kind.every(k => k === 'nubes')).toBe(true);
    expect(count(m, 'ground', c => c === 'túnica luz')).toBeGreaterThan(300);
    const peak = paintMap(recipe([{ ...SKY, peaks: [[6, 3, 8, 30, 3]] }]), game());
    expect(count(peak, 'ground', c => c === 'madera sombra')).toBeGreaterThan(0);
    expect(count(peak, 'ground', c => c === 'bambú claro')).toBeGreaterThan(0);
    const [cx, top] = P(6, 3);
    // the right side of the rock is the deep tone, a little down the column
    let right = 0;
    for (let x = cx; x < cx + 16; x++) if (at(peak, 'ground', x, top + 10) === 'celeste oscuro' && at(peak, 'ground', x - 1, top + 10) !== 'celeste oscuro') right++;
    expect(right).toBeGreaterThan(0);
  });

  it('ashlar: the face in courses gets darker down to its foot, sinks into clouds and has moss', () => {
    const m = paintMap(recipe([SKY, { step: 'ashlar', material: 'cara', x: [0, 12], y: [8, 9], sink: { material: 'nubes', x: [0, 12] }, moss: { count: 30, x: [0, 12] } }]), game());
    const [, y0] = P(0, 8);
    const row = (y: number, c: string) => count(m, 'ground', (cc, x, yy) => yy === y && kind(m, x, yy) === 'cara' && cc === c);
    expect(row(y0 + 1, 'piedra sombra')).toBeGreaterThan(row(y0 + 11, 'piedra sombra'));
    expect(count(m, 'ground', (c, x, y) => y > y0 + 10 && y < y0 + 22 && kind(m, x, y) === 'nubes' && c === 'túnica luz')).toBeGreaterThan(100);
    expect(count(m, 'ground', (c, x, y) => y === y0 && c === 'hoja')).toBeGreaterThan(5);
  });

  it('ashlar ragged: the top of the wall is not ruled, each stone at its own height; without it the top is straight', () => {
    const wall = (o: object) => paintMap(recipe([SKY, { step: 'ashlar', material: 'cara', x: [0, 12], y: [4, 5], course: 6, ...o }]), game());
    const [x0] = P(0, 0), [x1] = P(12, 0);
    const tops = (m: PaintedMap) => {
      const out: number[] = [];
      for (let x = x0 + 2; x < x1 - 2; x++) { let y = 0; while (y < m.height && kind(m, x, y) !== 'cara') y++; out.push(y); }
      return out;
    };
    expect(new Set(tops(wall({}))).size).toBe(1);
    const rag = tops(wall({ ragged: 2 }));
    expect(new Set(rag).size).toBeGreaterThan(2);
    let run = 1, longest = 1;
    for (let i = 1; i < rag.length; i++) { run = rag[i] === rag[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
    expect(longest).toBeLessThan(13);
    // the foot: with rough the grass rises in tufts over the wave
    const foot = (rough?: number) => {
      const m = wall({ sink: { material: 'nubes', x: [0, 12], ...(rough ? { rough } : {}) } }), out: number[] = [];
      for (let x = x0 + 2; x < x1 - 2; x++) { let y = m.height - 1; while (y > 0 && kind(m, x, y) !== 'cara') y--; out.push(y); }
      return out;
    };
    const flat = foot(), tufted = foot(2);
    expect(tufted.reduce((a, b) => a + b, 0)).toBeLessThan(flat.reduce((a, b) => a + b, 0));
    let same = 0;
    for (let i = 1; i < tufted.length; i++) if (tufted[i] === tufted[i - 1]) same++;
    let sameFlat = 0;
    for (let i = 1; i < flat.length; i++) if (flat[i] === flat[i - 1]) sameFlat++;
    expect(same).toBeLessThan(sameFlat);
  });

  it('courses: joints, a lit lip, moss only in the edge band and lighter where it is worn', () => {
    const m = paintMap(recipe([SKY, FLOOR]), game());
    expect(count(m, 'ground', c => c === 'túnica luz')).toBeGreaterThan(200);
    const moss = count(m, 'ground', c => c === 'hoja' || c === 'hoja sombra');
    expect(moss).toBeGreaterThan(10);
    const [x0, y0] = P(0, 1), [x1, y1] = P(12, 9);
    expect(count(m, 'ground', (c, x, y) => (c === 'hoja' || c === 'hoja sombra') && x > x0 + 40 && x < x1 - 40 && y > y0 + 40 && y < y1 - 40)).toBe(0);
    const light = (mm: PaintedMap) => count(mm, 'ground', (c, x, y) => kind(mm, x, y) === 'losas' && (c === 'pergamino' || c === 'túnica luz'));
    const worn = paintMap(recipe([SKY, { ...FLOOR, wear: { spots: { amount: 0.3, r: [40, 30], at: [[6, 5]] }, lanes: [[6, 5, 14, 0.3]], rings: [[6, 5, 50, 40, 0.2, 1, 0.3]] } }]), game());
    expect(light(worn)).toBeGreaterThan(light(m) + 100);
  });

  it('courses overgrow: grass comes in from the walls over the slabs, ragged, never in the middle; moss lines in the joints', () => {
    const MOSS = ['copa sombra', 'prado hondo', 'prado sombra', 'prado'];
    const plain = paintMap(recipe([SKY, { ...FLOOR, edge: { id: 'orilla', band: [24, 16, 13, 1311], corner: 40 } }]), game());
    const old = paintMap(recipe([SKY, { ...FLOOR, edge: { id: 'orilla', band: [24, 16, 13, 1311], corner: 40 }, overgrow: { at: 0.35, colors: MOSS, kind: 'pasto' } }]), game());
    const green = (m: PaintedMap, pred: (x: number, y: number) => boolean) => count(m, 'ground', (c, x, y) => MOSS.includes(c) && pred(x, y));
    const [x0, y0] = P(0, 1), [x1, y1] = P(12, 9);
    expect(green(plain, () => true)).toBe(0);
    const wall = green(old, (x, y) => y >= y0 && y < y1 && (x - x0 < 8 || x1 - x <= 8)), mid = green(old, (x, y) => x > x0 + 50 && x < x1 - 50 && y > y0 + 40 && y < y1 - 40);
    expect(wall).toBeGreaterThan(300);
    expect(mid).toBe(0);
    // ragged: along the left wall the front comes in to different depths
    const depths = new Set<number>();
    for (let y = y0 + 30; y < y1 - 30; y += 4) { let d = 0; while (MOSS.includes(at(old, 'ground', x0 + d, y) ?? '')) d++; depths.add(d); }
    expect(depths.size).toBeGreaterThan(3);
    expect(count(old, 'ground', (c, x, y) => MOSS.includes(c) && kind(old, x, y) === 'pasto' && c !== 'copa sombra')).toBeGreaterThan(200);
    // the joints hold moss where people walk too
    const lined = paintMap(recipe([SKY, { ...FLOOR, overgrow: { at: 5, joints: 0.5, colors: MOSS } }]), game());
    expect(green(lined, (x, y) => x > x0 + 50 && x < x1 - 50 && y > y0 + 40 && y < y1 - 40)).toBeGreaterThan(20);
  });

  it('runner: two slabs a row, with an edge in shadow at each side', () => {
    const m = paintMap(recipe([SKY, FLOOR, { step: 'runner', material: 'losas', x: [5, 7], y: [5, 9], middle: 6 }]), game());
    const [xa] = P(5, 0), [xb] = P(7, 0), [, y] = P(0, 6);
    expect(at(m, 'ground', xa, y + 3)).toBe('piedra');
    expect(at(m, 'ground', xb - 1, y + 3)).toBe('piedra sombra');
  });

  it('arena: a raised oval with its face to the south, the bronze ring in the middle and studs on the curb', () => {
    const m = paintMap(recipe([SKY, FLOOR, { step: 'arena', material: 'ruedo', at: [6, 5], r: [41, 34] }]), game());
    const [cx, cy] = P(6, 5);
    expect(at(m, 'ground', cx, cy)).toBe('oro');
    expect(kind(m, cx, cy + 35)).toBe('ruedo');     // the face, below the oval
    expect(kind(m, cx, cy - 36)).toBe('losas');
    expect(count(m, 'ground', c => c === 'oro claro')).toBeGreaterThanOrEqual(4);
    expect(count(m, 'ground', c => c === 'bronce')).toBeGreaterThan(10);
  });

  it('balustrade: curb, rail and posts that stand up, an opening, a hole and the side rails', () => {
    const r = recipe([SKY, FLOOR, { step: 'balustrade', material: 'baranda',
      across: [{ y: 2, curb: [0, 11.9375], rail: [0.0625, 11.875], height: 6, posts: 19, gaps: [[5, 6]], balusters: false, holes: [[5, 6]] }],
      down: { x: [-0.5, 12], y: [1, 9], finials: 19 } }]);
    const m = paintMap(r, game());
    const [, yb] = P(0, 2), [g0] = P(5, 0);
    expect(at(m, 'ground', g0 - 24, yb)).toMatch(/niebla|piedra clara/);
    expect(at(m, 'ground', g0 - 24, yb - 6)).toBe('bermellón claro');
    expect(at(m, 'ground', g0 + 4, yb)).toBe('piedra sombra');        // the lip of the hole
    expect(at(m, 'ground', g0 + 4, yb + 2)).toBe('túnica oscura');
    expect(count(m, 'ground', c => c === 'oro claro')).toBeGreaterThan(5);
    const [xl] = P(-0.5, 0);
    expect(at(m, 'ground', xl, 80)).toBe('bermellón claro');
    // what stands up casts: with a cast step the floor under the rail darkens
    const cast = paintMap({ ...r, steps: [...r.steps, { step: 'cast', on: ['losas'], min: 0, covers: true }] }, game());
    expect(count(cast, 'ground', (c, x, y) => c !== at(m, 'ground', x, y))).toBeGreaterThan(0);
  });

  it('stairway: lit noses, darker tread by tread', () => {
    const m = paintMap(recipe([SKY, { step: 'stairway', material: 'escalinata', x: [5, 7], from: 8, middle: 6, every: 4, fade: 0, tread: ['túnica luz', 'pergamino', 'piedra clara', 'túnica sombra', 'piedra', 'piedra sombra'] }]), game());
    const x = Math.trunc(P(5.2, 0)[0]), [, y] = P(0, 8);
    expect(at(m, 'ground', x, y)).toBe('túnica luz');
    expect(at(m, 'ground', x, y + 4)).toBe('niebla');          // the next nose, one step into the shade
    expect(at(m, 'ground', x, y + 8)).toBe('niebla sombra');
  });

  it('stairway: `to` ends the flight there instead of at the bottom of the picture', () => {
    const flight = (to?: number): MapStepOf<'stairway'> => ({ step: 'stairway', material: 'escalinata', x: [5, 7], from: 6, middle: 6, ...(to === undefined ? {} : { to }) });
    const whole = paintMap(recipe([SKY, flight()]), game());
    const short = paintMap(recipe([SKY, flight(8)]), game());
    const x = Math.trunc(P(5.2, 0)[0]);
    // down to the row of `to` it is the same flight; past it, nothing of it
    for (const y of [P(0, 6)[1], P(0, 7)[1], P(0, 8)[1] - 1]) expect(at(short, 'ground', x, y), `y=${y}`).toBe(at(whole, 'ground', x, y));
    expect(kind(whole, x, P(0, 8)[1])).toBe('escalinata');
    expect(kind(short, x, P(0, 8)[1])).toBe('nubes');
    expect(count(short, 'ground', (_c, _x, y) => y >= P(0, 8)[1] && kind(short, _x, y) === 'escalinata')).toBe(0);
  });

  it('cast: offset, the lowest foot, landmarks and covers', () => {
    const mask = Array.from({ length: 32 }, (_, y) => (y < 28 ? '..######........' : '................'));
    const piece = (o: object): NonNullable<MapGame['decor']> => [{ sprite: 'poste', at: [5, 5], size: [1, 2], mask, ...o }];
    const base = [SKY, FLOOR] as Steps;
    const shadow = (decor: MapGame['decor'], st: object) => {
      const plain = paintMap(recipe(base, decor), game(decor));
      const m = paintMap(recipe([...base, { step: 'cast', on: ['losas'], min: 0, ...st }], decor), game(decor));
      return count(m, 'ground', (c, x, y) => c !== at(plain, 'ground', x, y));
    };
    expect(shadow(piece({}), {})).toBeGreaterThan(0);
    expect(shadow(piece({ landmark: true }), {})).toBe(0);
    expect(shadow(piece({ landmark: true }), { landmarks: true })).toBeGreaterThan(0);
    // the lowest opaque row is the foot: four px less of height, a shorter shadow
    expect(shadow(piece({}), { foot: 'lowest' })).toBeLessThan(shadow(piece({}), {}));
    // offset moves the shadow
    const where = (o: object, st: object) => {
      const decor = piece(o);
      const m = paintMap(recipe([...base, { step: 'cast', on: ['losas'], min: 0, ...st }], decor), game(decor));
      const plain = paintMap(recipe(base, decor), game(decor));
      let lo = Infinity;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (at(m, 'ground', x, y) !== at(plain, 'ground', x, y)) lo = Math.min(lo, y);
      return lo;
    };
    expect(where({ offset: [0, -1] }, { offset: true })).toBeLessThan(where({ offset: [0, -1] }, {}));
    // covers keeps the foot px of the piece out of its shadow
    const flat = piece({});
    flat[0].mask = Array.from({ length: 32 }, (_, y) => (y >= 30 ? '################' : '................'));
    expect(shadow(flat, { covers: true, lean: [0, 0], smooth: 0 })).toBeLessThanOrEqual(shadow(flat, { lean: [0, 0], smooth: 0 }));
  });

  it('sprigs, fallen and motes: tips on the moss, leaves by the sides, motes apart on the light stone', () => {
    const steps: Steps = [SKY, FLOOR,
      { step: 'sprigs', on: ['losas'], over: ['hoja', 'hoja sombra'], tries: 4000, spacing: 10, shapes: [['h.h', 'l.l']], layer: 'mechones' },
      { step: 'fallen', on: ['losas'], count: 400, box: [0, 1, 12, 9], edge: 'orilla' },
      { step: 'motes', on: ['losas'], over: ['pergamino', 'túnica luz'], tries: 700, clear: [10, 10], colors: ['túnica luz', 'oro claro'], layer: 'motas' }];
    const m = paintMap(recipe(steps), game());
    expect(count(m, 'mechones', c => c === 'bambú')).toBeGreaterThan(0);
    const [x0, y0] = P(0, 1), [x1, y1] = P(12, 9);
    expect(count(m, 'ground', (c, x, y) => (c === 'oro' || c === 'oro claro') && x > x0 + 40 && x < x1 - 40 && y > y0 + 40 && y < y1 - 40)).toBe(0);
    expect(count(m, 'ground', c => c === 'oro' || c === 'oro claro')).toBeGreaterThan(5);
    const motes: [number, number][] = [];
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (at(m, 'motas', x, y)) motes.push([x, y]);
    expect(motes.length).toBeGreaterThan(5);
    for (const [a, b] of motes) for (const [c, d] of motes) if (a !== c || b !== d) expect(Math.abs(a - c) > 10 || Math.abs(b - d) > 10).toBe(true);
  });

  it('overhang: the branch on its layer with an outline, and its shadow on the floor', () => {
    const st: MapStepOf<'overhang'> = { step: 'overhang', layer: 'copas', trunk: [[2, 6], [4, 5], [7, 4.5]], pads: [[4, 4.6, 12, 3.4], [7, 4.3, 9, 3]] };
    const m = paintMap(recipe([SKY, FLOOR, st]), game());
    expect(count(m, 'copas', c => c === 'madera')).toBeGreaterThan(0);
    expect(count(m, 'copas', c => c === 'túnica noche')).toBeGreaterThan(0);
    expect(count(m, 'copas', c => c === 'bambú claro')).toBeGreaterThan(0);
    const plain = paintMap(recipe([SKY, FLOOR]), game());
    expect(count(m, 'ground', (c, x, y) => c !== at(plain, 'ground', x, y))).toBe(0);
    const shaded = paintMap(recipe([SKY, FLOOR, { ...st, shadow: { at: [9, 6], on: ['losas'] } }]), game());
    expect(count(shaded, 'ground', (c, x, y) => c !== at(plain, 'ground', x, y))).toBeGreaterThan(100);
  });

  it('overhang: limbs, a trunk lit from the west with grain and a knot, roots in relief apart from each other', () => {
    const RAMP = ['madera clara', 'tierra', 'madera', 'madera sombra'];
    const st: MapStepOf<'overhang'> = {
      step: 'overhang', layer: 'copas', pads: [], grain: 0.6, knots: [[6, 4.5]], contact: ['tierra sombra', 1],
      limbs: [
        { path: [[6, 7], [6.2, 5.5], [5.8, 4], [6, 2.5]], width: [9, 7, 7.5, 5] },
        { path: [[5.6, 6.6], [4.6, 7.0], [3.6, 7.3]], width: [4, 2.5, 0], root: true },
        { path: [[5.8, 6.8], [5.2, 7.3], [4.6, 7.6]], width: [4, 2.5, 0], root: true },
        { path: [[6.2, 4.2], [7.5, 3.6], [8.8, 3.4]], width: [3.5, 1.5] },
      ],
    };
    const m = paintMap(recipe([SKY, FLOOR, st]), game());
    const [tx] = P(6, 5);
    const inTrunk = (x: number, y: number) => Math.abs(x - tx) < 10 && y > P(0, 3)[1] && y < P(0, 6)[1];
    // the trunk in four tones of bark, grain and knot included, and never ink inside but at the knot
    for (const c of RAMP) expect(count(m, 'copas', (k, x, y) => k === c && inTrunk(x, y))).toBeGreaterThan(4);
    // the light down the west of the trunk, the shade down the east
    const meanX = (c: string) => {
      let n = 0, sum = 0;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (inTrunk(x, y) && at(m, 'copas', x, y) === c) { n++; sum += x; }
      return sum / n;
    };
    expect(meanX('madera clara')).toBeLessThan(tx - 2);
    expect(meanX('madera sombra')).toBeGreaterThan(tx + 2);
    // grain: dark streaks inside the lit band (bark darker than its row's light at the west)
    let streaks = 0;
    for (let y = P(0, 3)[1]; y < P(0, 6)[1]; y++) for (let x = tx - 8; x < tx - 2; x++) if (at(m, 'copas', x, y) === 'madera' && at(m, 'copas', x - 1, y) === 'madera clara') streaks++;
    expect(streaks).toBeGreaterThan(2);
    // the knot: ink with light above it
    const [kx, ky] = P(6, 4.5);
    expect(at(m, 'copas', Math.floor(kx), Math.floor(ky) + 1)).toBe('túnica noche');
    expect(at(m, 'copas', Math.floor(kx) - 1, Math.floor(ky) - 1)).toBe('madera clara');
    // the roots: at least three tones, lit on top, and an ink gap where one lies over the other
    const roots = (pred: (c: string) => boolean) => count(m, 'copas', (c, x, y) => pred(c) && x < tx - 10 && y > P(0, 6.6)[1]);
    expect(RAMP.filter(c => roots(k => k === c) > 2).length).toBeGreaterThanOrEqual(3);
    expect(roots(c => c === 'túnica noche')).toBeGreaterThan(10);
    expect(count(m, 'copas', c => c === 'tierra sombra')).toBeGreaterThan(3);
    // without limbs nothing of this
    const plain = paintMap(recipe([SKY, FLOOR, { step: 'overhang', layer: 'copas', trunk: [[6, 7], [6, 3]], pads: [] }]), game());
    expect(count(plain, 'copas', c => c === 'tierra')).toBe(0);
  });

  it('overhang: tiers in three tones, an inked rim, a festooned belly and the shadow of one tier on the next', () => {
    // two tiers: the lower one first, the upper one over its back half
    const pads: [number, number, number, number][] = [[5, 5.4, 22, 7], [5.4, 4.4, 22, 7]];
    const base: MapStepOf<'overhang'> = { step: 'overhang', layer: 'copas', trunk: [[5, 7], [5, 6.9]], width: [0.1, 0], pads };
    const plain = paintMap(recipe([SKY, FLOOR, base]), game());
    const st: MapStepOf<'overhang'> = { ...base, tones: [0.35, 0.4], lumps: 11, belly: [8, 2.5], outline: true };
    const m = paintMap(recipe([SKY, FLOOR, st]), game());
    // three tones: light on top, leaf in the middle, shadow under, each a real share of the pad
    for (const c of ['bambú claro', 'hoja', 'hoja sombra']) expect(count(m, 'copas', k => k === c)).toBeGreaterThan(40);
    const [cx] = P(5.4, 4.4);
    const col: string[] = [];
    for (let y = 0; y < m.height; y++) { const c = at(m, 'copas', Math.round(cx) + 4, y); if (c) col.push(c); }
    expect(col[0]).toBe('túnica noche');                       // the rim inked on top too (east of the middle: no tips of light)
    expect(col[col.length - 1]).toBe('túnica noche');
    expect(col.slice(1, 4)).not.toContain('hoja sombra');
    // light sits high in each pad, shadow low: the mean row of each tone, against the belly of its pad
    const meanRow = (c: string) => {
      let n = 0, sum = 0;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (at(m, 'copas', x, y) === c) { n++; sum += y - (y > P(5, 5.4)[1] - 9 ? P(5, 5.4)[1] : P(5.4, 4.4)[1]); }
      return sum / n;
    };
    expect(meanRow('bambú claro')).toBeLessThan(meanRow('hoja'));
    expect(meanRow('hoja')).toBeLessThan(meanRow('hoja sombra'));
    // the festooned belly: its lowest row climbs and drops along the pad, more than the plain one
    const bottoms = (map: PaintedMap) => {
      const out: number[] = [];
      const x0 = Math.round(P(5, 5.4)[0]);
      for (let x = x0 - 14; x <= x0 + 14; x++) { let b = 0; for (let y = 0; y < map.height; y++) if (at(map, 'copas', x, y)) b = y; out.push(b); }
      return out;
    };
    const steps = (b: number[]) => b.slice(1).filter((v, i) => v !== b[i]).length;
    expect(steps(bottoms(m))).toBeGreaterThan(steps(bottoms(plain)) + 4);
    // the cast: only pixels of the lower pad turn darker, just under the belly of the upper one
    const cast = paintMap(recipe([SKY, FLOOR, { ...st, cast: [3, 5] }]), game());
    const order = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro'];
    let darker = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const a = at(m, 'copas', x, y), b = at(cast, 'copas', x, y);
      if (a === b) continue;
      expect(order.indexOf(b!)).toBeLessThan(order.indexOf(a!));
      expect(y).toBeGreaterThan(P(5.4, 4.4)[1]);
      darker++;
    }
    expect(darker).toBeGreaterThan(8);
  });

});
