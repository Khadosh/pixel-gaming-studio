import type { Frame, AnatomyConfig } from '../../types';
import { cloneFrame, shiftPixels, rotatePixels, clearPixels, stretchPixels, sealGaps } from '../transforms';
import { resolveMembers } from '../anatomyResolver';
import { addGlow } from '../drawing';

/** 
 * Attack: Forward lunge with swinging weapon arm using Anatomy Engine.
 */
export function generateAttack(
  base: Frame, 
  anatomy?: AnatomyConfig,
  orientation: number = 0
): Frame[] {
  const members = resolveMembers(base, anatomy, orientation);
  const { head, torso, arm_left, arm_right, leg_left, leg_right } = members;
  
  const movingParts = [
    ...(torso?.pixels || []),
    ...(head?.pixels || []),
    ...(arm_left?.pixels || []),
    ...(arm_right?.pixels || []),
    ...(leg_left?.pixels || []),
    ...(leg_right?.pixels || [])
  ];

  // 1. WIND UP: Lean back + Lift main arm (usually right)
  let f0 = clearPixels(cloneFrame(base), movingParts);
  const upper = [...(torso?.pixels || []), ...(head?.pixels || [])];
  if (upper.length > 0) f0 = shiftPixels(base, f0, upper, 0, -1);
  if (arm_right) f0 = rotatePixels(base, f0, arm_right.pixels, arm_right.pivot, -45);
  if (arm_left) f0 = rotatePixels(base, f0, arm_left.pixels, arm_left.pivot, 15);
  if (leg_left) f0 = shiftPixels(base, f0, leg_left.pixels, 0, 0);
  if (leg_right) f0 = shiftPixels(base, f0, leg_right.pixels, 0, 0);

  // 2. STRIKE: Lunge forward + Swing arm down
  let f1 = clearPixels(cloneFrame(base), movingParts);
  if (upper.length > 0) f1 = shiftPixels(base, f1, upper, 0, 2);
  if (arm_right) f1 = rotatePixels(base, f1, arm_right.pixels, arm_right.pivot, 90);
  if (arm_left) f1 = rotatePixels(base, f1, arm_left.pixels, arm_left.pivot, -15);
  if (leg_left) f1 = shiftPixels(base, f1, leg_left.pixels, 0, 0);
  if (leg_right) f1 = stretchPixels(base, f1, leg_right.pixels, 1); // Slight knee bend in lunge

  // 3. FOLLOW THROUGH: Full extension
  let f2 = clearPixels(cloneFrame(base), movingParts);
  if (upper.length > 0) f2 = shiftPixels(base, f2, upper, 1, 1);
  if (arm_right) f2 = rotatePixels(base, f2, arm_right.pixels, arm_right.pivot, 120);
  if (arm_left) f2 = rotatePixels(base, f2, arm_left.pixels, arm_left.pivot, -30);
  if (leg_left) f2 = shiftPixels(base, f2, leg_left.pixels, 0, 0);
  if (leg_right) f2 = shiftPixels(base, f2, leg_right.pixels, 0, 0);

  return [f0, f1, f2, f2];
}

/** 
 * Cast: Raising arms with steady base and magical glow using Anatomy Engine.
 */
export function generateCast(
  base: Frame, 
  glowColor: number,
  anatomy?: AnatomyConfig,
  orientation: number = 0
): Frame[] {
  const members = resolveMembers(base, anatomy, orientation);
  const { head, torso, arm_left, arm_right, leg_left, leg_right } = members;
  
  const movingParts = [
    ...(torso?.pixels || []),
    ...(head?.pixels || []),
    ...(arm_left?.pixels || []),
    ...(arm_right?.pixels || []),
    ...(leg_left?.pixels || []),
    ...(leg_right?.pixels || [])
  ];

  // 1. RAISING ARMS: Arms lift, head looks up slightly
  let f0 = clearPixels(cloneFrame(base), movingParts);
  if (arm_left) f0 = rotatePixels(base, f0, arm_left.pixels, arm_left.pivot, -90);
  if (arm_right) f0 = rotatePixels(base, f0, arm_right.pixels, arm_right.pivot, 90);
  if (head) f0 = stretchPixels(base, f0, head.pixels, -1);
  if (torso) f0 = shiftPixels(base, f0, torso.pixels, 0, 0);
  if (leg_left) f0 = shiftPixels(base, f0, leg_left.pixels, 0, 0);
  if (leg_right) f0 = shiftPixels(base, f0, leg_right.pixels, 0, 0);
  
  // 2. PEAK POWER: Arms vibrating + Glow
  let f1 = clearPixels(cloneFrame(f0), movingParts);
  if (arm_left) f1 = rotatePixels(base, f1, arm_left.pixels, arm_left.pivot, -95);
  if (arm_right) f1 = rotatePixels(base, f1, arm_right.pixels, arm_right.pivot, 95);
  if (head) f1 = stretchPixels(base, f1, head.pixels, -2);
  if (torso) f1 = shiftPixels(base, f1, torso.pixels, 0, 0);
  if (leg_left) f1 = shiftPixels(base, f1, leg_left.pixels, 0, 0);
  if (leg_right) f1 = shiftPixels(base, f1, leg_right.pixels, 0, 0);
  // The head lifts off the neck: stretch it and close what the arms leave open.
  f0 = sealGaps(base, f0);
  f1 = addGlow(sealGaps(base, f1), glowColor);

  return [f0, f1, f0, f1];
}

/** 
 * Top-Down Attack: Directional lunge using Anatomy Engine.
 */
export function generateAttackTopDown(
  base: Frame, 
  anatomy?: AnatomyConfig,
  orientation: number = 0
): Frame[] {
  const members = resolveMembers(base, anatomy, orientation);
  const { head, torso, arm_left, arm_right, leg_left, leg_right } = members;
  const isUpDir = orientation === 2; // Back/Up view
  const dir = isUpDir ? -1 : 1; 

  const movingParts = [
    ...(torso?.pixels || []),
    ...(head?.pixels || []),
    ...(arm_left?.pixels || []),
    ...(arm_right?.pixels || []),
    ...(leg_left?.pixels || []),
    ...(leg_right?.pixels || [])
  ];

  // Frame 1: Anticipation (recoil)
  let f1 = clearPixels(cloneFrame(base), movingParts);
  const body = [...(head?.pixels || []), ...(torso?.pixels || []), ...(arm_left?.pixels || []), ...(arm_right?.pixels || [])];
  f1 = shiftPixels(base, f1, body, -dir, 0);
  if (leg_left) f1 = shiftPixels(base, f1, leg_left.pixels, 0, 0);
  if (leg_right) f1 = shiftPixels(base, f1, leg_right.pixels, 0, 0);
  
  // Frame 2: Lunge forward
  let f2 = clearPixels(cloneFrame(base), movingParts);
  f2 = shiftPixels(base, f2, body, dir * 2, 0);
  const mainArm = arm_right || arm_left;
  if (mainArm) {
    f2 = shiftPixels(base, f2, mainArm.pixels, dir * 2, 0);
  }
  if (leg_left) f2 = shiftPixels(base, f2, leg_left.pixels, 0, 0);
  if (leg_right) f2 = shiftPixels(base, f2, leg_right.pixels, 0, 0);

  // The lunge moves the body and leaves the legs planted, so between the hem
  // of the robe and the legs there is a row of nothing: the sprite comes out
  // torn in two. Sealing the hole stretches the waist instead, which is what
  // the lunge should look like.
  return [sealGaps(base, f1), sealGaps(base, f2), sealGaps(base, f2), sealGaps(base, f1)];
}
