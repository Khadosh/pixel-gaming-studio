// @vitest-environment node
// The four diagonals of the rig (#384 of the game): a camera at 45° between
// the views of today, the drawn head turned from the front (or back) and the
// profile, and the drawn parts that hang from a joint the rig already turned.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAGONALS, FIGURE_VIEWS, figureAsset, figureJoints, figureLayered, headingOf, snapped, type FigureRecipe } from './figure';
import { closePinholes, lostProfile, turnArt, type TurnSource } from './figureTurn';
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
const inkBox = (f: (string | null)[][]) => {
  const xs = f.flatMap(r => r.flatMap((c, x) => (c ? [x] : []))), ys = f.flatMap((r, y) => (r.some(Boolean) ? [y] : []));
  return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
};
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

describe('closePinholes: a turned drawing has no one-pixel holes', () => {
  it('fills a cell walled in on four sides with the colour most of its neighbours have', () => {
    const g: (string | null)[][] = [
      ['#a', '#a', '#a'],
      ['#b', null, '#a'],
      ['#a', '#a', '#a'],
    ];
    expect(closePinholes(g)).toBe(1);
    expect(g[1][1]).toBe('#a');
  });
  it('leaves an opening on the edge and a gap two wide alone', () => {
    const g: (string | null)[][] = [
      ['#a', null, '#a', '#a'],
      ['#a', '#a', null, null],
      ['#a', '#a', '#a', '#a'],
    ];
    expect(closePinholes(g)).toBe(0);
    expect(g[0][1]).toBeNull();
    expect(g[1][2]).toBeNull();
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

  it('a fighter gives way as it dies: the knees buckle, the body leans, and it lies with the legs bent (Khadosh/estudio#546)', () => {
    // the player of The Unwritten Dao in its fight, turned to the rival and from behind: it went
    // down stiff, the second frame a figure standing a little lower and the last the standing one
    // tipped over, a knee straight
    const chibi = JSON.parse(readFileSync(join(__dirname, 'fixtures/figura/jugador32_rig.json'), 'utf8')) as FigureRecipe;
    for (const view of ['front_left', 'back_right'] as const) {
      const fight: FigureRecipe = { ...chibi, view, stance: 'fighter', heading: { front_left: 150 }, sideroom: 15, headroom: 7, anims: ['idle', 'die'] };
      const j = (k: number) => figureJoints(fight, 'die', k);
      // the angle at the knee on screen, in degrees (180 straight)
      const knee = (k: number, s: 'left' | 'right') => {
        const [h, n, f] = [j(k)[`hip_${s}`], j(k)[`knee_${s}`], j(k)[`foot_${s}`]];
        const d = Math.abs(Math.atan2(h[1] - n[1], h[0] - n[0]) - Math.atan2(f[1] - n[1], f[0] - n[0])) * 180 / Math.PI;
        return d > 180 ? 360 - d : d;
      };
      const lean = (k: number) => Math.abs(j(k).head[0] - j(k).pelvis[0]);
      for (const s of ['left', 'right'] as const) {
        expect(knee(1, s), `${view}: giving way, the ${s} knee`).toBeLessThan(120);
        expect(knee(3, s), `${view}: lying, the ${s} knee`).toBeLessThan(130);
      }
      expect(lean(1), `${view}: giving way, the head off the hips`).toBeGreaterThan(lean(0));
    }
  });

  it('a carried part lies down with the body and still touches it (Khadosh/estudio#547)', () => {
    // the player of The Unwritten Dao in its fight (on guard, room to lie down, turned to the rival):
    // lying, its staff on the back hung a pixel over the body, and the skirt slid off its waist
    const chibi = JSON.parse(readFileSync(join(__dirname, 'fixtures/figura/jugador32_rig.json'), 'utf8')) as FigureRecipe;
    const fight: FigureRecipe = { ...chibi, view: 'front_left', stance: 'fighter', heading: { front_left: 150 }, sideroom: 15, headroom: 7, anims: ['idle', 'die'] };
    const a = figureAsset(fight);
    const f = frame(a, 'die', 3);
    expect(inkBox(f).w, 'lying across').toBeGreaterThan(inkBox(f).h);
    // the staff shows, and nothing big hangs apart from the body (the few px apart are hair tips and glints)
    expect(count(f, fight.attachments!.find(x => x.name === 'espada')!.legend!.x)).toBeGreaterThan(0);
    const seen = f.map(r => r.map(() => false));
    const pieces: number[] = [];
    f.forEach((row, y0) => row.forEach((c, x0) => {
      if (!c || seen[y0][x0]) return;
      let n = 0;
      const todo = [[x0, y0]];
      seen[y0][x0] = true;
      while (todo.length) {
        const [x, y] = todo.pop()!;
        n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (f[y + dy]?.[x + dx] && !seen[y + dy][x + dx]) { seen[y + dy][x + dx] = true; todo.push([x + dx, y + dy]); }
        }
      }
      pieces.push(n);
    }));
    expect(pieces.filter(n => n >= 10)).toHaveLength(1);
  });

  it('slides a floating part toward its joint until it touches, and leaves a touching one alone', () => {
    // a 10 × 10 canvas with a body block at x 6..9; a 1 × 3 stick at x 2 floats two columns off
    const w = 10, h = 10, body = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 6; x < w; x++) body[y * w + x] = 1;
    const stick = (x: number): [number, number][] => [[x, 3], [x, 4], [x, 5]];
    expect(snapped(body, w, h, stick(2), [5, 0])).toEqual([3, 0]);
    expect(snapped(body, w, h, stick(5), [5, 0])).toEqual([0, 0]);
    // too far to reach: it stays
    expect(snapped(body, w, h, stick(-5), [5, 0])).toEqual([0, 0]);
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

// The profile of a chibi of The Unwritten Dao, drawn by hand (facing right):
// the ear at the back (f, g), the eye with its glint (i) and blue iris (B, b),
// the nose at the front edge. And the lost profile Joaquín chose from it (14 oct).
const CHIBI_SIDE = [
  '......kk..kk.............', '.....kcdckkdck...........', '.....kcxdccdck...........', '.....kccxcccck...........',
  '.......kbLLbbbBk.........', '........keeeeeecccck.....', '......kxxxxxxxxcccccck...', '....kxxcccccccdcxxcccck..',
  '...kxccdcecccececccxxcck.', '...kcdcccecceccceccecdck.', '...kcccceccceccceceeecck.', '...kecccecceccccceFFFccck',
  '..kceccecccecccccFeeFeck.', '.kcceececcecceeccFFFeFk..', 'kck.kcceccecceccekkkkFk..', 'k...kececceckkccFFkieFk..',
  '..kccececcckFFceFFFBeFk..', '.kk..keeccckfgcFFFFbBFFk.', '......keccckFFFeFFFbbfk..', '......kcecckkFFFFFFFFFk..',
  '.......kcecckkFFFFFFFk...', '...........kkFkFFFFFk....', '............kfFkkkkk.....',
];
const CHIBI_LOST = [
  '......kk..kk.............', '.....kcdckkdck...........', '.....kcxdccdck...........', '.....kccxcccck...........',
  '.......kbLLbbbBk.........', '........keeeeeecccck.....', '......kxxxxxxxxcccccck...', '....kxxcccccccdcxxcccck..',
  '...kxccdcecccececccxxcck.', '...kcdcccecceccceccecdck.', '...kcccceccceccceceeecck.', '...kecccecceccccecceccck.',
  '..kcecceccceccceccecFek..', '.kcceececcecceeccecFek...', 'kck.kcceccecceccecckkk...', 'k...kececceckkcecceFFk...',
  '..kccececcckFFccceFFFk...', '.kk..keeccckfgcceccFFFk..', '......keccckFFFeccFFFk...', '......kcecckkFFcceFFFk...',
  '.......kcecckkFceFFFk....', '...........kkFkeFFFk.....', '............kfFkkkkk.....',
];
const CHIBI_LEGEND = {
  B: '#3d6a8f', F: '#f2c9a0', L: '#dbeeff', b: '#6f9fc4', c: '#3b3643', d: '#4e484a', e: '#2c2a33',
  f: '#ef914f', g: '#b8613a', i: '#e3f1f5', k: INK, x: '#5a3a26',
};
const CHIBI_SKIN = ['#f2c9a0', '#ef914f', '#b8613a'];
const lastOpaque = (r: string) => Math.max(...[...r].map((g, i) => (g !== '.' ? i : -1)));

describe('lostProfile: a head turned away, out of its profile', () => {
  const lost = lostProfile(CHIBI_SIDE, CHIBI_LEGEND, { skin: CHIBI_SKIN, ink: INK });

  it('is the lost profile chosen in the game, pixel for pixel', () => {
    expect(lost.rows).toEqual(CHIBI_LOST);
  });

  it('has no eye, keeps the ear, cuts the nose a pixel and leaves a strip of cheek inked at the front', () => {
    const all = lost.rows.join('');
    for (const eye of ['i', 'B', 'b']) expect(all.slice(25 * 11)).not.toContain(eye); // the ribbon above keeps its blue
    for (const r of [16, 17, 18]) expect(lost.rows[r].slice(11, 15)).toBe(CHIBI_SIDE[r].slice(11, 15));
    for (const r of [11, 12, 13, 15, 16, 17, 18, 19, 20]) {
      const l = lastOpaque(lost.rows[r]);
      expect(l).toBe(lastOpaque(CHIBI_SIDE[r]) - 1);
      expect(lost.rows[r][l]).toBe('k');
    }
    // the cheek: skin right behind the edge, wider on the jaw; hair between it and the ear
    expect(lost.rows[16].slice(18, 21)).toBe('FFF');
    expect(lost.rows[15].slice(19, 21)).toBe('FF');
    expect(lost.rows[16].slice(15, 18)).toMatch(/^[ce]+$/);
  });

  it('with no ear drawn (hair over it) the hair covers the face from its first skin', () => {
    const noEar = CHIBI_SIDE.map(r => r.replace(/[fg]/g, 'c'));
    const out = lostProfile(noEar, CHIBI_LEGEND, { skin: CHIBI_SKIN, ink: INK });
    expect(out.rows[16].slice(12, 14)).toMatch(/^[ce]+$/);
    expect(out.rows[18].slice(19, 21)).toBe('FF');
  });

  it('covers the face with the hair, never with a band of another colour above it', () => {
    const band = '#e6dcc6';
    const withBand = CHIBI_SIDE.map((r, i) => (i === 9 ? r.replace(/[cde]/g, 'w') : r));
    const out = lostProfile(withBand, { ...CHIBI_LEGEND, w: band }, { skin: CHIBI_SKIN, ink: INK });
    expect(out.rows.slice(11).join('')).not.toContain('w');
  });
});

describe('figure: back_head lost_profile', () => {
  const rec: FigureRecipe = {
    ...base, anims: ['idle'], skin: ['#f2c9a0', '#ef914f', '#b8613a'],
    head_art: {
      side: { rows: CHIBI_SIDE, legend: CHIBI_LEGEND, outlined: true },
      front: { rows: CHIBI_SIDE, legend: CHIBI_LEGEND, outlined: true },
      back: { rows: CHIBI_SIDE.map(r => r.replace(/[FfgiBb]/g, 'c')), legend: CHIBI_LEGEND, outlined: true },
    },
  };
  const lost: FigureRecipe = { ...rec, back_head: 'lost_profile' };

  it('changes only the diagonals from behind: the other six views stay as they were', () => {
    for (const view of ['front', 'back', 'side', 'side_left', 'front_right', 'front_left'] as const) {
      expect(frame(figureAsset({ ...lost, view }), 'idle')).toEqual(frame(figureAsset({ ...rec, view }), 'idle'));
    }
  });

  it('from behind shows the ear and the cheek of the profile, no eye; back_left is its mirror', () => {
    const glint = '#e3f1f5';
    for (const view of ['back_right', 'back_left'] as const) {
      const f = frame(figureAsset({ ...lost, view }), 'idle');
      expect(f).not.toEqual(frame(figureAsset({ ...rec, view }), 'idle'));
      expect(count(f, glint)).toBe(0);
      expect(count(f, '#f2c9a0')).toBeGreaterThan(10);
      expect(count(f, '#b8613a')).toBeGreaterThan(0);
    }
    // the cheek on the side the figure faces: right in back_right, left in back_left
    const skinX = (view: 'back_right' | 'back_left') => {
      const f = frame(figureAsset({ ...lost, view }), 'idle');
      const xs = f.flatMap(r => r.map((c, x) => (c === '#f2c9a0' ? x : -1)).filter(x => x >= 0));
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(skinX('back_right')).toBeGreaterThan(skinX('back_left'));
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
