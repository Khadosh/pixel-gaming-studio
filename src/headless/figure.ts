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

/**
 * Where the camera stands. front and back are the 3/4 views of a diagonal
 * battle; side looks at the figure in profile facing screen right (heading 0)
 * and side_left in profile facing left (heading 180): a real camera, so the
 * z-buffer decides which arm and which leg go in front, and the light stays
 * up and to the left in both.
 */
export const FIGURE_VIEWS = ['front', 'back', 'side', 'side_left'] as const;
export type FigureView = typeof FIGURE_VIEWS[number];
const DEFAULT_HEADING: Record<FigureView, number> = { front: 142, back: -36, side: 0, side_left: 180 };

/** the points a drawn part can hang from (left and right are the figure's own) */
export const FIGURE_JOINTS = [
  'head', 'spine_top', 'chest', 'pelvis',
  'shoulder_left', 'shoulder_right', 'elbow_left', 'elbow_right', 'hand_left', 'hand_right',
  'hip_left', 'hip_right', 'knee_left', 'knee_right', 'foot_left', 'foot_right',
] as const;
export type FigureJoint = typeof FIGURE_JOINTS[number];

export interface FigureRecipe {
  id: string;
  name?: string;
  view?: FigureView;
  /** canvas (default 48 × 48, a multiple of the 16 px grid) and the row the soles stand on (default height - 2) */
  width?: number;
  height?: number;
  ground?: number;
  /**
   * degrees the figure faces, 0 = screen right, 90 = toward the viewer;
   * default 142 (front), -36 (back), 0 (side), 180 (side_left). One number
   * for the recipe's view, or one per view: { front: 90, back: -90 } is a map
   * sprite seen square on.
   */
  heading?: number | Partial<Record<FigureView, number>>;
  /**
   * how the figure stands and walks: 'fighter' (default) keeps a fighter's
   * stance, lead foot forward, and walks in a shuffle that never swaps feet;
   * 'upright' stands square, arms hanging, and walks in a real cycle (left
   * foot forward, passing, right foot forward, passing) with the arms swinging
   * against the legs: what a map sprite needs, and what reads in profile.
   * attack, technique, hurt and die are the same in both.
   */
  stance?: 'fighter' | 'upright';
  /** camera tilt in degrees (default 18; 0 looks level, as a map sprite drawn in plain profile) */
  elevation?: number;
  /**
   * how much the arms of the walk drop on screen: the hand swinging toward
   * the camera drops this many units per unit it swings past where it hangs
   * standing (the elbow halfway); the other keeps its height. A camera that
   * looks along the swing, front or back, sees a forward/back arm as no move
   * at all; this is the sprite convention that makes it read, the near arm
   * long and the far one short. Set it per view (`views.front`); negative is
   * for a camera behind (the arm swinging back is the near one). Default 0.
   */
  arm_swing?: number;
  /**
   * moves the figure on the canvas in a view, in whole px [right, down]: a
   * profile with a sword sticking out behind sits a pixel forward of the
   * middle. side_left takes side's mirrored unless it has its own.
   */
  shift?: Partial<Record<FigureView, [number, number]>>;
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
    /** the size of the feet and shoes (default 1): a chibi's boots read at about 1.3 */
    feet?: number;
    /** the legs' thickness (default 1), on top of girth: thin legs under a robe leave air between them */
    legs?: number;
    /**
     * how deep the torso and the robe are front to back, against how wide
     * (default 1): a chibi in a padded robe reads in profile at about 1.5,
     * where the default body is a plank seen edge on
     */
    depth?: number;
    /**
     * an old back, in degrees (default 0): the chest leans forward about the
     * hips by this much and the shoulders and arms go with it, so a profile
     * reads bent (the head–hip axis tilts) while the head stays as big
     */
    stoop?: number;
    /** the neck bent forward on top of the stoop, in degrees (default 0): the nape inclines, the head goes ahead and down */
    neck?: number;
    /**
     * the legs' length against the default (1): 0.8 takes a fifth off from hip
     * to sole and lowers everything above, the soles stay on the ground
     */
    leg_length?: number;
  };
  /**
   * a walking stick in one hand (\`left\` or \`right\`, the character's): that
   * hand stops swinging and holds the stick planted where it hangs standing,
   * a little ahead; in the walk it plants at each contact and lifts \`lift\`
   * units (default 2.4, about 2 px at height 33) at each passing, so a part hung
   * from that hand plants and lifts with every step instead of riding the arm.
   * Idle and walk only: the other poses are their own.
   */
  cane?: {
    hand: 'left' | 'right'; lift?: number; ahead?: number;
    /**
     * where the cane hand holds the stick, from where the arm hangs, in pose
     * units [ahead, up, out] (default none): an old body holds it out in
     * front and a little to the side, so the stick stands clear of the robe
     */
    reach?: [number, number, number];
  };
  ink?: string;
  skin: ToneSpec;
  eyes?: string;
  /** the white of the eye the rig draws in profile, in front of the pupil (default white) */
  eye_white?: string;
  hair: { style: HairStyle; tones: ToneSpec; band?: string; ribbon?: string; locks?: boolean; /** a cloth over the crown */ crown?: string };
  hat?: { kind: 'cap' | 'turban'; tones: ToneSpec; jewel?: string };
  beard?: { kind: 'full' | 'mustache'; tones: ToneSpec };
  top: {
    tones: ToneSpec;
    /** rolled: the sleeve up to the elbow, rolled in a cuff, the forearm bare (a smith at work) */
    sleeves?: 'long' | 'none' | 'wide' | 'rolled'; trim?: string; collar?: boolean;
    /** the sleeves' own tones (default one step darker than the chest) */ sleeve?: ToneSpec;
    /** the sleeves come down over the hands: the hand is painted as the sleeve (an old robe) */
    cover_hands?: boolean;
  };
  /** a robe below the waist: length 0..1 of the way from hip to sole (default none) */
  skirt?: { tones: ToneSpec; length?: number; trim?: string; /** how much wider the hem opens (default 1) */ flare?: number };
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
   * eyes shut (hurt, die); front_blink / side_blink for a blink, the open face
   * with only the eyes shut (falls back to _shut). No outer outline: the
   * figure inks the silhouette.
   */
  head_art?: Partial<Record<FigureView | `${FigureView}_shut` | `${FigureView}_blink`, HeadArt>>;
  /**
   * drawn parts hung from a joint, each with its art per view: the sword on
   * the back, the gourd at the hip, the ribbon of the bun, the crossed robe on
   * the chest. A view the part does not list does not show it; side_left
   * falls back to side mirrored (`flip`). Their art may bring its own ink
   * outline: the figure never doubles a line the drawing already has.
   */
  attachments?: FigureAttachment[];
  /**
   * what changes in one view, over the rest of the recipe (top-level fields,
   * replaced whole): a drawing is free to show the sleeve blue in profile and
   * pale from the front, and the rig follows the drawing
   */
  views?: Partial<Record<FigureView, Partial<Omit<FigureRecipe, 'views' | 'view' | 'id'>>>>;
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
  /**
   * instead of an anchor: the canvas pixel where the rows' top-left corner
   * sits in the figure's standing frame (idle, first frame) of this view. A
   * part cut from a drawing of the figure at its size says where it was cut
   * from, and the engine works out the anchor from where the joint falls
   * there: the standing frame gives the drawing back, the other poses carry
   * the part with its joint.
   */
  at?: [number, number];
  /** draw the rows mirrored left to right (the anchor too): one profile serves both sides */
  flip?: boolean;
  /**
   * the art brings its own outline (cut from a finished drawing, ink and
   * all): the figure draws no line around it, so the drawing's edge, with the
   * pixels it chose to leave open, stays as it was drawn
   */
  outlined?: boolean;
}

export interface AttachmentArt extends Omit<HeadArt, 'legend'> {
  /** glyphs of this view; the attachment's legend fills what it does not say */
  legend?: Record<string, string>;
  /** behind the whole body (true) or in front of it (default) */
  behind?: boolean;
  /**
   * limbs of the rig this drawing stands in for, left out while it is shown
   * (a sleeve drawn in profile instead of the rig's arm)
   */
  replaces?: ('arm_left' | 'arm_right' | 'leg_left' | 'leg_right')[];
  /**
   * in front, how far toward the viewer from the joint, in px: then it is not
   * over everything but where that depth puts it (a robe drawn on the chest at
   * the torso's surface, which an arm swinging in front still covers)
   */
  depth?: number;
  /** this view's own sway, over the attachment's (`sway: null` keeps it still here) */
  sway?: FigureSway | null;
}

/**
 * A part's own small cycle, a step behind the body's: on the frames it is off,
 * the part sits `dx`, `dy` px away from where its joint puts it (a ribbon that
 * trails, a gourd that swings against the step, a scabbard that bobs). Two
 * drawings, the part as cut and the part moved: `period` frames per cycle (4,
 * the walk's two steps) with half of them each way, starting `phase` frames
 * late (1: the part answers the step after it lands). Only in `anims` (the walk
 * by default): standing still, the part stays as it was drawn. In side_left,
 * which looks from the other side, a sway it borrows from side or from the
 * attachment runs the other way in x.
 */
export interface FigureSway {
  dx?: number;
  dy?: number;
  period?: number;
  phase?: number;
  anims?: string[];
}

export interface FigureAttachment {
  /** a name, for errors and for telling parts apart */
  name?: string;
  joint: FigureJoint;
  /**
   * the animations it shows in (default all): a part drawn for standing and
   * walking hands the strike back to the rig
   */
  anims?: string[];
  legend?: Record<string, string>;
  /** its own cycle, a step behind the body's, in every view (a view's art may change it) */
  sway?: FigureSway;
  /**
   * the part goes on from the drawn head (a beard whose top is drawn in
   * head_art and hangs on over the chest): no ink between it and the head,
   * hair or face it covers, as there is none inside one drawing; against the
   * body it still gets its line
   */
  joined?: boolean;
  /** the art per view; null hides it in that view even where a fallback exists */
  views: Partial<Record<FigureView, AttachmentArt | null>>;
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
  /** shut for a blink: the drawn head's _blink, the rest of the face as open */
  blink?: boolean;
  /**
   * where the cane hand goes (\`cane\` in the recipe): [ahead, up] in pose units
   * from where it hangs standing; set per frame of idle and walk by \`caned\`
   */
  cane?: [number, number];
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

// ---- upright: a body standing square, and a walk that swaps feet

/** the same pose with left and right swapped: the other foot forward */
function mirrorPose(p: Pose): Pose {
  const m = (v: V3): V3 => [v[0], v[1], -v[2]];
  const sw = (pair: [V3, V3]): [V3, V3] => [m(pair[1]), m(pair[0])];
  return {
    ...p, pelvis: m(p.pelvis), chest: m(p.chest), head: m(p.head), twist: -(p.twist ?? 0),
    hands: sw(p.hands), elbows: sw(p.elbows), knees: sw(p.knees), feet: sw(p.feet),
    orb: p.orb ? m(p.orb) : undefined,
  };
}

// feet under the hips, the left a little ahead so a profile shows both legs;
// arms hanging out from the body so the sleeve breaks the outline; no twist
const UPRIGHT: Pose = {
  pelvis: [0, 14, 0], chest: [0, 20, 0], head: [0.6, 25.4, 0], twist: 0,
  elbows: [[0.2, 18.4, -6.7], [0.2, 18.4, 6.7]],
  hands: [[1.0, 15.5, -7.0], [1.0, 15.5, 7.0]],
  knees: [[1.1, 7.6, -3.0], [-0.5, 7.6, 3.0]],
  feet: [[1.4, 1.3, -3.0], [-1.0, 1.3, 3.0]],
};
const UPRIGHT_BREATH = shiftPose(UPRIGHT, { body: [0, -0.7, 0], arms: [0, -0.6, 0], legs: [0, -0.3, 0] });

// contact: the left heel lands ahead, the right toe pushes off behind; the
// right arm swings forward and the left back, the shoulders turn against the hips
const STRIDE: Pose = {
  pelvis: [0.4, 13.5, 0], chest: [0.6, 19.5, 0], head: [1.2, 24.9, 0], twist: -8,
  elbows: [[-1.4, 17.9, -6.7], [1.6, 17.9, 6.7]],
  hands: [[-2.4, 15.1, -6.9], [3.6, 15.5, 6.9]],
  knees: [[2.2, 7.4, -3.0], [-1.2, 7.2, 3.0]],
  feet: [[3.6, 1.3, -3.0], [-3.4, 1.9, 3.0]],
};
// passing: the left foot under the body, the right knee coming through high;
// the body at the top of its bob, the arms passing the sides
const PASSING: Pose = {
  pelvis: [0.3, 14.5, 0], chest: [0.5, 20.5, 0], head: [1.1, 25.9, 0], twist: -2,
  elbows: [[-0.6, 18.9, -6.7], [0.8, 18.9, 6.7]],
  hands: [[-0.2, 16.0, -7.0], [1.8, 16.1, 7.0]],
  knees: [[0.4, 8.2, -3.0], [1.8, 8.4, 3.0]],
  feet: [[0.0, 1.3, -3.0], [0.2, 3.4, 3.0]],
};

// the strike of a body standing square, measured against the reference sheet
// (chibi_cultivador, «Atacar»): the fighter's jab moves the fist along the
// camera's line, so from the front or the back it does not read at all. This
// one is a lunge that cuts: the right hand goes up and out behind the
// shoulder, then the lead foot steps far ahead, the hips drop, the chest leans
// in and the hand comes down and across to the middle, the left arm thrown
// back. Up, down and across are what a camera straight on can see.
const LUNGE_WINDUP: Pose = {
  pelvis: [-0.6, 13.6, 0], chest: [-0.8, 19.6, 0], head: [-0.2, 25.0, 0], twist: 25,
  elbows: [[1.6, 17.6, -6.4], [-1.8, 21.8, 7.2]],
  hands: [[3.6, 18.4, -3.8], [-2.4, 25.6, 6.0]],
  knees: [[1.8, 7.4, -3.0], [-1.0, 7.6, 3.0]],
  feet: [[2.4, 1.3, -3.0], [-1.8, 1.3, 3.0]],
};
const LUNGE: Pose = {
  pelvis: [2.0, 11.8, 0], chest: [3.8, 17.6, 0], head: [4.6, 23.0, 0], twist: -35,
  elbows: [[-1.4, 16.8, -6.6], [6.0, 17.8, 4.0]],
  hands: [[-3.6, 15.2, -6.8], [8.6, 15.4, 1.0]],
  knees: [[6.0, 6.8, -3.0], [-2.0, 6.0, 3.0]],
  feet: [[7.0, 1.3, -3.0], [-5.6, 1.3, 3.0]],
};
// hurt, standing: a flinch in place (the sheet's «Herir» keeps its feet), not
// the fighter's stagger back with the arms flung: the head ducks, the
// shoulders hunch, the left forearm comes up across the chest, the knees give
const FLINCH: Pose = {
  pelvis: [-0.5, 13.5, 0], chest: [-1.2, 19.2, 0], head: [-0.6, 24.2, 0], twist: 12,
  elbows: [[1.8, 17.2, -5.6], [-0.8, 17.6, 7.2]],
  hands: [[3.4, 20.2, -1.6], [-1.6, 14.4, 7.8]],
  knees: [[1.6, 7.0, -3.0], [-0.4, 7.2, 3.0]],
  feet: [[1.4, 1.3, -3.0], [-1.0, 1.3, 3.0]],
  shut: true,
};

// dying, standing: the sheet's «Morir» staggers and folds down to the
// ground, on its knees with the head down in front and the arms out on the
// ground, not lying flat; a drawn head, which can't turn, ends low and
// forward, and the fold is what reads
const PROSTRATE: Pose = {
  pelvis: [-3.4, 5.8, 0], chest: [-0.2, 8.8, 0], head: [2.4, 6.8, 0], twist: 0,
  elbows: [[2.8, 4.4, -5.2], [2.8, 4.4, 5.2]],
  hands: [[5.4, 1.6, -4.2], [5.4, 1.6, 4.2]],
  knees: [[0.4, 1.4, -2.9], [0.2, 1.4, 2.9]],
  feet: [[-5.2, 1.2, -2.8], [-5.4, 1.2, 3.0]],
  shut: true,
};

// kneeling, beaten and waiting to be helped up, on one knee: the right knee
// on the ground under its hip, its shin trailing back out of sight; the left
// leg bent ahead and opened out to its side, the knee at mid height and the
// foot planted under it; the body upright over the hips (under 15° off the
// vertical) and the head high (0.8 of standing and more); the left forearm
// rests across the raised knee, the right hangs by the thigh; the eyes open
// (it is not dying). A camera straight on can't see a knee that only comes
// forward: what reads "kneeling" from the front is the raised knee out to the
// side, one boot planted and the other side ending at the knee. What a game
// leaves on the ground of a ring until someone lifts it. Breathing lifts the
// chest a little, the knees stay.
const KNEELING: Pose = {
  pelvis: [-0.6, 8.6, 0], chest: [-0.2, 14.6, 0], head: [0.4, 20.0, 0], twist: 0,
  elbows: [[1.0, 11.6, -8.2], [-0.2, 12.0, 6.8]],
  hands: [[3.0, 9.2, -7.8], [0.4, 8.0, 7.0]],
  knees: [[2.8, 7.8, -8.0], [-0.4, 1.4, 1.6]],
  feet: [[3.2, 1.3, -7.6], [-4.8, 1.2, 2.0]],
};
const KNEELING_BREATH = shiftPose(KNEELING, { body: [0, 0.6, 0], arms: [0, 0.4, 0] }, { pelvis: KNEELING.pelvis });

export interface FigureAnim {
  name: string; poses: Pose[]; durations: number[]; loop: boolean;
  /**
   * drawn as this animation of the recipe's own stance, frame by frame, with
   * the eyes shut: the twin a game swaps in for a blink, same parts in the
   * same place, only the eyes change (poses and durations come from there)
   */
  shutOf?: string;
}

/** what stance 'upright' draws instead of the fighter's idle, walk, attack, hurt and die */
export const UPRIGHT_ANIMS: FigureAnim[] = [
  { name: 'idle', poses: [UPRIGHT, UPRIGHT_BREATH], durations: [420, 420], loop: true },
  { name: 'walk', poses: [STRIDE, PASSING, mirrorPose(STRIDE), mirrorPose(PASSING)], durations: [150, 150, 150, 150], loop: true },
  { name: 'attack', poses: [LUNGE_WINDUP, LUNGE, mix(LUNGE, UPRIGHT, 0.15), mix(LUNGE, UPRIGHT, 0.6)], durations: [110, 150, 140, 140], loop: false },
  { name: 'hurt', poses: [FLINCH, mix(FLINCH, UPRIGHT, 0.5, { shut: true })], durations: [140, 220], loop: false },
  { name: 'die', poses: [FLINCH, BUCKLE, KNEEL, PROSTRATE], durations: [140, 160, 220, 400], loop: false },
];

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
  { name: 'kneel', poses: [KNEELING, KNEELING_BREATH], durations: [900, 900], loop: true },
  // the eyes shut, frame for frame, over the idle and the walk: the game swaps
  // the twin in for an instant when its own clock says so, at the same frame
  { name: 'blink', poses: [], durations: [], loop: true, shutOf: 'idle' },
  { name: 'blink_walk', poses: [], durations: [], loop: true, shutOf: 'walk' },
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
  // exact at the right angles, so a profile and its mirror agree to the last bit
  const snap = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  const ch = snap(Math.cos(h)), sh = snap(Math.sin(h)), ce = snap(Math.cos(e)), se = snap(Math.sin(e));
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
  // seen end on (a yoke from the side, a foot from the front) the capsule is
  // a disc: its depth is the end nearer the camera, whichever end that is
  const endOn = len2 <= 1e-9 && B[2] > A[2] ? 1 : 0;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      let t = len2 > 1e-9 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : endOn;
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

interface Built { prims: Prim[]; eyes: V3[]; head: V3; headR: number; mouth?: V3; joints: Record<FigureJoint, V3> }

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

/**
 * The pose of an old body, in the pose table's units (before the proportions):
 * shorter legs (\`build.leg_length\`: the knees and feet closer to the ground,
 * everything above the hips lowered by what the legs lost) and a stoop
 * (\`build.stoop\`: the chest turned forward about the hips, the head turned
 * again about the chest by \`build.neck\`; the arms go with the shoulders).
 */
function aged(rec: FigureRecipe, p: Pose): Pose {
  const f = rec.build?.leg_length ?? 1;
  const stoop = rec.build?.stoop ?? 0, neck = rec.build?.neck ?? 0;
  if (f === 1 && !stoop && !neck) return p;
  const GROUND = 1.3;
  const drop = (1 - f) * (p.pelvis[1] - GROUND);
  const low = (v: V3): V3 => [v[0], GROUND + (v[1] - GROUND) * f, v[2]];
  const high = (v: V3): V3 => [v[0], v[1] - drop, v[2]];
  // turns v about o in the plane of the walk: up goes toward +x (ahead)
  const turn = (v: V3, o: V3, deg: number): V3 => {
    const a = (deg * Math.PI) / 180, dx = v[0] - o[0], dy = v[1] - o[1];
    return [o[0] + dx * Math.cos(a) + dy * Math.sin(a), o[1] - dx * Math.sin(a) + dy * Math.cos(a), v[2]];
  };
  const P = high(p.pelvis), C0 = high(p.chest), H0 = high(p.head);
  const C = turn(C0, P, stoop);
  const H = turn(turn(H0, P, stoop), C, neck);
  const move = sub(C, C0);
  const arm = (v: V3): V3 => add(high(v), move);
  return {
    ...p, pelvis: P, chest: C, head: H,
    hands: [arm(p.hands[0]), arm(p.hands[1])], elbows: [arm(p.elbows[0]), arm(p.elbows[1])],
    knees: [low(p.knees[0]), low(p.knees[1])], feet: [low(p.feet[0]), low(p.feet[1])],
    orb: p.orb ? arm(p.orb) : undefined,
  };
}

/**
 * The cane hand of a frame of idle or walk (\`cane\` in the recipe): standing
 * and breathing it keeps its place, holding the stick on the ground; walking
 * it plants a little ahead at each contact (frames 0 and 2) and lifts at each
 * passing (1 and 3), so the stick steps with the feet.
 */
function caned(rec: FigureRecipe, pose: Pose, anim: string | undefined, frame: number): Pose {
  if (!rec.cane || pose.cane) return pose;
  if (anim === 'idle') return { ...pose, cane: [0, 0] };
  if (anim !== 'walk') return pose;
  const ahead = rec.cane.ahead ?? 1.6;
  return { ...pose, cane: frame % 2 === 0 ? [ahead, 0] : [ahead * 0.4, rec.cane.lift ?? 2.4] };
}

function buildBody(rec: FigureRecipe, pose00: Pose): Built {
  const pose0 = aged(rec, pose00);
  const { pose, k, pr } = posed(rec, pose0);
  if (rec.cane && pose00.cane) {
    // the cane hand where it holds the stick standing, moved by the step only:
    // not by the body's bob nor the arm's swing, so the tip meets the ground
    const i = rec.cane.hand === 'left' ? 0 : 1;
    const rest = posed(rec, aged(rec, standingPose(rec))).pose;
    const [dx, dy] = pose00.cane;
    const [rx, ry, rz] = rec.cane.reach ?? [0, 0, 0];
    // the character's left is -z, its right +z: out is away from the body
    const d: V3 = [(dx + rx) * k, (dy + ry) * k, (i === 0 ? -rz : rz) * k];
    const hands: [V3, V3] = [...pose.hands] as [V3, V3];
    const elbows: [V3, V3] = [...pose.elbows] as [V3, V3];
    hands[i] = add(rest.hands[i], d);
    // the elbow halfway between where it hangs and where the shoulder took it
    elbows[i] = add(lerp(rest.elbows[i], add(rest.elbows[i], sub(pose.chest, rest.chest)), 0.5), scale(d, 0.6));
    pose.hands = hands;
    pose.elbows = elbows;
  }
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
    const lt = rec.build?.legs ?? 1;
    const legR = (rec.skirt ? pr.leg - 0.2 : pr.leg) * g * k * lt;
    prims.push({ a: hp, b: kn, ra: legR + 0.2 * lt, rb: legR, group: `leg${i}`, paint: () => pants });
    prims.push({ a: kn, b: ft, ra: legR - 0.1 * lt, rb: legR - 0.35 * lt, group: `leg${i}`, paint: () => pants });
    const toe = add(ft, [pr.shoe[2] * k, -0.4 * k, side * 0.2]);
    const fs = rec.build?.feet ?? 1;
    prims.push({ a: add(ft, [-0.5 * k, -0.1, 0]), b: toe, ra: pr.shoe[0] * k * fs, rb: pr.shoe[1] * k * fs, group: `leg${i}`, paint: () => shoes });
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
  // a deeper body is the same columns twice, one ahead of the other
  const depth = rec.build?.depth ?? 1;
  const deep = (prim: Prim, r: number, turn: number) => {
    if (depth === 1) { prims.push(prim); return; }
    for (const d of [-1, 1]) {
      const o = rotY([d * (depth - 1) * r, 0, 0], turn);
      prims.push({ ...prim, a: add(prim.a, o), b: add(prim.b, o) });
    }
  };
  for (const side of [-1, 1]) {
    const off = rotY([0, 0, side * pr.torsoOff * k * g], twist);
    const offLow = rotY([0, 0, side * (pr.torsoOff - 0.2) * k * g], twist * 0.4);
    deep({ a: add(add(P, [0, 0.4 * k, 0]), offLow), b: add(C, off), ra: pr.torso[0] * k * g, rb: pr.torso[1] * k * g, group: 'torso', paint: torsoPaint }, pr.torso[1] * k * g, twist * 0.7);
  }
  // shoulders yoke; standing upright its ends tuck inside the sleeves, so the
  // shoulders slope from the neck and a profile shows the near sleeve whole
  const yokeR = pr.yoke * k * g;
  const tuck = rec.stance === 'upright' ? Math.min(1, (yokeR * 0.6) / Math.max(sw, 1e-6)) : 0;
  prims.push({ a: lerp(shoulder(-1), C, tuck), b: lerp(shoulder(1), C, tuck), ra: yokeR, rb: yokeR, group: 'torso', paint: torsoPaint });

  // robe below the waist: a panel over each thigh and one between them
  if (skirt) {
    const len = rec.skirt!.length ?? 0.55;
    const hemTrim = rec.skirt!.trim;
    const flare = rec.skirt!.flare ?? 1;
    for (const i of [0, 1]) {
      const side = i === 0 ? -1 : 1;
      const hp = add(hip(side), [0, 1.4 * k, 0]);
      const kn = pose.knees[i], ft = pose.feet[i];
      const legLen = 2; // hip→knee = 1, knee→foot = 1
      const along = len * legLen;
      const end = along <= 1 ? lerp(hip(side), kn, along) : lerp(kn, ft, along - 1);
      const hemPaint = (hit: Hit): Tones | string => (sash && Math.abs(hit.local[1] - waistY) <= 0.9 * k ? sash : hemTrim && hit.t > 0.86 ? hemTrim : skirt);
      deep({ a: hp, b: end, ra: 2.2 * k * g, rb: 3.1 * k * g * flare, group: 'torso', paint: hemPaint }, 2.6 * k * g, twist * 0.4);
    }
    const midHem = lerp(lerp(hip(-1), pose.knees[0], Math.min(1, len * 2)), lerp(hip(1), pose.knees[1], Math.min(1, len * 2)), 0.5);
    deep({
      a: add(P, [0, 1.2 * k, 0]), b: add(midHem, [0, 0.4 * k, 0]), ra: 2.6 * k * g, rb: 2.4 * k * g * flare, group: 'torso',
      paint: (hit) => (sash && Math.abs(hit.local[1] - waistY) <= 0.9 * k ? sash : hemTrim && hit.t > 0.88 ? hemTrim : skirt),
    }, 2.6 * k * g, twist * 0.4);
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
    // on the crown toward the back: in profile it sits behind the middle of the head
    const top = add(H, [-0.45 * hr, 1.02 * hr, 0]);
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
    const sleeve: Tones = rec.top.sleeve ? tones(rec.top.sleeve) : [top[1], top[1], top[2]];
    const upper = sleeves === 'none' ? skin : sleeve;
    prims.push({ a: sh, b: el, ra: armR + 0.15, rb: armR, group: `arm${i}`, paint: () => upper });
    if (sleeves === 'none' || sleeves === 'rolled') {
      prims.push({
        a: el, b: wristAt, ra: armR - 0.05, rb: armR - 0.2, group: `arm${i}`,
        paint: (hit) => (sleeves === 'rolled' && hit.t < 0.22 ? sleeve : rec.wrist && hit.t > 0.62 ? rec.wrist : skin),
      });
    } else {
      const cuff = sleeves === 'wide' ? armR + 0.55 : armR;
      prims.push({ a: el, b: wristAt, ra: armR, rb: cuff, group: `arm${i}`, paint: (hit) => (trim && hit.t > 0.8 ? trim : sleeve) });
    }
    prims.push({ a: hd, b: hd, ra: pr.hand * k, rb: pr.hand * k, group: `arm${i}`, paint: () => (rec.top.cover_hands ? sleeve : skin) });
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
  const joints: Record<FigureJoint, V3> = {
    head: H, spine_top: add(C, [0, 1.3 * k, 0]), chest: C, pelvis: P,
    shoulder_left: shoulder(-1), shoulder_right: shoulder(1),
    elbow_left: pose.elbows[0], elbow_right: pose.elbows[1],
    hand_left: pose.hands[0], hand_right: pose.hands[1],
    hip_left: hip(-1), hip_right: hip(1),
    knee_left: pose.knees[0], knee_right: pose.knees[1],
    foot_left: pose.feet[0], foot_right: pose.feet[1],
  };
  return { prims, eyes, head: H, headR: hr, mouth, joints };
}

// ---------------------------------------------------------------- frame

export interface FigureFrame { pixels: (string | null)[]; width: number; height: number }

/** the heading a recipe asks for in a view */
export function headingOf(rec: FigureRecipe, view: FigureView): number {
  const h = rec.heading;
  if (typeof h === 'number') return h;
  return h?.[view] ?? (view === 'side_left' && h?.side !== undefined ? 180 - h.side : DEFAULT_HEADING[view]);
}

/** how far a view moves the figure on the canvas */
function shiftOf(rec: FigureRecipe, view: FigureView): [number, number] {
  const own = rec.shift?.[view];
  if (own) return own;
  const side = view === 'side_left' ? rec.shift?.side : undefined;
  return side ? [-side[0], side[1]] : [0, 0];
}

/** the art mirrored; a crop position (at) mirrors across the canvas */
function flipped<T extends HeadArt | AttachmentArt>(a: T, w: number): T {
  const wArt = Math.max(0, ...a.rows.map(r => [...r].length));
  return { ...a, flip: !a.flip, ...(a.at ? { at: [w - a.at[0] - wArt, a.at[1]] as [number, number] } : {}) };
}

/** the drawn head of a view: its own, or the side one mirrored for side_left */
function headArtFor(rec: FigureRecipe, view: FigureView, shut: boolean, w: number, blink = false): HeadArt | undefined {
  const ha = rec.head_art;
  if (!ha) return undefined;
  const pick = (v: FigureView) => (blink ? ha[`${v}_blink`] : undefined) ?? (shut ? ha[`${v}_shut`] : undefined) ?? ha[v];
  const own = pick(view);
  if (own || view !== 'side_left') return own;
  const side = pick('side');
  return side ? flipped(side, w) : undefined;
}

/** left for right: what the mirror of a part hangs from */
const otherSide = <T extends string>(name: T): T =>
  name.replace(/_left$|_right$/, (m) => (m === '_left' ? '_right' : '_left')) as T;

/**
 * an attachment's art in a view, with its legend merged, and the joint it
 * hangs from there. side_left falls back to side mirrored: the mirror of a
 * part on the right hangs from the left, and stands in for the left limb.
 */
function attachmentArtFor(att: FigureAttachment, view: FigureView, w: number):
  { art: AttachmentArt & { legend: Record<string, string> }; joint: FigureJoint } | undefined {
  let art = att.views[view];
  let joint = att.joint;
  if (art === null) return undefined;
  if (!art && view === 'side_left' && att.views.side) {
    art = flipped(att.views.side, w);
    if (art.replaces) art = { ...art, replaces: art.replaces.map(otherSide) };
    joint = otherSide(joint);
  }
  if (!art) return undefined;
  return { art: { ...art, legend: { ...(att.legend ?? {}), ...(art.legend ?? {}) } }, joint };
}

/**
 * How far a part's sway moves it in a frame of an animation: [0, 0] on the
 * frames it sits as cut, and outside the animations it sways in.
 */
export function swayOffset(att: FigureAttachment, view: FigureView, anim: string | undefined, frame: number): [number, number] {
  const own = att.views[view]?.sway;
  const sw = own !== undefined ? own : att.sway;
  if (!sw || anim === undefined || !(sw.anims ?? ['walk']).includes(anim)) return [0, 0];
  const period = Math.max(2, Math.round(sw.period ?? 4));
  const k = ((frame - (sw.phase ?? 1)) % period + period) % period;
  if (k < period / 2) return [0, 0];
  const mirrored = view === 'side_left' && own === undefined;
  return [(sw.dx ?? 0) * (mirrored ? -1 : 1), sw.dy ?? 0];
}

type Placed = { rows: string[]; legend: Record<string, string>; anchor?: [number, number]; at?: [number, number]; flip?: boolean; outlined?: boolean };

/**
 * Paste rows of glyphs with their anchor pixel on a screen point, at one
 * depth. The anchor pixel's centre sits half a pixel right of the point (and
 * half a pixel left when flipped), so a flipped part lands where the mirror of
 * the unflipped one would. `standing` is where the joint falls in the
 * standing frame, for an art placed by `at`.
 */
function pasteArt(
  cv: Canvas, art: Placed, sx: number, sy: number, standing: () => [number, number],
  close: number, group: string, what: string, inked: Uint8Array, lined: Uint8Array, ink: string,
): void {
  const wArt = Math.max(0, ...art.rows.map(r => [...r].length));
  const shift = art.flip ? 1 : 0;
  let ax: number, ay: number;
  if (art.at) {
    const [x0, y0] = standing();
    ax = Math.round(x0) - shift - art.at[0];
    ay = Math.round(y0) - art.at[1];
  } else {
    const [a0, a1] = art.anchor ?? [Math.floor([...(art.rows[0] ?? '')].length / 2), Math.floor(art.rows.length / 2)];
    ax = art.flip ? wArt - 1 - a0 : a0;
    ay = a1;
  }
  const hx = Math.round(sx) - shift - ax, hy = Math.round(sy) - ay;
  art.rows.forEach((row, y) => {
    [...row].forEach((g, x0) => {
      if (g === '.' || g === ' ') return;
      const c = art.legend[g];
      if (!c) throw new Error(`${what}: glyph '${g}' is not in the legend`);
      const x = art.flip ? wArt - 1 - x0 : x0;
      if (hx + x < 0 || hy + y < 0 || hx + x >= cv.w || hy + y >= cv.h) return;
      const i = (hy + y) * cv.w + (hx + x);
      if (close <= cv.z[i]) return;
      cv.z[i] = close;
      cv.color[i] = normalizeHex(c);
      cv.group[i] = group;
      inked[i] = cv.color[i] === ink ? 1 : 0;
      lined[i] = art.outlined ? 1 : 0;
    });
  });
}

/** the pose a figure stands in: its idle's first frame */
function standingPose(rec: FigureRecipe): Pose {
  return rec.stance === 'upright' ? UPRIGHT : STANCE;
}

/**
 * The walk's arms swung up and down on screen (`arm_swing`): the hand ahead
 * lower, the hand behind higher, measured from where it hangs standing.
 */
function swung(rec: FigureRecipe, pose: Pose, anim?: string): Pose {
  const k = rec.arm_swing ?? 0;
  if (!k || anim !== 'walk') return pose;
  const rest = standingPose(rec);
  // Only the arm on the camera's near side moves on screen: seen along the
  // swing, a hand raised on the far side slips inside its own cuff and is lost,
  // so that one keeps its height and reads short by contrast.
  const drop = (v: V3, from: V3, f: number): V3 => {
    const reach = (v[0] - from[0]) * Math.sign(k);
    return [v[0], v[1] - Math.abs(k) * f * Math.max(reach, 0), v[2]];
  };
  return {
    ...pose,
    hands: [drop(pose.hands[0], rest.hands[0], 1), drop(pose.hands[1], rest.hands[1], 1)],
    elbows: [drop(pose.elbows[0], rest.elbows[0], 0.5), drop(pose.elbows[1], rest.elbows[1], 0.5)],
  };
}

/** the recipe as one view sees it: its per-view fields over the rest */
function inView(rec: FigureRecipe, view: FigureView): FigureRecipe {
  const own = rec.views?.[view] ?? (view === 'side_left' ? rec.views?.side : undefined);
  return own ? { ...rec, ...own, view } : rec;
}

const LIMB_GROUP: Record<NonNullable<AttachmentArt['replaces']>[number], string> = {
  arm_left: 'arm0', arm_right: 'arm1', leg_left: 'leg0', leg_right: 'leg1',
};

/**
 * `anim` is the animation the pose belongs to, for parts that show only in
 * some; `frame` its index there, for the parts' own sway
 */
export function drawFigure(rec0: FigureRecipe, pose: Pose, anim?: string, frame = 0): FigureFrame {
  const view = rec0.view ?? 'front';
  const rec = inView(rec0, view);
  if (!FIGURE_VIEWS.includes(view)) throw new Error(`figure: unknown view '${view}' (it knows ${FIGURE_VIEWS.join(', ')})`);
  const w = rec.width ?? 48, h = rec.height ?? 48;
  const ground = rec.ground ?? h - 2;
  const cam = camera(headingOf(rec, view), rec.elevation ?? 18);
  const ink = normalizeHex(rec.ink ?? '#15120f');
  const cv: Canvas = {
    w, h, z: new Float32Array(w * h).fill(-Infinity),
    color: Array(w * h).fill(null), group: Array(w * h).fill(null),
  };
  const built = buildBody(rec, caned(rec, swung(rec, pose, anim), anim, frame));
  // the soles sit on the ground row, the body is centred
  const [sx, sy] = shiftOf(rec, view);
  const ox = w / 2 + sx;
  const oy = ground + 0.5 + sy;
  // which pixels come from a drawing (they keep their pixels: no smoothing,
  // and their own ink is the line, so the figure does not add another)
  const drawn = new Uint8Array(w * h);
  const inked = new Uint8Array(w * h);
  const lined = new Uint8Array(w * h);
  const art = headArtFor(rec, view, !!pose.shut, w, !!pose.blink);
  let stand: Built | undefined;
  const standingAt = (joint: FigureJoint) => (): [number, number] => {
    stand ??= buildBody(rec, caned(rec, standingPose(rec), 'idle', 0));
    const p = cam.project(stand.joints[joint]);
    return [p[0] + ox, p[1] + oy];
  };
  // the drawn parts of this view and animation, and the limbs they stand in for
  const parts = (rec.attachments ?? []).map((att, n) => ({ att, n, found: attachmentArtFor(att, view, w) }))
    .filter(x => x.found && (!x.att.anims || anim === undefined || x.att.anims.includes(anim)));
  const replaced = new Set(parts.flatMap(x => (x.found!.art.replaces ?? []).map(l => LIMB_GROUP[l])));
  for (const prim of built.prims) if (!(art && prim.skull) && !replaced.has(prim.group)) raster(cv, cam, ox, oy, prim);
  if (art) {
    // the drawn head sits on the head joint, a little in front of the neck and collar
    const p = cam.project(built.head);
    pasteArt(cv, art, p[0] + ox, p[1] + oy, standingAt('head'), p[2] + built.headR * 0.5, 'face', 'head_art', inked, lined, ink);
  }
  parts.forEach(({ att, n, found }) => {
    const { art: a, joint } = found!;
    const j = built.joints[joint];
    if (!j) throw new Error(`figure: attachment ${att.name ?? n} hangs from '${joint}', which is not a joint (${FIGURE_JOINTS.join(', ')})`);
    const p = cam.project(j);
    const close = a.behind ? -1e6 + n : a.depth !== undefined ? p[2] + a.depth : 1e6 + n;
    // the sway moves the part whole, after it found its place: standing, it is the drawing
    const [dx, dy] = swayOffset(att, view, anim, frame);
    pasteArt(cv, a, p[0] + ox + dx, p[1] + oy + dy, standingAt(joint), close, `att${n}`, `attachment ${att.name ?? n}`, inked, lined, ink);
  });
  for (let i = 0; i < w * h; i++) if (cv.group[i] === 'face' || cv.group[i]?.startsWith('att')) drawn[i] = 1;

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
  // a lone tone inside a part (its four neighbours of the same part agree on
  // another color) takes that color: shading without specks
  const out = cv.color.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (!cv.group[i] || cv.group[i] === 'fx' || drawn[i]) continue;
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(x + dx, y + dy));
      if (around.some(j => j < 0 || cv.group[j] !== cv.group[i])) continue;
      const c = cv.color[around[0]];
      if (c !== cv.color[i] && around.every(j => cv.color[j] === c)) out[i] = c;
    }
  }

  // ink where a limb (or the head) passes in front of something else
  const soft = new Set(['hair', 'head', 'face']);
  // a joined part reads as more of the head: no seam with it
  const joined = new Set(parts.filter(({ att }) => att.joined).map(({ n }) => `att${n}`));
  const headish = (g: string) => soft.has(g) || joined.has(g);
  const separate = (a: string | null, b: string | null) =>
    !!a && !!b && a !== b && !(headish(a) && headish(b));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (!cv.group[i]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = at(x + dx, y + dy);
        if (j < 0 || !cv.group[j]) continue;
        // a drawing's own ink already is the line between it and what is behind
        if (inked[i]) continue;
        if (separate(cv.group[i], cv.group[j]) && cv.z[i] - cv.z[j] > 0.9 && cv.group[i] !== 'fx' && cv.group[j] !== 'fx') {
          out[j] = ink;
        }
      }
    }
  }

  // eyes on the face side (front view only shows them)
  const profile = !art && profileFace(rec, cam, built, ox, oy, cv, out, !!pose.shut);
  if (art || profile) {
    // the drawn head brings its own eyes; a profile drew its own just now
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
  if (built.mouth && !art && !profile) {
    const p = cam.project(built.mouth);
    const i = at(Math.floor(p[0] + ox), Math.floor(p[1] + oy));
    if (i >= 0 && cv.group[i] === 'head' && cv.z[i] - p[2] <= 1.8) out[i] = normalizeHex(tones(rec.skin)[2]);
  }

  // outline around the silhouette
  const filled = (x: number, y: number) => {
    const i = at(x, y);
    return i >= 0 && out[i] !== null;
  };
  // (a drawing that brings its own outline is its own edge: the figure inks
  // only what touches the rig or a drawing without one)
  const bare = (x: number, y: number) => {
    const i = at(x, y);
    return i >= 0 && out[i] !== null && !lined[i];
  };
  const outlined = out.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled(x, y)) continue;
      if (bare(x + 1, y) || bare(x - 1, y) || bare(x, y + 1) || bare(x, y - 1)) outlined[at(x, y)] = ink;
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
 * The rig's own face seen in profile (no head_art): left alone, the near eye
 * lands on the last column of skin and melts into the outline, and the edge
 * of the face is a plain curve. Here the front of the face is face (a fringe
 * that reached the eye row is pushed back), the eye sits one pixel in from the
 * edge with one pixel of white in front of it, and the nose is one pixel of
 * skin out past the edge, which the outline then wraps. Returns whether it
 * drew (the camera sees the face side on).
 */
function profileFace(
  rec: FigureRecipe, cam: Camera, built: Built, ox: number, oy: number, cv: Canvas, out: (string | null)[], shut: boolean,
): boolean {
  const hr = built.headR;
  const c = cam.project(built.head), f = cam.project(add(built.head, [hr, 0, 0]));
  const dir = Math.sign(f[0] - c[0]);
  // only side on (within about 25 degrees): the 3/4 views keep their two eyes
  if (!dir || Math.abs(f[0] - c[0]) < 0.9 * hr) return false;
  const near = built.eyes.map(e => cam.project(e)).sort((a, b) => b[2] - a[2])[0];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cv.w || y >= cv.h ? -1 : y * cv.w + x);
  const isHead = (i: number) => i >= 0 && (cv.group[i] === 'head' || cv.group[i] === 'hair') && out[i] !== null;
  /** the face's last pixel on a row, walking out from the middle of the head */
  const edgeOn = (y: number) => {
    let x = Math.round(c[0] + ox);
    if (!isHead(at(x, y))) return undefined;
    while (isHead(at(x + dir, y))) x += dir;
    return x;
  };
  const ey = Math.floor(near[1] + oy);
  const edge = edgeOn(ey);
  if (edge === undefined) return false;
  const skin = tones(rec.skin), eye = normalizeHex(rec.eyes ?? rec.ink ?? '#15120f');
  // the front of the face is face: a fringe over the eye rows goes back
  for (const y of [ey, ey + 1]) {
    for (let k = 0; k <= 2; k++) {
      const i = at(edge - k * dir, y);
      if (i >= 0 && cv.group[i] === 'hair') out[i] = normalizeHex(skin[0]);
    }
  }
  if (shut) {
    // a closed eye is a short line where the open one sits
    for (const k of [1, 2]) { const i = at(edge - k * dir, ey + 1); if (i >= 0) out[i] = eye; }
  } else {
    // the lower half of the eye only where the face still reaches past it:
    // on a small head the contour has already turned there, and it would melt
    const lower = edgeOn(ey + 1);
    for (const y of lower !== undefined && (lower - edge) * dir >= 0 ? [ey, ey + 1] : [ey]) {
      const i = at(edge - dir, y);
      if (i >= 0) out[i] = eye;
    }
    const w = at(edge, ey);
    if (w >= 0) out[w] = normalizeHex(rec.eye_white ?? '#ffffff');
  }
  // the nose: one pixel out past the eye's edge, between the eye and the
  // chin, joined to the cheek; on a small head whose face already curves back
  // two rows down, it goes one row under the eye instead of on the chin
  const low = Math.max(Math.floor(cam.project(add(built.head, scale([0.95, -0.4, 0], hr)))[1] + oy), ey + 2);
  for (const y of [low, ey + 1]) {
    const from = edgeOn(y);
    if (from === undefined || (edge - from) * dir > 1) continue;
    for (let x = from + dir; (x - (edge + dir)) * dir <= 0; x += dir) {
      const i = at(x, y);
      if (i >= 0 && out[i] === null) { out[i] = normalizeHex(skin[1]); cv.group[i] = 'head'; }
    }
    break;
  }
  return true;
}

/** the animations a recipe can draw, by name: its stance's idle and walk first */
function knownAnims(rec: FigureRecipe): FigureAnim[] {
  const own = [...(rec.stance === 'upright' ? UPRIGHT_ANIMS : []), ...FIGURE_ANIMS];
  return [...own, ...FIGURE_EXTRA_ANIMS.map((a) => {
    if (!a.shutOf) return a;
    const of = own.find(x => x.name === a.shutOf)!;
    return { ...a, poses: of.poses.map(p => ({ ...p, shut: true, blink: true })), durations: of.durations };
  })];
}

/** the animation a frame is drawn as: a blink is the idle (or the walk) with the eyes shut */
function drawnAs(anim: string): string {
  return FIGURE_EXTRA_ANIMS.find(a => a.name === anim)?.shutOf ?? anim;
}

/**
 * Where each joint falls on the canvas (x, y in px, fractional) in a frame of
 * an animation, in the recipe's view: what a drawn part hangs from, so a
 * caller can tell where to cut it or check that it followed.
 */
export function figureJoints(rec0: FigureRecipe, anim = 'idle', frame = 0): Record<FigureJoint, [number, number]> {
  const rec = proportioned(rec0);
  const a = knownAnims(rec).find(x => x.name === anim);
  if (!a) throw new Error(`figure: no pose for '${anim}'`);
  const pose0 = a.poses[Math.min(frame, a.poses.length - 1)];
  const pose = rec.head_art && pose0 === FALLEN ? SLUMP : pose0;
  const view = rec.view ?? 'front';
  const w = rec.width ?? 48, h = rec.height ?? 48;
  const recV = inView(rec, view);
  const cam = camera(headingOf(recV, view), recV.elevation ?? 18);
  const j = buildBody(recV, caned(recV, swung(recV, pose, drawnAs(anim)), drawnAs(anim), frame)).joints;
  const [sx, sy] = shiftOf(recV, view);
  const out = {} as Record<FigureJoint, [number, number]>;
  for (const name of FIGURE_JOINTS) {
    const p = cam.project(j[name]);
    out[name] = [p[0] + w / 2 + sx, p[1] + (rec.ground ?? h - 2) + 0.5 + sy];
  }
  return out;
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
  const known = knownAnims(rec);
  const wanted = names.map(name => {
    const found = known.find(a => a.name === name);
    if (!found) {
      throw new Error(`figure: no pose for '${name}' (it knows ${[...FIGURE_ANIMS, ...FIGURE_EXTRA_ANIMS].map(a => a.name).join(', ')})`);
    }
    return found;
  });
  for (const anim of wanted) {
    const indices: number[] = [];
    for (const [k, pose0] of anim.poses.entries()) {
      const pose = rec.head_art && pose0 === FALLEN ? SLUMP : pose0;
      const fig = drawFigure(rec, pose, drawnAs(anim.name), k);
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
