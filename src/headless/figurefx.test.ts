// @vitest-environment node
// The effects a figure draws with its poses (Khadosh/pixel-gaming-studio#16):
// the arc of the attack, the qi of the technique, and the technique of the
// upright stance, which went back to the fighter's guard.
import { describe, expect, it } from 'vitest';
import { figureAsset, figureLayered, fxWarnings, type FigureRecipe } from './figure';
import { paintQi } from './figurefx';
import type { SpriteAsset } from '../lib/types';

type Px = (string | null)[][];
const SLASH = '#4a90d9', EDGE = '#e0f4ff', QI = '#6fb4e0', QI_CORE = '#f0fbff';
const base: FigureRecipe = {
  id: 'f', width: 32, height: 48, stance: 'upright', elevation: 0,
  heading: { front: 90, back: -90 }, sideroom: 16, headroom: 10,
  build: { heads: 2.5, height: 33 },
  skin: '#f2c9a0', hair: { style: 'topknot', tones: '#3b3643' },
  top: { tones: '#f4efe3', sleeves: 'long' }, pants: '#2c2a33', shoes: '#5a3a26',
  glow: '#82b4d1', glow_core: '#e8ebf5',
  anims: ['idle', 'attack', 'technique'],
};
const fx = { slash: { color: SLASH, core: EDGE }, qi: { color: QI, core: QI_CORE } };

function frame(a: SpriteAsset, anim: string, k = 0, layer = 0): Px {
  const an = a.animations.find(x => x.name === anim)!;
  return a.layers![layer].frames[an.frameIndices[k]].map(r => r.map(v => (v ? a.palette[v] : null)));
}
const count = (f: Px, ...hex: string[]) => f.flat().filter(c => c !== null && hex.includes(c)).length;
const frames = (a: SpriteAsset, anim: string) => a.animations.find(x => x.name === anim)!.frameIndices.length;

describe('fx', () => {
  it('without fx in the recipe nothing changes; with it, only pixels that were empty', () => {
    for (const view of ['front', 'side', 'back'] as const) {
      const plain = figureAsset({ ...base, view }), lit = figureAsset({ ...base, view, fx });
      expect(lit.animations).toEqual(plain.animations);
      let added = 0;
      for (const anim of ['idle', 'attack', 'technique']) {
        for (let k = 0; k < frames(plain, anim); k++) {
          const a = frame(plain, anim, k), b = frame(lit, anim, k);
          a.forEach((r, y) => r.forEach((c, x) => {
            if (c !== b[y][x]) { expect(c).toBeNull(); added++; }
          }));
          // the effects go where the poses say: the blow and its tail, the technique but its last frame
          const has = count(b, SLASH, EDGE, QI, QI_CORE) > 0;
          const where = (anim === 'attack' && (k === 1 || k === 2)) || (anim === 'technique' && k < 4);
          if (!where) expect(has).toBe(false);
        }
      }
      expect(added).toBeGreaterThan(100);
    }
  });

  it('the blow cuts an arc ahead of the body, with its edge; the frame after, a thinner tail', () => {
    const side = figureAsset({ ...base, view: 'side', fx });
    const cut = frame(side, 'attack', 1), tail = frame(side, 'attack', 2);
    expect(count(cut, EDGE)).toBeGreaterThan(5);
    expect(count(tail, EDGE)).toBe(0);
    expect(count(tail, SLASH)).toBeGreaterThan(0);
    expect(count(tail, SLASH)).toBeLessThan(count(cut, SLASH, EDGE));
    // in profile facing right, the arc is ahead: most of it right of the body's middle
    const xs = cut.flatMap(r => r.flatMap((c, x) => (c === SLASH || c === EDGE ? [x] : [])));
    const mid = cut[0].length / 2;
    expect(xs.filter(x => x > mid).length).toBeGreaterThan(xs.length / 2);
  });

  it('the qi rises round the body as it gathers and makes a dome over it as it goes out', () => {
    const front = figureAsset({ ...base, view: 'front', fx });
    const crown = (f: Px) => f.findIndex(r => r.some(c => c !== null && c !== QI && c !== QI_CORE));
    // gathering: sparks, more on the second frame
    expect(count(frame(front, 'technique', 0), QI, QI_CORE)).toBeGreaterThan(3);
    expect(count(frame(front, 'technique', 1), QI, QI_CORE)).toBeGreaterThan(count(frame(front, 'technique', 0), QI, QI_CORE));
    // going out: the dome stands over the crown and wider than the body
    const out = frame(front, 'technique', 2);
    const top = out.findIndex(r => r.some(c => c === QI || c === QI_CORE));
    expect(top).toBeLessThan(crown(out) - 1);
    const qiX = out.flatMap(r => r.flatMap((c, x) => (c === QI || c === QI_CORE ? [x] : [])));
    expect(Math.max(...qiX) - Math.min(...qiX)).toBeGreaterThan(30);
    // the same recipe, the same sparks
    expect(frame(figureAsset({ ...base, view: 'front', fx }), 'technique', 1)).toEqual(frame(front, 'technique', 1));
  });

  it('the dome is a bubble round the body going into a footprint on the floor, not a cage on a pedestal (Khadosh/estudio#546)', () => {
    // a figure 40 tall with its soles on row 46, on a canvas with room under them and on one without
    for (const h of [52, 48]) {
      const w = 60;
      const cv = { w, h, pixels: Array(w * h).fill(null) as (string | null)[] };
      paintQi(cv, new Uint8Array(w * h), 30, 46, 40, { sphere: 0.6 }, { color: 'c', core: 'k', seed: 3 }, 0);
      const ink = (y: number) => cv.pixels.slice(y * w, y * w + w).flatMap((c, x) => (c ? [x] : []));
      const span = (y: number) => (ink(y).length ? Math.max(...ink(y)) - Math.min(...ink(y)) : 0);
      // 24 px each side of the chest's column for 0.6 of 40, and nothing past it
      const xs = Array.from({ length: h }, (_, y) => ink(y)).flat();
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(30 - 24 - 1);
      expect(Math.max(...xs)).toBeLessThanOrEqual(30 + 24);
      // over the crown (row 7) and widest up at the body, not on the floor: the sides
      // lean in to it, they do not stand upright down to the ground
      expect(ink(4).length, `${h}: over the crown`).toBeGreaterThan(0);
      const widest = Array.from({ length: h }, (_, y) => y).sort((a, b) => span(b) - span(a) || a - b)[0];
      expect(widest, `${h}: widest row`).toBeLessThan(46 - 8);
      expect(span(46 - 3), `${h}: by the feet`).toBeLessThan(span(widest) - 8);
      // the footprint: an ellipse on the floor, its back over the soles and its front
      // under them, on the canvas's last row when that is all there is
      const near = (y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, k) => ink(y0 + k)).flat().filter(x => Math.abs(x - 30) < 4).length;
      expect(near(46 - 8, 46 - 1), `${h}: the back of the footprint behind the feet`).toBeGreaterThan(0);
      expect(near(47, h - 1), `${h}: its front`).toBeGreaterThan(0);
    }
    // lit on its upper left
    const w = 60, h = 52;
    const cv = { w, h, pixels: Array(w * h).fill(null) as (string | null)[] };
    paintQi(cv, new Uint8Array(w * h), 30, 46, 40, { sphere: 0.6 }, { color: 'c', core: 'k', seed: 3 }, 0);
    const lit = cv.pixels.flatMap((c, i) => (c === 'k' ? [i % w] : []));
    expect(lit.length).toBeGreaterThan(3);
    expect(lit.every(x => x < 30)).toBe(true);
  });

  it('goes to the layer aura, and the layers, split or whole, still give the fused frame', () => {
    const rec: FigureRecipe = { ...base, view: 'front', fx };
    const fused = figureAsset(rec);
    for (const complete of [false, true]) {
      const { asset, order } = figureLayered(rec, { complete });
      const at = (name: string) => asset.layers!.findIndex(l => l.name === name);
      for (const [anim, k] of [['attack', 1], ['technique', 2]] as const) {
        const want = frame(fused, anim, k);
        const stacked: Px = want.map(r => r.map(() => null));
        for (const name of complete ? order : asset.layers!.map(l => l.name)) {
          frame(asset, anim, k, at(name)).forEach((r, y) => r.forEach((c, x) => { if (c) stacked[y][x] = c; }));
        }
        expect(stacked).toEqual(want);
        expect(count(frame(asset, anim, k, at('aura')), SLASH, EDGE, QI, QI_CORE)).toBe(count(want, SLASH, EDGE, QI, QI_CORE));
      }
    }
  });

  it('says what the canvas cuts off and the room that holds it', () => {
    const tight: FigureRecipe = { ...base, sideroom: 0, headroom: 0, view: 'side', fx };
    const said = fxWarnings(tight);
    expect(said.join(' ')).toMatch(/attack: .* give sideroom \d+/);
    // the dome is wider than the body and taller: past the sides and, on a short canvas, over the top
    expect(said.join(' ')).toMatch(/technique: .* give sideroom \d+/);
    expect(fxWarnings({ ...tight, height: 40, ground: 38 }).join(' ')).toMatch(/technique: .* headroom \d+/);
    const room = (k: string) => Number(new RegExp(`technique: .*${k} (\\d+)`).exec(said.join(' '))?.[1] ?? 0);
    expect(fxWarnings({ ...tight, sideroom: room('sideroom'), headroom: room('headroom') }).filter(s => s.startsWith('technique'))).toEqual([]);
    expect(fxWarnings({ ...tight, fx: undefined })).toEqual([]);
  });
});

describe('the upright technique', () => {
  it('keeps its feet square and goes back to standing, not to the fighter\'s guard', () => {
    const rec: FigureRecipe = { ...base, view: 'front' };
    const upright = figureAsset(rec), fighter = figureAsset({ ...rec, stance: 'fighter' });
    const idle = frame(upright, 'idle');
    const differ = (a: Px, b: Px) => a.flat().filter((c, i) => c !== b.flat()[i]).length;
    // its last frame is half way back to the upright idle; the fighter's to its guard
    expect(differ(frame(upright, 'technique', 4), idle)).toBeLessThan(differ(frame(fighter, 'technique', 4), idle));
    // the soles stay on the ground in every frame
    const soles = (f: Px) => f.reduce((last, r, y) => (r.some(Boolean) ? y : last), -1);
    for (let k = 0; k < 5; k++) expect(soles(frame(upright, 'technique', k))).toBe(soles(idle));
  });
});
