// @vitest-environment node
// The grove step: trees planted by recipe, drawn by one hand.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
const SHADE = { 'hoja clara': 'hoja', bambú: 'hoja', 'bambú claro': 'hoja', pasto: 'hoja', hoja: 'hoja sombra' };
function game(rows?: string[]): MapGame { const g = rows ?? Array.from({ length: 8 }, () => '.'.repeat(12)); return { width: g[0].length, height: g.length, grid: g }; }
function recipe(steps: MapRecipe['steps'], g = game()): MapRecipe {
  return { game: g, margin: [2, 2], shade: SHADE, materials: { pasto: { ramp: GRASS, base: 4 } }, steps };
}
const at = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;
const P = (u: number, v: number): [number, number] => [32 + u * 16, 32 + v * 16];
const FLOOR = { step: 'area', id: 'isla', material: 'pasto', shape: 'all' } as const;

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
});
