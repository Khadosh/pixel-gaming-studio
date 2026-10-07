// A full-body fighter drawn from a rig, not from a base sprite.
//
// The body is a set of sphere-swept capsules (head, hair, torso, limbs, robe)
// placed in the character's own 3D frame (x forward, y up, z to its right),
// posed per frame and projected orthographically in 3/4: "front" looks at the
// character turned to the lower left (a rival across the field), "back" from
// behind with it turned to the upper right (your side of a diagonal battle).
// One pose table drives both views, so a fighter seen from either side moves
// the same. Each pixel keeps the closest surface (z-buffer), is shaded in three
// tones of its material by a fixed light, and gets an ink outline plus ink
// where a limb passes in front of the body. Every frame is drawn whole, so the
// head can never come apart from the body (the anatomy engine's weak spot).

import type { SpriteAsset } from '../lib/types';
import { blankFrame, colorIndex, createAsset, normalizeHex, setAnimation, setFrame, addFrame } from './assetModel';
import { BODY_CONTRACT, contractAnims, type AnimationContract } from './contract';
import { buildFrom, type ProportionBase } from './proportions';

export type V3 = [number, number, number];
/** light, mid, shade */
export type Tones = [string, string, string];
type ToneSpec = string | Tones;

export const HAIR_STYLES = ['short', 'topknot', 'ponytail', 'long', 'messy', 'bun', 'bob'] as const;
export type HairStyle = typeof HAIR_STYLES[number];

export interface FigureRecipe {
  id: string;
  name?: string;
  view?: 'front' | 'back';
  /** canvas (default 48 × 48, a multiple of the 16 px grid) and the row the soles stand on (default height - 2) */
  width?: number;
  height?: number;
  ground?: number;
  /** degrees; default 140 (front) / -40 (back) */
  heading?: number;
  /** camera tilt in degrees (default 18) */
  elevation?: number;
  build?: {
    /** standing height in px from sole to crown (default 30) */
    height?: number;
    /** head radius factor (default 1) */
    head?: number;
    /** torso and limb thickness factor (default 1) */
    girth?: number;
    /** shoulder width factor (default 1) */
    shoulders?: number;
    /**
     * how many heads tall: unset is a realistic body (about 6.5); 2.5 to 4 is a
     * chibi built like the map sprites: a big expressive head on a short, wide
     * body with stubby limbs, mitten hands and big feet (default height 40)
     */
    heads?: number;
    /**
     * how far the knees and feet go out to the sides (default 1): a body
     * seated cross-legged seen from the front reads as a lotus at about 1.4
     */
    spread?: number;
  };
  ink?: string;
  skin: ToneSpec;
  eyes?: string;
  hair: { style: HairStyle; tones: ToneSpec; band?: string; ribbon?: string; locks?: boolean; /** a cloth over the crown */ crown?: string };
  hat?: { kind: 'cap' | 'turban'; tones: ToneSpec; jewel?: string };
  beard?: { kind: 'full' | 'mustache'; tones: ToneSpec };
  top: { tones: ToneSpec; sleeves?: 'long' | 'none' | 'wide'; trim?: string; collar?: boolean };
  /** a robe below the waist: length 0..1 of the way from hip to sole (default none) */
  skirt?: { tones: ToneSpec; length?: number; trim?: string };
  sash?: ToneSpec;
  /**
   * a work apron hanging in front of the body (a cook's, a smith's): from
   * \`from\` (0 the waist, 1 the chest) down to \`length\` of the way from hip to
   * sole (default 0.7 and 0.6), with an optional hem trim
   */
  apron?: { tones: ToneSpec; length?: number; from?: number; trim?: string };
  pants: ToneSpec;
  shoes: ToneSpec;
  wrist?: string;
  /**
   * a hand-drawn head per view, pasted over the rig at the head joint instead
   * of the rig's skull and hair: the same face as the map sprite, in pixels a
   * capsule can't draw. Keys: front, back, and front_shut / back_shut for the
   * eyes shut (hurt, die). No outer outline: the figure inks the silhouette.
   */
  head_art?: Partial<Record<'front' | 'back' | 'front_shut' | 'back_shut', HeadArt>>;
  /**
   * which animations to draw, by name (default the whole contract). Besides
   * the contract there is 'sit': cross-legged on the ground, hands in the lap,
   * breathing in (frame 0) and out (frame 1), to meditate or cultivate.
   */
  anims?: string[];
  /**
   * the animation contract this figure keeps, when it is not the body one
   * (`contract.ts`): a list of names, so a game with another contract does not
   * need another command. `anims` overrides it for one figure.
   */
  contract?: AnimationContract;
  /**
   * The project's proportion map (`proportions.ts`). What it can say about a
   * rig, it says: `ratios.head_of_height` becomes `build.heads`, so twenty
   * figures of the same project come out of one map instead of twenty
   * recipes. A `build` written by hand still wins — the map is the floor.
   */
  proportions?: ProportionBase;
  /** aura and palm light of the technique */
  glow?: string;
  glow_core?: string;
}

export interface HeadArt {
  /** rows of glyphs, '.' = empty */
  rows: string[];
  legend: Record<string, string>;
  /** the pixel that sits on the head joint (default the middle) */
  anchor?: [number, number];
}

interface Pose {
  pelvis: V3;
  chest: V3;
  head: V3;
  /** degrees the shoulders turn about the spine (+ = left shoulder forward) */
  twist?: number;
  hands: [V3, V3];
  elbows: [V3, V3];
  knees: [V3, V3];
  feet: [V3, V3];
  /** 0 none, 1 aura ring, 2 aura and a light between the palms */
  glow?: number;
  /** where the palm light sits (default between the hands) */
  orb?: V3;
  orbRadius?: number;
  /** eyes shut (hurt, die) */
  shut?: boolean;
}

// ---------------------------------------------------------------- poses
// Built for a 30 px tall body; scaled to build.height. Index 0 = left (lead) side.

const STANCE: Pose = {
  pelvis: [0, 14, 0], chest: [0.4, 20, 0], head: [0.8, 25.4, 0], twist: 20,
  elbows: [[4.4, 16.6, -4.8], [-1.8, 15.8, 5.0]],
  hands: [[8.8, 17.4, -2.6], [2.2, 14.6, 4.0]],
  knees: [[3.0, 7.6, -2.9], [-2.0, 7.6, 2.9]],
  feet: [[4.2, 1.3, -2.9], [-3.8, 1.3, 3.0]],
};

function shiftPose(p: Pose, d: Partial<Record<'body' | 'arms' | 'legs', V3>>, extra: Partial<Pose> = {}): Pose {
  const add = (v: V3, o?: V3): V3 => (o ? [v[0] + o[0], v[1] + o[1], v[2] + o[2]] : [...v] as V3);
  return {
    ...p,
    pelvis: add(p.pelvis, d.body), chest: add(p.chest, d.body), head: add(p.head, d.body),
    hands: [add(p.hands[0], d.arms ?? d.body), add(p.hands[1], d.arms ?? d.body)],
    elbows: [add(p.elbows[0], d.arms ?? d.body), add(p.elbows[1], d.arms ?? d.body)],
    knees: [add(p.knees[0], d.legs), add(p.knees[1], d.legs)],
    feet: [...p.feet] as [V3, V3],
    ...extra,
  };
}

function mix(a: Pose, b: Pose, t: number, extra: Partial<Pose> = {}): Pose {
  const l = (u: V3, v: V3): V3 => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
  return {
    pelvis: l(a.pelvis, b.pelvis), chest: l(a.chest, b.chest), head: l(a.head, b.head),
    twist: (a.twist ?? 0) + ((b.twist ?? 0) - (a.twist ?? 0)) * t,
    hands: [l(a.hands[0], b.hands[0]), l(a.hands[1], b.hands[1])],
    elbows: [l(a.elbows[0], b.elbows[0]), l(a.elbows[1], b.elbows[1])],
    knees: [l(a.knees[0], b.knees[0]), l(a.knees[1], b.knees[1])],
    feet: [l(a.feet[0], b.feet[0]), l(a.feet[1], b.feet[1])],
    ...extra,
  };
}

const BREATH = shiftPose(STANCE, { body: [0, -1, 0], arms: [0, -0.8, 0], legs: [0, -0.4, 0] });

const WINDUP: Pose = {
  pelvis: [-0.8, 13.5, 0], chest: [-0.9, 19.5, 0], head: [-0.6, 24.9, 0], twist: -30,
  elbows: [[2.6, 18.6, -4.6], [-4.0, 17.8, 4.0]],
  hands: [[5.0, 20.2, -3.0], [-2.0, 19.6, 3.0]],
  knees: [[3.0, 7.0, -2.9], [-2.4, 7.2, 2.9]],
  feet: [[4.2, 1.3, -2.9], [-3.8, 1.3, 3.0]],
};

const STRIKE: Pose = {
  pelvis: [1.4, 13.2, 0], chest: [3.0, 19.2, 0], head: [4.0, 24.5, 0], twist: -40,
  elbows: [[-1.2, 17.0, -4.8], [7.0, 20.0, 1.2]],
  hands: [[0.8, 15.4, -4.2], [11.0, 20.4, 0.2]],
  knees: [[5.0, 7.0, -2.9], [-1.0, 7.8, 2.9]],
  feet: [[6.4, 1.3, -2.9], [-4.0, 1.3, 3.0]],
};

const GATHER: Pose = {
  pelvis: [0, 13.6, 0], chest: [0.2, 19.8, 0], head: [0.5, 25.2, 0], twist: 0,
  elbows: [[0.6, 18.0, -4.6], [0.6, 18.0, 4.6]],
  hands: [[3.0, 20.0, -0.9], [3.0, 20.0, 0.9]],
  knees: [[3.0, 7.4, -3.0], [-2.0, 7.4, 3.0]],
  feet: [[4.2, 1.3, -3.0], [-3.8, 1.3, 3.0]],
  orb: [4.6, 20.2, 0], orbRadius: 1.3,
};

const PUSH: Pose = {
  pelvis: [1.0, 13.4, 0], chest: [2.0, 19.6, 0], head: [2.6, 25.0, 0], twist: 0,
  elbows: [[5.4, 20.0, -3.4], [5.4, 20.0, 3.4]],
  hands: [[9.0, 20.4, -1.5], [9.0, 20.4, 1.5]],
  knees: [[4.6, 7.0, -3.0], [-1.6, 7.8, 3.0]],
  feet: [[6.0, 1.3, -3.0], [-3.8, 1.3, 3.0]],
  orb: [11.6, 20.6, 0], orbRadius: 2.6,
};

const RECOIL: Pose = {
  pelvis: [-1.2, 13.8, 0], chest: [-2.6, 19.6, 0], head: [-3.8, 24.6, 0], twist: 10,
  elbows: [[-1.2, 17.8, -5.6], [-3.4, 17.8, 5.4]],
  hands: [[0.2, 14.8, -6.0], [-4.8, 15.2, 5.6]],
  knees: [[2.6, 7.6, -2.9], [-2.6, 7.6, 2.9]],
  feet: [[3.4, 1.3, -2.9], [-4.2, 1.3, 3.0]],
  shut: true,
};

const BUCKLE: Pose = {
  pelvis: [-0.6, 10.4, 0], chest: [0.4, 16.4, 0], head: [1.4, 21.4, 0], twist: 5,
  elbows: [[0.4, 13.4, -5.0], [-0.6, 13.4, 5.0]],
  hands: [[1.2, 10.0, -4.6], [0.2, 10.0, 4.6]],
  knees: [[3.6, 5.6, -2.9], [-1.4, 4.6, 2.9]],
  feet: [[4.2, 1.3, -2.9], [-3.8, 1.3, 3.0]],
  shut: true,
};

const KNEEL: Pose = {
  pelvis: [-0.8, 7.8, 0], chest: [1.0, 13.2, 0], head: [2.6, 17.8, 0], twist: 5,
  elbows: [[2.0, 10.0, -4.6], [0.8, 10.4, 4.8]],
  hands: [[3.6, 7.6, -3.2], [2.6, 7.4, 3.6]],
  knees: [[3.8, 6.0, -2.9], [-0.4, 1.4, 2.9]],
  feet: [[4.4, 1.3, -2.9], [-4.6, 1.2, 3.0]],
  shut: true,
};

const FALLEN: Pose = {
  pelvis: [-1.2, 6.4, 0], chest: [2.6, 9.4, 0], head: [5.8, 10.8, 0], twist: 0,
  elbows: [[4.6, 5.4, -4.4], [4.6, 5.4, 4.4]],
  hands: [[6.6, 1.5, -3.4], [6.6, 1.5, 3.4]],
  knees: [[1.6, 1.3, -2.7], [1.6, 1.3, 2.7]],
  feet: [[-3.6, 1.2, -2.8], [-3.6, 1.2, 2.8]],
  shut: true,
};

// on both knees, hands on the ground, the head hanging: where a drawn head
// ends its fall (an upright face can't lie down)
const SLUMP: Pose = {
  pelvis: [-0.6, 7.0, 0], chest: [1.4, 12.2, 0], head: [3.4, 16.2, 0], twist: 0,
  elbows: [[3.8, 7.4, -4.6], [3.8, 7.4, 4.6]],
  hands: [[5.6, 1.8, -3.4], [5.6, 1.8, 3.4]],
  knees: [[3.4, 1.4, -2.9], [3.0, 1.4, 2.9]],
  feet: [[-3.4, 1.2, -2.8], [-3.8, 1.2, 3.0]],
  shut: true,
};

const STEP_UP = shiftPose(STANCE, { body: [0.6, 0.4, 0] }, {
  knees: [[4.4, 9.0, -2.9], [-1.6, 7.8, 2.9]], feet: [[5.6, 3.0, -2.9], [-3.6, 1.3, 3.0]],
});
const STEP_DOWN = shiftPose(STANCE, { body: [1.2, -0.4, 0] }, {
  knees: [[4.4, 7.2, -2.9], [-1.0, 7.4, 2.9]], feet: [[5.8, 1.3, -2.9], [-3.0, 1.3, 3.0]],
});
const DRAG = shiftPose(STANCE, { body: [0.8, 0.2, 0] }, {
  knees: [[3.6, 7.6, -2.9], [0.0, 8.8, 2.9]], feet: [[5.2, 1.3, -2.9], [-1.4, 2.6, 3.0]],
});

// cross-legged on the ground, the hands resting in the lap: the knees go out
// to the sides and the feet tuck in front, crossed; the pelvis sits on the
// ground row. Breathing in lifts the chest and the head a little.
const SIT: Pose = {
  pelvis: [-0.6, 4.4, 0], chest: [0, 11.0, 0], head: [0.3, 16.6, 0], twist: 0,
  elbows: [[0.6, 8.0, -5.4], [0.6, 8.0, 5.4]],
  hands: [[3.4, 5.8, -1.2], [3.4, 5.8, 1.2]],
  knees: [[2.6, 2.0, -6.6], [2.6, 2.0, 6.6]],
  feet: [[4.2, 1.3, 2.2], [4.2, 1.3, -2.2]],
  shut: true,
};
const SIT_IN = shiftPose(SIT, { body: [0, 1.1, 0], arms: [0, 0.5, 0] }, {
  elbows: [[1.0, 7.4, -5.2], [1.0, 7.4, 5.2]],
});

// the same seat seen as a lotus: the hands rest open on the knees, so the
// chest and the belly stay in sight (a map of the body's channels); still
const LOTUS: Pose = {
  ...SIT,
  elbows: [[0.4, 7.4, -6.2], [0.4, 7.4, 6.2]],
  hands: [[2.6, 3.6, -6.2], [2.6, 3.6, 6.2]],
};

export interface FigureAnim { name: string; poses: Pose[]; durations: number[]; loop: boolean }

export const FIGURE_ANIMS: FigureAnim[] = [
  { name: 'idle', poses: [STANCE, BREATH], durations: [420, 420], loop: true },
  { name: 'walk', poses: [STANCE, STEP_UP, STEP_DOWN, DRAG], durations: [140, 140, 140, 140], loop: true },
  { name: 'attack', poses: [WINDUP, STRIKE, mix(STRIKE, STANCE, 0.15), mix(STRIKE, STANCE, 0.6)], durations: [110, 150, 140, 140], loop: false },
  {
    name: 'technique',
    poses: [GATHER, { ...GATHER, glow: 2 }, { ...PUSH, glow: 2 }, { ...PUSH, glow: 1, orbRadius: 1.8 }, mix(PUSH, STANCE, 0.5)],
    durations: [140, 160, 200, 180, 160], loop: false,
  },
  { name: 'hurt', poses: [RECOIL, mix(RECOIL, STANCE, 0.5, { shut: true })], durations: [140, 220], loop: false },
  { name: 'die', poses: [RECOIL, BUCKLE, KNEEL, FALLEN], durations: [140, 160, 220, 400], loop: false },
];

/**
 * poses outside any contract, drawn only when the recipe asks for them (anims):
 * a game sits a character down to cultivate, no game requires it of everyone
 */
export const FIGURE_EXTRA_ANIMS: FigureAnim[] = [
  { name: 'sit', poses: [SIT_IN, SIT], durations: [2000, 2000], loop: true },
  { name: 'lotus', poses: [LOTUS], durations: [1000], loop: true },
];

// ---------------------------------------------------------------- camera

interface Camera {
  ch: number; sh: number; ce: number; se: number;
  /** local → (screen x, screen y down, closeness toward the viewer) before the canvas offset */
  project(p: V3): V3;
  /** screen x, screen y, closeness → local */
  unproject(sx: number, sy: number, c: number): V3;
}

function camera(headingDeg: number, elevationDeg: number): Camera {
  const h = (headingDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  const ch = Math.cos(h), sh = Math.sin(h), ce = Math.cos(e), se = Math.sin(e);
  // World ground axes: S (screen right) and V (toward the viewer). Forward
  // F = ch·S + sh·V, right R = -sh·S + ch·V.
  return {
    ch, sh, ce, se,
    project([x, y, z]) {
      const ps = x * ch - z * sh;
      const pv = x * sh + z * ch;
      return [ps, -y * ce + pv * se, pv * ce + y * se];
    },
    unproject(sx, sy, c) {
      const pv = c * ce + sy * se;
      const y = c * se - sy * ce;
      return [sx * ch + pv * sh, y, -sx * sh + pv * ch];
    },
  };
}

// ---------------------------------------------------------------- raster

interface Hit { local: V3; t: number; n: V3 }
interface Prim {
  a: V3; b: V3; ra: number; rb: number;
  group: string;
  paint: (hit: Hit) => Tones | string;
  clip?: (local: V3) => boolean;
  /** draw flat (no shading): light orbs */
  flat?: boolean;
  /** part of the drawn head (skull, ears, hair, hat, beard): left out when a head_art replaces it */
  skull?: boolean;
}

interface Canvas {
  w: number; h: number;
  z: Float32Array;
  color: (string | null)[];
  group: (string | null)[];
}

const LIGHT: V3 = (() => {
  const v: V3 = [-0.55, -0.7, 0.55];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

function tone(spec: Tones | string, n: V3, flat?: boolean): string {
  if (typeof spec === 'string') return spec;
  if (flat) return spec[1];
  const lum = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  return lum > 0.3 ? spec[0] : lum > -0.2 ? spec[1] : spec[2];
}

function raster(cv: Canvas, cam: Camera, ox: number, oy: number, prim: Prim): void {
  const A = cam.project(prim.a), B = cam.project(prim.b);
  const ax = A[0] + ox, ay = A[1] + oy, bx = B[0] + ox, by = B[1] + oy;
  const r = Math.max(prim.ra, prim.rb);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(cv.w - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(cv.h - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      let t = len2 > 1e-9 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + dx * t, qy = ay + dy * t;
      const ex = cx - qx, ey = cy - qy;
      const d2 = ex * ex + ey * ey;
      const rr = prim.ra + (prim.rb - prim.ra) * t;
      if (d2 > rr * rr) continue;
      const bulge = Math.sqrt(rr * rr - d2);
      const close = A[2] + (B[2] - A[2]) * t + bulge;
      const i = py * cv.w + px;
      if (close <= cv.z[i]) continue;
      const local = cam.unproject(cx - ox, cy - oy, close);
      if (prim.clip && !prim.clip(local)) continue;
      const n: V3 = [ex / rr, ey / rr, bulge / rr];
      cv.z[i] = close;
      cv.color[i] = normalizeHex(tone(prim.paint({ local, t, n }), n, prim.flat));
      cv.group[i] = prim.group;
    }
  }
}

// ---------------------------------------------------------------- body

const tones = (t: ToneSpec): Tones => (typeof t === 'string' ? [t, t, t] : t);
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: V3, b: V3, t: number): V3 => add(a, scale(sub(b, a), t));
function rotY(v: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  // + turns the left side (z-) forward (x+)
  return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c];
}

interface Built { prims: Prim[]; eyes: V3[]; head: V3; headR: number; mouth?: V3 }

/** sizes of the parts, in px for a body of the pose table's height */
interface Proportions {
  hr: number; sw: number; torso: [number, number]; torsoOff: number; yoke: number;
  leg: number; arm: number; hand: number; shoe: [number, number, number]; neck: number;
  /** where the eyes sit on the skull: forward, up, apart (in head radii) */
  eye: V3;
  mouth: boolean;
}

const REAL: Proportions = {
  hr: 4.4, sw: 4.5, torso: [2.6, 3.3], torsoOff: 1.75, yoke: 2.0,
  leg: 2.05, arm: 1.6, hand: 1.3, shoe: [1.25, 1.05, 2.1], neck: 1.35,
  eye: [0.88, -0.02, 0.42], mouth: false,
};

function chibiProportions(heads: number): Proportions {
  // the head takes a third of a 40 px body at 3 heads; fewer heads, bigger head
  return {
    hr: (40 / heads) * 0.47, sw: 5.6, torso: [3.3, 3.9], torsoOff: 1.9, yoke: 2.6,
    leg: 2.45, arm: 2.0, hand: 1.8, shoe: [1.75, 1.5, 2.3], neck: 1.6,
    eye: [0.86, -0.2, 0.4], mouth: true,
  };
}

/** the pose table in the chosen proportions: joints hang from each other, so a lean or a fall keeps its shape */
function posed(rec: FigureRecipe, pose: Pose): { pose: Pose; k: number; pr: Proportions } {
  const spread = rec.build?.spread ?? 1;
  const out = (v: V3): V3 => [v[0], v[1], v[2] * spread];
  const pose0: Pose = spread === 1 ? pose : {
    ...pose, knees: [out(pose.knees[0]), out(pose.knees[1])], feet: [out(pose.feet[0]), out(pose.feet[1])],
  };
  const heads = rec.build?.heads;
  if (heads && heads <= 4.5) {
    const k = (rec.build?.height ?? 40) / 40;
    const pr = chibiProportions(heads);
    const legs = (v: V3): V3 => [v[0] * k * 1.25, v[1] * 0.9 * k, v[2] * k * 1.3];
    const rel = (v: V3, from: V3, to: V3, f: V3): V3 => [
      to[0] + (v[0] - from[0]) * f[0] * k, to[1] + (v[1] - from[1]) * f[1] * k, to[2] + (v[2] - from[2]) * f[2] * k,
    ];
    const P = legs(pose0.pelvis);
    const C = rel(pose0.chest, pose0.pelvis, P, [1.2, 1.12, 1.2]);
    // the neck is short and the head big: its centre rides high above the chest
    const up = (pr.hr + 3.4) / 5.4;
    const H = rel(pose0.head, pose0.chest, C, [1.5, up, 1.5]);
    const arm = (v: V3): V3 => rel(v, pose0.chest, C, [1.15, 0.95, 1.35]);
    return {
      k, pr,
      pose: {
        ...pose0, pelvis: P, chest: C, head: H,
        hands: [arm(pose0.hands[0]), arm(pose0.hands[1])], elbows: [arm(pose0.elbows[0]), arm(pose0.elbows[1])],
        knees: [legs(pose0.knees[0]), legs(pose0.knees[1])], feet: [legs(pose0.feet[0]), legs(pose0.feet[1])],
        orb: pose0.orb ? arm(pose0.orb) : undefined,
        orbRadius: pose0.orbRadius !== undefined ? pose0.orbRadius * 1.3 : undefined,
      },
    };
  }
  const k = (rec.build?.height ?? 28) / 30;
  // a little shorter in the leg and longer in the trunk than the pose table
  const ty = (y: number): number => (y <= 14 ? y * 0.9 : 12.6 + (y - 14) * 1.05);
  const s = (v: V3): V3 => [v[0] * k, ty(v[1]) * k, v[2] * k];
  // a fighter stands wide: knees and feet sit further out than the hips
  const wide = (v: V3): V3 => [v[0] * k * 1.15, ty(v[1]) * k, v[2] * k * 1.2];
  const flare = (v: V3): V3 => [v[0] * k, ty(v[1]) * k, v[2] * k * 1.2];
  return {
    k, pr: REAL,
    pose: {
      ...pose0,
      pelvis: s(pose0.pelvis), chest: s(pose0.chest), head: s(pose0.head),
      hands: [s(pose0.hands[0]), s(pose0.hands[1])], elbows: [flare(pose0.elbows[0]), flare(pose0.elbows[1])],
      knees: [wide(pose0.knees[0]), wide(pose0.knees[1])], feet: [wide(pose0.feet[0]), wide(pose0.feet[1])],
      orb: pose0.orb ? s(pose0.orb) : undefined,
    },
  };
}

function buildBody(rec: FigureRecipe, pose0: Pose): Built {
  const { pose, k, pr } = posed(rec, pose0);
  const g = rec.build?.girth ?? 1;
  const sw = pr.sw * (rec.build?.shoulders ?? 1) * k;
  const skin = tones(rec.skin), hair = tones(rec.hair.tones), top = tones(rec.top.tones);
  const pants = tones(rec.pants), shoes = tones(rec.shoes);
  const sash = rec.sash ? tones(rec.sash) : undefined;
  const skirt = rec.skirt ? tones(rec.skirt.tones) : undefined;
  const prims: Prim[] = [];
  const P = pose.pelvis, C = pose.chest, H = pose.head;
  const hr = pr.hr * (rec.build?.head ?? 1) * k;

  // spine frame: the torso leans from pelvis to chest
  const twist = pose.twist ?? 0;
  const shoulder = (side: number): V3 => add(add(C, [0, 1.3 * k, 0]), rotY([0, 0, side * sw], twist));
  const hip = (side: number): V3 => add(P, rotY([0, -0.6 * k, side * 2.2 * k], twist * 0.4));
  const waistY = P[1] + 1.6 * k;

  // legs
  for (const i of [0, 1]) {
    const side = i === 0 ? -1 : 1;
    const hp = hip(side), kn = pose.knees[i], ft = pose.feet[i];
    const legR = (rec.skirt ? pr.leg - 0.2 : pr.leg) * g * k;
    prims.push({ a: hp, b: kn, ra: legR + 0.2, rb: legR, group: `leg${i}`, paint: () => pants });
    prims.push({ a: kn, b: ft, ra: legR - 0.1, rb: legR - 0.35, group: `leg${i}`, paint: () => pants });
    const toe = add(ft, [pr.shoe[2] * k, -0.4 * k, side * 0.2]);
    prims.push({ a: add(ft, [-0.5 * k, -0.1, 0]), b: toe, ra: pr.shoe[0] * k, rb: pr.shoe[1] * k, group: `leg${i}`, paint: () => shoes });
  }

  // torso: two columns side by side so it is wider than deep
  const trim = rec.top.trim;
  const neckY = C[1] + 2.0 * k;
  const torsoPaint = (hit: Hit): Tones | string => {
    const [x, y, z] = hit.local;
    // waist sash
    if (sash && Math.abs(y - waistY) <= 0.9 * k) return sash;
    // a chibi's collar goes all round the neck, so it shows from behind too
    if (trim && pr.mouth && rec.top.collar !== false && y >= neckY + 0.3 * k) return trim;
    // crossed collar (left over right): a trim line from the right of the neck down to the left
    if (trim && rec.top.collar !== false && x > C[0] - 0.5) {
      const u = (neckY - y) / (neckY - waistY); // 0 at neck, 1 at waist
      if (u >= 0 && u <= 0.75) {
        const zc = rotY([0, 0, 1.6 * k - u * 5.0 * k], twist)[2];
        if (u <= 0.55 && Math.abs(z - zc) <= 0.9) return trim;
      }
    }
    return top;
  };
  for (const side of [-1, 1]) {
    const off = rotY([0, 0, side * pr.torsoOff * k * g], twist);
    const offLow = rotY([0, 0, side * (pr.torsoOff - 0.2) * k * g], twist * 0.4);
    prims.push({ a: add(add(P, [0, 0.4 * k, 0]), offLow), b: add(C, off), ra: pr.torso[0] * k * g, rb: pr.torso[1] * k * g, group: 'torso', paint: torsoPaint });
  }
  // shoulders yoke
  prims.push({ a: shoulder(-1), b: shoulder(1), ra: pr.yoke * k * g, rb: pr.yoke * k * g, group: 'torso', paint: torsoPaint });

  // robe below the waist: a panel over each thigh and one between them
  if (skirt) {
    const len = rec.skirt!.length ?? 0.55;
    const hemTrim = rec.skirt!.trim;
    for (const i of [0, 1]) {
      const side = i === 0 ? -1 : 1;
      const hp = add(hip(side), [0, 1.4 * k, 0]);
      const kn = pose.knees[i], ft = pose.feet[i];
      const legLen = 2; // hip→knee = 1, knee→foot = 1
      const along = len * legLen;
      const end = along <= 1 ? lerp(hip(side), kn, along) : lerp(kn, ft, along - 1);
      const hemPaint = (hit: Hit): Tones | string => (sash && Math.abs(hit.local[1] - waistY) <= 0.9 * k ? sash : hemTrim && hit.t > 0.86 ? hemTrim : skirt);
      prims.push({ a: hp, b: end, ra: 2.2 * k * g, rb: 3.1 * k * g, group: 'torso', paint: hemPaint });
    }
    const midHem = lerp(lerp(hip(-1), pose.knees[0], Math.min(1, len * 2)), lerp(hip(1), pose.knees[1], Math.min(1, len * 2)), 0.5);
    prims.push({
      a: add(P, [0, 1.2 * k, 0]), b: add(midHem, [0, 0.4 * k, 0]), ra: 2.6 * k * g, rb: 2.4 * k * g, group: 'torso',
      paint: (hit) => (sash && Math.abs(hit.local[1] - waistY) <= 0.9 * k ? sash : hemTrim && hit.t > 0.88 ? hemTrim : skirt),
    });
  }

  // apron: a panel in front of the torso and between the knees, its own part
  // so a line of ink sets it off from the clothes behind it
  if (rec.apron) {
    const ap = tones(rec.apron.tones);
    const apTrim = rec.apron.trim;
    const len = rec.apron.length ?? 0.6;
    const from = rec.apron.from ?? 0.7;
    const kneeMid = lerp(pose.knees[0], pose.knees[1], 0.5), footMid = lerp(pose.feet[0], pose.feet[1], 0.5);
    const hipMid = add(P, [0, -0.6 * k, 0]);
    const hem = len <= 0.5 ? lerp(hipMid, kneeMid, len * 2) : lerp(kneeMid, footMid, len * 2 - 1);
    const top = lerp(add(P, [0, 1.2 * k, 0]), C, from);
    const fwd = (v: V3, d: number): V3 => add(v, rotY([d, 0, 0], twist * 0.6));
    prims.push({
      a: fwd(top, 2.6 * k * g), b: fwd(hem, 3.0 * k * g), ra: 2.9 * k * g, rb: 3.4 * k * g, group: 'apron',
      paint: (hit) => (apTrim && hit.t > 0.86 ? apTrim : ap),
    });
  }

  // neck and head
  prims.push({ a: add(C, [0, 1.6 * k, 0]), b: sub(H, [0, hr * 0.6, 0]), ra: pr.neck * k, rb: (pr.neck - 0.05) * k, group: 'head', paint: () => skin });
  const skullFrom = prims.length;
  prims.push({ a: H, b: H, ra: hr, rb: hr, group: 'head', paint: () => skin });
  // ears
  for (const side of [-1, 1]) {
    const e = add(H, [-0.25 * hr, -0.18 * hr, side * 0.93 * hr]);
    prims.push({ a: e, b: e, ra: 0.42 * hr, rb: 0.42 * hr, group: 'head', paint: () => skin });
  }

  // hair
  const band = rec.hair.band;
  const crown = rec.hair.crown;
  const hairPaint = (hit: Hit): Tones | string => {
    if (crown && hit.local[1] - H[1] >= (pr.mouth ? 1.0 : 1.2) * hr) return crown;
    if (band) {
      const y = hit.local[1] - H[1];
      if (y >= 0.46 * hr && y <= 0.7 * hr) return band;
    }
    return hair;
  };
  const sphere = (c: V3, r: number, paint: Prim['paint'], group = 'hair', clip?: Prim['clip']) =>
    prims.push({ a: c, b: c, ra: r, rb: r, group, paint, clip });
  const style = rec.hair.style;
  if (!rec.hat || rec.hat.kind !== 'turban') {
    const capR = (style === 'short' ? 0.95 : 1.0) * hr;
    // a chibi's hair sits closer on the skull, so the face keeps half the head
    const lift = pr.mouth ? 0.24 : 0.42;
    sphere(add(H, [-lift * hr, lift * hr, 0]), capR * (pr.mouth ? 1.04 : 1), hairPaint, 'hair', (l) => l[1] > H[1] + (pr.mouth ? 0.36 : 0.3) * hr || l[0] < H[0] - 0.1 * hr);
    // fringe over the forehead
    for (const z of [-0.5, 0, 0.5]) {
      sphere(add(H, [(pr.mouth ? 0.62 : 0.5) * hr, (pr.mouth ? 0.58 : 0.74) * hr, z * hr]), 0.34 * hr, hairPaint);
    }
    // the hair falls down the nape
    const nape = style === 'long' || style === 'messy' || style === 'bob' ? -0.75 : -0.35;
    prims.push({ a: add(H, [-0.55 * hr, 0.1 * hr, 0]), b: add(H, [-0.7 * hr, nape * hr, 0]), ra: 0.72 * hr, rb: 0.6 * hr, group: 'hair', paint: () => hair });
  }
  if (style === 'topknot' || style === 'bun') {
    const top = add(H, [-0.25 * hr, 1.1 * hr, 0]);
    sphere(top, (style === 'bun' ? 0.55 : 0.42) * hr, (hit) => (rec.hair.ribbon && hit.local[1] < top[1] - 0.1 * hr ? rec.hair.ribbon : hair));
  }
  if (style === 'ponytail') {
    const root = add(H, [-0.8 * hr, 0.55 * hr, 0]);
    sphere(root, 0.42 * hr, () => rec.hair.ribbon ?? hair);
    prims.push({ a: root, b: add(H, [-1.55 * hr, -1.0 * hr, 0]), ra: 0.42 * hr, rb: 0.25 * hr, group: 'hair', paint: () => hair });
  }
  if (style === 'long') {
    prims.push({ a: add(H, [-0.6 * hr, 0.2 * hr, 0]), b: add(H, [-0.95 * hr, -1.45 * hr, 0]), ra: 0.68 * hr, rb: 0.45 * hr, group: 'hair', paint: () => hair });
  }
  if (style === 'messy') {
    for (const [x, y, z, r] of [[-0.2, 0.95, -0.45, 0.4], [-0.6, 0.85, 0.4, 0.42], [0.3, 0.85, 0.35, 0.38], [-0.9, 0.4, -0.5, 0.38], [0.75, 0.3, -0.75, 0.3]]) {
      sphere(add(H, [x * hr, y * hr, z * hr]), r * hr, () => hair);
    }
  }
  if (style === 'bob') {
    // straight hair down both sides to the jaw, framing the face
    for (const side of [-1, 1]) {
      prims.push({ a: add(H, [-0.15 * hr, 0.35 * hr, side * 0.62 * hr]), b: add(H, [0.05 * hr, -0.62 * hr, side * 0.66 * hr]), ra: 0.5 * hr, rb: 0.4 * hr, group: 'hair', paint: hairPaint });
    }
  }
  if (rec.hair.locks) {
    for (const side of [-1, 1]) {
      prims.push({ a: add(H, [0.15 * hr, 0.2 * hr, side * 0.85 * hr]), b: add(H, [0.1 * hr, -0.95 * hr, side * 0.85 * hr]), ra: 0.38 * hr, rb: 0.3 * hr, group: 'hair', paint: () => hair });
    }
  }
  if (rec.hat) {
    const ht = tones(rec.hat.tones);
    if (rec.hat.kind === 'turban') {
      const c = add(H, [-0.2 * hr, 0.72 * hr, 0]);
      sphere(c, 1.05 * hr, (hit) => {
        const y = hit.local[1] - c[1];
        return Math.abs(y - 0.0 * hr) < 0.16 * hr || Math.abs(y - 0.5 * hr) < 0.14 * hr ? [ht[1], ht[1], ht[2]] : ht;
      }, 'hair', (l) => l[1] > H[1] + 0.32 * hr || l[0] < H[0] - 0.2 * hr);
    } else {
      const c = add(H, [-0.1 * hr, 0.42 * hr, 0]);
      sphere(c, 1.07 * hr, () => ht, 'hair', (l) => l[1] > H[1] + 0.32 * hr);
      // the brim
      prims.push({ a: add(H, [-1.0 * hr, 0.32 * hr, 0]), b: add(H, [1.0 * hr, 0.32 * hr, 0]), ra: 0.3 * hr, rb: 0.3 * hr, group: 'hair', paint: () => ht });
    }
    if (rec.hat.jewel) {
      const j = add(H, [0.9 * hr, 0.72 * hr, 0]);
      sphere(j, 0.3 * hr, () => rec.hat!.jewel!);
    }
  }
  if (rec.beard) {
    const bt = tones(rec.beard.tones);
    if (rec.beard.kind === 'full') {
      prims.push({ a: add(H, [0.72 * hr, -0.6 * hr, 0]), b: add(H, [0.95 * hr, -1.3 * hr, 0]), ra: 0.5 * hr, rb: 0.32 * hr, group: 'beard', paint: () => bt });
      for (const side of [-1, 1]) {
        prims.push({ a: add(H, [0.25 * hr, -0.35 * hr, side * 0.78 * hr]), b: add(H, [0.7 * hr, -0.7 * hr, side * 0.42 * hr]), ra: 0.26 * hr, rb: 0.34 * hr, group: 'beard', paint: () => bt });
      }
    } else {
      for (const side of [-1, 1]) {
        const m = add(H, [0.92 * hr, -0.38 * hr, side * 0.28 * hr]);
        prims.push({ a: m, b: add(m, [0, -0.3 * hr, side * 0.25 * hr]), ra: 0.26 * hr, rb: 0.22 * hr, group: 'head', paint: () => bt });
      }
    }
  }

  for (let i = skullFrom; i < prims.length; i++) prims[i].skull = true;

  // arms
  const sleeves = rec.top.sleeves ?? 'long';
  for (const i of [0, 1]) {
    const side = i === 0 ? -1 : 1;
    const sh = shoulder(side), el = pose.elbows[i], hd = pose.hands[i];
    const wristAt = lerp(el, hd, 0.78);
    const armR = pr.arm * g * k;
    // a sleeve sits one tone darker than the chest it crosses, so the arm reads
    const sleeve: Tones = [top[1], top[1], top[2]];
    const upper = sleeves === 'none' ? skin : sleeve;
    prims.push({ a: sh, b: el, ra: armR + 0.15, rb: armR, group: `arm${i}`, paint: () => upper });
    if (sleeves === 'none') {
      prims.push({
        a: el, b: wristAt, ra: armR - 0.05, rb: armR - 0.2, group: `arm${i}`,
        paint: (hit) => (rec.wrist && hit.t > 0.62 ? rec.wrist : skin),
      });
    } else {
      const cuff = sleeves === 'wide' ? armR + 0.55 : armR;
      prims.push({ a: el, b: wristAt, ra: armR, rb: cuff, group: `arm${i}`, paint: (hit) => (trim && hit.t > 0.8 ? trim : sleeve) });
    }
    prims.push({ a: hd, b: hd, ra: pr.hand * k, rb: pr.hand * k, group: `arm${i}`, paint: () => skin });
  }

  // the light of the technique
  if ((pose.glow ?? 0) >= 2 && pose.orb && rec.glow) {
    const r = (pose.orbRadius ?? 1.6) * k;
    const core = rec.glow_core ?? rec.glow;
    prims.push({
      a: pose.orb, b: pose.orb, ra: r, rb: r, group: 'fx', flat: true,
      paint: (hit) => (hit.n[2] > 0.75 ? [core, core, core] : [rec.glow!, rec.glow!, rec.glow!]),
    });
  }

  // on the skull's surface, a little below its middle
  const eyes: V3[] = [-1, 1].map((side) => {
    const d: V3 = [pr.eye[0], pr.eye[1], side * pr.eye[2]];
    const n = Math.hypot(...d);
    return add(H, scale(d, (hr * 0.98) / n));
  });
  const mouth = pr.mouth ? add(H, scale([0.93, -0.5, 0.06], hr)) : undefined;
  return { prims, eyes, head: H, headR: hr, mouth };
}

// ---------------------------------------------------------------- frame

export interface FigureFrame { pixels: (string | null)[]; width: number; height: number }

export function drawFigure(rec: FigureRecipe, pose: Pose): FigureFrame {
  const view = rec.view ?? 'front';
  const w = rec.width ?? 48, h = rec.height ?? 48;
  const ground = rec.ground ?? h - 2;
  const heading = rec.heading ?? (view === 'front' ? 142 : -36);
  const cam = camera(heading, rec.elevation ?? 18);
  const ink = normalizeHex(rec.ink ?? '#15120f');
  const cv: Canvas = {
    w, h, z: new Float32Array(w * h).fill(-Infinity),
    color: Array(w * h).fill(null), group: Array(w * h).fill(null),
  };
  const built = buildBody(rec, pose);
  // the soles sit on the ground row, the body is centred
  const ox = w / 2;
  const oy = ground + 0.5;
  const art = rec.head_art?.[pose.shut ? (`${view}_shut` as const) : view] ?? rec.head_art?.[view];
  for (const prim of built.prims) if (!(art && prim.skull)) raster(cv, cam, ox, oy, prim);
  if (art) {
    // the drawn head sits on the head joint, a little in front of the neck and collar
    const p = cam.project(built.head);
    const [ax, ay] = art.anchor ?? [Math.floor((art.rows[0]?.length ?? 0) / 2), Math.floor(art.rows.length / 2)];
    const hx = Math.round(p[0] + ox) - ax, hy = Math.round(p[1] + oy) - ay;
    const close = p[2] + built.headR * 0.5;
    art.rows.forEach((row, y) => {
      [...row].forEach((g, x) => {
        if (g === '.' || g === ' ') return;
        const c = art.legend[g];
        if (!c) throw new Error(`head_art: glyph '${g}' is not in the legend`);
        const i = (hy + y) * w + (hx + x);
        if (hx + x < 0 || hy + y < 0 || hx + x >= w || hy + y >= h || close <= cv.z[i]) return;
        cv.z[i] = close;
        cv.color[i] = normalizeHex(c);
        cv.group[i] = 'face';
      });
    });
  }

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
  // a lone tone inside a part (its four neighbours of the same part agree on
  // another color) takes that color: shading without specks
  const out = cv.color.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (!cv.group[i] || cv.group[i] === 'fx' || cv.group[i] === 'face') continue;
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(x + dx, y + dy));
      if (around.some(j => j < 0 || cv.group[j] !== cv.group[i])) continue;
      const c = cv.color[around[0]];
      if (c !== cv.color[i] && around.every(j => cv.color[j] === c)) out[i] = c;
    }
  }

  // ink where a limb (or the head) passes in front of something else
  const soft = new Set(['hair', 'head', 'face']);
  const separate = (a: string | null, b: string | null) => !!a && !!b && a !== b && !(soft.has(a) && soft.has(b));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (!cv.group[i]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = at(x + dx, y + dy);
        if (j < 0 || !cv.group[j]) continue;
        if (separate(cv.group[i], cv.group[j]) && cv.z[i] - cv.z[j] > 0.9 && cv.group[i] !== 'fx' && cv.group[j] !== 'fx') {
          out[j] = ink;
        }
      }
    }
  }

  // eyes on the face side (front view only shows them)
  if (art) {
    // the drawn head brings its own eyes
  } else if (!pose.shut) {
    for (const e of built.eyes) {
      const p = cam.project(e);
      const ex = Math.floor(p[0] + ox), ey = Math.floor(p[1] + oy);
      const i = at(ex, ey);
      if (i < 0 || cv.group[i] !== 'head') continue;
      if (cv.z[i] - p[2] > Math.max(1.8, built.headR * 0.3)) continue;
      out[i] = normalizeHex(rec.eyes ?? ink);
      const below = at(ex, ey + 1);
      if (below >= 0 && cv.group[below] === 'head') out[below] = normalizeHex(rec.eyes ?? ink);
    }
  } else {
    for (const e of built.eyes) {
      const p = cam.project(e);
      const i = at(Math.floor(p[0] + ox), Math.floor(p[1] + oy) + 1);
      if (i >= 0 && cv.group[i] === 'head' && Math.abs(cv.z[i] - p[2]) <= 1.4) out[i] = ink;
    }
  }
  // a chibi's mouth: one pixel of the skin's shade, where the face shows
  if (built.mouth && !art) {
    const p = cam.project(built.mouth);
    const i = at(Math.floor(p[0] + ox), Math.floor(p[1] + oy));
    if (i >= 0 && cv.group[i] === 'head' && cv.z[i] - p[2] <= 1.8) out[i] = normalizeHex(tones(rec.skin)[2]);
  }

  // outline around the silhouette
  const filled = (x: number, y: number) => {
    const i = at(x, y);
    return i >= 0 && out[i] !== null;
  };
  const outlined = out.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled(x, y)) continue;
      if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) outlined[at(x, y)] = ink;
    }
  }

  // aura: a ring outside the outline
  if ((pose.glow ?? 0) >= 1 && rec.glow) {
    const glow = normalizeHex(rec.glow);
    const ringed = outlined.slice();
    const has = (x: number, y: number) => {
      const i = at(x, y);
      return i >= 0 && outlined[i] !== null;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (has(x, y)) continue;
        if (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)) ringed[at(x, y)] = glow;
      }
    }
    return { pixels: ringed, width: w, height: h };
  }
  return { pixels: outlined, width: w, height: h };
}

/**
 * The recipe with the project's map folded in, where the recipe is silent.
 * Exported so a caller can see what it inherited instead of guessing: a style
 * that works by magic is the thing the project file was written to end.
 */
export function proportioned(rec: FigureRecipe): FigureRecipe {
  if (!rec.proportions) return rec;
  const from = buildFrom(rec.proportions);
  if (from.heads === undefined || rec.build?.heads !== undefined) return rec;
  return { ...rec, build: { ...(rec.build ?? {}), heads: from.heads } };
}

/**
 * Every animation of the contract, as a new asset. The contract says which
 * names have to exist (the body one by default); the pose tables above say how
 * each one is posed. `anims` picks names by hand for one figure.
 */
export function figureAsset(rec0: FigureRecipe): SpriteAsset {
  const rec = proportioned(rec0);
  const w = rec.width ?? 48, h = rec.height ?? 48;
  const asset = createAsset({ id: rec.id, name: rec.name ?? rec.id, width: w, height: h, category: 'character', frames: 1 });
  let first = true;
  const names = rec.anims?.length ? rec.anims : contractAnims(rec.contract ?? BODY_CONTRACT);
  const wanted = names.map(name => {
    const found = [...FIGURE_ANIMS, ...FIGURE_EXTRA_ANIMS].find(a => a.name === name);
    if (!found) {
      throw new Error(`figure: no pose for '${name}' (it knows ${[...FIGURE_ANIMS, ...FIGURE_EXTRA_ANIMS].map(a => a.name).join(', ')})`);
    }
    return found;
  });
  for (const anim of wanted) {
    const indices: number[] = [];
    for (const pose0 of anim.poses) {
      const pose = rec.head_art && pose0 === FALLEN ? SLUMP : pose0;
      const fig = drawFigure(rec, pose);
      const frame = blankFrame(w, h);
      fig.pixels.forEach((c, i) => {
        if (c) frame[Math.floor(i / w)][i % w] = colorIndex(asset, c);
      });
      let index: number;
      if (first) { index = 0; first = false; } else { index = addFrame(asset); }
      setFrame(asset, index, frame);
      indices.push(index);
    }
    setAnimation(asset, { name: anim.name, frameIndices: indices, durations: anim.durations, loop: anim.loop });
  }
  return asset;
}
