import type { Frame } from '../types';
// A relative path, not "@/": the anatomy generators are reached from the CLI
// (animate.ts) under tsx, which resolves the alias against the directory it was
// started in, so an "@/" here breaks every `bin/pgs` call made from a game repo.
import { blankFrame } from '../../headless/assetModel';

// Frames are `number[][]` indexed [row][col]: `frame.length` is the HEIGHT and
// `frame[0].length` is the WIDTH. Canvases are not always square (a 448x224 map
// drawing is a real case), so every primitive here reads both separately.

/** Deep clone a frame grid */
export function cloneFrame(frame: Frame): Frame {
  return frame.map(row => [...row]);
}

/** Finds the bounding box of non-transparent pixels */
export function findBounds(frame: Frame) {
  let top = frame.length, bottom = 0, left = frame[0].length, right = 0;
  let hasPixels = false;
  for (let r = 0; r < frame.length; r++) {
    for (let c = 0; c < frame[r].length; c++) {
      if (frame[r][c] !== 0) {
        hasPixels = true;
        if (r < top) top = r;
        if (r > bottom) bottom = r;
        if (c < left) left = c;
        if (c > right) right = c;
      }
    }
  }
  return hasPixels ? { top, bottom, left, right } : null;
}

/** Calculates the center of mass for a frame */
export function getCenterOfMass(frame: Frame) {
  let sumR = 0, sumC = 0, count = 0;
  for (let r = 0; r < frame.length; r++) {
    for (let c = 0; c < frame[r].length; c++) {
      if (frame[r][c] !== 0) {
        sumR += r;
        sumC += c;
        count++;
      }
    }
  }
  return count > 0 ? { r: sumR / count, c: sumC / count } : null;
}

/** Shifts an area of a frame by (dr, dc) */
export function shiftArea(
  frame: Frame, 
  area: { startR: number; endR: number; startC: number; endC: number }, 
  dr: number, 
  dc: number
): Frame {
  const next = cloneFrame(frame);
  const height = frame.length;
  const width = frame[0]?.length ?? 0;

  // Clear the original area in the NEW frame first
  for (let r = area.startR; r <= area.endR; r++) {
    for (let c = area.startC; c <= area.endC; c++) {
      if (r >= 0 && r < height && c >= 0 && c < width) {
        next[r][c] = 0;
      }
    }
  }

  // Place pixels in new position
  for (let r = area.startR; r <= area.endR; r++) {
    for (let c = area.startC; c <= area.endC; c++) {
      if (frame[r][c] !== 0) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
          next[nr][nc] = frame[r][c];
        }
      }
    }
  }
  return next;
}

/** Horizontal lean (skew) from a pivot row */
export function leanBody(frame: Frame, pivotRow: number, topRow: number, shift: number): Frame {
  const next = cloneFrame(frame);
  const width = frame[0]?.length ?? 0;
  for (let r = 0; r <= pivotRow; r++) {
    const factor = (pivotRow - r) / (pivotRow - topRow || 1);
    const rowShift = Math.round(shift * factor);
    if (rowShift === 0) continue;

    const row = [...frame[r]];
    for (let c = 0; c < width; c++) next[r][c] = 0;
    for (let c = 0; c < width; c++) {
      if (row[c] !== 0) {
        const nc = c + rowShift;
        if (nc >= 0 && nc < width) next[r][nc] = row[c];
      }
    }
  }
  return next;
}

/** Vertically stretches the body at a specific row (e.g. neck) */
export function stretchBody(frame: Frame, pivotRow: number): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const next = blankFrame(width, height);
  const pr = Math.round(pivotRow);

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (frame[r][c] !== 0) {
        if (r <= pr) {
          if (r - 1 >= 0) next[r - 1][c] = frame[r][c];
        } else {
          next[r][c] = frame[r][c];
        }
      }
    }
  }
  // Fill neck gap
  for (let c = 0; c < width; c++) {
    if (frame[pr] && frame[pr][c] !== 0) {
      next[pr][c] = frame[pr][c];
    }
  }
  return next;
}

/** Vertically squashes the body by removing specific rows */
export function squash(frame: Frame, rowsToRemove: number[], keepBottom = true, pivotRow?: number): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const next = blankFrame(width, height);
  const removeSet = new Set(rowsToRemove.map(r => Math.round(r)));

  let targetR = keepBottom ? height - 1 : 0;
  const step = keepBottom ? -1 : 1;
  const start = keepBottom ? height - 1 : 0;
  const end = keepBottom ? -1 : height;

  for (let r = start; r !== end; r += step) {
    if (removeSet.has(r)) continue;
    for (let c = 0; c < width; c++) {
      if (frame[r][c] !== 0) {
        next[targetR][c] = frame[r][c];
      }
    }
    targetR += step;
  }
  return next;
}

/** Flips a frame horizontally */
export function flipHorizontal(frame: Frame): Frame {
  return frame.map(row => [...row].reverse());
}

/** Shifts/Translates a frame by delta row/col. Clips at edges. */
export function shiftFrame(frame: Frame, dr: number, dc: number): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const out = blankFrame(width, height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const srcR = r - dr;
      const srcC = c - dc;
      if (srcR >= 0 && srcR < height && srcC >= 0 && srcC < width) {
        out[r][c] = frame[srcR][srcC];
      }
    }
  }
  return out;
}

/** Flip vertical */
export function flipVertical(frame: Frame): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const out = cloneFrame(frame);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      out[r][c] = frame[height - 1 - r][c];
    }
  }
  return out;
}

/** Rotate a frame by an arbitrary angle (degrees) around a specific center. */
export function rotateFrameFree(frame: Frame, angleDeg: number, center: { r: number, c: number }): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const out = blankFrame(width, height);
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const dr = r - center.r;
      const dc = c - center.c;
      const srcC = Math.round(center.c + (dc * cos + dr * sin));
      const srcR = Math.round(center.r + (-dc * sin + dr * cos));
      if (srcR >= 0 && srcR < height && srcC >= 0 && srcC < width) {
        out[r][c] = frame[srcR][srcC];
      }
    }
  }
  return out;
}

/** Resize a frame using nearest neighbor scaling. */
export function resizeFrameNearest(frame: Frame, newW: number, newH: number): Frame {
  const oldH = frame.length;
  if (oldH === 0) return [];
  const oldW = frame[0].length;
  const out = Array.from({ length: newH }, () => Array(newW).fill(0));
  for (let r = 0; r < newH; r++) {
    for (let c = 0; c < newW; c++) {
      const srcR = Math.floor((r * oldH) / newH);
      const srcC = Math.floor((c * oldW) / newW);
      out[r][c] = frame[srcR][srcC];
    }
  }
  return out;
}

/** Rotates a specific area around a pivot point */
export function rotateArea(
  frame: Frame,
  area: { startR: number; endR: number; startC: number; endC: number },
  pivot: { r: number; c: number },
  angleDeg: number
): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const next = cloneFrame(frame);
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // 1. Clear original area
  for (let r = area.startR; r <= area.endR; r++) {
    for (let c = area.startC; c <= area.endC; c++) {
      if (r >= 0 && r < height && c >= 0 && c < width) {
        next[r][c] = 0;
      }
    }
  }

  // 2. Map rotated pixels
  for (let r = area.startR; r <= area.endR; r++) {
    for (let c = area.startC; c <= area.endC; c++) {
      if (frame[r][c] !== 0) {
        const dr = r - pivot.r;
        const dc = c - pivot.c;
        const nr = Math.round(pivot.r + (dr * cos - dc * sin));
        const nc = Math.round(pivot.c + (dr * sin + dc * cos));
        if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
          next[nr][nc] = frame[r][c];
        }
      }
    }
  }
  return next;
}

/** 
 * Shifts an area vertically but stretches the pixels to fill the gap.
 * Useful for limbs to maintain connection to the torso.
 */
export function stretchArea(
  source: Frame,
  target: Frame,
  area: { startR: number; endR: number; startC: number; endC: number },
  dr: number,
  pivotSide: 'top' | 'bottom' = 'top'
): Frame {
  // `dr` only ever moves rows, so the single bound here is the HEIGHT.
  const height = source.length;
  const next = cloneFrame(target);
  if (dr === 0) return next;

  // 1. Move pixels from SOURCE to TARGET (OVERWRITE)
  // We don't clear the target area first to allow for a "smear/stretch" effect
  // that maintains connectivity naturally.
  for (let r = area.startR; r <= area.endR; r++) {
    for (let c = area.startC; c <= area.endC; c++) {
      const nr = r + dr;
      if (source[r][c] !== 0 && nr >= 0 && nr < height) {
        next[nr][c] = source[r][c];
      }
    }
  }

  // 2. Handle Gaps if dr > 1 (fill the middle pixels)
  if (Math.abs(dr) > 1) {
    for (let r = area.startR; r <= area.endR; r++) {
      for (let c = area.startC; c <= area.endC; c++) {
        if (source[r][c] !== 0) {
          // Fill all pixels between r and r+dr
          const step = dr > 0 ? 1 : -1;
          for (let i = step; Math.abs(i) < Math.abs(dr); i += step) {
            const nr = r + i;
            if (nr >= 0 && nr < height) next[nr][c] = source[r][c];
          }
        }
      }
    }
  }

  return next;
}

/** 
 * Clears a specific list of pixels from a frame.
 */
export function clearPixels(
  frame: Frame,
  pixels: { r: number; c: number }[]
): Frame {
  const next = cloneFrame(frame);
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  pixels.forEach(p => {
    if (p.r >= 0 && p.r < height && p.c >= 0 && p.c < width) {
      next[p.r][p.c] = 0;
    }
  });
  return next;
}

/** 
 * Shifts a specific list of pixels from source frame and DRAWs them onto target frame.
 * Does NOT clear target first.
 */
export function shiftPixels(
  source: Frame,
  target: Frame,
  pixels: { r: number; c: number }[],
  dr: number,
  dc: number
): Frame {
  const height = source.length;
  const width = source[0]?.length ?? 0;
  // We mutate the target frame (which is already a clone of base or a cleared frame)
  pixels.forEach(p => {
    const nr = p.r + dr;
    const nc = p.c + dc;
    if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
      const color = source[p.r][p.c];
      if (color !== 0) target[nr][nc] = color;
    }
  });
  
  return target;
}

/**
 * Rotates a specific list of pixels from source frame and DRAWs them onto target frame.
 */
export function rotatePixels(
  source: Frame,
  target: Frame,
  pixels: { r: number; c: number }[],
  pivot: { r: number; c: number },
  angleDeg: number,
  drOffset: number = 0,
  dcOffset: number = 0
): Frame {
  const height = source.length;
  const width = source[0]?.length ?? 0;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  pixels.forEach(p => {
    const dr = p.r - pivot.r;
    const dc = p.c - pivot.c;
    const nr = Math.round(pivot.r + (dr * cos - dc * sin)) + drOffset;
    const nc = Math.round(pivot.c + (dr * sin + dc * cos)) + dcOffset;
    if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
      const color = source[p.r][p.c];
      if (color !== 0) target[nr][nc] = color;
    }
  });
  
  return target;
}

/**
 * Shifts a pixel list but stretches them to fill the gap ONLY if they are connected
 * to static pixels (part of the body that isn't moving). 
 * This prevents the "smearing" effect on external edges like the top of the head.
 */
export function stretchPixels(
  source: Frame,
  target: Frame,
  pixels: { r: number; c: number }[],
  dr: number
): Frame {
  // `dr` only ever moves rows, so the single bound here is the HEIGHT.
  const height = source.length;
  if (dr === 0 || pixels.length === 0) return target;

  // Create a quick lookup for moving pixels
  const movingSet = new Set(pixels.map(p => `${p.r},${p.c}`));

  // 1. Move pixels (Standard shift)
  pixels.forEach(p => {
    const nr = p.r + dr;
    if (nr >= 0 && nr < height) {
      const color = source[p.r][p.c];
      if (color !== 0) target[nr][p.c] = color;
    }
  });

  // 2. Fill gaps (Smart stretch)
  pixels.forEach(p => {
    const step = dr > 0 ? 1 : -1;
    const neighborR = p.r - step;
    const hasStaticNeighbor = 
      neighborR >= 0 &&
      neighborR < height &&
      source[neighborR][p.c] !== 0 && 
      !movingSet.has(`${neighborR},${p.c}`);

    if (hasStaticNeighbor) {
      const color = source[p.r][p.c];
      if (color !== 0) {
        // Fill from original position up to the new position to bridge the gap
        // If dr = -1 (UP), we need to fill row r (i=0) because shiftPixels put it at r-1
        for (let i = 0; Math.abs(i) < Math.abs(dr); i += step) {
          const nr = p.r + i;
          if (nr >= 0 && nr < height) {
            target[nr][p.c] = color;
          }
        }
      }
    }
  });

  return target;
}

/**
 * Rotates a frame 90 degrees clockwise.
 *
 * **THE RESULT'S DIMENSIONS ARE SWAPPED.** A frame of height `h` and width `w`
 * comes back with height `w` and width `h` — rotating a 448x224 drawing gives a
 * 224x448 one, so whoever calls this has to resize the canvas (or rotate twice)
 * to keep the asset consistent. For a square frame (`w === h`) the output is
 * identical to what this function has always returned.
 */
export function rotate90(frame: Frame): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  // The rotated frame has `width` rows of `height` columns.
  const next = blankFrame(height, width);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      next[c][height - 1 - r] = frame[r][c];
    }
  }
  return next;
}

/** Shift all non-zero pixels down by `px` rows. Top rows become transparent. */
export function shiftDown(frame: Frame, px: number): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const out = blankFrame(width, height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const srcR = r - px;
      if (srcR >= 0 && srcR < height) {
        out[r][c] = frame[srcR][c];
      }
    }
  }
  return out;
}

/** Shift all non-zero pixels right by `px` columns. Left columns become transparent. */
export function shiftRight(frame: Frame, px: number): Frame {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const out = blankFrame(width, height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const srcC = c - px;
      if (srcC >= 0 && srcC < width) {
        out[r][c] = frame[r][srcC];
      }
    }
  }
  return out;
}

/**
 * Closes the tears a transform opens inside a silhouette. A column of the
 * frame with a short transparent run between two painted pixels (a "gap") is
 * a tear when the base had no gap near those rows in that column: the head
 * lifted one row off the neck, or a rotated head that left holes. The gap
 * takes the color right above it (the part stretches instead of splitting).
 * Gaps the base already had (between the legs, under an arm) stay.
 */
export function sealGaps(base: Frame, frame: Frame, maxGap: number = 2): Frame {
  const out = cloneFrame(frame);
  const h = frame.length;
  const w = frame[0]?.length ?? 0;
  const baseHole = (r: number, c: number) => {
    if (r < 0 || r >= base.length) return false;
    if (base[r][c] !== 0) return false;
    let above = false, below = false;
    for (let k = r - 1; k >= 0; k--) if (base[k][c] !== 0) { above = true; break; }
    for (let k = r + 1; k < base.length; k++) if (base[k][c] !== 0) { below = true; break; }
    return above && below;
  };
  for (let c = 0; c < w; c++) {
    let r = 0;
    while (r < h && frame[r][c] === 0) r++;
    while (r < h) {
      if (frame[r][c] !== 0) { r++; continue; }
      const start = r;
      while (r < h && frame[r][c] === 0) r++;
      if (r >= h) break; // transparent to the bottom: not inside
      const end = r - 1;
      if (end - start + 1 > maxGap) continue;
      let legit = false;
      for (let k = start - 2; k <= end + 2 && !legit; k++) legit = baseHole(k, c);
      if (legit) continue;
      for (let k = start; k <= end; k++) out[k][c] = frame[start - 1][c];
    }
  }
  return out;
}
