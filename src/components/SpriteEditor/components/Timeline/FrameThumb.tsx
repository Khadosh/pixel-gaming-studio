import React, { useCallback } from 'react';
import { THUMB_SIZE } from '../../types';

interface FrameThumbProps {
  frame: number[][];
  palette: Record<number, string>;
  /** Canvas width in pixels of the asset (columns). */
  width: number;
  /** Canvas height in pixels of the asset (rows). */
  height: number;
  isActive: boolean;
  label: string;
  onClick: () => void;
}

export const FrameThumb: React.FC<FrameThumbProps> = ({
  frame, palette, width, height, isActive, label, onClick,
}) => {
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
      for (let y = 0; y < THUMB_SIZE; y += 8) {
        for (let x = 0; x < THUMB_SIZE; x += 8) {
          ctx.fillStyle = ((x / 8 + y / 8) % 2 === 0) ? '#1a1a2e' : '#22223a';
          ctx.fillRect(x, y, 8, 8);
        }
      }
      // The thumb box is square: scale by the longest side so a 512x320 drawing
      // fits whole, and letterbox it (offsets are 0 when width === height).
      const longest = Math.max(1, width, height);
      const scale = THUMB_SIZE / longest;
      const offsetX = (THUMB_SIZE - width * scale) / 2;
      const offsetY = (THUMB_SIZE - height * scale) / 2;
      for (let r = 0; r < height; r++) {
        const row = frame[r];
        if (!row) continue;
        for (let c = 0; c < width; c++) {
          const val = row[c];
          if (!val) continue;
          const color = palette[val];
          if (!color || color === 'transparent') continue;
          ctx.fillStyle = color;
          ctx.fillRect(offsetX + c * scale, offsetY + r * scale, scale, scale);
        }
      }
    },
    [frame, palette, width, height],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'scale-105' : 'opacity-60 hover:opacity-90'}`}
    >
      <canvas
        ref={canvasRef}
        width={THUMB_SIZE} height={THUMB_SIZE}
        className={`rounded border-2 ${isActive ? 'border-purple-500' : 'border-border'}`}
        style={{ imageRendering: 'pixelated', width: THUMB_SIZE, height: THUMB_SIZE }}
      />
      <span className="nube-etiqueta text-muted-foreground">{label}</span>
    </div>
  );
};
