// @vitest-environment node
// Variants of a map recipe (states of one place: a door open and closed) and
// export.layers as the list of what an export writes. Both came from the patio
// of the second game made with PGS, whose closed door was a copy of the whole
// recipe derived by a script, and whose closed export wrote a front layer
// nobody asked for (el-patio DIARIO.md, Mapa 15 and 16).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyVariant } from './mapvariant';
import { Ctx, paintMap } from './mappaint';
import { renderRecipe } from './mapfile';
import { recipeSchema, type MapRecipe } from './maprecipe';
import { runCommand } from './commands';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-variant-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const COLORS = { tinta: '#101018', noche: '#1c1830', junta: '#3a3050', piedra: '#5a6a90', clara: '#8ea0c8', luz: '#f0c060', madera: '#7a5030', hoja: '#2f6a40' };

/** A patio: a tiled floor, a light from the door over it, the door, a tree crown in front. */
function patio(): MapRecipe {
  return recipeSchema.parse({
    game: { width: 6, height: 4, grid: Array.from({ length: 4 }, () => '......') },
    colors: COLORS, light: [1, 1],
    materials: {
      piso: { ramp: ['noche', 'junta', 'piedra', 'clara'], texture: 'tiles' },
      luz: { ramp: ['madera', 'luz'], texture: 'flat', base: 1 },
      copa: { ramp: ['hoja'], texture: 'flat' },
    },
    steps: [
      { step: 'area', id: 'piso', material: 'piso', shape: 'all', tiles: { size: [8, 8], at: [0, 0], wear: 0.2 } },
      { step: 'area', id: 'abanico', material: 'luz', shape: { rect: [2, 1, 2, 2] } },
      { step: 'scatter', id: 'puerta', what: 'stamp', at: [[2.5, 0]], rows: ['mm', 'mm'], glyphs: { m: 'luz' } },
      { step: 'area', id: 'copa', material: 'copa', shape: { rect: [4, 0, 2, 2] }, layer: 'frente' },
    ],
    export: { id: 'patio', layers: { ground: '', frente: '_frente' }, ids: { frente: 'copas_del_patio' } },
    variants: {
      cerrada: {
        remove: ['abanico'],
        set: { puerta: { glyphs: { m: 'madera' } } },
        materials: { luz: null },
        export: { layers: { ground: '' } },
      },
      con_alfombra: {
        add: [
          { step: 'area', id: 'alfombra', material: 'copa', shape: { rect: [0, 2, 2, 1] }, after: 'piso' },
          { step: 'area', id: 'borde', material: 'copa', shape: { rect: [0, 3, 1, 1] }, after: 'piso' },
          { step: 'area', id: 'antes', material: 'copa', shape: { rect: [5, 3, 1, 1] }, before: 'puerta' },
        ],
      },
    },
  });
}
const ids = (r: MapRecipe) => r.steps.map(s => ('id' in s ? s.id : undefined));

describe('map recipe variants', () => {
  it('removes, changes and adds steps by id over the base, and leaves the base as it was', () => {
    const base = patio();
    const before = JSON.stringify(base);
    const closed = applyVariant(base, 'cerrada');
    expect(ids(closed)).toEqual(['piso', 'puerta', 'copa']);
    expect(closed.steps[1]).toMatchObject({ id: 'puerta', glyphs: { m: 'madera' }, rows: ['mm', 'mm'] });
    expect(Object.keys(closed.materials)).toEqual(['piso', 'copa']);
    expect(closed.variants).toBeUndefined();
    // added after the same step, they keep the order they are written in
    expect(ids(applyVariant(base, 'con_alfombra'))).toEqual(['piso', 'alfombra', 'borde', 'abanico', 'antes', 'puerta', 'copa']);
    expect(JSON.stringify(base)).toBe(before);
    expect(applyVariant(base, undefined)).toBe(base);
  });

  it('paints exactly what the copy of the recipe written by hand painted', () => {
    const byHand = recipeSchema.parse({
      ...patio(), variants: undefined,
      materials: { piso: patio().materials.piso, copa: patio().materials.copa },
      steps: patio().steps.filter(s => !('id' in s) || s.id !== 'abanico')
        .map(s => ('id' in s && s.id === 'puerta' ? { ...s, glyphs: { m: 'madera' } } : s)),
    });
    const a = paintMap(applyVariant(patio(), 'cerrada'), patio().game as never, COLORS);
    const b = paintMap(byHand, byHand.game as never, COLORS);
    for (const name of ['ground', 'frente']) expect(a.layers[name].px).toEqual(b.layers[name].px);
    const open = paintMap(patio(), patio().game as never, COLORS);
    expect(open.layers.ground.px).not.toEqual(a.layers.ground.px);
  });

  it('stops on a name or an id that is not there, saying which there are', () => {
    expect(() => applyVariant(patio(), 'abierta')).toThrow(/variant "abierta": not in the recipe \(variants: cerrada, con_alfombra\)/);
    const typo = (v: object) => applyVariant(recipeSchema.parse({ ...patio(), variants: { x: v } }), 'x');
    expect(() => typo({ remove: ['abanicco'] })).toThrow(/remove "abanicco": no step has that id \(ids: piso, abanico, puerta, copa\)/);
    expect(() => typo({ set: { puerta2: { at: [[0, 0]] } } })).toThrow(/set "puerta2"/);
    expect(() => typo({ add: [{ step: 'area', material: 'copa', shape: 'all', after: 'nada' }] })).toThrow(/after "nada"/);
    expect(() => typo({ add: [{ step: 'area', id: 'piso', material: 'copa', shape: 'all' }] })).toThrow(/already has a step "piso"/);
    expect(() => typo({ set: { puerta: { what: 'nonsense' } } })).toThrow(/the recipe it gives is not valid/);
    expect(() => recipeSchema.parse({ ...patio(), variants: { 'dos palabras': {} } })).toThrow(/one word/);
  });

  it('renames the export (id_name), never inherits the whole ids of the base files, and render and lint take variant', async () => {
    const r = applyVariant(patio(), 'con_alfombra');
    expect(r.export).toMatchObject({ id: 'patio_con_alfombra', layers: { ground: '', frente: '_frente' } });
    expect(r.export?.ids).toBeUndefined();
    const file = join(dir, 'patio.receta.json');
    writeFileSync(file, JSON.stringify(patio()));
    expect(renderRecipe(file, { variant: 'cerrada' }).variant).toBe('cerrada');
    const shown = await runCommand('map_render', { recipe: file, out: join(dir, 'c.png'), variant: 'cerrada' });
    expect(shown.data).toMatchObject({ variant: 'cerrada' });
    const lint = await runCommand('map_lint', { recipe: file, variant: 'cerrada' });
    expect(lint.text).toMatch(/[✓✗] ground/);
  });
});

// #42: a variant took out the steps of the light of a door and kept its material; the shadow of a wall still found
// the warm color of the door's seal in that ramp and darkened it, so the closed door had to strip the material too.
describe('a material nobody paints does not shade', () => {
  const game = { width: 2, height: 1, grid: ['..'] };
  const recipe = (steps: unknown[]) => recipeSchema.parse({
    game, colors: COLORS,
    materials: {
      piso: { ramp: ['noche', 'junta', 'piedra', 'clara'], texture: 'flat' },
      luz: { ramp: ['madera', 'luz'], texture: 'flat', base: 1 },
    },
    steps: [{ step: 'area', id: 'piso', material: 'piso', shape: 'all' }, ...steps],
  });

  it('a color off the ramp under it borrows only the ramp of a material some step paints', () => {
    const kept = new Ctx(recipe([]), game);
    expect(kept.shade('luz', 'piso')).toBe('luz');        // luz is in the recipe, nothing paints it: stays
    expect(kept.shade('clara', 'piso')).toBe('junta');    // its own ramp, as always (capped under its base)
    expect(kept.paintedMaterials()).toEqual([kept.recipe.materials.piso]);
    // named by a step (a glow that paints with its ramp leaves no kind behind)
    const named = new Ctx(recipe([{ step: 'area', id: 'abanico', material: 'luz', shape: { rect: [0, 0, 1, 1] }, layer: 'otra' }]), game);
    expect(named.shade('luz', 'piso')).toBe('madera');
    // on the map as a kind, laid by a step that does not name it
    const laid = new Ctx(recipe([]), game);
    laid.setKind(0, 0, 'luz');
    expect(laid.shade('luz', 'piso')).toBe('madera');
    expect(laid.paintedMaterials().length).toBe(2);
  });
});

describe('map_export of variants and export.layers', () => {
  function write(extra: Partial<MapRecipe> = {}): string {
    const file = join(dir, 'patio.receta.json');
    writeFileSync(file, JSON.stringify({ ...patio(), ...extra, export: { ...patio().export, png: 'png', txt: 'txt', ...(extra.export ?? {}) } }));
    return file;
  }

  it('exports only the layers export.layers names, and says which it left out', async () => {
    const file = write();
    const ex = await runCommand('map_export', { recipe: file, variant: 'cerrada' });
    expect(existsSync(join(dir, 'png', 'patio_cerrada.png'))).toBe(true);
    expect(existsSync(join(dir, 'png', 'patio_cerrada_frente.png'))).toBe(false);
    expect(existsSync(join(dir, 'txt', 'patio_cerrada_frente.txt'))).toBe(false);
    expect(ex.text).toContain('not exported (not in export.layers): frente');
    // a recipe with no export.layers exports every layer it paints, as always
    const all = join(dir, 'todo.receta.json');
    writeFileSync(all, JSON.stringify({ ...patio(), export: { id: 'todo', png: 'png', txt: 'txt' } }));
    await runCommand('map_export', { recipe: all });
    expect(existsSync(join(dir, 'png', 'todo.png'))).toBe(true);
    expect(existsSync(join(dir, 'png', 'todo_frente.png'))).toBe(true);
  });

  it('"*" exports the base and every variant, each drawing saying which variant made it', async () => {
    const file = write();
    const ex = await runCommand('map_export', { recipe: file, variant: '*' });
    for (const f of ['patio', 'copas_del_patio', 'patio_cerrada', 'patio_con_alfombra', 'patio_con_alfombra_frente']) {
      expect(existsSync(join(dir, 'png', `${f}.png`)), f).toBe(true);
    }
    expect(ex.text).toMatch(/^base:\n/);
    expect(ex.text).toContain('variant cerrada:\nground: patio_cerrada.png + patio_cerrada.txt');
    const closed = readFileSync(join(dir, 'txt', 'patio_cerrada.txt'), 'utf8');
    expect(closed).toContain('generated_by: map_export recipe=../patio.receta.json layer=ground variant=cerrada');
    expect(readFileSync(join(dir, 'txt', 'patio.txt'), 'utf8')).not.toContain('variant=');
    // running it again writes over its own drawings; a drawing by hand stops all of them before any is written
    await runCommand('map_export', { recipe: file, variant: '*' });
    writeFileSync(join(dir, 'txt', 'patio_con_alfombra.txt'), 'id: a mano\n');
    const stamp = readFileSync(join(dir, 'txt', 'patio.txt'), 'utf8');
    await expect(runCommand('map_export', { recipe: file, variant: '*' })).rejects.toThrow(/patio_con_alfombra.txt does not say what made it/);
    expect(readFileSync(join(dir, 'txt', 'patio.txt'), 'utf8')).toBe(stamp);
  });

  it('a variant does not write the game map ground unless it declares its own', async () => {
    const game = join(dir, 'patio.json');
    writeFileSync(game, JSON.stringify({ width: 6, height: 4, ground: { painting: 'viejo' } }));
    const file = write({ export: { ...patio().export, game: 'patio.json', ground: { painting: 'suelos/patio' } } as MapRecipe['export'] });
    await runCommand('map_export', { recipe: file, variant: 'cerrada' });
    expect(JSON.parse(readFileSync(game, 'utf8')).ground.painting).toBe('viejo');
    await runCommand('map_export', { recipe: file });
    expect(JSON.parse(readFileSync(game, 'utf8')).ground.painting).toBe('suelos/patio');
  });
});
