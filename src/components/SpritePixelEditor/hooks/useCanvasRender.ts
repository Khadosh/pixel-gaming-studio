import { useEffect } from 'react';
import type { SpriteAsset } from '@/lib/types';
import { rotateFrameFree, analyzeBodySegments } from '@/lib/spriteTransforms';
import { blankFrame, dims } from '@/headless/assetModel';

interface UseCanvasRenderProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  asset: SpriteAsset;
  frameIndex: number;
  activeLayerId: string | null;
  onionSkinPrevFrame?: number[][];
  onionSkinNextFrame?: number[][];
  draftFrame?: number[][] | null;
  rotationAngle?: number | null;
  rotationCenter?: { r: number; c: number; activeLayerId?: string | null } | null;
  zoom: number;
  selectionRect?: { r: number; c: number; w: number; h: number } | null;
  movingSelectionPixels?: number[][] | null;
  canvasBg: 'light' | 'dark';
  leftSidebarTab?: string | null;
  showIsometricGrid?: boolean;
  referenceFrame?: number[][] | null;
  hoveringBone: string | null;
  draggingBone: string | null;
  anatomyActiveMemberId?: string | null;
  anatomyIsSelectionMode?: boolean;
  anatomySelectedOrientation?: number;
  anatomyShowAllMasks?: boolean;
}

const BASE_PIXEL_SCALE = 16;
const GRID_COLOR = 'rgba(255, 255, 255, 0.03)';

export function useCanvasRender({
  canvasRef,
  asset,
  frameIndex,
  activeLayerId,
  onionSkinPrevFrame,
  onionSkinNextFrame,
  draftFrame,
  rotationAngle,
  rotationCenter,
  zoom,
  selectionRect,
  movingSelectionPixels,
  canvasBg,
  leftSidebarTab,
  showIsometricGrid,
  referenceFrame,
  hoveringBone,
  draggingBone,
  anatomyActiveMemberId,
  anatomyIsSelectionMode,
  anatomySelectedOrientation,
  anatomyShowAllMasks,
}: UseCanvasRenderProps) {
  const PIXEL_SCALE = BASE_PIXEL_SCALE * zoom;
  // The canvas is the asset's own shape: a map ground is 448x224, not a square.
  const { width: cols, height: rows } = dims(asset);
  const canvasW = cols * PIXEL_SCALE;
  const canvasH = rows * PIXEL_SCALE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Checkerboard background
    const colorA = canvasBg === 'light' ? '#e5e5e5' : '#121212';
    const colorB = canvasBg === 'light' ? '#f5f5f5' : '#1e1e1e';
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isEven = (row + col) % 2 === 0;
        ctx.fillStyle = isEven ? colorA : colorB;
        ctx.fillRect(col * PIXEL_SCALE, row * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
      }
    }

    // Draw ghost frames (Onion skin)
    const drawGhost = (ghostFrame: number[][], alpha: number, colorOverride?: string) => {
      ctx.globalAlpha = alpha;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const val = ghostFrame[row]?.[col];
          if (!val) continue;
          ctx.fillStyle = colorOverride || asset.palette[val] || 'transparent';
          ctx.fillRect(col * PIXEL_SCALE, row * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
        }
      }
      ctx.globalAlpha = 1.0;
    };

    if (onionSkinPrevFrame) drawGhost(onionSkinPrevFrame, 0.35, '#ff4a4a');
    if (onionSkinNextFrame) drawGhost(onionSkinNextFrame, 0.35, '#4aff4a');
    if (referenceFrame) drawGhost(referenceFrame, 0.25, '#38bdf8');

    // Helper to draw a specific frame matrix
    const drawFrameData = (data: number[][], treatZeroAsTransparent: boolean, dr = 0, dc = 0) => {
      const rows = data.length;
      if (rows === 0) return;
      const cols = data[0].length;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const val = data[row][col];
          if (val === -1) continue;
          if (treatZeroAsTransparent && val === 0) continue;

          if (val === 0) {
            ctx.fillStyle = '#ff000055';
          } else {
            const color = asset.palette[val];
            if (!color || color === 'transparent') continue;
            ctx.fillStyle = color;
          }

          const tr = row + dr;
          const tc = col + dc;
          if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) {
            ctx.fillRect(tc * PIXEL_SCALE, tr * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
          }
        }
      }
    };

    const dra = rotationAngle || 0;
    const rCenter = rotationCenter;
    const previewTargetId = rotationCenter ? rotationCenter.activeLayerId : undefined;

    // Draw layers
    if (asset.layers && asset.layers.length > 0) {
      asset.layers.forEach(layer => {
        if (!layer.isVisible) return;
        const layerFrame = layer.frames[frameIndex];
        if (!layerFrame) return;

        const isScopeFrame = previewTargetId === null;
        const isActive = layer.id === activeLayerId;

        ctx.globalAlpha = (isScopeFrame && (dra !== 0)) ? 1.0 : (isActive ? 1.0 : 0.4);
        const applyRot = (dra !== 0 && rCenter) && !movingSelectionPixels && (isScopeFrame || previewTargetId === layer.id);

        let frameToDraw = layerFrame;
        if (applyRot && rCenter) frameToDraw = rotateFrameFree(frameToDraw, dra, rCenter);

        drawFrameData(frameToDraw, true, 0, 0);
        if (isActive && draftFrame) drawFrameData(draftFrame, true, 0, 0);
      });
      ctx.globalAlpha = 1.0;
    }

    // Draw moving selection pixels if any
    if (movingSelectionPixels) {
      drawFrameData(movingSelectionPixels, true, 0, 0);
    }

    // Grid lines
    const gridLine = (i: number, vertical: boolean) => {
      const isMajor = i % 8 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.08)' : GRID_COLOR;
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      if (vertical) { ctx.moveTo(i * PIXEL_SCALE, 0); ctx.lineTo(i * PIXEL_SCALE, canvasH); }
      else { ctx.moveTo(0, i * PIXEL_SCALE); ctx.lineTo(canvasW, i * PIXEL_SCALE); }
      ctx.stroke();
    };
    for (let i = 0; i <= cols; i++) gridLine(i, true);
    for (let i = 0; i <= rows; i++) gridLine(i, false);

    // Isometric Grid
    if (showIsometricGrid) {
      ctx.strokeStyle = 'rgba(79, 70, 229, 0.4)';
      ctx.lineWidth = 1;
      const step = 8;
      for (let i = -rows; i <= cols + rows; i += step) {
        ctx.beginPath();
        ctx.moveTo(i * PIXEL_SCALE, 0);
        ctx.lineTo((i + rows) * PIXEL_SCALE, canvasH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * PIXEL_SCALE, 0);
        ctx.lineTo((i - rows) * PIXEL_SCALE, canvasH);
        ctx.stroke();
      }
    }
    
    // Anatomy Guides
    if (asset.category === 'character' && leftSidebarTab === 'anatomy') {
      const compositeFrame = blankFrame(cols, rows);
      asset.layers?.forEach(layer => {
        if (!layer.isVisible) return;
        const frame = layer.frames[frameIndex];
        if (!frame) return;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = frame[r]?.[c];
            if (val) compositeFrame[r][c] = val;
          }
        }
      });

      const segments = analyzeBodySegments(compositeFrame, asset.anatomy);
      const { neckRow, waistRow, torsoLeft, torsoRight, torsoCenterCol, ankleRow, kneeRow } = segments;
      
      const drawBone = (type: string, color: string, pos: number, isVertical: boolean, dashed: boolean = false) => {
        const isSelected = hoveringBone === type || draggingBone === type;
        ctx.strokeStyle = color;
        ctx.globalAlpha = isSelected ? 1.0 : 0.6;
        ctx.lineWidth = isSelected ? 2 : 1;
        if (dashed) ctx.setLineDash([4, 4]); else ctx.setLineDash([]);
        if (isSelected) { ctx.shadowBlur = 4; ctx.shadowColor = color; }
        ctx.beginPath();
        const screenPos = pos * PIXEL_SCALE + PIXEL_SCALE / 2;
        if (isVertical) { ctx.moveTo(screenPos, 0); ctx.lineTo(screenPos, canvasH); }
        else { ctx.moveTo(0, screenPos); ctx.lineTo(canvasW, screenPos); }
        ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1.0; ctx.setLineDash([]);
      };

      drawBone('neck', 'rgba(135, 206, 235)', neckRow, false);
      drawBone('waist', 'rgba(255, 127, 80)', waistRow, false);
      drawBone('knees', 'rgba(244, 114, 182)', kneeRow, false);
      drawBone('ankles', 'rgba(163, 230, 53)', ankleRow, false);
      drawBone('torsoL', 'rgba(168, 85, 247)', torsoLeft, true);
      drawBone('torsoR', 'rgba(249, 115, 22)', torsoRight, true);
      drawBone('torsoC', 'rgba(253, 224, 71)', torsoCenterCol, true, true);

      // Dismemberment Pixels
      const currentOrientation = asset.anatomy?.orientations?.[anatomySelectedOrientation ?? 0];
      const showAll = anatomyShowAllMasks ?? true;

      if (currentOrientation?.members) {
        // 1. Draw all Fills first
        currentOrientation.members.forEach(member => {
          if (!member.pixels?.length) return;
          const isActive = member.id === anatomyActiveMemberId;
          ctx.fillStyle = member.type.includes('arm') ? '#38bdf8' : member.type.includes('leg') ? '#fb7185' : member.type === 'head' ? '#fbbf24' : '#fb923c';
          ctx.globalAlpha = isActive ? 0.6 : (showAll ? 0.3 : 0.05);
          
          member.pixels.forEach(p => {
            ctx.fillRect(p.c * PIXEL_SCALE, p.r * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
          });
        });

        // 2. Draw Crosshairs (+) on top for active member ONLY if in selection mode
        if (anatomyIsSelectionMode && anatomyActiveMemberId) {
          const activeMember = currentOrientation.members.find(m => m.id === anatomyActiveMemberId);
          if (activeMember?.pixels?.length) {
            ctx.globalAlpha = 1.0;
            ctx.lineWidth = 1;
            
            activeMember.pixels.forEach(p => {
              const px = p.c * PIXEL_SCALE;
              const py = p.r * PIXEL_SCALE;
              
              // Draw white crosshair with subtle alpha
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.beginPath();
              // Vertical
              ctx.moveTo(px + PIXEL_SCALE / 2, py + 2);
              ctx.lineTo(px + PIXEL_SCALE / 2, py + PIXEL_SCALE - 2);
              // Horizontal
              ctx.moveTo(px + 2, py + PIXEL_SCALE / 2);
              ctx.lineTo(px + PIXEL_SCALE - 2, py + PIXEL_SCALE / 2);
              ctx.stroke();

              // Very subtle border
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.strokeRect(px + 0.5, py + 0.5, PIXEL_SCALE - 1, PIXEL_SCALE - 1);
            });
          }
        }
        ctx.globalAlpha = 1.0;
      }
    }

    // Selection
    if (selectionRect) {
      ctx.fillStyle = 'rgba(79, 70, 229, 0.15)';
      ctx.fillRect(selectionRect.c * PIXEL_SCALE, selectionRect.r * PIXEL_SCALE, selectionRect.w * PIXEL_SCALE, selectionRect.h * PIXEL_SCALE);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(selectionRect.c * PIXEL_SCALE, selectionRect.r * PIXEL_SCALE, selectionRect.w * PIXEL_SCALE, selectionRect.h * PIXEL_SCALE);
      ctx.setLineDash([]);
    }
  }, [
    canvasRef, asset, frameIndex, activeLayerId, onionSkinPrevFrame, onionSkinNextFrame, draftFrame,
    rotationAngle, rotationCenter, zoom, selectionRect, movingSelectionPixels, canvasBg, leftSidebarTab,
    showIsometricGrid, referenceFrame, hoveringBone, draggingBone, anatomyActiveMemberId, 
    anatomyIsSelectionMode, anatomySelectedOrientation, PIXEL_SCALE, canvasW, canvasH, cols, rows
  ]);
}
