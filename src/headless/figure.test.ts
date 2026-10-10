// @vitest-environment node
// The rig in profile, and the drawn parts it carries (#13, #14): a head per
// view, a part hung from a joint, the order in front of or behind the body.
import { describe, expect, it } from 'vitest';
import { figureAsset, figureJoints, RUN_FRAME_MS, type FigureRecipe } from './figure';
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
      const nose = [wy + 1, wy + 2, wy + 3].some(y => f[y][wx + dir] === '#ef914f' && f[y][wx + 2 * dir] === INK);
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
