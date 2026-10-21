// The asset JSON as PGS writes it (lib/assetJson.ts): a row of pixels per
// line, the same object as before for whoever reads it.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringifyAsset } from './assetJson';
import { createAsset, loadAsset, saveAsset, setFrame } from '../headless/asset';
import type { SpriteAsset } from './types';

const sample = (): SpriteAsset => {
  const a = createAsset({ id: 'silla', name: 'Silla "de" [prueba]', width: 6, height: 4, category: 'prop', palette: ['#112233', '#445566'], frames: 2 });
  setFrame(a, 0, [[0, 0, 1, 1, 0, 0], [0, 1, 2, 2, 1, 0], [0, 1, 2, 2, 1, 0], [0, 0, 1, 1, 0, 0]]);
  setFrame(a, 1, [[0, 0, 0, 0, 0, 0], [0, 0, 1, 1, 0, 0], [0, 1, 2, 2, 1, 0], [1, 1, 1, 1, 1, 1]]);
  a.colorNames = { 1: 'madera', 2: 'tela' };
  a.description = 'a string with [1,2,3] and "\\u0000pgs-row:[9]" inside';
  a.animations = [{ name: 'idle', label: 'IDLE', frameIndices: [0, 1], fps: 4, loop: true }];
  return a;
};

describe('the asset JSON on disk', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

  it('parses to the very same object as JSON.stringify(asset, null, 1)', () => {
    const a = sample();
    expect(JSON.parse(stringifyAsset(a))).toEqual(JSON.parse(JSON.stringify(a, null, 1)));
    // Strings that look like rows stay strings.
    expect(JSON.parse(stringifyAsset(a)).description).toBe(a.description);
  });

  it('writes each row of pixels on one line, and the rest as before', () => {
    const text = stringifyAsset(sample());
    expect(text).toContain('[0,1,2,2,1,0]');
    expect(text.split('\n').filter(l => /^\s*\[[\d,]+\],?$/.test(l))).toHaveLength(8);
    // frameIndices is a list of numbers too: one line.
    expect(text).toContain('"frameIndices": [0,1]');
    expect(text).toContain('\n "id": "silla",');
    expect(text).toContain('"1": "madera"');
  });

  it('reads an asset written the old way and the new way to the same asset', () => {
    dir = mkdtempSync(join(tmpdir(), 'pgs-assetjson-'));
    const a = sample();
    const old = join(dir, 'viejo.pss.json');
    writeFileSync(old, JSON.stringify(a, null, 1) + '\n');
    const neu = join(dir, 'nuevo.pss.json');
    saveAsset(neu, a);
    expect(loadAsset(neu)).toEqual(loadAsset(old));
    expect(readFileSync(neu, 'utf8').length).toBeLessThan(readFileSync(old, 'utf8').length);
    // Written again from what was read, it is the same file.
    const again = join(dir, 'otra_vez.pss.json');
    saveAsset(again, loadAsset(old));
    expect(readFileSync(again, 'utf8')).toBe(readFileSync(neu, 'utf8'));
  });

  it('keeps nulls, empty lists and lists of lists as JSON does', () => {
    const v = { a: [], b: [1, null, 3], c: [[1, 2], []], d: [[]], e: ['x', 1], f: [-0.5, 1e21] };
    expect(JSON.parse(stringifyAsset(v))).toEqual(JSON.parse(JSON.stringify(v)));
  });
});
