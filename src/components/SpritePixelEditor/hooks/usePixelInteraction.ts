import { useRef } from 'react';
import type { SpriteAsset } from '@/lib/types';
import { getPixelCoords } from '../utils/canvasCoords';
import { analyzeBodySegments } from '@/lib/spriteTransforms';
import { blankFrame, dims } from '@/headless/assetModel';

interface InteractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  asset: SpriteAsset;
  frameIndex: number;
  zoom: number;
  tool: string;
  onPointerDown: (row: number, col: number, forceTool?: any) => void;
  onPointerMove: (row: number, col: number, forceTool?: any) => void;
  onPointerUp: () => void;
  leftSidebarTab?: string | null;
  onAnatomyChange?: (updates: any) => void;
  anatomyActiveMemberId?: string | null;
  anatomyIsSelectionMode?: boolean;
  onToggleMemberPixel?: (r: number, c: number, force?: boolean) => void;
  setHoveringBone: (bone: any) => void;
  setDraggingBone: (bone: any) => void;
  setHoverCell: (cell: any) => void;
  draggingBone: string | null;
}

export function usePixelInteraction({
  canvasRef,
  asset,
  frameIndex,
  zoom,
  tool,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  leftSidebarTab,
  onAnatomyChange,
  anatomyActiveMemberId,
  anatomyIsSelectionMode,
  onToggleMemberPixel,
  setHoveringBone,
  setDraggingBone,
  setHoverCell,
  draggingBone,
}: InteractionProps) {
  const PIXEL_SCALE = 16 * zoom;
  
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const scrollStart = useRef<{ left: number; top: number } | null>(null);
  const isPanning = useRef(false);
  const anatomyPaintMode = useRef<boolean | null>(null);
  const lastPaintedCell = useRef<{ r: number, c: number } | null>(null);

  /** The visible layers of the current frame flattened, on the asset's own canvas. */
  const compositeVisible = () => {
    const { width, height } = dims(asset);
    const out = blankFrame(width, height);
    for (const layer of asset.layers ?? []) {
      if (!layer.isVisible) continue;
      const frame = layer.frames[frameIndex];
      if (!frame) continue;
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const v = frame[r]?.[c];
          if (v) out[r][c] = v;
        }
      }
    }
    return out;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getPixelCoords(e.clientX, e.clientY, e.currentTarget, PIXEL_SCALE);
    if (!coords) return;
    const { row, col, floatR, floatC } = coords;

    // Right click erase (button 2)
    if (e.button === 2) {
      onPointerDown(floatR, floatC, 'eraser');
      return;
    }

    if (e.button === 1 || tool === 'pan') {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      const scrollContainer = e.currentTarget.parentElement?.parentElement;
      if (scrollContainer) {
        scrollStart.current = { left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop };
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (leftSidebarTab === 'anatomy') {
      if (anatomyIsSelectionMode && anatomyActiveMemberId && onToggleMemberPixel) {
        const orientationIdx = 0; // Default to Front for now
        const currentOrientation = asset.anatomy?.orientations?.[orientationIdx];
        const member = currentOrientation?.members.find(m => m.id === anatomyActiveMemberId);
        const alreadyHas = member?.pixels?.some(p => p.r === row && p.c === col);
        anatomyPaintMode.current = !alreadyHas;
        onToggleMemberPixel(row, col, !alreadyHas);
        lastPaintedCell.current = { r: row, c: col };
        return;
      }

      // Check if clicking on a bone line
      const compositeFrame = compositeVisible();
      const segments = analyzeBodySegments(compositeFrame, asset.anatomy);
      const checkBone = (val: number, isVertical: boolean) => Math.abs((isVertical ? col : row) - val) < 0.8;
      
      let boneToDrag: string | null = null;
      if (checkBone(segments.neckRow, false)) boneToDrag = 'neck';
      else if (checkBone(segments.waistRow, false)) boneToDrag = 'waist';
      else if (checkBone(segments.torsoLeft, true)) boneToDrag = 'torsoL';
      else if (checkBone(segments.torsoRight, true)) boneToDrag = 'torsoR';
      else if (checkBone(segments.torsoCenterCol, true)) boneToDrag = 'torsoC';
      else if (checkBone(segments.kneeRow, false)) boneToDrag = 'knees';
      else if (checkBone(segments.ankleRow, false)) boneToDrag = 'ankles';
      
      if (boneToDrag) {
        setDraggingBone(boneToDrag);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    onPointerDown(floatR, floatC);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getPixelCoords(e.clientX, e.clientY, e.currentTarget, PIXEL_SCALE);
    if (!coords) return;
    const { row, col, floatR, floatC } = coords;
    setHoverCell({ r: row, c: col });

    // Right click erase (buttons mask 2)
    if (e.buttons === 2) {
      onPointerMove(floatR, floatC, 'eraser');
      return;
    }

    if (isPanning.current && panStart.current && scrollStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      const scrollContainer = e.currentTarget.parentElement?.parentElement;
      if (scrollContainer) {
        scrollContainer.scrollLeft = scrollStart.current.left - dx;
        scrollContainer.scrollTop = scrollStart.current.top - dy;
      }
      return;
    }

    if (draggingBone && onAnatomyChange) {
      const val = draggingBone.includes('L') || draggingBone.includes('R') || draggingBone.includes('C') ? col : row;
      const key = draggingBone === 'neck' ? 'neckRow' : draggingBone === 'waist' ? 'waistRow' : 
                  draggingBone === 'torsoL' ? 'torsoLeft' : draggingBone === 'torsoR' ? 'torsoRight' :
                  draggingBone === 'torsoC' ? 'torsoCenterCol' : draggingBone === 'knees' ? 'kneeRow' : 'ankleRow';
      // A row bone is bounded by the height, a column bone by the width.
      const limit = (draggingBone.includes('L') || draggingBone.includes('R') || draggingBone.includes('C') ? dims(asset).width : dims(asset).height) - 1;
      onAnatomyChange({ [key]: Math.max(0, Math.min(limit, val)) });
      return;
    }

    if (anatomyPaintMode.current !== null && anatomyIsSelectionMode && onToggleMemberPixel) {
      if (lastPaintedCell.current?.r === row && lastPaintedCell.current?.c === col) return;
      onToggleMemberPixel(row, col, anatomyPaintMode.current);
      lastPaintedCell.current = { r: row, c: col };
      return;
    }

    if (leftSidebarTab === 'anatomy' && !anatomyIsSelectionMode) {
      const segments = analyzeBodySegments(compositeVisible(), asset.anatomy);
      const checkBone = (val: number, isVertical: boolean) => Math.abs((isVertical ? col : row) - val) < 0.8;
      
      if (checkBone(segments.neckRow, false)) setHoveringBone('neck');
      else if (checkBone(segments.waistRow, false)) setHoveringBone('waist');
      else if (checkBone(segments.torsoLeft, true)) setHoveringBone('torsoL');
      else if (checkBone(segments.torsoRight, true)) setHoveringBone('torsoR');
      else if (checkBone(segments.torsoCenterCol, true)) setHoveringBone('torsoC');
      else if (checkBone(segments.kneeRow, false)) setHoveringBone('knees');
      else if (checkBone(segments.ankleRow, false)) setHoveringBone('ankles');
      else setHoveringBone(null);
    }

    onPointerMove(floatR, floatC);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    isPanning.current = false;
    panStart.current = null;
    scrollStart.current = null;
    setDraggingBone(null);
    anatomyPaintMode.current = null;
    lastPaintedCell.current = null;
    onPointerUp();
  };

  return { handlePointerDown, handlePointerMove, handlePointerUp };
}
