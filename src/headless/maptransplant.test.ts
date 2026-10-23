// The transplant measured against the real sister maps of The Unwritten Dao
// (Khadosh/pixel-gaming-studio#1): the recipe of one map laid on the game map of
// its sister has to come out nearer the sister's real recipe than copying the
// recipe as it is. The numbers of 23 October 2026 are written down here, as
// floors: a change to the rules that makes them worse fails.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { compareImages, layersImage, outputLayer, renderRecipe } from './mapfile';
import { compareKinds, tileMap, transplantRecipe, TRANSPLANT, type TileMapJson } from './maptransplant';
import { SCENE_FAMILIES } from './mapsteps/scenes';
import type { MapRecipe } from './maprecipe';

const F = join(__dirname, 'fixtures', 'mapas');
let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-trasplante-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const recipeOf = (map: string) => JSON.parse(readFileSync(join(F, `${map}.receta.json`), 'utf8')) as MapRecipe;
const gameOf = (map: string) => JSON.parse(readFileSync(join(F, `${map}.json`), 'utf8')) as TileMapJson;

/** The recipe of `from` copied as it is onto the game map of `to` (only `game` changes, and the seed if given). */
function naive(from: string, to: string, seed?: number): string {
  const r = recipeOf(from);
  r.game = join(F, `${to}.json`);
  if (r.palette) r.palette = join(F, r.palette);
  if (r.visuals) r.visuals = join(F, r.visuals);
  if (seed !== undefined) r.seed = seed;
  for (const st of r.steps as { draw?: string }[]) if (typeof st.draw === 'string') st.draw = join(F, st.draw);
  const out = join(dir, `ingenuo_${from}_${to}.receta.json`);
  writeFileSync(out, JSON.stringify(r));
  return out;
}

function measure(mine: string, real: string) {
  const a = renderRecipe(mine, { stderr: false }), b = renderRecipe(real, { stderr: false });
  return {
    kinds: compareKinds(a.map, b.map).share,
    px: compareImages(layersImage([outputLayer(b, 'ground')], b.colors), layersImage([outputLayer(a, 'ground')], a.colors)).share,
  };
}

async function transplant(from: string, to: string, seed?: number) {
  const out = join(dir, `${from}_en_${to}.receta.json`);
  const res = await runCommand('map_transplant', { recipe: join(F, `${from}.receta.json`), game: join(F, `${to}.json`), out, ...(seed !== undefined ? { seed } : {}) });
  return { out, res, data: res.data as { steps: { step: string; status: string; why?: string }[]; unpainted: { tile: string }[]; warnings: string[] } };
}

// each one paints four maps (2.5 s alone, more with the suite running beside it)
const PAINTS = { timeout: 30_000 };

describe('map_transplant on the roots of the pine', PAINTS, () => {
  it('lays the water cave on the mouth: the pool is not laid and said, the rest is the real mouth but its own steps', async () => {
    const { out, data } = await transplant('raices_agua', 'raices_boca', 7);
    const pool = data.steps.find(s => s.step === 'pool')!;
    expect(pool.status).toBe('lost');
    expect(pool.why).toMatch(/no raices_agua/);
    expect(data.steps.filter(s => s.step !== 'pool').every(s => s.status === 'kept')).toBe(true);
    const t = measure(out, join(F, 'raices_boca.receta.json'));
    // copied as it is: 27.8 % of the px; with the mouth's seed, 0.76 %; transplanted, 0.38 %
    // (what is left is the ladder of roots, a step only the mouth has)
    expect(measure(naive('raices_agua', 'raices_boca'), join(F, 'raices_boca.receta.json')).px).toBeGreaterThan(0.25);
    expect(t.px).toBeLessThan(measure(naive('raices_agua', 'raices_boca', 7), join(F, 'raices_boca.receta.json')).px);
    expect(t.px).toBeLessThan(0.005);
  });

  it('lays the water cave on the niche the same way, and names the formation it has no step for', async () => {
    const { out, data } = await transplant('raices_agua', 'raices_nicho', 83);
    expect(data.unpainted.map(u => u.tile)).toContain('raices_formacion');
    expect(measure(out, join(F, 'raices_nicho.receta.json')).px).toBeLessThan(0.005);
  });
});

describe('map_transplant on the river bank', PAINTS, () => {
  it('lays the pier on the far bank: the river at the top, the pier on its column, the lamp of its end not laid', async () => {
    const { out, data } = await transplant('embarcadero', 'otra_orilla');
    const r = JSON.parse(readFileSync(out, 'utf8')) as MapRecipe;
    const lines = (r.steps.find(s => s.step === 'lines') as { lines: Record<string, { at: number }> }).lines;
    expect(lines.agua_abajo.at).toBeCloseTo(2.3, 5); // the real far bank: 2.28
    const pier = r.steps.find(s => s.step === 'pier') as { x: number[] };
    expect([pier.x[0], pier.x[2]]).toEqual([7, 8]); // the real one: [7, 0, 8, 0]
    expect(data.steps.find(s => s.step === 'scatter')!.why).toBeTruthy();
    expect(data.unpainted.map(u => u.tile)).toEqual(expect.arrayContaining(['acequia_seca', 'barro_seco', 'pasarela']));
    expect(data.warnings.filter(w => /not shaped/.test(w))).toEqual([]);
    // materials: copied as it is 62.8 %, transplanted 19.4 %; of that, 11.3 % is what only the far
    // bank has (its pond, ditch and slabs), measured by taking those steps out of its real recipe
    const t = measure(out, join(F, 'otra_orilla.receta.json'));
    expect(measure(naive('embarcadero', 'otra_orilla'), join(F, 'otra_orilla.receta.json')).kinds).toBeGreaterThan(0.6);
    expect(t.kinds).toBeLessThan(0.21);
  });

  it('says when the new map is not shaped like the recipe: the river at the edge does not become a river across', async () => {
    const { data } = await transplant('otra_orilla', 'embarcadero');
    expect(data.warnings.some(w => /water: shape.between .* covered mostly rio .* covers mostly pasto/.test(w))).toBe(true);
    // the floodwater reads the pond, which the pier has no walk for: it goes with it
    expect(data.steps.find(s => s.step === 'floodwater')!.why).toMatch(/reads estanque/);
  });
});

describe('the rules', () => {
  const grid = (rows: string[]): TileMapJson => ({ width: rows[0].length, height: rows.length, grid: rows });
  const base = (steps: unknown[]): MapRecipe => ({ game: 'a.json', materials: {}, steps } as MapRecipe);

  it('a point on a common tile stays when the new map has the same there, else goes to the nearest', () => {
    const src = tileMap(grid(['....', '....', '....'])), tgt = tileMap(grid(['#...', '##..', '##..']));
    const t = transplantRecipe(base([{ step: 'scatter', what: 'stamp', at: [[2.5, 1.5], [0.5, 2.5]], rows: ['#'], glyphs: { '#': 'tinta' } }]), src, tgt, { game: 'b.json' });
    expect((t.recipe.steps[0] as { at: number[][] }).at).toEqual([[2.5, 1.5], [2.5, 2.5]]);
  });

  it('a line keeps its shape: a point with nothing under it goes with its neighbour, the ones past a lost tile go with it', () => {
    // a road (r) down the middle and a bend (b) the new map does not have
    const field = (row: string) => row + '.'.repeat(24);
    const src = tileMap(grid(['..r...', '..r...', '..bbbb', '......'].map(field))), tgt = tileMap(grid(['...r..', '...r..', '......', '......'].map(field)));
    const t = transplantRecipe(base([{ step: 'path', material: 'x', width: 2, points: [[2.5, -1], [2.5, 0.5], [2.5, 1.5], [3.5, 2.5], [5.5, 2.5], [8, 2.5]] }]), src, tgt, { game: 'b.json' });
    const path = t.recipe.steps[0] as { points: number[][] };
    expect(path.points).toEqual([[3.5, -1], [3.5, 0.5], [3.5, 1.5]]);
    expect(t.steps[0].dropped).toHaveLength(3);
  });

  it('a step with no rule for its positions goes as it is and is warned about', () => {
    const src = tileMap(grid(['..'])), tgt = tileMap(grid(['..']));
    const t = transplantRecipe(base([{ step: 'crag', at: [1, 1] }]), src, tgt, { game: 'b.json' });
    expect(t.steps[0].status).toBe('undeclared');
    expect(t.warnings.join('\n')).toMatch(/crag/);
  });

  it('every step of the families done first has its rule: the roots of the pine and the river bank', () => {
    for (const id of ['raices', 'orilla']) {
      const f = SCENE_FAMILIES.find(x => x.id === id)!;
      for (const step of f.steps) expect(TRANSPLANT[step], `${id}: ${step}`).toBeTypeOf('function');
    }
    for (const step of ['area', 'water', 'path', 'scatter', 'lines']) expect(TRANSPLANT[step], step).toBeTypeOf('function');
  });

  it('the game map of the new recipe is the new one, and its paths are relative to where it is written', () => {
    const t = transplantRecipe({ ...recipeOf('embarcadero'), game: 'embarcadero.json' }, tileMap(gameOf('embarcadero')), tileMap(gameOf('otra_orilla')),
      { game: '../mapas/otra_orilla.json', id: 'otra_orilla', rebase: p => `../mapas/${p}` });
    expect(t.recipe.game).toBe('../mapas/otra_orilla.json');
    expect(t.recipe.palette).toBe('../mapas/paleta.pss.json');
    expect(t.recipe.export?.id).toBe('otra_orilla');
    expect(Object.values(t.recipe.export?.names ?? {}).join(' ')).not.toMatch(/El embarcadero/);
  });
});
