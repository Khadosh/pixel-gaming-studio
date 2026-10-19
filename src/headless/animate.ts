// Procedural animation from one base frame, headless. Wraps the anatomy
// engine generators (src/lib/sprite/generators) that the editor uses, so a
// script can grow a walk cycle, an idle breath or an attack out of a single
// drawn pose.

import type { AnatomyConfig, Frame, SpriteAsset } from '../lib/types';
import { generateIdle } from '../lib/sprite/generators/idle';
import { generateWalk, generateWalkSide, generateWalkTopDown } from '../lib/sprite/generators/walk';
import { generateJump, generateRun } from '../lib/sprite/generators/movement';
import { generateAttack, generateAttackTopDown, generateCast } from '../lib/sprite/generators/combat';
import { generateDie, generateHurt } from '../lib/sprite/generators/life';
import { flipHorizontal } from '../lib/sprite/transforms';
import { addFrame, colorIndex, getFrame, matchAnimations, setAnimation } from './asset';
import { contractAnims, contractViews, generatorName, roleOf, viewOf, type AnimationContract } from './contract';
import { anatomyFrom, canvasBox, figureBox, type ProportionBase } from './proportions';

/**
 * Same dispatch as generateFrameSequence in src/lib/spriteAnimations.ts, but
 * importing the generators directly: that module uses the "@/" alias, which
 * only the bundler and vitest resolve, and the CLI runs under tsx.
 */
export function generateSequence(base: Frame, anim: string, glow: number, anatomy?: AnatomyConfig): Frame[] {
  const dir = (anim.match(/_(down|up|left|right)$/)?.[1] ?? '') as '' | 'down' | 'up' | 'left' | 'right';
  const kind = kindOf(anim);
  const orientation = dir === 'up' ? 2 : dir === 'left' || dir === 'right' ? 1 : 0;
  const topDown = dir === 'up' || dir === 'down';
  const side = dir === 'left' || dir === 'right';
  let frames: Frame[];
  switch (kind) {
    case 'idle': frames = generateIdle(base, anatomy, orientation); break;
    case 'walk':
      frames = topDown ? generateWalkTopDown(base, anatomy, orientation)
        : side ? generateWalkSide(base, anatomy, orientation)
        : generateWalk(base, anatomy, orientation);
      break;
    case 'run': frames = generateRun(base, anatomy, orientation); break;
    case 'jump': frames = generateJump(base, anatomy, orientation); break;
    case 'attack': frames = topDown ? generateAttackTopDown(base, anatomy, orientation) : generateAttack(base, anatomy, orientation); break;
    case 'cast': frames = generateCast(base, glow, anatomy, orientation); break;
    case 'hurt': frames = generateHurt(base, anatomy, orientation); break;
    case 'die': frames = generateDie(base, anatomy, orientation); break;
    default: frames = [generateIdle(base, anatomy)[0]];
  }
  return dir === 'left' ? frames.map(f => flipHorizontal(f)) : frames;
}

export const ANIMATION_KINDS = [
  'idle', 'walk', 'run', 'jump', 'attack', 'cast', 'hurt', 'die',
] as const;

export interface AnimateOptions {
  /** Frame index of the base pose. */
  base: number;
  /**
   * What to generate, optionally with a direction suffix that picks the
   * orientation: "walk_down", "attack_up", "idle", "cast_left"…
   * Left variants are generated as right and flipped.
   */
  anim: string;
  /** Tag name for the result. Default: anim. */
  name?: string;
  /**
   * The base pose faces the other way: it is mirrored before growing. A "_left" animation grows as a right one
   * and is flipped, so a pose that already faces left goes in mirrored (the contract does it with base_from).
   */
  flipBase?: boolean;
  fps?: number;
  loop?: boolean;
  /** Glow color for "cast". Default: the highest palette index. */
  glow?: string | number;
  /**
   * Overrides for the automatic body segmentation: the rows (neck, waist,
   * knee, ankle), the torso columns and, when the guess is still wrong, the
   * box of each member. The columns matter: whatever sticks out sideways of
   * the torso is taken for an arm, so a sword hilt or a gourd gets swung.
   */
  anatomy?: Partial<Omit<AnatomyConfig, 'mode' | 'orientations' | 'members'>>;
  /**
   * The project's proportion map (`proportions.ts`). Where `anatomy` is a
   * patch for *this* drawing, this is the map every character of the project
   * is born from: the engine reads the neck, the waist, the knee, the ankle
   * and the torso columns off it instead of looking for them in the pixels.
   * What is passed explicitly still wins, so a map never takes a knob away.
   */
  proportions?: ProportionBase;
  /**
   * The caller says this is a body the engine can move (a proportion map passed on purpose, not
   * inherited): a base that does not read as a person standing is animated anyway, with a warning.
   * `anatomy`, here or stored on the asset, says the same.
   */
  bodyDeclared?: boolean;
  /**
   * How many frames: for the loops only (idle, walk, run). The idle keeps distinct poses (2 = rest
   * and the settle, 3 = rest, breath in, settle); a walk or a run is sampled evenly, so it takes
   * a count that divides its cycle.
   */
  frames?: number;
  /** Where the warnings go (a base animated although it does not read as a person standing). */
  warnings?: string[];
}

/** What `readStanding` measured on a base pose, and why it is not a person standing when it is not. */
export interface StandingReading {
  ok: boolean;
  why?: string;
  /** the painted box, height over width, and the measures the rules looked at */
  width: number; height: number; ratio: number;
}

/**
 * The box of a chibi: a figure about as tall as wide (under this, height over
 * width) is a person only as a big head on a small body. Over it every person
 * of The Unwritten Dao measures (the lowest, 1.39, is a robed 32 px rig) and
 * under it sit the cat of the patio (1.04–1.28) and the 16 px chibi of the
 * pack (1.0–1.07), which the next three rules tell apart.
 */
export const CHIBI_BOX = 1.35;
/** Under this, height over width, the figure is wider than tall: lying, crouched or on four legs. */
export const WIDE_BOX = 0.95;

/**
 * Does the base pose read as a person standing, the only body the anatomy
 * engine knows how to move (head, two arms, two legs)? Measured on the
 * silhouette, nothing declared. Calibrated on the real drawings: the 241 idle
 * poses of the people of The Unwritten Dao and the girl of the patio pass;
 * the cat of the patio in its three views, the owl, the toad and the hedgehog,
 * and the beasts of the game drawn wider than tall, do not. What it cannot
 * tell is a 16 px beast of a sprite pack from a 16 px chibi of the same pack:
 * both are one round head filling the square, the game's wolves and bears pass
 * (the game had already turned their animation off).
 */
export function readStanding(frame: Frame): StandingReading {
  const H = frame.length, W = frame[0]?.length ?? 0;
  let top = -1, bot = -1, l = W, r = -1;
  const spans: ([number, number] | undefined)[] = [];
  for (let y = 0; y < H; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (frame[y][x]) { if (a < 0) a = x; b = x; }
    spans.push(a < 0 ? undefined : [a, b]);
    if (a >= 0) { if (top < 0) top = y; bot = y; l = Math.min(l, a); r = Math.max(r, b); }
  }
  if (top < 0) return { ok: false, why: 'the base pose is empty', width: 0, height: 0, ratio: 0 };
  const h = bot - top + 1, w = r - l + 1, ratio = h / w;
  const read = { width: w, height: h, ratio: +ratio.toFixed(2) };
  const no = (why: string): StandingReading => ({ ok: false, why, ...read });
  if (ratio < WIDE_BOX) return no(`it is wider than tall (${w}x${h} px): a body lying, crouched or on four legs`);
  if (ratio < CHIBI_BOX) {
    // as tall as wide: a person only as a chibi, a big head over a small body
    const [ta, tb] = spans[top]!;
    let pieces = 0;
    for (let x = ta; x <= tb; x++) if (frame[top][x] && (x === ta || !frame[top][x - 1])) pieces++;
    if (Math.abs((ta + tb) / 2 - (l + r) / 2) / w > 0.25) {
      return no(`its top is at one end of it, not over the middle (${w}x${h} px): a head or a tail sticking out, a body in profile on four legs`);
    }
    if (pieces >= 2 && (tb - ta + 1) / w > 0.5) {
      return no(`its top is ${pieces} pieces spread across it, not one crown (${w}x${h} px): ears or horns`);
    }
    let widest = top, most = 0;
    for (let y = top; y <= bot; y++) { const s = spans[y]; if (s && s[1] - s[0] + 1 > most) { most = s[1] - s[0] + 1; widest = y; } }
    if ((widest - top + 0.5) / h > 0.5) {
      return no(`it is as tall as wide (${w}x${h} px) and widest below its middle: a body sitting or on four legs, not a big head over a small body`);
    }
  }
  return { ok: true, ...read };
}

/** The refusal, in words an agent can act on: what was not found and the two ways out. */
export function notStandingMessage(reading: StandingReading, base: number, anim: string): string {
  return `animate ${anim}: the base pose (frame ${base}) does not read as a person standing: ${reading.why}. `
    + 'The anatomy engine moves a biped (a head, two arms, two legs) and on anything else it hands back the bob of one. '
    + 'Draw this animation by hand, or, if it is a person, say where its body is with anatomy= or proportions=.';
}

/** The frames to keep out of a generated cycle, when the caller asks for a count. */
function pickFrames(frames: Frame[], kind: string, count: number, anim: string): Frame[] {
  if (!['idle', 'walk', 'run'].includes(kind)) {
    throw new Error(`animate ${anim}: frames is for the loops (idle, walk, run); a ${kind} is a sequence and every frame of it is needed`);
  }
  const n = frames.length;
  if (count === n) return frames;
  // the idle is rest, breath in, rest, settle: distinct poses first, the repeated rest never twice
  if (kind === 'idle' && n === 4) {
    const keep = ({ 1: [0], 2: [0, 3], 3: [0, 1, 3] } as Record<number, number[]>)[count];
    if (keep) return keep.map(i => frames[i]);
  }
  const fits = Array.from({ length: n }, (_, i) => i + 1).filter(k => n % k === 0);
  if (count > n || n % count !== 0) {
    throw new Error(`animate ${anim}: the ${kind} cycle has ${n} frames and is sampled evenly, so frames takes ${kind === 'idle' && n === 4 ? '1, 2, 3 or 4' : fits.join(', ')}`);
  }
  return frames.filter((_, i) => i % (n / count) === 0);
}

/**
 * The anatomy the engine gets: the project's map first, then what the asset
 * carries, then what this call says. Explicit wins, always — the map is the
 * floor, not the ceiling.
 */
function anatomyOf(asset: SpriteAsset, opts: { anatomy?: AnimateOptions['anatomy']; proportions?: ProportionBase }, base: Frame): AnatomyConfig | undefined {
  const fromMap = opts.proportions
    ? anatomyFrom(opts.proportions, figureBox(base) ?? canvasBox(base[0]?.length ?? 0, base.length), base)
    : undefined;
  if (!fromMap && !opts.anatomy && !asset.anatomy) return undefined;
  return { ...(fromMap ?? {}), ...(asset.anatomy ?? {}), ...(opts.anatomy ?? {}) };
}

export function kindOf(anim: string): string {
  return anim.replace(/_(down|up|left|right)$/, '');
}

/** Appends the generated frames and tags them. Returns the new indices. */
export function animateAsset(asset: SpriteAsset, opts: AnimateOptions): number[] {
  const kind = kindOf(opts.anim);
  if (!(ANIMATION_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`unknown animation "${opts.anim}" (kinds: ${ANIMATION_KINDS.join(', ')})`);
  }
  const base = opts.flipBase ? flipHorizontal(getFrame(asset, opts.base)) : getFrame(asset, opts.base);
  const paletteKeys = Object.keys(asset.palette).map(Number).filter(k => k > 0);
  const glow = opts.glow !== undefined ? colorIndex(asset, opts.glow) : Math.max(1, ...paletteKeys);
  // the engine only knows a person standing: say so instead of handing back its bob on a cat
  const reading = readStanding(base);
  if (!reading.ok) {
    const declared = opts.bodyDeclared || !!opts.anatomy || !!asset.anatomy;
    if (!declared) throw new Error(notStandingMessage(reading, opts.base, opts.anim));
    opts.warnings?.push(`${opts.name ?? opts.anim}: the base pose (frame ${opts.base}) does not read as a person standing (${reading.why}); animated anyway because the body was declared. Look at it before using it.`);
  }
  const anatomy = anatomyOf(asset, opts, base);
  let frames = generateSequence(base, opts.anim, glow, anatomy);
  if (opts.frames !== undefined) frames = pickFrames(frames, kind, opts.frames, opts.anim);
  const indices = frames.map(f => addFrame(asset, f));
  const isLoop = opts.loop ?? ['idle', 'walk', 'run'].includes(kind);
  const fps = opts.fps ?? (kind === 'walk' || kind === 'run' ? 10 : kind === 'idle' ? 3 : 6);
  setAnimation(asset, { name: opts.name ?? opts.anim, frameIndices: indices, fps, loop: isLoop });
  return indices;
}

export interface ContractReport {
  /** Animations generated, with how many frames each one got. */
  made: { anim: string; frames: number }[];
  /** Animations of the contract this cannot generate, and why. */
  skipped: { anim: string; why: string }[];
  /** Animations made although their base does not read as a person standing (the body was declared). */
  warnings: string[];
}

export interface AnimateContractOptions {
  /** The pose every animation grows from, when the contract has no views. */
  base?: number;
  /**
   * The animation whose first frame is the base pose of each view, as a pattern
   * with `{view}` in it ("idle_{view}"): a walk to the left has to grow out of
   * the pose that already faces left (mirrored in, since a left animation is
   * generated as a right one and flipped), or, with no left pose, out of the
   * right one.
   */
  baseFrom?: string;
  fps?: number;
  glow?: string | number;
  anatomy?: AnimateOptions['anatomy'];
  /** The project's proportion map, read for every animation it grows. */
  proportions?: ProportionBase;
  /** Generate an animation the asset already has (default: leave it alone). */
  overwrite?: boolean;
  /** See `AnimateOptions.bodyDeclared`. */
  bodyDeclared?: boolean;
}

/**
 * Grows every animation an animation contract asks for out of the poses the
 * asset already has, and **says which ones it cannot**: a technique is a cast,
 * but nothing in the anatomy engine makes a `sit`, and a view with no base pose
 * has nowhere to grow from. The report of what is still missing is part of the
 * capability — without it, borrowing is invisible debt.
 */
export function animateContract(asset: SpriteAsset, contract: AnimationContract, opts: AnimateContractOptions = {}): ContractReport {
  const views = contractViews(contract);
  const made: ContractReport['made'] = [];
  const skipped: ContractReport['skipped'] = [];
  const warnings: string[] = [];
  const refused: string[] = [];
  for (const anim of contractAnims(contract)) {
    const have = (asset.animations ?? []).find(a => a.name === anim);
    if (have && !opts.overwrite) { skipped.push({ anim, why: 'the asset already has it' }); continue; }
    const gen = generatorName(anim, views);
    const kind = roleOf(gen, views);
    if (!(ANIMATION_KINDS as readonly string[]).includes(kind)) {
      skipped.push({ anim, why: `no generator for "${kind}" (kinds: ${ANIMATION_KINDS.join(', ')}): draw it by hand` });
      continue;
    }
    let base = opts.base;
    const view = viewOf(anim, views);
    const perView = !!opts.baseFrom?.includes('{view}');
    let flipBase = false;
    if (opts.baseFrom && (view || !perView)) {
      const pattern = opts.baseFrom.split('{view}').join(view);
      const pose = (p: string) => { const a = matchAnimations(asset, p)[0]; return a?.frameIndices.length ? a.frameIndices[0] : undefined; };
      // a "_left" animation grows as the right one and is flipped: its pose has to face right. The left pose,
      // when there is one, goes in mirrored; with none, the left view grows from the right one (pgs #148)
      const flips = gen.endsWith('_left');
      const own = pose(pattern), right = flips && perView ? pose(opts.baseFrom.split('{view}').join('right')) : undefined;
      if (own === undefined && right === undefined) {
        skipped.push({ anim, why: `no base pose: the asset has no animation "${pattern}"${flips && perView ? ` nor "${opts.baseFrom.split('{view}').join('right')}" to mirror` : ''}` });
        continue;
      }
      base = own ?? right;
      flipBase = flips && own !== undefined;
    } else if (perView && !view && base === undefined) {
      // "technique" and "die" have no view, so "idle_{view}" cannot point at
      // their pose: the caller has to say which frame they grow from.
      skipped.push({ anim, why: `no base pose: base_from is "${opts.baseFrom}" and "${anim}" has no view, so give base too` });
      continue;
    }
    if (base === undefined) { skipped.push({ anim, why: 'no base pose: give base or base_from' }); continue; }
    const pose = flipBase ? flipHorizontal(getFrame(asset, base)) : getFrame(asset, base);
    const reading = readStanding(pose);
    if (!reading.ok && !opts.bodyDeclared && !opts.anatomy && !asset.anatomy) {
      skipped.push({ anim, why: `not a person standing: ${reading.why}; draw it by hand, or give anatomy= or proportions=` });
      refused.push(notStandingMessage(reading, base, anim));
      continue;
    }
    const indices = animateAsset(asset, { base, flipBase, anim: gen, name: anim, fps: opts.fps, glow: opts.glow, anatomy: opts.anatomy, proportions: opts.proportions, bodyDeclared: opts.bodyDeclared, warnings });
    made.push({ anim, frames: indices.length });
  }
  // nothing made and something refused for its body: that is a no, not an empty "made"
  if (!made.length && refused.length) throw new Error(refused[0] + (refused.length > 1 ? ` (and ${refused.length - 1} more of the contract, for the same reason)` : ''));
  return { made, skipped, warnings };
}
