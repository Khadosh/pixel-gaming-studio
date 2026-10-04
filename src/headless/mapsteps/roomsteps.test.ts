// @vitest-environment node
// The map steps and options that came with the tea house of The Unwritten Dao
// (an interior): the whole recipe against the script's PNGs, and each piece alone.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { paintMap, type PaintedMap } from '../mappaint';
import { outputLayer, renderRecipe } from '../mapfile';
import type { MapGame, MapRecipe } from '../maprecipe';
import { readPng } from '../png';
import { runCommand } from '../commands';

const FIX = join(__dirname, '../fixtures/mapas');
type Steps = MapRecipe['steps'];
const SHADE = { 'madera clara': 'madera', madera: 'madera sombra', arena: 'madera clara', tierra: 'tierra sombra', 'madera sombra': 'túnica noche' };
const LIGHTEN = { 'madera sombra': 'madera', madera: 'tierra', tierra: 'madera clara', 'madera clara': 'arena', arena: 'piel clara', piedra: 'piedra clara' };

function game(decor: MapGame['decor'] = []): MapGame {
  return { width: 8, height: 6, grid: Array.from({ length: 6 }, () => '.'.repeat(8)), decor };
}
function recipe(steps: Steps, extra: Partial<MapRecipe> = {}): MapRecipe {
  return {
    game: game(), margin: [1, 1], shade: SHADE, lighten: LIGHTEN,
    materials: { out: { ramp: ['tinta'] }, floor: { ramp: ['madera clara', 'tierra'], texture: 'planks' } },
    steps: [{ step: 'area', material: 'out', shape: 'all' }, { step: 'area', id: 'piso', material: 'floor', shape: { rect: [0, 1, 8, 5] } }, ...steps], ...extra,
  };
}
const px = (m: PaintedMap, x: number, y: number) => m.layers.ground.px[(m.origin[1] + y) * m.width + m.origin[0] + x];

describe('map recipe: the tea house', () => {
  it('paints the same two layers the tea house script painted, pixel for pixel (the sun cropped to the map), and passes the lint', async () => {
    const r = renderRecipe(join(FIX, 'casa_de_te.receta.json'));
    for (const [layer, file] of [['ground', 'casa_de_te_script.png'], ['sol', 'casa_de_te_script_sol.png']]) {
      const ref = readPng(join(FIX, file)), l = outputLayer(r, layer);
      expect([l.w, l.h]).toEqual([ref.width, ref.height]);
      let differ = 0;
      for (let i = 0; i < l.w * l.h; i++) {
        const c = l.px[i], a = ref.data[i * 4 + 3];
        const hex = '#' + [0, 1, 2].map(k => ref.data[i * 4 + k].toString(16).padStart(2, '0')).join('');
        if ((c === null) !== (a === 0) || (c !== null && r.colors[c] !== hex)) differ++;
      }
      expect(differ, layer).toBe(0);
    }
    const lint = await runCommand('map_lint', { recipe: join(FIX, 'casa_de_te.receta.json') });
    for (const rep of Object.values(lint.data as Record<string, { problems: string[] }>)) expect(rep.problems).toEqual([]);
  });
});

describe('map steps of a room', () => {
  it('planks: rows of boards with a joint under each row, a lit lip, ends in shadow; front boards darker', () => {
    const m = paintMap(recipe([]), game());
    // every 6th row from the top of the floor is the joint
    for (let x = 0; x < 128; x++) expect(['madera sombra', 'tierra sombra']).toContain(px(m, x, 16 + 5));
    const lip = m.layers.ground.px.filter(c => c === 'arena' || c === 'madera clara').length;
    expect(lip).toBeGreaterThan(200);
    expect(m.kind.filter(k => k === 'floor').length).toBe(128 * 80);
    // darker toward the front (the light comes from the back wall)
    const dark = (y0: number) => { let n = 0; for (let y = y0; y < y0 + 12; y++) for (let x = 0; x < 128; x++) if (['madera', 'tierra sombra', 'madera sombra'].includes(px(m, x, y)!)) n++; return n; };
    expect(dark(80)).toBeGreaterThan(dark(16) + 200);
    // by_tone gives a tone its own joint
    const own = paintMap(recipe([], { materials: { out: { ramp: ['tinta'] }, floor: { ramp: ['arena'], texture: 'planks' } } }), game());
    const own2 = paintMap(recipe([{ step: 'area', material: 'floor', shape: { rect: [0, 1, 8, 5] }, planks: { by_tone: { arena: { joint: 'tierra sombra' } } } }],
      { materials: { out: { ramp: ['tinta'] }, floor: { ramp: ['arena'], texture: 'planks' } } }), game());
    expect(px(own, 40, 21)).toBe('madera sombra');
    expect(px(own2, 40, 21)).toBe('tierra sombra');
  });

  it('wall: bands from the top with split and boards, beams from a side, doors with a sill and the day on a layer, its shadow on the floor', () => {
    const m = paintMap(recipe([
      { step: 'wall', id: 'back', rect: [0, -8, 128, 24], profile: ['túnica noche', { c: 'pergamino', h: 10, split: [0.5, 'túnica sombra'] }, { c: 'madera', h: 13, boards: [10, 'madera sombra', 'madera clara'] }],
        windows: [[20, -6, 14, 10]], columns: { x: [100], colors: ['bermellón', 'piel sombra'] }, shadow: { toward: 'b', depth: [1, 0], on: ['floor'] } },
      { step: 'wall', rect: [0, 72, 128, 8], from: 'b', profile: ['túnica noche', 'madera'], doors: [3], threshold: { rows: ['piedra', 'piedra'], jamb_rows: 2, light: 'day' } },
      { step: 'wall', rect: [0, 16, 4, 56], from: 'l', profile: ['túnica noche', 'bermellón'] },
    ]), game());
    expect(px(m, 5, -8)).toBe('túnica noche');
    expect(px(m, 10, -5)).toBe('pergamino');
    expect(px(m, 110, -5)).toBe('túnica sombra');           // past half the length
    expect(px(m, 10, 5)).toBe('madera sombra');             // a board, every 10 px
    expect(px(m, 11, 5)).toBe('madera clara');
    expect(px(m, 15, 5)).toBe('madera');
    expect(px(m, 22, -4)).toBe('túnica luz');               // the paper of the window
    expect(px(m, 101, 0)).toBe('piel sombra');              // the column
    expect(px(m, 100, -6)).toBe('oro');                     // its cap
    expect(m.kind[(m.origin[1] + 0) * m.width + m.origin[0] + 50]).toBe('wall');
    expect(px(m, 0, 30)).toBe('túnica noche');              // the side beam from the left
    expect(px(m, 1, 30)).toBe('bermellón');
    expect(px(m, 2, 30)).toBe('bermellón');
    expect(px(m, 10, 79)).toBe('túnica noche');             // the front, from the bottom
    expect(px(m, 52, 73)).toBe('piedra');                   // the sill in the door (u 3)
    expect(px(m, 48, 72)).toBe('túnica noche');             // its jamb
    expect(m.layers.day.px[(m.origin[1] + 72) * m.width + m.origin[0] + 52]).toBe('piedra clara');
    // the shadow of the back wall: the first floor row one tone darker than without it
    const bare = paintMap(recipe([{ step: 'wall', id: 'back', rect: [0, -8, 128, 24], profile: ['túnica noche'] }]), game());
    let darker = 0;
    for (let x = 4; x < 128; x++) if (px(m, x, 16) !== px(bare, x, 16)) darker++;
    expect(darker).toBeGreaterThan(100);
  });

  it('furnish: a mat under each table, rounded and bordered; shadows at the foot of things, stacking', () => {
    const decor = [{ sprite: 'mesa_x', at: [2, 2] as [number, number], size: [2, 1] as [number, number] }, { sprite: 'farol', at: [6, 4] as [number, number] }];
    const base = paintMap(recipe([]), game(decor));
    const rug = paintMap({ ...recipe([{ step: 'furnish', what: 'rug', on: ['floor'] }]), game: game(decor) }, game(decor));
    const cx = 48, cy = 41;
    expect(['arena', 'oro claro', 'oro']).toContain(px(rug, cx, cy));
    expect(px(rug, 40, 28)).toBe('bermellón');     // the outer border, lit up-left
    expect(px(rug, 56, 53)).toBe('madera sombra');
    expect(px(rug, 21, 27)).toBe(px(base, 21, 27)); // the corner is round
    const sh = paintMap(recipe([{ step: 'furnish', what: 'shadows', on: ['floor'], skip: ['farol'] }]), game(decor));
    // under the table (foot at row 3): changed; under the lamp (skipped): not
    let n = 0;
    for (let x = 32; x < 72; x++) if (px(sh, x, 48) !== px(base, x, 48)) n++;
    expect(n).toBeGreaterThan(20);
    for (let x = 96; x < 112; x++) expect(px(sh, x, 80)).toBe(px(base, x, 80));
  });

  it('sun: the windows of a wall cast their light on the floor, sheared right, with the shadow of the lattice, on a layer', () => {
    const m = paintMap(recipe([
      { step: 'wall', id: 'back', rect: [0, -8, 128, 24], profile: ['madera'], windows: [[20, -6, 14, 10]] },
      { step: 'sun', wall: 'back', layer: 'sol', on: ['floor'] },
    ]), game());
    const sun = m.layers.sol;
    const lit = sun.px.map((c, i) => [c, i] as const).filter(([c]) => c !== null);
    expect(lit.length).toBeGreaterThan(80);
    for (const [c, i] of lit) {
      const x = i % sun.w - m.origin[0], y = Math.floor(i / sun.w) - m.origin[1];
      expect(y).toBeGreaterThanOrEqual(19);                // below the foot of the wall + 3
      expect(x).toBeGreaterThan(20 + 14);                   // shifted right
      const under = px(m, x, y)!;
      expect(c).toBe(LIGHTEN[LIGHTEN[under as keyof typeof LIGHTEN] as keyof typeof LIGHTEN] ?? LIGHTEN[under as keyof typeof LIGHTEN] ?? under);
    }
    // the bars of the lattice leave gaps: column 1 mod 4 of the window never lit on its first row
    expect(sun.get(m.origin[0] + 21 + 14, m.origin[1] + 19)).toBeNull();
  });
});
