// @vitest-environment node
// The rig in profile, and the drawn parts it carries (#13, #14): a head per
// view, a part hung from a joint, the order in front of or behind the body.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIGURE_LAYERS, fallWarnings, figureAsset, figureJoints, figureLayered, liftOrder, materialOf, RUN_FRAME_MS, stackOrder, toneOf, type FigureLayer, type FigureRecipe } from './figure';
import { runCommand } from './commands';
import { blankImage, getPixel, readPng, setPixel } from './png';
import type { SpriteAsset } from '../lib/types';

const INK = '#15120f';
const base: FigureRecipe = {
  id: 'f', width: 32, height: 48, stance: 'upright', elevation: 0,
  heading: { front: 90, back: -90 },
  build: { heads: 2.5, height: 33 },
  // one color per material: no light, so a mirror is a mirror
  skin: '#f2c9a0', hair: { style: 'topknot', tones: '#3b3643' },
  top: { tones: '#f4efe3', sleeves: 'long' }, pants: '#2c2a33', shoes: '#5a3a26',
};

/** the frame of an animation as hex per pixel (null = empty) */
function frame(a: SpriteAsset, anim: string, k = 0): (string | null)[][] {
  const an = a.animations.find(x => x.name === anim)!;
  return a.layers![0].frames[an.frameIndices[k]].map(r => r.map(v => (v ? a.palette[v] : null)));
}
const mirror = (f: (string | null)[][]) => f.map(r => [...r].reverse());
/** where a color sits: the box of its pixels */
function box(f: (string | null)[][], hex: string): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  f.forEach((r, y) => r.forEach((c, x) => {
    if (c === hex) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }));
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

describe('figure in profile', () => {
  it('draws a side view, and side_left is its mirror', () => {
    // the upright stance is the same on both sides above the hips, so the two
    // profiles must be each other's mirror pixel for pixel there; below, the
    // left foot stands a little ahead, and from the other side it is the near
    // one (a camera, not a flipped picture)
    const head = { rows: ['abb', 'aca', 'aaa'], legend: { a: '#3b3643', b: '#dbeeff', c: '#d14b34' } };
    const rec = { ...base, anims: ['idle'], head_art: { side: head } };
    const side = frame(figureAsset({ ...rec, view: 'side' }), 'idle');
    const left = frame(figureAsset({ ...rec, view: 'side_left' }), 'idle');
    const front = frame(figureAsset({ ...rec, view: 'front' }), 'idle');
    expect(left.slice(0, 37)).toEqual(mirror(side).slice(0, 37));
    expect(side).not.toEqual(front);
    expect(side).not.toEqual(mirror(side));
  });

  it('is narrower from the side than from the front, and walks in a scissor', () => {
    const width = (f: (string | null)[][], y: number) => {
      const xs = f[y].flatMap((c, x) => (c ? [x] : []));
      return xs.length ? xs[xs.length - 1] - xs[0] + 1 : 0;
    };
    const rec = { ...base, anims: ['idle', 'walk'] };
    const side = figureAsset({ ...rec, view: 'side' }), front = figureAsset({ ...rec, view: 'front' });
    // at the chest (row 30) the profile is the body's depth, not its width with both arms
    expect(width(frame(side, 'idle'), 30)).toBeLessThan(width(frame(front, 'idle'), 30));
    // the feet: apart along the ground at the stride, together at the passing
    const feet = (f: (string | null)[][]) => box(f.slice(43), '#5a3a26')!;
    const stride = feet(frame(side, 'walk', 0)), passing = feet(frame(side, 'walk', 1));
    expect(stride[2] - stride[0]).toBeGreaterThan(passing[2] - passing[0] + 2);
    // and the next stride is the other foot: the same spread, mirrored in time
    const other = feet(frame(side, 'walk', 2));
    expect(Math.abs((other[2] - other[0]) - (stride[2] - stride[0]))).toBeLessThanOrEqual(1);
  });
});

describe('the rig\'s own face in profile', () => {
  it('draws the eye a pixel in from the edge with white in front of it, and a nose past the edge', () => {
    // no head_art: the rig's skull. Look along the eye's row toward the face
    const rec: FigureRecipe = { ...base, skin: ['#f2c9a0', '#ef914f', '#b8613a'], anims: ['idle'], eye_white: '#fefefe' };
    for (const view of ['side', 'side_left'] as const) {
      const f = frame(figureAsset({ ...rec, view }), 'idle');
      const dir = view === 'side' ? 1 : -1;
      const white = box(f, '#fefefe');
      expect(white).not.toBeNull();
      const [wx, wy] = white!;
      // eye, white, outline: the eye no longer melts into the contour
      expect(f[wy][wx - dir]).toBe(INK);
      expect(f[wy][wx + dir]).toBe(INK);
      expect(f[wy][wx + 2 * dir]).toBeNull();
      // the nose: skin on a row below the eye, out past the eye's column of white
      // (in the mid tone or the shade: the front of a face turned right is away from the light)
      const nose = [wy + 1, wy + 2, wy + 3].some(y => ['#ef914f', '#b8613a'].includes(f[y][wx + dir]!) && f[y][wx + 2 * dir] === INK);
      expect(nose).toBe(true);
    }
    // eyes shut: no white, a line instead
    const hurt = frame(figureAsset({ ...rec, view: 'side', anims: ['hurt'] }), 'hurt');
    expect(box(hurt, '#fefefe')).toBeNull();
    // from the front nothing of this happens: two eyes, no white
    expect(box(frame(figureAsset({ ...rec, view: 'front' }), 'idle'), '#fefefe')).toBeNull();
  });
});

describe('upright fight poses', () => {
  const rec: FigureRecipe = { ...base, anims: ['idle', 'attack', 'hurt', 'die'] };
  const differ = (a: (string | null)[][], b: (string | null)[][]) => a.flat().filter((c, i) => c !== b.flat()[i]).length;
  it('the strike reads straight on: from the front the hand goes up, then down and across', () => {
    // the fighter's jab moves the fist along the camera's line; the lunge does not
    const front = figureAsset({ ...rec, view: 'front' });
    const fighter = figureAsset({ ...rec, stance: 'fighter', view: 'front' });
    const idle = frame(front, 'idle');
    expect(differ(frame(front, 'attack', 0), idle)).toBeGreaterThan(differ(frame(fighter, 'attack', 0), frame(fighter, 'idle')));
    // the lunge drops the body: the crown is lower than standing
    const top = (f: (string | null)[][]) => f.findIndex(r => r.some(Boolean));
    expect(top(frame(front, 'attack', 1))).toBeGreaterThan(top(idle));
  });
  it('dies folded on the ground, inside the canvas, the head low', () => {
    const side = figureAsset({ ...rec, view: 'side' });
    const last = frame(side, 'die', 3);
    const top = last.findIndex(r => r.some(Boolean));
    expect(top).toBeGreaterThan(frame(side, 'idle').findIndex(r => r.some(Boolean)) + 10);
    expect(last.every(r => r[0] === null && r[r.length - 1] === null)).toBe(true);
  });
});

describe('die lies down, the drawn head with it (Khadosh/pixel-gaming-studio#22)', () => {
  // a fighter of the Dao as the game builds it: 48x48, three heads, heading 128, a drawn head
  const wei = JSON.parse(readFileSync(join(__dirname, 'fixtures/figura/wei_kang_cuerpo.json'), 'utf8')) as FigureRecipe;
  // a head of one color, taller than wide, so where it is and how it lies can be read off the frame
  const M = '#ff00ff';
  const tall = { rows: Array(14).fill('m'.repeat(10)), legend: { m: M } };
  const rec: FigureRecipe = { ...wei, anims: ['idle', 'die'], head_art: { front: tall, front_shut: tall } };
  const a = figureAsset(rec);
  const inkBox = (f: (string | null)[][]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    f.forEach((r, y) => r.forEach((c, x) => { if (c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }));
    return { w: x1 - x0 + 1, h: y1 - y0 + 1, x0, x1 };
  };

  it('the chin never sits on the lap: chin to waist at least half of standing, or the head turned', () => {
    const chinToWaist = (k: number, anim = 'die') => figureJoints(rec, anim, k).pelvis[1] - box(frame(a, anim, k), M)![3];
    const standing = chinToWaist(0, 'idle');
    expect(standing).toBeGreaterThan(4);
    for (let k = 0; k < 4; k++) {
      const [x0, y0, x1, y1] = box(frame(a, 'die', k), M)!;
      const turned = x1 - x0 + 1 === 14 && y1 - y0 + 1 === 10;
      if (!turned) expect(chinToWaist(k), `die ${k}`).toBeGreaterThanOrEqual(standing / 2);
    }
  });

  it('ends lying across the screen, the drawn head turned a quarter whole, inside the canvas', () => {
    const last = frame(a, 'die', 3);
    const ink = inkBox(last);
    expect(ink.w).toBeGreaterThan(ink.h);
    expect(ink.x0).toBeGreaterThan(0);
    expect(ink.x1).toBeLessThan(last[0].length - 1);
    // the head lies: the 10 x 14 drawing is 14 across and 10 down, every pixel of it
    const [x0, y0, x1, y1] = box(last, M)!;
    expect([x1 - x0 + 1, y1 - y0 + 1]).toEqual([14, 10]);
    // it lies on the ground: the soles' row of standing is the lowest row of the fall
    const bottom = (f: (string | null)[][]) => f.length - 1 - [...f].reverse().findIndex(r => r.some(Boolean));
    expect(bottom(last)).toBe(bottom(frame(a, 'idle')));
    // and away from where it faces: the rival looks down to the left, it falls back to the right
    expect((x0 + x1) / 2).toBeGreaterThan(figureJoints(rec, 'die', 3).pelvis[0]);
    expect(fallWarnings(rec)).toEqual([]);
  });

  it('an arm reads in the fall: the one it sits back on, and the one flung past the head', () => {
    const { asset } = figureLayered({ ...rec, arms_layer: true });
    const arms = (k: number) => {
      const an = asset.animations.find(x => x.name === 'die')!;
      const rows: number[][] = [];
      for (const l of asset.layers!) {
        if (l.name !== 'brazos' && l.name !== 'mangas') continue;
        l.frames[an.frameIndices[k]].forEach((r, y) => r.forEach((v, x) => { if (v) (rows[y] ??= []).push(x); }));
      }
      return rows.filter(Boolean);
    };
    for (const k of [2, 3]) {
      const rows = arms(k);
      // seen, and three pixels thick somewhere: not the one or two of an arm against the robe
      expect(rows.flat().length, `die ${k}`).toBeGreaterThan(12);
      expect(Math.max(...rows.map(r => r.length)), `die ${k}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the parts hung from the body turn with it', () => {
    // a sword slung on the back (the player's), drawn over it here to be seen: standing, along the spine; lying, across
    const sword = { name: 'espada', joint: 'spine_top' as const, legend: { s: '#00ffff' }, views: { front: { rows: ['s', 's', 's', 's', 's', 's', 's', 's'], anchor: [0, 2] as [number, number] } } };
    const b = figureAsset({ ...rec, attachments: [sword] });
    const up = box(frame(b, 'idle'), '#00ffff')!, down = box(frame(b, 'die', 3), '#00ffff')!;
    expect(up[3] - up[1]).toBeGreaterThan(up[2] - up[0]);
    expect(down[2] - down[0]).toBeGreaterThan(down[3] - down[1]);
  });

  it('on a canvas too narrow to lie down it stays sitting, inside it, and says the sideroom that lets it lie', () => {
    const chibi = JSON.parse(readFileSync(join(__dirname, 'fixtures/figura/wei_kang32_rig.json'), 'utf8')) as FigureRecipe;
    const narrow: FigureRecipe = { ...chibi, view: 'front', anims: ['idle', 'die'] };
    const last = frame(figureAsset(narrow), 'die', 3);
    expect(last.every(r => r[0] === null && r[r.length - 1] === null)).toBe(true);
    const [said] = fallWarnings(narrow);
    expect(said).toMatch(/ends sitting sprawled; give sideroom (\d+)/);
    const room = +said.match(/sideroom (\d+)/)![1];
    const wide = { ...narrow, sideroom: room };
    expect(fallWarnings(wide)).toEqual([]);
    const lying = frame(figureAsset(wide), 'die', 3);
    expect(inkBox(lying).w).toBeGreaterThan(inkBox(lying).h);
    expect(lying.every(r => r[0] === null && r[r.length - 1] === null)).toBe(true);
  });
});

describe('kneel', () => {
  it('kneels on one knee with the eyes open, lower than standing and taller than the fall, and breathes', () => {
    const head = (c: string) => ({ rows: ['hhh', 'h' + c + 'h'], legend: { h: '#3b3643', o: '#6f9fc4', s: '#ef914f' }, anchor: [1, 1] as [number, number] });
    const rec: FigureRecipe = { ...base, view: 'front', anims: ['idle', 'die', 'kneel'], head_art: { front: head('o'), front_shut: head('s') } };
    const a = figureAsset(rec);
    const top = (f: (string | null)[][]) => f.findIndex(r => r.some(Boolean));
    const bottom = (f: (string | null)[][]) => f.length - 1 - [...f].reverse().findIndex(r => r.some(Boolean));
    const k0 = frame(a, 'kneel', 0), k1 = frame(a, 'kneel', 1);
    expect(a.animations.find(x => x.name === 'kneel')!.loop).toBe(true);
    expect(top(k0)).toBeGreaterThan(top(frame(a, 'idle')) + 3);
    expect(top(k0)).toBeLessThan(top(frame(a, 'die', 3)));
    // on the ground: the same sole row as standing
    expect(bottom(k0)).toBe(bottom(frame(a, 'idle')));
    // the eyes open: the drawn head's open art, not the _shut
    expect(box(k0, '#6f9fc4')).not.toBeNull();
    expect(box(k0, '#ef914f')).toBeNull();
    // breathing moves the chest, the knee on the ground stays
    expect(k0).not.toEqual(k1);
    expect(bottom(k1)).toBe(bottom(k0));
  });

  it('reads as kneeling, not crouching: upright torso, head high, one knee raised out to the side with the hand on it', () => {
    // measured on the joints, straight on (the camera a map sprite uses) and
    // in profile (where a lean shows): a crouch leans in, drops the head and
    // keeps both knees up; a kneel keeps the body up over one knee on the ground
    const front: FigureRecipe = { ...base, view: 'front', anims: ['idle', 'kneel'] };
    const ground = (base.height ?? 48) - 2 + 0.5;
    const up = (y: number) => ground - y;
    const idle = figureJoints(front, 'idle');
    for (const k of [0, 1]) {
      const side = figureJoints({ ...front, view: 'side' }, 'kneel', k);
      const lean = Math.atan2(Math.abs(side.chest[0] - side.pelvis[0]), side.pelvis[1] - side.chest[1]) * 180 / Math.PI;
      expect(lean).toBeLessThan(15);
      const j = figureJoints(front, 'kneel', k);
      expect(up(j.head[1]) / up(idle.head[1])).toBeGreaterThanOrEqual(0.8);
      // one knee on the ground, the other at mid height and out past its hip
      expect(up(j.knee_right[1])).toBeLessThan(2.5);
      expect(up(j.knee_left[1]) / up(j.pelvis[1])).toBeGreaterThan(0.6);
      expect(Math.abs(j.knee_left[0] - j.pelvis[0])).toBeGreaterThan(Math.abs(j.hip_left[0] - j.pelvis[0]) + 3);
      // the foot planted under that knee, the hand resting on it
      expect(up(j.foot_left[1])).toBeLessThan(2.5);
      expect(Math.abs(j.foot_left[0] - j.knee_left[0])).toBeLessThan(1.5);
      expect(Math.hypot(j.hand_left[0] - j.knee_left[0], j.hand_left[1] - j.knee_left[1])).toBeLessThan(2.5);
    }
  });
});

describe('eat', () => {
  it('sits like sit with the eyes open, the bowl at the chest and then up at the mouth', () => {
    // sit has the eyes shut and the hands in the lap: at a table it read as
    // meditating. eat keeps the seat and opens the eyes, the hands up in front
    // of the chest holding the bowl, then lifted toward the mouth
    const head = (c: string) => ({ rows: ['hhh', 'h' + c + 'h'], legend: { h: '#3b3643', o: '#6f9fc4', s: '#ef914f' }, anchor: [1, 1] as [number, number] });
    const bowl = { name: 'cuenco', joint: 'hand_left' as const, anims: ['eat'], views: { front: { rows: ['bbb'], legend: { b: '#d14b34' }, depth: 3 } } };
    const rec: FigureRecipe = {
      ...base, view: 'front', anims: ['idle', 'sit', 'eat'],
      head_art: { front: head('o'), front_shut: head('s') }, attachments: [bowl],
    };
    const a = figureAsset(rec);
    const bottom = (f: (string | null)[][]) => f.length - 1 - [...f].reverse().findIndex(r => r.some(Boolean));
    const e0 = frame(a, 'eat', 0), e1 = frame(a, 'eat', 1);
    expect(a.animations.find(x => x.name === 'eat')!.frameIndices).toHaveLength(2);
    // sit stays as it was: eyes shut, no bowl
    expect(box(frame(a, 'sit', 1), '#ef914f')).not.toBeNull();
    expect(box(frame(a, 'sit', 1), '#d14b34')).toBeNull();
    // eat: the eyes open and the bowl in the hands, on the same seat
    for (const f of [e0, e1]) {
      expect(box(f, '#6f9fc4')).not.toBeNull();
      expect(box(f, '#d14b34')).not.toBeNull();
      expect(bottom(f)).toBe(bottom(frame(a, 'sit', 1)));
    }
    const sit = figureJoints(rec, 'sit', 1), low = figureJoints(rec, 'eat', 0), up = figureJoints(rec, 'eat', 1);
    expect(Math.abs(low.pelvis[1] - sit.pelvis[1])).toBeLessThan(0.6);
    // screen y grows down: the hands well over the lap, at the chest, below the head
    for (const s of ['left', 'right'] as const) {
      expect(sit[`hand_${s}`][1] - low[`hand_${s}`][1]).toBeGreaterThan(3);
      expect(Math.abs(low[`hand_${s}`][1] - low.chest[1])).toBeLessThan(2);
      expect(low[`hand_${s}`][1] - up[`hand_${s}`][1]).toBeGreaterThan(2);
      expect(up[`hand_${s}`][1]).toBeGreaterThan(up.head[1]);
    }
    // the bowl goes up with the hands
    expect(box(e1, '#d14b34')![1]).toBeLessThan(box(e0, '#d14b34')![1] - 1);
  });
});

describe('hammer', () => {
  it('lifts the hand up beside the head and brings it down ahead at shoulder height, straight on', () => {
    const front: FigureRecipe = { ...base, view: 'front', anims: ['idle', 'hammer'] };
    const idle = figureJoints(front, 'idle');
    const up = figureJoints(front, 'hammer', 0), down = figureJoints(front, 'hammer', 1);
    // screen y grows down. A chibi's arm (2.5 heads) can't reach over the
    // crown: the fist goes as high as the head, beside it, and the hammer drawn
    // in it is what rises over the crown. Then the fist comes down in front of
    // the body (toward the middle) at shoulder height, where the face of an
    // anvil stands beside a chibi: at the belt the hammer hung by the hip
    expect(up.hand_right[1]).toBeLessThan(idle.head[1] + 0.5);
    expect(up.hand_right[1]).toBeLessThan(idle.shoulder_right[1] - 5);
    expect(Math.abs(down.hand_right[1] - down.shoulder_right[1])).toBeLessThan(2);
    expect(down.hand_right[1]).toBeLessThan(idle.pelvis[1] - 3);
    expect(down.hand_right[1] - up.hand_right[1]).toBeGreaterThan(8);
    expect(Math.abs(down.hand_right[0] - idle.pelvis[0])).toBeLessThan(Math.abs(idle.hand_right[0] - idle.pelvis[0]) - 3);
    // the feet stay planted: a strike, not a step
    for (const j of [up, down]) {
      expect(Math.abs(j.foot_left[1] - idle.foot_left[1])).toBeLessThan(0.6);
      expect(Math.abs(j.foot_right[0] - idle.foot_right[0])).toBeLessThan(1);
    }
    const a = figureAsset(front);
    expect(a.animations.find(x => x.name === 'hammer')!.frameIndices).toHaveLength(3);
  });

  it('in profile, the blow lands ahead with the arm level, at shoulder height', () => {
    const side: FigureRecipe = { ...base, view: 'side', anims: ['idle', 'hammer'] };
    const down = figureJoints(side, 'hammer', 1);
    // the arm straight out ahead: the hand well in front of the shoulder and
    // the forearm level (a hand at the hip read as the hammer hanging, far
    // from the anvil's face)
    expect(down.hand_right[0] - down.shoulder_right[0]).toBeGreaterThan(4);
    expect(Math.abs(down.hand_right[1] - down.shoulder_right[1])).toBeLessThan(2);
    expect(Math.abs(down.hand_right[1] - down.elbow_right[1])).toBeLessThan(1);
  });

  it('shows a part only in the frames it names: the hammer raised, then the hammer down', () => {
    const tool = (c: string, frames: number[]) => ({
      name: c, joint: 'hand_right' as const, anims: ['hammer'], frames,
      views: { front: { rows: ['xx', 'xx'], legend: { x: c }, anchor: [0, 0] as [number, number] } },
    });
    const rec: FigureRecipe = { ...base, view: 'front', anims: ['idle', 'hammer'], attachments: [tool('#d14b34', [0]), tool('#6fa05a', [1, 2])] };
    const a = figureAsset(rec);
    expect(box(frame(a, 'hammer', 0), '#d14b34')).not.toBeNull();
    expect(box(frame(a, 'hammer', 0), '#6fa05a')).toBeNull();
    expect(box(frame(a, 'hammer', 1), '#d14b34')).toBeNull();
    expect(box(frame(a, 'hammer', 1), '#6fa05a')).not.toBeNull();
    // outside its animation, neither
    expect(box(frame(a, 'idle'), '#d14b34')).toBeNull();
  });
});

describe('stir', () => {
  it('holds a pole with both hands ahead of the chest, one over the other, and works it without stepping', () => {
    const side: FigureRecipe = { ...base, view: 'side', anims: ['idle', 'stir'] };
    const idle = figureJoints(side, 'idle');
    const f = [0, 1, 2].map(k => figureJoints(side, 'stir', k));
    for (const j of f) {
      // both hands ahead of the shoulder (in profile, ahead is +x), the right
      // one over the left by 3 px or more and close above it: one pole
      expect(j.hand_right[0] - j.shoulder_right[0]).toBeGreaterThan(2);
      expect(j.hand_left[0] - j.shoulder_left[0]).toBeGreaterThan(2);
      expect(j.hand_left[1] - j.hand_right[1]).toBeGreaterThan(3);
      expect(Math.abs(j.hand_left[0] - j.hand_right[0])).toBeLessThan(2);
      // the feet stay planted
      expect(Math.abs(j.foot_left[0] - idle.foot_left[0])).toBeLessThan(1);
      expect(Math.abs(j.foot_right[1] - idle.foot_right[1])).toBeLessThan(0.6);
    }
    // sink pushes the hands out, turn draws them back to the body, lift raises them
    expect(f[0].hand_right[0] - f[1].hand_right[0]).toBeGreaterThan(1.5);
    expect(f[1].hand_right[1] - f[2].hand_right[1]).toBeGreaterThan(1);
    const a = figureAsset(side);
    const stir = a.animations.find(x => x.name === 'stir')!;
    expect(stir.frameIndices).toHaveLength(3);
    expect(stir.loop).toBe(true);
  });
});

describe('headroom and sideroom', () => {
  it('grow the canvas up and to the sides and keep the body, its drawings and its joints where they were from the soles', () => {
    const cap = { name: 'gorro', joint: 'head' as const, views: { side: { rows: ['xxx'], legend: { x: '#d14b34' }, at: [14, 6] as [number, number] } } };
    const rec: FigureRecipe = { ...base, view: 'side', anims: ['idle'], attachments: [cap] };
    const roomy: FigureRecipe = { ...rec, headroom: 32, sideroom: 8 };
    const a = figureAsset(rec), b = figureAsset(roomy);
    expect([b.width, b.height]).toEqual([48, 80]);
    const fa = frame(a, 'idle'), fb = frame(b, 'idle');
    // the 32 x 48 at the bottom, in the middle, is the frame without room, pixel for pixel
    expect(fb.slice(32).map(r => r.slice(8, 40))).toEqual(fa);
    // and the room is empty
    expect(fb.slice(0, 32).every(r => r.every(c => c === null))).toBe(true);
    expect(fb.every(r => r.slice(0, 8).every(c => c === null) && r.slice(40).every(c => c === null))).toBe(true);
    // from the other side too: a drawing cut for the side view is mirrored on the canvas without room
    const la = frame(figureAsset({ ...rec, view: 'side_left' }), 'idle');
    const lb = frame(figureAsset({ ...roomy, view: 'side_left' }), 'idle');
    expect(lb.slice(32).map(r => r.slice(8, 40))).toEqual(la);
    const ja = figureJoints(rec), jb = figureJoints(roomy);
    expect(jb.head[0] - ja.head[0]).toBeCloseTo(8);
    expect(jb.head[1] - ja.head[1]).toBeCloseTo(32);
    // a part drawn past the old canvas shows in the room: a pole up over the head
    const pole = { name: 'pala', joint: 'hand_right' as const, views: { side: { rows: Array(40).fill('x'), legend: { x: '#6fa05a' }, anchor: [0, 39] as [number, number] } } };
    const up = frame(figureAsset({ ...roomy, attachments: [pole] }), 'idle');
    expect(box(up, '#6fa05a')![1]).toBeLessThan(32);
  });
});

describe('blink', () => {
  const rec: FigureRecipe = { ...base, anims: ['idle', 'walk', 'blink', 'blink_walk'] };
  /** the pixels where two frames differ, as [x, y] */
  const diff = (a: (string | null)[][], b: (string | null)[][]) =>
    a.flatMap((r, y) => r.flatMap((c, x) => (c !== b[y][x] ? [[x, y]] : [])));
  it('is each idle and walk frame with the eyes shut: only the eyes change, from the front and in profile', () => {
    for (const view of ['front', 'side', 'side_left'] as const) {
      const a = figureAsset({ ...rec, view });
      for (const [of, twin, n] of [['idle', 'blink', 2], ['walk', 'blink_walk', 4]] as const) {
        const an = a.animations.find(x => x.name === twin)!;
        expect(an.frameIndices).toHaveLength(n);
        expect(an.durations).toEqual(a.animations.find(x => x.name === of)!.durations);
        for (let k = 0; k < n; k++) {
          const d = diff(frame(a, of, k), frame(a, twin, k));
          expect(d.length).toBeGreaterThan(0);
          // all of it in a band a few px tall across the face
          const ys = d.map(p => p[1]);
          expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(3);
        }
      }
    }
  });
  it('carries what the idle carries: a part drawn for idle only is still there', () => {
    const flag = { rows: ['d'], legend: { d: '#c9a34c' }, anchor: [0, 0] as [number, number] };
    const a = figureAsset({ ...rec, view: 'front', attachments: [{ joint: 'pelvis', anims: ['idle'], views: { front: flag } }] });
    expect(box(frame(a, 'blink'), '#c9a34c')).toEqual(box(frame(a, 'idle'), '#c9a34c'));
    // and a part that sways in the walk sways the same in its twin
    const sway = { ...rec, view: 'side' as const, attachments: [{ joint: 'pelvis' as const, sway: { dy: -1, phase: 1 }, views: { side: flag } }] };
    const b = figureAsset(sway);
    for (let k = 0; k < 4; k++) expect(box(frame(b, 'blink_walk', k), '#c9a34c')).toEqual(box(frame(b, 'walk', k), '#c9a34c'));
  });
  it('a drawn head blinks with its _blink art, and falls back to _shut', () => {
    const head = (c: string) => ({ rows: ['hhh', 'h' + c + 'h'], legend: { h: '#3b3643', o: '#6f9fc4', s: '#ef914f', b: '#b8613a' }, anchor: [1, 1] as [number, number] });
    const withShut = { ...rec, view: 'front' as const, head_art: { front: head('o'), front_shut: head('s') } };
    expect(box(frame(figureAsset(withShut), 'blink'), '#ef914f')).not.toBeNull();
    const withBlink = { ...withShut, head_art: { ...withShut.head_art, front_blink: head('b') } };
    const a = figureAsset({ ...withBlink, anims: ['idle', 'blink', 'hurt'] });
    expect(box(frame(a, 'blink'), '#b8613a')).not.toBeNull();
    expect(box(frame(a, 'blink'), '#ef914f')).toBeNull();
    expect(box(frame(a, 'hurt', 1), '#ef914f')).not.toBeNull(); // hurt keeps its _shut
  });
  it('follows the stance: a fighter blinks in its own guard', () => {
    const a = figureAsset({ ...rec, stance: 'fighter', view: 'front' });
    const d = diff(frame(a, 'idle'), frame(a, 'blink'));
    expect(d.length).toBeGreaterThan(0);
    expect(Math.max(...d.map(p => p[1])) - Math.min(...d.map(p => p[1]))).toBeLessThanOrEqual(3);
  });
});

describe('arm_swing', () => {
  it('from the front the walk swings the arms on screen, the near hand down, and leaves the rest alone', () => {
    // the lowest skin pixel on each side, below the face: where each hand is
    const hands = (f: (string | null)[][]) => [0, 1].map(side => {
      let low = -1;
      f.forEach((r, y) => r.forEach((c, x) => {
        if (y > 26 && c === '#f2c9a0' && (side === 0 ? x < 12 : x > 19)) low = Math.max(low, y);
      }));
      return low;
    });
    const rec = { ...base, anims: ['idle', 'walk'], view: 'front' as const };
    const flat = figureAsset(rec), swung = figureAsset({ ...rec, arm_swing: 1 });
    // without it, a camera looking along the swing sees both hands at one height
    for (const k of [0, 2]) {
      const [l, r] = hands(frame(flat, 'walk', k));
      expect(Math.abs(l - r)).toBeLessThanOrEqual(1);
    }
    // with it, one hand drops and then the other, and neither gets lost
    const [a0, b0] = hands(frame(swung, 'walk', 0)), [a2, b2] = hands(frame(swung, 'walk', 2));
    for (const y of [a0, b0, a2, b2]) expect(y).toBeGreaterThan(0);
    expect(Math.abs(a0 - b0)).toBeGreaterThanOrEqual(2);
    expect(Math.sign(a0 - b0)).toBe(-Math.sign(a2 - b2));
    // the standing frame is the same: only the walk moves
    expect(frame(swung, 'idle')).toEqual(frame(flat, 'idle'));
  });
});

describe('drawn parts', () => {
  // a 3x3 head with a marked anchor pixel and an asymmetric row
  const head = { rows: ['abb', 'aca', 'aaa'], legend: { a: '#3b3643', b: '#dbeeff', c: '#d14b34' }, anchor: [1, 1] as [number, number] };

  it('pastes the profile head on the head joint, and side_left flips it', () => {
    const rec: FigureRecipe = { ...base, anims: ['idle'], head_art: { side: head } };
    const f = frame(figureAsset({ ...rec, view: 'side' }), 'idle');
    const [jx, jy] = figureJoints({ ...rec, view: 'side' }).head;
    // the anchor pixel (c) sits on the joint
    expect(box(f, '#d14b34')).toEqual([Math.round(jx), Math.round(jy), Math.round(jx), Math.round(jy)]);
    // the light pixels (b) are on the right of the top row; mirrored, on the left
    const b = box(f, '#dbeeff')!;
    expect(b[0]).toBe(Math.round(jx));
    const l = frame(figureAsset({ ...rec, view: 'side_left' }), 'idle');
    expect(l.slice(0, 37)).toEqual(mirror(f).slice(0, 37));
    // flip by hand on a view does the same
    const byHand = frame(figureAsset({ ...rec, head_art: { side_left: { ...head, flip: true } }, view: 'side_left' }), 'idle');
    expect(byHand).toEqual(l);
  });

  it('a part cut with "at" comes back where it was cut, in the standing frame', () => {
    const rec: FigureRecipe = {
      ...base, anims: ['idle'],
      attachments: [{ joint: 'hip_left', views: { front: { rows: ['dd', 'dd'], legend: { d: '#c9a34c' }, at: [20, 37] } } }],
    };
    expect(box(frame(figureAsset({ ...rec, view: 'front' }), 'idle'), '#c9a34c')).toEqual([20, 37, 21, 38]);
  });

  it('a part follows its joint from one pose to the next', () => {
    const rec: FigureRecipe = {
      ...base, view: 'side', anims: ['walk'],
      attachments: [{ name: 'lantern', joint: 'hand_right', views: { side: { rows: ['d'], legend: { d: '#c9a34c' }, anchor: [0, 0] } } }],
    };
    const a = figureAsset(rec);
    for (const k of [0, 1, 2]) {
      const [jx, jy] = figureJoints(rec, 'walk', k).hand_right;
      expect(box(frame(a, 'walk', k), '#c9a34c')).toEqual([Math.round(jx), Math.round(jy), Math.round(jx), Math.round(jy)]);
    }
    const p0 = box(frame(a, 'walk', 0), '#c9a34c')!, p2 = box(frame(a, 'walk', 2), '#c9a34c')!;
    expect(p0[0]).not.toBe(p2[0]); // the hand swings: forward at one stride, back at the other
  });

  it('goes behind the body or in front of it, per view', () => {
    // a sheet over the chest: in front of the body from the front, behind it in profile
    const sheet = { rows: ['ddd', 'ddd', 'ddd'], legend: { d: '#c9a34c' }, anchor: [1, 1] as [number, number] };
    const rec: FigureRecipe = {
      ...base, anims: ['idle'],
      attachments: [{ joint: 'chest', views: { front: sheet, side: { ...sheet, behind: true } } }],
    };
    expect(box(frame(figureAsset({ ...rec, view: 'front' }), 'idle'), '#c9a34c')).not.toBeNull();
    expect(box(frame(figureAsset({ ...rec, view: 'side' }), 'idle'), '#c9a34c')).toBeNull(); // the chest covers it
    // a view the part does not list does not show it
    expect(box(frame(figureAsset({ ...rec, view: 'back' }), 'idle'), '#c9a34c')).toBeNull();
    // depth puts it between: on the chest but under an arm that swings in front
    const deep: FigureRecipe = { ...rec, attachments: [{ joint: 'chest', views: { side: { ...sheet, depth: -50 } } }] };
    expect(box(frame(figureAsset({ ...deep, view: 'side' }), 'idle'), '#c9a34c')).toBeNull();
  });

  it('an outlined part keeps its own edge: the figure inks around the rest only', () => {
    // a flag sticking out to the left of the body, its edge pixels left open on purpose
    const flag = { rows: ['ddd', 'd..'], legend: { d: '#c9a34c' }, at: [1, 30] as [number, number] };
    const rec: FigureRecipe = { ...base, view: 'front', anims: ['idle'], attachments: [{ joint: 'chest', views: { front: flag } }] };
    const plain = frame(figureAsset(rec), 'idle');
    const lined = frame(figureAsset({ ...rec, attachments: [{ joint: 'chest', views: { front: { ...flag, outlined: true } } }] }), 'idle');
    expect(plain[29][1]).toBe(INK); // the figure outlines what it did not draw itself
    expect(lined[29][1]).toBeNull(); // but not a drawing that brings its own line
  });

  it('a drawn limb stands in for the rig\'s, only in the animations it was drawn for', () => {
    // a sleeve drawn in profile, hung from the right elbow, instead of the rig's right arm
    const sleeve = { rows: ['d'], legend: { d: '#c9a34c' }, anchor: [0, 0] as [number, number], replaces: ['arm_right' as const] };
    const rec: FigureRecipe = {
      ...base, anims: ['idle', 'attack'], top: { tones: '#f4efe3', sleeve: '#6f9fc4' },
      attachments: [{ joint: 'elbow_right', anims: ['idle'], views: { side: sleeve } }],
    };
    const side = figureAsset({ ...rec, view: 'side' });
    const plain = figureAsset({ ...rec, attachments: [], view: 'side' });
    const blue = (f: (string | null)[][]) => f.flat().filter(c => c === '#6f9fc4').length;
    // standing: the drawing, and less of the rig's sleeve (only the far arm is left)
    expect(box(frame(side, 'idle'), '#c9a34c')).not.toBeNull();
    expect(blue(frame(side, 'idle'))).toBeLessThan(blue(frame(plain, 'idle')));
    // striking: the rig's arm, untouched
    expect(frame(side, 'attack', 1)).toEqual(frame(plain, 'attack', 1));
    // side_left mirrors it: it hangs from the left elbow and stands in for the left arm
    const left = { ...rec, view: 'side_left' as const };
    const [jx, jy] = figureJoints(left).elbow_left;
    expect(box(frame(figureAsset(left), 'idle'), '#c9a34c')).toEqual([Math.round(jx) - 1, Math.round(jy), Math.round(jx) - 1, Math.round(jy)]);
  });

  it('a view can change what the drawing changes: the sleeve blue in profile only', () => {
    const rec: FigureRecipe = { ...base, anims: ['idle'], views: { side: { top: { tones: '#f4efe3', sleeve: '#6f9fc4' } } } };
    expect(box(frame(figureAsset({ ...rec, view: 'side' }), 'idle'), '#6f9fc4')).not.toBeNull();
    expect(box(frame(figureAsset({ ...rec, view: 'front' }), 'idle'), '#6f9fc4')).toBeNull();
  });

  it('a part sways on its own, a step behind the walk, and stands still when the figure does', () => {
    // a ribbon hung from the head: one frame on the joint, the next a pixel up and back
    const ribbon = { rows: ['d'], legend: { d: '#c9a34c' }, anchor: [0, 0] as [number, number] };
    const rec: FigureRecipe = {
      ...base, view: 'side', anims: ['idle', 'walk'],
      attachments: [{ name: 'ribbon', joint: 'head', sway: { dx: -1, dy: -1 }, views: { side: ribbon } }],
    };
    const still = { ...rec, attachments: [{ ...rec.attachments![0], sway: undefined }] };
    const a = figureAsset(rec), plain = figureAsset(still);
    const where = (asset: SpriteAsset, k: number) => box(frame(asset, 'walk', k), '#c9a34c')!.slice(0, 2);
    const joint = (k: number) => figureJoints(rec, 'walk', k).head.map(Math.round);
    // phase 1: frames 1 and 2 as cut, 3 and 0 moved; so frames 0 and 2 differ in the part
    for (const k of [1, 2]) expect(where(a, k)).toEqual(joint(k));
    for (const k of [3, 0]) expect(where(a, k)).toEqual([joint(k)[0] - 1, joint(k)[1] - 1]);
    expect(where(a, 0)).not.toEqual(where(plain, 0));
    expect(where(a, 2)).toEqual(where(plain, 2));
    // standing, the drawing does not move
    expect(frame(a, 'idle', 0)).toEqual(frame(plain, 'idle', 0));
    expect(frame(a, 'idle', 1)).toEqual(frame(plain, 'idle', 1));
    // from the other side it trails the other way; a view can keep it still
    const left = figureAsset({ ...rec, view: 'side_left' });
    const jl = figureJoints({ ...rec, view: 'side_left' }, 'walk', 0).head.map(Math.round);
    expect(box(frame(left, 'walk', 0), '#c9a34c')!.slice(0, 2)).toEqual([jl[0] - 1 /* the flip */ + 1 /* the sway, mirrored */, jl[1] - 1]);
    const held: FigureRecipe = { ...rec, attachments: [{ ...rec.attachments![0], views: { side: { ...ribbon, sway: null } } }] };
    expect(frame(figureAsset(held), 'walk', 0)).toEqual(frame(plain, 'walk', 0));
  });

  it('a joined part goes on from the drawn head with no seam, and keeps its line against the body', () => {
    // a beard: the head drawn whole, and a part from the head joint that goes on
    // down over the chest (its top sits over the head's last rows)
    const beard = '#cfd6d8', face = '#f2c9a0';
    const headArt = { rows: Array(8).fill('ffffffff'), legend: { f: face }, outlined: true };
    const part = { rows: ['bbbb', 'bbbb', 'bbbb', 'bbbb', 'bbbb', 'bbbb'], legend: { b: beard }, anchor: [2, -2] as [number, number], outlined: true };
    const rec = (joined?: boolean): FigureRecipe => ({
      ...base, view: 'front', anims: ['idle'], head_art: { front: headArt },
      attachments: [{ name: 'barba', joint: 'head', joined, views: { front: part } }],
    });
    const cut = frame(figureAsset(rec()), 'idle'), seamless = frame(figureAsset(rec(true)), 'idle');
    const [x0, y0, x1] = box(seamless, beard)!;
    const above = (f: (string | null)[][]) => f[y0 - 1].slice(x0, x1 + 1);
    // without it, the part in front inks the face above it; joined, the face stays face
    expect(above(cut)).toContain(INK);
    expect(above(seamless)).not.toContain(INK);
    expect(above(seamless)).toContain(face);
    // where it hangs over the body it still has its line
    const [, , , y1] = box(seamless, beard)!;
    expect(seamless[y1 + 1].slice(x0, x1 + 1)).toContain(INK);
  });

  it('the same recipe gives the same pixels', () => {
    const rec: FigureRecipe = {
      ...base, view: 'side', head_art: { side: head },
      attachments: [{ joint: 'spine_top', views: { side: { rows: ['dd'], legend: { d: '#c9a34c' }, behind: true } } }],
    };
    expect(JSON.stringify(figureAsset(rec))).toBe(JSON.stringify(figureAsset(rec)));
  });

  it('says which joint it does not know, and which glyph is missing', () => {
    const bad = { ...base, anims: ['idle'], attachments: [{ name: 'gourd', joint: 'tail' as never, views: { front: { rows: ['d'], legend: { d: '#c9a34c' } } } }] };
    expect(() => figureAsset({ ...bad, view: 'front' })).toThrow(/gourd hangs from 'tail'/);
    const glyph = { ...base, anims: ['idle'], attachments: [{ name: 'gourd', joint: 'chest' as const, views: { front: { rows: ['z'] } } }] };
    expect(() => figureAsset({ ...glyph, view: 'front' })).toThrow(/attachment gourd: glyph 'z'/);
  });
});

describe('run', () => {
  const rec: FigureRecipe = { ...base, anims: ['idle', 'walk', 'run'] };
  const side = { ...rec, view: 'side' as const };
  /** the widest the feet get apart ahead and behind, in px, over an animation */
  const stride = (r: FigureRecipe, anim: string, n: number) => Math.max(...Array.from({ length: n }, (_, k) => {
    const j = figureJoints(r, anim, k);
    return Math.abs(j.foot_left[0] - j.foot_right[0]);
  }));
  /** the trunk off the vertical, hips to the top of the spine, + is ahead */
  const lean = (r: FigureRecipe, anim: string, k: number) => {
    const j = figureJoints(r, anim, k);
    return (Math.atan2(j.spine_top[0] - j.pelvis[0], j.pelvis[1] - j.spine_top[1]) * 180) / Math.PI;
  };

  it('is six frames, faster than the walk, looping, with a twin to blink in', () => {
    const a = figureAsset({ ...rec, anims: ['walk', 'run', 'blink_run'] });
    const run = a.animations.find(x => x.name === 'run')!, walk = a.animations.find(x => x.name === 'walk')!;
    expect(run.frameIndices).toHaveLength(6);
    expect(run.loop).toBe(true);
    expect(run.durations).toEqual(Array(6).fill(RUN_FRAME_MS));
    expect(RUN_FRAME_MS).toBeLessThan(walk.durations![0]);
    expect(a.animations.find(x => x.name === 'blink_run')!.frameIndices).toHaveLength(6);
    // a fighter does not run, and asking for it says so
    expect(() => figureAsset({ ...base, stance: 'fighter', anims: ['run'] })).toThrow(/no pose for 'run'/);
  });

  it('strides 1.4 times the walk and more, leans the trunk 6° and more, and swaps feet', () => {
    expect(stride(side, 'run', 6)).toBeGreaterThanOrEqual(1.4 * stride(side, 'walk', 4));
    for (let k = 0; k < 6; k++) expect(lean(side, 'run', k) - lean(side, 'idle', 0)).toBeGreaterThanOrEqual(6);
    // the lead foot of the first landing is the back one of the second
    const j0 = figureJoints(side, 'run', 0), j3 = figureJoints(side, 'run', 3);
    expect(Math.sign(j0.foot_left[0] - j0.foot_right[0])).toBe(-Math.sign(j3.foot_left[0] - j3.foot_right[0]));
    // in the flight both feet are off the ground; at the landing one is on it
    const ground = figureJoints(side, 'idle', 0).foot_left[1];
    const flight = figureJoints(side, 'run', 2);
    expect(Math.max(flight.foot_left[1], flight.foot_right[1])).toBeLessThan(ground - 1);
    expect(Math.max(j0.foot_left[1], j0.foot_right[1])).toBeCloseTo(ground, 5);
  });

  it('carries the arms higher than the walk and swings them wider, seen straight on too', () => {
    const top = (r: FigureRecipe, anim: string, n: number) => Math.min(...Array.from({ length: n }, (_, k) => {
      const j = figureJoints(r, anim, k);
      return Math.min(j.hand_left[1], j.hand_right[1]);
    }));
    const swing = (r: FigureRecipe, anim: string, n: number) => {
      const xs = Array.from({ length: n }, (_, k) => figureJoints(r, anim, k).hand_right[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(top(side, 'run', 6)).toBeLessThan(top(side, 'walk', 4) - 2);
    expect(swing(side, 'run', 6)).toBeGreaterThan(1.4 * swing(side, 'walk', 4));
    // from the front a hand comes up to the chest, one side and then the other
    const front = { ...rec, view: 'front' as const, arm_swing: 2 };
    const h = (k: number) => { const j = figureJoints(front, 'run', k); return j.hand_left[1] - j.hand_right[1]; };
    expect(Math.abs(h(0))).toBeGreaterThanOrEqual(2);
    expect(Math.sign(h(0))).toBe(-Math.sign(h(3)));
  });

  it('run_stride shortens the stride and run_lean takes the lean, the walk as it was', () => {
    const old = { ...side, build: { ...side.build, run_stride: 0.65, run_lean: 0 } };
    expect(stride(old, 'run', 6)).toBeLessThan(0.75 * stride(side, 'run', 6));
    expect(Math.abs(lean(old, 'run', 0) - lean(old, 'idle', 0))).toBeLessThan(2);
    expect(frame(figureAsset(old), 'walk', 0)).toEqual(frame(figureAsset(side), 'walk', 0));
  });

  it('a part sways in the run over its six frames, and the cane leans on the ground longer', () => {
    const ribbon = { rows: ['d'], legend: { d: '#c9a34c' }, anchor: [0, 0] as [number, number] };
    const swaying: FigureRecipe = { ...side, attachments: [{ name: 'ribbon', joint: 'head', sway: { dy: -1 }, views: { side: ribbon } }] };
    const a = figureAsset(swaying);
    const off = (k: number) => box(frame(a, 'run', k), '#c9a34c')![1] - Math.round(figureJoints(swaying, 'run', k).head[1]);
    // phase 1 of 4 in the walk is 2 of 6 in the run: frames 2, 3, 4 as cut, 5, 0, 1 moved
    expect([0, 1, 2, 3, 4, 5].map(off)).toEqual([-1, -1, 0, 0, 0, -1]);
    const stick = { name: 'baston', joint: 'hand_left' as const, anims: ['idle', 'walk', 'run'],
      views: { side: { rows: ['m', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm'], legend: { m: '#8a5a3c' }, behind: true } } };
    const caned: FigureRecipe = { ...side, build: { ...side.build, stoop: 12, leg_length: 0.65 }, cane: { hand: 'left', reach: [3, 1, 1] }, attachments: [stick] };
    const b = figureAsset(caned);
    const tip = (k: number) => box(frame(b, 'run', k), '#8a5a3c')![3];
    const ground = box(frame(b, 'idle', 0), '#8a5a3c')![3];
    for (const k of [0, 1, 3, 4]) expect(tip(k)).toBe(ground);   // down at the landing and the sink
    for (const k of [2, 5]) expect(tip(k)).toBeLessThanOrEqual(ground - 2); // up in the flight
  });
});

describe('an old body: stoop, neck, leg_length, cane, cover_hands', () => {
  const tilt = (r: FigureRecipe) => {
    const j = figureJoints({ ...r, view: 'side' }, 'idle', 0);
    return (Math.atan2(j.head[0] - j.pelvis[0], j.pelvis[1] - j.head[1]) * 180) / Math.PI;
  };
  const height = (a: SpriteAsset, anim = 'idle', k = 0) => {
    const f = frame(a, anim, k);
    const rows = f.map((r, y) => (r.some(Boolean) ? y : -1)).filter(y => y >= 0);
    return { top: rows[0], bottom: rows[rows.length - 1] };
  };
  const old: FigureRecipe = { ...base, anims: ['idle', 'walk'], build: { ...base.build, stoop: 12, neck: 8, leg_length: 0.65 } };

  it('bends forward in profile: the head-hip axis tilts 8° or more past an adult, the head as big', () => {
    expect(tilt(old) - tilt(base)).toBeGreaterThanOrEqual(8);
    expect(tilt({ ...base, build: { ...base.build, stoop: 12 } })).toBeGreaterThan(tilt(base));
    // the neck alone bends the head over a straight back
    expect(tilt({ ...base, build: { ...base.build, neck: 10 } })).toBeGreaterThan(tilt(base));
    // the head is the same size: the skull's box is as tall from the front
    const skull = (r: FigureRecipe) => box(frame(figureAsset({ ...r, view: 'front' }), 'idle'), '#3b3643')!;
    const [, y0, , y1] = skull(base), [, o0, , o1] = skull(old);
    expect(Math.abs((o1 - o0) - (y1 - y0))).toBeLessThanOrEqual(1);
  });

  it('is shorter by its legs, with the soles on the same ground row', () => {
    const adult = height(figureAsset({ ...base, view: 'front', anims: ['idle'] }));
    const short = height(figureAsset({ ...base, view: 'front', anims: ['idle'], build: { ...base.build, leg_length: 0.65 } }));
    expect(short.bottom).toBe(adult.bottom);
    expect(short.top - adult.top).toBeGreaterThanOrEqual(3);
    expect(short.top - adult.top).toBeLessThanOrEqual(4);
    // the pelvis came down as much as the crown: the legs lost it, not the trunk
    const jp = (r: FigureRecipe) => figureJoints({ ...r, view: 'front' }, 'idle', 0);
    const lost = jp({ ...base, build: { ...base.build, leg_length: 0.65 } }).pelvis[1] - jp(base).pelvis[1];
    const crown = jp({ ...base, build: { ...base.build, leg_length: 0.65 } }).head[1] - jp(base).head[1];
    expect(lost).toBeCloseTo(crown, 5);
  });

  it('plants the cane at each contact and lifts it at each passing, and holds it still standing', () => {
    const stick = { name: 'baston', joint: 'hand_left' as const, anims: ['idle', 'walk'],
      views: { side: { rows: ['m', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm'], legend: { m: '#8a5a3c' }, behind: true } } };
    const rec: FigureRecipe = { ...old, view: 'side', cane: { hand: 'left', reach: [3, 1, 1] }, attachments: [stick] };
    const a = figureAsset(rec);
    const tip = (anim: string, k: number) => box(frame(a, anim, k), '#8a5a3c')![3];
    const ground = tip('idle', 0);
    expect(tip('idle', 1)).toBe(ground);          // breathing does not move the stick
    expect(tip('walk', 0)).toBe(ground);          // contact: on the ground
    expect(tip('walk', 2)).toBe(ground);
    expect(tip('walk', 1)).toBeLessThanOrEqual(ground - 2); // passing: lifted, 2 px and more
    expect(tip('walk', 3)).toBeLessThanOrEqual(ground - 2);
    // without the cane the same hand swings and bobs with the arm
    const hand = (r: FigureRecipe, k: number) => figureJoints(r, 'walk', k).hand_left.map(v => v.toFixed(2)).join();
    expect(new Set([0, 1, 2, 3].map(k => hand({ ...rec, cane: undefined }, k))).size).toBeGreaterThan(2);
    expect(hand(rec, 0)).toBe(hand(rec, 2));
    // reach holds it out ahead of where the arm hangs
    const near = figureJoints({ ...rec, cane: { hand: 'left' } }, 'idle', 0).hand_left[0];
    expect(figureJoints(rec, 'idle', 0).hand_left[0]).toBeGreaterThan(near + 1.5);
  });

  it('hides the hands in the sleeves, and rolls the sleeves up to bare the forearm', () => {
    const skin = '#f2c9a0';
    const arms = (r: FigureRecipe) => {
      const f = frame(figureAsset({ ...r, view: 'front', anims: ['idle'] }), 'idle');
      // the arms hang outside the torso: count skin in the outer columns below the head
      return f.slice(26).reduce((n, row) => n + row.filter((c, x) => c === skin && (x < 10 || x > 21)).length, 0);
    };
    const sleeve = { ...base.top, tones: '#8580a8' };
    expect(arms({ ...base, top: sleeve })).toBeGreaterThan(0);
    expect(arms({ ...base, top: { ...sleeve, cover_hands: true } })).toBe(0);
    expect(arms({ ...base, top: { ...sleeve, sleeves: 'rolled' } })).toBeGreaterThan(arms({ ...base, top: sleeve }));
  });
});

describe('sit and eat seen from every side', () => {
  // a game seats people round a table and on a bench facing the sea: the seat
  // has to read as a seat from the side and from behind, not only facing us
  const head = (eye: string) => ({ rows: ['hhhh', 'h' + eye + eye + 'h', 'hhhh'], legend: { h: '#3b3643', o: '#6f9fc4', s: '#ef914f' }, anchor: [1, 1] as [number, number] });
  const bowl = {
    name: 'cuenco', joint: 'hand_left' as const, anims: ['eat'],
    views: { front: { rows: ['bbb'], legend: { b: '#d14b34' }, depth: 3 }, side: { rows: ['bbbb', '.bb.'], legend: { b: '#d14b34' }, anchor: [1, 0] as [number, number], depth: 6 } },
  };
  const rec = (view: FigureRecipe['view']): FigureRecipe => ({
    ...base, view, anims: ['idle', 'sit', 'eat'],
    head_art: { front: head('o'), front_shut: head('s'), side: head('o'), side_shut: head('s'), back: { rows: ['hhhh', 'hhhh', 'hhhh'], legend: { h: '#3b3643' }, anchor: [1, 1] } },
    attachments: [bowl],
  });

  it('sit and eat on the left are the mirror of the right', () => {
    const right = figureAsset(rec('side')), left = figureAsset(rec('side_left'));
    for (const anim of ['sit', 'eat']) {
      for (const k of [0, 1]) expect(frame(left, anim, k)).toEqual(mirror(frame(right, anim, k)));
    }
  });

  it('in profile the lap goes out ahead of the chest, on the same seat as from the front', () => {
    const side = figureJoints(rec('side'), 'sit', 1), front = figureJoints(rec('front'), 'sit', 1);
    // the near knee well ahead of the hips and of the chest: a lap, not a crouch
    expect(side.knee_right[0] - side.pelvis[0]).toBeGreaterThan(7);
    expect(side.knee_right[0] - side.chest[0]).toBeGreaterThan(6);
    // the back straight over the hips
    expect(Math.abs(side.chest[0] - side.pelvis[0])).toBeLessThan(1);
    // the same seat: the hips at the height they sit at from the front
    expect(Math.abs(side.pelvis[1] - front.pelvis[1])).toBeLessThan(0.6);
    expect(Math.abs(side.head[1] - front.head[1])).toBeLessThan(0.6);
  });

  it('eating in profile holds the bowl up, and lifts it', () => {
    for (const view of ['side', 'side_left'] as const) {
      const a = figureAsset(rec(view));
      const e0 = box(frame(a, 'eat', 0), '#d14b34'), e1 = box(frame(a, 'eat', 1), '#d14b34');
      expect(e0).not.toBeNull();
      expect(e1![1]).toBeLessThan(e0![1] - 1);
      // eyes open eating, shut sitting
      expect(box(frame(a, 'eat', 0), '#6f9fc4')).not.toBeNull();
      expect(box(frame(a, 'sit', 1), '#ef914f')).not.toBeNull();
    }
  });

  it('from behind there are no eyes, and eating the elbows stand out at the sides', () => {
    const r = rec('back');
    const a = figureAsset(r);
    for (const anim of ['sit', 'eat']) {
      for (const k of [0, 1]) {
        expect(box(frame(a, anim, k), '#6f9fc4')).toBeNull();
        expect(box(frame(a, anim, k), '#ef914f')).toBeNull();
      }
    }
    const sit = figureJoints(r, 'sit', 1), eat = figureJoints(r, 'eat', 0);
    const spread = (j: typeof sit) => Math.abs(j.elbow_left[0] - j.elbow_right[0]);
    expect(spread(eat)).toBeGreaterThan(spread(sit) + 1);
    expect(spread(eat)).toBeGreaterThan(Math.abs(eat.shoulder_left[0] - eat.shoulder_right[0]) + 2);
  });

  it('the front stays as it was: the per-view poses only touch the other views', () => {
    const j = figureJoints(rec('front'), 'sit', 1), e = figureJoints(rec('front'), 'eat', 0);
    // the front lotus has the knees out to the sides, not ahead
    expect(Math.abs(j.knee_left[0] - j.knee_right[0])).toBeGreaterThan(8);
    expect(Math.abs(e.elbow_left[0] - e.elbow_right[0])).toBeLessThan(Math.abs(j.knee_left[0] - j.knee_right[0]));
  });
});

describe('a broad sash', () => {
  it('sash_width makes the waist band taller, and the default stays as it was', () => {
    const red = '#a83a29';
    const rows = (r: FigureRecipe) => {
      const f = frame(figureAsset({ ...r, view: 'front', anims: ['idle'] }), 'idle');
      return f.filter(row => row.includes(red)).length;
    };
    const plain = { ...base, sash: red };
    const wide = rows({ ...plain, sash_width: 2 });
    expect(rows(plain)).toBeGreaterThan(0);
    expect(rows({ ...plain, sash_width: 1 })).toBe(rows(plain));
    expect(wide).toBeGreaterThan(rows(plain));
  });
});

// ---------------------------------------------------------------- por capas

describe('figure split in layers (the character creator)', () => {
  // Wei Kang as the game builds him: drawn head with the hair in it, a ribbon,
  // a drawn skirt, the chest, no sleeves, the technique's aura.
  const wei = JSON.parse(readFileSync(join(__dirname, 'fixtures/figura/wei_kang32_rig.json'), 'utf8')) as FigureRecipe;
  const anims = ['idle', 'walk', 'run', 'attack', 'technique', 'hurt', 'die', 'blink'];
  const hexes = (a: SpriteAsset, layer: number, f: number) => a.layers![layer].frames[f].map(r => r.map(v => (v ? a.palette[v] : null)));

  it('every pixel of the fused frame is in exactly one layer, in every view', () => {
    for (const view of ['front', 'back', 'side', 'side_left'] as const) {
      const rec = { ...wei, view, anims };
      const fused = figureAsset(rec);
      const { asset } = figureLayered(rec);
      expect(asset.layers!.map(l => l.name)).toEqual([...FIGURE_LAYERS]);
      expect(asset.animations).toEqual(fused.animations);
      for (let f = 0; f < fused.layers![0].frames.length; f++) {
        const want = hexes(fused, 0, f);
        const got = want.map(r => r.map(() => null as string | null));
        let twice = 0;
        asset.layers!.forEach((_, li) => hexes(asset, li, f).forEach((r, y) => r.forEach((c, x) => {
          if (!c) return;
          if (got[y][x]) twice++;
          got[y][x] = c;
        })));
        expect(twice).toBe(0);
        expect(got).toEqual(want);
      }
    }
  });

  it('the drawn head splits into face and hair, and the band goes with the hair', () => {
    // in profile the band runs right over the brow: wave by wave it went to the face
    for (const view of ['side', 'side_left', 'back'] as const) {
      const a = figureLayered({ ...wei, view, anims: ['idle', 'walk'] }).asset;
      for (let f = 0; f < a.layers![0].frames.length; f++) {
        expect(hexes(a, FIGURE_LAYERS.indexOf('cuerpo'), f).flat()).not.toContain('#a83a29');
      }
    }
    const { asset, materials } = figureLayered({ ...wei, view: 'front', anims: ['idle'] });
    const cuerpo = hexes(asset, FIGURE_LAYERS.indexOf('cuerpo'), 0).flat();
    const pelo = hexes(asset, FIGURE_LAYERS.indexOf('pelo_adelante'), 0).flat();
    // the band is the robe's red, drawn in the head: it is the hair's, never the face's
    expect(cuerpo).not.toContain('#d14b34');
    expect(pelo).toContain('#d14b34');
    expect(pelo).toContain('#3b3643');
    expect(cuerpo).toContain('#f2c9a0');
    // the iris, a color the recipe does not name, stays in the face
    expect(cuerpo).toContain('#5a3a26');
    expect(materials.cuerpo['#f2c9a0']).toBe('piel');
    expect(materials.cuerpo['#5a3a26']).toBe('dibujo');
    expect(materials.pelo_adelante['#3b3643']).toBe('pelo');
    expect(materials.cuerpo[INK]).toBe('tinta');
  });

  it('a drawn part goes to the layer it names, adornos by default', () => {
    const { asset } = figureLayered({ ...wei, view: 'front', anims: ['idle'] });
    const has = (layer: string, hex: string) => hexes(asset, FIGURE_LAYERS.indexOf(layer as typeof FIGURE_LAYERS[number]), 0).flat().includes(hex);
    // the skirt (layer ropa_abajo in the fixture) carries the robe's red
    expect(has('ropa_abajo', '#d14b34')).toBe(true);
    const bare = { ...wei, view: 'front' as const, anims: ['idle'], attachments: wei.attachments!.map(a => ({ ...a, layer: undefined })) };
    const moved = figureLayered(bare).asset;
    expect(hexes(moved, FIGURE_LAYERS.indexOf('ropa_abajo'), 0).flat()).not.toContain('#d14b34');
    expect(hexes(moved, FIGURE_LAYERS.indexOf('adornos'), 0).flat()).toContain('#d14b34');
  });

  it('the aura of the technique is its own layer', () => {
    const { asset, materials } = figureLayered({ ...wei, view: 'front', anims: ['technique'] });
    const aura = asset.layers![FIGURE_LAYERS.indexOf('aura')].frames.flat(2).filter(v => v).length;
    expect(aura).toBeGreaterThan(100);
    expect(Object.values(materials.aura)).toEqual(['aura', 'aura']);
  });

  it('the stacking order comes from where the parts meet, and keeps the default where they do not', () => {
    const n = FIGURE_LAYERS.length;
    const none = Array.from({ length: n }, () => Array(n).fill(0));
    expect(stackOrder(none)).toEqual([...FIGURE_LAYERS]);
    const v = none.map(r => [...r]);
    const i = (l: string) => FIGURE_LAYERS.indexOf(l as typeof FIGURE_LAYERS[number]);
    // the hair long down the back, drawn over the robe (seen from behind)
    v[i('pelo_atras')][i('ropa_arriba')] = 30;
    v[i('ropa_arriba')][i('pelo_atras')] = 2;
    const order = stackOrder(v);
    expect(order.indexOf('pelo_atras')).toBeGreaterThan(order.indexOf('ropa_arriba'));
    // one vote is not the drawing saying so
    const w = none.map(r => [...r]);
    w[i('pelo_atras')][i('ropa_arriba')] = 1;
    expect(stackOrder(w)).toEqual([...FIGURE_LAYERS]);
    // a real figure: every layer once
    const real = figureLayered({ ...wei, view: 'front', anims: ['idle', 'walk'] }).order;
    expect([...real].sort()).toEqual([...FIGURE_LAYERS].sort());
  });

  it('stack keeps a pair the drawing never shows touching: a lent tail over the crossed sword, from the back', () => {
    const lifted = liftOrder([...FIGURE_LAYERS], [['pelo_atras', 'arma']]);
    expect(lifted.indexOf('pelo_atras')).toBe(lifted.indexOf('arma') + 1);
    // the rest keep their places, and a pair already kept changes nothing
    expect(lifted.filter(l => l !== 'pelo_atras')).toEqual(FIGURE_LAYERS.filter(l => l !== 'pelo_atras'));
    expect(liftOrder(lifted, [['pelo_atras', 'arma']])).toEqual(lifted);
    expect(() => liftOrder(lifted, [['pelo_atras', 'capa' as FigureLayer]])).toThrow(/pairs of layers/);
    // per view: only the back (and the diagonals that face away) take it
    const rec: FigureRecipe = { ...wei, anims: ['idle'], views: { ...wei.views, back: { ...wei.views?.back, stack: [['pelo_atras', 'arma']] } } };
    for (const view of ['back', 'back_right'] as const) {
      const order = figureLayered({ ...rec, view }).order;
      expect(order.indexOf('pelo_atras')).toBeGreaterThan(order.indexOf('arma'));
      const whole = figureLayered({ ...rec, view }, { complete: true }).order;
      expect(whole).toEqual(order);
    }
    for (const view of ['front', 'front_left'] as const) {
      expect(figureLayered({ ...rec, view }).order).toEqual(figureLayered({ ...wei, anims: ['idle'], view }).order);
    }
    // the pixels do not change: the fused frame is the same drawing
    const fused = (r: FigureRecipe) => figureAsset({ ...r, view: 'back' }).layers![0].frames;
    expect(fused(rec)).toEqual(fused({ ...wei, anims: ['idle'] }));
  });

  it('a blue eye is not the aura because the aura is blue', () => {
    const rec: FigureRecipe = { ...base, glow: '#6f9fc4', eyes: '#6f9fc4' };
    expect(materialOf(rec, 'cuerpo', '#6f9fc4')).toBe('ojos');
    expect(materialOf(rec, 'aura', '#6f9fc4')).toBe('aura');
    expect(materialOf(rec, 'adornos', '#6f9fc4')).toBe('dibujo');
    expect(materialOf(rec, 'ropa_arriba', '#f2c9a0')).toBe('piel');
  });

  it('export_sheet of each layer as indices, stacked with its ramp in the view order, is the fused sheet', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-capas-'));
    try {
      const recipe = join(dir, 'wei.json');
      writeFileSync(recipe, JSON.stringify({ ...wei, anims }));
      const out = join(dir, 'wei.pss.json');
      const r = (await runCommand('figure', { recipe, out, view: 'side', layers: true })).data as { layers: { order: string[] } };
      expect([...r.layers.order].sort()).toEqual([...FIGURE_LAYERS].sort());
      // the fused sheet as the game has always had it, from the fused figure
      const fusedPath = join(dir, 'fused.pss.json');
      await runCommand('figure', { recipe, out: fusedPath, view: 'side' });
      await runCommand('export_sheet', { path: fusedPath, out: join(dir, 'fused.png') });
      const fused = readPng(join(dir, 'fused.png'));
      const rebuilt = blankImage(fused.width, fused.height);
      for (const layer of r.layers.order) {
        await runCommand('export_sheet', { path: out, layer, indexed: true, out: join(dir, `${layer}_indices.png`) });
        const meta = JSON.parse(readFileSync(join(dir, `${layer}_indices.json`), 'utf8'));
        const ramp: string[] = meta.meta.ramp;
        // lightest first
        const luma = (h: string) => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
        ramp.forEach((h, k) => { if (k) expect(luma(h)).toBeLessThanOrEqual(luma(ramp[k - 1])); });
        const idx = readPng(join(dir, `${layer}_indices.png`));
        expect([idx.width, idx.height]).toEqual([fused.width, fused.height]);
        for (let y = 0; y < idx.height; y++) {
          for (let x = 0; x < idx.width; x++) {
            const [n, g, b, a] = getPixel(idx, x, y);
            if (!a) continue;
            expect(g).toBe(n);
            expect(b).toBe(n);
            const hex = ramp[n];
            setPixel(rebuilt, x, y, [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]);
          }
        }
      }
      expect(Buffer.from(rebuilt.data).equals(Buffer.from(fused.data))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('figure split in whole layers (layers: "complete", the character creator, phase 2)', () => {
  // Wei and the player stand on the same body (cuerpo32_base in the game): the
  // creator swaps the hair or the robe of one onto the other.
  const load = (id: string) => JSON.parse(readFileSync(join(__dirname, `fixtures/figura/${id}_rig.json`), 'utf8')) as FigureRecipe;
  const wei = load('wei_kang32'), player = load('jugador32');
  const anims = ['idle', 'walk', 'run', 'attack', 'technique', 'hurt', 'die', 'blink'];
  const views = ['front', 'back', 'side', 'side_left'] as const;
  type Px = (string | null)[][];
  const byName = (a: SpriteAsset, f: number) => Object.fromEntries(a.layers!.map(l =>
    [l.name, l.frames[f].map(r => r.map(v => (v ? a.palette[v] : null)))])) as Record<FigureLayer, Px>;
  const stack = (layers: Record<FigureLayer, Px>, order: FigureLayer[]) => {
    const out = layers[order[0]].map(r => r.map(() => null as string | null));
    for (const l of order) layers[l].forEach((r, y) => r.forEach((c, x) => { if (c) out[y][x] = c; }));
    return out;
  };
  /** the empty pixels the outside of the canvas cannot reach: holes in the figure */
  const holes = (px: Px) => {
    const h = px.length, w = px[0].length;
    const out = new Set<number>();
    const stackq: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && !px[y][x]) { out.add(y * w + x); stackq.push(y * w + x); }
    }
    while (stackq.length) {
      const i = stackq.pop()!, x = i % w, y = Math.floor(i / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && !px[Y][X] && !out.has(j)) { out.add(j); stackq.push(j); }
      }
    }
    const found: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!px[y][x] && !out.has(y * w + x)) found.push([x, y]);
    return found;
  };

  it('stacked in the order of the view, the whole layers give the fused frame, pixel for pixel', () => {
    for (const rec0 of [wei, player]) {
      for (const view of views) {
        const rec = { ...rec0, view, anims };
        const fused = figureAsset(rec);
        const { asset, order } = figureLayered(rec, { complete: true });
        // the asset's layers come in the stacking order: composited as they are, the fused frames
        expect(asset.layers!.map(l => l.name)).toEqual(order);
        expect(asset.animations).toEqual(fused.animations);
        for (let f = 0; f < fused.layers![0].frames.length; f++) {
          expect(stack(byName(asset, f), order)).toEqual(fused.layers![0].frames[f].map(r => r.map(v => (v ? fused.palette[v] : null))));
        }
      }
    }
  });

  it('a whole layer holds its part of the partition, and more: what the layers over it hide', () => {
    const rec = { ...player, view: 'front' as const, anims: ['idle', 'walk'] };
    const part = figureLayered(rec), whole = figureLayered(rec, { complete: true });
    expect(whole.order).toEqual(part.order);
    let more = 0;
    for (let f = 0; f < part.asset.layers![0].frames.length; f++) {
      const p = byName(part.asset, f), c = byName(whole.asset, f);
      for (const l of FIGURE_LAYERS) {
        p[l].forEach((r, y) => r.forEach((hex, x) => { if (hex) expect(c[l][y][x]).toBe(hex); }));
        c[l].forEach((r, y) => r.forEach((hex, x) => { if (hex && !p[l][y][x]) more++; }));
      }
    }
    expect(more).toBeGreaterThan(500);
    // the head under the player's fringe: skin where the partition had nothing in cuerpo
    const head = byName(whole.asset, 0).cuerpo.slice(8, 16).flat().filter(c => c === '#f2c9a0' || c === '#ef914f' || c === '#b8613a');
    expect(head.length).toBeGreaterThan(40);
  });

  // what the game draws in each view (scripts/chibi_rig.py): the technique, the
  // fall and the seat only facing down. Seen from behind Wei falls with his
  // bare arms over his hair, where the hair is over the body in that view's
  // order: the hair has nothing there (one order a view), and on the player,
  // whose sleeves are under the hair, it would show as a hole.
  const sheet = (view: typeof views[number]) => ['idle', 'walk', 'run', 'attack', 'hurt',
    ...(view === 'front' ? ['technique', 'die', 'sit'] : []), ...(view === 'back' ? [] : ['blink'])];

  it('Wei\'s hair on the player\'s body leaves no hole, where the partition left many', () => {
    for (const view of views) {
      const rec = (r: FigureRecipe) => ({ ...r, view, anims: sheet(view) });
      const fused = figureAsset(rec(player));
      const split = figureLayered(rec(player)).asset;
      const count = (complete: boolean) => {
        const mine = figureLayered(rec(player), { complete }), his = figureLayered(rec(wei), { complete });
        let n = 0;
        for (let f = 0; f < fused.layers![0].frames.length; f++) {
          const layers = byName(mine.asset, f);
          const theirs = byName(his.asset, f);
          layers.pelo_adelante = theirs.pelo_adelante;
          layers.pelo_atras = theirs.pelo_atras;
          // the aura rings the silhouette it was drawn round: it is not the body
          const body = mine.order.filter(l => l !== 'aura');
          const was = byName(split, f);
          n += holes(stack(layers, body)).filter(([x, y]) => FIGURE_LAYERS.some(l => l !== 'aura' && was[l][y][x])).length;
        }
        return n;
      };
      expect(count(true), view).toBe(0);
      // the control: the same swap over the partition of phase 1 opens holes in the head
      expect(count(false), view).toBeGreaterThan(20);
    }
  });

  it('the robe of Wei on the player: the bare body under it, no hole', () => {
    // in profile one pixel stays open in one frame of the walk, between the
    // player's sheath and the back of a robe cut for Wei's shoulders (1.3, the
    // player's 1.15): a garment fits the build it was drawn on
    for (const view of ['front', 'back'] as const) {
      const rec = (r: FigureRecipe) => ({ ...r, view, anims: sheet(view) });
      const split = figureLayered(rec(player)).asset;
      const mine = figureLayered(rec(player), { complete: true }), his = figureLayered(rec(wei), { complete: true });
      for (let f = 0; f < split.layers![0].frames.length; f++) {
        const layers = byName(mine.asset, f), theirs = byName(his.asset, f);
        for (const l of ['pelo_atras', 'pelo_adelante', 'ropa_arriba', 'ropa_abajo', 'faja'] as const) layers[l] = theirs[l];
        const was = byName(split, f);
        const body = mine.order.filter(l => l !== 'aura');
        expect(holes(stack(layers, body)).filter(([x, y]) => FIGURE_LAYERS.some(l => l !== 'aura' && was[l][y][x])), `${view} ${f}`).toEqual([]);
      }
    }
  });

  it('without complete, the partition of phase 1 as it was; order only goes with complete', async () => {
    const rec = { ...wei, view: 'side' as const, anims: ['idle', 'attack'] };
    const a = figureLayered(rec), b = figureLayered(rec, {});
    expect(a.asset.layers!.map(l => l.name)).toEqual([...FIGURE_LAYERS]);
    expect(b.asset.layers).toEqual(a.asset.layers);
    const given = [...FIGURE_LAYERS];
    expect(figureLayered(rec, { complete: true, order: given }).order).toEqual(given);
    expect(() => figureLayered(rec, { complete: true, order: given.slice(1) })).toThrow(/each of the 10 layers/);
    const dir = mkdtempSync(join(tmpdir(), 'pgs-capas-'));
    try {
      const recipe = join(dir, 'wei.json');
      writeFileSync(recipe, JSON.stringify(rec));
      await expect(runCommand('figure', { recipe, out: join(dir, 'w.pss.json'), layers: true, order: given })).rejects.toThrow(/order goes with/);
      const r = (await runCommand('figure', { recipe, out: join(dir, 'w.pss.json'), layers: 'complete' })).data as { layers: { tones: Record<string, Record<string, number | null>> } };
      expect(r.layers.tones.cuerpo['#f2c9a0']).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('each color says its tone in its material: the skirt in the robe\'s shade is tone 2 of tunica', () => {
    const { materials, tones } = figureLayered({ ...player, view: 'front', anims: ['idle'] });
    expect(tones.cuerpo['#f2c9a0']).toBe(0);
    expect(tones.cuerpo['#ef914f']).toBe(1);
    expect(tones.cuerpo['#b8613a']).toBe(2);
    expect(tones.cuerpo[INK]).toBe(0);
    expect(tones.cuerpo['#e3f1f5']).toBeNull();
    for (const [hex, m] of Object.entries(materials.ropa_abajo)) {
      if (m === 'tunica') expect(tones.ropa_abajo[hex]).toBe(['#f4efe3', '#e6dcc6', '#bfb8a8'].indexOf(hex));
    }
    expect(toneOf(player, 'tunica', '#bfb8a8')).toBe(2);
    expect(toneOf(player, 'calzado', '#5a3a26')).toBe(1);
    expect(toneOf(player, 'dibujo', '#123456')).toBeNull();
  });
});

describe('whole layers past one order a view: the arms apart, the aura with no ring, the head drawn bald (Khadosh/pixel-gaming-studio#24)', () => {
  const load = (id: string) => JSON.parse(readFileSync(join(__dirname, `fixtures/figura/${id}_rig.json`), 'utf8')) as FigureRecipe;
  const wei = load('wei_kang32'), player = load('jugador32');
  type Px = (string | null)[][];
  const byName = (a: SpriteAsset, f: number) => Object.fromEntries(a.layers!.map(l =>
    [l.name, l.frames[f].map(r => r.map(v => (v ? a.palette[v] : null)))])) as Record<FigureLayer, Px>;
  const stack = (layers: Record<FigureLayer, Px>, order: FigureLayer[]) => {
    const out = layers[order[0]].map(r => r.map(() => null as string | null));
    for (const l of order) layers[l]?.forEach((r, y) => r.forEach((c, x) => { if (c) out[y][x] = c; }));
    return out;
  };
  const fusedPx = (a: SpriteAsset, f: number) => a.layers![0].frames[f].map(r => r.map(v => (v ? a.palette[v] : null)));
  /** pixels painted in both layers of a frame: what one holds under the other */
  const under = (a: SpriteAsset, lo: FigureLayer, hi: FigureLayer) => {
    let n = 0;
    for (let f = 0; f < a.layers![0].frames.length; f++) {
      const L = byName(a, f);
      L[lo].forEach((r, y) => r.forEach((c, x) => { if (c && L[hi][y][x]) n++; }));
    }
    return n;
  };

  it('arms: the arms go to brazos and their sleeves to mangas, and stacked they still give the fused frame', () => {
    for (const rec0 of [wei, player]) {
      for (const view of ['front', 'back', 'side', 'side_left'] as const) {
        const rec = { ...rec0, view, anims: ['idle', 'walk', 'attack', 'technique', 'die'] };
        const fused = figureAsset(rec);
        for (const complete of [false, true]) {
          const { asset, order } = figureLayered(rec, { complete, arms: true });
          expect(order, view).toHaveLength(12);
          expect(order.slice().sort(), view).toEqual([...FIGURE_LAYERS, 'brazos', 'mangas'].sort());
          for (let f = 0; f < fused.layers![0].frames.length; f++) {
            expect(stack(byName(asset, f), order), `${rec0.id} ${view} ${f}`).toEqual(fusedPx(fused, f));
          }
        }
      }
    }
    // the player's sleeves are mangas, his hands brazos; Wei has no sleeves
    const p = figureLayered({ ...player, view: 'front', anims: ['idle'] }, { arms: true });
    expect(Object.values(p.materials.mangas)).toContain('manga');
    expect(p.materials.brazos['#f2c9a0']).toBe('piel');
    const w = figureLayered({ ...wei, view: 'side', anims: ['idle'] }, { arms: true });
    expect(byName(w.asset, 0).mangas.flat().filter(Boolean)).toEqual([]);
    expect(byName(w.asset, 0).brazos.flat().filter(Boolean).length).toBeGreaterThan(20);
    // the recipe can say it too, and without it the ten layers as they were
    expect(figureLayered({ ...wei, arms_layer: true, view: 'side', anims: ['idle'] }).order).toHaveLength(12);
    expect(figureLayered({ ...wei, view: 'side', anims: ['idle'] }).order).toHaveLength(10);
  });

  it('arms: Wei bare-armed in profile keeps the bare body under his robe, and the player\'s robe on him leaves no hole', () => {
    // in profile Wei's bare arm goes over the robe: with the arms in cuerpo the
    // order put the body over the robe, and the body drawn whole lost the chest
    const rec = (r: FigureRecipe) => ({ ...r, view: 'side' as const, anims: ['idle', 'walk', 'run', 'attack', 'hurt', 'blink'] });
    const before = figureLayered(rec(wei), { complete: true }), after = figureLayered(rec(wei), { complete: true, arms: true });
    const z = (o: FigureLayer[], l: FigureLayer) => o.indexOf(l);
    expect(z(before.order, 'cuerpo')).toBeGreaterThan(z(before.order, 'ropa_arriba'));
    expect(z(after.order, 'cuerpo')).toBeLessThan(z(after.order, 'ropa_arriba'));
    expect(z(after.order, 'brazos')).toBeGreaterThan(z(after.order, 'ropa_arriba'));
    expect(under(after.asset, 'cuerpo', 'ropa_arriba')).toBeGreaterThan(3 * under(before.asset, 'cuerpo', 'ropa_arriba'));
    // the player's robe (and sleeves) on Wei: empty where Wei's robe was, before; not now
    const split = figureLayered(rec(wei)).asset;
    const holes = (arms: boolean) => {
      const mine = arms ? after : before, his = figureLayered(rec(player), { complete: true, arms });
      let n = 0;
      for (let f = 0; f < split.layers![0].frames.length; f++) {
        const L = byName(mine.asset, f), T = byName(his.asset, f), was = byName(split, f);
        for (const l of ['ropa_arriba', 'ropa_abajo', 'faja', 'mangas'] as const) if (T[l]) L[l] = T[l];
        stack(L, mine.order.filter(l => l !== 'aura')).forEach((r, y) => r.forEach((c, x) => { if (!c && was.ropa_arriba[y][x]) n++; }));
      }
      return n;
    };
    expect(holes(false)).toBeGreaterThan(20);
    expect(holes(true)).toBe(0);
  });

  it('complete answers what each layer drawn whole could not keep, frame by frame', () => {
    const rec = { ...wei, view: 'side' as const, anims: ['idle', 'walk'] };
    const before = figureLayered(rec, { complete: true }).lost!, after = figureLayered(rec, { complete: true, arms: true }).lost!;
    const px = (lost: typeof before, layer: FigureLayer, below: FigureLayer) => lost.filter(l => l.layer === layer && l.under === below).reduce((s, l) => s + l.px, 0);
    // the body over the robe: the chest under it is lost; with the arms apart, no longer
    expect(px(before, 'cuerpo', 'ropa_arriba')).toBeGreaterThan(200);
    expect(px(after, 'cuerpo', 'ropa_arriba')).toBe(0);
    for (const l of after) {
      expect(l.px).toBeGreaterThan(0);
      expect(['idle', 'walk']).toContain(l.anim);
    }
    expect(figureLayered(rec).lost).toBeUndefined();
  });

  it('ring: false leaves the aura\'s ring out, and the ring is the outline of what is stacked', () => {
    for (const view of ['front', 'side'] as const) {
      const rec = { ...player, view, anims: ['idle', 'technique'] };
      const fused = figureAsset(rec);
      const { asset, order, ring } = figureLayered(rec, { complete: true, ring: false });
      expect(ring!.color).toBe(player.glow);
      expect(ring!.frames.length, view).toBeGreaterThan(0);
      for (let f = 0; f < fused.layers![0].frames.length; f++) {
        const px = stack(byName(asset, f), order);
        const h = px.length, w = px[0].length;
        // whoever stacks draws the ring: one pixel round the silhouette, its four neighbours
        if (ring!.frames.includes(f)) {
          const out = px.map(r => r.slice());
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (px[y][x]) continue;
            if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => px[y + dy]?.[x + dx])) out[y][x] = ring!.color;
          }
          expect(out, `${view} ${f}`).toEqual(fusedPx(fused, f));
          expect(px, `${view} ${f}`).not.toEqual(fusedPx(fused, f));
        } else {
          expect(px, `${view} ${f}`).toEqual(fusedPx(fused, f));
        }
      }
    }
    // the partition leaves it out too; with the ring (the default) nothing is answered
    const split = figureLayered({ ...player, view: 'front', anims: ['technique'] }, { ring: false });
    expect(split.ring!.frames.length).toBeGreaterThan(0);
    expect(figureLayered({ ...player, view: 'front', anims: ['technique'] }).ring).toBeUndefined();
  });

  it('the command takes arms and ring with layers, and answers the ring and what was lost', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-capas-'));
    try {
      const recipe = join(dir, 'p.json');
      writeFileSync(recipe, JSON.stringify({ ...player, view: 'side', anims: ['idle', 'technique'] }));
      const out = join(dir, 'p.pss.json');
      await expect(runCommand('figure', { recipe, out, arms: true })).rejects.toThrow(/go with layers/);
      const r = (await runCommand('figure', { recipe, out, layers: 'complete', arms: true, ring: false })).data as {
        layers: { order: string[]; ring: { color: string; frames: number[] }; lost: Record<string, { px: number; frames: number[] }> };
      };
      expect(r.layers.order).toContain('brazos');
      expect(r.layers.ring.color).toBe(player.glow);
      expect(Object.keys(r.layers.lost).every(k => /^[a-z_]+<[a-z_]+$/.test(k))).toBe(true);
      const saved = JSON.parse(readFileSync(out, 'utf8')) as SpriteAsset;
      expect(JSON.stringify(saved.generatedBy)).toMatch(/arms.{0,3}true/);
      expect(JSON.stringify(saved.generatedBy)).toMatch(/ring.{0,3}false/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a head drawn bald (<view>_bald) is what the body drawn whole has under the hair', () => {
    // the player's front head with the hair painted over in skin: the forehead the drawing never said
    const front = player.head_art!.front!;
    const hair = new Set(['c', 'd', 'e', 'x', 'b', 'B', 'L']);
    const bald = { ...front, rows: front.rows.map((r, y) => (y < 16 ? [...r].map(g => (hair.has(g) ? 'F' : g)).join('') : r)) };
    for (const view of ['front', 'side', 'side_left'] as const) {
      const art = view === 'front' ? { front_bald: bald } : { side_bald: { ...player.head_art!.side!, rows: player.head_art!.side!.rows.map(r => [...r].map(g => (hair.has(g) ? 'F' : g)).join('')) } };
      const rec = { ...player, view, anims: ['idle'] };
      const plain = figureLayered(rec, { complete: true }), drawn = figureLayered({ ...rec, head_art: { ...player.head_art, ...art } }, { complete: true });
      // the fused frame is the same: the bald head only fills what the hair hides
      expect(stack(byName(drawn.asset, 0), drawn.order), view).toEqual(stack(byName(plain.asset, 0), plain.order));
      // under the hair the body is the bald drawing's own pixels: more of the forehead in skin than the approximation guessed
      const skinUnder = (a: SpriteAsset) => {
        const L = byName(a, 0), out = new Map<string, number>();
        L.cuerpo.forEach((r, y) => r.forEach((c, x) => { if (c && L.pelo_adelante[y][x]) out.set(c, (out.get(c) ?? 0) + 1); }));
        return out;
      };
      const mine = skinUnder(drawn.asset);
      expect(mine.get('#f2c9a0') ?? 0, view).toBeGreaterThan(20);
      const legend = new Set(Object.values((view === 'front' ? front : player.head_art!.side!).legend).map(c => c.toLowerCase()));
      expect([...mine.keys()].every(c => legend.has(c) || c === '#15120f'), view).toBe(true);
      expect(mine.get('#f2c9a0')!, view).toBeGreaterThan(skinUnder(plain.asset).get('#f2c9a0') ?? 0);
      expect(mine, view).not.toEqual(skinUnder(plain.asset));
    }
  });
});


describe('a beard drawn in the head, in its own layer (head_layers)', () => {
  // Gao Shun as the game builds him: the long mustache drawn in the hair's greys,
  // with glyphs of its own that head_layers sends to barba, the brows to cuerpo.
  const gao = JSON.parse(readFileSync(join(__dirname, 'fixtures/figura/gao_shun32_rig.json'), 'utf8')) as FigureRecipe;
  const hexes = (a: SpriteAsset, layer: FigureLayer, f: number) => a.layers![(FIGURE_LAYERS as readonly FigureLayer[]).indexOf(layer)].frames[f].flat().filter(v => v).map(v => a.palette[v]);
  const fusedPx = (a: SpriteAsset) => a.layers![0].frames.map(f => f.map(r => r.map(v => (v ? a.palette[v] : null))));

  it('the beard goes to barba and the brows to the face; the fused frame does not change a pixel', () => {
    for (const view of ['front', 'side', 'side_left', 'front_left', 'back_right', 'back'] as const) {
      const rec = { ...gao, view, anims: ['idle', 'blink'] };
      const plain = { ...rec, head_layers: undefined };
      expect(fusedPx(figureAsset(rec)), view).toEqual(fusedPx(figureAsset(plain)));
      const { asset, materials, tones } = figureLayered(rec);
      const barba = hexes(asset, 'barba', 0);
      if (view === 'back' || view === 'back_right') {
        // from behind the beard does not show: the drawings split by colour, as always
        expect(barba, view).toEqual([]);
        continue;
      }
      expect(barba.length, view).toBeGreaterThan(4);
      expect(barba, view).toContain('#c2bdb5');
      expect(materials.barba['#c2bdb5'], view).toBe('barba');
      // the beard's tones: light 0, mid 2 (beard.tones)
      expect(tones.barba['#c2bdb5'], view).toBe(0);
      if (view === 'front') {
        expect(tones.barba['#8d8a86']).toBe(2);
        // the brows, in the hair's grey, stay with the face
        expect(hexes(asset, 'cuerpo', 0)).toContain('#8d8a86');
        expect(hexes(asset, 'pelo_adelante', 0)).toContain('#c2bdb5');
      }
    }
    // without head_layers the beard is hair, as it was
    const before = figureLayered({ ...gao, head_layers: undefined, view: 'front', anims: ['idle'] }).asset;
    expect(hexes(before, 'barba', 0)).toEqual([]);
  });

  it('the beard stacks over the face and the robe, under the hair', () => {
    for (const view of ['front', 'side', 'front_left'] as const) {
      const { order } = figureLayered({ ...gao, view, anims: ['idle', 'walk', 'attack'] });
      const z = (l: FigureLayer) => order.indexOf(l);
      expect(z('barba'), view).toBeGreaterThan(z('cuerpo'));
      expect(z('barba'), view).toBeGreaterThan(z('ropa_arriba'));
      expect(z('barba'), view).toBeLessThan(z('pelo_adelante'));
    }
  });

  it('drawn whole, the beard stays in barba (not in the face) and head_layers only takes layers', () => {
    const rec = { ...gao, view: 'front' as const, anims: ['idle'] };
    const whole = figureLayered(rec, { complete: true }).asset;
    expect(hexes(whole, 'barba', 0)).toContain('#c2bdb5');
    expect(hexes(whole, 'cuerpo', 0)).not.toContain('#c2bdb5');
    expect(() => figureLayered({ ...rec, head_layers: { B: 'bigote' as FigureLayer } })).toThrow(/head_layers takes layers/);
  });
});
