// @vitest-environment node
// The spill: running water falling down a face. A band of water from its head to its foot, a little wider below, in
// streaks; a lit lip at the head; the edges darker, the deep tone away from the light; foam where it lands; light
// streaks on a flow layer only over the water; the same salt, the same pixels.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const WATER = ['agua de hielo honda', 'agua de hielo', 'agua de hielo luz', 'nube', 'ojo'];
const MATS: MapRecipe['materials'] = {
  muro: { ramp: ['basalto hondo', 'basalto sombra', 'basalto', 'basalto claro'] },
  agua: { ramp: WATER },
};
const game: MapGame = { width: 12, height: 12, grid: Array.from({ length: 12 }, () => '.'.repeat(12)), decor: [] };
const WALL: MapStepOf<'area'> = { step: 'area', material: 'muro', shape: 'all' };
// the head at px (96, 32), 64 px down: the foot at px 96
const FALL: MapStepOf<'spill'> = { step: 'spill', material: 'agua', at: [6, 2], length: 64, width: [5, 8], flow: 'cascada', salt: 1491 };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number, layer = 'ground') => m.layers[layer]?.px[y * m.width + x] ?? null;
const wet = (m: PaintedMap, y: number) => [...Array(m.width).keys()].filter(x => WATER.includes(at(m, x, y) ?? ''));

describe('map spill', () => {
  const m = paintMap(recipe([WALL, FALL]), game);

  it('a band of water from the head to the foot, wider below; the wall around it stays', () => {
    expect(wet(m, 40).length).toBeGreaterThanOrEqual(9);
    expect(wet(m, 40).length).toBeLessThanOrEqual(13);
    expect(wet(m, 85).length).toBeGreaterThan(wet(m, 40).length);
    expect(at(m, 96, 25)).toBe('basalto');                       // above the head, the wall
    expect(at(m, 60, 60)).toBe('basalto');                       // beside it, the wall
  });

  it('the lip at the head is the glint; the body is streaks of several tones, edges darker', () => {
    expect(wet(m, 32).every(x => at(m, x, 32) === 'ojo')).toBe(true);
    const tones = new Set<string>();
    for (let y = 40; y < 90; y++) for (const x of wet(m, y)) tones.add(at(m, x, y)!);
    expect(tones.size).toBeGreaterThanOrEqual(3);
    const row = wet(m, 60);
    expect(at(m, row[row.length - 1], 60)).toBe('agua de hielo honda');   // the east edge, away from the light
    expect(at(m, row[0], 60)).toBe('agua de hielo');
  });

  it('foam where it lands', () => {
    const foam = [...Array(40).keys()].filter(i => at(m, 80 + i, 95) === 'nube' || at(m, 80 + i, 95) === 'ojo');
    expect(foam.length).toBeGreaterThan(4);
  });

  it('the flow layer: light streaks only over the water, the ground left alone', () => {
    const flow = m.layers.cascada!;
    let n = 0;
    flow.px.forEach((c, i) => { if (c !== null) { n++; expect(WATER).toContain(at(m, i % m.width, Math.floor(i / m.width))); } });
    expect(n).toBeGreaterThan(20);
    const none = paintMap(recipe([WALL, { ...FALL, flow: undefined }]), game);
    expect(none.layers.ground.px).toEqual(m.layers.ground.px);
  });

  it('deterministic, and laid by a place it moves', () => {
    expect(paintMap(recipe([WALL, FALL]), game).layers.ground.px).toEqual(m.layers.ground.px);
    expect((moveStep(FALL, 2, 1) as MapStepOf<'spill'>).at).toEqual([8, 3]);
  });
});

describe('map spill: ledges and a broken lip (unwritten-dao #339, the wall of falls of the Campana Alta)', () => {
  const ROCK = 'muro';
  const plain = paintMap(recipe([WALL, FALL]), game);
  const leap = paintMap(recipe([WALL, { ...FALL, ledges: [{ at: 0.5, widen: 4, shift: 3 }], rock: ROCK }]), game);
  const ledgeY = 32 + 32;   // the head at 32, 64 px long: half way down

  it('a ledge: a lip of rock across the water, a band of foam under it, the water wider and moved below', () => {
    const row = wet(leap, ledgeY - 2), lip = [...Array(leap.width).keys()].filter(x => at(leap, x, ledgeY) === 'basalto');
    expect(lip.length).toBeGreaterThanOrEqual(row.length - 2);               // the rock lip crosses the fall
    const foam = wet(leap, ledgeY + 1).filter(x => at(leap, x, ledgeY + 1) === 'ojo');
    expect(foam.length).toBeGreaterThanOrEqual(wet(leap, ledgeY + 1).length - 1);
    expect(wet(leap, ledgeY + 12).length).toBeGreaterThanOrEqual(wet(plain, ledgeY + 12).length + 6);
    const mid = (m: PaintedMap, y: number) => { const r = wet(m, y); return (r[0] + r[r.length - 1]) / 2; };
    expect(mid(leap, ledgeY + 12) - mid(plain, ledgeY + 12)).toBeGreaterThanOrEqual(2);
    // above the ledge, the same water
    for (let y = 33; y < ledgeY - 2; y++) expect(wet(leap, y)).toEqual(wet(plain, y));
  });

  it('ragged: the heads of the columns at different heights, none higher than the head', () => {
    const broken = paintMap(recipe([WALL, { ...FALL, ragged: 5 }]), game);
    const firstWet = (x: number) => { for (let y = 0; y < 96; y++) if (WATER.includes(at(broken, x, y) ?? '')) return y; return -1; };
    const heads = new Set(wet(broken, 45).map(firstWet));
    expect(heads.size).toBeGreaterThanOrEqual(2);
    expect(Math.min(...heads)).toBeGreaterThanOrEqual(32);
    // with ledges, their lip broken too: the rock of the ledge on more than one row
    const both = paintMap(recipe([WALL, { ...FALL, ragged: 4, ledges: [{ at: 0.5 }], rock: ROCK }]), game);
    const lipRows = new Set<number>();
    for (let y = 58; y < 70; y++) for (let x = 85; x < 108; x++) if (at(both, x, y) === 'basalto' && at(both, x, y - 1) === 'basalto claro' && WATER.includes(at(both, x, y + 1) ?? '')) lipRows.add(y);
    expect(lipRows.size).toBeGreaterThanOrEqual(2);
    // without the new fields, the px of before
    expect(paintMap(recipe([WALL, { ...FALL, ledges: [], ragged: 0 }]), game).layers.ground.px).toEqual(plain.layers.ground.px);
  });
});

describe('map spill: basins, a fall of changing width, two threads, wet rock (unwritten-dao #339, fifth round)', () => {
  const plain = paintMap(recipe([WALL, FALL]), game);
  const ledgeY = 32 + 32;

  it('a basin over a ledge: still water wider than the fall above the lip, a rim of rock, foam where it overflows', () => {
    const m = paintMap(recipe([WALL, { ...FALL, ledges: [{ at: 0.5, pool: 6 }], rock: 'muro' }]), game);
    const row = (y: number) => wet(m, y);
    expect(row(ledgeY - 3).length).toBeGreaterThanOrEqual(wet(plain, ledgeY - 3).length + 6);
    const rim = [...Array(m.width).keys()].filter(x => at(m, x, ledgeY - 3) === 'basalto sombra' || at(m, x, ledgeY - 3) === 'basalto claro');
    expect(rim.length).toBeGreaterThanOrEqual(2);
    let foam = 0; for (let y = ledgeY - 3; y <= ledgeY + 2; y++) for (const x of row(y)) if (at(m, x, y) === 'ojo') foam++;
    expect(foam).toBeGreaterThan(4);
  });

  it('wobble: the width swells and thins along the fall instead of only widening', () => {
    const m = paintMap(recipe([WALL, { ...FALL, wobble: 3 }]), game);
    const w = [...Array(60).keys()].map(i => wet(m, 34 + i).length);
    let ups = 0, downs = 0;
    for (let i = 4; i < w.length; i += 4) { if (w[i] > w[i - 4]) ups++; if (w[i] < w[i - 4]) downs++; }
    expect(ups).toBeGreaterThan(0);
    expect(downs).toBeGreaterThan(0);
  });

  it('split: two threads with the face showing between them, whole above and below', () => {
    const m = paintMap(recipe([WALL, { ...FALL, width: [8, 10], split: [0.3, 0.7] }]), game);
    expect(WATER).not.toContain(at(m, 96, 32 + 32));                     // half way: the middle is the wall
    expect(WATER).toContain(at(m, 96, 36));                              // near the head: water
    const r = wet(m, 64);
    expect(r[r.length - 1] - r[0] + 1).toBeGreaterThan(r.length);       // the water on both sides of the gap
  });

  it('wet: the face beside the fall a tone down, with flecks of spray; the water the same', () => {
    const m = paintMap(recipe([WALL, { ...FALL, wet: 4 }]), game);
    let darker = 0;
    for (let y = 40; y < 90; y++) { const r = wet(plain, y); for (const x of [r[0] - 2, r[r.length - 1] + 2]) if (at(m, x, y) === 'basalto sombra') darker++; }
    expect(darker).toBeGreaterThan(40);
    let flecks = 0; for (let y = 40; y < 90; y++) for (let x = 60; x < 130; x++) if (!WATER.includes(at(plain, x, y) ?? '') && at(m, x, y) === 'nube') flecks++;
    expect(flecks).toBeGreaterThan(2);
    for (let y = 40; y < 90; y++) expect(wet(m, y).filter(x => at(m, x, y) !== 'nube').map(x => at(m, x, y))).toEqual(wet(plain, y).filter(x => at(plain, x, y) !== 'nube').map(x => at(plain, x, y)));
  });
});

describe('map spill: the foam that moves (unwritten-dao #356)', () => {
  const ROCK = 'muro';
  const FULL: MapStepOf<'spill'> = { ...FALL, ledges: [{ at: 0.4, pool: 6 }, { at: 0.7 }], rock: ROCK, wet: 4, foot: [14, 5] };
  const old = paintMap(recipe([WALL, FULL]), game), live = paintMap(recipe([WALL, { ...FULL, foam: 'espuma' }]), game);

  it('the churn of the foam and the spray on its layer, only foam and glint; over the ground it gives back the old picture', () => {
    let n = 0, overRock = 0;
    live.layers.espuma!.px.forEach((c, i) => {
      if (c === null) return;
      n++;
      expect(['nube', 'ojo']).toContain(c);
      if (!WATER.includes(at(live, i % live.width, Math.floor(i / live.width)) ?? '')) overRock++;   // the spray over the wet rock
    });
    expect(n).toBeGreaterThan(40);
    expect(overRock).toBeGreaterThan(2);
    for (let y = 0; y < old.height; y++) for (let x = 0; x < old.width; x++) expect(at(live, x, y, 'espuma') ?? at(live, x, y)).toBe(at(old, x, y));
  });

  it('the ground under it calmer: fewer glints at the foot, the shallow water showing through', () => {
    const count = (m: PaintedMap, c: string) => { let k = 0; for (let y = 90; y < 102; y++) for (let x = 78; x < 114; x++) if (at(m, x, y) === c) k++; return k; };
    expect(count(live, 'ojo')).toBeLessThan(count(old, 'ojo') / 2);
    expect(count(live, 'agua de hielo luz')).toBeGreaterThan(count(old, 'agua de hielo luz'));
  });
});

describe('map spill: a lip of rock at the head (unwritten-dao #394, the mouths of the wall of falls)', () => {
  const LIP: MapStepOf<'spill'> = { ...FALL, rock: 'muro', lip: { bow: 3, back: 3, mouth: 4, rim: 2 } };
  const m = paintMap(recipe([WALL, LIP]), game);
  const glint = (x: number) => [...Array(m.height).keys()].find(y => at(m, x, y) === 'ojo') ?? -1;

  it('the head bows toward the viewer: the glint lower in the middle than at the sides', () => {
    expect(glint(96) - glint(92)).toBeGreaterThanOrEqual(2);
    expect(glint(96) - glint(100)).toBeGreaterThanOrEqual(2);
  });

  it('above the lip the calm water, above it the dark mouth, above it the rock lit on its rim', () => {
    expect(['agua de hielo honda', 'agua de hielo', 'agua de hielo luz']).toContain(at(m, 96, glint(96) - 1));
    expect(WATER).toContain(at(m, 96, 30));
    expect(['basalto hondo', 'basalto sombra']).toContain(at(m, 96, 27));
    expect(at(m, 96, 23)).toBe('basalto claro');
  });

  it('under the glint the sheet breaks in strands: dark rock between some columns', () => {
    let rock = 0;
    for (let x = 92; x <= 100; x++) for (let y = glint(x) + 2; y < glint(x) + 8; y++) if (at(m, x, y) === 'basalto hondo') rock++;
    expect(rock).toBeGreaterThan(0);
    const plain = paintMap(recipe([WALL, { ...FALL, rock: 'muro' }]), game);
    expect(plain.layers.ground.px).not.toEqual(m.layers.ground.px);
    expect(at(plain, 96, 32)).toBe('ojo');                                    // without it, the straight lit head
  });
});
