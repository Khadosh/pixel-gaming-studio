import { SpriteAsset, SpriteLayer, Frame } from '@/lib/types';
import { compositeFrame } from '@/lib/layerUtils';
import { dims } from '@/headless/assetModel';
import { GifWriter } from 'omggif';
import { saveAs } from 'file-saver';

export const PIXEL_SCALE = 4;
const LABEL_WIDTH = 80;

/** One sprite sheet cell at PIXEL_SCALE: as wide and as tall as the canvas. */
export function pngCellSize(asset: SpriteAsset): { cellW: number; cellH: number } {
  const { width, height } = dims(asset);
  return { cellW: width * PIXEL_SCALE, cellH: height * PIXEL_SCALE };
}

/** The scale a GIF is drawn at for a small sprite. */
export const GIF_SCALE = 10;

/**
 * The longest side a GIF may reach. 128 * GIF_SCALE = 1280, so every square
 * canvas the editor offers (16, 32, 64, 128) still exports at 10x, byte for
 * byte what it exported before. A 512x320 map would have asked for a
 * 5120x5120 buffer (~26 MB of indices per frame, an out-of-memory hang), so
 * it drops to the largest integer scale that fits the budget: 2x → 1024x640.
 */
export const GIF_MAX_SIDE = 1280;

/** Canvas size and integer scale of the GIF for this asset. */
export function gifDimensions(asset: SpriteAsset): { scale: number; width: number; height: number } {
  const { width, height } = dims(asset);
  const longest = Math.max(1, width, height);
  const scale = Math.max(1, Math.min(GIF_SCALE, Math.floor(GIF_MAX_SIDE / longest)));
  return { scale, width: width * scale, height: height * scale };
}

/**
 * Blows a frame up by `scale` into a GIF index buffer. The row stride is the
 * scaled WIDTH (it used to be the square side, which skewed every non-square
 * drawing diagonally).
 */
export function scaleFrameToGifIndices(
  frame: Frame,
  srcWidth: number,
  srcHeight: number,
  scale: number,
  colorMap: Map<number, number>,
): Uint8Array {
  const outWidth = srcWidth * scale;
  const out = new Uint8Array(outWidth * srcHeight * scale);
  for (let r = 0; r < srcHeight; r++) {
    const row = frame[r];
    for (let c = 0; c < srcWidth; c++) {
      const val = row?.[c] ?? 0;
      const paletteIdx = colorMap.has(val) ? colorMap.get(val)! : 0;
      if (paletteIdx === 0) continue; // the buffer is already zeroed
      for (let sr = 0; sr < scale; sr++) {
        const base = (r * scale + sr) * outWidth + c * scale;
        for (let sc = 0; sc < scale; sc++) {
          out[base + sc] = paletteIdx;
        }
      }
    }
  }
  return out;
}

/**
 * Handles exporting the sprite asset as a PNG sprite sheet.
 */
export const exportAsPNG = (asset: SpriteAsset, options: { includeLabels?: boolean } = {}) => {
  const { includeLabels } = options;
  const hasAnims = asset.animations.length > 0;
  let exportRows: { label: string; frameIndices: number[] }[];

  if (hasAnims) {
    exportRows = asset.animations.map(a => ({ label: a.label, frameIndices: a.frameIndices }));
  } else {
    exportRows = [{ label: 'Base', frameIndices: asset.layers?.[0]?.frames.map((_, i) => i) || [0] }];
  }

  const { cellW, cellH } = pngCellSize(asset);
  const { width: assetWidth, height: assetHeight } = dims(asset);
  const maxCols = Math.max(...exportRows.map(r => r.frameIndices.length));
  
  const labelOffset = includeLabels ? LABEL_WIDTH : 0;
  const w = maxCols * cellW + labelOffset;
  const h = exportRows.length * cellH;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  if (includeLabels) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Courier New", monospace';
    ctx.textBaseline = 'middle';
  }

  exportRows.forEach((row, rowIdx) => {
    const y = rowIdx * cellH;
    
    if (includeLabels) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(row.label.toUpperCase(), 5, y + cellH / 2);
    }

    row.frameIndices.forEach((frameIdx, colIdx) => {
      const x = labelOffset + colIdx * cellW;
      const frame = compositeFrame(asset, frameIdx);
      if (!frame) return;
      
      for (let fRow = 0; fRow < assetHeight; fRow++) {
        for (let fCol = 0; fCol < assetWidth; fCol++) {
          const val = frame[fRow]?.[fCol] ?? 0;
          if (val === 0) continue;
          const color = asset.palette[val];
          if (!color || color === 'transparent') continue;
          ctx.fillStyle = color;
          ctx.fillRect(x + fCol * PIXEL_SCALE, y + fRow * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
        }
      }
    });
  });

  const link = document.createElement('a');
  link.download = `${asset.id || 'sprite'}-spritesheet${includeLabels ? '-labeled' : ''}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

/**
 * Exports a single layer's frame as a static PNG (no compositing with other layers).
 * Opacity and visibility of the layer are ignored: the layer is exported as-is, at full opacity.
 */
export const exportLayerAsPNG = (asset: SpriteAsset, layer: SpriteLayer, frameIndex: number) => {
  const frame = layer.frames[frameIndex];
  if (!frame) return;

  const { cellW, cellH } = pngCellSize(asset);
  const { width: assetWidth, height: assetHeight } = dims(asset);
  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, cellW, cellH);

  for (let r = 0; r < assetHeight; r++) {
    for (let c = 0; c < assetWidth; c++) {
      const val = frame[r]?.[c] ?? 0;
      if (val === 0) continue;
      const color = asset.palette[val];
      if (!color || color === 'transparent') continue;
      ctx.fillStyle = color;
      ctx.fillRect(c * PIXEL_SCALE, r * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
    }
  }

  const layerSlug = (layer.name || 'layer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const link = document.createElement('a');
  link.download = `${asset.id || 'sprite'}-${layerSlug}-f${frameIndex}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

/**
 * Handles exporting the selected animation as an animated GIF using omggif.
 */
export const exportAsGIF = async (asset: SpriteAsset, animationName: string, fps: number = 10) => {
  const anim = asset.animations.find(a => a.name === animationName);
  const frameIndices = anim ? anim.frameIndices : [0];
  
  const { width: assetWidth, height: assetHeight } = dims(asset);
  const { scale, width: gifWidth, height: gifHeight } = gifDimensions(asset);
  
  // Prepare a large enough buffer for the GIF
  const buffer = new Uint8Array(gifWidth * gifHeight * frameIndices.length + 1024 * 1024);
  const gifWriter = new GifWriter(buffer, gifWidth, gifHeight, { loop: 0 });

  // Map palette to omggif colors (integers)
  // omggif expectations: palette is an array of colors
  // and each frame is an array of indices into that palette.
  const paletteKeys = Object.keys(asset.palette).map(Number).sort((a, b) => a - b);
  const colorMap = new Map<number, number>();
  const gifPalette: number[] = [];

  // Transparents handling: omggif has a transparent option in addFrame
  let transparentIndex = -1;

  paletteKeys.forEach((key, idx) => {
    const hex = asset.palette[key];
    if (hex === 'transparent') {
      transparentIndex = idx;
      gifPalette.push(0); // Placeholder
    } else {
      // Convert hex to integer
      const colorInt = parseInt(hex.replace('#', ''), 16);
      gifPalette.push(colorInt);
    }
    colorMap.set(key, idx);
  });

  // Ensure palette is a power of 2 for omggif
  while (gifPalette.length < 2 || (gifPalette.length & (gifPalette.length - 1)) !== 0) {
    gifPalette.push(0);
  }

  for (const frameIdx of frameIndices) {
    const frame = compositeFrame(asset, frameIdx);
    if (!frame) continue;

    const frameData = scaleFrameToGifIndices(frame, assetWidth, assetHeight, scale, colorMap);

    gifWriter.addFrame(0, 0, gifWidth, gifHeight, frameData as any, {
      palette: gifPalette,
      delay: Math.round(100 / fps),
      transparent: transparentIndex >= 0 ? transparentIndex : undefined,
      disposal: 2 // Restore to background color (avoids ghosting)
    });
  }

  const gifLength = gifWriter.getOutputBufferPosition();
  const blob = new Blob([buffer.slice(0, gifLength)], { type: 'image/gif' });
  saveAs(blob, `${asset.id || 'sprite'}-${animationName}.gif`);
};
