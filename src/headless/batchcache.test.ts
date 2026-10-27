// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { FINGERPRINTS_FILE } from './batchstale';

let dir: string;
let store: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pgs-cache-'));
  store = mkdtempSync(join(tmpdir(), 'pgs-cache-store-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

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
const silla = (size: number[], material = 'madera') =>
  ({ id: 'silla', outline: INK, materials: MATERIALS, boxes: [{ id: 'asiento', at: [0, 0, 0], size, material }] });

/** A room with a chair put in it with `place`, a pose derived with `base`, and a drawing with its sheet. */
function world() {
  write('pgs.json', { name: 'mundo', says: 'un cuarto', visual: { light: { from: 'upper_left' } } });
  write('silla.voxel.json', silla([4, 4, 3]));
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

type Report = { data: { done: number; upToDate?: number; fromCache?: number; steps: { index: number; why?: string; cached?: boolean }[] }; text?: string };
const batch = async (extra: Record<string, unknown> = {}) =>
  await runCommand('batch', { recipe: at('receta.json'), stale: true, fingerprints: prints(), cache: store, ...extra }) as unknown as Report;
const drew = (r: Report) => r.data.steps.filter(s => !s.cached).map(s => s.index);
const taken = (r: Report) => r.data.steps.filter(s => s.cached).map(s => s.index);

/** Every file under out/, by name, as bytes. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(at('out')).sort()) out[f] = readFileSync(at(`out/${f}`)).toString('base64');
  return out;
}

/** A copy with no drawings and no fingerprints: a clone of a game that keeps them out of git. */
const fresh = () => {
  rmSync(at('out'), { recursive: true, force: true });
  rmSync(prints(), { force: true });
};

describe('batch cache: what one copy drew, another takes', () => {
  it('takes every step from the cache in a copy with nothing drawn, the same bytes and the same fingerprints', async () => {
    world();
    const first = await batch();
    expect(drew(first)).toEqual([1, 2, 3, 4, 5]);
    expect(first.data.fromCache).toBe(0);
    const files = snapshot();
    const book = readFileSync(prints(), 'utf8');
    fresh();
    const second = await batch();
    expect(taken(second)).toEqual([1, 2, 3, 4, 5]);
    expect(second.text).toMatch(/5\/5 step\(s\) done, 5 from the cache, 0 up to date/);
    expect(second.text).toMatch(/1 ✓ voxel: from the cache {2}← no fingerprint/);
    expect(snapshot()).toEqual(files);
    expect(readFileSync(prints(), 'utf8')).toBe(book);
    // and then it is up to date, as if it had drawn them
    expect((await batch()).data.upToDate).toBe(5);
  });

  it('draws only what read something new, and gives the same files as a whole run', async () => {
    world();
    await batch();
    fresh();
    write('silla.voxel.json', silla([3, 4, 5], 'tela'));
    const r = await batch();
    expect(drew(r)).toEqual([1]);
    expect(taken(r)).toEqual([2, 3, 4, 5]);
    const mixed = snapshot();
    rmSync(at('out'), { recursive: true });
    await runCommand('batch', { recipe: at('receta.json') });
    expect(snapshot()).toEqual(mixed);
  });

  it('keeps the last ways a step was drawn: a change undone comes back from the cache', async () => {
    world();
    await batch();
    write('silla.voxel.json', silla([3, 4, 5], 'tela'));
    expect(drew(await batch())).toEqual([1]);
    write('silla.voxel.json', silla([4, 4, 3]));
    const back = await batch();
    expect(taken(back)).toEqual([1]);
    expect(drew(back)).toEqual([]);
  });

  it('runs a step that reads what an earlier one took, judged on the bytes it took', async () => {
    world();
    await batch();
    fresh();
    write('flor.txt', 'id: flor\nr = #c03030\nv = #30a030\n== \nrr.\n.v.\n.v.\n');
    const r = await batch();
    // the drawing changed, so its sheet is new too: both drawn
    expect(drew(r)).toEqual([4, 5]);
    expect(taken(r)).toEqual([1, 2, 3]);
  });

  it('throws away a file of the cache that is not what its hash says, and draws', async () => {
    world();
    await batch();
    const files = snapshot();
    fresh();
    const blobs = join(store, 'files');
    for (const d of readdirSync(blobs)) for (const f of readdirSync(join(blobs, d))) writeFileSync(join(blobs, d, f), 'roto');
    const r = await batch();
    expect(drew(r)).toEqual([1, 2, 3, 4, 5]);
    expect(snapshot()).toEqual(files);
    // and what it drew went back in, whole
    fresh();
    expect(taken(await batch())).toEqual([1, 2, 3, 4, 5]);
    expect(snapshot()).toEqual(files);
  });

  it('never serves two steps that write one file: the draw would paint on a canvas already painted', async () => {
    write('pgs.json', { name: 'mundo' });
    write('receta.json', { steps: [
      { command: 'new', path: at('out/a.pss.json'), width: 8, palette: ['#000000'] },
      { command: 'palette', path: at('out/a.pss.json'), add: ['#ff0000'] },
      { command: 'draw', path: at('out/a.pss.json'), frame: 0, ops: [{ op: 'pixel', x: 1, y: 1, color: 2 }] },
      { command: 'export_sheet', path: at('out/a.pss.json'), out: at('out/a.png') },
    ] });
    await batch();
    const files = snapshot();
    fresh();
    const r = await batch();
    expect(drew(r)).toEqual([1, 2, 3]);
    expect(taken(r)).toEqual([4]);
    expect(snapshot()).toEqual(files);
  });

  it('fills itself from a copy whose drawings are up to date, drawing nothing', async () => {
    world();
    await runCommand('batch', { recipe: at('receta.json'), stale: true, fingerprints: prints() });
    const files = snapshot();
    const seeded = await batch();
    expect(seeded.data.upToDate).toBe(5);
    expect(seeded.data.steps).toEqual([]);
    fresh();
    expect(taken(await batch())).toEqual([1, 2, 3, 4, 5]);
    expect(snapshot()).toEqual(files);
  });

  it('serves a copy with no fingerprints whose steps name a file another step names: the base of two poses', async () => {
    world();
    const pose = (n: number) => ({ command: 'voxel', frames: [at('parada.voxel.json'), at('sentada.voxel.json')].slice(0, n), out: at(`out/p${n}.pss.json`), png: at(`out/p${n}.png`) });
    write('receta.json', { steps: [pose(1), pose(2)] });
    await batch();
    const files = snapshot();
    fresh();
    expect(taken(await batch())).toEqual([1, 2]);
    expect(snapshot()).toEqual(files);
  });

  it('wants stale=true', async () => {
    world();
    await expect(runCommand('batch', { recipe: at('receta.json'), cache: store })).rejects.toThrow(/add stale=true/);
  });

  it('is shared by copies of the project in other folders (estudio#446)', () => {
    world();
    write('receta.json', { steps: [
      { command: 'voxel', model: 'cuarto.voxel.json', out: 'out/cuarto.pss.json', png: 'out/cuarto.png', layers: true },
      { command: 'voxel', model: 'sentada.voxel.json', out: 'out/sentada.pss.json', png: 'out/sentada.png' },
    ] });
    const pgs = (cwd: string) =>
      execFileSync(join(process.cwd(), 'bin/pgs'), ['batch', 'recipe=receta.json', 'stale=true', `cache=${store}`], { encoding: 'utf8', cwd });
    expect(pgs(dir)).toMatch(/2\/2 step\(s\) done, 0 up to date/);
    const copy = mkdtempSync(join(tmpdir(), 'pgs-cache-copy-'));
    try {
      cpSync(dir, copy, { recursive: true, filter: s => !s.includes(`${dir}/out`) && !s.endsWith(FINGERPRINTS_FILE) });
      expect(existsSync(join(copy, 'out'))).toBe(false);
      expect(pgs(copy)).toMatch(/2\/2 step\(s\) done, 2 from the cache, 0 up to date/);
      expect(readFileSync(join(copy, 'out/cuarto.png'))).toEqual(readFileSync(at('out/cuarto.png')));
      expect(readFileSync(join(copy, 'out/cuarto.fondo.png'))).toEqual(readFileSync(at('out/cuarto.fondo.png')));
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
