// @vitest-environment node
// The parapet: a wall drawn as one object from a path. Its top is one band of
// the same rubble in every run and turns at the corners without changing; the
// face hangs only under the runs that face south; a gap opens the wall between
// two pillars; the outline never runs straight; the same salt, the same pixels.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const STONE = ['tinta', 'túnica noche', 'túnica oscura', 'piedra sombra', 'piedra', 'túnica sombra', 'piedra clara', 'pergamino'];
const TOP_TONES = new Set(STONE.slice(3));
const MATS: MapRecipe['materials'] = {
  pasto: { ramp: ['prado hondo', 'prado', 'prado claro'] },
  muro: { ramp: STONE, moss: ['hoja sombra', 'prado hondo'] },
  pie: { ramp: ['copa honda', 'copa sombra', 'prado hondo', 'copa sombra', 'prado hondo'] },
  losas: { ramp: STONE, texture: 'rubble' },
};
const game: MapGame = { width: 24, height: 20, grid: Array.from({ length: 20 }, () => '.'.repeat(24)), decor: [] };
const GRASS: MapStepOf<'area'> = { step: 'area', material: 'pasto', shape: 'all' };
// a compound: the middle line at 2 cells from the border (px 32 and 352 across, 32 and 288 down), the top 8 px
// (28..35 on the north run), the face 10 px; the gate on the south run between u 11 and 13 (px 176..207)
const WALL: MapStepOf<'parapet'> = {
  step: 'parapet', id: 'muro', material: 'muro', path: [[2, 2], [22, 2], [22, 18], [2, 18]], closed: true,
  gaps: [[[11, 18], [13, 18]]], top: 0.5, face: 0.625, salt: 1401,
  sink: { material: 'pie' }, moss: {},
};
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const at = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[y * m.width + x];
const kind = (m: PaintedMap, x: number, y: number) => m.kind[y * m.width + x];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('map parapet', () => {
  const m = paintMap(recipe([GRASS, WALL]), game);

  it('one top: the same width and the same stones in the east-west and the north-south runs, turning at the corner', () => {
    // across the north run (columns 60..300) and across the west run (rows 60..260): px in the tones of the top
    const across = (xs: number[], cnt: (i: number) => number) => median(xs.map(cnt));
    const north = across([...Array(240).keys()].map(i => 60 + i), x => [...Array(16).keys()].filter(d => TOP_TONES.has(at(m, x, 20 + d)!)).length);
    const west = across([...Array(200).keys()].map(i => 60 + i), y => [...Array(16).keys()].filter(d => TOP_TONES.has(at(m, 20 + d, y)!)).length);
    expect(north).toBe(west);
    expect([7, 8]).toContain(north);
    // the corner: the band goes on through the vertex in the same tones, on both sides of it
    const tones = (x0: number, y0: number, x1: number, y1: number) => {
      const s = new Set<string>();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (kind(m, x, y) === 'muro') s.add(at(m, x, y)!);
      return s;
    };
    const eastOfCorner = tones(36, 29, 60, 34), southOfCorner = tones(29, 36, 34, 60), corner = tones(29, 29, 35, 35);
    for (const s of [eastOfCorner, southOfCorner, corner]) {
      expect(s.has('piedra clara')).toBe(true);
      expect(s.has('piedra sombra')).toBe(true);
    }
    for (let y = 29; y <= 34; y++) for (let x = 29; x <= 34; x++) expect(kind(m, x, y), `corner px ${x},${y}`).toBe('muro');
    // the outer corner is cut, not the vertex of a box
    expect(kind(m, 28, 28)).toBe('pasto');
  });

  it('the face hangs only under the east-west runs: the north-south runs show the top, a sliver in shadow and a shadow', () => {
    // under the north run (top 28..35): the face from 36 down, darker than the top; a dark line under the top
    let dark = 0;
    for (let x = 60; x < 300; x++) {
      expect(kind(m, x, 40), `face at ${x}`).toBe('muro');
      expect(TOP_TONES.has(at(m, x, 36)!) && at(m, x, 36) !== 'piedra sombra').toBe(false);
      if (['túnica oscura', 'piedra sombra'].includes(at(m, x, 42)!)) dark++;
    }
    expect(dark).toBeGreaterThan(40);
    // and under the south run (top 284..291) toward the outside
    for (let x = 60; x < 160; x++) expect(kind(m, x, 295)).toBe('muro');
    // east of the west run (top 28..35 across): one px of sliver, then grass (in shadow or not)
    for (let y = 60; y < 260; y++) {
      expect(kind(m, 38, y), `row ${y}`).not.toBe('muro');
      expect(kind(m, 40, y)).toBe('pasto');
    }
    // and west of it, toward the light: no face, no shadow
    for (let y = 60; y < 260; y++) expect(kind(m, 26, y)).toBe('pasto');
  });

  it('a gap opens the wall between two pillars, higher and wider than the wall', () => {
    for (let y = 270; y < 305; y++) for (const x of [180, 192, 203]) expect(kind(m, x, y), `${x},${y}`).not.toBe('muro');
    // the pillars: their caps stand over the top of the wall (284) by the rise and the bulge (5 px), at both sides
    for (const x of [170, 212]) {
      expect(kind(m, x, 279), `cap at ${x}`).toBe('muro');
      expect(kind(m, x, 278)).toBe('pasto');
    }
    // and they come down lower than the face of the wall beside them
    const footOf = (x: number) => { let y = 300; while (kind(m, x, y + 1) === 'muro') y++; return y; };
    expect(footOf(170)).toBeGreaterThan(footOf(120) - 1);
  });

  it('no straight edge longer than 32 px on its outline (the stones bite the edges)', () => {
    const inside = (x: number, y: number) => kind(m, x, y) === 'muro';
    let longest = 0, where = '';
    for (let x = 0; x < m.width - 1; x++) {
      let run = 0, side = 0;
      for (let y = 0; y < m.height; y++) {
        const a = inside(x, y), b = inside(x + 1, y), s = a === b ? 0 : a ? 1 : -1;
        run = s !== 0 && s === side ? run + 1 : s !== 0 ? 1 : 0; side = s;
        if (run > longest) { longest = run; where = `vertical x=${x} y=${y}`; }
      }
    }
    for (let y = 0; y < m.height - 1; y++) {
      let run = 0, side = 0;
      for (let x = 0; x < m.width; x++) {
        const a = inside(x, y), b = inside(x, y + 1), s = a === b ? 0 : a ? 1 : -1;
        run = s !== 0 && s === side ? run + 1 : s !== 0 ? 1 : 0; side = s;
        if (run > longest) { longest = run; where = `horizontal x=${x} y=${y}`; }
      }
    }
    expect(longest, where).toBeLessThanOrEqual(32);
  });

  it('the same salt, the same pixels; another salt, other stones', () => {
    const again = paintMap(recipe([GRASS, WALL]), game);
    expect(again.layers.ground.px).toEqual(m.layers.ground.px);
    const other = paintMap(recipe([GRASS, { ...WALL, salt: 77 }]), game);
    expect(other.layers.ground.px).not.toEqual(m.layers.ground.px);
  });

  it('a second parapet meets the first without a seam: it never paints over it and has no edge against it', () => {
    const cross: MapStepOf<'parapet'> = { step: 'parapet', material: 'muro', path: [[2, 9], [22, 9]], ends: 'flush', top: 0.25, face: 1, salt: 1411 };
    const two = paintMap(recipe([GRASS, WALL, cross]), game);
    // the west run of the compound is the same px with the other wall meeting it
    for (let y = 140; y < 165; y++) for (let x = 26; x <= 35; x++) expect(at(two, x, y), `${x},${y}`).toBe(at(m, x, y));
    // and the second one is there, its face down from its lip
    for (let x = 60; x < 300; x += 7) expect(kind(two, x, 155)).toBe('muro');
  });

  it('open: each end in a pillar, or flush; a run that is not east-west or north-south is refused', () => {
    const open: MapStepOf<'parapet'> = { step: 'parapet', material: 'muro', path: [[4, 6], [20, 6]], top: 0.5, face: 0.5 };
    const p = paintMap(recipe([GRASS, open]), game);
    expect(kind(p, 62, 89), 'the cap of the west pillar').toBe('muro');
    const f = paintMap(recipe([GRASS, { ...open, ends: 'flush' }]), game);
    expect(kind(f, 62, 89)).toBe('pasto');
    expect(() => paintMap(recipe([GRASS, { ...open, path: [[4, 6], [20, 9]] }]), game)).toThrow(/neither east-west nor north-south/);
  });

  it('a place lays it moved: the path and the gaps', () => {
    const moved = moveStep(WALL, 10, 5) as MapStepOf<'parapet'>;
    expect(moved.path[0]).toEqual([12, 7]);
    expect(moved.gaps?.[0]).toEqual([[21, 23], [23, 23]]);
  });

  it('rubble as the texture of an area: rounded stones with dark joints, not courses', () => {
    const r = paintMap(recipe([GRASS, { step: 'area', material: 'losas', shape: { rect: [2, 2, 6, 6] } }]), game);
    const used = new Map<string, number>();
    for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++) used.set(at(r, x, y)!, (used.get(at(r, x, y)!) ?? 0) + 1);
    expect(used.get('túnica oscura')! / 6400).toBeGreaterThan(0.12); // the joints
    expect(used.get('túnica oscura')! / 6400).toBeLessThan(0.45);
    expect(used.size).toBeGreaterThanOrEqual(4);
    // no row of joints straight across: not laid in courses
    for (let y = 40; y < 120; y++) {
      let n = 0;
      for (let x = 40; x < 120; x++) if (at(r, x, y) === 'túnica oscura') n++;
      expect(n, `row ${y}`).toBeLessThan(60);
    }
  });
});
