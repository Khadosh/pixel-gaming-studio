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
