// @vitest-environment node
// animate and figure say "no" instead of "made" on what is not a person
// standing (issue #31). The cases are real drawings: the cat, the owl, the toad
// and the hedgehog of El patio, drawn by hand, have to be refused; the girl of
// the same game, the chibi of The Unwritten Dao and the rigs of figure, kept.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Frame } from '../lib/types';
import { createAsset, getFrame, loadAsset, saveAsset, setAnimation, setFrame } from './asset';
import { fromAscii } from './ascii';
import { runCommand } from './commands';
import { animateAsset, readStanding } from './animate';
import { FIGURE_VIEWS, clipWarnings, figureAsset, figureClip, recipeProblems, type FigureRecipe } from './figure';
import { composite } from './assetModel';

const FIX = join(__dirname, 'fixtures');
const patio = (name: string) => fromAscii(readFileSync(join(FIX, 'patio', `${name}.txt`), 'utf8')).asset;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-standing-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function mask(rows: string[]): Frame {
  return rows.map(r => [...r].map(c => (c === '.' ? 0 : 1)));
}

/** The chibi of The Unwritten Dao standing (proportions.test.ts carries it too). 16 x 32. */
const CHIBI_DOWN = mask([
  '......####......', '.....######.....', '.....######.....', '....########....',
  '...##########...', '..############..', '..############..', '..############..',
  '..############..', '..############..', '..############..', '..############..',
  '...##########...', '....########....', '.##..######.....', '.#############..',
  '..############..', '..############..', '..############..', '..############..',
  '.###.######.###.', '.###.######.###.', '.###.######.###.', '....########....',
  '....###########.', '...############.', '..############..', '..############..',
  '....####..####..', '....####..####..', '....####..####..', '....####..####..',
]);

/**
 * The 16 px chibi of the sprite pack the game borrowed (Ninja Adventure, CC0),
 * standing: a round head filling the square and a small body. The game grows
 * its idle, hurt and technique with animate, so it has to keep passing.
 */
const PACK_CHIBI = mask([
  '................', '......11111.....', '....112222211...', '...13444444431..',
  '..1334444444331.', '..1333344433331.', '..1355533355531.', '.133611666116331',
  '.153666666666351', '.155666666666551', '..156666a666651.', '..1566666666651.',
  '...15556665551..', '..17775aaa57771.', '.155288777722551', '.166999999999661',
]);

describe('readStanding: a person standing, measured on the silhouette', () => {
  it('refuses every pose of the patio cat, the owl, the toad and the hedgehog', () => {
    const seen: string[] = [];
    for (const name of ['gato', 'buho', 'sapo', 'erizo']) {
      const a = patio(name);
      for (const anim of a.animations) {
        for (const i of anim.frameIndices) {
          const r = readStanding(getFrame(a, i));
          expect(r.ok, `${name} ${anim.name} frame ${i}`).toBe(false);
          expect(r.why).toBeTruthy();
          seen.push(`${name}:${anim.name}`);
        }
      }
    }
    // the cat in its three views, standing and walking, all of them
    expect(new Set(seen)).toContain('gato:idle_right');
    expect(new Set(seen)).toContain('gato:idle_down');
    expect(new Set(seen)).toContain('gato:idle_up');
    expect(seen.length).toBeGreaterThan(20);
  });

  it('says what it found on each view of the cat', () => {
    const cat = patio('gato');
    const why = (anim: string) => readStanding(getFrame(cat, cat.animations.find(a => a.name === anim)!.frameIndices[0])).why;
    expect(why('idle_right')).toMatch(/top is at one end/);
    expect(why('idle_down')).toMatch(/top is 2 pieces spread across it, not one crown .*ears/);
    expect(why('idle_up')).toMatch(/top is 2 pieces spread across it, not one crown .*ears/);
    expect(readStanding(getFrame(patio('erizo'), 0)).why).toMatch(/wider than tall/);
    // a body sitting: as tall as wide, one small head on top, the bulk at the bottom
    const sitting = mask(['...####...', '...####...', '...####...', '...####...', '..######..', '..######..', '..######..', '.########.', '.########.', '##########', '##########']);
    expect(readStanding(sitting).why).toMatch(/widest below its middle/);
  });

  it('keeps the people: the girl of the patio, the game chibi, the pack chibi', () => {
    const nena = patio('nena');
    for (let i = 0; i < nena.layers![0].frames.length; i++) expect(readStanding(getFrame(nena, i)).ok, `nena ${i}`).toBe(true);
    expect(readStanding(CHIBI_DOWN).ok).toBe(true);
    expect(readStanding(PACK_CHIBI)).toMatchObject({ ok: true, width: 15, height: 15 });
    expect(readStanding(mask(['....']))).toMatchObject({ ok: false });
    expect(readStanding(mask(['....', '....'])).why).toBe('the base pose is empty');
  });

  it('keeps every view of the rigs figure draws', () => {
    for (const rig of ['jugador32_rig', 'wei_kang32_rig', 'gao_shun32_rig']) {
      const rec = JSON.parse(readFileSync(join(FIX, 'figura', `${rig}.json`), 'utf8')) as FigureRecipe;
      for (const view of ['front', 'back', 'side', 'side_left'] as const) {
        const a = figureAsset({ ...rec, view, anims: ['idle'] });
        expect(readStanding(composite(a, 0)).ok, `${rig} ${view}`).toBe(true);
      }
    }
    expect(FIGURE_VIEWS).toContain('side_left');
  });
});

describe('animate says no on what is not a person standing', () => {
  function save(name: string): string {
    const path = join(dir, `${name}.pss.json`);
    saveAsset(path, patio(name));
    return path;
  }

  it('refuses the cat, names what it did not find and what to do, and writes nothing', async () => {
    const path = save('gato');
    const before = readFileSync(path, 'utf8');
    await expect(runCommand('animate', { path, base: 0, anim: 'walk_right', name: 'walk_auto' }))
      .rejects.toThrow(/frame 0\) does not read as a person standing: its top is at one end.*Draw this animation by hand, or, if it is a person, say where its body is with anatomy= or proportions=/);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('refuses a whole contract on the cat instead of answering made', async () => {
    const path = save('gato');
    const contract = { id: 'patio', anims: ['idle_{view}', 'walk_{view}'], views: ['down', 'up', 'left', 'right'] };
    await expect(runCommand('animate', { path, contract, base_from: 'idle_{view}' }))
      .rejects.toThrow(/does not read as a person standing.*and \d+ more of the contract/);
  });

  it('a contract that grows some views and not others says which and why', async () => {
    const a = createAsset({ id: 'mixto', width: 24, height: 32, palette: ['#000000', '#ffffff'] });
    a.layers![0].frames.push(a.layers![0].frames[0].map(r => [...r]));
    const girl = getFrame(patio('nena'), 0);
    setFrame(a, 0, girl.map(r => [...r.map(v => (v ? 2 : 0)), 0, 0, 0, 0, 0, 0, 0, 0]));
    const cat = getFrame(patio('gato'), 0);
    setFrame(a, 1, [...cat.map(r => r.map(v => (v ? 2 : 0))), ...Array.from({ length: 8 }, () => Array(24).fill(0))]);
    setAnimation(a, { name: 'idle_down', frameIndices: [0] });
    setAnimation(a, { name: 'idle_right', frameIndices: [1] });
    const path = join(dir, 'mixto.pss.json');
    saveAsset(path, a);
    const r = await runCommand('animate', { path, contract: { anims: ['walk_{view}'], views: ['down', 'right'] }, base_from: 'idle_{view}' });
    const data = r.data as { made: string[]; skipped: string[] };
    expect(data.made).toEqual([expect.stringMatching(/^walk_down \(\d+\)$/)]);
    expect(data.skipped).toEqual([expect.stringMatching(/^walk_right: not a person standing: its top is at one end/)]);
  });

  it('a body declared with anatomy or proportions is animated anyway, with a warning', async () => {
    const path = save('gato');
    const r = await runCommand('animate', { path, base: 0, anim: 'idle_right', name: 'auto', anatomy: { neckRow: 9, waistRow: 17 } });
    const data = r.data as { frames: number[]; warnings: string[] };
    expect(data.frames).toHaveLength(4);
    expect(data.warnings[0]).toMatch(/^auto: the base pose \(frame 0\) does not read as a person standing .*animated anyway/);
    const map = { rows: { menton: 0.4, faja: 0.7, botas: 0.95 } };
    const again = await runCommand('animate', { path: save('erizo'), base: 0, anim: 'idle', proportions: map });
    expect((again.data as { warnings: string[] }).warnings).toHaveLength(1);
  });

  it('keeps animating a person standing with no warning: the girl of the patio, the pack chibi', async () => {
    const path = save('nena');
    const r = await runCommand('animate', { path, base: 0, anim: 'idle_down', name: 'auto' });
    expect(r.data).not.toHaveProperty('warnings');
    expect((r.data as { frames: number[] }).frames).toHaveLength(4);
    const pack = createAsset({ id: 'pack', width: 16, palette: ['#15120f', '#6f9fc4'] });
    setFrame(pack, 0, PACK_CHIBI.map(r => r.map(v => (v ? 2 : 0))));
    for (const anim of ['idle', 'hurt_down', 'cast']) expect(() => animateAsset(pack, { base: 0, anim })).not.toThrow();
  });
});

describe('animate frames: how many frames of a loop', () => {
  function girl(): string {
    const path = join(dir, 'nena.pss.json');
    saveAsset(path, patio('nena'));
    return path;
  }

  it('an idle of 2: the rest and the settle, two different frames', async () => {
    const path = girl();
    const r = await runCommand('animate', { path, base: 0, anim: 'idle_down', name: 'respira', frames: 2 });
    const idx = (r.data as { frames: number[] }).frames;
    expect(idx).toHaveLength(2);
    const a = loadAsset(path);
    expect(getFrame(a, idx[0])).not.toEqual(getFrame(a, idx[1]));
    expect(getFrame(a, idx[0])).toEqual(getFrame(a, 0));
    expect(a.animations.find(x => x.name === 'respira')!.frameIndices).toEqual(idx);
  });

  it('1, 3 and 4 for the idle; a walk sampled evenly; the rest refused with what fits', async () => {
    const a = patio('nena');
    expect(animateAsset(a, { base: 0, anim: 'idle', frames: 1 })).toHaveLength(1);
    expect(animateAsset(a, { base: 0, anim: 'idle', frames: 3 })).toHaveLength(3);
    expect(animateAsset(a, { base: 0, anim: 'idle', frames: 4 })).toHaveLength(4);
    const all = animateAsset(a, { base: 0, anim: 'walk_down' }).length;
    expect(animateAsset(a, { base: 0, anim: 'walk_down', frames: all / 2 })).toHaveLength(all / 2);
    expect(() => animateAsset(a, { base: 0, anim: 'idle', frames: 5 })).toThrow(/frames takes 1, 2, 3 or 4/);
    expect(() => animateAsset(a, { base: 0, anim: 'walk_down', frames: all + 1 })).toThrow(/sampled evenly, so frames takes/);
    expect(() => animateAsset(a, { base: 0, anim: 'attack', frames: 2 })).toThrow(/frames is for the loops/);
    await expect(runCommand('animate', { path: girl(), contract: 'body', base: 0, frames: 2 })).rejects.toThrow(/frames goes with anim/);
  });
});

describe('figure says what is missing and what does not fit', () => {
  const NENA: FigureRecipe = {
    id: 'nena', width: 16, height: 32, stance: 'upright', heading: { front: 90 }, anims: ['idle'],
    build: { height: 26, heads: 2.5 }, ink: '#2c2849', skin: ['#f6dccb', '#e6b8a8', '#b98b8e'],
    hair: { style: 'long', tones: ['#7a4a3a', '#5a3428', '#3a2018'] },
    top: { tones: ['#e6929e', '#c86f80', '#8e4a63'] }, skirt: { tones: ['#e6929e', '#c86f80', '#8e4a63'], length: 0.35 },
    pants: ['#463d69', '#352e52', '#2c2849'], shoes: ['#7d97bf', '#5d77a0', '#463d69'],
  };

  it('a minimal recipe names the fields it lacks instead of a JavaScript error', async () => {
    // the recipe of the cat in the patio diary (Gato 5)
    const recipe = { view: 'side', build: {}, skin: '#ece9f2', anims: ['idle', 'walk'] };
    await expect(runCommand('figure', { recipe, out: join(dir, 'gato.pss.json') }))
      .rejects.toThrow(/the recipe cannot be drawn, it lacks hair \(missing.*top \(missing.*pants \(missing\); shoes \(missing\)/);
    expect(recipeProblems({ ...NENA, hair: { style: 'curly' as never, tones: '#000' } })).toEqual([expect.stringMatching(/^hair\.style \('curly' is not one/)]);
    expect(recipeProblems({ ...NENA, skirt: { tones: ['#fff', '#eee'] as never } })).toEqual(['skirt.tones (not a color nor three tones)']);
    expect(recipeProblems(NENA)).toEqual([]);
  });

  it('16x32 with the soles on the last row: the feet fall off, and it says which ground fits them', async () => {
    const out = join(dir, 'nena.pss.json');
    const r = await runCommand('figure', { recipe: { ...NENA, ground: 31 }, out, view: 'front' });
    expect((r.data as { warnings: string[] }).warnings).toEqual([expect.stringMatching(/^the feet fall \d px under the 16x32 canvas \(ground 31\): ground \d+ fits them$/)]);
    const fit = Number(/ground (\d+) fits/.exec((r.data as { warnings: string[] }).warnings[0])![1]);
    // the ground it names is the one that fits: no warning, and the soles' outline on the canvas
    const ok = await runCommand('figure', { recipe: { ...NENA, ground: fit }, out, view: 'front' });
    expect(ok.data).not.toHaveProperty('warnings');
    expect(figureClip({ ...NENA, ground: fit, view: 'front' })).toMatchObject({ below: 0, above: 0, left: 0, right: 0 });
  });

  it('a canvas with no rows to spare asks for a taller one', () => {
    const tight = { ...NENA, height: 26, ground: 25, build: { height: 26, heads: 2.5 } };
    const clip = figureClip(tight);
    expect(clip.below + clip.above).toBeGreaterThan(0);
    expect(clipWarnings(tight, clip).join(' ')).toMatch(/give (height|headroom) \d+/);
  });

  it('the figure keeps writing nothing when the recipe cannot be drawn', async () => {
    const out = join(dir, 'nada.pss.json');
    writeFileSync(out, 'antes');
    await expect(runCommand('figure', { recipe: { skin: '#fff' }, out })).rejects.toThrow(/lacks/);
    expect(readFileSync(out, 'utf8')).toBe('antes');
  });
});
