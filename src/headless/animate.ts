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
  const base = getFrame(asset, opts.base);
  const paletteKeys = Object.keys(asset.palette).map(Number).filter(k => k > 0);
  const glow = opts.glow !== undefined ? colorIndex(asset, opts.glow) : Math.max(1, ...paletteKeys);
  const anatomy = anatomyOf(asset, opts, base);
  const frames = generateSequence(base, opts.anim, glow, anatomy);
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
}

export interface AnimateContractOptions {
  /** The pose every animation grows from, when the contract has no views. */
  base?: number;
  /**
   * The animation whose first frame is the base pose of each view, as a pattern
   * with `{view}` in it ("idle_{view}"): a walk to the left has to grow out of
   * the pose that already faces left.
   */
  baseFrom?: string;
  fps?: number;
  glow?: string | number;
  anatomy?: AnimateOptions['anatomy'];
  /** The project's proportion map, read for every animation it grows. */
  proportions?: ProportionBase;
  /** Generate an animation the asset already has (default: leave it alone). */
  overwrite?: boolean;
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
    if (opts.baseFrom && (view || !perView)) {
      const pattern = opts.baseFrom.split('{view}').join(view);
      const from = matchAnimations(asset, pattern)[0];
      if (!from || !from.frameIndices.length) {
        skipped.push({ anim, why: `no base pose: the asset has no animation "${pattern}"` });
        continue;
      }
      base = from.frameIndices[0];
    } else if (perView && !view && base === undefined) {
      // "technique" and "die" have no view, so "idle_{view}" cannot point at
      // their pose: the caller has to say which frame they grow from.
      skipped.push({ anim, why: `no base pose: base_from is "${opts.baseFrom}" and "${anim}" has no view, so give base too` });
      continue;
    }
    if (base === undefined) { skipped.push({ anim, why: 'no base pose: give base or base_from' }); continue; }
    const indices = animateAsset(asset, { base, anim: gen, name: anim, fps: opts.fps, glow: opts.glow, anatomy: opts.anatomy, proportions: opts.proportions });
    made.push({ anim, frames: indices.length });
  }
  return { made, skipped };
}
