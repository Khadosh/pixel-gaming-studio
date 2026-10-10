// @vitest-environment node
// The rig in profile, and the drawn parts it carries (#13, #14): a head per
// view, a part hung from a joint, the order in front of or behind the body.
import { describe, expect, it } from 'vitest';
import { figureAsset, figureJoints, type FigureRecipe } from './figure';
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
