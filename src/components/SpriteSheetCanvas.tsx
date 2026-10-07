import { useRef, useEffect, useCallback } from 'react';
import type { SpriteAsset } from '@/lib/types';
import { usePalette } from '@/hooks/usePalette';
import { compositeFrame } from '@/lib/layerUtils';
import { dims } from '@/headless/assetModel';

const GRID_GAP = 1;
const LABEL_WIDTH_BASE = 55;
const CHECKER_SIZE_BASE = 4;

interface SpriteSheetCanvasProps {
  asset: SpriteAsset;
  scale?: number;
  showLabels?: boolean;
  transparent?: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  frameIndex?: number; // Optional: render only a specific frame
}

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  checkerSize: number
) {
  const c1 = '#0a0a14';
  const c2 = '#121220';
  for (let cy = 0; cy < h; cy += checkerSize) {
    for (let cx = 0; cx < w; cx += checkerSize) {
      const isEven = ((cx / checkerSize) + (cy / checkerSize)) % 2 === 0;
      ctx.fillStyle = isEven ? c1 : c2;
      ctx.fillRect(x + cx, y + cy, checkerSize, checkerSize);
    }
  }
}

function isFrameEmpty(frame: (number | undefined)[][] | null): boolean {
  if (!frame) return true;
  for (const row of frame) {
    for (const val of row) {
      if (val !== 0 && val !== undefined) return false;
    }
  }
  return true;
}

function framesAreIdentical(f1: (number | undefined)[][] | null, f2: (number | undefined)[][] | null): boolean {
  if (!f1 || !f2) return f1 === f2;
  if (f1.length !== f2.length) return false;
  for (let r = 0; r < f1.length; r++) {
    if (f1[r].length !== f2[r].length) return false;
    for (let c = 0; c < f1[r].length; c++) {
      if (f1[r][c] !== f2[r][c]) return false;
    }
  }
  return true;
}

export default function SpriteSheetCanvas({ 
  asset, 
  scale = 4, 
  showLabels: showLabelsProp = true,
  transparent = false,
  onCanvasReady,
  frameIndex: singleFrameIndex
}: SpriteSheetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { palette } = usePalette();

  const { width: assetWidth, height: assetHeight } = dims(asset);
  // One cell per frame: its width and height follow the canvas, not a single
  // "size", so a 448x224 drawing is not squeezed into a square.
  const CELL_W = assetWidth * scale;
  const CELL_H = assetHeight * scale;
  const hasAnimations = asset.animations && asset.animations.length > 0;
  const checkerSize = Math.max(2, Math.floor(CHECKER_SIZE_BASE * (scale / 4)));

  // Calculate grid dimensions
  const frameCount = asset.layers?.[0]?.frames.length ?? asset.frames?.length ?? 1;
  const previewCountBase = Math.min(4, frameCount);
  
  const getCompiledFrame = (idx: number) => {
    return asset.layers && asset.layers.length > 0 
      ? compositeFrame(asset, idx) 
      : ((asset.frames?.[idx] as (number | undefined)[][]) || null);
  };

  const rows: { label: string; frameIndices: number[] }[] = [];

  // ORIENTATIONS row (canonical 0, 1, 2, 3)
  const orientationIndices = [0, 1, 2, 3].filter(idx => idx < frameCount);
  
  if (orientationIndices.length > 0) {
    rows.push({
      label: 'VIEWS',
      frameIndices: orientationIndices,
    });
  }

  if (hasAnimations) {
    asset.animations.forEach(a => {
      // Avoid duplicating the base row if an animation is explicitly named BASE
      if (a.label.toUpperCase() === 'BASE') return;
      
      const indices = [...a.frameIndices];
      // Trim trailing empty frames
      while (indices.length > 0 && isFrameEmpty(getCompiledFrame(indices[indices.length - 1]))) {
        indices.pop();
      }
      
      if (indices.length > 0) {
        rows.push({
          label: a.label,
          frameIndices: indices,
        });
      }
    });
  }

  const maxCols = Math.max(...rows.map(r => r.frameIndices.length));
  // Force labels if requested, unless the asset is purely static with 1 frame
  const effectiveShowLabels = showLabelsProp;
  const labelW = effectiveShowLabels ? (LABEL_WIDTH_BASE * Math.max(0.8, scale / 4)) : 0;

  const totalWidth = singleFrameIndex !== undefined 
    ? CELL_W 
    : (labelW + maxCols * (CELL_W + GRID_GAP) + 1);
  const totalHeight = singleFrameIndex !== undefined
    ? CELL_H
    : (rows.length * (CELL_H + GRID_GAP) + 1);

  const drawSingleFrame = useCallback((ctx: CanvasRenderingContext2D, fIdx: number) => {
    drawCheckerboard(ctx, 0, 0, CELL_W, CELL_H, checkerSize);
    const frame = asset.layers && asset.layers.length > 0 
      ? compositeFrame(asset, fIdx) 
      : (asset.frames?.[fIdx] || null);
      
    if (!frame) return;

    for (let fRow = 0; fRow < assetHeight; fRow++) {
      const row = frame[fRow];
      if (!row) continue;
      for (let fCol = 0; fCol < assetWidth; fCol++) {
        const val = row[fCol];
        if (val === undefined || !val || val === 0) continue;
        const color = palette[val];
        if (!color || color === 'transparent') continue;
        ctx.fillStyle = color;
        ctx.fillRect(fCol * scale, fRow * scale, scale, scale);
      }
    }
  }, [asset, assetWidth, assetHeight, palette, scale, CELL_W, CELL_H, checkerSize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Main background - skip if transparent to show CSS grid
    if (!transparent) {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Label column background highlight
    if (effectiveShowLabels) {
      ctx.fillStyle = transparent ? 'rgba(10, 10, 15, 0.85)' : '#0a0a0f';
      ctx.fillRect(0, 0, labelW, totalHeight);
      ctx.strokeStyle = '#22c55e33'; // Faint emerald border
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(labelW - 0.5, 0);
      ctx.lineTo(labelW - 0.5, totalHeight);
      ctx.stroke();
    }

    if (singleFrameIndex !== undefined) {
      drawSingleFrame(ctx, singleFrameIndex);
    } else {
      rows.forEach((row, rowIdx) => {
        const y = rowIdx * (CELL_H + GRID_GAP);

        // Draw row label
        if (effectiveShowLabels) {
          ctx.fillStyle = '#4ade80'; // Emerald-400
          // Nube 8 vive en una celda de 8 px: a 8 un píxel del dibujo es un
          // píxel de lienzo. A 16 "ATTACK" ya no entra en la columna, así que
          // la etiqueta de fila se queda en 8 sea cual sea la escala.
          ctx.font = '8px "Nube 8", "Courier New", monospace';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(row.label.toUpperCase(), 6, y + CELL_H / 2);
        }

        // Draw each frame in this row
        row.frameIndices.forEach((frameIdx, colIdx) => {
          const x = labelW + colIdx * (CELL_W + GRID_GAP);
          drawCheckerboard(ctx, x, y, CELL_W, CELL_H, checkerSize);
          
          ctx.strokeStyle = '#1e1e2e';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, CELL_W, CELL_H);

          const frame = asset.layers && asset.layers.length > 0 
            ? compositeFrame(asset, frameIdx) 
            : (asset.frames?.[frameIdx] || null);
            
          if (!frame) return;

          for (let fRow = 0; fRow < assetHeight; fRow++) {
            const row = frame[fRow];
            if (!row) continue;

            for (let fCol = 0; fCol < assetWidth; fCol++) {
              const val = row[fCol];
              if (val === undefined || !val || val === 0) continue;
              const color = palette[val];
              if (!color || color === 'transparent') continue;
              ctx.fillStyle = color;
              ctx.fillRect(
                x + fCol * scale,
                y + fRow * scale,
                scale,
                scale
              );
            }
          }
        });
      });
    }

    onCanvasReady?.(canvas);
  }, [asset, assetWidth, assetHeight, palette, onCanvasReady, rows, CELL_W, CELL_H, labelW, effectiveShowLabels, scale, checkerSize, totalHeight]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={totalWidth}
      height={totalHeight}
      className="rounded-sm shadow-2xl border border-white/5"
      style={{ imageRendering: 'pixelated', width: totalWidth, height: totalHeight }}
    />
  );
}
