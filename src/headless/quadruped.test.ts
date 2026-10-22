// @vitest-environment node
// animate walks a body on four legs (issue #41): the legs are found under the
// belly and go in diagonal pairs. The case is the cat of El patio, whose walk
// was drawn by hand: the generated one is measured against it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Frame, SpriteAsset } from '../lib/types';
import { createAsset, getFrame, loadAsset, saveAsset, setAnimation, setFrame } from './asset';
import { fromAscii } from './ascii';
import { runCommand } from './commands';
import { animateAsset, animateContract } from './animate';
import { findLegs, generateWalkQuadruped, type LegPlan } from '../lib/sprite/generators/quadruped';

const cat = () => fromAscii(readFileSync(join(__dirname, 'fixtures', 'patio', 'gato.txt'), 'utf8')).asset;
const pose = (a: SpriteAsset, anim: string, i = 0) => getFrame(a, a.animations.find(x => x.name === anim)!.frameIndices[i]);
const glyphs = (a: SpriteAsset) => {
  const hex = (g: string) => readFileSync(join(__dirname, 'fixtures', 'patio', 'gato.txt'), 'utf8').match(new RegExp(`^${g} = (#[0-9a-f]{6})`, 'm'))![1];
  return (g: string) => Number(Object.keys(a.palette).find(k => a.palette[Number(k)] === hex(g)));
};
const lum = (a: SpriteAsset) => (i: number) => {
  const n = parseInt(a.palette[i].slice(1, 7), 16);
  return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
};
const cols = (frame: Frame, y: number, from: number, to: number) => frame[y].slice(from, to + 1);
const empty = (frame: Frame, y: number, from: number, to: number) => cols(frame, y, from, to).every(v => !v);

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-quadruped-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('findLegs: the legs under the belly, on the silhouette', () => {
  it('finds the four legs of the cat in profile, the far ones (darker, between) apart', () => {
    const a = cat();
    const plan = findLegs(pose(a, 'idle_right'), 'side', {}, lum(a));
    expect(plan).toMatchObject({ row: 19, bottom: 23 });
    expect(plan.legs.map(l => [l.startC, l.endC, !!l.front, !!l.far])).toEqual([
      [4, 8, false, false], [8, 10, false, true], [13, 15, true, true], [15, 19, true, false],
    ]);
  });

  it('from the front, four legs; from the back, two legs and the tail hanging between them, left still', () => {
    const a = cat();
    const down = findLegs(pose(a, 'idle_down'), 'down');
    expect(down.row).toBe(20);
    expect(down.legs).toHaveLength(4);
    const up = findLegs(pose(a, 'idle_up'), 'up');
    expect(up.row).toBe(21);
    expect(up.legs.map(l => [l.startC, l.endC])).toEqual([[4, 8], [15, 20]]);
    expect(up.still.map(l => [l.startC, l.endC])).toEqual([[9, 14]]);
  });

  it('takes the row and the columns when told, and says what to give when it finds no legs', () => {
    const a = cat();
    const told = findLegs(pose(a, 'idle_right'), 'side', { row: 19, columns: [[4, 8], [8, 10], [13, 15], [15, 19]] }, lum(a));
    expect(told).toEqual(findLegs(pose(a, 'idle_right'), 'side', {}, lum(a)));
    const blob: Frame = Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => (y === 0 || y === 5 || x === 0 || x === 5 ? 1 : 2)));
    expect(() => findLegs(blob, 'side')).toThrow(/no legs under the body.*give legs=/);
  });
});

describe('the walk on four legs: diagonal pairs, the body still', () => {
  function walk(view: 'side' | 'down' | 'up', anim: string): { base: Frame; plan: LegPlan; frames: Frame[] } {
    const a = cat();
    const base = pose(a, anim);
    const plan = findLegs(base, view, {}, lum(a));
    return { base, plan, frames: generateWalkQuadruped(base, view, plan) };
  }

  it('in profile, four frames: the body over the legs never moves, only the legs', () => {
    const { base, plan, frames } = walk('side', 'idle_right');
    expect(frames).toHaveLength(4);
    for (const f of frames) for (let y = 0; y < plan.row; y++) expect(f[y]).toEqual(base[y]);
    expect(new Set(frames.map(f => JSON.stringify(f))).size).toBe(4);
  });

  it('frame 0 opens the near legs (front forward, hind back); frame 2 opens the far ones past them, as the hand did', () => {
    const a = cat();
    const { frames } = walk('side', 'idle_right');
    const o = glyphs(a)('o');
    // near hind sole 2 px back, near front sole 2 px forward
    expect(cols(frames[0], 23, 2, 6)).toEqual(Array(5).fill(o));
    expect(cols(frames[0], 23, 17, 21)).toEqual(Array(5).fill(o));
    // frame 2: under the belly row, the far legs out past the near ones, row by row what the hand drew
    const hand = pose(a, 'walk_right', 2);
    for (const y of [20, 21]) expect(frames[2][y]).toEqual(hand[y]);
    expect(empty(frames[2], 23, 0, 2)).toBe(true);
  });

  it('frames 1 and 3 pass with one diagonal lifted: the near hind with the far front, then the near front with the far hind', () => {
    const { base, plan, frames } = walk('side', 'idle_right');
    const [nearHind, farHind, farFront, nearFront] = plan.legs;
    const lifted = (f: Frame, l: { startC: number; endC: number }) => empty(f, plan.bottom, l.startC + 1, l.endC - 1);
    expect(lifted(base, nearHind)).toBe(false);
    expect([nearHind, farHind, farFront, nearFront].map(l => lifted(frames[1], l))).toEqual([true, false, true, false]);
    expect([nearHind, farHind, farFront, nearFront].map(l => lifted(frames[3], l))).toEqual([false, true, false, true]);
  });

  it('from the front, one diagonal lifts (inner left, outer right) and then the other; the passing frames are the pose', () => {
    const { base, plan, frames } = walk('down', 'idle_down');
    const lifted = (f: Frame) => plan.legs.map(l => empty(f, plan.bottom, l.startC + 1, l.endC - 1));
    expect(lifted(base)).toEqual([false, false, false, false]);
    expect(lifted(frames[0])).toEqual([false, true, false, true]);
    expect(lifted(frames[2])).toEqual([true, false, true, false]);
    expect(frames[1]).toEqual(base);
    expect(frames[3]).toEqual(base);
  });

  it('from the back, the hind legs take turns and the tail between them stays', () => {
    const { base, plan, frames } = walk('up', 'idle_up');
    const [l, r] = plan.legs, tail = plan.still[0];
    for (const f of frames) for (let y = plan.row; y <= plan.bottom; y++) {
      expect(cols(f, y, tail.startC + 1, tail.endC - 1)).toEqual(cols(base, y, tail.startC + 1, tail.endC - 1));
    }
    expect(empty(frames[0], plan.bottom, r.startC + 1, r.endC - 1)).toBe(true);
    expect(empty(frames[0], plan.bottom, l.startC + 1, l.endC - 1)).toBe(false);
    expect(empty(frames[2], plan.bottom, l.startC + 1, l.endC - 1)).toBe(true);
  });

  it('a 16 px beast with one leg at each end walks too, its legs opening and closing by one pixel', () => {
    const rows = [
      '................', '................', '................', '..........111...', '..........121...', '.11111111112111.',
      '.12222222222221.', '.12222222222221.', '.12222222222221.', '.11111111111111.', '..121......121..',
      '..121......121..', '..111......111..', '................', '................', '................',
    ];
    const beast = rows.map(r => [...r].map(c => (c === '.' ? 0 : Number(c))));
    const plan = findLegs(beast, 'side');
    expect(plan).toMatchObject({ row: 10, bottom: 12 });
    expect(plan.legs.map(l => !!l.front)).toEqual([false, true]);
    const [f0, , f2] = generateWalkQuadruped(beast, 'side', plan);
    expect(f0[12].join('')).toBe('0111000000001110');
    expect(f2[12].join('')).toBe('0001110000111000');
  });
});

describe('animate body=quadruped', () => {
  function save(asset: SpriteAsset = cat()): string {
    const path = join(dir, 'gato.pss.json');
    saveAsset(path, asset);
    return path;
  }

  it('walks the cat instead of refusing it: four frames at 8 fps, the left the right one flipped', async () => {
    const path = save();
    const base = cat().animations.find(a => a.name === 'idle_right')!.frameIndices[0];
    const r = await runCommand('animate', { path, base, anim: 'walk_right', name: 'auto', body: 'quadruped' });
    const idx = (r.data as { frames: number[] }).frames;
    expect(idx).toHaveLength(4);
    expect(r.data).not.toHaveProperty('warnings');
    const left = await runCommand('animate', { path, base, anim: 'walk_left', name: 'auto_l', body: 'quadruped' });
    const a = loadAsset(path);
    expect(a.animations.find(x => x.name === 'auto')).toMatchObject({ fps: 8, loop: true });
    const l = (left.data as { frames: number[] }).frames;
    expect(getFrame(a, l[0]).map(row => [...row].reverse())).toEqual(getFrame(a, idx[0]));
  });

  it('a body on four legs only walks: anything else says so, and a contract makes the walks and skips the rest', async () => {
    const a = cat();
    expect(() => animateAsset(a, { base: 0, anim: 'idle_right', body: 'quadruped' })).toThrow(/a body on four legs only has a walk.*draw the idle by hand/);
    const contract = { id: 'patio', anims: ['idle_{view}', 'walk_{view}'], views: ['down', 'up', 'left', 'right'] };
    const rep = animateContract(a, contract, { baseFrom: 'idle_{view}', overwrite: true, body: 'quadruped' });
    expect(rep.made.map(m => m.anim).sort()).toEqual(['walk_down', 'walk_left', 'walk_right', 'walk_up']);
    expect(rep.made.every(m => m.frames === 4)).toBe(true);
    expect(rep.skipped.filter(s => s.anim.startsWith('idle'))).toHaveLength(4);
    expect(rep.skipped[0].why).toMatch(/only has a walk generator, not "idle"/);
  });

  it('anatomy body=quadruped stays on the asset, so animate walks it with nothing more said', async () => {
    const path = save();
    await runCommand('anatomy', { path, body: 'quadruped' });
    expect(loadAsset(path).anatomy).toMatchObject({ body: 'quadruped' });
    const r = await runCommand('animate', { path, base: 0, anim: 'walk_right', name: 'auto' });
    expect((r.data as { frames: number[] }).frames).toHaveLength(4);
  });

  it('legs= fixes the guess; it is refused on a biped and on a contract', async () => {
    const path = save();
    const r = await runCommand('animate', { path, base: 0, anim: 'walk_right', name: 'auto', body: 'quadruped', legs: { row: 19, columns: [[4, 8], [8, 10], [13, 15], [15, 19]] } });
    expect((r.data as { frames: number[] }).frames).toHaveLength(4);
    await expect(runCommand('animate', { path, base: 0, anim: 'walk_right', anatomy: { neckRow: 9 }, legs: { row: 19 } })).rejects.toThrow(/legs is for a body on four legs/);
    await expect(runCommand('animate', { path, contract: 'body', base: 0, body: 'quadruped', legs: { row: 19 } })).rejects.toThrow(/legs goes with anim/);
  });

  it('a body with no legs apart is refused with what to give', () => {
    const blob = createAsset({ id: 'bola', width: 8, palette: ['#000000', '#ffffff'] });
    setFrame(blob, 0, Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => (y === 0 || y === 7 || x === 0 || x === 7 ? 1 : 2))));
    setAnimation(blob, { name: 'idle', frameIndices: [0] });
    expect(() => animateAsset(blob, { base: 0, anim: 'walk_right', body: 'quadruped' })).toThrow(/^animate walk_right: no legs under the body/);
  });
});
