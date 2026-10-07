// @vitest-environment node
// The body plan `anatomy` stores is not only rows. The engine takes whatever
// sticks out sideways of the torso for an arm, so on a 16x32 chibi with a sword
// hilt over one shoulder and a gourd at the other hip it swung the hilt and the
// gourd and left the real sleeves — which sit inside the torso — frozen. The
// columns of the torso, and the box of each member, have to be storable too.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAsset, loadAsset, saveAsset } from './asset';
import { runCommand } from './commands';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-anatomy-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function emptyAsset(path: string) {
  const asset = createAsset({ id: 'chibi', name: 'chibi', width: 16, height: 32, palette: ['#15120f'] });
  saveAsset(path, asset);
  return path;
}

describe('anatomy stores the whole body plan', () => {
  it('keeps the torso columns and the member boxes, not just the rows', () => {
    const path = emptyAsset(join(dir, 'chibi.pss.json'));

    runCommand('anatomy', {
      path,
      neckRow: 17, waistRow: 27, kneeRow: 29, ankleRow: 31,
      torsoLeft: 5, torsoRight: 10,
      leftArmArea: { startR: 17, endR: 22, startC: 1, endC: 4 },
      rightArmArea: { startR: 17, endR: 22, startC: 11, endC: 14 },
    });

    const saved = loadAsset(path);
    expect(saved.anatomy).toMatchObject({
      mode: 'humanoid',
      neckRow: 17, waistRow: 27, kneeRow: 29, ankleRow: 31,
      torsoLeft: 5, torsoRight: 10,
      leftArmArea: { startR: 17, endR: 22, startC: 1, endC: 4 },
      rightArmArea: { startR: 17, endR: 22, startC: 11, endC: 14 },
    });
  });

  it('adds to what is there instead of replacing it, and clear wipes it', () => {
    const path = emptyAsset(join(dir, 'chibi.pss.json'));

    runCommand('anatomy', { path, neckRow: 17 });
    runCommand('anatomy', { path, torsoLeft: 5 });
    expect(loadAsset(path).anatomy).toMatchObject({ neckRow: 17, torsoLeft: 5 });

    runCommand('anatomy', { path, clear: true });
    expect(loadAsset(path).anatomy).toBeUndefined();
  });
});
