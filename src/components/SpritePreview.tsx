import { useRef, useEffect } from 'react';
import type { SpriteAsset } from '@/lib/types';
import { usePalette } from '@/hooks/usePalette';
import { useAssetPreview } from '@/hooks/useAssetPreview';
import { dims } from '@/headless/assetModel';

interface SpritePreviewProps {
  asset: SpriteAsset;
  animationName?: string | null;
  scale?: number;
  showLabel?: boolean;
  currentFrameOverride?: number[][];
}

export default function SpritePreview({ 
  asset, 
  animationName = null, 
  scale = 6,
  showLabel = true,
  currentFrameOverride
}: SpritePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { palette } = usePalette();
  const previewState = useAssetPreview(asset, animationName);
  const currentFrame = currentFrameOverride || previewState.currentFrame;
  const { currentAnimation } = previewState;

  const { width: assetWidth, height: assetHeight } = dims(asset);
  const PREVIEW_WIDTH = assetWidth * scale;
  const PREVIEW_HEIGHT = assetHeight * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    // Draw checkerboard background. The cell comes from the longest side, so a
    // square canvas keeps exactly the checker it had.
    const cs = Math.max(4, Math.floor(Math.max(PREVIEW_WIDTH, PREVIEW_HEIGHT) / 8));
    for (let y = 0; y < PREVIEW_HEIGHT; y += cs) {
      for (let x = 0; x < PREVIEW_WIDTH; x += cs) {
        const isEven = ((x / cs) + (y / cs)) % 2 === 0;
        ctx.fillStyle = isEven ? '#1e1e2e' : '#252538';
        ctx.fillRect(x, y, cs, cs);
      }
    }

    // Draw sprite
    if (currentFrame) {
      for (let row = 0; row < assetHeight; row++) {
        for (let col = 0; col < assetWidth; col++) {
          const val = currentFrame[row]?.[col];
          if (!val || val === 0) continue;
          const color = palette?.[val];
          if (!color || color === 'transparent') continue;
          ctx.fillStyle = color;
          ctx.fillRect(col * scale, row * scale, scale, scale);
        }
      }
    }
  }, [asset, assetWidth, assetHeight, currentFrame, palette, PREVIEW_WIDTH, PREVIEW_HEIGHT, scale]);

  const label = currentAnimation?.label ?? 'STATIC';

  if (!showLabel) {
    return (
      <canvas
        ref={canvasRef}
        width={PREVIEW_WIDTH}
        height={PREVIEW_HEIGHT}
        style={{ imageRendering: 'pixelated' }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="nube-etiqueta nube-track-1 text-primary uppercase opacity-70">
        Preview · {label}
      </div>
      <canvas
        ref={canvasRef}
        width={PREVIEW_WIDTH}
        height={PREVIEW_HEIGHT}
        className="rounded border border-border bg-black/20 shadow-inner"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
