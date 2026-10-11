// @vitest-environment node
// The animation contract as data: one table instead of four copies of it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAsset, getFrame, loadAsset, saveAsset, setAnimation } from './asset';
import { flipHorizontal } from '../lib/sprite/transforms';
import type { SpriteAsset } from '../lib/types';
import { applyDrawOps } from './ops';
import { writePng } from './png';
import { runCommand } from './commands';
import { importCharacter } from './character';
import { FIGURE_ANIMS, FIGURE_EXTRA_ANIMS } from './figure';
import { animateContract } from './animate';
import {
  BODY_CONTRACT, CONTRACTS, DIRECTIONAL_CONTRACT, checkContract, contractAnims, generatorName, roleOf, viewOf,
} from './contract';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-contract-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('the contract itself', () => {
  it('expands {view} once per view, in the order of the list', () => {
    expect(contractAnims({ anims: ['idle_{view}', 'die'], views: ['down', 'left'] }))
      .toEqual(['idle_down', 'idle_left', 'die']);
    expect(contractAnims(BODY_CONTRACT)).toEqual(['idle', 'walk', 'attack', 'technique', 'hurt', 'die']);
    expect(contractAnims(DIRECTIONAL_CONTRACT)).toHaveLength(4 * 4 + 2);
  });

  it('a {view} with no views is an error, not an empty contract', () => {
    expect(() => contractAnims({ id: 'mine', anims: ['walk_{view}'], views: [] }))
      .toThrow(/contract mine: "walk_\{view\}" asks for a view/);
  });

  it('takes the view off a name, and knows a technique is generated as a cast', () => {
    const views = ['down', 'up', 'left', 'right'];
    expect(viewOf('walk_down', views)).toBe('down');
    expect(viewOf('die', views)).toBe('');
    expect(roleOf('attack_left', views)).toBe('attack');
    expect(roleOf('technique', views)).toBe('technique');
    expect(generatorName('technique_up', views)).toBe('cast_up');
    expect(generatorName('walk_down', views)).toBe('walk_down');
  });

  it('says what an asset is missing, and does not mind extras', () => {
    const a = createAsset({ id: 'x', width: 8, frames: 3 });
    setAnimation(a, { name: 'idle', frameIndices: [0] });
    setAnimation(a, { name: 'sit', frameIndices: [1] });
    setAnimation(a, { name: 'walk', frameIndices: [] });
    const c = checkContract(a, BODY_CONTRACT);
    expect(c.id).toBe('body');
    expect(c.missing).toEqual(['attack', 'technique', 'hurt', 'die']);
    expect(c.empty).toEqual(['walk']);
    expect(c.extra).toEqual(['sit']);
  });

  it('the pose table of figure covers the body contract exactly, so the two cannot drift', () => {
    const poses = FIGURE_ANIMS.map(a => a.name);
    expect(poses).toEqual(contractAnims(BODY_CONTRACT));
    // And what is outside any contract stays outside it.
    for (const extra of FIGURE_EXTRA_ANIMS) expect(poses).not.toContain(extra.name);
  });
});

describe('a project declares its own', () => {
  const file = () => {
    const path = join(dir, 'contrato.json');
    writeFileSync(path, JSON.stringify({ anims: ['idle', 'attack', 'hurt'] }));
    return path;
  };

  it('a built-in by name, a JSON file (named after itself) or the object', async () => {
    expect(Object.keys(CONTRACTS)).toEqual(['body', 'directional']);
    const a = createAsset({ id: 'x', width: 8, frames: 1 });
    setAnimation(a, { name: 'idle', frameIndices: [0] });
    const path = join(dir, 'x.pss.json');
    saveAsset(path, a);
    const byFile = await runCommand('lint', { paths: [path], contract: file() });
    expect(byFile.text).toContain('contract contrato: no animation attack, hurt');
    const byObject = await runCommand('lint', { paths: [path], contract: { id: 'inline', anims: ['idle', 'die'] } });
    expect(byObject.text).toContain('contract inline: no animation die');
    const byName = await runCommand('lint', { paths: [path], contract: 'body' });
    expect(byName.text).toContain('contract body: no animation walk');
  });

  it('a contract that is neither a name nor a file says so', async () => {
    const path = join(dir, 'x.pss.json');
    saveAsset(join(dir, 'x.pss.json'), createAsset({ id: 'x', width: 8 }));
    await expect(runCommand('lint', { paths: [path], contract: 'direccional' }))
      .rejects.toThrow(/neither a built-in \(body, directional\) nor a readable JSON file/);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ animaciones: ['idle'] }));
    await expect(runCommand('lint', { paths: [path], contract: bad })).rejects.toThrow(/contract bad\.json: anims/);
  });

  it('contract_ids keeps the portraits out of it: a face is not a character', async () => {
    const body = join(dir, 'mei.pss.json'), face = join(dir, 'mei_cara.pss.json');
    const a = createAsset({ id: 'mei', width: 8, frames: 1 });
    setAnimation(a, { name: 'idle', frameIndices: [0] });
    saveAsset(body, a);
    saveAsset(face, createAsset({ id: 'mei_cara', width: 8 }));
    const all = await runCommand('lint', { paths: [body, face], contract: 'body' });
    expect((all.text!.match(/contract body/g) ?? []).length).toBe(2);
    const some = await runCommand('lint', { paths: [body, face], contract: 'body', contract_ids: ['mei'] });
    expect((some.text!.match(/contract body/g) ?? []).length).toBe(1);
  });
});

describe('import_character takes the contract', () => {
  /** A pack of flat sheets: 4 views × N steps of 2 px frames. */
  function pack() {
    const solid = (w: number, h: number, rgb: number[]) => {
      const img = { width: w, height: h, data: new Uint8Array(w * h * 4) };
      for (let i = 0; i < w * h; i++) img.data.set([...rgb, 255], i * 4);
      return img;
    };
    writePng(join(dir, 'Idle.png'), solid(8, 2, [10, 10, 10]));
    writePng(join(dir, 'Walk.png'), solid(8, 8, [20, 20, 20]));
    writePng(join(dir, 'Attack.png'), solid(8, 2, [30, 30, 30]));
  }

  it('the default is what it built before, animation for animation and frame for frame', () => {
    pack();
    const { asset, anims } = importCharacter({ dir, layout: 'ninja_separate', id: 'npc', frameSize: 2 });
    expect(anims).toEqual([
      'idle_down', 'idle_up', 'idle_left', 'idle_right',
      'hurt_down', 'hurt_up', 'hurt_left', 'hurt_right',
      'walk_down', 'walk_up', 'walk_left', 'walk_right',
      'attack_down', 'attack_up', 'attack_left', 'attack_right',
    ]);
    expect(asset.animations.find(a => a.name === 'walk_left')!.frameIndices).toEqual([6, 10, 14, 18]);
  });

  it('a contract with fewer animations cuts fewer sheets', () => {
    pack();
    const { asset, sheets } = importCharacter({
      dir, layout: 'ninja_separate', id: 'npc', frameSize: 2,
      contract: { id: 'quieto', anims: ['idle_{view}'], views: ['down', 'up'] },
    });
    expect(sheets).toEqual(['Idle.png']);
    expect(asset.animations.map(a => a.name)).toEqual(['idle_down', 'idle_up']);
  });

  it('a contract with other views names them that way', () => {
    pack();
    const { asset } = importCharacter({
      dir, layout: 'ninja_separate', id: 'npc', frameSize: 2,
      contract: { id: 'sur', anims: ['idle_{view}'], views: ['sur', 'norte', 'oeste', 'este'] },
    });
    expect(asset.animations.map(a => a.name)).toEqual(['idle_sur', 'idle_norte', 'idle_oeste', 'idle_este']);
    // The view's place in the contract is what picks the column of the sheet.
    expect(asset.animations.find(a => a.name === 'idle_oeste')!.frameIndices).toEqual([2]);
  });

  it('an animation the layout cannot make stops the import naming it', () => {
    pack();
    expect(() => importCharacter({
      dir, layout: 'ninja_separate', id: 'npc', frameSize: 2, contract: { anims: ['jump_{view}'] },
    })).toThrow(/layout "ninja_separate" has no sheet for "jump" \(it knows idle, hurt, walk, attack, technique, die\)/);
    expect(() => importCharacter({
      dir, layout: 'ninja_separate', id: 'npc', frameSize: 2, contract: { anims: ['walk'], views: [] },
    })).toThrow(/cuts "walk" one per view, so it cannot make "walk" without one/);
    expect(() => importCharacter({
      dir, layout: 'ninja_separate', id: 'npc', frameSize: 2, contract: { anims: ['die_{view}'] },
    })).toThrow(/cuts "die" whole, not one per view/);
  });

  it('the command answers which animations it built and which the contract still wants', async () => {
    pack();
    const out = join(dir, 'npc.pss.json');
    const r = await runCommand('import_character', { dir, out, layout: 'ninja_separate', id: 'npc', frame_size: 2 });
    const data = r.data as { contract: string; anims: string[]; missing: string[] };
    expect(data.contract).toBe('directional');
    // Special1.png and Dead.png are not in this pack, so the contract is short two.
    expect(data.missing).toEqual(['technique', 'die']);
  });
});

describe('figure takes the contract', () => {
  const recipe = {
    id: 'f',
    skin: ['#f2c9a0', '#ef914f', '#b8613a'],
    hair: { style: 'topknot', tones: ['#4e484a', '#3b3643', '#2c2a33'], band: '#6f9fc4' },
    top: { tones: ['#f4efe3', '#e6dcc6', '#bfb8a8'], sleeves: 'long', trim: '#6f9fc4' },
    skirt: { tones: ['#f4efe3', '#e6dcc6', '#bfb8a8'], length: 0.4 },
    sash: '#3d6a8f',
    pants: ['#8d8a86', '#5f5c5a', '#3b3643'],
    shoes: ['#4a4650', '#2c2a33', '#2c2a33'],
    glow: '#c9a34c', glow_core: '#ffd27a',
  };

  it('the default is the body contract, as before', async () => {
    const out = join(dir, 'f.pss.json');
    await runCommand('figure', { recipe, out });
    expect(loadAsset(out).animations.map(a => a.name)).toEqual(contractAnims(BODY_CONTRACT));
  });

  it('a declared contract picks the animations, from the command or from the recipe', async () => {
    const path = join(dir, 'contrato.json');
    writeFileSync(path, JSON.stringify({ id: 'pelea', anims: ['idle', 'attack', 'die'] }));
    const byCommand = join(dir, 'a.pss.json');
    await runCommand('figure', { recipe, out: byCommand, contract: path });
    expect(loadAsset(byCommand).animations.map(a => a.name)).toEqual(['idle', 'attack', 'die']);
    const byRecipe = join(dir, 'b.pss.json');
    await runCommand('figure', { recipe: { ...recipe, contract: path }, out: byRecipe });
    expect(loadAsset(byRecipe).animations.map(a => a.name)).toEqual(['idle', 'attack', 'die']);
    // And it keeps the contract it was given.
    const lint = await runCommand('lint', { paths: [byCommand], contract: path });
    expect(lint.text).not.toContain('contract pelea');
  });

  it('a contract asking for a pose the rig has no table for fails naming it', async () => {
    await expect(runCommand('figure', { recipe, out: join(dir, 'z.pss.json'), contract: { anims: ['float'] } }))
      .rejects.toThrow(/figure: no pose for 'float'/);
  });
});

describe('animate grows a whole contract', () => {
  /** A crude humanoid with an idle per view, like a pack body. */
  function body(): string {
    const a = createAsset({ id: 'h', width: 16, palette: ['#000000', '#ff0000', '#00ff00'] });
    for (let f = 0; f < 4; f++) {
      if (f) a.layers![0].frames.push(a.layers![0].frames[0].map(r => [...r]));
      applyDrawOps(a, f, [
        { op: 'rect', x: 6, y: 1, w: 4, h: 4, color: 1, fill: true },
        { op: 'rect', x: 5, y: 5, w: 6, h: 6, color: 2, fill: true },
        { op: 'rect', x: 6, y: 11, w: 2, h: 4, color: 3, fill: true },
        { op: 'rect', x: 9, y: 11, w: 2, h: 4, color: 3, fill: true },
      ]);
    }
    ['down', 'up', 'left', 'right'].forEach((v, i) => setAnimation(a, { name: `idle_${v}`, frameIndices: [i] }));
    const path = join(dir, 'h.pss.json');
    saveAsset(path, a);
    return path;
  }

  it('grows every animation of the contract from the pose of its own view', async () => {
    const path = body();
    const r = await runCommand('animate', { path, contract: 'directional', base_from: 'idle_{view}', base: 0 });
    const data = r.data as { made: string[]; skipped: string[] };
    expect(data.made).toHaveLength(14);
    expect(data.made.some(m => m.startsWith('walk_left'))).toBe(true);
    // A technique is generated as a cast, and it is called technique.
    expect(data.made.some(m => m.startsWith('technique'))).toBe(true);
    expect(data.skipped).toEqual([
      'idle_down: the asset already has it', 'idle_up: the asset already has it',
      'idle_left: the asset already has it', 'idle_right: the asset already has it',
    ]);
    // And now it keeps the contract.
    const lint = await runCommand('lint', { paths: [path], contract: 'directional' });
    expect(lint.text).not.toContain('contract directional');
  });

  it('says what it cannot grow and why, instead of leaving a hole', () => {
    const asset = loadAsset(body());
    const r = animateContract(asset, { id: 'mio', anims: ['walk_{view}', 'sit', 'technique'] }, { baseFrom: 'idle_{view}' });
    expect(r.made.map(m => m.anim)).toEqual(['walk_down', 'walk_up', 'walk_left', 'walk_right']);
    expect(r.skipped).toEqual([
      { anim: 'sit', why: 'no generator for "sit" (kinds: idle, walk, run, jump, attack, cast, hurt, die): draw it by hand' },
      { anim: 'technique', why: 'no base pose: base_from is "idle_{view}" and "technique" has no view, so give base too' },
    ]);
    // With a base, the one with no generator is the only one left out.
    const again = animateContract(loadAsset(body()), { anims: ['sit', 'technique'] }, { base: 0 });
    expect(again.made.map(m => m.anim)).toEqual(['technique']);
    expect(again.skipped[0].why).toMatch(/no generator for "sit"/);
  });

  it('a view with no base pose is named, not guessed', () => {
    const asset = loadAsset(body());
    asset.animations = asset.animations.filter(a => a.name !== 'idle_left' && a.name !== 'idle_up');
    const r = animateContract(asset, { anims: ['walk_{view}'] }, { baseFrom: 'idle_{view}' });
    expect(r.skipped).toEqual([{ anim: 'walk_up', why: 'no base pose: the asset has no animation "idle_up"' }]);
    const bare = loadAsset(body());
    bare.animations = bare.animations.filter(a => a.name !== 'idle_left' && a.name !== 'idle_right');
    const none = animateContract(bare, { anims: ['walk_left'] }, { baseFrom: 'idle_{view}' });
    expect(none.skipped).toEqual([{ anim: 'walk_left', why: 'no base pose: the asset has no animation "idle_left" nor "idle_right" to mirror' }]);
  });

  /** A body whose right profile carries a sword out in front (x 13–15): left and right can be told apart. */
  function lopsided(left: boolean): SpriteAsset {
    const asset = loadAsset(body());
    applyDrawOps(asset, 3, [{ op: 'rect', x: 11, y: 7, w: 5, h: 1, color: 1, fill: true }]);
    if (left) {
      asset.layers![0].frames[2] = flipHorizontal(asset.layers![0].frames[3]);
      asset.frames = asset.layers![0].frames;
    } else asset.animations = asset.animations.filter(a => a.name !== 'idle_left');
    return asset;
  }

  it('the left view grows from the right one mirrored, and a left pose of its own goes in facing the right way (#148)', () => {
    for (const hasLeft of [false, true]) {
      const asset = lopsided(hasLeft);
      const r = animateContract(asset, { anims: ['idle_{view}', 'walk_{view}', 'attack_{view}'] }, { baseFrom: 'idle_{view}' });
      const made = r.made.map(m => m.anim);
      expect(made).toContain('walk_left');
      expect(made.includes('idle_left')).toBe(!hasLeft);
      const frames = (name: string) => asset.animations.find(a => a.name === name)!.frameIndices.map(i => getFrame(asset, i));
      for (const kind of ['walk', 'attack']) {
        const right = frames(`${kind}_right`), left = frames(`${kind}_left`);
        expect(left.length).toBe(right.length);
        // every frame of the left is the right one mirrored: the sword out in front, to the west
        left.forEach((f, k) => expect(f, `${kind}_left ${k} (own left pose: ${hasLeft})`).toEqual(flipHorizontal(right[k])));
        expect(left[0][7].slice(0, 3).some(c => c === 1)).toBe(true);
      }
    }
  });

  it('anim and contract are not both, and one pose still needs a base', async () => {
    const path = body();
    await expect(runCommand('animate', { path, anim: 'walk', contract: 'body', base: 0 }))
      .rejects.toThrow(/anim or contract, not both/);
    await expect(runCommand('animate', { path })).rejects.toThrow(/needs anim or contract/);
    await expect(runCommand('animate', { path, anim: 'walk' })).rejects.toThrow(/needs base/);
  });

  it('leaves an animation it already has alone, unless told to redo it', async () => {
    const path = body();
    await runCommand('animate', { path, contract: { anims: ['idle_{view}'] }, base_from: 'idle_{view}' });
    expect(loadAsset(path).animations.find(a => a.name === 'idle_down')!.frameIndices).toEqual([0]);
    await runCommand('animate', { path, contract: { anims: ['idle_{view}'] }, base_from: 'idle_{view}', overwrite: true });
    expect(loadAsset(path).animations.find(a => a.name === 'idle_down')!.frameIndices.length).toBeGreaterThan(1);
  });
});
