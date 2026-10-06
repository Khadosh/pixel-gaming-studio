import type { Frame, SpriteAsset, SpriteLayer } from './types';
import { blankFrame, blankFrameLike, dims } from '@/headless/assetModel';

// Simple cache for composited frames to stabilize references
const compositeCache = new WeakMap<SpriteAsset, Map<number, Frame>>();

/**
 * Composites all visible layers for a specific frame index into a single Frame.
 * Top-most layers (higher index in the array) override lower layers.
 */
export function compositeFrame(asset: SpriteAsset, frameIndex: number): Frame {
  // Check cache first
  let assetCache = compositeCache.get(asset);
  if (!assetCache) {
    assetCache = new Map();
    compositeCache.set(asset, assetCache);
  }
  
  const cached = assetCache.get(frameIndex);
  if (cached) return cached;

  const { width, height } = dims(asset);
  const result: Frame = blankFrame(width, height);
  
  const layers = asset.layers ?? (asset.frames ? [{ id: 'base', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames: asset.frames }] : []);

  // Iterate from bottom to top (index 0 is bottom)
  for (const layer of layers) {
    if (!layer.isVisible || layer.opacity === 0) continue;
    
    const frame = layer.frames[frameIndex];
    if (!frame) continue;

    for (let r = 0; r < height; r++) {
      const row = frame[r];
      if (!row) continue;

      for (let c = 0; c < width; c++) {
        const val = row[c];
        if (val !== undefined && val !== 0) {
          result[r][c] = val;
        }
      }
    }
  }

  // Save to cache before returning
  assetCache.set(frameIndex, result);
  return result;
}

/**
 * Upscales a frame by 2x: each pixel becomes a 2×2 block.
 * Useful for converting 16x16 assets to 32x32.
 */
export function upscale2x(frame: Frame): Frame {
  const out: Frame = [];
  for (let r = 0; r < frame.length; r++) {
    const rowA: number[] = [];
    const rowB: number[] = [];
    for (let c = 0; c < frame[r].length; c++) {
      const v = frame[r][c];
      rowA.push(v, v);
      rowB.push(v, v);
    }
    out.push(rowA, rowB);
  }
  return out;
}
/**
 * Fits a frame of any size into a target canvas, centering it (1:1 pixels, no
 * upscaling). The target can be non-square: each axis is cropped or centered on
 * its own. `targetHeight` defaults to `targetWidth` (a square, as before).
 */
export function fitFrame(source: Frame, targetWidth: number, targetHeight: number = targetWidth): Frame {
  const sourceHeight = source.length;
  const sourceWidth = source[0]?.length ?? 0;
  const out: Frame = blankFrame(targetWidth, targetHeight);
  // Per axis: a source larger than the target is cropped around its center, a
  // smaller one is placed in the middle. A frame can be wider and shorter.
  const offsetR = Math.floor((sourceHeight - targetHeight) / 2);
  const offsetC = Math.floor((sourceWidth - targetWidth) / 2);
  for (let r = 0; r < targetHeight; r++) {
    for (let c = 0; c < targetWidth; c++) {
      const val = source[r + offsetR]?.[c + offsetC];
      if (val !== undefined && val !== 0) out[r][c] = val;
    }
  }
  return out;
}

/**
 * Ensures a SpriteAsset has at least one layer and migrates legacy 'frames' if needed.
 */
export function ensureLayerSupport(asset: SpriteAsset): SpriteAsset {
  let modifiedAsset = asset;
  if (!modifiedAsset.layers || modifiedAsset.layers.length === 0) {
    // Migrate legacy frames
    const legacyFrames = modifiedAsset.frames || [];
    const baseLayer: SpriteLayer = {
      id: 'layer-base',
      name: 'Base',
      isVisible: true,
      isLocked: false,
      opacity: 1,
      frames: legacyFrames,
    };

    modifiedAsset = {
      ...modifiedAsset,
      layers: [baseLayer],
      frames: undefined, 
    };
  }

  // Ensure ALL layers have at least 4 frames (Front, Side-R, Back, Side-L canonical bases)
  const paddedLayers = modifiedAsset.layers!.map((layer: SpriteLayer) => {
    if (layer.frames.length < 4) {
      const newFrames = [...layer.frames];
      while (newFrames.length < 4) {
        newFrames.push(blankFrameLike(asset));
      }
      return { ...layer, frames: newFrames };
    }
    return layer;
  });

  return { ...modifiedAsset, layers: paddedLayers };
}

/**
 * Creates a new empty frame for all layers in the asset at a specific index.
 */
export function addEmptyFrameToAllLayers(asset: SpriteAsset, frameIndex: number): SpriteAsset {
  const newLayers = asset.layers!.map((layer: SpriteLayer) => {
    const newFrames = [...layer.frames];
    const emptyFrame = blankFrameLike(asset);
    newFrames.splice(frameIndex + 1, 0, emptyFrame);
    return { ...layer, frames: newFrames };
  });

  return {
    ...asset,
    layers: newLayers
  };
}

/**
 * Removes a frame index from all layers.
 */
export function removeFrameFromAllLayers(asset: SpriteAsset, frameIndex: number): SpriteAsset {
  const newLayers = asset.layers!.map((layer: SpriteLayer) => {
    const newFrames = [...layer.frames];
    newFrames.splice(frameIndex, 1);
    return { ...layer, frames: newFrames };
  });

  return {
    ...asset,
    layers: newLayers
  };
}

/**
 * Duplicates a frame index in all layers.
 */
export function duplicateFrameInAllLayers(asset: SpriteAsset, frameIndex: number): SpriteAsset {
  const newLayers = asset.layers!.map((layer: SpriteLayer) => {
    const newFrames = [...layer.frames];
    // Deep clone the frame matrix
    const frameToCopy = layer.frames[frameIndex];
    if (!frameToCopy) return layer;
    const newFrame = frameToCopy.map(row => [...row]);
    newFrames.splice(frameIndex + 1, 0, newFrame);
    return { ...layer, frames: newFrames };
  });

  return {
    ...asset,
    layers: newLayers
  };
}

/**
 * Adds a new layer to the top of the stack.
 */
export function addNewLayer(asset: SpriteAsset, name: string): SpriteAsset {
  const frameCount = asset.layers![0]?.frames.length || asset.frames?.length || 1;

  const newLayer: SpriteLayer = {
    id: `layer-${Date.now()}`,
    name,
    isVisible: true,
    isLocked: false,
    opacity: 1,
    frames: Array.from({ length: frameCount }, () => blankFrameLike(asset)),
    paletteIds: [], // Start with empty palette
  };

  return {
    ...asset,
    layers: [...asset.layers!, newLayer]
  };
}

/**
 * Removes a layer by ID (only if there's more than one layer).
 */
export function removeLayer(asset: SpriteAsset, layerId: string): SpriteAsset {
  if (!asset.layers || asset.layers.length <= 1) return asset;

  return {
    ...asset,
    layers: asset.layers.filter(l => l.id !== layerId)
  };
}

/**
 * Toggles visibility for a layer.
 */
export function toggleLayerVisibility(asset: SpriteAsset, layerId: string): SpriteAsset {
  return {
    ...asset,
    layers: asset.layers!.map(l => 
      l.id === layerId ? { ...l, isVisible: !l.isVisible } : l
    )
  };
}

/**
 * Toggles lock for a layer.
 */
export function toggleLayerLock(asset: SpriteAsset, layerId: string): SpriteAsset {
  return {
    ...asset,
    layers: asset.layers!.map(l => 
      l.id === layerId ? { ...l, isLocked: !l.isLocked } : l
    )
  };
}

/**
 * Renames a layer.
 */
export function renameLayer(asset: SpriteAsset, layerId: string, newName: string): SpriteAsset {
  return {
    ...asset,
    layers: asset.layers!.map(l => 
      l.id === layerId ? { ...l, name: newName } : l
    )
  };
}

/**
 * Reorders layers in the asset.
 */
export function reorderLayers(asset: SpriteAsset, fromIdx: number, toIdx: number): SpriteAsset {
  const newLayers = [...asset.layers!];
  const [moved] = newLayers.splice(fromIdx, 1);
  newLayers.splice(toIdx, 0, moved);
  return { ...asset, layers: newLayers };
}
/**
 * Merges a layer with the one immediately below it.
 * The top layer's non-transparent pixels override the bottom layer's pixels.
 */
export function mergeLayerDown(asset: SpriteAsset, layerId: string): SpriteAsset {
  const index = asset.layers!.findIndex(l => l.id === layerId);
  // Cannot merge if it's the bottom-most layer (index 0) or not found
  if (index <= 0) return asset;

  const topLayer = asset.layers![index];
  const bottomLayer = asset.layers![index - 1];

  // Create merged frames
  // Note: bottomLayer.frames length is used as baseline
  const mergedFrames = bottomLayer.frames.map((bottomFrame, fIdx) => {
    const topFrame = topLayer.frames[fIdx];
    if (!topFrame) return bottomFrame;

    return bottomFrame.map((row, rIdx) => {
      const topRow = topFrame[rIdx];
      if (!topRow) return row;
      
      return row.map((pixel, cIdx) => {
        const topPixel = topRow[cIdx];
        // If top pixel is not transparent (0), use it; otherwise use bottom pixel
        return (topPixel !== 0 && topPixel !== undefined) ? topPixel : pixel;
      });
    });
  });

  const mergedPaletteIds = Array.from(new Set([
    ...(topLayer.paletteIds || []),
    ...(bottomLayer.paletteIds || [])
  ]));

  const mergedLayer: SpriteLayer = {
    ...bottomLayer, // Keep properties of the bottom layer (like name, id etc)
    frames: mergedFrames,
    paletteIds: mergedPaletteIds,
  };

  const newLayers = [...asset.layers!];
  // Replace the two layers with the new merged one
  newLayers.splice(index - 1, 2, mergedLayer);

  return {
    ...asset,
    layers: newLayers
  };
}
/**
 * Removes pixels (frames) that are not referenced by any animation.
 * Adjusts all animation frameIndices to point to the new correct indexes.
 * Frame 0 (the base/rest frame) is ALWAYS preserved.
 */
export function cleanupOrphanedFrames(asset: SpriteAsset): SpriteAsset {
  if (!asset.layers || asset.layers.length === 0) return asset;

  // 1. Gather all unique indices used by animations
  // ALWAYS include indices 0, 1, 2, 3 as they are canonical bases
  const usedIndicesSet = new Set<number>([0, 1, 2, 3]);
  asset.animations.forEach(anim => {
    anim.frameIndices.forEach(idx => usedIndicesSet.add(idx));
  });

  // Sort used indices to maintain relative order
  const usedIndicesSorted = Array.from(usedIndicesSet).sort((a, b) => a - b);
  
  // 2. Map old indices to new indices
  const indexMap = new Map<number, number>();
  usedIndicesSorted.forEach((oldIdx, newIdx) => {
    indexMap.set(oldIdx, newIdx);
  });

  // 3. Rebuild layers with only used frames
  const newLayers = asset.layers.map((layer: SpriteLayer) => ({
    ...layer,
    frames: usedIndicesSorted.map((oldIdx: number) => {
      // If the old index is out of bounds (shouldn't happen but safe-guard), return empty
      return layer.frames[oldIdx] || blankFrameLike(asset);
    })
  }));

  // 4. Update animation definitions to use new indices
  const newAnimations = asset.animations.map((anim: any) => ({
    ...anim,
    frameIndices: anim.frameIndices.map((oldIdx: number) => indexMap.get(oldIdx) ?? 0)
  }));

  return {
    ...asset,
    layers: newLayers,
    animations: newAnimations
  };
}

/**
 * Converts a single frame (number[][]) into a base64 PNG data URL.
 * Useful for sending a reference image to an AI or exporting a single frame.
 * `height` defaults to `width` (a square canvas, as before).
 */
export function frameToDataUrl(frame: number[][], palette: Record<number, string>, width: number, upscale: number = 1, height: number = width): string {
  const canvas = document.createElement('canvas');
  canvas.width = width * upscale;
  canvas.height = height * upscale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Use nearest-neighbor-like rendering by disabling image smoothing if we were drawing images,
  // but here we are drawing rects so it's naturally pixel-perfect.
  ctx.imageSmoothingEnabled = false;

  // Clear background (transparent)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorIdx = frame[y]?.[x];
      if (colorIdx === 0 || colorIdx === undefined) continue; // Skip transparency

      ctx.fillStyle = palette[colorIdx] || '#000000';
      ctx.fillRect(x * upscale, y * upscale, upscale, upscale);
    }
  }

  return canvas.toDataURL('image/png');
}
