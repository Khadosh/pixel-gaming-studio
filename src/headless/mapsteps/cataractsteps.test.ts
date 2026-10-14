// @vitest-environment node
// The cataract: a waterfall in a gorge of rock seen from above (unwritten-dao #353). The sheet narrower than the cut,
// rock faces with thickness on both sides (the one toward the light lighter), a curved lip, a basin wider than the sheet
// with a rim and the next lip on its far side, foam where it lands, mist rising over the faces at the foot; a still
// drop runs without glint or foam; an outlet opens the rim of the last basin; the flow layer only over the water;
// the same salt, the same pixels; a place moves it.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import { stepSchema, type MapGame, type MapRecipe, type MapStepOf } from '../maprecipe';

const WATER = ['agua de hielo honda', 'agua de hielo', 'agua de hielo luz', 'nube', 'ojo'];
const ROCK = ['basalto hondo', 'basalto sombra', 'basalto', 'basalto claro', 'basalto luz', 'niebla sombra', 'niebla'];
const SNOWT = ['túnica luz', 'nieve sombra'];
const MATS: MapRecipe['materials'] = {
  nieve: { ramp: ['nieve honda', 'nieve sombra', 'nieve', 'túnica luz'] },
  agua: { ramp: WATER },
  roca: { ramp: ROCK },
};
const game: MapGame = { width: 16, height: 16, grid: Array.from({ length: 16 }, () => '.'.repeat(16)), decor: [] };
const SNOW: MapStepOf<'area'> = { step: 'area', material: 'nieve', shape: 'all' };
// the first lip at px (128, 32); it lands at 92 in a basin centred at 97; the second lip at 106, it lands at 156
const FALL: MapStepOf<'cataract'> = { step: 'cataract', material: 'agua', rock: 'roca', at: [8, 2], snow: ['túnica luz', 'nieve sombra'],
  drops: [{ length: 60, width: [8, 10], face: 16, pool: [22, 10] }, { length: 50, width: [6, 12], face: 16 }], flow: 'cascada', salt: 1621 };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number, layer = 'ground') => m.layers[layer]?.px[y * m.width + x] ?? null;
const row = (m: PaintedMap, y: number, set: string[]) => [...Array(m.width).keys()].filter(x => set.includes(at(m, x, y) ?? ''));
const span = (xs: number[]) => (xs.length ? xs[xs.length - 1] - xs[0] + 1 : 0);

describe('map cataract', () => {
  const m = paintMap(recipe([SNOW, FALL]), game);

  it('the sheet narrower than the cut: rock faces with thickness on both sides, the terrace beyond', () => {
    const near = (y: number, set: string[]) => row(m, y, set).filter(x => Math.abs(x - 128) < 50);
    const w = near(60, WATER).filter(x => Math.abs(x - 128) <= 13);
    expect(w.length).toBeGreaterThanOrEqual(14);
    expect(w.length).toBeLessThanOrEqual(26);
    const rock = near(60, [...ROCK, ...SNOWT]);
    expect(rock.filter(x => x < 118).length).toBeGreaterThanOrEqual(8);
    expect(rock.filter(x => x > 138).length).toBeGreaterThanOrEqual(8);
    expect(at(m, 20, 60)).toBe('nieve');
    expect(at(m, 128, 10)).toBe('nieve');                      // above the lip
    expect(w.filter(x => m.kind[60 * m.width + x] === 'agua').length).toBeGreaterThanOrEqual(w.length - 3);   // spray over the rock keeps its kind
    expect(m.kind[60 * m.width + 112]).toBe('roca');
  });

  it('the faces are rock with blocks: several tones in a row, the face toward the light lighter, snow on some', () => {
    let west = 0, nw = 0, east = 0, ne = 0, snow = 0;
    for (let y = 40; y < 88; y++) {
      for (const x of row(m, y, ROCK)) {
        if (Math.abs(x - 128) > 40) continue;
        const i = ROCK.indexOf(at(m, x, y)!);
        if (x < 128) { west += i; nw++; } else { east += i; ne++; }
      }
      snow += row(m, y, SNOWT).filter(x => Math.abs(x - 128) < 30).length;
    }
    expect(east / ne).toBeGreaterThan(west / nw + 0.4);
    expect(new Set(row(m, 70, ROCK).filter(x => x > 138 && x < 160).map(x => at(m, x, 70))).size).toBeGreaterThanOrEqual(3);
    expect(snow).toBeGreaterThan(20);
  });

  it('the lip is a curve: the glint lower in the middle than near the edges', () => {
    const glint = (x: number) => { for (let y = 28; y < 44; y++) if (at(m, x, y) === 'ojo') return y; return -1; };
    expect(glint(128)).toBeGreaterThan(glint(122));
    expect(glint(122)).toBeGreaterThan(0);
  });

  it('the basin: wider than the sheet, deep water under the cliff, a rim of rock on the far side, the next lip in it', () => {
    const wb = row(m, 98, WATER).filter(x => Math.abs(x - 128) < 40);
    expect(span(wb)).toBeGreaterThan(span(row(m, 80, WATER).filter(x => Math.abs(x - 128) < 30)) + 14);
    let rim = 0;
    for (let y = 104; y < 112; y++) rim += row(m, y, ROCK).filter(x => Math.abs(x - 128) > 10 && Math.abs(x - 128) < 30).length;
    expect(rim).toBeGreaterThan(20);
    expect(row(m, 108, WATER).filter(x => Math.abs(x - 128) < 8).length).toBeGreaterThanOrEqual(8);   // the next drop leaves
  });

  it('foam where it lands, and mist rising over the faces at the foot, not at the lip', () => {
    const pale = (y0: number, y1: number, far: number, p = m) => { let n = 0; for (let y = y0; y < y1; y++) n += row(p, y, ['nube', 'ojo']).filter(x => Math.abs(x - 128) > far && Math.abs(x - 128) < 40).length; return n; };
    const dry = paintMap(recipe([SNOW, { ...FALL, mist: 0 }]), game);
    expect(pale(138, 150, 11)).toBeGreaterThan(pale(138, 150, 11, dry) + 8);
    let foam = 0; for (let y = 88; y < 96; y++) foam += row(m, y, ['nube', 'ojo']).filter(x => Math.abs(x - 128) < 14).length;
    expect(foam).toBeGreaterThan(40);
    expect(pale(140, 156, 13)).toBeGreaterThan(pale(40, 56, 13) + 10);
  });

  it('the flow layer only over the water; without it the ground is the same; deterministic; a place moves it', () => {
    let n = 0;
    m.layers.cascada!.px.forEach((c, i) => { if (c !== null) { n++; expect(WATER).toContain(at(m, i % m.width, Math.floor(i / m.width))); } });
    expect(n).toBeGreaterThan(20);
    expect(paintMap(recipe([SNOW, { ...FALL, flow: undefined }]), game).layers.ground.px).toEqual(m.layers.ground.px);
    expect(paintMap(recipe([SNOW, FALL]), game).layers.ground.px).toEqual(m.layers.ground.px);
    expect((moveStep(FALL, 2, 1) as MapStepOf<'cataract'>).at).toEqual([10, 3]);
  });

  it('still: a stream that runs on, no glint at the lip and no foam; outlet: the rim of the last basin opens', () => {
    const s = paintMap(recipe([SNOW, { ...FALL, drops: [{ length: 60, width: [8, 8], face: 12, lip: 0, still: true }], mist: 0 }]), game);
    let pale = 0, all = 0;
    for (let y = 33; y < 92; y++) for (const x of row(s, y, WATER)) { all++; if (at(s, x, y) === 'ojo' || at(s, x, y) === 'nube') pale++; }
    expect(pale / all).toBeLessThan(0.08);
    const one = (outlet?: [number, number]) => paintMap(recipe([SNOW, { ...FALL, drops: [{ length: 60, width: [8, 10], face: 16, pool: [22, 10], ...(outlet ? { outlet } : {}) }] }]), game);
    const closed = one(), open = one([0, 6]);
    const south = (p: PaintedMap) => { let n = 0; for (let y = 104; y < 112; y++) n += row(p, y, WATER).filter(x => Math.abs(x - 128) < 6).length; return n; };
    expect(south(open)).toBeGreaterThan(south(closed) + 20);
  });

  it('foam: the churn of the foam, the spray and the mist on its layer (#356); the ground calmer under it, the rest the same', () => {
    const f = paintMap(recipe([SNOW, { ...FALL, foam: 'espuma' }]), game);
    const live = f.layers.espuma!.px;
    let n = 0, mist = 0;
    live.forEach((c, i) => {
      if (c === null) return;
      n++;
      expect(['nube', 'ojo']).toContain(c);
      const x = i % f.width, y = Math.floor(i / f.width);
      if (ROCK.includes(at(f, x, y) ?? '') && y > 120) mist++;                 // the mist over the rock of the faces
    });
    expect(n).toBeGreaterThan(150);
    expect(mist).toBeGreaterThan(20);
    // the ground under the foam of the basin: fewer glints, holes of the shallow water
    const count = (p: PaintedMap, c: string) => { let k = 0; for (let y = 86; y < 98; y++) k += row(p, y, [c]).filter(x => Math.abs(x - 128) < 16).length; return k; };
    expect(count(f, 'ojo')).toBeLessThan(count(m, 'ojo') / 2);
    expect(count(f, 'agua de hielo luz')).toBeGreaterThan(count(m, 'agua de hielo luz') + 10);
    // the layer over the ground gives back the old picture
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) expect(at(f, x, y, 'espuma') ?? at(f, x, y)).toBe(at(m, x, y));
  });

  it('fade: with no floor under it the last sheet goes on in threads that thin out, no heap of foam (#354)', () => {
    const plain = paintMap(recipe([SNOW, { ...FALL, mist: 0 }]), game);
    const open = paintMap(recipe([SNOW, { ...FALL, mist: 0, drops: [FALL.drops[0], { ...FALL.drops[1], fade: 30 }] }]), game);
    const wet = (p: PaintedMap, y: number) => row(p, y, WATER).filter(x => Math.abs(x - 128) < 30).length;
    const pale = (p: PaintedMap, y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) n += row(p, y, ['nube', 'ojo']).filter(x => Math.abs(x - 128) < 30).length; return n; };
    expect(pale(open, 152, 162)).toBeLessThan(pale(plain, 152, 162) / 2);   // no heap of foam at the foot
    expect(wet(open, 160)).toBeGreaterThan(8);                                // the threads go on past it
    expect(wet(open, 162)).toBeGreaterThan(wet(open, 182));                   // thinner the lower
    expect(wet(open, 190)).toBe(0);
    for (let y = 0; y < 140; y++) for (let x = 0; x < 256; x++) expect(at(open, x, y)).toBe(at(plain, x, y));   // above the foot, the same
    // with a pool it is ignored
    const pooled = paintMap(recipe([SNOW, { ...FALL, drops: [{ ...FALL.drops[0], fade: 30 }, FALL.drops[1]] }]), game);
    expect(pooled.layers.ground.px).toEqual(m.layers.ground.px);
  });

  it('the schema refuses a cataract with no drops', () => {
    expect(stepSchema.safeParse({ ...FALL, drops: [] }).success).toBe(false);
    expect(stepSchema.safeParse(FALL).success).toBe(true);
  });
});
