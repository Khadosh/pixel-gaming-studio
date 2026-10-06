import { Frame, AnatomyConfig, MemberConfig, MemberType } from '../types';
import { analyzeBodySegments } from './anatomy';

export interface ResolvedMember {
  type: MemberType;
  pixels: { r: number; c: number }[];
  pivot: { r: number; c: number };
  bounds: { startR: number; endR: number; startC: number; endC: number };
}

/**
 * Resolves all members for a given frame and anatomy configuration.
 * Prioritizes manual pixel selections, fallbacks to algorithmic inference.
 */
export function resolveMembers(
  frame: Frame,
  anatomy?: AnatomyConfig,
  orientationIdx: number = 0
): Record<MemberType, ResolvedMember> {
  // Columns come from the WIDTH, not from `frame.length` (which is the HEIGHT):
  // the canvas is not always square.
  const width = frame[0]?.length ?? 0;
  const segments = analyzeBodySegments(frame, anatomy);
  
  // Get manual members for this orientation if they exist
  const manualMembers = anatomy?.orientations?.[orientationIdx]?.members || [];
  const manualMap = new Map<MemberType, MemberConfig>();
  manualMembers.forEach(m => manualMap.set(m.type, m));

  const result: Partial<Record<MemberType, ResolvedMember>> = {};

  const memberTypes: MemberType[] = [
    'head', 'torso', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'tail', 'wing', 'prop'
  ];

  memberTypes.forEach(type => {
    const manual = manualMap.get(type);
    
    let pixels: { r: number; c: number }[] = [];
    let pivot = { r: 0, c: 0 };

    if (manual && manual.pixels && manual.pixels.length > 0) {
      // 1. Use manual pixels
      pixels = manual.pixels;
      pivot = manual.pivot || { r: 0, c: 0 };
    } else {
      // 2. Fallback to algorithmic area
      const area = getInferredArea(type, segments, width);
      pixels = getPixelsInArea(frame, area);
      pivot = getInferredPivot(type, segments);
    }

    if (pixels.length > 0) {
      const bounds = calculateBounds(pixels);
      result[type] = { type, pixels, pivot, bounds };
    }
  });

  return result as Record<MemberType, ResolvedMember>;
}

/** `width` bounds the COLUMNS of the inferred areas. */
function getInferredArea(type: MemberType, segments: any, width: number) {
  switch (type) {
    case 'head':
      return { startR: 0, endR: segments.neckRow, startC: 0, endC: width - 1 };
    case 'torso':
      return { startR: segments.neckRow + 1, endR: segments.waistRow, startC: segments.torsoLeft, endC: segments.torsoRight };
    case 'arm_left':
      return segments.leftArmArea || { startR: segments.neckRow, endR: segments.waistRow, startC: 0, endC: segments.torsoLeft - 1 };
    case 'arm_right':
      return segments.rightArmArea || { startR: segments.neckRow, endR: segments.waistRow, startC: segments.torsoRight + 1, endC: width - 1 };
    case 'leg_left':
      return segments.leftLegArea;
    case 'leg_right':
      return segments.rightLegArea;
    default:
      return { startR: 0, endR: 0, startC: 0, endC: 0 };
  }
}

function getInferredPivot(type: MemberType, segments: any) {
  switch (type) {
    case 'head': return segments.pivots.head;
    case 'torso': return segments.pivots.torso;
    case 'arm_left': return segments.pivots.leftShoulder;
    case 'arm_right': return segments.pivots.rightShoulder;
    case 'leg_left': return segments.pivots.leftHip;
    case 'leg_right': return segments.pivots.rightHip;
    default: return { r: 0, c: 0 };
  }
}

function getPixelsInArea(frame: Frame, area: { startR: number; endR: number; startC: number; endC: number }) {
  const pixels: { r: number; c: number }[] = [];
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  for (let r = Math.max(0, area.startR); r <= Math.min(height - 1, area.endR); r++) {
    for (let c = Math.max(0, area.startC); c <= Math.min(width - 1, area.endC); c++) {
      if (frame[r][c] !== 0) {
        pixels.push({ r, c });
      }
    }
  }
  return pixels;
}

function calculateBounds(pixels: { r: number; c: number }[]) {
  if (pixels.length === 0) return { startR: 0, endR: 0, startC: 0, endC: 0 };
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  pixels.forEach(p => {
    if (p.r < minR) minR = p.r;
    if (p.r > maxR) maxR = p.r;
    if (p.c < minC) minC = p.c;
    if (p.c > maxC) maxC = p.c;
  });
  return { startR: minR, endR: maxR, startC: minC, endC: maxC };
}
