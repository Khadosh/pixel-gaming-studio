import type { Frame, AnatomyConfig, MemberConfig } from '../types';
import { findBounds, getCenterOfMass } from './transforms';

export interface BodySegments {
  mode?: 'auto' | 'humanoid' | 'custom';
  members?: MemberConfig[];
  neckRow: number;
  waistRow: number;
  kneeRow: number;
  ankleRow: number;
  torsoLeft: number;
  torsoRight: number;
  torsoCenterCol: number;
  headEndRow: number;
  torsoEndRow: number;
  isHumanoid: boolean;
  pivots: {
    leftShoulder: { r: number; c: number };
    rightShoulder: { r: number; c: number };
    leftHip: { r: number; c: number };
    rightHip: { r: number; c: number };
    leftKnee: { r: number; c: number };
    rightKnee: { r: number; c: number };
    head: { r: number; c: number };
    torso: { r: number; c: number };
  };
  // Computed areas for easy access during animation
  leftArmArea?: { startR: number; endR: number; startC: number; endC: number };
  rightArmArea?: { startR: number; endR: number; startC: number; endC: number };
  leftLegArea: { startR: number; endR: number; startC: number; endC: number };
  rightLegArea: { startR: number; endR: number; startC: number; endC: number };
}

/**
 * Analyzes a frame to find key anatomical landmarks.
 */
export function analyzeBodySegments(
  frame: Frame, 
  anatomy?: AnatomyConfig
): BodySegments {
  // Rows come from the HEIGHT, columns from the WIDTH: the canvas is not
  // always square (a 448x224 map drawing is a real case).
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const bounds = findBounds(frame);
  const com = getCenterOfMass(frame);

  // Default values based on proportions (fallback)
  const bodyHeight = bounds ? (bounds.bottom - bounds.top + 1) : height;
  const defaultNeck = bounds ? Math.floor(bounds.top + bodyHeight * 0.35) : Math.floor(height * 0.35);
  const defaultWaist = bounds ? Math.floor(bounds.top + bodyHeight * 0.7) : Math.floor(height * 0.7);
  const defaultKnee = bounds ? Math.floor(bounds.top + bodyHeight * 0.85) : Math.floor(height * 0.85);
  const defaultAnkle = bounds ? Math.floor(bounds.bottom - 1) : Math.floor(height * 0.9);

  // Manual Overrides
  const neckRow = anatomy?.neckRow ?? defaultNeck;
  const waistRow = anatomy?.waistRow ?? defaultWaist;
  const kneeRow = anatomy?.kneeRow ?? defaultKnee;
  const ankleRow = anatomy?.ankleRow ?? defaultAnkle;

  if (!bounds || !com) {
    const mid = Math.floor(width / 2);
    return { 
      mode: anatomy?.mode,
      members: anatomy?.members,
      neckRow, 
      waistRow, 
      ankleRow,
      kneeRow,
      headEndRow: neckRow, 
      torsoEndRow: waistRow, 
      isHumanoid: false,
      torsoLeft: 0,
      torsoRight: width - 1,
      torsoCenterCol: mid,
      leftLegArea: { startR: ankleRow, endR: height - 1, startC: 0, endC: mid },
      rightLegArea: { startR: ankleRow, endR: height - 1, startC: mid + 1, endC: width - 1 },
      pivots: {
        leftShoulder: { r: neckRow, c: mid - 2 },
        rightShoulder: { r: neckRow, c: mid + 2 },
        leftHip: { r: waistRow, c: mid - 1 },
        rightHip: { r: waistRow, c: mid + 1 },
        leftKnee: { r: kneeRow, c: mid - 1 },
        rightKnee: { r: kneeRow, c: mid + 1 },
        head: { r: Math.floor(neckRow / 2), c: mid },
        torso: { r: Math.floor((neckRow + waistRow) / 2), c: mid },
      }
    };
  }

  // Horizontal Torso Analysis
  const profile = frame.map(row => row.filter(p => p !== 0).length);
  const neckWidth = profile[neckRow] || 1;
  const waistWidth = profile[waistRow] || 1;
  
  let leftLimit = anatomy?.torsoLeft ?? 0;
  let rightLimit = anatomy?.torsoRight ?? width - 1;

  if (anatomy?.torsoLeft === undefined || anatomy?.torsoRight === undefined) {
    let bestStart = bounds.left;
    let bestEnd = bounds.right;
    let maxDensity = 0;
    
    for (let r = neckRow; r <= waistRow; r++) {
      const row = frame[r];
      let start = -1, end = -1;
      for (let c = 0; c < width; c++) {
        if (row[c] !== 0) {
          if (start === -1) start = c;
          end = c;
        }
      }
      if (start !== -1) {
        const density = end - start + 1;
        if (density > maxDensity) {
          maxDensity = density;
          bestStart = start;
          bestEnd = end;
        }
      }
    }
    if (anatomy?.torsoLeft === undefined) leftLimit = bestStart;
    if (anatomy?.torsoRight === undefined) rightLimit = bestEnd;
  }

  const torsoCenterCol = anatomy?.torsoCenterCol ?? Math.floor((leftLimit + rightLimit) / 2);

  const leftArmArea = anatomy?.leftArmArea || (bounds.left < leftLimit ? { 
    startR: neckRow, 
    endR: bounds.bottom, 
    startC: bounds.left, 
    endC: leftLimit - 1 
  } : undefined);

  const rightArmArea = anatomy?.rightArmArea || (bounds.right > rightLimit ? { 
    startR: neckRow, 
    endR: bounds.bottom, 
    startC: rightLimit + 1, 
    endC: bounds.right 
  } : undefined);

  const leftLegArea = anatomy?.leftLegArea || {
    startR: waistRow,
    endR: bounds.bottom,
    startC: bounds.left,
    endC: torsoCenterCol
  };
  const rightLegArea = anatomy?.rightLegArea || {
    startR: waistRow,
    endR: bounds.bottom,
    startC: torsoCenterCol + 1,
    endC: bounds.right
  };

  const maxWidth = Math.max(...profile);

  return {
    mode: anatomy?.mode,
    members: anatomy?.members,
    neckRow,
    waistRow,
    headEndRow: neckRow,
    torsoEndRow: waistRow,
    isHumanoid: profile[neckRow] < maxWidth * 0.9,
    torsoLeft: leftLimit,
    torsoRight: rightLimit,
    torsoCenterCol,
    ankleRow,
    kneeRow,
    leftArmArea,
    rightArmArea,
    leftLegArea,
    rightLegArea,
    pivots: {
      leftShoulder: { r: neckRow, c: leftLimit },
      rightShoulder: { r: neckRow, c: rightLimit },
      leftHip: { r: waistRow, c: torsoCenterCol - 1 },
      rightHip: { r: waistRow, c: torsoCenterCol + 1 },
      leftKnee: { r: kneeRow, c: torsoCenterCol - 1 },
      rightKnee: { r: kneeRow, c: torsoCenterCol + 1 },
      head: { r: Math.floor(neckRow / 2), c: torsoCenterCol },
      torso: { r: Math.floor((neckRow + waistRow) / 2), c: torsoCenterCol },
    }
  };
}
