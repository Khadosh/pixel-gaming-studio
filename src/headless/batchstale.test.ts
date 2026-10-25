// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, statSync, utimesSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { traceFs, defaultFingerprints, matchesOnly, hashFile, FINGERPRINTS_FILE } from './batchstale';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-stale-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const at = (name: string) => join(dir, name);
const write = (name: string, data: unknown) => {
  mkdirSync(join(dir, name, '..'), { recursive: true });
  writeFileSync(at(name), typeof data === 'string' ? data : JSON.stringify(data, null, 1));
};
const prints = () => at(FINGERPRINTS_FILE);

const INK = '#1c1626';
const MATERIALS = {
  madera: { top: '#c48a52', left: '#a06c40', right: '#7a4e30' },
  tela: { top: '#6a8fd0', left: '#4f6fae', right: '#3a5288' },
  piso: { top: '#d8c8a8', left: '#b8a888', right: '#988868' },
};

/** A room with a chair put in it with `place`, a pose derived with `base`, and a drawing. */
function world() {
  write('pgs.json', { name: 'mundo', says: 'un cuarto', visual: { light: { from: 'upper_left' } } });
  write('silla.voxel.json', { id: 'silla', outline: INK, materials: MATERIALS, boxes: [{ id: 'asiento', at: [0, 0, 0], size: [4, 4, 3], material: 'madera' }] });
  write('cuarto.voxel.json', {
    id: 'cuarto', outline: INK, materials: MATERIALS,
    boxes: [{ id: 'piso', at: [0, 0, 0], size: [12, 12, 1], material: 'piso', layer: 'fondo' }],
    place: [{ model: 'silla.voxel.json', at: [4, 4, 1], layer: 'medio' }],
  });
  write('parada.voxel.json', { id: 'parada', outline: INK, materials: MATERIALS, boxes: [
    { id: 'cuerpo', at: [0, 0, 0], size: [2, 2, 6], material: 'tela' },
    { id: 'cabeza', at: [0, 0, 6], size: [2, 2, 2], material: 'madera' },
  ] });
  write('sentada.voxel.json', { base: 'parada.voxel.json', changes: [{ move: 'cabeza', by: [0, 0, -2] }] });
  write('flor.txt', 'id: flor\nr = #c03030\nv = #30a030\n== \n.r.\n.v.\n.v.\n');
  write('receta.json', { steps: [
    { command: 'voxel', model: at('cuarto.voxel.json'), out: at('out/cuarto.pss.json'), png: at('out/cuarto.png'), layers: true },
    { command: 'voxel', model: at('parada.voxel.json'), out: at('out/parada.pss.json'), png: at('out/parada.png') },
    { command: 'voxel', model: at('sentada.voxel.json'), out: at('out/sentada.pss.json'), png: at('out/sentada.png') },
    { command: 'from_ascii', txt: at('flor.txt'), out: at('out/flor.pss.json') },
    { command: 'export_sheet', path: at('out/flor.pss.json'), out: at('out/flor.png') },
  ] });
}

type Report = { data: { done: number; upToDate?: number; steps: { index: number; why?: string }[] }; text?: string };
const stale = async (extra: Record<string, unknown> = {}) =>
  await runCommand('batch', { recipe: at('receta.json'), stale: true, fingerprints: prints(), ...extra }) as unknown as Report;
const ran = (r: Report) => r.data.steps.map(s => s.index);

/** Every file under out/, by name, as bytes. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(at('out')).sort()) out[f] = readFileSync(at(`out/${f}`)).toString('base64');
  return out;
}

describe('batch stale: only what changed runs', () => {
  it('runs everything the first time, nothing the second, and leaves the files alone', async () => {
    world();
    const first = await stale();
    expect(ran(first)).toEqual([1, 2, 3, 4, 5]);
    expect(first.data.steps[0].why).toMatch(/no fingerprint/);
    const before = snapshot();
    // the files of the first run, put in the past: a second run that wrote them would show
    const old = new Date(2020, 0, 1);
    for (const f of Object.keys(before)) utimesSync(at(`out/${f}`), old, old);
    const second = await stale();
    expect(ran(second)).toEqual([]);
    expect(second.data.upToDate).toBe(5);
    expect(second.text).toMatch(/0\/5 step\(s\) done, 5 up to date/);
    for (const f of Object.keys(before)) expect(statSync(at(`out/${f}`)).mtime.getTime()).toBe(old.getTime());
  });

  it('notes what a step really writes: the layers of a layered voxel, not only the png it names (estudio#80)', async () => {
    world();
    await stale();
    const book = JSON.parse(readFileSync(prints(), 'utf8'));
    const writes = Object.values(book.steps).flatMap(s => Object.keys((s as { writes: object }).writes));
    expect(writes).toEqual(expect.arrayContaining(['out/cuarto.png', 'out/cuarto.fondo.png', 'out/cuarto.medio.png', 'out/cuarto.lugar.json']));
    // a layer deleted by hand is a step to run again, though the png it names is there
    rmSync(at('out/cuarto.medio.png'));
    const again = await stale();
    expect(ran(again)).toEqual([1]);
    expect(again.data.steps[0].why).toBe('its out/cuarto.medio.png is missing');
    expect(existsSync(at('out/cuarto.medio.png'))).toBe(true);
  });

  it('runs the room when a piece of furniture it places changes (estudio#250)', async () => {
    world();
    await stale();
    const before = snapshot();
    write('silla.voxel.json', { id: 'silla', outline: INK, materials: MATERIALS, boxes: [{ id: 'asiento', at: [0, 0, 0], size: [4, 4, 5], material: 'tela' }] });
    const r = await stale();
    expect(ran(r)).toEqual([1]);
    expect(r.data.steps[0].why).toBe('silla.voxel.json changed');
    expect(snapshot()['cuarto.png']).not.toBe(before['cuarto.png']);
  });

  it('runs every pose derived from a base when the base changes (estudio#301)', async () => {
    world();
    await stale();
    write('parada.voxel.json', { id: 'parada', outline: INK, materials: MATERIALS, boxes: [
      { id: 'cuerpo', at: [0, 0, 0], size: [2, 2, 7], material: 'tela' },
      { id: 'cabeza', at: [0, 0, 7], size: [2, 2, 2], material: 'madera' },
    ] });
    const r = await stale();
    expect(ran(r)).toEqual([2, 3]);
    expect(r.data.steps.map(s => s.why)).toEqual(['parada.voxel.json changed', 'parada.voxel.json changed']);
  });

  it('runs a step that reads what an earlier one rewrote, judged on the new bytes', async () => {
    world();
    await stale();
    write('flor.txt', 'id: flor\nr = #c03030\nv = #30a030\n== \n.r.\n.v.\nvv.\n');
    const r = await stale();
    expect(ran(r)).toEqual([4, 5]);
    expect(r.data.steps[1].why).toBe('out/flor.pss.json changed');
    // the same drawing with a comment: the asset comes out the same, so the sheet stays
    write('flor.txt', 'id: flor\nr = #c03030\nv = #30a030\n== \n.r.\n.v.\nvv.\n# una flor\n');
    const same = await stale();
    expect(ran(same)).toEqual([4]);
  });

  it('takes pgs.json as an input, but not its prose', async () => {
    world();
    await stale();
    const p = JSON.parse(readFileSync(at('pgs.json'), 'utf8'));
    write('pgs.json', { ...p, name: 'otro', says: 'otra cosa' });
    expect(ran(await stale())).toEqual([]);
    write('pgs.json', { ...p, visual: { light: { from: 'upper_right' } } });
    const r = await stale();
    // the voxels read the world's light and from_ascii its palette; the sheet did not ask,
    // and the drawing came out the same, so the sheet stays
    expect(ran(r)).toEqual([1, 2, 3, 4]);
    expect(r.data.steps[0].why).toBe('pgs.json changed');
  });

  it('runs again what was changed by hand since, and what changed its arguments', async () => {
    world();
    await stale();
    writeFileSync(at('out/flor.png'), 'not a png');
    const r = await stale();
    expect(ran(r)).toEqual([5]);
    expect(r.data.steps[0].why).toBe('its out/flor.png was changed since');
    const recipe = JSON.parse(readFileSync(at('receta.json'), 'utf8'));
    recipe.steps[4].scale = 2;
    write('receta.json', recipe);
    const changed = await stale();
    expect(ran(changed)).toEqual([5]);
    expect(changed.data.steps[0].why).toMatch(/no fingerprint/);
    // and the old fingerprint of that step is gone: one per file written
    const book = JSON.parse(readFileSync(prints(), 'utf8'));
    expect(Object.values(book.steps).filter(s => 'out/flor.png' in (s as { writes: object }).writes)).toHaveLength(1);
  });

  it('runs a step when a file it looked for and did not find appears: the retouch of a drawing', async () => {
    write('pgs.json', { name: 'mundo' });
    write('silla.voxel.json', { id: 'silla', outline: INK, materials: MATERIALS, boxes: [{ id: 'asiento', at: [0, 0, 0], size: [4, 4, 3], material: 'madera' }] });
    write('receta.json', { steps: [
      { command: 'voxel', model: at('silla.voxel.json'), out: at('out/silla.pss.json'), txt: at('out/silla.txt'), png: at('out/silla.png') },
    ] });
    await stale();
    expect(ran(await stale())).toEqual([]);
    const rows = Array.from({ length: 9 }, (_, y) => (y === 4 ? '.....r....' : '..........'));
    write('out/silla.retoque.txt', `retouch_of: silla.txt\nr = #c03030\n== \n${rows.join('\n')}\n`);
    const r = await stale();
    expect(ran(r)).toEqual([1]);
    expect(r.data.steps[0].why).toBe('out/silla.retoque.txt appeared');
    expect(ran(await stale())).toEqual([]);
  });

  it('runs together two steps that write one file, so a draw never paints on a canvas already painted', async () => {
    write('pgs.json', { name: 'mundo' });
    const recipe = (color: string) => ({ steps: [
      { command: 'new', path: at('out/a.pss.json'), width: 8, palette: ['#000000'] },
      { command: 'palette', path: at('out/a.pss.json'), add: [color] },
      { command: 'draw', path: at('out/a.pss.json'), frame: 0, ops: [{ op: 'pixel', x: 1, y: 1, color: 2 }] },
    ] });
    write('receta.json', recipe('#ff0000'));
    await stale();
    expect(ran(await stale())).toEqual([]);
    write('receta.json', recipe('#00ff00'));
    const r = await stale();
    expect(ran(r)).toEqual([1, 2, 3]);
    expect(r.data.steps[0].why).toMatch(/writes out\/a\.pss\.json too, with step 2/);
    const fresh = readFileSync(at('out/a.pss.json'), 'utf8');
    // the same as a run with no fingerprints at all
    rmSync(at('out'), { recursive: true });
    await runCommand('batch', { recipe: at('receta.json') });
    expect(readFileSync(at('out/a.pss.json'), 'utf8')).toBe(fresh);
    expect(ran(await stale())).toEqual([]);
  });

  it('gives the same files as a whole run', async () => {
    world();
    await stale();
    write('silla.voxel.json', { id: 'silla', outline: INK, materials: MATERIALS, boxes: [{ id: 'asiento', at: [0, 0, 0], size: [3, 4, 5], material: 'tela' }] });
    write('flor.txt', 'id: flor\nr = #c03030\nv = #30a030\n== \nrr.\n.v.\n.v.\n');
    await stale();
    const partial = snapshot();
    rmSync(at('out'), { recursive: true });
    await runCommand('batch', { recipe: at('receta.json') });
    expect(snapshot()).toEqual(partial);
  });

  it('forgets a step that failed, so it runs next time', async () => {
    world();
    await stale();
    write('flor.txt', 'id: flor\nr = #c03030\n== \n.r.\n.x.\n');
    await expect(stale()).rejects.toThrow(/step\(s\) failed/);
    write('flor.txt', 'id: flor\nr = #c03030\nv = #30a030\n== \n.r.\n.v.\n.v.\n');
    const r = await stale();
    expect(ran(r)).toContain(4);
  });

  it('with dry_run says what would run and why, and writes nothing', async () => {
    world();
    await stale();
    const book = readFileSync(prints(), 'utf8');
    write('silla.voxel.json', { id: 'silla', outline: INK, materials: MATERIALS, boxes: [{ id: 'asiento', at: [0, 0, 0], size: [4, 4, 5], material: 'tela' }] });
    write('flor.txt', 'id: flor\nr = #c03030\nv = #30a030\n== \n.r.\n.v.\nvv.\n');
    const r = await stale({ dry_run: true });
    expect(r.text).toMatch(/1 · voxel {2}← silla\.voxel\.json changed/);
    expect(r.text).toMatch(/4 · from_ascii {2}← flor\.txt changed/);
    expect(r.text).toMatch(/5 · export_sheet {2}← may: reads out\/flor\.pss\.json, which step 4 writes/);
    expect(r.text).toMatch(/5 step\(s\) check out; 3 would run, 2 up to date; nothing was written/);
    expect(readFileSync(prints(), 'utf8')).toBe(book);
  });

  it('keeps its fingerprints beside pgs.json, and says so when there is none', async () => {
    world();
    mkdirSync(at('a/b'), { recursive: true });
    expect(defaultFingerprints(at('a/b'))).toBe(at(FINGERPRINTS_FILE));
    const lone = mkdtempSync(join(tmpdir(), 'pgs-stale-lone-'));
    try {
      expect(defaultFingerprints(lone)).toBeNull();
    } finally {
      rmSync(lone, { recursive: true });
    }
    await expect(runCommand('batch', { recipe: at('receta.json'), fingerprints: prints() })).rejects.toThrow(/add stale=true/);
  });
});

describe('batch only: the steps a pattern names', () => {
  const step = (input: Record<string, unknown>, vars?: Record<string, unknown>) => ({ input, ...(vars ? { each: { vars } } : {}) });

  it('matches a string argument by a piece of it, whole with * and ?, or a value of each', () => {
    expect(matchesOnly(step({ out: 'art/src/ana_parada_yp.pss.json' }), ['parada'])).toBe(true);
    expect(matchesOnly(step({ out: 'art/src/ana_parada_yp.pss.json' }), ['corre'])).toBe(false);
    expect(matchesOnly(step({ frames: ['a/ana_corre_1.voxel.json'] }), ['corre'])).toBe(true);
    expect(matchesOnly(step({ out: 'art/src/ana_parada_yp.pss.json' }), ['*_yp.pss.json'])).toBe(true);
    expect(matchesOnly(step({ out: 'art/src/ana_parada_yp.pss.json' }), ['ana_*'])).toBe(false);
    expect(matchesOnly(step({ rotate: 90 }, { quien: 'ana', giro: 90 }), ['quien=ana'])).toBe(true);
    expect(matchesOnly(step({ rotate: 90 }, { quien: 'ana' }), ['bea', 'ana'])).toBe(true);
  });

  it('runs only those steps, keeping their numbers, and refuses a pattern that names none', async () => {
    world();
    const r = await runCommand('batch', { recipe: at('receta.json'), only: 'flor' }) as unknown as Report;
    expect(ran(r)).toEqual([4, 5]);
    expect(existsSync(at('out/cuarto.png'))).toBe(false);
    await expect(runCommand('batch', { recipe: at('receta.json'), only: ['nada'] })).rejects.toThrow(/no step of receta\.json matches/);
  });

  it('expands each first, so it picks one value of a step that stands for many', async () => {
    world();
    const r = await runCommand('batch', { steps: [{
      command: 'from_ascii', each: { n: ['uno', 'dos', 'tres'] }, txt: at('flor.txt'), out: at('out/{n}.pss.json'),
    }], only: 'n=dos', dry_run: true }) as unknown as { data: { expanded: { out: string }[] } };
    expect(r.data.expanded.map(s => s.out)).toEqual([at('out/dos.pss.json')]);
  });
});

describe('traceFs', () => {
  it('sees what a command reads, asks about and writes, through the named imports of the engine', async () => {
    world();
    const { trace } = await traceFs(() => runCommand('voxel', { model: at('sentada.voxel.json'), out: at('out/s.pss.json') }));
    expect([...trace.reads]).toEqual(expect.arrayContaining([at('sentada.voxel.json'), at('parada.voxel.json'), at('pgs.json')]));
    expect([...trace.writes]).toContain(at('out/s.pss.json'));
    expect([...trace.reads].some(p => p.includes('node_modules') || p.includes('/src/headless/'))).toBe(false);
  });

  it('puts fs back as it was, even when the command throws', async () => {
    const fs = await import('node:fs');
    const before = fs.readFileSync;
    await expect(traceFs(() => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(fs.readFileSync).toBe(before);
    expect(hashFile(at('nada'))).toBeNull();
  });
});
