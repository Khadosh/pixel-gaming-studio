// @vitest-environment node
// The four diagonals of the rig (#384 of the game): a camera at 45° between
// the views of today, the drawn head turned from the front (or back) and the
// profile, and the drawn parts that hang from a joint the rig already turned.
import { describe, expect, it } from 'vitest';
import { DIAGONALS, FIGURE_VIEWS, figureAsset, figureLayered, headingOf, snapped, type FigureRecipe } from './figure';
import { turnArt, type TurnSource } from './figureTurn';
import { CONTRACTS, contractAnims, roleOf, viewOf, VIEWS8 } from './contract';
import type { SpriteAsset } from '../lib/types';

const base: FigureRecipe = {
  id: 'f', width: 32, height: 48, stance: 'upright', elevation: 0,
  heading: { front: 90, back: -90 },
  build: { heads: 2.5, height: 33 },
  skin: '#f2c9a0', hair: { style: 'topknot', tones: '#3b3643' },
  top: { tones: '#f4efe3', sleeves: 'long' }, pants: '#2c2a33', shoes: '#5a3a26',
};
const INK = '#15120f';
const SKIN = '#f2c9a0', HAIR = '#3b3643', EYE_L = '#3d6a8f', EYE_R = '#d14b34', EAR = '#ef914f';

function frame(a: SpriteAsset, anim: string, k = 0): (string | null)[][] {
  const an = a.animations.find(x => x.name === anim)!;
  return a.layers![0].frames[an.frameIndices[k]].map(r => r.map(v => (v ? a.palette[v] : null)));
}
const count = (f: (string | null)[][], hex: string) => f.flat().filter(c => c === hex).length;
const colors = (f: (string | null)[][]) => new Set(f.flat().filter((c): c is string => !!c));

// A round head 14 wide: hair on top and round the sides, a face with a blue
// eye on the screen-left and a red one on the screen-right, and in profile an
// ear in the middle of the hair (orange), the face to the right.
const FRONT = [
  '....kkkkkk....',
  '..kkhhhhhhkk..',
  '.khhhhhhhhhhk.',
  'khhhhhhhhhhhhk',
  'khhffffffffhhk',
  'khffBBffRRffhk',
  'khffBBffRRffhk',
  'khffffffffffhk',
  '.khffffffffhk.',
  '..kkffffffkk..',
  '....kkkkkk....',
];
const SIDE = [
  '....kkkkkk....',
  '..kkhhhhhhkk..',
  '.khhhhhhhhhhk.',
  'khhhhhhhhhhhhk',
  'khhhhhhhffffk.',
  'khhhhoohffPffk',
  'khhhhoohffffk.',
  'khhhhhhfffffk.',
  '.khhhhffffffk.',
  '..kkkhfffffk..',
  '....kkkkkk....',
];
const PROFILE_EYE = '#ffffff';
const legend = { k: INK, h: HAIR, f: SKIN, B: EYE_L, R: EYE_R, o: EAR, P: PROFILE_EYE };
const src = (rows: string[], heading: number): TurnSource => ({ rows, legend, jx: 7, jy: 10, heading });

describe('turnArt: a drawing turned 45° from the view it faces and the profile', () => {
  const turned = turnArt(src(FRONT, 90), src(SIDE, 0), 60, INK);
  const grid = turned.rows.map(r => [...r].map(g => (g === '.' ? null : turned.legend[g])));

  it('keeps the head about as wide, with its own ink round it', () => {
    expect(Math.abs(turned.rows[0].length - FRONT[0].length)).toBeLessThanOrEqual(2);
    // every pixel on the silhouette is ink
    grid.forEach((row, y) => row.forEach((c, x) => {
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !grid[y + dy]?.[x + dx]);
      if (c && open) expect(c).toBe(INK);
    }));
  });

  it('turns the face toward the side it looks: the near eye whole, the far one narrower, the ear of the profile behind', () => {
    // heading 60 is the face turned toward screen right: the red eye goes to the edge and narrows
    expect(count(grid, EYE_L)).toBeGreaterThanOrEqual(count(grid, EYE_R));
    expect(count(grid, EYE_R)).toBeGreaterThan(0);
    const xs = (hex: string) => grid.flatMap(r => r.flatMap((c, x) => (c === hex ? [x] : [])));
    const mid = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(mid(xs(EYE_R))).toBeGreaterThan(mid(xs(EYE_L)));
    // the profile gives the ear, on the side the head turns from (left of the face)
    expect(count(grid, EAR)).toBeGreaterThan(0);
    expect(mid(xs(EAR))).toBeLessThan(mid(xs(EYE_L)));
    // and never its eye: a profile's eye beside the face would be a second face
    expect(count(grid, PROFILE_EYE)).toBe(0);
  });

  it('draws nothing new: every color comes from the two drawings', () => {
    for (const c of colors(grid)) expect(Object.values(legend)).toContain(c);
  });

  it('mirrors: turned the other way, the same drawing turns the other way', () => {
    const left = turnArt(src(FRONT, 90), src(SIDE.map(r => [...r].reverse().join('')), 180), 120, INK);
    const g = left.rows.map(r => [...r].map(c => (c === '.' ? null : left.legend[c])));
    const xs = (hex: string) => g.flatMap(r => r.flatMap((c, x) => (c === hex ? [x] : [])));
    const mid = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    // facing left now: the blue eye (screen-left) is the far one, at the edge
    expect(mid(xs(EYE_L))).toBeLessThan(mid(xs(EYE_R)));
    expect(count(g, EYE_R)).toBeGreaterThanOrEqual(count(g, EYE_L));
  });

  it('from behind keeps the bun as drawn, moved whole, and takes the ear with its line from the profile', () => {
    const RIBBON = '#6f9fc4';
    // a back drawing with a bun on top (a narrow row: ink, ribbon, ribbon, ink) and the head under it
    const BACK = ['.....kkkk.....', '.....kRRk.....', ...FRONT.slice(1).map(r => r.replace(/[BRf]/g, 'h'))];
    const t = turnArt({ ...src(BACK, -90), legend: { ...legend, R: RIBBON } }, src(SIDE, 0), -60, INK);
    const top = [...t.rows[1]].map(g => (g === '.' ? null : t.legend[g]));
    // the bun row as drawn: ink, two of ribbon, ink, in a row
    const start = top.findIndex(c => c);
    expect(top.slice(start, start + 4)).toEqual([INK, RIBBON, RIBBON, INK]);
    const g = t.rows.map(r => [...r].map(c => (c === '.' ? null : t.legend[c])));
    // the ear of the profile shows, and touches ink
    expect(count(g, EAR)).toBeGreaterThan(0);
    const inked = g.some((row, y) => row.some((c, x) => c === EAR && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] === INK)));
    expect(inked).toBe(true);
    // and nothing of the face half of the profile: no skin but the ear's
    expect(count(g, SKIN)).toBe(0);
  });

  it('from behind shows the ear on the side it turns to and no eye', () => {
    const BACK = FRONT.map(r => r.replace(/[BRf]/g, 'h'));
    const t = turnArt(src(BACK, -90), src(SIDE, 0), -60, INK);
    const g = t.rows.map(r => [...r].map(c => (c === '.' ? null : t.legend[c])));
    expect(count(g, EYE_L) + count(g, EYE_R)).toBe(0);
  });
});

describe('figure in the diagonals', () => {
  const rec: FigureRecipe = {
    ...base, anims: ['idle', 'walk'],
    head_art: {
      front: { rows: FRONT, legend, outlined: true },
      side: { rows: SIDE, legend, outlined: true },
      back: { rows: FRONT.map(r => r.replace(/[BRf]/g, 'h')), legend, outlined: true },
    },
  };

  it('knows the four diagonals, each between the view it faces and a profile, at 45° from both', () => {
    for (const v of ['front_right', 'front_left', 'back_right', 'back_left'] as const) {
      expect(FIGURE_VIEWS).toContain(v);
      const d = DIAGONALS[v]!;
      const h = headingOf(rec, v), hf = headingOf(rec, d.face), hs = headingOf(rec, d.side);
      const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
      expect(gap(h, hf)).toBe(45);
      expect(gap(h, hs)).toBe(45);
    }
  });

  it('draws every animation in a diagonal, with the drawn head turned and not the rig skull', () => {
    for (const view of ['front_right', 'front_left'] as const) {
      const a = figureAsset({ ...rec, view });
      expect(a.animations.map(x => x.name)).toEqual(['idle', 'walk']);
      const f = frame(a, 'idle');
      expect(count(f, EYE_L)).toBeGreaterThan(0);
      expect(count(f, EYE_R)).toBeGreaterThan(0);
      // the walk moves
      expect(frame(a, 'walk', 0)).not.toEqual(frame(a, 'walk', 1));
    }
    const back = frame(figureAsset({ ...rec, view: 'back_right' }), 'idle');
    expect(count(back, EYE_L) + count(back, EYE_R)).toBe(0);
  });

  it('a head drawn for the diagonal wins over the turned one', () => {
    const own = { rows: ['ppp', 'ppp'], legend: { p: '#c0ffee' } };
    const f = frame(figureAsset({ ...rec, view: 'front_right', head_art: { ...rec.head_art, front_right: own } }), 'idle');
    expect(count(f, '#c0ffee')).toBe(6);
    expect(count(f, EYE_L)).toBe(0);
  });

  it('does not change the four views of today', () => {
    // the diagonals are new cameras: a recipe with diagonal parts draws front and side as before
    const plain = figureAsset({ ...rec, view: 'front' });
    const withDiag = figureAsset({ ...rec, view: 'front', head_art: { ...rec.head_art, front_right: { rows: ['p'], legend: { p: '#c0ffee' } } } });
    expect(frame(withDiag, 'idle')).toEqual(frame(plain, 'idle'));
  });

  it('hangs a rigid part from its turned joint, from the view it faces; a part on the head never from the profile', () => {
    const sword = '#a0a0a0', ribbon = '#00ff00';
    const parts: FigureRecipe = {
      ...rec, anims: ['idle'],
      attachments: [
        { name: 'espada', joint: 'spine_top', views: { front: { rows: ['ss', 'ss'], legend: { s: sword }, behind: false } } },
        { name: 'cinta', joint: 'head', views: { side: { rows: ['gg'], legend: { g: ribbon } } } },
      ],
    };
    const fr = frame(figureAsset({ ...parts, view: 'front_right' }), 'idle');
    expect(count(fr, sword)).toBe(4);
    expect(count(fr, ribbon)).toBe(0);
    // from behind there is no back drawing of the sword, and the front's does not go round
    expect(count(frame(figureAsset({ ...parts, view: 'back_right' }), 'idle'), sword)).toBe(0);
  });

  it('a carried part that the turned body leaves floating slides back until it touches', () => {
    const sword = '#a0a0a0';
    // the map chibi's build, and its sword on the back as drawn from the front: up and out past the left shoulder
    const plain: FigureRecipe = { ...rec, anims: ['idle', 'attack', 'walk', 'run'], build: { heads: 2.5, height: 33, depth: 1.5, shoulders: 1.15, feet: 1.3, legs: 0.75 } };
    const stick = {
      rows: ['ss.......', '.sss.....', '..sss....', '...sss...', '....sss..', '.....sss.', '......sss', '.......ss'],
      legend: { s: sword }, at: [1, 23] as [number, number], behind: true,
    };
    const withSword: FigureRecipe = { ...plain, attachments: [{ name: 'espada', joint: 'spine_top', views: { front: stick } }] };
    for (const view of ['front_right', 'front_left'] as const) {
      const a = figureAsset({ ...withSword, view });
      for (const an of a.animations) {
        an.frameIndices.forEach((_, k) => {
          const f = frame(a, an.name, k);
          const near = f.some((row, Y) => row.some((c, X) => c === sword
            && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const o = f[Y + dy]?.[X + dx]; return !!o && o !== sword; })));
          // hidden behind the body is fine; showing, it touches
          expect(near || count(f, sword) === 0, `${view} ${an.name} ${k}`).toBe(true);
        });
      }
    }
  });

  it('slides a floating part toward its joint until it touches, and leaves a touching one alone', () => {
    // a 10 × 10 canvas with a body block at x 6..9; a 1 × 3 stick at x 2 floats two columns off
    const w = 10, h = 10, body = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 6; x < w; x++) body[y * w + x] = 1;
    const stick = { rows: ['s', 's', 's'], legend: { s: '#a0a0a0' } };
    expect(snapped(body, w, h, stick, 2, 3, [5, 0])).toEqual([3, 0]);
    expect(snapped(body, w, h, stick, 5, 3, [5, 0])).toEqual([0, 0]);
    // too far to reach: it stays
    expect(snapped(body, w, h, stick, -5, 3, [5, 0])).toEqual([0, 0]);
  });

  it('turns clothes drawn on the body (turn: wrap) like the head', () => {
    const robe = '#3d6a8f', light = '#dbeeff';
    const chest = {
      name: 'pecho', joint: 'chest' as const, turn: 'wrap' as const,
      views: { front: { rows: ['kbbbbbbk', 'kbbLLbbk', 'kbbbbbbk'], legend: { k: INK, b: robe, L: light } } },
    };
    const f = frame(figureAsset({ ...rec, anims: ['idle'], attachments: [chest], view: 'front_right' }), 'idle');
    expect(count(f, robe)).toBeGreaterThan(0);
    expect(count(f, light)).toBeGreaterThan(0);
  });

  it('splits in layers in a diagonal as in any view, and the layers give the frame back', () => {
    const l = figureLayered({ ...rec, anims: ['idle'], view: 'front_left' });
    const fused = figureAsset({ ...rec, anims: ['idle'], view: 'front_left' });
    const w = fused.width ?? 32, h = fused.height ?? 48;
    const back: (string | null)[][] = Array.from({ length: h }, () => Array(w).fill(null));
    for (const layer of l.asset.layers!) {
      layer.frames[0].forEach((r, y) => r.forEach((v, x) => { if (v) back[y][x] = l.asset.palette[v]; }));
    }
    expect(back).toEqual(frame(fused, 'idle'));
  });
});

describe('the directional contract with the diagonals', () => {
  it('asks for every view of the eight and tells a diagonal name from a plain one', () => {
    const names = contractAnims(CONTRACTS.directional8);
    expect(names).toContain('walk_down_right');
    expect(names).toContain('idle_up_left');
    expect(names.filter(n => n.startsWith('walk_'))).toHaveLength(8);
    expect(viewOf('walk_down_right', [...VIEWS8])).toBe('down_right');
    expect(roleOf('walk_down_right', [...VIEWS8])).toBe('walk');
    expect(viewOf('walk_right', [...VIEWS8])).toBe('right');
  });
});
