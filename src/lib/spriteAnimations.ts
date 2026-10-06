import type { SpriteAsset, AnimationDef, SpriteLayer, Frame, AdvancedCastSettings, CastElement, CastShape } from '@/lib/types';
import { ensureLayerSupport } from '@/lib/layerUtils';
import { blankFrameLike, dims } from '@/headless/assetModel';
import {
  generateIdle,
  generateWalk,
  generateWalkSide,
  generateCast,
  generateAttack,
  generateHurt,
  generateDie,
  generateRun,
  generateJump,
  shiftDown,
  getCenterOfMass,
  drawCircle,
  drawBurst,
  drawBeam,
  drawSparks,
  drawPulse,
  flipHorizontal,
  generateWalkTopDown,
  generateAttackTopDown,
  resolveMembers,
  clearPixels,
  cloneFrame,
  shiftPixels,
  stretchPixels,
} from '@/lib/spriteTransforms';

/**
 * Takes a SpriteAsset and generates animation frames client-side.
 */
export function generateAnimationsClientSide(
  asset: SpriteAsset,
  animationTypes: string[],
  castSettings?: AdvancedCastSettings,
  options?: { customName?: string; customLabel?: string; baseIndex?: number }
): SpriteAsset {
  let currentAsset = ensureLayerSupport(asset);

  for (const type of animationTypes) {
    if (type === 'cast' && castSettings) {
      currentAsset = generateAdvancedCastSequence(currentAsset, castSettings, options);
      continue;
    }

    // Existing simple generation...
    const newLayers: SpriteLayer[] = currentAsset.layers!.map(layer => ({
      ...layer,
      frames: layer.frames.map(f => f.map(r => [...r]))
    }));
    
    const paletteKeys = Object.keys(currentAsset.palette).map(Number).filter(k => k > 0);
    const glowColor = Math.max(...paletteKeys);

    const startIndex = newLayers[0].frames.length;
    newLayers.forEach(layer => {
      const baseFrame = layer.frames[options?.baseIndex ?? 0] || layer.frames[0];
      const frames = generateFrameSequence(baseFrame, type, glowColor, currentAsset.anatomy);
      layer.frames.push(...frames);
    });

    const generatedCount = newLayers[0].frames.length - startIndex;

    // Use custom name/label if provided (primarily for the slice to handle unique names)
    const finalName = options?.customName || type;
    const finalLabel = options?.customLabel || type.toUpperCase();

    const isWalk = type.includes('walk') || type.includes('move') || type.includes('run');
    const fps = isWalk ? 10 : (type === 'idle' ? 3 : (type === 'cast' ? 4 : 5));
    const newAnimDef: AnimationDef = {
      name: finalName,
      label: finalLabel,
      frameIndices: Array.from({ length: generatedCount }, (_, i) => startIndex + i),
      fps,
    };

    const existingIdx = currentAsset.animations.findIndex((a: AnimationDef) => a.name === finalName);
    const newAnimations = [...currentAsset.animations];
    if (existingIdx >= 0) {
      newAnimations[existingIdx] = newAnimDef;
    } else {
      newAnimations.push(newAnimDef);
    }

    currentAsset = { ...currentAsset, layers: newLayers, animations: newAnimations };
  }

  return currentAsset;
}

/**
 * Creates an advanced 6-frame cast animation with buildup, impact, and dissipation.
 */
export function generateAdvancedCastSequence(
  asset: SpriteAsset,
  settings: AdvancedCastSettings,
  options?: { customName?: string; customLabel?: string; baseIndex?: number }
): SpriteAsset {
  const { width, height } = dims(asset);
  const layers = [...asset.layers!];
  
  // 1. Ensure/Find the "Cast Effect" layer
  let effectLayerIdx = layers.findIndex(l => l.name.toLowerCase().includes('effect'));
  if (effectLayerIdx === -1) {
    const newLayer: SpriteLayer = {
      id: `layer-effect-${Date.now()}`,
      name: 'Cast Effect',
      isVisible: true,
      isLocked: false,
      opacity: 1,
      frames: Array.from({ length: layers[0].frames.length }, () => blankFrameLike(asset)),
    };
    layers.push(newLayer);
    effectLayerIdx = layers.length - 1;
  }

  const baseLayerIdx = layers.findIndex(l => l.name.toLowerCase().includes('base')) || 0;
  const baseFrame = layers[baseLayerIdx].frames[options?.baseIndex ?? 0] || layers[baseLayerIdx].frames[0];
  const startIndex = layers[0].frames.length;
  
  // 2. Identify colors (Triplet: { main, light, dark })
  const { updatedAsset, colors } = getElementalColors(asset, settings.element);
  const { main, light, dark } = colors;
  
  const com = getCenterOfMass(baseFrame) || { r: height / 2, c: width / 2 };

  // 3. Finalize Effect Layer Palette
  if (layers[effectLayerIdx]) {
    layers[effectLayerIdx] = {
      ...layers[effectLayerIdx],
      paletteIds: [main, light, dark] // Only these colors in the effect layer
    };
  }

  // 4. Randomization (if selected)
  let shape = settings.shape;
  const randomizedOrigin = { r: com.r - 2, c: com.c + 4 };
  if (shape === 'random') {
    const shapes: CastShape[] = ['circle', 'burst', 'beam', 'spark', 'pulse'];
    shape = shapes[Math.floor(Math.random() * shapes.length)];
    // Slight shift in origin
    randomizedOrigin.r += (Math.random() - 0.5) * 4;
    randomizedOrigin.c += (Math.random() - 0.5) * 4;
  }
  // Define 6 frames for all layers
  for (let i = 0; i < 6; i++) {
    layers.forEach((layer, lIdx) => {
      const isBase = lIdx === baseLayerIdx;
      const isEffect = lIdx === effectLayerIdx;
      
      let nextFrame: Frame;
      
      if (isBase) {
        // Character recoil logic using anatomical segments and PIXEL transforms
        const members = resolveMembers(baseFrame, asset.anatomy, options?.baseIndex ?? 0);
        const { head, torso, arm_left, arm_right, leg_left, leg_right } = members;
        
        const movingParts = [
          ...(torso?.pixels || []),
          ...(head?.pixels || []),
          ...(arm_left?.pixels || []),
          ...(arm_right?.pixels || []),
          ...(leg_left?.pixels || []),
          ...(leg_right?.pixels || [])
        ];

        let f = clearPixels(cloneFrame(baseFrame), movingParts);
        
        if (i < 2) { // Buildup: anticipation lean back
           if (torso && head) {
             const upper = [...torso.pixels, ...head.pixels, ...(arm_left?.pixels || []), ...(arm_right?.pixels || [])];
             f = shiftPixels(baseFrame, f, upper, 0, -1);
           }
           if (leg_left) f = shiftPixels(baseFrame, f, leg_left.pixels, 0, 0);
           if (leg_right) f = shiftPixels(baseFrame, f, leg_right.pixels, 0, 0);
        } else if (i < 4) { // Impact: lunge & thrust forward
           if (torso && head) {
             const upper = [...torso.pixels, ...head.pixels, ...(arm_left?.pixels || []), ...(arm_right?.pixels || [])];
             f = shiftPixels(baseFrame, f, upper, -1, 2); // Rise and lunge
           }
           if (leg_left) f = shiftPixels(baseFrame, f, leg_left.pixels, 0, 1);
           if (leg_right) f = stretchPixels(baseFrame, f, leg_right.pixels, 1);
        } else { // Recovery: settle
           if (torso && head) {
             const upper = [...torso.pixels, ...head.pixels, ...(arm_left?.pixels || []), ...(arm_right?.pixels || [])];
             f = shiftPixels(baseFrame, f, upper, 1, 1);
           }
           if (leg_left) f = shiftPixels(baseFrame, f, leg_left.pixels, 0, 0);
           if (leg_right) f = shiftPixels(baseFrame, f, leg_right.pixels, 0, 0);
        }
        nextFrame = f;
      } else if (isEffect) {
        // Spell effect logic
        nextFrame = blankFrameLike(asset);
        const effectOrigin = randomizedOrigin;

        if (i > 0) { // No effect on frame 0
          const intensity = i < 4 ? i / 3 : Math.max(0, (6 - i) / 3);
          
          switch (shape) {
            case 'circle': {
              const radius = i < 4 ? i * 1.5 : Math.max(0, (6 - i) * 1.5);
              nextFrame = drawCircle(nextFrame, effectOrigin.r, effectOrigin.c, radius, main, { light, dark });
              break;
            }
            case 'burst':
              nextFrame = drawBurst(nextFrame, effectOrigin.r, effectOrigin.c, intensity, main, { light, dark });
              break;
            case 'beam':
              nextFrame = drawBeam(nextFrame, effectOrigin.r, effectOrigin.c, intensity, main, { light, dark });
              break;
            case 'spark':
              nextFrame = drawSparks(nextFrame, effectOrigin.r, effectOrigin.c, intensity, main, { light, dark });
              break;
            case 'pulse':
              nextFrame = drawPulse(nextFrame, effectOrigin.r, effectOrigin.c, intensity, main, { light, dark });
              break;
          }
        }
      } else {
        // PRESERVE OTHER LAYERS (Eyes, Clothes, etc.)
        const layerBaseFrame = layer.frames[0] || blankFrameLike(asset);
        if (i < 2) {
          nextFrame = generateIdle(layerBaseFrame)[1];
        } else if (i < 4) {
          nextFrame = shiftDown(layerBaseFrame, -1);
        } else {
          nextFrame = layerBaseFrame.map(r => [...r]);
        }
      }
      
      layer.frames = [...layer.frames, nextFrame];
    });
  }

  const finalName = options?.customName || 'cast';
  const finalLabel = options?.customLabel || 'CAST';

  const newAnimDef: AnimationDef = {
    name: finalName,
    label: finalLabel,
    frameIndices: Array.from({ length: 6 }, (_, i) => startIndex + i),
    fps: 8,
  };

  const animations = [...updatedAsset.animations];
  const existingIdx = animations.findIndex((a: AnimationDef) => a.name === finalName);
  if (existingIdx >= 0) animations[existingIdx] = newAnimDef;
  else animations.push(newAnimDef);

  return { ...updatedAsset, layers, animations };
}

const ELEMENT_PALETTES: Record<Exclude<CastElement, 'generic'>, string[]> = {
  fire: ['#662200', '#ff4d00', '#ffcc00'], // Dark Brown-Red, Orange, Yellow
  water: ['#003366', '#0099ff', '#99ffff'], // Dark Blue, Blue, Cyan
  electric: ['#4b0082', '#ffff00', '#ffffff'], // Purple, Yellow, White
  nature: ['#003300', '#33cc33', '#ccffcc'], // Dark Green, Green, Light Green
  ice: ['#006666', '#99ffff', '#ffffff'], // Dark Cyan, Cyan, White
};

/**
 * Returns a shaded triplet of color indices for an element.
 * Automatically adds the colors to the asset's palette if they are missing.
 */
function getElementalColors(asset: SpriteAsset, element: CastElement): { updatedAsset: SpriteAsset, colors: { main: number, light: number, dark: number } } {
  const palette = { ...asset.palette };
  const entries = Object.entries(palette).map(([k, v]) => ({ key: Number(k), hex: v.toLowerCase() })).filter(e => e.key > 0);
  
  if (element === 'generic' || !ELEMENT_PALETTES[element]) {
    const main = Math.max(...entries.map(e => e.key), 1);
    return { updatedAsset: asset, colors: { main, light: main, dark: main } };
  }

  const shadeHexes = ELEMENT_PALETTES[element];
  const colorIndices: number[] = [];
  let currentAsset = { ...asset };

  shadeHexes.forEach(hex => {
    // Fuzzy match
    const found = entries.find(e => e.hex.startsWith(hex.substring(0, 4)));
    if (found) {
      colorIndices.push(found.key);
    } else {
      // Add to palette with NEW reference to trigger React updates
      const nextIdx = Math.max(0, ...Object.keys(currentAsset.palette).map(Number)) + 1;
      currentAsset = {
        ...currentAsset,
        palette: { ...currentAsset.palette, [nextIdx]: hex },
        colorNames: { ...currentAsset.colorNames, [nextIdx]: `${element.toUpperCase()} SHADE` }
      };
      colorIndices.push(nextIdx);
    }
  });

  return { 
    updatedAsset: currentAsset, 
    colors: { 
      dark: colorIndices[0],
      main: colorIndices[1],
      light: colorIndices[2],
    }
  };
}

function generateFrameSequence(
  base: number[][],
  anim: string,
  glowColor: number,
  anatomy?: any
): number[][][] {
  let isLeft = false;
  let isUpDir = false;
  let isDownDir = false;
  let baseAnim = anim;
  
  if (anim.endsWith('_left')) {
    isLeft = true;
    baseAnim = anim.replace('_left', '');
  } else if (anim.endsWith('_right')) {
    baseAnim = anim.replace('_right', '');
  } else if (anim.endsWith('_down')) {
    isDownDir = true;
    baseAnim = anim.replace('_down', '');
  } else if (anim.endsWith('_up')) {
    isUpDir = true;
    baseAnim = anim.replace('_up', '');
  }

  let frames: number[][][];
  let orientationIdx = 0; // 0: Front, 1: Side, 2: Back

  if (isUpDir) orientationIdx = 2;
  else if (isLeft || anim.endsWith('_right')) orientationIdx = 1;
  else orientationIdx = 0;

  switch (baseAnim) {
    case 'idle':
      frames = generateIdle(base, anatomy, orientationIdx);
      break;
    case 'walk':
      if (isUpDir || isDownDir) {
        frames = generateWalkTopDown(base, anatomy, orientationIdx);
      } else if (isLeft || anim.endsWith('_right')) {
        frames = generateWalkSide(base, anatomy, orientationIdx);
      } else {
        frames = generateWalk(base, anatomy, orientationIdx);
      }
      break;
    case 'run':
      frames = generateRun(base, anatomy, orientationIdx);
      break;
    case 'attack':
      if (isUpDir || isDownDir) {
        frames = generateAttackTopDown(base, anatomy, orientationIdx);
      } else {
        frames = generateAttack(base, anatomy, orientationIdx);
      }
      break;
    case 'cast':
      frames = generateCast(base, glowColor, anatomy, orientationIdx);
      break;
    case 'hurt':
      frames = generateHurt(base, anatomy, orientationIdx);
      break;
    case 'die':
      frames = generateDie(base, anatomy, orientationIdx);
      break;
    case 'jump':
      frames = generateJump(base, anatomy, orientationIdx);
      break;
    default:
      frames = [generateIdle(base, anatomy)[0]];
      break;
  }

  // Auto-flip for left animations assuming base is right facing
  if (isLeft) {
    frames = frames.map(f => flipHorizontal(f));
  }

  return frames;
}

/**
 * Injects 3 externally generated frames (e.g. from AI) into a SpriteAsset
 * to form a 4-frame animation (baseFrame + 3 new frames).
 * AI frames are injected ONLY into the first layer.
 */
export function addExternalAnimation(
  asset: SpriteAsset,
  animationName: string,
  newFrames: number[][][],
  targetLayerId?: string | null,
): SpriteAsset {
  if (newFrames.length !== 3) {
    throw new Error('addExternalAnimation expects exactly 3 new frames');
  }

  const layeredAsset = ensureLayerSupport(asset);
  
  // Find which layer to inject into
  let targetIdx = 0;
  if (targetLayerId) {
    const found = layeredAsset.layers!.findIndex(l => l.id === targetLayerId);
    if (found >= 0) targetIdx = found;
  } else {
    // Fallback: search for "Base" or "Main"
    const baseIdx = layeredAsset.layers!.findIndex(l => l.name.toLowerCase().includes('base') || l.name.toLowerCase().includes('main'));
    if (baseIdx >= 0) targetIdx = baseIdx;
  }

   const startIndex = layeredAsset.layers![0].frames.length;
   const newLayers = layeredAsset.layers!.map((layer, idx) => {
    const frames = [...layer.frames];
    if (idx === targetIdx) {
      frames.push(...newFrames);
    } else {
      // Add empty frames to other layers to maintain alignment
      for (let i = 0; i < 3; i++) {
        frames.push(blankFrameLike(layeredAsset));
      }
    }
    return { ...layer, frames };
  });

  const fps = animationName === 'idle' ? 3 : animationName === 'cast' ? 4 : 5;
  const newAnimation: AnimationDef = {
    name: animationName,
    label: animationName.toUpperCase(),
    frameIndices: [0, startIndex, startIndex + 1, startIndex + 2],
    fps,
  };

  const animations = [...layeredAsset.animations];
  const existingIdx = animations.findIndex(a => a.name === animationName);
  
  if (existingIdx >= 0) {
    animations[existingIdx] = newAnimation;
  } else {
    animations.push(newAnimation);
  }

  return {
    ...layeredAsset,
    layers: newLayers,
    animations,
  };
}

/**
 * Duplicates the frame index in all layers.
 */
export function duplicateFrameInAllLayers(asset: SpriteAsset, targetIdx: number): SpriteAsset {
   const newLayers = asset.layers!.map(layer => {
    const newFrames = [...layer.frames];
    const frameToCopy = newFrames[targetIdx].map(row => [...row]);
    newFrames.splice(targetIdx + 1, 0, frameToCopy);
    return { ...layer, frames: newFrames };
  });

  const newAnimations = asset.animations.map((anim: AnimationDef) => ({
    ...anim,
    frameIndices: anim.frameIndices.flatMap((oldIdx: number) => {
      if (oldIdx === targetIdx) return [oldIdx, targetIdx + 1];
      return oldIdx > targetIdx ? oldIdx + 1 : oldIdx;
    })
  }));

  return { ...asset, layers: newLayers, animations: newAnimations };
}

/**
 * Adds an empty frame after the specified index in all layers.
 */
export function addEmptyFrameToAllLayers(asset: SpriteAsset, afterIdx: number): SpriteAsset {
   const newLayers = asset.layers!.map(layer => {
    const newFrames = [...layer.frames];
    const emptyFrame = blankFrameLike(asset);
    newFrames.splice(afterIdx + 1, 0, emptyFrame);
    return { ...layer, frames: newFrames };
  });

  const newAnimations = asset.animations.map(anim => ({
    ...anim,
    frameIndices: anim.frameIndices.flatMap(oldIdx => {
      if (oldIdx === afterIdx) return [oldIdx, afterIdx + 1];
      return oldIdx > afterIdx ? oldIdx + 1 : oldIdx;
    })
  }));

  return { ...asset, layers: newLayers, animations: newAnimations };
}

/**
 * Removes a frame index from all layers.
 */
export function removeFrameFromAllLayers(asset: SpriteAsset, targetIdx: number): SpriteAsset {
  const firstLayer = asset.layers![0];
  if (firstLayer.frames.length <= 1) return asset;

   const newLayers = asset.layers!.map(layer => {
    const newFrames = [...layer.frames];
    newFrames.splice(targetIdx, 1);
    return { ...layer, frames: newFrames };
  });

  const newAnimations = asset.animations.map((anim: AnimationDef) => {
    const validIndices = anim.frameIndices.filter((oldIdx: number) => oldIdx !== targetIdx);
    return {
      ...anim,
      frameIndices: validIndices.map((oldIdx: number) => oldIdx > targetIdx ? oldIdx - 1 : oldIdx)
    };
  });

  return { ...asset, layers: newLayers, animations: newAnimations };
}

/**
 * Moves a frame from one index to another, updating all layers.
 */
export function moveFrame(asset: SpriteAsset, fromIdx: number, toIdx: number): SpriteAsset {
  const frameCount = asset.layers![0]?.frames.length || 0;
  if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= frameCount || toIdx >= frameCount) {
    return asset;
  }

  const newLayers = asset.layers!.map(layer => {
    const newFrames = [...layer.frames];
    const [movedFrame] = newFrames.splice(fromIdx, 1);
    newFrames.splice(toIdx, 0, movedFrame);
    return { ...layer, frames: newFrames };
  });

  const newAnimations = asset.animations.map((anim: AnimationDef) => ({
    ...anim,
    frameIndices: anim.frameIndices.map((oldIdx: number) => {
      if (oldIdx === fromIdx) return toIdx;
      if (fromIdx > toIdx) { // Moved left
        if (oldIdx >= toIdx && oldIdx < fromIdx) return oldIdx + 1;
      } else { // Moved right
        if (oldIdx > fromIdx && oldIdx <= toIdx) return oldIdx - 1;
      }
      return oldIdx;
    })
  }));

  return { ...asset, layers: newLayers, animations: newAnimations };
}
