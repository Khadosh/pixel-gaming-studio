// @vitest-environment node
// What the market of the sect brought (unwritten-dao docs/diseno/mercado.md): a stall step (a counter with goods,
// posts, an awning of cloth on its own layer that slopes, sags, lifts its corners and hangs a valance, the shade
// under it and its shadow on the ground), and a rope a place can lay.
import { describe, it, expect } from 'vitest';
import { paintMap, type PaintedMap } from '../mappaint';
import { moveStep } from '../mapplace';
import type { MapGame, MapRecipe, MapStepOf } from '../maprecipe';

const CLOTH = ['tinta', 'madera sombra', 'bermellón', 'bermellón claro', 'piel sombra', 'piel'];
const MATS: MapRecipe['materials'] = {
  suelo: { ramp: ['prado hondo', 'prado sombra', 'prado'], base: 2 },
  madera: { ramp: ['túnica noche', 'madera sombra', 'madera', 'madera clara', 'arena'] },
  toldo: { ramp: CLOTH },
};
const game: MapGame = { width: 10, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(10)), decor: [] };
const GROUND: MapStepOf<'area'> = { step: 'area', material: 'suelo', shape: 'all' };
const recipe = (steps: MapRecipe['steps']): MapRecipe => ({ game, materials: MATS, steps });
const px = (m: PaintedMap, layer: string, x: number, y: number) => m.layers[layer]?.px[y * m.width + x] ?? null;

describe('map stall', () => {
  // posts on x 32 and 79, the back ones on y 64, the front ones (and the counter's foot) on y 95
  const STALL: MapStepOf<'stall'> = {
    step: 'stall', id: 'puesto', rect: [2, 4, 3, 2], cloth: 'toldo', wood: 'madera', layer: 'techos',
    goods: [{ kind: 'fruit' }, { kind: 'pottery' }], shadow: { on: ['suelo'] },
  };
  const m = paintMap(recipe([GROUND, STALL]), game);
  const bare = paintMap(recipe([GROUND]), game);
  const clothRows = (x: number) => {
    const ys: number[] = [];
    for (let y = 0; y < m.height; y++) if (CLOTH.slice(1).includes(px(m, 'techos', x, y)!)) ys.push(y);
    return ys;
  };

  it('the awning is cloth on its own layer, over the counter, and the counter and posts stay on the ground', () => {
    expect(clothRows(56).length).toBeGreaterThan(20);
    expect(m.kind[95 * m.width + 56]).toBe('madera');                    // the foot of the counter
    expect(MATS.madera.ramp).toContain(px(m, 'ground', 56, 90));          // its face
    expect(px(m, 'ground', 56, 20)).toBe(px(bare, 'ground', 56, 20));     // nothing of the cloth on the ground
  });

  it('heap: rows of goods behind the front one, on the counter and on the shelf', () => {
    const heaped = paintMap(recipe([GROUND, { ...STALL, heap: 2 }]), game);
    const goodsPx = (mm: PaintedMap, y0: number, y1: number) => {
      let n = 0;
      for (const L of ['ground', 'techos']) for (let y = y0; y < y1; y++) for (let x = 33; x < 79; x++) {
        const c = px(mm, L, x, y);
        if (c && !MATS.madera.ramp.includes(c) && !CLOTH.includes(c) && !MATS.suelo.ramp.includes(c)) n++;
      }
      return n;
    };
    expect(goodsPx(heaped, 40, 96)).toBeGreaterThan(goodsPx(m, 40, 96) * 1.3);
    // all of it, counter and shelf, in a stall that shows its shelf
    const blue = (mm: PaintedMap) => { let n = 0; for (const L of ['ground', 'techos']) for (let y = 0; y < 96; y++) for (let x = 33; x < 79; x++) if (['celeste oscuro', 'celeste', 'celeste luz'].includes(px(mm, L, x, y)!)) n++; return n; };
    const BLUE: MapStepOf<'stall'> = { ...STALL, rect: [2, 4, 3, 1.1], goods: [{ kind: 'pottery', colors: [['celeste oscuro', 'celeste', 'celeste luz']] }] };
    expect(blue(paintMap(recipe([GROUND, { ...BLUE, heap: 2 }]), game))).toBeGreaterThan(blue(paintMap(recipe([GROUND, BLUE]), game)) * 1.25);
  });

  it('the hem sags in the middle and the corners lift', () => {
    const foot = (x: number) => Math.max(...clothRows(x));
    expect(foot(56)).toBeGreaterThan(foot(34));
    expect(foot(34)).toBeGreaterThanOrEqual(foot(31));
  });

  it('the ridge is lit, the valance under the hem in shadow, ink around it', () => {
    const ys = clothRows(56);
    expect(px(m, 'techos', 56, ys[0])).toBe(CLOTH[5]);
    expect(px(m, 'techos', 56, ys[0] - 1)).toBe('tinta');
    expect(ys.slice(-3).map(y => px(m, 'techos', 56, y))).toContain(CLOTH[2]);
  });

  it('goods stand on the counter, and the awning throws its shadow on the ground to the south-east', () => {
    let goods = 0;
    for (let y = 70; y < 90; y++) for (let x = 34; x < 78; x++) if (['bermellón claro', 'oro', 'bambú', 'arena', 'madera clara', 'basalto claro'].includes(px(m, 'ground', x, y)!)) goods++;
    expect(goods).toBeGreaterThan(10);
    // right of the stall, under where the awning's shadow falls: darker than bare grass
    let darker = 0;
    for (let y = 70; y < 96; y++) for (let x = 84; x < 92; x++) if (px(m, 'ground', x, y) !== px(bare, 'ground', x, y)) darker++;
    expect(darker).toBeGreaterThan(40);
  });

  it('stripes: the cloth and a second one in turn across it, the period asked for, opening with the flare; without them nothing changes', () => {
    const WHITE = ['tinta', 'piedra sombra', 'túnica sombra', 'pergamino', 'túnica luz', 'nube'];
    const mats = { ...MATS, blanco: { ramp: WHITE } };
    const paint = (st: MapStepOf<'stall'>) => paintMap({ ...recipe([GROUND, st]), materials: mats }, game);
    const striped = paint({ ...STALL, stripes: { cloth: 'blanco', width: 3 } });
    // a stripe of the same cloth as the cloth: the very same px as no stripes (only the colors are the stripes')
    expect(paint({ ...STALL, stripes: { cloth: 'toldo' } }).layers.techos.px).toEqual(m.layers.techos.px);
    // the ground is the same: the stripes are only on the cloth
    expect(striped.layers.ground.px).toEqual(m.layers.ground.px);
    // a row of the cloth: runs of red and of white in turn, each as wide as asked (the middle ones exactly)
    const fam = (c: string | null) => (c && CLOTH.slice(1).includes(c) ? 'r' : c && WHITE.slice(1).includes(c) ? 'w' : null);
    const runs = (y: number) => {
      const out: [string, number, number][] = [];   // family, first x, length
      for (let x = 20; x < 92; x++) {
        const f = fam(px(striped, 'techos', x, y));
        if (!f) continue;
        const last = out[out.length - 1];
        if (last && last[0] === f && last[1] + last[2] === x) last[2]++;
        else out.push([f, x, 1]);
      }
      return out;
    };
    const ys = clothRows(56), mid = ys[Math.floor(ys.length / 2)];
    const row = runs(mid);
    expect(row.length).toBeGreaterThan(10);
    expect(row.filter(r => r[0] === 'w').length).toBeGreaterThan(5);
    const inner = row.slice(2, -2);
    for (let k = 1; k < inner.length; k++) expect(inner[k][0]).not.toBe(inner[k - 1][0]);   // they alternate
    // 3 px, a px more here and there where the cloth has opened with the flare
    for (const r of inner) expect([3, 4]).toContain(r[2]);
    expect(inner.filter(r => r[2] === 3).length).toBeGreaterThan(inner.length / 2);
    // following the flare: down at the hem the outermost boundary stands further out than up at the ridge, the middle one where it was
    const top = runs(ys[3]), low = runs(ys[ys.length - 6]);
    // each white stripe of the west half: lower down it starts where it did or further west, one of them further
    const starts = (r: [string, number, number][]) => r.filter(q => q[0] === 'w' && q[2] >= 2).map(q => q[1]);
    const near = (x: number, l: number[]) => l.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const west = starts(top).filter(x => x > 35 && x < 52);
    expect(west.length).toBeGreaterThan(1);
    for (const x of west) expect(near(x, starts(low))).toBeLessThanOrEqual(x);
    expect(west.some(x => near(x, starts(low)) < x)).toBe(true);
    const middle = (r: [string, number, number][]) => r.map(q => q[1]).sort((a, b) => Math.abs(a - 56) - Math.abs(b - 56))[0];
    expect(middle(low)).toBe(middle(top));
    // without stripes: the stall as it always was (m has none)
    expect(m.layers.techos.px.some(c => c !== null && WHITE.slice(1).includes(c))).toBe(false);
  });

  it('a rope steeper than 1 (two houses one south of the other) is one line, not dots; across, as it always was', () => {
    const line = (st: MapStepOf<'rope'>) => {
      const mm = paintMap(recipe([GROUND, st]), game), pts: [number, number][] = [];
      mm.layers.front.px.forEach((c, i) => { if (c !== null) pts.push([i % mm.width, Math.floor(i / mm.width)]); });
      return pts;
    };
    for (const st of [
      { step: 'rope', from: [3, 1], to: [3, 6], sag: 5 },          // straight down
      { step: 'rope', from: [2, 1], to: [4, 7], sag: 8 },          // steep, sagging hard
      { step: 'rope', from: [7, 2], to: [2, 3], sag: 4 },          // tied right to left
    ] as MapStepOf<'rope'>[]) {
      const pts = line(st), [ax, ay] = [st.from[0] * 16, st.from[1] * 16], [bx, by] = [st.to[0] * 16, st.to[1] * 16];
      expect(pts.length).toBeGreaterThanOrEqual(Math.max(Math.abs(by - ay), Math.abs(bx - ax)));
      // every px touches another (8 neighbours): one piece from end to end
      const has = new Set(pts.map(([x, y]) => `${x},${y}`));
      const seen = new Set([`${pts[0][0]},${pts[0][1]}`]), todo = [pts[0]];
      while (todo.length) {
        const [x, y] = todo.pop()!;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = `${x + dx},${y + dy}`;
          if (has.has(k) && !seen.has(k)) { seen.add(k); todo.push([x + dx, y + dy]); }
        }
      }
      expect(seen.size, JSON.stringify(st)).toBe(pts.length);
      expect(has.has(`${ax},${ay}`) && has.has(`${bx},${by}`)).toBe(true);
    }
    // across: the very px of the village script (one per column, the sag a sine)
    const across = line({ step: 'rope', from: [1, 2], to: [8, 2.5], sag: 5 });
    expect(across.length).toBe(7 * 16 + 1);
    expect(new Set(across.map(p => p[0])).size).toBe(across.length);
  });

  it('covered: a tarp over the counter and its goods on a layer of its own, the stall as it was without it', () => {
    const TARP = ['tinta', 'piedra sombra', 'túnica sombra', 'pergamino', 'túnica luz', 'nube'];
    const mats = { ...MATS, lona: { ramp: TARP } };
    const shut = paintMap({ ...recipe([GROUND, { ...STALL, covered: { cloth: 'lona', layer: 'noche' } }]), materials: mats }, game);
    // by day nothing changes: the awning over the ground is the very same picture (the shelf is laid on the ground,
    // under the tarp's layer, and the awning still covers it)
    const seen = (mm: PaintedMap) => mm.layers.ground.px.map((c, i) => mm.layers.techos.px[i] ?? c);
    expect(seen(shut)).toEqual(seen(m));
    const night = shut.layers.noche.px;
    const at = (x: number, y: number) => night[y * shut.width + x];
    // every goods px between the posts that shows by day, on the counter and on the shelf, is under the tarp
    const goods = ['bermellón claro', 'oro', 'bambú', 'arena', 'madera clara', 'basalto claro', 'bermellón', 'fuego', 'oro claro', 'bronce', 'hoja', 'tierra sombra', 'basalto sombra', 'basalto luz'];
    let under = 0, bare2 = 0, shelf = 0;
    const day = seen(m);
    for (let y = 30; y < 96; y++) for (let x = 37; x < 75; x++) {
      if (!goods.includes(day[y * m.width + x]!) || m.layers.techos.px[y * m.width + x] && CLOTH.includes(m.layers.techos.px[y * m.width + x]!)) continue;
      if (at(x, y)) { under++; if (y < 80) shelf++; } else bare2++;
    }
    expect(under).toBeGreaterThan(10);
    expect(shelf).toBeGreaterThan(0);
    expect(bare2).toBe(0);
    // only the tarp's tones and the dark of the ropes, never the ink: the edge is its deep tone
    const used = new Set(night.filter((c): c is string => c !== null));
    for (const c of used) expect([...TARP.slice(1), ...MATS.madera.ramp.slice(1, 3)]).toContain(c);
    expect(used.has('tinta')).toBe(false);
    expect(used.has(TARP[5]) && used.has(TARP[1])).toBe(true);              // lit on the heaps, deep at its edge
    // it hangs down the face of the counter and stops above its foot; the front posts stand in front of it
    expect(at(56, 95)).toBeNull();
    expect(at(56, 89)).not.toBeNull();
    expect(at(33, 85)).toBeNull();
    // the ropes: a column of wood across it
    const ropeCols = new Set<number>();
    for (let x = 37; x < 75; x++) if (MATS.madera.ramp.includes(at(x, 88) ?? '')) ropeCols.add(x);
    expect(ropeCols.size).toBe(2);
    // without a layer, the tarp is laid on the ground: a stall always shut
    const always = paintMap({ ...recipe([GROUND, { ...STALL, covered: { cloth: 'lona' } }]), materials: mats }, game);
    let same = 0;
    for (let i = 0; i < night.length; i++) if (night[i] && always.layers.ground.px[i] === night[i]) same++;
    expect(same).toBe(night.filter(c => c).length);
  });

  it('a place lays it and its rope', () => {
    const moved = moveStep(STALL, 3, 1, 'x') as MapStepOf<'stall'>;
    expect(moved.rect).toEqual([5, 5, 3, 2]);
    const rope = moveStep({ step: 'rope', from: [1, 1], to: [4, 0.5] }, 2, 3, 'x') as MapStepOf<'rope'>;
    expect([rope.from, rope.to]).toEqual([[3, 4], [6, 3.5]]);
  });
});
