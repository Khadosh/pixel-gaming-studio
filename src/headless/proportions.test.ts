// The proportion map, tested against the drawing that asked for it.
//
// The silhouettes below are the real player chibi of The Unwritten Dao, pulled
// out of `art/pss/src/personajes/jugador_chibi.pss.json`: the one that cost two
// passes before anybody wrote the numbers down. If the schema cannot describe a
// character that already exists, it does not describe anything.

import { describe, expect, it } from 'vitest';
import type { Frame } from '../lib/types';
import {
  anatomyFrom, buildFrom, checkProportions, facesCamera, figureBox, resolveProportions,
  rowsIn, spanAt, widthsIn, type ProportionBase, type ProportionMap,
} from './proportions';
import { projectProportions, projectSchema, proportionsSchema, variantForSize } from './project';
import { animateAsset } from './animate';
import { createAsset, setFrame } from './assetModel';
import { lintAsset } from './inspect';

function mask(rows: string[]): Frame {
  return rows.map(r => [...r].map(c => (c === '.' ? 0 : 1)));
}

/** The chibi standing, facing the camera. 16 x 32. */
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

/** The same chibi in profile. Its shoulder is narrower **on purpose**. */
const CHIBI_RIGHT = mask([
  '....####........', '...######.......', '...######.......', '...########.....',
  '..##########....', '.############...', '.#############..', '.##############.',
  '.#############..', '.##############.', '.##############.', '..############..',
  '...##########...', '.##.########....', '.##...#####.....', '...##########...',
  '...##########...', '...##########...', '...##########...', '...##########...',
  '...#######.###..', '...#######.###..', '...#######.###..', '...########.....',
  '...###########..', '..############..', '..###########...', '..###########...',
  '....####.####...', '....####.####...', '...#####.####...', '...#####.####...',
]);

/**
 * The chibi's own numbers, measured row by row off the drawing — the study in
 * the game's `docs/referencia/chibi_proporciones.png` turned into data. Every
 * number is a fraction of the figure's height (32), widths included.
 */
const CHIBI: ProportionBase = {
  tolerance: 0.04,
  rows: {
    rodete: 0, cinta: 0.0625, menton: 0.4375, hombro: 0.46875,
    faja: 0.65625, ruedo: 0.84375, botas: 0.9375,
  },
  widths: { cinta: 0.1875, menton: 0.1875, hombro: 0.375, faja: 0.1875, ruedo: 0.375 },
  face: { rows: { pelo: 0.571, ojos: 0.643, boca: 0.786 } },
  anatomy: { neck: 'menton', waist: 'faja', knee: 'ruedo', ankle: 'botas', torso: 'hombro' },
  ratios: { head_of_height: [0.3, 0.46], head_of_shoulder: [0, 1] },
};

const bad = (r: ReturnType<typeof checkProportions>) => r.checks.filter(c => !c.ok).map(c => c.what);

describe('the proportion map and the chibi that already exists', () => {
  it('describes the real chibi: every check passes facing the camera', () => {
    const r = checkProportions(CHIBI_DOWN, CHIBI, 'down');
    expect(bad(r)).toEqual([]);
    expect(r.checks.length).toBe(10);
    expect(r.skipped).toEqual([]);
  });

  it('puts the lines where the drawing has them', () => {
    const box = figureBox(CHIBI_DOWN)!;
    expect(box).toMatchObject({ top: 0, bottom: 31, height: 32 });
    const rows = rowsIn(CHIBI, box);
    // chin at 14, shoulder at 15, sash at 21, hem at 27, boots at 30
    expect(rows).toMatchObject({ menton: 14, hombro: 15, faja: 21, ruedo: 27, botas: 30 });
    expect(widthsIn(CHIBI, box)).toMatchObject({ hombro: 12, menton: 6 });
  });

  it('measures the body through its middle, not the sword on its back', () => {
    // Row 14 is the neck: 6 px of neck, and a hilt two columns off to the left.
    // Edge to edge the row is 10 px wide; the body is 6.
    expect(spanAt(CHIBI_DOWN, 14)).toEqual({ left: 1, right: 10 });
    expect(spanAt(CHIBI_DOWN, 14, 7)).toEqual({ left: 5, right: 10 });
  });

  it('skips the widths in profile instead of reding a drawing that is right', () => {
    const r = checkProportions(CHIBI_RIGHT, CHIBI, 'right');
    expect(bad(r)).toEqual([]);
    expect(r.skipped.map(s => s.what)).toContain('ancho hombro');
    expect(r.skipped.map(s => s.what)).toContain('cabeza/hombro');
    // The rows are still checked: turning does not move your chin.
    expect(r.checks.map(c => c.what)).toContain('cabeza/alto');
  });

  it('is exactly the false red a lint without the caveat would give', () => {
    const naive = { ...CHIBI, facing: ['', 'down', 'up', 'left', 'right'] };
    const r = checkProportions(CHIBI_RIGHT, naive, 'right');
    // In profile the shoulder is 10 px, not 12, so the head comes out wider
    // than it: 1.40 against a rule that says never over 1. Both are wrong.
    expect(bad(r)).toEqual(['ancho hombro', 'cabeza/hombro']);
  });

  it('catches the character the game drew before it had numbers', () => {
    // The second pass: the head took 14 of the 32 rows and was as wide as it
    // was tall, over shoulders of 8. Nobody could say it was out of
    // proportion, because nothing had said what the proportion was.
    const beetle = mask([
      ...Array(14).fill('..############..'),
      ...Array(4).fill('....########....'),
      ...Array(14).fill('.....######.....'),
    ]);
    const r = checkProportions(beetle, { ...CHIBI, ratios: { ...CHIBI.ratios, head_of_height: [0.3, 0.4] } }, 'down');
    expect(bad(r)).toContain('cabeza/alto');
    expect(bad(r)).toContain('ancho hombro');
  });
});

describe('what a project declares', () => {
  const style = {
    name: 'juego',
    visual: {
      sizes: { chibi: [16, 32] as [number, number], icon: [16, 16] as [number, number] },
      proportions: {
        rows: { menton: 0.52, hombro: 0.56, faja: 0.7, ruedo: 0.88, botas: 0.95 },
        widths: { hombro: 0.5 },
        anatomy: { neck: 'menton', waist: 'faja', knee: 'ruedo', ankle: 'botas', torso: 'hombro' },
        ratios: { head_of_height: 0.52 },
        variants: { chibi: { rows: { menton: 0.4375, hombro: 0.46875, faja: 0.65625 } } },
      },
    },
  };

  it('parses inside a pgs.json', () => {
    const parsed = projectSchema.parse(style);
    expect(projectProportions(parsed)?.rows?.menton).toBe(0.52);
  });

  it('refuses a line that is not a fraction of a side', () => {
    expect(() => proportionsSchema.parse({ rows: { menton: 16 } })).toThrow();
  });

  it('lets a canvas pick its own variant by the size it is named after', () => {
    const parsed = projectSchema.parse(style);
    expect(variantForSize(parsed, 16, 32)).toBe('chibi');
    expect(variantForSize(parsed, 16, 16)).toBeUndefined();
    expect(variantForSize(parsed, 48, 48)).toBeUndefined();
  });

  it('folds a variant in key by key, so it states only what differs', () => {
    const map = projectProportions(projectSchema.parse(style))!;
    const chibi = resolveProportions(map, 'chibi');
    expect(chibi.rows).toMatchObject({ menton: 0.4375, ruedo: 0.88, botas: 0.95 });
    expect(chibi.widths).toEqual({ hombro: 0.5 });
    expect(chibi.anatomy?.neck).toBe('menton');
    expect(resolveProportions(map).rows?.menton).toBe(0.52);
  });
});

describe('what the engines read off it', () => {
  it('hands the anatomy engine the rows and the torso columns', () => {
    const box = figureBox(CHIBI_DOWN)!;
    expect(anatomyFrom(CHIBI, box, CHIBI_DOWN)).toEqual({
      neckRow: 14, waistRow: 21, kneeRow: 27, ankleRow: 30,
      torsoCenterCol: 7, torsoLeft: 2, torsoRight: 13,
    });
  });

  it('turns the head count into how many heads tall a figure is', () => {
    expect(buildFrom({ ratios: { head_of_height: 0.25 } })).toEqual({ heads: 4 });
    // The chibi's band, 0.30–0.46, is about 2.6 heads: a chibi, as drawn.
    expect(buildFrom(CHIBI).heads).toBeCloseTo(2.63, 2);
    expect(buildFrom({})).toEqual({});
  });

  it('gives animate the torso columns instead of letting it guess them', () => {
    const asset = createAsset({ id: 'c', name: 'c', width: 16, height: 32, frames: 1 });
    setFrame(asset, 0, CHIBI_DOWN);
    // Without the map the engine takes the sword hilt (column 1) for the edge
    // of the body; with it, the torso is the 12 columns the project declared.
    expect(() => animateAsset(asset, { base: 0, anim: 'walk', proportions: CHIBI })).not.toThrow();
    const declared = anatomyFrom(CHIBI, figureBox(CHIBI_DOWN)!, CHIBI_DOWN);
    expect(declared.torsoLeft).toBe(2);
    expect(declared.torsoRight).toBe(13);
  });

  it('knows which views a width is true in', () => {
    expect(facesCamera('', CHIBI)).toBe(true);
    expect(facesCamera('down', CHIBI)).toBe(true);
    expect(facesCamera('left', CHIBI)).toBe(false);
    expect(facesCamera('left', { ...CHIBI, facing: ['left'] })).toBe(true);
  });
});

describe('the lint', () => {
  function chibiAsset(): ReturnType<typeof createAsset> {
    const asset = createAsset({ id: 'chibi', name: 'chibi', width: 16, height: 32, frames: 2 });
    setFrame(asset, 0, CHIBI_DOWN);
    setFrame(asset, 1, CHIBI_RIGHT);
    asset.animations = [
      { name: 'idle_down', frameIndices: [0], fps: 3, loop: true },
      { name: 'idle_right', frameIndices: [1], fps: 3, loop: true },
      { name: 'walk_down', frameIndices: [1], fps: 10, loop: true },
    ];
    return asset;
  }

  it('says ok on the character the game already drew', () => {
    const r = lintAsset(chibiAsset(), { proportions: CHIBI });
    expect(r.warnings).toEqual([]);
  });

  it('only measures the poses the map describes: a walk is not a body standing', () => {
    const r = lintAsset(chibiAsset(), { proportions: CHIBI });
    expect(r.proportions?.map(p => p.pose)).toEqual(['idle_down', 'idle_right']);
  });

  it('says out loud what it did not look at, so a profile is not a free pass', () => {
    const r = lintAsset(chibiAsset(), { proportions: CHIBI });
    const profile = r.proportions!.find(p => p.view === 'right')!;
    expect(profile.report.skipped.length).toBeGreaterThan(0);
    expect(profile.report.skipped[0].why).toContain('profile');
  });

  it('answers "this character is out of proportion", which it could not before', () => {
    const asset = chibiAsset();
    // A chin two rows higher than the project says: the head shrinks and the
    // widths land on the wrong rows.
    const off: ProportionMap = { ...CHIBI, rows: { ...CHIBI.rows, menton: 0.25, hombro: 0.28 } };
    const r = lintAsset(asset, { proportions: off });
    expect(r.warnings.join('\n')).toContain('idle_down');
    expect(r.warnings.some(w => w.includes('cabeza/alto'))).toBe(true);
  });
});
