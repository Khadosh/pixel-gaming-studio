// @vitest-environment node
// The grove step: trees planted by recipe, drawn by one hand.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';
import { tallFactor } from './plant';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../commands';

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const SHADE = { 'hoja clara': 'hoja', bambú: 'hoja', 'bambú claro': 'hoja', pasto: 'hoja', hoja: 'hoja sombra' };
function game(rows?: string[]): MapGame { const g = rows ?? Array.from({ length: 8 }, () => '.'.repeat(12)); return { width: g[0].length, height: g.length, grid: g }; }
function recipe(steps: MapRecipe['steps'], g = game()): MapRecipe {
  return { game: g, margin: [2, 2], shade: SHADE, materials: { pasto: { ramp: GRASS, base: 4 } }, steps };
}
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const P = (u: number, v: number): [number, number] => [32 + u * 16, 32 + v * 16];
const range0 = (n: number) => [...Array(n).keys()];
const FLOOR = { step: 'area', id: 'isla', material: 'pasto', shape: 'all' } as const;
/** The mean column of the crown px of this color. */
const meanX = (m: PaintedMap, c: string) => { let n = 0, sx = 0; m.layers.copas.px.forEach((p, i) => { if (p === c) { n++; sx += i % m.width; } }); return sx / n; };

describe('map recipe: grove', () => {
  it('a tree has its trunk on the ground and an outlined, lit crown in front; the one in front covers the one behind and the light casts them', () => {
    const one: MapStepOf<'grove'> = { step: 'grove', trees: [[3.5, 5.9, 'round', 3]] };
    const m = paintMap(recipe([FLOOR, one]), game());
    const [fx, fy] = P(3.5, 5.9).map(Math.round);
    const bark = ['madera clara', 'madera', 'madera sombra'];
    expect(bark).toContain(at(m, 'ground', fx, fy - 3));                // the trunk, on the ground
    expect(at(m, 'copas', fx, fy - 3)).toBeNull();                      // under the belly of the crown
    const crown = m.layers.copas.px.filter((c): c is string => c !== null);
    for (const c of ['túnica noche', 'hoja sombra', 'hoja', 'bambú']) expect(crown).toContain(c);
    // the outline: the topmost pixel of the crown in the trunk's column is the dark line
    let top = 0;
    while (at(m, 'copas', fx, top) === null) top++;
    expect(at(m, 'copas', fx, top)).toBe('túnica noche');
    // a pine standing in front (lower foot), overlapping: its pixels win where they meet
    const two: MapStepOf<'grove'> = { step: 'grove', trees: [[4.6, 6.9, 'pine', 3], [3.5, 5.9, 'round', 3]] };
    const front = paintMap(recipe([FLOOR, two]), game());
    const pineOnly = paintMap(recipe([FLOOR, { step: 'grove', trees: [[4.6, 6.9, 'pine', 3]] }]), game());
    let shared = 0;
    for (let i = 0; i < front.layers.copas.px.length; i++) {
      const p = pineOnly.layers.copas.px[i];
      if (p !== null && m.layers.copas.px[i] !== null) { shared++; expect(front.layers.copas.px[i]).toBe(p); }
    }
    expect(shared).toBeGreaterThan(10);
    // a later light step casts their shadows (and leaves the bark alone)
    const lit = paintMap(recipe([FLOOR, one, { step: 'light', faces: false, on: ['pasto'] }]), game());
    const dark = paintMap(recipe([FLOOR, one, { step: 'light', faces: false, on: ['pasto'], trees: false }]), game());
    let shaded = 0;
    for (let i = 0; i < lit.layers.ground.px.length; i++) if (lit.layers.ground.px[i] !== dark.layers.ground.px[i]) shaded++;
    expect(shaded).toBeGreaterThan(60);
    expect(at(lit, 'ground', fx, fy - 3)).toBe(at(m, 'ground', fx, fy - 3));
  });

  it('a zone plants by density and salt inside its band, never on a walkable cell nor too close, the same every time', () => {
    // a walkable room in the middle of the grid: the trees go around it
    const rows = Array.from({ length: 8 }, (_, v) => Array.from({ length: 12 }, (_, u) => (u >= 3 && u < 9 && v >= 2 && v < 6 ? '.' : '#')).join(''));
    const zone: MapStepOf<'grove'> = { step: 'grove', zones: [{ within: 'isla', band: [2, 200], count: 30, spacing: 14, salt: 77 }], clear: [[0, 0, 2]] };
    const a = paintMap(recipe([FLOOR, zone], game(rows)), game(rows));
    const b = paintMap(recipe([FLOOR, zone], game(rows)), game(rows));
    expect(a.layers.copas.px).toEqual(b.layers.copas.px);
    // the feet: the lit left edge of the bark at its lowest row (a trunk leans, so nothing of it under nor beside, not only right under)
    const bark = ['madera clara', 'madera', 'madera sombra'];
    const feet: [number, number][] = [];
    for (let y = 1; y < a.height; y++) for (let x = 1; x < a.width - 1; x++) {
      const c = at(a, 'ground', x, y);
      if (c !== 'madera clara' || at(a, 'ground', x - 1, y) !== 'túnica noche') continue;
      let under = false;
      for (let dx = -2; dx <= 6; dx++) if (bark.includes(at(a, 'ground', x + dx, y + 1) ?? '')) under = true;
      if (!under) feet.push([x, y]);
    }
    expect(feet.length).toBeGreaterThan(8);
    for (const [x, y] of feet) {
      const u = Math.floor((x + 2 - 32) / 16), v = Math.floor((y - 32) / 16);
      const walk = u >= 0 && v >= 0 && u < 12 && v < 8 && rows[v][u] === '.';
      expect(walk, `foot at ${u},${v}`).toBe(false);
      expect(u >= -1 && u <= 1 && v >= -1 && v <= 1, `foot in the cleared spot ${u},${v}`).toBe(false);
    }
    for (const p of feet) for (const q of feet) if (p !== q) expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThanOrEqual(12);
  });

  it('a bush has no trunk: its lumps sit on the ground layer at its foot, outlined, and nothing is scattered on it', () => {
    const m = paintMap(recipe([FLOOR, { step: 'grove', trees: [[3.5, 5.9, 'bush', 1]] }]), game());
    const [fx, fy] = P(3.5, 5.9).map(Math.round);
    expect(m.layers.copas?.px.some(c => c !== null) ?? false).toBe(false);   // nothing in front of people
    const bark = ['madera clara', 'madera', 'madera sombra'];
    expect(m.layers.ground.px.some(c => bark.includes(c!))).toBe(false);     // no trunk
    let top = fy;
    while (at(m, 'ground', fx, top - 1) !== 'pasto' && at(m, 'ground', fx, top - 1) !== 'hoja clara' && top > fy - 30) top--;
    expect(fy - top).toBeGreaterThanOrEqual(10);                                  // about a cell tall
    expect(fy - top).toBeLessThanOrEqual(18);
    expect(at(m, 'ground', fx, top)).toBe('túnica noche');                        // the outline on top
    expect(m.kind[(fy - 6) * m.width + fx]).toBe('');                             // not a material: no tuft lands on it
    // the light casts it without the stripe of a trunk; with crowns, a round soft shadow two tones deep in its core
    const flat = paintMap(recipe([FLOOR, { step: 'grove', trees: [[3.5, 5.9, 'round', 3]] }, { step: 'light', faces: false, on: ['pasto'] }]), game());
    const round = paintMap(recipe([FLOOR, { step: 'grove', trees: [[3.5, 5.9, 'round', 3]] }, { step: 'light', faces: false, on: ['pasto'], crowns: [0.6, 0.32, 0.1, 0.8] }]), game());
    const deep = (p: PaintedMap) => p.layers.ground.px.filter(c => c === 'hoja sombra').length;
    const lit = (p: PaintedMap) => p.layers.ground.px.filter(c => c === 'hoja').length + deep(p);
    expect(deep(round)).toBeGreaterThan(deep(flat) + 40);   // the core is two tones down
    expect(lit(round)).toBeGreaterThan(lit(flat));          // and it covers more ground
    // under the foot: in the shadow
    expect(['hoja', 'hoja sombra']).toContain(at(round, 'ground', fx + 2, fy + 1));
  });

  it('drape: green hangs from the lip of a cliff under a crown that leans over it, and nowhere else', () => {
    const rows = Array.from({ length: 8 }, () => '.'.repeat(12));
    const cliff: MapStepOf<'area'> = { step: 'area', id: 'cara', material: 'roca', shape: { rect: [-2, 6, 16, 4] } };
    const r = (drape: boolean) => {
      const base = recipe([FLOOR, cliff, { step: 'grove', trees: [[3.5, 5.8, 'round', 3], [8.5, 3.0, 'round', 3]], ...(drape ? { drape: [['roca'], 10] as [string[], number] } : {}) }], game(rows));
      base.materials.roca = { ramp: ['piedra sombra', 'piedra', 'piedra clara'], base: 1 };
      return paintMap(base, game(rows));
    };
    const off = r(false), on = r(true);
    const green = new Set(['túnica noche', 'hoja sombra', 'hoja', 'bambú']);
    let hung = 0, elsewhere = 0;
    for (let i = 0; i < on.layers.ground.px.length; i++) {
      if (on.layers.ground.px[i] === off.layers.ground.px[i]) continue;
      const x = i % on.width, y = Math.floor(i / on.width);
      if (on.kind[i] === 'roca' && green.has(on.layers.ground.px[i]!) && Math.abs(x - P(3.5, 0)[0]) < 20) hung++;
      else elsewhere++;
    }
    expect(hung).toBeGreaterThan(30);    // under the tree by the lip
    expect(elsewhere).toBe(0);           // the tree far from the lip hangs nothing
  });

  it('a zone of bushes never moves a tree: the trees come out the same with or without it', () => {
    const rows = Array.from({ length: 8 }, (_, v) => Array.from({ length: 12 }, (_, u) => (u >= 3 && u < 9 && v >= 2 && v < 6 ? '.' : '#')).join(''));
    const trees = { within: 'isla', band: [2, 200] as [number, number], count: 20, spacing: 14, salt: 77 };
    const bushes = { within: 'isla', band: [2, 200] as [number, number], count: 30, spacing: 8, salt: 78, size: [0.6, 1] as [number, number], kinds: { bush: 1, round: 0, pine: 0, plum: 0 } };
    const fixed: [number, number, 'bush', number][] = [];
    for (let u = 0; u < 12; u += 2) fixed.push([u + 0.5, 0.9, 'bush', 1], [u + 0.5, 7.9, 'bush', 1]);
    const a = paintMap(recipe([FLOOR, { step: 'grove', zones: [trees] }], game(rows)), game(rows));
    const b = paintMap(recipe([FLOOR, { step: 'grove', zones: [trees, bushes], trees: fixed }], game(rows)), game(rows));
    expect(b.layers.copas.px).toEqual(a.layers.copas.px);
    expect(b.layers.ground.px.filter((c, i) => c !== a.layers.ground.px[i]).length).toBeGreaterThan(200);   // the bushes are there
  });

  it('tall: some zone trees taller by their factor, the same trees on the same feet; one that would cover what is kept stays at its size', () => {
    const rows = Array.from({ length: 8 }, (_, v) => Array.from({ length: 12 }, (_, u) => (u >= 3 && u < 9 && v >= 2 && v < 6 ? '.' : '#')).join(''));
    const zone = { within: 'isla', band: [2, 200] as [number, number], count: 24, spacing: 14, salt: 77, size: [2, 2.4] as [number, number] };
    // the feet: the lowest row of each trunk (the lit left edge of the bark on its outline, nothing of bark under it)
    const feet = (m: PaintedMap) => {
      const out: [number, number][] = [];
      for (let y = 1; y < m.height - 1; y++) for (let x = 1; x < m.width - 1; x++)
        if (at(m, 'ground', x, y) === 'madera clara' && at(m, 'ground', x - 1, y) === 'túnica noche' && !['madera clara', 'madera', 'madera sombra'].includes(at(m, 'ground', x, y + 1) ?? '')) out.push([x, y]);
      return out;
    };
    const near = (p: [number, number], q: [number, number][]) => q.some(([x, y]) => Math.abs(x - p[0]) <= 2 && Math.abs(y - p[1]) <= 1);
    const tops = (m: PaintedMap) => { let n = 0; for (let y = 0; y < 40; y++) for (let x = 0; x < m.width; x++) if (at(m, 'copas', x, y) !== null) n++; return n; };
    const g = game(rows);
    const a = paintMap(recipe([FLOOR, { step: 'grove', id: 'g', zones: [zone] }], g), g);
    const b = paintMap(recipe([FLOOR, { step: 'grove', id: 'g', zones: [{ ...zone, tall: [[0.3, 1.25], [0.3, 1.5]] }] }], g), g);
    expect({ ...b.planted!.g, tall: 0 }).toEqual({ ...a.planted!.g, tall: 0 });   // the same trees, of the same kinds
    expect(b.planted!.g.tall).toBeGreaterThan(3);
    expect(feet(a).length).toBeGreaterThan(6);
    // on the same feet: a taller trunk leans a px more, and one in front may now cover the foot of one behind
    const fb = feet(b), kept = feet(a).filter(p => near(p, fb)).length;
    expect(kept / feet(a).length).toBeGreaterThanOrEqual(0.9);
    expect(tops(b)).toBeGreaterThan(tops(a));                          // taller crowns reach higher up the picture
    // cells to keep: a tree that would cover one when taller keeps its size, and none is lost
    const held: MapGame = { ...game(rows), occupied: [[1, 1], [10, 1], [1, 6], [10, 6], [5, 0]] };
    const c = paintMap(recipe([FLOOR, { step: 'grove', id: 'g', zones: [zone] }], held), held);
    const d = paintMap(recipe([FLOOR, { step: 'grove', id: 'g', zones: [{ ...zone, tall: [[0.6, 1.5]] }] }], held), held);
    expect({ ...d.planted!.g, tall: 0 }).toEqual({ ...c.planted!.g, tall: 0 });
    for (const [u, v] of held.occupied!) {
      const [x0, y0] = P(u, v);
      for (let y = y0 + 1; y < y0 + 15; y++) for (let x = x0 + 1; x < x0 + 15; x++) expect(at(d, 'copas', x, y), `${u},${v}`).toBe(null);
    }
    expect(tops(d)).toBeGreaterThan(tops(c));
    // avoid: a taller crown never reaches more of a mask to avoid (a path across the top) than its own size did
    const PATH: MapStepOf<'area'> = { step: 'area', id: 'paso', material: 'pasto', shape: { rect: [-2, -2, 16, 2.4] } };
    const onPath = (m: PaintedMap) => { let n = 0; for (let y = 0; y < 32 + 0.4 * 16; y++) for (let x = 0; x < m.width; x++) if (at(m, 'copas', x, y) !== null) n++; return n; };
    const e = paintMap(recipe([FLOOR, PATH, { step: 'grove', id: 'g', avoid: ['paso'], zones: [zone] }], g), g);
    const f = paintMap(recipe([FLOOR, PATH, { step: 'grove', id: 'g', avoid: ['paso'], zones: [{ ...zone, tall: [[0.6, 1.5]] }] }], g), g);
    const free = paintMap(recipe([FLOOR, PATH, { step: 'grove', id: 'g', zones: [{ ...zone, tall: [[0.6, 1.5]] }] }], g), g);
    expect(onPath(free)).toBeGreaterThan(onPath(e));                    // without avoid the tall crowns do reach it
    expect(onPath(f)).toBeLessThanOrEqual(onPath(e));
    expect({ ...f.planted!.g, tall: 0 }).toEqual({ ...e.planted!.g, tall: 0 });
    expect(tallFactor([[0.2, 1.25], [0.1, 1.4]], 0.1)).toBe(1.25);
    expect(tallFactor([[0.2, 1.25], [0.1, 1.4]], 0.25)).toBe(1.4);
    expect(tallFactor([[0.2, 1.25], [0.1, 1.4]], 0.5)).toBe(1);
    expect(tallFactor(undefined, 0)).toBe(1);
  });

  it('no crown nor its shadow covers an occupied cell or a kept one: a zone tree that would is not planted, a given one is an error', () => {
    const rows = Array.from({ length: 8 }, () => '#'.repeat(12));
    const zone: MapStepOf<'grove'> = { step: 'grove', zones: [{ within: 'isla', band: [2, 400], count: 60, spacing: 9, salt: 91 }] };
    const free = game(rows), held: MapGame = { ...game(rows), occupied: [[6, 4]] };
    const covered = (m: PaintedMap, u: number, v: number) => {
      let n = 0;
      const [x0, y0] = P(u, v);
      for (let y = y0 + 1; y < y0 + 15; y++) for (let x = x0 + 1; x < x0 + 15; x++) if (at(m, 'copas', x, y) !== null) n++;
      return n;
    };
    const before = paintMap(recipe([FLOOR, zone], free), free);
    expect(covered(before, 6, 4) + covered(before, 2, 2)).toBeGreaterThan(0);          // a thick zone covers them
    const after = paintMap(recipe([FLOOR, { ...zone, keep: [[2, 2, 1, 1]] }], held), held);
    expect(covered(after, 6, 4)).toBe(0);
    expect(covered(after, 2, 2)).toBe(0);
    // a tree given right under someone is a mistake of the recipe, not something to hide
    expect(() => paintMap(recipe([FLOOR, { step: 'grove', trees: [[6.5, 5.9, 'round', 3]] }], held), held)).toThrow(/covers/);
    expect(() => paintMap(recipe([FLOOR, { step: 'grove', trees: [[9.5, 2.9, 'round', 2]] }], held), held)).not.toThrow();
  });

  it('behind: no crown of a tree behind a standing box covers it; a tree in front may, and a zone tree behind is not planted', () => {
    const rows = Array.from({ length: 8 }, () => '#'.repeat(12));
    const g = game(rows), box: [number, number, number, number] = [5, 1, 2, 3];   // a sprite of 2 × 3 cells standing on row 3
    const back: MapStepOf<'grove'> = { step: 'grove', trees: [[6, 3.5, 'round', 3]], behind: [box] };
    expect(() => paintMap(recipe([FLOOR, back], g), g)).toThrow(/behind/);
    // the same tree with its foot under the bottom of the box is in front of it: its crown may cover it (keep would not let it)
    const front: MapStepOf<'grove'> = { step: 'grove', trees: [[6, 4.9, 'round', 3]], behind: [box] };
    expect(() => paintMap(recipe([FLOOR, front], g), g)).not.toThrow();
    expect(() => paintMap(recipe([FLOOR, { ...front, behind: undefined, keep: [box] }], g), g)).toThrow(/covers/);
    // a zone: no crown of a tree whose foot is above row 4 lands on the box
    const zone: MapStepOf<'grove'> = { step: 'grove', zones: [{ within: 'isla', band: [2, 400], count: 60, spacing: 9, salt: 91 }] };
    const planted = (m: PaintedMap) => { let n = 0; for (let y = P(5, 1)[1] + 1; y < P(5, 4)[1] - 1; y++) for (let x = P(5, 1)[0] + 1; x < P(7, 1)[0] - 1; x++) if (at(m, 'copas', x, y) !== null) n++; return n; };
    const free = planted(paintMap(recipe([FLOOR, zone], g), g));
    expect(free).toBeGreaterThan(0);
    // what still covers it is only the crown of a tree in front (its foot on row 4 or below): less than before
    expect(planted(paintMap(recipe([FLOOR, { ...zone, behind: [box] }], g), g))).toBeLessThan(free);
  });

  it('out: bushes on the border of a mask move out across it and spill over what lies past it, never over a north border', () => {
    const rows = Array.from({ length: 8 }, () => '#'.repeat(12));
    const isle: MapStepOf<'area'> = { step: 'area', id: 'isle', material: 'pasto', shape: { blobs: [[6, 4, 4, 2.6, 0]] } };
    const bare = { step: 'area', material: 'roca', shape: 'all' } as const;
    const rec = (steps: MapRecipe['steps']) => { const r = recipe(steps, game(rows)); r.materials.roca = { ramp: ['piedra sombra', 'piedra', 'piedra clara'], base: 1 }; return r; };
    const zone = (out?: number): MapStepOf<'grove'> => ({ step: 'grove', zones: [{ within: 'isle', band: [0, 3], count: 40, spacing: 8, salt: 93, size: [1, 1.2], kinds: { bush: 1, round: 0, pine: 0, plum: 0 }, ...(out ? { out } : {}) }] });
    const g = game(rows);
    const base = paintMap(rec([bare, isle]), g);
    const inside = (i: number) => base.kind[i] !== 'roca';
    const past = (m: PaintedMap) => {
      let south = 0, north = 0;
      const [, cy] = P(6, 4);
      for (let i = 0; i < m.layers.ground.px.length; i++) {
        if (inside(i) || m.layers.ground.px[i] === base.layers.ground.px[i]) continue;
        // a few px past the border: not the body of a bush sitting on it
        const x = i % m.width, y = Math.floor(i / m.width);
        let deep = true;
        for (let d = 1; d <= 3; d++) if (inside(i - d * m.width) || inside(i + d * m.width) || inside(i - d) || inside(i + d)) deep = false;
        if (!deep || x < 0) continue;
        if (y > cy) south++; else north++;
      }
      return { south, north };
    };
    const still = past(paintMap(rec([bare, isle, zone()]), g));
    const moved = past(paintMap(rec([bare, isle, zone(8)]), g));
    expect(moved.south).toBeGreaterThan(still.south + 60);
    expect(moved.north).toBeLessThanOrEqual(still.north + 10);
  });
  it('a tree is a trunk with branches and the leaves go on them: a broadleaf is a full, uneven crown of masses at the ends of its branches, a branch showing in a gap or two, the big mass to either side by the salt', () => {
    const bark = new Set(['madera clara', 'madera', 'madera sombra']);
    const leaf = new Set(['hoja sombra', 'hoja', 'bambú', 'bambú claro']);
    const trees: [number, number, 'round', number][] = [];
    for (let i = 0; i < 6; i++) trees.push([1.5 + i * 1.8, i % 2 ? 3.9 : 7.6, 'round', 3]);
    const m = paintMap(recipe([FLOOR, { step: 'grove', trees, salt: 2333 }]), game());
    const sides = new Set<number>();
    let limbs = 0, holes = 0, span = 0;
    for (const [u, v] of trees) {
      const [fx, fy] = P(u, v).map(Math.round);
      let left = 0, right = 0;
      for (let y = fy - 56; y < fy - 8; y++) {
        const row: number[] = [];
        for (let x = fx - 18; x <= fx + 18; x++) {
          const c = at(m, 'copas', x, y);
          if (c && bark.has(c)) limbs++;
          if (c && leaf.has(c)) { if (x < fx) left++; else if (x > fx) right++; }
          if (c !== null) row.push(x);
        }
        if (!row.length) continue;
        // a full crown: few empty px between its borders, row by row and column by column
        for (let x = row[0]; x <= row[row.length - 1]; x++) { span++; if (at(m, 'copas', x, y) === null) holes++; }
      }
      for (let x = fx - 18; x <= fx + 18; x++) {
        const col: number[] = [];
        for (let y = fy - 56; y < fy - 8; y++) if (at(m, 'copas', x, y) !== null) col.push(y);
        if (col.length) for (let y = col[0]; y <= col[col.length - 1]; y++) { span++; if (at(m, 'copas', x, y) === null) holes++; }
      }
      sides.add(Math.sign(right - left));
    }
    expect(limbs).toBeGreaterThan(30);            // the branches show somewhere
    expect(holes).toBeGreaterThan(5);             // in a gap or two
    expect(holes / span).toBeLessThan(0.03);      // and the crown is full, not masses on sticks
    expect(sides.has(1) && sides.has(-1)).toBe(true);
  });

  it('snow lies on the tiers of a pine: on top, lit to the west, the tips and the belly green', () => {
    const green = paintMap(recipe([FLOOR, { step: 'grove', trees: [[5.5, 6.9, 'pine', 3]] }]), game());
    const m = paintMap(recipe([FLOOR, { step: 'grove', trees: [[5.5, 6.9, 'pine', 3]], snow: [2.4, 'túnica luz', 'nieve', 'nieve sombra'] }]), game());
    const px = m.layers.copas.px, was = green.layers.copas.px;
    const snow = px.filter(c => c === 'túnica luz' || c === 'nieve' || c === 'nieve sombra').length;
    const leaf = px.filter(c => c === 'hoja' || c === 'hoja sombra').length;
    expect(snow).toBeGreaterThan(15);
    expect(leaf).toBeGreaterThan(snow);                                    // still a green pine
    for (let i = 0; i < px.length; i++) expect(px[i] === null).toBe(was[i] === null);   // the same silhouette
    const W = m.width;
    const lit: number[] = [], shade: number[] = [];
    for (let i = 0; i < px.length; i++) { if (px[i] === 'túnica luz') lit.push(i % W); if (px[i] === 'nieve sombra') shade.push(i % W); }
    const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;
    expect(mean(lit)).toBeLessThan(mean(shade));                           // lit to the west
  });

  it('a pine hangs wide tiers close together from its trunk, the trunk peeking out in a gap or two, with an arrow tip', () => {
    const bark = new Set(['madera clara', 'madera', 'madera sombra']);
    const m = paintMap(recipe([FLOOR, { step: 'grove', trees: [[5.5, 6.9, 'pine', 3]] }]), game());
    const [fx, fy] = P(5.5, 6.9).map(Math.round);
    let runs = 0, holes = 0, span = 0, widest = 0;
    const rows: number[] = [];
    for (let y = fy - 56, was = false; y < fy - 8; y++) {
      let is = false;
      for (let x = fx - 4; x <= fx + 4; x++) if (bark.has(at(m, 'copas', x, y) ?? '')) is = true;
      if (is && !was) runs++;
      was = is;
      const xs: number[] = [];
      for (let x = fx - 24; x <= fx + 24; x++) if (at(m, 'copas', x, y) !== null) xs.push(x);
      if (!xs.length) continue;
      rows.push(xs[xs.length - 1] - xs[0] + 1);
      widest = Math.max(widest, xs[xs.length - 1] - xs[0] + 1);
      for (let x = xs[0]; x <= xs[xs.length - 1]; x++) { span++; if (at(m, 'copas', x, y) === null) holes++; }
    }
    for (let x = fx - 24; x <= fx + 24; x++) {
      const col: number[] = [];
      for (let y = fy - 56; y < fy - 8; y++) if (at(m, 'copas', x, y) !== null) col.push(y);
      if (col.length) for (let y = col[0]; y <= col[col.length - 1]; y++) { span++; if (at(m, 'copas', x, y) === null) holes++; }
    }
    expect(runs).toBeGreaterThanOrEqual(1);
    expect(runs).toBeLessThanOrEqual(4);
    expect(holes / span).toBeLessThan(0.06);                      // close together: not a ladder
    expect(widest).toBeGreaterThanOrEqual(30);                     // wide at the foot of the crown
    expect(Math.max(...rows.slice(0, 3))).toBeLessThanOrEqual(7);  // the tip: an arrow
  });

  it('crowns: wider against the trunk, starting lower, darker from the middle down, shaded at the bottom; the pool as wide as the crown drawn', () => {
    const LEAVES = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'bambú claro'] as [string, string, string, string, string];
    const V: Record<string, number> = { 'túnica noche': 0, 'hoja sombra': 1, hoja: 2, bambú: 3, 'bambú claro': 4 };
    const paint = (crowns?: object, sun = false) => paintMap({ ...recipe([FLOOR,
      { step: 'grove', trees: [[3.5, 5.9, 'round', 3, 11], [8.5, 5.9, 'pine', 3, 12]], leaves: LEAVES, needles: LEAVES, ...(crowns ? { crowns } : {}) } as MapStepOf<'grove'>,
      ...(sun ? [{ step: 'light', faces: false, on: ['pasto'] } as MapStepOf<'light'>] : [])]),
      ...(sun ? { light: { dir: [0.5, 1], length: 0.25, tone: 2, crown: [0.4, 0.24] } } : {}) } as MapRecipe, game());
    const box = (m: PaintedMap, x0: number, x1: number) => {
      let a = Infinity, b = -Infinity, t = Infinity, u = -Infinity;
      for (let y = 0; y < m.height; y++) for (let x = x0; x < x1; x++) if (at(m, 'copas', x, y) && at(m, 'copas', x, y)! in V) { a = Math.min(a, x); b = Math.max(b, x); t = Math.min(t, y); u = Math.max(u, y); }
      return [a, b, t, u];
    };
    const tone = (m: PaintedMap, x0: number, x1: number) => {
      const [a, b, t, u] = box(m, x0, x1), mid = (t + u + 1) / 2, up: number[] = [], dn: number[] = [];
      for (let y = t; y <= u; y++) for (let x = a; x <= b; x++) { const c = at(m, 'copas', x, y); if (c && c !== 'túnica noche' && c in V) (y + 0.5 < mid ? up : dn).push(V[c]); }
      const avg = (l: number[]) => l.reduce((s, v) => s + v, 0) / l.length;
      return avg(dn) / avg(up);
    };
    const plain = paint(), big = paint({ spread: 1.25, low: 0.22, fall: 0.8, under: 3 });
    const [rx, px] = [P(3.5, 5.9)[0], P(8.5, 5.9)[0]];
    for (const x of [rx, px]) {
      const [a0, b0] = box(plain, x - 40, x + 40), [a1, b1] = box(big, x - 40, x + 40);
      expect((b1 - a1) / (b0 - a0)).toBeGreaterThan(1.12);                         // wider crowns
      expect(tone(big, x - 40, x + 40)).toBeLessThan(tone(plain, x - 40, x + 40) - 0.05);   // darker below
    }
    // the broadleaf's crown starts lower: its bottom row is further down
    expect(box(big, rx - 40, rx + 40)[3]).toBeGreaterThan(box(plain, rx - 40, rx + 40)[3]);
    // without crowns, as always: a step with crowns {} paints the same
    expect(paint({}).layers.copas.px).toEqual(plain.layers.copas.px);
    // with the sun, the pool at the foot is about as wide as the crown drawn (0.6 to 1.1 of it)
    const lit = paint({ spread: 1.25, low: 0.22, fall: 0.8, under: 3 }, true), dark = paint({ spread: 1.25, low: 0.22, fall: 0.8, under: 3 });
    for (const x of [rx, px]) {
      const fy = Math.round(P(0, 5.9)[1]), [a, b] = box(lit, x - 40, x + 40);
      let lo = Infinity, hi = -Infinity;
      for (let y = fy - 3; y <= fy + 1; y++) for (let X = x - 40; X < x + 40; X++) if (at(lit, 'ground', X, y) !== at(dark, 'ground', X, y)) { lo = Math.min(lo, X); hi = Math.max(hi, X); }
      const r = (hi - lo + 1) / (b - a + 1);
      expect(r).toBeGreaterThan(0.6);
      expect(r).toBeLessThan(1.15);
    }
  });

  it('a ginkgo: a straight pale trunk and a golden crown, more gold than green, taller than wide and wider at the top than where it starts', () => {
    const SUN = { light: { dir: [0.5, 1] as [number, number], length: 0.25, tone: 2, contrast: 0.2, crown: [0.4, 0.24] as [number, number] } };
    const paint = (kind: 'ginkgo' | 'round', sun = true) => paintMap({ ...recipe([FLOOR, { step: 'grove', trees: [[5.5, 6.9, kind, 3, 31]] },
      ...(sun ? [{ step: 'light', faces: false, on: ['pasto'] } as MapStepOf<'light'>] : [])]), ...(sun ? SUN : {}) }, game());
    const m = paint('ginkgo');
    const [fx, fy] = P(5.5, 6.9).map(Math.round);
    const crown = m.layers.copas.px.filter((c): c is string => c !== null);
    const gold = crown.filter(c => ['bronce', 'oro', 'oro claro', 'fuego luz'].includes(c)).length;
    const green = crown.filter(c => ['hoja sombra', 'hoja', 'bambú', 'bambú claro'].includes(c)).length;
    expect(gold).toBeGreaterThan(300);
    expect(gold).toBeGreaterThan(10 * green);
    expect(crown).toContain('oro claro');                                       // lit, not one flat tone
    expect(crown).toContain('bronce');
    // the trunk: pale bark on the ground, straight (its middle in the same column from the foot to the crown)
    const pale = ['piedra clara', 'piedra', 'piedra sombra'];
    const mids: number[] = [];
    for (let y = fy - 12; y <= fy - 3; y++) {
      const xs: number[] = [];
      for (let x = fx - 8; x <= fx + 8; x++) if (pale.includes(at(m, 'ground', x, y) ?? '')) xs.push(x);
      expect(xs.length, `bark at row ${y}`).toBeGreaterThan(0);
      mids.push((xs[0] + xs[xs.length - 1]) / 2);
    }
    expect(Math.max(...mids) - Math.min(...mids)).toBeLessThanOrEqual(1);
    // the fan: taller than wide; the rows of its upper quarter wider than those of its lower quarter
    const rows: [number, number][] = [];
    for (let y = 0; y < m.height; y++) {
      const xs: number[] = [];
      for (let x = fx - 40; x <= fx + 40; x++) if (['bronce', 'oro', 'oro claro', 'fuego luz', 'túnica noche'].includes(at(m, 'copas', x, y) ?? '')) xs.push(x);
      if (xs.length) rows.push([y, xs[xs.length - 1] - xs[0] + 1]);
    }
    const tall = rows[rows.length - 1][0] - rows[0][0] + 1, wide = Math.max(...rows.map(r => r[1]));
    expect(tall).toBeGreaterThan(wide);
    const q = Math.floor(rows.length / 4), avg = (l: [number, number][]) => l.reduce((s, r) => s + r[1], 0) / l.length;
    expect(avg(rows.slice(q, 2 * q))).toBeGreaterThan(1.3 * avg(rows.slice(rows.length - q)));
    // the light: lit on the west like every crown, and its shadow on the grass (a narrower crown, a smaller pool)
    expect(meanX(m, 'oro claro')).toBeLessThan(meanX(m, 'bronce'));
    const dark = paint('ginkgo', false), roundLit = paint('round'), roundDark = paint('round', false);
    const shaded = (a: PaintedMap, b: PaintedMap) => a.layers.ground.px.filter((c, i) => c !== b.layers.ground.px[i]).length;
    expect(shaded(m, dark)).toBeGreaterThan(0.3 * shaded(roundLit, roundDark));
  });

  it('a willow: its curtains fall lower than the crown of a round tree as tall, part into hanging strands near the ground, and cast a shadow', () => {
    const SUN = { light: { dir: [0.5, 1] as [number, number], length: 0.25, tone: 2, contrast: 0.2, crown: [0.4, 0.24] as [number, number] } };
    const paint = (kind: 'willow' | 'round', sun = false) => paintMap({ ...recipe([FLOOR, { step: 'grove', trees: [[5.5, 6.9, kind, 3, 41]] },
      ...(sun ? [{ step: 'light', faces: false, on: ['pasto'] } as MapStepOf<'light'>] : [])]), ...(sun ? SUN : {}) }, game());
    const w = paint('willow'), r = paint('round');
    const lowest = (m: PaintedMap) => { let low = -1; m.layers.copas.px.forEach((c, i) => { if (c !== null && c !== 'túnica noche' && !['madera clara', 'madera', 'madera sombra'].includes(c)) low = Math.max(low, Math.floor(i / m.width)); }); return low; };
    const [fx, fy] = P(5.5, 6.9).map(Math.round);
    expect(lowest(w)).toBeGreaterThan(lowest(r) + 6);
    expect(fy - lowest(w)).toBeLessThanOrEqual(6);                         // almost to the ground
    // greener than gold, greyer than the leaves: its glint is the silver of the willow's defaults
    const crown = w.layers.copas.px.filter((c): c is string => c !== null);
    expect(crown).toContain('niebla sombra');
    expect(crown.filter(c => c === 'hoja' || c === 'hoja sombra' || c === 'bambú').length).toBeGreaterThan(400);
    // near the ground the curtains have parted: a row there crosses four to six strands, with air between
    let most = 0;
    for (let y = fy - 12; y <= fy - 6; y++) {
      let runs = 0, was = false;
      for (let x = fx - 50; x <= fx + 50; x++) { const is = at(w, 'copas', x, y) !== null; if (is && !was) runs++; was = is; }
      most = Math.max(most, runs);
    }
    expect(most).toBeGreaterThanOrEqual(4);
    // the sun: lit on the west, a shadow on the grass
    const lit = paint('willow', true);
    expect(meanX(lit, 'bambú')).toBeLessThan(meanX(lit, 'hoja sombra'));
    expect(lit.layers.ground.px.filter((c, i) => c !== w.layers.ground.px[i]).length).toBeGreaterThan(200);
  });

  it('ginkgos and willows are kinds a zone draws by its odds, and the tally counts them', () => {
    const zone = (kinds: object): MapStepOf<'grove'> => ({ step: 'grove', id: 'g', zones: [{ within: 'isla', band: [2, 400], count: 12, spacing: 20, salt: 91, kinds }] });
    const m = paintMap(recipe([FLOOR, zone({ round: 0, pine: 0, plum: 0, ginkgo: 1, willow: 1 })]), game());
    const t = m.planted!.g;
    expect(t.round + t.pine + t.plum + t.bush).toBe(0);
    expect(t.ginkgo).toBeGreaterThan(0);
    expect(t.willow).toBeGreaterThan(0);
    // a zone with the old odds draws exactly what it always drew: no ginkgo, no willow, nothing counted for them
    const old = paintMap(recipe([FLOOR, zone({})]), game());
    expect(old.planted!.g.ginkgo).toBeUndefined();
    expect(old.planted!.g.willow).toBeUndefined();
  });
});

describe('map_export says where each tree of a grove stands (#172 of unwritten-dao)', () => {
  it('trees: the foot of every tree (not bush) in px and in cells, its kind and size, in the data and in a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-trees-'));
    const rows = Array.from({ length: 8 }, (_, v) => Array.from({ length: 12 }, (_, u) => (u >= 4 && u < 8 && v >= 3 && v < 6 ? '.' : '#')).join(''));
    const rec = {
      ...recipe([FLOOR,
        { step: 'grove', id: 'dada', trees: [[3.5, 5.9, 'round', 3], [9.2, 2.4, 'pine', 3]],
          zones: [{ within: 'isla', band: [2, 200], count: 24, spacing: 14, salt: 77 }], kinds: { round: 1, pine: 1, bush: 1 } },
        { step: 'grove', trees: [[11.2, 7.6, 'plum', 2]] },
      ] as MapRecipe['steps'], game(rows)),
      palette: join(__dirname, '../fixtures/mapas/paleta.pss.json'),
    };
    const file = join(dir, 'receta.json');
    writeFileSync(file, JSON.stringify(rec));
    const out = join(dir, 'arboles', 'arboles.json');
    const r = await runCommand('map_export', { recipe: file, dir: join(dir, 'png'), txt: join(dir, 'txt'), src: join(dir, 'src'), ground: false, trees: out });
    const data = r.data as { trees: { grove: string; at: [number, number]; cell: [number, number]; kind: string; size: [number, number] }[]; planted: Record<string, Record<string, number>> };
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.trees).toEqual(data.trees);
    expect(written.origin).toEqual([32, 32]);
    expect(r.text).toContain(`trees: ${data.trees.length} → arboles.json`);
    // as many as the groves say they planted, no bush among them
    const counted = Object.values(data.planted).reduce((n, t) => n + t.round + t.pine + t.plum, 0);
    expect(data.trees.length).toBe(counted);
    expect(data.planted.dada.bush).toBeGreaterThan(0);
    expect(data.trees.filter(t => t.grove === 'grove2').map(t => t.kind)).toEqual(['plum']);   // a grove with no id: grove<i>
    expect(data.trees.some(t => t.kind === 'bush')).toBe(false);
    // the given ones where the recipe put them, the cell and the px the same place
    for (const [kind, u, v] of [['pine', 9.2, 2.4], ['round', 3.5, 5.9]] as const) {
      const t = data.trees.find(t => t.grove === 'dada' && Math.abs(t.cell[0] - u) <= 1 / 16 && Math.abs(t.cell[1] - v) <= 1 / 16);
      expect(t?.kind).toBe(kind);
    }
    for (const t of data.trees) {
      expect(t.at[0]).toBe(Math.round(32 + t.cell[0] * 16));
      expect(t.size[1]).toBeGreaterThan(t.size[0] / 2);
    }
    // and over every foot inside the map that no tree in front hides (no bushes here: a bush in front covers a
    // trunk) the bark of a trunk on the ground: what the game makes a wall
    const trees = { ...rec, steps: rec.steps.map(st => (st.step === 'grove' && st.kinds ? { ...st, kinds: { round: 1, pine: 1 } } : st)) } as MapRecipe;
    const m = paintMap(trees, game(rows));
    const bark = ['madera clara', 'madera', 'madera sombra', 'túnica noche'];
    const feet = m.trees!.map(t => t.at);
    const hidden = (t: { at: [number, number] }) => feet.some(([x, y]) => y > t.at[1] && y < t.at[1] + 48 && Math.abs(x - t.at[0]) < 24);
    const clear = m.trees!.filter(t => t.cell[0] >= 0 && t.cell[1] >= 0 && t.cell[0] < 12 && t.cell[1] < 8 && !hidden(t));
    expect(clear.length).toBeGreaterThanOrEqual(4);
    for (const t of clear) {
      const rise = range0(Math.round(t.size[1] * 0.3)).map(k => k + 1);
      const hit = [-1, 0, 1].some(dx => rise.some(dy => bark.includes(at(m, 'ground', t.at[0] + dx, t.at[1] - dy) ?? '')));
      expect(hit, `${t.grove} ${t.kind} at ${t.at}`).toBe(true);
    }
  });
});
