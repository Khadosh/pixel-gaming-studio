// transform acts on every layer of a frame (issue #44): the cat of el-patio got
// its left view as `frames duplicate` + `transform op=flip_h`, and with a collar
// on its retouch layer only layer 0 flipped and the collar floated on the back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import { runCommand } from './commands';
import { composite } from './assetModel';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-transform-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A 4x3 cat facing right, drawn by hand, declared a base: the head on the right. */
const BASE = [
  'id: gato', 'name: Gato', 'category: character', 'size: 4x3',
  'base: protected', '',
  'o = #2c2849 sombra', 'W = #ece9f2 blanco', '',
  '== idle_right 0', '..oW', 'WWWW', 'o..o', '',
].join('\n');

/** The collar, on the neck (under the head, right side), on the retouch layer. */
const RETOUCH = [
  'id: gato_retoque', 'name: Retoque de Gato', 'category: character', 'size: 4x3',
  'retouch_of: gato.txt', '',
  'r = #c0392b rojo', '',
  '==', '....', '..rr', '....', '',
].join('\n');

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as SpriteAsset;

/** The pixels of a frame as the game gets them, by hex. */
function seen(asset: SpriteAsset, frame: number): string[] {
  return composite(asset, frame).map(row => row.map(v => (v ? asset.palette[v] : '.')).join(' '));
}

/** The cat with its collar: base on layer 0, retouch on a layer "retoque". */
async function cat(): Promise<string> {
  const txt = join(dir, 'gato.txt');
  writeFileSync(txt, BASE);
  writeFileSync(join(dir, 'gato.retoque.txt'), RETOUCH);
  const out = join(dir, 'gato.pss.json');
  await runCommand('from_ascii', { txt, out });
  expect(load(out).layers!.map(l => l.name)).toEqual(['Base', 'retoque']);
  return out;
}

const R = '#c0392b', o = '#2c2849', W = '#ece9f2';

describe('transform on a retouched asset', () => {
  it('flip_h of a duplicated frame mirrors the retouch with the base', async () => {
    const path = await cat();
    await runCommand('frames', { path, action: 'duplicate', index: 0 });
    const res = await runCommand('transform', { path, op: 'flip_h', frame: 1 });
    expect((res.data as { layers?: number }).layers).toBe(2);
    const asset = load(path);
    // The right view is untouched; the left one is its mirror, collar included.
    expect(seen(asset, 0)).toEqual([`. . ${o} ${W}`, `${W} ${W} ${R} ${R}`, `${o} . . ${o}`]);
    expect(seen(asset, 1)).toEqual([`${W} ${o} . .`, `${R} ${R} ${W} ${W}`, `${o} . . ${o}`]);
  });

  it('flip_v and shift move every layer too', async () => {
    const path = await cat();
    await runCommand('transform', { path, op: 'shift', dx: -1, dy: 0 });
    let asset = load(path);
    expect(seen(asset, 0)[1]).toBe(`${W} ${R} ${R} .`);
    await runCommand('transform', { path, op: 'flip_v' });
    asset = load(path);
    expect(seen(asset, 0)[1]).toBe(`${W} ${R} ${R} .`);
    expect(seen(asset, 0)[0]).toBe(`. . ${o} .`);
    expect(seen(asset, 0)[2]).toBe(`. ${o} ${W} .`);
  });

  it('layer= still moves only that layer', async () => {
    const path = await cat();
    const res = await runCommand('transform', { path, op: 'flip_h', layer: 0 });
    expect((res.data as { layers?: number }).layers).toBeUndefined();
    // The base flipped alone: the collar stays where it was, over the back.
    expect(seen(load(path), 0)[1]).toBe(`${W} ${W} ${R} ${R}`);
    expect(seen(load(path), 0)[0]).toBe(`${W} ${o} . .`);
  });

  it('a layer that does not exist fails with what the asset has', async () => {
    const path = join(dir, 'solo.pss.json');
    await runCommand('from_ascii', { text: BASE.replace('base: protected\n', ''), out: path });
    await expect(runCommand('transform', { path, op: 'flip_h', layer: 1 }))
      .rejects.toThrow(/layer 1 does not exist \(the asset has 1 layer, 0 to 0\)/);
  });

  it('an asset with one layer answers as before, without a layer count', async () => {
    const path = join(dir, 'solo.pss.json');
    await runCommand('from_ascii', { text: BASE.replace('base: protected\n', ''), out: path });
    const res = await runCommand('transform', { path, op: 'flip_h' });
    expect((res.data as { layers?: number }).layers).toBeUndefined();
    expect(seen(load(path), 0)[0]).toBe(`${W} ${o} . .`);
  });
});
